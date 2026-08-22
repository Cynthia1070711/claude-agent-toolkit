# hooks-mechanization Trigger Keywords

> Extracted from main SKILL.md description (2026-05-16) to comply with ≤500 char description budget.

## 強觸發關鍵字

當使用者 prompt 包含以下任一,Claude 應主動載入本 skill:

- **規則 → Hook 轉換**:「做成 hook」「機械化」「rule to hook」「convert rule」「hook 範例」
- **Hook 設定**:「hook 設定」「settings.json hooks」「async hook」「hook 不觸發」
- **生命週期事件**:「PreToolUse」「PostToolUse」「Stop hook」「SubagentStart」「SessionStart」「UserPromptSubmit」「FileChanged」「InstructionsLoaded」「ConfigChange」
- **問題診斷**:「exit code 2」「additionalContext」「JSON parse 失敗」「hook timeout」

## 21 Lifecycle Events 參考

完整事件清單見 references/event-schemas.md。

## 4 種 Handler Types

完整對照見 references/handler-types.md(command / http / prompt / agent)。

## PhyCool Rule 映射

PhyCool 既有 31 條 rules 哪些可機械化(🟢 / 🟡 / 🔴 / ⚫)見 references/phycool-rule-mapping.md(2026-05 baseline,需定期審查)。

## 不該觸發

- 純 PhyCool 業務 hook 開發(用對應 phycool-* skill)
- 一般 settings.json 編輯不涉 hook 區塊(用 cc-config-author)
- Hook 已實作但要修 logic bug(用 phycool-windows-ps-encoding 等 specific skill)

## 與其他 skill 的關係

| Trigger | 優先載入 |
|---------|--------|
| 設計新 Hook 概念與架構 | **本 skill (hooks-mechanization)** |
| Hook 寫入 settings.json | `cc-config-author` 配合(spec 守門員) |
| Hook 內含 PowerShell 邏輯 | `phycool-windows-ps-encoding` |
| Hook 涉 MCP 寫入 | `phycool-mcp-discipline` |
