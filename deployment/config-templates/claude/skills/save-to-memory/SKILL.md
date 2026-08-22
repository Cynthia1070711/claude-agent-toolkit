---
name: save-to-memory
version: 1.1.1
updated: 2026-04-05
disable-model-invocation: true
description: >
  對話內容智慧儲存到 Context Memory DB。自動分析當前對話中的討論議題、分析報告、
  決策策略、技術債、追蹤進度等，分類後批次寫入記憶庫。
  觸發關鍵字：存記憶庫, 儲存到記憶庫, 存DB, 存檔, save to memory, 記下來,
  存到DB, 寫入記憶庫, 儲存對話, 儲存進度, 存一下, 記錄到記憶庫,
  儲存分析, 儲存決策, 存當前進度, save context, persist memory
triggers:
  - save to memory
  - persist
  - record
author: CC-OPUS
created: 2026-03-17
last-synced-epic: epic-sku
last-synced-date: 2026-04-05
---

# Save to Memory — 對話內容智慧儲存

當使用者要求儲存對話內容到記憶庫時，執行以下流程。

---

## 流程

### Step 1: 掃描對話，提取可儲存知識點

回顧當前對話，識別以下類型的知識點：

| 類型 | 特徵 | 優先級 |
|------|------|--------|
| 決策 | 「決定」「選擇」「確認」「同意」方案 A/B | HIGH |
| 架構分析 | 影響盤點、Schema 設計、系統設計 | HIGH |
| 分析報告 | 多面向分析、比較表、優劣勢 | HIGH |
| 技術債 | DEFERRED/延後項目、待修復 | HIGH |
| Bug 修復 | 問題→根因→解法 | MEDIUM |
| 成功模式 | 驗證過的技術方案 | MEDIUM |
| 進度追蹤 | 完成了什麼、下一步 | MEDIUM |
| CR 發現 | Code Review issue | MEDIUM |
| Workflow 執行 | create-story/dev-story/code-review 完成記錄 | MEDIUM |
| 效能基線 | Token 消耗、執行時間、覆蓋率等基線指標 | LOW |

### Step 2: 自動分類 + 選擇 MCP Tool

根據知識點類型，選擇正確的 MCP Tool 和 category：

```
決策/架構分析/分析報告 → add_context
  category: decision | architecture

技術債項目 → add_context + upsert-debt.js（若有具體 debt item）
  category: architecture
  防重複: search_debt（查 debt_id 或 title 避免重複寫入）

Bug 修復/除錯發現 → add_tech
  category: bugfix | debug

成功模式/最佳實踐 → add_tech
  category: pattern | success

進度追蹤/Session 摘要 → add_context
  category: session

CR 發現 → add_cr_issue

Workflow 執行記錄 → log_workflow
  workflow_type: create-story | dev-story | code-review | ...
  status: running | completed | failed | cancelled
  → Dashboard Recent Activity 自動顯示（與 session 記錄合併排序）

效能基線/Benchmark → upsert_benchmark
  metric_name + context (UNIQUE)
  current_value + unit (tokens / ms / % / count)
```

### Step 3: 防重複檢查

寫入前，依知識類型選擇對應的 MCP Tool 查詢是否已有相同主題的記錄：

| 知識類型 | 防重複查詢 Tool |
|---------|----------------|
| 決策/架構/進度 | `search_context` |
| Bug/模式/技術 | `search_tech` |
| 技術債項目 | `search_debt`（查 debt_id 或 title） |
| Story 相關進度 | `search_stories`（查 story_id） |
| 術語/詞彙 | `search_glossary`（查 canonical_name） |
| 行為模式 | `get_patterns`（查 domain + file_path） |

- 查到 → 跳過或提示用戶是否更新
- 未查到 → 寫入

### Step 4: 批次寫入

對每個知識點執行寫入，遵循格式規範：

**add_context 格式：**
- `agent_id`: 當前模型 Agent ID（CC-OPUS / CC-SONNET）
- `title`: < 100 字元，精煉主題
- `content`: 結構化內容（## 標題 + 要點），不超過 2000 字元
- `category`: 依 Step 2 分類
- `tags`: 相關標籤（JSON array 或逗號分隔）
- `epic_id`: 從對話上下文推斷（若有）
- `related_files`: 涉及的檔案路徑

**add_tech 格式：**
- `created_by`: 當前模型 Agent ID（CC-OPUS / CC-SONNET）⚠️ 注意：不是 `agent_id`
- `category`: bugfix / debug / pattern / success / architecture / benchmark / review / test_pattern / security / workaround / failure ⚠️ 頂層必填參數
- `title`: 問題一行摘要
- `problem`: 問題描述
- `solution`: 解決方案
- `outcome`: success / partial / failed
- `lessons`: 學到的教訓
- `tags`: 相關標籤

> ⚠️ **參數差異提醒**：`add_context` 用 `agent_id`，`add_tech` 用 `created_by`。名稱不同但用途相同。

### Step 5: 回報結果

寫入完成後，輸出摘要表格：

```
已儲存 N 筆記憶：

| # | 類型 | Tool | ID | 標題 |
|---|------|------|----|------|
| 1 | 決策 | add_context | id=XXX | ... |
| 2 | 模式 | add_tech | id=XXX | ... |
```

---

## 特殊模式

### 帶參數呼叫

用戶可指定要存什麼：
- `/save-to-memory 決策` → 只存決策類
- `/save-to-memory 進度` → 只存 session 摘要
- `/save-to-memory 全部` → 掃描所有類型

### 無參數呼叫

自動掃描整段對話，提取所有可儲存的知識點。

---

## 寫入規則

1. **content 用繁體中文**，tags/category 用英文
2. **不寫入臨時性資訊**（一次性查詢、中間除錯步驟）
3. **不重複寫入**已存在的知識（先查再寫）
4. **單筆 content 不超過 2000 字元**，超過則拆分
5. **每筆必須有 tags**，至少 2 個標籤
6. **時間戳**寫入前執行 `powershell -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"`

---

## FORBIDDEN

- 不存未經驗證的推測性結論
- 不存包含密碼/金鑰的內容
- 不存與專案無關的閒聊
- 不把整段對話原文塞進單筆 content（要提煉精華）

---

## 除錯參考

> 相關除錯知識請查閱 `docs/knowledge-base/` 目錄。
