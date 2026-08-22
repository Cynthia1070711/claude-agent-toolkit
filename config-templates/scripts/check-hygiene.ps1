# PhyCool File Hygiene Checker
# ASCII ONLY PROJECT SOURCE TO AVOID ENCODING ERRORS

param (
    [string]$SearchPath = ".",
    [string[]]$Include = @("*.ts", "*.tsx", "*.cs", "*.md", "*.json", "*.html", "*.css"),
    [string[]]$Exclude = @("node_modules", "bin", "obj", ".git", ".next", ".vs", "dist", "build"),
    [int]$FreshnessThresholdDays = 14,
    [switch]$CheckDocDrift,
    [string]$DocDriftRange = "HEAD~1..HEAD"
)

# Define patterns using hex char codes
$Patterns = @(
    [char]0x923D,  # Big5 pattern
    [char]0x7362,  # Big5 pattern
    [char]0x7485,  # Big5 pattern
    [char]0x5671,  # Big5 pattern
    [char]0xE603,  # Mojibake marker
    [char]0xF426   # Mojibake marker
)

$TotalFiles = 0
$CorruptedFiles = @()

Write-Host "--- PhyCool File Hygiene Check Start ---" -ForegroundColor Cyan
Write-Host "Scan Path: $SearchPath"

$Files = Get-ChildItem -Path $SearchPath -Recurse -File -Include $Include | Where-Object { 
    $relPath = Resolve-Path $_.FullName -Relative
    $isExcluded = $false
    foreach ($ex in $Exclude) {
        if ($relPath -like "*\$ex\*" -or $relPath -like "*/$ex/*") {
            $isExcluded = $true
            break
        }
    }
    -not $isExcluded
}

foreach ($File in $Files) {
    if ($File.Name -eq "check-hygiene.ps1") { continue }
    $TotalFiles++
    try {
        $Content = Get-Content -Path $File.FullName -TotalCount 200 -Encoding UTF8 -ErrorAction SilentlyContinue
        if ($null -eq $Content) { continue }
        
        $Found = $false
        foreach ($Line in $Content) {
            foreach ($P in $Patterns) {
                if ($Line.Contains($P)) {
                    $Found = $true
                    break
                }
            }
            if ($Found) { break }
        }
        
        if ($Found) {
            Write-Host "[!] Potential corruption detected: $($File.FullName)" -ForegroundColor Yellow
            $CorruptedFiles += $File.FullName
        }
    }
    catch { }
}

# ─────────────────────────────────────────────────────────────────────────────
# Toolkit-Relevant Change Detection: REMOVED 2026-05-05 (ENV-04 cleanup)
# Reason: Single-Engine Mode + toolkit mirror sync mechanism retired.
# .gemini/.agent preserved as frozen 5/1 baseline (NOT deleted).
# See: .claude/rules/single-engine-mode.md v1.0.0
# Original section was L67-148 (82 lines), generated .toolkit-sync-pending.md markers.
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
# Check-DocFreshness: Documentation Freshness Check (AC-8, TD-28)
# Compares Migration/source dates against doc Last Updated dates.
# Outputs WARNING lines but does NOT change exit code (hygiene failures take priority).
# ─────────────────────────────────────────────────────────────────────────────

# Run infrastructure integrity check (BLOCKS commit if critical scripts are degraded)
Write-Host "`n--- Infrastructure Integrity Check ---" -ForegroundColor Cyan
$infraResult = & "$PSScriptRoot\verify-infrastructure.ps1" -Quiet
if ($LASTEXITCODE -ne 0) {
    Write-Host "INFRASTRUCTURE CHECK FAILED — critical scripts may be degraded!" -ForegroundColor Red
    Write-Host "Run: .\scripts\verify-infrastructure.ps1 -Fix for details" -ForegroundColor Yellow
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Skill Validation Check (AC-3, bu-03)
# Validates .claude/skills/* format using quick_validate.py.
# Warn-Only: does NOT affect exit code. Python not found: graceful skip.
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`n--- Skill Validation Check ---" -ForegroundColor Cyan
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if ($null -eq $pythonCmd) {
    Write-Host "[SKIP] Python not found - skipping Skill Validation" -ForegroundColor Yellow
} else {
    $skillValidateScript = Join-Path $SearchPath ".claude\skills\skill-builder\scripts\quick_validate.py"
    $skillsRoot = Join-Path $SearchPath ".claude\skills"
    if (Test-Path $skillValidateScript) {
        $skillJsonRaw = & python $skillValidateScript --all $skillsRoot --json 2>$null
        if ($skillJsonRaw) {
            try {
                $skillResult = $skillJsonRaw | ConvertFrom-Json
                $s = $skillResult.summary
                $statusColor = if ($s.fail -gt 0) { 'Yellow' } else { 'Green' }
                Write-Host "[SKILL-VALIDATE] Total: $($s.total) | Pass: $($s.pass) | Fail: $($s.fail) | Warn: $($s.warn)" -ForegroundColor $statusColor
                if ($s.fail -gt 0) {
                    Write-Host "[SKILL-VALIDATE] Failures (warn-only, not blocking commit):" -ForegroundColor Yellow
                    foreach ($r in $skillResult.results) {
                        if ($r.status -eq "fail") {
                            $failRules = ($r.rules | Where-Object { $_.status -eq 'fail' } | ForEach-Object { "$($_.id): $($_.message)" }) -join '; '
                            Write-Host "  - $($r.skill): $failRules" -ForegroundColor Yellow
                        }
                    }
                }
            } catch {
                Write-Host "[SKILL-VALIDATE] Could not parse JSON output (warn-only)" -ForegroundColor Yellow
            }
        } else {
            Write-Host "[SKILL-VALIDATE] No output from validator (warn-only)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[SKIP] quick_validate.py not found at $skillValidateScript" -ForegroundColor Yellow
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# PowerShell 5.1 UTF-8 Encoding Check (party-to-pipeline v5.0.0)
# Calls scripts/check-ps-encoding.cjs — STRICT scope (party-to-pipeline scripts)
# BLOCKS commit on violations. LEGACY scope (scripts/, .claude/hooks) warn-only.
# Reference: phycool-windows-ps-encoding + .claude/rules/encoding-discipline.md SUPREME
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`n--- PowerShell 5.1 UTF-8 Encoding Check ---" -ForegroundColor Cyan
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $nodeCmd) {
    Write-Host "[SKIP] Node.js not found - skipping PS encoding check" -ForegroundColor Yellow
} else {
    $psEncodingScript = Join-Path $SearchPath "scripts\check-ps-encoding.cjs"
    if (Test-Path $psEncodingScript) {
        # Selftest first: the guard's detection regex was once silently corrupted by an edit
        # (range start char eaten). Symptom was fabricated violations, not a crash, so the
        # full scan could not catch it. Verify rule semantics before trusting the scan.
        # NOTE: keep this file ASCII-only - it has no BOM, so PS 5.1 would mojibake any CJK.
        $psEncodingSelftest = Join-Path $SearchPath "scripts\check-ps-encoding.selftest.cjs"
        if (Test-Path $psEncodingSelftest) {
            & node $psEncodingSelftest | Select-Object -Last 1
            if ($LASTEXITCODE -ne 0) {
                Write-Host "PS ENCODING SELFTEST FAILED - guard rule semantics drifted; scan results are not trustworthy!" -ForegroundColor Red
                Write-Host "Run: node scripts/check-ps-encoding.selftest.cjs for details" -ForegroundColor Yellow
                exit 1
            }
        }
        & node $psEncodingScript
        if ($LASTEXITCODE -ne 0) {
            Write-Host "PS ENCODING CHECK FAILED - STRICT violations in party-to-pipeline scripts!" -ForegroundColor Red
            Write-Host "Reference: .claude/skills/phycool-windows-ps-encoding/SKILL.md" -ForegroundColor Yellow
            Write-Host "Run: node scripts/check-ps-encoding.cjs --verbose for details" -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "[SKIP] check-ps-encoding.cjs not found at $psEncodingScript" -ForegroundColor Yellow
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# Razor JS-Context Encoding Check (aat-ui-03-followup AC-5)
# Detects @Html.Raw(Html.Encode(...)) anti-pattern in Razor inline JS event handlers.
# BLOCKS commit on violations. Exit 0 = clean.
# Reference: scripts/check-razor-js-context-encoding.cjs
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`n--- Razor JS-Context Encoding Check ---" -ForegroundColor Cyan
if ($null -eq $nodeCmd) {
    Write-Host "[SKIP] Node.js not found - skipping Razor JS-context encoding check" -ForegroundColor Yellow
} else {
    $razorEncCheck = Join-Path $SearchPath "scripts\check-razor-js-context-encoding.cjs"
    if (Test-Path $razorEncCheck) {
        & node $razorEncCheck
        if ($LASTEXITCODE -ne 0) {
            Write-Host "RAZOR JS-CONTEXT ENCODING CHECK FAILED - @Html.Raw(Html.Encode(...)) anti-pattern detected!" -ForegroundColor Red
            Write-Host "Fix: Use data-* attribute + DOM API pattern instead of inline JS string interpolation." -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "[SKIP] check-razor-js-context-encoding.cjs not found at $razorEncCheck" -ForegroundColor Yellow
    }
}

# -----------------------------------------------------------------------------
# Frozen sprint-status.yaml Active-Reference Guard (tdb-2-sprint-status-freeze-refs)
# Detects active read/write instructions targeting sprint-status.yaml outside the
# exempt ledger (frozen 2026-07-28, DB-first per stories table + track_plan).
# BLOCKS commit on violations. Exit 0 = clean.
# Reference: scripts/check-frozen-refs.cjs
# -----------------------------------------------------------------------------
Write-Host "`n--- Frozen sprint-status.yaml Reference Guard ---" -ForegroundColor Cyan
if ($null -eq $nodeCmd) {
    Write-Host "[SKIP] Node.js not found - skipping frozen-refs check" -ForegroundColor Yellow
} else {
    $frozenRefsScript = Join-Path $SearchPath "scripts\check-frozen-refs.cjs"
    if (Test-Path $frozenRefsScript) {
        & node $frozenRefsScript
        if ($LASTEXITCODE -ne 0) {
            Write-Host "FROZEN REFS CHECK FAILED - active sprint-status.yaml reference(s) detected outside exempt ledger!" -ForegroundColor Red
            Write-Host "sprint-status.yaml is frozen 2026-07-28 - status/scheduling now DB-first (stories / track_plan)." -ForegroundColor Yellow
            Write-Host "Run: node scripts/check-frozen-refs.cjs --verbose for details" -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "[SKIP] check-frozen-refs.cjs not found at $frozenRefsScript" -ForegroundColor Yellow
    }
}

# =============================================================================
# --- Recurring Regression CI Guards (eft-recurring-regression-ci-guards) ---
# 5 guards covering 6 common root causes from 2026-05-12 session:
#   [CI-GUARD-RR-02] Seeder soft-delete IgnoreQueryFilters
#   [CI-GUARD-RR-03] CSP worker-src directive
#   [CI-GUARD-RR-04] CSP env-split upgrade-insecure-requests
#   [CI-GUARD-RR-05] DTO/Entity nullable annotation alignment
#   [CI-GUARD-RR-06] Vite/cshtml protocol consistency
# =============================================================================
Write-Host "`n--- Recurring Regression CI Guards ---" -ForegroundColor Cyan
if ($null -eq $nodeCmd) {
    Write-Host "[CI-GUARD-RR] [SKIP] Node.js not found - skipping recurring regression guards" -ForegroundColor Yellow
} else {
    # [CI-GUARD-RR-02] Seeder soft-delete IgnoreQueryFilters guard
    $rrGuard02 = Join-Path $SearchPath "scripts\check-seeder-soft-delete-guard.cjs"
    if (Test-Path $rrGuard02) {
        Write-Host "[CI-GUARD-RR-02] Checking Seeder soft-delete IgnoreQueryFilters..." -ForegroundColor Cyan
        & node $rrGuard02
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[CI-GUARD-RR-02] FAIL: Seeder AnyAsync without IgnoreQueryFilters detected!" -ForegroundColor Red
            Write-Host "Fix: Add .IgnoreQueryFilters() before .AnyAsync()/.FirstOrDefaultAsync()/.SingleOrDefaultAsync() in Seeder files." -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "[CI-GUARD-RR-02] [SKIP] check-seeder-soft-delete-guard.cjs not found" -ForegroundColor Yellow
    }

    # [CI-GUARD-RR-03] CSP worker-src directive guard
    $rrGuard03 = Join-Path $SearchPath "scripts\check-csp-worker-src.cjs"
    if (Test-Path $rrGuard03) {
        Write-Host "[CI-GUARD-RR-03] Checking CSP worker-src directive..." -ForegroundColor Cyan
        & node $rrGuard03
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[CI-GUARD-RR-03] FAIL: SecurityHeadersMiddleware BuildCsp missing worker-src directive!" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "[CI-GUARD-RR-03] [SKIP] check-csp-worker-src.cjs not found" -ForegroundColor Yellow
    }

    # [CI-GUARD-RR-04] CSP env-split upgrade-insecure-requests guard
    $rrGuard04 = Join-Path $SearchPath "scripts\check-csp-env-split.cjs"
    if (Test-Path $rrGuard04) {
        Write-Host "[CI-GUARD-RR-04] Checking CSP env-split upgrade-insecure-requests..." -ForegroundColor Cyan
        & node $rrGuard04
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[CI-GUARD-RR-04] FAIL: upgrade-insecure-requests outside if (!_env.IsDevelopment()) guard!" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "[CI-GUARD-RR-04] [SKIP] check-csp-env-split.cjs not found" -ForegroundColor Yellow
    }

    # [CI-GUARD-RR-05] DTO/Entity nullable annotation alignment guard
    $rrGuard05 = Join-Path $SearchPath "scripts\check-dto-entity-nullable.cjs"
    if (Test-Path $rrGuard05) {
        Write-Host "[CI-GUARD-RR-05] Checking DTO/Entity nullable annotation alignment..." -ForegroundColor Cyan
        & node $rrGuard05
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[CI-GUARD-RR-05] FAIL: DTO/Entity nullable annotation mismatch detected!" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "[CI-GUARD-RR-05] [SKIP] check-dto-entity-nullable.cjs not found" -ForegroundColor Yellow
    }

    # [CI-GUARD-RR-06] Vite/cshtml protocol consistency guard
    $rrGuard06 = Join-Path $SearchPath "scripts\check-vite-aspnet-protocol-consistency.cjs"
    if (Test-Path $rrGuard06) {
        Write-Host "[CI-GUARD-RR-06] Checking Vite/cshtml protocol consistency..." -ForegroundColor Cyan
        & node $rrGuard06
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[CI-GUARD-RR-06] FAIL: Vite/cshtml localhost:5173 protocol mismatch!" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "[CI-GUARD-RR-06] [SKIP] check-vite-aspnet-protocol-consistency.cjs not found" -ForegroundColor Yellow
    }
}

# Run doc freshness check BEFORE exit (warnings only, does not affect exit code)
& "$PSScriptRoot\check-doc-freshness.ps1" -FreshnessThresholdDays $FreshnessThresholdDays

# ─────────────────────────────────────────────────────────────────────────────
# Check-DocDrift: Documentation Drift Check (AC-3, TD-31)
# Detects code changes not reflected in documentation (git-diff based).
# Only runs when --check-doc-drift flag is passed. Warn-Only (exit 0).
# ─────────────────────────────────────────────────────────────────────────────
if ($CheckDocDrift) {
    Write-Host ""
    & "$PSScriptRoot\check-doc-drift.ps1" -DiffRange $DocDriftRange
}

Write-Host "`n--- Summary ---" -ForegroundColor Cyan
Write-Host "Total files scanned: $TotalFiles"
if ($CorruptedFiles.Count -eq 0) {
    Write-Host "Status: OK. No corrupted files found." -ForegroundColor Green
    exit 0
}
else {
    Write-Host "Status: FAILED. Found $($CorruptedFiles.Count) corrupted files!" -ForegroundColor Red
    Write-Host "Action: Run 'git checkout HEAD -- <path>' or check file encoding manually."
    exit 1
}
