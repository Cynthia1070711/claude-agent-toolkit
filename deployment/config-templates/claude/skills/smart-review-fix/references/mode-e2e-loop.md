# E2E Loop Mode — 智能循環修復模式

> 觸發: `/smart-review-fix e2e-loop [scope]`、`/smart-review-fix 循環修復`
> 目標: E2E 瀏覽器測試驅動的**即時發現→修復→驗證**閉環
> 適用: 大規模修復後回歸測試、登入/功能路徑全面異常、上線前全路徑驗證
> 與 Phase 1~5 差異: Phase 1~5 是靜態 Code/Security 審查；E2E Loop 是**動態瀏覽器測試**

---

## Architecture — 中控指揮 + 三類子視窗

```
┌──────────────────────────────────────────────────────────────────────┐
│              E2E Loop Mode — 智能循環修復模式                          │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │          中控（當前對話 · CC-OPUS · 純指揮官）                 │    │
│  │                                                             │    │
│  │  職責: 規劃排程 → 配發任務 → 讀取回報 → 讀 DB 確認          │    │
│  │       → 判斷下一步 → 配發下一輪 → ... → 彙整結案報告        │    │
│  │                                                             │    │
│  │  禁止: 直接操作 Chrome / 修改 src/ / 執行 E2E 測試          │    │
│  └──┬───────────────┬───────────────┬──────────────────────┘    │
│     │               │               │                           │
│     ▼               ▼               ▼                           │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                  │
│  │E2E 審核視窗 │ │修復視窗     │ │驗證視窗     │                  │
│  │(Sonnet)    │ │(Sonnet)    │ │(Sonnet)    │                  │
│  │Chrome MCP  │ │Pipeline    │ │Chrome MCP  │                  │
│  │輸出:Report │ │輸出:DB done│ │輸出:驗證報告│                  │
│  └────────────┘ └────────────┘ └────────────┘                  │
│                                                                      │
│  ◄── 循環: E2E發現 → 中控分析 → 修復 → 驗證 → PASS/繼續 ────►     │
└──────────────────────────────────────────────────────────────────────┘
```

**角色分工（CRITICAL — 中控不親自執行任何測試或修復）**:

| 角色 | 執行者 | 模型 | 工具 | 職責 |
|------|--------|:----:|------|------|
| **中控** | 當前對話 | **Opus** | Read DB / Read 報告 / Bash run_in_background | 規劃排程、配發任務、彙整回報、判斷下一步 |
| **E2E 審核子視窗** | 獨立 Session | **Sonnet** | Chrome DevTools MCP + Read/Grep | 瀏覽器遍歷功能路徑→截圖→記錄 Bug |
| **修復子視窗** | 獨立 Session | **Sonnet** | Full Toolkit (Edit/Write/Bash) | dev-story / code-review / direct-fix |
| **驗證子視窗** | 獨立 Session | **Sonnet** | Chrome DevTools MCP + Read/Grep | 複查修復路徑→對比前後→判定 PASS/FAIL |

**設計原則**:
- 中控 = 大腦（決策 + 調度），子視窗 = 手腳（執行）
- 所有子視窗使用 **Sonnet** 模式
- E2E/驗證子視窗獨佔 Chrome MCP（同一時間只能有一個 Chrome 操作視窗）
- 修復子視窗可 <=2 並行（不使用 Chrome，不衝突）

---

## Phase L0: 前置檢查 (Prerequisites)

| # | 檢查項 | 命令 / 方式 | 失敗處理 |
|---|--------|-----------|---------|
| 1 | **後端伺服器** Port 7135 | `curl -s -o /dev/null -w '%{http_code}' https://localhost:7135/` | `/start-servers` |
| 2 | **前端 Dev Server** Port 5173 | `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/` | `npm run dev` |
| 3 | **Chrome 可連線** | `mcp__chrome-devtools__list_pages` | 確認 Chrome + DevTools |
| 4 | **測試帳號可用** | A1~user5@example.com / ExamplePw123 | — |

---

## Phase L1: E2E 探索測試（E2E 審核子視窗 · Sonnet）

### Step L1.0: 中控啟動 E2E 子視窗

```powershell
powershell -Command "Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue; Set-Location '{ProjectRoot}'; echo '{E2E_PROMPT}' | claude --model sonnet --dangerously-skip-permissions"
```

**E2E_PROMPT 模板**:
```
你是 E2E 審核員。使用 Chrome DevTools MCP 測試 PhyCool 平台。
測試範圍: {scope}
測試帳號: {email} / ExamplePw123
伺服器: https://localhost:7135

任務:
1. 使用 mcp__chrome-devtools__navigate_page 開啟登入頁
2. 使用 mcp__chrome-devtools__fill 填入帳密
3. 依序測試以下路徑: {path_list}
4. 每個路徑: 截圖 + 檢查 console + 檢查 network
5. 發現異常時記錄結構化 Bug Report
6. 完成後將結果寫入: {output_file_path}
```

### Step L1.1: 測試範圍

| Scope | 測試路徑 | 預估測試項 |
|-------|---------|-----------|
| `all` (預設) | 全平台 | 30~50 項 |
| `auth` | 登入/登出/註冊/忘記密碼/OAuth | 8~12 項 |
| `editor` | 編輯器核心/建立/編輯/儲存/預覽/PDF | 15~20 項 |
| `admin` | Admin 後台全模組 | 20~30 項 |
| `payment` | 方案/結帳/訂單/升降級 | 10~15 項 |

### Step L1.2: 系統化測試流程

每個路徑: navigate → screenshot → 操作 → wait → screenshot → console → network → 判定

每個帳號遍歷:
- A1 (Free) → 測試 Free 限制
- A3 (Advanced) → 測試付費功能
- A5 (Business) → 測試最高等級

### Step L1.3: Bug Report 格式

```markdown
### BUG-E2E-{SEQ:03d} — {簡短標題}

| Field | Value |
|-------|-------|
| **路徑** | `{URL}` |
| **測試帳號** | {email} ({plan}) |
| **操作步驟** | 1. {step1} 2. {step2} ... |
| **預期行為** | {expected} |
| **實際行為** | {actual} |
| **嚴重度** | P0-阻塞 / P1-功能異常 / P2-體驗問題 |
| **截圖** | {path} |
| **Console 錯誤** | `{error}` |
| **Network 失敗** | `{status} {method} {url}` |
| **根因推測** | {initial analysis} |
```

---

## Phase L2: 中控分析 + 建立修復 Story

中控收到 E2E 子視窗完成通知後：
1. **Read 輸出檔** — 讀取 Bug Report
2. **Read 程式碼** — 根據 Console/Network 定位 file:line（中控可讀不可改）
3. **查記憶庫** — `search_context` 檢查已知問題
4. **分類 Bug**: 前端/後端/配置/資料
5. **建立修復 Story** — DB-first (upsert-story.js)
6. **規劃排程** — 修復順序 + 衝突矩陣

### Story 建立策略

| Bug 數量 | 策略 |
|----------|------|
| 1~3 個同模組 | 合併為一個 Story |
| 4+ 個同模組 | 拆分為 2~3 個 Story |
| 跨模組 | 每模組獨立 Story |
| P0 阻塞 | 單獨 Story，最高優先 |

### 修復排程規劃

- **P0 阻塞**: 立即修復（登入失敗 → 後續全部 BLOCKED）
- **P1 功能異常**: 依模組分批，max 2 並行
- **P2 體驗問題**: 累積後批次修復
- **衝突**: 同檔案 → SERIALIZE

---

## Phase L3: 啟動修復子視窗

### 修復模式選擇

| 條件 | 模式 | 啟動方式 |
|------|------|---------|
| S + 明確根因 + 1~2 檔案 | **4B Direct-Fix** | srf-story-pipeline -FixMode 4B |
| M+ / 跨模組 | **4A Workflow** | Pipeline 完整流程 |
| 極簡（1 行 config/typo） | **Inline Fix** | 中控直接修復 |

### 啟動修復子視窗 (Pipeline)

```powershell
powershell -Command "Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue; Set-Location '{ProjectRoot}'; & './.claude/skills/smart-review-fix/scripts/srf-story-pipeline.ps1' -StoryId '{STORY_ID}' -FixMode '{4A|4B}' -EpicId 'epic-e2e-loop' -TimeoutMin 30"
```

### 並行規則

- 一般修復: max 2 並行
- 衝突 Story: SERIALIZE
- 交錯啟動: 間隔 10 秒

### 修復完成處理

收到通知 → Read DB 確認:
- `done` → Phase L4 複查
- `review` → code-review 進行中，等待
- `in-progress/failed` → check git diff → auto-correct 或手動

---

## Phase L4: E2E 複查（驗證子視窗）

修復完成後，中控委派**驗證子視窗 (Sonnet)** 執行複查。

> **Chrome MCP 互斥**: E2E 子視窗 (L1) 與驗證子視窗 (L4) 不可同時運行。

### 啟動驗證子視窗

```powershell
$VERIFY_PROMPT = @"
你是 E2E 驗證子視窗 (Sonnet)。複查修復完成的 Bug。

## 複查目標
- Bug ID: {BUG_ID}
- 原始異常 URL: {URL}
- 原始操作步驟: {STEPS}
- 修復 Story: {STORY_ID}
- 修復涉及: {AFFECTED_FILES}

## 複查流程
1. 若修復涉及 .cs → 確認伺服器已重啟
2. Chrome DevTools MCP: navigate_page → 原始異常 URL
3. 依照原始操作步驟重現（應已修復）
4. take_screenshot → 記錄複查結果
5. read_console_message → 確認 Console 無錯誤
6. list_network_requests → 確認 API 正常
7. 判定: PASS / FAIL（附證據）

## 輸出
寫入 `docs/implementation-artifacts/reports/e2e-loop/verify-{BUG_ID}.md`
"@
```

### 複查結果處理

| 結果 | 動作 | 下一步 |
|------|------|--------|
| **PASS** | 標記 fixed + 更新 DB | 繼續下一個 Bug |
| **FAIL (Round 1~2)** | 記錄失敗原因 → 補充 dev_notes | 回到 L3 |
| **FAIL (Round 3)** | 標記 `deferred` | 跳過，繼續下一個 |
| **部分修復** | 拆分新 Bug | 入佇列 |
| **新發現 Bug** | 新 Bug Report | 入佇列 |

### 重啟伺服器判斷

| 修復類型 | 需重啟 |
|----------|:------:|
| C# Controller / Service / config | Yes |
| React Component / CSS / TS | No (Vite HMR) |
| DB Migration | Yes + `dotnet ef database update` |

---

## Phase L5: 循環控制 + 結束條件

### Loop 控制變數

| Variable | Value | Description |
|----------|-------|-------------|
| MAX_FIX_ROUNDS | 3 | 每個 Bug 最多修復嘗試次數 |
| MAX_CONCURRENT_FIX | 2 | 最大並行修復子視窗數 |
| MAX_LOOP_ITERATIONS | 10 | 整體循環上限 |
| FIX_TIMEOUT_MIN | 30 | 單次修復超時 |

### 循環流程

```
WHILE (佇列非空 OR 有修復中) AND (iteration < MAX_LOOP_ITERATIONS):
  IF 有待測試路徑: L1 → L2 (新 Bug 入佇列)
  IF 有修復完成:   L4 複查 → PASS:fixed / FAIL+<MAX:retry / FAIL+>=MAX:deferred
  IF 有空閒 slot:  L3 啟動修復
  iteration++
END WHILE
```

### 結束條件

| 條件 | 結果 |
|------|------|
| 全部 PASS + 佇列清空 | **SUCCESS** |
| 佇列清空 + 部分 deferred | **PARTIAL** |
| 達到 MAX_LOOP_ITERATIONS | **TIMEOUT** |
| 使用者中斷 | **ABORTED** |

### 進度追蹤面板

每個循環結束時，中控輸出:

```markdown
## E2E Loop 進度 — Iteration {N}/{MAX}

| Bug ID | 路徑 | 嚴重度 | 狀態 | 修復輪次 | 最後複查 |
|--------|------|:------:|:----:|:-------:|:-------:|

**統計**: 測試 {N} 路徑 | PASS {N} | FAIL {N} | BLOCKED {N}
**修復**: 發現 {N} Bug | Fixed {N} | Fixing {N} | Queued {N} | Deferred {N}
**子視窗**: 運行中 {N}/2 | 完成 {N} | 失敗 {N}
```

---

## E2E Loop Report (閉環報告)

**輸出路徑**: `docs/implementation-artifacts/reports/e2e-loop/e2e-loop-{date}-report.md`

Report sections: 測試範圍 / 測試結果 / 修復統計 / Deferred 項目 / 功能健康度

---

## E2E Loop Forbidden Patterns

- **Chrome MCP 衝突**: E2E 子視窗 (L1) 與驗證子視窗 (L4) 不可同時運行。中控負責排程互斥
- **無限循環**: 同一 Bug 超過 3 輪 → 必須 `deferred`
- **盲目修復**: 禁止不分析根因就啟動修復（必須 Read 程式碼 + Console/Network 證據）
- **跳過複查**: 修復後禁止不複查就標記 fixed（必須 Chrome MCP 實測）
- **忽略伺服器重啟**: .cs 修復後未重啟就複查 → 不可信
- **P0 不優先**: P0 阻塞 Bug 必須最先修復
- **中控直接操作**: 中控不修改程式碼、不操作 Chrome MCP。僅限 Read + 規劃 + DB
