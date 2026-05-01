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
- [ ] **No orphan AC**: 無 AC 缺少 BR 映射
- [ ] **ATDD format check**: AC 包含具體輸入值和預期結果（非模糊描述如「正確顯示」）
- [ ] **No vague language**: AC 中無「合理」「適當」「正常」等無法量化的詞彙

**SDD Spec 前置檢查（M/L/XL Story 限定）:**
- [ ] **Complexity Assessment**: Story 複雜度為 M/L/XL → 需要 SDD Spec
- [ ] **Spec Existence Check**: SDD Spec 檔案存在（路徑記錄在 Story 資訊表 SDD Spec 欄位）
- [ ] **If Missing**: 提示使用者先執行 SDD Spec Generator 或手動建立 Spec
- [ ] **BR Completeness**: Spec 的 Business Rules 覆蓋所有 AC 需求
- [ ] **Spec Reference in Story**: Story Dev Notes 檔案參考表包含 Spec 路徑與相關章節

## Step 2.7: Story Output Quality Gate (5 Dimensions)

> These 5 checks enforce consistent story depth regardless of story type or agent.

- [ ] **Q1 Background Code Evidence**: Background section contains at least 1 code snippet with `file:line` reference from actual codebase (not paraphrased). Exception: purely new feature with no existing code — must state "全新功能" explicitly with closest pattern reference.
- [ ] **Q2 AC Concrete Examples**: Every AC contains at least one concrete example (code snippet, JSON output, DOM value, or command output). No vague language like "正確顯示", "合理處理".
- [ ] **Q3 Dev Notes Line Numbers**: All source file references in Dev Notes use `FileName.ext:L123-145` format. All spec references use `path §X.X` format.
- [ ] **Q4 Definition of Done**: `## Definition of Done` section exists with `- [ ]` checkbox items (minimum 5 items, story-specific).
- [ ] **Q5 Implementation Approach**: `## Implementation Approach` section exists with `### Phase N:` structure (minimum 2 phases, each mapping to Tasks with Verification).

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
- [ ] H1 heading emoji matches story status (invoke /story-status-emoji Mode A)
- [ ] Sprint status synced
- [ ] Tracking file created
