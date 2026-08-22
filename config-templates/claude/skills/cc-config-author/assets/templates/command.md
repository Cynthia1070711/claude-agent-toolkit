---
description: One-line description shown in /help (≤ 60 chars)
allowed-tools: Bash(git:*), Read, Glob, Grep
argument-hint: <required-arg> [optional-arg]
model: sonnet
---

# Command title

> **建立此 command**:複製到 `.claude/commands/<your-command>.md`。
> **token 預算**:command 軟上限 50 行,硬上限 100 行。
> **可用 substitution**:
>   - `$ARGUMENTS` — 整個 trailing string
>   - `$1`, `$2`, ... — 位置參數(shell-style quoting)
>   - `!`cmd`` — 執行 bash 並嵌入結果(需 allowed-tools)
>   - `@path/to/file` — 嵌入檔案內容

## Current state

- Branch: !`git branch --show-current`
- Recent commits: !`git log -5 --oneline`
- Status: !`git status --short`

## Task

依照下列步驟處理 `$ARGUMENTS`:

1. <step 1>
2. <step 2>
3. <step 3>

## Output format

回傳結果必須包含:

- **結論**:<一句話>
- **證據**:<file:line references>
- **建議下一步**:<actionable>