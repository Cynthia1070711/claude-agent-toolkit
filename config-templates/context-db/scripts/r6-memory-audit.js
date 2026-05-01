import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

const db = new Database(DB_PATH, { readonly: true });

console.log('=== workflow_executions (story=eft-imagepanel-gallery-unified) ===');
const wf = db.prepare(
  "SELECT id, workflow_type, status, agent_id, duration_ms, started_at, completed_at FROM workflow_executions WHERE story_id = 'eft-imagepanel-gallery-unified' ORDER BY started_at DESC"
).all();
console.log(JSON.stringify(wf, null, 2));

console.log('\n=== context_entries (story=eft-imagepanel-gallery-unified) ===');
const ce = db.prepare(
  "SELECT id, category, title, timestamp, length(content) AS content_len FROM context_entries WHERE story_id = 'eft-imagepanel-gallery-unified' ORDER BY timestamp DESC"
).all();
console.log(JSON.stringify(ce, null, 2));

console.log('\n=== stories (current snapshot) ===');
const st = db.prepare(
  "SELECT story_id, status, priority, complexity, length(user_story) AS us_len, length(background) AS bg_len, length(acceptance_criteria) AS ac_len, length(tasks) AS tasks_len, length(dev_notes) AS dn_len, length(implementation_approach) AS ia_len, length(testing_strategy) AS ts_len, length(definition_of_done) AS dod_len, length(risk_assessment) AS ra_len, length(rollback_plan) AS rp_len, length(monitoring_plan) AS mp_len, updated_at FROM stories WHERE story_id = 'eft-imagepanel-gallery-unified'"
).get();
console.log(JSON.stringify(st, null, 2));

db.close();
