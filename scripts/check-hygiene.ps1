# PCPT File Hygiene Checker
# ASCII ONLY PROJECT SOURCE TO AVOID ENCODING ERRORS

param (
    [string]$SearchPath = ".",
    [string[]]$Include = @("*.ts", "*.tsx", "*.cs", "*.md", "*.json", "*.html", "*.css"),
    [string[]]$Exclude = @("node_modules", "bin", "obj", ".git", ".next", ".vs", "dist", "build")
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

Write-Host "--- PCPT File Hygiene Check Start ---" -ForegroundColor Cyan
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
        & node $psEncodingScript
        if ($LASTEXITCODE -ne 0) {
            Write-Host "PS ENCODING CHECK FAILED - STRICT violations in party-to-pipeline scripts!" -ForegroundColor Red
            Write-Host "Reference: .claude/skills/phycool-windows-ps-encoding/SKILL.md" -ForegroundColor Yellow
            Write-Host "Run: node scripts/check-ps-encoding.cjs --strict for details" -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "[SKIP] check-ps-encoding.cjs not found at $psEncodingScript" -ForegroundColor Yellow
    }
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
