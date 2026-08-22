# Event Schemas — 21 Lifecycle Events (2026 Apr)

完整 stdin JSON schema 參考。當你不確定某事件能拿到哪些欄位時,查這份。

所有事件都有以下共通欄位:

```json
{
  "session_id": "abc123",
  "transcript_path": "/.../session.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default" | "plan" | "auto",
  "hook_event_name": "<EventName>"
}
```

以下只列**事件特有的額外欄位**。

---

## Session 級

### Setup (`claude --init` / `--maintenance`)
```json
{
  "trigger": "init" | "maintenance"
}
```
**特殊**:有 `CLAUDE_ENV_FILE` 環境變數,寫入該檔的變數會 persist 到整個 session。
**輸出**:不可阻擋。可注入 `additionalContext`。

### SessionStart
```json
{
  "matcher_value": "startup" | "resume" | "clear" | "compact"
}
```
**特殊**:stdout 純文字會直接被當作 context 注入(舊機制),建議用 JSON `additionalContext`。
**輸出**:不可阻擋。stdin 必須 drain(即使不用)。

### SessionEnd
```json
{
  "reason": "exit" | "sigint" | "error"
}
```
**輸出**:不可阻擋。常用於彙整 telemetry。

### Notification
```json
{
  "notification_type": "permission_prompt" | "idle_prompt" | "auth_success" | "elicitation_dialog",
  "message": "..."
}
```
**用途**:桌面通知、Slack 通知。

---

## Tool 級

### PreToolUse
```json
{
  "tool_name": "Bash" | "Edit" | "Write" | "Read" | "Grep" | "Glob" | "mcp__server__tool",
  "tool_input": {
    "command": "...",        // Bash
    "file_path": "...",      // Edit / Write / Read
    "old_string": "...",     // Edit
    "new_string": "...",     // Edit
    "content": "..."         // Write
  }
}
```
**輸出**:
- `permissionDecision: "allow" | "deny" | "ask"` + `permissionDecisionReason`
- `updatedInput: {...}` — 改寫 tool_input
- exit 2 + stderr = block
- `additionalContext` — 注入 context

### PermissionRequest
```json
{
  "tool_name": "...",
  "tool_input": {...},
  "requested_permission": "Bash" | "Read" | ...
}
```
**輸出**:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": { "behavior": "allow" | "deny", "updatedInput": {...} }
  }
}
```

### PostToolUse
```json
{
  "tool_name": "...",
  "tool_input": {...},
  "tool_response": "..." | { "type": "text", "text": "..." } | { "type": "error", "...": "..." },
  "tool_use_id": "..."
}
```
**輸出**:不可阻擋。可注入 `additionalContext` 給 Claude 下一輪。

### PostToolUseFailure
```json
{
  "tool_name": "...",
  "tool_input": {...},
  "error_message": "...",
  "error_type": "..."
}
```
**用途**:失敗重試、診斷、回報 telemetry。

### PostToolBatch (2026 Mar)
```json
{
  "batch_id": "...",
  "tools": [
    { "tool_name": "...", "tool_input": {...}, "tool_response": "..." },
    ...
  ]
}
```
**用途**:批次工具呼叫後彙整。

---

## Conversation 級

### UserPromptSubmit
```json
{
  "prompt": "user 剛送出的文字"
}
```
**特殊**:default timeout 30 秒(其他事件 600 秒),會阻塞模型直到 hook 完成。
**輸出**:
- exit 2 + stderr = block(prompt 被清空)
- exit 0 + JSON `additionalContext` = 注入
- exit 0 + 純 stdout = 注入(舊機制)

### Stop
```json
{
  "stop_hook_active": true | false
}
```
**鐵則**:`stop_hook_active=true` 時必須 `exit 0`,否則無限迴圈。
**輸出**:
- `{ "decision": "block", "reason": "..." }` = 強制 Claude 繼續工作
- `{ "decision": null }` = 允許停止

### PreCompact / PostCompact
```json
{
  "compaction_reason": "manual" | "auto_threshold",
  "free_until_compact_pct": 25.5
}
```
**用途**:備份 transcript、重載 god_nodes、清 cache。

### InstructionsLoaded (2026 Apr)
```json
{
  "instruction_files": ["CLAUDE.md", ".claude/rules/foo.md", ...],
  "load_reason": "session_start" | "path_glob_match" | "nested_traversal"
}
```
**特殊**:matcher 對應 `load_reason`。
**輸出**:不可阻擋,純觀測。**這是稽核 always-on rules 真實載入清單的關鍵 hook**。

---

## Subagent 級

### SubagentStart
```json
{
  "subagent_type": "implementer" | "explorer" | ...,
  "parent_session_id": "...",
  "spawn_reason": "delegation" | "explicit_invoke"
}
```
**用途**:為特定 subagent 準備資源(DB 連線、worktree 等)。

### SubagentStop
```json
{
  "subagent_type": "...",
  "subagent_result_summary": "...",
  "stop_hook_active": false
}
```
**特殊**:subagent frontmatter 內的 `Stop` hooks 自動轉成 `SubagentStop`。
**輸出**:可阻擋(強制 subagent 繼續)。**鐵則同 Stop:檢查 stop_hook_active**。

---

## File / Config 級

### FileChanged
```json
{
  "changed_file": "path/to/file",
  "change_type": "create" | "modify" | "delete"
}
```
**特殊**:matcher 可指定檔名 pattern(如 `SKILL.md`、`*.config.json`)。

### CwdChanged
```json
{
  "old_cwd": "...",
  "new_cwd": "..."
}
```
**用途**:配合 direnv 之類工具重載環境變數。

### ConfigChange
```json
{
  "changed_config_file": "settings.json" | ".mcp.json" | ...
}
```
**用途**:settings.json 變更時告警(雖然 hook 配置變更要重啟才生效,但其他配置可即時偵測)。

### WorktreeCreate / WorktreeRemove
```json
{
  "worktree_path": "...",
  "base_branch": "..."   // create only
}
```
**用途**:平行 subagent 用 worktree 隔離時管理生命週期。

---

## 通用提示

1. **drain stdin 即使不用**:Node.js 若不 read stdin,程式可能 hang。骨架的 `for await (const c of process.stdin) raw += c;` 是必要的。
2. **JSON parse 失敗永遠 fail-safe**:`try { JSON.parse(raw) } catch { process.exit(0) }`,絕不阻擋使用者。
3. **欄位都可能不存在**:Claude Code 不同版本欄位略有差異,永遠用 `data.tool_input?.command || ''` 之類的安全存取。