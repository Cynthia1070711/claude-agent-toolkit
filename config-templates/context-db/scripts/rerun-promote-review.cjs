// ============================================================
// rerun-promote-review.cjs — 運維工具:create GATE 通過後 → 推進 review 階段
// 用途:正規化重跑流程的 create→review 轉換(主視窗 E2 GATE 後)
//   - 移除 dev_notes 開頭的「create 階段中控指示」段(臨時指示,不留最終 Story)
//   - 保留 worker 加的「create 校驗軌跡」段(治理軌跡)
//   - 注入「review 階段中控指示」段(避免 review worker 困惑/全面掃描)
//   - status → review(跳過 ready-for-dev/dev,因 code 已完成 commit)
// 冪等:重複跑移除舊 review 指示後重注入
// 用法: node .context-db/scripts/rerun-promote-review.cjs <story_id> <timestamp+08:00>
// ============================================================
const path = require('path');
const Database = require('better-sqlite3');
const DB_PATH = path.join(__dirname, '..', 'phycool.db');

const storyId = process.argv[2];
const ts = process.argv[3];
if (!storyId || !ts) {
  console.error('usage: node rerun-promote-review.cjs <story_id> <timestamp+08:00>');
  process.exit(1);
}

const CREATE_SEP = '─────── 以下為本卡既有 dev_notes ───────';
const REVIEW_SEP = '─────── 以下為本卡既有 dev_notes(含 create 校驗軌跡)───────';
const REVIEW_INSTR = `【🔴 中控 REVIEW 階段指示 · 子視窗開工必讀 🔴】
本卡 code 已實作並 commit(見 file_list),create 已正規化重跑完成(status=review)。本階段=對既有 code 做正式 BMAD code-review 補完整治理軌跡。
這是預期的正規化補流程 —— 無需查「為何之前 done / 已有 cr_score」、禁止全面掃描 codebase 查原因、勿過度思考,高效執行。
你(code-review worker)的任務:對 file_list 既有 code 跑 code-review workflow(對齊各 AC + Production Gates),完成設 status=done + cr_score/cr_summary + review 時間戳/agent。既有實作品質高(測試已綠),聚焦審查既有實作對齊 AC、技術債挑戰、文檔同步即可。
${REVIEW_SEP}
`;

const db = new Database(DB_PATH);
const row = db.prepare('SELECT dev_notes,status FROM stories WHERE story_id=?').get(storyId);
if (!row) { console.error('story not found:', storyId); process.exit(1); }

let dn = row.dev_notes || '';

// (1) 移除 create 階段中控指示段(到 create 分隔線)
if (dn.startsWith('【🔴🔴 中控 PIPELINE 重跑指示')) {
  const i = dn.indexOf(CREATE_SEP);
  if (i >= 0) dn = dn.substring(i + CREATE_SEP.length).replace(/^\s*\n?/, '');
}

// (2) 冪等:移除舊 review 指示段
if (dn.startsWith('【🔴 中控 REVIEW 階段指示')) {
  const i = dn.indexOf(REVIEW_SEP);
  if (i >= 0) dn = dn.substring(i + REVIEW_SEP.length).replace(/^\s*\n?/, '');
}

const newDn = REVIEW_INSTR + dn;

// status → review;review_started_at 留 NULL(由 review worker/record-phase-timestamp 設)
db.prepare(`UPDATE stories SET status='review', dev_notes=?, updated_at=? WHERE story_id=?`).run(newDn, ts, storyId);

const after = db.prepare(
  'SELECT story_id,status,create_completed_at,review_started_at,review_completed_at,cr_score,length(dev_notes) AS dn_len FROM stories WHERE story_id=?'
).get(storyId);
console.log('PROMOTE_REVIEW_DONE ' + JSON.stringify(after));
