-- Rollback: 2026-05-11-add-god-nodes-table-down.sql
-- Story: td-god-nodes-table-rebuild
-- Purpose: Drop god_nodes table (reverse of 2026-05-11-add-god-nodes-table.sql)

DROP INDEX IF EXISTS idx_god_nodes_computed_at;
DROP INDEX IF EXISTS idx_god_nodes_blast_radius;
DROP INDEX IF EXISTS idx_god_nodes_domain;
DROP INDEX IF EXISTS idx_god_nodes_centrality;
DROP TABLE IF EXISTS god_nodes;
