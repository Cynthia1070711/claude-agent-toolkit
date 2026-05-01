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

## Background

{{background_context}}

---

## Acceptance Criteria

> **ATDD 格式規範** (SDD+ATDD+TDD 方法論)
> - 每個 AC 必須附 `[Verifies: BR-XXX]` 映射至少一條 Business Rule
> - 使用 ATDD 格式：Given {前置條件} → When {操作} → Then {可驗證結果}（含具體數值）
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
| 規格 | `docs/project-planning-artifacts/functional-specs/PCPT-MVP/25.pcpt-PCPT(MVP)_PCPT管理系統_平台環境設定.md` | §5.1 | 僅讀此節 |
| {{file_references}} |

#### 路徑引用格式範例

```markdown
<!-- ✅ 正確：完整相對路徑 + 章節號 + 僅讀此節 -->
| 規格 | `docs/project-planning-artifacts/functional-specs/PCPT-MVP/3.pcpt-PCPT(MVP)_PCPT管理系統_公告功能.md` | §6 | 僅讀此節 |

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
