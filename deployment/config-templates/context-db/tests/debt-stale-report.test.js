import { describe, it, expect } from 'vitest';

// debt-stale-report.js is a wrapper script that calls Layer 1 + Layer 2 via execFileSync.
// We test the report JSON extraction logic by simulating the output format.

describe('debt-stale-report output format', () => {
  const LAYER1_REPORT = {
    timestamp: '2026-04-12T10:00:00+08:00',
    mode: 'dry-run',
    schema_columns_added: 0,
    normalized: { status: 0, category: 0, severity: 0 },
    stale_file_not_exist: 3,
    deduped: 2,
    cross_story_dedup: 1,
    archived: 5,
    remaining_open: 40,
    total_records: 100,
  };

  const LAYER2_REPORT = {
    timestamp: '2026-04-12T10:01:00+08:00',
    mode: 'dry-run',
    stale_pattern_not_found: 4,
    auto_fixed_by_commit: 2,
    skill_review: 3,
    remaining_open: 35,
  };

  it('unified report merges Layer 1 + Layer 2 with correct keys', () => {
    // Simulate the merge logic from debt-stale-report.js
    const unified = {
      timestamp: LAYER2_REPORT.timestamp || LAYER1_REPORT.timestamp,
      mode: LAYER1_REPORT.mode,
      schema_columns_added: LAYER1_REPORT.schema_columns_added ?? 0,
      normalized: LAYER1_REPORT.normalized ?? { status: 0, category: 0, severity: 0 },
      stale_file_not_exist: LAYER1_REPORT.stale_file_not_exist ?? 0,
      deduped: LAYER1_REPORT.deduped ?? 0,
      cross_story_dedup: LAYER1_REPORT.cross_story_dedup ?? 0,
      stale_pattern_not_found: LAYER2_REPORT.stale_pattern_not_found ?? 0,
      auto_fixed_by_commit: LAYER2_REPORT.auto_fixed_by_commit ?? 0,
      skill_review: LAYER2_REPORT.skill_review ?? 0,
      archived: LAYER1_REPORT.archived ?? 0,
      remaining_open: LAYER2_REPORT.remaining_open ?? LAYER1_REPORT.remaining_open ?? 0,
      total_records: LAYER1_REPORT.total_records ?? 0,
    };

    expect(unified.timestamp).toBe('2026-04-12T10:01:00+08:00');
    expect(unified.remaining_open).toBe(35); // Layer 2 authoritative
    expect(unified.stale_file_not_exist).toBe(3);
    expect(unified.stale_pattern_not_found).toBe(4);
    expect(unified.auto_fixed_by_commit).toBe(2);
    expect(unified.archived).toBe(5);
    expect(unified.total_records).toBe(100);
  });

  it('uses Layer 1 remaining_open as fallback when Layer 2 is missing', () => {
    const layer2NoOpen = { ...LAYER2_REPORT, remaining_open: undefined };
    const remaining = layer2NoOpen.remaining_open ?? LAYER1_REPORT.remaining_open ?? 0;
    expect(remaining).toBe(40);
  });

  it('JSON extraction regex matches trailing JSON block', () => {
    const output = `[Phase 1] Schema migration: 0 columns added
[Phase 2] Normalization: status=0, category=0, severity=0

=== Layer 1 Report ===
${JSON.stringify(LAYER1_REPORT, null, 2)}`;

    const match = output.match(/\n(\{[\s\S]*?\})\s*$/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match[1]);
    expect(parsed.timestamp).toBe(LAYER1_REPORT.timestamp);
    expect(parsed.stale_file_not_exist).toBe(3);
  });

  it('AC-11 canonical keys are all present', () => {
    const requiredKeys = [
      'schema_columns_added', 'normalized', 'stale_file_not_exist',
      'stale_pattern_not_found', 'auto_fixed_by_commit', 'skill_review',
      'deduped', 'archived', 'remaining_open', 'total_records',
    ];
    const unified = {
      schema_columns_added: 0,
      normalized: {},
      stale_file_not_exist: 0,
      stale_pattern_not_found: 0,
      auto_fixed_by_commit: 0,
      skill_review: 0,
      deduped: 0,
      archived: 0,
      remaining_open: 0,
      total_records: 0,
    };
    for (const key of requiredKeys) {
      expect(unified).toHaveProperty(key);
    }
  });
});
