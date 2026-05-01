# MCP 生態整合指南 (MCP Ecosystem)

> **版本**: 1.0.0
> **建立日期**: 2026-05-01
> **資料快照日**: 2026-05-01
> **驗證指令**: `claude mcp list` + Read `.mcp.json`

---

## 1. MCP 體系定位

**MCP**(Model Context Protocol)是 Anthropic 制定的 AI Agent 與外部資源溝通標準。Claude Code 透過 MCP 連接:
- **Knowledge sources**(自家 Context Memory DB / 第三方 KB)
- **Browser automation**(Chrome DevTools / Playwright)
- **Cloud services**(Google Drive / Gmail / Calendar)
- **Specialty tools**(各種專家工具)

PCPT 專案 MCP 配置位於兩層:
- **專案層**:`.mcp.json`(根目錄,版控)
- **全域層**:`~/.claude/mcp-needs-auth-cache.json`(OAuth 待認證快取)

---

## 2. PCPT 專案 MCP 配置(`.mcp.json`)

```json
{
  "mcpServers": {
    "pcpt-context": {
      "type": "stdio",
      "command": "node",
      "args": [".context-db/server.js"]
    },
    "chrome-devtools": {
      "type": "stdio",
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "chrome-devtools-mcp@latest",
        "--wsEndpoint",
        "ws://127.0.0.1:9222/devtools/browser/{{BROWSER_ID}}"
      ]
    }
  }
}
```

| Server | 類型 | 用途 |
|:----|:----|:----|
| **pcpt-context** | stdio | Context Memory DB 23 MCP tools(專案核心)|
| **chrome-devtools** | stdio | 真實 Chrome 連線(port 9222 + WebSocket endpoint)|

---

## 3. 完整 MCP Server 全景(包含全域 + IDE 內建)

### 3.1 PCPT 專案層 MCP(2)

| Server | 啟動方式 | 用途 |
|:----|:----|:----|
| `pcpt-context` | stdio + Node.js | Context Memory DB(見 `memory-system-deep-dive.md`)|
| `chrome-devtools` | stdio + npx | 真實 Chrome 連線(port 9222)|

### 3.2 IDE / Plugin 內建 MCP(會於對話 surface 但非 .mcp.json)

| Server / Tool | 來源 | 用途 |
|:----|:----|:----|
| `claude-in-chrome` | IDE plugin | 沙盒 Chrome 自動化(獨立於 chrome-devtools)|
| `chrome-devtools-mcp` | npx 即時下載 | 與 `chrome-devtools` 對應的工具表面 |

### 3.3 全域 OAuth 待認證 MCP(`~/.claude/mcp-needs-auth-cache.json`)

| Server | 狀態 |
|:----|:----|
| **claude.ai Google Drive** | Pending OAuth |
| **claude.ai Google Calendar** | Pending OAuth |
| **claude.ai Gmail** | Pending OAuth |

> 三個 Google MCP 已在帳號層註冊但未完成 OAuth 流程。需 user 互動授權才能使用。

---

## 4. Chrome MCP — 雙工具辨識矩陣(關鍵)

PCPT 對 Chrome 的自動化有兩套工具,**不可混用**:

| 維度 | `chrome-devtools`(.mcp.json)| `claude-in-chrome`(IDE plugin)|
|:----|:----|:----|
| **連線目標** | 真實 Chrome(port 9222)| 沙盒 Chrome(隔離)|
| **可見 user 擴展** | ✅(Immersive Translate / 1Password / LastPass)| ❌(零擴展)|
| **可見 user cookies** | ✅(已登入 session)| ❌(空白 session)|
| **適用場景** | Live state 偵測 / 重現 user 真實 bug | 自動化測試 / 沙盒實驗 |
| **連線指令** | port 9222 必先啟動 Chrome | 自動 spawn |

**關鍵 SOP**:`/pcpt-chrome-mcp-connect`(v1.0.0)— 第一次連線必走「list_pages → 雙分頁辨識 → select_page → take_snapshot → new_page」5 步。

**事故記錄**:2026-04-27 R3 Bootstrap 5 multi-modal stacking 沙盒 0 NULL / 真實 Chrome 100% 重現 → 證實 third-party extension(Immersive Translate)介入。**未來 live verify 必檢 extension state**(`htmlDatasetKeys: Object.keys(document.documentElement.dataset)`)。

---

## 5. pcpt-context MCP — 23 Tools 與 4 Layer 對應

| Layer | Tools |
|:----|:----|
| **Search**(10)| search_context / search_tech / search_debt / search_stories / search_documents / search_glossary / search_conversations / search_intentional_decisions / search_symbols / semantic_search |
| **Write**(4)| add_context / add_tech / add_cr_issue / add_intentional_decision |
| **Trace**(3)| trace_context / get_symbol_context / get_session_detail |
| **Analytics**(6)| get_patterns / get_intentional_decision / list_sessions / log_workflow / upsert_benchmark / verify_intentional_annotations |

詳細 API 參照 `memory-system-deep-dive.md` §4。

---

## 6. MCP 內部 RAG 優先 6 步(External Source Citation Mandate)

依 `.claude/rules/constitutional-standard.md` §External Source Citation Mandate v2,引用內部資訊**必先**走 6 步順序:

```
Q: 需引用 PCPT 內部相關資訊
  ↓
1. mcp__pcpt-context__search_documents
   → 命中 → 引用 record ID,STOP
   ↓ 未命中
2. mcp__pcpt-context__search_context
   → 命中 → 引用,STOP
   ↓ 未命中
3. mcp__pcpt-context__search_intentional_decisions
   → 命中 → 引用,STOP
   ↓ 未命中
4. mcp__pcpt-context__search_tech
   ↓
5. mcp__pcpt-context__search_debt
   ↓
6. mcp__pcpt-context__search_glossary
   ↓ 6 步全查不到
7. WebFetch(URL) + 必走 §CITE 記錄 source + fetched_at
   + 建議 add_context(category=reference)入 RAG 池
```

**禁止**:跳過內部 RAG 直接 WebFetch。

---

## 7. MCP Health Check(自動化)

`.claude/hooks/mcp-health-check.js` 在以下時機觸發:
- **PreToolUse** matcher `mcp__pcpt-context` — 工具呼叫前驗證 `.context-db/context-memory.db` 可達
- **PostToolUseFailure** matcher `mcp__pcpt-context` — 工具失敗後重連嘗試

**Timeout**:3s
**Fallback**:DB 不可達 → stderr WARN + 工具呼叫繼續(不 BLOCK,讓 Agent 自行降級)

---

## 8. MCP Server 開發規範(若新增 server)

### 8.1 stdio 標準骨架

```javascript
// .context-db/server.js(範例骨架)
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'pcpt-context',
  version: '2.7.0',
}, {
  capabilities: { tools: {} }
});

server.setRequestHandler('tools/list', async () => ({
  tools: [
    { name: 'search_context', description: '...', inputSchema: {...} },
    // ... 23 tools
  ]
}));

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;
  switch (name) {
    case 'search_context': return await handleSearchContext(args);
    // ...
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### 8.2 三引擎 MCP 配置差異

| 引擎 | MCP 配置位置 | HTTP 傳輸欄位 |
|:----|:----|:----|
| Claude Code | `.mcp.json`(專案)/ `~/.claude/.mcp.json`(全域)| `url` |
| Gemini CLI | `.gemini/settings.json` 內 `mcpServers` | `url` 或 `httpUrl` |
| Antigravity IDE | `.agent/settings.json` 內 `mcpServers` | `serverUrl` |

> stdio 傳輸三者相同,HTTP 傳輸欄位名不同 — 跨引擎共用 MCP server 時需注意。

---

## 9. MCP Token 影響

| Server | Always-On | On-demand | 預估每次呼叫 token |
|:----|:----:|:----:|:----:|
| pcpt-context(stdio)| 無常駐 | ✅ 每次 tool call | search ~500-2000 / write ~100-500 |
| chrome-devtools(stdio)| 無常駐 | ✅ 每次 tool call | take_snapshot ~3000-5000 / list_pages ~200 |
| Google Drive / Gmail / Calendar | (待認證,未啟用)| — | — |

`MCP_TIMEOUT=40000` / `MAX_MCP_OUTPUT_TOKENS=50000`(於 settings.json env 設定)— 防 MCP 卡死或單次輸出過大。

---

## 10. 自助驗證指令

```powershell
# 列出 PCPT 專案層 MCP server
Get-Content .mcp.json | ConvertFrom-Json | Select-Object -ExpandProperty mcpServers

# 列出全域待認證 MCP
$f = "$HOME\.claude\mcp-needs-auth-cache.json"
if (Test-Path $f) { Get-Content $f | ConvertFrom-Json }

# 驗證 pcpt-context server.js 存在
Test-Path .context-db\server.js   # 應 True

# 驗證 chrome-devtools 9222 port(若 Chrome 已 remote-debugging 啟動)
Test-NetConnection -ComputerName 127.0.0.1 -Port 9222

# Claude Code 內建 MCP 列表(於 CLI 內執行)
# claude mcp list
```

---

## 11. Related Reading

- `memory-system-deep-dive.md` §4 — pcpt-context 23 tools API
- `hooks-events-deep-dive.md` §5.x — mcp-health-check.js Hook
- `rules-deep-dive.md` §3.5 — External Source Citation Mandate(內部 RAG 優先 6 步)
- `.claude/skills/pcpt-chrome-mcp-connect/SKILL.md` — 雙 Chrome 工具辨識 SOP
- `.claude/skills/pcpt-chrome-mcp-login-sop/SKILL.md` — Member + Admin 雙 track 登入測試

---

## 12. 版本歷史

| 版本 | 日期 | 變更 |
|:----|:----|:----|
| 1.0.0 | 2026-05-01 | 初版建立。專案層 2 MCP + 全域 3 OAuth + IDE plugin + Chrome MCP 雙工具辨識 + 內部 RAG 優先 6 步 + 三引擎 HTTP 傳輸欄位差異 |
