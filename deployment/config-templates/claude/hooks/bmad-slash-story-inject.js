#!/usr/bin/env node
/**
 * bmad-slash-story-inject (BR-001~008, bwu-5-manual-window-inject-hook)
 *
 * Event:  UserPromptSubmit
 * Action: When the prompt is a bmad create-story/dev-story/code-review slash
 *         invocation, resolve the target story via DB-existence scan (not a
 *         hardcoded prefix whitelist -- new track prefixes need zero
 *         maintenance here) and inject that story's pipeline_notes (execution
 *         carrier + cross-window coordination contract) plus a background
 *         SSoT summary as additionalContext.
 *
 * Why: sub-window workers already receive pipeline_notes via
 * shared-utils.ps1 Build-StoryPromptContext; the manual/main window is the
 * one remaining zero-injection surface, relying entirely on the human
 * retyping context at the start of every phase invocation.
 *
 * env guard: PHYCOOL_ORCHESTRATOR_MODE=1 marks a pipeline worker session --
 * exit before opening the DB, since that context is already injected there
 * and re-injecting here would be redundant token spend.
 *
 * Never blocks (advisory only, no `decision` field). fail-open on any
 * error: bad stdin JSON, missing DB, or a failed query all fall through to
 * a silent exit 0.
 *
 * INJECT_CHAR_CAP is set above BR-008's suggested 2000: at 2000, this
 * story's own pipeline_notes (grows with every phase-start/phase-complete
 * marker append) plus a background slice deep enough to reach its SSoT
 * paragraph (measured offset 535) cannot both fit -- 2600 keeps normal-size
 * pipeline_notes whole. Once a card outgrows the budget the MIDDLE is elided,
 * never the head -- see truncatePipelineNotes for why.
 */
'use strict';

const lib = require('./_lib');

const TRIGGER_PHASES = ['create-story', 'dev-story', 'code-review'];
const INJECT_CHAR_CAP = 2600;
const BACKGROUND_SUMMARY_CHARS = 700;
const CANDIDATE_TOKEN_RE = /[A-Za-z][A-Za-z0-9_]*(?:-[A-Za-z0-9_]+)+/g;
const MAX_CANDIDATES = 40;
const PN_ELISION = '\n…(中段省略)…\n';
const PN_HEAD_RATIO = 0.4;

function extractPhaseAndTail(prompt) {
  const trimmed = prompt.replace(/^\s+/, '');
  const m = trimmed.match(/^\/bmad:bmm:workflows:(\S+)([\s\S]*)$/);
  if (!m) return null;
  const phase = m[1];
  if (!TRIGGER_PHASES.includes(phase)) return null;
  return { phase, tail: m[2] };
}

function findStoryId(db, tail) {
  const candidates = tail.match(CANDIDATE_TOKEN_RE) || [];
  const stmt = db.prepare('SELECT 1 FROM stories WHERE story_id = ?');
  const limit = Math.min(candidates.length, MAX_CANDIDATES);
  for (let i = 0; i < limit; i++) {
    if (stmt.get(candidates[i])) return candidates[i];
  }
  return null;
}

function buildWarning(story, phase) {
  if (story.status !== 'done' && story.status !== 'review') return '';
  // A "review"-status story receiving a code-review invocation is the
  // correct next pipeline step, not a misdispatch -- don't warn there.
  if (story.status === 'review' && phase === 'code-review') return '';
  return (
    `此卡目前狀態為已 ${story.status};若重跑完整 create-story,` +
    `step-07 payload 會把狀態打回 ready-for-dev,違反 story-lifecycle-invariants.md I4 並污染排程。` +
    `若意在補全,應走 create-story step-00 的驗證/補全模式,只 --merge 目標欄位。\n\n`
  );
}

/**
 * pipeline_notes is append-only. The execution-carrier contract lives at the HEAD
 * (執行載體 / 禁 dispatch / baseline_commit / HARD_BLOCK 檔 / 並行通告) while the newest
 * 中控 directive lands at the TAIL. Tail-only truncation therefore drops precisely the
 * safety-critical head this hook exists to deliver (07 章 G-3), and it starts doing so
 * as soon as a card accrues a few phase markers -- measured 2026-07-29: 132 of 352
 * cards with pipeline_notes already exceed a typical budget. Keep both ends, elide the
 * middle.
 */
function truncatePipelineNotes(notes, budget) {
  if (notes.length <= budget) return notes;
  if (budget <= PN_ELISION.length) return notes.slice(notes.length - budget);
  const room = budget - PN_ELISION.length;
  const headLen = Math.floor(room * PN_HEAD_RATIO);
  return notes.slice(0, headLen) + PN_ELISION + notes.slice(notes.length - (room - headLen));
}

function buildAdditionalContext(story, phase) {
  const warning = buildWarning(story, phase);
  const header =
    `[Story] ${story.story_id} | status=${story.status} | complexity=${story.complexity} | epic=${story.epic_id}\n` +
    `${story.title}\n\n`;

  const bgLabel = '[背景摘要 / SSoT 指引段]\n';
  const background = story.background || '';
  const bgSlice = background.slice(0, BACKGROUND_SUMMARY_CHARS);
  const bgBlock = bgSlice ? `${bgLabel}${bgSlice}\n\n` : '';

  const pnLabel = '[pipeline_notes / 執行載體與跨視窗協調契約]\n';
  const pipelineNotes = story.pipeline_notes || '';
  // +1 accounts for pnBlock's trailing newline, so the final slice never has to cut.
  const fixedLen = warning.length + header.length + bgBlock.length + pnLabel.length + 1;
  const pnBudget = Math.max(0, INJECT_CHAR_CAP - fixedLen);
  const pnText = truncatePipelineNotes(pipelineNotes, pnBudget);
  const pnBlock = pipelineNotes ? `${pnLabel}${pnText}\n` : '';

  return (warning + header + pnBlock + bgBlock).slice(0, INJECT_CHAR_CAP);
}

(function main() {
  try {
    if (process.env.PHYCOOL_ORCHESTRATOR_MODE === '1') {
      process.exit(0);
    }

    const input = lib.readHookInput();
    const prompt = input?.prompt_text ?? input?.prompt ?? input?.user_prompt ?? '';
    if (!prompt || typeof prompt !== 'string') {
      process.exit(0);
    }

    const parsed = extractPhaseAndTail(prompt);
    if (!parsed) {
      process.exit(0);
    }

    const db = lib.openContextDb();
    if (!db) {
      process.exit(0);
    }

    try {
      const storyId = findStoryId(db, parsed.tail);
      if (!storyId) {
        process.exit(0);
      }

      // Verified PRAGMA 2026-07-28: stories PK = story_id (TEXT), 47 cols, no `id` column
      const story = db
        .prepare(
          'SELECT story_id, status, complexity, epic_id, title, pipeline_notes, background FROM stories WHERE story_id = ?'
        )
        .get(storyId);
      if (!story) {
        process.exit(0);
      }

      const text = buildAdditionalContext(story, parsed.phase);
      if (!text) {
        process.exit(0);
      }

      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text },
        })
      );
      process.exit(0);
    } finally {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    try {
      process.stderr.write(`[bmad-slash-story-inject] error: ${err.message}\n`);
    } catch {
      /* ignore */
    }
    process.exit(0);
  }
})();
