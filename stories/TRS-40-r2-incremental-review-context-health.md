# 🚫 Story TRS-40: R2 增量審查模式 + Context 健康指令 — CANCELLED

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-40-R2-INCREMENTAL-REVIEW-CONTEXT-HEALTH |
| **Epic** | Epic TRS - Token 減量策略 (Token Reduction Strategy) |
| **優先級** | P2 |
| **類型** | Architecture / Optimization |
| **複雜度** | M (3-5 SP) |
| **狀態** | cancelled |
| **來源** | Party Mode 討論 2026-03-01（Context 過載防幻覺研究報告） |
| **依賴** | TRS-38（Diff-First 基礎）、TRS-39（review-checklist 基礎） |
| **建立日期** | 2026-03-01 |
| **Create Agent** | Claude Opus 4.6 (CC-OPUS) |
| **Create完成時間** | 2026-03-01 11:33 |

---

## Story

As a 多引擎 AI Agent 開發者,
I want 在 code-review workflow 中新增 R2+ 增量審查模式（只審查修復差異而非全量重讀），並加入 Context 健康自檢指令,
so that R2 審查的 source 讀取減少 50-60%，同時降低 context 過載導致的幻覺與指令偏移風險。

---

## Background

### 現況問題 A — R2 全量重讀

當前 instructions.xml **沒有 R2 條件分支**。每次 code-review（包括 R2、R3）都執行完整流程：

- 重載所有 Skills（TRS-39 後已優化）
- 重讀所有 source files（3,000+ 行）
- 重讀 registry.yaml（TRS-37/38 後已優化）

實際案例：

| Story | 輪次 | 結果 | 全量重讀浪費 |
|-------|------|------|------------|
| QGR-BA-4 | R1:28 → R2:100 | R2 修復所有問題 | 重讀全部 37 tests + 所有 source |
| QGR-A10-3 | R1:82 → R2:92 | R2 僅修 2 個 issue | 重讀全部 33 tests |
| QGR-BA-6 | R1:66 → R2:81 → R3:100 | 三輪全量讀取 | 3x 完整讀取 |

6/8 個 QGR Stories 經歷 R2+，全量重讀造成嚴重浪費。

### 現況問題 B — Context 過載幻覺

Context window 塞太多資訊時，模型會：
1. **注意力稀釋** — 對關鍵指令的遵循率下降
2. **幻覺增加** — 混淆不同檔案的細節
3. **指令偏移** — 越後面的步驟越容易偏離 workflow

現有 instructions.xml 無任何自檢機制。

---

## 驗收標準 (Acceptance Criteria)

### AC-1: R2+ 增量審查模式

- [ ] instructions.xml Step 0（新增）加入 R2 檢測邏輯：

```xml
<check if="story already has CR report (R1 or later exists)">
  <!-- R2+ 增量模式 -->
  <action>Read previous CR report → extract unfixed issues list</action>
  <action>Read previous CR report → extract all FIXED issues list</action>
  <action>Set {{review_mode}} = "incremental"</action>
</check>
<else>
  <action>Set {{review_mode}} = "full"</action>
</else>
```

- [ ] Step 3 根據 `{{review_mode}}` 分支：

**增量模式（R2+）Source 讀取策略**：

| 檔案條件 | 讀取策略 | 理由 |
|---------|---------|------|
| unfixed issue 對應的檔案 | 完整讀取 | 驗證修復 |
| FIXED issue 對應的檔案 | `git diff R1..HEAD` | 檢查修復是否引入回歸 |
| R1 後新修改但非 issue 相關的檔案 | diff + 上下文 150 行 | 掃描新引入問題 |
| 未變更的檔案 | **跳過** | 已在 R1 通過 |

- [ ] R2 模式跳過已通過的 dimension（如 R1 Security 滿分 → R2 不重審 Security，除非涉及修改）

### AC-2: Context 健康自檢指令

- [ ] Step 3 結束後（進入 Step 4 寫報告前）加入機械式自檢：

```xml
<critical>CONTEXT HEALTH CHECK before report generation:
  1. Grep all finding markers ([H1], [M2], etc.) in your analysis
  2. Count total findings per severity
  3. Compare with your running tally — if mismatch, reconcile before proceeding
  4. Verify: issue count by dimension matches sum of individual findings
</critical>
```

- [ ] 這是**客觀的機械檢查**，不依賴模型自我評估能力

### AC-3: 注意力引導指令

- [ ] Step 3 每個檔案審查後加入：

```xml
<action>After reviewing each file, summarize findings as:
  [SEVERITY-ID] file:line — one-line description
  Carry forward ONLY this summary for cross-file analysis.
</action>
```

- [ ] Step 4 寫報告前加入 context 清潔提示：

```xml
<critical>CONTEXT HYGIENE: Your report should be based on your finding summaries,
  not on re-reading source code from memory. If unsure about a finding detail,
  re-read the specific file section rather than guessing.</critical>
```

### AC-4: 安全保障

- [ ] R2 增量模式加入 "修復影響範圍掃描" — 對每個 FIXED issue 的檔案，檢查 diff 上下文中是否有新問題
- [ ] 若 R2 發現 3+ 個新 HIGH severity issues，自動降級為全量模式（`{{review_mode}} = "full"`）
- [ ] R2 報告明確標記 "增量審查模式" + 列出跳過的檔案/dimension

---

## Token 減量預估

### R2 增量模式

| 指標 | R2 全量（現在） | R2 增量（優化後） | 節省 |
|------|---------------|-----------------|------|
| Source 讀取 | ~3,000 行 | ~1,200 行 | -60% |
| Skills 重載 | ~200 行（TRS-39 後） | ~200 行 | 0% |
| Registry 讀取 | ~174 行（TRS-38 後） | ~174 行 | 0% |
| **R2 動態讀取合計** | ~3,374 行 | ~1,574 行 | **-53%** |

### Context 健康指令

不直接減少 token，但降低幻覺風險：
- 注意力引導讓模型聚焦 findings 摘要而非完整源碼
- 機械式計數交叉驗證防止 issue 遺漏/重複
- 不確定時重讀而非猜測，防止幻覺

---

## 風險與緩解

| 風險 | 嚴重度 | 緩解措施 |
|------|--------|---------|
| R2 遺漏 R1 修復引入的新問題 | 中 | AC-4 修復影響範圍掃描 |
| R2 跳過的 dimension 實際有變更 | 低 | 增量模式檢查 git diff 覆蓋所有修改檔案 |
| 3+ HIGH 新問題自動降級全量模式 | — | 安全閥，確保品質 |

---

## 變更檔案清單

| 檔案 | 變更類型 |
|------|---------|
| `_bmad/bmm/workflows/4-implementation/code-review/instructions.xml` | 修改（新增 R2 分支 + Context 健康指令） |

---

## Change Log

| 日期 | Agent | 動作 |
|------|-------|------|
| 2026-03-01 11:33 | CC-OPUS | 建立 Story（Party Mode Context 過載研究報告產出） |
| 2026-03-01 11:47 | CC-OPUS | 取消：依賴 TRS-39 已取消 + R2 增量缺乏事故數據支撐，Context 健康指令為理論預防 |
