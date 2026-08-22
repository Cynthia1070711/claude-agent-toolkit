---
paths:
  - "src/**"
  - "tools/**"
  - "scripts/**"
  - ".context-db/scripts/**"
---

# Code Quality

## Coding Style
- Immutability: create new objects instead of mutation (C# record/with, TS spread)
- Files: 200-400 lines, max 800; high cohesion low coupling, organize by feature
- Functions: < 50 lines, nesting < 4 levels
- Error handling: comprehensive try-catch, descriptive exception messages
- Forbidden: leftover console.log, hardcoded values, direct mutation

## Security (Pre-Commit Checklist)
- No hardcoded secrets (API keys, passwords, tokens)
- User input validated
- SQL parameterized queries (no string concatenation)
- XSS protection (sanitize HTML), CSRF enabled
- Error messages never leak sensitive data
- Secrets via environment variables / Azure Key Vault only

## Git Workflow
- Commit format: `<type>: <description>` — types: feat, fix, refactor, docs, test, chore, perf, ci
- PR: analyze full commit history (`git diff main...HEAD`), include test plan

## Performance
- Simple/routine tasks: use Haiku subagent (token optimization, fast, low cost)
- General development: Sonnet subagent; main development: Sonnet/Opus
- Complex tasks: use Plan Mode — plan first, then execute
- Build failure: analyze error → incremental fix → verify one by one
