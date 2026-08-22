---
name: my-skill
description: |
  Use this skill when the user asks to <do specific task>, or when the user mentions
  trigger phrases like "<phrase 1>"、"<phrase 2>"、"<phrase 3>". The skill provides
  <what it provides — workflows / templates / conventions> and produces <expected output>.
  Do NOT use this skill for <out-of-scope cases>. Auto-load when editing files matching
  <path pattern>.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Skill Title

> **建立此 skill**:複製目錄 `assets/templates/skill/` 到 `.claude/skills/<your-skill-name>/`。
> **name 規則**:lowercase + hyphens,≤64 chars,不可含 "claude"、"anthropic"、"system" 等 reserved words。
> **description 規則**:第三人稱,≤1024 chars,包含 what + when triggers,「pushy」語氣讓 Claude 主動觸發。
> **body 規則**:軟上限 300 行,硬上限 500 行。超過則拆 references/。

## 何時使用

明確列出 **3-5 個觸發情境**(讓 Claude 自動匹配時更精準):

1. <觸發情境 1>
2. <觸發情境 2>
3. <觸發情境 3>

**不該觸發**:

- <out-of-scope 1>
- <out-of-scope 2>

## 核心步驟

依此順序執行任務:

### 1. <step 1 name>

具體做什麼。例如:

```bash
node scripts/<some-script>.js
```

### 2. <step 2 name>

...

## 參考檔案索引

若需深入細節,讀對應 reference(progressive disclosure):

- `references/<topic-1>.md` — <用途>
- `references/<topic-2>.md` — <用途>

`scripts/` 內為可執行工具:

- `scripts/<tool-1>.js` — <用途>

`assets/templates/` 內為複製即用範本:

- `assets/templates/<template-1>` — <用途>

## Do NOT

明確列出**不該做的事**(負向約束很重要,Claude 在邊緣案例會誤判):

- <禁止 1>
- <禁止 2>

## 與其他 skill 的關係

- `<related-skill-1>` — <關係描述>
- `<related-skill-2>` — <關係描述>