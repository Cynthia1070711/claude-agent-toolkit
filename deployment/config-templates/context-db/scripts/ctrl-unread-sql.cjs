// ============================================================
// [ccb-4-ctrl-notify-knock] 未讀述詞 —— 唯一定義站點(BR-009)
//
// 「軌別 T 的未讀」= 三條同時成立,缺一不可:
//   (1) 不是 T 自己寄的        —— 防自發自收(全庫 36 列自寄自收訊息,live 2026-08-03)
//   (2) to_tracks 含 T          —— 收件人過濾(TD-CCB1-READCTRLMESSAGES-NO-RECIPIENT-FILTER 的修復點)
//   (3) ctrl_message_reads 無 (msg_id, T) 簽收列 —— 尚未簽收
//
// 🔴 為何是「一處定義、四處消費」而非各自內聯:
//   本卡開工前,repo 內有兩份形狀不同的未讀 SQL —— `ctrl-channel-inject.js:193-200` 三條齊備,
//   `ctrl-channel-ops.js:276-279` 只有第 (3) 條。兩者漂移的後果是實測出來的:任一軌查 unread_only
//   都撈到並「簽收」他軌往來(賦能軌 374 則無一寄給它,誤撈率 100%,live 2026-08-03)。
//   四個消費端各寫一次 SQL,就是給這個缺陷四次重生的機會。
//
// 🔴 為何是 .cjs 而非 .js:
//   `.context-db/scripts/package.json` 宣告 "type":"module",而 `.claude/hooks/*.js` 是 CommonJS
//   (`require('./_lib')`)。要讓兩邊消費同一份定義,本檔必須是 .cjs —— ESM 側以 createRequire 取用。
//   反過來寫會炸("module is not defined in ES module scope"),whp-8 踩過同一個坑,且隔離單元測試
//   測不出來,只有端到端 spawn 才捕捉得到(見 knock-worker-ops.js:27-30 的同型註解)。
//
// 具名參數:述詞使用 `@track`。消費端必須在 params 提供 `track` 這個 key
// (better-sqlite3 對「SQL 未使用卻傳入」與「SQL 使用卻未傳入」的具名參數都會拋錯)。
// ============================================================
'use strict';

/**
 * WHERE 子句本體(不含 FROM / JOIN),供自行組裝 where 陣列的呼叫端使用。
 * 依賴 alias:`m` = ctrl_messages。呼叫端的 FROM 必須以 `m` 為 ctrl_messages 的 alias。
 */
const UNREAD_PREDICATE = `m.from_track != @track
    AND EXISTS (SELECT 1 FROM json_each(m.to_tracks) WHERE value = @track)
    AND NOT EXISTS (
      SELECT 1 FROM ctrl_message_reads r WHERE r.msg_id = m.msg_id AND r.track = @track
    )`;

/**
 * 完整 FROM + JOIN + WHERE,供需要 thread 欄位(t.must_read / t.topic)的查詢直接內插。
 */
const UNREAD_FROM_WHERE = `
  FROM ctrl_messages m
  JOIN ctrl_threads t ON t.thread_id = m.thread_id
  WHERE ${UNREAD_PREDICATE}`;

/**
 * 計數查詢。三個掛點(inject / probe / stop-check)都只需要「幾則、其中幾則必讀」,
 * 故把這個形狀也收在定義站點,避免它們各自把 COUNT/SUM 再寫一次。
 */
const UNREAD_COUNT_SQL = `SELECT COUNT(*) AS total,
              SUM(CASE WHEN t.must_read THEN 1 ELSE 0 END) AS must
       ${UNREAD_FROM_WHERE}`;

/**
 * @param {import('better-sqlite3').Database} db 唯讀連線即可
 * @param {string} track canonical 軌別名
 * @returns {{total: number, mustReadCount: number}} 無未讀時為 {0, 0}(SUM 對空集合回 NULL,此處正規化為 0)
 */
function countUnread(db, track) {
  const row = db.prepare(UNREAD_COUNT_SQL).get({ track });
  return { total: row.total || 0, mustReadCount: row.must || 0 };
}

module.exports = { UNREAD_PREDICATE, UNREAD_FROM_WHERE, UNREAD_COUNT_SQL, countUnread };
