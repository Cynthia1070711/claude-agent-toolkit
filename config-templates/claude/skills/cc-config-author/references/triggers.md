# cc-config-author Trigger Keywords + Auto-Load Patterns

> Extracted from main SKILL.md description (2026-05-16) to comply with ≤500 char description budget.

## 強觸發關鍵字

當使用者 prompt 包含以下任一,Claude 應主動載入本 skill:

- **新建/修改配置**:「新增 rule」「改 CLAUDE.md」「新增 skill」「加 command」「agent 定義」「改 settings」
- **規範問題**:「設 paths」「frontmatter 怎麼寫」「哪些欄位是必要的」「符合最新規範」「check spec」
- **健檢/稽核**:「健檢配置」「audit config」「cc audit」「CLAUDE.md 太長」「compactify config」
- **問題診斷**:「rule paths 失效」「skill 觸發失敗」「token 預算超標」

## Auto-Load 路徑 patterns

Claude **about to Write/Edit** 任何符合以下路徑時自動載入:

- `.claude/**/*.md`(rules / skills / commands / agents)
- `.claude/**/*.json`(settings / mcp config)
- `.mcp.json`
- `CLAUDE.md` / `CLAUDE.local.md`(專案根 + user level)
- `~/.claude/CLAUDE.md`(user-level memory)

## 不該觸發

- 純 SaaS 業務邏輯討論(用對應 phycool-* skill)
- 一般程式碼修改(用 phycool-editor-arch / phycool-payment-subscription 等)
- 已有更精準 skill 可用(優先用更精準的)

## 與其他 skill 的觸發優先級

| Trigger | 優先載入 |
|---------|--------|
| 新建 SKILL.md(SaaS 模組) | `saas-to-skill` Mode A |
| 新建 SKILL.md(workflow/utility) | `skill-builder` |
| 新建 Hook | `hooks-mechanization` + 本 skill 配合 |
| 配置健檢 + spec 對照 | **本 skill (cc-config-author)** |
| Edit 既有 SKILL.md | `saas-to-skill` Mode B / `skill-builder` validate |
