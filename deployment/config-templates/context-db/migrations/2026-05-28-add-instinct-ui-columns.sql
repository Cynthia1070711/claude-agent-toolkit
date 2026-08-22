-- Migration: 2026-05-28-add-instinct-ui-columns
-- Story: ecc-emergence-ui-core (AC1)
-- Purpose: instincts +3 UI cols + instincts_rejected +2 cols (additive, idempotent via init-db.js)
-- Applied via init-db.js Epic-ECC-V2 UI section

-- instincts +3 cols
ALTER TABLE instincts ADD COLUMN description_zh TEXT;
ALTER TABLE instincts ADD COLUMN user_note TEXT;
ALTER TABLE instincts ADD COLUMN user_star_rating INTEGER CHECK(user_star_rating BETWEEN 1 AND 10);

-- instincts_rejected +2 cols
ALTER TABLE instincts_rejected ADD COLUMN reject_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE instincts_rejected ADD COLUMN norm_key TEXT;
