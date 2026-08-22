# Story Context Quality Review Checklist

You are an independent quality validator in a fresh context. Systematically review the story file produced by create-story, identify gaps, errors, and critical issues, then fix them.

## Inputs

- **Story file**: `{story_file_path}` (from workflow or user)
- **Workflow vars**: `{installed_path}/workflow.yaml`
- **Source docs**: Epics, Architecture, etc.

## Step 1: Load Target

1. Load `workflow.yaml` for variables (story_dir, output_folder, epics_file, architecture_file)
2. Load story file, extract epic_num, story_num, story_key, story_title
3. Assess current implementation guidance scope

## Step 2: Source Document Analysis

- **2.1 Epics & Stories** — Load `{epics_file}`, extract full Epic {epic_num} context (objectives, business value, all stories, cross-story dependencies, this story's requirements/acceptance criteria/constraints)
- **2.2 Architecture** — Scan relevant items: tech stack versions, code structure, API contracts, DB schema, security/performance requirements, testing standards, deployment patterns, external integrations
- **2.3 Previous Story** (if story_num > 1) — Extract dev notes, review feedback, established files/patterns, test approaches, problems and solutions
- **2.4 Git History** — Recent commits: file changes, code conventions, added dependencies, architecture decisions
- **2.5 Tech Versions** — Research involved libraries/frameworks for breaking changes, security updates, best practices

## Step 2.5: AC-BR Traceability & SDD Spec Validation (SDD+ATDD+TDD)

**AC-BR 追溯驗證（所有 Story 強制）:**
- [ ] **Every AC has BR reference**: 每個 AC 附有 `[Verifies: BR-XXX]` 標記
- [ ] **BR is testable**: 每條 BR 可轉化為具體的 Pass/Fail 斷言（含數值/條件）
- [ ] **EARS contract check** (建議): BR 以 EARS 句式定義（`WHEN…SHALL` / `IF…THEN` / `WHILE…`），與 BDD 驗收層並存
- [ ] **No orphan AC**: 無 AC 缺少 BR 映射
- [ ] **ATDD format check**: AC 包含具體輸入值和預期結果（非模糊描述如「正確顯示」），BDD Given-When-Then 格式
- [ ] **No vague language**: AC 中無「合理」「適當」「正常」等無法量化的詞彙
- [ ] **Surface-anchored**: AC 必須觀察其意圖所指的**最外層表面**(API response / DOM / CLI stdout / HTTP status),禁以更內層的代理物(DB row / 私有欄位 / 內部狀態)替代
  - ✅ 對:`Then GET /api/v1/mgmt/orders/1 回 HTTP 200 且 body.status === "Paid"`(觀察 API response 最外層表面)
  - ❌ 錯:`Then Orders 表該列 Status 欄 = 2`(以 DB row 這個內部代理替代 API response)
  - **豁免(嚴格限縮)**:僅限**完全無外部可觀察表面**的 Story(如基礎建設卡,改的是 workflow markdown / 內部腳本)以「該意圖所指的最外層可觀察面」為準(可為 grep 命中結果 / CLI exit code),不強制要求 HTTP/DOM。**純後端但有 API 表面的 Story 不適用本豁免** —— 後端 Story 正是本判準的主要標的(必觀察 API response,禁以 DB row 替代)

**SDD Spec 前置檢查（M/L/XL Story 限定）:**
- [ ] **Complexity Assessment**: Story 複雜度為 M/L/XL → 需要 SDD Spec
- [ ] **Spec Existence Check**: SDD Spec 檔案存在（路徑記錄在 Story 資訊表 SDD Spec 欄位）
- [ ] **If Missing**: 提示使用者先執行 SDD Spec Generator 或手動建立 Spec
- [ ] **BR Completeness**: Spec 的 Business Rules 覆蓋所有 AC 需求
- [ ] **Spec Reference in Story**: Story Dev Notes 檔案參考表包含 Spec 路徑與相關章節

## Step 2.7: Story Output Quality Gate (8 Dimensions)

> These checks enforce consistent story depth regardless of story type or agent. Q1-Q5 + Q7 all stories; Q6 SPEC Kernel + Q8 Testing for M/L/XL.

- [ ] **Q1 Background Code Evidence**: Background section contains at least 1 code snippet with `file:line` reference from actual codebase (not paraphrased). Exception: purely new feature with no existing code — must state "全新功能" explicitly with closest pattern reference.
- [ ] **Q2 AC Concrete Examples**: Every AC contains at least one concrete example (code snippet, JSON output, DOM value, or command output). No vague language like "正確顯示", "合理處理".
- [ ] **Q3 Dev Notes Line Numbers**: All source file references in Dev Notes use `FileName.ext:L123-145` format. All spec references use `path §X.X` format.
- [ ] **Q4 Definition of Done**: `## Definition of Done` section exists with `- [ ]` checkbox items (minimum 5 items, story-specific).
- [ ] **Q5 Implementation Approach**: `## Implementation Approach` section exists with `### Phase N:` structure (minimum 2 phases, each mapping to Tasks with Verification).
- [ ] **Q6 SPEC Kernel (M/L/XL)**: `## SPEC Kernel` section exists with 5 fields (Problem/Capabilities/Constraints/Non-goals/Success signal); Non-goals non-empty; Success signal contains verification command or measurable assertion (NOT descriptive like "正常運作"). S complexity: Q6 partial (Problem + Success signal 建議).
- [ ] **Q7 Markdown 渲染格式**: enrichment 各欄位 list item(`⬜`/`-`/`數字.`)、Given/When/Then、編號項間用 `\n\n` 段落分隔(非單 `\n`,DevConsole react-markdown 單 `\n`=soft break 會黏一起);狀態符號(`✅`/`⚠️`/`⬜`/`❌`)放文前(行首,禁文末/句中,例外表格 cell 不受限)。對齊 `.claude/rules/create-story-enrichment.md` Q7 與 `step-06` §9.5 既有強制要求(本檢核清單原缺此項,今補齊鏡像,非新增要求)。
- [ ] **Q8 測試維度 (M/L/XL)**: `testing_strategy` 含具名測試案例表(markdown 表格 + `Case` 欄符合 `{BR_ID}_{Scenario}_{Expected}` 格式);每條 `[Verifies: BR-XXX]` 至少 1 個對映 case;`Level`(`unit`/`integration`/`E2E`)與 `Fixture`(具名資產或 `N/A — pure function`)兩欄完整;`RED→GREEN` 雙向具體。S complexity:依 `step-06` §7.5.0 分級 gate 跳過,`testing_strategy` 沿用既有自由格式。

## Step 3: Gap Analysis

Check whether the story omits critical information in these five categories:

| Category | Check |
|----------|-------|
| **Reinvention** | Will dev build something that already exists? Are reusable solutions identified? |
| **Tech Specs** | Are library versions, API contracts, DB schema, security, performance requirements complete? |
| **File Structure** | Are file locations, naming conventions, integration patterns, deployment requirements clear? |
| **Regression Risk** | Are potentially broken existing features flagged? Are test and UX requirements covered? |
| **Implementation Precision** | Are instructions specific and actionable? Are acceptance criteria verifiable? Is scope bounded? |

## Step 4: LLM Optimization Analysis

Check story content for LLM processing efficiency:

- **Verbosity**: Excessive description wasting tokens without adding information
- **Ambiguity**: Vague instructions allowing multiple interpretations
- **Signal burial**: Key requirements buried in verbose text
- **Poor structure**: Information not organized for efficient LLM processing

Principles: precise and direct, every sentence guides implementation, clear headings and bullets, maximum information density.

## Step 5: Present Findings

Present four categories to the user: **CRITICAL** (must fix), **ENHANCEMENT** (should add), **OPTIMIZATION** (nice to have), **LLM-OPT** (token efficiency and clarity). Each item includes actionable fix description and benefit.

## Step 6: Interactive Selection

Ask user: `all` (apply all) / `critical` (critical only) / `select` (pick by number) / `none` (keep as-is) / `details` (show details)

## Step 7: Apply Selected

Load story and apply accepted changes. Changes must blend naturally — never reference the review process or original LLM. Final story must read as if created correctly the first time.

## Step 8: Confirm

Report updated section count. Next steps: review story → run dev-story.

## Final Verification
- [ ] H1 heading emoji matches story status (invoke /story-status-emoji Mode A) — N/A for DB-first Story（無 `.md`）
- [ ] `track_plan` entry ensured (`plan_state=queued`)（sprint-status.yaml 已凍結 2026-07-28,不再同步該檔）
- [ ] Tracking file created
