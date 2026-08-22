# Principle Deep-Dives

Extended commentary on the 5 Charter Principles. Load this when Claude needs
to defend or apply a principle against pushback.

---

## Principle 1 — Sovereignty: defenses against common rebuttals

### Rebuttal: "But Anthropic recommends X"

**Response**: Anthropic recommends things for the general developer population.
Their recommendation is calibrated to a hypothetical median user, not to a
specific stack (PhyCool: C# / ASP.NET Core / Win 11 / Claude Code only / solo).
Their recommendation = signal worth evaluating, never signal worth adopting.

Q4 audit still applies. Run it.

### Rebuttal: "This is the latest official pattern"

**Response**: Latest != correct for our context. Verify against the 8-item context
match. AI engine match item is decisive — if their pattern assumes multi-engine
coordination (Anthropic + OpenAI + Google for example), it fails our
Single-Engine Mode and is **at minimum Quadrant D** for us regardless of merit
elsewhere.

### Rebuttal: "If I don't adopt this I'll fall behind"

**Response**: Falling behind a hypothetical baseline is not a real cost. Falling
behind requires that the alternative would actually have produced more value
*in your context*. The Phase 0 Q3 question — "what happens if we don't integrate"
— resolves this. If the answer is "nothing important", the falling-behind feeling
is impulse trigger, not pain trigger.

### Rebuttal: "Q1 = none, so we must integrate"

**Response**: Q1 = none means Quadrant C path. But Quadrant C still requires
Phase 1-2 evidence verification and Phase 3 distillation. "We don't have X"
does not imply "we should integrate X". Many gaps are correctly left as gaps.

---

## Principle 2 — Differential Benchmarking: pitfalls

### Pitfall 1: Aggregation hides Quadrant A details

When the overall comparison goes our way, it is tempting to stop. But Quadrant A
mandates extracting 1-2 *detail wins* from the external resource. These are
often the highest-leverage adoptions because the rest of their work already
proved the detail is sound in production.

### Pitfall 2: Baseline indicator switching

When projecting gains in Phase 3, Claude or the user might unconsciously switch
indicators (e.g. measured baseline by tokens, project gain by execution speed).
This is the most common protocol-violation in practice. Hooks cannot catch this;
templates must enforce indicator-level alignment in the gain table.

### Pitfall 3: "Mostly matches" rounding to "matches"

The 8-item context checklist demands binary yes/no. If you find yourself writing
"mostly yes" or "yes with caveat", that is NO. Caveats are mismatches in disguise.

---

## Principle 3 — Essence Extraction: form-vs-soul rules

### Rule of thumb for soul-vs-body classification

A part is **soul** (portable) if removing it would break the *underlying reason*
the resource exists. A part is **body** (context-bound) if removing it would
only change *how* the resource achieves that reason.

Examples:

| Resource | Soul | Body |
|---|---|---|
| LangChain agent | LLM call orchestration with memory | Python ecosystem, chain abstraction |
| GitHub Actions CI | Trigger-based automated verification | YAML syntax, runner pool |
| 50-rule rule pack | Behavioral guardrails for AI | Specific rule wording, 50-count, file-per-rule layout |

### Take-rate heuristic

If MVE take-rate < 20%, ask whether integration overhead (learning, adapting,
documenting, maintaining) is worth a 20% take. Usually not — switch to Quadrant D.

If take-rate > 80%, ask whether you are wholesale-copying. F1 violation risk.

Healthy range: 30-70% take-rate.

---

## Principle 4 — Incremental Evolution: 30% threshold reasoning

The 30% threshold is derived from:

- 15-20% lost to switching cost (learning curve, doc updates, habit re-formation)
- 10-15% lost to interaction friction with existing system
- Remaining net gain must be visible enough to justify the disruption

For solo + AI development, switching cost is somewhat lower than team contexts
(no team-wide training, no committee review). But interaction friction is
similar because the existing system is densely integrated. 30% remains the
sane floor.

**Safety exception** (v1.2.0): For CVE, GDPR, PCI-DSS, PII handling, auth
bypass mitigation, etc., the calculation is different — the "cost of NOT
integrating" includes legal/compliance/security risk that isn't captured by
the 5 baseline indicators. Decision becomes binary, not gain-based.

### Blast radius ≤ 15% reasoning

> "Each integration's modification radius ≤ 15% of total system size."

15% is empirical:
- > 15% means you cannot reason about emergent interactions
- > 15% means rollback is no longer cheap
- > 15% means you've drifted into "refactor", which requires its own design

If a single integration "needs" > 15%, decompose into N integrations each ≤ 15%.
Each one runs Phase 0-5 independently. Yes, this is more overhead. That is the
point.

---

## Principle 5 — Validation by Practice: Popper applied

### Why falsification > confirmation

A confirmation-seeking pilot will find evidence of success because that is what
it looks for. A falsification-seeking pilot will find evidence of failure or
fail to find it. The latter is informational; the former is not.

### How to design adversarial scenarios for AI-agent development

Solo + AI does not have QA team labor. Replace QA labor with:

1. **Ask Claude to generate adversarial scenarios before pilot**. Prompt:
   "What 3 scenarios would break this integration most reliably? Write them as
   given/when/then tests."
2. **Replay historical bugs**. Query `.context-db` `bug_records` for past
   bugs in the affected domain. Run the new integration against those bugs.
   If the integration would have prevented them, that is evidence. If it
   would have ignored them, that is partial. If it would have worsened them,
   strong reject signal.
3. **Force one intentional break**. Try to violate the integration's
   assumptions. Observe the failure mode. Graceful = OK. Verbose with
   misleading messages = concerning. Silent = strong reject.

### 7-day observation period rationale (AI-agent variant)

Human-pace 30 days was calibrated for: review meeting cycles, monthly billing
periods, code-review feedback loops, regression bug surfacing rate.

AI-agent pace: bugs surface within hours of integration (iteration rate is
10-100× human). 7 days captures the equivalent surfacing window. Anything
that didn't appear by D+7 is unlikely to appear in D+30 either, because the
agent has already exercised the integration thousands of times.

If your iteration rate is lower (long-running training, batch processing),
revert to 30 days.

---

## Inter-principle tensions

### P1 Sovereignty vs P3 Essence (when to integrate vs reject)

P1 says default to "do not integrate". P3 says "take the soul" — which implies
some integration is good. The tension resolves through Q4: only integrate if
the soul is not already in your latent capabilities. If the soul is already
in `.context-db` MCP tools but unused, the move is activation, not integration.

### P2 Differential vs P4 Incremental (Quadrant A guidance)

P2 says Quadrant A means "you are better, do not replace". P4 says "small steps,
fast strides". These align via the "extract 1-2 details" rule: A → do not do
big change, but always extract small details.

### P5 Validation vs P4 Timebox (when adversarial fails halfway)

P5 says find weakest scenario. P4 says timebox is firm. If adversarial scenario
fails at D+1 of a 7-day pilot, P5 says rollback NOW (kill switch), don't wait
for timebox. Timebox is a maximum, not a minimum.

---

## When the protocol seems excessive

If the evaluation cost approaches the integration cost, the protocol is
over-applied. Triage:

- Resource size < 100 LOC + Quadrant clearly D → skip Phase 1-3, record reject
  reason and exit.
- Resource size < 100 LOC + Quadrant clearly A → skip Phase 1-3, extract details
  and exit.
- Pure documentation translation → not subject to this protocol (per
  Applicable Scope in SKILL.md).
- Pure bug fix or CVE patch → not subject (handle via security workflow).

The protocol is heavy because the *failure mode* (wholesale adoption causing
context-mismatch damage) is expensive. For low-risk decisions, lighter triage
is correct.
