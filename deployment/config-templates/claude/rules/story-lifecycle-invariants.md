---
paths:
  - "src/**"
  - ".context-db/scripts/upsert-story.js"
  - "_bmad/bmm/workflows/**/dev-story/**"
  - "_bmad/bmm/workflows/**/code-review/**"
  - "_bmad/bmm/workflows/**/create-story/**"
  - ".claude/skills/pcpt-create-story-depth-gate/**"
  - "scripts/story-pipeline-interactive.ps1"
---

# Story Lifecycle Invariants

> **Core Principle**: Story 的 `status` × `*_started_at` × `*_completed_at` × `*_agent` 四組欄位構成 **狀態機**。任何一組不一致 = lifecycle 邏輯矛盾,必以機制性強制防止。
>
> **v2.0.0 Update (2026-04-21, td-rule-violation-auto-detect-hook Round-4 rescue)**: 新增 **I8 + I9** 涵蓋 `review_started_at` gap — td-42 建立 I1-I7 時只考慮 `_completed_at` / `_agent` 對稱,遺漏 `_started_at` 欄位。本 CR 暴露該設計缺口並立即修復 4 處(rule + D7 validator + upsert auto-promotion + record-phase-timestamp --ts override)。

## Applies When

以下任一觸發點必驗 9 條不變量:

- `upsert-story.js` `mergeStory()` / `_doUpsert()` 寫入時(Layer 1 auto-promotion)
- `run-depth-gate.js` D7 Self-Write Verification(Layer 5 invariant validator)
- Stop Hook lifecycle audit(Layer 6,選配)
- DevConsole Story 詳情頁顯示時(前端 badge 警告,選配)
- Pipeline `story-pipeline-interactive.ps1` 階段切換前

## 九條 Lifecycle Invariants (v2.0.0 — I8/I9 added 2026-04-21)

### I1 — create-story 完成後 status 不可為 backlog

```
create_completed_at IS NOT NULL  →  status ∈ {ready-for-dev, in-progress, review, done}
```

**觸發事故**: 2026-04-16 td-37-tool-output-preprune 補全後 status 遺留 backlog 未推進(MEMORY.md `.claude/rules/create-story-enrichment.md` 未定義 status 規則)。

### I2 — dev-story 開始後 status 不可回退

```
started_at IS NOT NULL  →  status ∈ {in-progress, review, done}
```

### I3 — dev-story 完成後 status 必為 review 或更後

```
completed_at IS NOT NULL  →  status ∈ {review, done}
```

### I4 — code-review 完成 = Story done

```
review_completed_at IS NOT NULL  →  status = done
```

### I5 — create_agent 與 create_completed_at 對稱

```
create_completed_at IS NOT NULL  ⟺  create_agent IS NOT NULL
```

**為何對稱**: create_agent 表示「誰完成了建立」,缺一即 attribution 失真。

### I6 — dev_agent 與 completed_at 對稱

```
completed_at IS NOT NULL  ⟺  dev_agent IS NOT NULL
```

### I7 — review_agent 與 review_completed_at 對稱

```
review_completed_at IS NOT NULL  ⟺  review_agent IS NOT NULL
```

### I8 — code-review 啟動後 status 必為 review 或更後(2026-04-21 新增)

```
review_started_at IS NOT NULL  →  status ∈ {review, done}
```

**觸發事故**: 2026-04-21 `td-rule-violation-auto-detect-hook` CR 手動執行 workflow 跳過 step-01 §1b `record-phase-timestamp.js review-start` → `review_started_at=NULL` 但 `review_completed_at`+`review_agent` 已寫。I7 對稱 PASS 但 `_started_at` gap 導致 lifecycle 狀態機殘缺。**Systemic impact**: 最近 30 done Story 6.7% (2/30) 同情境(諷刺 `td-42-story-lifecycle-invariants` 自身亦漏)。

### I9 — review_agent 與 review_started_at 對稱(2026-04-21 新增)

```
review_started_at IS NOT NULL  ⟺  review_agent IS NOT NULL
```

**為何對稱**: `review_agent` 表示「誰執行 CR 任務」,若 CR 真正啟動(`_started_at`)應同時寫入 agent attribution;缺一即 lifecycle audit 失真。I9 與 I7 並存互補 — I7 涵蓋結束對稱,I9 涵蓋開始對稱。

---

## Auto-Promotion Rules(由 upsert-story.js 強制執行)

當 merge 模式檢測到 lifecycle 推進 trigger 欄位寫入、且 **status 未明確指定**時,自動推進 status:

| Trigger 欄位 | From status | To status | 備註 |
|-------------|:-----------:|:---------:|------|
| `create_completed_at` | `backlog` | `ready-for-dev` | create-story 完成 |
| `completed_at` | `backlog` / `ready-for-dev` / `in-progress` | `review` | dev-story 完成 |
| `review_completed_at` | `review` | `done` | code-review 完成 |

**原則**:
1. **只在 `updates.status` 未指定時 auto-promote** — 明確設定者優先
2. **只推進不倒退** — `from` list 限定,`done` 等終態不可被 auto-promote 覆蓋
3. **stderr log 輸出** — `🔁 Auto-promoted status: {from} → {to} ({trigger})` 可稽核

### v2.0.0 Implicit Timestamp Backfill(I8/I9 配套)

寫入 `review_completed_at` 時,若 `review_started_at` 為 NULL 則 **COALESCE 同步回填**該值:

```javascript
// upsert-story.js mergeStory() Layer 1 §2 — 新增於 2026-04-21
if (updates.review_completed_at && !existing.review_started_at && !('review_started_at' in updates)) {
  merged.review_started_at = updates.review_completed_at;
  console.log(`🔁 Auto-backfilled review_started_at = review_completed_at (I8/I9 enforcement, manual workflow fallback)`);
}
```

**保守 fallback 邏輯**: 真實 CR `started ≤ completed` 恆成立,若缺 `_started_at` 用 `_completed_at` 同值回填屬安全下界。Manual workflow(非 pipeline)跳過 step-01 §1b 時這層兜底保證 I8/I9 不變量 merge 結束時不破損。

---

## Depth Gate D7 Invariant Validator

`run-depth-gate.js` runD7() 末段必檢查 I1-I4/I8(硬性 BLOCK),對稱 I5-I7/I9 屬 WARN:

```javascript
const INVARIANTS = [
  { id: 'I1', cond: story.create_completed_at && !['ready-for-dev','in-progress','review','done'].includes(story.status),
    msg: `I1: create_completed_at=${story.create_completed_at} but status='${story.status}' (expected ready-for-dev/in-progress/review/done)` },
  { id: 'I2', cond: story.started_at && !['in-progress','review','done'].includes(story.status),
    msg: `I2: started_at set but status='${story.status}' (expected in-progress/review/done)` },
  { id: 'I3', cond: story.completed_at && !['review','done'].includes(story.status),
    msg: `I3: completed_at set but status='${story.status}' (expected review/done)` },
  { id: 'I4', cond: story.review_completed_at && story.status !== 'done',
    msg: `I4: review_completed_at set but status='${story.status}' (expected done)` },
  { id: 'I8', cond: story.review_started_at && !['review','done'].includes(story.status),
    msg: `I8: review_started_at set but status='${story.status}' (expected review/done)` },
];
for (const inv of INVARIANTS) {
  if (inv.cond) { result.blocks.push(`Lifecycle ${inv.msg}`); result.status = 'BLOCK'; }
}

// I5-I7, I9 對稱檢查屬 WARN(Agent 可事後補填)
const SYMMETRY = [
  { id: 'I5', a: 'create_completed_at', b: 'create_agent' },
  { id: 'I6', a: 'completed_at',        b: 'dev_agent'    },
  { id: 'I7', a: 'review_completed_at', b: 'review_agent' },
  { id: 'I9', a: 'review_started_at',   b: 'review_agent' },
];
for (const sym of SYMMETRY) {
  const hasA = !!story[sym.a], hasB = !!story[sym.b];
  if (hasA !== hasB) {
    result.warnings.push(`Lifecycle ${sym.id}: ${sym.a}=${hasA} but ${sym.b}=${hasB} (should be both set or both NULL)`);
    if (result.status === 'PASS') result.status = 'WARN';
  }
}
```

---

## FORBIDDEN

- ❌ 手動 SQL `UPDATE stories SET completed_at=...` 而不更新 status → 破壞 I3
- ❌ 直接 `upsert-story.js --force-replace` 寫混亂 status(繞過 auto-promote)
- ❌ BMM workflow step 僅寫 timestamp 不呼叫 upsert-story.js 更新 status
- ❌ DevConsole 顯示 status 不做 invariant badge 警告使用者(Layer 6 選配)
- ❌ Code review 階段發現 invariant violation 標 DEFERRED 跳過(必 FIXED)

---

## Related Rules

- `.claude/rules/create-story-enrichment.md` — create-story 階段 enrichment 規範
- `.claude/rules/tasks-backfill.md` — dev-story / code-review tasks 回填規範
- `.claude/rules/depth-gate-warn-mandatory-resolution.md` — Depth Gate WARN 政策

## Incident Records

- **2026-04-16 td-37-tool-output-preprune 事件**: 深度補全完成後 status 遺留 backlog,使用者指出需手動修正。根因分析顯示最近 30 done Stories 合規率 create-story 階段僅 93-96%(vs dev/review 100%),15 樣本中只 20% status 正確設 ready-for-dev。觸發本 rule + Layer 1(upsert-story.js auto-promote)+ Layer 5(Depth Gate D7 invariant validator)建立。

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| 1.0.0 | 2026-04-16 | Initial creation. Layer 4 文件化規範,配合 Layer 1 auto-promotion(upsert-story.js)+ Layer 5 invariant validator(run-depth-gate.js D7)。觸發事件:td-37-tool-output-preprune status 遺漏修正後深度分析。 |
| **2.0.0** | **2026-04-21** | **I8/I9 新增涵蓋 `review_started_at`**。觸發事件:`td-rule-violation-auto-detect-hook` CR 手動執行跳過 step-01 §1b `record-phase-timestamp.js review-start` → `review_started_at=NULL` 但 `review_completed_at` + `review_agent` 已寫。I7 對稱 PASS 但 `_started_at` gap。Systemic impact 最近 30 done Story 6.7% (2/30) 同情境(諷刺 td-42 自身亦漏)。同步更新:(a) 本 rule I8/I9;(b) `.claude/skills/pcpt-create-story-depth-gate/scripts/run-depth-gate.js` INVARIANTS+SYMMETRY(三引擎 sync);(c) `.context-db/scripts/upsert-story.js` mergeStory Layer 1 加 review_started_at implicit backfill;(d) `scripts/record-phase-timestamp.js` 加 `--ts <ISO8601>` override 支援 backfill 歷史時間。 |
