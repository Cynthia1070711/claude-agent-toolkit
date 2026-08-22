# phycool-context-memory — §15-§15.2 Rule Violation Tracker Phases

> **抽出自** `.claude/skills/phycool-context-memory/SKILL.md` 2026-05-16 P2 modularization (saas-to-skill Mode B 8-aspect validation pass). 主 SKILL.md ≤300 行,本檔承載 §15-§15.2 Rule Violation Tracker Phases。

---

## 15. Special Category: `rule_violation` (ctr-p2-violation-tracker, 2026-04-16)

Reuses `context_entries` table with `category='rule_violation'` — **no migration**, schema accepts arbitrary category strings (see init-db.js:48-60). Tracks rule violation incidents to quantify Phase 1 `rules: paths:` effectiveness; 60-day window with baseline 8/30d (MEMORY.md Core Rules pre-2026-04 incidents).

### Write (CLI helper, not MCP)

```bash
node .context-db/scripts/log-rule-violation.js \
  --rule "memory/feedback_depth_gate_warn_not_optional.md" \
  --loaded true --cli-enforced false \
  --phase create-story --severity high \
  --summary "Depth Gate WARN 投機通過未校正"
```

**Contract**: INSERT into `context_entries` + `appendLedger` dual-write + `syncEmbedding` fire-and-forget (no `await` blocking). CLI writes directly via better-sqlite3 (bypasses MCP stdio cold-start).

**Validation** (CR auto-fix 2026-04-16):
- `--phase` enum 白名單: `create-story|dev-story|code-review|party-mode|other`(VALID_PHASES,不接受 typo)
- `--severity` enum 白名單: `critical|high|medium|low`
- `--agent` 若未指定 → 自動讀 `process.env.CLAUDE_AGENT_ID` → fallback `CC-OPUS`(與 `log-workflow.js:43` 慣例一致)

### content JSON schema (6 keys, all required)

```json
{
  "violated_rule_path": "memory/feedback_xxx.md",
  "rule_loaded_at_time": true,
  "cli_enforcement": false,
  "workflow_phase": "create-story|dev-story|code-review|party-mode|other",
  "severity": "critical|high|medium|low",
  "incident_summary": "one-line description"
}
```

`tags` = JSON array `["rule_violation", <rule_basename>, <phase>, <severity>]`
`related_files` = full rule path

### Query

- **CLI**: `node .context-db/scripts/query-violations.js --format (table|json)` — 60d stats + GREEN(≤8)/YELLOW(≤9.6)/RED(>9.6) classification
- **MCP**: `search_context({query:"", filters:{category:"rule_violation", include_content:true}})`
- **DevConsole**: `/rule-violations` (4-panel dashboard — KPI / by-rule / by-phase / timeline)
- **API**: `GET /api/rule-violations/stats?days=60` + `GET /api/rule-violations/recent?limit=20`

### 60-day rollback trigger (Strategy doc §7 commitment #10)

If 30d rolling count > baseline × 1.2 (i.e., > 9.6 / 30 days sustained) → rollback Phase 1 `rules: paths:` configuration.

---

## 15.1 Phase 3: L1 Observer Auto-Detect Hook (td-rule-violation-auto-detect-hook, 2026-04-21)

Closes the observer paradox of §15 — manual CLI logging is vulnerable to the same attention dilution it tries to measure. A **Stop hook** scans the last 3 assistant messages from `transcript_path` for ~38 rule-violation keywords (中/英 mixed) and emits a `hookSpecificOutput.systemMessage` nudge prompting the agent to run `log-rule-violation.js`.

### Design contract

| Aspect | Behavior |
|--------|----------|
| Event | `Stop` (not `PostToolUse` — avoids scanning Edit content which would self-trigger on the very code being written) |
| ENV flag | `PHYCOOL_RULE_VIOLATION_HINT_ENABLED=true` required (default disabled, grey-launch opt-in) |
| Scan depth | Last 3 assistant `message.content[].text` blocks from `transcript_path` |
| Throttle | Same session + same keyword → 1-shot (OS temp file `phycool-rvh-throttle-{sessionId}.json`, 6h TTL) |
| DB write | **None** (avoids contaminating baseline) — hook only prompts, agent decides whether to CLI-log |
| Fail-open | Any error / timeout → `exit 0` (never blocks Stop chain) |
| Timeout | 2.5s global kill + 1s stdin-read cap |

### Files

| Type | Path |
|------|------|
| Hook entry | `.claude/hooks/detect-rule-violation-hint.js` (**thin shim 35 lines** R5,require core + invoke `core.runMain()`) |
| Pure core | `.context-db/scripts/detect-rule-violation-core.cjs` (**keyword lib + evaluate + runMain + readStdinAsync + writeAndExit** R5 擴充 dep-injectable) |
| Unit tests | `.context-db/tests/detect-rule-violation-hint.test.js` (**61 tests** R5 wrapper shim + constants + readStdinAsync + writeAndExit + runMain coverage, **98.34% lines coverage** core.cjs) |
| Backtest | `.context-db/scripts/backtest-rule-violation-detector.cjs` (precision/recall against DB ground truth) |
| Settings entry | `.claude/settings.json` Stop chain (8th hook, alongside log-session / suggest-compact) |

### Enabling

Opt-in per-user by exporting env var (e.g., in `.claude/settings.local.json` future extension, or shell rc):

```bash
export PHYCOOL_RULE_VIOLATION_HINT_ENABLED=true
# optional debug trace to stderr:
export PHYCOOL_RULE_VIOLATION_HINT_DEBUG=true
```

### Keyword library (38 patterns)

Organized by language × severity:
- **中文 high**: `Phase A 違反`, `R2 rescue`, `R3 rescue`, `未實際試修`, `投機通過`, `跳過 Depth Gate`, `orphan WARN`, `直接 Edit SKILL.md`, `sub-agent 寫 memory`, `tasks-backfill`, `未 accept-warn`, `繞過 /saas-to-skill`
- **中文 medium**: `FixCost 估算`, `靜默通過`, `繞過 SOP`, `未 Glob 驗證`, `違反 Language Standard`, `.md 鏡像`, `繞過 SKILL.md`, `未實證`, `WARN=BLOCK`, `跳過 Skill`, `Edit 3-engine SKILL`, `DB-first 未遵守`, `1+ 年前 folklore`
- **中文 low**: `Boy Scout 跳過`
- **英文 high**: `violated`, `skipped depth gate`, `bypassed gate`
- **英文 medium**: `anti-pattern`, `ignored warning`, `folklore`, `observer paradox`, `attention dilution`, `cognitive dissonance`
- **英文 low**: `stale debt`, `boy scout skipped`

Each maps to a rule path (`memory/*.md` or `.claude/rules/*.md`) used to populate the CLI `--rule` flag in the suggested command.

### Backtest validation (AC-4)

`backtest-rule-violation-detector.cjs --days N [--strict]`:
- **Recall** (over known `rule_violation` records as ground truth positives): Reports what % of DB-recorded incidents have keywords the detector would catch. Current on 9 records: **88.9%** (≥ 60% threshold).
- **Precision proxy** (detector hits in 30d sessions cross-referenced with ±72h violations): **58.8%** — weak proxy because ground truth is under-reported; a session hit without a nearby logged violation may reflect under-logging, not a false positive. Use as monitoring aid, not a strict gate.
- Non-strict mode: always `exit 0` with report. `--strict` exits 1 on threshold breach.

### Rollout metrics (30d live monitoring window)

| Metric | Source | Green zone |
|--------|--------|------------|
| Rolling 30d `rule_violation` count | `query-violations.js --since <date>` | uplift 30-100% vs baseline 8 |
| Backtest recall (weekly) | `backtest-rule-violation-detector.cjs --days 7` | ≥ 60% |
| Hook execution time | vitest test 量測 (CI gate) | ≤ 100ms |
| Throttle suppression rate | hook stderr `[rvh] suppressed` count | > 50% indicates repeated nudges being filtered (signal of effectiveness) |

Uplift > 200% sustained → tune keyword library (remove high-noise patterns). Uplift < 30% → upgrade to Phase 4 BlockingMessage hook (separate Story).

---

## 15.2 Phase 4: Workflow Entry Gate (td-rule-violation-workflow-precheck, 2026-04-21)

Complements §15.1 L1 Observer (post-message detection) with **pre-work gating**. At BMM `dev-story` / `code-review` workflow entry, agent must `Read` the top-3 30d-rolling hot violation rules **before any other tool call** — moving rule internalization from passive (L4 Consumer auto-inject signal) to active (Read evidence with rule body in context window).

### Architecture

| Layer | Mechanism | Trigger | Read evidence |
|-------|-----------|---------|--------------|
| Workflow Entry Gate (Phase 4 — outside L1-L5 numbering) | `step-00-violation-precheck.md` first step in workflow.md EXECUTION | workflow load (BMM dev-story / code-review) | **MANDATORY** (Read tool_use blocks per top-3 hot rule) |
| L1 Observer (Phase 3, §15.1) | Stop hook keyword detect | each assistant message stop | not required |
| L4 Consumer (Story #5) | `pre-prompt-rag.js` Layer 11 inject | each UserPromptSubmit | not required |
| **L5 Exit-gate (Phase 4 — Story postcheck 已實作 2026-04-21)** | **`check-violation-repeat.js` keyword scan over session actions** | **workflow archive (dev-story step-09 §8.5 / code-review step-06 §7.7)** | **required — findings 必 resolve 或 `log-rule-violation.js` ack (both routes closes BLOCK)** |

The Entry Gate fires **before** L1 Observer can fire — at workflow entry no assistant message exists yet, so Stop hook hasn't triggered. Gate forces internalization at the moment of greatest plasticity. Outside L1-L5 numbering to avoid clash with L1 Observer name. The Exit Gate (L5) fires **after** all dev-story / code-review work is complete but **before** archival (status → review / done), forming the last BLOCK of the 5-layer anti-recidivism chain — any hot-rule keyword hit in the session's full action trail triggers either fix-in-place or explicit `log-rule-violation.js` acknowledgement before archive proceeds.

### Design contract

| Aspect | Behavior |
|--------|----------|
| First step | `step-00-violation-precheck.md` (added to dev-story + code-review workflow.md EXECUTION sections) |
| Phase identity | hardcoded per workflow (dev-story step-00 → `--phase dev-story`; code-review step-00 → `--phase code-review`) |
| CLI invocation | `cd .context-db && node scripts/query-violations.js --phase {phase} --since-days 30 --format json --limit 3` |
| 0-violations branch | `stats.total_30d_rolling == 0` → emit `✅ Pre-check passed: no {phase} violations in 30d rolling window` then proceed |
| ≥1 violations branch | for each `stats.by_rule[]` (top 3) → invoke `Read({file_path: rule})` BEFORE any other tool call |
| Acknowledgement | after all Reads → emit single line `✅ Pre-check passed: {basename1}, {basename2}, {basename3} internalized` |
| Fail-open | CLI exit non-zero (DB missing / parse error) → emit `⚠ Pre-check skipped (CLI error: <stderr>)` and proceed (gate is quality nudge, not hard block) |
| Missing file handling | rule path resolves to missing file → record in plain text and continue with remaining rules |

### `--since-days N` CLI shorthand

`scripts/query-violations.js` extended (backwards-compatible) with `--since-days N` flag:
- Translates to `daysAgoISO(N)` internally
- Mutually exclusive with `--since YYYY-MM-DD` (error exit 1 if both)
- Validates positive integer (rejects 0, negative, non-numeric — exit 1 with diagnostic)
- Avoids step-00 instruction needing platform-specific date math

### Files

| Type | Path |
|------|------|
| dev-story step | `_bmad/bmm/workflows/4-implementation/dev-story/steps/step-00-violation-precheck.md` |
| code-review step | `_bmad/bmm/workflows/4-implementation/code-review/steps/step-00-violation-precheck.md` |
| dev-story workflow.md | EXECUTION section chains `step-00-violation-precheck` → `step-00-db-first-query` → `step-01-load-story` |
| code-review workflow.md | EXECUTION section chains `step-00-violation-precheck` → `step-01-load-discover` → `step-01b-generate-trail` |
| CLI shorthand | `.context-db/scripts/query-violations.js` `--since-days N` flag (backwards-compat) |
| Vitest | `.context-db/tests/workflow-precheck.test.js` (19 tests; AC-1 JSON schema / AC-2 instruction structure / AC-3 0-violation short-circuit / AC-4 phase isolation / `--since-days` validation / malformed JSON resilience / DB-not-found regression) |

### Live snapshot at activation (2026-04-21)

| Phase | total_30d_rolling | status | Top-3 hot rules |
|-------|:-----------------:|:------:|------------------|
| code-review | 11 | RED (+38% baseline 8) | (1) `memory/feedback_cr_must_try_fix_before_defer.md` × 3, (2) `.claude/rules/skill-sync-gate.md` × 2, (3) `.claude/rules/constitutional-standard.md` × 2 |
| dev-story | 3 | GREEN (-62% baseline 8) | (1) `.claude/rules/skill-sync-gate.md` × 1, (2) `.claude/rules/constitutional-standard.md` × 1, (3) `memory/feedback_db_first_no_md_mirror.md` × 1 |

**Implication**: code-review phase is the violation hotspot; Entry Gate has highest expected ROI for CR work.

### Limitations

- **Soft enforcement**: BMM has no hard gate forcing Agent to Read. Instruction uses `MUST` + `before any other tool call` language. Bypass would itself be loggable via L1 Observer keyword detector.
- **Token cost**: top-3 full-text Read ~3-5k tokens per workflow (vs Story #5's ~300 tokens per prompt). One-shot at workflow entry, acceptable.

### Phase 4 → Phase 5 upgrade escalation matrix (Day-30 review 2026-05-21)

**Day-0 baseline (2026-04-21 activation)**: code-review 11/30d RED (+38% vs baseline 8); dev-story 3/30d GREEN (−62%). Weekly backtest recall ≥ 60% (inherits Phase 3 established baseline 88.9% on 9-record ground truth).

| 指標組合 (Day-30) | 判定 | Action |
|------|:-----:|--------|
| CR 30d rolling **-30% 以上改善** AND recall ≥ 60% 持續 | **HEALTHY** | 保留 Phase 4 配置,延長觀察至 Day-60 |
| CR 30d rolling **0% ~ −30% 輕改善** | **MARGINAL** | tune step-00 instruction(強化 MUST 語氣 / 加 Read evidence verification prompt)再觀察 30d |
| CR 30d rolling **> 0% 無改善 / 惡化** OR recall < 60% 持續 2 weeks | **ESCALATE** | 啟動 `td-rule-violation-workflow-postcheck` Phase 5 PreToolUse BlockingMessage hook(hard gate replace soft mandate) |
| Phase-specific degrade(only CR 或 only dev-story) | **TARGETED ESCALATE** | phase-specific BlockingMessage,不全面升級 |
| Day-30 之前 total violations > baseline × 1.5(> 12/30d) | **ROLLBACK** | 立即從 workflow.md EXECUTION 移除 step-00-violation-precheck,debug Gate 實際運作(Read evidence 是否真進 context)|

**Measurement method**: `query-violations.js --phase <each> --since-days 30 --format json` × weekly; uplift ratio = `(current_30d - baseline_30d) / baseline_30d`. Recall 由 `backtest-rule-violation-detector.cjs --days 7` 週測,threshold 繼承 Phase 3 established 60% minimum。

---

## §Recurring Regression Pattern Detection（v2.13.0, 2026-05-12）

當同一根因類別的 regression 累積 ≥ 3 次時，必須：
1. `add_context(category='pattern', tags='recurring-pattern,...')` 固化 6 模式分類
2. 每次 regression 的 Story 都應 cross-reference 前一次 tech entry id

**使用範例（add_context category=pattern）**:
```
add_context({
  category: 'pattern',
  title: 'Worker CSP Recurring 6 模式分類 — Session 2026-05-12',
  tags: 'worker-regression,csp,coep,recurring-pattern,2026-05-12',
  content: '...(完整 6 根因類別 + chain + file:line)...'
})
```

**已知 recurring pattern（context_entries id 索引）**:
- id=4093：Worker CSP Recurring 6 模式分類（2026-05-12，5-chain regression）
  - chain：mqv-18 → mqv-24 → mqv-28 → eft-datasource-worker-coep-fix(tech id=759) → eft-excel-upload-multi-layer-fix-stack
  - 6 根因：EF Core query filter / CSP env-aware / Browser security tracking / DTO nullable sync / Worker cross-origin / Vite cross-protocol

**Pattern 搜尋**:
```
search_context({ query: 'Worker CSP recurring', filters: { category: 'pattern' } })
search_context({ query: 'Worker regression pattern' })
```

---

## Related Files

| Type | Path |
|------|------|
| MCP Server | `.context-db/server.js` |
| SQLite DB | `.context-db/phycool.db` |
| Scripts directory | `.context-db/scripts/` |
| Hook config | `.claude/settings.json` |
| RAG Hook | `.claude/hooks/pre-prompt-rag.js` |
| MCP config | `.mcp.json` |
| DevConsole | `tools/dev-console/` |
| Observe Hook | `.context-db/scripts/observe-pattern.js` |
| Incremental Embed | `.context-db/scripts/incremental-embed.js` |
| Pipeline Hook | `.claude/hooks/pipeline-auto-exit.js` |
| File Lock Check | `scripts/file-lock-check.ps1` |
| File Lock Acquire | `scripts/file-lock-acquire.ps1` |
| Session Recovery Hook | `.claude/hooks/session-recovery.js` |
| Pipeline Checkpoint | `.context-db/scripts/pipeline-checkpoint.js` |
| Context Budget Monitor | `.context-db/scripts/context-budget-monitor.js` |
| Validate Data | `.context-db/scripts/validate-data.js` |
| Cleanup Orphans | `.context-db/scripts/cleanup-orphans.js` |
| Scan Doc Index | `.context-db/scripts/scan-doc-index.js` |
| Log Rule Violation | `.context-db/scripts/log-rule-violation.js` (ctr-p2, 2026-04-16) |
| Query Violations | `.context-db/scripts/query-violations.js` (ctr-p2, 2026-04-16) |
| Rule Violations Dashboard | `tools/dev-console/src/pages/RuleViolations.tsx` + `/api/rule-violations/*` |
| Detect Rule Violation Hook | `.claude/hooks/detect-rule-violation-hint.js` + `.context-db/scripts/detect-rule-violation-core.cjs` (L1 Observer, Phase 3, 2026-04-21) |
| Backtest Detector | `.context-db/scripts/backtest-rule-violation-detector.cjs` (precision/recall monitor) |
| Workflow Entry Gate | `_bmad/bmm/workflows/4-implementation/{dev-story,code-review}/steps/step-00-violation-precheck.md` + `query-violations.js --since-days N` (Phase 4, 2026-04-21) |
| Symbol Indexer | `.context-db/symbol-indexer/` (C# Console, `dotnet run -- --full\|--incremental`) |
| Scheduled Tasks | `scripts/scheduled/` (.cmd wrappers + install-schedules.ps1) |
| Ledger | `.context-db/ledger.jsonl` (auto-created, JSONL format) |
| Ledger Restore | `.context-db/scripts/restore.js` (dry-run / --apply / --apply --force) |
| Skill Keyword Index | `.claude/skills/skill-keywords.json` (46 skills, Layer 8 matching source) |
| Rules | `.claude/rules/context-memory.md` |

---

## §Storage Usage SSoT Schema (v2.7.0, 2026-04-27)

> **觸發 Story**: `eft-editor-usage-sync-v2`
> **ADR**: ADR-USAGE-SSOT-001 (Storage Usage 跨模組單一資料源)
> **角色**: 本 Skill 為 **UsageDto schema 與 ETag 計算** 的 contract 規範來源, 跨 5 個 sibling Skill (editor-arch / member-plans / member-frontend / admin-dashboard / signalr-realtime) 一致引用此 schema 定義。Context Memory DB 不直接儲存 quota live data, 但**儲存 schema definition + ETag 演算法 + 6 trigger contract**作為跨對話 reference。

### §1 UsageDto canonical schema

```typescript
// src/types/UsageDto.ts (planned, eft-editor-usage-sync-v2 範圍)
export interface UsageDto {
  /** User identifier (對齊 server-side AspNetUsers.Id) */
  userId: string;
  /** 校準後已使用容量(bytes), source: User.StorageUsedBytes */
  storageUsedBytes: number;
  /** plan quota 上限(bytes), source: PlanFeatureMatrix.GetStorageLimitMB(planType) * 1024 * 1024 */
  maxStorageBytes: number;
  /** Gallery 圖庫已使用容量(bytes), source: assets WHERE OwnerType='gallery' */
  assetsUsedBytes: number;
  /** 專案 BatchImage / canvas asset 已使用容量(bytes), source: assets WHERE OwnerType='project' */
  projectsUsedBytes: number;
  /** SHA1(storageUsedBytes + maxStorageBytes + lastUpdated)) — 16 hex chars truncated */
  etag: string;
  /** ISO8601 +08:00 (Taiwan time, 對齊 Constitutional §Timestamp Mandate) */
  lastUpdated: string;
}
```

### §2 ETag 計算演算法

```csharp
// Services/DashboardService.cs (planned helper, 仿 IHttpExtensions ETag pattern)
public static string ComputeUsageEtag(long storageUsed, long max, DateTimeOffset lastUpdated)
{
    var raw = $"{storageUsed}:{max}:{lastUpdated:O}";
    using var sha1 = SHA1.Create();
    var hash = sha1.ComputeHash(Encoding.UTF8.GetBytes(raw));
    return Convert.ToHexString(hash).ToLowerInvariant().Substring(0, 16);
}
```

**用途**:
- HTTP 回應加 `ETag` header → client 用 `If-None-Match` polling 節省頻寬
- SignalR push payload 含 etag → client 比對若相同則 skip 更新(避免重渲染)
- 跨對話 Agent 引用「目前 quota state」時用 etag 比對是否仍 valid

### §3 6 trigger contract (對齊 phycool-signalr-realtime §UsageHub Specification §4)

| Trigger | Backend 觸發者 | Schema 變更欄位 |
|---------|---------------|----------------|
| `asset_upload` | `AssetUploadService.cs:389` (`InvalidateQuotaCache` 後) | storageUsedBytes / assetsUsedBytes |
| `asset_delete` | `AssetService.DeleteAssetAsync` (planned) | storageUsedBytes / assetsUsedBytes |
| `project_save` | `ProjectsController.SaveAsync` (planned) | storageUsedBytes / projectsUsedBytes |
| `project_delete` | `ProjectController.PermanentDelete()` | storageUsedBytes / projectsUsedBytes |
| `quota_calibration` | `DashboardService.GetQuotaDetailsAsync:644-654` 自動校準 | 全欄位 |
| `plan_change` | `SubscriptionService.UpgradePlan` / `DowngradeToFreeAsync` | maxStorageBytes |

### §4 跨對話 Agent 引用範例

當新對話 Agent 處理 `eft-editor-usage-sync-v2` 後續 follow-up Story 時:

```text
search_context({
  query: "UsageDto schema ETag",
  category: "decision",
  include_content: true
}) → 命中本 §Storage Usage SSoT Schema 章節
→ Agent 直接 reference 不重新發明 schema
→ 確保跨對話一致(避免 schema drift)
```

### §5 跨 Skill 引用網

| Skill | 章節 | 角色 |
|-------|------|------|
| `phycool-editor-arch` | §13 | Editor 三 consumer site(高頻 push 接收者) |
| `phycool-member-plans` | §13 | StorageLimitMB plan matrix(maxStorageBytes 來源) |
| `phycool-member-frontend` | §Member Center Quota Display | Member 端 4 頁 _UsageQuotaScript.cshtml partial |
| `phycool-admin-dashboard` | §Dashboard Quota Display | Admin KPI card + UsageHub admin-monitor group |
| `phycool-signalr-realtime` | §UsageHub Specification | `/hubs/usage` endpoint contract owner |

### §6 ADR 與 Story 關聯

- **ADR**: `docs/technical-decisions/ADR-USAGE-SSOT-001-storage-usage-cross-module-ssot.md` (planned, eft-editor-usage-sync-v2 範圍)
- **觸發 Story**: `eft-editor-usage-sync-v2` (DB-first, `search_stories({story_id:'eft-editor-usage-sync-v2', include_details:true})`)
- **後續 follow-up**: 本 SSoT 上線後若有 schema 變更必走 ADR-USAGE-SSOT-001 v1.1+ 修訂 + 6 Skills 三引擎同步

### §7 FORBIDDEN

- ❌ UsageDto 加新欄位不更新 ADR + 6 Skills(會造成 schema drift)
- ❌ ETag 演算法改參數順序但不 bump ADR version(會破壞既有 client 比對)
- ❌ 6 trigger 之外新增 push trigger 不在 schema doc 補(會造成 Agent 不知該 invalidate cache)
- ❌ Schema 用駝峰之外的命名(JS/TS frontend 用 camelCase, 與 C# DTO `[JsonPropertyName]` 對齊必走 camelCase)
- ❌ `lastUpdated` 用 UTC 而非台灣時間(違反 `.claude/rules/constitutional-standard.md` §Timestamp Mandate)
- ❌ schema 變更不加 Memory `add_context({category:'decision'})` 記錄(下次對話 Agent 看不到 history)

---

## §C# Web 不可直接寫 Memory DB (SQLite via MCP only)

> **觸發**: `aat-ui-04-followup-h1-telemetry-doc` — aat-ui-04 spec 誤寫 `C# UPDATE context_entries` 根因分析
>
> see also: phycool-otel-micro-collector §S15 AIOS H1 Telemetry Pattern (telemetry 場景 ILogger 路徑 case study)

### 限制聲明

`phycool.db` SQLite 為 **Node.js MCP server 專屬 storage**:
- MCP server (`.context-db/server.js`) 透過 **stdio protocol** 提供 23 tools
- **C# Web (.NET 8) 無 ContextEntries / DbSet 連線**至此 SQLite (架構刻意分離)
- 任何在 C# 中 `db.ContextEntries.Add(...)` / `db.Database.ExecuteSqlRaw("INSERT INTO context_entries ...")` 都是反模式 — C# 無此 DbContext

### 替代方案

| 場景 | 推薦路徑 | 反模式 |
|:-----|:---------|:------|
| Telemetry / Observability | `ILogger →` `Microsoft.Extensions.Logging.ApplicationInsights` → Azure App Insights `traces` + KQL | UPDATE context_entries from C# |
| 跨 process / 跨服務通信 | Service Bus / SignalR / HTTP API | 直接寫 SQLite |
| 業務資料持久化 | EF Core → AIOS DB (SQL Server, AIOSDbContext) / Application DB | Memory DB |
| Story / Decision / Tech Debt 寫入 | Node.js scripts (`upsert-story.js` / `upsert-debt.js`) 或 MCP tool via stdio | C# 直寫 |

### C# 唯讀範例 (`DAGViewerService.cs:55-57`)

```csharp
// Services/AIOS/DAGViewerService.cs:55-57 — 唯一合法的 C# 連線 phycool.db 路徑
// 目的: read-only DAG viewer (讀 conversation_sessions),不寫入
_dbPath = Path.GetFullPath(
    Path.Combine(env.ContentRootPath, "..", "..", "..", ".context-db", "phycool.db"));
```

❌ **FORBIDDEN**:
- ❌ C# 程式碼對 `phycool.db` 執行 INSERT / UPDATE / DELETE (無 EF Core DbContext 支援)
- ❌ 新 C# Service 試圖 `new Database(dbPath)` 直連 phycool.db 寫入 (會與 Node.js MCP server WAL lock 衝突, `.context-db/server.js:48-49` busy_timeout=5000)

---

---
