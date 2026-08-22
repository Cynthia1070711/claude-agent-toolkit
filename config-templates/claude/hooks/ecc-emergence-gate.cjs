#!/usr/bin/env node
// ============================================================
// ecc-09 動態湧現 dual-gate 觸發器 (Stop hook · async fire-and-forget)
// ============================================================
// 借鑑: ECC evaluate-session.js(Stop hook 判閾值送訊號)+ AI自我成長.md §九 dual-gate(數量+時間)
// 機制: 每次 Claude 回應結束(Stop)檢查 dual-gate:
//   unprocessed observations ≥ THRESHOLD  AND  距上次 consolidate ≥ INTERVAL
//   → detached spawn consolidator(--verify --auto-write · 背景不阻塞)→ 自動湧現 instinct
// 紀律: silent failure(never block)· stop_hook_active 防無限迴圈 · async(timeout 寬鬆)
// 註冊: settings.json Stop hooks · "async": true(見本檔末 §註冊片段)
// ============================================================
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');               // .claude/hooks/ → 專案根
const DB_PATH = path.join(ROOT, '.context-db', 'phycool.db');
const STATE = path.join(ROOT, '.context-db', 'ecc-state', 'emergence-gate-state.json');
const CONSOLIDATOR = path.join(ROOT, '.context-db', 'scripts', 'ecc-consolidate-mvp.cjs');
const LOCK = path.join(ROOT, '.context-db', 'ecc-state', 'emergence-gate.lock');  // D5 TOCTOU 跨進程鎖
const LOCK_STALE_MS = 60 * 1000;        // 鎖 staleness: gate 檢查+spawn 極快, >60s = crashed gate 可覆寫

// dual-gate 參數(對齊 AI自我成長.md: memory-mcp 80 條 / Auto Dream 24h+5 sessions · 此處保守 20 筆 + 24h)
const THRESHOLD = 20;                  // 數量 gate: unprocessed observations
const INTERVAL_MS = 24 * 3600 * 1000;  // 時間 gate: 24h

// ── 讀 stdin (Stop event) ──
let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }
let data = {};
try { data = JSON.parse(raw); } catch { /* 容忍 */ }
if (data && data.stop_hook_active) process.exit(0); // 防無限迴圈(已觸發過)

// ── D5 多視窗強化: TOCTOU 跨進程鎖(防多視窗 dual-gate 同時 spawn consolidator → 雙倍 Gemini 配額)──
// atomic 'wx' create; 失敗 = 另一視窗 gate 正在 read-check-spawn → skip。state cooldown(24h)為第二防線。
try { fs.mkdirSync(path.dirname(LOCK), { recursive: true }); } catch { /* dir 已存在 */ }
try { const st = fs.statSync(LOCK); if (Date.now() - st.mtimeMs > LOCK_STALE_MS) fs.unlinkSync(LOCK); } catch { /* 無鎖檔 = 正常 */ }
let lockFd;
try { lockFd = fs.openSync(LOCK, 'wx'); } catch { process.exit(0); } // 未取得鎖(另一視窗持有)→ skip 防雙 spawn
function releaseLock() { try { fs.closeSync(lockFd); } catch {} try { fs.unlinkSync(LOCK); } catch {} }

try {
  let Database;
  try { Database = require(path.join(ROOT, '.context-db', 'node_modules', 'better-sqlite3')); }
  catch { releaseLock(); process.exit(0); } // better-sqlite3 不可用 → silent skip

  // 數量 gate
  const db = new Database(DB_PATH, { readonly: true });
  let unprocessed = 0;
  try { unprocessed = db.prepare('SELECT COUNT(*) n FROM observations_queue WHERE processed = 0').get().n; } catch { /* 表未 migrate */ }
  db.close();

  // 時間 gate
  let lastRun = 0;
  try { lastRun = (JSON.parse(fs.readFileSync(STATE, 'utf8')).last_run_ms) || 0; } catch { /* 首次 */ }
  const now = Date.now();

  const gateMet = unprocessed >= THRESHOLD && (now - lastRun) >= INTERVAL_MS;
  if (!gateMet) { releaseLock(); process.exit(0); } // dual-gate 未達 → 不觸發(大多數回應走此路 · 低頻)

  // ── dual-gate 達標 → 記 state + detached 背景 spawn consolidator(fire-and-forget) ──
  try {
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify({
      last_run_ms: now,
      last_run_at: new Date(now + 288e5).toISOString().replace('Z', '+08:00'),
      unprocessed_at_trigger: unprocessed
    }), 'utf8');
  } catch { /* state 寫入失敗不阻塞 */ }

  // 需 GEMINI_API_KEYS env(User-level 已設 · hook 環境繼承)· 背景跑不阻塞 Stop
  const child = spawn(process.execPath, [CONSOLIDATOR, '--verify', '--auto-write'],
    { detached: true, stdio: 'ignore', cwd: ROOT });
  child.unref();
  process.stderr.write('[ecc-emergence-gate] dual-gate met (unprocessed=' + unprocessed + ' ≥ ' + THRESHOLD + ') → spawned consolidator (background auto-write)\n');
} catch { /* silent — never block user */ }
releaseLock(); // D5: 釋放 TOCTOU 鎖(state 已寫 + consolidator 已 spawn · 第二視窗 cooldown 兜底)
process.exit(0);

// ── §settings.json 註冊片段(Stop hooks · async · 重啟生效)──
// {
//   "Stop": [
//     { "hooks": [
//       { "type": "command",
//         "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/ecc-emergence-gate.cjs\"",
//         "timeout": 10000, "async": true }
//     ] }
//   ]
// }
