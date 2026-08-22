import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'phycool.db');

const db = new Database(DB_PATH);
const res = db.prepare("SELECT module_code, review_mode, engine, score_total, bugs_total FROM review_reports WHERE status = 'completed' AND engine LIKE '%antigravity%'").all();
console.log(JSON.stringify(res, null, 2));
db.close();
