---
name: 'step-03-triple-layer-dispatch'
description: 'Five-layer parallel review dispatch: Blind + Edge Case + Acceptance + Security Expert + Perf Expert + SaaS 10-dim audit'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/code-review'
thisStepFile: '{workflow_path}/steps/step-03-triple-layer-dispatch.md'
nextStepFile: '{workflow_path}/steps/step-03d-triage-merge.md'
---

# Step 3: Five-Layer Review Dispatch (Security + Perf Expert Persona)

**Goal:** 以五層平行架構 + SaaS 10 維審計執行深度程式碼審查，收集並轉交 Triage。

**v2.0 Update (2026-05-10)**: 加 Layer D Security Expert Hunter + Layer E Performance Expert Hunter,真獨立 spawn deep specialty persona,對照 ruflo `security-architect` + `performance-engineer`。Main thread SaaS 9-dim audit 簡化(細節下放 D/E),Security + Scalability 維度 prompt 仍補深以 cover edge cases。

---

## AVAILABLE STATE

- `{story_key}`, `{skill_forbidden_rules}`, `{story_required_skills}` — from Step 1
- `{tech_debt_count}`, `{critical_debt_count}` — from Step 1
- `{diff_output}` — unified diff text (set in Step 1)
- `{has_db_changes}` — DB Schema 變更旗標（set in Step 1 §3b）
- `{review_mode}` — "full" | "no-spec" (set in Step 2)

---

## STATE VARIABLES (set in this step)

- `{failed_layers}` — 失敗層名稱列表（string[]）
- `{blind_findings}` — Blind Hunter 結果（Finding[]）
- `{edge_findings}` — Edge Case Hunter 結果（Finding[]）
- `{auditor_findings}` — Acceptance Auditor 結果（Finding[]，no-spec 時為空）
- `{security_findings}` — Security Expert Hunter 結果（Finding[]，v2.0 NEW）
- `{perf_findings}` — Performance Expert Hunter 結果（Finding[]，v2.0 NEW）
- `{db_findings}` — DB Schema Reviewer 結果（Finding[]，僅 `{has_db_changes}` = true 時）
- `{saas_findings}` — SaaS 10 維審計結果（Finding[]）

---

## EXECUTION SEQUENCE

**REF:** `saas-standards.md` — for SaaS dimension checklist.

> **CRITICAL:** BC-03 Guard — If `{diff_output}` is empty → output "Nothing to review" and HALT.
> **CRITICAL:** BC-04 Guard — If diff > 3000 lines → warn user, pipeline continues without waiting.

### 1. Initialize

Set `{failed_layers}` = [].

### 2. Launch Five Layers (Parallel if possible, sequential fallback)

#### Layer A — Blind Hunter (Sub-agent or inline)

> **BR-01:** ONLY receives `{diff_output}`. FORBIDDEN: spec, AC, story context, project docs.

**Prompt to sub-agent / inline execution:**
Load `{workflow_path}/steps/step-03a-blind-hunter.md` with input: `{diff_output}`.

On success: store result as `{blind_findings}`.
On failure/timeout/empty: append "blind" to `{failed_layers}`, set `{blind_findings}` = [].

#### Layer B — Edge Case Hunter (Sub-agent or inline)

> **BR-02:** Receives `{diff_output}` + project Read permission. FORBIDDEN: spec/AC.

**Prompt to sub-agent / inline execution:**
Load `{workflow_path}/steps/step-03b-edge-case-hunter.md` with input: `{diff_output}`.

On success: store result as `{edge_findings}`.
On failure/timeout/empty: append "edge" to `{failed_layers}`, set `{edge_findings}` = [].

#### Layer C — Acceptance Auditor (Sub-agent or inline)

> **BR-03:** Only when `{review_mode}` = "full". Skip when "no-spec".

**If `{review_mode}` = "full":**
Load `{workflow_path}/steps/step-03c-acceptance-auditor.md` with:
- `{diff_output}`, `{spec_content}`, `{acceptance_criteria}`, `{context_docs}`

On success: store result as `{auditor_findings}`.
On failure/timeout: append "auditor" to `{failed_layers}`, set `{auditor_findings}` = [].

**If `{review_mode}` = "no-spec":**
Set `{auditor_findings}` = []. Log: "Acceptance Auditor skipped (no-spec mode)".

#### Layer D — 🔒 Security Expert Hunter (Sub-agent or inline) — v2.0 NEW

> **BR-04:** Receives `{diff_output}` + project Read permission. **Deep specialty persona** — 對應 ruflo `security-architect` + `security-auditor`。

**Prompt to sub-agent / inline execution:**

```
你是 Security Expert,專長 OWASP Top 10 + ASP.NET Core + SQL Server + React 安全深審。

只看 {diff_output} + Read 改動 file。對每改動點檢查以下 12 維度,**比 Blind Hunter 更深**:

1. **Injection (OWASP A03)**:
   - SQL Injection (raw query / string concat / FromSqlRaw without param)
   - Command Injection (Process.Start / shell exec)
   - LDAP / XPath / NoSQL Injection
   - **Mass Assignment** (Bind() 屬性過多 / [FromBody] 無 DTO)

2. **XSS (A03)**:
   - Reflected / Stored / DOM-based
   - innerHTML / dangerouslySetInnerHTML / Razor @Html.Raw
   - URL scheme (javascript: / vbscript: / data:text)
   - JSON encoding (Razor inline script context)

3. **Broken Auth (A07)**:
   - Cookie scheme mismatch / scheme bypass
   - Permission bypass (missing [AdminPermission] / [Authorize])
   - Session fixation / privilege escalation
   - Multi-tenant data leakage

4. **Cryptographic Failures (A02)**:
   - Hardcoded secrets / API keys
   - Weak hash (MD5/SHA1 for password)
   - Plaintext sensitive data storage
   - Insecure random (Random vs RandomNumberGenerator)

5. **Insecure Design (A04)**:
   - Race condition (TOCTOU)
   - Timing attack on string compare
   - Insecure deserialize (BinaryFormatter / JsonConvert with TypeNameHandling)

6. **Security Misconfig (A05)**:
   - Missing security headers (CSP / X-Frame-Options / HSTS)
   - Verbose error pages (stack trace leakage)
   - CORS over-permissive

7. **Vulnerable Components (A06)**:
   - NuGet / npm dep with known CVE
   - Outdated framework version

8. **CSRF (A01 broken access)**:
   - Missing [ValidateAntiForgeryToken] on POST
   - GET state-changing endpoints

9. **SSRF (A10)**:
   - HttpClient with user-controlled URL (no allowlist)
   - URL fetch in webhook / image upload

10. **Path Traversal (A01)**:
    - Path.Combine with user input (../escape)
    - File.ReadAllText / static file serve uncontrolled

11. **Rate Limit / DoS (A04)**:
    - Missing rate limit on auth endpoint
    - Unbounded loop / regex catastrophic backtrack

12. **Logging Security**:
    - Secrets in logs (PII / passwords / tokens)
    - Log injection (CRLF in user input)

**PhyCool-Specific Security Checks** (額外 5 項，PhyCool 專案必查):

13. **ECPay Payment Security**:
    - Webhook endpoint 缺 `CheckMacValue` HMAC-SHA256 驗簽 → CRITICAL
    - 金額 / Plan 僅前端傳入未後端 server-side 驗證 → CRITICAL
    - ECPay API key 明碼在 appsettings.json（應 Azure Key Vault）→ CRITICAL

14. **Azure Key Vault / Secrets**:
    - 任何 secret / connection string / API key 寫在 `appsettings*.json`（非 Key Vault / env var）→ CRITICAL
    - `IConfiguration` 直接讀 `ConnectionStrings:*`（應走 managed identity / Key Vault reference）→ HIGH

15. **BackOffice Namespace Isolation** (ADR-URL-001):
    - Admin Service / Controller 定義在 `BackOffice` namespace 外 → HIGH
    - Admin route 未使用 `/mgmt/` prefix → HIGH
    - `[AdminPermission]` attribute 遺漏在 mgmt controller action → CRITICAL

16. **Canvas Data Security**:
    - 新 Base64 image 寫入 `CanvasJson`（應用 AssetReference + Diff Sync）→ HIGH
    - `CanvasJson` payload > 500KB → HIGH
    - Full canvas transfer 代替 Diff Sync → HIGH

17. **Auth / RBAC**:
    - JWT token 驗證邏輯繞過（PhyCool Admin JWT 獨立 scheme）→ CRITICAL
    - `[Authorize]` 屬性遺漏在需要驗證的 API endpoint → HIGH
    - `[ValidateAntiForgeryToken]` 遺漏在 MVC POST action → HIGH

對每 finding 輸出 JSON Finding[]:
{ severity: "CRITICAL"|"HIGH"|"MEDIUM"|"LOW", category: "security", subcategory: "<OWASP-A0X | phycool-specific>", file, line, description, fix_suggestion, cwe_id }

**FORBIDDEN**: 跳過深度 — 12 + 5 PhyCool 維度全跑,不可只報 XSS + SQL injection 表面 finding。
```

On success: store result as `{security_findings}` (source = "security-expert").
On failure/timeout: append "security" to `{failed_layers}`, set `{security_findings}` = [].

#### Layer E — 📈 Performance Expert Hunter (Sub-agent or inline) — v2.0 NEW

> **BR-05:** Receives `{diff_output}` + project Read permission. **Deep specialty persona** — 對應 ruflo `perf-analyzer` + `performance-engineer`。

**Prompt to sub-agent / inline execution:**

```
你是 Performance Expert,專長 .NET / EF Core / SQL Server / React 效能深審。

只看 {diff_output} + Read 改動 file。對每改動點檢查以下 10 維度,**比 Edge Case Hunter 更深**:

1. **Database Query Optimization**:
   - N+1 query (per-loop SELECT)
   - INNER JOIN 破 pagination orphan filter
   - Missing index (order by / where 條件)
   - SELECT *  / Include 過多 ()
   - .ToList() / .Count() 提早 materialize
   - .ToLower().Contains() 阻 index → 改 EF.Functions.Like

2. **Algorithm Complexity**:
   - O(n²) hotspot (nested loop on collection)
   - Inefficient LINQ (.Where().ToList().Where())
   - 字串拼接 in loop (應 StringBuilder)
   - Recursion 無 memoization

3. **Async / Concurrency**:
   - .Result / .Wait() / GetAwaiter().GetResult() (deadlock risk)
   - async void (non-event handler)
   - Task.Run wrapping CPU-bound but pretending IO-bound
   - ConfigureAwait(false) missing in library code
   - Lock contention (lock 範圍過大 / nested lock)

4. **Memory Management**:
   - IDisposable not disposed (using missing)
   - Large object heap (>85KB allocations in loop)
   - Memory leak (event handler not unsubscribed)
   - Closure capture (lambda capturing large state)

5. **Caching Strategy**:
   - Missing cache (重複 expensive call)
   - Cache stampede (no lock on miss)
   - Cache invalidation race condition
   - TTL 設計不合理

6. **HTTP / Network**:
   - HttpClient new in loop (應 IHttpClientFactory)
   - 同步 HTTP call in async pipeline
   - Missing timeout / retry / circuit breaker (Polly)
   - Large response no streaming

7. **Connection Pool**:
   - SQL connection leak (DbContext not scoped)
   - Pool exhaustion (long-running async holding conn)

8. **Hot Path Profiling**:
   - 高頻 API endpoint 含 expensive work (應 background)
   - Razor / Component 重渲染 (missing memoization)

9. **GC Pressure**:
   - Large allocations in hot path
   - Boxing / unboxing in tight loop
   - struct vs class 選擇 (avoid heap allocation)

10. **Frontend Perf** (.tsx / .js / Razor JS):
    - useEffect missing deps / over-render
    - Missing React.memo / useMemo for expensive
    - Bundle size impact (new big lib)
    - Layout thrashing (repeated read+write DOM)

對每 finding 輸出 JSON Finding[]:
{ severity: "CRITICAL"|"HIGH"|"MEDIUM"|"LOW", category: "performance", subcategory: "<query|algo|async|memory|cache|http|pool|hotpath|gc|frontend>", file, line, description, fix_suggestion, perf_impact_estimate }

**FORBIDDEN**: 跳過深度 — 10 維度全跑,不可只報 N+1 + simple SQL 表面 finding。
```

On success: store result as `{perf_findings}` (source = "perf-expert").
On failure/timeout: append "perf" to `{failed_layers}`, set `{perf_findings}` = [].

#### Layer F — 🗄️ DB Schema Reviewer (conditional) — NEW

> **BR-07:** Only when `{has_db_changes}` = true (Step 1 §3b detected Migration / Model / Repository changes).

**If `{has_db_changes}` = false:** Skip Layer F entirely. Log: "Layer F skipped (no DB changes detected)".

**If `{has_db_changes}` = true:**

```
你是 DB Schema Reviewer，專長 EF Core Migration + SQL Server Schema 設計審查。

只看 {diff_output} 中的 Migration / Model / Repository 相關檔案，執行以下 6 項審查:

1. **Migration Integrity**:
   - Up() / Down() 方法是否對稱（Down 能完整還原 Up 的變更）
   - 有無破壞性操作：DROP COLUMN / ALTER COLUMN NOT NULL without default（生產資料毀損風險）
   - Migration 編號是否連續（避免 EF Core 歷史鏈斷裂）
   - `ModelSnapshot.cs` 是否同步更新（Migration 有改但 Snapshot 沒改 = 不一致）

2. **PhyCool PK Strategy**:
   - Guid PK：預設選擇，確認 `newsequentialid()` 或 C# 端生成 sequential Guid
   - int / long PK：僅用於序列計數表（如 order number）
   - string PK：僅用於外部系統 ID（如 ECPay 訂單號）
   - 違反策略 → HIGH

3. **Index Coverage**:
   - FK 欄位是否有對應 Index（EF Core 不自動建 FK index）
   - 常用 WHERE 條件欄位是否有 Index（如 `UserId`, `Status`, `CreatedAt`）
   - 常用 ORDER BY 欄位是否有 Index
   - 複合 Index 欄位順序是否合理（選擇性高的欄位放前面）

4. **Null Safety & Defaults**:
   - 新增 NOT NULL 欄位是否提供 default value（避免現有資料 migration fail）
   - nullable 標記是否與 C# 型別一致（`string?` vs `string`）

5. **SDD Spec Alignment** (若 story 有 SDD Spec):
   - Migration 表名 / 欄位名是否與 SDD Spec 一致
   - 資料型別長度是否符合規格（e.g., `NVARCHAR(200)` vs Spec `VARCHAR(500)`）

6. **PhyCool Data Retention Rules**:
   - 新資料表是否需要 `CreatedAt` / `UpdatedAt` audit 欄位
   - 含個資的欄位是否有對應 IDD-REG-001（180 天保存）標記

對每 finding 輸出 JSON Finding[]:
{ severity: "CRITICAL"|"HIGH"|"MEDIUM"|"LOW", category: "database", subcategory: "<migration|pk|index|null|spec|retention>", file, line, description, fix_suggestion }
```

On success: store result as `{db_findings}` (source = "db-reviewer").
On failure/timeout: append "db" to `{failed_layers}`, set `{db_findings}` = [].

---

### 3. SaaS 10-Dimension Audit (Main Thread — Mandatory, simplified post-Layer-D/E)

> **BR-06:** SaaS audit runs in main thread, independent of sub-agents.
> **CRITICAL:** Read EVERY file in story File List via Read tool.

**REF:** `saas-standards.md` for full per-dimension checklist.

For EACH file in story File List + git changes:
1. **READ** complete file via Read tool
2. **DIFF** via `git diff` for exact changes
3. **ANALYZE** line-by-line against SaaS dimensions

Run all 10 dimensions (cite file:line for each finding):
- 🔒 **Security** (CRITICAL): 主要交給 Layer D Security Expert Hunter 深審。Main thread 補抓 Layer D 漏網的明顯 issue (e.g., 明顯 SQL string concat / hardcoded "password" / @Html.Raw with user input)。**若 Layer D failed → main thread 補跑完整 12 維度** (per Layer D prompt)
- 📈 **Scalability** (HIGH): 主要交給 Layer E Performance Expert Hunter 深審。Main thread 補抓 Layer E 漏網 (e.g., 明顯 .Result / 明顯 N+1)。**若 Layer E failed → main thread 補跑完整 10 維度** (per Layer E prompt)
- 📊 **Observability** (MEDIUM): ILogger in catch blocks, correlation IDs, health endpoints
- 🔄 **DataConsistency** (HIGH): Transaction scope, concurrency tokens, idempotency
- 🗄️ **MigrationIntegrity** (HIGH): Migration file integrity, ModelSnapshot, pending-model-changes
- ⚠️ **ErrorHandling** (HIGH): try/catch coverage, no stack trace leakage, Polly/retry
- ✅ **Compliance** (CRITICAL): GDPR, data retention, audit logs
- 🧪 **TestCoverage**: Real assertions (not `Assert.True(true)`), coverage ≥ 80%
- 🚫 **Skill FORBIDDEN**: Check `{skill_forbidden_rules}` — violations → HIGH
- 🖱️ **UI Behavioral** (HIGH,2026-04-14 新增): **觸發條件**:diff 含 `.tsx` / `.css` / DOM 結構 / layout / gating / tier label 類變更。**MANDATORY 動作**:(1) `curl https://localhost:7135` + `curl http://localhost:5173` 確認 server 在跑 → (2) `list_pages` 確認 Chrome 可用 → (3) `evaluate_script` 讀 DOM class / computed style / aria attrs 對照每個 UI 類 AC → (4) `click` 驗關鍵 interaction state transitions → (5) `take_screenshot` 存檔至 `docs/implementation-artifacts/reviews/epic-{X}/{story-id}-{plan}-verification.png` → (6) **跨 plan 至少 2 個**(涉及 plan gating 必須 Free + 1 個付費)。**若 server 未跑** → finding:HIGH「CR UI 驗證受阻,建立 verification Story 或啟動 server 重跑」,不可 ⬜ 帶過標 done。**若違反** → step-06 §7.5 Gate 8 HARD BLOCK。
>
> **Incident (2026-04-14):** `eft-editor-batch-image-panel-free-open` CR 依 Vitest 22/22 通過標 done,留 ⬜ tasks「post-CR QA」;使用者質疑後補做 Chrome MCP 驗 A1 Free + A4 Professional,DOM computed style + 跨 plan 一致性實測才完整驗證 AC-1/2/4/6/7。Memory id=3288。

Git vs Story discrepancies:
- Changed files not in File List → MEDIUM
- Story lists files with no git changes → HIGH
- Uncommitted changes undocumented → MEDIUM

AC Validation (per AC):
1. Read AC requirement
2. Read implementing code
3. Trace: Controller → Service → Repository
4. IMPLEMENTED (file:line) / PARTIAL / MISSING → HIGH if PARTIAL/MISSING

Task Completion Audit (per [x] task):
1. Read implementing code
2. If marked `[x]` but NOT done → **CRITICAL** finding

Collect all findings as `{saas_findings}` (source = "saas").

### 4. Fault Guard

**If `{failed_layers}` contains all of ["blind", "edge", "auditor", "security", "perf"]:**
Output: ⚠️ **警告：五層全部失敗，review 可能不完整。僅 SaaS 審計結果有效 (Main thread 須 fallback 跑 Layer D + E 完整 prompt)。**
Do NOT declare clean review.

**If `{has_db_changes}` = true AND `{failed_layers}` contains "db":**
Output: ⚠️ **DB Schema Reviewer (Layer F) 失敗**。手動執行 MigrationIntegrity 維度並補入 `{saas_findings}`。

**If `{failed_layers}` contains "security":**
Main thread MUST fallback execute Layer D Security Expert prompt 12 維度,findings 合併進 `{saas_findings}` (source = "security-expert-fallback")。

**If `{failed_layers}` contains "perf":**
Main thread MUST fallback execute Layer E Performance Expert prompt 10 維度,findings 合併進 `{saas_findings}` (source = "perf-expert-fallback")。

### 5. Minimum Issue Check

**If total findings across all sources < 3:**
> **CRITICAL:** NOT LOOKING HARD ENOUGH — Re-examine harder!
Re-check: null handling, edge cases, architecture violations, integration issues, **Security 12 維度 (Layer D) + Perf 10 維度 (Layer E) 是否全跑**。

---

## SUCCESS METRICS

- `{blind_findings}`, `{edge_findings}`, `{auditor_findings}`, `{security_findings}`, `{perf_findings}`, `{saas_findings}` all set
- `{db_findings}` set (若 `{has_db_changes}` = true)
- `{failed_layers}` set (empty if all succeeded)
- All story files read via Read tool (SaaS audit)
- Every AC validated with file:line evidence
- Every `[x]` task verified
- ≥ 3 total findings
- **v2.0**: Layer D Security 12 + 5 PhyCool 維度全跑 (或 fallback 在 main thread)
- **v2.0**: Layer E Performance 10 維度全跑 (或 fallback 在 main thread)
- **NEW**: Layer F DB Review 執行（若 `{has_db_changes}` = true）

## FAILURE MODES

- Blind Hunter receiving spec/AC context (violates BR-01)
- Skipping SaaS audit or any of 10 dimensions
- Declaring "clean review" with failed layers
- Not reading files via Read tool
- Missing file:line evidence
- **v2.0**: Security Expert 跳過 12 維度任一 (e.g., 只報 XSS + SQL injection 表面 finding)
- **v2.0**: Perf Expert 跳過 10 維度任一 (e.g., 只報 N+1 + simple SQL 表面 finding)

---

**NEXT:** Load `step-03d-triage-merge.md`

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **2.0.0** | **2026-05-10** | **Five-Layer Review Dispatch (加 Security + Perf Expert Persona)**。觸發事件:User audit 提出「BMAD review 階段是否有資安/效能專家 persona」。原 3 layer (Blind/Edge/Auditor) + main thread SaaS 9-dim → 加 Layer D Security Expert Hunter (12 維度 OWASP 全) + Layer E Performance Expert Hunter (10 維度 .NET/EF/SQL/React 全)。對應 ruflo `security-architect` / `perf-engineer` 真獨立 spawn deep specialty persona。Main thread Security/Scalability 維度簡化(主審交 D/E)+ fallback 機制(D/E failed 時 main thread 補跑完整 prompt)。Path δ 微創:對齊 user 「直接在 step-03 補強」訴求,inline prompt 不另開檔。預期效益:CR finding 數量 +50-80% / Security 深度 5/10→9/10 / Perf 深度 5/10→9/10 / 平均 CR Score 預期 88→92-96 / Review 時間不增加(parallel)。 |
| 1.0.0 | (initial) | Initial Triple-Layer (Blind / Edge / Auditor) + SaaS 9-dim audit |
