---
paths:
  - "src/**"
  - "tools/**"
  - ".claude/**"
  - "_bmad/**"
  - "docs/**"
---

# Verification Protocol — Cross-File Change Verification

## Applies When
Task involves "comprehensive check", "update all", "cascade impact".
Typical triggers: spec migration, architecture refactor, deprecation cleanup, cross-system improvement.

## Core Principles

1. **grep ≠ verification**: grep finds "what appears" but misses semantic inconsistencies
2. **reading ≠ verification**: Reading without checking against change list = surface reading
3. **Evidence mandatory**: Every conclusion must cite `file:line` or specific quote — no empty conclusions

## Mandatory Flow (5 Steps)

1. **Impact list**: List all change points + affected categories (rules/skills/workflows/scripts/hooks/CLAUDE.md/MEMORY.md/config)
2. **Glob enumerate**: Glob all files in each category — never rely on memory for "there are only these files"
3. **Read each file**: Actually read each file, compare item-by-item against change list. >10 files → delegate to subagent in parallel (subagent must also Read)
4. **Verification report**: Output table (File | Status | file:line evidence) covering both "needs change" and "no change needed"
5. **User confirmation**: Only declare complete after report — explicitly list verified/needs-change/no-change counts

## FORBIDDEN

- Declaring "all clear" from grep results alone
- Marking unread files as "verified"
- Conclusions without file:line evidence
- Skipping files that "weren't changed but might be affected"
