---
name: 'step-10-communication'
description: 'Completion communication: log workflow to DB, summarize accomplishments'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/dev-story'
thisStepFile: '{workflow_path}/steps/step-10-communication.md'
nextStepFile: null
---

# Step 10: Completion Communication

**Goal:** Log workflow completion, summarize accomplishments, suggest next steps.

---

## EXECUTION SEQUENCE

### 1. DoD Final Check

Execute the enhanced definition-of-done checklist using the validation framework.

Prepare a concise summary in Dev Agent Record → Completion Notes.

### 2. Log Workflow to Context Memory DB

```
Tool: mcp__pcpt-context__log_workflow
Parameters:
  workflow_type: "dev-story"
  story_id: {story_key}
  agent_id: {current Agent ID — CC-OPUS / CC-SONNET}
  status: "completed"
```

### 3. Communicate Completion

Communicate to `{user_name}` that story implementation is complete and ready for review.

**Summary to include:**
- Story ID, story key, title
- Key changes made
- Tests added
- Files modified

### 4. Provide Story File Path

Provide the story file path and current status (now "review").

### 5. Offer Explanations

Based on `{user_skill_level}`, offer explanations on:
- Implementation decisions
- Testing approach
- Patterns used

### 6. Suggest Next Steps

- Review changes
- Verify ACs
- Run code-review workflow

> 💡 **Tip:** For best results, run `code-review` using a **different** LLM than the one that implemented this story.

**If `{sprint_status}` file exists:** Suggest checking `{sprint_status}` to see project progress.

### 7. Remain Flexible

Remain flexible — allow user to choose their own path or ask for other assistance.

---

## SUCCESS METRICS

- Workflow logged to Context Memory DB
- Completion summary communicated
- Story file path and status provided
- Next steps suggested

## FAILURE MODES

- Skipping DB workflow log
- Not providing story file path
- Not suggesting code-review as next step

---

**WORKFLOW COMPLETE** — Story `{story_key}` is now in "review" status.
