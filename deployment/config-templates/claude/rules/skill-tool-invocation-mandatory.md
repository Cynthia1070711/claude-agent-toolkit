---
version: 1.3.0
updated: 2026-05-29
paths:
  - ".claude/skills/**"
---

# Skill Tool Invocation Mandatory — saas-to-skill / skill-builder 強制調用層

## Applies When

任何情境涉及:
- Edit / Write `.claude/skills/**/SKILL.md` 或 `references/*.md`
- 新建 Skill 目錄結構
- frontmatter version bump

## Core Principle(機制性強化於既有 skill-sync-gate.md 之上)

> **「遵守 SOP 精神」≠「字面調用 Skill tool」**。Alan 2026-04-28 ultrathink 明確要求:**必須透過 `Skill` tool 調用** 對應的 saas-to-skill / skill-builder Skill,**而非 Agent 自行人工對齊 SOP 步驟**。

既有 `.claude/rules/skill-sync-gate.md` 已有 FORBIDDEN「直接 Edit SKILL.md 繞過 /saas-to-skill Mode B」,但**精神原則層**仍可能被理解為「Agent 自行遵守 SOP 精神就好」。本 rule **強化字面層** — 必須走 Skill tool API 調用。

## Mandatory Action 矩陣

| 情境 | 必調用 Skill tool |
|------|------------------|
| 更新既有 SaaS 模組 Skill(`phycool-*`)| `Skill(skill="saas-to-skill")` Mode B Update |
| 新建 SaaS 模組 Skill | `Skill(skill="saas-to-skill")` Mode A Create |
| 新建 Workflow / Utility / Tool Skill(非 SaaS 模組)| `Skill(skill="skill-builder")` Mode A |
| **更新既有 Workflow / Utility / Tool Skill(非 phycool-*)** | `Skill(skill="skill-builder")` **Mode B**(v3.3.0+ · 參照 saas-to-skill Mode B update 機制 + 8 面向驗證;免 SaaS-specific C1-C10/business-rule)|
| Epic 批次 Skill 新鮮度盤點 | `Skill(skill="saas-to-skill")` Mode C Audit |
| frontmatter version bump | `Skill(skill="saas-to-skill")` Mode B 5.3 步驟 5 內建 |
| 7 面向全範圍驗證 | `Skill(skill="saas-to-skill")` Mode B 5.4 內建 |
| Cross-Skill 引用一致性檢查 | `Skill(skill="saas-to-skill")` Mode B 5.4 面向 6 內建 |

> **Canonical 工具邊界**(2026-05-29 v1.3.0 釐清):**通用/utility/tool skill 建立 + 更新 → `skill-builder`(Mode A 建立 / Mode B 更新)**；**phycool-* SaaS 模組建立 + 更新 → `saas-to-skill`(Mode A/B/C)**。按 **skill-type 完整切分**(非 create/update 切分)。`skill-tool-invocation-guard.js` v2 已機械 enforce「Create/update Workflow/Utility Skill → skill-builder」。**填補前 gap**:原矩陣缺「更新既有 utility skill」列,saas-to-skill Not For 排除 utility、skill-builder 原僅建立 → 2026-05-29 UI v3 session ui-ux-pro-max(utility)更新誤用 saas-to-skill 暴露,使用者裁定補列 + skill-builder v3.3.0 補 Mode B。

## FORBIDDEN

- ❌ Edit / Write SKILL.md 而**不先**調用 `Skill` tool(即使技術上對齊 SOP 步驟)
- ❌ Edit / Write Skill `references/*.md` 跳過 Skill tool
- ❌ frontmatter `version` / `updated` / `last_synced_date` 直接 Edit 跳過 Skill tool
- ❌ 「**Skill 留 dev-story 階段做**」合理化跳過字面 Skill tool 調用(2026-04-28 Session 55 投機痕跡 #1)
- ❌ 「**ADR / Story 引用 v1.10.0 但 Skill 仍 v1.9.4**」造成 prospective reference 矛盾(2026-04-28 Session 55 投機痕跡 #2)
- ❌ 自行人工模擬 7 面向檢查(必走 Skill tool Mode B 5.4 機制化)

---

## §Bootstrap Exemption(2026-05-09 v1.2.0 新增)

**問題背景**: 當一個 Skill 本身規範或實作 pipeline 子視窗 / sub-window 行為(如 `pipeline-subwindow` Skill 規範子視窗執行紀律),且該 Skill 的更新與 pipeline 子視窗自身的能力存在循環依賴時,字面要求「先走 Skill tool 再 Edit」會形成自舉死結 — Skill 本身尚未存在或尚未生效,如何能用它來規範自己。

### 三條件齊備時主視窗可豁免字面 Skill tool 調用

✅ **C1 — Skill 涵蓋 pipeline 自身行為**: Skill 本體規範 pipeline / sub-window / orchestrator / launcher 等執行基礎建設(非 SaaS 業務模組)
✅ **C2 — Story AC 明文豁免**: 對應 Story 的 Acceptance Criteria 顯式記錄「主視窗手動 Edit SKILL.md frontmatter」屬合規動作(非投機跳過 SOP)
✅ **C3 — Memory decision 紀錄**: `add_context(category=decision)` 寫入豁免決策的 evidence + reasoning,可日後 audit

### 豁免範圍精確邊界

| 動作 | 豁免? | 理由 |
|------|:----:|------|
| Edit SKILL.md frontmatter (version / updated) | ✅ 允許 | 字面豁免項 |
| Edit SKILL.md body 內容(章節 / 範本)| ✅ 允許 | 同 frontmatter 自舉路徑 |
| Edit `references/*.md` | ✅ 允許 | 同上 |
| 新建 Skill (Mode A 性質) | ❌ **不豁免** | 必走 `Skill(skill="skill-builder")` — 新建無自舉問題 |
| 修改 SaaS 模組 Skill (`phycool-*`)| ❌ **不豁免** | 必走 `Skill(skill="saas-to-skill")` — 業務 Skill 無自舉問題 |
| 跨 Skill 引用一致性檢查 | ❌ **不豁免** | 必走 Mode B 5.4 機制化 |

### Self-Check(豁免使用前必答 3 題)

1. 「該 Skill 是否規範 pipeline 自身行為?」(非 SaaS 業務模組) → 否 → STOP,走 Skill tool
2. 「對應 Story AC 是否明文記錄豁免?」 → 否 → STOP,先建 Story / 補 AC
3. 「我是否已在 Memory DB add_context 寫入豁免決策 + 證據?」 → 否 → STOP,先寫 Memory

任一答案 No → **不適用豁免**,必走 Skill tool。

### Incident Records(本豁免來源)

- **2026-05-09 SKL-09 pipeline-subwindow Skill v1.1.0 自舉決策**: SKL-09 主 Story 建立 `pipeline-subwindow` Skill 規範子視窗執行紀律,但該 Skill 本身需要主視窗手動 Edit `.claude/skills/pipeline-subwindow/SKILL.md` 完成首次建立 — 形成自舉死結。CR R1 識別 `TD-skl-09-bootstrap-rule` ACCEPTED LONG-TERM,SKL-09 follow-up Story AC1 將此豁免條件固化為 v1.2.0 §Bootstrap Exemption clause。Memory decision: `context_entries id=3988`。

### Related ADR

- `docs/technical-decisions/ADR-GOVERNANCE-002-skill-tool-bootstrap-exemption.md` — 豁免條款 ADR + 三條件齊備推導 + 範圍邊界決策

---

## Self-Check(每次 Edit / Write SKILL.md 前必自問 2 題)

1. 「我是否打算直接 Edit `.claude/skills/**/SKILL.md`?」 → 是 → **STOP**,先 `Skill(skill="saas-to-skill")`
2. 「我是否在 ADR / Story 引用未來 Skill 版本(v1.x.0)但 Skill 文件仍是舊版?」 → 是 → **STOP**,先 `Skill(skill="saas-to-skill")` 升版,再寫 ADR / Story

## Hook 機制(既有 + 本 rule 補強)

| 元件 | 角色 |
|------|------|
| `.claude/hooks/skill-change-detector.js` | FileChanged hook 偵測 SKILL.md 變更輸出 stderr 影響報告(已部署) |
| `.claude/rules/skill-sync-gate.md` | dev-story / code-review 階段 SOP 精神(既有) |
| `.claude/rules/skill-tool-invocation-mandatory.md`(本 rule)| **Skill tool 字面調用** 強化(新增 2026-04-28) |
| `.claude/rules/single-engine-mode.md` | Single-Engine Mode SSoT(2026-05-05 建立)|

## Incident Records

- **2026-04-16 td-hook-test-enhancement**:直接 Edit 3 SKILL.md(phycool-testing-patterns / claude-token-decrease / phycool-context-memory)繞過 SOP,被使用者當場指出。觸發 `memory/feedback_skill_update_must_use_saas_to_skill.md` + `skill-sync-gate.md` FORBIDDEN 第 1 條建立。
- **2026-04-28 Session 55**:ultrathink 收斂執行階段,Phase F1/F2 直接 Edit `.claude/skills/phycool-payment-subscription/SKILL.md` v1.9.4→v1.10.0 + `.claude/skills/phycool-privacy-legal/SKILL.md` v1.4.0→v1.5.0。Alan ultrathink interrupt 明確要求建立本 rule 強化「**只要更新、建立 skill,一定要調用 skill-builder / saas-to-skill skill**」。本 rule v1.0 建立。

## Related

- `.claude/rules/skill-sync-gate.md` — dev-story / code-review SOP 精神(本 rule 補強字面層)
- `.claude/rules/skill-idd-sync-gate.md` — IDD `forbidden_changes` 保護(雙層守護)
- `.claude/rules/single-engine-mode.md` — Single-Engine Mode SSoT(2026-05-05+)
- `.claude/hooks/skill-change-detector.js` — FileChanged hook 偵測(機制層)
- `.claude/skills/saas-to-skill/SKILL.md` — Mode A/B/C 完整 SOP
- `.claude/skills/skill-builder/SKILL.md` — 新建 Skill 工作流程

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.3.0** | **2026-05-29** | **矩陣補「更新既有 Workflow/Utility/Tool Skill(非 phycool-*)」列 + Canonical 工具邊界釐清**。填補前 gap:原矩陣有「新建 utility → skill-builder」「更新 SaaS → saas-to-skill Mode B」但缺「更新既有 utility skill」列;saas-to-skill Not For 排除 utility、skill-builder 原僅建立 → 無工具覆蓋「更新 utility」。釐清:**通用 skill 建立+更新 → skill-builder(Mode A/B)** / **phycool-* SaaS 建立+更新 → saas-to-skill**(按 skill-type 完整切分)。配套 skill-builder v3.3.0 補「Mode B 更新既有通用 skill」段落(參照 saas-to-skill Mode B + 8 面向)。觸發:2026-05-29 UI v3 session ui-ux-pro-max(utility)更新誤用 saas-to-skill 暴露 gap,使用者裁定。走 cc-config-author(rule edit) + skill-builder(自身更新 §Bootstrap Exemption)。`skill-tool-invocation-guard.js` v2 已 enforce 此 canonical 邊界。 |
| **1.2.0** | **2026-05-09** | **§Bootstrap Exemption clause 新增**。當 Skill 本身規範 pipeline 自身行為(`pipeline-subwindow` 等基礎建設 Skill)時,主視窗手動 Edit SKILL.md frontmatter 形成自舉死結 — Skill 尚未生效如何用它規範自己。三條件齊備時豁免字面 Skill tool 調用:C1 Skill 涵蓋 pipeline 自身行為 + C2 Story AC 明文豁免 + C3 Memory decision 紀錄。豁免範圍嚴格限定基礎建設 Skill 自舉場景,**不適用**新建 Skill / SaaS 模組 Skill / 跨 Skill 一致性檢查。觸發事件:SKL-09 主 Story 建立 `pipeline-subwindow` Skill v1.1.0 自舉,CR R1 識別 `TD-skl-09-bootstrap-rule` ACCEPTED LONG-TERM。Story: `skl-09-cr-r1-followup-rule-and-doc-polish` AC1。Related ADR: `ADR-GOVERNANCE-002`。 |
| 1.1.0 | 2026-05-05 | **Single-Engine Mode 落地**(配合 `.claude/rules/single-engine-mode.md` v1.0.0)。移除三引擎相關條目:paths 移除 `.gemini/skills/**` + `.agent/skills/**`;Applies When 移除 .gemini/.agent Edit 兩條 + 三引擎 Copy-Item bullet;Mandatory Action 矩陣移除「三引擎同步 / md5 verify」row;FORBIDDEN 移除「PowerShell Copy-Item 三引擎」+「md5 三引擎 identical」兩條;Self-Check 從 4 題簡化為 2 題(移除三引擎相關第 2、3 題)。**保留核心精神**:Edit/Write SKILL.md 必先調用 `Skill(saas-to-skill)` 字面 Skill tool 調用要求。觸發事件:5/1 備份還原 + 使用者 5/5 決策(停三引擎 + 停 toolkit)。 |
| 1.0.0 | 2026-04-28 | 初版建立。觸發事件:Session 55 ultrathink 收斂執行 Phase F1/F2 直接 Edit + Copy-Item 三引擎同步 phycool-payment-subscription v1.10.0 + phycool-privacy-legal v1.5.0 達 md5 identical 但未調用 Skill tool。Alan ultrathink interrupt 強化「字面 Skill tool 調用」要求。本 rule 補強既有 skill-sync-gate.md 精神原則 + skill-change-detector.js hook 機制偵測,形成「字面層 + 精神層 + 機制層」三層守護。 |
