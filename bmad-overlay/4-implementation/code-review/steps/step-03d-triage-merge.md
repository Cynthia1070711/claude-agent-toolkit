---
name: 'step-03d-triage-merge'
description: 'Triage: normalize all findings, dedup by file:line, classify patch/defer/dismiss, calculate SaaS Readiness Score'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/code-review'
thisStepFile: '{workflow_path}/steps/step-03d-triage-merge.md'
nextStepFile: '{workflow_path}/steps/step-04-present-autofix.md'
---

# Step 3d: Triage & Merge

**Goal:** 正規化四組 findings → 去重 → 分類 → 計算 SaaS Readiness Score。

---

## AVAILABLE STATE

- `{blind_findings}` — Markdown list (from Step 3a)
- `{edge_findings}` — JSON array (from Step 3b)
- `{auditor_findings}` — Markdown list (from Step 3c)
- `{saas_findings}` — Finding[] (from Step 3 main thread)
- `{failed_layers}` — failed layer names

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

**If `{failed_layers}` = ["blind","edge","auditor"] AND `{saas_findings}` is empty:**
Output: ⚠️ **嚴重警告：所有層均失敗且 SaaS 審計無結果。不得宣告 clean review。**

### 2. Normalize All Findings (BR-05)

Convert all inputs to unified Finding format:

```typescript
interface Finding {
  id: number;           // sequential 1, 2, 3...
  source: string;       // "blind" | "edge" | "auditor" | "saas"
  title: string;
  detail: string;
  location: string;     // "file:line" or ""
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  dimension: string;    // SaaS dimension name
  bucket: string;       // set in Step 3 below
  fix_suggestion?: string;
}
```

**From `{blind_findings}` (Markdown list):**
Parse each `- **[SEVERITY][DIMENSION]** title` entry:
- `source` = "blind"
- Extract severity, dimension, title, detail, location from Markdown structure

**From `{edge_findings}` (JSON array):**
Parse each `{ location, trigger_condition, guard_snippet, potential_consequence, severity }`:
- `source` = "edge"
- `title` = trigger_condition (truncated to 80 chars)
- `detail` = potential_consequence
- `fix_suggestion` = guard_snippet
- Map severity; infer dimension from content (Scalability/DataConsistency/MigrationIntegrity/ErrorHandling/Skill FORBIDDEN)

**From `{auditor_findings}` (Markdown list):**
Parse each finding entry:
- `source` = "auditor"
- Extract severity, dimension (Compliance/TestCoverage), title, detail, location

**From `{saas_findings}` (already structured):**
- `source` = "saas"
- Pass through directly

### 3. Deduplicate (BR-05)

Group findings by location (`file:line`).
Within each group, compare titles using fuzzy similarity (same keyword overlap > 60%):

**If same file:line AND similar title:**
- Keep ONE merged finding
- `source` = concatenated values (e.g., "blind+saas", "edge+auditor")
- `severity` = highest of merged
- `detail` = combined detail from both
- `fix_suggestion` = best available

**If different location OR dissimilar title:** keep both.

### 3.5. 5-Min Rule Pre-Filter (Framework v1.3)

> **REF:** `pcpt-debt-registry` §6 — Quick Fix Inline
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
After dedup: {post_dedup_count} (dismissed: {dismissed_count})

| Bucket | Count | Severity Distribution |
|--------|-------|----------------------|
| patch  | N     | C:X H:Y M:Z L:W      |
| defer  | N     | ...                   |

| Source | Unique Findings |
|--------|----------------|
| blind  | N               |
| edge   | N               |
| auditor| N               |
| saas   | N               |
| merged | N               |

SaaS Readiness Score: {saas_readiness_score}/100 {if < 70: ⚠️ BELOW THRESHOLD}
```

---

## SUCCESS METRICS

- All 4 finding sources normalized to unified format
- Dedup applied (same file:line + similar title merged)
- All findings classified into patch/defer/dismiss
- `{dismissed_count}` set
- `{unified_findings}` contains only non-dismissed findings
- `{saas_readiness_score}` calculated from deduped list
- Score not double-counted for merged findings

## FAILURE MODES

- Skipping normalization (passing raw format to downstream)
- Not merging same file:line findings
- Double-counting merged findings in score
- Including dismissed findings in `{unified_findings}`
- Not warning about failed layers

---

**NEXT:** Load `step-04-present-autofix.md`
