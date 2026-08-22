---
paths:
  - "src/**"
  - ".claude/skills/gitnexus/**"
  - ".claude/skills/generated/**"
  - "Migrations/**"
  - "**/*.{cs,ts,tsx,razor,cshtml}"
---

# GitNexus Discipline — 完整 Resources / CLI 參考

> Always-on 核心 mandate 在 CLAUDE.md GitNexus block。本檔提供完整 Resources table + CLI 對照,只在 code 編輯時 lazy-load(對齊 phycool-rule-mapping.md 標記為 🔴 保留為純規則之精簡 paths 化版)。
>
> **2026-05-16 拆分**: CLAUDE.md GitNexus block ~60 行精簡至 ~10 行 always-on,本檔 lazy-load 詳情。

## Index 規模(2026-05 baseline)

PhyCool-PCPT-MVP indexed by GitNexus: **67895 symbols / 126272 relationships / 300 execution flows**。

若任何 GitNexus 工具警告 index stale,先在 terminal 跑 `npx gitnexus analyze`。

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function/class/method,run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level).
- **MUST run `gitnexus_detect_changes()` before committing** to verify changes only affect expected symbols + execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding.
- 探索未知 code → 用 `gitnexus_query({query: "concept"})` 找 execution flows(取代 grep)。
- 需要 symbol 完整 context(callers/callees/flows)→ 用 `gitnexus_context({name: "symbolName"})`。

## Never Do

- ❌ Edit function/class/method without first running `gitnexus_impact`
- ❌ Ignore HIGH or CRITICAL risk warnings
- ❌ Rename symbols with find-and-replace — use `gitnexus_rename` which understands call graph
- ❌ Commit without running `gitnexus_detect_changes()`

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/PhyCool-PCPT-MVP/context` | Codebase overview, check index freshness |
| `gitnexus://repo/PhyCool-PCPT-MVP/clusters` | All functional areas |
| `gitnexus://repo/PhyCool-PCPT-MVP/processes` | All execution flows |
| `gitnexus://repo/PhyCool-PCPT-MVP/process/{name}` | Step-by-step execution trace |

## CLI Skill Index

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

## Generated Area Skills

| Work in the X area (symbols count) | Skill file |
|------|------|
| Services (1507) | `.claude/skills/generated/services/SKILL.md` |
| BackOffice (1134) | `.claude/skills/generated/backoffice/SKILL.md` |
| Admin (696) | `.claude/skills/generated/admin/SKILL.md` |
| Controllers (654) | `.claude/skills/generated/controllers/SKILL.md` |
| AIOS (273) | `.claude/skills/generated/aios/SKILL.md` |
| Js (212) | `.claude/skills/generated/js/SKILL.md` |
| Editor (203) | `.claude/skills/generated/editor/SKILL.md` |
| Api (182) | `.claude/skills/generated/api/SKILL.md` |
| Business (163) | `.claude/skills/generated/business/SKILL.md` |
| Middleware (153) | `.claude/skills/generated/middleware/SKILL.md` |
| Scripts (116) | `.claude/skills/generated/scripts/SKILL.md` |
| Data (95) | `.claude/skills/generated/data/SKILL.md` |
| Payment (87) | `.claude/skills/generated/payment/SKILL.md` |
| Invoice (85) | `.claude/skills/generated/invoice/SKILL.md` |
| Pages (80) | `.claude/skills/generated/pages/SKILL.md` |
| Security (78) | `.claude/skills/generated/security/SKILL.md` |
| Privacy (77) | `.claude/skills/generated/privacy/SKILL.md` |
| Hooks (66) | `.claude/skills/generated/hooks/SKILL.md` |
| Panels (58) | `.claude/skills/generated/panels/SKILL.md` |
| Account (54) | `.claude/skills/generated/account/SKILL.md` |
