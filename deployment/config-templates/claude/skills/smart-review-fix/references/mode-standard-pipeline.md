# Standard Pipeline Mode — Phase 1~5 Closed Loop

> 完整閉環: 發現 → 分析 → 建立 → 修復 → 驗證
> 觸發: `/smart-review-fix full|review|analyze|fix|direct-fix|verify|report`

---

## Phase 1: Full-Spectrum Review (發現 Bug)

### Step 1.1: Module Inventory (主對話)

```
使用 /phycool-review-analyst plan 產出模組清單 + 風險矩陣
```

Agent must:
1. Read `review-standards.md` module classification (18 modules)
2. Identify target modules from user input or scan all
3. Generate Plan ID: `srf-{date}` (e.g., `srf-20260323`)
4. Write plan to DB: `node .context-db/scripts/review-db-writer.js --write-plan '{...}'`

### Step 1.2: Batch Review Launch (子視窗)

```powershell
# 中控端使用 Bash run_in_background
powershell -Command "Set-Location '{ProjectRoot}'; & './.claude/skills/phycool-review-analyst/scripts/review-batch.ps1' -PlanId '{PLAN_ID}' -Tasks @('{MOD}:code', '{MOD}:security', '{MOD}:e2e') -MaxConcurrent 3 -TimeoutMin 30"
```

Concurrency rules (from review-analyst):
- Code + Security: max 3 concurrent
- E2E: max 1 concurrent (Chrome MCP single connection)
- IntervalSec between launches: 10s

### Step 1.3: Auto DB Backfill

review-runner.ps1 automatically executes:
1. `backfill-findings-from-report.cjs` → Markdown bugs → `review_findings` table
2. Story status update

Post-completion, run cross-engine comparison:
```bash
node .context-db/scripts/review-db-writer.js --cross-compare {PLAN_ID}
```

### Step 1.4: Statistics Output

```bash
node .context-db/scripts/review-db-writer.js --stats --plan {PLAN_ID}
```

Output: P0/P1/P2/P3/P4 distribution per module.

---

## Phase 2: Analysis & Discussion (分析討論)

### Core Principle

**PhyCool 專案規範驅動** — 分析每個 Bug 時，自動載入對應 PhyCool Skill 確認修復約束。

### Step 2.1: Query Open Findings

```bash
node .context-db/scripts/group-findings-to-stories.js --plan {PLAN_ID} --summary
```

Output: grouped bug list by module + severity distribution + affected files.

### Step 2.2: Auto-Load PhyCool Skills

| Module Code | Auto-Load Skills |
|-------------|-----------------|
| `editor-core` | phycool-editor-arch, phycool-zustand-patterns |
| `datasource`, `image-asset`, `qr-barcode-serial`, `table-shape` | phycool-editor-arch |
| `admin-*` | phycool-admin-module |
| `admin-member`, `admin-reports` | + phycool-admin-data-ops |
| `admin-settings` | + phycool-branding-siteinfo |
| `payment-subscription` | phycool-payment-subscription |
| `admin-order` | phycool-admin-module + phycool-payment-subscription |
| `pdf-engine` | phycool-pdf-engine |
| `auth` | phycool-auth-identity |
| `business-api` | phycool-business-api |
| `dashboard` | phycool-design-system |
| All modules | phycool-type-canonical, phycool-testing-patterns |

### Step 2.2b: PhyCool Business Rule Conflict Detection (CRITICAL)

部分 Bug 可能與 PhyCool 的**刻意設計決策**衝突。中控必須比對記憶庫和 Skills 過濾「假陽性 Bug」：

**查詢記憶庫**:
```
search_context("business rule", {category: "decision", limit: 10})
search_context("intentional", {category: "feedback", limit: 10})
```

**已知刻意設計（必須跳過修復）**:

| 領域 | 刻意行為 | 記憶庫 ID | 若 Bug 報告建議「修復」→ 標記 |
|------|---------|----------|--------------------------|
| Free Plan | 編輯器不做 Free plan gating，限制僅在 PDF 層 | id=1606 | `wont_fix` — 刻意設計 |
| 產品定位 | 無 Undo/Redo（批次列印 SaaS，非圖像編輯） | id=1606 | `wont_fix` — 產品範圍外 |
| 退款政策 | 7天免費試用+扣款後不退款（無猶豫期/pro-rata） | id=1597 | `wont_fix` — 商業規則 |
| Canvas reset | Y 軸起始 20px（非 0px） | Skill rule | `wont_fix` — 防 translate 衝突 |
| CanvasJson | 禁止 Base64 嵌入（必須 Asset 引用） | Skill rule | `wont_fix` — 架構設計 |

**處理流程**:
1. 對每個 finding，比對上表 + 記憶庫 decision/feedback 記錄
2. 若 finding 的 fix_suggestion 與刻意設計衝突 → 標記 `wont_fix`
3. 在 `fix_notes` 記錄: `[INTENTIONAL] 此行為為刻意設計。原因: {reason}。參考: {memory_id/skill_rule}。`
4. 從修復佇列移除，不建立 Story

**DB 更新**:
```bash
node .context-db/scripts/verify-fixes-against-findings.js \
  --epic {EPIC_ID} --verify {FINDING_ID} --status wont_fix \
  --notes "[INTENTIONAL] {reason}. Ref: {memory_id}" --agent CC-OPUS
```

### Step 2.3: Fix Strategy Discussion

For each module group, analyze and present:

1. **Bug Summary**: Count by severity, common root causes
2. **Fix Approach**: Based on root_cause + fix_suggestion + Skill constraints
3. **Complexity Estimate**: S (1-3 bugs, single file) / M (4-8 bugs, 2-3 files) / L (9-15 bugs, cross-module) / XL (16+ bugs, architecture-level)
4. **Conflict Detection**: Stories sharing `file_path` → cannot run in parallel
5. **Priority Order**: P0 → P1 → P2 → P3 → P4
6. **AC Draft**: Each Bug → Given/When/Then + `[Verifies: BUG-{finding_id}]`

### Step 2.4: User Confirmation

Present the fix plan in table format, wait for user approval before proceeding.

---

## Phase 3: Auto-Create Epic & Stories

### Step 3.1: Create Fix Epic

```bash
node .context-db/scripts/group-findings-to-stories.js --next-epic-id
```

[tdb-2 2026-07-28] Epic 狀態不再手動標記 — `stories` 表 DB-first,Epic 進度由 `getDbEpicProgress()` 依成員 Story 狀態即時聚合推導,無需獨立寫入。

### Step 3.2: Create Stories (DB-first)

```bash
node .context-db/scripts/group-findings-to-stories.js \
  --plan {PLAN_ID} --epic {EPIC_ID} --create
```

Script automatically: generates story_id, builds AC (ATDD format), sets `status: backlog`, calls `upsert-story.js`.

### Step 3.3: Link Findings ↔ Stories

```bash
node .context-db/scripts/group-findings-to-stories.js \
  --plan {PLAN_ID} --epic {EPIC_ID} --link
```

Updates `review_findings`: `fix_story_id` → assigned Story ID, `fix_status` → `'fixing'`

### Step 3.4: ~~Update sprint-status.yaml~~ [tdb-2 2026-07-28 RETIRED — DB-first,`group-findings-to-stories.js --create`(Step 3.2)已呼叫 `upsert-story.js` 寫入,本步驟原為 yaml 額外同步,凍結後無對應動作]

### Step 3.5: Create Tracking Files (MANDATORY)

For each Story, create `docs/tracking/active/{story-id}.track.md`.
**4B 模式例外**: 4B 跳過 create-story，中控必須在啟動 Pipeline 前建立 tracking file。

---

## Phase 4: Fix Execution (修復執行)

### SRF Story Pipeline (v1.1 — 專用 Wrapper)

**所有 Phase 4 修復必須使用 `srf-story-pipeline.ps1`**。

```
架構:
  srf-story-pipeline.ps1              <- Smart Review-Fix 專用 wrapper
    ├── Pre:  4B validation, tracking check, findings link
    ├── Core: story-pipeline-interactive.ps1 (通用 pipeline, 不修改)
    ├── Post: G1 dev-story auto-correct
    ├── Post: G3 tasks-backfill 強檢
    ├── Post: findings verify status check
    └── Post: tracking file sync + actions report
```

**中控啟動方式**:
```powershell
powershell -Command "Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue; Set-Location '{ProjectRoot}'; & './.claude/skills/smart-review-fix/scripts/srf-story-pipeline.ps1' -StoryId '{STORY_ID}' -FixMode '{4A|4B}' -EpicId '{EPIC_ID}' -TimeoutMin {MIN}"
```

### Fix Mode Selection (中控判斷)

| 條件 | 建議模式 | 理由 |
|------|---------|------|
| M/L/XL 複雜度 | **4A Workflow** | 需要 create-story 補全 + TDD + code-review |
| S 複雜度 + 明確 fix_suggestion | **4B Direct-Fix** | 直接修復效率高 |
| P0 緊急修復 | **4B Direct-Fix** | 快速止血 |
| 跨模組影響 | **4A Workflow** | 需要完整 codebase scan |

### Conflict Matrix + Dependency Graph

中控分析三層衝突矩陣：
- **Layer 1 — 檔案衝突**: affected_files 交集 → SERIALIZE
- **Layer 2 — 邏輯依賴**: Story A 修復是 Story B 前提 → SEQUENCE
- **Layer 3 — Chrome MCP 互斥**: E2E Story → 同時只能一個

### Dynamic Scheduling Rules

**併發規則**: 一般 max 3 parallel / E2E max 1 / 維持 2 佇列（一般 + E2E）
**優先級排序**: P0 > P1 > P2 > P3 > P4 / 同級: S > M > L > XL
**動態補位**: slot 空出時檢查 E2E 佇列 → 一般佇列 → 找無衝突 Story → 啟動
**失敗處理**: dev-story timeout → check git diff → auto-correct / 連續失敗 → deferred
**交錯啟動**: 每個 Story 間 `Start-Sleep {N*10}` 秒延遲

### Mode 4A: Workflow Pipeline (create→dev→code-review)

前置: Story status = `backlog` (Phase 3 設定)
Pipeline 自動: backlog → create-story → dev-story → code-review → done

```powershell
# 每個 Story 獨立 run_in_background
powershell -Command "Start-Sleep {N*10}; Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue; Set-Location '{ProjectRoot}'; & './.claude/skills/claude-launcher-interactive/scripts/story-pipeline-interactive.ps1' -StoryId '{STORY_ID}' -TimeoutMin 45"
```

### Mode 4B: Direct-Fix (跳過 Workflow)

> 適用 S 複雜度或 P0 緊急。**4B ≠ 簡化分析**，中控必須做等量 codebase scan + Story 補全。

**4B Pre-Flight Checklist (MANDATORY)**:

| # | 步驟 |
|---|------|
| 1 | 載入 PhyCool Skill — Read SKILL.md 確認約束 |
| 2 | 商業規則衝突檢查 — `search_context("business rule")` |
| 3 | Codebase scan — Read 實際程式碼 + Grep 呼叫點 |
| 4 | 完整 AC — ATDD 格式 + `[Verifies: BUG-{id}]` |
| 5 | 完整 Tasks — 含 file:line 預期位置 |
| 6 | affected_files — 完整清單（含間接影響） |
| 7 | dev_notes — Skill 約束 + 範圍邊界 |
| 8 | Tracking file — `docs/tracking/active/{story-id}.track.md` |
| 9 | Link findings — `fix_status='fixing'` + `fix_story_id` |
| 10 | 標記 — background 含 `"4B Direct-Fix"` |
| 11 | 標記 — discovery_source 含 `"4B"` + `"codebase scan {date}"` |

**Step 4B.3: 純直接修復（極簡模式）**
若連 dev-story 都不需要（如 1 行修復），中控可啟動純修復子視窗。
注意：此模式無 MCP/Skills 支援，僅限極簡修復。

### Monitor & Backfill (中控監控)

1. `search_stories({story_id})` → 確認 Story 狀態(DB-first,sprint-status.yaml 已凍結 2026-07-28)
2. 計算進度: `done/total`
3. Slot 補位: 完成 → 從佇列啟動下一個
4. 異常處理: review 卡住 → 重啟 / 超時 → auto-correct / 連續失敗 → deferred
5. **Tasks 回填驗證 (MANDATORY)**: `/tasks-backfill-verify {story-id}`
6. 全部完成 → 進入 Phase 5

---

## Phase 5: Auto-Verify & Backfill (驗證回填)

### Core Principle (CRITICAL)

**必須 Read 實際程式碼** — 禁止僅依 Story 狀態判定 Bug 已修復。（假陽性率 33%）

### Step 5.1: Prepare Verification List

```bash
node .context-db/scripts/verify-fixes-against-findings.js --epic {EPIC_ID} --prepare
```

### Step 5.2: Code Verification (逐項)

For each Finding:
1. **Read** actual code at `file_path:line_number`
2. **Compare** against bug description + root_cause + fix_suggestion
3. **Check** no regression
4. **Verdict**: Fixed → `fix_status = 'fixed'` / Not Fixed → `fix_status = 'open'` / Deferred

### Step 5.3: Batch Update DB

```bash
node .context-db/scripts/verify-fixes-against-findings.js \
  --epic {EPIC_ID} --batch-verify --input verification-results.json --agent CC-OPUS
```

### Step 5.4: Handle Remaining Bugs (閉環)

- If > 0 P0/P1 remain: **auto-trigger Phase 2** → new Stories → closed loop
- If only P2+: present to user for decision (fix or defer)

---

## Closed-Loop Report

**Output Path**: `docs/implementation-artifacts/reports/review/smart-fix/{EPIC_ID}-summary.md`

Report sections: 審查範圍 / Bug 統計 / 修復統計 / 模組健康度 / PhyCool 規範遵循 / 殘留項目 / 閉環迭代紀錄

### DB Write + Memory DB Session

1. Update review plan status: `review-db-writer.js --update-report`
2. Context Memory session 回填 (MANDATORY)
3. 商業規則衝突記錄

---

## fix_status State Machine

```
open → fixing (--link) → fixed (Phase 5 驗證通過)
open → wont_fix (Step 2.2b 刻意設計)
open → deferred (Phase 5 / 使用者)
fixed → open (驗證失敗，回到佇列)
```

| 狀態 | 設定者 | 說明 |
|------|--------|------|
| `open` | review-analyst | 初始發現，待處理 |
| `fixing` | `--link` 步驟 | 已分配 Story，修復中 |
| `fixed` | Phase 5 驗證 | 已讀程式碼確認修復 |
| `wont_fix` | Step 2.2b | 刻意設計（附 `[INTENTIONAL]` 註記） |
| `deferred` | Phase 5 / 使用者 | 延後修復 |
