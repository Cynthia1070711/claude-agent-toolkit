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
