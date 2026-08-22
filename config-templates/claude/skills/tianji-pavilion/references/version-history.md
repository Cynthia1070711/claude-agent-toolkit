# Version History — Tianji-Pavilion Skill

Semver changelog for the methodology and the skill artifacts.

---

## 1.4.0 — 2026-05-23 (Adaptation Depth + Skill Tool Invocation Matrix)

### Added

- **§Principle 3.5 Adaptation Depth Quantification(SKILL.md 摘要層 ~32 行)** — 5 級量化評分(L0 照搬 0-20% / L1 微調 20-40% / L2 混合 40-60% / L3 優化適配 60-80% / L4 深度適配 80%+)+ 4 維度 Checklist + 裁決基線(≥ L3),指向新建 `references/adaptation-depth.md`。
- **D4 本地化補強 7 必補項** — zh-TW / UTC+8 / **UTF-8**(`.md/.json/.cjs/.js` No-BOM · `.ps1/.cs/.razor/.cshtml` 必含 BOM)/ **PowerShell 7.6.1**(Core)+ Node 18+ + Windows 11 / 業務 secret patterns(ECPay/SendGrid/Azure/Anthropic/reCAPTCHA)/ workflow trigger(dev-story/code-review/sprint-status.yaml/IDD framework/tasks-backfill-verify)/ 法務合規(ADR + LICENSE)。
- **Forbidden Patterns F12-F16**(對齊 saas-to-skill v3.3.0 §5.4 面向 8 FORBIDDEN Loophole Closure 三元素 Forbidden / Common Rationalization / Red Flag):
  - F12 Wholesale copy with surface metadata only(body 100% 照搬 + 只補 frontmatter)
  - F13 Generic patterns only, missing PhyCool business-specific
  - F14 Missing PhyCool workflow trigger integration
  - F15 Pure syntax transform without optimization
  - F16 Inflated adaptation claims(聲稱「優化適配」實際 < L3 60%)
- **Forbidden Patterns F17-F19**(Skill tool 字面調用閘門):
  - F17 Skip `Skill(saas-to-skill/skill-builder)` literal invocation when editing SKILL.md
  - F18 Skip `Skill(hooks-mechanization)` literal invocation when editing `.claude/hooks/*.js`
  - F19 Skip `Skill(cc-config-author)` evaluation when editing `.claude/{rules,commands,agents,settings.json}` / `.mcp.json` / `CLAUDE.md`
- **§Integration Points 4 rows Phase 3 Skill Tool Invocation Matrix** — 對應 12 動作類別 → 4 Skill tool 矩陣,指向新建 `references/skill-tool-invocation-matrix.md`。
- **§How to invoke this skill Step 5+6**(主動偵測檔案類別 → Skill tool 字面調用 + 蒸餾深度 self-check)。
- **§Do NOT 9-12 條** — SKILL.md / hooks / `.claude/` config / adaptation claims 4 條字面紀律。
- **2 個新 references 子檔**:
  - `references/adaptation-depth.md`(~180 行)— 5 級 Tiers 完整 spec + 4 維度 Checklist 展開 + 5 self-check 題 + Stage α 4 Phase byte-level case studies(2A 75% L3 / 2B 40% L2 / 2C-1/2/3 30% L1 / 3 80% L4)+ F12-F16 三元素 + saas-to-skill v3.3.0 §5.4 對齊 + Incident Records。
  - `references/skill-tool-invocation-matrix.md`(~120 行)— 12 動作類別 → 4 Skill tool 矩陣 + 為何字面調用論述 + Phase 3 主動偵測流程 + 跳過違規補登 CLI 範本 + Bootstrap Exemption 對齊 + Self-Check 4 題 + Incident Records。

### Changed

- SKILL.md `frontmatter`: `version: 1.3.1` → `1.4.0`,`updated: 2026-05-18` → `2026-05-23`。
- SKILL.md `## Version` 開頭 tagline: `v1.3.0 (AI-Agent Variant + GitNexus Integration)` → `v1.4.0 (... + Adaptation Depth + Skill Tool Invocation Matrix)`。

### Aligned with SUPREME mandates

- `.claude/rules/skill-tool-invocation-mandatory.md` v1.2.0 SUPREME — Edit SKILL.md 必走 `Skill(saas-to-skill)` 字面調用。
- `.claude/rules/hooks-creation-discipline.md` v1.0.0 SUPREME(2026-05-16) — Edit `.claude/hooks/*.js` 必走 `Skill(hooks-mechanization)`(hard-block hook 已部署)。
- `.claude/rules/cross-ref-discipline.md` v1.0.0 SUPREME(2026-05-16) — `.claude/**` 變更前必跑 GitNexus + Grep 跨檔引用查詢。
- `.claude/skills/saas-to-skill/SKILL.md` v3.3.0 §5.4 八面向驗證(metadata / frontmatter / triggers / body / Pressure Test / Cross-Reference / Version / FORBIDDEN Loophole Closure)。

### Trigger

Stage α 4 Phase 蒸餾深度 ultrathink 評估(2026-05-23 session)揭露:

- 4 Phase 適配深度均值 **~56%**(中等偏低)— 目標應 ≥ L3 (60%+)
- Phase 2A deepagents validateSkillName **75% L3**(規則本質照搬但跨語言 + regex 優化 + 整合 audit framework)
- Phase 2B ECC governance-capture **40% L2**(5 patterns + 6 paths byte-for-byte 一致,但 architecture 60% 適配;**aws_key `/i` flag 漏寫** 潛在 bug)
- Phase 2C 3 superpowers skills **30% L1**(對齊 superpowers maintainer "do not modify body" 紀律,但缺 PhyCool workflow integration)
- Phase 3 Khoj distillation **80% L4**(algorithm idea level + zh-TW + UTC+8 + ADR-KHOJ AGPL-3.0 REJECT + roadmap)
- **Memory id=4287**: Phase 2C 跳過 `Skill(skill-builder)` 字面調用屬第 4 次重複犯錯(severity=high);Phase 2A/2B/3 屬 systematic under-reporting,需補 3 條 rule_violation

### Compliance

- 本次走 `Skill(skill="saas-to-skill")` Mode B 字面調用(對齊 self-規範,避 Memory id=4287 第 5 次)
- 對齊使用者 ultrathink 訊息 5 條:(1) 蒸餾本質融合優化適配 (2) 比對 + 驗證 + 適配開發環境 (3) 禁無腦照搬 (4) 取消引用限制 (5) 範圍限 Stage α
- 對齊使用者後續補充:Skill 建立/更新走 `skill-builder`/`saas-to-skill` + hooks 走 `hooks-mechanization` + `.claude/` 配置走 `cc-config-author` 評估
- 對齊使用者最終補充:本地化加 **UTF-8** + **PowerShell 7.6.1**

### Migration from 1.3.1

無需 schema migration。既有 8 mechanized hooks 不變,Phase 0-2 / Phase 4-5 流程不變。Phase 3 Distillation 階段新增「適配深度量化 + Skill tool 字面調用閘門」雙層紀律 — 對 v1.3.1 既有 in-flight evaluation 不溯及既往,新整合決策走 v1.4.0 流程。

---

## 1.3.1 — 2026-05-18 (PhyCool deployment hotfix)

### Fixed

- **DB path SSoT alignment** (CRITICAL): `_lib.js:22` + `tianji-scope-creep-detector.js:50` + `db-patch-init-db.js:36` DB constant changed from `.context-db/context.db` (orphan) → `.context-db/phycool.db` (PhyCool SSoT per `init-db.js:21` + `server.js:33` + MCP `phycool-context`). Pre-patch records written to orphan `context.db` invisible to `mcp__phycool-context__*` tools.
- **init-db.js integration**: `.context-db/scripts/init-db.js` end-of-flow now invokes `applyTianjiSchema(db)` via try/require (idempotent IF NOT EXISTS, safe-skip if Skill not installed). Schema survives future `init-db.js` rebuilds.

### Clarified

- **GitNexus integration scope**: §GitNexus integration explicitly labelled **Agent-discipline layer**, NOT Hook-mechanical. 8 mechanized `tianji-*.js` hooks contain **0** `mcp__gitnexus__*` invocations (grep verified). Agent must load tools via ToolSearch during 5-phase Protocol. Hook-level enforcement remains future candidate.

### Migration note

Records previously written to orphan `.context-db/context.db` (49KB, 2026-05-18 install) are stranded outside PhyCool MCP RAG pool. They should be considered deprecated; re-evaluation cycles should restart against `phycool.db`.

---

## 1.2.0 — 2026-05-18 (AI-Agent Variant)

### Added

- **AI-agent timing variant**: 3d / 7d / 15d for cold-storage / observation /
  cooldown (vs human-pace 7d / 30d / 90d).
- **Safety/compliance exception** to 30% gain threshold (§4.1).
- **Adversarial scenario design**: pre-pilot 3-counterexample protocol (§5.1).
- **Q4 dual threshold**: `audit_score ≥ 0.70` AND `feature_match_pct ≥ 70`
  (§1.2). Previous single-70% conflated two distinct concepts.
- **SDD-lite template**: `assets/templates/spec-lite-template.md` for pilot
  phase SDD+TDD compatibility.
- **Mandatory deliverable templates** for all 5 phases (was only ADR):
  - `assets/templates/baseline-record.md`
  - `assets/templates/benchmark-report.md`
  - `assets/templates/distillation-record.md`
  - `assets/templates/pilot-report.md`
  - `assets/templates/adr-external-eval.md`
  - `assets/templates/existing-capability-activation-plan.md`
- **DB schema patch**: `baseline_snapshots` + `external_evaluations` tables
  added to `.context-db/scripts/init-db.js`.
- **7 mechanized hooks** for F2/F3/F5/F6/F7/F8/F11:
  - `baseline-snapshot-gate.js` (F2)
  - `concurrent-pilot-guard.js` (F3)
  - `q4-audit-gate.js` (F11)
  - `impulse-cooldown-guard.js` (P1.1)
  - `pilot-timebox-monitor.js` (F5)
  - `reject-cooldown-check.js` (F6)
  - `ssot-sync-checker.js` (F7)
  - `scope-creep-detector.js` (F8)
- **Companion skills**:
  - `tianji-baseline-guard` — PreToolUse hooks bundle
  - `tianji-pilot-orchestrator` — Session/Post/Prompt hooks bundle

### Changed

- §3.2 item 6 simplified to "Claude-Code-only" (was "AI engine match" with
  implicit multi-engine support).
- §自我迭代 trigger: "N=5 cases OR any single incident" (was "every 5 cases").
- Phase 4 pilot timeboxes: small/medium/large = 3d/7d/14d (was 2w/4w/6w).
- Phase 5 observation period: 7 days (was 30 days).
- Phase 1-2 evidence section reorganized to make grading table primary.

### Fixed

- Q4 threshold semantic confusion: previously "70%" could mean either audit
  coverage or feature match. Now explicitly both required.
- ADR template was the only template; other phases had no template.
- Templates use placeholder format `{field}` for AI-fillable structure.

### Removed

- References to non-Claude-Code AI engines (Gemini CLI, Antigravity, Rovo Dev).
  Single-engine mode is the PhyCool invariant.

### Migration from 1.1.0

If you were using v1.1.0 (human-pace) and want to switch to v1.2.0:

1. Update cooldown/observation/cold-storage values in any existing
   `baseline_snapshots` / `external_evaluations` rows. SQL:
   ```sql
   UPDATE external_evaluations
   SET cooldown_until = date(cooldown_until, '-75 days')
   WHERE decision = 'REJECT' AND cooldown_until > date('now');
   ```
2. Apply DB schema patch via
   `node .claude/skills/tianji-pavilion/scripts/db-patch-init-db.js apply`.
3. Install hooks per `references/hook-registry.md`.
4. For any in-flight v1.1.0 pilot, finish under v1.1.0 timing then transition.

---

## 1.1.0 — 2026-05-02 (first-application same-day upgrade)

### Added

- §1.2 Q4 (latent capability audit) — Sovereignty Four Questions
- §3.2 item 8 (latent capability single-vote veto)
- §禁忌篇 F11 (skip Q4 = forbidden)
- §銜接篇 connection 10 (audit-capability-reachability +
  capability-integration-mandate)
- §自我迭代條款 — Incident Records section
- `audit-capability-reachability.cjs` companion script

### Trigger

First-application dogfood of v1.0.0 on graphify-6 + Yuxi-main (same day,
2026-05-02). 4-perspective sub-agent analysis revealed PCPT had 70% of the
capability already built but BMAD workflows referenced it 0 times. Without
Q4, evaluator would have wasted ~530 LOC port effort.

### ADR

`docs/technical-decisions/ADR-GOVERNANCE-001-capability-integration-and-skill-governance-systemic-audit.md`

---

## 1.0.0 — 2026-05-02 (initial)

### Initial release

- 5 Charter Principles (Sovereignty / Differential / Essence / Increment /
  Validation)
- 5-Phase Protocol (定境 / 較量 / 煉化 / 嫁接 / 驗真)
- 10 Forbidden Patterns (F1-F10)
- 9 Integration Points with PhyCool toolkit
- Self-iteration clause (N=5 case review)
- Human-pace timing: 7d cold-storage / 30d observation / 90d cooldown

---

## Naming

"Tianji-Pavilion" 天機閣 — from wuxia / xianxia tradition, a pavilion that
keeps the celestial mechanism's records. Adapted as the place that keeps
methodology's records for external-resource evaluation.

## Future direction

Anticipated v1.3.0 candidates (not committed):

- Quarterly auto-review job (cron-like) to flag stale baselines for
  re-evaluation
- Integration with `cc-config-author` for `.claude/` change validation
- Pattern-spotting: cluster external_evaluations by domain/type/outcome to
  surface meta-trends
- LLM-assisted spec-lite drafting (sub-agent that consumes Phase 0-3 records
  and outputs draft spec-lite)
