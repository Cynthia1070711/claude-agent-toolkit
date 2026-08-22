# Anti-Patterns — Phrases that Trigger Sovereignty Challenge

Library of phrases the user might say that signal protocol-violation risk.
Each anti-pattern includes the relevant forbidden-code (F-number) and a
rebuttal template Claude should produce before proceeding.

---

## Category 1: Authority worship (F4)

### AP-1: "Anthropic recommends X"

**Rebuttal**: "Anthropic recommends X for the general developer audience. For
PhyCool (C# / ASP.NET Core / Win 11 / Claude-Code-only / solo + AI agents),
their recommendation is *signal worth evaluating*, never *signal worth adopting*.
Before we discuss X further, let's run the Phase 0 Sovereignty Four Questions
and especially Q4 latent capability audit. Do you want me to start that now?"

### AP-2: "Karpathy / [big name] posted about this"

**Rebuttal**: "Per Principle 1.3 (Authority Isolation), notable contributors do
not lower verification standards. Their endorsement counts as Low credibility
evidence (their own context, not ours). Phase 0 Q4 audit still applies. Should
we proceed with Phase 0?"

### AP-3: "Official docs say to use this"

**Rebuttal**: "Official docs reflect the framework's intended path, which
assumes a specific context (multi-team, multi-engine, etc.). PhyCool's context
differs. We treat official guidance as evidence Grade Low (their context) until
we confirm via Phase 1-2 benchmark that it fits ours."

---

## Category 2: Popularity-as-evidence (F9)

### AP-4: "Everyone is using this"

**Rebuttal**: "Per Principle 5.2 evidence grading, 'everyone uses it' is Zero
credibility. Other people's choice does not constitute evidence for our
context. Can you cite a third-party benchmark, reproducible empirical data, or
multi-user community feedback specific to our stack?"

### AP-5: "It's trending on GitHub" / "Has N stars"

**Rebuttal**: "Star count is Zero credibility evidence. Popularity correlates
with discoverability and marketing, not with fit-to-our-context. What concrete
pain point of ours does this address? (Phase 0 Q2)"

### AP-6: "It's the new standard"

**Rebuttal**: "There is no consensus 'standard' in AI agent tooling as of
2026 Q2 — the ecosystem is still pre-paradigm. Claims of 'new standard'
are marketing. Let's evaluate via Phase 0-5 like any other candidate."

---

## Category 3: Impulse triggers (F1, F2)

### AP-7: "Let's just try it real quick" / "我們直接試試看"

**Rebuttal**: "Per F2, no pilot without Phase 0 baseline. Per F3, no concurrent
pilots. Before we 'just try it', let's quickly establish: (Q1) what is our
current corresponding module? (Q2) what specific pain? (Q3) what if we don't
integrate? (Q4) latent capability audit. This takes 30-60 minutes and is the
cheapest insurance against context-mismatch damage."

### AP-8: "It would be cool to have"

**Rebuttal**: "'Cool to have' is impulse trigger per Principle 1.1. Mandatory
3-day cold-storage before re-evaluation. If after 3 days you can articulate
a specific Q2 pain answer, we'll start Phase 0. Otherwise the impulse
self-extinguishes, which is the intended outcome."

### AP-9: "I'm worried we're missing out"

**Rebuttal**: "FOMO is the canonical impulse trigger. Phase 0 Q3 — 'what
happens if we don't integrate?' — is the corrective. If the answer is 'we
miss out on a hypothetical advantage', that is not pain, that is anxiety.
The 3-day cold-storage rule applies."

---

## Category 4: Process shortcuts (F2, F5, F7, F10)

### AP-10: "We don't need baseline, I have a feel for it"

**Rebuttal**: "Per F2, skipping baseline is a forbidden pattern because
all subsequent comparison becomes subjective. Even a rough baseline (5
indicators × 5 reference tasks = 30 minutes) is sufficient. Hook
`baseline-snapshot-gate.js` will block worktree creation without a
baseline_snapshots row."

### AP-11: "Let's leave this in pilot for now"

**Rebuttal**: "Per F5, permanent pilot is forbidden. At timebox end (3/7/14
days for small/medium/large), binary decision required: integrate or
rollback. 'Keeping it in pilot' is technical debt accumulation. If you
need more evaluation, extend the timebox formally (which triggers a new
distillation-record entry justifying the extension)."

### AP-12: "We can skip the ADR this time, it's obvious"

**Rebuttal**: "Per F10, skipping ADR is forbidden because (a) rejection
is learning capital — future you will face similar evaluations and need
this history; (b) ADR is the only mechanism that prevents re-evaluating
the same item within cooldown period. Even REJECT decisions get an ADR."

### AP-13: "We'll update SSoT later"

**Rebuttal**: "Per F7, post-integration SSoT update is non-optional. 'Later'
means 'next time we touch it', which means rules drift from reality. Hook
`ssot-sync-checker.js` will flag the merge commit if RELEASE-NOTES /
.claude/rules / .claude/skills / .claude/hooks are not updated in the
same commit."

---

## Category 5: Concurrent / overlapping work (F3, F8)

### AP-14: "Let's pilot X and Y at the same time"

**Rebuttal**: "Per F3, concurrent pilots are forbidden because we cannot
attribute outcomes correctly. If X and Y both run and we see a 25% token
reduction, was it X, Y, or both? Run X first to completion, then Y.
Hook `concurrent-pilot-guard.js` will block the second worktree."

### AP-15: "While we're in there, let's also fix Z"

**Rebuttal**: "Per F8, scope creep during pilot is forbidden. 'While we're
in there' is the seed phrase of failed pilots — it makes outcome
attribution impossible. Z gets its own ADR if it's worth doing.
Hook `scope-creep-detector.js` will alert on files outside the spec-lite
scope boundary."

---

## Category 6: Cooldown bypass (F6)

### AP-16: "I know we rejected this last week, but..."

**Rebuttal**: "REJECT cooldown is 15 days (AI-agent variant). Re-evaluation
before cooldown end requires new evidence that wasn't available at REJECT
time. What new evidence has emerged? If you cannot cite specific new evidence,
the cooldown applies. Hook `reject-cooldown-check.js` will flag this in
your prompt context."

### AP-17: "But the new version of it is different"

**Rebuttal**: "If the new version is materially different, that constitutes
new evidence and the cooldown does not apply. Cite the specific diff vs
the version we rejected. If the diff is cosmetic (docs / minor refactor),
cooldown still applies."

---

## Category 7: Wholesale adoption pressure (F1)

### AP-18: "Let's just adopt their whole framework"

**Rebuttal**: "Per F1, wholesale adoption is forbidden because frameworks
embed their authors' context. Decompose into MVE (Principle 3.3). Even
the most well-designed framework typically has only 30-70% applicable
elements to a different context. The other 30-70% would actively harm
our system."

### AP-19: "Their setup is much better than ours, let's just copy"

**Rebuttal**: "'Better than ours' must be quantified against our baseline,
not their marketing. Run Phase 1-2 benchmark. Even if they win on aggregate,
copy = wholesale adoption = F1 violation. Distillation (Phase 3) extracts
the soul; we rebuild the body in our environment."

---

## Category 8: Validation skipping (F2, F5)

### AP-20: "I'll test it as I go"

**Rebuttal**: "Per Principle 5.1 (Validation by Practice), adversarial
scenarios must be designed *before* pilot starts, not 'as you go'. 'As I
go' means confirmation-seeking, which finds success because that's what
it looks for. Design 3 counterexamples now, before opening the worktree."

### AP-21: "It worked on their demo"

**Rebuttal**: "Demo working is Grade Low evidence (their marketing). Per
Principle 5.1, our pilot is to find the *weakest scenario*, not replicate
their best scenario. Design adversarial: (1) weakest, (2) edge case,
(3) intentional break with expected graceful failure."

---

## Category 9: Q4 latent capability bypass (F11)

### AP-22: "Just run Phase 1-2, skip Q4"

**Rebuttal**: "Per F11, Q4 skip is the highest-cost forbidden pattern
(Builder's Paradox / Latent Capability Trap). Run
`node 1.專案部屬必讀/scripts/audit-capability-reachability.cjs --json`
right now. It takes < 30 seconds and surfaces capabilities we already
built that aren't being invoked. The 2026-05-02 graphify-6 case saved
~530 LOC by catching this."

### AP-23: "Our existing thing doesn't really do this"

**Rebuttal**: "Q4 verdict requires both audit_score AND feature_match_pct.
The audit script outputs audit_score. You provide feature_match_pct from
human inspection. If audit_score ≥ 0.70 (we built it and reference it
somewhere) but feature_match_pct < 70 (it doesn't quite fit the new pain),
the verdict is 'partial coverage' — consider integration of the
incremental piece only, not wholesale."

---

## How Claude should apply these

When the user's message contains any of these anti-pattern phrases (or
close variants), Claude should:

1. **Pause** before agreeing or proceeding with the request.
2. **Quote** the relevant rebuttal template (paraphrased, conversational).
3. **Offer** the corresponding Phase 0-5 action as the constructive next step.
4. **NOT lecture**. The rebuttal is short. The action offer is the substance.

Example interaction:

> User: "I saw graphify-6 on GitHub, looks really good, let's adopt it."
>
> Claude: "Before adopting, let me run our latent capability audit — we
> may already have 70% of this in `.context-db`. One command:
> `node 1.專案部屬必讀/scripts/audit-capability-reachability.cjs --json`.
> Should I run it and produce a baseline-record.md from the output?"

Not:

> Claude: "Per F11 of the Tianji-Pavilion Forbidden Patterns, your request
> violates the Q4 latent capability audit requirement, which states..."
