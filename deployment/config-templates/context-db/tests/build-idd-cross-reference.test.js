import { describe, it, expect } from 'vitest';
import { buildSkillsMap, buildIddEnrichment } from '../scripts/build-idd-cross-reference.js';

// ── buildSkillsMap tests ──
describe('buildSkillsMap', () => {
  it('builds map from skills with matches', () => {
    const scanResult = {
      results: [
        {
          skill_name: 'phycool-editor-arch',
          file_path: '.claude/skills/phycool-editor-arch/SKILL.md',
          match_count: 2,
          matches: [
            { line: 10, pattern: 'idd_id', matched: ['IDD-COM-001'], context: 'ctx1' },
            { line: 20, pattern: 'forbidden_changes', matched: ['forbidden_changes'], context: 'ctx2' },
          ],
        },
        {
          skill_name: 'phycool-admin-module',
          file_path: '.claude/skills/phycool-admin-module/SKILL.md',
          match_count: 0,
          matches: [],
        },
      ],
    };
    const map = buildSkillsMap(scanResult);
    expect(Object.keys(map)).toEqual(['phycool-editor-arch']);
    expect(map['phycool-editor-arch'].idd_refs).toHaveLength(2);
    expect(map['phycool-editor-arch'].file_path).toBe('.claude/skills/phycool-editor-arch/SKILL.md');
  });

  it('returns empty map when no skills have matches', () => {
    const scanResult = {
      results: [{ skill_name: 'test', file_path: 'x', match_count: 0, matches: [] }],
    };
    expect(buildSkillsMap(scanResult)).toEqual({});
  });

  it('handles empty results array', () => {
    expect(buildSkillsMap({ results: [] })).toEqual({});
  });

  it('handles undefined results', () => {
    expect(buildSkillsMap({})).toEqual({});
  });
});

// ── buildIddEnrichment tests ──
describe('buildIddEnrichment', () => {
  it('enriches from skills map', () => {
    const skillsMap = {
      'phycool-editor-arch': {
        file_path: 'x',
        idd_refs: [
          { line: 10, pattern: 'idd_id', matched: ['IDD-COM-001'], context: '' },
        ],
      },
    };
    const docResult = { all_matches: [], system_platform_coverage: {} };
    const codeResult = {};
    const enrichment = buildIddEnrichment(skillsMap, docResult, codeResult);
    expect(enrichment['IDD-COM-001']).toBeDefined();
    expect(enrichment['IDD-COM-001'].related_skills).toContain('phycool-editor-arch');
  });

  it('enriches from doc matches', () => {
    const docResult = {
      all_matches: [
        { file: 'docs/test.md', idd_ids: ['IDD-STR-002'] },
      ],
      system_platform_coverage: {},
    };
    const enrichment = buildIddEnrichment({}, docResult, {});
    expect(enrichment['IDD-STR-002'].related_docs).toContain('docs/test.md');
  });

  it('enriches from system_platform_coverage', () => {
    const docResult = {
      all_matches: [],
      system_platform_coverage: {
        'EditorModule': {
          module: 'EditorModule',
          related_idds: ['IDD-COM-001'],
          files_checked: [],
          has_idd_section: false,
          idd_refs_found: [],
          missing_idd_refs: ['IDD-COM-001'],
        },
      },
    };
    const enrichment = buildIddEnrichment({}, docResult, {});
    expect(enrichment['IDD-COM-001'].platform_modules).toContain('EditorModule');
  });

  it('merges all three sources and deduplicates', () => {
    const skillsMap = {
      'phycool-editor-arch': {
        file_path: 'x',
        idd_refs: [{ line: 1, pattern: 'idd_id', matched: ['IDD-COM-001'], context: '' }],
      },
    };
    const docResult = {
      all_matches: [
        { file: 'docs/a.md', idd_ids: ['IDD-COM-001'] },
        { file: 'docs/b.md', idd_ids: ['IDD-COM-001'] },
      ],
      system_platform_coverage: {
        'Mod': { module: 'Mod', related_idds: ['IDD-COM-001'] },
      },
    };
    const enrichment = buildIddEnrichment(skillsMap, docResult, {});
    const e = enrichment['IDD-COM-001'];
    expect(e.related_skills).toEqual(['phycool-editor-arch']);
    expect(e.related_docs).toEqual(['docs/a.md', 'docs/b.md']);
    expect(e.platform_modules).toEqual(['Mod']);
  });

  it('handles matched items without idd_ids', () => {
    const docResult = {
      all_matches: [{ file: 'docs/x.md', idd_ids: [] }],
      system_platform_coverage: {},
    };
    const enrichment = buildIddEnrichment({}, docResult, {});
    expect(Object.keys(enrichment)).toHaveLength(0);
  });

  it('skills map entries without IDD-XXX in matched are skipped', () => {
    const skillsMap = {
      'test-skill': {
        file_path: 'x',
        idd_refs: [{ line: 1, pattern: 'forbidden_changes', matched: ['forbidden_changes'], context: '' }],
      },
    };
    const enrichment = buildIddEnrichment(skillsMap, { all_matches: [], system_platform_coverage: {} }, {});
    expect(Object.keys(enrichment)).toHaveLength(0);
  });
});
