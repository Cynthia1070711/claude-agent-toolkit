-- Migration: 2026-05-11-add-god-nodes-table.sql
-- Story: td-god-nodes-table-rebuild
-- Purpose: Create god_nodes table for weighted PageRank centrality scores
--          (ADR-GOVERNANCE-001 Layer 3, compute-centrality.cjs upstream)
-- Rollback: 2026-05-11-add-god-nodes-table-down.sql

CREATE TABLE IF NOT EXISTS god_nodes (
  symbol_id              INTEGER PRIMARY KEY,
  file_path              TEXT NOT NULL,
  start_line             INTEGER NOT NULL,
  end_line               INTEGER NOT NULL,
  domain                 TEXT,
  centrality_score       REAL NOT NULL DEFAULT 0.0,
  in_degree              INTEGER NOT NULL DEFAULT 0,
  out_degree             INTEGER NOT NULL DEFAULT 0,
  weighted_in_degree     REAL NOT NULL DEFAULT 0.0,
  weighted_out_degree    REAL NOT NULL DEFAULT 0.0,
  blast_radius           TEXT CHECK (blast_radius IN ('critical','high','medium','low')),
  is_generated           INTEGER NOT NULL DEFAULT 0,
  is_test                INTEGER NOT NULL DEFAULT 0,
  computed_at            TEXT NOT NULL,
  FOREIGN KEY (symbol_id) REFERENCES symbol_index(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_god_nodes_centrality   ON god_nodes(centrality_score DESC);
CREATE INDEX IF NOT EXISTS idx_god_nodes_domain       ON god_nodes(domain);
CREATE INDEX IF NOT EXISTS idx_god_nodes_blast_radius ON god_nodes(blast_radius);
CREATE INDEX IF NOT EXISTS idx_god_nodes_computed_at  ON god_nodes(computed_at);
