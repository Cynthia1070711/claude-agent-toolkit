#!/usr/bin/env node
/**
 * ceo-briefing-generator.js — Stop Hook (aat-fnd-02-followup-extend-columns)
 *
 * Pipeline 子視窗 Stop 時自動 INSERT ceo_briefings 1 row (13 欄位):
 *   6 原始欄位: run_id / summary(plain Markdown) / status / created_at / created_by / module_id
 *   7 新結構化欄位: briefing_type / decisions_md / risks_md / recommendations_md /
 *                   requires_user_action / epic_id / story_id_ref
 *   1 UI控制欄位(不寫): user_acknowledged_at
 *
 * AC-4: server-side Markdown sanitize (strip <script>, javascript: URLs)
 *
 * ENV Guards:
 *   PHYCOOL_AIOS_CEO_BRIEFING_ENABLED=true
 *   CLAUDE_RUN_ID
 *
 * Budget: < 500ms
 */
'use strict';

const path = require('path');

// ── ENV Guards ──────────────────────────────────────────────────────────────
if (process.env.PHYCOOL_AIOS_CEO_BRIEFING_ENABLED !== 'true') process.exit(0);

const runId = process.env.CLAUDE_RUN_ID;
if (!runId) process.exit(0);

// ── Markdown Sanitize (AC-4) ────────────────────────────────────────────────

/**
 * 防止 Stored XSS: 移除 <script> 標籤、javascript: URLs、on* event handlers。
 * 保留合法 Markdown 語意 (# H1 / **bold** / [link](url))。
 *
 * 若 isomorphic-dompurify 可用則使用，否則 fallback 到 regex。
 * @param {string} md
 * @returns {string}
 */
function sanitizeMarkdown(md) {
  if (!md || typeof md !== 'string') return '';

  let result = md;

  // 嘗試使用 isomorphic-dompurify (AC-4 指定)
  try {
    const DOMPurify = require(path.join(__dirname, 'node_modules', 'isomorphic-dompurify'));
    // FORCE_BODY=false: 不包 body 標籤; 允許 safe text-level HTML
    result = DOMPurify.sanitize(result, {
      ALLOWED_TAGS: [],        // 不允許任何 HTML 標籤
      ALLOWED_ATTR: [],
      FORCE_BODY: false,
    });
    return result;
  } catch { /* fallback to regex */ }

  // Regex fallback — 覆蓋 AC-4 測試的 XSS 向量 + CR F3 補強 (data:/vbscript:)
  result = result.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  result = result.replace(/javascript:/gi, '');
  result = result.replace(/vbscript:/gi, '');
  // 阻擋 data:text/html / data:application/xhtml 等可執行 MIME (允許 data:image/*)
  result = result.replace(/data:text\//gi, '');
  result = result.replace(/data:application\//gi, '');
  result = result.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  result = result.replace(/on\w+\s*=\s*\S+/gi, '');
  return result;
}

// ── PCPT Epic Prefix 白名單 (DRY — 供 detectModuleId / detectEpicId 共用) ─────
const PCPT_EPICS = ['aat', 'eft', 'efm', 'eda', 'skl', 'qgr', 'dla', 'mqv', 'ecc', 'pcptr', 'wfq', 'dvs', 'ca', 'se', 'sku', 'td', 'fix', 'rev', 'bu', 'cci', 'cmi', 'trs'];

// ── Module ID Detection (ADR-AIOS-002 Forward-Compat) ──────────────────────
function detectModuleId(storyId) {
  if (!storyId) return 'UNKNOWN';
  const epic = storyId.split('-')[0]?.toLowerCase();
  return PCPT_EPICS.includes(epic) ? 'PCPT' : 'UNKNOWN';
}

/**
 * 從 storyId 偵測 epic_id (e.g., 'aat-fnd-02' → 'epic-aat')。
 * 非 PCPT epic prefix 回 null，避免寫 'epic-unknown' placeholder 誤關聯。
 * @param {string|null|undefined} storyId
 * @returns {string|null}
 */
function detectEpicId(storyId) {
  if (!storyId) return null;
  const epic = storyId.split('-')[0]?.toLowerCase();
  return PCPT_EPICS.includes(epic) ? `epic-${epic}` : null;
}

// ── Briefing Content Generator ──────────────────────────────────────────────
/**
 * 回傳 plain object (AC-1.2 — 不再 JSON.stringify)，含 4 個 sanitized Markdown 欄位。
 * @returns {{ summary_md: string, decisions_md: string, risks_md: string, recommendations_md: string }}
 */
function buildBriefingContent() {
  const storyId   = process.env.CLAUDE_STORY_ID   || '';
  const phase     = process.env.PIPELINE_PHASE     || 'unknown';
  const now       = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

  // Fallback template (LLM 不在 hook context 中可用)
  return {
    summary_md:          sanitizeMarkdown(`# Pipeline 執行完成\n\nStory: ${storyId}\nPhase: ${phase}\n時間: ${now}`),
    decisions_md:        sanitizeMarkdown('_本 session 無重大決策。_'),
    risks_md:            sanitizeMarkdown('_本 session 無識別風險。_'),
    recommendations_md:  sanitizeMarkdown('_繼續推進下一 Story。_'),
  };
}

// ── SQL Insert ──────────────────────────────────────────────────────────────
const { sql, getPool, nowTaiwan } = require(path.join(__dirname, '_aios-sql.js'));

const outboxEnabled = process.env.PHYCOOL_AIOS_CEO_BRIEFING_OUTBOX_ENABLED === 'true';

(async () => {
  let pool = null;
  try {
    pool = await getPool();
    if (!pool) process.exit(0);

    const ts        = nowTaiwan();
    const agentId   = process.env.CLAUDE_AGENT_ID  || 'CC-OPUS-Alan';
    const rawStoryId = process.env.CLAUDE_STORY_ID || '';
    const storyId   = rawStoryId || null;
    const storyIdRef = rawStoryId || null;  // empty string → NULL (AC-3)
    const moduleId  = detectModuleId(storyId);
    const epicId    = detectEpicId(storyId);
    const contentObj = buildBriefingContent();  // plain object (AC-1.2)

    const tx = pool.transaction();
    await tx.begin();

    try {
      // INSERT ceo_briefings 13 欄位 (6 原始 + 7 新結構化，skip user_acknowledged_at 由 UI 控制)
      // TODO: requires_user_action 目前硬寫 false。
      //   follow-up Story 可加 heuristic：grep session log 內 'BLOCKER'/'FAIL'/'❌' → 自動標 true。
      const insertResult = await tx.request()
        .input('runId',              sql.TYPES.NVarChar(64),      runId)
        .input('summary',            sql.TYPES.NVarChar(sql.MAX), contentObj.summary_md)
        .input('status',             sql.TYPES.NVarChar(20),      'unread')
        .input('ts',                 sql.TYPES.DateTimeOffset,    ts)
        .input('createdBy',          sql.TYPES.NVarChar(64),      agentId)
        .input('moduleId',           sql.TYPES.NVarChar(32),      moduleId)
        .input('briefingType',       sql.TYPES.NVarChar(32),      'run_complete')
        .input('decisionsMd',        sql.TYPES.NVarChar(sql.MAX), contentObj.decisions_md)
        .input('risksMd',            sql.TYPES.NVarChar(sql.MAX), contentObj.risks_md)
        .input('recommendationsMd',  sql.TYPES.NVarChar(sql.MAX), contentObj.recommendations_md)
        .input('requiresUserAction', sql.TYPES.Bit,               false)
        .input('epicId',             sql.TYPES.NVarChar(64),      epicId)
        .input('storyIdRef',         sql.TYPES.NVarChar(128),     storyIdRef)
        .query(`INSERT INTO ceo_briefings
                  (run_id, summary, status, created_at, created_by, module_id,
                   briefing_type, decisions_md, risks_md, recommendations_md,
                   requires_user_action, epic_id, story_id_ref)
                OUTPUT INSERTED.id
                VALUES
                  (@runId, @summary, @status, @ts, @createdBy, @moduleId,
                   @briefingType, @decisionsMd, @risksMd, @recommendationsMd,
                   @requiresUserAction, @epicId, @storyIdRef)`);

      const briefingId = insertResult.recordset[0].id;

      if (outboxEnabled) {
        // AC-6: 直接讀 plain object，移除 JSON.parse try/catch (forward-compat)
        const outboxPayload = JSON.stringify({
          briefing_id:          briefingId,
          briefing_type:        'run_complete',
          summary:              contentObj.summary_md.slice(0, 200),
          requires_user_action: false,
        });

        await tx.request()
          .input('runId',     sql.TYPES.NVarChar(64),      runId)
          .input('eventType', sql.TYPES.NVarChar(64),      'NewCEOBriefing')
          .input('payload',   sql.TYPES.NVarChar(sql.MAX), outboxPayload)
          .input('status',    sql.TYPES.NVarChar(20),      'pending')
          .input('ts',        sql.TYPES.DateTimeOffset,    ts)
          .query(`INSERT INTO agent_events (run_id, event_type, payload, status, created_at)
                  VALUES (@runId, @eventType, @payload, @status, @ts)`);

        process.stderr.write(`[ceo-briefing-generator] outbox event INSERTed for briefing_id=${briefingId}\n`);
      }

      await tx.commit();
    } catch (innerErr) {
      await tx.rollback();
      throw innerErr;
    }
  } catch (err) {
    process.stderr.write(`[ceo-briefing-generator] ${err.message}\n`);
  } finally {
    if (pool) {
      try { await pool.close(); } catch { /* ignore */ }
    }
    process.exit(0);
  }
})();
