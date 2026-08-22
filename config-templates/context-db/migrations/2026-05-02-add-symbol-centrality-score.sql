-- Migration: add symbol_index.centrality_score
-- Source: ADR-GOVERNANCE-001 + Tianji v1.1.0 (2026-05-02)
-- Spec: docs/implementation-artifacts/specs/epic-devcons/td-devconsole-godnode-and-mem-dashboard-spec.md
-- Story: td-devconsole-godnode-and-mem-dashboard (BR-VIS-001~005)
--
-- Schema delta:
--   1) ADD COLUMN centrality_score REAL NOT NULL DEFAULT 0.0
--   2) CREATE INDEX idx_symbol_index_centrality (DESC for ORDER BY)
--
-- Centrality = in_degree + out_degree
--   in_degree  = COUNT(symbol_dependencies WHERE target_symbol = full_name)
--   out_degree = COUNT(symbol_dependencies WHERE source_symbol = full_name)
-- Production baseline (per spec): 8063 symbols / 936 non-zero / 200K+ edges

ALTER TABLE symbol_index ADD COLUMN centrality_score REAL NOT NULL DEFAULT 0.0;

CREATE INDEX IF NOT EXISTS idx_symbol_index_centrality
  ON symbol_index(centrality_score DESC);

-- Compute centrality from symbol_dependencies graph (full_name match)
UPDATE symbol_index
SET centrality_score = (
  SELECT
    COALESCE((SELECT COUNT(*) FROM symbol_dependencies WHERE target_symbol = symbol_index.full_name), 0)
  + COALESCE((SELECT COUNT(*) FROM symbol_dependencies WHERE source_symbol = symbol_index.full_name), 0)
);
