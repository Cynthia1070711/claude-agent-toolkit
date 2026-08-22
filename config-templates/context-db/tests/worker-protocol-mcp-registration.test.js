// whp-5-message-bus-mcp — AC9 registration-face tests (T-R01~T-R05)
// Static source assertions against .context-db/server.js — does NOT import server.js
// (its module load pulls in local-embedder.js / generate-embeddings.js; see SDD Spec §4.1 V5/V6).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_SRC = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function toolDefNames(source) {
  return [...source.matchAll(/^      name: '([a-z_]+)'/gm)].map(m => m[1]);
}
function caseNames(source) {
  return [...source.matchAll(/case '([a-z_]+)':/g)].map(m => m[1]);
}

describe('AC9: MCP tool registration completeness', () => {
  it('T-R01: tool definition count is 36 (28 pre-whp5 baseline + 4 whp-5 + 4 ccb-1)', () => {
    expect(toolDefNames(SERVER_SRC).length).toBe(36);
  });

  it('T-R02: every defined tool has a matching case — zero orphans', () => {
    const defs = toolDefNames(SERVER_SRC);
    const cases = caseNames(SERVER_SRC);
    const orphans = defs.filter(n => !cases.includes(n));
    expect(orphans).toEqual([]);
  });

  it('T-R03 (BR-024): add_worker_message required array includes "mode"', () => {
    const toolBlockMatch = SERVER_SRC.match(/name: 'add_worker_message'[\s\S]*?required: \[([^\]]*)\]/);
    expect(toolBlockMatch).not.toBeNull();
    expect(toolBlockMatch[1]).toContain("'mode'");
  });

  it('T-R04 (BR-006): SEARCH_TOOLS literally does not contain search_worker_runs', () => {
    const searchToolsBlock = SERVER_SRC.match(/const SEARCH_TOOLS = new Set\(\[([\s\S]*?)\]\);/);
    expect(searchToolsBlock).not.toBeNull();
    expect(searchToolsBlock[1]).not.toMatch(/'search_worker_runs'/);
  });

  it('T-R05 (BR-032): the 3 mutating handlers wire onWrite:appendLedger; the search handler does not', () => {
    const ackHandler = SERVER_SRC.match(/function handleAckWorkerRun[\s\S]*?\n}/)[0];
    const gateHandler = SERVER_SRC.match(/function handleGateWorkerRun[\s\S]*?\n}/)[0];
    const addMsgHandler = SERVER_SRC.match(/function handleAddWorkerMessage[\s\S]*?\n}/)[0];
    const searchHandler = SERVER_SRC.match(/function handleSearchWorkerRuns[\s\S]*?\n}/)[0];

    expect(ackHandler).toMatch(/onWrite:\s*appendLedger/);
    expect(gateHandler).toMatch(/onWrite:\s*appendLedger/);
    expect(addMsgHandler).toMatch(/onWrite:\s*appendLedger/);
    expect(searchHandler).not.toMatch(/onWrite/);
  });
});
