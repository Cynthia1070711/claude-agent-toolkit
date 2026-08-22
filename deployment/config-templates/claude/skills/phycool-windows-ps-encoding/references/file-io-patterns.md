# 文件讀寫模式對照表

## 核心原則

| 用途 | BOM | 理由 |
|------|-----|------|
| `.ps1` 腳本 | **with BOM** | PS 5.1 需要 BOM 才識別 UTF-8 |
| `.json` IPC 文件 | **No BOM** | `ConvertFrom-Json` 遇 BOM 可能報錯 |
| `.md` 文件 | No BOM | 通用慣例 |
| `.txt` 日誌 | No BOM | 下游工具相容性 |
| `Set-Content -Encoding UTF8` | with BOM | PS 5.1 的「UTF8」= 帶 BOM |

---

## 對照表

```powershell
# ================================================================
# JSON 讀取
# ================================================================

# ❌ 危險（Big5，中文欄位亂碼）
$db = Get-Content "stories-db.json" | ConvertFrom-Json

# ❌ 危險（即使加 -Encoding UTF8，BOM 有時讓 ConvertFrom-Json 報錯）
$db = Get-Content "stories-db.json" -Encoding UTF8 | ConvertFrom-Json

# ✅ 安全（無 BOM 問題，跨平台）
$db = [System.IO.File]::ReadAllText(
    "stories-db.json",
    [System.Text.Encoding]::UTF8
) | ConvertFrom-Json


# ================================================================
# JSON 寫入
# ================================================================

# ❌ 危險（Big5 編碼，中文變 ?）
$db | ConvertTo-Json -Depth 10 | Set-Content "stories-db.json"

# ⚠️ 可用但帶 BOM（某些工具讀 JSON 時報錯）
$db | ConvertTo-Json -Depth 10 | Set-Content "stories-db.json" -Encoding UTF8

# ✅ 最安全（No BOM UTF-8）
$json = $db | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText(
    "stories-db.json",
    $json,
    [System.Text.UTF8Encoding]::new($false)  # $false = No BOM
)


# ================================================================
# 純文字讀取（.md / .txt / prompt 文件）
# ================================================================

# ❌ 危險
$content = Get-Content "prompt.txt" -Raw

# ✅ 安全
$content = [System.IO.File]::ReadAllText(
    "prompt.txt",
    [System.Text.Encoding]::UTF8
)


# ================================================================
# 純文字寫入（日誌 / 報告）
# ================================================================

# ❌ 危險
"日誌內容" | Out-File "log.txt"

# ✅ 安全（No BOM）
[System.IO.File]::WriteAllText(
    "log.txt",
    "日誌內容",
    [System.Text.UTF8Encoding]::new($false)
)

# ✅ 安全（附加模式）
[System.IO.File]::AppendAllText(
    "log.txt",
    "新增一行`n",
    [System.Text.UTF8Encoding]::new($false)
)


# ================================================================
# 多行文字讀取（讀陣列）
# ================================================================

# ❌ 危險
$lines = Get-Content "list.txt"

# ✅ 安全
$lines = [System.IO.File]::ReadAllLines(
    "list.txt",
    [System.Text.Encoding]::UTF8
)


# ================================================================
# 寫入 .ps1 腳本（需要 BOM，讓 PS 5.1 識別）
# ================================================================

$scriptContent = @"
Write-Host '你好世界'
"@

# ✅ 帶 BOM（.ps1 用這個）
[System.IO.File]::WriteAllText(
    "generated-script.ps1",
    $scriptContent,
    [System.Text.UTF8Encoding]::new($true)   # $true = with BOM
)


# ================================================================
# 暫存文件（傳給 Start-Process / claude @file）
# ================================================================

$promptText = "這是繁體中文 Prompt，可以有任意長度和 Unicode 字元"
$tmpPath    = [System.IO.Path]::GetTempFileName()

# No BOM（claude @file 語法不需要 BOM）
[System.IO.File]::WriteAllText(
    $tmpPath,
    $promptText,
    [System.Text.UTF8Encoding]::new($false)
)

$proc = Start-Process "claude" `
    -ArgumentList @("--model", "claude-opus-4-5", "@$tmpPath") `
    -NoNewWindow -PassThru

# 等待讀取後清理
Start-Sleep -Seconds 2
Remove-Item $tmpPath -ErrorAction SilentlyContinue
```

---

## 可重用工具函數

```powershell
# ── 加入 shared-utils.ps1 ──

function Read-Utf8File {
    param([string]$Path)
    if (-not (Test-Path $Path)) { throw "檔案不存在: $Path" }
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Write-Utf8File {
    param(
        [string]$Path,
        [string]$Content,
        [bool]$WithBom = $false   # 預設 No BOM（JSON 友善）
    )
    $enc = [System.Text.UTF8Encoding]::new($WithBom)
    # 確保目錄存在
    $dir = Split-Path $Path -Parent
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Content, $enc)
}

function Read-JsonFile {
    param([string]$Path)
    return (Read-Utf8File $Path) | ConvertFrom-Json
}

function Write-JsonFile {
    param([string]$Path, [object]$Data, [int]$Depth = 10)
    Write-Utf8File $Path ($Data | ConvertTo-Json -Depth $Depth) $false
}

function Write-TempPrompt {
    <#
    .SYNOPSIS 將長 Prompt 寫入暫存文件，回傳 @filepath 格式字串
    #>
    param([string]$Content)
    $tmp = [System.IO.Path]::GetTempFileName() + ".txt"
    Write-Utf8File $tmp $Content $false
    return $tmp   # 呼叫方負責 Remove-Item
}
```

---

## 常見錯誤訊息對照

| 錯誤訊息 | 原因 | 解法 |
|---------|------|------|
| `Unexpected character` in JSON | JSON 文件有 BOM 或 Big5 亂碼 | 改用 `[System.IO.File]::ReadAllText` |
| `ConvertFrom-Json` 無法解析 | 同上 | 同上 |
| Write-Host 輸出 `??` 或 `??` | OutputEncoding 是 Big5 | 加標頭三行 |
| Stop Hook 收到亂碼 JSON | InputEncoding 是 Big5 | 先設 `[Console]::InputEncoding` |
| `Start-Process` 中文參數消失 | Win32 ANSI API 截斷 | 改用 `@tmpfile` 傳遞 |
| `.ps1` 腳本本身亂碼 | 存成無 BOM UTF-8 | VS Code 存 UTF-8 with BOM |
