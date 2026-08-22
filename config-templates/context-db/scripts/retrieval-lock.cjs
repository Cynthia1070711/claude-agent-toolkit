// ============================================================
// retrieval-lock.cjs — 檢索架構重建/寫回 PID lock 互斥機制
// ============================================================
// 背景(2026-07-25):refresh-all-retrieval.cjs / sync-retrieval-doc-counters.cjs
// --apply 皆對 phycool.db 與衍生文檔(README/HTML/SKILL/CLAUDE.md)做破壞性寫入,
// 但先前完全無並行防呆 —— 若使用者不小心重複執行(或兩支腳本恰好重疊執行),
// 可能發生:harvest 互相清空對方剛寫入的 symbol_embeddings、doc chunk 負索引暫存
// 撞號、或兩個 --apply 交錯寫檔造成文檔數字混雜。本模組提供共用 PID lock,
// 讓兩支腳本共用同一把鎖(同一互斥網域 = 任何會動 phycool.db 或衍生文檔的操作)。
//
// 設計:標準 PID + timestamp lock file。取鎖前檢查殘留 lock 是否仍存活
// (process.kill(pid, 0) 不殺、只驗證)+ 是否超過 staleTimeoutMs(crash 殘留防線,
// 雙重防呆:即使 PID 剛好被系統重用給别的行程,timeout 仍能救援)。
// 只釋放「自己剛才寫的那把鎖」,避免誤刪別的行程已接手的新鎖。
// 涵蓋正常結束 / 未捕捉例外(process 'exit')/ Ctrl+C(SIGINT)/ SIGTERM。
//
// Usage:
//   const { acquireLock } = require('./retrieval-lock.cjs');
//   const release = acquireLock(LOCK_PATH, { label: 'refresh-all-retrieval' });
//   // ...destructive work...
//   release();
// ============================================================
'use strict';

const fs = require('fs');

// 檢查 PID 是否仍存活。ESRCH = 行程不存在;EPERM = 存在但無權限(仍算存活)。
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function readLock(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 取得互斥鎖。若已有其他存活且未過期的行程持鎖,throw Error(訊息含 PID + 已執行時間)。
 * @param {string} lockPath - lock 檔絕對路徑
 * @param {object} opts
 * @param {string} [opts.label] - 這次操作的識別名稱(寫入 lock 檔,供衝突訊息辨識)
 * @param {number} [opts.staleTimeoutMs] - 超過此時間即視為 stale(即使 PID 仍存活,雙重防呆)
 *   預設 20 分鐘 —— 實測全量 refresh(含 --with-gitnexus)最長 ~7 分鐘,給近 3x 安全邊界。
 * @returns {() => void} release - 釋放鎖的函式(只清自己持有的鎖)
 */
function acquireLock(lockPath, { label = 'retrieval-operation', staleTimeoutMs = 20 * 60 * 1000 } = {}) {
  const existing = readLock(lockPath);
  if (existing) {
    const ageMs = Date.now() - existing.startedAtMs;
    const alive = isPidAlive(existing.pid);
    if (alive && ageMs < staleTimeoutMs) {
      const ageMin = (ageMs / 60000).toFixed(1);
      throw new Error(
        `另一個檢索操作正在執行中(${existing.label || '未知'}, PID ${existing.pid}, 已執行 ${ageMin} 分鐘)。` +
        `請等待其完成後再試,或確認該 PID 已不存在(crash 殘留)後手動刪除 lock 檔:${lockPath}`
      );
    }
    const reason = !alive ? 'PID 已不存在(crash 殘留)' : `已超過 ${(staleTimeoutMs / 60000).toFixed(0)} 分鐘(視為 stale)`;
    process.stderr.write(`[retrieval-lock] 發現殘留 lock(${reason})→ 清除並接手\n`);
    try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
  }

  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, label, startedAtMs: Date.now() }, null, 2));

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      const cur = readLock(lockPath);
      if (cur && cur.pid === process.pid) fs.unlinkSync(lockPath); // 只清自己的鎖
    } catch { /* ignore */ }
  };

  process.once('exit', release);
  process.once('SIGINT', () => { release(); process.exit(130); });
  process.once('SIGTERM', () => { release(); process.exit(143); });

  return release;
}

module.exports = { acquireLock, isPidAlive };
