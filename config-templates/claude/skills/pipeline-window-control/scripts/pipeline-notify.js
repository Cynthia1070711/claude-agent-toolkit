#!/usr/bin/env node
/**
 * Pipeline Notify Hook (Stop event) — 子視窗完成通知
 *
 * 在子視窗 Claude 的 Stop hook 鏈中執行。
 * 當偵測到任務完成時，寫入 logs/pipeline-notify.json 供中控 Read。
 *
 * 與 pipeline-auto-exit.js 的差異：
 *   - pipeline-auto-exit.js → 寫 signal file (供 Watchdog 偵測)
 *   - pipeline-notify.js → 寫 notify file (供中控 Read 追蹤)
 *
 * 觸發條件同 pipeline-auto-exit.js 的 phase-aware 偵測。
 */

const fs = require('fs');
const path = require('path');

const signalFile = process.env.PIPELINE_SIGNAL_FILE;
const storyId = process.env.PIPELINE_STORY_ID;
const pipelinePhase = process.env.PIPELINE_PHASE || '';

if (!signalFile || !storyId) {
  process.exit(0); // Not in pipeline mode
}

const projectRoot = path.resolve(__dirname, '../../../..');
const notifyFile = path.join(projectRoot, 'logs', 'pipeline-notify.json');
const trackerFile = path.join(projectRoot, 'logs', 'pipeline-active.json');
const dbPath = path.join(projectRoot, '.context-db', 'phycool.db');

try {
  // Check if signal file exists (meaning auto-exit already triggered)
  const signalExists = fs.existsSync(signalFile);

  // Check DB status
  let dbStatus = 'unknown';
  let hasTasks = false;
  try {
    const Database = require(path.join(projectRoot, '.context-db/node_modules/better-sqlite3'));
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT status, tasks FROM stories WHERE story_id = ?').get(storyId);
    db.close();
    if (row) {
      dbStatus = row.status;
      hasTasks = row.tasks && row.tasks.includes('✅');
    }
  } catch {}

  // Phase target check — Single Source of Truth: scripts/pipeline-config.json (BR-01)
  const configPath = path.join(projectRoot, 'scripts', 'pipeline-config.json');
  const phaseTargetStatus = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, 'utf8')).phaseTargetStatus
    : {};
  const phaseTargets = phaseTargetStatus[pipelinePhase] || ['done'];
  const isTargetReached = phaseTargets.includes(dbStatus);

  if (isTargetReached || signalExists) {
    // Write notification
    let notifications = [];
    try {
      if (fs.existsSync(notifyFile)) {
        notifications = JSON.parse(fs.readFileSync(notifyFile, 'utf8'));
        if (!Array.isArray(notifications)) notifications = [];
      }
    } catch { notifications = []; }

    // Avoid duplicate: check if same story+phase already notified in last 60s
    const now = Date.now();
    const isDuplicate = notifications.some(n =>
      n.story_id === storyId &&
      n.phase === pipelinePhase &&
      n.action === 'completed' &&
      (now - new Date(n.timestamp).getTime()) < 60000
    );

    if (!isDuplicate) {
      notifications.push({
        story_id: storyId,
        phase: pipelinePhase,
        action: 'completed',
        db_status: dbStatus,
        has_tasks: hasTasks,
        signal_exists: signalExists,
        timestamp: new Date(now + 8 * 3600000).toISOString().replace('Z', '+08:00'),
      });

      // Keep last 50
      if (notifications.length > 50) notifications = notifications.slice(-50);
      fs.writeFileSync(notifyFile, JSON.stringify(notifications, null, 2), 'utf8');
    }

    // Update tracker: mark as completed
    try {
      if (fs.existsSync(trackerFile)) {
        let tracker = JSON.parse(fs.readFileSync(trackerFile, 'utf8'));
        if (!Array.isArray(tracker)) tracker = [tracker];
        for (const entry of tracker) {
          if (entry.story_id === storyId && entry.phase === pipelinePhase) {
            entry.status = 'completed';
            entry.completed_at = new Date(now + 8 * 3600000).toISOString().replace('Z', '+08:00');
          }
        }
        fs.writeFileSync(trackerFile, JSON.stringify(tracker, null, 2), 'utf8');
      }
    } catch {}
  }

} catch (err) {
  // Silent — notification is best-effort, not critical
  try {
    const logFile = path.join(projectRoot, 'logs', 'pipeline-auto-exit.log');
    const ts = new Date(Date.now() + 8 * 3600000).toISOString().replace('Z', '+08:00');
    fs.appendFileSync(logFile, `[${ts}] NOTIFY-ERROR: ${storyId} ${err.message}\n`, 'utf8');
  } catch {}
}
