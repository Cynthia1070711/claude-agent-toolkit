-- Rollback: Epic-ECC-V2 α-path L2 Atomic Instincts (ecc-07)
-- Date: 2026-05-24
-- DOWN — 移除 instincts / observations_queue / instincts_rejected 3 表 + indexes。
-- 注意:DROP TABLE 自動移除其 indexes。空表 rollback 安全(無業務資料依賴)。

DROP INDEX IF EXISTS idx_instincts_scope_conf;
DROP INDEX IF EXISTS idx_instincts_last_seen;
DROP INDEX IF EXISTS idx_instincts_domain;
DROP INDEX IF EXISTS idx_observations_processed;

DROP TABLE IF EXISTS instincts;
DROP TABLE IF EXISTS observations_queue;
DROP TABLE IF EXISTS instincts_rejected;
