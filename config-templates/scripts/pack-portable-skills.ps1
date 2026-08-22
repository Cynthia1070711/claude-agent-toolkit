# pack-portable-skills.ps1 -- 一鍵重打包 dist/portable-skills/ -> dist/portable-skills.zip
# [TD-BWU13-PORTABLE-SKILLS-ZIP-STALE-NO-PACKAGING-SCRIPT 修復 2026-08-04]
# 背景:zip 有兩個真消費者(epic-closing-audit/auto-pilot workflow.yaml:17)且
# bwu13-mechanism-gap-contract.test.js:232 鎖其存在,不可刪;原無任何打包腳本,
# 目錄變更後 zip 靜默脫節(2026-06-29 -> 2026-08-02 曾脫節 5 週)。
# 刻意不做自動觸發(使用者 2026-08-04 勿過度開發裁定):目錄有變更時手動跑本腳本即可。
# zip 根層 = 目錄內容(architecture/... 直接在根,無外層資料夾)-- 與既有消費者結構一致。
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root 'dist/portable-skills'
$dst  = Join-Path $root 'dist/portable-skills.zip'
if (-not (Test-Path $src)) { Write-Error "來源目錄不存在: $src"; exit 1 }
Compress-Archive -Path (Join-Path $src '*') -DestinationPath $dst -Force
$count = ([System.IO.Compression.ZipFile]::OpenRead($dst)).Entries.Count
Write-Host "OK dist/portable-skills.zip 已重打包($count entries)"
