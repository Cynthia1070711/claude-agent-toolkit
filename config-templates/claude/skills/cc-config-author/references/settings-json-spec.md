# settings.json 規範(2026 Apr)

`.claude/settings.json` 是 Claude Code 的「武器庫」級檔案,控制 hooks、permissions、env、MCP。誤改影響全 session。

---

## 載入優先順序

從最高到最低:

1. Managed settings(企業層,由 admin 部署)
2. CLI flags(`--permission-mode`、`--settings`,單次 session)
3. User-level `~/.claude/settings.json`
4. Project-level `.claude/settings.json`(版控)
5. Project local `.claude/settings.local.json`(gitignore)

下層**會合併**到上層(不是覆蓋),但發生衝突時上層優先。

---

## 主要區塊

```json
{
  "permissions": { ... },     // 工具授權
  "hooks": { ... },           // 生命週期 hook
  "env": { ... },             // 環境變數
  "mcpServers": { ... },      // MCP server 配置(或放 .mcp.json)
  "modelOverrides": { ... },  // 模型 ID override
  "disableAllHooks": false,   // 緊急逃生
  "allowManagedHooksOnly": false  // 企業安全
}
```

---

## permissions 區塊

控制 Claude 預設可用工具與檔案路徑。

```json
"permissions": {
  "allow": [
    "Edit(.claude/**)",
    "Write(.claude/**)",
    "Read(src/**)",
    "Bash(node:*)",
    "Bash(npm:*)",
    "Bash(git:*)"
  ],
  "deny": [
    "Read(.env)",
    "Read(**/secrets*)",
    "Bash(rm:*)"
  ],
  "ask": [
    "Bash(dotnet publish:*)"
  ]
}
```

**語法**:
- `Read(<path>)` — 限制 Read 工具的路徑
- `Write(<path>)` — 限制 Write 工具的路徑
- `Edit(<path>)` — 限制 Edit 工具的路徑
- `Bash(<cmd>:*)` — 限制 Bash 子命令
- `mcp__<server>__<tool>` — 限制 MCP 工具

**通配符**:`**` 任何深度,`*` 單層。

**優先順序**:`deny` > `ask` > `allow`(deny 永遠勝出)。

---

## hooks 區塊

掛 21 個生命週期事件。完整 spec 見 `hooks-mechanization` skill。

簡化結構:

```json
"hooks": {
  "<EventName>": [
    {
      "matcher": "<matcher>",   // 選填,過濾觸發條件
      "hooks": [
        {
          "type": "command",      // command / http / prompt / agent
          "command": "node hook.js",
          "timeout": 5000,
          "async": false
        }
      ]
    }
  ]
}
```

**事件列表**:詳見 `hooks-mechanization` skill 的 `references/event-schemas.md`。

⚠️ **修改 hooks 區塊後,settings 不會熱套用**。必須 `/clear` 或重啟 CLI。

---

## env 區塊

設定 Claude Code 行為環境變數。

### 重要環境變數(2026 Apr)

| 變數 | 用途 | 建議值 |
|---|---|---|
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | 主動 compact 的 % | `"60"` |
| `BASH_DEFAULT_TIMEOUT_MS` | Bash 工具預設 timeout | `"120000"` |
| `MCP_TIMEOUT` | MCP 工具 timeout | `"40000"` |
| `MAX_MCP_OUTPUT_TOKENS` | MCP 回應 token 上限 | `"50000"` |
| `CLAUDE_CODE_USE_POWERSHELL_TOOL` | Windows 環境用 PS | `"1"` |
| `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR` | 維持 cwd | `"1"` |
| `CLAUDE_CODE_SUBAGENT_MODEL` | Subagent 預設模型 | `"claude-sonnet-4-6"` |

### 已 deprecated(Opus 4.7 不再用)

| 變數 | 狀態 | 替代 |
|---|---|---|
| `MAX_THINKING_TOKENS` | ❌ Opus 4.7 移除 | 用 `/effort` 級別 |
| `CLAUDE_CODE_NO_FLICKER` | ⚠️ 被 `CLAUDE_CODE_TUI_DEFAULT` 取代 | 同左 |

### Windows 特有

```json
"env": {
  "CLAUDE_CODE_USE_POWERSHELL_TOOL": "1",
  "CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR": "1"
}
```

---

## mcpServers 區塊

MCP server 配置可放此處,或拆到 `.mcp.json`(推薦)。

```json
"mcpServers": {
  "phycool-context": {
    "command": "node",
    "args": [".context-db/mcp-server.js"],
    "env": {
      "DB_PATH": ".context-db/context.db"
    }
  }
}
```

**OAuth(v2.1.111+)**:支援 RFC 9728 protected-resource metadata discovery,合規 server 不需手動配 `apiKeyHelper`。

---

## modelOverrides

Override 預設模型 alias(主要給 Bedrock / Vertex / Foundry 用戶):

```json
"modelOverrides": {
  "claude-opus-4-7": "arn:aws:bedrock:us-east-1:.../my-opus"
}
```

一般使用者**不需要**。

---

## 環境變數別名(也可作為 env 替代)

部分 env 可改用環境變數設(系統層生效):

```powershell
# Windows
[Environment]::SetEnvironmentVariable("CLAUDE_AUTOCOMPACT_PCT_OVERRIDE", "60", "User")

# Linux/Mac
export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=60
```

**何時用 settings.json**:專案專屬設定(team-shared)
**何時用 OS env**:個人偏好(cross-project)

---

## 緊急開關

### disableAllHooks

```json
"disableAllHooks": true
```

一次關所有 hooks。**緊急逃生用**(hook bug 卡住整個 session)。

### allowManagedHooksOnly

```json
"allowManagedHooksOnly": true
```

只跑 admin 部署的 hooks。**企業安全環境**。

---

## settings.local.json(個人覆蓋)

`.gitignore` 內標記,不入版控。用於:

- 個人 hook override(`disableAllHooks: true` 暫時關)
- 開發機特定 env(`CLAUDE_DEV_MODE: true`)
- 測試用 MCP server 配置

範例:

```json
{
  "disableAllHooks": false,
  "env": {
    "CLAUDE_DEBUG": "1"
  }
}
```

---

## JSON 撰寫陷阱

### Windows 路徑

```json
// ❌ 反斜線 escape 錯誤
"command": "${USER_HOME}\hook.js"

// ✅ 用正斜線
"command": "${USER_HOME}/hook.js"

// ✅ 或 escape
"command": "${USER_HOME}\\hook.js"

// ✅ 最佳:用環境變數
"command": "$CLAUDE_PROJECT_DIR/.claude/hooks/x.js"
```

### 註解

JSON 不支援註解。要寫註記用「`_comment_`」假欄位:

```json
{
  "_comment_": "Phase 1 後移除了 MAX_THINKING_TOKENS",
  "env": {
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "60"
  }
}
```

Claude Code 忽略 underscore 開頭欄位。

### Trailing comma

JSON 嚴格不允許:

```json
{
  "env": {
    "FOO": "1",   // ← 最後一個不能有逗號
  }
}
```

→ Parse 失敗。

---

## 驗證

```powershell
# JSON syntax
node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))" && Write-Host "OK"

# hooks 區塊指向的腳本檔案是否存在
node -e "
  const cfg = JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'));
  const fs = require('fs');
  for (const ev of Object.values(cfg.hooks || {})) {
    for (const g of ev) {
      for (const h of g.hooks || []) {
        const m = (h.command || '').match(/node\s+(\S+)/);
        if (m) {
          const p = m[1].replace(/^[\"']|[\"']$/g, '');
          if (!fs.existsSync(p)) console.log('MISSING:', p);
        }
      }
    }
  }
"
```

---

## 健檢清單

修改 settings.json 前:

- [ ] 備份原檔
- [ ] JSON syntax 合法
- [ ] 移除已 deprecated 環境變數
- [ ] 路徑用正斜線或 `$CLAUDE_PROJECT_DIR`
- [ ] hooks 區塊變更後計畫重啟 CLI
- [ ] permissions deny 列表保護 secrets
- [ ] 若新增 hook,timeout 至少 3000ms(Windows + Node cold start)
- [ ] 考慮是否該放 settings.local.json 而非 settings.json

---

## PhyCool 當前 settings.json 已知問題

依摘要:

1. `MAX_THINKING_TOKENS: 15000` ❌ Opus 4.7 已 deprecated → Phase 1 移除
2. `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: 85` ❌ 太晚 → Phase 1 改 60
3. `.gemini/.agent` permissions ❌ Single-Engine Mode 已落地 → Phase 1 砍除
4. Hooks 區塊有 18+ 個 hook,Stop chain 阻塞 26s → Phase 2 async 改造

詳見 `PHASE1-IMMEDIATE-CLEANUP.md` Step 4。