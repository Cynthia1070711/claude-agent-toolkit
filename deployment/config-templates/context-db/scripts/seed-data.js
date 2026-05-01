// ============================================================
// PCPT Context Memory DB — Phase 0 種子資料匯入
// TD-32d: 從專案真實歷史萃取 context_entries + tech_entries
// ============================================================
// 執行方式: node .context-db/scripts/seed-data.js
// 冪等設計: 先清空 agent_id/created_by='SEED' 資料再重新 INSERT
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

// ──────────────────────────────────────────────
// 種子資料：context_entries（10 筆，跨 Epic 代表性記錄）
// ──────────────────────────────────────────────
const seedContextEntries = [
  {
    agent_id: 'SEED',
    timestamp: '2026-02-15T10:00:00Z',
    category: 'decision',
    tags: '["Canvas","座標轉換","DPI","72DPI","96DPI","CanvasConstants"]',
    title: 'Canvas 座標轉換決策：72 DPI vs 96 DPI',
    content: 'PDF 引擎使用 72 DPI，瀏覽器 Canvas 使用 96 DPI。座標轉換常數 CANVAS_TO_PDF_SCALE = 72/96 = 0.75。所有 Canvas 座標在送入 QuestPDF 前必須乘以此常數。禁止硬編碼 DPI 值，必須使用 CanvasConstants.ts 的常數。',
    related_files: '["src/Platform/App.Web/ClientApp/src/utils/CanvasConstants.ts","src/Platform/App.WebApi/Models/PdfCoordinate.cs"]',
    story_id: 'qgr-e1-orientation-switch',
    epic_id: 'epic-qgr',
  },
  {
    agent_id: 'SEED',
    timestamp: '2026-02-20T09:00:00Z',
    category: 'pattern',
    tags: '["FTS5","SQLite","trigram","Context Memory","Phase0"]',
    title: 'FTS5 trigram 查詢最小長度限制',
    content: 'SQLite FTS5 trigram tokenizer 要求查詢字串 >= 3 字元，2 字元以下回傳空結果（非 Bug，是設計行為）。實作搜尋時若 query.length < 3，改用 LIKE %query% 降級查詢或回傳最近 N 筆記錄。',
    related_files: '[".context-db/scripts/init-db.js",".context-db/server.js"]',
    story_id: 'td-32a-context-memory-db-schema',
    epic_id: 'epic-td',
  },
  {
    agent_id: 'SEED',
    timestamp: '2026-02-20T14:00:00Z',
    category: 'decision',
    tags: '["ESM","MCP","Node.js","import","package.json"]',
    title: 'ESM 模組切換決策：CJS → ESM',
    content: '@modelcontextprotocol/sdk 為純 ESM 套件，不相容 CommonJS require()。必須將 package.json 的 type 設為 "module"，所有腳本改用 import 語法，__dirname 改用 fileURLToPath(import.meta.url) 推導。',
    related_files: '[".context-db/package.json",".context-db/server.js"]',
    story_id: 'td-32b-mcp-server-query-tools',
    epic_id: 'epic-td',
  },
  {
    agent_id: 'SEED',
    timestamp: '2026-02-10T11:00:00Z',
    category: 'pattern',
    tags: '["Admin","BackOffice","namespace","Service","DI"]',
    title: 'Admin Service namespace 設計模式',
    content: '所有 Admin 後台 Service 必須在 App.Web.Services.BackOffice namespace，並以 I{ServiceName}Service 介面注入。Admin Controller 禁止直接操作 DbContext，必須透過 Service 層。AdminDashboardService、RemittanceReviewService 等均遵循此規範。',
    related_files: '["src/Platform/App.Web/Services/BackOffice/AdminDashboardService.cs","src/Platform/App.Web/Areas/Admin/Controllers/"]',
    story_id: 'qgr-a1-dashboard-kpi-real-data',
    epic_id: 'epic-qgr',
  },
  {
    agent_id: 'SEED',
    timestamp: '2026-02-25T15:00:00Z',
    category: 'decision',
    tags: '["SignalR","PdfProgressHub","Hub","IHubContext","即時推送","PDF"]',
    title: 'SignalR PdfProgressHub 雙層群組設計',
    content: 'PdfProgressHub 採雙層群組：user-{userId}（個人通知）+ job-{jobId}（作業通知）。IHubContext<PdfProgressHub> 注入至 PdfGeneratorService 發送進度。前端 jobService.ts 使用 SignalR JS SDK 訂閱 "PdfProgress" 事件，並以 jobId 加入群組。Polling fallback 設計：SignalR 斷線時每 3 秒 polling。',
    related_files: '["src/Platform/App.Web/Hubs/PdfProgressHub.cs","src/Platform/App.Web/ClientApp/src/services/jobService.ts"]',
    story_id: 'qgr-d5-signalr-realtime-push',
    epic_id: 'epic-qgr',
  },
  {
    agent_id: 'SEED',
    timestamp: '2026-02-12T16:00:00Z',
    category: 'decision',
    tags: '["品牌色彩","Branding","CSS Variable","Design Token","WCAG","HSL"]',
    title: 'QGR-A5 品牌色彩客製化方案',
    content: '品牌主色透過 SeoConfig.BrandColorHex 存 DB，在 _Layout.cshtml 動態輸出 CSS Variable --color-primary。管理員在 Brand Customization 頁面設定後即時生效（無需重啟）。WCAG 對比度要求：前景色對 --color-primary 必須 >= 4.5:1。使用 hexToHsl() 輔助函式計算對比，不得硬編碼 Hex。',
    related_files: '["src/Platform/App.Web/Models/System/SeoConfig.cs","src/Platform/App.Web/Views/Shared/_Layout.cshtml"]',
    story_id: 'qgr-a5-brand-customization',
    epic_id: 'epic-qgr',
  },
  {
    agent_id: 'SEED',
    timestamp: '2026-02-08T10:00:00Z',
    category: 'pattern',
    tags: '["ECPay","Webhook","Retry","冪等","綠界","金流"]',
    title: 'ECPay Webhook retry 冪等設計',
    content: 'ECPay 可能重複發送 Webhook（網路不穩定時）。WebhooksController 使用 Order.WebhookProcessed flag 確保冪等：若已處理過則直接回傳 "1|OK" 不重複更新訂單。TradeNo 作為 idempotency key，結合 DB transaction 防止 race condition。',
    related_files: '["src/Platform/App.Web/Controllers/Api/WebhooksController.cs","src/Platform/App.Web/Models/Order.cs"]',
    story_id: 'qgr-m7-ecpay-webhook-retry',
    epic_id: 'epic-qgr',
  },
  {
    agent_id: 'SEED',
    timestamp: '2026-02-14T13:00:00Z',
    category: 'pattern',
    tags: '["reCAPTCHA","驗證","ContactForm","Google","安全","Bot防護"]',
    title: 'reCAPTCHA v3 聯絡表單驗證流程',
    content: 'reCAPTCHA v3 score >= 0.5 視為人類。前端 grecaptcha.execute(siteKey, {action:"contact"}) 取得 token 後隨表單 POST，後端 RecaptchaService.VerifyAsync() 向 Google API 驗證。score < 0.5 或 action 不符時回傳 422 Unprocessable Entity。Cloudflare 環境需允許 Google reCAPTCHA outbound。',
    related_files: '["src/Platform/App.Web/Controllers/MemberController.cs","src/Platform/App.Web/Services/RecaptchaService.cs"]',
    story_id: 'qgr-m5-recaptcha-contact-form',
    epic_id: 'epic-qgr',
  },
  {
    agent_id: 'SEED',
    timestamp: '2026-02-18T11:00:00Z',
    category: 'debug',
    tags: '["Zustand","stale_closure","getState","useShallow","selector"]',
    title: 'Zustand stale closure 修復模式',
    content: 'useCallback 依賴陣列若含 Zustand 狀態值，事件處理器會捕捉舊快照導致 stale closure。正確做法：useCallback 依賴陣列改為空 []，並在回調內用 useCanvasStore.getState().value 取即時值。useShallow 只適用於物件選擇器，primitive 值不需要。',
    related_files: '["src/Platform/App.Web/ClientApp/src/stores/editorStore.ts","src/Platform/App.Web/ClientApp/src/components/Editor/PhycCanvas.tsx"]',
    story_id: 'td-4-zustand-stale-closure',
    epic_id: 'epic-td',
  },
  {
    agent_id: 'SEED',
    timestamp: '2026-03-01T10:00:00Z',
    category: 'pattern',
    tags: '["sprint-status","YAML","效能","TRS","Token","批次"]',
    title: 'Sprint-Status YAML 效能優化：快取 + 批次讀取',
    content: 'sprint-status.yaml 在 batch-runner 執行多 Story 時被重複讀取導致 API 超量。TRS-35 引入 sprint_status_cache：Step 1 讀取後快取，後續 Step 直接使用快取，不再重讀。TRS-38 實作 diff-first 策略：只重新載入變更行，減少完整讀取次數。批次執行時改用 batch-runner.ps1 間隔 12 秒啟動。',
    related_files: '["docs/implementation-artifacts/sprint-status.yaml","scripts/batch-runner.ps1","scripts/story-pipeline.ps1"]',
    story_id: 'trs-35-sprint-status-cr-summary-slim',
    epic_id: 'epic-trs',
  },
];

// ──────────────────────────────────────────────
// 種子資料：tech_entries（21 筆）
// Bug 修復 5 筆 / 架構決策 6 筆 / 補充 5 筆 / 失敗案例 5 筆
// ──────────────────────────────────────────────
const seedTechEntries = [
  // ── Bug 修復 (bugfix) × 5 ──
  {
    created_by: 'SEED',
    created_at: '2026-02-18T11:00:00Z',
    category: 'bugfix',
    tech_stack: 'React,Zustand',
    title: 'useShallow Selector 無限重渲染修復',
    problem: 'Zustand useShallow 搭配物件 selector 導致 React 元件無限 re-render。根因：每次 render 時物件 selector 回傳新建物件，useShallow 的淺比較失效，觸發永遠不穩定的更新循環。',
    solution: '改用 primitive selector 分別取值，或在 useCallback 回調內改用 useCanvasStore.getState() 取即時值。useShallow 只適用於從 store 中選取多個 primitive 值組成物件的場景。',
    outcome: 'success',
    lessons: 'Zustand selector 必須回傳穩定引用，物件每次都是新建則無法透過 useShallow 穩定化。監控點：useCallback 依賴陣列含 Zustand 狀態時一律改用 getState()。',
    tags: '["Zustand","useShallow","infinite-loop","TD-4","React","selector"]',
    related_files: '["src/Platform/App.Web/ClientApp/src/stores/editorStore.ts"]',
    confidence: 95,
  },
  {
    created_by: 'SEED',
    created_at: '2026-02-08T10:00:00Z',
    category: 'bugfix',
    tech_stack: 'ASP.NET Core,ECPay',
    title: 'ECPay Webhook 重複處理 Bug 修復',
    problem: 'ECPay 在網路不穩定時重複發送 Webhook，導致訂單狀態被重複更新，付款確認信被重複寄送，收據序號重複生成。',
    solution: '在 Order 模型新增 WebhookProcessed (bool) 欄位。WebhooksController 使用 DB transaction：查詢 + 設定 flag 在同一 transaction 內，利用 SELECT FOR UPDATE 語義防止 race condition。已處理的 Webhook 直接回傳 "1|OK" 跳過業務邏輯。',
    outcome: 'success',
    lessons: '所有外部支付 Webhook 必須設計冪等機制。idempotency key 使用 ECPay TradeNo，結合 DB unique constraint 或 flag 防重複。',
    tags: '["ECPay","Webhook","冪等","retry","金流","QGR-M7"]',
    related_files: '["src/Platform/App.Web/Controllers/Api/WebhooksController.cs","src/Platform/App.Web/Models/Order.cs"]',
    confidence: 90,
  },
  {
    created_by: 'SEED',
    created_at: '2026-02-01T09:00:00Z',
    category: 'bugfix',
    tech_stack: 'TypeScript,React',
    title: 'TypeScript 編譯阻塞修復：CustomFabricObject 型別衝突',
    problem: 'QGR-P0-1：1528 個 TS 編譯錯誤阻塞整個前端 build。根因：CustomFabricObject 在 types/ 和 components/ 各自定義，型別不相容，CanvasJsonV2 解析器使用了錯誤版本。',
    solution: '統一從 src/types/CustomFabricTypes.ts 匯出 CustomFabricObject，刪除 components/ 內的重複定義。CanvasJsonSerializer 改用 canonical 型別。新增 ESLint no-duplicate-type 規則防止再次發生。',
    outcome: 'success',
    lessons: 'TypeScript 型別 canonical source 必須在 src/types/，其他地方只能 import 不能重複定義。CLAUDE.md Canonical Source 欄位已記錄。',
    tags: '["TypeScript","CustomFabricObject","CanvasJson","QGR-P0-1","編譯錯誤","型別衝突"]',
    related_files: '["src/Platform/App.Web/ClientApp/src/types/CustomFabricTypes.ts","src/Platform/App.Web/ClientApp/src/services/CanvasJsonSerializer.ts"]',
    confidence: 95,
  },
  {
    created_by: 'SEED',
    created_at: '2026-02-15T10:00:00Z',
    category: 'bugfix',
    tech_stack: 'React,Fabric.js,QuestPDF',
    title: 'Canvas PDF 座標轉換錯誤修復',
    problem: 'PDF 輸出物件位置偏移。根因：Canvas (96 DPI) 座標直接傳給 QuestPDF (72 DPI) 未做比例轉換，導致物件位置在 PDF 中偏大 33%。',
    solution: '引入 CanvasConstants.CANVAS_TO_PDF_SCALE = 72/96 = 0.75。所有座標（x, y, width, height）在序列化至 CanvasJsonV2 時乘以此常數。PdfGenerator 直接使用轉換後座標，無需再做縮放。',
    outcome: 'success',
    lessons: '座標系統轉換必須在單一轉換層（CanvasJsonSerializer）統一處理，不得分散在多個地方各自轉換。DPI 常數必須集中在 CanvasConstants.ts。',
    tags: '["Canvas","座標轉換","DPI","72DPI","96DPI","QuestPDF","PDF","CanvasConstants"]',
    related_files: '["src/Platform/App.Web/ClientApp/src/utils/CanvasConstants.ts","src/Platform/App.Web/ClientApp/src/services/CanvasJsonSerializer.ts"]',
    confidence: 98,
  },
  {
    created_by: 'SEED',
    created_at: '2026-03-03T14:00:00Z',
    category: 'bugfix',
    tech_stack: 'ASP.NET Core,EF Core,SQL Server',
    title: 'EF Core Migration 衝突修復：並行 Story 分支',
    problem: 'TD-17：多個並行 Story 各自建立 EF Core Migration，Migration ID 時間戳衝突，導致 dotnet ef database update 失敗。',
    solution: '建立 Migration 同步機制：每個 Story 的 migration 需包含前一個 migration 的 MigrationId 作為 PriorMigration。Story 完成後執行 check-hygiene.ps1 的 migration order check。TD-17 補充了 Program.cs 的 migration 自動套用邏輯。',
    outcome: 'success',
    lessons: '並行開發時 migration 衝突是系統性問題，需要制度化解法而非逐個修復。dev-story workflow 的 Step 5b 已加入 migration 自動套用步驟。',
    tags: '["EF Core","Migration","衝突","並行","TD-17","SQL Server"]',
    related_files: '["src/Platform/App.Web/Data/Migrations/","src/Platform/App.Web/Program.cs"]',
    confidence: 85,
  },

  // ── 架構決策 (architecture) × 5 ──
  {
    created_by: 'SEED',
    created_at: '2026-02-20T09:00:00Z',
    category: 'architecture',
    tech_stack: 'SQLite,Node.js',
    title: 'SQLite WAL 模式：多 Agent 併發讀取架構',
    problem: '多個 Claude Agent 並行執行時同時讀取 Context Memory DB，SQLite 預設 journal mode 導致 SQLITE_BUSY 錯誤。',
    solution: '啟動 DB 連線後立即執行 db.pragma("journal_mode = WAL")。WAL（Write-Ahead Logging）允許多讀單寫，讀取不阻塞其他讀取，僅 write 互斥。所有腳本和 server.js 均須在開啟 DB 後立即設定 WAL。',
    outcome: 'success',
    lessons: 'WAL 模式是 SQLite 多讀場景的標準配置。Phase 0 的 init-db.js 已設定為預設。注意：WAL 模式需要 DB 目錄有寫入權限（.shm, .wal 輔助文件）。',
    tags: '["SQLite","WAL","concurrency","multi-agent","Context Memory","TD-32a"]',
    related_files: '[".context-db/scripts/init-db.js",".context-db/server.js"]',
    confidence: 95,
  },
  {
    created_by: 'SEED',
    created_at: '2026-01-20T10:00:00Z',
    category: 'architecture',
    tech_stack: 'ASP.NET Core,Identity',
    title: 'RBAC 權限模型：Plan × Role 矩陣設計',
    problem: '會員權限由訂閱方案（Free/Basic/Advanced/Professional/Business）和角色（User/Admin/SuperAdmin）共同決定，純 Role-based 無法表達方案差異。',
    solution: '設計 Plan × Role 矩陣：ApplicationUser 含 SubscriptionPlan enum + ASP.NET Identity Role。Policy 以 RequireClaim(plan, value) + RequireRole 組合定義。Admin 路由使用獨立 Cookie Auth Scheme，前台使用 Application Scheme。',
    outcome: 'success',
    lessons: 'Plan 枚舉比字串更安全，避免拼寫錯誤。超級管理員（SuperAdmin）繞過 Plan 限制，需在 Policy handler 特例處理。',
    tags: '["RBAC","權限","Plan","Role","Identity","ASP.NET","訂閱方案"]',
    related_files: '["src/Platform/App.Web/Models/ApplicationUser.cs","src/Platform/App.Web/Program.cs"]',
    confidence: 90,
  },
  {
    created_by: 'SEED',
    created_at: '2026-02-01T11:00:00Z',
    category: 'architecture',
    tech_stack: 'ASP.NET Core,CSP',
    title: 'CSP (Content Security Policy) 安全標頭架構',
    problem: 'QGR-S1：缺少 CSP 導致 XSS 攻擊面。直接在 Middleware 配置 CSP 但 Nonce 生成邏輯散落各處。',
    solution: '建立 CspMiddleware 統一管理 CSP Nonce 生成（每 Request 新 Nonce）。Nonce 透過 HttpContext.Items 傳遞至 Razor 視圖。CSP 允許清單集中在 appsettings.json 的 SecuritySettings 節。inline scripts 全部改為 nonce-{nonce} 白名單。',
    outcome: 'success',
    lessons: 'CSP nonce 必須每 Request 重新生成，不可靜態。eval 和 unsafe-inline 一律禁止。Nonce 透過 DI 而非 ViewBag 傳遞可避免 null reference。',
    tags: '["CSP","Security","XSS","Nonce","Middleware","QGR-S1","安全標頭"]',
    related_files: '["src/Platform/App.Web/Middleware/CspMiddleware.cs","src/Platform/App.Web/Views/Shared/_Layout.cshtml"]',
    confidence: 92,
  },
  {
    created_by: 'SEED',
    created_at: '2026-02-20T08:00:00Z',
    category: 'architecture',
    tech_stack: 'SQLite,FTS5,Node.js',
    title: 'FTS5 trigram tokenizer 選型決策',
    problem: '需要支援中英混合全文搜尋，標準 FTS5 unicode61 tokenizer 對中文斷詞效果差，無法搜尋「座標」「品牌」等中文技術詞。',
    solution: '選用 FTS5 trigram tokenizer：將文字切割成所有 3 字元子字串（n-gram = 3），天然支援中文、日文等無空格語言。代價：索引大小為原文 3 倍，查詢 >= 3 字元限制。Context Memory Phase 0 的 context_fts 和 tech_fts 均採用 trigram。',
    outcome: 'success',
    lessons: 'trigram 對「AB」2 字元查詢回傳空（非 Bug），需在 API 層說明此行為。中英混合查詢效果良好，"PDF 浮水印" 可正確命中含 PDF 和浮水印的記錄。',
    tags: '["FTS5","trigram","全文搜尋","中文","SQLite","Context Memory","TD-32a"]',
    related_files: '[".context-db/scripts/init-db.js",".context-db/server.js"]',
    confidence: 90,
  },
  {
    created_by: 'SEED',
    created_at: '2026-02-25T15:00:00Z',
    category: 'architecture',
    tech_stack: 'ASP.NET Core,SignalR,React',
    title: 'SignalR progress hub 雙層群組設計',
    problem: 'QGR-D5：PDF 進度即時推送需同時支援「個人通知」（用戶看自己所有 job）和「作業通知」（特定 job 進度）。單一群組無法滿足兩種訂閱模式。',
    solution: '設計雙層群組：user-{userId}（個人所有 job 的通知）+ job-{jobId}（特定 job 進度）。HubContext<PdfProgressHub> 在 PdfGeneratorService 呼叫 SendAsync("PdfProgress", event)。前端 jobService.ts 連線後同時加入兩個群組。Polling fallback：SignalR 斷線時每 3 秒 GET /api/pdf-jobs/{id}/status。',
    outcome: 'success',
    lessons: 'Hub 類別不應持有狀態，狀態用 IMemoryCache 或 Redis 儲存。用戶重連時需重新加入群組（OnConnectedAsync 無法自動恢復）。polling fallback 是 production 必需，不可省略。',
    tags: '["SignalR","PdfProgressHub","Hub","即時推送","PDF","QGR-D5","polling-fallback"]',
    related_files: '["src/Platform/App.Web/Hubs/PdfProgressHub.cs","src/Platform/App.Web/ClientApp/src/services/jobService.ts"]',
    confidence: 88,
  },

  // ── 架構決策補充：Admin Dashboard KPI（對應 MX-3）
  {
    created_by: 'SEED',
    created_at: '2026-02-10T11:30:00Z',
    category: 'architecture',
    tech_stack: 'ASP.NET Core',
    title: 'Admin Dashboard KPI 即時資料架構設計',
    problem: 'QGR-A1：Dashboard KPI（活躍會員、本月收入、PDF 佇列長度）初版使用靜態假資料，改用真實 DB 聚合查詢時出現 N+1 問題，影響 Dashboard 載入效能。',
    solution: 'AdminDashboardService 採單次 SQL 聚合查詢（JOIN + GROUP BY）。KPI 結果快取 60 秒（IMemoryCache）。BackOffice namespace 規範確保所有 Admin Service 統一結構。',
    outcome: 'success',
    lessons: 'Admin Dashboard 查詢需 Service Layer 封裝，不直接碰 DbContext。聚合 SQL 比多次 LINQ 查詢快 3-5 倍。IMemoryCache 快取 KPI 可大幅減輕 DB 壓力。',
    tags: '["Admin","Dashboard","KPI","BackOffice","AdminDashboardService","IMemoryCache","QGR-A1","快取"]',
    related_files: '["src/Platform/App.Web/Services/BackOffice/AdminDashboardService.cs","src/Platform/App.Web/Controllers/DashboardController.cs"]',
    confidence: 92,
  },
  // ── 測試覆蓋模式（對應 ZH-5）
  {
    created_by: 'SEED',
    created_at: '2026-02-28T10:00:00Z',
    category: 'test_pattern',
    tech_stack: 'xUnit,.NET,Vitest',
    title: '測試覆蓋率 80% 策略：Unit + Integration + E2E 三層',
    problem: '專案測試覆蓋不均：有些模組 0 測試，有些 Controller 只有 happy path。缺乏明確的最低覆蓋標準導致測試品質無法衡量。',
    solution: '設定最低覆蓋率 80%（Unit + Integration + E2E 加總）。TDD 流程：RED（寫測試）→ GREEN（最小實作）→ IMPROVE（重構）。修復實作而非修改測試。',
    outcome: 'success',
    lessons: '測試覆蓋率不是目標，是品質指標。80% 覆蓋率加上真實的邊界條件測試才有意義。Executable spec（xUnit + FluentAssertions）讓測試即文件。',
    tags: '["測試","覆蓋","TDD","xUnit","Vitest","測試覆蓋","coverage","Unit","Integration","E2E"]',
    related_files: '[".claude/rules/testing.md","docs/project-planning-artifacts/technical-specs/testing-strategy.md"]',
    confidence: 88,
  },
  // ── 金流退款模式（對應 ZH-3）
  {
    created_by: 'SEED',
    created_at: '2026-02-05T14:00:00Z',
    category: 'pattern',
    tech_stack: 'ASP.NET Core,ECPay',
    title: 'ECPay 金流退款流程：FRA-1 退款降級設計',
    problem: 'FRA-1：會員退款須降級訂閱方案，但退款後方案降級邏輯散落在 OrderService 和 SubscriptionService，造成狀態不一致。退款金額計算（比例退款）未封裝。',
    solution: '建立 RefundService 封裝退款 + 方案降級邏輯。退款後觸發 SubscriptionChanged 事件，由 SubscriptionService 處理方案降級。ECPay 退款 API 呼叫 + DB 狀態更新在同一 DB transaction。',
    outcome: 'success',
    lessons: '退款和方案降級是強一致性需求，必須在 DB transaction 內完成。ECPay 退款 API 不支援部分退款，比例退款需在系統端計算後整數進位。',
    tags: '["金流","退款","ECPay","Refund","FRA-1","訂閱","降級","比例退款","transaction"]',
    related_files: '["src/Platform/App.Web/Services/Payment/OrderService.cs","src/Platform/App.Web/Controllers/MemberController.cs"]',
    confidence: 85,
  },
  // ── 技術債/registry 知識（對應 ZH-2）
  {
    created_by: 'SEED',
    created_at: '2026-03-01T09:00:00Z',
    category: 'pattern',
    tech_stack: 'YAML,Markdown',
    title: '技術債 Registry 追蹤機制：registry.yaml + sidecar',
    problem: '技術債在 Code Review 中被標記為「延後」後沒有追蹤，成為永遠不修復的黑洞。缺乏從技術債 → 目標 Story 的雙向追溯能力。',
    solution: '建立 docs/implementation-artifacts/tech-debt/registry.yaml 作為技術債中央登錄。每個技術債條目包含：id、severity、source_story、target_story、sidecar 路徑、status（pending/fixed/wont-fix）。開發 /pcpt-debt-registry Skill 強制執行 FIXED / DEFERRED / WON\'T FIX 三分類。',
    outcome: 'success',
    lessons: '技術債必須在發現當下立即登錄，不可等到下次。DEFERRED 比 WON\'T FIX 誠實——後者應僅用於真正無需修復的項目。',
    tags: '["技術債","registry","debt","YAML","sidecar","追蹤","CR","deferred","fixed"]',
    related_files: '["docs/implementation-artifacts/tech-debt/registry.yaml",".claude/skills/pcpt-debt-registry/SKILL.md"]',
    confidence: 90,
  },
  // ── PDF 浮水印模式（對應 MX-1）
  {
    created_by: 'SEED',
    created_at: '2026-02-22T10:00:00Z',
    category: 'pattern',
    tech_stack: 'QuestPDF,.NET',
    title: 'QuestPDF PDF 浮水印渲染實作模式',
    problem: 'QGR-D3：需要在 PDF 輸出加入浮水印（watermark）文字或圖片，QuestPDF API 沒有直接的 watermark 方法，需要自行疊加。',
    solution: '使用 QuestPDF 的 Canvas 層：在每頁建立絕對定位的 Layer，以透明度 alpha=0.3 渲染浮水印文字（旋轉 45 度）。字型大小依頁面比例動態計算（頁面寬度 × 0.15）。',
    outcome: 'success',
    lessons: 'QuestPDF 浮水印需用 Container.Layer() + Canvas 實作。透明度透過 SKPaint.Color 的 alpha 通道控制（不是 CSS opacity）。每頁都要單獨套用，不能全局設定。',
    tags: '["PDF","QuestPDF","浮水印","watermark","Canvas","Layer","QGR-D3","alpha","透明度"]',
    related_files: '["src/Platform/App.PdfWorker/Services/PdfGeneratorService.cs"]',
    confidence: 88,
  },
  // ── Canvas 座標英文補充（對應 EN-1）
  {
    created_by: 'SEED',
    created_at: '2026-02-15T11:00:00Z',
    category: 'architecture',
    tech_stack: 'TypeScript,Fabric.js',
    title: 'Canvas coordinate transform: CanvasConstants DPI scale',
    problem: 'Canvas objects have different coordinate systems: browser Canvas uses 96 DPI but PDF engine (QuestPDF) expects 72 DPI. Direct coordinate transfer causes 33% position offset in PDF output.',
    solution: 'Introduced CanvasConstants.CANVAS_TO_PDF_SCALE = 72/96 = 0.75. All coordinates (x, y, width, height) are multiplied by this scale factor in CanvasJsonSerializer before sending to PdfGenerator. centralize DPI conversion at serialization layer.',
    outcome: 'success',
    lessons: 'Always centralize coordinate system transforms at a single boundary layer. CanvasConstants.ts is the single source of truth for all scale constants. Never hardcode DPI values in components.',
    tags: '["Canvas","coordinate","transform","DPI","scale","CanvasConstants","72DPI","96DPI","PDF"]',
    related_files: '["src/Platform/App.Web/ClientApp/src/utils/CanvasConstants.ts","src/Platform/App.Web/ClientApp/src/services/CanvasJsonSerializer.ts"]',
    confidence: 98,
  },

  // ── 失敗案例 (failure) × 5 ──
  {
    created_by: 'SEED',
    created_at: '2026-02-10T14:00:00Z',
    category: 'failure',
    tech_stack: 'QuestPDF,.NET',
    title: 'QuestPDF PDF 中文字型缺失導致亂碼',
    problem: 'PDF 輸出中文字（繁體中文標題、說明文字）顯示為方塊或亂碼。QuestPDF 預設不含中文字型，Windows dev 環境正常但 Linux Docker 環境失敗。',
    solution: '未完全解決（Phase 0 失敗案例記錄）。當前 workaround：在 PdfWorker Docker image 中預裝 Noto CJK 字型，並在 QuestPDF FontManager.RegisterFontFromFile() 明確載入。長期需要在 Dockerfile 加入 fonts-noto-cjk 套件。',
    outcome: 'failure',
    lessons: 'PDF 字型問題是 Linux/Docker 部署的常見陷阱。dev/prod 環境差異需要在 CI 環境測試。PdfGeneratorService 應在啟動時驗證字型可用性，啟動失敗比靜默亂碼更容易診斷。',
    tags: '["PDF","QuestPDF","Chinese font","中文字型","Docker","Linux","字型缺失"]',
    related_files: '["src/Platform/App.PdfWorker/Services/PdfGeneratorService.cs","src/Platform/App.PdfWorker/Dockerfile"]',
    confidence: 70,
  },
  {
    created_by: 'SEED',
    created_at: '2026-02-15T16:00:00Z',
    category: 'failure',
    tech_stack: 'CSS,React,Fabric.js',
    title: 'CSS transform 動畫與 Fabric.js translate 衝突',
    problem: '在 Canvas 容器使用 CSS transform: scale() 動畫（載入進度效果）導致 Fabric.js 的物件座標計算錯誤，滑鼠點擊偏移。根因：Fabric.js 內部用 getBoundingClientRect() 計算座標，CSS transform 影響其計算結果。',
    solution: '禁止在 Canvas 容器或任何祖先元素使用 CSS transform 動畫。載入動畫改用 opacity 漸變或 skeleton overlay（絕對定位，不影響 Fabric.js 座標計算）。editor.css 已加入 .canvas-wrapper { transform: none !important } 防護。',
    outcome: 'failure',
    lessons: 'Fabric.js 座標計算依賴 DOM 的幾何位置，CSS transform 是禁用的。CLAUDE.md 已新增禁止規則：「禁止動畫使用 CSS transform（與 translate 衝突）」。',
    tags: '["CSS","transform","Fabric.js","Canvas","動畫","座標衝突","CLAUDE.md禁止"]',
    related_files: '["src/Platform/App.Web/ClientApp/src/styles/editor.css","src/Platform/App.Web/ClientApp/src/components/Editor/PhycCanvas.tsx"]',
    confidence: 95,
  },
  {
    created_by: 'SEED',
    created_at: '2026-02-20T10:00:00Z',
    category: 'failure',
    tech_stack: 'SQLite,Node.js',
    title: 'Phase 1+ 表邊界違規：Context Memory Phase 0 PoC',
    problem: '早期原型實作時誤在 Phase 0 DB 建立了 stories 表（Phase 1 功能），導致 Phase 0 PoC 混入未設計的功能，驗證腳本無法確認 Phase 邊界。',
    solution: '在 init-db.js 新增 PHASE1_PLUS_TABLES 常數陣列，初始化後立即掃描 sqlite_master 表，若發現 Phase 1+ 表則拋出錯誤並 exit(1)。此設計讓 Phase 邊界違規在啟動時立即失敗。',
    outcome: 'failure',
    lessons: 'PoC 的範圍邊界必須在程式碼層面強制執行，不能只靠文件說明。TD-32a 的 Phase 邊界驗證（否定測試）現已成為標準 pattern。',
    tags: '["SQLite","Phase boundary","Context Memory","TD-32a","PoC","邊界違規"]',
    related_files: '[".context-db/scripts/init-db.js"]',
    confidence: 90,
  },
  {
    created_by: 'SEED',
    created_at: '2026-02-20T14:00:00Z',
    category: 'failure',
    tech_stack: 'Node.js,ESM',
    title: 'CommonJS require() 在 ESM 套件中使用失敗',
    problem: '初版 MCP Server 使用 require() 匯入 @modelcontextprotocol/sdk，啟動時拋出 "require() of ES Module not supported" 錯誤。package.json 預設為 CommonJS 模式。',
    solution: '將 package.json 新增 "type": "module" 切換至 ESM 模式。所有 require() 改為 import。__dirname 改為 fileURLToPath(import.meta.url)。process.exit() 呼叫確保在 async 錯誤時正確退出。',
    outcome: 'failure',
    lessons: '現代 Node.js 生態系正向 ESM 遷移，新套件常為純 ESM。開始新 Node.js 專案前先確認主要依賴套件的模組格式，優先選 ESM。require() 和 import 不可混用。',
    tags: '["ESM","CommonJS","require","Node.js","import.meta.url","MCP","TD-32b"]',
    related_files: '[".context-db/package.json",".context-db/server.js"]',
    confidence: 95,
  },
  {
    created_by: 'SEED',
    created_at: '2026-02-01T09:00:00Z',
    category: 'failure',
    tech_stack: 'ASP.NET Core,Identity',
    title: 'Admin OAuth 外部登入裝置管理缺失',
    problem: 'QGR-M2：使用者透過 Google/GitHub OAuth 登入後，其裝置 Session 未被追蹤，無法在「裝置管理」頁面顯示，也無法遠端登出。外部登入和本地登入走不同程式路徑，造成裝置記錄遺漏。',
    solution: '在 ExternalLogin.cshtml.cs 的 OnPostConfirmationAsync() 中加入 DeviceSessionService.RecordLoginAsync()，確保外部登入也記錄裝置 Session。同時在 Login.cshtml.cs 加入相同呼叫確保一致性。',
    outcome: 'failure',
    lessons: '功能新增時需考慮所有入口點（本地登入、外部登入、API 登入等）。OAuth 流程與本地登入流程的差異需要明確文件化。DeviceSession 記錄應在集中的 Middleware 而非分散在各 Controller。',
    tags: '["OAuth","外部登入","DeviceSession","裝置管理","Identity","QGR-M2","Google"]',
    related_files: '["src/Platform/App.Web/Areas/Identity/Pages/Account/ExternalLogin.cshtml.cs","src/Platform/App.Web/Services/DeviceSessionService.cs"]',
    confidence: 85,
  },
];

// ──────────────────────────────────────────────
// 主程式：冪等匯入
// ──────────────────────────────────────────────
function runSeed() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  console.log('🌱 PCPT Context Memory DB — 種子資料匯入開始');
  console.log(`   DB: ${DB_PATH}`);
  console.log('');

  // 冪等：清除舊的 SEED agent_id 資料
  const delCtx = db.prepare("DELETE FROM context_entries WHERE agent_id = 'SEED'");
  const delTech = db.prepare("DELETE FROM tech_entries WHERE created_by = 'SEED'");
  const ctxDel = delCtx.run();
  const techDel = delTech.run();
  if (ctxDel.changes > 0 || techDel.changes > 0) {
    console.log(`   ♻️  清除舊種子資料: context_entries x${ctxDel.changes}, tech_entries x${techDel.changes}`);
  }

  // 插入 context_entries
  const insertCtx = db.prepare(`
    INSERT INTO context_entries
      (agent_id, timestamp, category, tags, title, content, related_files, story_id, epic_id)
    VALUES
      (@agent_id, @timestamp, @category, @tags, @title, @content, @related_files, @story_id, @epic_id)
  `);

  console.log(`[1] 匯入 context_entries（${seedContextEntries.length} 筆）...`);
  let ctxCount = 0;
  for (const entry of seedContextEntries) {
    insertCtx.run(entry);
    ctxCount++;
    console.log(`   ✅ [CE-${ctxCount}] ${entry.title}`);
  }

  // 插入 tech_entries
  const insertTech = db.prepare(`
    INSERT INTO tech_entries
      (created_by, created_at, category, tech_stack, title, problem, solution, outcome, lessons, tags, related_files, confidence)
    VALUES
      (@created_by, @created_at, @category, @tech_stack, @title, @problem, @solution, @outcome, @lessons, @tags, @related_files, @confidence)
  `);

  console.log('');
  console.log(`[2] 匯入 tech_entries（${seedTechEntries.length} 筆）...`);
  let techCount = 0;
  for (const entry of seedTechEntries) {
    insertTech.run(entry);
    techCount++;
    console.log(`   ✅ [TE-${techCount}] [${entry.category}] ${entry.title}`);
  }

  // 統計
  const ctxTotal = db.prepare('SELECT COUNT(*) as count FROM context_entries').get();
  const techTotal = db.prepare('SELECT COUNT(*) as count FROM tech_entries').get();

  console.log('');
  console.log('✅ 種子資料匯入完成');
  console.log(`   context_entries 總計: ${ctxTotal.count} 筆`);
  console.log(`   tech_entries 總計: ${techTotal.count} 筆`);

  db.close();
}

try {
  runSeed();
} catch (err) {
  console.error('❌ 種子資料匯入失敗:', err.message);
  process.exit(1);
}
