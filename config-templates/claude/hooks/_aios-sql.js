#!/usr/bin/env node
/**
 * _aios-sql.js — AIOS Hook 共用 SQL Server 連線輔助 (aat-fnd-02)
 *
 * 所有 AIOS hooks 透過此模組取得 mssql pool。
 * 連線字串來源: PHYCOOL_MSSQL_CONNECTION_STRING env var。
 * 若未設定或連線失敗，回傳 null (hooks 靜默跳過)。
 *
 * [Intentional: IDD-STR-004] 表名採 snake_case (agent_runs / ceo_briefings / agent_events)
 * 對齊 Memory DB SQLite 風格，與 AIOSDbContext 命名一致。
 */
'use strict';

const path = require('path');

let sql;
try {
  sql = require(path.join(__dirname, 'node_modules', 'mssql'));
} catch {
  sql = null;
}

/** 取得 Taiwan UTC+8 時間戳 (ISO 8601) */
function nowTaiwan() {
  const d = new Date();
  const off = 8 * 60 * 60 * 1000;
  return new Date(d.getTime() + off).toISOString().replace('Z', '+08:00');
}

/**
 * 建立 mssql connection pool。
 * @returns {Promise<import('mssql').ConnectionPool|null>}
 */
async function getPool() {
  if (!sql) return null;

  const cs = process.env.PHYCOOL_MSSQL_CONNECTION_STRING;
  if (!cs) return null;

  try {
    const pool = await sql.connect(cs);
    return pool;
  } catch (err) {
    process.stderr.write(`[aios-sql] Connection failed: ${err.message}\n`);
    return null;
  }
}

/**
 * 讀取 OTel JSONL 取得本 session 累計 token 數。
 * Best-effort: 回傳 null 若無法讀取。
 * @param {string} projectRoot
 * @returns {number|null}
 */
function readCurrentToken(projectRoot) {
  const fs = require('fs');
  const infoPath = path.join(projectRoot, 'logs', 'main-otel-info.json');
  try {
    if (!fs.existsSync(infoPath)) return null;
    const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
    const jsonlPath = info.jsonl;
    if (!jsonlPath || !fs.existsSync(jsonlPath)) return null;

    const content = fs.readFileSync(jsonlPath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    // 取最後 200 行以控制讀取量
    const recent = lines.slice(-200);
    let total = 0;
    for (const line of recent) {
      try {
        const obj = JSON.parse(line);
        if (typeof obj.input_tokens === 'number') total += obj.input_tokens;
        if (typeof obj.output_tokens === 'number') total += obj.output_tokens;
        if (typeof obj.cache_read_input_tokens === 'number') total += obj.cache_read_input_tokens;
      } catch { /* skip */ }
    }
    return total > 0 ? total : null;
  } catch {
    return null;
  }
}

module.exports = { sql, getPool, nowTaiwan, readCurrentToken };
