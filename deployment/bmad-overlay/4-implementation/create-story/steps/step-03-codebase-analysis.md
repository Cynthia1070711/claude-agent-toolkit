---
name: 'step-03-codebase-analysis'
description: 'Codebase reality check: stale data detection, source file verification, compare story tasks vs code'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/create-story'
thisStepFile: '{workflow_path}/steps/step-03-codebase-analysis.md'
nextStepFile: '{workflow_path}/steps/step-04-architecture-analysis.md'
---

# Step 3: Codebase Analysis

**Goal:** Verify story tasks against actual implementation to prevent duplicate work, missed abstractions, wrong file locations, and regressions.

---

## AVAILABLE STATE

- `{story_key}`, `{epic_num}`, `{story_num}` — from Step 1

---

## STATE VARIABLES (set in this step)

- `{codebase_analysis}` — 程式碼現況分析結果
- `{codebase_snippets}` — 背景章節用程式碼片段 (file:line + actual code)

---

## EXECUTION SEQUENCE

> **CRITICAL:** 🔍 CODEBASE REALITY CHECK — Verify story tasks against actual implementation!
>
> **MANDATE:** 🚫 GATE: DO NOT proceed to Step 4 until EVERY source file mentioned in the story has been READ and verified. Reports, error logs, and snapshot files are HISTORICAL DATA — the codebase is the SINGLE SOURCE OF TRUTH.

### 1. Stale Data Detection (Mandatory)

Before trusting ANY data file (error logs, tsc-errors.txt, lint reports, test results):
1. Check file modification date — if older than latest git commits, it is STALE
2. If stale → Note "⚠️ 快照過期" and verify each claim against actual source code
3. NEVER copy line numbers from reports without opening the source file to confirm
4. If story references specific line numbers → you MUST Read those lines and verify

### 2. Identify Target Code Areas

From story requirements, extract keywords for code search:
- Component names, service names, hook names mentioned
- Feature areas (e.g., "payment", "authentication", "editor")
- Data models and entity names
- API endpoint patterns

### 3. Scan Existing Implementation

Use Glob/Grep to find relevant existing files:
- Frontend: `src/components/**`, `src/hooks/**`, `src/services/**`, `src/stores/**`
- Backend: `Controllers/**`, `Services/**`, `Models/**`
- Database: `Migrations/**`, `Data/**`

### 4. Mandatory Source File Verification

**MANDATE:** For EVERY file mentioned in story requirements or error reports:
1. Read the actual source file at the referenced line numbers
2. Confirm the error/issue described actually exists at that location
3. If line number is wrong → find the correct line and update
4. If error no longer exists → mark as "已修復" and update story
5. Use parallel reads for efficiency when verifying multiple files

Read and analyze found files to understand:
- Current implementation state
- Existing patterns and abstractions
- Code conventions in use
- Related functionality already built

### 5. Compare Story Tasks vs Codebase

For each task/subtask in the story, verify against codebase:
- Does the target file already exist? → Note "修改" vs "新增"
- Is there partial implementation? → Note completion percentage
- Are there existing utilities/hooks to reuse? → List them
- Are there conflicting implementations? → Flag for resolution

### 6. Store Codebase Findings

Create `{codebase_analysis}` with:
- `existing_files`: List of relevant files found with their purposes
- `reusable_abstractions`: Existing hooks, services, utilities to leverage
- `partial_implementations`: Tasks that have some code already
- `conflicts`: Any code that may conflict with story requirements
- `recommended_approach`: Based on actual code state
- `stale_data_corrections`: Any report data that was outdated and corrected

**If significant existing implementation found:**
- Update story tasks to reflect reality:
  - Mark partially done tasks with "已有部分實作: [file path]"
  - Add notes about existing code to reuse
  - Adjust complexity if work is less than expected

### 6.5. Extract Background Code Snippets (Mandatory)

> **MANDATE:** Background section MUST contain real code evidence from codebase analysis.
> Shallow descriptions like "目前已有部分實作" without code proof are FORBIDDEN.

From `{codebase_analysis}`, extract the **most relevant code snippets** that establish
the current state for this story. Store as `{codebase_snippets}`.

**Selection criteria** (pick 2-5 snippets):
1. The exact code that needs modification (the "before" state)
2. Existing patterns the developer must follow (reuse targets)
3. Integration points where this story connects to existing code

**Format per snippet:**
```
**`FileName.ext:L123-145`** — {one-line purpose}
```language
// actual code from the file (5-15 lines max)
```
```

**CRITICAL:** Each snippet MUST include:
- Full relative path from project root (e.g., `src/services/OrderService.cs`)
- Exact line numbers verified by Read (e.g., `:L168-184`)
- Actual code copied from the file (not paraphrased)

**If no relevant existing code (greenfield):** Set `{codebase_snippets}` to
"此為全新功能。" followed by the closest related pattern reference found in the project
(e.g., "Pattern reference: `ExistingScript.js:L1-30` — similar ESM structure to follow").

---

### 7. Verification Summary (Mandatory Output)

Before proceeding to Step 4, output:
- Total source files checked: N
- Confirmed issues: N (line numbers verified)
- Stale/incorrect data corrected: N (list each correction)
- Files not found or inaccessible: N

This summary MUST appear in the story's "程式碼現況分析" section.

---

## SUCCESS METRICS

- `{codebase_analysis}` populated with actual code findings
- `{codebase_snippets}` populated with 2-5 code snippets (file:line + actual code)
- All referenced files Read and verified
- Stale data identified and corrected
- Story tasks compared against actual codebase
- Verification summary produced

## FAILURE MODES

- Skipping source file reading (relying on reports alone)
- Not detecting stale snapshot data
- Missing partial implementations in codebase
- Not updating story tasks to reflect code reality

---

**NEXT:** Load `step-04-architecture-analysis.md`
