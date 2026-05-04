---
name: phycool-windows-ps-encoding
description: |
  Windows 11 + PowerShell 5.1 繁體中文 (CP950/Big5) UTF-8 編碼防雷規範。
  party-to-pipeline v5.0.0 全 6 ps1 (orchestrator/3 worker/shared-utils/stop-report) 必套用。
  涵蓋 .ps1 UTF-8 with BOM、Console OutputEncoding/InputEncoding、Stop Hook stdin、Start-Process Win32 ANSI 截斷防護 (改用 @tempfile)、JSON IPC No-BOM、危險字元 (em dash/box drawing/curly quotes/全形)。
  觸發關鍵字: UTF-8, BOM, Big5, CP950, em dash, PowerShell 中文, 亂碼, .ps1 編碼, Get-Content, Set-Content, Out-File, ConvertFrom-Json 失敗, Stop hook stdin, IPC JSON, shared-utils.ps1, orchestrator.ps1, worker.ps1, party-to-pipeline, 編碼, encoding, 繁體中文, Traditional Chinese, Windows PowerShell, dot-source.
version: 1.0.0
updated: 2026-05-04
last_synced_epic: epic-governance
watches:
  - "**/*.ps1"
  - "scripts/*.ps1"
  - ".claude/skills/**/scripts/*.ps1"
  - ".claude/hooks/*.ps1"
disable-model-invocation: false
user-invocable: true
---

# PhyCool Windows PowerShell 5.1 繁中 UTF-8 防雷

> **核心任務**: 確保 Windows 11 + PowerShell 5.1 繁體中文環境(預設 CP950/Big5)下,所有 .ps1 腳本、JSON IPC、Stop Hook stdin、Start-Process 中文參數**全部正確 UTF-8 處理**,杜絕亂碼 / `??` / 中文截斷 / dot-source 失敗。

## 適用 / 不適用

**適用**:
- 撰寫或審查 PowerShell 5.1 .ps1 腳本(party-to-pipeline / scripts/ / .claude/hooks/)
- 腳本含繁體中文字串、log 輸出、prompt 文字
- 讀寫 JSON / 文字檔案 / 暫存檔
- 使用 Start-Process 傳遞含中文參數
- Stop Hook stdin 讀取 Claude Code IPC JSON
- 出現亂碼 / `??` / 方塊字 / `ConvertFrom-Json` 失敗 / dot-source 加載 functions 卻找不到
- 任何「PowerShell 中文問題」相關詢問

**不適用**:
- ❌ PowerShell 7+ (預設 UTF-8 No-BOM,行為不同 — 用 `#Requires -Version 5.1` 鎖版本)
- ❌ Windows Terminal / Hyper / wt.exe 環境(已支援 UTF-8,但 PS 5.1 仍需處理)
- ❌ macOS / Linux PowerShell(不適用 CP950)
- ❌ Bash / cmd.exe(用 chcp 65001 + UTF-8 locale)

---

## 1. 問題地圖

```
Windows 11 TW (CP950 / Big5)
├── 腳本本身 (.ps1 儲存格式)
│   ├── UTF-8 with BOM   [OK] PS 5.1 正確識別
│   └── UTF-8 no BOM     [ERR] PS 5.1 以 Big5 解析 → 中文爆炸 / dot-source 加載 functions silently fail
├── Console 輸出
│   ├── OutputEncoding 預設 = Big5  → Write-Host 中文 → ??
│   └── 必強制設為 UTF-8
├── 文件讀寫
│   ├── Get-Content 預設 = Big5 → 讀到錯誤字元
│   ├── Set-Content -Encoding UTF8 = UTF-8 with BOM (部分工具不接受)
│   └── [System.IO.File]::ReadAllText/WriteAllText → 最安全
├── stdin (Stop Hook / pipe)
│   └── [Console]::In.ReadToEnd() 走 Console CP → 必先設 InputEncoding
├── Start-Process 參數
│   └── 走 Win32 CreateProcess ANSI API → 中文參數截斷 / 亂碼
└── 危險字元
    ├── em dash — (U+2014):Big5 不支援
    ├── Box drawing ─ ═ ║:Big5 不支援
    └── 任何 U+0080 以上非 Big5 字碼頁字元
```

---

## 2. 防雷三原則

> **原則 1 (P1)**: 腳本存 UTF-8 with BOM(VS Code 右下角選擇)
>
> **原則 2 (P2)**: 腳本頂端放三行初始化(Console UTF-8 + PSDefault 編碼)
>
> **原則 3 (P3)**: 文件讀寫用 `[System.IO.File]::*`,不用 `Get/Set-Content`

---

## 3. 必加標頭(每支 .ps1 頂端,`param()` 之前)

```powershell
#Requires -Version 5.1
# ---- 繁中環境 UTF-8 初始化(必須在最頂端) ----
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# -----------------------------------------------
```

> 詳細逐行解析見 [references/header-explained.md](references/header-explained.md)

---

## 4. 安全讀寫函數(取代 Get/Set-Content)

```powershell
function Read-Utf8File {
    param([string]$Path)
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Write-Utf8File {
    # $WithBom = $true → 含 BOM (PS 5.1 .ps1 用); $false → No BOM (JSON/git 友善)
    param([string]$Path, [string]$Content, [bool]$WithBom = $false)
    $enc = [System.Text.UTF8Encoding]::new($WithBom)
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
    # JSON 寫入預設 No BOM(避免 ConvertFrom-Json 對 BOM 報錯)
    param([string]$Path, [object]$Data, [int]$Depth = 10)
    Write-Utf8File $Path ($Data | ConvertTo-Json -Depth $Depth) $false
}
```

**使用規則**:
- JSON IPC 文件 → `Write-JsonFile $path $data`(自動 No BOM,`ConvertFrom-Json` 不報錯)
- `.ps1` 腳本本身 → 存 UTF-8 **with** BOM(VS Code 右下角)或 `Write-Utf8File $path $script $true`
- 其他文字文件 → 依下游工具決定,不確定就 No BOM

完整 7 種 I/O 模式對照見 [references/file-io-patterns.md](references/file-io-patterns.md)

---

## 5. Stop Hook stdin 安全讀法

```powershell
# [ERR] 舊寫法(走 Console CP950, 中文截斷)
$ctx = $input | ConvertFrom-Json

# [OK] 新寫法
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$raw = [Console]::In.ReadToEnd()
$ctx = if ($raw.Trim()) { $raw | ConvertFrom-Json } else { $null }
```

---

## 6. Start-Process 傳遞中文參數

`Start-Process` 走 Win32 CreateProcess ANSI API,長中文字串直接當參數會截斷或亂碼(>~260 字元必炸)。

**標準解法**: 改用暫存文件傳遞 Prompt + claude `@filepath` 語法

```powershell
# [ERR] 危險(中文參數超過 ~260 字元必炸)
Start-Process "claude" -ArgumentList @("--model", $Model, $longChinesePrompt)

# [OK] 安全(任意長度, 任意 Unicode)
$tmp = [System.IO.Path]::GetTempFileName() + ".txt"
Write-Utf8File $tmp $longChinesePrompt $false   # No BOM
try {
    $proc = Start-Process "claude" `
        -ArgumentList @("--model", $Model, "@$tmp") `
        -WorkingDirectory $ProjectRoot `
        -NoNewWindow -PassThru
} finally {
    Start-Sleep -Seconds 2   # 確保 claude 已讀取
    Remove-Item $tmp -ErrorAction SilentlyContinue
}
```

> claude `@filepath` 語法: Claude Code CLI 讀取該文件內容作為 prompt

---

## 7. 危險字元替換清單

| 危險(Big5 不支援) | 安全替代 | 備註 |
|---|---|---|
| `—` em dash U+2014 | `-` 或 `--` | 最常見地雷(em dash bug) |
| `─` U+2500 | `-` | Box drawing horizontal |
| `═` U+2550 | `=` | Box drawing double horizontal |
| `║` U+2551 | `\|` | Box drawing double vertical |
| `→ ← ↑ ↓` | `->` `<-` `^` `v` | 箭頭符號 |
| `「」『』` | `"` `'` | 全形引號(Big5 有但不穩定) |
| 全形空白 U+3000 | 半形空白 | 對齊問題 |

**Write-Log 安全版本**(無危險字元):
```powershell
function Write-PpLog {
    param([string]$Message, [string]$Level = "INFO")
    $ts    = Get-Date -Format "HH:mm:ss"
    $mark  = switch ($Level) {
        "SUCCESS" { "[OK]"   } "ERROR" { "[ERR]"  }
        "WARN"    { "[WARN]" } "STEP"  { "[STEP]" }
        "DEBUG"   { "[DBG]"  } default { "[INFO]" }
    }
    Write-Host "[$ts]$mark $Message"
}
```

---

## 8. party-to-pipeline v5.0.0 整合(PhyCool 強制套用範圍)

party-to-pipeline v5.0.0 之後,**全 6 ps1 必套用本 Skill 全部規範**:

| ps1 檔 | 必套用項目 |
|:---|:---|
| `.claude/skills/party-to-pipeline/scripts/orchestrator.ps1` | P1 BOM + P2 三行 init + P3 helper functions + 移除危險字元 |
| `.claude/skills/party-to-pipeline/scripts/worker-create.ps1` | 同上 + Start-Process @tempfile (中文 prompt) |
| `.claude/skills/party-to-pipeline/scripts/worker-dev.ps1` | 同 worker-create |
| `.claude/skills/party-to-pipeline/scripts/worker-review.ps1` | 同 worker-create |
| `.claude/skills/party-to-pipeline/scripts/shared-utils.ps1` | P1+P2+P3 + 提供 Read-Utf8File / Write-Utf8File / Read-JsonFile / Write-JsonFile helpers |
| `.claude/skills/party-to-pipeline/scripts/stop-report.ps1` | P1+P2 + Stop Hook stdin 用 [Console]::In.ReadToEnd() (§5) |

**v4.0.0 → v5.0.0 改造項目**(對照 epic-governance T2 task):
- T2.4 6 ps1 加 UTF-8 init 3 行 + 重存 BOM
- T2.5 6 ps1 移除危險字元
- T2.6 6 ps1 改用 Read-Utf8File / Write-Utf8File / Read-JsonFile / Write-JsonFile (取代 Get/Set-Content)
- T2.7 worker.ps1 中文 prompt 改 Start-Process @tempfile

---

## 9. skills_list.md 索引同步

加入 `infrastructure` domain(現有橫切面 Skill 群):

```markdown
### Infrastructure Domain (橫切面基礎設施)
- phycool-windows-ps-encoding (NEW v5.0.0) — Windows PS 5.1 繁中 UTF-8 防雷
- phycool-azure-infra
- phycool-sqlserver
- phycool-e2e-playwright
- (其他既有...)
```

---

## 10. VS Code 設定(.vscode/settings.json)

```jsonc
{
  "files.encoding": "utf8bom",
  "[powershell]": { "files.encoding": "utf8bom" },
  "[json]":       { "files.encoding": "utf8" },     // JSON 不要 BOM
  "[jsonc]":      { "files.encoding": "utf8" }
}
```

---

## 11. 快速診斷指令

```powershell
# 一鍵環境診斷(貼到 PS 5.1 執行)
Write-Host "=== PS 5.1 編碼診斷 ==="
Write-Host "PS Version     : $($PSVersionTable.PSVersion)"
Write-Host "OutputEncoding : $([Console]::OutputEncoding.EncodingName)"
Write-Host "InputEncoding  : $([Console]::InputEncoding.EncodingName)"
Write-Host "Default ANSI   : $([System.Text.Encoding]::Default.CodePage) (950=Big5)"
Write-Host "中文測試       : 你好世界 PhyCool 繁體中文"
Write-Host "em dash 測試   : [$(([char]0x2014))]"

# 確認文件 BOM
function Test-FileBom {
    param([string]$Path)
    $b = [System.IO.File]::ReadAllBytes($Path) | Select-Object -First 4
    $hex = ($b | ForEach-Object { "{0:X2}" -f $_ }) -join " "
    switch -Regex ($hex) {
        "^EF BB BF"    { Write-Host "$Path -> UTF-8 with BOM [OK] PS5.1 .ps1 用這個" }
        "^FF FE"       { Write-Host "$Path -> UTF-16 LE BOM  [WARN] 避免" }
        "^FE FF"       { Write-Host "$Path -> UTF-16 BE BOM  [WARN] 避免" }
        default        { Write-Host "$Path -> No BOM [INFO] JSON/txt 可以,.ps1 會被當 Big5 讀" }
    }
}
```

---

## 12. Checklist(寫每支腳本前確認)

- [ ] `.ps1` 存成 **UTF-8 with BOM**(VS Code 右下角)
- [ ] 頂端加三行 Console/PSDefault 初始化(在 `param()` 之前)
- [ ] 文件讀寫改用 `Read-Utf8File` / `Write-Utf8File` / `Read-JsonFile` / `Write-JsonFile`
- [ ] Stop Hook 改用 `[Console]::In.ReadToEnd()`(先設 `[Console]::InputEncoding`)
- [ ] `Start-Process` 中文參數改用暫存文件 `@$tmp`
- [ ] 移除所有 em dash `—` / Box drawing / 全形引號 / 箭頭 emoji
- [ ] JSON 輸出用 No BOM(`$WithBom = $false`)
- [ ] `#Requires -Version 5.1`(避免 PS 7+ 混淆)

---

## FORBIDDEN

- ❌ `.ps1` 含中文 / em dash 但存為 UTF-8 No BOM(PS 5.1 dot-source 加載 functions silently fail)
- ❌ `Get-Content` / `Set-Content` / `Out-File` 預設(走 Big5,中文亂碼)
- ❌ `Set-Content -Encoding UTF8`(寫 UTF-8 with BOM,JSON 工具讀 BOM 報錯)
- ❌ Stop Hook 用 `$input | ConvertFrom-Json`(stdin Big5 解析,中文截斷)
- ❌ `Start-Process "claude" -ArgumentList @($longChinesePrompt)` (Win32 ANSI 截斷)
- ❌ Script 含 em dash / box drawing / curly quotes / 全形空白(Big5 不支援)
- ❌ 跳過頂端 UTF-8 init 3 行(假設 Console 已是 UTF-8 — 不一定)
- ❌ 假設 PS 7+ 行為(用 `#Requires -Version 5.1` 鎖版本)

---

## CI Guard 計畫(留 epic-governance C3.2 task 實作)

`scripts/check-ps-encoding.cjs` — 全 src .ps1 掃描:

| # | 檢查 | 標準 |
|:-:|:---|:---|
| 1 | `.ps1` 含中文 / em dash → 必有 UTF-8 BOM | 前 3 byte = `EF BB BF` |
| 2 | `.ps1` 必有 `[Console]::OutputEncoding` init | 前 20 行 grep |
| 3 | `.ps1` 必有 `[Console]::InputEncoding` init | 前 20 行 grep |
| 4 | ❌ 禁用 `Get-Content` / `Set-Content` / `Out-File` 預設 | 改 `[System.IO.File]::*` |
| 5 | ❌ 禁含 em dash `—` / box drawing / curly quotes | 危險字元黑名單 |

`scripts/check-ps-encoding.cjs` 加入 `.\scripts\check-hygiene.ps1` chain,commit 前自動跑。

---

## Cross-Skill References

| 相關 Skill | 連動點 |
|:---|:---|
| `party-to-pipeline` (v5.0.0+) | 全 6 ps1 必套用本 Skill (§8) |
| `claude-tools` | Claude Code CLI 工具與環境配置 |
| `phycool-context-memory` | MCP IPC JSON 編碼 (本 Skill §4 helpers 提供) |

---

## References

- [references/header-explained.md](references/header-explained.md) — 三行初始化逐行解析
- [references/file-io-patterns.md](references/file-io-patterns.md) — 7 種 I/O 模式完整對照 + 5 reusable 函數
- [templates/ps51-safe-template.ps1](templates/ps51-safe-template.ps1) — 可直接複製的腳本範本

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.0.0** | **2026-05-04** | 初版建立。基於 `claude token減量策略研究分析/party-to-pipeline改版/UTF-8問題/` 完整 SSoT(231+203+107+146 行)+ 7 處 PhyCool 環境調整(命名 / description PhyCool 觸發詞 / §8 party-to-pipeline 整合 / §9 skills_list.md 索引 / file-io-patterns MCP IPC 範例 / template dot-source / CI guard 計畫)。三引擎同步 .claude + .gemini + .agent。對齊 epic-governance party-to-pipeline v4.1.0→v5.0.0 改版 T2 task 系列。 |
