---
paths:
  - "docs/**/*.md"
  - "平台UIUX排版範例/**"
  - "docs/project-planning-artifacts/**"
  - "docs/implementation-artifacts/specs/**"
---

# Spec Document Timeliness

## Core Principle: Code Is Always the True State

Cross-verify code when referencing spec documents — never blindly trust spec descriptions.

## Timeliness Priority (highest to lowest)

1. **Code** (App.tsx, components/, services/) — always the current true state
2. **UI/UX layout examples** (`平台UIUX排版範例/`) — usually newer than functional specs
3. **functional-specs/** — initial requirements, may lag behind implementation
4. **System detailed spec (#0)** — earliest overview doc, most likely outdated

## Mandatory Rules

1. **Compare timestamps before citing**: Check spec "last reviewed" date vs code @date/@changelog — use newer
2. **Code wins on conflict**: When spec vs code disagree, code is authoritative — mark spec as needing update
3. **Read code before UI discussion**: Before discussing any UI issue, read actual component code
4. **Multiple versions → use newest**: When multiple docs cover same topic, use the one with latest timestamp
5. **Attach staleness disclaimer**: When spec date is clearly older than code, note "this spec may be outdated, cross-verified with code"

## Spec Annotation Format

When spec diverges from code, add at spec top:

```markdown
> **Code baseline**: {Story/OPT ID} ({date})
> **Known implementation divergences (code is ahead of this spec)**:
> - {divergence 1}
> - {divergence 2}
> - Code is authoritative for the above
```
