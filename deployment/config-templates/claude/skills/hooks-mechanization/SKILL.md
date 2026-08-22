---
name: hooks-mechanization
version: 1.2.0
updated: 2026-07-19
description: |
  Use when designing, building, or converting a Claude Code rule into a Hook, configuring
  settings.json hooks, debugging hook failures, picking async vs sync, choosing between
  command / http / prompt / agent handler types, or wiring hooks into Windows 11 + Node.js +
  PowerShell 5.1 environment. Provides 2026-Apr hooks API reference, copy-paste templates for
  21 lifecycle events, anti-patterns, and 7-step rule-to-hook conversion playbook. Trigger
  keywords: see references/triggers.md.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Claude Code Hooks 機械化建置(2026 Apr 規範)

這個 skill 教 Claude 把「依賴自律的規則」改寫為「Hook 強制執行」的程式。涵蓋 2026 年最新規範(21 個生命週期事件、4 種 handler 型別、async 執行、JSON 結構化輸出),並提供 Windows 11 + Node.js + PowerShell 5.1 環境的可直接複製範本。

---

## 何時使用這個 skill

當下列任一條件成立時,主動使用:

1. 使用者要把某條 `.claude/rules/*.md` 規則機械化(常見句:「做成 hook」「機械化」「轉成 hook」)
2. 使用者問 hook 觸發/不觸發/失敗的原因
3. 使用者要新增 / 修改 `settings.json` 的 `hooks` 區塊
4. 使用者問特定事件名稱(PreToolUse / PostToolUse / Stop / SubagentStart 等)
5. 使用者要把 hook 改為 async / 整併重複 hook / 改 timeout
6. 使用者問 exit code 2 / `additionalContext` / `decision: block` 的語義

當使用者只是泛泛討論 Claude Code 而沒有具體要寫/改 hook 時,不要主動使用這個 skill。

---

## 核心心智模型(必讀)

Hook 的本質是「Claude Code 在某個生命週期事件發生時呼叫的 shell 命令」。Hook 透過 **stdin 接 JSON 輸入**、**stdout/stderr 輸出 + exit code** 影響 Claude 的下一步。Hook 提供 LLM 提示無法保證的「**確定性**」——規則不是請求,而是保證。

**三層輸出機制**(嚴格擇一,不可混用):

| 輸出方式 | 適用場景 | 範例 |
|---|---|---|
| `exit 0` + 純文字 stdout | SessionStart / UserPromptSubmit 注入 context(文字直接接入 Claude context) | `echo "Branch: main"; exit 0` |
| `exit 0` + JSON stdout | 結構化控制(permissionDecision、additionalContext、updatedInput) | 見「JSON 輸出」段 |
| `exit 2` + stderr | 阻擋(PreToolUse / Stop) — stderr 顯示給 Claude,JSON 會被忽略 | `echo "blocked" >&2; exit 2` |

**鐵則**:
- `exit 2` 時 JSON 輸出**會被忽略**,只看 stderr 訊息
- 其他非 0 exit code 是「非阻擋錯誤」,只在 `--verbose` 模式顯示
- stdout 必須**只有** JSON 物件,shell profile 印任何字會破壞 parsing

---

## 21 個生命週期事件(2026 Mar 規範)

依執行階段分類。「✅ 可阻擋」表示 exit 2 會阻止對應動作:

### Session 級
| 事件 | 可阻擋 | 典型用途 |
|---|---|---|
| `Setup` (`--init` / `--maintenance`) | ❌ | 專案初始化、定期維護 |
| `SessionStart` (`startup\|resume\|clear\|compact` matcher) | ❌ | 注入專案 context、設環境變數 |
| `SessionEnd` | ❌ | 寫 audit log、彙整指標 |
| `Notification` (`permission_prompt\|idle_prompt\|auth_success`) | ❌ | 桌面通知、Slack 通知 |

### Tool 級
| 事件 | 可阻擋 | 典型用途 |
|---|---|---|
| `PreToolUse` | ✅ | 安全閘、輸入改寫、輸入驗證 |
| `PermissionRequest` | ❌(但可 allow/deny) | 自動授權 |
| `PostToolUse` | ❌ | 格式化、log、注入後續 context |
| `PostToolUseFailure` | ❌ | 失敗重試、診斷 |
| `PostToolBatch` | ❌ | 批次後彙整 |

### Conversation 級
| 事件 | 可阻擋 | 典型用途 |
|---|---|---|
| `UserPromptSubmit` | ✅(可清空 prompt) | 注入 RAG context、危險指令攔截 |
| `Stop` | ✅(強制繼續) | 驗證任務真完成、強制跑測試 |
| `PreCompact` / `PostCompact` | ❌ | 備份 transcript、重載 god_nodes |
| `InstructionsLoaded` (2026 Apr) | ❌ | 觀測 rules / CLAUDE.md 真實載入 |

### Subagent 級
| 事件 | 可阻擋 | 典型用途 |
|---|---|---|
| `SubagentStart` | ❌ | 為特定 subagent 準備環境 |
| `SubagentStop` | ✅(強制繼續) | 驗證 subagent 真完成 |

### File / Config 級
| 事件 | 可阻擋 | 典型用途 |
|---|---|---|
| `FileChanged` (matcher = 檔名 pattern) | ❌ | SKILL.md 變更時重整 skill index |
| `CwdChanged` | ❌ | 換目錄時重載 direnv |
| `ConfigChange` | ❌ | settings.json 變更告警 |
| `WorktreeCreate` / `WorktreeRemove` | ❌ | git worktree 隔離環境管理 |

---

## 4 種 handler 型別

```json
// 1. command — 跑 shell 命令(最常用)
{ "type": "command", "command": "node hook.js", "timeout": 30000, "async": true }

// 2. http — POST 到 URL,回傳 JSON 同 command(2026 Feb 新增)
{ "type": "http", "url": "http://localhost:8080/hook", "timeout": 30000,
  "headers": { "Authorization": "Bearer $TOKEN" }, "allowedEnvVars": ["TOKEN"] }

// 3. prompt — 用 LLM 做語意判斷(適合 Stop / SubagentStop 驗證)
{ "type": "prompt", "prompt": "Did Claude actually run tests? Return {\"ok\": bool}",
  "timeout": 30 }

// 4. agent — spawn subagent 做深度檢查(可用 Read/Grep/Glob)
{ "type": "agent", "prompt": "Verify all test files have implementation files",
  "timeout": 60 }
```

**選擇準則**:
- 確定性檢查(grep、正則、檔案存在) → `command`
- 需要 LLM 判斷(「程式碼品質好嗎」) → `prompt`
- 需要 LLM + 工具(讀多個檔案後決定) → `agent`
- 跨團隊共用策略 → `http`(中央服務)

詳細範例見 `references/handler-types.md`。

---

## 標準 stdin 輸入結構

所有 hook 透過 stdin 收到 JSON。共通欄位:

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../session.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse"
}
```

依事件不同會多出特定欄位,例如 PreToolUse:

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "git push origin main" }
}
```

PostToolUse 會多 `tool_response`,UserPromptSubmit 會多 `prompt`,Stop 會多 `stop_hook_active` 防無限迴圈。

詳細各事件 schema 見 `references/event-schemas.md`。

---

## 標準 JSON 輸出格式

新規範**強烈建議**用 `hookSpecificOutput`(而非 deprecated 的扁平 `decision`):

```json
{
  "continue": true,
  "suppressOutput": false,
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Safe read",
    "updatedInput": { "command": "modified-command" },
    "additionalContext": "Extra context for Claude"
  }
}
```

| 欄位 | 用途 |
|---|---|
| `continue: false` | 全停,優先於 `decision` |
| `permissionDecision` | "allow" / "deny" / "ask" — 對應 exit 0 / 2 / 詢問使用者 |
| `updatedInput` | 改寫 tool_input(只 PreToolUse 有效) |
| `additionalContext` | 注入 Claude context(會被包成 `<system-reminder>`) |

**重要限制**:
- `additionalContext` 寫成「**陳述句**」(`The deployment target is prod`),不要寫成「**命令句**」(`Always deploy to prod`)。命令句會觸發 prompt-injection 防禦,被 surface 給使用者
- `additionalContext` 上限 10,000 字元,超過會自動存檔並改傳檔案路徑

---

## 7 步驟把 Rule 轉成 Hook 的 playbook

當使用者要機械化某條規則時,按此順序執行:

### 1. 釐清「規則的可觀測訊號」

問:這條規則違規時,**有什麼具體可被程式偵測的事**發生?

- ✅ 可機械化:「.ps1 檔案缺 UTF-8 BOM」(偵測 byte 0..2)
- ✅ 可機械化:「git push 只推一個 remote」(parse command + `git remote`)
- ❌ 不可機械化:「Claude 應該誠實」(無可觀測訊號 → 留在 prompt)

無法答出具體訊號時,告訴使用者「這條規則不適合機械化,建議精簡 prompt 文字而非寫 hook」。

### 2. 選擇生命週期事件

依「規則在哪個時間點該被檢查」對應事件:

| 規則描述 | 對應事件 |
|---|---|
| 「執行某 Bash 命令前該檢查」 | `PreToolUse` matcher `Bash` |
| 「寫入某類檔案後該做事」 | `PostToolUse` matcher `Edit\|Write` |
| 「使用者送出 prompt 前」 | `UserPromptSubmit` |
| 「任務聲稱完成時驗證」 | `Stop` |
| 「子代理 spawn / 結束」 | `SubagentStart` / `SubagentStop` |

### 3. 選擇 handler 型別與是否 async

依「是否阻擋使用者工作流」決定:

- 阻擋型 → `command` 同步(無 async)
- 通知 / log / 背景同步型 → `command` 加 `"async": true`
- 需要 LLM 判斷 → `prompt`

### 4. 寫腳本骨架(Node.js for Windows 環境)

複製 `scripts/hook-skeleton.js` 為起點,改三個地方:

- stdin parse 後取出所需欄位
- 判斷邏輯
- 三選一輸出方式(exit 0 / exit 0 + JSON / exit 2 + stderr)

完整骨架在 `scripts/hook-skeleton.js`。

### 5. 註冊到 settings.json

照 `references/settings-template.json` 的格式加入。Windows 環境**必須**用絕對 `cd` 路徑,因為 Claude Code 可能從不同目錄啟動:

```json
{
  "type": "command",
  "command": "cd \"C:/path/to/project\" && node .claude/hooks/my-hook.js",
  "timeout": 5000
}
```

### 6. 測試與除錯

按順序執行(切勿跳過):

1. `bash -n` 檢查語法 → `node -c hook.js`(若是 Node)
2. 用假 JSON 灌 stdin 跑一次:
   ```bash
   echo '{"tool_input":{"command":"git push"},"hook_event_name":"PreToolUse"}' | node hook.js
   echo $?  # 應為 0 或 2
   ```
3. 在 Claude Code 中執行 `/hooks` 確認 hook 出現在列表
4. 跑真實觸發場景,用 `Ctrl+O` 切到 verbose mode 看 stderr

除錯清單:見 `references/debugging.md`。

### 7. 退役對應 Rule

機械化完成後:
1. 確認 hook 在生產環境穩定 ≥3 天
2. 從 `.claude/rules/<rule>.md` 刪除已被 hook 取代的段落
3. 若整條 rule 都被取代,直接刪除整個檔案
4. 在 `MEMORY.md` 加一行 retention note:`<rule> 已於 YYYY-MM-DD 由 <hook>.js 取代`

---

## 快速範本(複製即用)

以下範本可直接複製到 `.claude/hooks/` 並在 `settings.json` 中註冊。

### Template A — PreToolUse 阻擋型(攔截危險命令)

見 `scripts/template-a-pre-tool-block.js`

### Template B — PostToolUse 警告型(注入 context)

見 `scripts/template-b-post-tool-warn.js`

### Template C — SessionStart context 注入

見 `scripts/template-c-session-start-inject.js`

### Template D — Stop 驗證型(prompt handler)

見 `scripts/template-d-stop-verify.json`

### Template E — Async log(不阻擋)

見 `scripts/template-e-async-log.js`

---

## 常見錯誤與反模式(必避)

1. **shell profile 印歡迎訊息** → 破壞 JSON parsing。Hook 腳本內若呼叫 bash,務必用 `bash --noprofile --norc`。
2. **`echo '{"decision":"allow"}'` 但忘記 `exit 0`** → 有些 shell 預設 exit code 不是 0,造成被當作錯誤。永遠**顯式** `exit 0`。
3. **PreToolUse 與 PostToolUse 兩個 matcher 都寫 `Edit|Write`** → 兩個 hook 都會跑,容易誤判。確認你要的是「執行前」還是「執行後」。
4. **Stop hook 永遠 `exit 2`** → 造成無限迴圈。**永遠檢查 `stop_hook_active`**:
   ```javascript
   if (data.stop_hook_active) process.exit(0); // 已經阻擋過一次,放行
   ```
5. **timeout 設太短** → Windows 上 `cd` + Node.js cold start 至少 500ms,timeout < 2000ms 容易誤殺。
6. **`additionalContext` 寫命令句** → 觸發 prompt-injection 防禦,被 surface 給使用者。寫成陳述句。
7. **在 hook 內 `console.log` 除錯訊息** → 污染 JSON 輸出,造成 parse 失敗。除錯訊息**只能** `console.error`(stderr)。
8. **path 使用反斜線而沒 escape** → Windows 路徑 `${USER_HOME}\...` 在 JSON 中必須 escape 為 `${USER_HOME}\\...` 或改用正斜線 `${USER_HOME}/...`。
9. **編輯 settings.json 後沒重啟 Claude Code** → Hooks 在 session 啟動時 snapshot,**配置變更不會熱套用**。必須 `/clear` 或重啟 CLI。
10. **`http` hook 在公司網路防火牆環境** → 注意 `allowedEnvVars`,token 必須白名單列出才能傳給 hook script。

更多反模式與真實事故案例見 `references/anti-patterns.md`。

---

## PhyCool 專用注意事項

針對 Windows 11 + PowerShell 5.1 + Antigravity IDE 環境:

1. **編碼**:寫 `.ps1` hook 時用 `[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)` 保證 BOM。`Out-File` 在 PS 5.1 預設無 BOM,會被 encoding-bom-guard 攔截。
2. **路徑**:`settings.json` 內 hooks 命令一律用 `cd "C:/path"` 正斜線格式,避免 backslash escape 陷阱。專案路徑含括號(`PhyCool-PCPT-MVP(Antigravity)`)時務必加雙引號。
3. **better-sqlite3 守門**:已有 `pre-tool-bash-better-sqlite3-guard.js`,如果你要寫存取 SQLite 的 hook,改用 `node -e` 內聯而非 require,避免被守門攔。
4. **環境變數**:Claude Code 內建 `CLAUDE_PROJECT_DIR` 變數可直接用,不必硬寫絕對路徑(2026 Apr 起穩定可用):
   ```json
   { "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/my-hook.js\"" }
   ```
5. **MAX_THINKING_TOKENS 已 deprecated**:Opus 4.7 改用 adaptive thinking + effort 級別,settings.json 中該變數應改為 `/effort xhigh`。

---

## 進階主題

需要更深入的場景,跳到對應 reference 檔案:

- 設計 prompt-type hook 與 agent-type hook → `references/llm-hooks.md`
- 多個 hook 同時跑且需要 merge 輸出 → `references/multi-hook-merge.md`
- HTTP hook + 公司中央策略服務 → `references/http-hooks.md`
- Subagent frontmatter 內定義 hook → `references/subagent-hooks.md`
- 把 hook 包進 plugin 散布 → `references/plugin-hooks.md`

---

## 範本檔索引(scripts/ 與 references/)

`scripts/` 內為可直接複製的腳本範本:
- `hook-skeleton.js` — 通用 Node.js 骨架
- `template-a-pre-tool-block.js` — 攔截危險命令
- `template-b-post-tool-warn.js` — 注入警告 context
- `template-c-session-start-inject.js` — SessionStart 注入專案狀態
- `template-d-stop-verify.json` — Stop 驗證 prompt-type hook 設定
- `template-e-async-log.js` — Async 背景日誌

`references/` 內為深度參考:
- `event-schemas.md` — 21 個事件的 stdin 完整 schema
- `handler-types.md` — 4 種 handler 詳解
- `anti-patterns.md` — 真實事故案例與避坑指南
- `debugging.md` — 除錯流程與工具
- `phycool-rule-mapping.md` — PhyCool 既有 31 條 rule 中可機械化的清單
- `complete-guide.md` — hooks官方詳解及範例

---

## 與 PhyCool Phase 2 的對應

如果使用者問「PhyCool 現有 rules 哪些該轉 hook」,直接讀 `references/phycool-rule-mapping.md`(已列出 10 條具體轉換)。

不要憑印象回答 — 那份檔案是這個 skill 的 single source of truth。

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.2.0** | **2026-07-19** | `assets/settings-template.json` 之 `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` 由 **60 → 95**,註解理由由「compact proactively before lost-in-the-middle」改為「**scale to the model's context window**」:1M 模型用 95(= CLI native default),小 window 模型才調低。觸發:2026-07-19 使用者裁定專案值 60 → 95(主力模型皆 1M · commit `eb6a9c58`),cross-ref 掃描發現本範本與新值牴觸。姊妹同步:`cc-config-author` v1.2.0(活躍 hook 提示 + 其範本)。走 `Skill(skill="skill-builder")` Mode B。 |
| 1.1.0 | 2026-05-16 | (既有,無沿革表時之推定版本) |
