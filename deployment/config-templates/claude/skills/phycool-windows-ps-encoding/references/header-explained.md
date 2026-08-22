# 三行初始化逐行解析

## 完整標頭

```powershell
#Requires -Version 5.1
# ---- 繁中環境 UTF-8 初始化 ----
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# --------------------------------
```

---

## 逐行解析

### `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`

**影響範圍：** Write-Host、Write-Output、所有往 stdout 的輸出

**不設定的後果：**
- Console 預設 CP950（Big5）
- Write-Host "你好" → 輸出 `??`（Big5 找不到 Unicode 字碼點）
- 子程序 stdout 讀回來也是亂碼

**設定後：**
- 所有 Unicode 繁中字元正確顯示
- 子程序（如 claude CLI）的輸出也能正確接收

---

### `[Console]::InputEncoding = [System.Text.Encoding]::UTF8`

**影響範圍：** stdin 讀取、管道輸入、`[Console]::In.ReadToEnd()`

**不設定的後果：**
- Stop Hook 從 Claude 收到的 JSON（UTF-8 編碼）被當 Big5 解析
- JSON 中的中文欄位值變成亂碼
- `$ctx.title` 可能讀到空字串或錯誤字元

**設定後：**
- `[Console]::In.ReadToEnd()` 正確讀取 UTF-8 JSON
- 管道傳入的中文字串完整保留

**注意：** 此行必須在任何 stdin 讀取操作之前執行，包括 `$input`、`Read-Host`。

---

### `$PSDefaultParameterValues['*:Encoding'] = 'utf8'`

**影響範圍：** 所有有 `-Encoding` 參數的 Cmdlet（Get-Content、Set-Content、Out-File、Add-Content、Export-Csv 等）

**不設定的後果（以 Get-Content 為例）：**
```
Get-Content "stories-db.json"
→ 以 Big5（CP950）讀取 UTF-8 JSON 文件
→ JSON 中的繁中值變成亂碼
→ ConvertFrom-Json 可能丟出 "Unexpected character" 錯誤
```

**設定後：**
```
Get-Content "stories-db.json"
→ 等同於 Get-Content "stories-db.json" -Encoding utf8
→ 正確讀取 UTF-8 內容
```

**重要細節：** `'utf8'` 在 PS 5.1 中 = UTF-8 **with BOM**。
如果你需要無 BOM 的 UTF-8（例如 JSON 文件給其他工具讀），
仍然建議用 `[System.IO.File]::WriteAllText` 搭配 `UTF8Encoding($false)`。

---

## 為什麼要放在 `param()` 之後？

> **2026-07-27 校正**（`td-devenv-guard-psenc-doc-convergence` code-review）：本節原本教「放在 `param()` 之前」並附「PS 5.1 解析 `param()` 時就可能觸發輸入讀取」的理由。**兩者皆錯**，且該寫法會造成靜默失敗（實測見下）。

```powershell
# ✅ 正確順序
#Requires -Version 5.1
param(                                                       # ← param() 必須是第一個可執行語句
    [string]$StoryId,
    [string]$Model = "claude-opus-4-5"
)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8    # ← 收尾括號之後才設定
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
```

```powershell
# ❌ 錯誤順序（init 在 param() 之前）
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
param(
    [string]$StoryId
)
```

PowerShell parser 要求 `param()`（或 `[CmdletBinding()]` + `param()`）為腳本的**第一個可執行語句**。
在它之前放任何陳述式，`param` 就不再被當成參數區塊，而是被當成**未知的 cmdlet 名稱**。

**PS 5.1 實測結果**（`powershell -File bad-order.ps1 -StoryId "abc"`）：

```
param : The term 'param' is not recognized as the name of a cmdlet, function, script file, or operable program.
At bad-order.ps1:3 char:1
StoryId=            <-- 參數靜默丟失（應為 abc）
ExitCode=0          <-- 腳本仍「成功」結束
```

危險之處在於 **exit code 仍是 0**：呼叫端看不出失敗，只會拿到一份參數全為預設值的執行結果。
這正是本 Skill 要防的靜默失敗類型，與缺 BOM 導致 dot-source silently fail 同屬一類。

`#Requires` 是 parser 指令（非可執行語句），可以、也應該留在最頂端。

---

## `#Requires -Version 5.1` 的作用

強制確認 PS 版本，避免在 PS 7.x 環境下混用（PS 7 預設 UTF-8，行為不同）。
如果腳本將來需要支援 PS 7，移除此行並加入版本判斷：

```powershell
if ($PSVersionTable.PSVersion.Major -lt 6) {
    # PS 5.1 Big5 修正
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::InputEncoding  = [System.Text.Encoding]::UTF8
    $PSDefaultParameterValues['*:Encoding'] = 'utf8'
}
# PS 7+ 預設 UTF-8，不需要修正
```
