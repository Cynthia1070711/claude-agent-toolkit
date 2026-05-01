---
name: 'step-02-artifact-analysis'
description: 'Load and analyze core artifacts: epics, PRD, architecture, UX, previous story intelligence, git history'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/create-story'
thisStepFile: '{workflow_path}/steps/step-02-artifact-analysis.md'
nextStepFile: '{workflow_path}/steps/step-03-codebase-analysis.md'
---

# Step 2: Load and Analyze Core Artifacts

**Goal:** Exhaustively analyze all artifacts to extract critical context for the story.

---

## AVAILABLE STATE

- `{story_key}`, `{epic_num}`, `{story_num}`, `{sprint_status_cache}` — from Step 1

---

## EXECUTION SEQUENCE

> **CRITICAL:** 🔬 EXHAUSTIVE ARTIFACT ANALYSIS — This is where you prevent future developer fuckups!

### 1. Load All Available Content

**PROTOCOL:** discover_inputs

Load content via discovery protocol (from workflow.yaml `input_file_patterns`):
- `{epics_content}` — Epic file(s) with BDD format
- `{prd_content}` — PRD (fallback, selective load)
- `{architecture_content}` — Architecture docs (selective load)
- `{ux_content}` — UX design specs (selective load)
- `{project_context}` — Project-wide context

---

### 2. Epic Analysis

From `{epics_content}`, extract Epic `{epic_num}` complete context:

**EPIC ANALYSIS:**
- Epic objectives and business value
- ALL stories in this epic for cross-story context
- Our specific story's requirements, user story statement, acceptance criteria
- Technical requirements and constraints
- Dependencies on other stories/epics
- Source hints pointing to original documents

Extract our story (`{epic_num}`-`{story_num}`) details:

**STORY FOUNDATION:**
- User story statement (As a, I want, so that)
- Detailed acceptance criteria (already BDD formatted)
- Technical requirements specific to this story
- Business context and value
- Success criteria

---

### 3. Previous Story Intelligence

**If `{story_num}` > 1:**

1. Load previous story file: `{story_dir}/{epic_num}-{previous_story_num}-*.md`

**PREVIOUS STORY INTELLIGENCE:**
- Dev notes and learnings from previous story
- Review feedback and corrections needed
- Files that were created/modified and their patterns
- Testing approaches that worked/didn't work
- Problems encountered and solutions found
- Code patterns established

Extract all learnings that could impact current story implementation.

---

### 4. Git Intelligence

**If previous story exists AND git repository detected:**

1. Get last 5 commit titles to understand recent work patterns
2. Analyze 1-5 most recent commits for relevance to current story:
   - Files created/modified
   - Code patterns and conventions used
   - Library dependencies added/changed
   - Architecture decisions implemented
   - Testing approaches used
3. Extract actionable insights for current story implementation

---

## SUCCESS METRICS

- `{epics_content}` loaded and Epic `{epic_num}` extracted
- Story foundation (user story, AC, technical requirements) captured
- Previous story intelligence extracted (if story_num > 1)
- Git intelligence analyzed (if git repo exists)
- `{prd_content}`, `{architecture_content}`, `{ux_content}` loaded as needed

## FAILURE MODES

- Skimming epics instead of exhaustive analysis
- Not loading previous story file when story_num > 1
- Skipping git analysis when repo exists
- Missing cross-story context for current epic

---

**NEXT:** Load `step-03-codebase-analysis.md`
