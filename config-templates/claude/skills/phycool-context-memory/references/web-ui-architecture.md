# DevConsole Web UI Architecture Reference

> DVC-01~16 全量模組規格、路由結構、API Contract、Sync Engine 設計。

---

## 1. 技術棧

| 層 | 技術 | 備註 |
|----|------|------|
| Frontend | Vite 6 + React 18 + TypeScript | SPA, HMR |
| Backend | Express 5 + tsx watch | REST API, hot-reload |
| Database | better-sqlite3 (sync API) | WAL mode, 直接存取 phycool.db |
| YAML | 手寫 Parser | `split(/\r?\n/)` 處理 Windows CRLF |
| i18n | React Context + Hook | zh-TW / en，localStorage `dvc-lang` |
| 啟動 | `npm run dev` | server port 3001, client port 5174 |
| 安全 | localhost-only | 無認證/CORS/API key |

### 目錄結構

```
tools/dev-console/
├── server/
│   ├── routes/              stories.ts, memory.ts, sessions.ts, crIssues.ts
│   ├── services/            yaml-service.ts, storyDetailService.ts, ftsHelper.ts
│   ├── db.ts                better-sqlite3 singleton (WAL)
│   ├── config.ts            projectRoot 配置
│   └── index.ts             Express 5 entry point
├── src/
│   ├── pages/               React page components
│   ├── components/          Shared UI (dark theme)
│   ├── services/            API clients (fetch)
│   ├── i18n/                zh-TW.json + en.json
│   ├── types/               TypeScript 型別
│   └── styles/              CSS (Slate + Indigo tokens)
├── package.json
└── vite.config.ts
```

---

## 2. 路由結構

```
/dev-console
├── /dashboard              DVC-03: 總覽
│   ├── StatusDistributionCard    Story 狀態計數
│   ├── RecentActivityList        最近 10 筆記憶庫活動
│   ├── HealthIndicator           DB 大小 + 記錄數 + 最後寫入
│   └── EmbeddingKPICards         文件數/塊數/模型/維度/文字量
├── /stories                DVC-05: Kanban
│   ├── KanbanColumn × 4         Ready / In-Progress / Review / Done
│   ├── StoryCard                 ID + 名稱 + Epic + 複雜度 + Agent + SDD Badge
│   ├── EpicFilter                Epic + 複雜度過濾
│   └── /:id                DVC-08: Story 詳情
│       ├── MarkdownRenderer      完整 Markdown (react-markdown + remark-gfm)
│       ├── StoryMetaSidebar      狀態/Epic/複雜度/建立日/更新日
│       ├── TrackingTimeline      所有 tracking 日誌時間軸
│       └── RelatedMemoryList     關聯 decision/debug 記錄
├── /memory                 DVC-04 + DVC-10: 搜尋 + CRUD
│   ├── SearchBar                 300ms debounce, FTS5 + LIKE fallback
│   ├── CategoryFilter            multi-select 分類過濾
│   ├── SearchResultCard          關鍵字高亮 snippet (前後 80 字元)
│   ├── CategoryTabs              session / debug / decision / architecture / others
│   ├── MemoryCard                記錄卡片（跨模組共用）
│   ├── MemoryForm                新增/編輯 + Markdown 分割預覽
│   ├── TagAutocomplete           既有 tags 自動完成
│   ├── /sessions           DVC-09: Session Timeline
│   │   ├── TimelineNode          時間+標題+摘要+Agent ID
│   │   ├── TimelineFilter        日期範圍+Agent+tags
│   │   └── SessionDetailPanel    展開完整 session 內容
│   ├── /decisions          DVC-12: 技術決策索引
│   │   ├── DecisionCard          標題+日期+摘要+關聯 Story
│   │   └── StatusGroupTabs       FIXED / DEFERRED / WON'T FIX
│   └── /debug              DVC-12: CR Issue 追蹤
│       └── CrIssueCard           Issue 卡片 + 狀態 Badge
├── /sprint                 DVC-11 + DVC-13: 進度 + 技術債
│   ├── StatusPieChart            recharts 圓餅圖
│   ├── EpicProgressBar           每 Epic 完成率橫條
│   ├── ComplexityStats           S/M/L/XL 計數
│   ├── SprintSummaryCards        總計/完成/進行中/阻塞
│   └── TechDebtBoard        DVC-13
│       ├── DebtCard              ID+描述+來源 Story+嚴重度
│       └── DebtSummary           統計卡片
├── /documents              文檔瀏覽（2026-03-09 新增）
│   ├── Browse Mode               6 UI 群組聚合 14 DB categories
│   ├── Search Mode               FTS5 trigram + LIKE fallback (2 字元)
│   ├── Detail Mode               Markdown 渲染 + heading 導航
│   └── VS Code 連結              vscode://file/{path} URI
├── /channel                epic-ccb ccb-3：跨軌中控聊天室唯讀觀察面（2026-07-28）
│   ├── BoardCard                  ctrl_boards 卡片（version + 狀態 + 歷史摺疊 + state_json parse 失敗降級）
│   ├── ChannelChips               頻道過濾 chips + KPI chips（__kpi-chip 範式，非 KpiCard）+ 已套用篩選 pills
│   ├── APG tablist（手動啟動）    通話中(預設) / 封存查詢 / 簽收矩陣，方向鍵只移焦點、Enter/Space 才切換
│   ├── ThreadList                 Tab1/Tab2 共用列表（<button> 語意，🔴必讀左緣 3px + 簽收徽章 ◇✅⬜）
│   ├── ThreadTimeline + MsgBlock  seq 升序時間軸，ref chips 5 key（story_id/commit/file/board_id/thread_id），
│   │                              superseded 更正鏈「見 #{seq}」，body 純文字 pre-wrap（禁 innerHTML）
│   └── ReadMatrix                 語意 <table>，動態軌欄（GET stats 的 tracks[]），五態
│                                  self◇/signed✅/unsigned⬜/observed👁/not-addressed—，>24h 未簽 warn-decay 底色
├── /roadmap                epic-tdb tdb-1：推進地圖唯讀投影頁（2026-07-28，取代手工維護的多軌推進地圖 .md）
│   ├── PlanCard                    三 lane 欄卡片；gate 五態以字形圖示辨識（🔄/✅/⏳/⏸/🕐，非純色彩）
│   ├── LaneColumn                  manual/dispatch/reconcile 三欄，欄內捲動（不沿用 kanban 320px 固定值）
│   └── KpiCard（複用）             總排程數/已完成/待推進/進行中/未排程
└── /settings               DVC-15: 系統工具
    ├── HealthPanel               DB 大小 + 記錄數 + 最後寫入
    ├── ScriptRunner              白名單腳本執行 + stdout/stderr 顯示
    ├── ConnectionIndicator       頂部 DB 連線狀態燈
    └── ExportButton          DVC-14: JSON/CSV 匯出
```

---

## 3. API Contract

### Stories

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dev-console/stories` | 所有 Stories（支援 epic/status/complexity 過濾） |
| GET | `/api/dev-console/stories/:id` | 單一 Story 詳情 + 關聯資料 |
| POST | `/api/dev-console/stories/:id/status` | 狀態變更（觸發 Sync Engine） |
| GET | `/api/dev-console/stories/:id/sync-preview?newStatus=` | 變更預覽 |
| GET | `/api/dev-console/stories/:id/conflict-check` | DB vs YAML 衝突偵測 |

### Memory

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dev-console/memory/search?q=&category=&tags=&page=&size=` | 全文搜尋 |
| GET | `/api/dev-console/memory?category=&page=&size=` | 分類瀏覽（分頁） |
| POST | `/api/dev-console/memory` | 新增記錄 |
| PUT | `/api/dev-console/memory/:id` | 編輯記錄 |
| DELETE | `/api/dev-console/memory/:id` | 刪除記錄（需確認） |
| POST | `/api/dev-console/memory/batch-delete` | 批次刪除 |
| GET | `/api/dev-console/memory/export?format=json|csv&category=&tags=` | 匯出 |

### Sessions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dev-console/memory/sessions?from=&to=&agent=&tags=` | Session Timeline |

### Dashboard & Sprint

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dev-console/dashboard/summary` | Dashboard 總覽資料 |
| GET | `/api/dev-console/sprint/stats` | Sprint 統計資料 |

### Patterns (Phase 4 Continuous Learning)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dev-console/patterns/observations?domain=&minConfidence=` | 模式觀察（18 域分類 + 信心值） |
| GET | `/api/dev-console/patterns/embedding-health` | 向量覆蓋率（Symbol/Doc/Memory 5 表 + Queue + Model） |

### System

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dev-console/system/health` | 系統健康指標 |
| POST | `/api/dev-console/system/run-script?name=` | 執行白名單腳本 |
| GET | `/api/dev-console/tech-debt` | 技術債資料（registry.yaml） |

### Channel（epic-ccb ccb-3，6 支唯讀端點，資料來源 ctrl_threads/ctrl_messages/ctrl_message_reads/ctrl_boards）

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/channel/stats` | `tracks[]` 動態軌清單 + `categories[]`（DB 全量 DISTINCT，供 Tab2 下拉）+ open/closed_threads + `unread_total`（**未簽 cell 數**，排除 self）+ today_messages（台灣日曆日，`date('now','+8 hours')`）+ last_message_at |
| GET | `/api/channel/boards` | ctrl_boards 卡片；state_json parse 失敗回 `state:null` + `state_raw` |
| GET | `/api/channel/threads?state=&category=&channel=&must_read=&page=&pageSize=` | 通話中/封存列表；`pageSize` 預設 **50**、上限 200；ordinal 全域穩定序號、msg_count/latest_msg/read_stats 批次推導（查詢數與 pageSize 脫鉤） |
| GET | `/api/channel/threads/:threadId/messages` | 時間軸；seq 升序 + superseded_by 反向 JOIN 取 `superseded_by_seq`/`superseded_by_thread_id` |
| GET | `/api/channel/read-matrix?days=&limit=&channel=&category=` | 簽收矩陣；回 `tracks[]`（與 `rows[].cells` key 集合同源，前端不需再查 `/stats`）；每列 = 一則訊息，cells 五態（self/signed/unsigned/observed/not-addressed），`limit` 上限 200 + `truncated` 旗標。`days` 截止點以 `strftime('%Y-%m-%dT%H:%M:%S','now','+8 hours',?)` 產出，與 `created_at` 同為 `T` 分隔台灣時間（用 `datetime()` 的空格格式會因 `'T' > ' '` 讓截止當日全數通過） |
| GET | `/api/channel/search?q=&state=&category=&must_read=&channel=&page=&pageSize=` | FTS5 trigram（≥3 字元）+ LIKE fallback（**1-2 字元**）+ 空字串未過濾；`state` 預設 `closed`（Tab2 封存語意）可指定 `open`；回傳 `match_snippet`（`[`/`]` 標界） |

零寫入路徑（`channelService.ts` 不含 INSERT/UPDATE/DELETE）；DB 不可用一律回 503 `{dbUnavailable:true}`，查無此 thread 回 404。

> ⚠️ **短查詢勿改用 `ftsHelper.isShortQuery`**：其定義為 `len >= 2 && len < 3`（**只涵蓋 2 字元**）。長度 1 會兩個分支都不進而落到 FTS 分支，再被 `sanitizeFtsQuery` 的 `< 3` 擋成 `null`，最終**靜默回 0 筆**而非回退 LIKE。`channelService.ts` 改用本地 `needsLikeFallback()`（`len > 0 && len < 3`）。繁中語料單字查詢（軌／債）是真實用法 —— 實測 `q=軌` 修復前回 0、修復後回 132 threads。

### Roadmap（epic-tdb tdb-1，1 支唯讀端點，資料來源 `stories LEFT JOIN track_plan`）

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/roadmap` | 三 lane 投影：`kpi`(total/done/unplanned/pending/inflight/paused) + `lanes[]`(每卡 16 欄：story_id/title/title_short/priority/complexity/gate/gate_note/gate_since/unlock_note/unlock_leverage/deps_raw/blocked_by/children_progress/unplanned/seq/updated_at) + `generated_at`（offset-aware `+08:00`）。渲染母體 = `track_plan` 已涵蓋之 epic 集合中的非終態 Story（非全庫）。 |

零寫入路徑（`roadmapService.ts` 不含 INSERT/UPDATE/DELETE，排程調整走 CLI `upsert-track-plan.js`）；DB 不可用一律回 503 `{dbUnavailable:true}`；service 例外回 500。

---

## 4. Sync Engine — Unit of Work（DVC-06,§衝突偵測子節已於 tdb-2 retired 2026-07-28）

> 🔴 **RETIRED(2026-07-28,`tdb-2-sprint-status-freeze-refs` BR-012/BR-014)**:`sprint-status.yaml` 已凍結為唯讀歷史快照(`# FREEZE-MARKER:tdb-2-sprint-status-freeze-refs`)。下方「原子同步流程」的 `UpdateSprintYaml()` 步驟與整個「衝突偵測」子節(比對 DB vs YAML 漂移)已無存在意義 —— 無 YAML 寫入即無漂移可能。對應程式碼 `server/services/sync-engine.ts` yaml 分支 + `POST /api/sync/preview` / `POST /api/sync/execute` 兩 endpoint + 前端 Sync 入口(`pages/Stories.tsx` + `components/SyncPreviewModal.tsx`)已同批退場。Story 狀態轉移現況(單一路徑):
>
> ```
> upsert-story.js --merge {story_id} --inline '{"status": "..."}'
>   → UPDATE stories(DB 唯一寫入,唯一真相來源)
>   → InsertTrackingLog()(tracking log entry,若適用)
>   → UpdateStoryEmoji()(僅 legacy .md Story 適用;DB-first Story N/A)
> ```
>
> 以下維持歷史記錄供架構沿革參考,**不代表現行行為**:

### 原子同步流程(歷史,`UpdateSprintYaml()` 步驟已 retired)

```
StoryStatusSyncService.UpdateAsync(storyId, newStatus)
  |
  |-- 1. UpdateStoryDocument()        UPDATE Story in Memory DB
  |-- 2. InsertTrackingLog()          INSERT tracking log entry
  |-- 3. UpdateSprintYaml()           [RETIRED] WRITE sprint-status.yaml
  |       ├── 讀取 → 修改 → 寫入（YamlDotNet 保留註解）
  |       └── 寫入前 auto-backup .yaml.bak
  |-- 4. UpdateStoryEmoji()           UPDATE Story H1 emoji line
  |-- 5. InsertAuditLog()             INSERT sync audit trail
  |-- 6. COMMIT or ROLLBACK
```

### 狀態轉換規則

| From | To | 額外動作 |
|------|----|---------|
| draft | ready-for-dev | — |
| ready-for-dev | in-progress | tracking: 開始開發日誌 |
| in-progress | review | tracking: 進入審查日誌 |
| review | done | tracking: 完成日誌 + 完成時間 + tech-debt 檢查 |
| review | in-progress | tracking: 審查退回日誌 |
| any | blocked | tracking: 阻塞原因日誌 |

### 衝突偵測（DVC-07,歷史,已 retired — 無 YAML 寫入即無漂移可能）

```
ConflictDetectionService
  ├── 讀取 Memory DB Story 狀態
  ├── 讀取 sprint-status.yaml 狀態
  ├── 比對：一致 → 正常 / 不一致 → ConflictWarning
  └── 解決選項：以 DB 為準 / 以 YAML 為準 / 手動指定
```

---

## 5. Memory Launcher Skill（DVC-16）

### 三階段流程

**Phase A — 任務前記憶查詢**:
1. `search_context("", { story_id, limit: 5 })` — Story 歷史
2. `search_context("", { epic_id, category: "debug", limit: 3 })` — 同 Epic debug 教訓
3. `search_tech("{tech keywords}", { limit: 3 })` — 相關技術方案
4. 組裝記憶摘要 (< 2,000 字元)，優先序：debug > decision > session
5. 注入 `--append-system-prompt`

**Phase B — 任務執行**: 與原 `claude-launcher` 相同。

**Phase C — 任務後記憶寫入**:
| 場景 | category | 內容 |
|------|----------|------|
| Pipeline 成功 | session | story_id + 最終狀態 + 完成階段 |
| Pipeline 失敗 | debug | story_id + 失敗階段 + 錯誤訊息 |
| 批次完成 | session | 成功/失敗清單 + 耗時 |

---

## 6. Design System

### Dark Theme Tokens

```css
:root {
  /* Slate 色系 */
  --dvc-bg-primary: #0f172a;       /* slate-900 */
  --dvc-bg-secondary: #1e293b;     /* slate-800 */
  --dvc-bg-card: #334155;          /* slate-700 */
  --dvc-text-primary: #f8fafc;     /* slate-50 */
  --dvc-text-secondary: #94a3b8;   /* slate-400 */
  --dvc-border: #475569;           /* slate-600 */

  /* Indigo 強調 */
  --dvc-accent: #6366f1;           /* indigo-500 */
  --dvc-accent-hover: #818cf8;     /* indigo-400 */

  /* 狀態色 */
  --dvc-status-ready: #22c55e;     /* green-500 */
  --dvc-status-progress: #3b82f6;  /* blue-500 */
  --dvc-status-review: #f59e0b;    /* amber-500 */
  --dvc-status-done: #10b981;      /* emerald-500 */
  --dvc-status-blocked: #ef4444;   /* red-500 */

  /* SDD Badge */
  --dvc-badge-sdd: #22c55e;        /* green-500 */
}
```

### 字型

- 技術內容：`'Roboto Mono', 'Consolas', monospace`（ID/code/path）
- 文件內容：`'Noto Sans TC', 'Inter', sans-serif`（Markdown 區域）

### 圖表庫

- 推薦：`recharts`（React-native, 輕量）
- 備選：`Chart.js`
- 暗色主題適配色板

---

## 7. 已知 Bug 修復記錄

| Bug | 根因 | 修復 |
|-----|------|------|
| Stories API 回傳 `[]` | Windows CRLF，`split('\n')` 殘留 `\r` | `split(/\r?\n/)` |
| Epic filter 無結果 | `deriveEpicId()` 回傳 `"mqv"`，Epic key `"epic-mqv"` | `matchesEpicId()` fuzzy match |
| Story 內容 FILE_NOT_FOUND | `source_file` 為相對路徑 | 自動前綴 `config.projectRoot` + `context-db://` 協議 |
| CR Issues 500 error | SQL 查詢不存在欄位 | 對齊實際 Schema（`issue_code/dimension/summary`） |
| Memory 頁面無資料 | 預設 mode `'search'` 需 ≥3 字元 | 改預設 `'browse'` + auto-load |
| 2 字元中文搜尋無結果 | FTS5 trigram 最小 3 字元 | 長度分支：≥3 FTS5 / ==2 LIKE fallback |

---

## 8. 併發安全

| 風險 | 緩解 |
|------|------|
| SQLite 併發寫入（CLI + Web UI） | WAL mode + busy_timeout + retry |
| Memory DB Schema 升級 | 啟動時 schema validation + version check |
| 資料陳舊（Web UI 顯示快照） | 手動 refresh 按鈕 + 可選 auto-refresh |

---

## 9. 啟動指令

### 開發模式

```bash
cd tools/dev-console && npm run dev
# → Server: http://localhost:3001
# → Client: http://localhost:5174
```

### 手動 BAT 檔

```
claude token減量策略研究分析/記憶庫策略/手動開關Server/
├── 1.DevConsole啟動.bat
└── 2.DevConsole關閉.bat
```

### npm Scripts

```json
{
  "dev": "concurrently \"tsx watch server/index.ts\" \"vite\"",
  "build": "vite build",
  "preview": "vite preview"
}
```
