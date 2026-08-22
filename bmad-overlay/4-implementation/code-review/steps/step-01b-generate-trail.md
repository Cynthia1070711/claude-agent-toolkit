---
name: 'step-01b-generate-trail'
description: 'Generate structured Review Trail from diff; identifies 2-5 functional concerns with path:line stops ordered by blast-radius'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/code-review'
thisStepFile: '{workflow_path}/steps/step-01b-generate-trail.md'
nextStepFile: '{workflow_path}/steps/step-02-review-plan.md'
---

# Step 1b: Generate Review Trail

**Goal:** Build a structured Review Trail from the diff — 2–5 functional concerns, each with 1–4 `path:line` stops ordered by blast-radius. Sets `{review_trail}` for downstream steps.

---

## AVAILABLE STATE

- `{diff_output}` — unified diff text (from Step 1)
- `{story_key}` — Story 識別碼

---

## STATE VARIABLES (set in this step)

- `{review_trail}` — Review Trail 結構化停靠點（empty string if unavailable）

---

## EXECUTION SEQUENCE

> **CRITICAL:** This step is an optional enhancement — if `{diff_output}` is empty or git is unavailable, set `{review_trail}` = "" and proceed immediately to Step 2 without blocking.

---

### 1. Prerequisite Check

**If `{diff_output}` is empty:**
- Set `{review_trail}` = ""
- Output: `Review Trail: N/A — no diff available`
- **SKIP steps 2–7, proceed to Step 2**

**If git is unavailable (diff retrieval failed in Step 1):**
- Set `{review_trail}` = ""
- Output: `Review Trail: N/A — git unavailable`
- **SKIP steps 2–7, proceed to Step 2**

---

### 2. Read Changed Files

Using `{diff_output}`:

1. Extract list of changed file paths from diff header lines (`+++ b/...`)
2. Read changed files **in full** — surrounding code reveals intent that hunks alone miss
3. **Size constraint**: If total file content exceeds ~50k tokens:
   - Read only the files with the **largest diff hunks** in full
   - Use hunk-only context for remaining files
4. Note the changed file paths — these become stop candidates

---

### 3. Load Spec Intent (if available)

**If SDD Spec exists** (M/L/XL complexity story with spec path in Dev Notes):
- Read the spec's `Intent` section
- Use Intent to anchor concern identification in Step 4
- `{spec_intent_available}` = true

**If no SDD Spec (S-complexity or no-spec story — fallback mode):**
- Derive concerns purely from diff structure and file-level groupings
- `{spec_intent_available}` = false

> **Fallback guarantee (AC-3):** Trail generation proceeds even without spec — diff alone is sufficient.

---

### 4. Identify 2–5 Concerns

Analyze the diff (+ spec intent if available) to identify **2–5 concerns**:

**Concern definition rules:**
- A concern = a cohesive design intent that explains *why* behind a cluster of changes
- Prefer **functional groupings** and **architectural boundaries** over file-level splits
- A single-concern change is fine — **do NOT invent groupings to reach minimum count**
- Maximum 5 concerns — if more natural groupings exist, merge the weakest into adjacent ones

**Without spec (fallback derivation):**
- Group changes by functional role: entry-point files, business logic, data access, tests/config
- Name each concern based on observable functional behavior of the cluster (not file names)

**Output:** Internal list of `{concern_name}` → `[{file:line, framing}...]` mappings

---

### 5. Select path:line Stops per Concern

For each concern, select **1–4 `path:line` stops**:

**Stop selection priority (blast-radius order):**

| Priority | Stop Type | Examples |
|----------|-----------|---------|
| 1 | **Entry points** | Controller actions, API endpoints, event handlers, exported functions |
| 2 | **Decision points** | Branching logic, policy enforcement, validation rules, guards |
| 3 | **Boundary crossings** | Service calls, DB access, external integrations, queue publish |
| 4 | **Peripherals** | Tests, config, type definitions (always last) |

**Rules:**
- Lead with the **entry point** (highest-leverage stop — what a reviewer should see first)
- Order stops so each builds on the previous one
- End with peripherals (tests, config, types)
- `path:line` must point to the **most informative line** for that stop (not always line 1)

---

### 6. Format Review Trail

**If single concern (only 1 concern identified):**

```
- {one-line framing, ≤15 words}
  `path/to/file.ext:42`
- {one-line framing, ≤15 words}
  `path/to/other.ext:88`
```

(Omit bold concern label — list stops directly per AC-2)

**If multiple concerns (2–5 concerns):**

```
**{Concern name}**

- {one-line framing, ≤15 words}
  `path/to/file.ext:42`
- {one-line framing, ≤15 words}
  `path/to/service.ext:15`

**{Concern name 2}**

- {one-line framing, ≤15 words}
  `path/to/model.ext:7`
```

---

### 7. Set State Variable

Set `{review_trail}` = the formatted trail string produced in Step 6.

Output:
```
✅ Review Trail 已生成：{N} 個 concerns，{M} 個 stops（按 blast-radius 排序）
```

Where N = number of concerns, M = total stops across all concerns.

---

## SUCCESS METRICS

- `{review_trail}` set (non-empty formatted string, OR empty/N/A string on unavailable)
- Trail contains 2–5 concerns (unless genuinely single-concern change)
- Each concern has 1–4 `path:line` stops
- Stops ordered by blast-radius (entry points first, peripherals last)
- Step does NOT block workflow when diff is empty or git unavailable (AC-3)

## FAILURE MODES

- Setting `{review_trail}` to `undefined` or `null` — must always be a string
- Blocking Step 2 when git is unavailable
- Inventing extra concerns to artificially reach count minimum
- Stop line numbers not corresponding to meaningful code locations
- Stops not ordered by blast-radius (peripherals listed before entry points)

---

**NEXT:** Load `step-02-review-plan.md`
