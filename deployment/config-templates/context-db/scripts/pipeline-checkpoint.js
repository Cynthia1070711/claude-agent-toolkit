// ============================================================
// PCPT Context Memory DB — Pipeline Checkpoint 工具
// 用途：儲存/還原 Pipeline 執行狀態，支援中斷後 context recovery
// ============================================================
// 使用方式:
//   node pipeline-checkpoint.js --save --pipeline-id "review-fix-20260328" --type "smart-review-fix" --steps '[...]' --reasoning "..."
//   node pipeline-checkpoint.js --update --pipeline-id "review-fix-20260328" --step 3 --result '{"status":"completed"}'
//   node pipeline-checkpoint.js --load --pipeline-id "review-fix-20260328"
//   node pipeline-checkpoint.js --recover  (回傳最新 active checkpoint 的結構化 recovery prompt)
//   node pipeline-checkpoint.js --active   (回傳所有 running/paused pipeline)
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

function getTaiwanTimestamp() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
}

function openDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  return db;
}

// ──────────────────────────────────────────────
// --save: 新增或覆寫 checkpoint
// ──────────────────────────────────────────────
function saveCheckpoint(args) {
  const {
    pipelineId,
    type,
    session,
    steps,
    reasoning,
    subWindows,
    totalSteps,
  } = args;

  if (!pipelineId) throw new Error('--pipeline-id is required for --save');
  if (!type) throw new Error('--type is required for --save');

  const db = openDb();
  const now = getTaiwanTimestamp();

  const stepsArr = typeof steps === 'string' ? JSON.parse(steps) : (steps || []);
  const subWin = typeof subWindows === 'string' ? subWindows : JSON.stringify(subWindows || []);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO pipeline_checkpoints
      (pipeline_id, orchestrator_session, pipeline_type, total_steps, current_step,
       status, steps_json, orchestrator_reasoning, sub_windows, error_context, created_at, updated_at)
    VALUES
      (@pipeline_id, @orchestrator_session, @pipeline_type, @total_steps, @current_step,
       @status, @steps_json, @orchestrator_reasoning, @sub_windows, @error_context, @created_at, @updated_at)
  `);

  stmt.run({
    pipeline_id: pipelineId,
    orchestrator_session: session || null,
    pipeline_type: type,
    total_steps: totalSteps ? parseInt(totalSteps, 10) : stepsArr.length,
    current_step: 0,
    status: 'running',
    steps_json: JSON.stringify(stepsArr),
    orchestrator_reasoning: reasoning || null,
    sub_windows: subWin,
    error_context: null,
    created_at: now,
    updated_at: now,
  });

  const row = db.prepare('SELECT * FROM pipeline_checkpoints WHERE pipeline_id = ?').get(pipelineId);
  db.close();
  return { success: true, checkpoint: row };
}

// ──────────────────────────────────────────────
// --update: 更新 current_step，append result 到 steps_json
// ──────────────────────────────────────────────
function updateCheckpoint(args) {
  const { pipelineId, step, result, status, errorContext } = args;

  if (!pipelineId) throw new Error('--pipeline-id is required for --update');

  const db = openDb();
  const now = getTaiwanTimestamp();

  const existing = db.prepare('SELECT * FROM pipeline_checkpoints WHERE pipeline_id = ?').get(pipelineId);
  if (!existing) {
    db.close();
    throw new Error(`Checkpoint not found: ${pipelineId}`);
  }

  // 將 result 合併到 steps_json 對應的步驟
  let stepsArr = [];
  try {
    stepsArr = JSON.parse(existing.steps_json || '[]');
  } catch {
    stepsArr = [];
  }

  const stepIndex = step !== undefined ? parseInt(step, 10) : existing.current_step;
  const parsedResult = typeof result === 'string' ? JSON.parse(result) : (result || {});

  // 若 stepsArr 中已有對應 step index 的物件則合併，否則 push 新記錄
  const existingStepIdx = stepsArr.findIndex(s => s.step === stepIndex);
  if (existingStepIdx >= 0) {
    stepsArr[existingStepIdx] = { ...stepsArr[existingStepIdx], ...parsedResult, step: stepIndex };
  } else {
    stepsArr.push({ step: stepIndex, ...parsedResult });
  }

  const newStatus = status || existing.status;

  db.prepare(`
    UPDATE pipeline_checkpoints
    SET current_step = @current_step,
        steps_json   = @steps_json,
        status       = @status,
        error_context = @error_context,
        updated_at   = @updated_at
    WHERE pipeline_id = @pipeline_id
  `).run({
    current_step: stepIndex,
    steps_json: JSON.stringify(stepsArr),
    status: newStatus,
    error_context: errorContext || existing.error_context,
    updated_at: now,
    pipeline_id: pipelineId,
  });

  const row = db.prepare('SELECT * FROM pipeline_checkpoints WHERE pipeline_id = ?').get(pipelineId);
  db.close();
  return { success: true, checkpoint: row };
}

// ──────────────────────────────────────────────
// --load: 讀取特定 pipeline 的 checkpoint
// ──────────────────────────────────────────────
function loadCheckpoint(args) {
  const { pipelineId } = args;
  if (!pipelineId) throw new Error('--pipeline-id is required for --load');

  const db = openDb();
  const row = db.prepare('SELECT * FROM pipeline_checkpoints WHERE pipeline_id = ?').get(pipelineId);
  db.close();

  if (!row) return { success: false, error: `Checkpoint not found: ${pipelineId}` };
  return { success: true, checkpoint: row };
}

// ──────────────────────────────────────────────
// --recover: 最新 running/paused checkpoint → 格式化 recovery prompt
// ──────────────────────────────────────────────
function recoverCheckpoint() {
  const db = openDb();
  const row = db.prepare(`
    SELECT * FROM pipeline_checkpoints
    WHERE status IN ('running', 'paused')
    ORDER BY updated_at DESC
    LIMIT 1
  `).get();
  db.close();

  if (!row) return { success: false, error: 'No active pipeline checkpoint found' };

  let stepsArr = [];
  try { stepsArr = JSON.parse(row.steps_json || '[]'); } catch { stepsArr = []; }

  let subWindows = [];
  try { subWindows = JSON.parse(row.sub_windows || '[]'); } catch { subWindows = []; }

  const completedSteps = stepsArr.filter(s => s.status === 'completed').length;
  const remainingSteps = stepsArr.filter(s => s.status !== 'completed');

  const stepsTable = stepsArr.map(s => {
    const icon = s.status === 'completed' ? '✅' : s.status === 'failed' ? '❌' : '⬜';
    return `| ${s.step ?? '-'} | ${icon} ${s.name ?? s.status ?? '-'} | ${s.result ?? s.note ?? ''} |`;
  }).join('\n');

  const prompt = `## Pipeline Context Recovery

> **Context compaction 後自動還原** — 以下為中斷前的 Pipeline 執行狀態

### Pipeline 基本資訊

| 欄位 | 值 |
|------|----|
| Pipeline ID | \`${row.pipeline_id}\` |
| 類型 | ${row.pipeline_type} |
| 狀態 | ${row.status} |
| 總步驟數 | ${row.total_steps} |
| 目前進度 | Step ${row.current_step} / ${row.total_steps} (${completedSteps} 完成) |
| 建立時間 | ${row.created_at} |
| 最後更新 | ${row.updated_at} |

### Orchestrator Reasoning

${row.orchestrator_reasoning || '（無記錄）'}

### 步驟狀態

| Step | 狀態 | 備註 |
|------|------|------|
${stepsTable || '| - | 無步驟資料 | |'}

### Sub-windows

${subWindows.length > 0 ? subWindows.map(w => `- ${typeof w === 'string' ? w : JSON.stringify(w)}`).join('\n') : '（無 sub-window 記錄）'}

### 待續步驟

${remainingSteps.length > 0
  ? remainingSteps.map(s => `- Step ${s.step ?? '-'}: ${s.name ?? JSON.stringify(s)}`).join('\n')
  : '所有步驟已完成'}

### 錯誤上下文

${row.error_context || '（無錯誤記錄）'}

---

> 請根據以上狀態繼續執行尚未完成的步驟。若需查看完整 checkpoint JSON，執行：
> \`node .context-db/scripts/pipeline-checkpoint.js --load --pipeline-id "${row.pipeline_id}"\`
`;

  return { success: true, checkpoint: row, recovery_prompt: prompt };
}

// ──────────────────────────────────────────────
// --active: 所有 running/paused pipelines
// ──────────────────────────────────────────────
function listActive() {
  const db = openDb();
  const rows = db.prepare(`
    SELECT * FROM pipeline_checkpoints
    WHERE status IN ('running', 'paused')
    ORDER BY updated_at DESC
  `).all();
  db.close();
  return { success: true, count: rows.length, checkpoints: rows };
}

// ──────────────────────────────────────────────
// CLI 解析
// ──────────────────────────────────────────────
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true; // boolean flag
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

const rawArgs = parseArgs(process.argv.slice(2));

// 將 kebab-case 轉 camelCase（如 pipeline-id → pipelineId）
const args = Object.fromEntries(
  Object.entries(rawArgs).map(([k, v]) => [
    k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
    v,
  ])
);

let result;
try {
  if (args.save) {
    result = saveCheckpoint(args);
  } else if (args.update) {
    result = updateCheckpoint(args);
  } else if (args.load) {
    result = loadCheckpoint(args);
  } else if (args.recover) {
    result = recoverCheckpoint();
  } else if (args.active) {
    result = listActive();
  } else {
    result = {
      success: false,
      error: 'Unknown mode. Use --save | --update | --load | --recover | --active',
    };
  }
} catch (err) {
  result = { success: false, error: err.message };
}

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
