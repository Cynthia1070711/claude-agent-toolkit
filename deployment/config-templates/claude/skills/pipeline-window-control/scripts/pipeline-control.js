#!/usr/bin/env node
/**
 * Pipeline Window Control — 中控追蹤與控制腳本
 *
 * Usage:
 *   node pipeline-control.js --status              查看所有活躍子視窗
 *   node pipeline-control.js --kill {story_id}      強制關閉指定 Story 的子視窗
 *   node pipeline-control.js --kill-all             強制關閉所有 pipeline 子視窗
 *   node pipeline-control.js --check-zombie         偵測殭屍視窗（已完成但未關閉）
 *   node pipeline-control.js --notify               讀取最新完成通知
 *   node pipeline-control.js --cleanup              清理已完成的追蹤紀錄
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '../../../..');
const logsDir = path.join(projectRoot, 'logs');
const trackerFile = path.join(logsDir, 'pipeline-active.json');
const notifyFile = path.join(logsDir, 'pipeline-notify.json');
const dbPath = path.join(projectRoot, '.context-db', 'phycool.db');

// ── Helpers ──

function loadTracker() {
  if (!fs.existsSync(trackerFile)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(trackerFile, 'utf8'));
    return Array.isArray(data) ? data : [data];
  } catch { return []; }
}

function saveTracker(data) {
  fs.writeFileSync(trackerFile, JSON.stringify(data, null, 2), 'utf8');
}

function loadNotifications() {
  if (!fs.existsSync(notifyFile)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(notifyFile, 'utf8'));
    return Array.isArray(data) ? data : [data];
  } catch { return []; }
}

function isProcessRunning(pid) {
  try {
    const result = execSync(
      `powershell -Command "Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id"`,
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
    return result === String(pid);
  } catch { return false; }
}

function killProcess(pid) {
  try {
    // Graceful: kill Claude child processes first
    execSync(
      `powershell -Command "Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${pid}' -ErrorAction SilentlyContinue | Where-Object { $_.Name -notin @('powershell.exe','pwsh.exe') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
      { timeout: 8000 }
    );
    // Wait 3s for graceful exit
    execSync('powershell -Command "Start-Sleep -Seconds 3"', { timeout: 5000 });
    // Check if still running
    if (isProcessRunning(pid)) {
      // Force kill entire process tree
      execSync(`taskkill /T /F /PID ${pid}`, { timeout: 5000 });
    }
    return true;
  } catch { return false; }
}

function getStoryStatus(storyId) {
  try {
    const Database = require(path.join(projectRoot, '.context-db/node_modules/better-sqlite3'));
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT status, tasks, cr_score FROM stories WHERE story_id = ?').get(storyId);
    db.close();
    return row || null;
  } catch { return null; }
}

function getPhaseTarget(phase) {
  // Single Source of Truth: scripts/pipeline-config.json (BR-01)
  const configPath = path.join(projectRoot, 'scripts', 'pipeline-config.json');
  if (fs.existsSync(configPath)) {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const targets = cfg.phaseTargetStatus && cfg.phaseTargetStatus[phase];
    if (targets) return Array.isArray(targets) ? targets[0] : targets;
  }
  return 'done';
}

function taiwanNow() {
  return new Date(Date.now() + 8 * 3600000).toISOString().replace('Z', '+08:00');
}

// ── Commands ──

function cmdStatus() {
  const entries = loadTracker();
  if (entries.length === 0) {
    console.log('No active pipeline windows tracked.');
    return;
  }

  console.log(`\n=== Pipeline Active Windows (${entries.length}) ===\n`);
  console.log('| Story | Phase | PID | Running | DB Status | Target | Elapsed |');
  console.log('|-------|-------|-----|---------|-----------|--------|---------|');

  for (const e of entries) {
    const running = isProcessRunning(e.pid);
    const dbRow = getStoryStatus(e.story_id);
    const dbStatus = dbRow ? dbRow.status : 'N/A';
    const target = getPhaseTarget(e.phase);
    const startTime = new Date(e.started_at);
    const elapsed = Math.round((Date.now() - startTime.getTime()) / 60000);
    const reachedTarget = dbStatus === target;
    const statusMark = reachedTarget ? '✅' : (running ? '🔄' : '💀');

    console.log(`| ${e.story_id} | ${e.phase} | ${e.pid} | ${running ? 'YES' : 'NO'} ${statusMark} | ${dbStatus} | ${target} | ${elapsed}min |`);
  }
  console.log('');

  // Summary
  const zombies = entries.filter(e => {
    const dbRow = getStoryStatus(e.story_id);
    const target = getPhaseTarget(e.phase);
    return dbRow && dbRow.status === target && isProcessRunning(e.pid);
  });
  if (zombies.length > 0) {
    console.log(`⚠️  ${zombies.length} zombie window(s) detected (DB target reached but window still open)`);
    console.log('   Run: node pipeline-control.js --check-zombie');
  }
}

function cmdKill(storyId) {
  const entries = loadTracker();
  const matches = entries.filter(e => e.story_id === storyId);

  if (matches.length === 0) {
    console.log(`No tracked window for story: ${storyId}`);
    return;
  }

  for (const e of matches) {
    console.log(`Killing ${e.story_id}/${e.phase} PID=${e.pid}...`);
    if (isProcessRunning(e.pid)) {
      const killed = killProcess(e.pid);
      console.log(killed ? `  ✅ Killed PID=${e.pid}` : `  ❌ Failed to kill PID=${e.pid}`);
    } else {
      console.log(`  ℹ️  PID=${e.pid} already exited`);
    }
    e.status = 'killed';
    e.killed_at = taiwanNow();
  }

  saveTracker(entries);

  // Write notification
  appendNotification({
    story_id: storyId,
    action: 'killed',
    timestamp: taiwanNow(),
    by: 'pipeline-control --kill'
  });
}

function cmdKillAll() {
  const entries = loadTracker();
  const running = entries.filter(e => isProcessRunning(e.pid));

  if (running.length === 0) {
    console.log('No running pipeline windows to kill.');
    return;
  }

  console.log(`Killing ${running.length} active window(s)...`);
  for (const e of running) {
    console.log(`  ${e.story_id}/${e.phase} PID=${e.pid}`);
    killProcess(e.pid);
    e.status = 'killed';
    e.killed_at = taiwanNow();
  }

  saveTracker(entries);
  console.log('✅ All pipeline windows killed.');
}

function cmdCheckZombie() {
  const entries = loadTracker();
  let zombieCount = 0;

  console.log('\n=== Zombie Window Check ===\n');

  for (const e of entries) {
    const running = isProcessRunning(e.pid);
    if (!running) continue;

    const dbRow = getStoryStatus(e.story_id);
    const target = getPhaseTarget(e.phase);

    if (dbRow && dbRow.status === target) {
      zombieCount++;
      console.log(`🧟 ZOMBIE: ${e.story_id}/${e.phase} PID=${e.pid}`);
      console.log(`   DB status=${dbRow.status} (target=${target} reached!)`);
      console.log(`   Started: ${e.started_at}`);
      console.log(`   Action: Killing...`);

      killProcess(e.pid);
      e.status = 'zombie-killed';
      e.killed_at = taiwanNow();

      appendNotification({
        story_id: e.story_id,
        phase: e.phase,
        action: 'zombie-killed',
        db_status: dbRow.status,
        timestamp: taiwanNow()
      });
    }
  }

  if (zombieCount === 0) {
    console.log('✅ No zombie windows detected.');
  } else {
    saveTracker(entries);
    console.log(`\n🧹 Cleaned ${zombieCount} zombie window(s).`);
  }
}

function cmdNotify() {
  const notifications = loadNotifications();
  if (notifications.length === 0) {
    console.log('No pending notifications.');
    return;
  }

  console.log(`\n=== Pipeline Notifications (${notifications.length}) ===\n`);
  // Show last 10
  const recent = notifications.slice(-10);
  for (const n of recent) {
    const icon = n.action === 'completed' ? '✅' : n.action === 'zombie-killed' ? '🧟' : '⚡';
    console.log(`${icon} [${n.timestamp}] ${n.story_id} — ${n.action} (${n.phase || n.by || ''})`);
  }
}

function cmdCleanup() {
  const entries = loadTracker();
  const before = entries.length;
  const cleaned = entries.filter(e => {
    if (e.status === 'killed' || e.status === 'zombie-killed') return false;
    if (!isProcessRunning(e.pid)) return false;
    return true;
  });
  saveTracker(cleaned);
  console.log(`Cleaned ${before - cleaned.length} stale entries. ${cleaned.length} active remaining.`);
}

function appendNotification(entry) {
  const notifications = loadNotifications();
  notifications.push(entry);
  // Keep last 50
  const trimmed = notifications.slice(-50);
  fs.writeFileSync(notifyFile, JSON.stringify(trimmed, null, 2), 'utf8');
}

// ── Main ──

const args = process.argv.slice(2);
const cmd = args[0];

switch (cmd) {
  case '--status':
    cmdStatus();
    break;
  case '--kill':
    if (!args[1]) { console.error('Usage: --kill {story_id}'); process.exit(1); }
    cmdKill(args[1]);
    break;
  case '--kill-all':
    cmdKillAll();
    break;
  case '--check-zombie':
    cmdCheckZombie();
    break;
  case '--notify':
    cmdNotify();
    break;
  case '--cleanup':
    cmdCleanup();
    break;
  default:
    console.log('Pipeline Window Control v1.0');
    console.log('Commands: --status | --kill {id} | --kill-all | --check-zombie | --notify | --cleanup');
}
