// markdown-normalize.js — shared Markdown paragraph-break normalizer
//
// Extracted from upsert-story.js:59-68 (T6, td-devenv-guard-gate-false-signal-repair,
// split from td-devenv-guard-tooling-repair). Single source of truth for both write
// paths that touch Story markdown fields:
//   - upsert-story.js (.context-db/scripts/, "type":"module" ESM) — the single-point
//     enforcement for ALL Story writes (_doUpsert -> applyMarkdownNormalization).
//   - run-depth-gate.js (.claude/skills/phycool-create-story-depth-gate/scripts/,
//     project-root CommonJS-default scope, dynamically imports this file) — the two
//     direct-SQL report write points (gate report append + --accept-warn marker),
//     which previously bypassed normalization entirely.
//
// Behavior must stay byte-identical to the pre-extraction inline function (AC22) —
// this is a pure function with no side effects, safe to share across both scopes.

/**
 * DevConsole (react-markdown) renders a single `\n` as a soft break — same
 * paragraph, rendered as a space — while `\n\n` starts a new paragraph. Agents
 * writing enrichment content by intuition use single `\n` before list items /
 * headings / ordered-list markers, which then renders as everything glued
 * together on one line. This inserts the missing blank line before such markers.
 *
 * Idempotent: running this again on already-normalized text is a no-op.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeMarkdownBreaks(text) {
  if (typeof text !== 'string' || !text) return text;
  return text
    // list marker(⬜✅☑- *) / heading(#) 前確保段落空行 → react-markdown 換行
    .replace(/([^\n])\n(⬜|✅|☑|- |\* |#{1,6} )/g, '$1\n\n$2')
    // ordered list(數字.) 前確保段落空行
    .replace(/([^\n])\n(\d+\.\s)/g, '$1\n\n$2')
    // 收斂多餘空行(idempotent: 已是 \n\n 不變)
    .replace(/\n{3,}/g, '\n\n');
}
