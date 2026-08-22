import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'phycool.db');

const db = new Database(DB_PATH);
db.prepare("UPDATE review_reports SET review_mode = 'code' WHERE module_code = 'admin-auth' AND engine = 'antigravity'").run();
console.log("Updated admin-auth review_mode to code");
db.close();
