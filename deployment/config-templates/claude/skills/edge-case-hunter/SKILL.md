---
name: edge-case-hunter
description: 'Walk every branching path and boundary condition in code/diff, report only unhandled edge cases with PhyCool five-dimension analysis (Scalability/DataConsistency/MigrationIntegrity/ErrorHandling/SkillFORBIDDEN). Standalone skill usable outside pipeline — no isolation restrictions. Outputs JSON array compatible with review_findings DB schema. Triggers: Use when analyzing edge cases, boundary conditions, 邊界測試, or boundary analysis in code/diff.'
version: '1.1.0'
updated: 2026-07-29
context: fork
agent: general-purpose
triggers:
  - edge case
  - boundary
  - edge-case-hunter
  - boundary condition
  - 邊界測試
author: CC-OPUS
created: 2026-04-03
---

# Edge Case Hunter

**Goal:** You are a pure path tracer for PhyCool platform code. Never comment on whether code is good or bad; only list missing handling.

When a diff is provided, scan only the diff hunks and list boundaries that are directly reachable from the changed lines and lack an explicit guard.
When a file path is provided, read the file(s) at that path and treat the entire content as the scope.
When no diff is provided (full file or function), treat the entire provided content as the scope.

**Independent Mode:** Unlike the pipeline step-03b, this standalone Skill has no isolation restrictions — you may freely read spec documents, AC, story descriptions, and use any context to improve analysis quality.

**Inputs:**
- **content** — Content to review: diff, full file path, or function
- **also_consider** (optional) — Additional areas or domains to keep in mind during analysis

**MANDATORY: Execute steps in the Execution section IN EXACT ORDER. DO NOT skip steps or change the sequence. When a halt condition triggers, follow its specific instruction exactly.**

---

## EXECUTION

### Step 1: Receive Content

- Load the content to review from provided input (file path → Read tool; diff/inline → parse directly)
- If content is empty, or cannot be decoded as text, return:
  ```json
  [{"location":"N/A","trigger_condition":"Input empty or undecodable","guard_snippet":"Provide valid content to review","potential_consequence":"Review skipped — no analysis performed","severity":"INFO","dimension":"ErrorHandling"}]
  ```
  and stop
- Identify content type (diff, full file, function) to determine scope rules
- If content is a file path, use Read tool to load the file(s); identify upstream callers (Grep for usages) and downstream dependencies (imports/injections)

### Step 2: Exhaustive Path Analysis

**Walk every branching path and boundary condition within scope — report only unhandled ones.**

If `also_consider` input was provided, incorporate those areas into the analysis.

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
- **Named-set generalization**(固定集合的隱性分支):diff 對固定集合(enum / status code / sentinel / type tag / flag / value range 六類具名)的部分成員做特判或改變處理,而其餘成員成為靜默未處理的隱性分支。例如:diff 只改了 `RED`/`YELLOW`/`GREEN` 三值 enum 中的 `RED` 和 `YELLOW` 分支,`GREEN` 成為未被檢視的隱性分支 —— 需確認 `GREEN` 分支的既有行為是否仍正確,或是否也該同步調整。**與 Step 3「Verify enum values added to all switch cases」互補不重複**:Step 3 管**新增** enum 值的 switch case 補齊;本條管**既有**集合成員被部分特判、其餘靜默未處理。

#### 🗄️ MigrationIntegrity (Primary)
- New migration file present → verify:
  - Migration matches corresponding Model class changes
  - No orphaned shadow properties in ModelSnapshot
  - Rollback (`Down()`) method implemented correctly
  - Irreversible operations (DROP COLUMN, data loss) flagged as CRITICAL

#### ⚠️ ErrorHandling (Primary)
- External HTTP calls without timeout configuration
- Missing Polly retry / circuit breaker for transient failures
- `catch (Exception e)` swallowing without re-throw or proper logging
- No fallback when external service unavailable
- Missing null guards before use; ForEach on potentially empty list
- Int overflow, DateTime.MinValue edge cases
- Concurrent access to shared state without thread safety

#### 🚫 SkillFORBIDDEN (Primary)
Check PhyCool CLAUDE.md Forbidden Patterns against changed code:
- No new image Base64 in CanvasJson / CanvasJson > 500KB / full transfer (must Diff Sync)
- No `useCallback` deps with Zustand state
- No `useState` duplicating Zustand state
- No component-local types that exist in `types/`
- Admin Service outside `BackOffice` namespace
- No CSS `transform` for animation (conflicts with `translate`)
- No Canvas reset Y=0 (must be 20px)

Violation → CRITICAL severity finding

#### General Boundary Enumeration
For EACH changed public method/endpoint:

| Boundary | What to Check |
|----------|---------------|
| Null inputs | Missing null guards before use |
| Empty collections | ForEach on potentially empty list |
| Min/Max values | Int overflow, DateTime.MinValue edge |
| Concurrent access | Shared state without thread safety |
| Network partition | Timeout/retry not handled |
| Auth token expiry | Token not refreshed before sensitive op |

### Step 3: Validate Completeness

- Revisit every edge class from Step 2 — ensure all five dimensions were covered
- For each changed file, verify callers handle new nullable return values
- Verify enum values added to all switch cases
- Verify new interface implementations complete all members
- Add any newly found unhandled paths to findings; discard confirmed-handled ones

### Step 4: Present Findings

Output findings as a JSON array following the Output Format specification exactly.

---

## OUTPUT FORMAT

Return ONLY a valid JSON array of objects. Each object must contain exactly these six fields:

```json
[{
  "location": "file:start-end (or file:line when single line, or file:hunk when exact line unavailable)",
  "trigger_condition": "one-line description (max 15 words)",
  "guard_snippet": "minimal code sketch that closes the gap (single-line escaped string, no raw newlines or unescaped quotes)",
  "potential_consequence": "what could actually go wrong (max 15 words)",
  "severity": "CRITICAL | HIGH | MEDIUM | LOW | INFO",
  "dimension": "Scalability | DataConsistency | MigrationIntegrity | ErrorHandling | SkillFORBIDDEN"
}]
```

No extra text, no explanations, no markdown wrapping. An empty array `[]` is valid when no unhandled paths are found.

**Severity scale:**
- CRITICAL — data loss, double charge, auth bypass, FORBIDDEN rule violation
- HIGH — silent failure, race condition, missing transaction on multi-table write
- MEDIUM — N+1 query, missing pagination, synchronous blocking
- LOW — minor resource leak, missing defensive null check with low likelihood
- INFO — observation with no direct consequence

---

## DB OUTPUT MAPPING (review_findings Schema)

When findings are written to `review_findings` via `review-db-writer.js --write-finding`, use this mapping:

| Finding Field | DB Column | Notes |
|--------------|-----------|-------|
| `location` | `file_path` + `line_number` | Parse `file:line` — before `:` → `file_path`; after `:` → `line_number` (integer). If range (e.g., `87-92`), use start line. If hunk, set `line_number = null`. |
| `trigger_condition` | `title` | Direct mapping (required field) |
| `potential_consequence` | `description` | Direct mapping |
| `guard_snippet` | `fix_suggestion` | Direct mapping |
| `severity` | `severity` | Required field — must be CRITICAL/HIGH/MEDIUM/LOW/INFO |
| `dimension` | `dimension` | Direct mapping |
| *(fixed)* | `bug_type` | Always `"EdgeCase"` |
| *(caller-provided)* | `finding_id` | Required — generate as `ECH-{report_id}-{index:03d}` (e.g., `ECH-RPT-2026-001-001`) |
| *(caller-provided)* | `report_id` | Required — provided by pipeline or caller |
| *(caller-provided)* | `module_code` | Required — derive from file_path: e.g., `Services/PaymentService.cs` → `payment`; `Controllers/AuthController.cs` → `auth`; caller may override |
| *(caller-provided)* | `engine` | Required — the agent/engine running the review (e.g., `CC-OPUS`, `CC-SONNET`, `GEM`) |

**Required fields** (write rejected if any missing): `finding_id`, `report_id`, `module_code`, `severity`, `bug_type`, `title`, `engine`

**Example DB write:**
```bash
node .context-db/scripts/review-db-writer.js --write-finding '{
  "finding_id": "ECH-RPT-2026-001-001",
  "report_id": "RPT-2026-001",
  "module_code": "payment",
  "engine": "CC-OPUS",
  "severity": "CRITICAL",
  "bug_type": "EdgeCase",
  "dimension": "DataConsistency",
  "title": "Concurrent payment requests for same order",
  "description": "Double charge if two requests process simultaneously",
  "file_path": "Services/PaymentService.cs",
  "line_number": 87,
  "fix_suggestion": "Use distributed lock or optimistic concurrency token"
}'
```

---

## HALT CONDITIONS

- If content is empty or cannot be decoded as text → return halt JSON and stop (see Step 1)
- If file path provided but file does not exist → return `[{"location":"N/A","trigger_condition":"File not found: {path}","guard_snippet":"Verify the file path and try again","potential_consequence":"Review skipped — file unreadable","severity":"INFO","dimension":"ErrorHandling"}]` and stop

---

## SUCCESS METRICS

- Each finding has file:line evidence
- All five dimensions (Scalability/DataConsistency/MigrationIntegrity/ErrorHandling/SkillFORBIDDEN) covered
- DataConsistency named-set generalization checked (fixed-set members partially special-cased, rest silently unhandled)
- Cross-file dependencies checked via Read tool when file path provided
- JSON array format correct with all six fields per entry
- Findings can be directly written to review_findings via review-db-writer.js

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.1.0** | **2026-07-29** | Step 2 §DataConsistency 新增 named-set generalization 檢查條目(固定集合 enum/status code/sentinel/type tag/flag/value range 部分成員特判、其餘靜默未處理的隱性分支偵測),與 pipeline 對應版本 `_bmad/bmm/workflows/4-implementation/code-review/steps/step-03b-edge-case-hunter.md` §2 DataConsistency 同步鏡像。dimension enum 維持 5 值封閉集不變(Scalability/DataConsistency/MigrationIntegrity/ErrorHandling/SkillFORBIDDEN)。Story: `bwu-4-p1-distill-and-coverage`(上游 BMAD v6.10 CHANGELOG #2524 named-set 蒸餾)。 |
| 1.0.3 | 2026-04-05 | 前次版本(無 Version History 記錄,補記為 baseline)。 |
