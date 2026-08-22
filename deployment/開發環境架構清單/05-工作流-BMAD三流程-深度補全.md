# §6 子系統 E：工作流（BMAD 三大開發流程）— 深度補全版

**版本**: 3.1.0 (深度補全版)
**建立日期**: 2026-08-07
**更新日期**: 2026-08-07
**驗證基準**: `_bmad/bmm/workflows/4-implementation/` 38 個 step 檔逐項讀取 + `bmad-overlay/4-implementation/` 73 檔覆蓋層對照 + 模型分層裁定文檔 + 測試契約驗證
**上層**: [開發環境架構清單（總表）](../00-開發環境架構清單.md)

---

## 6.1 BMAD Method 四模組架構（實測驗證）

```
_bmad/
├── core/     bmad-master · party-mode · shard-doc · 基礎 tasks/tools
├── bmm/      ★ 主開發模組 — agents(7) + workflows(create-story/dev-story/code-review/
│             sprint-planning/retrospective/testarch-*) + teams + testarch + data
├── bmb/      Builder — 建 agent / workflow / module
├── cis/      Creative — brainstorming / design-thinking / storytelling / innovation
├── _config/  agents · custom · ides
└── _memory/
```

**指令格式**: `/bmad:{module}:{type}:{name}`，例如 `/bmad:bmm:workflows:dev-story`

> **部署注意**: BMAD 本體需使用者**自行安裝新版**，本包只提供客製化覆蓋層 (`bmad-overlay/4-implementation/`，73 檔)。

---

## 6.2 ★ 三大開發流程 —— 已非官方原版（深度驗證版）

### 6.2.0 共同架構：step-file（對抗 LLM "lost in the middle"）

| 特性 | 說明 | 實測驗證 |
|------|------|----------|
| **每步驟獨立載入** | 執行到哪就只載哪一步 | 每個 step 檔獨立 markdown |
| **STATE VARIABLES 跨步驟持久化** | `{story_key}` `{diff_output}` `{review_mode}` `{unified_findings}` | workflow.yaml 定義 |
| **步驟鏈明示** | 每個 step 檔 frontmatter 標 `nextStepFile` | 不靠模型自由發揮 |

**步驟數**: **create-story 9 步 · dev-story 14 步 · code-review 15 步**

### 6.2.1 ★ 測試職責三層分工（核心設計決策，含學術佐證）

#### 模型分層（`scripts/pipeline-config.json` phaseModelMapping，SSoT）

| 階段 | 模型 | effort | 裁定日期 | 裁定者 |
|------|------|:------:|----------|--------|
| **create-story** | `claude-opus-5[1m]` | max | 2026-06-08 | 使用者 |
| **dev-story** (含 complex/fix-Rn) | `claude-sonnet-5[1m]` | max | 2026-07-19 | 使用者 (supersede 2026-06-11 opus 裁定) |
| **code-review** | `claude-opus-5[1m]` | max | 2026-06-08 | 使用者 |

#### 為什麼測試設計必須在 create 階段

**前提失效論證**：2026-03-08 原決策「dev 直接從 BR 生成測試」成立於**三階段同一模型**時。2026-06-08 模型分層後：
> 測試設計（涵蓋性推導、邊界列舉、跨模組影響識別）是整條鏈上**認知負荷最高**的活動之一，
> 卻被指派給鏈上**能力最弱的一環**。而 opus 在 create 階段已經把 AC 寫成散文 ——
> **設計資訊產生了，但沒有被結構化保存，於是下游必須用更弱的模型重新推導一次。**
> 這是典型的**有損重推導（lossy re-derivation）**。

**學術佐證** (`ATDD-SDD-TDD-BDD/規格驅動開發範式/03-模型分層與測試職責裁定.md` §三)：
- **TDAD 論文** (arXiv 2603.17973)：「TDD prompting **without** graph context 反而讓 regression 惡化到 9.94%（baseline 6.08%）」—— 較弱模型受益於**上下文資訊**（該檢查哪些測試）遠大於**程序性指示**（怎麼做 TDD）
- **TDD Governance 論文** (arXiv 2604.26615)：planner 層負責「把 spec 拆為 ordered steps **並編碼預期測試結果（FAIL then PASS）**」—— planner ≈ create-story

#### 裁定：產「表」不產「檔」

| 層 | 產出物 | 執行者 | 落點 |
|----|--------|--------|------|
| **測試設計** | 具名測試案例表（7 欄） | **create（opus max）** | `stories.testing_strategy` DB 欄位 |
| **測試實作** | 逐列翻譯為可執行 failing test → GREEN → REFACTOR | **dev（sonnet max）** | step-05 §0.4 / §4 / §5 |
| **測試驗證** | 表 ↔ 測試逐項對帳 + 對抗式補漏 | **review（opus max）** | step-03c + `tasks-backfill-verify` |

#### create 端：`step-06-create-story-file.md` §7.5 測試規格產出（實測驗證）

**分級 Gate**（全自動依 DB `complexity` 判定，**禁引入任何 `<ask>`**）：
- `S` / `XS` → 完全跳過，維持自由格式
- **`M` / `L` / `XL` → 強制產表**

**七欄必填 Schema**（+ 選填第八欄 `Pattern`）：

| 欄位 | 內容規範 | 驗證邏輯 |
|------|---------|----------|
| `Case` | `{BR_ID}_{Scenario}_{ExpectedResult}` —— 引用 dev step-06:30 既有命名法 | BR id 去分隔符後需 ≥2 段底線 (`BR001_Works` 段數不足視為不合法) |
| `BR` | 本案例驗證的 BR id | — |
| `Level` | 僅能是 `unit` \| `integration` \| `E2E` | 枚舉檢查 |
| `Fixture` | **具名既有資產** (`CustomWebApplicationFactory` / `TestcontainersWebApplicationFactory` / `TestAccountSeeder A1-A5` …) 或 `N/A — pure function` | 禁空白/非具名描述 |
| `Input` | 具體輸入值，非描述性文字 | — |
| `Expected` | 具體預期輸出 / HTTP 狀態碼 / 錯誤碼 | — |
| `RED→GREEN` | 雙向皆具體 (如 `RED: 回 200（無版本檢查）/ GREEN: 回 409`) | **禁**「會通過」「應該正常」類模糊敘述 |

**BR 覆蓋要求**：`acceptance_criteria` 中每個 `[Verifies: BR-XXX]` 的 BR id，表格必含 ≥1 列對映（比對前正規化：轉大寫 + 去非英數字元）。

**三項關鍵不變量**：
1. **產表不產檔** —— §7.5 不得建立/修改/刪除任何測試原始檔。理由：create 是 DB-first 零產檔架構，介面與 DI 尚未存在使任何簽章成猜測，產檔會把 create 拉進檔案衝突面 (`parallel-batch-conflict-isolation.md`)
2. **案例名一經產出即為契約** —— 重跑只增不改名，不得 rename/移除既有列。下游對帳完全依賴此穩定性（連跑兩次須滿足 `S1 ⊆ S2`）
3. **冪等三分支** —— 已含合格表 → 驗證模式（既有 Case cell byte-identical，僅追加未覆蓋 BR）；非空但為散文 → 升級模式（原散文以 `<details>` 完整保留可 grep）；NULL/空 → 產出模式

**Pattern-first**：產表前先比對 `.claude/skills/phycool-testing-patterns/references/test-spec-pattern-catalog.md`，命中則只寫參數差異並標 `[Pattern: {ID}]`，不適用時**必附具名豁免行**禁靜默省略；目錄不可讀時降級為「未命中」續行，不中斷 workflow。

#### dev 端：`step-05-implement-task.md` §0.4 —— 從「自行推導」改為「消費」（實測驗證）

```markdown
§0.4.0  分級 Gate：S/XS 跳過；M/L/XL 繼續
§0.4.1  node .context-db/scripts/test-spec-audit.js {story_key} --json
        → verdict: consume | fallback
§0.4.2  consume 模式 —— 逐列翻譯，dev 不做任何設計決策
§0.4.3  fallback 模式 —— 升級前行為逐字保留 + tracking 檔記 WARN marker
```

**consume 模式下 dev 被明確剝奪的四項決策權**：

| 表欄位 | dev 不得自行 |
|--------|-------------|
| `Level` | 不得因為「這個比較好測」改用其他層級 |
| `Fixture` | 不得改用 mock 取代 `Level=integration` 要求的真實 fixture |
| `Input` | 不得憑印象改用其他輸入值 |
| `Expected` | 不得放寬或改變預期結果 |

加上 **`Case` 名稱必須 byte-identical**（不得重新命名、不得意譯、不得為了「更好懂」而調整），dev 的職責被收斂為**純翻譯與實作**。

**RED 判定**：依該列 `RED→GREEN` 的 RED 側描述；若觀察到的是編譯錯誤或 `NullReferenceException`，判定為**測試寫錯而非實作缺失**，須先修正測試再重跑。

**重入**（`dev-story-fix-Rn`）**只補漏不重寫**：CLI 回傳每列 `testHit` (`file:line` 或 `null`)，非 null 的列跳過，只為 `null` 的列補寫。輸出 `consume: {N} new, {M} existing`。

#### dev step-06 的真實職責（W2 收斂後）

`step-06-author-tests.md` **不是**「撰寫測試」—— 它是 **Test Coverage Gate & Cross-Task Fill**：

- step-05 §4-5 已 per-task RED→GREEN 寫微迴圈測試；§0.4 已有 story-level ATDD
- step-06 **不重寫**這些，只做：① 驗證覆蓋率 ≥ 80% ② 補 cross-task 整合 / edge case / E2E（per-task 微迴圈視角看不到的跨任務行為）
- **失敗模式明列**：「重寫 step-05 per-task 微迴圈已寫的測試（職責重疊，浪費 token）」

#### 三處共用單一真相來源

`.context-db/scripts/testing-strategy-structure.js` 的 `checkTestingStrategyStructure()`
＋ 唯讀分類 CLI `.context-db/scripts/test-spec-audit.js`
被 **dev / code-review / `tasks-backfill-verify` 三處共用** ——
「合格表」的判準不可能在建立端與消費端漂移。

review 端另有機械對帳：`step-09-completion.md` §1.5 的 `--dev-advisory` 與
`step-03c-acceptance-auditor.md` §6.2 軸 (a) 採**同一判準**（whole-word byte-identical），
使 dev 在逐列翻譯當下就能確保案例名一致，避免收尾才發現漂移的返工。

---

### 6.2.2 create-story（9 步 · opus-5 max）—— 逐步驟完整表

| # | Step File | Goal (原文) | 調用 Skill / 腳本 | 關鍵產出 |
|---|-----------|-------------|-------------------|----------|
| 1 | `step-00-db-first-query` | 讀任何 `.md` **之前**先查 Context Memory DB 既有 Story 資料 | `record-phase-timestamp.js` | `{existing_stories}` |
| 2 | `step-01-target-story` | 決定要建哪張卡（使用者指定或 DB 自動探索） | `record-phase-timestamp.js` | `{story_key}` |
| 3 | `step-02-artifact-analysis` | 窮舉分析所有 artifact，抽取關鍵脈絡 | — | `{artifact_context}` |
| 4 | `step-03-codebase-analysis` | ★ **對照實際實作驗證 tasks，防重複開發 / 漏掉既有抽象 / 檔案位置錯誤 / regression** | `search_god_nodes` MCP | `{codebase_findings}` |
| 5 | `step-04-architecture-analysis` | 抽出架構文件中開發者 MUST 遵守的約束 | — | `{arch_constraints}` |
| 6 | `step-05-web-research` | 確保技術知識為最新，防過時實作 | WebFetch / WebSearch | `{web_findings}` |
| 7 | `step-06-create-story-file` | 寫出「終極開發者指南」進 DB，**含 §7.5 測試規格產出** (bwu-2) | `sdd-spec-generator` · `phycool-sqlserver` · `phycool-testing-patterns` · `verification-before-completion` · `story-status-emoji` | Story 完整寫入 DB |
| 8 | `step-06.5-depth-gate` | ★ 5 維形式閘門後再跑 **7 項深度實質驗證** | `phycool-create-story-depth-gate` + `run-depth-gate.js` · `upsert-story.js` | 驗證通過/失敗 |
| 9 | `step-07-finalize` | 對照 checklist、同步 DB（含 `track_plan`）、建 tracking 檔 | `upsert-story.js` · `upsert-track-plan.js` · `record-phase-timestamp.js` | status: ready-for-dev |

**核心規則**（workflow.md 明文 CRITICAL）：
- **STALE DATA RULE** —— 報告/error log/snapshot 皆為歷史快照，**CODEBASE 才是唯一真相**，必須 Read 實際原始碼驗證行號與路徑
- **ZERO USER INTERVENTION** —— 除初始選卡與缺文件外全自動
- **SAVE QUESTIONS** —— 分析中想到的疑問留到 Story 寫完後才提

**★ step-03 三層防重複機制**：

1. **Stale Data Detection** —— 信任任何資料檔前先比對修改時間，比最新 commit 舊即為 STALE，須逐條對照實際原始碼；**絕不從報告複製行號**而不開檔確認
2. **God Node Priority Scan** (2026-05-02 加入) —— 先以 domain keyword 呼叫 `mcp__phycool-context__search_god_nodes`，取 top-N 高 centrality 核心檔優先 Read，並把 BlastRadius 大的 symbol 標進 dev_notes；0 hit 時 fallback 回既有 Glob/Grep
3. **Mandatory Source File Verification** —— **GATE：Story 提到的每一個原始檔都被 READ 並驗證過之前，不得進入 Step 4**

**Depth Gate 7 項深度驗證** (`step-06.5`)：Skill Read / ADR+IDD Cross-Ref / PRD Source / Chrome MCP Live / Iteration Pollution / Cross-Story / **Self-Write Verification**（驗 DB 寫入無 bash heredoc 或 template 損壞）。**WARN 等同 BLOCK，除非 `--accept-warn "具體理由"`。**

**DB-first**：Story 全部存 DB，**禁止**產生 `docs/.../{story_id}.md` 鏡像 (`db-first-write-guard.js` PostToolUse 攔截，`source_file` 填 `context-db://stories/{id}`)。

---

### 6.2.3 dev-story（14 步 · sonnet-5 max）—— 逐步驟完整表

| # | Step File | Goal (原文) | 調用 Skill / 腳本 | 關鍵產出 |
|---|-----------|-------------|-------------------|----------|
| 1 | `step-00-violation-precheck` | ★ 開工**前**強制 `Read` 最近 30 天 top-3 熱點違規規則全文 | `query-violations.js` | `{precheck_violation_count}` |
| 2 | `step-00-db-first-query` | 讀 `.md` 前先查 DB 取 Story 脈絡 | — | `{story_context}` |
| 3 | `step-01-load-story` | 定位並完整載入 Story，建立 state variables | — | `{story_key}` + state vars |
| 4 | `step-02b-kb-precheck` | 依本卡 domain/skills 掃知識庫既有已知問題 | 12 個 `phycool-*` 模組 Skill (依 domain 命中) | `{staleness_hits}` |
| 5 | `step-02-load-context` | 載入專案模式、required skills（含**過時偵測**）、前置技術債 | — | `{incoming_tech_debt}` |
| 6 | `step-03-review-continuation` | 判定全新開始 or CR 後續修復（fix-Rn） | — | `{review_mode}` |
| 7 | `step-04-mark-in-progress` | 確保 tracking 檔存在 + 記 dev 起始時間戳（**status 由 pipeline dispatcher 擁有，本步不寫**） | `record-phase-timestamp.js` | `{dev_started_at}` |
| 8 | `step-05-implement-task` | ★ 依 red-green-refactor 實作；**§0.4 消費 create 端測試案例表** | `test-spec-audit.js` | 實作完成 |
| 9 | `step-05b-apply-migrations` | 套 EF Core migration + 跑 Migration Cascade Checklist (ADR-DB-001) | — | Migration 套用 |
| 10 | `step-06-author-tests` | **覆蓋率 Gate + cross-task 補漏**（非重寫，見 §6.2.1） | `phycool-e2e-playwright` | 覆蓋率報告 |
| 11 | `step-07-run-validations` | 跑全部測試與 lint，確保無 regression、AC 全滿足 | — | 驗證通過 |
| 12 | `step-08-validate-complete` | 任務完成閘門 —— 所有條件齊備才可標完成 | — | `{validation_passed}` |
| 13 | `step-09-completion` | 驗 DoD、標 review、跑 bug 驗證、tasks 回填、文檔漂移偵測 | `bug-fix-verification` · `tasks-backfill-verify` · `story-status-emoji` · `saas-to-skill` + `test-spec-audit.js` · `upsert-story.js` · `boy-scout-sweep.js` · `check-violation-repeat.js` · `log-rule-violation.js` | status: review |
| 14 | `step-10-communication` | 記錄 workflow 完成、彙總成果、建議下一步 | `log_workflow` MCP | workflow 記錄 |

**相關 Rules**: `capability-integration-mandate` · `context-memory` · `db-first-no-md-mirror` · `skill-sync-gate` · `testing`

**★ Workflow Entry Gate（`step-00-violation-precheck`）** —— 最容易被忽略的機制：
開工前先跑 `query-violations.js --phase dev-story --since-days 30`，取最近 30 天該階段的 **top-3 熱點違規規則**，**強制 Read 其全文**後才准進入 step-01。`{precheck_violation_count}` 為 0 時短路跳過。code-review 有同名同機制的入口閘門。

> 這條讓「違規學習閉環」（§4.3）從被動注入升級為**主動閘門**：不只是在 prompt 裡看到違規熱區，而是開工前被強制讀完那幾條規則。

**其他 CRITICAL 規則**：
- 不因「里程碑」「顯著進展」「session 邊界」中途停止 —— 單次執行到 Story 完成，除非觸發 HALT
- 不主動安排「下次 session」或要求審查暫停
- 只允許修改 Story 的 Tasks/Subtasks checkbox、Dev Agent Record、File List、Change Log、Status

---

### 6.2.4 code-review（15 步 · opus-5 max · v4.1.0）—— 六層平行 + Review Trail

`workflow.yaml` 版本 **4.1.0**。定位是 **adversarial reviewer**：
「Find what's wrong or missing. Challenge everything. Never write lazy 'looks good' reviews.」
**每次審查至少找出 3-10 個具體問題**。

| # | Step File | Goal (原文) | 調用 Skill / 腳本 |
|---|-----------|-------------|-------------------|
| 1 | `step-00-violation-precheck` | 開工前強制 `Read` 最近 30 天 top-3 熱點違規規則 | `query-violations.js` |
| 2 | `step-00b-db-first-query` | ★ 先查 DB 建立 `{story_key}` —— CR 常被**手動**對只存在於 DB（無 .md 鏡像）的卡調用，本步關閉 G-4 缺口 | — |
| 3 | `step-01-load-discover` | 載入 story、required skills、git 變更、技術債統計 | `record-phase-timestamp.js` |
| 4 | `step-01b-generate-trail` | ★ 從 diff 建結構化 **Review Trail**：2–5 個功能關注點 × 各 1–4 個 `path:line` 停靠點，**按 blast-radius 排序** | — |
| 5 | `step-02-review-plan` | 抽出全部 AC / tasks / files，建五層 + SaaS 10 維審查計畫 | — |
| 6 | `step-03-triple-layer-dispatch` | ★ 六層平行 + SaaS 10 維審計分派 | (見下表) |
| 6a | `step-03a-blind-hunter` | 純程式碼品質**盲測** —— 僅看 diff，消除確認偏見 | — |
| 6b | `step-03b-edge-case-hunter` | 窮舉邊界 / 併發 / 資源管理，追上下游依賴 | — |
| 6c | `step-03c-acceptance-auditor` | AC vs 實作逐條對照 + Spec 合規驗證 | `test-spec-audit.js` · `upsert-test-trace.js` |
| 6d | `step-03d-triage-merge` | 正規化全部 findings → 去重 → 分類 → 算 SaaS Readiness Score | `edge-case-hunter` |
| 7 | `step-04-present-autofix` | 呈現全部 findings、**auto-fix ALL severity**、未修項推 Debt Registry | `upsert-debt.js` |
| 8 | `step-04b-skill-staleness` | 驗 Skill Sync Gate 合規 + 寫 SKILL_STALE 進 `tech_debt_items` | `upsert-debt.js` |
| 9 | `step-05-production-gate` | 跑 bug 修復驗證、套全部生產閘門、定最終 Story 狀態 | `bug-fix-verification` · `story-status-emoji` |
| 10 | `step-05b-tasks-backfill` | ★ 逐項以 `file:line` 證據驗證、回填 DB tasks（✅/⬜） | `tasks-backfill-verify` · `upsert-story.js` |
| 11 | `step-06-report-archive` | 產 CR 報告、歸檔 tracking、文檔漂移偵測、sidecar 清理 | `tasks-backfill-verify` · `upsert-story.js` · `record-phase-timestamp.js` · `check-violation-repeat.js` |

**相關 Rules**: `cr-debt-doc-audit` · `db-first-no-md-mirror` · `skill-idd-sync-gate` · `skill-sync-gate` · `tasks-backfill`

**六層平行審查架構** (`{failed_layers}` 記錄失敗層，單層失敗不中斷整體)：

| 層 | 角色 | 輸入限制 | 產出 |
|:--:|------|---------|------|
| **A** | Blind Hunter | **只給 diff**，禁 spec/AC/story context/專案文檔 | `{blind_findings}` |
| **B** | Edge Case Hunter | diff + 專案 Read 權限，**禁 spec/AC** | `{edge_findings}` |
| **C** | Acceptance Auditor | diff + spec + AC + context（**僅 `full` mode**） | `{auditor_findings}` |
| **D** | 🔒 Security Expert | diff + Read；**12 維 OWASP 深審** (Injection/XSS/Broken Auth/Mass Assignment…) | `{security_findings}` |
| **E** | ⚡ Perf Expert | diff + Read | `{perf_findings}` |
| **F** | 🗄 DB Schema Reviewer | **僅 `{has_db_changes}` = true 時啟動** | `{db_findings}` |
| — | SaaS 10 維審計 | main thread 執行 | `{saas_findings}` |

**設計精神**：A 層刻意「盲」—— 不給 spec，才能發現「spec 沒說但明顯錯」的問題；C 層才對照驗收條件。兩者互補，避免單一視角的確認偏誤。

**Step 3d Triage Merge** (bwu-7 升級)：消費**全部 7 個 finding 來源**（A/B/C/D/E/F + SaaS），統一去重計分，產出 `{unified_findings}` + `{dismissed_count}` + `{saas_readiness_score}`。

**Step 4 Auto-fix 強制**：`template: false` (action-workflow)，Steps 1→5 **連續執行不詢問**，不得在步驟間插入 `[c]/[y]/[a]` 確認 —— auto-fix 是 MANDATORY，永不請求修復許可。

**Guard 條件**：`{diff_output}` 為空 → 「Nothing to review」HALT；diff > 3000 行 → 警告但續跑。

---

### 6.2.5 規格驅動開發的文檔規範與防重複機制（補充驗證）

#### SDD Spec：唯一產出物與存放分類

`sdd-spec-generator` Skill **v1.2.0** (2026-07-28，`last-synced-epic: epic-bwu`)：

| 項目 | 規範 |
|------|------|
| **適用** | Story 複雜度 **M / L / XL**；**S 跳過**（AC 內嵌 BR 即可，無需獨立 Spec） |
| **唯一產出** | `{story-id}-spec.md` |
| **存放路徑** | `docs/implementation-artifacts/specs/epic-{X}/` |
| **內容** | Business Rules + API Contract + DB Schema + Boundary Conditions |
| **調用方式** | frontmatter `disable-model-invocation: true` —— **必須顯式調用**，模型不會自動觸發 |

**明文「不產出」清單**：
- ❌ **BDD Feature** —— 已降級為需求溝通輔助，不再是產出物
- ❌ **Story** —— 由 create-story workflow 產出並寫 DB
- ❌ **測試規格表** —— 由 create-story `step-06` §7.5 產出並寫入 `stories.testing_strategy`
- ❌ **Test Skeleton** —— 原「dev 直接從 BR 生成」的決策已被前述裁定 supersede

實測 `docs/implementation-artifacts/specs/` 下有 **117 個 spec 檔** + epic 子目錄分類 (`backend-vision/` · `content-editing/` 等)。

#### 規格層的 signature-free 原則

`sdd-spec-generator` 品質門檻 #7 明文：**不含實作細節 —— Spec 說 WHAT，不說 HOW（無 C# class name、無 method signature）**。

這條原則向下傳遞：因為 Spec 層刻意 signature-free，在其上長出的測試案例表也維持此性質（§7.5 產「表」不產「檔」的理由之一 —— create 階段介面與 DI 尚未存在，任何簽章都是猜測）。

#### 建構前防重複：四道關卡

| 層 | 機制 | 觸發時機 | 內容 |
|:-:|------|---------|------|
| **1** | `pre-audit-mandate.md` (SUPREME) | 收到「新建/建立/新增/設計」類指令時 | **6 步強制流程**：Read 檢索架構 SSoT → Glob 既有 hooks/skills/scripts → Read 對應 rules + ADR + Memory → **列對齊矩陣算百分比** → **≥60% 對齊改走升級而非從零** → <30% 才走完整新建 |
| **2** | create-story `step-00-db-first-query` | 每次建卡第一步 | 讀任何 `.md` 之前先 `search_stories` 查 DB 既有卡，防重複造卡 |
| **3** | create-story `step-03-codebase-analysis` | 建卡分析階段 | God Node Priority Scan + Stale Data Detection + **Mandatory Source File Verification GATE** |
| **4** | `scripts/audit-skill-overlap.cjs` | Skill 新建 / 定期稽核 | 偵測 Skill 之間的職責重疊 |

**`pre-audit-mandate` 的 6 條 FORBIDDEN**：
- ❌ 收到「建立 X」即立刻 Write，跳過 Step 1-4（紅旗：transcript 缺 `Glob .claude/hooks/*.js`）
- ❌ 未列對齊矩陣就自行推斷「我覺得 < 30%」
- ❌ 既有實作 60%+ 對齊卻仍從零實作（redundant build）
- ❌ 跳過 Memory / IDD / ADR 查詢（紅旗：缺 `search_*` 紀錄）
- ❌ 識別出升級路徑後仍堅持新建，且未以 file:line 證明風險
- ❌ `git add .` 整包 add 不逐檔 verify

#### 測試規格的重複防護

create `step-06` §7.5 的 **Pattern-first 子步**：
產表前先比對 `.claude/skills/phycool-testing-patterns/references/test-spec-pattern-catalog.md`，**命中** → 該列標 `[Pattern: {ID}]`，只寫參數差異，**不適用時必附具名豁免行** (`豁免: {案例名} — {理由}`)，禁靜默省略。**未命中** → 全套寫出並記為晉升候選，供 code-review 階段第二次同型場景出現時晉升入目錄。

---

### 6.2.6 epic-bwu 帶來的 15 項升級（bwu-1 ~ bwu-15，實測全 done）

| Story | 升級內容 |
|-------|---------|
| `bwu-1` | worker 注入面補 5 欄 + DB-first drift 修復 |
| `bwu-2` | create 測試規格產出鏈 (step-06 §7.5 + template + checklist) |
| `bwu-3` | dev §0.4 改消費 + review 對帳升級 + tasks-backfill |
| `bwu-4` | 上游 BMAD v6.10 蒸餾 4 點 (severity 校準 / dedupe 語意 / named-set) |
| `bwu-5` | **手動視窗零打字注入** —— UserPromptSubmit hook 偵測 `/bmad` slash 自動注入卡片 |
| `bwu-6` | hooks 附帶收尾 + **重建 `code-review-discipline.md`** (懸空 3 個月的指標) |
| `bwu-7` | triage 消費全部 7 個 finding 來源 (Layer D/E/F 產物正規化) |
| `bwu-8` | 閘門正則與稽核啟發式過窄修復 (Depth Gate D1/D3/D7 + test-spec-audit) |
| `bwu-9` | **AC 局部修訂安全路徑** —— 解開「為一個字重寫萬字欄位」的結構死結 |
| `bwu-10` | 文檔與鏡像對不上實作 (tianji 分歧台帳 + 孤兒測試 + Gate 自我指涉) |
| `bwu-11` | 12 層 RAG 注入字元預算重新校準 (MAX_TOKENS 與官方 10,000 字元上限量綱錯配) |
| `bwu-12` | **測試基線紅燈清算** —— 40 紅燈造冊 + `check-test-baseline.cjs` |
| `bwu-13` | BMAD 機制落差收斂 (byte-identical 無 dev 端閘門 + 長欄位紀律落點) |
| `bwu-14` | 注入預算量綱收斂 (session-recovery MAX_CHARS 超界 2 倍 + DevConsole) |
| `bwu-15` | 收口債務承接 (15 筆 open debt 的存活載體) |

---

### 6.2.7 Workflow Contract 測試（機械守衛）

| 測試檔 | 守衛對象 |
|--------|----------|
| `.context-db/tests/bwu3-workflow-contract.test.js` | dev/review step 檔存在性與內容契約 |
| `.context-db/tests/bwu7-triage-source-contract.test.js` | triage 是否消費全部 finding 來源 |
| `.context-db/tests/bwu13-mechanism-gap-contract.test.js` | 機制落差收斂契約 |
| `.context-db/tests/workflow-precheck.test.js` | violation-precheck Entry Gate |
| `.context-db/tests/workflow-invoked-detect.test.js` | `workflow-invoked-detect.js` 判定邏輯 |
| `scripts/check-test-baseline.cjs` | 測試紅燈基線雙向 diff (bwu-12) |

> **重要**: `workflow-invoked-detect.js` 用 `BMAD_PATH_RE = /_bmad[\\/].*workflows[\\/]/i` 判定「本次是否真的走了 BMAD workflow」，這是 Pipeline 六證據鏈中 `workflow_invoked=true` 的來源。手動宣稱走了流程但沒實際載入 step 檔，這裡會抓到。

---

### 6.2.8 Story 生命週期閉環（完整版）

**三階段的本質是「規格產出 → 規格消費 → 規格驗證」**，不是「規劃 → 開發 → 審查」。
全部規格性產物（SDD Spec / AC / 測試案例表）都在 **create 階段（opus-5）** 完成；
dev 階段（sonnet-5）**只做翻譯與實作，不做任何設計決策**。

```
需求 / 討論
   │
   ▼
┌─ create-story（9 步 · opus-5 max）── 規格產出階段 ────────────┐
│  Entry:  step-00 DB-first query（先查 DB 防重複造卡）          │
│  防重複: step-03 God Node Scan + Stale Data Detection          │
│          + Mandatory Source File Verification GATE             │
│                                                                │
│  ★ 本階段產出全部規格性產物：                                  │
│    ① SDD Spec（M/L/XL）── sdd-spec-generator @ step-06         │
│       → docs/implementation-artifacts/specs/epic-{X}/          │
│         {story-id}-spec.md（BR + API + DB + Boundary）         │
│    ② AC ── Given/When/Then + 具體值 + [Verifies: BR-XXX]       │
│       → stories.acceptance_criteria                            │
│    ③ 測試案例表（M/L/XL 強制 · S/XS 跳過）── step-06 §7.5      │
│       → stories.testing_strategy（七欄：Case / BR / Level /    │
│         Fixture / Input / Expected / RED→GREEN [+ Pattern]）   │
│       ⚠ 產「表」不產「檔」── 不建立任何測試原始檔              │
│    ④ tasks / dev_notes / implementation_approach / file_list   │
│                                                                │
│  Gate:   step-06.5 Depth Gate 5 維形式 + 7 項深度實質驗證      │
│          （WARN = BLOCK，除非 --accept-warn "理由"）           │
│  寫入:   stories 表（source_file = context-db://stories/{id}） │
│  禁止:   .md 鏡像 ← db-first-write-guard.js 攔截               │
└────────────────────────────────────────────────────────────────┘
   │  status: ready-for-dev
   │  交付物：Spec 檔 + DB 八欄（含測試案例表）
   ▼
┌─ dev-story（14 步 · sonnet-5 max）── 規格消費階段 ────────────┐
│  Entry:  step-00 violation-precheck（強讀 top-3 熱點違規）     │
│                                                                │
│  ★ 本階段不設計，只翻譯與實作：                                │
│    §0.4 執行 test-spec-audit.js → verdict                      │
│      ├ consume  → 逐列翻譯測試案例表為 failing test            │
│      │            Case 名 byte-identical（禁自創/禁意譯）      │
│      │            Level / Fixture / Input / Expected 全照表    │
│      │            ⚠ 四項設計決策權明文剝奪                     │
│      └ fallback → 僅當 testing_strategy 為散文或空時才自行     │
│                   推導，並於 tracking 檔記 WARN marker         │
│    step-05 §4-5  per-task red-green-refactor 微迴圈            │
│    step-06       覆蓋率 Gate ≥80% + 補 cross-task / edge / E2E │
│                  ⚠ 不重寫 step-05 已寫的測試（職責重疊）       │
│                                                                │
│  收尾:   tasks-backfill-verify + Skill Sync Gate + Boy Scout   │
└────────────────────────────────────────────────────────────────┘
   │  status: review
   ▼
┌─ code-review（15 步 · opus-5 max · v4.1.0）── 規格驗證階段 ───┐
│  Entry:  violation-precheck + DB-first（HARD BLOCK if absent） │
│  Trail:  從 diff 自動生成 2-5 concerns（blast-radius 排序）    │
│  審查:   六層平行（Blind / Edge / Acceptance / Security /      │
│          Perf / DB Schema）+ SaaS 10 維 → triage 去重          │
│          → SaaS Readiness Score                                │
│  ★ 對帳:  step-03c 表 ↔ 測試逐項對照（與 dev §0.4 同一判準：   │
│           whole-word byte-identical）+ upsert-test-trace.js    │
│  修復:   ALL severity 全數 auto-fix（禁詢問許可）              │
│  Gate:   Production Gate + CR 階段**獨立重跑** tasks-backfill  │
│  寫入:   review_reports + review_findings + tech_debt_items    │
└────────────────────────────────────────────────────────────────┘
   │  status: done
   ▼
五項同步：Story status · track_plan · tracking 檔 · Agent 時間戳 · 狀態 emoji
   │
   ▼
DevConsole /stories · /roadmap 檢視
   │
   └──▶ 下次 create-story 時 search_stories 查重、避免重複造卡
```

**規格產出物的階段歸屬**（實測自 workflow 的 Skill 調用點，非推測）：

| 產物 | 產出階段 | 證據 |
|------|:-------:|------|
| SDD Spec (`{story-id}-spec.md`) | **create** | `sdd-spec-generator` 出現在 `step-06-create-story-file.md`；dev-story 全部 17 個 Skill 調用中**無此 Skill** |
| AC (Given/When/Then + `[Verifies: BR-]`) | **create** | 寫入 `stories.acceptance_criteria`，為 Depth Gate 檢查對象 |
| 測試案例表（七欄） | **create** | `step-06` §7.5，寫入 `stories.testing_strategy` |
| 測試**實作**（可執行 test 檔） | **dev** | `step-05` §0.4 consume + §4-5 微迴圈 |
| 覆蓋率驗證 + cross-task 補漏 | **dev** | `step-06-author-tests`（**非**撰寫，是 Gate + Fill） |
| 表 ↔ 測試對帳 | **review** | `step-03c-acceptance-auditor` + `tasks-backfill-verify` |

> **`sdd-spec-generator` SKILL.md 的流程圖原文**：
> `需求討論 → [This Skill] → SDD Spec → create-story(AC+BR映射) → dev-story(TDD) → code-review(VSDD)`
> —— Spec 在 create 之前或之中產出，**dev 收到的是已完成的規格**。

**不變量 I1–I9** (`story-lifecycle-invariants.md` v2.2.0) 確保狀態機不被繞過：
I1–I4 / I8 為硬性 BLOCK（status 與時間戳一致性），I5–I7 / I9 為對稱性 WARN
(`*_agent` 與 `*_completed_at` / `*_started_at` 必須同時有值或同時為 NULL)。
`upsert-story.js` 具 auto-promotion（寫入時間戳自動推進 status，只進不退）。

---

## 6.3 相關聯相依性完整對照

### 6.3.1 Skills 依賴

| Workflow | 關鍵 Skills | 用途 |
|----------|-------------|------|
| create-story | `sdd-spec-generator`, `phycool-sqlserver`, `phycool-testing-patterns`, `verification-before-completion`, `story-status-emoji`, `phycool-create-story-depth-gate` | 規格產出、深度閘門 |
| dev-story | `phycool-e2e-playwright`, `bug-fix-verification`, `tasks-backfill-verify`, `story-status-emoji`, `saas-to-skill` | 實作、驗證、收尾 |
| code-review | `edge-case-hunter`, `bug-fix-verification`, `tasks-backfill-verify`, `story-status-emoji` | 審查、修復、對帳 |

### 6.3.2 Hooks 依賴

| Hook | 掛載點 | 服務 Workflow |
|------|--------|---------------|
| `pre-prompt-rag.js` | UserPromptSubmit | 三階段通用（Layer 1-12 注入） |
| `bmad-slash-story-inject.js` | UserPromptSubmit | `/bmad` 指令自動注入 Story |
| `log-session.js` | Stop/SessionEnd/PreCompact | 三階段通用（session 快照） |
| `incremental-embed.js` | Stop | 三階段通用（向量化） |
| `detect-rule-violation-hint.js` | Stop | 三階段通用（違規學習） |
| `ecc-emergence-gate.cjs` | Stop | 三階段通用（直覺演化） |
| `stop-report.ps1` | Stop | Pipeline 子視窗回報 |

### 6.3.3 Rules 依賴

| Rule | 服務 Workflow | 關鍵條款 |
|------|---------------|----------|
| `create-story-enrichment` | create-story | M1–M5 必填欄位 |
| `depth-gate-warn-mandatory-resolution` | create-story | WARN = BLOCK |
| `db-first-no-md-mirror` | 三階段 | 禁 .md 鏡像 |
| `story-lifecycle-invariants` | 三階段 | I1–I9 不變量 |
| `tasks-backfill` | dev-story + code-review | 任務逐項回填 |
| `code-review-discipline` | code-review | 12 條 CR 紀律 |
| `cr-debt-doc-audit` | code-review | CR 文檔同步 |
| `cr-web-mandate` | code-review | 前端 CR 必跑 prod-like build |

### 6.3.4 Scripts 依賴

| Script | 路徑 | 服務 Workflow |
|--------|------|---------------|
| `upsert-story.js` | `.context-db/scripts/` | 三階段通用 |
| `upsert-track-plan.js` | `.context-db/scripts/` | create-story |
| `record-phase-timestamp.js` | **`scripts/`**（專案根） | 三階段通用 |
| `query-violations.js` | `.context-db/scripts/` | dev-story + code-review Entry Gate |
| `test-spec-audit.js` | `.context-db/scripts/` | dev-story §0.4 + code-review step-03c |
| `run-depth-gate.js` | **`.claude/skills/phycool-create-story-depth-gate/scripts/`** | create-story step-06.5 |
| `log_workflow` (MCP) | `.context-db/server.js` | 三階段收尾 |

### 6.3.5 Commands 依賴

| Command | 對應 Workflow |
|---------|---------------|
| `/bmad:bmm:workflows:create-story` | create-story |
| `/bmad:bmm:workflows:dev-story` | dev-story |
| `/bmad:bmm:workflows:code-review` | code-review |
| `/bmad:bmm:workflows:sprint-planning` | sprint-planning |

---

## 6.4 使用者故事對照（核心）

| Story ID | 階段 | 核心價值 |
|----------|------|----------|
| `bwu-1` ~ `bwu-15` | 三階段 | BMAD 規格開發閉環升級 16 項 |
| `cmi-1` | create-story | 對話記憶自動注入 |
| `cmi-2` | dev-story | Code RAG 輔助實作 |
| `td-rule-violation-rag-inject` | 三階段 | 違規熱區主動閘門 |
| `ecc-07` | 三階段 | 直覺演化閉環 |

---

## 6.5 驗證指令（可原地重跑）

```bash
# 1. Step 檔計數
find _bmad/bmm/workflows/4-implementation/create-story/steps -name "*.md" | wc -l  # 預期 9
find _bmad/bmm/workflows/4-implementation/dev-story/steps -name "*.md" | wc -l  # 預期 14
find _bmad/bmm/workflows/4-implementation/code-review/steps -name "*.md" | wc -l  # 預期 15

# 2. 覆蓋層檔案計數
find bmad-overlay/4-implementation -type f | wc -l        # 預期 73（全部檔案）
find bmad-overlay/4-implementation -name "*.md" | wc -l   # 預期 63（其中 .md）

# 3. 測試契約驗證
node --test .context-db/tests/bwu3-workflow-contract.test.js
node --test .context-db/tests/bwu7-triage-source-contract.test.js
node --test .context-db/tests/bwu13-mechanism-gap-contract.test.js
node --test .context-db/tests/workflow-precheck.test.js
node --test .context-db/tests/workflow-invoked-detect.test.js

# 4. 測試基線檢查
node scripts/check-test-baseline.cjs

# 5. 模型分層驗證
cat scripts/pipeline-config.json | jq '.phaseModelMapping'

# 6. create-story 測試規格產出驗證
node -e "
const db = require('better-sqlite3')('.context-db/phycool.db', {readonly:true});
const rows = db.prepare('SELECT story_id, testing_strategy FROM stories WHERE complexity IN (\"M\",\"L\",\"XL\") AND testing_strategy IS NOT NULL AND testing_strategy != \"\" LIMIT 5').all();
rows.forEach(r => {
  console.log('===', r.story_id, '===');
  console.log(r.testing_strategy.slice(0, 500));
});
"

# 7. dev-story consume 模式驗證
node .context-db/scripts/test-spec-audit.js <story_key> --json

# 8. code-review Triage 驗證
node -e "
const db = require('better-sqlite3')('.context-db/phycool.db', {readonly:true});
const rows = db.prepare('SELECT * FROM review_reports ORDER BY completed_at DESC LIMIT 3').all();
rows.forEach(r => console.log(r.story_id, r.saas_readiness_score, r.unified_findings ? 'has_findings' : 'none'));
"
```

---

## 6.6 版本歷史與變更記錄

| 版本 | 日期 | 變更內容 | 驗證方式 |
|------|------|----------|----------|
| 3.0.0 | 2026-08-07 | 原單檔拆分為總表+9子章節 | 實地盤點 |
| 3.1.0 | 2026-08-07 | **深度補全**：38 步驟逐項表格、測試職責三層分工含學術佐證/裁定邏輯/消費模式四項剝奪權、Depth Gate 7 項、六層平行審查架構/輸入限制/產出、16 項 bwu 升級、Workflow Contract 6 個測試、生命週期閉環圖含規格產出物階段歸屬證據表 | Step 檔逐項讀取 + 模型分層裁定文檔 + 測試契約執行 + 實測 DB 查詢 |

---

> **補全說明**：本文檔為 05-工作流-BMAD三流程.md 的深度補全版，所有數據均經實地驗證（step 檔逐項、模型分層裁定文檔、測試契約、DB 實測），非引用既有文檔。如發現不一致，以實測為準。