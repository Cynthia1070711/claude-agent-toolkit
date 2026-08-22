---
name: 'step-03d-triage-merge'
description: 'Triage: normalize all findings, dedup by file:line, classify patch/defer/dismiss, calculate SaaS Readiness Score'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/code-review'
thisStepFile: '{workflow_path}/steps/step-03d-triage-merge.md'
nextStepFile: '{workflow_path}/steps/step-04-present-autofix.md'
---

# Step 3d: Triage & Merge

**Goal:** 正規化全部 findings 來源 → 去重 → 分類 → 計算 SaaS Readiness Score。

---

## AVAILABLE STATE

- `{blind_findings}` — Markdown list (from Step 3a)
- `{edge_findings}` — JSON array (from Step 3b)
- `{auditor_findings}` — Markdown list (from Step 3c)
- `{security_findings}` — **raw producer JSON**, not unified `Finding` (from Step 3 Layer D Security Expert) — MUST go through the §2 mapping block
- `{perf_findings}` — **raw producer JSON**, not unified `Finding` (from Step 3 Layer E Perf Expert) — MUST go through the §2 mapping block
- `{db_findings}` — **raw producer JSON**, not unified `Finding` (from Step 3 Layer F DB Schema Reviewer; only populated when `{has_db_changes}` = true, otherwise treated as an empty set — see §1) — MUST go through the §2 mapping block
- `{saas_findings}` — Finding[] (from Step 3 main thread)
- `{failed_layers}` — failed layer names
- `{has_db_changes}` — DB Schema 變更旗標(from Step 1 §3b)—— §1 Guard 與 `{db_findings}` 的條件性判定依據

---

## STATE VARIABLES (set in this step)

- `{unified_findings}` — 去重後統一格式 Finding[]
- `{saas_readiness_score}` — SaaS 準備分數 (0-100)
- `{dismissed_count}` — 被 dismiss 的數量

---

## EXECUTION SEQUENCE

### 1. Incomplete Review Guard

**If `{failed_layers}` is non-empty:**
Output: ⚠️ **不完整 Review 警告：`{failed_layers}` 層失敗，部分問題可能未被發現。**

**If `{failed_layers}` contains all of ["blind","edge","auditor","security","perf"] AND `{saas_findings}` is empty:**
Output: ⚠️ **嚴重警告：所有層均失敗且 SaaS 審計無結果。不得宣告 clean review。**

> 使用 **contains all of**(超集判定)而非陣列相等,對齊 `step-03-triple-layer-dispatch.md:366` 的同一條件。若改用相等判定,`{failed_layers}` 額外含 `"db"`(Layer F 也失敗)這個**更差**的狀態反而不會觸發本警告。

**`{has_db_changes}` = false 時**：Layer F 未啟動屬設計預期(`step-03-triple-layer-dispatch.md:273`)，`db` 不視為無條件必需層 —— `{db_findings}` 視為空集,不觸發本節任何缺層警告。

### 2. Normalize All Findings (BR-05)

Convert all inputs to unified Finding format:

```typescript
interface Finding {
  id: number;           // sequential 1, 2, 3...
  source: string;       // "blind" | "edge" | "auditor" | "saas" | "security-expert" | "perf-expert" | "db-reviewer"
  title: string;
  detail: string;
  location: string;     // "file:line" or ""
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";  // 暫定 hint (subagent-provided, advisory only) — 見 §3.8 Severity Calibration
  dimension: string;    // SaaS dimension name
  bucket: string;       // set in Step 3 below
  fix_suggestion?: string;
}
```

> **INFO 前置過濾(適用全部七個來源,建構 `Finding` 之前執行)**：任一來源的原始項目若 `severity == "INFO"`，在建構 `Finding` **之前**即予 dismiss —— 計入 `{dismissed_count}`(於 §6 摘要另行分列筆數，避免與 §4 triage 判定的 dismiss 混為一談)，不加入 `{unified_findings}`，不進入 §4 分類、不進入 §5 計分。`Finding.severity` 維持既有四值聯集(`CRITICAL` | `HIGH` | `MEDIUM` | `LOW`)不變，本過濾規則不擴充該值域。
>
> **例外 —— HALT 診斷不得靜默吞掉**：若某來源的**全部**輸出僅為單一 halt 診斷項(`location` = `"N/A"`，或 `trigger_condition` 以 `File not found` / 空輸入類字樣起始 —— 見 `.claude/skills/edge-case-hunter/SKILL.md` HALT CONDITIONS)，該項代表**該層根本沒跑成**而非「查無問題」。此時 MUST 將該層名稱追加至 `{failed_layers}` 後再 dismiss 該項，使 §1 Incomplete Review Guard 正常告警。否則 halt 掉的一層會與「乾淨通過」無法區分(fail-silent)。

**From `{blind_findings}` (Markdown list):**
Parse each `- **[SEVERITY][DIMENSION]** title` entry:
- `source` = "blind"
- Extract severity(暫定 hint,advisory only — 見 §3.8 Severity Calibration), dimension, title, detail, location from Markdown structure

**From `{edge_findings}` (JSON array):**
Parse each `{ location, trigger_condition, guard_snippet, potential_consequence, severity }`:
- `source` = "edge"
- `title` = trigger_condition (truncated to 80 chars)
- `detail` = potential_consequence
- `fix_suggestion` = guard_snippet
- Map severity(暫定 hint,advisory only — 見 §3.8 Severity Calibration); infer dimension from content (Scalability/DataConsistency/MigrationIntegrity/ErrorHandling/Skill FORBIDDEN)

**From `{auditor_findings}` (Markdown list):**
Parse each finding entry:
- `source` = "auditor"
- Extract severity(暫定 hint,advisory only — 見 §3.8 Severity Calibration), dimension (Compliance/TestCoverage), title, detail, location

**From `{saas_findings}` (already structured):**
- `source` = "saas"
- Pass through directly
- **Fallback 來源標記**：`step-03-triple-layer-dispatch.md:374` / `:377` 於 Layer D / E 失敗時，由 main thread 補跑並將 findings **併入 `{saas_findings}`**，標記 `security-expert-fallback` / `perf-expert-fallback`。這兩個字面**不是** `Finding.source` 的合法值 —— 正規化時 `source` 仍設為 `"saas"`(其 provenance 確為 main thread，具完整專案讀取權限，故正確地**不**落入 §3.8 Step B 不採信清單)，原始 fallback 字面併入 `detail` 保留追溯。§6 Source 表計入 `saas` 列。

**From `{security_findings}` (JSON array, Layer D Security Expert):**
Parse each `{ severity, category:"security", subcategory, file, line, description, fix_suggestion, cwe_id }` entry(schema 見 `step-03-triple-layer-dispatch.md:183`)：
- `source` = "security-expert"
- `title` = `description` 截斷至 80 字元
- `detail` = `description`；若 `cwe_id` 存在則附加 `(CWE: {cwe_id})`
- `location` = `"{file}:{line}"`，`line` 缺漏時為 `""`
- `fix_suggestion` = 直接傳遞
- `dimension` = 依下表由 `subcategory` 推導(BR-004)

| `subcategory` | → `dimension` | 說明 |
|---|---|---|
| `A01`–`A10`(任一 OWASP 編號) | `Security` | 直接對應 |
| `phycool-specific/ECPay` | `Security` | 付款簽章缺陷屬驗證/完整性問題 |
| `phycool-specific/KeyVault` | `Security` | 機密管理 |
| `phycool-specific/BackOffice` | `SkillFORBIDDEN` | ADR-URL-001 namespace/route 隔離,已由 Layer B 歸入此維度 |
| `phycool-specific/CanvasData` | `SkillFORBIDDEN` | Base64/>500KB/全量傳輸為 CLAUDE.md Forbidden Patterns 逐字項目 |
| `phycool-specific/AuthRBAC` | `Security` | 授權 |
| `phycool-specific`(**裸值,無斜線子類**) | 先依 `description` 內容比對 `step-03` items 13-17 判定屬 ECPay / KeyVault / BackOffice / CanvasData / AuthRBAC 何者,再套用上列;判不出來時 → `Security` | **必要列** —— producer schema(`step-03:183`)宣告的值域是 `"<OWASP-A0X \| phycool-specific>"`,**未**規定 `phycool-specific/<Name>` 斜線子類。若無本列,上方兩條 `SkillFORBIDDEN` 路由在實務上不可達,BackOffice / CanvasData 違規會全數落入 `Security` 預設 |
| *未識別 subcategory* | `Security` | 安全預設 —— `category` 已是 security,不得靜默丟棄 |

> **OWASP 編號書寫差異**:producer 寫 `OWASP-A0X`(單碼位佔位,字面不涵蓋 `A10`),本表寫 `A01`–`A10`。比對時以**是否含 OWASP 編號**為準(`A01`–`A10`,含前綴 `OWASP-` 與否皆可),不做字面全等,以免 `A10` 或 `OWASP-A03` 之類寫法落入未識別列。

**From `{perf_findings}` (JSON array, Layer E Perf Expert):**
Parse each `{ severity, category:"performance", subcategory, file, line, description, fix_suggestion, perf_impact_estimate }` entry(schema 見 `step-03-triple-layer-dispatch.md:261`)：
- `source` = "perf-expert"
- `title` = `description` 截斷至 80 字元
- `detail` = `description`；若 `perf_impact_estimate` 存在則附加 `(Impact: {perf_impact_estimate})`
- `location` = `"{file}:{line}"`，`line` 缺漏時為 `""`
- `fix_suggestion` = 直接傳遞
- `dimension` = 依下表由 `subcategory` 推導(BR-005,全函數 —— 十值全數對映)

| `subcategory` | → `dimension` | 說明 |
|---|---|---|
| `query` | `Scalability` | N+1 / 缺 index / 提早 materialize |
| `algo` | `Scalability` | O(n²) / 低效 LINQ,隨資料量惡化 |
| `async` | `DataConsistency` | `.Result`/`.Wait()` deadlock + lock contention 屬並發正確性缺陷 |
| `memory` | `ErrorHandling` | 未 dispose / 事件未取消訂閱屬資源清理缺陷 |
| `cache` | `Scalability` | Cache stampede / 缺快取屬負載問題 |
| `http` | `ErrorHandling` | 缺 timeout/retry/circuit breaker 屬優雅降級 |
| `pool` | `Scalability` | 連線池耗盡屬飽和限制 |
| `hotpath` | `Observability` | 高頻端點需先被量測才可行動 |
| `gc` | `Scalability` | 熱路徑配置壓力隨負載惡化 |
| `frontend` | `UIBehavioral` | `.tsx` 重渲染/bundle size/layout thrashing 屬 UI 維度 |
| *未識別* | `Scalability` | 安全預設,對齊 `step-03:335` main thread fallback 路徑 |

**From `{db_findings}` (JSON array, Layer F DB Reviewer; 僅 `{has_db_changes}` = true 時存在,否則視為空集 — BR-002):**
Parse each `{ severity, category:"database", subcategory, file, line, description, fix_suggestion }` entry(schema 見 `step-03-triple-layer-dispatch.md:313`)：
- `source` = "db-reviewer"
- `title` = `description` 截斷至 80 字元
- `detail` = `description`
- `location` = `"{file}:{line}"`，`line` 缺漏時為 `""`
- `fix_suggestion` = 直接傳遞
- `dimension` = 依下表由 `subcategory` 推導(BR-006,全函數 —— 六值全數對映)

| `subcategory` | → `dimension` | 說明 |
|---|---|---|
| `migration` | `MigrationIntegrity` | 直接對應 |
| `pk` | `MigrationIntegrity` | PK 策略違反屬 schema 完整性缺陷 |
| `index` | `Scalability` | 缺 FK/WHERE/ORDER BY index 屬查詢效能缺陷,與 Layer E `query` 一致 |
| `null` | `DataConsistency` | NOT NULL 缺 default / nullable 與 `string?` 不一致屬資料正確性 |
| `spec` | `MigrationIntegrity` | Migration 與 SDD Spec 漂移屬 schema 完整性 |
| `retention` | `Compliance` | 稽核欄位 + IDD-REG-001 180 天標記屬 GDPR/保存規範 |
| *未識別* | `MigrationIntegrity` | 安全預設,對齊 `step-03:371` 既有 Layer F fallback 指示(「手動執行 MigrationIntegrity 維度」) |

### 3. Deduplicate (BR-05)

Group findings by location (`file:line`) as an initial candidate grouping.
Within each group, merge ONLY when **same claim AND same required action** both hold:

- **Same claim**：兩筆 finding 描述的是同一個底層問題 / 風險(而非同位置但不同性質的問題)
- **Same required action**：兩筆 finding 建議的必要修法本質相同(如同樣需要加鎖 / 同樣需要 null guard),而非不同修法

**若 same claim AND same required action 皆成立 → 合併為一筆**：
- **Base 選取規則**：以「location 最精確者」為 base —— 有精確 `file:line` 者優先於純敘述性(僅檔名或無 location)者;**若精確度相同**(如兩筆同為 `file:120`),取 `{blind_findings}` → `{edge_findings}` → `{auditor_findings}` → `{security_findings}` → `{perf_findings}` → `{db_findings}` → `{saas_findings}` 的處理順序中先到者為 base,確保重跑結果一致
- `source` = concatenated values (e.g., "blind+saas", "edge+auditor")
- `severity` = highest of merged(暫定值 — §3.8 Severity Calibration 前的 placeholder,實際定級由 triage 主線於 §3.8 依讀碼結果獨立重新指派)
- `detail` = base 的 detail,併入其餘 finding 獨有的 detail / reasoning / location 內容
- `fix_suggestion` = best available

**若 claim 不同 或 required action 不同(即使同 file:line)→ 不合併**,兩筆各自保留,分別進入 §4 分類。

**若不同 location → 一律不合併，保留兩筆。**

**範例對照**：

| 情境 | 判定 |
|------|------|
| 同 `PaymentService.cs:87`,A 說「缺 null guard」、B 說「缺分散式鎖」 | claim 不同 → **不併**,兩筆各自進 §4 分類 |
| 同 `OrderService.cs:120`,A(edge)說「並發雙寫」、B(saas)說「缺樂觀鎖」,修法皆為加 `RowVersion` | claim + action 皆同 → **併**,base 取有精確 `:120` 者 |

### 3.5. 5-Min Rule Pre-Filter (Framework v1.3)

> **REF:** `phycool-debt-registry` §6 — Quick Fix Inline
>
> **核心原則**: 符合 5-Minute 條件的 finding，**禁止**標記為 defer 或 dismiss，**必須**強制改為 patch 並在 Step 4 inline 修復。

**For EACH finding in normalized+deduped list (before bucket classification):**

**Step A: Check 5-Min Blacklist (排除項目 — 不適用 5-Min Rule)**

| Blacklist 條件 | 說明 |
|---------------|------|
| 跨檔變更 | fix 需修改 ≥2 個檔案 |
| API / Component prop 變更 | public interface 改動 |
| DB schema 變更 | Migration 相關 |
| `[Intentional:]` 標註區域 | IDD 保護區，禁止自動修改 |
| 測試新增 / 修改 | 需要新測試或改現有測試 |
| 條件邏輯變更 | if/else/switch 分支改動 |

If ANY blacklist condition matches → **skip 5-Min Rule**, proceed to Section 4 classification.

**Step B: Check 5-Min Whitelist (5 條件全部滿足才適用)**

| 條件 | 說明 |
|------|------|
| ≤ 5 行 code change | 修改量極小 |
| 0 跨檔依賴 | 只改本檔 |
| 0 副作用 | public API / DB schema 不變 |
| 0 test break 風險 | 不觸動邏輯分支 |
| ≤ 5 分鐘可完成 | 快速修復 |

**Quick Fix Whitelist 範例** (明確可修):
- 硬編碼字串提取常數 (< 3 處引用)
- 變數命名一致化 (本檔內)
- 加 `const` / `readonly` / type annotation
- typo 修正 (comment / variable / log message)
- 移除 dead import / unused variable
- `console.log` → `logger.debug`
- 加缺失的 nullish check (本地變數)
- 修正 JSDoc / XML doc 拼寫

**Step C: Reclassify**

If ALL 5 conditions met AND NOT on Blacklist:
- Force `bucket` = `patch`
- Tag finding with `[5-Min Rule]`
- These findings will be auto-fixed inline in Step 4

**Output:** `5-Min Rule: N findings reclassified from defer/dismiss to patch`

---

### 3.8. Severity Calibration (上游 BMAD v6.10 #2523 蒸餾)

> **核心原則**：審查子代理(Layer A Blind Hunter / Layer B Edge Case Hunter / Layer C Acceptance Auditor / Layer D Security Expert / Layer E Performance Expert / Layer F DB Schema Reviewer,見 `step-03-triple-layer-dispatch.md` §2)處於 by-design 資訊不對稱 —— 各子代理只看 diff hunk(`step-03b-edge-case-hunter.md` BR-02 ISOLATION RULE 甚至明文禁止讀 spec / AC / story context),看不到完整 call site,由此帶出的 severity 容易失真。**審查子代理的 severity 一律不採信**,triage 主線在最終定級前必須獨立重新評估。
>
> **範圍註**:`{saas_findings}` **不在**不採信範圍 —— 其由 main thread 產出(`step-03-triple-layer-dispatch.md` BR-06),具完整專案讀取權限,無子代理式資訊不對稱;但仍受 Step A 讀碼定級紀律約束。

**Step A — 讀碼定級紀律(MANDATORY)**：

對每一筆已去重(§3)且通過 5-Min Rule 篩選(§3.5)的 finding,**評級前必讀 finding 周邊原始碼**:
- 開啟該 finding `location` 指向的原始檔
- 讀取足以判斷可達性的周邊程式碼:call sites / guards / validation(含 diff hunk 之外者)
- **禁止僅憑 diff hunk 評級** —— diff hunk 本身不足以判斷 severity(缺呼叫端上下文,無法判斷真實可達性)
- **`location` 為空或僅到 hunk 層級時**(Finding interface 允許 `location` = `""`,edge hunter 亦可回 `file:hunk`):改讀該 finding 所屬變更檔的**完整內容**進行定級;若連檔名都無法解析,於 `detail` 註記「severity 未經讀碼校準」並於 §4 以最保守可辯護級別分類 —— **不得**因無法讀碼就回退直接採信子代理 severity

**Step B — 子代理 severity 不採信**：

**審查子代理的 severity 一律不採信** —— `source` 含 "blind"/"edge"/"auditor"/"security-expert"/"perf-expert"/"db-reviewer" 的 finding,其原始 `severity` 欄位(§2 標記的暫定 hint)僅作為 Step C 重新定級時的排序參考輸入,不得直接沿用作最終 `severity`。理由:子代理處於 by-design 資訊不對稱,只看 diff、看不到完整 call site。

**Step C — 獨立重新定級**：

依 Step A 讀碼結果,triage 主線獨立指派最終 `severity`(CRITICAL/HIGH/MEDIUM/LOW),覆寫 §2/§3 沿用的子代理暫定值。此最終值供 §4 Classify 與 §5 Score 使用。

**邊界**：子代理 output schema 的 `severity` 欄位 MUST-include 契約不變(`step-03a-blind-hunter.md:108` / `step-03b-edge-case-hunter.md:134`)—— 只是下游 triage 不再直接採信其值,仍需其作為排序輸入。

---

### 4. Classify Each Finding

For EACH finding in normalized+deduped list, assign `bucket`:

| Bucket | Criteria |
|--------|----------|
| `patch` | CRITICAL / HIGH / fixable MEDIUM — fix in this review |
| `defer` | Architecture change required / cross-module dependency / MEDIUM-LOW out of scope |
| `dismiss` | False positive / style preference / duplicate of already-fixed item |

**Classification rules:**
- CRITICAL → always `patch`
- HIGH → `patch` unless cross-module architecture change needed
- MEDIUM → `patch` if straightforward fix; `defer` if requires separate story
- LOW → `patch` if trivial (1-line fix); `defer` or `dismiss` otherwise
- Style-only → `dismiss`

Set `{dismissed_count}` = count of `bucket == "dismiss"` findings.
Drop dismissed findings from `{unified_findings}`.

### 5. Calculate SaaS Readiness Score (BR-07)

> Score is calculated from DEDUPED, NON-DISMISSED findings only (avoid double-counting).

```
Base: 100
CRITICAL finding: -25 each
HIGH finding: -10 each
MEDIUM finding: -5 each
LOW finding: -2 each
Minimum: 0
```

Store as `{saas_readiness_score}`.

### 6. Final Output Summary

```
## Triage Summary
Total findings (before dedup): {pre_dedup_count}
After dedup: {post_dedup_count} (dismissed: {dismissed_count} — 其中 §2 前置過濾 N,§4 triage 判定 M)

| Bucket | Count | Severity Distribution |
|--------|-------|----------------------|
| patch  | N     | C:X H:Y M:Z L:W      |
| defer  | N     | ...                   |

| Source          | Unique Findings |
|-----------------|----------------|
| blind           | N               |
| edge            | N               |
| auditor         | N               |
| security-expert | N               |
| perf-expert     | N               |
| db-reviewer     | N (0 or — if `{has_db_changes}` = false) |
| saas            | N               |
| merged          | N               |

SaaS Readiness Score: {saas_readiness_score}/100 {if < 70: ⚠️ BELOW THRESHOLD}
```

---

## SUCCESS METRICS

- All 7 finding sources normalized to unified format (severity marked as tentative hint)
- Dedup applied (same claim AND same required action merged; base = most precise location)
- Severity independently recalibrated by triage mainline after reading surrounding code (§3.8) — subagent-provided severity treated as advisory hint only, never adopted directly
- All findings classified into patch/defer/dismiss (using §3.8-calibrated severity)
- `{dismissed_count}` set
- `{unified_findings}` contains only non-dismissed findings
- `{saas_readiness_score}` calculated from deduped list
- Score not double-counted for merged findings

## FAILURE MODES

- Skipping normalization (passing raw format to downstream)
- Merging findings that share file:line but differ in claim or required action (over-merging — loses distinct fix guidance)
- Adopting subagent-provided severity directly without §3.8 independent recalibration (evaluating solely from diff hunk without reading surrounding call sites)
- Double-counting merged findings in score
- Including dismissed findings in `{unified_findings}`
- Not warning about failed layers

---

**NEXT:** Load `step-04-present-autofix.md`
