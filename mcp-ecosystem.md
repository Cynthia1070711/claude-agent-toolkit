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

## 5. pcpt-context MCP — 24 Tools 與 4 Layer 對應(2026-05-02 ADR-GOVERNANCE-001 加 search_god_nodes)

| Layer | Tools |
|:----|:----|
| **Search**(11)| search_context / search_tech / search_debt / search_stories / search_documents / search_glossary / search_conversations / search_intentional_decisions / search_symbols / semantic_search / **search_god_nodes**(NEW) |
| **Write**(4)| add_context / add_tech / add_cr_issue / add_intentional_decision |
| **Trace**(3)| trace_context / get_symbol_context / get_session_detail |
| **Analytics**(6)| get_patterns / get_intentional_decision / list_sessions / log_workflow / upsert_benchmark / verify_intentional_annotations |

### 5.1 search_stories CMI-12 修復(2026-05-01)— 精確查詢回傳完整 46 欄位

**修復前**:`search_stories({story_id, include_details: true})` 預設 truncate 為 `_preview`(8 欄位 200-500 chars)+ 完全不回傳 11 欄位(pipeline_notes / risk_assessment / rollback_plan / monitoring_plan / sdd_spec / create_agent / create_started_at / create_completed_at / review_started_at / source_file / affected_files),導致 cold-start agent 看不到 Story 完整內容。

**修復後**(`config-templates/context-db/server.js:2295-2351`):
- **精確查詢**(`story_id` 指定)+ `include_details: true` → ✅ 回傳完整 46 欄位無 truncation
- 列表查詢(空 query / FTS5)+ `include_details: true` → 🟡 保留 `_preview` 行為(防多筆 token 爆炸)
- `fields="..."` 顯式指定 → ✅ 完整(行為不變)

**Cold-start 受益**:dev agent 啟動時 `search_stories` 預設取 pipeline_notes / acceptance_criteria / tasks / dev_notes / implementation_approach / sdd_spec 全完整,無需 fallback `fields=` 顯式指定。對齊 `db-first-no-md-mirror.md` SSoT 精神。

詳細 API 參照 `memory-system-deep-dive.md` §4。

### 5.2 search_god_nodes — God Node Integration Pattern(2026-05-02 ADR-GOVERNANCE-001 + Tianji v1.1.0)

**新增背景**: 既有 11-Layer pre-prompt RAG + `symbol_dependencies` graph + `expandDependencies` 2-hop + 8063 symbols 100% embedding 已 ready,但 BMAD workflow 0 命中調用 graph capability(揭示「Latent Capability Trap」反模式)。本 MCP tool 補完缺口。

**Tool 簽章**:

```javascript
mcp__pcpt-context__search_god_nodes({
  domain: "Payment",        // optional, namespace LIKE filter
  limit: 10,                 // optional, top-N(預設 10,上限 50)
  min_centrality: 50.0,      // optional, P95 threshold
  include_generated: false   // optional, 預設 false 排除 Migrations / ModelSnapshot / Tests
})
```

**回傳結構**:

```json
{
  "total": 5,
  "filter": { "domain": "Payment", "include_generated": false, "excluded_namespaces": ["Migrations", "ModelSnapshot", "Tests"] },
  "god_nodes": [
    { "id": 1234, "symbol_name": "RefundService", "namespace": "<Project>.Web.Services.Payment",
      "file_path": "src/.../RefundService.cs", "start_line": 12, "end_line": 458,
      "centrality_score": 30.60 }
  ],
  "hint": "高 centrality_score = 被多個 symbol 依賴 / 主動引用多個。修改前必先 Read + 評估 BlastRadius。詳細 dependency 用 get_symbol_context(symbol_id, depth=2)展開。"
}
```

**5 步整合 SOP(對齊 capability-integration-mandate.md)**:

```
Step 1 SKILL 同步: pcpt-context-memory v2.8 §3 / §3a god node use case 章節
Step 2 BMAD 整合: 
  - create-story step-03 §3.0(Glob/Grep 之前先 search_god_nodes 取候選)
  - dev-story step-05 §0.5(實作前注入 mental model)
  - code-review step-04 Phase 0.5(BlastRadius 自動補值,替代主觀估算)
Step 3 Pipeline 注入: subagent-context-inject.js Layer 5(SubagentStart Hook 注入 epic god node Top-3)
Step 4 部屬範本: 本章節
Step 5 Schema 公告: migration 2026-05-02-add-symbol-centrality-score.sql + Memory DB add_context category=infrastructure-evolution
```

**演算法**(對齊 graphify analyze.py reasoning + RELATION_WEIGHTS):

```
centrality_score(symbol) = 0.6 * weighted_in_degree + 0.4 * weighted_out_degree
weighted_in_degree  = SUM(RELATION_WEIGHTS[t] for incoming edges)
weighted_out_degree = SUM(RELATION_WEIGHTS[t] for outgoing edges)
RELATION_WEIGHTS = { inherits:1.0, implements:0.9, calls:0.7, uses_inferred:0.4 }
```

**對照 BlastRadius 補值表**(code-review Phase 0.5 用):

| centrality_score | BlastRadius |
|:---:|:---:|
| ≥ P95 (≥ 50.0) | 10(全站) |
| ≥ P75 (≥ 5.0) | 5(模組) |
| ≥ P50 (≥ 0.5) | 2(單檔) |
| < P50 (< 0.5) | 1(單行) |

**離線批計算**: `node .context-db/scripts/compute-centrality.cjs --top 20`(預設寫 DB,`--dry-run` 不寫)

**Real PCPT god nodes**(2026-05-02 baseline,排除 Migrations / Tests):
- AnnouncementService(83.24)/ HelpContentService(82.68)/ AssetService(76.52)/ LegalDocumentService(74.56)/ PdfGeneratorService(70.64)/ AdminAccessService(55.52)
- Payment domain: RefundService(30.60)/ ECPayGatewayService(25.28)/ OrderService(16.88)

**Kill Switch**(對齊 ADR-GOVERNANCE-001 §8.4):
- Layer 10 加權 δ=0.05,若 retrieval_observations 命中率退化 ≥ 5% → 設 DELTA=0 回退
- Migration rollback: `sqlite3 context-memory.db < .context-db/migrations/2026-05-02-add-symbol-centrality-score-down.sql`

### 5.3 search_intentional_decisions — dev-story Pre-Edit IDD Awareness Gate(2026-05-03 G5 capability-integration §3 Step 2)

**對齊**: `.claude/rules/capability-integration-mandate.md` v1.0.0 §3 Mandatory 5 步 Step 2 BMAD 整合(Latent Capability Trap rescue)。Story: `td-bmad-search-idd-pre-edit-dev-story`(epic-devcons P3/S)。

**MCP Tool**: `mcp__phycool-context__search_intentional_decisions({file_path?, idd_type?, criticality?, status?, limit?})` — file_path LIKE 反查 `related_files`,正確 edit-time IDD constraint check 工具(注意:`verify_intentional_annotations` 是 IDD 健康度 audit,**不是** edit-time 工具)。

**Pattern**:

```
For each file in Story file_list:
  search_intentional_decisions({
    file_path: "{file}",
    status: "active",
    limit: 5
  })

合併命中 → idd_id dedupe → union forbidden_changes
```

**Output 用途**:
- 注入 mental model:「本 Story 修改前必意識的 IDD 約束」
- 主動補強 Hook Layer 6 IDD 注入(被動消費 → 主動 query 雙保險)
- Critical IDD 命中 → advisory HALT(non-blocking)讓 Agent 確認不違反 forbidden_changes
- 與 code-review `skill-idd-sync-gate.md` retrospective 後置兜底互補

**Implementation 位置**:
- `_bmad/bmm/workflows/4-implementation/dev-story/steps/step-05-implement-task.md` §0.6(在 §0.5 God Node 之後 + §1 Review Current Task 之前)
- 原 create-story step-06 §8.5 IDD Warning 為 pattern source(首發應用)
- dev-story §0.5 God Node Pre-Check 為 template source(結構對齊)

**Token Budget**:
- file_list 5-15 files × ~500-1500 tokens / query
- idd_id dedupe → 通常 0-3 unique critical IDDs
- Total 增量 ~3K-15K tokens(與 §0.5 god_node 5-call ~5K 同量級)

**Fallback**:
- 0 hit(file_list 不涉 active IDD related_files)→ silent skip(對齊 step-06 §8.5)
- search_intentional_decisions 連線失敗 → log warning + continue(non-fatal)
- Critical IDD HIT → advisory HALT non-blocking,Agent 自我確認後繼續

**Skill 升版**: `phycool-intentional-decisions` v1.3.0 → v1.4.0(2026-05-03 G5 Story 升版,§9.2 重寫 + §16.5 Troubleshooting 新增)

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
