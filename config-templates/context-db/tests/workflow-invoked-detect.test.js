// whp-4-write-path-wiring -- BR-119~BR-122 (workflow_invoked 3-state pure-function detector).
// 走小型合成 JSONL fixture(fs.mkdtempSync,對齊 guardian-tick.test.js 既有慣例),絕不 commit
// 真實 transcript 拷貝 -- 手動 Phase 4 已對本次對話自己的真實 transcript 逐案例驗證過(見
// docs/tracking/active/whp-4-write-path-wiring.track.md Phase 4 entry),本檔把那些已驗證過的
// 判斷邏輯轉寫為可重跑的合成案例(transcription, not new discovery)。

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { detectWorkflowInvoked } from '../scripts/workflow-invoked-detect.js';

function writeTranscript(lines, lineEnding = '\n') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whp4-wi-'));
  const file = path.join(dir, 'transcript.jsonl');
  fs.writeFileSync(file, lines.join(lineEnding));
  return file;
}

const readToolUse = (filePath) => JSON.stringify({
  type: 'assistant',
  message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Read', input: { file_path: filePath } }] },
});
const globToolUse = (pattern) => JSON.stringify({
  type: 'assistant',
  message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Glob', input: { pattern } }] },
});
const skillToolUse = (skill) => JSON.stringify({
  type: 'assistant',
  message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] },
});
const irrelevantToolUse = () => JSON.stringify({
  type: 'assistant',
  message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command: 'echo hi' } }] },
});
const userToolResult = (text) => JSON.stringify({
  type: 'user',
  message: { role: 'user', content: [{ type: 'tool_result', content: text }] },
});

describe('detectWorkflowInvoked -- args and file-existence guards', () => {
  it('empty transcriptPath -> unknown', async () => {
    expect(await detectWorkflowInvoked('', 'dev-story')).toBe('unknown');
  });

  it('empty phase -> unknown', async () => {
    const file = writeTranscript([readToolUse('_bmad/bmm/workflows/4-implementation/dev-story/workflow.md')]);
    expect(await detectWorkflowInvoked(file, '')).toBe('unknown');
  });

  it('nonexistent file -> unknown', async () => {
    expect(await detectWorkflowInvoked('C:\\does\\not\\exist\\nope.jsonl', 'dev-story')).toBe('unknown');
  });
});

describe('detectWorkflowInvoked -- positive signals (BR-119/BR-120)', () => {
  it('Read of a _bmad workflows/{phase} path -> true', async () => {
    const file = writeTranscript([
      irrelevantToolUse(),
      readToolUse('_bmad/bmm/workflows/4-implementation/dev-story/workflow.md'),
    ]);
    expect(await detectWorkflowInvoked(file, 'dev-story')).toBe('true');
  });

  it('Glob pattern matching a _bmad workflows/{phase} path -> true', async () => {
    const file = writeTranscript([globToolUse('_bmad/bmm/workflows/4-implementation/code-review/**')]);
    expect(await detectWorkflowInvoked(file, 'code-review')).toBe('true');
  });

  it('AC8: a Windows backslash-separated _bmad path is matched too (BMAD_PATH_RE covers both \\ and /)', async () => {
    const file = writeTranscript([readToolUse('_bmad\\bmm\\workflows\\4-implementation\\create-story\\workflow.md')]);
    expect(await detectWorkflowInvoked(file, 'create-story')).toBe('true');
  });

  it('Skill tool_use with a bmad: -prefixed skill -> true regardless of path content', async () => {
    const file = writeTranscript([skillToolUse('bmad:bmm:workflows:dev-story')]);
    expect(await detectWorkflowInvoked(file, 'dev-story')).toBe('true');
  });

  it('Skill tool_use with a non-bmad: skill does NOT count', async () => {
    const file = writeTranscript([skillToolUse('saas-to-skill'), irrelevantToolUse()]);
    expect(await detectWorkflowInvoked(file, 'dev-story')).toBe('false');
  });

  it('a _bmad path for a DIFFERENT phase does not count (path must include the target phase)', async () => {
    const file = writeTranscript([readToolUse('_bmad/bmm/workflows/4-implementation/code-review/workflow.md')]);
    expect(await detectWorkflowInvoked(file, 'dev-story')).toBe('false');
  });

  it('basePhase(): dev-story-fix-R1 matches a plain dev-story workflow path (family match)', async () => {
    const file = writeTranscript([readToolUse('_bmad/bmm/workflows/4-implementation/dev-story/workflow.md')]);
    expect(await detectWorkflowInvoked(file, 'dev-story-fix-R1')).toBe('true');
  });

  it('basePhase(): dev-story-complex matches a plain dev-story workflow path (family match)', async () => {
    const file = writeTranscript([readToolUse('_bmad/bmm/workflows/4-implementation/dev-story/workflow.md')]);
    expect(await detectWorkflowInvoked(file, 'dev-story-complex')).toBe('true');
  });

  it('a non-_bmad path (e.g. src/ code Read) never counts even if it contains the phase substring', async () => {
    const file = writeTranscript([readToolUse('docs/tracking/active/dev-story-notes.md')]);
    expect(await detectWorkflowInvoked(file, 'dev-story')).toBe('false');
  });
});

describe('detectWorkflowInvoked -- BR-121 narrative-trap defense', () => {
  it('a user-role tool_result containing the literal text "Skill(skill=" is never inspected -> false, not true', async () => {
    const file = writeTranscript([
      userToolResult('Earlier I ran Skill(skill="bmad:bmm:workflows:dev-story") and it worked.'),
    ]);
    expect(await detectWorkflowInvoked(file, 'dev-story')).toBe('false');
  });

  it('a tool_use-shaped block under a non-assistant type is never inspected (isolates the top-level type==="assistant" gate from the inner tool_use gate, which BR-121\'s tool_result case above does not exercise on its own)', async () => {
    const file = writeTranscript([JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'bmad:bmm:workflows:dev-story' } }] },
    })]);
    expect(await detectWorkflowInvoked(file, 'dev-story')).toBe('false');
  });

  it('an assistant text block (not tool_use) mentioning a _bmad path is never inspected -> false', async () => {
    const file = writeTranscript([JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'I will Read _bmad/bmm/workflows/4-implementation/dev-story/workflow.md next.' }] },
    })]);
    expect(await detectWorkflowInvoked(file, 'dev-story')).toBe('false');
  });
});

describe('detectWorkflowInvoked -- no signal at all is a definitive false, not unknown', () => {
  it('a real, readable transcript with zero BMAD-relevant tool_use -> false', async () => {
    const file = writeTranscript([irrelevantToolUse(), userToolResult('hi'), irrelevantToolUse()]);
    expect(await detectWorkflowInvoked(file, 'dev-story')).toBe('false');
  });
});

describe('detectWorkflowInvoked -- malformed-line resilience (BC-06 spirit)', () => {
  it('a malformed JSON line is skipped, not fatal -- scanning continues to a later real hit', async () => {
    const file = writeTranscript([
      'not valid json {{{',
      irrelevantToolUse(),
      readToolUse('_bmad/bmm/workflows/4-implementation/dev-story/workflow.md'),
    ]);
    expect(await detectWorkflowInvoked(file, 'dev-story')).toBe('true');
  });

  it('an all-malformed transcript fails open to false (no crash, no unknown)', async () => {
    const file = writeTranscript(['{{{', 'not json either', '']);
    expect(await detectWorkflowInvoked(file, 'dev-story')).toBe('false');
  });
});

describe('detectWorkflowInvoked -- line-ending and BOM equivalence', () => {
  const lines = [irrelevantToolUse(), readToolUse('_bmad/bmm/workflows/4-implementation/dev-story/workflow.md')];

  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
    ['lone CR', '\r'],
  ])('%s line endings produce the same result as LF', async (_label, ending) => {
    const file = writeTranscript(lines, ending);
    expect(await detectWorkflowInvoked(file, 'dev-story')).toBe('true');
  });

  it('a leading UTF-8 BOM on the first line does not break parsing of that line', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whp4-wi-bom-'));
    const file = path.join(dir, 'transcript.jsonl');
    fs.writeFileSync(file, '\uFEFF' + lines.join('\n'));
    expect(await detectWorkflowInvoked(file, 'dev-story')).toBe('true');
  });
});

describe('detectWorkflowInvoked -- early exit', () => {
  it('stops scanning at the first hit -- a hit on an early line is found even with many non-matching lines after it', async () => {
    const trailing = Array.from({ length: 500 }, () => irrelevantToolUse());
    const file = writeTranscript([
      readToolUse('_bmad/bmm/workflows/4-implementation/dev-story/workflow.md'),
      ...trailing,
    ]);
    expect(await detectWorkflowInvoked(file, 'dev-story')).toBe('true');
  });
});
