---
paths:
  - ".claude/skills/**"
  - ".gemini/skills/**"
  - ".agent/skills/**"
---

# Skill Tool Invocation Mandatory — saas-to-skill / skill-builder 強制調用層

## Applies When

任何情境涉及:
- Edit / Write `.claude/skills/**/SKILL.md` 或 `references/*.md`
- Edit / Write `.gemini/skills/**/SKILL.md` 或 `references/*.md`
- Edit / Write `.agent/skills/**/SKILL.md` 或 `references/*.md`
- 新建 Skill 目錄結構(任何引擎)
- 三引擎 PowerShell Copy-Item 同步
- frontmatter version bump

## Core Principle(機制性強化於既有 skill-sync-gate.md 之上)

> **「遵守 SOP 精神」≠「字面調用 Skill tool」**。Alan 2026-04-28 ultrathink 明確要求:**必須透過 `Skill` tool 調用** 對應的 saas-to-skill / skill-builder Skill,**而非 Agent 自行人工對齊 SOP 步驟**。

既有 `.claude/rules/skill-sync-gate.md` 已有 FORBIDDEN「直接 Edit SKILL.md 繞過 /saas-to-skill Mode B」,但**精神原則層**仍可能被理解為「Agent 自行遵守 SOP 精神就好」。本 rule **強化字面層** — 必須走 Skill tool API 調用。

## Mandatory Action 矩陣

| 情境 | 必調用 Skill tool |
|------|------------------|
| 更新既有 SaaS 模組 Skill(`pcpt-*`)| `Skill(skill="saas-to-skill")` Mode B Update |
| 新建 SaaS 模組 Skill | `Skill(skill="saas-to-skill")` Mode A Create |
| 新建 Workflow / Utility / Tool Skill(非 SaaS 模組)| `Skill(skill="skill-builder")` |
| Epic 批次 Skill 新鮮度盤點 | `Skill(skill="saas-to-skill")` Mode C Audit |
| 三引擎同步 / md5 verify | `Skill(skill="saas-to-skill")` Mode B Phase 4 內建 |
| frontmatter version bump | `Skill(skill="saas-to-skill")` Mode B 5.3 步驟 5 內建 |
| 7 面向全範圍驗證 | `Skill(skill="saas-to-skill")` Mode B 5.4 內建 |
| Cross-Skill 引用一致性檢查 | `Skill(skill="saas-to-skill")` Mode B 5.4 面向 6 內建 |

## FORBIDDEN

- ❌ Edit / Write SKILL.md 而**不先**調用 `Skill` tool(即使技術上對齊 SOP 步驟)
- ❌ Edit / Write Skill `references/*.md` 跳過 Skill tool
- ❌ 直接 PowerShell Copy-Item `.claude` → `.gemini` / `.agent` 跳過 Skill tool(= 人工執行 saas-to-skill Mode B Phase 4)
- ❌ frontmatter `version` / `updated` / `last_synced_date` 直接 Edit 跳過 Skill tool
- ❌ 「**Skill 留 dev-story 階段做**」合理化跳過字面 Skill tool 調用(2026-04-28 Session 55 投機痕跡 #1)
- ❌ 「**ADR / Story 引用 v1.10.0 但 Skill 仍 v1.9.4**」造成 prospective reference 矛盾(2026-04-28 Session 55 投機痕跡 #2)
- ❌ 「**md5 三引擎 identical 即可,SOP 精神等同**」合理化跳過 Skill tool(2026-04-28 Session 55 投機痕跡 #3)
- ❌ 自行人工模擬 7 面向檢查(必走 Skill tool Mode B 5.4 機制化)

## Self-Check(每次 Edit / Write SKILL.md 前必自問 4 題)

1. 「我是否打算直接 Edit `.claude/skills/**/SKILL.md`?」 → 是 → **STOP**,先 `Skill(skill="saas-to-skill")`
2. 「我是否打算直接 Edit `.gemini/skills/**` 或 `.agent/skills/**`?」 → 是 → **STOP**,Skill tool 內建處理
3. 「我是否打算 PowerShell Copy-Item 做三引擎同步?」 → 是 → **STOP**,Skill tool Mode B Phase 4 處理
4. 「我是否在 ADR / Story 引用未來 Skill 版本(v1.x.0)但 Skill 文件仍是舊版?」 → 是 → **STOP**,先 `Skill(skill="saas-to-skill")` 升版,再寫 ADR / Story

## Hook 機制(既有 + 本 rule 補強)

| 元件 | 角色 |
|------|------|
| `.claude/hooks/skill-change-detector.js` | FileChanged hook 偵測 SKILL.md 變更輸出 stderr 影響報告(已部署) |
| `.claude/rules/skill-sync-gate.md` | dev-story / code-review 階段 SOP 精神(既有) |
| `.claude/rules/skill-tool-invocation-mandatory.md`(本 rule)| **Skill tool 字面調用** 強化(新增 2026-04-28) |
| `memory/feedback_skill_update_must_use_saas_to_skill.md` | 範式 lesson(2026-04-16 既有 + 2026-04-28 Session 55 v2 update) |

## Incident Records

- **2026-04-16 td-hook-test-enhancement**:直接 Edit 3 SKILL.md(pcpt-testing-patterns / claude-token-decrease / pcpt-context-memory)繞過 SOP,被使用者當場指出。觸發 `memory/feedback_skill_update_must_use_saas_to_skill.md` + `skill-sync-gate.md` FORBIDDEN 第 1 條建立。
- **2026-04-28 Session 55(本 rule 觸發事件)**:ultrathink 收斂執行階段,Phase F1/F2 直接 Edit `.claude/skills/pcpt-payment-subscription/SKILL.md` v1.9.4→v1.10.0 + `.claude/skills/pcpt-privacy-legal/SKILL.md` v1.4.0→v1.5.0,然後 PowerShell Copy-Item `.gemini/.agent` 三引擎同步(md5 identical PASS)。**雖技術上達到 SOP 結果**(version bump + 三引擎 md5 + Forbidden + FORBIDDEN 章節 + Version History),但**沒調用 `Skill(skill="saas-to-skill")` tool**。Alan ultrathink interrupt 明確要求建立本 rule 強化「**只要更新、建立 skill,一定要調用 skill-builder / saas-to-skill skill**」。本 rule v1.0 + memory v2 update + CLAUDE.md Forbidden Patterns +1 條三方同步建立。

## Related

- `.claude/rules/skill-sync-gate.md` — dev-story / code-review SOP 精神(本 rule 補強字面層)
- `.claude/rules/skill-idd-sync-gate.md` — IDD `forbidden_changes` 保護(雙層守護)
- `.claude/hooks/skill-change-detector.js` — FileChanged hook 偵測(機制層)
- `memory/feedback_skill_update_must_use_saas_to_skill.md` — 範式 lesson
- `.claude/skills/saas-to-skill/SKILL.md` v3.1.0 — Mode A/B/C 完整 SOP
- `.claude/skills/skill-builder/SKILL.md` v3.0.1 — 新建 Skill 工作流程

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| 1.0.0 | 2026-04-28 | 初版建立。觸發事件:Session 55 ultrathink 收斂執行 Phase F1/F2 直接 Edit + Copy-Item 三引擎同步 pcpt-payment-subscription v1.10.0 + pcpt-privacy-legal v1.5.0 達 md5 identical 但未調用 Skill tool。Alan ultrathink interrupt 強化「字面 Skill tool 調用」要求。本 rule 補強既有 skill-sync-gate.md 精神原則 + skill-change-detector.js hook 機制偵測,形成「字面層 + 精神層 + 機制層」三層守護。 |
