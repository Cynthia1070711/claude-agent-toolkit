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
