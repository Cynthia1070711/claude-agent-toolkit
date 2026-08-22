# ============================================================
# E2E Sub-Window Launcher with Watchdog Auto-Close
# Usage:
#   .\e2e-launcher.ps1 -PromptFile "path\to\prompt.txt" -ReportFile "path\to\report.md" -Label "S1-Auth" -TimeoutMin 15
# ============================================================
param(
    [Parameter(Mandatory)]
    [string]$PromptFile,

    [Parameter(Mandatory)]
    [string]$ReportFile,

    [string]$Label = "E2E",

    [string]$Model = "sonnet",

    [int]$TimeoutMin = 15
)

$Host.UI.RawUI.WindowTitle = "Claude [E2E] $Label"
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

$ProjectRoot = '${PROJECT_ROOT}'
Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue
Set-Location $ProjectRoot

Write-Host ('=' * 60) -ForegroundColor Cyan
Write-Host "  E2E Launcher — $Label" -ForegroundColor Cyan
Write-Host "  Report: $ReportFile" -ForegroundColor Cyan
Write-Host "  Timeout: ${TimeoutMin}min" -ForegroundColor Cyan
Write-Host ('=' * 60) -ForegroundColor Cyan

$promptContent = [System.IO.File]::ReadAllText($PromptFile, [System.Text.Encoding]::UTF8)

# Launch claude in background job
$claudeJob = Start-Job -ScriptBlock {
    param($root, $mdl, $prm)
    Set-Location $root
    Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue
    & claude --model $mdl --dangerously-skip-permissions $prm
} -ArgumentList $ProjectRoot, $Model, $promptContent

# Watchdog: monitor report file + timeout
$startTime = Get-Date
$reportFound = $false
$timeoutSec = $TimeoutMin * 60

Write-Host "`n[Watchdog] Monitoring for report file..." -ForegroundColor DarkGray

while (-not $reportFound) {
    Start-Sleep -Seconds 10

    # Check 1: Report file exists
    if (Test-Path $ReportFile) {
        $fileSize = (Get-Item $ReportFile).Length
        if ($fileSize -gt 100) {
            Write-Host "[Watchdog] Report file detected! ($fileSize bytes)" -ForegroundColor Green
            # Grace period: wait 30s for final writes
            Start-Sleep -Seconds 30
            $reportFound = $true
            break
        }
    }

    # Check 2: Claude process exited
    if ($claudeJob.State -eq 'Completed' -or $claudeJob.State -eq 'Failed') {
        Write-Host "[Watchdog] Claude process exited (state=$($claudeJob.State))" -ForegroundColor Yellow
        $reportFound = $true
        break
    }

    # Check 3: Timeout
    $elapsed = ((Get-Date) - $startTime).TotalSeconds
    if ($elapsed -ge $timeoutSec) {
        Write-Host "[Watchdog] TIMEOUT (${TimeoutMin}min). Force closing." -ForegroundColor Red
        $reportFound = $true
        break
    }

    # Status update every 60s
    if ([int]$elapsed % 60 -eq 0) {
        $min = [math]::Floor($elapsed / 60)
        Write-Host "[Watchdog] ${min}min elapsed, waiting..." -ForegroundColor DarkGray
    }
}

# Cleanup: kill claude process
Write-Host "[Watchdog] Cleaning up..." -ForegroundColor DarkGray
Stop-Job $claudeJob -ErrorAction SilentlyContinue
Remove-Job $claudeJob -Force -ErrorAction SilentlyContinue

# Kill any remaining claude processes (not main conversation)
Get-Process claude -ErrorAction SilentlyContinue |
    Where-Object { $_.StartTime -gt $startTime.AddSeconds(-5) } |
    ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }

if (Test-Path $ReportFile) {
    Write-Host "`n[DONE] Report: $ReportFile" -ForegroundColor Green
} else {
    Write-Host "`n[WARN] No report file found!" -ForegroundColor Red
}

# Auto-close window after 5 seconds
Write-Host "`nWindow closing in 5s..." -ForegroundColor DarkGray
Start-Sleep -Seconds 5
