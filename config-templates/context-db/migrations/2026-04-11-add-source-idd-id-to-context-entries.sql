-- ============================================================
-- Migration: Add source_idd_id to context_entries + rework IDD sync trigger
-- Story: dla-08-current-debt-migration (AC-5 / BR-TDI-01)
-- Fixes: TD-DLA07-M2 (IDD → context_entries sync was INSERT-only,
--        any UPDATE on intentional_decisions produced duplicate rows
--        instead of updating the existing mirror)
-- Date: 2026-04-11
-- ============================================================
-- Spec discrepancy note:
--   Spec §3.2 declared `source_idd_id INTEGER REFERENCES intentional_decisions(id)`
--   but intentional_decisions PK is `idd_id TEXT` (no numeric id column).
--   This migration uses the actual PK type: TEXT REFERENCES intentional_decisions(idd_id).
-- ============================================================

-- 1. New column (nullable for historical rows that predate this migration)
ALTER TABLE context_entries
    ADD COLUMN source_idd_id TEXT NULL REFERENCES intentional_decisions(idd_id);

-- 2. Index for reverse lookup (IDD update → find mirror row quickly)
CREATE INDEX IF NOT EXISTS idx_context_entries_source_idd_id
    ON context_entries(source_idd_id);

-- 3. Drop legacy INSERT-only sync trigger
DROP TRIGGER IF EXISTS sync_idd_insert_to_context;

-- 4. Re-create INSERT trigger that now records source_idd_id for future UPDATEs
-- NOTE (CR fix dla-08 F-10): agent_id hardcoded to 'CC-OPUS' because SQLite triggers
-- have no application context (cannot read process env or app variables).
-- All IDDs in the dla-08 seed batch were authored by CC-OPUS during the migration,
-- so this label is historically accurate. Future IDDs created via upsert-intentional.js
-- can be relabeled by post-INSERT UPDATE if needed.
CREATE TRIGGER sync_idd_insert_to_context AFTER INSERT ON intentional_decisions BEGIN
    INSERT INTO context_entries (
        agent_id, timestamp, category, title, content, tags, related_files,
        story_id, epic_id, source_idd_id
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
        NULL, NULL,
        NEW.idd_id
    );
END;

-- 5. NEW UPDATE trigger: keep context_entries mirror in sync (no duplicate INSERT)
CREATE TRIGGER IF NOT EXISTS sync_idd_update_to_context AFTER UPDATE ON intentional_decisions
WHEN (
    NEW.title IS NOT OLD.title OR
    NEW.decision IS NOT OLD.decision OR
    NEW.reason IS NOT OLD.reason OR
    NEW.forbidden_changes IS NOT OLD.forbidden_changes OR
    NEW.tags IS NOT OLD.tags OR
    NEW.related_files IS NOT OLD.related_files OR
    NEW.adr_path IS NOT OLD.adr_path OR
    NEW.idd_type IS NOT OLD.idd_type OR
    NEW.status IS NOT OLD.status
)
BEGIN
    UPDATE context_entries
    SET
        title = NEW.idd_id || ' ' || NEW.title,
        content = '[' || NEW.idd_id || '/' || NEW.idd_type || ']'
            || CASE WHEN NEW.status <> 'active' THEN ' (' || NEW.status || ')' ELSE '' END
            || ' ' || NEW.decision || char(10) || char(10)
            || 'Reason: ' || NEW.reason || char(10) || char(10)
            || 'Forbidden: ' || COALESCE(NEW.forbidden_changes, '[]') || char(10)
            || 'ADR: ' || NEW.adr_path,
        tags = COALESCE(NEW.tags, '[]'),
        related_files = COALESCE(NEW.related_files, '[]')
    WHERE source_idd_id = OLD.idd_id;
END;

-- 6. Optional DELETE trigger (keeps mirror consistent when IDD is removed)
CREATE TRIGGER IF NOT EXISTS sync_idd_delete_to_context AFTER DELETE ON intentional_decisions BEGIN
    DELETE FROM context_entries WHERE source_idd_id = OLD.idd_id;
END;
