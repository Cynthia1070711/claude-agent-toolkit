// ============================================================
// rerun-finalize.cjs — 運維工具:review done 後 → 移除 dev_notes 的「review 階段中控指示」
// 用途:正規化重跑流程收尾,使最終 Story dev_notes 乾淨(無臨時中控指示痕跡)
//   - 移除 review 指示段;保留 create 校驗軌跡 + 原 dev_notes
//   - 不動 status(已 done)/時間戳;僅清 dev_notes 指示 + updated_at
// 用法: node .context-db/scripts/rerun-finalize.cjs <story_id> <timestamp+08:00>
// ============================================================
const path = require('path');
const Database = require('better-sqlite3');
const DB_PATH = path.join(__dirname, '..', 'phycool.db');

const storyId = process.argv[2];
const ts = process.argv[3];
if (!storyId || !ts) {
  console.error('usage: node rerun-finalize.cjs <story_id> <timestamp+08:00>');
  process.exit(1);
}

const REVIEW_SEP = '─────── 以下為本卡既有 dev_notes(含 create 校驗軌跡)───────';

const db = new Database(DB_PATH);
const row = db.prepare('SELECT dev_notes,status FROM stories WHERE story_id=?').get(storyId);
if (!row) { console.error('story not found:', storyId); process.exit(1); }

let dn = row.dev_notes || '';
let removed = false;
if (dn.startsWith('【🔴 中控 REVIEW 階段指示')) {
  const i = dn.indexOf(REVIEW_SEP);
  if (i >= 0) { dn = dn.substring(i + REVIEW_SEP.length).replace(/^\s*\n?/, ''); removed = true; }
}

db.prepare('UPDATE stories SET dev_notes=?, updated_at=? WHERE story_id=?').run(dn, ts, storyId);

const after = db.prepare('SELECT story_id,status,length(dev_notes) AS dn_len FROM stories WHERE story_id=?').get(storyId);
console.log('FINALIZE_DONE removed=' + removed + ' ' + JSON.stringify(after));
