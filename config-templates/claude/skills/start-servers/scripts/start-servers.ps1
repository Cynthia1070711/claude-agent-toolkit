#!/usr/bin/env pwsh
# Start-Servers.ps1 — PhyCool Platform Dev Server Launcher
# Usage: pwsh scripts/start-servers.ps1 [pcpt|vite|dvc|--check|--restart]

param(
    [Parameter(ValueFromRemainingArguments)]
    [string[]]$Targets
)

$ErrorActionPreference = 'SilentlyContinue'

# ── Server Definitions ──
$Servers = @(
    @{ Code='pcpt'; Name='PhyCool Platform';  Port=7135; Proc='dotnet';  Path='src/YourApp/Web';                Cmd='dotnet run --urls "https://localhost:7135"' }
    @{ Code='vite'; Name='Editor Frontend';   Port=5173; Proc='node';    Path='src/YourApp/Web/ClientApp';       Cmd='npm run dev' }
    # ApiPort: DevConsole is dual-process (vite 5174 + Express API 3001).
    # 2026-06-07 incident: script reported dvc "Started" while API server (3001) was dead
    # (port squatted by Incredibuild Manager.exe ephemeral socket) -> UI "Failed to fetch".
    # 2026-07-19 incident: launching via "npm run dev" (concurrently) under a hidden
    # Start-Process console reproducibly killed the vite client seconds after it bound the
    # port (exit code 4294967295 / -1) -> ERR_CONNECTION_REFUSED. Root-caused via isolated
    # repro: running "npm run dev:client" alone through the same hidden-cmd launch survived;
    # running client+server as two independent Start-Process calls (bypassing concurrently)
    # also survived. Cmd/Cmd2 below launch client and server as separate processes so
    # concurrently's nested-shell spawn (implicated in the crash) is never invoked here.
    @{ Code='dvc';  Name='DevConsole Web UI'; Port=5174; Proc='node';    Path='tools/dev-console';                                Cmd='npm run dev:client'; Cmd2='npm run dev:server'; ApiPort=3001; ApiName='DevConsole API' }
)

$ProjectRoot = (Get-Item "$PSScriptRoot/../../../..").FullName
$CheckOnly = $Targets -contains '--check'
$Restart   = $Targets -contains '--restart'
$Selected  = $Targets | Where-Object { $_ -notmatch '^--' }

if (-not $Selected -or $Selected.Count -eq 0) {
    $Selected = $Servers | ForEach-Object { $_.Code }
}

# ── Port Check Function ──
function Test-Port {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        return @{ Occupied=$true; PID=$conn.OwningProcess; ProcessName=$proc.ProcessName }
    }
    return @{ Occupied=$false }
}

# ── Kill Port Function ──
function Stop-PortProcess {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        $recheck = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        return ($null -eq $recheck)
    }
    return $true
}

# ── Results Table ──
$Results = @()

foreach ($srv in $Servers) {
    if ($Selected -notcontains $srv.Code) { continue }

    $portInfo = Test-Port -Port $srv.Port
    $status = ''
    $note = ''

    if ($CheckOnly) {
        if ($portInfo.Occupied) {
            $status = 'Running'
            $note = "PID: $($portInfo.PID) ($($portInfo.ProcessName))"
        } else {
            $status = 'Stopped'
        }
        $Results += [PSCustomObject]@{ Server=$srv.Name; Port=$srv.Port; Status=$status; Note=$note }
        # Dual-process server: also check API port (foreign occupier shown by name)
        if ($srv.ApiPort) {
            $apiInfo = Test-Port -Port $srv.ApiPort
            if ($apiInfo.Occupied) {
                if ($apiInfo.ProcessName -eq $srv.Proc) {
                    $apiStatus = 'Running'
                    $apiNote = "PID: $($apiInfo.PID) ($($apiInfo.ProcessName))"
                } else {
                    $apiStatus = 'FOREIGN'
                    $apiNote = "Occupied by $($apiInfo.ProcessName) (PID $($apiInfo.PID)) - not $($srv.Proc)!"
                }
            } else {
                $apiStatus = 'Stopped'
                $apiNote = ''
            }
            $Results += [PSCustomObject]@{ Server=$srv.ApiName; Port=$srv.ApiPort; Status=$apiStatus; Note=$apiNote }
        }
        continue
    }

    # Restart mode: also kill API port process (dual-process server)
    if ($Restart -and $srv.ApiPort) {
        $apiInfo = Test-Port -Port $srv.ApiPort
        if ($apiInfo.Occupied -and $apiInfo.ProcessName -eq $srv.Proc) {
            Stop-PortProcess -Port $srv.ApiPort | Out-Null
        }
    }

    # Restart mode: kill first
    if ($Restart -and $portInfo.Occupied) {
        $killed = Stop-PortProcess -Port $srv.Port
        if ($killed) {
            $portInfo = @{ Occupied=$false }
        } else {
            $status = 'FAILED'
            $note = "Cannot kill PID $($portInfo.PID)"
            $Results += [PSCustomObject]@{ Server=$srv.Name; Port=$srv.Port; Status=$status; Note=$note }
            continue
        }
    }

    if ($portInfo.Occupied) {
        # Check zombie: process name doesn't match expected
        $isZombie = ($portInfo.ProcessName -ne $srv.Proc)
        if ($isZombie) {
            $killed = Stop-PortProcess -Port $srv.Port
            if (-not $killed) {
                $status = 'BLOCKED'
                $note = "Zombie $($portInfo.ProcessName) (PID $($portInfo.PID)) cannot be killed"
                $Results += [PSCustomObject]@{ Server=$srv.Name; Port=$srv.Port; Status=$status; Note=$note }
                continue
            }
        } else {
            # Dual-process server: main port alive but API port dead = half-dead state
            # (2026-06-07 incident) -> kill main and fall through to full restart.
            $apiDead = $false
            if ($srv.ApiPort) {
                $apiInfo = Test-Port -Port $srv.ApiPort
                if (-not $apiInfo.Occupied) { $apiDead = $true }
                elseif ($apiInfo.ProcessName -ne $srv.Proc) {
                    $Results += [PSCustomObject]@{ Server=$srv.Name; Port=$srv.Port; Status='BLOCKED'; Note="API port $($srv.ApiPort) occupied by $($apiInfo.ProcessName) (PID $($apiInfo.PID))" }
                    continue
                }
            }
            if ($apiDead) {
                Stop-PortProcess -Port $srv.Port | Out-Null
                $portInfo = @{ Occupied=$false }
            } else {
                $status = 'Already Running'
                $note = "PID: $($portInfo.PID)"
                $Results += [PSCustomObject]@{ Server=$srv.Name; Port=$srv.Port; Status=$status; Note=$note }
                continue
            }
        }
    }

    # Pre-start: API port occupied by foreign process -> cannot start, report occupier by name
    if ($srv.ApiPort) {
        $apiInfo = Test-Port -Port $srv.ApiPort
        if ($apiInfo.Occupied) {
            if ($apiInfo.ProcessName -eq $srv.Proc) {
                # orphan node holding API port without UI -> clean it so the fresh process can rebind
                Stop-PortProcess -Port $srv.ApiPort | Out-Null
            } else {
                $Results += [PSCustomObject]@{ Server=$srv.Name; Port=$srv.Port; Status='BLOCKED'; Note="API port $($srv.ApiPort) occupied by $($apiInfo.ProcessName) (PID $($apiInfo.PID))" }
                continue
            }
        }
    }

    # Start server in background
    $workDir = Join-Path $ProjectRoot $srv.Path
    if (-not (Test-Path $workDir)) {
        $status = 'FAILED'
        $note = "Path not found: $($srv.Path)"
        $Results += [PSCustomObject]@{ Server=$srv.Name; Port=$srv.Port; Status=$status; Note=$note }
        continue
    }

    $logDir = Join-Path $ProjectRoot ".system_generated\logs"
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
    $logFile = Join-Path $logDir "$($srv.Code)-server.log"

    # Use cmd /c for all commands to handle .cmd files (npm.cmd) on Windows
    Start-Process cmd -ArgumentList "/c cd /d `"$workDir`" && $($srv.Cmd) > `"$logFile`" 2>&1" -WindowStyle Hidden

    # Cmd2 (e.g. dvc's API server): launched as its own independent Start-Process rather
    # than via a shared supervisor (concurrently), which reproducibly killed the sibling
    # process under this hidden-console launch path (see 2026-07-19 note above).
    if ($srv.Cmd2) {
        $logFile2 = Join-Path $logDir "$($srv.Code)-server2.log"
        Start-Process cmd -ArgumentList "/c cd /d `"$workDir`" && $($srv.Cmd2) > `"$logFile2`" 2>&1" -WindowStyle Hidden
    }

    # Wait up to 30 seconds for port to open
    $waitTime = 0
    $verify = @{ Occupied=$false }
    while ($waitTime -lt 30 -and -not $verify.Occupied) {
        Start-Sleep -Seconds 1
        $waitTime++
        $verify = Test-Port -Port $srv.Port
    }
    if ($verify.Occupied) {
        $status = 'Started'
        $note = "PID: $($verify.PID)"
    } else {
        $status = 'Starting...'
        $note = 'Background process launched (may take a few seconds)'
    }
    if ($srv.ApiPort) { $note += " | verify API port $($srv.ApiPort) with --check" }
    $Results += [PSCustomObject]@{ Server=$srv.Name; Port=$srv.Port; Status=$status; Note=$note }
}

# ── Output ──
Write-Output "`nPhyCool Dev Server Status:"
Write-Output "=========================="
$Results | Format-Table -AutoSize

Write-Output "Access URLs:"
Write-Output "  Platform:   https://localhost:7135"
Write-Output "  Admin:      https://localhost:7135/mgmt/login"
Write-Output "  Editor:     https://localhost:7135/Editor"
Write-Output "  DevConsole: http://localhost:5174"
