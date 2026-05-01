---
name: 'step-04-architecture-analysis'
description: 'Architecture analysis for developer guardrails: extract all constraints the developer MUST follow'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/create-story'
thisStepFile: '{workflow_path}/steps/step-04-architecture-analysis.md'
nextStepFile: '{workflow_path}/steps/step-05-web-research.md'
---

# Step 4: Architecture Analysis

**Goal:** Extract everything the developer MUST follow from architecture documentation.

---

## AVAILABLE STATE

- `{architecture_content}` — from Step 2 (discover_inputs)
- `{codebase_analysis}` — from Step 3

---

## EXECUTION SEQUENCE

> **CRITICAL:** 🏗️ ARCHITECTURE INTELLIGENCE — Extract everything the developer MUST follow!

### 1. Load Architecture Document

**If architecture file is a single file:** Load complete `{architecture_content}`

**If architecture is sharded to folder:** Load architecture index and scan all architecture files

### 2. Critical Architecture Extraction

For each architecture section, determine if relevant to this story:

**CRITICAL ARCHITECTURE EXTRACTION:**
- **Technical Stack:** Languages, frameworks, libraries with versions
- **Code Structure:** Folder organization, naming conventions, file patterns
- **API Patterns:** Service structure, endpoint patterns, data contracts
- **Database Schemas:** Tables, relationships, constraints relevant to story
- **Security Requirements:** Authentication patterns, authorization rules
- **Performance Requirements:** Caching strategies, optimization patterns
- **Testing Standards:** Testing frameworks, coverage expectations, test patterns
- **Deployment Patterns:** Environment configurations, build processes
- **Integration Patterns:** External service integrations, data flows

Extract any story-specific requirements that the developer MUST follow.

Identify any architectural decisions that override previous patterns.

---

## SUCCESS METRICS

- Architecture document(s) fully loaded and analyzed
- All story-relevant constraints extracted
- Technical stack, naming conventions, and patterns documented
- Story-specific architectural requirements identified

## FAILURE MODES

- Loading architecture index but not drilling into relevant sections
- Missing story-specific architectural constraints
- Not identifying patterns that override previous conventions

---

**NEXT:** Load `step-05-web-research.md`
