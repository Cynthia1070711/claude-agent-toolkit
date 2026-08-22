---
name: 'step-03a-blind-hunter'
description: 'Blind Hunter: pure code quality review using diff only, no spec/AC/context'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/code-review'
thisStepFile: '{workflow_path}/steps/step-03a-blind-hunter.md'
nextStepFile: null
---

# Step 3a: Blind Hunter

**Goal:** 純程式碼品質盲測——僅看 diff，消除確認偏見，找出純粹的程式碼問題。

---

## CRITICAL ISOLATION RULE (BR-01)

> **FORBIDDEN:** This layer MUST NOT receive or reference:
> - Story spec, SDD Spec, or any spec document
> - Acceptance Criteria or user story text
> - Project context docs or architecture documents
> - Story description, background, or business rules
>
> **ONLY INPUT:** `{diff_output}` — raw git diff text.
>
> If any forbidden context is detected, STOP and return empty findings with error note.

---

## INPUT

```
{diff_output}  ← raw git diff / code changes only
```

---

## EXECUTION SEQUENCE

### 1. Parse Diff

Extract from `{diff_output}`:
- Changed files list
- Added lines (`+`) and removed lines (`-`)
- Function/method boundaries affected
- Variable and type names introduced

### 2. Code Quality Analysis (Primary Focus)

Analyze ONLY the changed code for:

#### 🔒 Security (Primary)
- SQL string concatenation (not parameterized)
- Hardcoded secrets, tokens, passwords
- Direct user input used in sensitive operations
- Missing input validation / sanitization
- Dangerous deserialization patterns
- Missing authorization checks on new endpoints

#### 📊 Observability (Secondary)
- Missing error logging in catch blocks
- Swallowed exceptions (empty catch)
- New operations without ILogger calls
- Missing structured logging fields

#### ⚠️ ErrorHandling (Secondary)
- Null dereferences without null checks
- Missing try/catch around external calls
- No fallback for network/IO operations
- Return value of operations ignored

#### 🧪 TestCoverage (Secondary)
- New public methods without corresponding test additions
- Test files with no real assertions (`Assert.True(true)`, empty bodies)
- Missing boundary condition tests (null, empty, max)

### 3. Structural Issues

- Dead code (unreachable branches, unused variables)
- Magic numbers / hardcoded values that should be constants
- Code duplication in changed lines
- Overly complex conditions (nesting > 4 levels)
- Method length violations (> 50 lines in diff)

### 4. Format Output

Return findings as Markdown list:

```markdown
- **[SEVERITY][DIMENSION]** {title}
  - Detail: {specific description of the problem}
  - Location: {file}:{line}
  - Severity: CRITICAL | HIGH | MEDIUM | LOW
```

Example:
```markdown
- **[HIGH][Security]** SQL query built with string concatenation
  - Detail: Line 42 concatenates user input directly into SQL string, enabling injection
  - Location: Services/UserService.cs:42
  - Severity: HIGH
```

---

## OUTPUT FORMAT

Produce `{blind_findings}` as a Markdown list of findings.
Each finding MUST include: title, detail, location (file:line), severity.
If no issues found: return `{blind_findings}` = [].

---

## SUCCESS METRICS

- Zero spec/AC/context references in analysis
- Each finding has file:line evidence from diff
- Severity correctly assigned per SaaS policy
- Output is Markdown list format

## FAILURE MODES

- Using story description or spec to inform findings
- Findings without file:line evidence
- Missing severity classification
- Returning narrative text instead of structured list

---

**RETURNS:** `{blind_findings}` (Markdown list) to Step 3 orchestrator
