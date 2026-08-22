---
paths:
  - ".claude/skills/**"
  - "src/**/Migrations/**"
  - "src/**/Models/**"
  - "src/**/Services/**"
  - "src/**/Controllers/**"
  - "_bmad/bmm/workflows/**/dev-story/**"
  - "_bmad/bmm/workflows/**/code-review/**"
---

# Skill Sync Gate — Mandatory Skill Synchronization

## Applies When

dev-story or code-review workflow involves any of these changes:

| Change Type | Detection Signal |
|------------|-----------------|
| DB Schema | file_list contains `Migrations/**/*.cs` or `Models/**/*.cs` |
| Business rules/policy | file_list contains `Services/*Feature*.cs`, `*Service.cs`, `*Policy*.cs` |
| Route/URL | file_list contains `Convention*.cs`, `Route*.cs`, Area config |
| Frontend architecture | file_list contains `components/**/*.tsx`, `stores/**/*.ts` |
| Config/environment | file_list contains `appsettings*.json`, `*.csproj` version upgrade |
| Auth/permission flow | file_list contains `Identity/**`, `Auth*`, RBAC related |

## Core Principle

> **Prompt is verbal instruction, Skill is written SOP.** Code changed but Skill not synced = next conversation uses stale SOP producing incorrect code.

## Mandatory Flow

### dev-story phase (after Step 8, before archival)

1. **Scan file_list** → extract core change concepts (Entity names, Route paths, rule keywords)
2. **Grep reverse search** → `Grep pattern="{concept}" path=".claude/skills/phycool-*"` to find Skills referencing these concepts
3. **Produce Skill Impact Report**:
```
## Skill Sync Check
| Affected Skill | Affected Section | Change Type | Synced |
|---------------|-----------------|-------------|--------|
| phycool-payment-subscription | L42: refund policy | Business rule | ✅/⬜ |
```
4. **If affected Skills exist → run `/saas-to-skill` Mode B** to update
5. **Mark ✅ after update**, attach Skill version and change summary

### code-review phase (Step 3 deep review)

1. Check if dev-story produced Skill Impact Report
2. If affected but not synced (⬜) → mark as MUST FIX issue
3. Verify synced Skills — Read updated Skill to confirm consistency with code

## FORBIDDEN

- ❌ Skip Skill impact scan at dev-story completion
- ❌ Mark affected Skill as "deferred" (must sync within same Story)
- ❌ Update Skill without file:line evidence (blind edit)
- ❌ **直接 Edit SKILL.md 繞過 `/saas-to-skill` Mode B** (2026-04-16 td-hook-test-enhancement incident: 直接 Edit 3 個 SKILL.md → 跳過 version bump / 三引擎同步 / 7 面向檢查。必須調用 `/saas-to-skill` Mode B 走完 SOP)
- ❌ **跳過 Skill tool 字面調用** (2026-04-28 Session 55 incident: Edit 達 SOP 結果但未調用 `Skill(skill="saas-to-skill")` tool。詳見 `.claude/rules/skill-tool-invocation-mandatory.md` v1.1.0 字面 Skill tool 調用強化層)

> **Single-Engine Mode (2026-05-05+)**: `.claude/` 為唯一 SSoT,`.gemini/.agent/` 已 DEPRECATED。原「三引擎同步」FORBIDDEN 退役,詳見 `.claude/rules/single-engine-mode.md`。

## Quick Decision: Is Skill Sync Needed?

```
file_list contains Migration/Model/Service/Controller/Route/Component changes?
  → Yes → Grep search phycool-* Skills
    → Hit → Run Mode B update
    → No hit → Record "Skill Sync Check: no affected Skills"
  → No → Skip (pure UI style/test/doc changes don't trigger)
```

## phycool-system-platform Mandatory Cross-Check

`phycool-system-platform` is the **platform-wide navigation Skill** (19 modules × 36 files). Any phycool-* Skill update MUST also check phycool-system-platform for consistency:

| Change Type | Check Target in phycool-system-platform |
|------------|----------------------------------------|
| Business rules/pricing | references/{Module}/\*.md business rules table |
| DB Schema/Entity | references/{Module}/overview.md entity list |
| Feature lifecycle (PLANNED→IMPL) | references/{Module}/\*.md lifecycle status table |
| UI/UX component add/remove | references/PCPTSystem/\*.md component tree |
| Brand/Design Token | SKILL.md S8 tech stack + references/Infrastructure/ |
| Module boundary change | SKILL.md S1 classification tree + CrossCutting/data-flow.md |
| New Phase activation | FutureModules/ → promote to {Module}System/ |

**Risk**: New conversation window loads stale phycool-system-platform → uses outdated spec for all modules.

---

## Relationship with tasks-backfill

Dual gates for dev-story/code-review:
1. **tasks-backfill-verify** → verify Story tasks completed (retrospective)
2. **skill-sync-gate** → verify Skill specs synced (prospective — protects next conversation)

Execution order: dev-story complete → Skill Sync Gate → tasks-backfill-verify → archive
