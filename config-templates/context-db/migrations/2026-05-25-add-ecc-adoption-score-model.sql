-- Migration: ECC D5 Adoption-Score Model — 動態湧現 instinct 跨視窗採納分數模型
-- Date: 2026-05-25
-- ADR: ADR-ECC-LEARNING-001 v1.4.0 §Adoption-Score Model (D5)
-- 觸發: 2026-05-25 Party Mode session — 多視窗併發採納控制 (使用者裁決分級採納)
-- 範圍: 僅軌道 α (動態湧現 instincts 表), 不動軌道 β (10 rule dispatcher registry)
-- 冪等性: 對齊 init-db.js「4a-ext」PRAGMA-check ALTER block (此 .sql 為 timestamp trace +
--   標準套用走 `node .context-db/scripts/init-db.js`; 一次性 apply 可走 apply-migration.js)
-- ============================================================
-- UP

-- 1. instincts 表 +3 欄 (project_type 三軌 / business=domain 粗粒度上卷 / adoption_score 0~5)
ALTER TABLE instincts ADD COLUMN project_type   TEXT
  CHECK (project_type IN ('pcpt-business','env-tooling','workflow'));
ALTER TABLE instincts ADD COLUMN business       TEXT;
ALTER TABLE instincts ADD COLUMN adoption_score INTEGER NOT NULL DEFAULT 3
  CHECK (adoption_score BETWEEN 0 AND 5);

-- 2. observations_queue 表 +project_type (capture 階段 tag · business 由 pattern_type=domain 推導不重複存)
ALTER TABLE observations_queue ADD COLUMN project_type TEXT
  CHECK (project_type IN ('pcpt-business','env-tooling','workflow'));

-- 3. 採納分數查詢索引 (Layer 12 注入過濾用: verifier_status + adoption_score + project_type)
CREATE INDEX IF NOT EXISTS idx_instincts_adoption
  ON instincts (verifier_status, adoption_score DESC, project_type);

-- 4. Backfill instincts (6 rows) — domain → project_type / business 映射 + adoption_score
--    project_type: skill/rules/memory-infra/bmad/scripts/config → env-tooling
--                  docs/story/review/tracking/dev-console → workflow
--                  其餘(editor/admin/service...) → pcpt-business
UPDATE instincts SET project_type = CASE
    WHEN domain IN ('skill','rules','memory-infra','bmad','scripts','config') THEN 'env-tooling'
    WHEN domain IN ('docs','story','review','tracking','dev-console') THEN 'workflow'
    WHEN domain IN ('editor','state','component','types','frontend','admin','service','controller','model','migration') THEN 'pcpt-business'
    ELSE 'pcpt-business'
  END
  WHERE project_type IS NULL;

--    business: domain 粗粒度上卷 (1 business : N domain)
UPDATE instincts SET business = CASE
    WHEN domain IN ('editor','state','component','types','frontend') THEN 'editor'
    WHEN domain IN ('service','controller','model','migration') THEN 'backend-svc'
    WHEN domain = 'admin' THEN 'admin'
    WHEN domain IN ('skill','rules','memory-infra','bmad','scripts','config') THEN 'ai-agent-infra'
    WHEN domain IN ('docs','story','review','tracking') THEN 'docs'
    WHEN domain = 'test' THEN 'quality'
    ELSE 'other'
  END
  WHERE business IS NULL;

--    adoption_score: 既有 6 條皆普世開發紀律 (編輯 SKILL.md/execution-tree/sprint-status 流程規範)
--    approved → 4 (普世跨視窗) · needs-more-evidence → 3 (project 預設底分, 待 verifier 升)
UPDATE instincts SET adoption_score = CASE
    WHEN verifier_status = 'approved' THEN 4
    ELSE 3
  END
  WHERE id IN (SELECT id FROM instincts WHERE source = 'ecc-consolidate-mvp auto-write'
               OR source LIKE 'ecc-consolidate-mvp%');

-- 5. Backfill observations_queue (117 rows) — pattern_type(=domain) → project_type
UPDATE observations_queue SET project_type = CASE
    WHEN pattern_type IN ('skill','rules','memory-infra','bmad','scripts','config') THEN 'env-tooling'
    WHEN pattern_type IN ('docs','story','review','tracking','dev-console') THEN 'workflow'
    WHEN pattern_type IN ('editor','state','component','types','frontend','admin','service','controller','model','migration') THEN 'pcpt-business'
    ELSE 'pcpt-business'
  END
  WHERE project_type IS NULL;
