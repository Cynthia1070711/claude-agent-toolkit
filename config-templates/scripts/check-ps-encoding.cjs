#!/usr/bin/env node
/**
 * check-ps-encoding.cjs - PowerShell 5.1 繁中 UTF-8 CI Guard
 *
 * 對齊 phycool-windows-ps-encoding §CI Guard 計畫
 * 掃描所有 .ps1 檔案,9 條檢查:
 *   1. .ps1 含中文/em dash → 必有 UTF-8 BOM (前 3 byte = EF BB BF)
 *   2. .ps1 必有 [Console]::OutputEncoding init (前 60 行 grep)
 *   3. .ps1 必有 [Console]::InputEncoding init (前 60 行 grep)
 *   4. ❌ 禁用 Get-Content / Set-Content / Out-File 預設 (應改 [System.IO.File])
 *   5. ❌ 禁含 em dash (—) U+2014
 *   6. ❌ 禁含 box drawing 主要字元 U+2500-257F(STRICT scope 依 strict_char_baseline 只罰超出基準的新增字元)
 *   7. ❌ 禁含全形彎引號「」『』U+300C-300F(同上基準機制)
 *   8. ❌ 禁含全形空白 U+3000
 *   9. ❌ STRICT scope(party-to-pipeline)禁 spawn/引用 pwsh(宿主契約,BR-HOST-11)
 *
 * Scope:
 *   STRICT (fail CI)   = .claude/skills/party-to-pipeline/scripts/ 全部
 *                      + scripts/ 與 .claude/hooks/ 下「不在 grandfather 造冊內」的新增檔
 *   LEGACY (warn-only) = scripts/ 與 .claude/hooks/ 下「在 grandfather 造冊內」的既有違規檔
 *
 * Exit 0: all pass | Exit 1: STRICT violations found(含新增違規檔)
 *
 * Usage: node scripts/check-ps-encoding.cjs [--verbose]
 *   --verbose  額外列印 LEGACY(grandfathered)每檔違規數明細(舊名 --strict,T13 更名避免與 CI 失敗與否混淆)
 */

const fs = require('fs');
const path = require('path');

// v5.0.0 strict scope: party-to-pipeline scripts(核心改造範圍,恆 STRICT,無 grandfather)
const SCAN_DIRS = [
    '.claude/skills/party-to-pipeline/scripts',
];

// v5.9.0(td-devenv-guard-psenc-doc-convergence T10):既有違規檔以 grandfather 造冊
// warning-only 收斂,造冊外的新增/新增違規一律 STRICT(fail CI)。
const LEGACY_SCAN_DIRS = [
    '.claude/hooks',
    'scripts',
];

const GRANDFATHER_PATH = path.join(__dirname, 'ps-encoding-grandfather.json');

// Check 9 (host contract) applies to these prefixes only — see checkFile Check 9 comment.
const PARTY_TO_PIPELINE_PREFIXES = SCAN_DIRS.map(d => toRosterKey(d) + '/');

const VIOLATIONS = {
    NO_BOM_WITH_NON_ASCII: 'PS 5.1 .ps1 含中文/em dash 必有 UTF-8 BOM (EF BB BF)',
    MISSING_OUTPUT_ENCODING: '頂端缺 [Console]::OutputEncoding = UTF8',
    MISSING_INPUT_ENCODING: '頂端缺 [Console]::InputEncoding = UTF8',
    USE_GET_CONTENT_DEFAULT: 'Get-Content 預設 (Big5) — 改 [System.IO.File]::ReadAllText UTF-8',
    USE_SET_CONTENT_DEFAULT: 'Set-Content/Out-File 預設 — 改 [System.IO.File]::WriteAllText UTF-8 No-BOM',
    DANGER_CHAR_EM_DASH: 'em dash (—) U+2014 — 改 -- (Big5 不支援)',
    DANGER_CHAR_BOX_DRAW_MAIN: 'box drawing 主要字元(─═║等 U+2500-257F)— 改 -=| 或 ASCII 分隔線(Big5 不支援)',
    DANGER_CHAR_CURLY_QUOTE: '全形彎引號(「」『』U+300C-300F)— 改半形 "\' (Big5 不穩定)',
    DANGER_CHAR_FULLWIDTH_SPACE: '全形空白 U+3000 — 改半形空白(對齊問題 + Big5 不支援)',
    HOST_CONTRACT_PWSH_SPAWN: 'party-to-pipeline scripts 禁 spawn/引用 pwsh — 變更宿主須先以 scripts/poc/whp-1/test-close-event.ps1 重跑 whp-1 R2(Windows PowerShell 5.1 為宿主鎖定,2026-07-27 使用者裁定,見 phycool-windows-ps-encoding §host-contract)',
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

// Normalize a cwd-relative path (may contain Windows backslashes) to the
// forward-slash form used as roster keys in ps-encoding-grandfather.json.
function toRosterKey(relPath) {
    return relPath.split(path.sep).join('/');
}

// Roster load must be loud on failure. Silently falling back to an empty roster
// turns every grandfathered file into a "new file" STRICT failure and blocks the
// whole repo's commits while claiming, falsely, that 25 pre-existing scripts are new.
function loadGrandfather() {
    const rosterRel = toRosterKey(path.relative(process.cwd(), GRANDFATHER_PATH));
    const empty = { baseline_count: 0, baseline_violation_count: 0, entries: [], strict_char_baseline: {} };
    if (!fs.existsSync(GRANDFATHER_PATH)) {
        console.log(`[WARN] Grandfather 造冊不存在: ${rosterRel}`);
        console.log(`  後果: scripts/ 與 .claude/hooks 下所有 .ps1 一律以 STRICT 判定(既有檔會被標為新增檔)。`);
        console.log(`  若非刻意移除,請自版控還原該檔再重跑。\n`);
        return empty;
    }
    try {
        const data = JSON.parse(fs.readFileSync(GRANDFATHER_PATH, 'utf8'));
        if (!data.entries) data.entries = [];
        if (!data.strict_char_baseline) data.strict_char_baseline = {};
        return data;
    } catch (e) {
        console.log(`[ERR] Grandfather 造冊解析失敗: ${rosterRel}`);
        console.log(`  ${e.message}`);
        console.log(`  後果: 本次改以空造冊判定,既有檔會被標為新增檔並使 CI 失敗。這不是 STRICT 違規,是造冊檔損毀。\n`);
        return empty;
    }
}

/**
 * @param {string} filePath cwd-relative path to the .ps1 file
 * @param {{box_drawing?: number, curly_quote?: number}} [charBaseline] 該檔於 STRICT scope 的字元基準(未提供則基準一律為 0)
 */
function checkFile(filePath, charBaseline) {
    const violations = [];
    const buf = fs.readFileSync(filePath);
    const content = buf.toString('utf8');
    // ASCII-only source form on purpose: the range used to start with a literal
    // U+0080 control character, invisible in editors, which was silently dropped
    // once and degraded this to a plain-hyphen class (fabricated BOM violations).
    const hasNonAscii = /[^\x00-\x7F]/.test(content);
    const hasBom = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
    // Scan first 60 lines (extended from original 30 to handle [CmdletBinding()]+param() blocks
    // — UTF-8 init must be AFTER param() closing `)` per PowerShell parser requirement, not before.
    // Larger param blocks (e.g., orchestrator.ps1 v5.0.0 with 13 params) push UTF-8 init past line 30.
    const head60 = content.split('\n').slice(0, 60).join('\n');

    // Check 1: BOM required when non-ASCII present
    if (hasNonAscii && !hasBom) {
        violations.push({ rule: 'NO_BOM_WITH_NON_ASCII', desc: VIOLATIONS.NO_BOM_WITH_NON_ASCII });
    }

    // Check 2+3: UTF-8 init headers (skip smoke-test.ps1 / generated test files)
    if (!path.basename(filePath).startsWith('smoke-')) {
        if (!/\[Console\]::OutputEncoding\s*=\s*\[System\.Text\.Encoding\]::UTF8/.test(head60)) {
            violations.push({ rule: 'MISSING_OUTPUT_ENCODING', desc: VIOLATIONS.MISSING_OUTPUT_ENCODING });
        }
        if (!/\[Console\]::InputEncoding\s*=\s*\[System\.Text\.Encoding\]::UTF8/.test(head60)) {
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

    // Check 5: em dash (always zero-tolerance, no baseline)
    const emDashMatches = (content.match(/—/g) || []).length;
    if (emDashMatches > 0) {
        violations.push({ rule: 'DANGER_CHAR_EM_DASH', desc: VIOLATIONS.DANGER_CHAR_EM_DASH, count: emDashMatches });
    }

    // Check 6: box drawing — only the excess over strict_char_baseline is a violation
    const boxDrawCount = (content.match(/[─-╿]/g) || []).length;
    const boxDrawBaseline = (charBaseline && charBaseline.box_drawing) || 0;
    if (boxDrawCount > boxDrawBaseline) {
        violations.push({
            rule: 'DANGER_CHAR_BOX_DRAW_MAIN',
            desc: VIOLATIONS.DANGER_CHAR_BOX_DRAW_MAIN,
            count: boxDrawCount - boxDrawBaseline,
        });
    }

    // Check 7: curly quotes — only the excess over strict_char_baseline is a violation
    const curlyQuoteCount = (content.match(/[「-』]/g) || []).length;
    const curlyQuoteBaseline = (charBaseline && charBaseline.curly_quote) || 0;
    if (curlyQuoteCount > curlyQuoteBaseline) {
        violations.push({
            rule: 'DANGER_CHAR_CURLY_QUOTE',
            desc: VIOLATIONS.DANGER_CHAR_CURLY_QUOTE,
            count: curlyQuoteCount - curlyQuoteBaseline,
        });
    }

    // Check 8: full-width space (zero-tolerance — 0 pre-existing hits across all scopes at baseline)
    const fullwidthSpaceMatches = (content.match(/　/g) || []).length;
    if (fullwidthSpaceMatches > 0) {
        violations.push({
            rule: 'DANGER_CHAR_FULLWIDTH_SPACE',
            desc: VIOLATIONS.DANGER_CHAR_FULLWIDTH_SPACE,
            count: fullwidthSpaceMatches,
        });
    }

    // Check 9: host contract — party-to-pipeline scripts must not spawn/reference pwsh.
    // Scope is deliberately limited to SCAN_DIRS (party-to-pipeline): SKILL.md §13 contract #3
    // explicitly SANCTIONS absolute-path pwsh references elsewhere ("釘絕對路徑、禁裸名"),
    // and `\bpwsh\.exe\b` would otherwise flag exactly that sanctioned form.
    // Literal string match only (intentional-drift defense, NOT adversarial-proof):
    // string concat ("pw"+"sh") and indirection ($exe='pwsh'; Start-Process $exe) bypass this.
    // Note: `& $PSHOME\pwsh.exe` IS caught by the second alternative — do not claim otherwise.
    if (PARTY_TO_PIPELINE_PREFIXES.some(p => toRosterKey(filePath).startsWith(p))) {
        const pwshMatches = (content.match(/Start-Process\s+["']?pwsh(?:\.exe)?["']?|\bpwsh\.exe\b/gi) || []).length;
        if (pwshMatches > 0) {
            violations.push({ rule: 'HOST_CONTRACT_PWSH_SPAWN', desc: VIOLATIONS.HOST_CONTRACT_PWSH_SPAWN, count: pwshMatches });
        }
    }

    return violations;
}

/**
 * AC21 — grandfather 造冊完整性:只減不增須被機械保證。
 * 造冊本身若允許靜默擴充、或允許保留 stale 項,就從過渡機制變成永久消音器。
 * 造冊與實況一致時不輸出任何雜訊。
 */
function checkGrandfatherIntegrity(grandfather) {
    const lines = [];
    const entries = grandfather.entries || [];
    if (entries.length === 0) return lines;

    if (typeof grandfather.baseline_count === 'number' && entries.length > grandfather.baseline_count) {
        lines.push(`[WARN] Grandfather 造冊被擴充: entries ${entries.length} > baseline_count ${grandfather.baseline_count}(只減不增,禁靜默新增 —— 見 ${path.basename(GRANDFATHER_PATH)})`);
    }

    const staleMissing = [];
    const staleFixed = [];
    for (const entry of entries) {
        if (!fs.existsSync(entry.file)) {
            staleMissing.push(entry.file);
            continue;
        }
        const vs = checkFile(entry.file);
        if (vs.length === 0) {
            staleFixed.push(entry.file);
        }
    }
    if (staleMissing.length > 0) {
        lines.push(`[INFO] Grandfather 造冊可移除項(檔案已不存在,${staleMissing.length} 筆,應自 entries 移除):`);
        for (const f of staleMissing) lines.push(`  - ${f}`);
    }
    if (staleFixed.length > 0) {
        lines.push(`[INFO] Grandfather 造冊可移除項(已不再違規,${staleFixed.length} 筆,應自 entries 移除):`);
        for (const f of staleFixed) lines.push(`  - ${f}`);
    }
    return lines;
}

function main() {
    const verbose = process.argv.includes('--verbose');
    const grandfather = loadGrandfather();
    const grandfatherSet = new Set(grandfather.entries.map(e => e.file));

    let strictFiles = 0;
    let strictViolations = 0;
    const failedStrict = [];

    // party-to-pipeline scripts — always STRICT (core scope, unchanged v5.0.0 behavior).
    // Check 6/7 apply strict_char_baseline so pre-existing box-drawing/curly-quote content
    // (written before those rules existed) is grandfathered; only excess chars fail.
    for (const dir of SCAN_DIRS) {
        for (const f of walkPs1Files(dir)) {
            strictFiles++;
            const rosterKey = toRosterKey(f);
            const vs = checkFile(f, grandfather.strict_char_baseline[rosterKey]);
            if (vs.length > 0) {
                failedStrict.push({ file: f, violations: vs });
                strictViolations += vs.length;
            }
        }
    }

    // scripts/ + .claude/hooks — new files (not in grandfather roster) go STRICT;
    // grandfathered files stay LEGACY (warning-only).
    let legacyFiles = 0;
    let legacyViolations = 0;
    const failedLegacy = [];

    for (const dir of LEGACY_SCAN_DIRS) {
        for (const f of walkPs1Files(dir)) {
            const rosterKey = toRosterKey(f);
            const vs = checkFile(f);
            if (grandfatherSet.has(rosterKey)) {
                legacyFiles++;
                if (vs.length > 0) {
                    failedLegacy.push({ file: f, violations: vs });
                    legacyViolations += vs.length;
                }
            } else {
                // Not grandfathered => new file => STRICT
                strictFiles++;
                if (vs.length > 0) {
                    failedStrict.push({ file: f, violations: vs, isNewFile: true });
                    strictViolations += vs.length;
                }
            }
        }
    }

    // Strict result
    if (failedStrict.length === 0) {
        console.log(`[OK] check-ps-encoding STRICT: ${strictFiles} files passed (party-to-pipeline + scripts/.claude/hooks 新增檔)`);
    } else {
        console.log(`[ERR] check-ps-encoding STRICT: ${strictViolations} violations across ${failedStrict.length}/${strictFiles} files\n`);
        for (const ff of failedStrict) {
            const tag = ff.isNewFile ? ' [新增檔 — 不在 grandfather 造冊內]' : '';
            console.log(`  ${ff.file}${tag}:`);
            for (const v of ff.violations) {
                const countStr = v.count ? ` (x${v.count})` : '';
                console.log(`    [${v.rule}]${countStr} ${v.desc}`);
            }
        }
    }

    // Legacy (grandfathered) result — warning-only, does not affect exit code
    if (legacyFiles > 0) {
        console.log(`\n[WARN] LEGACY scope(grandfathered,warning-only): ${legacyViolations} violations across ${failedLegacy.length}/${legacyFiles} files`);
        console.log(`  造冊: ${toRosterKey(path.relative(process.cwd(), GRANDFATHER_PATH))}(story_id: ${grandfather.story_id || 'td-devenv-guard-psenc-doc-convergence'})`);
        console.log(`  下一步: 逐項修復後將該檔案自造冊 entries 移除(只減不增,見造冊 _comment)`);
        if (verbose) {
            for (const ff of failedLegacy) {
                console.log(`  ${ff.file}: ${ff.violations.length} violation(s)`);
            }
        }
    }

    // Grandfather roster integrity (AC21) — silent when roster matches reality
    const integrityLines = checkGrandfatherIntegrity(grandfather);
    if (integrityLines.length > 0) {
        console.log('');
        for (const l of integrityLines) console.log(l);
    }

    console.log(`\nReference: phycool-windows-ps-encoding §3-§7 + .claude/rules/encoding-discipline.md`);
    // Exit code: STRICT violations fail CI; LEGACY warning-only
    process.exit(failedStrict.length > 0 ? 1 : 0);
}

main();
