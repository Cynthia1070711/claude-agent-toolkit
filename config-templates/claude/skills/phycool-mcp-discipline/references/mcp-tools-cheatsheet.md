# MCP Tools Cheat-Sheet (phycool-context 36 tools)

> phycool-mcp-discipline §1 catalog 詳細展開。每 tool 含 required / optional / enum / 範例。

**36 = 4 Add + 1 Upsert + 11 Search + 6 Get + 1 Workflow + 1 Verify + 4 Instinct(ECC WIP)+ 4 Worker Protocol + 4 Ctrl-Channel**
(以 `.context-db/server.js` `ListTools` 陣列實查為準,2026-07-28)

---

## Add 4 tools (寫入 — 必驗 schema)

### `mcp__phycool-context__add_context`

| Field | Type | Required | Enum / Notes |
|:------|:-----|:--------:|:------|
| `title` | string | ✅ | ≤ 200 chars |
| `content` | string | ✅ | full markdown body |
| `category` | string | ✅ | `session` / `decision` / `debug` / `pattern` / `reference` / `architecture` |
| `tags` | string[] | ⚪ | comma-separated 也接受 |
| `source_file` | string | ⚪ | file path 或 `context-db://...` |
| `metadata` | object | ⚪ | JSON,額外結構化資料 |

**範例**:
```javascript
mcp__phycool-context__add_context({
    title: "Pattern X — async retry pattern",
    content: "...",
    category: "pattern",
    tags: ["retry", "async"]
})
```

---

### `mcp__phycool-context__add_intentional_decision`

| Field | Type | Required | Enum / Notes |
|:------|:-----|:--------:|:------|
| `idd_id` | string | ✅ | format `IDD-{TYPE}-{NNN}` |
| `idd_type` | string | ✅ | `IDD-COM` / `IDD-STR` / `IDD-REG` / `IDD-USR` |
| `sub_type` | string | ✅ | `communication` / `strategic` / `regulatory` / `user-experience` |
| `story_id` | string | ✅ | linked Story ID |
| `decision` | string | ✅ | 短描述 |
| `rationale` | string | ✅ | 詳細理由 |
| `forbidden_changes` | string[] | ⚪ | 規範性禁止改動列表 |
| `criticality` | string | ⚪ | `critical` / `high` / `medium` / `low` |
| `related_skills` | string[] | ⚪ | 影響的 phycool-* skills |
| `platform_modules` | string[] | ⚪ | M0-M18 模組 |

---

### `mcp__phycool-context__add_cr_issue`

| Field | Type | Required | Enum |
|:------|:-----|:--------:|:------|
| `story_id` | string | ✅ | linked Story |
| `severity` | string | ✅ | `critical` / `high` / `medium` / `low` |
| `category` | string | ✅ | `functionality` / `security` / `performance` / `architecture` / `readability` / `coverage` / `nfr` / `docs` / `skill-sync` |
| `description` | string | ✅ | issue 詳細 |
| `file_line` | string | ⚪ | `src/X.cs:42` 證據 |
| `fix_status` | string | ⚪ | `fixed` / `deferred` / `accepted` / `wont_fix` |

---

### `mcp__phycool-context__add_tech`

| Field | Type | Required | Enum |
|:------|:-----|:--------:|:------|
| `title` | string | ✅ | tech entry title |
| `problem` | string | ✅ | 問題描述 |
| `solution` | string | ✅ | 解法 |
| `category` | string | ✅ | `bugfix` / `architecture` / `performance` / `pattern` / `migration` |
| `file_list` | string[] | ⚪ | 相關 file paths |
| `outcome` | string | ⚪ | `success` / `failure` / `partial` |

---

## Upsert 1 tool

### `mcp__phycool-context__upsert_benchmark`

| Field | Type | Required |
|:------|:-----|:--------:|
| `name` | string | ✅ |
| `value` | number | ✅ |
| `unit` | string | ✅ |
| `category` | string | ⚪ |

---

## Search 11 tools (read-only)

| Tool | Primary Filter | Returns |
|:-----|:---------------|:--------|
| `search_context` | query / category / tags | context_entries[] |
| `search_tech` | query / category | tech_entries[] |
| `search_debt` | story_id / target_story / status | tech_debt_items[] |
| `search_documents` | query / type | document chunks (FTS5) |
| `search_glossary` | term | glossary entries |
| `search_god_nodes` | query / centrality | code symbols (centrality > N) |
| `search_intentional_decisions` | story_id / idd_type | IDDs with forbidden_changes |
| `search_stories` | story_id / epic / status / domain / complexity | stories with details |
| `search_symbols` | name / language | code symbols |
| `search_conversations` | query | session conversations |
| `semantic_search` | query (vector) | top-k similar entries (ONNX cosine) |

**common params**: `limit` (default 10) / `include_details` (bool) / `include_content` (bool, search_context)

---

## Get 6 tools (point lookup)

| Tool | Primary Key |
|:-----|:------------|
| `get_intentional_decision` | idd_id |
| `get_patterns` | (no key, returns all pattern_observations) |
| `get_session_detail` | session_id |
| `get_symbol_context` | symbol_name |
| `list_sessions` | (no key, returns recent sessions) |
| `trace_context` | story_id (returns full execution chain) |

---

## Workflow + Verify 1+1 tool

### `mcp__phycool-context__log_workflow`

| Field | Type | Required | Enum |
|:------|:-----|:--------:|:------|
| `workflow_type` | string | ✅ | `create-story` / `dev-story` / `code-review` / custom |
| `status` | string | ✅ | `success` / `failed` / `in-progress` / `partial` |
| `agent_id` | string | ⚪ | `CC-OPUS` / `CC-SONNET` / etc. |
| `input_tokens` | number | ⚪ | OTel token tracking |
| `output_tokens` | number | ⚪ | 同 |
| `evidence_json` | string | ⚪ | T4.0.0+ ACK handshake evidence |

### `mcp__phycool-context__verify_intentional_annotations`

讀取 `code_locations` 欄位的 IDD,grep src/ 對照 `[Intentional: IDD-XXX]` 標註,返回 missing / orphan list (audit)。

---

## Instinct 4 tools (ECC WIP)

| Tool | Required | Notes |
|:-----|:---------|:------|
| `add_instinct` | `trigger` / `action` / `confidence` / `scope` | confidence 為 0-1 浮點數 |
| `search_instincts` | — | 唯讀 |
| `decay_instinct` | `id` | 降低 confidence |
| `promote_instinct` | `id` | `confidence < 0.8` 時回 `{ok:false, reason}` 且**不設 `isError`**(CAS 式拒絕範式來源) |

---

## Worker Protocol 4 tools(epic-whp · CAS)

> `whp-5-message-bus-mcp` 落地。實作在 `.context-db/scripts/worker-protocol-ops.js`(`server.js` 只留 thin handler),
> 三個寫入 tool 走 `onWrite` 注入 `appendLedger`;`search_worker_runs` 唯讀不寫 ledger、亦**不入 `SEARCH_TOOLS`**。
>
> **CAS 零筆 ≠ 錯誤**:狀態不符時回 `{ok:false, reason}` 放進 `content`,**不設 `isError`**;
> `isError` 只留給參數壞掉(`WHP5-E01` 缺必填 / `WHP5-E02` 非法 enum / `WHP5-E03` run 不存在)與基礎設施失敗(`WHP5-E04`)。

### `mcp__phycool-context__search_worker_runs`

| Field | Type | Required | Enum / Notes |
|:------|:-----|:--------:|:------|
| `story_id` / `phase` / `controller_track` | string | ⚪ | 等值過濾,以 AND 組合 |
| `lifecycle` | string | ⚪ | 逗號分隔多值走 `IN(...)`;8 態見 `upsert-worker-run.js` `LIFECYCLES` |
| `run_mode` | string | ⚪ | `window` / `inline` |
| `requires_attention` | boolean | ⚪ | 旗標過濾 |
| `pending_ack` | boolean | ⚪ | 待簽收佇列(`lifecycle='reported' AND ack_at IS NULL`),排序 `reported_at ASC`。**與 `lifecycle` 互斥**(指定時 lifecycle 過濾不生效) |
| `include_messages` | boolean | ⚪ | 單次批次查詢附 `worker_messages`(依 `seq ASC`);未指定時**欄位不存在**而非空陣列 |
| `limit` | number | ⚪ | 預設 20,**硬上限 100** |

### `mcp__phycool-context__ack_worker_run`

| Field | Type | Required | Enum / Notes |
|:------|:-----|:--------:|:------|
| `run_id` | string | ✅ | — |
| `ack_by` | string | ✅ | 簽收者 Agent ID,**空字串會被拒絕** |

**CAS**:`WHERE run_id=? AND lifecycle='reported'` → `awaiting-review`。重複簽收 = 零筆 = `{ok:false}` 帶前次 `ack_at`/`ack_by`。簽收**不觸碰** `worker_handoffs`。

### `mcp__phycool-context__gate_worker_run`

| Field | Type | Required | Enum / Notes |
|:------|:-----|:--------:|:------|
| `run_id` | string | ✅ | — |
| `verdict` | string | ✅ | `approved` / `revise` / `rejected` |
| `gate_by` | string | ✅ | 裁決者 Agent ID |
| `gate_notes` | string | ⚪→✅ | `verdict='revise'` 時**必填**(成為指示訊息 body) |
| `next_phase` | string | ⚪ | — |
| `controller_track` | string | ⚪ | 預設沿用 run 自身軌道 |
| `override` / `override_reason` | boolean / string | ⚪ | 跨軌裁決須**兩者齊備且 reason 非空** |

**守衛鏈(順序即拒絕理由的可區分性)**:run 存在 → `ack_at IS NOT NULL` → `lifecycle='awaiting-review'` → 軌道所有權 → `worker_handoffs.gate_result='pending'` CAS。全部在**同一 `BEGIN IMMEDIATE`** 內,handoff + `worker_runs` + `worker_messages` 三表原子完成。
`revise` 同句清空 `reported_at`/`ack_at`/`ack_by` 並歸零 `notify_count`(G24)。
`run_mode='inline'` 核可直達 `closed` + `close_source='ControllerAfterHandshake'`(G26);`window` 停在 `approved`(關窗是人的決定)。

### `mcp__phycool-context__add_worker_message`

| Field | Type | Required | Enum / Notes |
|:------|:-----|:--------:|:------|
| `run_id` | string | ✅ | 不存在則拒絕(孤兒訊息送不到) |
| `msg_type` | string | ✅ | **依 direction 各自驗證,非聯集** |
| `body` | string | ✅ | — |
| `author` | string | ✅ | — |
| `mode` | string | ✅ | `append` / `replace` — **無預設值**,省略即具名拒絕(G4);大小寫敏感 |
| `direction` | string | ⚪ | `controller-to-worker`(預設)6 型:`verdict-approved`/`revise`/`wake`/`probe`/`answer`/`close`;`worker-to-controller` 4 型:`progress`/`blocker`/`question`/`report` |

`seq` 由 `COALESCE(MAX(seq),0)+1` 於 `BEGIN IMMEDIATE` 內配置,`SQLITE_BUSY` 退避重試 3 次(200/400/600ms)。
`mode='replace'` 只把**同 direction** 的 `pending` 舊則標 `superseded`(**標記不刪列**);已 `delivered` 者不動並回 `warnings`。
新列固定 `state='pending'` + `delivered_via`/`delivered_at`/`consumed_at` 皆 NULL —— 本層**永不寫** `delivered`/`consumed`(屬 whp-6 / whp-11 送達通道)。

---

## Ctrl-Channel 4 tools(epic-ccb · CAS)

> `ccb-1-db-mcp-import` 落地。實作在 `.context-db/scripts/ctrl-channel-ops.js`(`server.js` 只留 thin handler,
> 不 import 本模組符號、僅鏡射 `worker-protocol-ops.js` 結構,對齊 SDD Spec §7)。
> 三個寫入 tool(`post_ctrl_message`/`close_ctrl_thread`/`update_ctrl_board`)走 `onWrite` 注入 `appendLedger`;
> `read_ctrl_messages` 雖有簽收寫入(UPSERT `ctrl_message_reads`)但**不觸發 ledger**(BR-043,讀取簽收屬 DB 原生讀側效果,非需災備追蹤的協調事實)。
>
> **CAS 零筆 ≠ 錯誤**:狀態不符時回 `{ok:false, reason, current?}` 放進 `content`,**不設 `isError`**;
> `isError` 只留給參數壞掉(`CCB1-E01` 缺必填 / `CCB1-E02` BoardState shape 不合法 / `CCB1-E03` thread/board 不存在)與基礎設施失敗(`CCB1-E04` SQLITE_BUSY 重試耗盡)。

### `mcp__phycool-context__post_ctrl_message`

| Field | Type | Required | Enum / Notes |
|:------|:-----|:--------:|:------|
| `from_track` | string | ⚪→✅ | 省略時 fallback `PHYCOOL_CONTROLLER_TRACK` env;兩者皆缺 → `CCB1-E01` |
| `to_tracks` | string[] | ✅ | 非空陣列,顯式收件無預設值(空陣列 / 缺省皆 `CCB1-E01`) |
| `msg_type` | string | ✅ | `inform` / `discuss` / `request` / `handoff` / `decision` / `state` |
| `body` | string | ✅ | — |
| `thread_id` | string | ⚪ | 省略 = 開新題(見下);帶值但不存在 → `CCB1-E03`;帶值但已 `closed` → CAS 拒絕(非 isError,提示開新題並以 `ref_json.thread_id` 引用舊題) |
| `topic` | string | ⚪→✅ | **省略 `thread_id` 時必填**(開新題用);已提供 `thread_id` 時不需要 |
| `category` / `channel` / `must_read` | string / string / boolean | ⚪ | `channel` 預設 `'general'` |
| `ref_json` | object | ⚪ | JSON,額外結構化參照 |
| `superseded_by` | number | ⚪ | 僅允許更正**呼叫端自己 `from_track`** 的既有 `msg_id`;非本軌或不存在 → CAS 拒絕,`body` 逐字不變 |

`thread_id` 省略時取 `getTaiwanTimestamp()` 前 19 字元(`YYYY-MM-DD HH:mm:ss`)作新題 ID;同秒兩次開新題撞號 → CAS 拒絕(非 `CCB1-E04`),可原樣重試(下一秒即得新 ID)或改帶明確 `thread_id`。
`seq` 由 `COALESCE(MAX(seq),0)+1` 與 INSERT 同一 transaction 取號,避免併發同號。

### `mcp__phycool-context__read_ctrl_messages`(唯讀 + 讀取即簽收)

| Field | Type | Required | Enum / Notes |
|:------|:-----|:--------:|:------|
| `reader_track` | string | ⚪→✅ | 省略時 fallback `PHYCOOL_CONTROLLER_TRACK` env;兩者皆缺 → `CCB1-E01` |
| `thread_id` / `channel` / `category` / `state` | string | ⚪ | 等值過濾,AND 組合 |
| `must_read_only` | boolean | ⚪ | 只回 `ctrl_threads.must_read=1` 的話題 |
| `unread_only` | boolean | ⚪ | `NOT EXISTS` 於 `ctrl_message_reads`(本 `reader_track` 尚未簽收者) |
| `limit` | number | ⚪ | 預設 20,**硬上限 100** |

排序 `created_at ASC, seq ASC`。回傳後對**實際回傳(已截斷至 limit)** 的訊息 UPSERT `ctrl_message_reads(msg_id, track, read_at)`,同 `(msg_id, track)` 二次讀取只更新 `read_at`(冪等簽收,不增列)。**本 tool 不寫 ledger**(見上方說明),亦**不入 `SEARCH_TOOLS`**(理由同 `search_worker_runs` 前例:有寫入副作用,非純讀)。

### `mcp__phycool-context__close_ctrl_thread`

| Field | Type | Required | Enum / Notes |
|:------|:-----|:--------:|:------|
| `thread_id` | string | ✅ | — |
| `caller_track` | string | ⚪→✅ | 省略時 fallback `PHYCOOL_CONTROLLER_TRACK` env;兩者皆缺 → `CCB1-E01` |

**CAS**:`WHERE thread_id=? AND initiator_track=@caller AND state='open'` → `closed`。`thread_id` 不存在 → `CCB1-E03`;非發起軌呼叫 → CAS 拒絕(`reason` 含實際 `initiator_track` 軌名);已關閉重複呼叫 → CAS 拒絕(`reason` 含目前 `state`)。兩種拒絕皆 `{ok:false}` **不設 `isError`**。

### `mcp__phycool-context__update_ctrl_board`

| Field | Type | Required | Enum / Notes |
|:------|:-----|:--------:|:------|
| `board_id` | string | ✅ | board 由 import 或明確建立產生,**update 不隱式建列** |
| `expected_version` | number | ✅ | CAS 比對基準,**必為整數**;字串 / 小數 → `CCB1-E01`(`ctrl-channel-ops.js:395-400`)|
| `state` | object | ✅ | 須符 `BoardState` shape(見下),不合法 → `CCB1-E02` |
| `updated_by` | string | ⚪→✅ | 省略時 fallback `PHYCOOL_CONTROLLER_TRACK` env;兩者皆缺 → `CCB1-E01` |

**`BoardState` shape**(不合法 = `CCB1-E02` + DB 零變更):`status`(非空 string,必填)/ `holder`(string 或 `null`,必填鍵)/ `history`(陣列,必填,每筆 `{ts,track,action}` 皆 string)/ `until`、`note`(選填,若提供須為 string)。
**CAS**:`WHERE board_id=@board_id AND version=@expected_version` → `version+1` 且覆寫 `state_json`。`board_id` 不存在 → `CCB1-E03`;`version` 不符 → CAS 拒絕(`reason` 含 `expected`/`current.version`,`current.state` 為目前實際值),**不設 `isError`**。

> ⚠️ **`expected_version` 型別式錯**(2026-07-28 ccb-1 CR 修復):MCP `inputSchema` 宣告 `type:'number'` 但**不強制**,呼叫端仍可能送 `"7"`。SQLite 的 INTEGER 欄位親和性會把 `'7'` 隱式轉為 `7` 讓 CAS 成功寫入,但回傳值 `expected_version + 1` 走字串串接變成 `"71"` —— **寫對讀錯**,呼叫端拿到一個不存在的 version 去做下一次 CAS。現已於入口 `Number.isInteger()` 擋下回 `CCB1-E01`。屬 §1 六式錯根因的「型別/Enum 違反」家族,同類風險見所有宣告 `number` 但由 LLM 產生 payload 的欄位。

---

## Common Pitfall — Required Fields Verification

寫入前必對照 §1-§4 表格 required ✅ 欄位齊全。**典型遺漏**:
- `add_intentional_decision` 缺 `sub_type`
- `add_cr_issue` 缺 `severity` 或 `category`
- `add_context` 缺 `category`
- `log_workflow` 缺 `status`
