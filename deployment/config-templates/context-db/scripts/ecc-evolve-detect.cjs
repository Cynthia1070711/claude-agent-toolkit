'use strict';
// ============================================================
// ecc-evolve-detect.cjs — ECC L2→L3 演化候選偵測 (純讀)
// Epic-ECC-V2 Story C: instinct 聚類演化候選偵測
// ============================================================
// 目的: 讀 instincts + instincts_rejected 表,依 domain 分群,
//       偵測滿足演化門檻的候選並輸出 JSON 至 stdout。
// 門檻: skill ≥ 2 approved instincts / agent-hook ≥ 3 且 avg_confidence ≥ 0.75
// 純讀: readonly: true flag · 0 INSERT/UPDATE/DELETE
// 依賴: ecc-domain-mapping.cjs (SSoT) + upsert-instinct.js normRejectKey (dynamic import)
// 用法: node .context-db/scripts/ecc-evolve-detect.cjs
// ============================================================

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { domainToProjectType, domainToBusiness } = require('./ecc-domain-mapping.cjs');

const DB_PATH = path.join(__dirname, '..', 'phycool.db');
const SKILLS_DIR = path.join(__dirname, '..', '..', '.claude', 'skills');
const RULES_DIR = path.join(__dirname, '..', '..', '.claude', 'rules');
const HOOKS_DIR = path.join(__dirname, '..', '..', '.claude', 'hooks');

// UTC+8 timestamp — 對齊 Constitutional §Timestamp Mandate
function getTaiwanTimestamp() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
}

// Skill Cap 統計 — 讀 .claude/skills/ 目錄
function getSkillCapStatus() {
  let phycoolCount = 0;
  let generalCount = 0;
  try {
    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith('phycool-')) phycoolCount++;
      else generalCount++;
    }
  } catch {
    // 目錄不存在或無讀取權限時靜默降級
  }
  return {
    phycoolCount,
    phycoolCap: 100,
    generalCount,
    generalCap: 60,
    totalCount: phycoolCount + generalCount,
    totalCap: 160,
  };
}

// ── P1 redundant 偵測(2026-06-08): cluster 核心概念若已被既有 rule/skill/hook 涵蓋 → 標 redundant ──
// 與 P0 verifier baseline 過濾互補:P0(ecc-consolidate-mvp verifier 維度 f)擋 agent 內建能力;
// 本層擋「已有既有 rule/skill 涵蓋」的偽陽性候選(對齊 ecc-instincts Iron Law #1 查既有 + skill-creation-discipline §3 Q1 既有相近主題)。
const COVERAGE_TERMS = ['saas-to-skill', 'skill-builder', 'sprint-status', 'execution-tree', 'cross-ref', 'taiwantime', 'offset-aware', 'pathspec', 'tasks-backfill', 'idd-com', 'idd-str', 'idd-reg', 'check-traditional', 'gitnexus_impact'];
function _safeReadLower(p) { try { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n').toLowerCase(); } catch { return ''; } }
function buildCoverageIndex() {
  const idx = [];
  try { for (const e of fs.readdirSync(RULES_DIR)) if (e.endsWith('.md')) idx.push({ file: 'rules/' + e, text: _safeReadLower(path.join(RULES_DIR, e)) }); } catch { /* dir 不存在 silent */ }
  try { for (const e of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) if (e.isDirectory()) { const sk = path.join(SKILLS_DIR, e.name, 'SKILL.md'); if (fs.existsSync(sk)) idx.push({ file: 'skills/' + e.name, text: _safeReadLower(sk) }); } } catch { /* silent */ }
  try { for (const e of fs.readdirSync(HOOKS_DIR)) if (e.endsWith('.js')) idx.push({ file: 'hooks/' + e, text: e.toLowerCase() }); } catch { /* silent */ }
  return idx;
}
function checkRedundancy(members, coverageIndex) {
  const terms = new Set();
  for (const m of members) {
    const txt = ((m.trigger || '') + ' ' + (m.action || '')).toLowerCase();
    for (const kw of COVERAGE_TERMS) if (txt.includes(kw)) terms.add(kw);
  }
  if (terms.size === 0) return { redundant: false, covered_by: [], hit_terms: [] };
  const covered = new Set();
  for (const blob of coverageIndex) {
    for (const t of terms) { if (blob.text.includes(t)) { covered.add(blob.file); break; } }
  }
  return { redundant: covered.size > 0, covered_by: [...covered].slice(0, 5), hit_terms: [...terms] };
}

// 偵測演化候選 — 供 main() 與測試共用
async function detectCandidates(db, normRejectKey, coverageIndex) {
  const now = getTaiwanTimestamp();

  // 查 approved + 未衰退 instincts
  const rows = db.prepare(`
    SELECT id, trigger, action, confidence, domain, project_type, business, adoption_score
    FROM instincts
    WHERE verifier_status = 'approved'
      AND (decay_at IS NULL OR decay_at > ?)
    ORDER BY domain, confidence DESC
  `).all(now);

  // 依 domain 分群
  const groupMap = new Map();
  for (const row of rows) {
    const domain = row.domain || 'unknown';
    if (!groupMap.has(domain)) groupMap.set(domain, []);
    groupMap.get(domain).push(row);
  }

  // 批次查 instincts_rejected norm_key → reject_count
  const rejRows = db.prepare('SELECT norm_key, reject_count FROM instincts_rejected').all();
  const rejMap = new Map();
  for (const r of rejRows) {
    if (r.norm_key) rejMap.set(r.norm_key, r.reject_count);
  }

  const candidates = [];
  const _coverageIndex = coverageIndex || buildCoverageIndex();

  for (const [domain, members] of groupMap.entries()) {
    const count = members.length;
    const avgConf = members.reduce((s, m) => s + m.confidence, 0) / count;

    // 判定類型 (agent-hook 優先 — 更嚴格門檻)
    let type = null;
    if (count >= 3 && avgConf >= 0.75) {
      type = 'agent-hook';
    } else if (count >= 2) {
      type = 'skill';
    }
    if (!type) continue;

    // 成員加上 rejected_count
    const enrichedMembers = members.map(m => {
      const nk = normRejectKey(m.trigger, m.action);
      return {
        id: m.id,
        trigger: m.trigger,
        action: m.action,
        confidence: m.confidence,
        adoption_score: m.adoption_score ?? 0,
        rejected_count: rejMap.get(nk) ?? 0,
      };
    });

    const rejectedTotal = enrichedMembers.reduce((s, m) => s + m.rejected_count, 0);
    const avgAdoptionScore = Math.round(
      (members.reduce((s, m) => s + (m.adoption_score ?? 0), 0) / count) * 100
    ) / 100;

    const redundancy = checkRedundancy(enrichedMembers, _coverageIndex);
    candidates.push({
      type,
      domain,
      business: domainToBusiness(domain),
      project_type: domainToProjectType(domain),
      member_ids: members.map(m => m.id),
      members: enrichedMembers,
      avg_confidence: Math.round(avgConf * 10000) / 10000,
      avg_adoption_score: avgAdoptionScore,
      rejected_total: rejectedTotal,
      redundant: redundancy.redundant,
      covered_by: redundancy.covered_by,
      suggested_action: redundancy.redundant
        ? ('REJECT — 已被既有 rule/skill 涵蓋: ' + redundancy.covered_by.join(', '))
        : (type === 'skill' ? 'Skill(saas-to-skill) Mode A' : 'Skill(hooks-mechanization)'),
    });
  }

  return candidates;
}

module.exports = { detectCandidates, getSkillCapStatus, getTaiwanTimestamp };

// ── Main (CLI entry guard) ─────────────────────────────────
if (require.main === module) {
  (async () => {
    try {
      // Dynamic import normRejectKey from ESM upsert-instinct.js
      const { normRejectKey } = await import('./upsert-instinct.js');

      // readonly: true — 純讀防寫入護欄
      const db = new Database(DB_PATH, { readonly: true });
      db.pragma('journal_mode = WAL');

      const candidates = await detectCandidates(db, normRejectKey);
      const skillCapStatus = getSkillCapStatus();
      const generatedAt = getTaiwanTimestamp();

      const result = { candidates, total: candidates.length, skillCapStatus, generatedAt };
      process.stdout.write(JSON.stringify(result) + '\n');

      db.close();
    } catch (err) {
      process.stderr.write('[ecc-evolve-detect] ERROR: ' + err.message + '\n');
      process.exit(1);
    }
  })();
}
