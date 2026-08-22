// ============================================================
// poolClassifier.test.ts — ecc-emergence-ui-v2 AC6.10
// ============================================================
import { describe, it, expect } from 'vitest';
import { classifyInstinct } from '../poolClassifier.js';
import type { InstinctCard } from '../../types/emergence.js';

function makeCard(overrides: Partial<InstinctCard> = {}): InstinctCard {
  return {
    id: 'inst_test_001',
    trigger: 'test trigger',
    action: 'test action',
    confidence: 0.8,
    verifier_status: 'approved',
    verifier_reason: null,
    adoption_score: 3,
    domain: 'test',
    scope: 'project',
    evidence_jsonb: null,
    source: null,
    source_session_id: null,
    created_at: '2026-05-28T00:00:00+08:00',
    last_seen: '2026-05-28T00:00:00+08:00',
    decay_at: null,
    project_type: null,
    business: null,
    description_zh: null,
    user_note: null,
    machine_star: 8,
    ...overrides,
  };
}

describe('classifyInstinct', () => {
  it('verifier_status=rejected → rejected 池', () => {
    const card = makeCard({ verifier_status: 'rejected' });
    expect(classifyInstinct(card, new Set(), new Set())).toBe('rejected');
  });

  it('approved + id in generatedSkillClusterIds → skill 池', () => {
    const card = makeCard({ id: 'inst_abc', verifier_status: 'approved' });
    expect(classifyInstinct(card, new Set(['inst_abc']), new Set())).toBe('skill');
  });

  it('approved + id in evolveCandidateIds → candidate 池', () => {
    const card = makeCard({ id: 'inst_xyz', verifier_status: 'approved' });
    expect(classifyInstinct(card, new Set(), new Set(['inst_xyz']))).toBe('candidate');
  });

  it('approved + not in any set → observe 池', () => {
    const card = makeCard({ verifier_status: 'approved' });
    expect(classifyInstinct(card, new Set(), new Set())).toBe('observe');
  });

  it('needs-more-evidence → observe 池', () => {
    const card = makeCard({ verifier_status: 'needs-more-evidence' });
    expect(classifyInstinct(card, new Set(), new Set())).toBe('observe');
  });
});
