#!/usr/bin/env node
/**
 * mcp-health-check.js — PreToolUse + PostToolUseFailure Hook
 * MCP Server 健康偵測與自動恢復建議
 *
 * 雙事件 Hook：
 * - PreToolUse: 檢查健康快取 + 輕量 DB 探測，unhealthy 時阻擋 MCP 呼叫
 * - PostToolUseFailure: 偵測 MCP 故障模式，標記 unhealthy + 指數退避
 * - PostToolUse: MCP 成功時標記 healthy（恢復信號）
 *
 * Story: ecc-05-mcp-health-check-hook
 * BR-001: 健康快取 + TTL（2min）+ 輕量 DB 探測
 * BR-002: 失敗偵測 + 指數退避（30s base, 10min cap）
 * BR-003: 退避期阻擋 + fail-open 模式
 * BR-004: 成功時健康恢復
 * BR-005: non-MCP 工具透通
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── constants ──────────────────────────────────────────────────────────────

const DEFAULT_TTL_MS = 2 * 60 * 1000;        // 2 min
const DEFAULT_BACKOFF_MS = 30 * 1000;         // 30s
const MAX_BACKOFF_MS = 10 * 60 * 1000;        // 10 min
const DB_RELATIVE_PATH = '.context-db/context-memory.db';

const FAILURE_PATTERNS = [
  /ECONNREFUSED/i,
  /ENOTFOUND/i,
  /EAI_AGAIN/i,
  /timed?\s*out/i,
  /socket hang up/i,
  /connection\s+(?:failed|lost|reset|closed|refused)/i,
  /\b401\b|unauthori[sz]ed/i,
  /\b403\b|forbidden/i,
  /\b429\b|rate limit|too many requests/i,
  /\b503\b|service unavailable/i,
  /MCP\s+(?:server|connection)\s+(?:error|failed|unavailable)/i,
];

// ── utility functions (exported for testing) ───────────────────────────────

/**
 * 判斷工具名是否為 MCP 工具（BR-005）
 */
function isMcpTool(toolName) {
  return typeof toolName === 'string' && toolName.startsWith('mcp__');
}

/**
 * 從 mcp__server__tool 格式提取 server name
 */
function extractServerName(toolName) {
  if (!isMcpTool(toolName)) return null;
  const segments = toolName.slice(5).split('__');
  return segments.length >= 2 && segments[0] ? segments[0] : null;
}

/**
 * 取得 session ID（供 temp file 命名）
 */
function getSessionId(envVal) {
  const raw = (envVal || 'default').replace(/[^a-zA-Z0-9_-]/g, '');
  return raw || 'default';
}

/**
 * 載入健康狀態（BR-001 corrupt 防護）
 */
function loadState(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (data && typeof data === 'object' && !Array.isArray(data) && data.servers) {
      return data;
    }
  } catch { /* ignore */ }
  return { version: 1, servers: {} };
}

/**
 * 儲存健康狀態
 */
function saveState(filePath, state) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
  } catch { /* never block hook */ }
}

/**
 * 輕量 DB 檔案探測（BR-001）
 */
function probeDbFile(dbPath) {
  try {
    fs.accessSync(dbPath, fs.constants.R_OK);
    return { ok: true, reason: 'DB file accessible' };
  } catch (err) {
    return { ok: false, reason: err.message || 'DB file not accessible' };
  }
}

/**
 * 偵測錯誤文字中的 MCP 故障模式（BR-002）
 */
function detectFailurePattern(text) {
  if (!text || typeof text !== 'string') return null;
  for (const pattern of FAILURE_PATTERNS) {
    if (pattern.test(text)) return text.slice(0, 200);
  }
  return null;
}

/**
 * 計算指數退避延遲（BR-002）
 */
function calculateBackoff(failureCount, base, max) {
  const delay = base * Math.pow(2, Math.max(failureCount - 1, 0));
  return Math.min(delay, max);
}

/**
 * 判斷是否啟用 fail-open 模式（BR-003）
 */
function shouldFailOpen(envVal) {
  return /^(1|true|yes)$/i.test(String(envVal || ''));
}

/**
 * 檢查健康狀態（BR-001, BR-003）
 * @returns {{ status, action: 'allow'|'block'|'retry'|'probe' }}
 */
function checkHealth(stateFile, serverName, now) {
  const state = loadState(stateFile);
  const server = state.servers[serverName];

  if (!server) {
    return { status: 'unknown', action: 'probe' };
  }

  if (server.status === 'healthy' && server.expiresAt > now) {
    return { status: 'healthy', action: 'allow' };
  }

  if (server.status === 'unhealthy') {
    if (server.nextRetryAt > now) {
      return { status: 'unhealthy', action: 'block', nextRetryAt: server.nextRetryAt };
    }
    return { status: 'unhealthy', action: 'retry' };
  }

  // healthy but expired
  return { status: 'expired', action: 'probe' };
}

/**
 * 標記 server 為 healthy（BR-004）
 */
function markServerHealthy(stateFile, serverName, now, ttl) {
  const state = loadState(stateFile);
  state.servers[serverName] = {
    status: 'healthy',
    checkedAt: now,
    expiresAt: now + ttl,
    failureCount: 0,
    lastError: null,
    nextRetryAt: now,
  };
  saveState(stateFile, state);
}

/**
 * 標記 server 為 unhealthy（BR-002）
 */
function markServerUnhealthy(stateFile, serverName, now, errorMsg) {
  const state = loadState(stateFile);
  const previous = state.servers[serverName] || {};
  const failureCount = (Number(previous.failureCount) || 0) + 1;
  const backoffMs = calculateBackoff(
    failureCount,
    envNumber('MCP_HEALTH_BACKOFF_MS', DEFAULT_BACKOFF_MS),
    MAX_BACKOFF_MS
  );

  state.servers[serverName] = {
    status: 'unhealthy',
    checkedAt: now,
    expiresAt: now,
    failureCount,
    lastError: typeof errorMsg === 'string' ? errorMsg.slice(0, 500) : null,
    nextRetryAt: now + backoffMs,
  };
  saveState(stateFile, state);
}

/**
 * 解析環境變數為數字
 */
function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// ── stdin reader ───────────────────────────────────────────────────────────

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

// ── main logic ─────────────────────────────────────────────────────────────

async function main() {
  let input;
  try {
    const raw = await readStdin();
    input = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    input = {};
  }

  const toolName = input.tool_name || '';
  if (!isMcpTool(toolName)) {
    process.exit(0);
    return;
  }

  const serverName = extractServerName(toolName);
  if (!serverName) {
    process.exit(0);
    return;
  }

  const sessionId = getSessionId(process.env.CLAUDE_SESSION_ID);
  const stateFile = path.join(os.tmpdir(), `pcpt-mcp-health-${sessionId}.json`);
  const now = Date.now();
  const eventName = process.env.CLAUDE_HOOK_EVENT_NAME || 'PreToolUse';
  const ttl = envNumber('MCP_HEALTH_TTL_MS', DEFAULT_TTL_MS);
  const failOpen = shouldFailOpen(process.env.MCP_HEALTH_FAIL_OPEN);

  if (eventName === 'PostToolUseFailure') {
    // ── PostToolUseFailure: 偵測故障 + 標記 unhealthy ──────────────────
    const errorText = [
      input.error,
      input.message,
      typeof input.tool_output === 'string' ? input.tool_output : '',
      input.tool_output?.stderr,
      input.tool_output?.output,
    ].filter(Boolean).join('\n');

    const matched = detectFailurePattern(errorText);
    if (matched) {
      markServerUnhealthy(stateFile, serverName, now, matched);
      process.stderr.write(
        `[mcp-health-check] \u26a0 ${serverName} MCP \u5931\u6557\uff08${matched.slice(0, 80)}\uff09\u2014 ` +
        `\u5df2\u6a19\u8a18 unhealthy\uff0c\u5efa\u8b70\u57f7\u884c /mcp \u91cd\u555f MCP Server\n`
      );
    }
    process.exit(0);
    return;
  }

  if (eventName === 'PostToolUse') {
    // ── PostToolUse: 成功 → 標記 healthy ──────────────────────────────
    const state = loadState(stateFile);
    const previous = state.servers[serverName];
    markServerHealthy(stateFile, serverName, now, ttl);
    if (previous && previous.status === 'unhealthy') {
      process.stderr.write(
        `[mcp-health-check] \u2705 ${serverName} MCP \u5df2\u6062\u5fa9\u5065\u5eb7\n`
      );
    }
    process.exit(0);
    return;
  }

  // ── PreToolUse: 檢查快取 + 探測 ──────────────────────────────────────
  const health = checkHealth(stateFile, serverName, now);

  if (health.action === 'allow') {
    process.exit(0);
    return;
  }

  if (health.action === 'block') {
    const retryIn = Math.ceil((health.nextRetryAt - now) / 1000);
    process.stderr.write(
      `[mcp-health-check] \u26d4 ${serverName} MCP \u4e0d\u5065\u5eb7\uff0c\u9000\u907f\u671f\u5167\uff08${retryIn}s\uff09\u2014 ` +
      `\u5efa\u8b70\u57f7\u884c /mcp \u91cd\u555f MCP Server\n`
    );
    process.exit(failOpen ? 0 : 2);
    return;
  }

  // action === 'probe' or 'retry'
  const dbPath = path.resolve(process.cwd(), DB_RELATIVE_PATH);
  const probe = probeDbFile(dbPath);

  if (probe.ok) {
    markServerHealthy(stateFile, serverName, now, ttl);
    process.exit(0);
  } else {
    markServerUnhealthy(stateFile, serverName, now, probe.reason);
    process.stderr.write(
      `[mcp-health-check] \u26a0 ${serverName} MCP \u63a2\u6e2c\u5931\u6557\uff08${probe.reason}\uff09\u2014 ` +
      `\u5efa\u8b70\u57f7\u884c /mcp \u91cd\u555f MCP Server\n`
    );
    process.exit(failOpen ? 0 : 2);
  }
}

// ── exports (for testing) ──────────────────────────────────────────────────

module.exports = {
  isMcpTool,
  extractServerName,
  getSessionId,
  loadState,
  saveState,
  probeDbFile,
  detectFailurePattern,
  calculateBackoff,
  shouldFailOpen,
  checkHealth,
  markServerHealthy,
  markServerUnhealthy,
  readStdin,
  DEFAULT_TTL_MS,
  DEFAULT_BACKOFF_MS,
  MAX_BACKOFF_MS,
};

// ── entry point ────────────────────────────────────────────────────────────

if (require.main === module) {
  main().catch(() => {
    process.exit(0);  // never block on unexpected error
  });
}
