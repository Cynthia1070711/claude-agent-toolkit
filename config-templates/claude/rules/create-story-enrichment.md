---
paths:
  - "_bmad/bmm/workflows/**/create-story/**"
  - "_bmad/bmm/workflows/**/sprint-planning/**"
  - "_bmad/bmm/workflows/**/party-mode/**"
  - "docs/implementation-artifacts/specs/**"
  - ".context-db/scripts/upsert-story.js"
---

# Create-Story DB Enrichment Mandatory Rules

## Applies When

create-story workflow Step 6 (.md 寫入) 和 Step 7 (DB upsert) 完成前。

## Core Principle: 格式標準化 ≠ 內容刪除

Party Mode / brainstorming 產出的原始 Story 可能包含非標準章節（Exit Criteria、Self-Sufficiency Checklist、Implementation Approach 等）。create-story 標準化格式時**不可直接刪除這些章節**——必須轉寫到 DB 對應欄位。

## Mandatory DB Enrichment Check

create-story 完成 upsert-story.js 寫入 DB 後，以下 3 個欄位**至少一個非 NULL**：

| DB 欄位 | 內容來源 | Self-Contained 模式替代 |
|---------|---------|----------------------|
| `implementation_approach` | SDD Spec 或原始 Story 的實作方法論 | `See Skill {path} §X` |
| `testing_strategy` | SDD Spec 或原始 Story 的測試策略 | `AC verification commands + Skill §Y` |
| `definition_of_done` | 原始 Story 的 Exit Criteria / DoD | 從原始內容轉寫 |

### 額外必填欄位

| DB 欄位 | 說明 |
|---------|------|
| `create_agent` | 當前 Agent ID (CC-OPUS / CC-SONNET) |
| `sdd_spec` | SDD Spec 路徑，或 Self-Contained 填 Skill 路徑 |

## Self-Contained 模式白名單

以下條件**全部滿足**時，允許 Self-Contained（跳過獨立 SDD Spec 文件）：

1. **domain**: devops / infra / tooling（非 business logic）
2. **有 authoritative Skill**: 已有完整 SKILL.md 定義 schema/API/interface
3. **AC 有 verification commands**: 每個 AC 附具體驗證指令
4. **sdd_spec 欄位填 Skill 路徑**: e.g., `.claude/skills/pcpt-intentional-decisions/SKILL.md`

不滿足 → 必須走標準 SDD Spec 生成流程（M/L/XL）。

## 原始章節保留流程

當 Party Mode / brainstorming 原始 Story 被重新格式化時：

1. **Diff 比對**: 列出原始版 vs 標準模板的差異章節
2. **轉寫映射**:
   - Exit Criteria / Done Definition → `definition_of_done` DB 欄位
   - Implementation Approach / Phase Plan → `implementation_approach` DB 欄位
   - Testing Strategy / Test Plan → `testing_strategy` DB 欄位
   - Self-Sufficiency Checklist → `dev_notes` 附加
   - Rollback Plan → `rollback_plan` DB 欄位
3. **無對應欄位的章節** → 附加到 `dev_notes` 末尾，標記 `[From original: §{section_name}]`

## FORBIDDEN

- ❌ 重新格式化時直接刪除非標準章節（必須轉寫）
- ❌ 3 個 enrichment 欄位全部 NULL（至少填一個）
- ❌ create_agent 為 NULL
- ❌ Self-Contained 模式但 sdd_spec 欄位為 NULL（必須填 Skill 路徑）

## Incident Record

- **2026-04-10 dla-07**: Party Mode 產出 473 行完整 Story（含 Exit Criteria 11 項 + Self-Sufficiency 10 項），create-story 重新格式化時刪除兩個章節，3 個 DB 欄位 NULL。dev agent 少了實作指引，導致 C1 bug（git add -f 遺漏）。
- **2026-04-12 dla-05**: 內容深度不足 — background 606 chars vs eft-property-panel 6780 chars (11x)。DB 欄位全部填充但文字內容太淺（無 code snippet、無 JSON example、無 file:line）。根因：workflow 缺少結構化深度強制。修復：step-03 §6.5 + step-06 §9.5 Quality Gate 5 維度。

---

## Story Output Quality Gate (5 Dimensions) — Added 2026-04-12

每個 create-story 產出必須通過 step-06 §9.5 五維度品質閘門：

| 維度 | 要求 | DB 欄位影響 |
|------|------|-----------|
| Q1 Background Code | `## Background` 含 `file:line` code snippets | `background` |
| Q2 AC Examples | 每個 AC 有 concrete example (JSON/code/DOM/cmd) | `acceptance_criteria` |
| Q3 File Line Numbers | Source refs 用 `File.ext:L123-145` 格式 | `dev_notes` |
| Q4 Definition of Done | `## Definition of Done` 含 `- [ ]` items (≥5) | `definition_of_done` |
| Q5 Phase Breakdown | `## Implementation Approach` 含 `### Phase N:` (≥2) | `implementation_approach` |

**Enforcement files**: step-03 §6.5 + step-06 §9.1/§9.2/§9.5 + checklist §2.7

---

## Depth Validation Gate (7 Gates D1-D7) — Added 2026-04-14 (v1.1 add D7)

**形式閘門不等於實質閘門。** 5 維 Q1-Q5 驗「有沒有」,Depth Gate 驗「對不對」。

step-06 §9.5 五維閘門通過後,**必執行** `/pcpt-create-story-depth-gate` Skill 之 CLI:

```bash
node .claude/skills/pcpt-create-story-depth-gate/scripts/run-depth-gate.js {story_id}
```

| Gate | 驗證 | BLOCK 條件 |
|:---:|------|------------|
| D1 Skill Read | 對每個 `required_skills` Read SKILL.md 取 version + updated + synced-epic | Skill 檔不存在 |
| D2 ADR/IDD Cross-Ref | Grep Story 中 ADR/IDD 引用 + 驗 forbidden_changes 不違反 + 反查 affected_files 隱性 IDD 命中 | 違反 forbidden / ADR Superseded |
| D3 PRD Source | discovery_source + docs/*.md 追溯原始需求 | Story 非 bugfix/tech-debt 但無源頭 → WARN |
| D4 Chrome MCP Live | UI Story 前置 curl backend/vite + navigate + evaluate_script 驗主要 AC DOM | server 未跑 / SSL 未 trust / Chrome 不可用 |
| D5 Iteration Pollution | 驗 Background file:line 行號漂移 + commit 存活 + ADR 版本 | commit 不存活 |
| D6 Cross-Story Consistency | 同 Epic + soft dep file_list 衝突偵測 | dep 不存在於 DB |
| **D7 Self-Write Verification** (v1.1) | 欄位最小長度 + 格式損壞偵測(triple-backslash / 未展開 template / 空 code fence)+ Phase 計數 + DoD checkbox 計數 + 必填欄位 | 欄位 EMPTY / 格式損壞 / create_agent/sdd_spec/status NULL |

**Exit code**: 0=PASS / 1=WARN(可繼續) / 2=BLOCK(退回 backlog)

**Workflow 整合**: `_bmad/bmm/workflows/4-implementation/create-story/steps/step-06.5-depth-gate.md`

### FORBIDDEN

- ❌ 跳過 Depth Gate 直接 step-07 upsert 為 ready-for-dev
- ❌ 5 維形式閘門過 = 深度足夠(形式 ≠ 實質)
- ❌ UI Story 跳過 D4(除非使用者明確 override + server 不可用 + 記錄原因)
- ❌ 列 `required_skills` 但不 Read 內容(D1 要求 Read 證據)
- ❌ 引用 ADR 不驗版本(D2 要求對齊)
- ❌ 靜默忽略 WARN(必須 dev_notes 記錄)

### Incident Record

- **2026-04-14 `eft-gallery-templates-modal-wiring` 補全事故**: 5 維形式閘門全過,但深度驗證發現 **8 個 issue**:
  - I1 GalleryController 讀半邊誤判 gating(實際 dead code L331-334 helper 永回 true)
  - I2 IDD-COM-001 platform_modules 迭代污染(未同步 ADR v1.6 Dashboard scope)
  - I3 Skill `pcpt-member-plans` §3.2 陳述過簡(無 file:line)
  - I4 Skill `pcpt-e2e-playwright` §3 `.auth/user.json` 命名過時
  - I5 auth.fixture.ts 無 per-plan fixture(Story E2E 模板引用不存在)
  - I6 tech_debt 流程錯誤(單步 `--inline status:resolved`,正確應雙步驟)
  - I7 bf-3 父規格與 ADR-BUSINESS-001 v1.2 版本衝突
  - I8 Chrome MCP SSL 阻擋 → live verify 無法執行
- 觸發 Depth Gate Skill + workflow step-06.5 + 本 rule 章節建立,防止未來再度發生「形式過但深度不足」問題
