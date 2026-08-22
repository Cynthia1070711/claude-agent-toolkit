#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [int]$TargetPid,
    [string]$Text = '',
    [switch]$Isolated,
    [string]$TextFile = '',
    [string]$ResultFile = '',
    # 文字與送出鍵之間的間隔(毫秒)。見 C# Inject() 的說明:兩者同批送出時,claude TUI 會把
    # 整串連同結尾的 \r 當成一次貼上,Enter 因而不生效。0 = 同批送(僅供對照實驗)。
    [int]$SubmitDelayMs = 250,
    [switch]$DryRun
)
# -- 繁中環境 UTF-8 初始化(必須在 param() 之後) ----
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# -----------------------------------------------

# ==============================================================================
# console-knock.ps1  v1.0.0
# party-to-pipeline (whp-12-knock-console-inject) -- 敲門原語(對收件端中立)
#
# 對"另一個 console 的 input buffer"注入一行 ASCII 文字 + 一個 Enter,使該 console 的
# 讀取端(Read-Host / Node raw-mode reader / claude TUI)收到一次完整的一行輸入。
#
# == 為什麼這支檔案對收件端一無所知(BR-008)================================
# 參數只有 -TargetPid 與 -Text。它不查任何 domain 資料表,不碰 DB。
# `ccb-4-ctrl-notify-knock`(中控↔中控通知)要消費的正是這支檔案,而它的目標 PID 來自
# 一份還不存在的 controller window registry -- 把 worker 域的判活寫進來就沒得複用。
#
# ⚠ 本檔的註解刻意不寫出那些被禁止的 API 與資料表名稱。BR-008/BR-013/BR-014 的守護是
#   全檔 grep 零命中,若為了"解釋為何不用它"而在註解裡寫出該名稱,守護就得為註解開例外
#   -- 那會讓"零命中"不再是零命中。故一律以描述性措辭指涉。
#
# == 為什麼要 self-respawn(BR-007)========================================
# 官方明載:一個 process 至多附加到一個 console;呼叫端已有 console 時 AttachConsole 回
# ERROR_ACCESS_DENIED。故必須先 FreeConsole() -- 但中控主視窗絕不可對自己 FreeConsole()
# (它自己的 console 若無其他 process 附著即被銷毀)。隔離子進程是這個危害的結構性解,
# 不是"試試看有沒有副作用"。
# [Source: https://learn.microsoft.com/en-us/windows/console/attachconsole | Fetched 2026-08-02]
#
# == 為什麼是直寫 input buffer 而不是模擬視窗訊息(BR-013)================
# WriteConsoleInput 直寫 console input buffer,與視窗焦點無關。另一類做法(合成視窗訊息 /
# 模擬按鍵送到前景視窗)需要目標視窗先取得焦點,會把焦點從使用者當下正在做的事情上搶走 --
# 敲門是背景通知,不該打斷使用者手上的操作。
#
# == 為什麼只送 key-down(BR-010)==========================================
# libuv(Node -> Ink -> claude TUI)在 raw mode 走 ReadConsoleInputW,並明確跳過 key-up:
#   if (!KEV.bKeyDown && (KEV.wVirtualKeyCode != VK_MENU || KEV.uChar.UnicodeChar == 0)) continue;
# 送 key-up 不會出錯,但純屬浪費,且會讓"注入幾次"的計數斷言失真。
# [Source: https://raw.githubusercontent.com/libuv/libuv/v1.x/src/win/tty.c | Fetched 2026-08-02]
#
# == 這支檔案永遠不會做的事(BR-014,使用者硬裁定②③)====================
# 零行程終止原語、零關窗原語、零 console 控制事件。敲門是純加法:它不移除任何東西,
# 也不關閉任何東西。關窗是另一條路徑的職責(close-worker.ps1,中控唯一程式化關窗途徑)。
#
# Usage:
#   .\console-knock.ps1 -TargetPid <int> -Text <ascii-string> [-DryRun]
#   .\console-knock.ps1 -TargetPid <int> -Isolated -TextFile <path> -ResultFile <path>   # 內部用
#
# Exit codes:
#   0 = 已注入(或 -DryRun)
#   3 = WHP12-E01  呼叫端已附著於 console(ERROR_ACCESS_DENIED,隔離失效 -- 結構性缺陷)
#   4 = WHP12-E02  目標沒有 console(ERROR_INVALID_HANDLE)
#   5 = WHP12-E03  目標不存在(ERROR_INVALID_PARAMETER,含未文件化的其他 attach 失敗)
#   6 = WHP12-E04  -Text 含非 ASCII 字元(含 \n / \r)-- 守衛在任何 Win32 呼叫之前
#   7 = WHP12-E05  寫入未達成(WriteConsoleInput 回 false,或寫入筆數少於提交筆數)
#   8 = WHP12-E06  CONIN$ 開啟失敗
# ==============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# 零外部相依(不 dot-source shared-utils.ps1)-- 中立原語必須能被 ccb-4 原樣搬走。
# .claude/skills/party-to-pipeline/scripts -> 上溯 4 層為 project root。
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$AuditLogPath = Join-Path $ProjectRoot 'logs\console-knock.log'

function Test-KnockAsciiViolation {
    <#
      BR-011 / BR-026 的守衛本體。**兩個分支都要用**(whp-12 CR F5):原本只寫在母分支,
      於是 `-Isolated -TextFile <檔>` 直接呼叫時完全繞過 -- 那條路徑能送進 Unicode 與換行,
      而換行正是 BR-026 要擋的東西(一次呼叫排進多個 prompt,敲門的定義被破壞)。
      守衛屬於"進 Win32 之前"這個位置,不屬於某一個分支。
      回傳:違規字元清單(空陣列 = 通過)。
      ⚠ 呼叫端必須以 @(...) 包住結果 -- PowerShell 回傳空陣列時會解包成 $null,
        Set-StrictMode -Version Latest 之下 $null.Count 會拋 PropertyNotFoundStrict。
    #>
    param([string]$Value)
    $bad = @()
    foreach ($ch in $Value.ToCharArray()) {
        $code = [int][char]$ch
        if ($code -lt 0x20 -or $code -gt 0x7E) { $bad += ('U+{0:X4}' -f $code) }
    }
    return @($bad | Select-Object -Unique)
}

function Write-KnockAuditLine {
    <#
      BR-027:敲門是對"使用者看得見的視窗"造成的副作用。若哪天有人問"我視窗裡怎麼
      冒出一行英文",這份 log 是唯一能回答"是不是我們做的、什麼時候、對誰、內容為何"
      的東西。稽核寫入是副作用而非分支 -- 不新增 exit code,失敗時也照寫,自身出錯則吞掉。
      欄位順序刻意把 text 放最後:text 允許含 '|',放最後才不會讓分隔符解析出現歧義。
    #>
    param([int]$TargetProcessId, [string]$Outcome, [string]$Payload)
    try {
        $dir = Split-Path -Parent $AuditLogPath
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        # 'K' 對 Local kind 的 DateTime 產生 +08:00 -- offset-aware,對齊 constitutional §Timestamp Mandate
        $ts = Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'
        # 🔴 Payload 必須先摺成單行再寫。被 ASCII 守衛拒絕的輸入本來就可能含 CR/LF(那正是它
        #    被拒的原因),若原樣寫入,一次呼叫會在 log 留下兩行 -- BR-027 要的是"恰一行",
        #    多出來的那行會讓任何以行為單位的稽核計數失準。實測於 AC15 驗證時抓到。
        $safePayload = ($Payload -replace "`r", '\r') -replace "`n", '\n'
        $line = "$ts | pid=$TargetProcessId | $Outcome | $safePayload"
        [System.IO.File]::AppendAllText($AuditLogPath, $line + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
    } catch { }
}

# ==============================================================================
# ISOLATED BRANCH -- 只有這一段碰 Win32。母分支永遠不執行到這裡。
# ==============================================================================
if ($Isolated) {

    $isoResult = @{ ok = $false; code = 'WHP12-E03'; exit = 5; written = 0; submitted = 0; winError = 0; stage = 'init'; message = '' }

    try {
        $isoText = ''
        if ($TextFile -and (Test-Path $TextFile)) {
            $isoText = [System.IO.File]::ReadAllText($TextFile, (New-Object System.Text.UTF8Encoding($false)))
        }

        # BR-011 / BR-026(whp-12 CR F5):守衛在此分支同樣先行 -- 直接以 -Isolated 呼叫時,
        # 母分支的那道守衛根本沒跑過。位置仍在任何 Win32 呼叫之前。
        $isoBad = @(Test-KnockAsciiViolation -Value $isoText)
        if ($isoBad.Count -gt 0) {
            $isoResult.code = 'WHP12-E04'
            $isoResult.exit = 6
            $isoResult.stage = 'AsciiGuard'
            $isoResult.message = "text contains non-ASCII or control characters ($($isoBad -join ',')) -- rejected before any Win32 call"
            if ($ResultFile) {
                try {
                    [System.IO.File]::WriteAllText($ResultFile, ($isoResult | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding($false)))
                } catch { }
            }
            exit 6
        }

        Add-Type -Language CSharp @'
using System;
using System.Runtime.InteropServices;

public static class WHP12Knock {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool AttachConsole(uint dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool FreeConsole();

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern IntPtr CreateFileW(string lpFileName, uint dwDesiredAccess, uint dwShareMode,
        IntPtr lpSecurityAttributes, uint dwCreationDisposition, uint dwFlagsAndAttributes, IntPtr hTemplateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr hObject);

    // blittable layout:int(4) + ushort*4(8) + uint(4) = 16 bytes,與 Win32 KEY_EVENT_RECORD 相符。
    // bKeyDown 刻意宣告為 int 而非 [MarshalAs(UnmanagedType.Bool)] bool -- 後者會讓整個 struct
    // 變成非 blittable,marshal 陣列時多一層複製且 layout 較難自證。
    [StructLayout(LayoutKind.Sequential)]
    public struct KEY_EVENT_RECORD {
        public int    bKeyDown;
        public ushort wRepeatCount;
        public ushort wVirtualKeyCode;
        public ushort wVirtualScanCode;
        public ushort UnicodeChar;
        public uint   dwControlKeyState;
    }

    // EventType(2) + 顯式 Padding(2) + KeyEvent(16) = 20 bytes。Padding 寫出來而不靠編譯器
    // 自動對齊,是為了讓 layout 一眼可驗。
    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT_RECORD {
        public ushort EventType;
        public ushort Padding;
        public KEY_EVENT_RECORD KeyEvent;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool WriteConsoleInputW(IntPtr hConsoleInput, INPUT_RECORD[] lpBuffer,
        uint nLength, out uint lpNumberOfEventsWritten);

    public const ushort KEY_EVENT   = 0x0001;
    public const ushort VK_RETURN   = 0x000D;
    const uint GENERIC_READ         = 0x80000000;
    const uint GENERIC_WRITE        = 0x40000000;
    const uint FILE_SHARE_READ      = 0x00000001;
    const uint FILE_SHARE_WRITE     = 0x00000002;
    const uint OPEN_EXISTING        = 3;
    static readonly IntPtr INVALID_HANDLE_VALUE = new IntPtr(-1);

    static INPUT_RECORD MakeKeyDown(ushort unicodeChar, ushort vk) {
        INPUT_RECORD r = new INPUT_RECORD();
        r.EventType = KEY_EVENT;
        r.Padding   = 0;
        r.KeyEvent.bKeyDown          = 1;   // BR-010: key-down only, 永遠 1
        r.KeyEvent.wRepeatCount      = 1;
        r.KeyEvent.wVirtualKeyCode   = vk;
        r.KeyEvent.wVirtualScanCode  = 0;
        r.KeyEvent.UnicodeChar       = unicodeChar;
        r.KeyEvent.dwControlKeyState = 0;
        return r;
    }

    /// BR-026: 送出鍵由本函式自行附加,恰一個,永遠在陣列末端,來源不是 text。
    /// 呼叫端無法藉由 -Text 挾帶第二個 Enter -- \r (0x0D) 與 \n (0x0A) 都低於 U+0020,
    /// 在進到這裡之前就已被 PowerShell 端的 ASCII 守衛擋掉(BR-011)。
    public static INPUT_RECORD[] BuildRecords(string text) {
        if (text == null) text = "";
        INPUT_RECORD[] recs = new INPUT_RECORD[text.Length + 1];
        for (int i = 0; i < text.Length; i++) {
            recs[i] = MakeKeyDown((ushort)text[i], 0);
        }
        recs[text.Length] = MakeKeyDown((ushort)'\r', VK_RETURN);
        return recs;
    }

    /// 回傳 0=成功 / 1=attach 失敗 / 2=CONIN$ 開啟失敗 / 3=寫入回 false / 4=partial write
    ///
    /// 🔴 submitDelayMs -- 文字與送出鍵之間的間隔,是 P2a 實測逼出來的必要設計,不是保險絲。
    /// 首輪 PoC 把"文字 + Enter"放進同一次 WriteConsoleInput 送給 claude TUI:文字逐字
    /// 正確出現在輸入框(使用者截圖實證),但 Enter 沒有送出 -- 整串連同結尾的 \r 被 TUI 當成
    /// 一次貼上,\r 成了內容的一部分而非按鍵。把送出鍵拆成第二次寫入(中間留一段間隔),
    /// 它才會被讀取端看成一次獨立的按鍵事件。
    /// BuildRecords 的契約不變(末端仍恰一個 VK_RETURN,BR-026 靜態斷言不受影響),
    /// 改變的只是"分兩批送出同一個陣列"。
    public static int Inject(uint targetPid, string text, int submitDelayMs, out uint written,
                             out uint submitted, out int winError, out string stage) {
        written = 0; submitted = 0; winError = 0; stage = "FreeConsole";

        // 先脫離本進程自己的 console(隱藏視窗那個),否則 AttachConsole 必回 ERROR_ACCESS_DENIED。
        // 這裡的失敗不致命:本進程若本來就沒有 console,FreeConsole 回 false 是正常的。
        FreeConsole();

        stage = "AttachConsole";
        if (!AttachConsole(targetPid)) {
            winError = Marshal.GetLastWin32Error();
            return 1;
        }

        stage = "OpenConin";
        IntPtr h = CreateFileW("CONIN$", GENERIC_READ | GENERIC_WRITE,
                               FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
        if (h == INVALID_HANDLE_VALUE) {
            winError = Marshal.GetLastWin32Error();
            FreeConsole();
            return 2;
        }

        INPUT_RECORD[] recs = BuildRecords(text);
        submitted = (uint)recs.Length;
        int textCount = recs.Length - 1;        // 末端那一個是送出鍵,單獨處理
        bool ok = true;
        uint wroteText = 0;

        // 批次 1:文字本體(text 為空時整批跳過,直接送出一個空行)
        if (textCount > 0) {
            stage = "WriteConsoleInput:text";
            INPUT_RECORD[] textRecs = new INPUT_RECORD[textCount];
            Array.Copy(recs, textRecs, textCount);
            ok = WriteConsoleInputW(h, textRecs, (uint)textCount, out wroteText);
            if (!ok) winError = Marshal.GetLastWin32Error();
        }

        // 批次 2:送出鍵。與批次 1 之間留間隔,使讀取端把它看成獨立按鍵而非同一批貼上內容。
        uint wroteEnter = 0;
        if (ok) {
            if (submitDelayMs > 0) System.Threading.Thread.Sleep(submitDelayMs);
            stage = "WriteConsoleInput:submit";
            INPUT_RECORD[] enterRec = new INPUT_RECORD[1];
            enterRec[0] = recs[textCount];
            ok = WriteConsoleInputW(h, enterRec, 1, out wroteEnter);
            if (!ok) winError = Marshal.GetLastWin32Error();
        }

        written = wroteText + wroteEnter;
        CloseHandle(h);
        FreeConsole();

        if (!ok) return 3;
        if (written != submitted) return 4;   // BR-012: 短寫是失敗,不是靜默成功
        stage = "done";
        return 0;
    }
}
'@

        # 型別必須先釘死:C# 側是 out uint / out int / out string,PowerShell 以 [ref] 對接時
        # 若變數是預設的 Int32 而目標為 uint,marshaling 會拋型別轉換錯誤。
        [uint32]$written = 0
        [uint32]$submitted = 0
        [int]$winErr = 0
        [string]$stage = ''
        $rc = [WHP12Knock]::Inject([uint32]$TargetPid, $isoText, [int]$SubmitDelayMs,
                                   [ref]$written, [ref]$submitted, [ref]$winErr, [ref]$stage)

        $isoResult.written   = [int]$written
        $isoResult.submitted = [int]$submitted
        $isoResult.winError  = [int]$winErr
        $isoResult.stage     = [string]$stage

        switch ($rc) {
            0 { $isoResult.ok = $true;  $isoResult.code = 'OK';         $isoResult.exit = 0 }
            1 {
                # 三個 documented cause 之外的 attach 失敗歸 E03:87(INVALID_PARAMETER)本就是
                # "目標不存在/不可用"的泛化語意,未知失敗最接近這一類。winError 一律回傳,
                # 使實際成因不因歸類而失真。
                if ($winErr -eq 5) {
                    $isoResult.code = 'WHP12-E01'; $isoResult.exit = 3
                } elseif ($winErr -eq 6) {
                    $isoResult.code = 'WHP12-E02'; $isoResult.exit = 4
                } else {
                    $isoResult.code = 'WHP12-E03'; $isoResult.exit = 5
                }
                $isoResult.message = "AttachConsole failed (winError=$winErr)"
            }
            2 { $isoResult.code = 'WHP12-E06'; $isoResult.exit = 8; $isoResult.message = "CONIN`$ open failed (winError=$winErr)" }
            3 { $isoResult.code = 'WHP12-E05'; $isoResult.exit = 7; $isoResult.message = "WriteConsoleInput returned false (winError=$winErr)" }
            4 { $isoResult.code = 'WHP12-E05'; $isoResult.exit = 7; $isoResult.message = "partial write: $written of $submitted records" }
            default { $isoResult.code = 'WHP12-E03'; $isoResult.exit = 5; $isoResult.message = "unexpected rc=$rc" }
        }
    } catch {
        $isoResult.code = 'WHP12-E03'
        $isoResult.exit = 5
        $isoResult.message = "isolated child threw: $($_.Exception.Message)"
    }

    # FreeConsole 之後本進程已無 stdout 可用,結果只能經檔案回傳(SDD Spec §4.1)。
    if ($ResultFile) {
        try {
            [System.IO.File]::WriteAllText($ResultFile, ($isoResult | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding($false)))
        } catch { }
    }
    exit $isoResult.exit
}

# region NON-ISOLATED BRANCH (BR-007)
# ==============================================================================
# 本區段內不得出現任何 console 附著 / 脫離 / input buffer 寫入的 P/Invoke 呼叫 -- 那些
# 一律只在上方 -Isolated 區段。母進程唯一該做的事:守衛輸入 -> re-spawn 隔離子進程 ->
# 讀結果檔 -> 寫稽核 log。
#
# ⚠ AC5 對本區段下的是否定斷言(擷取 region..endregion 之間的字串,斷言不含那三個 API 名),
#   故此處同樣不寫出它們的字面 -- 否則斷言會被自己的說明文字打敗。
# ==============================================================================

# -- BR-011 / BR-026: ASCII 守衛,置於任何 Win32 呼叫之前 ----
#      \n (0x0A) 與 \r (0x0D) 都低於 U+0020,天然落在拒絕域 -- 這使得一次呼叫不可能
#      把多個 prompt 排進目標視窗。敲門的定義是"一行",這是封裝邊界而非授權邊界。
$badChars = @(Test-KnockAsciiViolation -Value $Text)
if ($badChars.Count -gt 0) {
    $detail = $badChars -join ','
    Write-Host "WHP12-E04: -Text contains non-ASCII or control characters ($detail) -- rejected before any Win32 call, zero injection"
    Write-KnockAuditLine -TargetProcessId $TargetPid -Outcome 'WHP12-E04' -Payload $Text
    exit 6
}

if ($DryRun) {
    Write-Host "WOULD KNOCK: pid=$TargetPid records=$($Text.Length + 1) (text $($Text.Length) chars + exactly 1 VK_RETURN)"
    Write-Host "WOULD SPAWN: powershell -File $PSCommandPath -Isolated -TargetPid $TargetPid"
    Write-KnockAuditLine -TargetProcessId $TargetPid -Outcome 'DRYRUN' -Payload $Text
    exit 0
}

# -- re-spawn 隔離子進程 ----
#      -Text 經檔案傳遞而非命令列:含空格的字串經 Start-Process -ArgumentList 陣列傳遞時
#      不會自動加引號,會被拆成多個參數。改走檔案同時也避開 Win32 命令列的 ANSI 截斷面
#      (phycool-windows-ps-encoding §6)。
$stage = Join-Path $env:TEMP ("whp12-knock-{0}-{1}" -f $PID, [System.Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $stage -Force | Out-Null
$textFile   = Join-Path $stage 'text.txt'
$resultFile = Join-Path $stage 'result.json'
$utf8NoBom  = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($textFile, $Text, $utf8NoBom)

$childExit = -1
$result    = $null
try {
    $psArgs = @(
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', ('"{0}"' -f $PSCommandPath),
        '-TargetPid', $TargetPid,
        '-Isolated',
        '-SubmitDelayMs', $SubmitDelayMs,
        '-TextFile', ('"{0}"' -f $textFile),
        '-ResultFile', ('"{0}"' -f $resultFile)
    )
    $proc = Start-Process -FilePath 'powershell.exe' -ArgumentList $psArgs -WindowStyle Hidden -Wait -PassThru
    $childExit = $proc.ExitCode

    if (Test-Path $resultFile) {
        $raw = [System.IO.File]::ReadAllText($resultFile, $utf8NoBom)
        if ($raw) { $result = $raw | ConvertFrom-Json }
    }
} catch {
    Write-Host "WHP12-E03: failed to spawn isolated child -- $($_.Exception.Message)"
    Write-KnockAuditLine -TargetProcessId $TargetPid -Outcome 'WHP12-E03' -Payload $Text
    Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
    exit 5
}

Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue

if (-not $result) {
    # 子進程沒留下結果檔:仍以它的 exit code 為準,但明說結果不可解析,避免把未知當成功。
    $fallbackExit = if ($childExit -eq 0) { 5 } else { $childExit }
    Write-Host "WHP12-E03: isolated child produced no parseable result (childExit=$childExit)"
    Write-KnockAuditLine -TargetProcessId $TargetPid -Outcome 'WHP12-E03' -Payload $Text
    exit $fallbackExit
}

$outcome = [string]$result.code
if ($result.ok) {
    Write-Host "KNOCK_OK: pid=$TargetPid records=$($result.submitted) written=$($result.written)"
} else {
    Write-Host "$($outcome): $($result.message) [stage=$($result.stage) winError=$($result.winError)]"
}
Write-KnockAuditLine -TargetProcessId $TargetPid -Outcome $outcome -Payload $Text
exit ([int]$result.exit)
# endregion NON-ISOLATED BRANCH
