# Story {{epic_num}}-{{story_num}}: {{story_title}}

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | {{story_key}} |
| **Epic** | {{epic_name}} |
| **優先級** | {{priority}} |
| **類型** | {{story_type}} |
| **複雜度** | {{complexity}} |
| **狀態** | ready-for-dev |
| **來源** | {{source_reference}} |
| **SDD Spec** | {{spec_path}} <!-- M/L/XL: docs/implementation-artifacts/specs/epic-X/{id}-spec.md; S: N/A --> |
| **依賴** | {{dependencies}} <!-- 格式: Story-ID（檔案: 介面/方法）, 如: QGR-A1（AdminDashboardService.cs: GetRevenueAsync()） --> |
| **建立日期** | {{date}} |
| **更新日期** | {{date}} |
| **Create Agent** | <!-- create-story 自動填寫 --> |
| **Create完成時間** | <!-- create-story 自動填寫 --> |
| **DEV Agent** | — |
| **DEV完成時間** | — |
| **Review Agent** | — |
| **Review完成時間** | — |

---

## Story

As a {{role}},
I want {{action}},
so that {{benefit}}.

---

## SPEC Kernel (D0)

> **目的**: 展開細節前先以 5 欄 kernel 釘住 Story「契約邊界」，提前識別 XL 風險與範圍蔓延（蒸餾自 BMAD v6.8.0 bmad-spec kernel，取神捨形）。
> **適用**: M/L/XL 強制填寫；S 建議至少填 Problem + Success signal。

| Kernel | 內容 |
|--------|------|
| **Problem** | {{kernel_problem}} <!-- 要解決的具體問題，一句話 --> |
| **Capabilities** | {{kernel_capabilities}} <!-- 交付後系統「能做什麼」，條列 --> |
| **Constraints** | {{kernel_constraints}} <!-- 技術/業務/合規約束，如「不可改 X API」「必須相容 Y」 --> |
| **Non-goals** | {{kernel_non_goals}} <!-- 明確「不做什麼」，劃定範圍邊界防 scope creep --> |
| **Success signal** | {{kernel_success_signal}} <!-- 可量測成功信號 + 驗證指令，如 `dotnet test --filter X` 全綠 / Chrome MCP getComputedStyle(.foo).width==='120px'。禁描述性如「正常運作」「功能完整」 --> |

---

## Background

{{background_context}}

---

## Acceptance Criteria

> **AC 句式規範** (EARS + BDD 雙層 · SDD+ATDD+TDD 方法論)
> - **EARS 契約層**（BR 定義建議用）：`WHEN {觸發事件} the {系統} SHALL {可驗證回應}` / `IF {條件} THEN the {系統} SHALL {回應}` / `WHILE {持續狀態} the {系統} SHALL {回應}`
> - **BDD 驗收層**（AC 必用）：Given {前置條件} → When {操作} → Then {可驗證結果}（含具體數值）
> - 每個 AC 必須附 `[Verifies: BR-XXX]` 映射至少一條 Business Rule；BR 本身建議以 EARS 句式精確化
> - S 複雜度 Story：BR 可內嵌定義（無獨立 Spec 文件）
> - M/L/XL Story：BR 引用 SDD Spec 文件（見 Story 資訊表 SDD Spec 欄位）
> - 禁止模糊描述（如「正確顯示」「合理處理」），必須有明確的 Pass/Fail 條件

{{acceptance_criteria}}

---

## Tasks / Subtasks

{{tasks_subtasks}}

---

## Dev Notes

### ⚠️ 技術債預防 Checklist (Critical)

> **重要**: 開發前必須確認以下項目，避免產生新的技術債。

| 項目 | 要求 | 參考檔案 |
|------|------|---------|
| {{checklist_items}} |

### 現有檔案參考

> **路徑引用規範**: 所有路徑必須為完整相對路徑（從專案根目錄起算），功能規格引用必須標注章節號。
> create-story 執行時**僅讀標注章節**，不讀全文，以大幅減少 token 消耗。

| 類型 | 路徑 | 章節 | 讀取指示 |
|------|------|------|---------|
| 規格 | `docs/project-planning-artifacts/functional-specs/PCPT-MVP/25.PhyCool-PCPT(MVP)_PhyCool管理系統_平台環境設定.md` | §5.1 | 僅讀此節 |
| {{file_references}} |

#### 路徑引用格式範例

```markdown
<!-- ✅ 正確：完整相對路徑 + 章節號 + 僅讀此節 -->
| 規格 | `docs/project-planning-artifacts/functional-specs/PCPT-MVP/3.PhyCool-PCPT(MVP)_PhyCool管理系統_公告功能.md` | §6 | 僅讀此節 |

<!-- ❌ 錯誤：缺完整路徑，create-story 被迫讀取整份文件 -->
| 規格 | 功能規格 #3 §6 | 維護模式規格 |
```

### Project Structure Notes

- Alignment with unified project structure (paths, modules, naming)
- Detected conflicts or variances (with rationale)

### References

- Cite all technical details with source paths and sections, e.g. [Source: docs/<file>.md §X.X]

---

## Definition of Done

> Exit criteria — ALL items must be checked `[x]` before marking story as "done".

- [ ] All Acceptance Criteria verified (ATDD Given-When-Then pass)
- [ ] All Tasks / Subtasks completed
- [ ] Code compiles without warnings
- [ ] Required tests written and passing
- [ ] Code Review completed with score >= 80
- [ ] DB Migration verified (if applicable)
- [ ] Documentation updated (if doc impact detected)
- [ ] {{additional_dod_items}}

---

## Implementation Approach

> Phase breakdown mapping to Tasks. Each Phase = a logical unit of work that can be verified independently.

### Phase 1: {{phase_1_title}}
**Tasks:** Task {{N}}.x
**Verification:** {{how_to_verify_phase_1}}

### Phase 2: {{phase_2_title}}
**Tasks:** Task {{N}}.x
**Verification:** {{how_to_verify_phase_2}}

{{additional_phases}}

---

## Testing Strategy

> **M/L/XL 強制**：`step-06` §7.5 產出具名測試案例表寫入本欄（產表不產檔）。**S 選填**：沿用既有自由格式，`testing_strategy` 不被改寫。

七欄 schema（選填第八欄 `Pattern`）：`Case`（`{BR_ID}_{Scenario}_{Expected}`）/ `BR` / `Level`（`unit`\|`integration`\|`E2E`）/ `Fixture`（具名既有資產或 `N/A — pure function`）/ `Input` / `Expected` / `RED→GREEN`（雙向具體）。

範例：

| Case | BR | Level | Fixture | Input | Expected | RED→GREEN |
|------|----|-------|---------|-------|----------|-----------|
| `BR005_UpdateCustomScript_WhenConcurrencyConflict_Returns409` | BR-005 | integration | `CustomWebApplicationFactory` | `PUT /mgmt/api/seo/scripts/1` with stale `RowVersion` | HTTP 409, `code`==`E-SEO005` | RED: 回 200（無版本檢查）/ GREEN: 回 409 |

{{testing_strategy}}

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

| 操作 | 檔案路徑 | 說明 |
|------|----------|------|
| | | |

---

## Tech Debt（若有）

> Code Review 發現的延後項目，必須留在原 Epic 內追蹤。

| TD ID | 描述 | 優先級 | 路由目標 |
|-------|------|--------|---------|
| | | | <!-- 格式: 同 Epic 新 Story ID, 如: QGR-M10 --> |

---

## Change Log

| 日期 | 變更 | 作者 |
|------|------|------|
| {{date}} | Story 建立 | create-story workflow |
