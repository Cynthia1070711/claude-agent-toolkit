// 一次性腳本：將 DB 中所有 UTC 時間戳轉換為台灣時間 (UTC+8)
import Database from 'better-sqlite3';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

// 備份
fs.copyFileSync(DB_PATH, DB_PATH + '.bak-utc');
console.log('DB 備份完成: context-memory.db.bak-utc');

const db = new Database(DB_PATH);
db.exec('BEGIN TRANSACTION');

// 通用 SQL：UTC ISO → UTC+8 ISO
// 原: 2026-03-07T08:45:00.123Z → 目標: 2026-03-07T16:45:00.000+08:00
const utcToTw = (col) => `
  REPLACE(
    SUBSTR(datetime(REPLACE(REPLACE(${col}, 'T', ' '), 'Z', ''), '+8 hours'), 1, 19),
    ' ', 'T'
  ) || '.000+08:00'
`;

// 1. context_entries.timestamp
const ce = db.prepare(`
  UPDATE context_entries
  SET timestamp = ${utcToTw('timestamp')}
  WHERE timestamp LIKE '%Z'
`).run();
console.log('context_entries.timestamp:', ce.changes);

// 2. context_entries 標題中的時間修正
const ceTitle = db.prepare(`
  UPDATE context_entries
  SET title = REPLACE(title,
    SUBSTR(title, INSTR(title, ': ') + 2, 19),
    SUBSTR(timestamp, 1, 10) || ' ' || SUBSTR(timestamp, 12, 8)
  )
  WHERE title LIKE 'Session 自動快照:%'
     OR title LIKE 'Session 結束快照:%'
`).run();
console.log('context_entries 標題修正:', ceTitle.changes);

// 3. conversation_sessions.started_at
const csStart = db.prepare(`
  UPDATE conversation_sessions
  SET started_at = ${utcToTw('started_at')}
  WHERE started_at LIKE '%Z'
`).run();
console.log('sessions.started_at:', csStart.changes);

// 4. conversation_sessions.ended_at
const csEnd = db.prepare(`
  UPDATE conversation_sessions
  SET ended_at = ${utcToTw('ended_at')}
  WHERE ended_at LIKE '%Z'
`).run();
console.log('sessions.ended_at:', csEnd.changes);

// 5. conversation_turns.timestamp
const ct = db.prepare(`
  UPDATE conversation_turns
  SET timestamp = ${utcToTw('timestamp')}
  WHERE timestamp LIKE '%Z'
`).run();
console.log('turns.timestamp:', ct.changes);

// 6. tech_entries.created_at
const te = db.prepare(`
  UPDATE tech_entries
  SET created_at = ${utcToTw('created_at')}
  WHERE created_at LIKE '%Z'
`).run();
console.log('tech_entries.created_at:', te.changes);

db.exec('COMMIT');
console.log('\n全部完成！總計:', ce.changes + csStart.changes + csEnd.changes + ct.changes + te.changes);

// 驗證
const sample = db.prepare('SELECT id, timestamp, title FROM context_entries ORDER BY id DESC LIMIT 3').all();
console.log('\n驗證 context_entries:');
sample.forEach(r => console.log(`  id=${r.id} ${r.timestamp} ${r.title}`));

const sample2 = db.prepare('SELECT session_id, started_at, ended_at FROM conversation_sessions ORDER BY started_at DESC LIMIT 3').all();
console.log('\n驗證 sessions:');
sample2.forEach(r => console.log(`  ${r.session_id.slice(0,8)}... start=${r.started_at} end=${r.ended_at}`));

db.close();
