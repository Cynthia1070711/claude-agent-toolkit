#!/usr/bin/env pwsh
<#
.SYNOPSIS
    為 Claude CLI 主視窗啟動獨立 OTel Micro Collector。
    支援多視窗並行：每次啟動取得專屬 collector + JSONL。

.DESCRIPTION
    預設模式（Per-Session）：每次調用啟動新 collector（隨機 port），
    產生獨立 JSONL，SessionEnd hook 精確歸屬 token 數據。
    多視窗安全：每個 Claude session 有自己的 collector，不會交叉。

    -Shared 模式：單一 collector 在 port 49200（適合只開一個視窗）。

    Pipeline 子視窗不受影響（PS1 設定動態 port 覆蓋 env vars）。

.USAGE
    # 多視窗推薦：每個終端 dot-source 後啟動 claude
    . ./scripts/start-main-otel.ps1
    claude

    # 單視窗簡易模式（共享 collector）
    . ./scripts/start-main-otel.ps1 -Shared
    claude
#>
param(
    [switch]$Shared
)

$ErrorActionPreference = 'Stop'

# ── Constants ──
$SHARED_PORT = 49200
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $ProjectRoot 'logs'
$CollectorScript = Join-Path $ProjectRoot 'scripts/otel-micro-collector.js'

# Ensure logs directory
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

$today = Get-Date -Format 'yyyy-MM-dd'
$ts = Get-Date -Format 'HHmmss'

if ($Shared) {
    # ── Shared Mode: single collector on fixed port ──
    $port = $SHARED_PORT
    $JsonlPath = Join-Path $LogDir "main-otel-$today.jsonl"
    $PortFilePath = Join-Path $LogDir 'main-otel-port.txt'

    $alreadyRunning = $false
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:$port/health" -TimeoutSec 2 -ErrorAction Stop
        if ($health -eq 'OK') { $alreadyRunning = $true }
    } catch { $alreadyRunning = $false }

    if ($alreadyRunning) {
        Write-Host "[otel-shared] Collector already running on port $port" -ForegroundColor Green
    } else {
        Write-Host "[otel-shared] Starting shared collector on port $port ..." -ForegroundColor Cyan
        $proc = Start-Process -FilePath 'node' -ArgumentList @(
            $CollectorScript, $JsonlPath, $PortFilePath, '--port', $port
        ) -NoNewWindow -PassThru

        $deadline = (Get-Date).AddSeconds(3)
        $ready = $false
        while ((Get-Date) -lt $deadline) {
            try {
                $resp = Invoke-RestMethod -Uri "http://localhost:$port/health" -TimeoutSec 1 -ErrorAction Stop
                if ($resp -eq 'OK') { $ready = $true; break }
            } catch { }
            Start-Sleep -Milliseconds 200
        }
        if ($ready) {
            Write-Host "[otel-shared] Collector ready (PID: $($proc.Id))" -ForegroundColor Green
        } else {
            Write-Host "[otel-shared] WARNING: Collector may not have started" -ForegroundColor Yellow
        }
    }

    # Shared mode does NOT set OTEL_SESSION_JSONL (aggregate uses marker-based fallback)
    Remove-Item Env:OTEL_SESSION_JSONL -ErrorAction SilentlyContinue
    Remove-Item Env:OTEL_SESSION_PORT -ErrorAction SilentlyContinue

} else {
    # ── Per-Session Mode (default): dedicated collector per window ──
    $port = Get-Random -Minimum 49201 -Maximum 65535
    $sessionTag = "$today-$ts-$port"
    $JsonlPath = Join-Path $LogDir "session-otel-$sessionTag.jsonl"
    $PortFilePath = Join-Path $LogDir "session-otel-port-$sessionTag.txt"

    Write-Host "[otel-session] Starting dedicated collector on port $port ..." -ForegroundColor Cyan
    $proc = Start-Process -FilePath 'node' -ArgumentList @(
        $CollectorScript, $JsonlPath, $PortFilePath, '--port', $port
    ) -NoNewWindow -PassThru

    $deadline = (Get-Date).AddSeconds(3)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-RestMethod -Uri "http://localhost:$port/health" -TimeoutSec 1 -ErrorAction Stop
            if ($resp -eq 'OK') { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 200
    }

    if ($ready) {
        Write-Host "[otel-session] Collector ready (PID: $($proc.Id))" -ForegroundColor Green
    } else {
        Write-Host "[otel-session] WARNING: Collector may not have started" -ForegroundColor Yellow
    }

    # Per-session env vars — hooks read these for precise attribution + cleanup
    $env:OTEL_SESSION_JSONL = $JsonlPath
    $env:OTEL_SESSION_PORT = $port
}

# ── Common OTel env vars ──
$env:CLAUDE_CODE_ENABLE_TELEMETRY = '1'
$env:OTEL_METRICS_EXPORTER = 'otlp'
$env:OTEL_LOGS_EXPORTER = 'otlp'
$env:OTEL_EXPORTER_OTLP_PROTOCOL = 'http/json'
$env:OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:$port"
$env:OTEL_METRIC_EXPORT_INTERVAL = '10000'

Write-Host "[otel] Telemetry -> localhost:$port | JSONL: $JsonlPath" -ForegroundColor Green
Write-Host "[otel] Run 'claude' to start a session with token tracking." -ForegroundColor DarkGray
