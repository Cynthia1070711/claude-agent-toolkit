# Session Lifecycle & Data Persistence Reference

> 四層記憶架構、三層寫入保險、Ledger 雙寫、Compaction Recovery 防禦。

---

## 1. 三層寫入保險（CMI-1）

### 問題起源

2026-03-07 同一天兩次事故：
1. 斷電恢復後 Agent 直接讀 `sprint-status.yaml` 而非查 DB
2. 使用者問「上次做了什麼」，Agent 跳過 DB 查詢直接讀 YAML

四個根因：
- `context_entries` 無 `session` category（無 schema 記錄「本次對話發生了什麼」）
- 誤認 Claude Code 不支援 `Stop` / `SessionEnd` hooks
- `UserPromptSubmit` hook 只做 Code RAG，從未查詢 `context_entries`
- `.claude/rules/context-memory-db.md` 的「查詢優先」規則無機械強制

### Hook 事件支援（Claude Code v2.1.71+）

| 事件 | 觸發時機 |
|------|---------|
| `Stop` | Claude 每次回應完成 |
| `SessionEnd` | 對話結束（clear/logout/exit/bypass） |
| `PreCompact` | Context Compaction 執行前 |
| `UserPromptSubmit` | 使用者提交提問時 |
| `SessionStart` | 對話開始或恢復 |

### 三層保險實作

```
Stop Hook → log-session.js
  ├─ stdin: { stop_hook_active, last_assistant_message, ... }
  ├─ 2 分鐘內同 session → UPDATE 既有記錄
  ├─ 超過 2 分鐘或新 session → INSERT 新記錄
  └─ 輸出: exit 0（不阻塞）

SessionEnd Hook → log-session.js
  ├─ 無條件 INSERT（最後一次保底寫入）
  └─ 聚合所有 conversation_turns 產出結構化摘要

PreCompact Hook → precompact-tool-preprune.js → log-session.js
  ├─ preprune: transcript md5 去重 + 工具摘要 → context_entries (compaction_preprune)
  ├─ log-session: 共用 Stop 去重邏輯
  └─ 純 DB 寫,不產出 .md 快照檔(tdb-4, 2026-08-03 起)
```

### Session 品質增強（CMI-6 Inline）

`log-session.js` 的 `extractFromMessage()` 使用正則提取結構化資訊：

```
正則提取項目:
- Story ID: /\b(mqv|dvc|cmi|qgr|td|bf|cat|...)-(?=[\w-]*\d)[\w-]+/gi
- 建立/修改的檔案
- 動作關鍵字（已建立/已修改/已刪除/已修復）
- DB 操作（add_context, upsert-story, search_context）
```

### 前/後對比

**改善前**: `進行中 Story: mqv-3 (ready-for-dev)\n最近追蹤: [無]`

**改善後**:
```
進行中 Story: mqv-3 (ready-for-dev)
最近追蹤: [無]

[本次操作]
- 關聯 Story: mqv-3, cmi-5, cmi-6
- 建立檔案: compaction-recovery.md, CMI-5-compaction-recovery-guard.md
- 修改檔案: log-session.js, pre-prompt-rag.js
- 操作: 已建立, 已修復, 已寫入, 已更新
- DB 操作: 記憶庫寫入, Story DB 寫入
- 含修復操作
```

---

## 2. UserPromptSubmit 讀取注入

### 注入內容組成

```
pre-prompt-rag.js:
  1. Session 記憶 (2,000 tokens):
     ├─ 最近 3 條 session 記錄 (search_context category:session)
     └─ 最近 5 條 user questions (conversation_turns role:user)

  2. Code RAG (5,000 tokens):
     ├─ query → ONNX Embedding (384D)
     ├─ symbol_embeddings Cosine Top 5
     ├─ symbol_dependencies 展開 1 層
     └─ S_final 融合排名

  3. Document RAG (650 字元):
     ├─ query → ONNX Embedding (384D)
     ├─ document_embeddings Cosine + FTS5 BM25
     └─ Hybrid Fusion (0.7 × vector + 0.3 × fts5)

  總預算: 9,500 字元 (MAX_INJECT_CHARS)
    ※ bwu-11 起單位為字元,對齊官方 additionalContext 10,000 **字元** 硬界
    ※ 超限時分層降級,必留層 violation / task / idd / godNodes 不丟棄
  超時: 5,000ms (靜默跳過)
  最小 query: 3 字元 (MIN_QUERY_LENGTH,以下整支跳過)
```

### 降級策略

```
ONNX 載入失敗 → LIKE fallback 搜尋
DB 不存在     → 靜默跳過
query < 10 字 → 只注入 Session 記憶
任何異常      → catch 靜默退出，絕不阻塞提問
```

### 環境變數控制

```bash
PHYCOOL_RAG_HOOK=false   # 停用全部 RAG 注入
PHYCOOL_RAG_HOOK=true    # 重新啟用（預設）
```

---

## 3. 對話記憶層（CMI-3）

### 資料來源

Claude Code 本地儲存：
```
~/.claude/projects/{project-slug}/
├── sessions-index.json      (所有 session 索引)
└── {session-id}.jsonl       (逐輪完整轉錄)
```

統計：725+ sessions，~800 MB JSONL，14,500+ conversation turns。

### 即時記錄 Hook

```
UserPromptSubmit → log-turn.js  ← INSERT user turn
Stop             → log-turn.js  ← INSERT assistant turn + UPDATE session
SessionEnd       → log-turn.js  ← UPDATE session ended_at + end_reason
```

效能預算：`log-turn.js` < 50ms / 呼叫，Stop hook 總延遲 ~100ms。

### 三個 MCP Tools

| Tool | 用途 | 典型查詢 |
|------|------|---------|
| `list_sessions` | 時間軸查詢 | 「昨天有哪些對話？」 |
| `search_conversations` | 全文搜尋 | 「最近討論 token 減量策略」 |
| `get_session_detail` | 逐輪詳情 | 「顯示 session X 的完整對話」 |

---

## 4. Ledger 雙寫持久化

### 問題定義

5 個 DB-Native 表（context_entries / tech_entries / workflow_executions / benchmarks / glossary）**無檔案系統對應物**。phycool.db 不在 Git 追蹤中。丟失 = 不可重建。

### 解決方案

```
每次 DB-Native INSERT/UPDATE
  → 同步追加 ledger.jsonl（append-only）
  → ledger.jsonl 納入 Git 追蹤

災難恢復:
  node .context-db/scripts/restore.js
  → 讀取 ledger.jsonl → 重播所有操作 → 完整恢復 DB-Native 資料
```

### Source of Truth 定義

| 資料類型 | Source of Truth | DB 角色 |
|---------|----------------|---------|
| 可重建（Story/CR/Sprint） | YAML / 文件 | 索引加速層 |
| DB-Native（context/tech） | **DB + ledger.jsonl** | 主要儲存 |

### 維護

- ledger.jsonl 年增量 ~1.8 MB
- 每季壓縮（保留最新 snapshot + 增量）
- 備份：`backups/` 目錄每日快照（獨立腳本）

---

## 5. Compaction Recovery 防禦（CMI-5 Inline）

### 事故

Context compaction 自動摘要指示建立 `.md` 檔案，違反 Epic MQV DB-first 規則。Agent 照做。

### 三道防線

| 防線 | 機制 | 位置 |
|------|------|------|
| Rules Hard Injection | `.claude/rules/compaction-recovery.md` 自動載入 | 每次 compaction 後生效 |
| Memory DB Lesson | `context_entries` id=149 記錄 MQV DB-first 規則 | `search_context("MQV")` 可查 |
| Hook Auto-Injection | `pre-prompt-rag.js` 注入最近 3 條 session | 每次提問自動觸發 |

### 覆蓋矩陣

| 場景 | Rules | Memory | Hook |
|------|:-----:|:------:|:----:|
| Compaction 恢復（同 session） | Primary | Backup | 無效 |
| 新對話視窗 | 自動載入 | Hook 注入歷史 | Primary |
| 委派子 session | 自動載入 | 手動搜尋 | 同專案有效 |

---

## 6. 時區修復（CMI-4）

### 共用工具

`.context-db/scripts/timezone.js` 的 `getTaiwanTimestamp()`:
- 回傳格式：`2026-03-07T16:45:00.123+08:00`
- 手動 UTC+8 偏移計算（不依賴系統時區設定）

### 已修補檔案

| 檔案 | 修補函式 |
|------|---------|
| `.context-db/server.js` | add_context / add_tech / add_cr_issue |
| `.context-db/scripts/log-session.js` | Stop / SessionEnd / PreCompact |
| `.context-db/scripts/log-turn.js` | user / assistant turn 時間戳 |
| `.claude/hooks/pre-prompt-rag.js` | UserPromptSubmit user turn 寫入 |

### 歷史修復

`fix-timezone.js` 一次性修正 19,727 筆歷史記錄（含 conversation_turns 18,121 筆）。

---

## 7. 本地 ONNX 推理引擎（CMI-6）

### local-embedder.js 架構

```javascript
// Singleton 模式 — 首次呼叫下載 ~90MB 模型，快取在 ~/.cache/huggingface/hub
initModel()           // → 載入 Xenova/all-MiniLM-L6-v2 ONNX
generateEmbedding()   // → 單句推理 → Float32Array (384D)
generateEmbeddings()  // → 批次推理
```

### 歷史遷移（已完成，僅供參考）

CMI-6 已將所有 Embedding 從外部 API 遷移至本地 ONNX。遷移腳本 `migrate-embeddings.js` 為一次性執行，當前系統 **100% 本地推理，零外部 API 依賴**。所有向量均為 384D (Xenova/all-MiniLM-L6-v2)。

### 降級路徑

```
initModel() 失敗
  → generateEmbedding() throws
  → semantic_search / search_documents catch
  → 自動降級至 FTS5-only
  → 使用者體驗不中斷（搜尋品質降低但可用）
```
