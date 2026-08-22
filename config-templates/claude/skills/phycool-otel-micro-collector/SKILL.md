---
name: phycool-otel-micro-collector
version: 2.3.0
updated: 2026-05-11
last_synced_epic: epic-aat
last_synced_date: 2026-05-11
description: >-
  OTel Micro OTLP Collector — 接收 Claude CLI OTLP HTTP/JSON 數據，寫入 JSON Lines。
  支援兩種模式：(1) Pipeline 動態 port watchdog 模式 (2) 主視窗自動化 fixed port 49200 + SessionStart/End hook。
  Triggers: otel / otlp / token tracking / pipeline telemetry / claude telemetry / main window token。
  Use when: Pipeline OTel 設定、主視窗 token 追蹤、OTLP HTTP collector 除錯。
domain: pipeline
triggers:
  - otel
  - otlp
  - token tracking
  - pipeline telemetry
  - claude telemetry
  - main window token
  - SessionStart
  - SessionEnd
watches:
  - glob: "scripts/otel-micro-collector.js"
    domain: pipeline
  - glob: "scripts/otel-auto-start.js"
    domain: pipeline
  - glob: "scripts/otel-session-aggregate.js"
    domain: pipeline
  - glob: "scripts/start-main-otel.ps1"
    domain: pipeline
  - glob: ".claude/skills/claude-launcher-interactive/scripts/story-pipeline-interactive.ps1"
    domain: pipeline
author: CC-OPUS
created: 2026-04-05
---

# phycool-otel-micro-collector Skill

## S1. 用途

解決 Token 追蹤的根本矛盾，支援 **Pipeline + 主視窗** 雙模式：

| 問題 | 說明 |
|------|------|
| Bug #17 | 移除 `>>` stdout 重定向修復了 TUI，但 console exporter 數據也消失了 |
| 根本衝突 | stdout 不能重定向（TUI 依賴 isatty=true），但 console exporter 輸出到 stdout |
| 主視窗缺口 | 4/9-4/12 期間主視窗直接執行任務，38 筆 workflow token 全零（無 collector） |
| 解決方案 | OTLP HTTP/JSON exporter → Micro Node.js Collector → JSON Lines → DB |

## S2. 架構（雙模式）

### Mode A: Pipeline（動態 port，子視窗隔離）
```
story-pipeline-interactive.ps1
  → Start-Process otel-micro-collector.js (隨機 port 49152-65535)
  → 設定 $env:OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:{DYNAMIC_PORT}
  → Claude CLI 子視窗 → OTLP → Collector → JSONL
  → Watchdog 讀取 JSONL → pipeline-log-tokens.js → workflow_executions DB
```

### Mode B: 主視窗自動化（固定 port 49200，SessionStart/End hook + Rotation SSoT）
```
Claude CLI 啟動
  → SessionStart hook: otel-auto-start.js
    → health check localhost:49200
    → 未運行 → spawn collector (detached, port 49200)
    → 已運行 → 秒退（rotation 由 collector 內部處理,不需重啟）
  → settings.local.json env block 提供 OTel env vars
  → Claude CLI 自動發送 OTLP 至 localhost:49200

Collector 常駐（rotation-aware, SSoT）:
  → 每次寫入前 rotateIfNeeded()
     UTC+8 當日異動 → close 舊 jsonl → open main-otel-{today}.jsonl
  → 原子發佈 logs/main-otel-info.json (PoT)
     {port, jsonl, pid, startedAt, currentDay, updatedAt}

SessionEnd hook: otel-session-aggregate.js (glob-resilient)
  → 優先讀 info.json.jsonl (collector 當前 active)
  → Glob main-otel-*.jsonl 作為零遺失安全網
  → 每檔按 marker offset 續讀 → 冪等（零重複零遺失）
  → 時間匹配 workflow_executions → UPDATE tokens/cost
```

### Mode C: 手動 Per-Session（多視窗精確隔離）
```
使用者: . ./scripts/start-main-otel.ps1
  → 啟動獨立 collector (隨機 port)
  → OTEL_SESSION_JSONL env → 覆蓋 settings.local.json
  → SessionEnd hook 讀取專屬 JSONL → 精確歸屬 → auto-shutdown collector
```

**TUI 保護**：stdout 完全不重定向，isatty=true 維持 ✅

## S3. 接口

### CLI 參數

```
node scripts/otel-micro-collector.js <jsonlOutputPath> <portFilePath> [--port FIXED_PORT]
```

| 參數 | 說明 |
|------|------|
| `<jsonlOutputPath>` | JSONL 輸出路徑（append-only） |
| `<portFilePath>` | Port 寫入路徑（供父進程讀取） |
| `--port N` | 可選：使用固定 port（主視窗 Mode B 用 49200；省略則隨機 49152-65535） |

### Mode A: Pipeline 啟動

```powershell
# 在 story-pipeline-interactive.ps1 的 Invoke-Phase 函式中
$otelJsonlFile = Join-Path $LogDir "otel-$StoryId-$PhaseName-$Timestamp.jsonl"
$otelPortFile  = Join-Path $LogDir "otel-port-$StoryId-$PhaseName-$Timestamp.txt"
$collectorScript = Join-Path $ProjectRoot "scripts/otel-micro-collector.js"

$collectorProc = Start-Process -FilePath "node" -ArgumentList @(
    $collectorScript, $otelJsonlFile, $otelPortFile
) -NoNewWindow -PassThru

# Wait for port file (max 5s)
$portDeadline = (Get-Date).AddSeconds(5)
while ((Get-Date) -lt $portDeadline) {
    if (Test-Path $otelPortFile) {
        $rawPort = (Get-Content $otelPortFile -Encoding UTF8 -ErrorAction SilentlyContinue)
        if ($rawPort -and ($rawPort.Trim() -match '^\d+$')) {
            $otelPort = [int]($rawPort.Trim()); break
        }
    }
    Start-Sleep -Milliseconds 100
}
```

### 子視窗環境變數

```powershell
$env:CLAUDE_CODE_ENABLE_TELEMETRY = '1'
$env:OTEL_METRICS_EXPORTER = 'otlp'
$env:OTEL_LOGS_EXPORTER = 'otlp'
$env:OTEL_EXPORTER_OTLP_PROTOCOL = 'http/json'
$env:OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:$otelPort"
$env:OTEL_METRIC_EXPORT_INTERVAL = '10000'   # 10s — 加速數據到達
```

### Watchdog 讀取 JSONL

```powershell
if ($otelPort -gt 0 -and (Test-Path $otelJsonlFile)) {
    $allJsonlLines = @(Get-Content $otelJsonlFile -Encoding UTF8 -ErrorAction SilentlyContinue)
    if ($allJsonlLines -and $allJsonlLines.Count -gt $otelLineCount) {
        $newJsonlLines = $allJsonlLines[$otelLineCount..($allJsonlLines.Count - 1)]
        $otelLineCount = $allJsonlLines.Count
        foreach ($jline in $newJsonlLines) {
            try {
                $record = $jline | ConvertFrom-Json
                if ($record.type -eq 'api_request') {
                    $phaseTokens.input_tokens               += [long]$record.input_tokens
                    $phaseTokens.output_tokens              += [long]$record.output_tokens
                    $phaseTokens.cache_read_input_tokens    += [long]$record.cache_read_tokens
                    $phaseTokens.cache_creation_input_tokens += [long]$record.cache_creation_tokens
                }
            } catch { }
        }
    }
}
```

### 停止 Collector

```powershell
if ($collectorProc -and -not $collectorProc.HasExited) {
    try {
        $null = Invoke-RestMethod -Uri "http://localhost:$otelPort/shutdown" -Method POST -TimeoutSec 3 -ErrorAction SilentlyContinue
    } catch { }
    if (-not $collectorProc.WaitForExit(5000)) { $collectorProc.Kill() }
}
```

## S4. Collector HTTP 端點

| 端點 | 方法 | 說明 |
|------|------|------|
| `/v1/logs` | POST | OTLP LogsExportRequest — 提取 api_request events |
| `/v1/metrics` | POST | OTLP MetricsExportRequest — 提取 token.usage |
| `/health` | GET | 健康檢查 — 回傳 200 OK |
| `/shutdown` | POST | 優雅關閉 |

## S5. JSONL 輸出格式

**api_request event**（來自 `/v1/logs`）:
```jsonl
{"ts":"2026-04-04T20:30:00.000Z","type":"api_request","input_tokens":15000,"output_tokens":800,"cache_read_tokens":12000,"cache_creation_tokens":500,"cost_usd":0.32,"model":"claude-opus-4-6"}
```

**token_metric**（來自 `/v1/metrics`）:
```jsonl
{"ts":"2026-04-04T20:31:00.000Z","type":"token_metric","token_type":"input","value":15000,"model":"claude-opus-4-6"}
```

**main-otel-info.json**（Mode B only，collector 發佈的 PoT SSoT）:
```json
{
  "port": 49200,
  "jsonl": "C:\\...\\logs\\main-otel-2026-04-14.jsonl",
  "pid": 19392,
  "startedAt": "2026-04-14T05:41:47.159Z",
  "currentDay": "2026-04-14",
  "updatedAt": "2026-04-14T05:41:47.171Z"
}
```
- 原子寫入（tmp + rename）保證 reader 不讀到半檔狀態
- collector 啟動時 + 每次跨日 rotate 時更新
- aggregate 優先讀 `jsonl` 欄位拿 active 檔路徑（SSoT）

## S6. 安全考量

- 只綁定 `127.0.0.1`（非 `0.0.0.0`）— 外部無法存取
- 動態 port（49152-65535）— 多 Pipeline 並行安全
- 無認證（localhost-only）
- 不記錄 prompt/tool content，只記錄 token 計數

## S7. 錯誤降級

| 場景 | 處理 |
|------|------|
| Collector 啟動失敗 | `$otelPort = 0`，Pipeline 繼續，token=0 |
| Port 衝突 | 自動重試最多 10 次 |
| JSONL 讀取失敗 | 靜默 catch，不影響 Pipeline |
| Claude CLI 未發送 OTel | token=0，workflow_executions 正常寫入 |

## S8. 配置

`scripts/pipeline-config.json` → `otelCollector` 區塊:
```json
{
  "otelCollector": {
    "portRange": { "min": 49152, "max": 65535 },
    "maxPortRetries": 10,
    "portFileTimeoutSec": 5,
    "healthCheckIntervalSec": 30,
    "shutdownTimeoutMs": 5000,
    "script": "scripts/otel-micro-collector.js"
  }
}
```

## S9. 相關檔案

| 檔案 | 說明 | 模式 |
|------|------|------|
| `scripts/otel-micro-collector.js` | Collector 主程式（支援 `--port` flag + Mode B rotation） | A/B/C |
| `scripts/otel-auto-start.js` | SessionStart hook — 自動啟動 collector port 49200 | B |
| `scripts/otel-session-aggregate.js` | SessionEnd hook — 聚合 JSONL token → UPDATE DB（glob-resilient） | B/C |
| `scripts/start-main-otel.ps1` | 手動 per-session collector 啟動（多視窗精確隔離） | C |
| `scripts/pipeline-log-tokens.js` | Pipeline token DB 寫入 | A |
| `scripts/pipeline-config.json` | `otelCollector` + `modelPricing` 配置 | A/B/C |
| `scripts/otel-micro-collector.test.js` | Unit + Integration tests（13 個） | — |
| `.claude/settings.local.json` | `env` block: OTel env vars (port 49200 fallback) | B |
| `.claude/settings.json` | SessionStart + SessionEnd hook 配置 | B |
| `.claude/skills/claude-launcher-interactive/scripts/story-pipeline-interactive.ps1` | Pipeline 整合點 | A |
| `logs/main-otel-info.json` | PoT SSoT：collector 發佈的 active jsonl 路徑 + port + pid（atomic write） | B |
| `logs/main-otel-{YYYY-MM-DD}.jsonl` | Daily-rotating JSONL（由 collector 內部 rotate） | B |
| `logs/main-otel-marker.json` | Aggregate 讀取 offset（以 jsonl 絕對路徑為 key，跨檔冪等） | B |
| `logs/archive/` | 舊 jsonl 歸檔（手動或未來 Boy Scout script） | B |

## S10. 測試

```bash
# 執行所有測試（13 個）
node scripts/otel-micro-collector.test.js
```

涵蓋: BR-001 生命週期、BR-002 OTLP 解析、BR-003 累加邏輯、BR-005 TUI 完整性（間接）

## S11. 數據可見性時機

| 模式 | 數據何時寫入 DB | DevConsole 何時可見 |
|------|---------------|-------------------|
| **Mode A (Pipeline)** | Phase 結束時 pipeline-log-tokens.js 即時寫入 | Pipeline 完成後刷新即可 |
| **Mode B (主視窗自動)** | **SessionEnd** hook 觸發 otel-session-aggregate.js | Session 結束後下次刷新 |
| **Mode C (Per-Session)** | **SessionEnd** hook 觸發（同 B） | Session 結束後下次刷新 |

### Session 中途查看 token（手動聚合）

```bash
# 在另一個終端執行，或在 Claude 對話中執行
node scripts/otel-session-aggregate.js
```

此指令冪等安全（marker 追蹤已處理位置），不影響 SessionEnd 時的最終聚合。

### 限制

- **Session 中 DB 無數據**：JSONL 持續寫入但未聚合至 DB，需手動觸發或等 SessionEnd
- **多視窗共享模式 (B)**：時間範圍匹配歸屬，重疊 session 精確度 ~90%
- **已遺失的歷史數據**：4/9-4/12 的 38 筆零值記錄無法追溯

## S12. Dashboard 數據品質

- **種子數據排除**: workflow_executions id 1~4 已標記 `--seed-estimate` 後綴，Backend 查詢自動排除（`WHERE workflow_type NOT LIKE '%--seed-estimate%'`）
- **zeroTokenPct 指標**: `/api/workflows/stats` 回傳 `zeroTokenPct`（0~100），表示 token=0 記錄佔比
- **Dashboard 警告**: `zeroTokenPct > 80` 且 `totalWorkflows > 0` 時顯示黃色警告橫幅
- **數據品質驗證**: OTel Collector 首次成功執行後，`zeroTokenPct` 將逐步下降，警告自動消失
- **相關檔案**: `tools/dev-console/server/services/workflowService.ts`（查詢層）、`tools/dev-console/src/pages/Dashboard.tsx`（UI 層）

## S13. Rotation SSoT 機制（Mode B 專用，2026-04-14 新增）

### 根因背景（事故紀錄）
2026-04-14 發現 Web UI 今日 workflow tokens 全為 0。根因：
- Collector 於 2026-04-13 啟動,jsonl 檔名**固定為啟動當日** `main-otel-2026-04-13.jsonl`
- `otel-auto-start.js` SessionStart healthCheck 發現 port 49200 活著就 return,**從不跨日重啟**
- `otel-session-aggregate.js` SessionEnd 推算 today 找 `main-otel-2026-04-14.jsonl` → 不存在 → return → **tokens 永不聚合**

### 設計原則（三層修正）
1. **Path of Truth (PoT) 單一歸屬**：Collector 是唯一 writer,必須獨占發佈「當前 active jsonl」。聚合端不推算日期,只讀 PoT。
2. **Self-Rotating Writer**：Rotation 在 writer 端原子執行（close→open→publish 新 PoT），不依賴外部進程重啟（避免斷流、冪等性惡夢）。
3. **Glob-Resilient Aggregate**：聚合端掃描所有 jsonl + marker offset，確保跨日邊界資料零遺失。

### 實作機制
| 角色 | 行為 |
|------|------|
| **Collector (writer)** | `rotateIfNeeded()` 在每次 appendJsonl 前呼叫;`today !== currentDay` → close 舊檔、開新檔、writeInfoJsonAtomic() |
| **info.json (PoT)** | 原子寫入（tmp + rename）；欄位 `{port, jsonl, pid, startedAt, currentDay, updatedAt}` |
| **Aggregate (reader)** | `getSharedJsonlCandidates()` 優先讀 info.json.jsonl + glob `main-otel-*.jsonl` 作為安全網；每檔獨立 marker offset |
| **Hook (otel-auto-start)** | 僅負責 port 存活檢查,不干預 rotation（單一職責） |

### 邊界 case 保證
| 場景 | 機制 |
|------|------|
| 00:00 跨日 | Collector rotate 為原子,最後一筆若在舊檔，marker 會記得 offset，下次聚合補上 |
| Collector 崩潰 | Hook 重啟，append 模式 + info.json atomic update |
| Aggregate 在 rotate 中途跑 | Glob 掃所有檔 + marker offset → 不重複、不遺失 |
| 2 個 collector 同 port | listen 失敗由 healthCheck 保證單例 |
| 舊 jsonl 累積 | 手動歸檔 `logs/archive/`（未來自動化） |

### FORBIDDEN
- ❌ 聚合端用 `todayStr()` 推算 jsonl 檔名（舊機制的根因）
- ❌ Hook 靠 kill-and-respawn 達成 rotation（會斷流 + 複雜）
- ❌ 無 atomic update 寫 info.json（reader 可能讀到半檔）
- ❌ 傳相對路徑給 collector（跨 cwd 時 info.json.jsonl 無法解析）

### 驗證清單
- [x] 語法：`node -c scripts/otel-micro-collector.js` + `scripts/otel-session-aggregate.js`
- [x] Collector 啟動正確寫 info.json（port/jsonl/pid/currentDay 欄位齊全）
- [x] JSONL 以當日為名（`main-otel-{YYYY-MM-DD}.jsonl`），絕對路徑
- [x] OTLP POST 正常寫入當日 jsonl
- [x] Aggregate glob 多檔,marker per-file 冪等
- [x] Hot-swap：舊 PID → 新 PID 同 port 49200 接管成功

---

## S14. AIOS Agent-Heartbeat 整合 — current_token 取得方法 (aat-fnd-02)

`agent-heartbeat.js` PostToolUse hook 在採樣觸發時，讀取 OTel JSONL 取得當前 session 累計 token 數，回寫 `agent_runs.current_token`。

### 讀取流程

```javascript
// 1. 讀 logs/main-otel-info.json (PoT SSoT)
const info = JSON.parse(fs.readFileSync('logs/main-otel-info.json', 'utf8'));
const jsonlPath = info.jsonl;  // 當前 active JSONL 的絕對路徑

// 2. 讀最後 200 行 JSONL（控制時間預算 < 200ms）
const lines = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n').slice(-200);

// 3. 累加 token 欄位
let total = 0;
for (const line of lines) {
  const obj = JSON.parse(line);
  if (typeof obj.input_tokens === 'number') total += obj.input_tokens;
  if (typeof obj.output_tokens === 'number') total += obj.output_tokens;
  if (typeof obj.cache_read_input_tokens === 'number') total += obj.cache_read_input_tokens;
}
// 4. UPDATE agent_runs SET current_token = total
```

### 注意事項

- **Best-effort**：main-otel-info.json 不存在或 JSONL 不可讀 → `current_token = NULL`（不阻斷 hook）
- **200 行限制**：避免 hook 在大 JSONL 上耗時超過 200ms 時間預算
- **JSONL 欄位對照**（`api_request` 事件，S5 格式）：
  - `input_tokens` ← `obj.input_tokens`
  - `output_tokens` ← `obj.output_tokens`
  - `cache_read_input_tokens` ← `obj.cache_read_tokens`（JSONL 欄位名）

---

## S15. ASP.NET Core ILogger → Application Insights Telemetry Path (AIOS H1 hypothesis)

> **適用場景**: ASP.NET Core (.NET 8) Web 應用的 runtime telemetry — 與 §S2 OTLP Collector 路徑互補，兩條路徑互不重複（見 §S15.3 邊界說明）。

### §S15.1 流向

```
CEOBriefingService.RecordPageViewAsync()
  → _logger.LogInformation("[H1-Telemetry] aios_briefing_view ...")
  → Microsoft.Extensions.Logging.ApplicationInsights (transitive 2.22.0)
  → Azure Application Insights traces 表
  → KQL aggregation 驗證 H1 假設 (≥5 page view/週/user → H1 PASS)
```

### §S15.2 Production Code Reference

`src/YourApp/Web/Services/AIOS/CEOBriefingService.cs:84-92` — `ILogger.LogInformation` structured event:

```csharp
_logger.LogInformation(
    "[H1-Telemetry] aios_briefing_view {{UserId: {UserId}, Timestamp: {Timestamp}}}",
    userId ?? "anonymous",
    DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).ToString("O"));
```

App Insights wiring (`Program.cs:12`): `builder.Services.AddApplicationInsightsTelemetry();`

**customDimensions 結構化欄位對應** (App Insights traces 表):

| KQL 欄位 | 值 |
|:---------|:---|
| `message` | `[H1-Telemetry] aios_briefing_view {UserId: xxx, Timestamp: xxx}` |
| `customDimensions.UserId` | userId or "anonymous" |
| `customDimensions.Timestamp` | UTC+8 ISO8601 timestamp |

### §S15.3 OTLP Collector vs ILogger → App Insights 路徑差異邊界

| 維度 | §S2 OTLP Collector 路徑 | §S15 ILogger → App Insights 路徑 |
|:-----|:------------------------|:----------------------------------|
| 資料來源 | Claude CLI token tracking (OTLP HTTP/JSON) | ASP.NET Core runtime telemetry |
| 寫入目標 | `workflow_executions` DB (SQLite) | Azure App Insights `traces` 表 |
| 查詢工具 | DevConsole `/schema` + SQL | Azure Portal Logs blade + KQL |
| 適用場景 | Pipeline token/cost 追蹤 | Production runtime H1 假設驗證 |
| 兩條互補 | ✅ 互不重複，無衝突 | ✅ 互不重複，無衝突 |

> see also: phycool-admin-module §AIOS 模組 9 §H1 Telemetry / see also: phycool-context-memory §C# Memory DB write 限制邊界

---

## S16. H1 KQL Query Template (canonical primary — PM John §0.5)

> **Canonical primary location**: 本 Skill 為 KQL query template 唯一 SSoT。phycool-admin-module / phycool-context-memory 僅含 link，不重複完整 KQL。

### §S16.1 完整 KQL Query (Azure Portal Application Insights Logs blade)

```kql
// PM John §0.5 H1: 使用者主動打開 /mgmt/aios ≥5/週 → H1 PASS
traces
| where timestamp >= ago(30d)
| where message contains "aios_briefing_view"
| extend userId = tostring(customDimensions.UserId)
| where userId != "anonymous"
| summarize daily_views = count() by userId, bin(timestamp, 1d)
| summarize weekly_views = sum(daily_views), week = bin(timestamp, 7d) by userId
| where weekly_views >= 5
```

### §S16.2 5 必要元素

| # | 元素 | KQL 表達式 |
|:-:|:-----|:-----------|
| 1 | `traces` 表 filter | `where message contains "aios_briefing_view"` |
| 2 | 時間窗 | `where timestamp >= ago(30d)` |
| 3 | extend customDimensions.UserId 解析 | `extend userId = tostring(customDimensions.UserId)` |
| 4 | summarize daily→weekly aggregate | `summarize daily_views = count() by userId, bin(timestamp, 1d)` → `summarize weekly_views = sum(daily_views) by userId` |
| 5 | ≥5 PASS threshold filter | `where weekly_views >= 5` |

---

## Version History

| 版本 | 日期 | 變更 |
|------|------|------|
| **2.3.0** | **2026-05-11** | **S15 + S16 新增**: AIOS H1 Telemetry Pattern (ILogger → App Insights) + H1 KQL Query Template (5 必要元素,canonical primary)。aat-ui-04-followup-h1-telemetry-doc 觸發。OTLP Collector vs ILogger → App Insights 路徑差異邊界說明。Cross-reference to phycool-admin-module §AIOS 模組 9 + phycool-context-memory §C# Memory DB write 限制邊界。 |
| **2.2.0** | **2026-05-09** | **S14 新增**: AIOS Agent-Heartbeat 整合 — current_token 讀取方法（`logs/main-otel-info.json` PoT → JSONL 累加策略）。aat-fnd-02 觸發。 |
| 2.1.0 | 2026-04-14 | Rotation SSoT 機制：collector 內部 rotation + info.json PoT + glob-resilient aggregate。修復跨日 tokens=0 根因事故。 |
| 2.0.0 | 2026-04-13 | DLA-07 IDD / Mode B 主視窗自動化 + SessionStart/End hook 穩定化 |
| 1.0.0 | 2026-04-04 | wfq-08 Micro OTLP Collector 初始版本（Pipeline Mode A） |
