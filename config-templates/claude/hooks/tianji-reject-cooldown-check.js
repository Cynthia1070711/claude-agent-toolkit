#!/usr/bin/env node
/**
 * tianji-reject-cooldown-check (F6)
 *
 * Forbidden Pattern F6: "Re-attempt a REJECTed resource during cooldown."
 *
 * Event:    UserPromptSubmit
 * Action:   Scan user prompt for substrings matching external_id of any
 *           resource currently in REJECT cooldown. If matched, inject
 *           additionalContext with the original reject_reason and
 *           cooldown_until date so Claude can challenge the request.
 *
 * Why: AI-agent variant cooldown = 15 days (vs original 90d human). Without
 * this hook, a user mid-flow could re-suggest a rejected resource and Claude
 * (with no memory of the prior rejection) would happily comply. F6 makes
 * the prior decision visible at exactly the moment it matters.
 *
 * Never blocks. Substring matching is fuzzy; false positives are tolerable
 * because the worst case is an informational nudge.
 */

'use strict';

const lib = require('./_lib');

(function main() {
  const input = lib.readHookInput();
  const prompt = input?.prompt || input?.user_prompt || '';

  if (!prompt || typeof prompt !== 'string') {
    process.exit(0);
  }

  const db = lib.openContextDb();
  if (!db) {
    process.exit(0);
  }

  try {
    const rejected = db
      .prepare(
        `SELECT bs.external_id,
                bs.resource_type,
                bs.source_url,
                ee.reject_reason,
                ee.cooldown_until,
                ee.re_eval_trigger_condition
           FROM external_evaluations ee
           JOIN baseline_snapshots bs ON bs.id = ee.baseline_id
          WHERE ee.decision = 'REJECT'
            AND ee.cooldown_until IS NOT NULL
            AND ee.cooldown_until > date('now', '+8 hours')`
      )
      .all();

    if (rejected.length === 0) {
      process.exit(0);
    }

    const lowerPrompt = prompt.toLowerCase();
    const matches = [];
    for (const r of rejected) {
      const eid = (r.external_id || '').toLowerCase();
      if (!eid) continue;
      // Match either the external_id itself, or a hostname token from source_url.
      if (lowerPrompt.includes(eid)) {
        matches.push(r);
        continue;
      }
      if (r.source_url) {
        try {
          const host = new URL(r.source_url).hostname.toLowerCase();
          // Skip overly-generic hosts.
          if (
            host &&
            host.length > 6 &&
            !/^(github\.com|gitlab\.com|npmjs\.com)$/.test(host) &&
            lowerPrompt.includes(host)
          ) {
            matches.push(r);
          }
        } catch { /* invalid URL — ignore */ }
      }
    }

    if (matches.length === 0) {
      process.exit(0);
    }

    let msg = `[tianji] F6 cooldown warning — user prompt references ${matches.length} REJECTed resource(s):\n\n`;
    for (const m of matches) {
      msg += `  • ${m.external_id} (${m.resource_type || 'unknown type'})\n`;
      msg += `    Rejected reason: ${m.reject_reason || '(none recorded)'}\n`;
      msg += `    Cooldown until: ${m.cooldown_until}\n`;
      if (m.re_eval_trigger_condition) {
        msg += `    Re-eval allowed only if: ${m.re_eval_trigger_condition}\n`;
      }
      msg += '\n';
    }
    msg +=
      `Claude: surface this to the user before proceeding. Re-attempting a ` +
      `rejected resource during cooldown without meeting the re-eval ` +
      `condition is F6 violation. If the user has new evidence that meets ` +
      `the re-eval trigger, mark cooldown_until = today and proceed.`;

    lib.emitAdditionalContext(msg, 'UserPromptSubmit');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[tianji] reject-cooldown-check error: ${err.message}\n`);
    process.exit(0);
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
})();
