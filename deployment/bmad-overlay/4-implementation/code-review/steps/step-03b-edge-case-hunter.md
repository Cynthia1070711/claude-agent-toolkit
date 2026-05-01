---
name: 'step-03b-edge-case-hunter'
description: 'Edge Case Hunter: boundary conditions, concurrency, resource management using diff + project read access'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/code-review'
thisStepFile: '{workflow_path}/steps/step-03b-edge-case-hunter.md'
nextStepFile: null
---

# Step 3b: Edge Case Hunter

**Goal:** 窮舉邊界條件、併發問題、資源管理問題——利用 diff + 專案讀取權限追蹤上下游依賴。

---

## ISOLATION RULE (BR-02)

> **ALLOWED:** `{diff_output}` + project Read access (changed files + upstream/downstream deps + types + tests)
> **FORBIDDEN:** spec documents, Acceptance Criteria, story description, business context

---

## INPUT

```
{diff_output}  ← git diff
+ Project Read Access (Read tool) for changed files and their dependencies
```

---

## EXECUTION SEQUENCE

### 1. Parse Diff & Identify Changed Files

Extract changed file paths from `{diff_output}`.
For EACH changed file:
1. **READ** complete file via Read tool
2. Identify upstream callers (Grep for usages)
3. Identify downstream dependencies (imports/injections used)
4. Identify related test files

### 2. Edge Case Analysis (Primary Focus)

#### 📈 Scalability (Primary)
- N+1 query patterns (loop + DB call without eager loading)
- Missing pagination on collection endpoints (no Take/Skip)
- Synchronous blocking on async operations (`.Result`, `.Wait()`, `.GetAwaiter().GetResult()`)
- Missing cache for repeated expensive reads
- Missing `IDisposable` / `using` for resources (DbContext, streams, HttpClient)
- Large in-memory collections without streaming

#### 🔄 DataConsistency (Primary)
- Missing transaction scope for multi-table writes
- Race conditions (read-modify-write without locking/optimistic concurrency)
- Missing `[Timestamp]` / `RowVersion` on concurrency-sensitive entities
- Non-idempotent operations called without dedup guards
- Orphaned records risk (cascade delete not configured)

#### 🗄️ MigrationIntegrity (Primary)
- New migration file present → verify:
  - Migration matches corresponding Model class changes
  - No orphaned shadow properties in ModelSnapshot
  - Rollback (`Down()`) method implemented correctly
  - Irreversible operations (DROP COLUMN, data loss) flagged as HIGH

#### ⚠️ ErrorHandling (Primary)
- External HTTP calls without timeout configuration
- Missing Polly retry / circuit breaker for transient failures
- `catch (Exception e)` swallowing without re-throw or proper logging
- No fallback when external service unavailable

#### 🚫 Skill FORBIDDEN (Primary)
Check `{skill_forbidden_rules}` against changed code:
- No Base64 in CanvasJson
- No Zustand state in useCallback deps
- No component-local types that exist in types/
- Admin Service outside BackOffice namespace
- No CSS transform for animation
Violation → HIGH severity finding

#### 🔄 useState vs Zustand store 狀態重複偵測 (Primary)
For EACH changed `.tsx` / `.ts` file containing React hooks:
1. Extract all `useState` declarations (variable names + initial values)
2. Identify the component's imported Zustand stores (`useXxxStore`)
3. Cross-check: if a Zustand store already manages the same state (by name or semantic match), this is an **architecture Bug**, NOT a "design choice"
4. **Violation** → MUST FIX (not deferrable) — create fix Story if not immediately fixable
5. Common patterns to catch:
   - `const [loading, setLoading] = useState(false)` when store has `isLoading`
   - `const [data, setData] = useState(null)` when store has the same entity
   - `const [error, setError] = useState('')` when store has `error` state
Reference: CLAUDE.md "code-review deep review" rule

### 3. Boundary Condition Enumeration

For EACH changed public method/endpoint:

| Boundary | What to Check |
|----------|---------------|
| Null inputs | Missing null guards before use |
| Empty collections | ForEach on potentially empty list |
| Min/Max values | Int overflow, DateTime.MinValue edge |
| Concurrent access | Shared state without thread safety |
| Network partition | Timeout/retry not handled |
| Auth token expiry | Token not refreshed before sensitive op |

### 4. Cross-File Consistency Check

Using Read tool on dependency files:
- Verify callers handle new nullable return values
- Verify enum values added to all switch cases
- Verify new interface implementations complete all members

### 5. Format Output

Return findings as JSON array:

```json
[
  {
    "location": "Services/PaymentService.cs:87",
    "trigger_condition": "Concurrent payment requests for same order",
    "guard_snippet": "Use distributed lock or optimistic concurrency token",
    "potential_consequence": "Double charge if two requests process simultaneously",
    "severity": "CRITICAL"
  }
]
```

---

## OUTPUT FORMAT

Produce `{edge_findings}` as JSON array.
Each entry MUST include: location, trigger_condition, guard_snippet, potential_consequence, severity.
If no issues found: return `{edge_findings}` = [].

---

## SUCCESS METRICS

- Each finding has file:line evidence
- Scalability / DataConsistency / MigrationIntegrity / ErrorHandling / Skill FORBIDDEN all covered
- Cross-file dependencies checked via Read tool
- JSON array format correct

## FAILURE MODES

- Using AC/spec to guide analysis
- Skipping Read of changed files
- Missing FORBIDDEN rules check
- Invalid JSON output format

---

**RETURNS:** `{edge_findings}` (JSON array) to Step 3 orchestrator
