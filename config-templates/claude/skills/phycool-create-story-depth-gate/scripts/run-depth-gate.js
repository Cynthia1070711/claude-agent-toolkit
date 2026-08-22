#!/usr/bin/env node
// ============================================================
// PhyCool Create-Story Depth Gate — Runner
// Usage:
//   node run-depth-gate.js <story_id> [--only=D1,D4] [--skip-d4] [--dry-run]
//   ⚠ --only uses the `=` form. A space-separated `--only D7` is silently ignored
//     by parseArgs() and every gate runs.
//
// Exit code:
//   0 = all PASS
//   1 = WARN only (Story can proceed with warnings)
//   2 = BLOCK (Story must return to backlog)
//   3 = script error
// ============================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DB_PATH = path.join(PROJECT_ROOT, '.context-db', 'phycool.db');

// resolve better-sqlite3 from .context-db/node_modules
const require = createRequire(path.join(PROJECT_ROOT, '.context-db', 'package.json'));
const Database = require('better-sqlite3');

// [T7 · td-devenv-guard-gate-false-signal-repair] Shared Markdown normalize —
// same paragraph-break fixer upsert-story.js uses at its single write-enforcement
// point (_doUpsert -> applyMarkdownNormalization), so this gate's own report
// writes (dev_notes append + --accept-warn marker) stop bypassing it via direct
// SQL, which was the root cause of the gate self-reporting a WARN on its own
// prior output (TD-DEPTH-GATE-REPORT-MD-NORMALIZE).
// Dynamic import + explicit exit(3): a load failure here must be LOUD, not a
// silent fallback to un-normalized writes (AC22) — a static top-level import's
// resolution failure would otherwise crash with Node's default (non-3) exit code.
let normalizeMarkdownBreaks;
try {
  ({ normalizeMarkdownBreaks } = await import('../../../../.context-db/scripts/markdown-normalize.js'));
} catch (err) {
  console.error(`❌ Fatal: failed to load shared markdown-normalize module: ${err.message}`);
  process.exit(3);
}

// D7 §7.1b testing_strategy structural check — same loud-failure contract as above.
let checkTestingStrategyStructure;
try {
  ({ checkTestingStrategyStructure } = await import('../../../../.context-db/scripts/testing-strategy-structure.js'));
} catch (err) {
  console.error(`❌ Fatal: failed to load testing-strategy-structure module: ${err.message}`);
  process.exit(3);
}

// D3 spec-ref harvest + D1 skill classification (bwu-8-gate-regex-and-audit-heuristics
// AC3/AC4) — same loud-failure contract as above.
let harvestSpecRefs, buildSkillReadReport;
try {
  ({ harvestSpecRefs, buildSkillReadReport } = await import('../../../../.context-db/scripts/depth-gate-heuristics.js'));
} catch (err) {
  console.error(`❌ Fatal: failed to load depth-gate-heuristics module: ${err.message}`);
  process.exit(3);
}

function getTaiwanTimestamp() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = { storyId: null, only: null, skipD4: false, d4Manual: false, dryRun: false, acceptWarn: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--only=')) result.only = a.slice(7).split(',');
    else if (a === '--skip-d4') result.skipD4 = true;
    else if (a === '--d4-manual') result.d4Manual = true;
    else if (a === '--dry-run') result.dryRun = true;
    else if (a === '--accept-warn') {
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        console.error('❌ --accept-warn requires a reason string. Example: --accept-warn "D2 scope drift is historical, migrated to TD-xxx"');
        process.exit(3);
      }
      result.acceptWarn = next;
      i++;
    }
    else if (!a.startsWith('--') && !result.storyId) result.storyId = a;
  }
  return result;
}

function loadStory(db, storyId) {
  const row = db.prepare('SELECT * FROM stories WHERE story_id = ?').get(storyId);
  if (!row) {
    console.error(`❌ Story ${storyId} not found in DB`);
    process.exit(3);
  }
  return row;
}

// ── Gate D1: Skill Read ─────────────────────────────────────
// bwu-8-gate-regex-and-audit-heuristics AC4: the per-skill existence/version/
// epic-drift loop now lives in depth-gate-heuristics.js's buildSkillReadReport
// (classification-aware — only warns for skills this story actually modifies),
// so it carries a test that doesn't need to spawn this CLI. This function is a
// thin adapter back onto the {name, status, warnings, blocks, lines} shape
// main() expects from every gate.
function runD1(story) {
  const report = buildSkillReadReport(story, PROJECT_ROOT);
  return { name: 'D1 Skill Read', ...report };
}

// ── Gate D2: ADR + IDD Cross-Ref ────────────────────────────
function runD2(story, db) {
  const result = { name: 'D2 ADR/IDD Cross-Ref', status: 'PASS', warnings: [], blocks: [], lines: [] };
  const scanText = `${story.background || ''}\n${story.implementation_approach || ''}\n${story.dev_notes || ''}`;
  const adrMatches = [...scanText.matchAll(/ADR-[A-Z]+-\d+/g)].map(m => m[0]);
  const iddMatches = [...scanText.matchAll(/IDD-(?:COM|STR|REG|USR)-\d+/g)].map(m => m[0]);
  const uniqAdr = [...new Set(adrMatches)];
  const uniqIdd = [...new Set(iddMatches)];

  for (const adr of uniqAdr) {
    const adrDir = path.join(PROJECT_ROOT, 'docs', 'technical-decisions');
    if (!fs.existsSync(adrDir)) continue;
    const files = fs.readdirSync(adrDir).filter(f => f.startsWith(adr) && f.endsWith('.md'));
    if (files.length === 0) {
      result.blocks.push(`ADR ${adr} not found in docs/technical-decisions/`);
      result.status = 'BLOCK';
      continue;
    }
    const adrContent = fs.readFileSync(path.join(adrDir, files[0]), 'utf-8');
    const versionMatches = [...adrContent.matchAll(/^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(v[\d.]+)\s*\|/gm)];
    const latestVersion = versionMatches.length ? versionMatches[versionMatches.length - 1][2] : 'v?';
    const storyRefVersion = (scanText.match(new RegExp(`${adr}\\s+(v[\\d.]+)`)) || [])[1];
    const superseded = /Status.*Superseded/i.test(adrContent);
    result.lines.push(`- ${adr} (latest ${latestVersion}${storyRefVersion ? `, Story refs ${storyRefVersion}` : ''})`);
    if (superseded) {
      result.blocks.push(`ADR ${adr} is Superseded — must update Story reference`);
      result.status = 'BLOCK';
    }
    if (storyRefVersion && storyRefVersion !== latestVersion) {
      // v1.2.2: Scope Limitation 認定 — 若 dev_notes 有 "## {ADR} Scope Limitation" 章節 → 視為 scope-aware drift,PASS
      const scopeMarkerRe = new RegExp(`${adr}\\s+Scope\\s+Limitation|${adr}\\s+scope\\s+限定|${adr}\\s+scope\\s+對應`, 'i');
      if (scopeMarkerRe.test(story.dev_notes || '')) {
        result.lines.push(`- ${adr}: Scope Limitation 章節存在於 dev_notes,${storyRefVersion} → ${latestVersion} 認定 scope-aligned ✅`);
      } else {
        result.warnings.push(`ADR ${adr} version drift: Story refs ${storyRefVersion}, actual ${latestVersion} (建議 dev_notes 補 "## ${adr} Scope Limitation" 章節)`);
        if (result.status === 'PASS') result.status = 'WARN';
      }
    }
  }

  for (const idd of uniqIdd) {
    const row = db.prepare('SELECT idd_id, status, forbidden_changes, platform_modules, related_skills FROM intentional_decisions WHERE idd_id = ?').get(idd);
    if (!row) {
      result.warnings.push(`IDD ${idd} referenced but NOT in intentional_decisions table`);
      if (result.status === 'PASS') result.status = 'WARN';
      continue;
    }
    if (row.status !== 'active') {
      result.blocks.push(`IDD ${idd} status=${row.status} (not active) — must not reference`);
      result.status = 'BLOCK';
      continue;
    }
    let forbidden = [];
    try { forbidden = JSON.parse(row.forbidden_changes || '[]'); } catch {}
    result.lines.push(`- ${idd} (active, ${forbidden.length} forbidden changes)`);
  }

  // Reverse scan: affected_files → IDD hits
  const affectedFilesStr = story.affected_files || '';
  const affectedFiles = affectedFilesStr.startsWith('[')
    ? (() => { try { return JSON.parse(affectedFilesStr); } catch { return affectedFilesStr.split(',').map(s => s.trim()); } })()
    : affectedFilesStr.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  for (const file of affectedFiles) {
    const filePath = typeof file === 'string' ? file.split(':')[0] : file.path;
    if (!filePath) continue;
    const rows = db.prepare("SELECT idd_id, title FROM intentional_decisions WHERE related_files LIKE ? AND status='active'").all(`%${filePath}%`);
    for (const r of rows) {
      if (!uniqIdd.includes(r.idd_id)) {
        result.warnings.push(`Affected file ${filePath} hits IDD ${r.idd_id} (${r.title}) but Story didn't reference it`);
        if (result.status === 'PASS') result.status = 'WARN';
      }
    }
  }
  return result;
}

// ── Gate D3: PRD / functional-spec source ───────────────────
function runD3(story) {
  const result = { name: 'D3 PRD Source', status: 'PASS', warnings: [], blocks: [], lines: [] };
  const discovery = story.discovery_source || '';
  if (!discovery) {
    result.warnings.push('discovery_source empty — requirement source untraceable');
    result.status = 'WARN';
    return result;
  }
  result.lines.push(`- Discovery: ${discovery.substring(0, 120)}`);
  // bwu-8-gate-regex-and-audit-heuristics AC3: file-system existence is now the
  // judge (harvestSpecRefs), replacing a `docs/[\w\-./]+\.md` regex that could
  // never match non-ASCII paths or this project's directory-shaped (non-.md)
  // SSoT references. harvestSpecRefs already dedupes; the preview below shows
  // backtick-quoted references before bare ones (see its JSDoc), so an explicitly
  // quoted path is what surfaces in the top 3.
  const specHints = harvestSpecRefs(story.background, PROJECT_ROOT);
  if (specHints.length > 0) {
    result.lines.push(`- Spec refs: ${specHints.slice(0, 3).join(', ')}`);
  } else if (story.story_type !== 'Bug Fix' && story.story_type !== 'Tech Debt') {
    result.warnings.push('No spec references found in background — requirement source weakly traceable');
    if (result.status === 'PASS') result.status = 'WARN';
  }
  return result;
}

// ── Gate D4: Chrome MCP Live Reverify (UI only) ─────────────
function runD4(story, skip, d4Manual) {
  const result = { name: 'D4 Chrome MCP Live', status: 'PASS', warnings: [], blocks: [], lines: [] };
  const affectedFiles = (story.affected_files || '') + (story.file_list || '');
  const isUI = /\.(cshtml|tsx|razor|css|razor\.cs)/.test(affectedFiles) ||
               /\bui\b|\bmodal\b|\bdashboard\b|\bchrome-mcp-live\b/i.test(story.tags || '');
  if (!isUI) {
    result.lines.push('- Story 非 UI 類型 → D4 skip');
    return result;
  }
  // --d4-manual: Agent 已實際用 Chrome MCP verify 過,檢查 dev_notes 是否有 marker
  if (d4Manual) {
    const markerRe = /\[Chrome MCP Live Verification @[^\]]+\]/g;
    const matches = (story.dev_notes || '').match(markerRe) || [];
    if (matches.length > 0) {
      result.lines.push('- [D4-manual] Chrome MCP Live Verification marker 確認於 dev_notes ✅');
      matches.slice(0, 3).forEach(m => result.lines.push('  · ' + m));
      return result;
    }
    result.warnings.push('--d4-manual set 但 dev_notes 缺 [Chrome MCP Live Verification @ ...] marker');
    if (result.status === 'PASS') result.status = 'WARN';
    return result;
  }
  if (skip) {
    result.warnings.push('--skip-d4 flag active — Chrome MCP not executed');
    result.status = 'WARN';
    return result;
  }
  // SSL thumbprint 三層對比 (v1.2.0) — 偵測 Kestrel cert 與 CurrentUser Root/My 不匹配
  try {
    const psScript = `$ErrorActionPreference='SilentlyContinue';` +
      `[System.Net.ServicePointManager]::ServerCertificateValidationCallback={$true};` +
      `$r=[System.Net.HttpWebRequest]::Create('https://localhost:7135/');` +
      `$r.AllowAutoRedirect=$false;$r.Timeout=5000;try{$r.GetResponse()|Out-Null}catch{}` +
      `$kestrel=if($r.ServicePoint.Certificate){$r.ServicePoint.Certificate.GetCertHashString()}else{'NONE'};` +
      `$root=(Get-ChildItem Cert:\\CurrentUser\\Root|Where-Object{$_.Subject -match 'localhost'}|Select-Object -First 1).Thumbprint;` +
      `$my=(Get-ChildItem Cert:\\CurrentUser\\My|Where-Object{$_.Subject -match 'localhost'}|Select-Object -First 1).Thumbprint;` +
      `Write-Output "KESTREL=$kestrel|ROOT=$root|MY=$my"`;
    const out = execSync(`powershell -NoProfile -Command "${psScript}"`, { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 8000 }).trim();
    const m = out.match(/KESTREL=(\w+)\|ROOT=(\w*)\|MY=(\w*)/);
    if (m) {
      const [_, kestrel, root, my] = m;
      result.lines.push(`- Kestrel cert: ${kestrel.substring(0, 12)}...`);
      result.lines.push(`- CurrentUser\\Root: ${root ? root.substring(0, 12) + '...' : 'MISSING'}`);
      result.lines.push(`- CurrentUser\\My: ${my ? my.substring(0, 12) + '...' : 'MISSING'}`);
      if (kestrel === 'NONE' || !root || !my) {
        result.blocks.push('SSL cert 層缺失: Kestrel/Root/My 任一為空');
        result.status = 'BLOCK';
      } else if (kestrel !== root || kestrel !== my) {
        result.blocks.push(`SSL thumbprint 不匹配 — Chrome 會 ERR_CERT_AUTHORITY_INVALID. Fix: (1) Remove-Item stale Root cert (2) taskkill /F /IM chrome.exe /T (3) dev-certs --clean + --trust (4) start-servers pcpt --restart. 詳見 phycool-e2e-playwright §8.5`);
        result.status = 'BLOCK';
      } else {
        result.lines.push('- SSL thumbprint 三層對齊 ✅');
      }
    }
  } catch (e) {
    result.warnings.push('SSL thumbprint 對比 skipped: ' + (e.message || '').substring(0, 80));
    if (result.status === 'PASS') result.status = 'WARN';
  }
  // Server probing (advisory)
  try {
    const backend = execSync('curl -k -s -o /dev/null -w "%{http_code}" https://localhost:7135', { cwd: PROJECT_ROOT, encoding: 'utf-8' }).trim();
    if (!['200', '302', '301'].includes(backend)) {
      result.blocks.push(`Backend https://localhost:7135 returned ${backend} — must start server`);
      result.status = 'BLOCK';
    } else {
      result.lines.push(`- Backend: ${backend} ✅`);
    }
  } catch (e) {
    result.blocks.push('Backend probe failed: ' + e.message);
    result.status = 'BLOCK';
  }
  try {
    const vite = execSync('curl -s -o /dev/null -w "%{http_code}" http://localhost:5173', { cwd: PROJECT_ROOT, encoding: 'utf-8' }).trim();
    if (vite !== '200') {
      result.warnings.push(`Vite http://localhost:5173 returned ${vite} — frontend dev mode may be off`);
      if (result.status === 'PASS') result.status = 'WARN';
    } else {
      result.lines.push(`- Vite: ${vite} ✅`);
    }
  } catch {
    result.warnings.push('Vite probe failed — frontend dev mode may be off');
    if (result.status === 'PASS') result.status = 'WARN';
  }
  result.lines.push('- Chrome MCP live DOM verification — REQUIRES manual invoke via Agent (mcp__chrome-devtools__navigate_page / evaluate_script)');
  result.lines.push('- If SSL blocks localhost:7135, run: `dotnet dev-certs https --clean && dotnet dev-certs https --trust`');
  return result;
}

// ── Gate D5: Iteration Pollution ────────────────────────────
// v1.2.1 (2026-04-14): fuzzy match — 支援 short path (basename) recursive search
const _fuzzyCache = new Map();
const FUZZY_EXCLUDE = new Set(['node_modules', 'bin', 'obj', '.git', '.vs', 'dist', '.context-db', '.claude', '.gemini', '.agent', 'TestResults', 'playwright-report', 'test-results']);
function fuzzyFindFile(basename) {
  if (_fuzzyCache.has(basename)) return _fuzzyCache.get(basename);
  const found = [];
  function walk(dir, depth) {
    if (depth > 8 || found.length > 0) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory() && !FUZZY_EXCLUDE.has(e.name) && !e.name.startsWith('.')) {
        walk(fp, depth + 1);
        if (found.length > 0) return;
      } else if (e.isFile() && e.name === basename) {
        found.push(fp);
        return;
      }
    }
  }
  walk(PROJECT_ROOT, 0);
  const result = found[0] || null;
  _fuzzyCache.set(basename, result);
  return result;
}

function runD5(story) {
  const result = { name: 'D5 Iteration Pollution', status: 'PASS', warnings: [], blocks: [], lines: [] };
  const bg = story.background || '';
  // file:line references
  const fileLineRefs = [...bg.matchAll(/([\w\-./]+\.(?:cs|cshtml|ts|tsx|js|md|css)):(?:L?)(\d+)(?:-\d+)?/g)];
  let verified = 0;
  let fuzzyMatched = 0;
  for (const m of fileLineRefs.slice(0, 10)) { // sample first 10
    const directPath = path.join(PROJECT_ROOT, m[1]);
    if (fs.existsSync(directPath)) {
      verified++;
      continue;
    }
    // Fuzzy fallback: basename search if short path not found at project root
    const basename = m[1].split('/').pop();
    const fuzzyFound = fuzzyFindFile(basename);
    if (fuzzyFound) {
      verified++;
      fuzzyMatched++;
      continue;
    }
    result.warnings.push(`Referenced file not found (direct+fuzzy): ${m[1]}:${m[2]}`);
    if (result.status === 'PASS') result.status = 'WARN';
  }
  const fuzzyNote = fuzzyMatched > 0 ? ` (${fuzzyMatched} via fuzzy basename match)` : '';
  result.lines.push(`- file:line refs: ${verified}/${fileLineRefs.length} verified${fuzzyNote}`);

  // commit sha checks
  const commitRefs = [...bg.matchAll(/\bcommit\s+([a-f0-9]{7,40})\b/gi)].map(m => m[1]);
  for (const sha of commitRefs) {
    try {
      execSync(`git cat-file -e ${sha}`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
      result.lines.push(`- ✅ commit ${sha} alive`);
    } catch {
      result.blocks.push(`commit ${sha} NOT alive in git log (rebased or revert)`);
      result.status = 'BLOCK';
    }
  }

  return result;
}

// ── Gate D6: Cross-Story Consistency ────────────────────────
function runD6(story, db) {
  const result = { name: 'D6 Cross-Story Consistency', status: 'PASS', warnings: [], blocks: [], lines: [] };
  if (!story.epic_id) {
    result.lines.push('- No epic_id → skip cross-story check');
    return result;
  }
  const siblings = db.prepare(`SELECT story_id, status, affected_files FROM stories WHERE epic_id = ? AND story_id != ? AND status IN ('backlog','ready-for-dev','in-progress','review')`).all(story.epic_id, story.story_id);

  const selfFiles = new Set();
  const selfFilesStr = story.affected_files || '';
  const selfList = selfFilesStr.startsWith('[')
    ? (() => { try { return JSON.parse(selfFilesStr); } catch { return selfFilesStr.split(',').map(s => s.trim()); } })()
    : selfFilesStr.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  for (const f of selfList) selfFiles.add((typeof f === 'string' ? f : f.path || '').split(':')[0]);

  for (const sib of siblings) {
    const sibFiles = new Set();
    const sibStr = sib.affected_files || '';
    const sibList = sibStr.startsWith('[')
      ? (() => { try { return JSON.parse(sibStr); } catch { return sibStr.split(',').map(s => s.trim()); } })()
      : sibStr.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    for (const f of sibList) sibFiles.add((typeof f === 'string' ? f : f.path || '').split(':')[0]);
    const overlap = [...selfFiles].filter(f => sibFiles.has(f));
    if (overlap.length > 0) {
      result.warnings.push(`Sibling Story ${sib.story_id} (${sib.status}) overlaps on: ${overlap.slice(0, 3).join(', ')}`);
      if (result.status === 'PASS') result.status = 'WARN';
    }
  }
  result.lines.push(`- Epic ${story.epic_id}: ${siblings.length} active siblings checked`);

  // Dependencies check
  const deps = (story.dependencies || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  for (const dep of deps) {
    const depMatch = dep.match(/^([\w-]+)/);
    if (!depMatch) continue;
    const depRow = db.prepare('SELECT story_id, status FROM stories WHERE story_id = ?').get(depMatch[1]);
    if (!depRow) {
      result.warnings.push(`Dependency "${depMatch[1]}" not in DB`);
      if (result.status === 'PASS') result.status = 'WARN';
    } else if (depRow.status !== 'done') {
      result.lines.push(`- Dep ${depRow.story_id}: ${depRow.status} (not done, soft OK)`);
    }
  }
  return result;
}

// ── Gate D7: Self-Write Verification (post-DB-write integrity) ──
function runD7(story) {
  const result = { name: 'D7 Self-Write Verification', status: 'PASS', warnings: [], blocks: [], lines: [] };

  // 7.1 欄位最小長度檢查
  const MIN_LENGTHS = {
    user_story: 100,
    background: 300,
    acceptance_criteria: 500,
    tasks: 500,
    dev_notes: 500,
    implementation_approach: 1000,
    testing_strategy: 500,
    definition_of_done: 300,
    risk_assessment: 200,
    rollback_plan: 200,
  };
  for (const [field, minLen] of Object.entries(MIN_LENGTHS)) {
    const value = story[field] || '';
    const len = value.length;
    if (len === 0) {
      result.blocks.push(`Field '${field}' is EMPTY (expected ≥ ${minLen})`);
      result.status = 'BLOCK';
    } else if (len < minLen) {
      result.warnings.push(`Field '${field}' length ${len} < expected min ${minLen} — may be truncated/corrupt`);
      if (result.status === 'PASS') result.status = 'WARN';
    } else {
      result.lines.push(`- ${field}: ${len} chars ✅`);
    }
  }

  // 7.1b [T4 · bwu-2-create-testspec-production] testing_strategy 結構驗證(M/L/XL only)
  // 補 7.1 純字元數檢查之不足 — 對應 SDD Spec §4.2:分級 gate + 三項斷言 + WARN 嚴重度(不進 blocks)
  // 判定邏輯抽至 .context-db/scripts/testing-strategy-structure.js(比照 markdown-normalize.js
  // 的抽出範式),使其有 .context-db/tests/testing-strategy-structure.test.js 回歸鎖定 —
  // 本檔為 CLI(載入即 main()),內部函式無法被測試 import。
  {
    const structural = checkTestingStrategyStructure(story);
    if (structural.skipped) {
      result.lines.push(`- testing_strategy: skipped (${structural.skipReason})`);
    } else if (structural.issues.length > 0) {
      for (const issue of structural.issues) result.warnings.push(`testing_strategy structural: ${issue}`);
      if (result.status === 'PASS') result.status = 'WARN';
    } else {
      result.lines.push(`- testing_strategy: structural ✅ (${structural.caseCount} cases, ${structural.citedBrCount} BRs covered)`);
    }
  }

  // 7.2 格式損壞偵測 (bash heredoc / template literal escape failures)
  // Precision-tuned: avoid false positives from legitimate JS template literals (${varName}) inside code fences
  const corruptionPatterns = [
    { name: 'Triple-backslash sequence', regex: /\\{3,}/, fields: ['implementation_approach', 'dev_notes', 'tasks'] },
    { name: 'Unreplaced placeholder keyword', regex: /\$\{(id-from-step-[a-z]|TODO|XXX|PLACEHOLDER|FIXME|story_id_here|epic_id_here|PATCH_ME)\}/i, fields: ['implementation_approach', 'dev_notes'] },
    { name: 'Empty/adjacent code fence pair (no content between)', regex: /```[a-z]*\n\s*```[^`]/, fields: ['implementation_approach', 'tasks'] },
    { name: 'Stray backslash before newline+Step/bullet at line start', regex: /^\\\n(?:Step|\*\*|-)/m, fields: ['implementation_approach'] },
    { name: 'Bash heredoc leftover pattern (line is only backslash)', regex: /^\\\s*\n/m, fields: ['implementation_approach', 'tasks'] },
  ];
  for (const pattern of corruptionPatterns) {
    for (const field of pattern.fields) {
      const value = story[field] || '';
      if (pattern.regex.test(value)) {
        result.blocks.push(`Corruption detected in '${field}': ${pattern.name}`);
        result.status = 'BLOCK';
      }
    }
  }

  // 7.3 Phase Breakdown 實際計數
  const phaseCount = ((story.implementation_approach || '').match(/^#{2,3}\s+Phase\s+\d+/gm) || []).length;
  if (phaseCount < 2) {
    result.warnings.push(`Phase breakdown: ${phaseCount} Phases found (expected ≥ 2)`);
    if (result.status === 'PASS') result.status = 'WARN';
  } else {
    result.lines.push(`- Phase breakdown: ${phaseCount} Phases ✅`);
  }

  // 7.4 DoD Checkbox 實際計數
  const dodCheckboxes = ((story.definition_of_done || '').match(/- \[ \]/g) || []).length;
  if (dodCheckboxes < 5) {
    result.warnings.push(`DoD checkboxes: ${dodCheckboxes} found (expected ≥ 5)`);
    if (result.status === 'PASS') result.status = 'WARN';
  } else {
    result.lines.push(`- DoD checkboxes: ${dodCheckboxes} items ✅`);
  }

  // 7.5 必填欄位 (create_agent, sdd_spec, status)
  const MUST_FIELDS = ['create_agent', 'sdd_spec', 'status'];
  for (const field of MUST_FIELDS) {
    if (!story[field]) {
      result.blocks.push(`Required field '${field}' is NULL/empty`);
      result.status = 'BLOCK';
    } else {
      result.lines.push(`- ${field}: ${story[field]} ✅`);
    }
  }

  // 7.6 Lifecycle Invariants (I1-I9) — 狀態機語意一致性驗證 (v2.0.0 2026-04-21 add I8/I9)
  // See: .claude/rules/story-lifecycle-invariants.md
  // I1-I4 + I8 為硬性不變量(violation=BLOCK);I5-I7 + I9 為對稱性(violation=WARN,Agent 可事後補填)
  const INVARIANTS = [
    { id: 'I1', cond: story.create_completed_at && !['ready-for-dev','in-progress','review','done'].includes(story.status),
      msg: `I1: create_completed_at set but status='${story.status}' (expected ready-for-dev/in-progress/review/done)` },
    { id: 'I2', cond: story.started_at && !['in-progress','review','done'].includes(story.status),
      msg: `I2: started_at set but status='${story.status}' (expected in-progress/review/done)` },
    { id: 'I3', cond: story.completed_at && !['review','done'].includes(story.status),
      msg: `I3: completed_at set but status='${story.status}' (expected review/done)` },
    { id: 'I4', cond: story.review_completed_at && story.status !== 'done',
      msg: `I4: review_completed_at set but status='${story.status}' (expected done)` },
    { id: 'I8', cond: story.review_started_at && !['review','done'].includes(story.status),
      msg: `I8: review_started_at set but status='${story.status}' (expected review/done)` },
  ];
  let invariantPassed = 0;
  for (const inv of INVARIANTS) {
    if (inv.cond) {
      result.blocks.push(`Lifecycle ${inv.msg}`);
      result.status = 'BLOCK';
    } else {
      invariantPassed++;
    }
  }
  // Agent symmetry (I5-I7, I9) — WARN only
  const SYMMETRY = [
    { id: 'I5', a: 'create_completed_at', b: 'create_agent' },
    { id: 'I6', a: 'completed_at',        b: 'dev_agent'    },
    { id: 'I7', a: 'review_completed_at', b: 'review_agent' },
    { id: 'I9', a: 'review_started_at',   b: 'review_agent' },
  ];
  let symPassed = 0;
  for (const sym of SYMMETRY) {
    const hasA = !!story[sym.a], hasB = !!story[sym.b];
    if (hasA !== hasB) {
      result.warnings.push(`Lifecycle ${sym.id}: ${sym.a}=${hasA ? 'set' : 'NULL'} but ${sym.b}=${hasB ? 'set' : 'NULL'} (should be both set or both NULL)`);
      if (result.status === 'PASS') result.status = 'WARN';
    } else {
      symPassed++;
    }
  }
  result.lines.push(`- Lifecycle invariants: I1-I4+I8 ${invariantPassed}/5 passed, I5-I7+I9 ${symPassed}/4 symmetric ✅`);

  // 7.7 [1B · 2026-06-12] Markdown 換行格式檢測 (DevConsole react-markdown soft-break 防黏一起)
  // 配合 1A(upsert-story.js applyMarkdownNormalization)寫入層 normalize;本 gate 補偵測 1A 抓不到的:
  //   (a) list/heading 單 \n 黏一起殘留(1A 前寫入或繞過寫入) (b) 內聯編號(" N." 無 \n,1A 無從加 \n\n)
  // react-markdown 鐵則: 單 \n = soft break(渲染成空格·同段落);\n\n = 段落換行。2026-06-12 m0-11 事故觸發。
  const MD_RENDER_FIELDS = ['tasks', 'pipeline_notes', 'acceptance_criteria', 'dev_notes',
    'implementation_approach', 'risk_assessment', 'rollback_plan', 'definition_of_done'];
  const mdIssues = [];
  for (const field of MD_RENDER_FIELDS) {
    let val = story[field] || '';
    if (!val) continue;
    // [T4.7 · TD-depth-gate-md-check-self-reference] dev_notes 掃描前先切除本 script 自己
    // append 的 Depth Gate Report 區段(見 main() 底部 '# Depth Gate Report' marker),
    // 只掃描 marker 之前的 agent 撰寫內容 — 避免下一輪對自己上次輸出的報告誤報 §7.7 WARN。
    if (field === 'dev_notes') {
      const markerIdx = val.indexOf('# Depth Gate Report');
      if (markerIdx >= 0) val = val.slice(0, markerIdx);
    }
    if (!val) continue;
    // (a) list item / heading 單 \n 黏一起殘留(應 \n\n 分段)
    if (/[^\n]\n(?:⬜|✅|☑|- |\* |#{1,6} |\d+\.\s)/.test(val)) {
      mdIssues.push(`${field}: list/heading 項目單 \\n 黏一起(DevConsole 渲染混在一起,應 \\n\\n)`);
    }
    // (b) 內聯編號(" N.")≥2 但 \n\n 段落不足(如 pipeline_notes 內聯,1A regex 無 \n 可加)
    const inlineNumbered = (val.match(/[。:)\]]\s\d+\.(?=\S)/g) || []).length;
    if (inlineNumbered >= 2 && (val.match(/\n\n/g) || []).length < inlineNumbered) {
      mdIssues.push(`${field}: 內聯編號(" N.")${inlineNumbered} 項但 \\n\\n 段落不足(應每項 \\n\\n 分段)`);
    }
    // (c) [2026-06-12 使用者裁定] 狀態符號文後/句中(應移文前·行首)— "文字 — ✅" / "(✅ 文字"(排除表格 cell)
    const symAfterLine = val.split('\n').find(line =>
      !/\|/.test(line) &&
      (/\S\s*—\s*[✅⚠❌☑]/.test(line) || /[(（]\s*[✅⚠❌☑]\s*\S/.test(line)));
    if (symAfterLine) {
      mdIssues.push(`${field}: 狀態符號在文後/句中(應移文前·行首,如 "## ✅ AC4" 非 "## AC4 — ✅")`);
    }
  }
  if (mdIssues.length > 0) {
    for (const issue of mdIssues) result.warnings.push(`Markdown 換行: ${issue}`);
    if (result.status === 'PASS') result.status = 'WARN';
  } else {
    result.lines.push(`- Markdown 換行格式(react-markdown 防黏): 無黏一起項目 ✅`);
  }

  return result;
}

// ── Main ─────────────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv);
  if (!args.storyId) {
    console.error('Usage: node run-depth-gate.js <story_id> [--only=D1,D4,D7] [--skip-d4] [--dry-run]');
    process.exit(3);
  }
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  const story = loadStory(db, args.storyId);
  const allGates = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'];
  const activeGates = args.only ? args.only : allGates;

  const reports = [];
  if (activeGates.includes('D1')) reports.push(runD1(story));
  if (activeGates.includes('D2')) reports.push(runD2(story, db));
  if (activeGates.includes('D3')) reports.push(runD3(story));
  if (activeGates.includes('D4')) reports.push(runD4(story, args.skipD4, args.d4Manual));
  if (activeGates.includes('D5')) reports.push(runD5(story));
  if (activeGates.includes('D6')) reports.push(runD6(story, db));
  if (activeGates.includes('D7')) reports.push(runD7(story));

  const hasBlock = reports.some(r => r.status === 'BLOCK');
  const hasWarn = reports.some(r => r.status === 'WARN');

  const ts = getTaiwanTimestamp();
  const lines = [`# Depth Gate Report — ${args.storyId} @ ${ts}`, ''];
  lines.push('| Gate | Status | Summary |', '|:---:|:------:|---------|');
  for (const r of reports) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠' : '❌';
    const summary = r.blocks[0] || r.warnings[0] || r.lines[0] || '-';
    lines.push(`| ${r.name} | ${icon} ${r.status} | ${summary.substring(0, 80)} |`);
  }
  lines.push('', '## Details', '');
  for (const r of reports) {
    lines.push(`### ${r.name} (${r.status})`);
    for (const line of r.lines) lines.push(line);
    for (const w of r.warnings) lines.push(`⚠ WARN: ${w}`);
    for (const b of r.blocks) lines.push(`❌ BLOCK: ${b}`);
    lines.push('');
  }
  const overall = hasBlock ? 'BLOCK' : hasWarn ? 'WARN' : 'PASS';
  lines.push(`**Overall**: ${overall}`);
  // [T7] normalize at construction — both the console preview and the eventual
  // dev_notes write (below) share this single normalized value, so --dry-run
  // previews exactly what a real run would write.
  const report = normalizeMarkdownBreaks(lines.join('\n'));
  console.log(report);

  if (!args.dryRun) {
    // [2026-06-12] append 前移除 dev_notes 中「舊的」Depth Gate Report,避免 worker 跑多次 gate 累積膨脹
    // (m0-11 事故: worker create 跑多次 gate → dev_notes 7907→14423)。保留核心 enrichment + WARN retained marker。
    let baseNotes = (story.dev_notes || '');
    const oldGateIdx = baseNotes.indexOf('# Depth Gate Report');
    if (oldGateIdx > 0) {
      // [CR F1 · td-devenv-guard-gate-false-signal-repair] Scan ONLY from the old
      // report onward. Markers living BEFORE oldGateIdx are already carried over by
      // the slice() on the next line, so matching the FULL string re-appended them
      // and DOUBLED the marker set every run (1→2→4→8→16 over 5 runs; live evidence:
      // this Story's dev_notes held [WARN Retained @ 2026-07-27T12:36:20+08:00] twice).
      // Same unbounded dev_notes growth this block exists to prevent (m0-11).
      const warnMatch = baseNotes.slice(oldGateIdx).match(/\[WARN Retained @[^\]]+\][^\n]*/g);
      baseNotes = baseNotes.slice(0, oldGateIdx).replace(/\n*---\n*$/, '').trimEnd();
      if (warnMatch) baseNotes += '\n\n' + warnMatch.join('\n\n');
    }
    const appended = baseNotes + '\n\n---\n\n' + report;
    db.prepare('UPDATE stories SET dev_notes = ?, updated_at = ? WHERE story_id = ?').run(appended, ts, args.storyId);
    console.log(`\n✅ Report appended to stories.dev_notes (length: ${appended.length}, 舊 report 已清不累積)`);
  } else {
    console.log('\n🔶 DRY RUN — DB not written');
  }
  db.close();

  // v1.3.0 (2026-04-14): WARN MANDATORY RESOLUTION POLICY
  // WARN 預設等同 BLOCK (exit=2),除非使用者明確 --accept-warn "理由"
  // 這是對本 Story investigation 的反饋:Agent 曾將 WARN 視可忽略導致迭代污染累積
  // See: memory/feedback_depth_gate_warn_not_optional.md + .claude/rules/depth-gate-warn-mandatory-resolution.md
  if (hasBlock) {
    console.error('\n❌ BLOCK detected. Story must return to backlog. See report above for required fixes.');
    process.exit(2);
  }
  if (hasWarn) {
    if (!args.acceptWarn) {
      console.error('\n❌ WARN detected WITHOUT --accept-warn flag.');
      console.error('   v1.3.0 policy: WARN must be either (a) resolved by fixing, or (b) explicitly accepted with --accept-warn "reason"');
      console.error('   Forbidden: silently passing through WARN (causes iteration pollution accumulation).');
      console.error('   To accept: --accept-warn "explanation of why this WARN is retained, include TD-xxx or scope justification"');
      process.exit(2);
    }
    // WARN accepted with explicit reason → write to dev_notes + exit 1 (informational)
    const ts = getTaiwanTimestamp();
    // [T7] second direct-SQL write point — same normalize as the report append above
    // (TD-DEPTH-GATE-REPORT-MD-NORMALIZE originally recorded only the first point).
    const reasonMarker = normalizeMarkdownBreaks(`\n\n[WARN Retained @ ${ts}] ${args.acceptWarn}`);
    if (!args.dryRun) {
      try {
        const db2 = new Database(DB_PATH);
        const row = db2.prepare('SELECT dev_notes FROM stories WHERE story_id = ?').get(args.storyId);
        const newNotes = (row.dev_notes || '') + reasonMarker;
        db2.prepare('UPDATE stories SET dev_notes = ?, updated_at = ? WHERE story_id = ?').run(newNotes, ts, args.storyId);
        db2.close();
      } catch (e) {
        console.error('Failed to write WARN acceptance marker:', e.message);
      }
    }
    console.log(`\n⚠ WARN accepted with reason: "${args.acceptWarn}"`);
    process.exit(1);
  }
  process.exit(0);
}

main();
