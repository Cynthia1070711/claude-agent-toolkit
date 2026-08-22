import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'phycool.db');

const db = new Database(DB_PATH);
console.log(db.prepare('SELECT plan_id FROM review_plans').all());
db.close();
