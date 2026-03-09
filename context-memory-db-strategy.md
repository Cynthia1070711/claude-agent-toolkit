# Context Memory DB 策略 — 跨對話知識累積

**版本**: 1.1.0
**來源**: TD-32~36 (Epic TD) + CMI-1~6 (Epic CMI)
**驗證專案**: [Your Project]

---

## 1. 問題背景

AI Agent（Claude Code / Gemini CLI 等）每次開啟新對話都從零開始。
上一次對話中發現的 Bug 修復模式、架構決策、CR 教訓都需要重新學習。

**靜態記憶檔案的局限**：
- `MEMORY.md` / `pipeline-lessons.md` 等檔案每次新對話全量載入
- 內容越多 → context window 佔用越大 → 留給實際工作的空間越少
- 某中型 SaaS 專案實測：未精簡前佔用 ~5.9k tokens（佔 context window 4%）

**解決方案**：SQLite + MCP Server 按需查詢

---

## 2. 架構設計

### 四層遞進架構

```
L0 知識記憶層（必要）
  ├── context_entries: 決策、Pattern、除錯發現、事故記錄
  ├── tech_entries: 技術方案（成功/失敗）、Bug 修復、架構決策
  ├── FTS5 trigram: 全文搜尋（中英文混合查詢）
  └── MCP Tools: search_context / search_tech / add_context / add_tech / add_cr_issue / trace_context

L1 程式碼語意層（選用，需 .NET SDK）
  ├── symbol_index: class / method / interface / enum（Roslyn AST 提取）
  ├── symbol_dependencies: calls / inherits / implements / uses
  └── MCP Tools: search_symbols / get_symbol_context

L2 向量語意層（選用，需 OpenAI API Key）
  ├── symbol_embeddings: text-embedding-3-small（1536 維向量）
  ├── Cosine Similarity 語意搜尋
  └── MCP Tool: semantic_search

L3 動態注入層（選用，需 L2）
  ├── UserPromptSubmit Hook
  ├── 使用者每次提問自動注入相關程式碼上下文
  └── S_final = 0.6×vec + 0.2×graph + 0.2×fts
```

### 技術選型理由

| 決策 | 選擇 | 原因 |
|------|------|------|
| 資料庫 | SQLite | 零部署、單檔、WAL 模式支援多 Agent 併發讀取 |
| 全文搜尋 | FTS5 trigram | 內建、中文友好、無外部依賴 |
| MCP 傳輸 | stdio | Claude Code 自動管理生命週期 |
| 向量儲存 | SQLite BLOB | 無需額外向量資料庫 |
| Embedding | OpenAI text-embedding-3-small | 低成本（~$0.02/5K symbols）、1536 維足夠 |

---

## 3. 部署指南

### L0 基礎部署（建議所有專案）

```powershell
# 一鍵部署
powershell -ExecutionPolicy Bypass -File scripts/deploy-context-db.ps1
```

自動完成：
1. 建立 `.context-db/` 目錄
2. 複製 MCP Server + init-db.js
3. `npm install` 安裝依賴
4. 初始化 SQLite DB（WAL 模式）
5. 建立 `.mcp.json` 註冊 MCP Server
6. 部署 `.claude/rules/context-memory-db.md`

### L1 Code RAG（選用）

需要 .NET SDK 8+ 和 Roslyn AST 提取工具。

```bash
# 建立 C# Console 專案
dotnet new console -n symbol-indexer -o .context-db/symbol-indexer
# 安裝 Roslyn NuGet
cd .context-db/symbol-indexer
dotnet add package Microsoft.CodeAnalysis.CSharp
dotnet add package Microsoft.Data.Sqlite
# 全量索引
dotnet run -- --full
```

### L2 語意搜尋（選用）

```bash
# 設定 OpenAI API Key
set OPENAI_API_KEY=sk-...

# 全量生成 Embedding
node .context-db/scripts/generate-embeddings.js --full

# uses_inferred 依賴推斷
node .context-db/scripts/infer-uses-deps.js
```

### L3 自動注入（選用）

```json
// .claude/settings.json 新增
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [{
          "type": "command",
          "command": "node .claude/hooks/pre-prompt-rag.js",
          "timeout": 5000
        }]
      }
    ]
  }
}
```

---

## 4. 使用模式

### 查詢優先（任務開始前）

```yaml
BMAD Workflow 執行前:
  - search_context: 查該 Story 領域的歷史決策與 pattern
  - search_tech: 查同類技術問題的已知解法

Bug 修復前:
  - search_context: category=debug，是否有同類問題
  - search_tech: category=bugfix，已知修復方案

架構決策前:
  - search_context: category=decision / architecture
  - trace_context: 追蹤關聯上下文（擴展 story_id + related_files）
```

### 寫入紀律（任務完成後）

```yaml
寫入時機:
  - 新的除錯發現 → add_context (category=debug)
  - 架構決策 → add_context (category=decision)
  - 模式確認 → add_context (category=pattern)
  - 技術方案驗證 → add_tech (outcome=success/partial/failed)
  - Code Review 發現 → add_cr_issue

不寫入:
  - 臨時性操作
  - 一次性查詢結果
  - 已存在的重複知識
```

### 語言憲章

```yaml
英文欄位（AI 操作 / 過濾用）:
  - tags[], category, agent_id, story_id, epic_id

繁體中文欄位（人類閱讀 / 內容用）:
  - title, content, solution, lesson
```

---

## 5. Epic CMI：記憶庫進階優化（2026-03-07 ~ 2026-03-09）

> 基於 TD-32~36 骨架，進一步補完自動化生命週期記錄、全量文檔 ETL、對話級記憶、時區修正、壓縮恢復防護、內容品質強化、文檔向量化搜尋。

### Story 一覽

| Story | 標題 | 複雜度 | 重點 |
|-------|------|:------:|------|
| CMI-1 | 對話生命週期記憶機制 | M | Stop/SessionEnd/PreCompact Hook → 自動 session 快照；UserPromptSubmit → 歷史注入 |
| CMI-2 | 全量文檔 ETL | L | 三層分類 + 5 張表 ETL（stories/CR/ADR/doc_index/cr_issues），136 Story + 50 CR + 29 ADR |
| CMI-3 | 完整對話記憶 Schema | L | conversation_sessions + conversation_turns + 3 MCP Tool（list_sessions / get_session_detail / search_conversations） |
| CMI-4 | 文檔向量化語意搜尋 | L | document_chunks + document_embeddings + Hybrid Fusion Search（FTS5 + Vector）+ DevConsole Documents 頁面 |
| CMI-5 | 壓縮恢復防護機制 | XS | Rules 硬注入 `.claude/rules/compaction-recovery.md` + 記憶庫 lesson + 三重防護矩陣 |
| CMI-6 | Session 品質強化 / 本地 Embedding | M | Regex 內容擷取 + 本地 ONNX 模型（Xenova/all-MiniLM-L6-v2, 384D）取代 OpenAI API |

### Hook 自動化機制（CMI-1 引入）

| Hook | 觸發時機 | 行為 | Token 成本 |
|------|---------|------|:----------:|
| **Stop** | 每次 Claude 回應完成 | 2 分鐘內 UPDATE 既有記錄，超過則 INSERT 新記錄 | 0（純 Node.js） |
| **SessionEnd** | 對話結束 | 無條件 INSERT（最後一次保底寫入） | 0 |
| **PreCompact** | context compaction 前 | 與 Stop 共用防重複邏輯 | 0 |
| **UserPromptSubmit** | 使用者提問時 | 注入最近 3 條 session 記錄至 additionalContext | ~100-200 |

### 架構演進路線

```
Phase 0 (TD-32a~d): SQLite + FTS5 + MCP Server 骨架
    ↓
Phase 1~3 (TD-33~36): Roslyn AST + Embedding + Hook 動態注入 + 靜態 Memory 遷移
    ↓
CMI-1: Session 生命週期自動記錄（Stop/SessionEnd/PreCompact Hook）
    ↓
CMI-2: 全量文檔 ETL（136 Story + 50 CR + 29 ADR + doc_index）
    ↓
CMI-3: 對話級記憶（conversation_sessions + turns + 3 MCP Tool）
    ↓
CMI-4: 時區正規化（UTC → UTC+8 全面修正）
    ↓
CMI-5: 壓縮恢復防護（Rules 硬注入 + 記憶庫 lesson + 三重防護矩陣）
    ↓
CMI-6: Session 品質強化（Regex 內容擷取 + 提問歷史注入 + Story ID 修正）
```

> 研究材料與執行紀錄詳見 `記憶庫策略/` 資料夾（CMI-1~6 研究報告 + epic-cmi-summary.md）。

---

## 7. Token 減量實績

### MEMORY.md 精簡（TD-36）

| 項目 | 精簡前 | 精簡後 | 節省 |
|------|--------|--------|------|
| MEMORY.md | 8,812 bytes (~3.8k tokens) | 788 bytes (~380 tokens) | ~3,420 tokens |
| pipeline-lessons.md | 5,757 bytes (~2.1k tokens) | 已刪除 | ~2,100 tokens |
| context-memory-db.md (新增) | — | ~200 tokens | +200 tokens |
| **合計** | ~5.9k tokens | ~580 tokens | **~5,320 tokens (90%)** |

### 原則

1. **Auto-memory 目錄下的檔案 = 每次新對話的固定成本**
2. 詳細規則/事故記錄 → 存入 DB，按需查詢（零固定成本）
3. MEMORY.md 僅保留一行摘要 + DB 存在提醒
4. `.claude/rules/` 注入行為規則（查詢優先 + 寫入紀律）

---

## 8. 容錯降級策略

```yaml
MCP Server 未啟動:
  - search_context / search_tech 工具不可用
  - 降級: 直接讀取 MEMORY.md + docs/tracking/active/ 替代

DB 不存在:
  - 修復: node .context-db/scripts/init-db.js

FTS5 無結果:
  - 縮短 query（取核心術語 2-3 字）
  - 移除 filters，擴大範圍
  - 若仍無結果 → 記憶庫尚未記錄此主題，依 Skill 文件操作

OpenAI API 不可用 (L2/L3):
  - semantic_search → 自動回退至 search_symbols LIKE
  - pre-prompt-rag.js → 自動回退至 LIKE fallback
  - 完全停用: set PROJECT_RAG_HOOK=false
```

---

## 9. 遷移檢查清單（舊專案接入）

- [ ] Node.js 18+ 已安裝
- [ ] 執行 `deploy-context-db.ps1` 完成基礎部署
- [ ] 重啟 Claude Code（讓 MCP Server 自動啟動）
- [ ] 執行 `claude mcp list` 確認 MCP Server 已註冊
- [ ] 精簡 Auto-memory 檔案（MEMORY.md 保留一行摘要）
- [ ] `.claude/rules/context-memory-db.md` 已部署
- [ ] `.gitignore` 新增 `.context-db/*.db` 排除 DB 檔案
- [ ] [選用] L1/L2/L3 依需求部署
