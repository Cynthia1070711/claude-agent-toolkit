'use strict';
// ============================================================
// ECC D5 domain → project_type / business 映射共用模組 (F2 mapping DRY · 2026-05-26)
// ============================================================
// ADR: ADR-ECC-LEARNING-001 v1.4.0 §Adoption-Score Model (D5)
// 目的: 消除 domain→project_type/business 映射在 3 處重複 —
//   ① observe-pattern.js resolveProjectType (capture 階段 tag project_type)
//   ② ecc-consolidate-mvp.cjs eccProjectType / eccBusiness (auto-write 評分)
//   ③ migrations/2026-05-25-add-ecc-adoption-score-model.sql CASE (DB 端 backfill · 歷史)
// SSoT (JS 端): 本 module。DB 端 migration CASE 為歷史 backfill, 邏輯須與本 module 對齊。
// 純函式 · 無外部依賴 · require 失敗風險極低 (capture hook fail-safe 仍保留 inline fallback)。
// ============================================================

// project_type 三軌 (對齊 migration CHECK: 'pcpt-business' | 'env-tooling' | 'workflow')
const ENV_TOOLING_DOMAINS = ['skill', 'rules', 'memory-infra', 'bmad', 'scripts', 'config'];
const WORKFLOW_DOMAINS = ['docs', 'story', 'review', 'tracking', 'dev-console'];

/**
 * domain → project_type 採納分數軌道 (三軌)。
 * @param {string} domain
 * @returns {'env-tooling'|'workflow'|'pcpt-business'}
 */
function domainToProjectType(domain) {
  if (ENV_TOOLING_DOMAINS.includes(domain)) return 'env-tooling';
  if (WORKFLOW_DOMAINS.includes(domain)) return 'workflow';
  return 'pcpt-business';
}

/**
 * domain → business 粗粒度上卷 (1 business : N domain)。
 * @param {string} domain
 * @returns {string} editor | backend-svc | admin | ai-agent-infra | docs | quality | other
 */
function domainToBusiness(domain) {
  if (['editor', 'state', 'component', 'types', 'frontend'].includes(domain)) return 'editor';
  if (['service', 'controller', 'model', 'migration'].includes(domain)) return 'backend-svc';
  if (domain === 'admin') return 'admin';
  if (ENV_TOOLING_DOMAINS.includes(domain)) return 'ai-agent-infra';
  if (['docs', 'story', 'review', 'tracking'].includes(domain)) return 'docs';
  if (domain === 'test') return 'quality';
  return 'other';
}

module.exports = { domainToProjectType, domainToBusiness, ENV_TOOLING_DOMAINS, WORKFLOW_DOMAINS };
