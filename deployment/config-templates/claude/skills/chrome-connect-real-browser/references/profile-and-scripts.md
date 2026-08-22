# 腳本與設定檔處理 — chrome-connect-real-browser L3 參考

> 本檔為 SKILL.md 的 progressive disclosure 子檔,按需 Read。
> 紀律層(該不該做 / 訊號怎麼讀)在 SKILL.md;本檔是操作細節與踩坑紀錄。

---

## §1 三支腳本

三支腳本**內建於本 skill 目錄** `.claude/skills/chrome-connect-real-browser/scripts/`,
PowerShell 5.1 + UTF-8 BOM。Self-Contained:複製整個 skill 目錄到其他專案即可直接使用,無外部路徑依賴。

以下命令以 repo root 為工作目錄。為求簡潔,先設一個變數:

```powershell
$s = '.claude\skills\chrome-connect-real-browser\scripts'
```

| 腳本 | 用途 | 退出碼 |
|---|---|---|
| `chrome-auto-approve-debug.ps1` | UIA 代按遠端偵錯授權對話框 | `0` 有按到 / `1` 逾時未見對話框(**屬正常**) |
| `Get-ChromeTabsUia.ps1` | UIA 獨立清點視窗與分頁,供交叉驗證 | `0` 有找到 Chrome 視窗 / `1` 找不到 |
| `Start-ChromeForMcp.ps1` | 以指定設定檔啟動 Chrome + 自動掛授權代按 | `0` 成功 / `1` 設定檔不存在或 chrome.exe 找不到 |

### 1.1 `chrome-auto-approve-debug.ps1`

| 參數 | 預設 | 說明 |
|---|---|---|
| `-TimeoutSec` | 90 | 監看時長 |
| `-Once` | (不帶) | 只按第一次就結束。**冷啟動建議不帶**(可能需連按兩次) |
| `-PollMs` | 500 | 輪詢間隔 |

**兩道安全閘(缺一不可,修改時勿破壞)**:

1. 只在視窗的 Descendants 中找到 `ControlType.Text` 且內容命中 `允許遠端偵錯|Allow remote debugging` 時才動作
   —— 確認確實是遠端偵錯授權框,不會誤按其他對話框的「允許」
2. 按鈕名稱採**精確比對**(`$AllowNames -contains $b.Current.Name`,值為 `允許` / `Allow`)
   —— **不可改成 `-like` / `-match`**,那會命中「不允許」

外層再以 `chrome.exe` 的 PID 過濾視窗,避免掃到其他 Chromium 系應用。

**實作註記**:按下後對話框關閉,該 UIA 元素隨即失效,此時再讀 `Current.Name` 會得到空字串。
腳本的日誌行印的是時間戳而非按鈕名,天然避開此陷阱 —— 若日後改為印按鈕名,**必須在 `Invoke()` 之前先取值**。

### 1.2 `Get-ChromeTabsUia.ps1`

```powershell
& "$s\Get-ChromeTabsUia.ps1"            # 完整輸出(每個視窗的設定檔歸屬 + 每個分頁標題)
& "$s\Get-ChromeTabsUia.ps1" -Quiet     # 只輸出彙總三行
```

輸出末尾三行:`WINDOWS` / `PROFILES_IN_USE` / `TOTAL_UIA_TABS`,供與 `list_pages` 比對。

### 1.3 `Start-ChromeForMcp.ps1`

```powershell
& "$s\Start-ChromeForMcp.ps1" -List                              # 列出可用設定檔(不啟動)
& "$s\Start-ChromeForMcp.ps1" -ProfileDirectory Default
& "$s\Start-ChromeForMcp.ps1" -ProfileDirectory 'Profile 1'      # 含空格,腳本內部已處理引號
& "$s\Start-ChromeForMcp.ps1" -ProfileDirectory Default -Url https://console.cloud.google.com
```

啟動前會驗證設定檔確實存在,**不存在即中止** —— 否則 Chrome 會建立一個同名的空設定檔。

**啟動後不需要重新連線 MCP**:新設定檔視窗的分頁會直接出現在既有 `list_pages` 結果裡,
且不觸發新的授權對話框(授權綁 browser process,不綁設定檔)。

> **路徑註記**:代按腳本以 `$PSScriptRoot` 同目錄解析。
> 早期版本用相對層數回推 repo root(`Split-Path` 三層),搬移目錄後會解析到 repo 外,
> 導致啟動時印 `APPROVER_MISSING` 而授權代按靜默失效(2026-08-02 實測)。
> **修改腳本位置時,勿改回層數回推寫法。**
> 三支腳本收進本 skill 同一目錄後,此寫法讓整個 skill 目錄可自由搬移或複製到其他專案而零調整。

---

## §2 設定檔(Profile)處理

### 2.1 讀取可用設定檔

目錄名與顯示名的對照在 `Local State`:

```powershell
$ls = "$env:LOCALAPPDATA\Google\Chrome\User Data\Local State"
$j = Get-Content $ls -Raw -Encoding UTF8 | ConvertFrom-Json
$j.profile.info_cache.PSObject.Properties | ForEach-Object {
  "dir='$($_.Name)' name='$($_.Value.name)' gaia='$($_.Value.gaia_name)'"
}
```

⚠️ **設定檔清單會隨使用者新增而變,每次都重讀,不要寫死**。
目錄名(`Default` / `Profile 1` / `Profile 2` ...)與顯示名沒有固定對應關係,
且**顯示名可以重複**(實測見過兩個設定檔同名),不可用顯示名當唯一鍵。

### 2.2 🚨 目錄名含空格必須加引號

```powershell
# ✅ 正確
Start-Process 'C:\Program Files\Google\Chrome\Application\chrome.exe' `
  -ArgumentList '--profile-directory="Profile 1"'

# ❌ 錯誤 — 會被拆成兩個參數
Start-Process ... -ArgumentList '--profile-directory=Profile 1'
```

錯誤寫法的後果(2026-07-26 實測踩過):Chrome **新建一個名為 `Profile` 的空設定檔**(顯示名「人員 1」),
並把 `1` 當成網址開啟(畫面是 `0.0.0.1` 網路錯誤),事後得用選擇器把誤建的設定檔刪掉。

### 2.3 設定檔選擇器:真視窗可操作,分頁內的不行

| 取得方式 | UIA 可操作? | MCP `list_pages` 看得到? |
|---|:-:|:-:|
| `chrome.exe --show-profile-picker`(真正的獨立選擇器視窗) | ✅ 可以(開啟 / 刪除設定檔實測皆成功) | ❌ 完全隱形 |
| 把分頁導到 `chrome://profile-picker/` | ❌ 按鈕列得出來、按下去沒錯誤,但**不會真的開啟設定檔** | ❌ 完全隱形 |

要走選擇器流程(刪除設定檔、模擬「剛開 Chrome 尚未選設定檔」)**必須用 `--show-profile-picker` 開真視窗再以 UIA 操作**;
分頁版只是畫面。一般情況要開特定設定檔,直接用 `--profile-directory` 最省事。

---

## §3 UIA 清點的五種假陽性(全部實測抓到)

`Get-ChromeTabsUia.ps1` 已修掉以下五種。**修改該腳本時勿移除任一防護**:

| # | 假陽性 | 成因 | 修法 |
|:-:|---|---|---|
| 1 | 分頁數暴增到 27 | `Chrome_WidgetWin_1` 是**所有 Chromium 系應用**共用的 ClassName(VS Code / Antigravity / Edge),IDE 側邊欄面板被當成分頁 | 用 `chrome.exe` 的 PID 過濾 |
| 2 | 設定檔誤配 | 三點選單按鈕名為 `Chrome`,與設定檔名「你的 Chrome」誤配 | 排除 `Chrome` 這個確切名稱 |
| 3 | 1 個 Gmail 分頁被算成 11 個 | 網站自己的 ARIA tab(主要 / 促銷內容 / 社群網路 + 右側日曆 / Keep / Tasks 面板)也是 `TabItem` | 扣掉位於 `ControlType.Document` 子樹下的 TabItem(以 RuntimeId 比對) |
| 4 | **腳本直接崩潰中止** | 設定檔比對用 `-like "*$bn*"` 是 **wildcard** 比對,按鈕名稱含 `[` `]` 時成為非法 pattern,`$ErrorActionPreference='Stop'` 下 throw 中止全腳本 | 改 `.Contains()` **literal** 比對(語意等價的雙向子字串,無 wildcard 陷阱) |
| 5 | **輸出膨脹至 140KB** | 雙向比對的 `$bn.Contains($k)` 方向:任何含**短設定檔名**的長文字都會命中(實測設定檔名 `CC` 對上頁面中的 `CCB` / `CC-SONNET` / `CC-OPUS`),令設定檔欄變成數百條標題串接 | 加頭像按鈕名長度上限(`$MaxProfileButtonNameLength = 40`) |

> #4 / #5 於 2026-08-02 實測抓到 —— 觸發條件是頁面上存在**含方括號的長文字按鈕**,
> 一般網站不易踩到,但內部工具頁(卡片式清單、含標記的標題)必然命中。

---

## §4 `evaluate_script` 精簡讀取範式

比 `take_snapshot` 省 context 得多,只要不需要 uid 就優先用。

一般頁面:

```javascript
() => {
  const m = document.querySelector('main');
  const t = m ? m.innerText.replace(/\s+/g,' ').trim() : document.body.innerText.replace(/\s+/g,' ').trim();
  return { title: document.title, main: t.slice(0, 420) };
}
```

表格類頁面:

```javascript
() => {
  const rows = [...document.querySelectorAll('tr')].map(r => r.innerText.replace(/\s+/g,' ').trim()).filter(t => t.length > 3);
  return { title: document.title, rowCount: rows.length, rows: rows.slice(0, 25) };
}
```

**回傳值必須 JSON-serializable**;包 try/catch 回傳結構化 error,否則 JS 例外會被吃掉不易診斷。

---

## §5 .mcp.json 配置演進史(四代,供避坑)

| 代 | 方案 | 失敗根因 | 廢棄日 |
|:-:|---|---|:-:|
| v1 | `--wsEndpoint ws://127.0.0.1:9222/devtools/browser/{UUID}` | UUID 隨 Chrome session 變動 → session 一結束就永遠連不回 | 2026-05-11 |
| v2 | `--browserUrl http://localhost:9222` + Chrome 加 `--remote-debugging-port=9222` | 需每次啟動前 kill 全部 chrome.exe 才能讓新 instance 的 flag 生效;背景程式 / 系統匣 icon / extensions 讓 chrome.exe 殘留 → flag 丟失 → port 不 listen。使用者維護負擔過高 | 2026-05-12 |
| v3 | `chrome://inspect` toggle ON 但 `.mcp.json` 仍寫死 `--browserUrl ...:9222` | toggle 啟用後 Chrome 用**隨機 port**(觀察到 13809)≠ 寫死的 9222 → port mismatch | 2026-05-12 |
| **v4 ⭐** | **`--autoConnect`** | **無** —— MCP 自身負責 discover Chrome,使用者不再需要管 port 或 process lifecycle | — |

**Meta-Lesson**:連線問題反覆失敗 4+ 次時,應**立即 WebFetch 官方 README / dev blog 最新範式**,
而非繼續 patch 既有方案。v1→v4 的三次失敗都是在「自己管 port」這條錯誤路線上打轉。

**配置紀律**:

- 新增 / 改動 MCP server 後,**當前 session 不會生效,必須開新視窗**
- 版本可釘死(如 `@1.5.0`)以避免上游行為漂移;升版前先在新視窗實測 `list_pages` 再改
- 若環境有 plugin 形式的同類 server,升級後可能覆蓋 plugin cache 而隱形改變可用工具 → 升級後跑 `claude mcp list` 複查

> **Source**: https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session (Fetched 2026-05-12)
> 旗標清單以 `npx chrome-devtools-mcp@<version> --help` 實跑輸出為準(2026-08-02 複驗)。
