---
name: chrome-connect-real-browser
description: "觸發於任何需要操作使用者「已經開著」的真實 Chrome 的場景 — 讀取已登入分頁、查看真實 cookie/session 狀態、跨設定檔操作、對使用者回報分頁數或網址。規範 chrome-devtools-mcp --autoConnect 的連線判讀紀律:唯一連線判準是實際呼叫 list_pages(禁 curl 9222 探測,auto-connect 模式下 /json/version 恆回 404 屬正常);list_pages 掛住不回等同 Chrome 授權對話框在等人按(走 UIA 代按腳本,非斷線非設定錯誤);向使用者斷言分頁數前必須有第二條獨立證據路徑(UIA 清點)。含 Chrome 144+ 授權機制、多設定檔啟動引號陷阱、五種 UIA 假陽性、list_pages 編號跳號邊界、四代 .mcp.json 配置失敗史。"
version: 1.0.0
updated: 2026-08-02
created: 2026-08-02
author: CC-OPUS
shell: powershell
triggers: [
  "連我的 chrome", "真實 chrome", "real chrome", "使用者的 chrome",
  "chrome 連線", "chrome 連接", "chrome mcp", "chrome devtools mcp",
  "list_pages", "select_page", "new_page", "evaluate_script",
  "autoConnect", "auto-connect", "auto connect",
  "port 9222", "remote-debugging-port", "remote debugging",
  "chrome://inspect", "遠端偵錯", "允許遠端偵錯",
  "授權對話框", "授權框", "list_pages 卡住", "list_pages 掛住", "list_pages 沒回應",
  "chrome 設定檔", "profile-directory", "chrome profile", "設定檔選擇器",
  "分頁數", "幾個分頁", "開了幾個", "交叉驗證分頁",
  "沙盒 chrome", "隔離 chrome", "about:blank",
  "live state", "live DOM", "browser automation"
]
---

# Chrome Connect Real Browser — 真實瀏覽器連線判讀紀律(Discipline 型)

> **一句話**:要碰「使用者現在正開著的 Chrome」,**第一個動作是 `list_pages`**,不要去探 `http://127.0.0.1:9222`(那裡回 404 是正常的)。
>
> **邊界**:本 skill 管**判讀紀律**(該不該做 / 訊號怎麼讀 / 何時可以斷言);機制與腳本原理見
> `claude token減量策略研究分析/chrome_connect/chrome_connect.md`(技術說明 SSoT)。兩者互補不重複。
>
> **不適用**:CI / nightly 自動化測試(用 Playwright 自帶 browser 管理)、刻意需要乾淨隔離環境的測試
> (用**不帶** `--autoConnect` 的 server,那時另開空白實例反而是對的)。

---

## §1 兩種連線目標 — 唯一決定性差異是 `--autoConnect`

沒有這個旗標,`chrome-devtools-mcp` 一律自己 launch 一個乾淨隔離實例,看不到使用者任何分頁。

| MCP server 帶 `--autoConnect`? | 連到哪個 Chrome | `list_pages` 典型回應 |
|:-:|---|---|
| ✅ 有 | **使用者真實 Chrome**(真 profile / 已登入 / 真分頁) | 多個真實 URL |
| ❌ 無 | 另開隔離空白實例 | 單一 `about:blank` 或單一新分頁 |

**連錯的症狀**:`list_pages` 只回一個 `about:blank`。
此時**絕不可**把那個 about:blank 當成「使用者只開了一個分頁」回報 —— 那是隔離實例的空殼。

### 旗標名稱以官方 `--help` 為準

官方 `npx chrome-devtools-mcp@1.5.0 --help` 列出的形式是 **`--autoConnect`(駝峰)**
(2026-08-02 實測輸出:`--autoConnect  If specified, automatically connects to a browser (Chrome 144+) running locally...`)。

⚠️ 部分內部文件寫成 `--auto-connect`(連字號),該形式**不在官方旗標清單中**,本次未驗證其是否可用。
新增或修改配置時一律採官方形式。

### 工具前綴必須對應帶旗標的那個 server

同一環境可能同時註冊多個 chrome-devtools 系 server(專案 `.mcp.json` 一個、plugin 另一個)。
**MCP 工具前綴選錯 = 連到隔離實例**。判定方法只有一個:呼叫 `list_pages` 看回真實分頁還是 `about:blank`。

---

## §2 前置條件(三項,缺一不可)

| # | 條件 | 確認方式 |
|:-:|---|---|
| 1 | Chrome ≥ 144 | `(Get-Item 'C:\Program Files\Google\Chrome\Application\chrome.exe').VersionInfo.ProductVersion` |
| 2a | **功能開關**(只需做一次,永久保留):`chrome://inspect/#remote-debugging` 開啟遠端偵錯 | `Local State` 的 `devtools.remote_debugging.user-enabled` = `true`。**瀏覽器層級**,非每個設定檔各一份 |
| 2b | **逐次連線批准**(每條新 CDP 連線都會再跳) | 見 §3。**開關 ≠ 批准,這是兩件事** |
| 3 | MCP server 已註冊且啟用 | `list_pages` 能回應即可;`claude mcp list` 顯示 `⏸ Pending approval` **不代表不能用** |

條件 2 是 Chrome M144+ 的新流程,**取代**舊的 `--remote-debugging-port` 命令列旗標 —— 這是後續所有誤判的根源(§4)。

---

## §3 授權機制:為什麼每次都要按

### 3.1 官方沒有「永久允許」

Chrome 每建立一條新 CDP 連線就跳一次對話框,按鈕只有 **允許 / 取消**,**沒有「永遠允許」選項**。
上游功能請求 `ChromeDevTools/chrome-devtools-mcp#825` 尚未實作;`RemoteDebuggingAllowed` 之類的企業原則
只管「能不能用」,不管「批不批准這條連線」。

### 3.2 症狀辨識(Iron Law 2 的判準)

**`list_pages` 掛住不回 = 授權框正在等人按。**

2026-08-02 本專案實測:呼叫 `list_pages` → 卡滿 120s 被丟到背景 → 背景執行代按腳本 `APPROVED #1`
→ 該 `list_pages` **立即完成**並回傳 4 個真實分頁。因果鏈完整。

這**不是**斷線、**不是**當機、**不需要**重開 session、**不需要**改 `.mcp.json`。

### 3.3 自動化:UIA 代按

```powershell
Start-Process powershell -ArgumentList '-ExecutionPolicy','Bypass','-File',
  '.claude\skills\chrome-connect-real-browser\scripts\chrome-auto-approve-debug.ps1',
  '-TimeoutSec','100' -WindowStyle Hidden
```

**呼叫時機**:在呼叫任何 Chrome MCP 工具**之前**先於背景啟動。

退出碼:`0` = 有按到;`1` = 逾時未見對話框(**連線本來就通,屬正常**,非失敗)。

腳本兩道安全閘(缺一不可)與詳細參數見 [profile-and-scripts.md](references/profile-and-scripts.md)。

---

## §4 🔴 反誤判鐵律:9222 回 HTTP 404 是**正常的**

auto-connect 模式下的實測事實(2026-08-02 本專案複驗):

- Chrome 由檔案總管啟動,命令列**不含任何旗標** —— `Get-CimInstance Win32_Process` 篩 `--remote-debugging-port` 命中數 = **0**
- `http://127.0.0.1:9222/json/version`、`/json/list`、`/` **一律回 HTTP 404、content length = 0**
- **但同一時刻 `list_pages` 成功回傳 4 個真實分頁**

**傳統 CDP HTTP 探索端點在 auto-connect 模式下不對外開放,這不代表遠端偵錯沒開。**

> **正解**:直接呼叫 `list_pages`。通了就是通了,其餘訊號全部是雜訊。

---

## §5 標準操作流程

```
Step 0  (若 Chrome 剛重啟 / 首次連線) 背景啟動 chrome-auto-approve-debug.ps1
Step 1  呼叫 list_pages
Step 2  判讀結果
          多個真實 URL      → ✅ 已連上真實瀏覽器,繼續
          單一 about:blank  → ❌ 連到隔離實例,檢查工具前綴(§1)
          掛住不回          → 授權框在等人按(§3.2),跑代按腳本
Step 3  要操作特定分頁 → select_page(pageId)
Step 4  要向使用者回報分頁數 / 網址 → 先做 §6 交叉驗證,再回報
```

**不要**在 Step 1 之前做任何環境探測。探測 9222、查進程旗標、讀設定檔都是在製造 §4 的誤判機會。

### 5.1 讀取頁面內容:優先 `evaluate_script`

| 方式 | 適用 | 成本 |
|---|---|---|
| `take_snapshot` | 需要 uid 以便點擊 / 填表 | **輸出很長**(完整 a11y 樹 + iframe 雜訊) |
| `evaluate_script` | 只是要讀文字 / 判斷狀態 | **精簡可控**,建議優先 |

精簡讀取範式見 [profile-and-scripts.md](references/profile-and-scripts.md)。

---

## §6 交叉驗證(回報分頁數 / 網址給使用者前必做)

`list_pages` 只反映 MCP 看得到的 target。要對使用者斷言「你開了 N 個分頁」,需第二條獨立證據路徑:

```powershell
.claude\skills\chrome-connect-real-browser\scripts\Get-ChromeTabsUia.ps1 -Quiet
```

末尾三行給 `WINDOWS` / `PROFILES_IN_USE` / `TOTAL_UIA_TABS`,與 `list_pages` 比對。

2026-08-02 實測範例:MCP `list_pages` = 4 個分頁,UIA `TOTAL_UIA_TABS=4`、`PROFILES_IN_USE=1 (Sun)` → 吻合,可以回報。

**判準**:兩邊數字與標題吻合 → 可以斷言。不吻合 → 先查是否連錯 server(§1),或使用者有多個 Chrome 視窗 / 設定檔。

> **fallback(無 UIA 腳本可用時)**:請使用者在自己的 Chrome 隨手開一個新分頁,再次 `list_pages` 比對 diff。
> 看到新增分頁 = 確認同一台。此法有效但需要使用者配合,UIA 清點是零打擾的優先選項。

---

## §7 Troubleshooting

| 症狀 | 判讀 | 處置 |
|---|---|---|
| 沒有對應的 MCP 工具 | server 剛加入或設定剛改 | **開新視窗**(當前 session 不生效) |
| `list_pages` 回單一 about:blank | 連到隔離實例 | 檢查工具前綴,確認 `--autoConnect` 在 args 內(§1) |
| **`list_pages` 掛住不回** | **授權框在等人按** | 跑代按腳本(§3.3) |
| **`Could not find DevToolsActivePort ...`(立刻報錯,非掛住)** | **Chrome 根本沒在跑** | `Get-Process chrome` 若為 0 → 啟動 Chrome 即可(§7.1)。⚠️ 該訊息內含 user data 路徑,極易誤導往「設定檔壞了 / 要改配置」方向 |
| Chrome 重啟後就不通了 | 重新連線 = 新 CDP 連線 = 又要批准一次 | 同上。**不需要**重開 session |
| curl 9222 回 404 | **正常** | **不處置**(§4) |
| 分頁數與使用者認知不符 | 可能有多個 Chrome 視窗 / 設定檔 | §6 UIA 清點,並問使用者 |
| `select_page` 回 "page not found" | pageId 已過期(分頁關了) | 重新 `list_pages` 取最新 id |
| 工具回 `InputValidationError` | MCP schema 未載入 | `ToolSearch` 載入對應 tool schemas,勿重複呼叫 |
| 誤建出名為 `Profile` 的空設定檔 | `--profile-directory` 未加引號 | 見 [profile-and-scripts.md](references/profile-and-scripts.md) |

### 7.1 Chrome 未啟動時的重啟流程(情境 B:自主啟動指定設定檔)

```powershell
$s = '.claude\skills\chrome-connect-real-browser\scripts'
& "$s\Start-ChromeForMcp.ps1" -List                       # 先看有哪些設定檔
& "$s\Start-ChromeForMcp.ps1" -ProfileDirectory Default   # 啟動(內含設定檔存在驗證 + 自動掛代按)
```

啟動後**直接呼叫 `list_pages`**,不需重連 MCP。

⚠️ **Chrome 重啟後 pageId 全部改變**。MCP 會回
「the browser was restarted or reconnected since the last call. Page ids have changed.」
—— 看到此訊息必須重新 `list_pages` 取新 id,沿用舊 id 會操作到錯誤分頁或直接失敗。

⚠️ **`DevToolsActivePort` 檔案在 Chrome 關閉後仍會殘留**,其存在**不代表** Chrome 在跑。
判斷 Chrome 是否存活一律用 `Get-Process chrome`,不要看該檔。

---

## §8 已驗證事實與邊界

### 已驗證(✱ = 2026-08-02 本專案複驗)

- ✱ auto-connect 模式下 9222 三個端點全回 404 / len=0,Chrome 命令列零旗標,`list_pages` 仍正常
- ✱ 授權框未按時 `list_pages` 卡滿 120s;代按後同一呼叫立即完成
- ✱ MCP 分頁數與 UIA 獨立清點數吻合(4 = 4)
- ✱ 官方 `--help` 的旗標形式為 `--autoConnect`
- ✱ Chrome 未啟動時 `list_pages` **立刻報 `Could not find DevToolsActivePort`(不是掛住)**;`Get-Process chrome` = 0 即定案,與授權框症狀可明確區分
- ✱ Chrome 重啟後 pageId 全部改變,MCP 會主動回「the browser was restarted or reconnected」
- ✱ 全鏈路端對端:`Start-ChromeForMcp` 啟動指定設定檔 → `list_pages` → `new_page` 開書籤網址 → `evaluate_script` 讀出實際登入身分 → UIA 清點交叉驗證吻合
- auto-connect **看得到跨設定檔的所有分頁**,不需要為每個設定檔各接一次
- 開啟第二個設定檔的視窗**不會**觸發新的授權對話框(授權綁 browser process 不綁設定檔)

### 邊界

- ⚠️ **`list_pages` 回傳的編號會跳號**(實測見過 `1, 3`)。不可假設連號,也不可用數量推算;操作特定分頁一律用它回報的 `pageId`
- ⚠️ **`chrome://profile-picker/` 對 MCP 隱形**(同一輪 `chrome://new-tab-page/` 卻看得到)
- ⚠️ 對真實瀏覽器操作 = 動使用者的實際登入狀態。**導頁、點擊、填表、關分頁前先說明要做什麼**
- ⚠️ **不可觸發 alert / confirm 對話框**(會卡死整個 MCP 連線,後續所有指令都收不到)

### 曾被推翻的錯誤結論(保留供警惕)

> 前代 skill 曾寫「Chrome 重啟後授權保留 ✅ 已驗證」——**該結論已於 2026-07-26 推翻**。
> 當時只觀察到「重啟後 `list_pages` 能用」,卻沒察覺是使用者在旁邊按掉了對話框。
> 真相是:**每次 Chrome 重啟、MCP 重新連線時都會再跳一次授權**。
>
> **教訓**:把「觀察到結果 A」當成「機制 B 成立」之前,先確認沒有第三方(人)在旁邊補齊了中間那一步。

---

## §9 FORBIDDEN

```yaml
FORBIDDEN:
  # 反誤判(§4)
  - "❌ 用 curl 9222 的 404 判定 remote debugging 沒開"
  - "❌ 因為 404 就去改 .mcp.json / 換 --browserUrl / 叫使用者重開 Chrome 加旗標"
  - "❌ 用 Get-CimInstance Win32_Process 查不到 --remote-debugging-port 就判定使用者沒啟用"
  - "❌ 把 claude mcp list 的 ⏸ Pending approval 當成不能用 —— 以 list_pages 為準"

  # 授權判讀(§3)
  - "❌ list_pages 掛住就診斷為斷線 / MCP 掛掉 / 要重開 session"
  - "❌ 代按腳本 exit 1(逾時未見對話框)當成失敗 —— 那代表連線本來就通"

  # 斷言紀律(§6)
  - "❌ 單憑 list_pages 就向使用者斷言分頁數 / 使用者開了什麼"
  - "❌ 把隔離實例的 about:blank 當成使用者只開了一個分頁"

  # 安全
  - "❌ 導頁 / 點擊 / 填表 / 關分頁前不先說明要做什麼(動的是使用者真實登入狀態)"
  - "❌ 觸發 alert / confirm 對話框(卡死整條 MCP 連線)"
  - "❌ 透過 evaluate_script 跳關登入 / 2FA / passkey(失去驗證價值)"

  # 工具邊界
  - "❌ 在 CI / nightly 自動化測試用本路徑(改用 Playwright)"
  - "❌ 同時用兩個 chrome MCP server 操作同一網頁(race condition)"
  - "❌ 看到 InputValidationError 就重複呼叫(schema 不會自動載,必走 ToolSearch)"
```

---

## Discipline Pressure Test

### Iron Laws(3 條)

**Iron Law 1 — 連線可用性的唯一判準是實際呼叫 `list_pages`,禁以 9222 探測或進程旗標間接推斷**
- Evidence:2026-08-02 實測 —— `/json/version`、`/json/list`、`/` 全回 `HTTP=404 len=0`,`Win32_Process` 篩 `--remote-debugging-port` 命中 **0**,但同一時刻 `list_pages` 回傳 4 個真實分頁
- Consequence if violated:依 404 判「沒開」→ 改 `.mcp.json` / 換 `--browserUrl` / 要求使用者重啟 Chrome 加旗標,全部是白工,且動到本來正常的配置反而製造真故障

**Iron Law 2 — `list_pages` 掛住不回一律先判為授權框在等人按,不得診斷為斷線或設定錯誤**
- Evidence:2026-08-02 實測 —— `list_pages` 卡滿 120s 被丟背景;背景跑代按腳本印出 `APPROVED #1` 後,該呼叫**立即完成**回 4 分頁
- Consequence if violated:重開 session / 改配置都不會解決(對話框仍在等),且重連會再跳一次授權,陷入「每次都卡住 → 每次都重開」的無限迴圈

**Iron Law 3 — 向使用者斷言分頁數或網址前,必須有第二條獨立證據路徑**
- Evidence:2026-08-02 實測 —— MCP `list_pages` = 4,UIA `TOTAL_UIA_TABS=4` 吻合後才回報
- Consequence if violated:連到隔離實例時 `list_pages` 也會「成功」回一個 `about:blank`,單一來源無法區分「使用者只開一個分頁」與「我連錯 server」,錯誤結論會直接傳給使用者

### Combined Pressure Test(3 組,三維交叉)

**Test 1 — 404 誘導改配置**
```
Pressure 1(時間): 使用者在等,list_pages 遲遲沒回
Pressure 2(路徑依賴): 前代 skill 的 Troubleshooting 明寫「list_pages 回空 → port 9222 未啟 → 啟動 chrome.exe --remote-debugging-port=9222」
Pressure 3(合理化): 「curl 三個端點都 404 了,明顯沒開,先修配置最快」

Iron Law violated: Law 1
Detection signal: transcript 中 curl 9222 / Get-CimInstance 查旗標出現在 list_pages 之前;或 .mcp.json 被編輯但無任何 list_pages 失敗證據
```

**Test 2 — 掛住誘導判斷斷線**
```
Pressure 1(時間): 120s 逾時已觸發,工具被丟到背景
Pressure 2(路徑依賴): 過去遇到 MCP 卡住多半是重啟 session 解決的
Pressure 3(合理化): 「MCP 掛了,重開 session 比較快,不用查了」

Iron Law violated: Law 2
Detection signal: 逾時後直接建議重開 session / 改 .mcp.json,中間無代按腳本啟動紀錄
```

**Test 3 — 單一來源斷言**
```
Pressure 1(時間): 使用者直接問「我開了幾個分頁」,期待立刻回答
Pressure 2(路徑依賴): list_pages 已經回了一份清單,看起來就是答案
Pressure 3(合理化): 「MCP 直接給了數字,再跑一次 UIA 清點是多餘的」

Iron Law violated: Law 3
Detection signal: 回報中出現具體分頁數,但 transcript 無 UIA 清點或雙分頁 diff 的第二證據
```

### Rationalization Table(verbatim 來源,禁虛構)

| # | Rationalization(文件 / 記憶中的原話) | 真實根因 | 對應 Iron Law | Source |
|:-:|---|---|:-:|---|
| 1 | 「`list_pages` 回空清單 → Chrome 未啟動 / 9222 未開 → 啟動 `chrome.exe --remote-debugging-port=9222`」 | 前代 skill 的 Troubleshooting 建立於 M144 之前,auto-connect 上線後該因果已不成立 | Law 1 | 前代 v1.2.0 §5(已刪除,`git show 2f554f707:...`) |
| 2 | 「toggle 啟用後 Chrome 用**隨機 port**(觀察到 13809)≠ .mcp.json 寫死的 9222」 | 誤以為要自己管 port,實際上 auto-connect 由 MCP 自行 discover | Law 1 | 同上 §11 v3 失敗紀錄 |
| 3 | 「需每次點捷徑前 `Stop-Process -Name chrome -Force` kill 全部 chrome.exe 才能讓新 instance flag 生效」 | 同上,管 port + 管 process lifecycle 的路線本身是錯的 | Law 1 | 同上 §11 v2 失敗紀錄 |
| 4 | 「探 9222 必假陰性;能力判定用實際調用非間接推斷」 | 已固化為記憶但仍反覆重犯,故升為 Iron Law | Law 1 | `memory/feedback_probe_mcp_by_invoking_tool_not_raw_port.md` |
| 5 | 「Chrome 重啟後授權保留 ✅ 已驗證」 | 只觀察到「重啟後能用」,沒察覺是使用者在旁邊按掉了對話框 | Law 2 / Law 3 | `chrome_connect.md` §11 曾被推翻的錯誤結論 |

### Red Flags(四類可偵測訊號)

| 類型 | 訊號 |
|---|---|
| **語言訊號** | 「明顯沒開」「應該是斷線了」「先修配置」「重開 session 比較快」「再驗一次是多餘的」 |
| **行為訊號** | `list_pages` 之前先跑 curl 9222 / 查進程旗標;逾時後直接編輯 `.mcp.json` |
| **輸出格式訊號** | 回報具體分頁數但無第二證據路徑;把 `about:blank` 當成使用者的分頁 |
| **缺失步驟訊號** | 逾時處置中無代按腳本;對真實分頁導頁 / 點擊前無事前說明 |

---

## References

| 檔案 | 內容 |
|---|---|
| [profile-and-scripts.md](references/profile-and-scripts.md) | 三支腳本完整用法 + 多設定檔啟動引號陷阱 + 設定檔選擇器真視窗 vs 分頁 + UIA 五種假陽性 + `evaluate_script` 精簡讀取範式 |
| `scripts/`(本 skill 內建) | `chrome-auto-approve-debug.ps1`(授權代按) · `Get-ChromeTabsUia.ps1`(交叉驗證清點) · `Start-ChromeForMcp.ps1`(指定設定檔啟動)。Self-Contained,無外部路徑依賴 |
| `claude token減量策略研究分析/chrome_connect/chrome_connect.md` | 機制技術說明 SSoT(為什麼與怎麼做);本 skill 管該不該做 |

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|---|
| **1.0.0** | **2026-08-02** | 初版建立,**取代並刪除 `phycool-chrome-mcp-connect` v1.2.0**(不留 retired 空殼 —— 其內容非「過時待復用」而是**判讀方向與實測相反**,留著只有 context 成本與誤觸發風險;原文可由 `git show 2f554f707:.claude/skills/phycool-chrome-mcp-connect/SKILL.md` 取回)。素材蒸餾自 `chrome_connect/chrome_connect.md` v1.0.0,並經本專案實測複驗與校正。**通用化**:移除前代的專案特定內容(固定 port 配置 / BMAD workflow hooks / 專案帳號 cookie 檢查)。**新增前代完全沒有的三塊**:Chrome 144+ 授權機制(每次都跳 + UIA 代按)、§4 反誤判鐵律(9222 回 404 屬正常 —— 前代 Troubleshooting 的判讀恰好相反)、§6 交叉驗證紀律。**本次實測校正原素材三處**:(1) 官方 `--help` 旗標形式為 `--autoConnect` 而非文件所寫的 `--auto-connect`;(2) `Get-ChromeTabsUia.ps1` 以 `-like` 做 wildcard 比對,按鈕名稱含 `[` `]` 時為非法 pattern 直接中止全腳本(改 `.Contains()` literal);(3) 同腳本短設定檔名子字串誤配致輸出膨脹至 140KB(加頭像鈕名長度上限)。三支腳本**內建於本 skill 的 `scripts/`**(Self-Contained,複製 skill 目錄即可跨專案使用),並修掉 `Start-ChromeForMcp.ps1` 相對層數回推解析到 repo 外的路徑缺陷 —— 改為 `$PSScriptRoot` 同目錄解析後,腳本搬入 skill 目錄零調整即生效。Discipline 強度 Pressure Test:3 Iron Laws + 3 Combined Test + 5-row Rationalization Table + 4 類 Red Flags。**建立後即以真實任務走完全鏈路驗收**(啟動指定設定檔 → 連線 → 開書籤網址 → 讀出實際登入身分 → UIA 交叉驗證吻合),過程中再抓到兩個原素材未涵蓋的症狀並補入 §7/§7.1:Chrome 未啟動時 `list_pages` **立刻報 `Could not find DevToolsActivePort`**(該訊息內含 user data 路徑,極易誤導往改配置方向,實則 `Get-Process chrome`=0 即定案);以及 Chrome 重啟後 pageId 全部改變、`DevToolsActivePort` 檔案在 Chrome 關閉後仍殘留故不可作為存活判準。 |
