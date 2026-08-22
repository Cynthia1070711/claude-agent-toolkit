// ============================================================
// poolClassifier.ts — 4 池分類純函式 (AC6.10 SSoT)
// ecc-emergence-ui-v2
// ============================================================
import type { InstinctCard, PoolKey } from '../types/emergence.js';

export function classifyInstinct(
  instinct: InstinctCard,
  generatedSkillClusterIds: Set<string>,
  evolveCandidateIds: Set<string>
): PoolKey {
  if (instinct.verifier_status === 'rejected') return 'rejected';
  if (generatedSkillClusterIds.has(instinct.id)) return 'skill';
  if (evolveCandidateIds.has(instinct.id)) return 'candidate';
  return 'observe';
}
