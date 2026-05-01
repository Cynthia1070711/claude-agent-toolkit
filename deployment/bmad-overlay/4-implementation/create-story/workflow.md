---
name: create-story
description: "Create the next user story from epics+stories with enhanced context analysis and direct ready-for-dev marking"
author: "BMad"
config_source: "{project-root}/_bmad/bmm/config.yaml"
installed_path: "{project-root}/_bmad/bmm/workflows/4-implementation/create-story"
---

# Create Story Workflow

**Goal:** Create the ultimate story context file — a comprehensive developer guide that prevents mistakes, omissions, and disasters.

**Your Role:** You are the ULTIMATE story context engine. Prevent LLM developer mistakes by thoroughly analyzing ALL artifacts and producing a story file that gives the DEV agent EVERYTHING needed for flawless implementation.

---

## WORKFLOW ARCHITECTURE

This uses **step-file architecture** for focused execution:

- Each step loads fresh to combat "lost in the middle"
- State persists via variables across all steps
- Sequential progression through analysis phases

---

## INITIALIZATION

### Configuration Loading

Load config from `{project-root}/_bmad/bmm/config.yaml` and resolve:

- `user_name`, `communication_language`, `user_skill_level`, `document_output_language`
- `output_folder`, `implementation_artifacts`, `story_dir`
- `date` as system-generated current datetime (Taiwan UTC+8)

### Paths

- `installed_path` = `{project-root}/_bmad/bmm/workflows/4-implementation/create-story`
- `sprint_status` = `{implementation_artifacts}/sprint-status.yaml`
- `project_context` = `**/project-context.md`
- `template` = `{installed_path}/template.md`

### Critical Rules

> **CRITICAL:** 🔥 CRITICAL MISSION: You are creating the ULTIMATE story context engine that prevents LLM developer mistakes!

> **CRITICAL:** Your purpose is NOT to copy from epics — it's to create a comprehensive, optimized story file that gives the DEV agent EVERYTHING needed for flawless implementation.

> **CRITICAL:** 📂 STALE DATA RULE: Reports, error logs, and snapshot files are HISTORICAL snapshots. The CODEBASE is the single source of truth. You MUST Read actual source files to verify line numbers, error existence, and file paths.

> **CRITICAL:** 🎯 ZERO USER INTERVENTION: Process should be fully automated except for initial epic/story selection or missing documents.

> **CRITICAL:** ❓ SAVE QUESTIONS: If you think of questions or clarifications during analysis, save them for the end after the complete story is written.

### STATE VARIABLES (persist throughout all steps)

| Variable | Set In | Purpose |
|----------|--------|---------|
| `{db_story}` | Step 0 | DB Story 物件 |
| `{db_enriched}` | Step 0 | DB 是否已有豐富資料 |
| `{memory_context}` | Step 0 | 歷史決策上下文 |
| `{story_key}` | Step 1 | Story 識別碼 |
| `{epic_num}` | Step 1 | Epic 編號 |
| `{sprint_status_cache}` | Step 1 | Sprint status 快取（禁止重讀） |
| `{codebase_analysis}` | Step 3 | 程式碼現況分析結果 |
| `{codebase_snippets}` | Step 3 | 背景章節用程式碼片段 |
| `{required_skills}` | Step 6 | 需要載入的 Skills |
| `{has_db_changes}` | Step 6 | 是否有 DB Schema 變更 |
| `{doc_impact_list}` | Step 6 | 受影響文檔列表 |

---

## EXECUTION

Load and execute `steps/step-00-db-first-query.md` to begin the workflow.
