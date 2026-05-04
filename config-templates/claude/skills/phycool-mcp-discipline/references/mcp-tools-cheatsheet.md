# MCP Tools Cheat-Sheet (phycool-context 23 tools)

> phycool-mcp-discipline §1 catalog 詳細展開。每 tool 含 required / optional / enum / 範例。

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

## Common Pitfall — Required Fields Verification

寫入前必對照 §1-§4 表格 required ✅ 欄位齊全。**典型遺漏**:
- `add_intentional_decision` 缺 `sub_type`
- `add_cr_issue` 缺 `severity` 或 `category`
- `add_context` 缺 `category`
- `log_workflow` 缺 `status`
