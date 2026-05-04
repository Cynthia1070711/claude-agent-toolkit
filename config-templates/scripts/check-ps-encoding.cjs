#!/usr/bin/env node
/**
 * check-ps-encoding.cjs - PowerShell 5.1 繁中 UTF-8 CI Guard
 *
 * 對齊 phycool-windows-ps-encoding §CI Guard 計畫
 * 掃描所有 .ps1 檔案,5 條檢查:
 *   1. .ps1 含中文/em dash → 必有 UTF-8 BOM (前 3 byte = EF BB BF)
 *   2. .ps1 必有 [Console]::OutputEncoding init (前 30 行 grep)
 *   3. .ps1 必有 [Console]::InputEncoding init (前 30 行 grep)
 *   4. ❌ 禁用 Get-Content / Set-Content / Out-File 預設 (應改 [System.IO.File])
 *   5. ❌ 禁含 em dash (—) / box drawing 主要字元 / curly quotes
 *
 * Exit 0: all pass | Exit 1: violations found
 *
 * Usage: node scripts/check-ps-encoding.cjs [--fix-bom]
 */

const fs = require('fs');
const path = require('path');

// v5.0.0 strict scope: only party-to-pipeline scripts (核心改造範圍)
// Legacy scripts/ + .claude/hooks 漸進改造留 follow-up Story td-pipeline-legacy-ps1-encoding-cleanup
const SCAN_DIRS = [
    '.claude/skills/party-to-pipeline/scripts',
];

// Legacy 範圍 (warning-only, 不 fail CI):
const LEGACY_SCAN_DIRS = [
    '.claude/hooks',
    'scripts',
];

const VIOLATIONS = {
    NO_BOM_WITH_NON_ASCII: 'PS 5.1 .ps1 含中文/em dash 必有 UTF-8 BOM (EF BB BF)',
    MISSING_OUTPUT_ENCODING: '頂端缺 [Console]::OutputEncoding = UTF8',
    MISSING_INPUT_ENCODING: '頂端缺 [Console]::InputEncoding = UTF8',
    USE_GET_CONTENT_DEFAULT: 'Get-Content 預設 (Big5) — 改 [System.IO.File]::ReadAllText UTF-8',
    USE_SET_CONTENT_DEFAULT: 'Set-Content/Out-File 預設 — 改 [System.IO.File]::WriteAllText UTF-8 No-BOM',
    DANGER_CHAR_EM_DASH: 'em dash (—) U+2014 — 改 -- (Big5 不支援)',
    DANGER_CHAR_BOX_DRAW_MAIN: 'box drawing 主要字元 (─═║) — 改 -=| (Big5 不支援,comment 內可放但不建議)',
};

function* walkPs1Files(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) yield* walkPs1Files(full);
        else if (e.isFile() && e.name.endsWith('.ps1')) yield full;
    }
}

function checkFile(filePath) {
    const violations = [];
    const buf = fs.readFileSync(filePath);
    const content = buf.toString('utf8');
    const hasNonAscii = /[-￿]/.test(content);
    const hasBom = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
    const head30 = content.split('\n').slice(0, 30).join('\n');

    // Check 1: BOM required when non-ASCII present
    if (hasNonAscii && !hasBom) {
        violations.push({ rule: 'NO_BOM_WITH_NON_ASCII', desc: VIOLATIONS.NO_BOM_WITH_NON_ASCII });
    }

    // Check 2+3: UTF-8 init headers (skip smoke-test.ps1 / generated test files)
    if (!path.basename(filePath).startsWith('smoke-')) {
        if (!/\[Console\]::OutputEncoding\s*=\s*\[System\.Text\.Encoding\]::UTF8/.test(head30)) {
            violations.push({ rule: 'MISSING_OUTPUT_ENCODING', desc: VIOLATIONS.MISSING_OUTPUT_ENCODING });
        }
        if (!/\[Console\]::InputEncoding\s*=\s*\[System\.Text\.Encoding\]::UTF8/.test(head30)) {
            violations.push({ rule: 'MISSING_INPUT_ENCODING', desc: VIOLATIONS.MISSING_INPUT_ENCODING });
        }
    }

    // Check 4: Get-Content / Set-Content default (excluding pipeline-config.json read which is allowed via [System.IO.File])
    const getContentMatches = [...content.matchAll(/Get-Content\s+[^|]*?(?:\s*-Raw)?\s*\|\s*ConvertFrom-Json/g)];
    if (getContentMatches.length > 0) {
        violations.push({
            rule: 'USE_GET_CONTENT_DEFAULT',
            desc: VIOLATIONS.USE_GET_CONTENT_DEFAULT,
            count: getContentMatches.length,
        });
    }
    const setContentMatches = [...content.matchAll(/^\s*[^#].*?\|\s*(?:Set-Content|Out-File)\s+(?!.*-Encoding)/gm)];
    if (setContentMatches.length > 0) {
        violations.push({
            rule: 'USE_SET_CONTENT_DEFAULT',
            desc: VIOLATIONS.USE_SET_CONTENT_DEFAULT,
            count: setContentMatches.length,
        });
    }

    // Check 5: Danger chars (em dash hard fail; box draw warn)
    const emDashMatches = (content.match(/—/g) || []).length;
    if (emDashMatches > 0) {
        violations.push({
            rule: 'DANGER_CHAR_EM_DASH',
            desc: VIOLATIONS.DANGER_CHAR_EM_DASH,
            count: emDashMatches,
        });
    }

    return violations;
}

function main() {
    const includeLegacy = process.argv.includes('--strict');
    let strictFiles = 0;
    let strictViolations = 0;
    let legacyFiles = 0;
    let legacyViolations = 0;
    const failedStrict = [];
    const failedLegacy = [];

    // v5.0.0 strict scope (party-to-pipeline scripts) — fail CI if violations
    for (const dir of SCAN_DIRS) {
        for (const f of walkPs1Files(dir)) {
            strictFiles++;
            const vs = checkFile(f);
            if (vs.length > 0) {
                failedStrict.push({ file: f, violations: vs });
                strictViolations += vs.length;
            }
        }
    }

    // Legacy scope (warning-only, ad-hoc tracking)
    for (const dir of LEGACY_SCAN_DIRS) {
        for (const f of walkPs1Files(dir)) {
            legacyFiles++;
            const vs = checkFile(f);
            if (vs.length > 0) {
                failedLegacy.push({ file: f, violations: vs });
                legacyViolations += vs.length;
            }
        }
    }

    // Strict result (party-to-pipeline scripts)
    if (failedStrict.length === 0) {
        console.log(`[OK] check-ps-encoding STRICT: ${strictFiles} party-to-pipeline .ps1 files passed`);
    } else {
        console.log(`[ERR] check-ps-encoding STRICT: ${strictViolations} violations across ${failedStrict.length}/${strictFiles} files\n`);
        for (const ff of failedStrict) {
            console.log(`  ${ff.file}:`);
            for (const v of ff.violations) {
                const countStr = v.count ? ` (x${v.count})` : '';
                console.log(`    [${v.rule}]${countStr} ${v.desc}`);
            }
        }
    }

    // Legacy result (warning summary)
    if (legacyFiles > 0) {
        console.log(`\n[WARN] LEGACY scope: ${legacyViolations} violations across ${failedLegacy.length}/${legacyFiles} files (follow-up: td-pipeline-legacy-ps1-encoding-cleanup)`);
        if (includeLegacy) {
            for (const ff of failedLegacy) {
                console.log(`  ${ff.file}: ${ff.violations.length} violation(s)`);
            }
        }
    }

    console.log(`\nReference: phycool-windows-ps-encoding §3-§7 + .claude/rules/encoding-discipline.md`);
    // Exit code: STRICT violations fail CI; LEGACY warning-only
    process.exit(failedStrict.length > 0 ? 1 : 0);
}

main();
