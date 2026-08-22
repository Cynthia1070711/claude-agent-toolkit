// ============================================================
// PhyCool Context Memory DB — workflow_invoked 3-state detector (pure function)
// [whp-4-write-path-wiring] BR-119~BR-122. Detects whether a BMAD-phase worker actually
// invoked its BMAD workflow, vs hand-rolling the task and reporting completed anyway
// (2026-07-27 audit: only 3/17 sub-window sessions did — see Story background).
//
// Extracted as a standalone pure function (DEVENV-TEXT-PROCESSOR pattern) so it can be
// unit-tested without spawning stop-report.ps1 — the CLI/Stop-hook caller lives in
// stop-report.ps1, this module has zero side effects and zero CLI entry point.
//
// Transcript schema (ground-truthed against a live Claude Code CLI transcript, 2026-07-29):
//   {"type":"assistant","message":{"role":"assistant","content":[
//     {"type":"tool_use","name":"Read","input":{"file_path":"..."}},
//     {"type":"tool_use","name":"Skill","input":{"skill":"bmad:bmm:workflows:dev-story"}}
//   ]}}
// user-role tool_result entries are NEVER scanned as free text (BR-121: re-hitting the
// narrative-pattern trap that made .claude/hooks/skill-tool-invocation-guard.js v1 miss
// every real invocation).
// ============================================================

import fs from 'fs';

const BMAD_PATH_RE = /_bmad[\\/].*workflows[\\/]/i;

/** Async generator: streams a text file line-by-line, splitting on LF / CRLF / lone-CR,
 *  stripping a leading BOM if present. Bounded buffer (never holds more than ~1 line +
 *  1 chunk in memory) so it is safe on very large transcripts (BC-06). */
async function* streamLines(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 64 * 1024 });
  let buffer = '';
  let strippedBom = false;
  const lineRe = /\r\n|\r|\n/;
  try {
    for await (const chunk of stream) {
      let text = chunk;
      if (!strippedBom) {
        strippedBom = true;
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      }
      buffer += text;
      let m;
      while ((m = lineRe.exec(buffer))) {
        yield buffer.slice(0, m.index);
        buffer = buffer.slice(m.index + m[0].length);
      }
    }
    if (buffer) yield buffer;
  } finally {
    if (!stream.destroyed) stream.destroy();
  }
}

/** Reduce a phase key like 'dev-story-fix-R1' / 'code-review-R2' / 'dev-story-complex' to its
 *  base family ('dev-story' / 'code-review') for path-fragment matching -- a Read of
 *  `_bmad/.../dev-story/workflow.md` should count as invoked for dev-story-fix-R1 too. */
function basePhase(phase) {
  return phase.replace(/-(complex|fix-R\d+|R\d+)$/i, '');
}

function pathIndicatesPhase(candidate, phase) {
  if (!candidate || typeof candidate !== 'string') return false;
  if (!BMAD_PATH_RE.test(candidate)) return false;
  return candidate.toLowerCase().includes(basePhase(phase).toLowerCase());
}

/**
 * @param {string} transcriptPath - absolute path to the session's .jsonl transcript
 * @param {string} phase - BMAD phase key (create-story / dev-story* / code-review*)
 * @returns {Promise<'true'|'false'|'unknown'>}
 */
export async function detectWorkflowInvoked(transcriptPath, phase) {
  if (!transcriptPath || !phase) return 'unknown';
  if (!fs.existsSync(transcriptPath)) return 'unknown';

  try {
    for await (const line of streamLines(transcriptPath)) {
      if (!line || !line.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue; // malformed line -- skip, not fatal (BC-06 spirit: keep scanning)
      }
      // BR-121: only assistant tool_use is a signal. user.message.content[].tool_result
      // (which may echo file contents / prior narrative containing "Skill(skill=...)"
      // as plain text) is never inspected.
      if (obj.type !== 'assistant') continue;
      const content = obj.message && Array.isArray(obj.message.content) ? obj.message.content : [];
      for (const c of content) {
        if (!c || c.type !== 'tool_use') continue;
        if ((c.name === 'Read' || c.name === 'Glob') && c.input) {
          if (pathIndicatesPhase(c.input.file_path, phase) || pathIndicatesPhase(c.input.pattern, phase)) {
            return 'true';
          }
        }
        if (c.name === 'Skill' && c.input && typeof c.input.skill === 'string' && c.input.skill.startsWith('bmad:')) {
          return 'true';
        }
      }
    }
    return 'false';
  } catch {
    return 'unknown'; // fail-open (BR-122): parse/stream failure is never reported as 'false'
  }
}
