// bwu-14-inject-budget-dimension-and-mirror — Layer 12 注入預算單一定義站點守護
//
// 比照 ccb-4 BR009_UnreadPredicate_SingleDefinitionSite 範式(knock-controller-ops.test.js:352-375):
// 一份預算規則若允許消費端各自內聯一份，下次改動只會傳導到改的那一側，另一側悄悄漂移——
// 這正是 bwu-11 修完 hook 側字元制後、DevConsole 端仍是 1200 token 制整整一個 Story 週期
// 都沒被發現的根因。本測項守護「只有一處定義」這件事本身，而非守護預算值。

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..', '..');

describe('inject-budget single definition site (AC5)', () => {
  it('BR014_InjectBudget_SingleDefinitionSite: exactly one file defines INSTINCT_CHARS; every consumer only requires it', () => {
    const DEFINITION = path.join(REPO, '.context-db', 'scripts', 'inject-budget.cjs');
    const HOOK_CONSUMER = path.join(REPO, '.claude', 'hooks', 'pre-prompt-rag.js');
    const ROUTE_CONSUMER = path.join(REPO, 'tools', 'dev-console', 'server', 'routes', 'emergence.ts');

    // (1) 定義站點恰一處
    const defSrc = fs.readFileSync(DEFINITION, 'utf8');
    const defCount = (defSrc.match(/const\s+INSTINCT_CHARS\s*=/g) || []).length;
    expect(defCount, 'inject-budget.cjs should define INSTINCT_CHARS exactly once').toBe(1);

    // (2) 消費端不得 redefine
    const hookSrc = fs.readFileSync(HOOK_CONSUMER, 'utf8');
    const routeSrc = fs.readFileSync(ROUTE_CONSUMER, 'utf8');
    expect(hookSrc, 'pre-prompt-rag.js must not redefine INSTINCT_CHARS').not.toMatch(/const\s+INSTINCT_CHARS\s*=/);
    expect(routeSrc, 'emergence.ts must not redefine INSTINCT_CHARS').not.toMatch(/const\s+INSTINCT_CHARS\s*=/);
    expect(routeSrc, 'emergence.ts must not reintroduce the retired token-based INSTINCT_TOKENS constant')
      .not.toMatch(/INSTINCT_TOKENS/);

    // (3) 消費端須實際引用
    expect(hookSrc, 'pre-prompt-rag.js should consume inject-budget').toContain('inject-budget');
    expect(routeSrc, 'emergence.ts should consume inject-budget').toContain('inject-budget');
  });
});
