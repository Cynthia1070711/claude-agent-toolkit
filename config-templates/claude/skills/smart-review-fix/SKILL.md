---
name: smart-review-fix
description: >
  Smart Review-Fix Pipeline — Closed-loop system integrating
  review-analyst + party-to-pipeline + bug-fix-verification.
  Phases: Discover -> Analyze -> Create -> Fix -> Verify.
  v1.2: E2E Loop Mode — 智能循環修復模式（E2E 測試驅動即時修復閉環）。
  觸發關鍵字：smart-review-fix, review-fix, auto-fix pipeline, e2e-loop, 循環修復
version: 1.2.3
updated: 2026-07-28
disable-model-invocation: true
triggers:
  - smart review
  - review-fix
  - auto-fix pipeline
author: CC-OPUS
created: 2026-03-23
watches:
  - glob: ".claude/skills/smart-review-fix/scripts/*.ps1"
    domain: review
last-synced-epic: epic-tdb
last-synced-date: 2026-07-28
---

# Smart Review-Fix Pipeline v1.2.0

> 整合 `phycool-review-analyst`（全方位審查）+ `party-to-pipeline`（討論→Pipeline 委派）+ `bug-fix-verification`（驗證回填）
> 形成 **發現 → 分析 → 建立 → 修復 → 驗證** 五階段閉環系統

## Reference Files

| File | Content |
|------|---------|
| [`references/mode-standard-pipeline.md`](references/mode-standard-pipeline.md) | Standard Pipeline 完整流程（Phase 1~5） |
| [`references/mode-e2e-loop.md`](references/mode-e2e-loop.md) | E2E Loop Mode 完整流程（Phase L0~L5） |
| [`references/test-data-reference.md`](references/test-data-reference.md) | E2E 測試路徑 + 帳號矩陣 + RBAC 權限 |

---

## §0 Control Center Protocol (CRITICAL)

**使用本 Skill 時，當前對話即為智能中控（CC-OPUS 指揮官模式）。**

### 中控角色定義

| 中控做的事 | 中控不做的事 |
|-----------|-------------|
| 規劃階段任務與優先級 | 執行程式碼審查（交給 review-runner.ps1） |
| 分析審查結果、制定修復策略 | 執行 dev-story/code-review（交給 pipeline） |
| 建立 Story 框架（輕量 DB 寫入） | 完整 codebase scan（交給 create-story 子視窗） |
| 規劃批次排程 + 衝突矩陣 | 直接修改 src/ 程式碼 |
| 監控子視窗完成狀態 | 長時間等待（用 run_in_background） |
| 讀取結果 → 判斷下一步 | 重複子視窗已完成的工作 |
| 驗證修復 + 回填 DB | 操作 Chrome MCP（E2E Loop 專屬子視窗） |

### 執行委派模式

所有「做事」都透過子視窗 Pipeline 執行。中控使用 **Bash `run_in_background`** 啟動：

```
中控流程：
  規劃 → 啟動子視窗(run_in_background) → 繼續對話/等通知
       → 收到完成通知 → Read 結果(YAML/DB) → 判斷下一步
       → 啟動下一批子視窗 → ... → 最終驗證
```

### 可調用的既有 Pipeline

| Pipeline | Script | 用途 |
|----------|--------|------|
| **審查批次** | `review-batch.ps1` | Phase 1: code/security/e2e 批次審查 |
| **審查單任務** | `review-runner.ps1` | Phase 1: 單模組審查 |
| **SRF Story Pipeline** | `srf-story-pipeline.ps1` | Phase 4: 修復專用 wrapper（含 G1/G3 後處理） |
| **Story 完整管線** | `story-pipeline-interactive.ps1` | Phase 4A: create→dev→code-review |

---

## §1 Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    Smart Review-Fix Closed Loop                            │
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    中控（當前對話 · CC-OPUS）                         │   │
│  │  規劃 → 委派 → 監控 → 分析 → 判斷 → 委派 → ... → 驗證 → 報告      │   │
│  └──┬──────────┬──────────┬──────────┬──────────┬───────────────────┘   │
│     │          │          │          │          │                        │
│     ▼          ▼          ▼          ▼          ▼                        │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────────┐  ┌──────┐                  │
│  │review │  │review │  │review │  │ pipeline │  │verify │  (子視窗群)    │
│  │-batch │  │-runner│  │-runner│  │-interactv│  │-fixes │                │
│  │.ps1   │  │.ps1   │  │.ps1   │  │ .ps1     │  │.js    │                │
│  │(code) │  │(secur)│  │(e2e)  │  │(fix×N)   │  │       │                │
│  └──────┘  └──────┘  └──────┘  └──────────┘  └──────┘                  │
│                                                                            │
│  ◄────────────── review_findings DB 貫穿全程 ──────────────────────►      │
│  Phase 5 殘留 Bug ──→ 回到 Phase 2（閉環迭代）                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### Component Dependency

| Component | Role | Invocation |
|-----------|------|-----------|
| `phycool-review-analyst` | Phase 1 全方位審查引擎 | `review-batch.ps1` / `review-runner.ps1` |
| `party-to-pipeline` | Phase 2-3 輕量框架 + 動態排程 | 中控遵循 SOP |
| `bug-fix-verification` | Phase 5 驗證模式 | 中控 Read + 腳本回填 |
| `claude-launcher-interactive` | Phase 4 Pipeline 執行器 | `story-pipeline-interactive.ps1` |
| `group-findings-to-stories.js` | Phase 2-3 Bug 分組→Story | 中控直接呼叫 |
| `verify-fixes-against-findings.js` | Phase 5 批次驗證回填 | 中控直接呼叫 |

---

## §2 Execution Modes

| Mode | Command | Phases | Description |
|------|---------|--------|-------------|
| **full** | `/smart-review-fix full {modules}` | 1→2→3→4→5 | 完整閉環（發現→修復→驗證） |
| **review** | `/smart-review-fix review {modules}` | 1 | 僅審查，產出 Bug 清單 |
| **analyze** | `/smart-review-fix analyze [--plan ID]` | 2→3 | 分析既有 findings → 建 Story |
| **fix** | `/smart-review-fix fix {epic-id}` | 4 | 執行修復 Pipeline（Workflow 模式） |
| **direct-fix** | `/smart-review-fix direct-fix {epic-id}` | 4 | 直接修復（跳過 Workflow） |
| **verify** | `/smart-review-fix verify {epic-id}` | 5 | 驗證修復 + 回填 |
| **report** | `/smart-review-fix report {epic-id}` | 統計 | 閉環報告 |
| **e2e-loop** | `/smart-review-fix e2e-loop [scope]` | L0→L5 | E2E 測試驅動即時修復閉環 |

### Mode Dispatch Rule

| Phase / Mode | 中控做 | 子視窗做 |
|-------------|--------|---------|
| Phase 1 (review) | 規劃模組 + 寫 Plan DB + 啟動 `review-batch.ps1` | 執行 code/security/e2e 審查 |
| Phase 2 (analyze) | 查詢 findings + 載入 PhyCool Skills + 制定修復策略 | — |
| Phase 3 (create) | 建 Story 框架 + 更新 YAML + 使用者確認 | — |
| Phase 4A (fix) | 規劃排程 + 啟動 `srf-story-pipeline.ps1` | create→dev→code-review |
| Phase 4B (direct-fix) | 規劃排程 + 啟動修復子視窗 | 直接修復（跳過 create-story） |
| Phase 5 (verify) | Read 程式碼 + 回填 DB | — |
| **E2E Loop L0** | 確認伺服器 + Chrome 可連線 | — |
| **E2E Loop L1** | 規劃測試範圍 + 啟動 E2E 子視窗 | **E2E 審核子視窗 (Sonnet)**: Chrome MCP 遍歷 |
| **E2E Loop L2** | 讀取 Bug Report + 分析根因 + 建 Story | — |
| **E2E Loop L3** | 啟動修復子視窗 + 讀取完成狀態 | **修復子視窗 (Sonnet)**: dev-story / direct-fix |
| **E2E Loop L4** | 啟動驗證子視窗 + 讀取複查結果 | **驗證子視窗 (Sonnet)**: Chrome MCP 複查 |
| **E2E Loop L5** | 讀取 DB + 判斷 PASS/FAIL → 繼續或結束 | — |

---

## §3 Standard Pipeline Mode (Phase 1~5)

> **完整操作流程**: [`references/mode-standard-pipeline.md`](references/mode-standard-pipeline.md)

靜態 Code/Security 審查驅動的閉環修復系統。

| Phase | Name | 核心操作 |
|:-----:|------|---------|
| 1 | Full-Spectrum Review | `review-batch.ps1` 批次審查 → findings DB |
| 2 | Analysis & Discussion | 載入 PhyCool Skills + 商業規則衝突檢測 + 修復策略 |
| 3 | Auto-Create Stories | DB-first Story 建立 + tracking files |
| 4 | Fix Execution | srf-story-pipeline.ps1（4A Workflow / 4B Direct-Fix） |
| 5 | Auto-Verify & Backfill | Read 程式碼驗證 + DB 回填 + 閉環迭代 |

**關鍵規則**:
- Phase 2 必須載入對應 PhyCool Skill + 商業規則衝突檢測（`wont_fix`）
- Phase 4 所有修復必須使用 `srf-story-pipeline.ps1`，不直接呼叫 `story-pipeline-interactive.ps1`
- Phase 5 必須 Read 實際程式碼（假陽性率 33%，禁止僅依 Story 狀態判定）

---

## §4 E2E Loop Mode (L0~L5)

> **完整操作流程**: [`references/mode-e2e-loop.md`](references/mode-e2e-loop.md)
> **測試路徑與帳號矩陣**: [`references/test-data-reference.md`](references/test-data-reference.md)

動態瀏覽器測試驅動的即時修復閉環。中控 (Opus) 為純指揮官，委派三類 Sonnet 子視窗執行。

| Phase | Name | 核心操作 |
|:-----:|------|---------|
| L0 | Prerequisites | 確認 Port 7135/5173 + Chrome 可連線 |
| L1 | E2E 探索測試 | **E2E 審核子視窗 (Sonnet)** — Chrome MCP 遍歷功能路徑 |
| L2 | 中控分析 | 讀取 Bug Report + 分析根因 + 建立修復 Story |
| L3 | 啟動修復 | **修復子視窗 (Sonnet)** — dev-story / direct-fix（max 2 並行） |
| L4 | E2E 複查 | **驗證子視窗 (Sonnet)** — Chrome MCP 複查修復路徑 |
| L5 | 循環控制 | PASS→fixed / FAIL→retry / 3 輪→deferred |

**關鍵規則**:
- 中控 = 純指揮官（禁止操作 Chrome MCP / 修改 src/ / 執行 E2E 測試）
- E2E 子視窗 (L1) 與驗證子視窗 (L4) 互斥（Chrome 單連線，不可同時運行）
- Loop 控制: MAX_FIX_ROUNDS=3, MAX_CONCURRENT_FIX=2, MAX_LOOP_ITERATIONS=10

---

## §5 fix_status State Machine

```
                    ┌──────────────┐
                    │     open     │ ← 初始狀態（review-analyst 寫入）
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  fixing  │ │ wont_fix │ │ deferred │
        │ (--link) │ │ (Step2.2b)│ │ (Phase5) │
        └────┬─────┘ └──────────┘ └──────────┘
             │
             ▼
        ┌──────────┐
        │  fixed   │ ← Phase 5 驗證通過
        └──────────┘
             │
             ▼ (若驗證失敗)
        ┌──────────┐
        │   open   │ ← 回到佇列，閉環迭代
        └──────────┘
```

| 狀態 | 設定者 | 說明 |
|------|--------|------|
| `open` | review-analyst | 初始發現，待處理 |
| `fixing` | `--link` 步驟 | 已分配 Story，修復中 |
| `fixed` | Phase 5 驗證 | 已讀程式碼確認修復 |
| `wont_fix` | Step 2.2b | 刻意設計（附 `[INTENTIONAL]` 註記） |
| `deferred` | Phase 5 / 使用者 | 延後修復 |

---

## §6 Script Reference

### srf-story-pipeline.ps1 (SRF 專用 Story Pipeline)

Location: `.claude/skills/smart-review-fix/scripts/srf-story-pipeline.ps1`

| Parameter | Description |
|-----------|-------------|
| `-StoryId` | Target story ID (mandatory) |
| `-FixMode` | `4A` (full workflow) or `4B` (direct-fix) |
| `-TimeoutMin` | Per-story timeout (default 45) |
| `-EpicId` | Target Epic ID |
| `-SkipDev` | Skip dev-story, go to code-review |
| `-DryRun` | Preview only |

**Post-Pipeline Features**: G1 Auto-Correct + G3 Tasks-Backfill + Findings Status Check + Tracking Sync

**啟動方式**:
```powershell
powershell -Command "Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue; Set-Location '{ProjectRoot}'; & './.claude/skills/smart-review-fix/scripts/srf-story-pipeline.ps1' -StoryId '{STORY_ID}' -FixMode '{4A|4B}' -EpicId '{EPIC_ID}' -TimeoutMin {MIN}"
```

### group-findings-to-stories.js

Location: `.context-db/scripts/group-findings-to-stories.js`

| Command | Description |
|---------|-------------|
| `--plan {id} --summary` | Show open findings summary by module |
| `--plan {id} --epic {id} --group` | Preview Story groupings (dry-run) |
| `--plan {id} --epic {id} --create` | Create Stories via upsert-story.js |
| `--plan {id} --epic {id} --link` | Link findings ↔ Stories |
| `--next-epic-id` | Suggest next fix Epic ID |
| `--query --fix-status open [--severity P0]` | Query findings by status |
| `--stats [--epic {id}]` | Fix progress statistics |

### verify-fixes-against-findings.js

Location: `.context-db/scripts/verify-fixes-against-findings.js`

| Command | Description |
|---------|-------------|
| `--epic {id} --prepare` | List findings needing verification |
| `--epic {id} --verify {finding_id} --status fixed` | Mark single finding |
| `--epic {id} --batch-verify --input {json} --agent {id}` | Batch update |
| `--epic {id} --stats` | Verification progress |
| `--epic {id} --remaining` | List unfixed findings |

### smart-review-fix-runner.ps1

Location: `.claude/skills/smart-review-fix/scripts/smart-review-fix-runner.ps1`

| Parameter | Description |
|-----------|-------------|
| `-Mode` | full / review / fix / verify / report |
| `-Modules` | Module list (comma-separated) |
| `-EpicId` | Target Epic ID |
| `-MaxConcurrent` | Parallel limit (default 3) |
| `-TimeoutMin` | Per-story timeout (default 45) |
| `-DryRun` | Preview only, no writes |

---

## §7 Integration Matrix

| Existing Skill | Integration Point | Data Flow |
|---------------|-------------------|-----------|
| `phycool-review-analyst` | Phase 1 (review-batch.ps1) | → review_findings |
| `party-to-pipeline` | Phase 3-4 (Story creation + scheduling) | findings → stories |
| `bug-fix-verification` | Phase 5 (verification patterns) | findings ← code evidence |
| `claude-launcher-interactive` | Phase 4 (pipeline execution) | stories → code changes |
| `phycool-*` domain skills | Phase 2 (constraint loading) | inform fix strategy |
| `phycool-context-memory` | All phases (query + write) | session records |
| `tasks-backfill-verify` | Phase 4 post-pipeline | story tasks verification |
| `story-status-emoji` | Phase 3-5 (status transitions) | H1 emoji sync |

---

## §7.5 Zombie Window Detection (中控責任)

中控在每個 pipeline 完成後應執行殭屍視窗偵測：

```powershell
# 偵測已完成但未關閉的 Claude 子視窗
Get-Process powershell | Where-Object { $_.MainWindowTitle -match 'Claude \[' } |
    ForEach-Object { Write-Host "ZOMBIE: $($_.MainWindowTitle) PID=$($_.Id)" }
```

**自動清理時機**：
- 每個 pipeline batch 完成後
- 全部 Stories 完成後 (Phase 5 前)
- SRF Report 中新增 `Zombie Windows` 欄位

**處理策略**：先 Graceful Close（殺 Claude 子進程），8 秒後 force kill。

---

## §8 Forbidden Patterns (CRITICAL)

### Universal Rules

- Phase 5 不讀程式碼就標記 fixed（必須 Read + file:line 證據）
- Phase 4 串行 `;` 連多 Story（每個獨立 `run_in_background`）
- Phase 1 在主對話執行 code/security/e2e 審查（必須子視窗）
- 修改 review-analyst / party-to-pipeline 的 SKILL.md（本 Skill 是整合層，不改底層）
- 跳過 Phase 2 使用者確認直接建 Story（除非 `--auto-approve`）
- 忽略 PhyCool Skill 約束進行修復（Phase 2 必須載入對應 Skill）
- 時間戳使用 UTC（必須台灣時間 UTC+8）
- 中控直接修改 `src/` 程式碼（所有修復委派子視窗）
- 中控手動 UPDATE stories SET status='done'（必須透過 Pipeline workflow 正確轉換，禁止跳過 code-review/tasks-backfill）
- Phase 3 建立 Story 後不建 tracking file 就啟動 Phase 4（tracking file 是 auto-close fallback 的必要條件）

### Business Rule Protection

- 盲目修復與 PhyCool 刻意設計衝突的 Bug（必須先查記憶庫 decision/feedback）
- 不註記原因就標記 `wont_fix`（必須 `fix_notes` 記錄 `[INTENTIONAL] {reason}`）
- 修復 Free Plan gating / Undo-Redo / 退款猶豫期等已確認的商業決策

### Tasks Backfill

- Story 完成後不執行 `/tasks-backfill-verify`（Pipeline 自動；4B 最簡模式中控手動觸發）
- 未回填的 Story 進入 Phase 5 驗證

### Scheduling

- E2E / Chrome MCP Story 與其他 E2E Story 同時執行（Chrome MCP 單連線，max 1）
- 共享檔案的 Story 排入同一批次（必須 SERIALIZE）
- 有依賴關係的 Story 不按依賴順序啟動（被依賴者必須先完成）

### Mode-Specific Patterns

> **Standard Pipeline**: 詳見 [`references/mode-standard-pipeline.md`](references/mode-standard-pipeline.md)
> - 4A: Phase 3 Story 禁止設 `ready-for-dev`（必須 `backlog`，pipeline 自動 create-story）
> - 4B: M/L/XL 禁止使用 / 必須含 tasks + affected_files / Pre-Flight Checklist 11 項

> **E2E Loop**: 詳見 [`references/mode-e2e-loop.md`](references/mode-e2e-loop.md) §Forbidden Patterns
> - Chrome MCP 互斥（E2E 子視窗 vs 驗證子視窗不可同時運行）
> - 同一 Bug 超過 3 輪 → 必須 `deferred`
> - 中控不操作 Chrome MCP / 不修改程式碼（一律委派子視窗）

---

## §9 Quick Start Examples

### Example 1: Full Pipeline for Editor Module

```
User: /smart-review-fix full editor-core,datasource,image-asset

Agent:
1. Phase 1: review-batch.ps1 → code+security+e2e for 3 modules
2. Phase 2: Load phycool-editor-arch → group 12 bugs → 3 Stories
3. Phase 3: Create epic-fix9 with fix9-01/02/03
4. Phase 4: Dynamic schedule 3 Stories (all parallel, no conflicts)
5. Phase 5: Read code → verify 12 findings → 11 fixed, 1 deferred
6. Report: 91.7% fix rate, 1 deferred (low-priority P3)
```

### Example 2: Analyze Existing Findings

```
User: /smart-review-fix analyze --plan srf-20260323

Agent:
1. Query 45 open findings from plan srf-20260323
2. Group into 8 Stories across 6 modules
3. Present fix plan → user approves with 1 adjustment
4. Create epic-fix9 with 8 Stories
5. User then runs: /smart-review-fix fix epic-fix9
```

### Example 3: Verify After Pipeline

```
User: /smart-review-fix verify epic-fix8

Agent:
1. Query 30 findings linked to epic-fix8
2. All Stories done → start verification
3. Read each file:line → 27 fixed, 3 not fixed
4. Update DB: 27 fixed, 3 remain open
5. Present: "3 P2 bugs remain, create new fix Stories?"
```

### Example 4: E2E Loop Mode

```
User: /smart-review-fix e2e-loop

中控 (CC-OPUS):
1. L0: 確認 Port 7135/5173 + Chrome
2. L1: 啟動 E2E 審核子視窗 (Sonnet) → run_in_background
3. L1→L2: 收到通知 → Read Bug Report：3 異常 (E2E-001~003)
4. L2: 分析根因 → 建 3 Story → 規劃排程
5. L3: 啟動修復子視窗 (Sonnet) × 2
6. L3→L4: 修復完成 → 啟動驗證子視窗 (Sonnet) 複查
7. L4: 2 PASS / 1 FAIL → FAIL 回到 L3 (Round 2)
8. L4: Round 2 PASS → 全部 fixed
9. L5: 產出閉環報告 → SUCCESS
```

---

## Context Recovery (cmi-recovery-01)

SRF is the most complex orchestrator — 5 phases, multiple sub-window types, E2E Loop can run 10+ iterations. Highest risk of context overflow.

- **Phase transition checkpoint**: At each phase boundary, save: `node .context-db/scripts/pipeline-checkpoint.js --save --reasoning "srf: phase={N} stories={list} round={round}"`
- **After each sub-window**: `pipeline-checkpoint.js --update --step {N} --result '{"status":"done","findings":N}'`
- **After compaction**: `session-recovery.js` auto-injects last checkpoint with phase/step/reasoning. Resume from saved phase
- **Stale detection**: E2E Loop iterations >30 min each. `POSSIBLY STALE` warning means sub-window likely crashed — check output file before retry
- **Truncation**: Sub-windows receive `⚠` truncation warnings from `pre-prompt-rag.js` — review/fix quality may be affected by incomplete context
- **PreCompact snapshot**: `.track.md` content (first 500 chars) is saved before compaction — orchestrator can verify task progress after recovery

Full spec: `/phycool-context-memory` §12 Pipeline Context Recovery
