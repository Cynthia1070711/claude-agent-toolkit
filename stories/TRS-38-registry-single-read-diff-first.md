# 🟢 Story TRS-38: Registry 單次讀取（AC-1 only）

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-38-REGISTRY-SINGLE-READ-DIFF-FIRST |
| **Epic** | Epic TRS - Token 減量策略 (Token Reduction Strategy) |
| **優先級** | P1 |
| **類型** | Architecture / Optimization |
| **複雜度** | S (1-2 SP) |
| **狀態** | done |
| **來源** | Party Mode 討論 2026-03-01（Context 過載防幻覺研究報告） |
| **依賴** | TRS-37（已完成） |
| **建立日期** | 2026-03-01 |
| **Create Agent** | Claude Opus 4.6 (CC-OPUS) |
| **Create完成時間** | 2026-03-01 11:33 |

---

## Story

As a 多引擎 AI Agent 開發者,
I want 將 code-review workflow 的 registry.yaml 讀取從 3 次降為 1 次，並對小幅修改檔案改用 diff + 上下文讀取策略,
so that 每次 CR 減少 ~1,148 行無效讀取，降低 context 過載風險。

---

## Background

### 現況問題

**問題 A — Registry 重複讀取**

TRS-37 已將 registry.yaml 從 980 行降至 174 行，但 instructions.xml 仍讀取 3 次：

| 位置 | 行號 | 用途 |
|------|------|------|
| Step 1 | 92-104 | 計數 pending entries（初始載入） |
| Phase 2.5 | 333, 372-373 | PUSH 新 entries 前重讀 |
| Step 5 | 421 | 最終 Gate Check 重讀 |

174 行 × 3 次 = 522 行。其中 Step 4 寫入後可直接 +N 更新計數，Step 5 用記憶中的計數，無需重讀。

**問題 B — 全量讀取小幅修改檔案**

Step 3 強制 "Read FULL content of EVERY code file"。但對 diff < 50 行的小改動檔案，完整讀取數百行中的大部分是未修改內容。

---

## 驗收標準 (Acceptance Criteria)

### AC-1: Registry 單次讀取

- [ ] instructions.xml Step 1：保留完整 Read（唯一的一次讀取）
- [ ] instructions.xml Phase 2.5（~行 333）：移除重讀指令，改為「在已讀取的 entries list 上就地追加新 entry」
- [ ] instructions.xml Step 5（~行 421）：移除重讀指令，改為「`{{final_tech_debt}} = {{tech_debt_count}} + {{new_entries_added}}`」
- [ ] 保留 Step 1 的完整計數邏輯不變

### AC-2: Diff-First 分級讀取策略

- [ ] instructions.xml Step 3 新增分級規則：

| 檔案類型 | 讀取策略 |
|---------|---------|
| 新建檔案 | 完整讀取 |
| 測試檔案 | 完整讀取 |
| 修改檔案（diff > 50 行） | 完整讀取 |
| 修改檔案（diff ≤ 50 行） | `git diff` + 上下文 150 行 |
| 配置/遷移檔（.json, Migration） | diff only |

- [ ] 規則以 `<check>` 條件區塊實作，不影響既有流程

### AC-3: 驗證

- [ ] 模擬一個 12 檔案 Story 的 CR，確認分級策略正確觸發
- [ ] 確認 Step 5 計數與 Step 1 + 新增數一致

---

## Token 減量預估

| 優化項 | 現在 | 優化後 | 節省 |
|--------|------|--------|------|
| Registry 讀取 | 174 × 3 = 522 行 | 174 × 1 = 174 行 | 348 行 |
| 小改檔案讀取（假設 4/12 檔案） | ~1,200 行 | ~400 行 | ~800 行 |
| **單次 CR 合計** | — | — | **~1,148 行** |
| **Sprint 8 Stories** | — | — | **~9,184 行** |

---

## 變更檔案清單

| 檔案 | 變更類型 |
|------|---------|
| `_bmad/bmm/workflows/4-implementation/code-review/instructions.xml` | 修改（3 處） |

---

## Change Log

| 日期 | Agent | 動作 |
|------|-------|------|
| 2026-03-01 11:33 | CC-OPUS | 建立 Story（Party Mode Context 過載研究報告產出） |
| 2026-03-01 12:01 | CC-OPUS | AC-1 執行完成 — instructions.xml 3 處修改, AC-2 延後 |
