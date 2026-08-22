---
name: 'step-03c-acceptance-auditor'
description: 'Acceptance Auditor: AC vs implementation comparison, spec compliance, compliance and test coverage'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/code-review'
thisStepFile: '{workflow_path}/steps/step-03c-acceptance-auditor.md'
nextStepFile: null
---

# Step 3c: Acceptance Auditor

**Goal:** AC vs 實作逐條對照，Spec 合規驗證，確認每條驗收標準的實作完整性。

---

## CONDITIONAL ACTIVATION (BR-03)

- `{review_mode}` = `"full"` → **啟用**，繼續執行
- `{review_mode}` = `"no-spec"` → **跳過**，return `{auditor_findings}` = [], log "Acceptance Auditor skipped (no-spec mode)"

---

## INPUT

```
{diff_output}         ← git diff
{spec_content}        ← SDD Spec (BR-XXX Business Rules + Boundary Conditions + API Spec)
{acceptance_criteria} ← Story ACs (Given/When/Then format with [Verifies: BR-XXX])
{context_docs}        ← Architecture + related skill docs
```

---

## EXECUTION SEQUENCE

### 1. Parse Inputs

Extract from `{spec_content}`:
- All Business Rules (BR-XXX) with testable conditions
- Boundary Conditions (BC-XXX)
- API/Interface Spec (§4)
- Error Handling spec (§5/§6)

Extract from `{acceptance_criteria}`:
- Each AC with Given/When/Then
- [Verifies: BR-XXX] mappings

### 2. AC-to-Code Traceability (Per AC)

For EACH Acceptance Criterion:
1. Read the AC: Given {precondition} → When {action} → Then {result}
2. **MANDATORY:** Read ACTUAL source code implementing this AC via Read tool
3. Trace implementation path: Controller → Service → Repository (or equivalent)
4. Determine status:
   - **IMPLEMENTED**: code exists + file:line proof
   - **PARTIAL**: part of AC implemented, specific gap identified
   - **MISSING**: no implementation found

Findings:
- PARTIAL → **HIGH** severity with specific missing code evidence
- MISSING → **HIGH** severity with expected implementation location

### 3. Business Rule Coverage (Per BR-XXX)

For EACH BR in `{spec_content}`:
1. Locate corresponding code via Read/Grep
2. Verify rule is enforced (not just happy-path)
3. Check: Is the BR's condition checked at the right layer?
4. MISSING → HIGH finding

### 4. Spec Alignment (VSDD Check)

Against `{spec_content}` API/Interface Spec:
- Route/URL matches spec §4
- Request/Response format matches spec §4
- Error codes match spec §5/§6
- New behavior not in spec → MEDIUM (spec drift / over-engineering)

### 5. Compliance Dimension (Primary)

> **GDPR / Data Retention / Audit Logs**

- Personal data fields: verify GDPR-compliant storage/retrieval
- Data deletion flows: verify cascade or anonymization
- Sensitive operations: verify audit log entries written
- Compliance requirements in spec §4+ implemented

### 6. Test Coverage (Primary)

> **Upgraded (bwu-3-dev-consume-review-audit, BR-017~021/027)**: 若 Story 有 create-story `step-06` §7.5 產出的具名測試案例表,§6 從「檢查既有測試檔」升級為「依表逐列對帳」——起算軸從「已寫的測試」翻轉為「表要求的案例」,漏寫的案例才偵測得到（從既有測試檔起算永遠偵測不到「沒人寫」的案例）。

#### §6.0 通用逐檔核對（所有 verdict 皆執行，含 consume）

For EACH new/modified test file (via Read tool)：
- Verify tests map to ACs (BR ID in test name recommended)
- Verify assertions are real (not `Assert.True(true)`, not empty body)
- Verify boundary conditions from spec BC-XXX have test coverage
- Missing test for AC/BR → MEDIUM finding

> **修正 (bwu-3 自身 code-review)**：本段原被置於 §6.4 之下，等同只對 `fallback`/`skip` 生效——`consume` 卡因此失去「表以外的測試檔」審查與 **BC-XXX 邊界覆蓋**檢查（§6.2 只走表列，表不含 BC 軸）。逐列對帳是**疊加**在通用核對之上的增量，不是取代。

#### §6.1 執行分類 CLI

```bash
node .context-db/scripts/test-spec-audit.js {story_key} --json
```

依 `.verdict` 分流：`consume` → 續走 §6.2 + §6.3；`fallback`/`skip` → 跳至 §6.4（§6.0 已執行完畢）。

#### §6.2 verdict=consume：逐案例三軸對帳

對 CLI 回傳的每一列，逐一核對三軸（各附 `file:line` 證據）：

| 軸 | 判準 |
|----|------|
| (a) 存在 | 是否有一個測試方法名與該列 `Case` byte-identical |
| (b) 斷言真實 | 方法 body 非空、非 `Assert.True(true)`，斷言值對應該列 `Expected` |
| (c) 紅綠可證 | `RED→GREEN` 的 RED 側可從斷言反推，或有 revert 證據 |

輸出逐列對帳表：

```markdown
| Case | (a) 存在 | (b) 斷言真實 | (c) 紅綠可證 | 證據 |
|------|:-------:|:-----------:|:-----------:|------|
| `BR005_Conflict_Returns409` | ✅ | ✅ | ✅ | `SeoControllerConcurrencyTests.cs:87` |
| `BR006_MissingScope_Returns403` | ❌ | — | — | 無對映測試 |
```

**嚴重度階梯**：單一列任一軸失敗（(a) 或 (b)）→ **MEDIUM** finding；**全部**列皆無對映測試 → 併為單一 **HIGH** finding（不產 N 個 MEDIUM）。

#### §6.3 欄位契約 defect findings（`TD-BWU2-D7-COLUMN-CONTRACT-UNVERIFIED` 落點）

對 CLI 回傳每列的 `defects` 陣列（`missing-column:{name}` / `level-enum` / `fixture-unnamed` / `redgreen-vague` / `case-name-shape`），轉為 finding：

- 單一列的 defect → **LOW**
- 同一 defect class 影響 ≥ 3 列 → 併為單一 **MEDIUM**（系統性）

此為 `TD-BWU2-D7-COLUMN-CONTRACT-UNVERIFIED` 的解決落點——七欄/`Level` enum/`Fixture` 具名/`RED→GREEN` 雙向的欄位級契約，**在 review 端逐列驗證，不在 create 端硬驗**（bwu-2 已實測 create 端硬驗會使 46/47 既有含表卡新增 WARN，等同封鎖 backlog）。

#### §6.4 verdict ∈ {fallback, skip}：只走 §6.0 通用核對，表對帳與欄位 defect 零新 finding

**不得**對 fallback/skip 卡產出任何表對帳 finding 或欄位 defect finding——44 張純散文卡與所有 S/XS 卡走此分支，每次 CR 都對它們產表對帳等同灌水假 finding。§6.0 的通用核對照舊執行（其行為與本升級前完全相同）。

#### §6.5 對帳表 + marker

`verdict=consume` 完成 §6.2/§6.3 後，將對帳表寫入 CR report，並附上 marker：

```
[Test Spec Reconciliation @ {ISO8601 timestamp} — {covered}/{total} cases]
```

`{covered}`/`{total}` 計數須等於 audit CLI 回傳的列總數。

#### §6.6 寫入 test_traceability

對每個已對帳的案例寫入一列（`ac_id`=該列 `BR`、`test_name`=`Case`、`test_type`=`Level`、`status`=`covered`/`pending`），激活 `test_traceability` 表。

**必須以 §6.2 的對帳結果餵入，不得讓 writer 自行重跑 audit**：writer 無參數時內部呼叫 `runAudit()`，`status` 便只由 `git grep` 命中與否決定——一個方法名存在但 body 是 `Assert.True(true)`（軸 (b) FAIL）的案例會被寫成 `covered`，追溯表與對帳表產生兩套結論。作法：把 §6.2 判定後的 rows 存成 JSON（**軸 (a) 或 (b) 失敗者其 `testHit` 改寫為 `null`**，如此 writer 會寫 `pending` + 佔位常量），再以 `--from-audit` 傳入：

```bash
node .context-db/scripts/test-spec-audit.js {story_key} --json > {tmp}/audit.json
# 依 §6.2 三軸判定結果修正 {tmp}/audit.json 中各列的 testHit（未通過者設為 null）
node .context-db/scripts/upsert-test-trace.js --story {story_key} --from-audit {tmp}/audit.json
```

僅當 §6.2 全列三軸皆 ✅ 時，才可省略 `--from-audit` 直接跑 `--story`（此時兩者結果等價）。

### 7. Format Output

Return findings as Markdown list:

```markdown
- **[SEVERITY][DIMENSION]** {title}
  - AC/Constraint: {which AC or BR this relates to}
  - Evidence: {what was found in code or what is missing}
  - Location: {file}:{line} or "not found"
  - Severity: CRITICAL | HIGH | MEDIUM | LOW
```

---

## OUTPUT FORMAT

Produce `{auditor_findings}` as Markdown list.
Each finding MUST include: title, AC/constraint reference, evidence, location, severity.
If no issues found: return `{auditor_findings}` = [].

---

## SUCCESS METRICS

- Every AC traced to code with file:line evidence
- Every BR-XXX verified
- Spec drift findings generated for over-engineering
- Compliance (GDPR) and TestCoverage checks done
- Markdown list format correct

## FAILURE MODES

- Accepting AC as "implemented" without reading code
- Skipping BR coverage check
- Missing compliance dimension
- Invalid test assertions not flagged
- Mixing in non-spec context (architecture preferences, style)

---

**RETURNS:** `{auditor_findings}` (Markdown list) to Step 3 orchestrator
