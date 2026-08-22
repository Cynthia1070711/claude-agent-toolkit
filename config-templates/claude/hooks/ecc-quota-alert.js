#!/usr/bin/env node
// ============================================================
// ecc-quota-alert — SessionStart Hook(湧現迴路配額耗盡報警擴散)
// ============================================================
// Story: ecc-09 動態湧現韌性 · 2026-05-25 使用者裁決(party-mode)
// 觸發: SessionStart(startup|resume|clear|compact)
// 機制: 讀 .context-db/ecc-state/ecc-alert.json(consolidator 全 key×model + Ollama 耗盡時寫)
//   reported=false 時四管道擴散:
//     ① stdout JSON additionalContext(陳述句 · session 啟動注入 · 使用者看到)
//     ② stderr(log)
//     ③ 回報中控端: agent_events(event_type=EccQuotaExhausted · _aios-sql · ENV guard · fail-open)
//     ④ 寫記憶庫: context_entries(category=session · UTC+8 · 對齊 server.js:1394 INSERT 欄位)
//   擴散後標 reported=true(去重 · 下次 session 不重複擴散)· consolidate 成功時 consolidator 刪檔(自癒)
// 紀律(hooks-mechanization): fail-open(never block session)· stdin drain · BOM strip · stderr 非 stdout · timeout 5000ms
// 註冊: settings.json SessionStart(見本檔末 §註冊片段)
// ============================================================
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = process.env.CLAUDE_PROJECT_DIR || path.join(__dirname, '..', '..');
const ALERT_PATH = path.join(ROOT, '.context-db', 'ecc-state', 'ecc-alert.json');
const DB_PATH = path.join(ROOT, '.context-db', 'phycool.db');

function nowTW() { return new Date(Date.now() + 288e5).toISOString().replace('Z', '+08:00'); } // UTC+8

// drain stdin(SessionStart event · 即使不用也要讀避免 broken pipe)
try { fs.readFileSync(0, 'utf8'); } catch { /* stdin 不可用 */ }

(async () => {
  // ── 讀 alert(BOM strip + CRLF normalize · 對齊 crlf-normalize-discipline)──
  let alert;
  try {
    const txt = fs.readFileSync(ALERT_PATH, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
    alert = JSON.parse(txt);
  } catch { process.exit(0); } // 無 alert = 湧現迴路正常 · 靜默
  if (!alert || alert.reported) process.exit(0); // 已擴散過 · 去重

  const sev = alert.severity || 'medium';
  const failN = alert.fail_count || 1;
  const models = (alert.models_tried || []).join(' → ');
  const retryHint = alert.retry_after_sec ? '(Gemini 建議 ' + alert.retry_after_sec + 's 後恢復)' : '';
  const summary = 'ECC 動態湧現迴路因 Gemini API 配額耗盡而停擺(severity=' + sev + ' · 連續失敗 ' + failN
    + ' 次 · 已試 model 鏈: ' + models + ' + 本地 Ollama 均失敗)' + retryHint
    + '。consolidator 暫無法蒸餾新 instinct,既有 instincts 不受影響。RPD 於太平洋時間午夜重置。';

  // ② stderr(log)
  process.stderr.write('[ecc-quota-alert] ' + summary + '\n');

  // ④ 記憶庫: context_entries(better-sqlite3 直寫 · 對齊 server.js:1394 INSERT 欄位 · UTC+8 · busy_timeout)
  //    註: hook 無 MCP client → 直寫(對齊既有 SessionStart.js better-sqlite3 範式)· alert 不需 embedding 故略
  try {
    const Database = require(path.join(ROOT, '.context-db', 'node_modules', 'better-sqlite3'));
    const db = new Database(DB_PATH);
    db.pragma('busy_timeout = 5000');
    db.prepare('INSERT INTO context_entries (agent_id, timestamp, category, title, content, tags, story_id, epic_id, related_files, session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'ecc-quota-alert', nowTW(), 'session',
      '[ECC ALERT] 動態湧現迴路配額耗盡停擺 (severity=' + sev + ')',
      summary + '\n\nreason=' + (alert.reason || '') + '\ndetail=' + (alert.detail || '') + '\nexhausted_at=' + (alert.exhausted_at || ''),
      JSON.stringify(['ecc', 'quota-alert', 'emergence-loop', 'auto']),
      null, null, null, null
    );
    db.close();
  } catch (e) { process.stderr.write('[ecc-quota-alert] memory write skip: ' + e.message + '\n'); }

  // ③ 中控端: agent_events(ENV guard 對齊 event-bus-publisher · fail-open · 多數 session 未啟用 AIOS 即跳過)
  if (process.env.PHYCOOL_AIOS_EVENT_BUS_ENABLED === 'true') {
    try {
      const { sql, getPool, nowTaiwan } = require(path.join(__dirname, '_aios-sql.js'));
      const pool = await getPool();
      if (pool) {
        await pool.request()
          .input('runId', sql.TYPES.NVarChar(64), process.env.CLAUDE_RUN_ID || 'ecc-alert')
          .input('eventType', sql.TYPES.NVarChar(64), 'EccQuotaExhausted')
          .input('payload', sql.TYPES.NVarChar(sql.MAX), JSON.stringify({ severity: sev, fail_count: failN, models_tried: alert.models_tried, retry_after_sec: alert.retry_after_sec }))
          .input('status', sql.TYPES.NVarChar(20), 'pending')
          .input('ts', sql.TYPES.DateTimeOffset, nowTaiwan())
          .query('INSERT INTO agent_events (run_id, event_type, payload, status, created_at) VALUES (@runId, @eventType, @payload, @status, @ts)');
        try { await pool.close(); } catch { /* ignore */ }
      }
    } catch (e) { process.stderr.write('[ecc-quota-alert] control-plane skip: ' + e.message + '\n'); }
  }

  // 標 reported=true(去重 · 下次 session 不重複擴散)
  try {
    alert.reported = true; alert.reported_at = nowTW();
    fs.writeFileSync(ALERT_PATH, JSON.stringify(alert, null, 2), 'utf8');
  } catch { /* ignore */ }

  // ① stdout JSON additionalContext(注入 · 陳述句非命令句 · 對齊 hooks-mechanization L184)
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: '[ECC 運維狀態] ' + summary
        + ' 恢復途徑為執行 node .context-db/scripts/ecc-consolidate-mvp.cjs --verify,或等待 Gemini RPD 於太平洋時間午夜自動重置。'
    }
  }));
  process.exit(0);
})().catch(() => process.exit(0));

// ── §settings.json 註冊片段(SessionStart · 重啟生效)──
// {
//   "SessionStart": [
//     { "hooks": [
//       { "type": "command",
//         "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/ecc-quota-alert.js\"",
//         "timeout": 5000 }
//     ] }
//   ]
// }
