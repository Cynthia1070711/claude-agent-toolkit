-- Rollback: Epic-WHP worker protocol registry (whp-3-db-schema-registry)
-- Date: 2026-07-27
-- DOWN — 移除 worker_runs / worker_messages / worker_handoffs / guardian_heartbeat 4 表。
-- 注意:DROP TABLE 自動移除其 indexes,不需另 DROP INDEX。
-- 安全性:whp-3 階段無任何生產寫入路徑接線(whp-4 才接線),4 表皆為空表,rollback 無資料損失。

DROP TABLE IF EXISTS worker_runs;
DROP TABLE IF EXISTS worker_messages;
DROP TABLE IF EXISTS worker_handoffs;
DROP TABLE IF EXISTS guardian_heartbeat;
