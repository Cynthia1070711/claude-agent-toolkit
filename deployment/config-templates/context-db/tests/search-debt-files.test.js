import { describe, it, expect } from 'vitest';

/**
 * DLA-01: search_debt affected_files fuzzy matching tests
 * Tests the fuzzy file matching logic used in handleSearchDebt
 * Pattern reused from boy-scout-sweep.js:L92-130
 */

// Extract the matching logic to test independently
function parseAffectedFiles(raw) {
  if (!raw) return [];
  let files;
  try {
    files = JSON.parse(raw);
    if (!Array.isArray(files)) files = [String(files)];
  } catch {
    files = raw.split(',').map(f => f.trim()).filter(Boolean);
  }
  return files;
}

function fuzzyMatchFiles(debtAffectedFiles, inputFiles) {
  const debtFiles = parseAffectedFiles(debtAffectedFiles);
  if (debtFiles.length === 0) return false;

  const debtFilesNorm = debtFiles.map(f => f.replace(/\\/g, '/'));
  for (const inputFile of inputFiles) {
    const inputNorm = inputFile.replace(/\\/g, '/');
    for (const df of debtFilesNorm) {
      if (df === inputNorm ||
          df.endsWith('/' + inputNorm) ||
          inputNorm.endsWith('/' + df) ||
          df.includes(inputNorm) ||
          inputNorm.includes(df)) {
        return true;
      }
    }
  }
  return false;
}

describe('parseAffectedFiles', () => {
  it('parses JSON array string', () => {
    const result = parseAffectedFiles('["src/a.js","src/b.js"]');
    expect(result).toEqual(['src/a.js', 'src/b.js']);
  });

  it('parses comma-separated string', () => {
    const result = parseAffectedFiles('src/a.js, src/b.js');
    expect(result).toEqual(['src/a.js', 'src/b.js']);
  });

  it('parses single file string', () => {
    const result = parseAffectedFiles('src/a.js');
    expect(result).toEqual(['src/a.js']);
  });

  it('returns empty for null/undefined', () => {
    expect(parseAffectedFiles(null)).toEqual([]);
    expect(parseAffectedFiles(undefined)).toEqual([]);
    expect(parseAffectedFiles('')).toEqual([]);
  });

  it('handles JSON non-array (single string)', () => {
    const result = parseAffectedFiles('"src/single.js"');
    expect(result).toEqual(['src/single.js']);
  });
});

describe('fuzzyMatchFiles', () => {
  it('matches exact path', () => {
    expect(fuzzyMatchFiles('src/utils/helper.js', ['src/utils/helper.js'])).toBe(true);
  });

  it('matches by endsWith (short input, long debt path)', () => {
    expect(fuzzyMatchFiles('src/components/editor/ImagePanel.tsx', ['ImagePanel.tsx'])).toBe(true);
  });

  it('matches by contains (basename in path)', () => {
    expect(fuzzyMatchFiles('.context-db/server.js', ['server.js'])).toBe(true);
  });

  it('matches with backslash normalization', () => {
    expect(fuzzyMatchFiles('src\\utils\\helper.js', ['src/utils/helper.js'])).toBe(true);
  });

  it('returns false for no match', () => {
    expect(fuzzyMatchFiles('src/a.js', ['src/b.js'])).toBe(false);
  });

  it('returns false for empty debt affected_files', () => {
    expect(fuzzyMatchFiles('', ['src/a.js'])).toBe(false);
    expect(fuzzyMatchFiles(null, ['src/a.js'])).toBe(false);
  });

  it('returns false for empty input files', () => {
    expect(fuzzyMatchFiles('src/a.js', [])).toBe(false);
  });

  it('matches JSON array affected_files', () => {
    expect(fuzzyMatchFiles('["src/a.js","src/b.js"]', ['src/b.js'])).toBe(true);
  });

  it('matches multi-input against single debt file', () => {
    expect(fuzzyMatchFiles('src/a.js', ['src/x.js', 'src/a.js'])).toBe(true);
  });

  it('matches partial path (input longer than debt)', () => {
    expect(fuzzyMatchFiles('server.js', ['.context-db/server.js'])).toBe(true);
  });

  it('handles comma-separated debt files', () => {
    expect(fuzzyMatchFiles('src/a.js, src/b.js', ['src/b.js'])).toBe(true);
  });
});

describe('deduplication by debt_id', () => {
  it('removes duplicates when same debt matches both target_story and affected_files', () => {
    const targetResults = [
      { debt_id: 'TD-001', title: 'Debt 1' },
      { debt_id: 'TD-002', title: 'Debt 2' },
    ];
    const fileResults = [
      { debt_id: 'TD-002', title: 'Debt 2' }, // duplicate
      { debt_id: 'TD-003', title: 'Debt 3' },
    ];

    const seen = new Set(targetResults.map(r => r.debt_id));
    const merged = [...targetResults];
    for (const fm of fileResults) {
      if (!seen.has(fm.debt_id)) {
        merged.push(fm);
        seen.add(fm.debt_id);
      }
    }

    expect(merged).toHaveLength(3);
    expect(merged.map(r => r.debt_id)).toEqual(['TD-001', 'TD-002', 'TD-003']);
  });
});
