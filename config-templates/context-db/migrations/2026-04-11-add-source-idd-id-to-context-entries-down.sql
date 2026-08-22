-- ============================================================
-- Rollback: Remove source_idd_id from context_entries and restore legacy sync trigger
-- Story: dla-08-current-debt-migration (AC-5 / BR-TDI-01)
-- Date: 2026-04-11
-- ============================================================
-- Note: SQLite pre-3.35 does not support ALTER TABLE DROP COLUMN,
-- but SQLite 3.35+ (2021) does. better-sqlite3 ships a modern SQLite.
-- This down script assumes SQLite 3.35+; if older, use the rebuild fallback below.
-- ============================================================

-- 1. Drop the new UPDATE + DELETE triggers
DROP TRIGGER IF EXISTS sync_idd_update_to_context;
DROP TRIGGER IF EXISTS sync_idd_delete_to_context;

-- 2. Drop the new INSERT trigger and restore the legacy INSERT-only trigger
DROP TRIGGER IF EXISTS sync_idd_insert_to_context;

CREATE TRIGGER sync_idd_insert_to_context AFTER INSERT ON intentional_decisions BEGIN
    INSERT INTO context_entries (
        agent_id, timestamp, category, title, content, tags, related_files,
        story_id, epic_id
    ) VALUES (
        'CC-OPUS',
        NEW.created_at,
        'intentional',
        NEW.idd_id || ' ' || NEW.title,
        '[' || NEW.idd_id || '/' || NEW.idd_type || '] '
            || NEW.decision || char(10) || char(10)
            || 'Reason: ' || NEW.reason || char(10) || char(10)
            || 'Forbidden: ' || COALESCE(NEW.forbidden_changes, '[]') || char(10)
            || 'ADR: ' || NEW.adr_path,
        COALESCE(NEW.tags, '[]'),
        COALESCE(NEW.related_files, '[]'),
        NULL, NULL
    );
END;

-- 3. Drop the index and column
DROP INDEX IF EXISTS idx_context_entries_source_idd_id;
ALTER TABLE context_entries DROP COLUMN source_idd_id;

-- ============================================================
-- Fallback (SQLite < 3.35 — table rebuild). Not used by current DB.
-- CREATE TABLE context_entries_new AS SELECT id, session_id, agent_id, timestamp,
--     category, tags, title, content, related_files, story_id, epic_id
--     FROM context_entries;
-- DROP TABLE context_entries;
-- ALTER TABLE context_entries_new RENAME TO context_entries;
-- (Plus re-create any dropped indexes.)
-- ============================================================
