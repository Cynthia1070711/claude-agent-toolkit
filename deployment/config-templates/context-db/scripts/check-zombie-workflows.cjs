#!/usr/bin/env node
'use strict';

/**
 * V2-05-FIX Layer 2 — workflow_executions zombie 偵測 (PID-safe, alert-only)
 *
 * Purpose:
 *   定期偵測 workflow_executions WHERE status='running' AND stale,
 *   交叉驗證 logs/pipeline-active.json 的 PID,分類為 active / zombie / orphan。
 *   不自動 cleanup (避免誤殺真實 long-running task);輸出 markdown report + exit code。
 *
 * Exit code:
 *   0 = healthy (無 zombie/orphan)
 *   1 = warn (>= 1 stale row >= 7 days)
 *   2 = critical (>= 1 stale row >= 30 days)
 *
 * Usage:
 *   node .context-db/scripts/check-zombie-workflows.js
 *   node .context-db/scripts/check-zombie-workflows.js --json     # machine-readable
 *   node .context-db/scripts/check-zombie-workflows.js --quiet    # only warn/critical lines
 *
 * Memory id=3962 (V2-05 root cause: workflow_executions INSERT-only design)
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..', '..');
const dbPath = path.join(projectRoot, '.context-db', 'phycool.db');
const trackerPath = path.join(projectRoot, 'logs', 'pipeline-active.json');

const THRESHOLD_WARN_DAYS = 7;
const THRESHOLD_CRITICAL_DAYS = 30;

const args = new Set(process.argv.slice(2));
const isJson = args.has('--json');
const isQuiet = args.has('--quiet');

// BOM-safe JSON parse (PowerShell sometimes writes UTF-8 with BOM)
function parseJsonStripBom(raw) {
  // strip UTF-8 BOM (﻿) if present at start
  const trimmed = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  return JSON.parse(trimmed);
}

function isPidAlive(pid) {
  if (!pid || !Number.isFinite(Number(pid))) return false;
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 3000 }
    );
    return out.trim() === String(pid);
  } catch {
    return false;
  }
}

function loadTrackers() {
  if (!fs.existsSync(trackerPath)) return [];
  try {
    const raw = fs.readFileSync(trackerPath, 'utf8');
    if (!raw.trim()) return [];
    const parsed = parseJsonStripBom(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    if (!isJson && !isQuiet) {
      process.stderr.write(`[warn] tracker file parse failed: ${e.message}\n`);
    }
    return [];
  }
}

function main() {
  if (!fs.existsSync(dbPath)) {
    process.stderr.write(`[error] DB not found: ${dbPath}\n`);
    process.exit(2);
  }

  const db = new Database(dbPath, { readonly: true });

  const runnings = db.prepare(`
    SELECT id, workflow_type, story_id, agent_id, started_at,
           CAST((julianday('now', '+8 hours') - julianday(started_at)) AS INTEGER) AS days_stale
    FROM workflow_executions
    WHERE status='running'
    ORDER BY started_at ASC
  `).all();

  db.close();

  const trackers = loadTrackers();

  const result = { active: [], zombie: [], orphan: [] };

  for (const row of runnings) {
    const tracker = trackers.find(t => t && t.story_id === row.story_id);
    let category, pidStatus, pidValue = null;

    if (tracker && tracker.pid) {
      pidValue = tracker.pid;
      const alive = isPidAlive(tracker.pid);
      if (alive) {
        category = 'active';
        pidStatus = `ALIVE pid=${tracker.pid}`;
      } else {
        category = 'zombie';
        pidStatus = `DEAD pid=${tracker.pid}`;
      }
    } else {
      category = 'orphan';
      pidStatus = 'NO_TRACKER';
    }

    result[category].push({ ...row, pid: pidValue, pidStatus });
  }

  // Determine exit code
  const stale = [...result.zombie, ...result.orphan];
  const hasCritical = stale.some(r => r.days_stale >= THRESHOLD_CRITICAL_DAYS);
  const hasWarn = stale.some(r => r.days_stale >= THRESHOLD_WARN_DAYS);

  const exitCode = hasCritical ? 2 : (hasWarn ? 1 : 0);

  // Output
  if (isJson) {
    console.log(JSON.stringify({
      generated_at: new Date().toLocaleString('sv', { timeZone: 'Asia/Taipei' }) + ' (UTC+8)',
      thresholds: { warn_days: THRESHOLD_WARN_DAYS, critical_days: THRESHOLD_CRITICAL_DAYS },
      counts: {
        active: result.active.length,
        zombie: result.zombie.length,
        orphan: result.orphan.length,
      },
      result,
      exit_code: exitCode,
    }, null, 2));
  } else {
    if (!isQuiet) {
      console.log('# workflow_executions zombie 偵測');
      console.log(`Generated: ${new Date().toLocaleString('sv', { timeZone: 'Asia/Taipei' })} (UTC+8)`);
      console.log(`Thresholds: warn >= ${THRESHOLD_WARN_DAYS}d, critical >= ${THRESHOLD_CRITICAL_DAYS}d`);
      console.log(`Active: ${result.active.length} | Zombie: ${result.zombie.length} | Orphan: ${result.orphan.length}`);
      console.log();
    }

    if (stale.length > 0) {
      console.log('| id | workflow_type | story_id | days_stale | category | PID 狀態 |');
      console.log('|:--:|---|---|---:|:---:|---|');
      const sorted = [...stale].sort((a, b) => b.days_stale - a.days_stale);
      for (const r of sorted) {
        const tier = r.days_stale >= THRESHOLD_CRITICAL_DAYS ? '🔴' : (r.days_stale >= THRESHOLD_WARN_DAYS ? '🟡' : '');
        const cat = result.zombie.includes(r) ? 'zombie' : 'orphan';
        console.log(`| ${r.id} | ${r.workflow_type} | ${r.story_id || '(none)'} | ${tier} ${r.days_stale} | ${cat} | ${r.pidStatus} |`);
      }
    } else if (!isQuiet) {
      console.log('✅ No stale running workflows.');
    }

    if (exitCode > 0 && !isQuiet) {
      console.log();
      console.log('## Recommended Action');
      console.log('Run V2-05-FIX Layer 1 spec to PID-safe cleanup. Re-create `__zombie-cleanup-v2-05.cjs` from Story `ENV-CHECK-V2-05-FIX-zombie-workflow-cleanup.md` Layer 1.');
    }
  }

  process.exit(exitCode);
}

main();
