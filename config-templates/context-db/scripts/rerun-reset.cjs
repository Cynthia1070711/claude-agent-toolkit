// ============================================================
// rerun-reset.cjs — 運維工具:重置「已 done 卡」為可重跑 create+review 狀態
// 用途:正規化補走完整正式子視窗 BMAD 流程(主視窗中控 E2)
//   - 清 lifecycle 時間戳(解除 I1-I9 invariant 鎖,worker create 不再堅持 done)
//   - status → backlog(worker create 乾淨起點,不困惑「為何 done」)
//   - 保留 cr_score/cr_summary/cr_issues(歷史;worker review 會覆蓋)
//   - dev_notes 開頭注入「中控 DOWNGRADE RE-RUN 指示」(worker system prompt 必讀)
// 冪等:重複跑會移除舊指示段 + 前輪 worker 校驗結論段後重新注入
// 用法: node .context-db/scripts/rerun-reset.cjs <story_id> <timestamp+08:00>
// ============================================================
const path = require('path');
const Database = require('better-sqlite3');
const DB_PATH = path.join(__dirname, '..', 'phycool.db');

const storyId = process.argv[2];
const ts = process.argv[3];
if (!storyId || !ts) {
  console.error('usage: node rerun-reset.cjs <story_id> <timestamp+08:00>');
  process.exit(1);
}

const SEP = '─────── 以下為本卡既有 dev_notes ───────';
const INSTR_HEADER = `【🔴🔴 中控 PIPELINE 重跑指示 · 最高優先 · 子視窗開工必讀 🔴🔴】
本卡先前由主視窗 inline 完成(create→dev→review,code 已實作並 commit),現【刻意正規化補走完整正式子視窗 BMAD 流程】留治理軌跡。
這是預期的 DOWNGRADE RE-RUN,不是異常 —— 無需查「為何之前 done」、禁止全面掃描 codebase 查原因、勿過度思考,高效執行。
你(create-story worker)的任務:
1. 對齊 create-story workflow,重新嚴謹 enrich/校驗本卡 create 欄位(acceptance_criteria/tasks/dev_notes/required_skills/implementation_approach/testing_strategy/definition_of_done/file_list/sdd_spec),有可精進處則更新。
2. STEP 2 upsert 必更新 create_started_at/create_completed_at 為本次、create_agent 為本子視窗;status 設 ready-for-dev(主視窗 GATE 後改 review,因 code 已完成、跳過 dev 階段)。
3. 禁止:只在 dev_notes 加一段「校驗結論」就不更新欄位/時間(前一輪錯誤)、禁因 lifecycle invariant 而拒絕更新。
${SEP}
`;

const db = new Database(DB_PATH);
const row = db.prepare('SELECT dev_notes FROM stories WHERE story_id=?').get(storyId);
if (!row) { console.error('story not found:', storyId); process.exit(1); }

let dn = row.dev_notes || '';

// (1) 移除前輪 worker 加的「完整性校驗結論」段(m0-10 特有)
const valIdx = dn.indexOf('【create-story 完整性校驗結論');
if (valIdx >= 0) dn = dn.substring(0, valIdx).trimEnd();

// (2) 冪等:移除舊的中控指示段(若本腳本重複跑)
if (dn.startsWith('【🔴🔴 中控 PIPELINE 重跑指示')) {
  const sepIdx = dn.indexOf(SEP);
  if (sepIdx >= 0) dn = dn.substring(sepIdx + SEP.length).replace(/^\s*\n?/, '');
}

const newDn = INSTR_HEADER + dn;

db.prepare(`UPDATE stories SET
  status='backlog',
  review_started_at=NULL, review_completed_at=NULL, review_agent=NULL,
  started_at=NULL, completed_at=NULL, dev_agent=NULL,
  create_started_at=?, create_completed_at=NULL, create_agent=NULL,
  dev_notes=?, updated_at=?
  WHERE story_id=?`).run(ts, newDn, ts, storyId);

const after = db.prepare(
  'SELECT story_id,status,create_started_at,create_completed_at,started_at,completed_at,review_completed_at,review_agent,cr_score,length(dev_notes) AS dn_len FROM stories WHERE story_id=?'
).get(storyId);
console.log('RESET_DONE ' + JSON.stringify(after));
