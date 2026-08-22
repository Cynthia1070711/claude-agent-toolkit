# Path Reference — 專案路徑速查 + cwd 慣例

> Pipeline 子視窗最常用的 20+ 路徑 + 用途說明 + cwd 慣例。對應 SKILL.md §6 表的完整版。

---

## §1 DB / Memory 系統

| 路徑 | 用途 | 子視窗 cwd 慣例 |
|------|------|----------------|
| `.context-db/` | SQLite DB + scripts + better-sqlite3 module | **直接 `node -e` 必先 cd 此目錄** |
| `.context-db/phycool.db` | 主 SQLite DB(Stories / context_entries / tech_debt_items / IDD / cr_issues / 30+ tables)| 唯讀建議 `{readonly: true}` |
| `.context-db/node_modules/` | better-sqlite3 native module(只裝這層)| Node.js 模組解析從 cwd 往上找,所以必先 cd |
| `.context-db/scripts/` | upsert-story.js / upsert-debt.js / log-session.js / etc.(wrappers 內建相對路徑) | 從專案根直接 `node .context-db/scripts/X.js` OK(wrapper 寫死了) |
| `.context-db/server.js` | MCP server entry point(23 tools) | 由 .mcp.json spawn,不直接執行 |

---

## §2 Skills / Rules / Hooks 配置

| 路徑 | 用途 | 編輯權限 |
|------|------|---------|
| `.claude/skills/phycool-*/` | SaaS 模組 Skill(47 個)— platform-overview / editor-arch / payment-subscription / member-plans / etc. | 走 `Skill(saas-to-skill)` Mode B |
| `.claude/skills/{workflow}/` | Workflow / Utility Skill(28 個)— claude-launcher 三胞胎 / autorun-e2e / saas-to-skill / skill-builder / pipeline-subwindow / etc. | 走 `Skill(skill-builder)` |
| `.claude/skills/skills_list.md` | Skill keyword matching index(Claude progressive disclosure 用,原 `auto-skill-detection.md` retired 2026-05-05) | 補新 Skill 時必更新 |
| `.claude/rules/*.md` | 載入規則 + Hook 規則 + Sync Gate / Discipline Standard | SUPREME 規則需 ADR 配套 |
| `.claude/hooks/*.{js,cjs}` | UserPromptSubmit / Stop / PreCompact / SessionStart hook | 改動觸發 deployment-doc-freshness check |
| `.claude/agents/*.md` | 自訂 sub-agent(Explore / Plan / general-purpose / etc.) | 改動需配套 settings.json |
| `.claude/commands/*.md` | 自訂 slash command | 改動需配套 settings.json |
| `.claude/ipc/{StoryId}__{Timestamp}/` | Pipeline IPC dir(party-to-pipeline v5 task / status / ack file) | 中控 / 子視窗共享 |
| `.claude/settings.local.json` | 本機 settings(permissions / env / hooks override) | 對齊 settings-json-edit-policy.md |

---

## §3 BMAD / Pipeline

| 路徑 | 用途 | 慣例 |
|------|------|------|
| `_bmad/bmm/workflows/4-implementation/` | M-tier workflow — create-story / dev-story / code-review / tasks-backfill | 由 BMAD agent invoke,不直接 Edit |
| `_bmad/bmm/agents/` | BMAD agent personas(analyst / pm / architect / sm / dev / tea / ux-designer / quick-flow-solo-dev) | Edit 需 BMAD core 同步 |
| `scripts/story-pipeline.ps1` | Pipeline 入口(舊版,已被 claude-launcher-interactive 取代) | 不直接執行 |
| `scripts/pipeline-config.json` | Budget / OTel port / handshake.enabled flag | 改動需 record-config-version |
| `scripts/record-phase-timestamp.js` | phase-aware timestamp 補強(create-start / dev-start / dev-complete / review-start / review-complete) | dev-story / code-review 後補 |
| `scripts/check-hygiene.ps1` | commit 前 lint(.ps1 編碼 / forbidden patterns / sanitization) | 必跑(commit 前) |

---

## §4 Documentation 與 Tracking

| 路徑 | 用途 | DB-first 對應 |
|------|------|--------------|
| `docs/implementation-artifacts/specs/` | SDD Spec(M/L/XL Story) | DB stories.sdd_spec |
| `docs/implementation-artifacts/reviews/epic-{id}/` | CR Report(.md) | DB review_reports |
| `docs/implementation-artifacts/sprint-status.yaml` | 已凍結(2026-07-28)· 純歷史快照,禁讀寫 | DB `stories.status`(SoT)+ `track_plan`(排程) |
| `docs/tracking/active/{story-id}.track.md` | Working log(非 Story 鏡像) | DB stories.execution_log |
| `docs/tracking/archived/epic-{id}/` | 歸檔 tracking(Story done 後移此) | — |
| `docs/technical-decisions/` | ADR(Architecture Decision Record) | DB intentional_decisions(IDD) |
| `docs/project-context.md` | Epic 進度 + 當前工作 + 架構決策 SoT | 主視窗讀此熱啟動 |
| `docs/project-planning-artifacts/` | PRD / front-end spec / 開發中問題分析報告 | — |
| `平台UIUX排版範例/` | UI Spec 截圖 + 排版範例 | UI/Frontend Story 必讀 |

> **DB-first Story**: 不產生 `docs/implementation-artifacts/stories/epic-X/{story_id}.md` 鏡像檔!Story 結構化資料在 DB,DevConsole 查詢。詳 `.claude/rules/db-first-no-md-mirror.md`。

---

## §5 Source Code

| 路徑 | 用途 | 主要 Skill |
|------|------|-----------|
| `src/YourApp/Web/` | C# ASP.NET Core MVC backend | phycool-* SaaS Skill |
| `src/YourApp/PhyCool.Domain/` | C# Domain layer(Entities / Enums) | phycool-sqlserver / phycool-error-handling |
| `src/YourApp/PhyCool.Infrastructure/` | EF Core DbContext + Migrations | phycool-sqlserver |
| `src/Editor/` | React 18 + Zustand + Fabric.js frontend | phycool-editor-arch / zustand-patterns / type-canonical |
| `tests/` | xUnit / Vitest / Playwright | phycool-testing-patterns / e2e-playwright |

---

## §6 Tools / DevConsole

| 路徑 | 用途 | 啟動指令 |
|------|------|---------|
| `tools/dev-console/` | DevConsole Web UI(讀 DB,查 Stories / Patterns / Activities / Schema) | `start-servers` Skill 自動拉起 5173 port |
| `e2e/` | Playwright E2E test files + Page Object Model | `npx playwright test` |
| `e2e/.auth/admin.json` | storageState(Admin auth fixture) | auth.fixture.ts 寫入 |

---

## §7 Memory 系統(主視窗 + 子視窗共用)

| 路徑 | 用途 |
|------|------|
| `~/.claude/projects/{project-hash}/memory/MEMORY.md` | Auto-Memory index(<200 行 cap) |
| `~/.claude/projects/{project-hash}/memory/*.md` | Memory entry 全文(88 檔 SSoT) |
| `memory/` (project-local) | 專案 IDD / 跨 session pattern 記錄 |
| `CLAUDE.md` (project-root) | 專案憲章 always-on |
| `CLAUDE.local.md` (project-root) | 本機憲章(Agent Identity / git hooks) |

---

## §8 Toolkit / 雙倉庫

> **2026-05-05 凍結**: Single-Engine Mode 啟用,`.gemini/` + `.agent/` 為 frozen 5/1 baseline,不再主動 sync。`claude token減量策略研究分析/1.專案部屬必讀/` toolkit 鏡像 sync 機制停用。詳 `.claude/rules/single-engine-mode.md`。

| 路徑 | 用途 | 狀態 |
|------|------|------|
| `.gemini/skills/` | Gemini engine baseline(2026-05-01 凍結) | FROZEN — 歷史參考,natural decay 預期 |
| `.agent/skills/` | OpenAI / 其他 engine baseline | 同上 |
| `claude token減量策略研究分析/` | 研究蒐集池(私人) | 不對外 |
| `claude token減量策略研究分析/1.專案部屬必讀/` | toolkit 鏡像 SSoT(2026-05-05 凍結) | FROZEN |

---

## §9 子視窗 cwd 預設行為

| Pipeline 階段 | 子視窗啟動 cwd | 應走 cwd |
|--------------|---------------|---------|
| create-story | `$ProjectRoot`(專案根)| 維持(Edit/Write 用絕對路徑) |
| dev-story | `$ProjectRoot` | DB 操作必先 `cd .context-db &&` 或走 MCP/wrapper |
| code-review | `$ProjectRoot` | 同上 |
| tasks-backfill | `$ProjectRoot` | 同上 |

> SKL-09 AC6 NODE_PATH 兜底: launch claude 之前 PS1 設 `$env:NODE_PATH = "$ProjectRoot\.context-db\node_modules"`,讓 better-sqlite3 從任何 cwd 可 require(避 `cd .context-db &&` 必要性,但仍推薦先 cd 為清晰)。

---

## §10 速查表(子視窗最常用)

| 想做什麼 | 路徑 | 工具 |
|---------|------|------|
| 查 Story 詳情 | `.context-db/phycool.db` stories 表 | MCP `search_stories` |
| 寫 Story status | `.context-db/scripts/upsert-story.js` | CLI(MCP 無 stories write) |
| 查歷史決策 | `.context-db/phycool.db` context_entries | MCP `search_context` |
| 寫決策 / pattern / debug | 同上 | MCP `add_context` |
| 查 IDD | `.context-db/phycool.db` intentional_decisions | MCP `search_intentional_decisions` |
| 寫 IDD | 同上 | MCP `add_intentional_decision` |
| 查 Skill(找規範) | `.claude/skills/{name}/SKILL.md` | Read tool |
| 查 Rule | `.claude/rules/*.md` | Read tool |
| 查 BMAD workflow | `_bmad/bmm/workflows/4-implementation/{name}/` | Read tool / `/bmad:bmm:workflows:{name}` |
| 查 ADR | `docs/technical-decisions/ADR-*.md` | Read tool / Glob |
| 查 PRD / Spec | `docs/project-planning-artifacts/`, `docs/implementation-artifacts/specs/` | Read / `mcp__phycool-context__search_documents` |
| 跑 hygiene check | `scripts/check-hygiene.ps1` | Bash / PowerShell |
| 補 timestamp | `scripts/record-phase-timestamp.js` | Bash |

---

## §11 Self-Check(每次跨檔案操作前 2 題)

1. **「目標檔案在哪?屬哪類(SaaS Skill / Workflow Skill / Rule / Hook / Code / Doc)?」** → 對照 §1-§7 找正確路徑 + 工具
2. **「DB / CLI 操作 cwd 對嗎?」** → §9 預設專案根,DB 走 `cd .context-db &&` 或 MCP

---

## §12 References

- [SKILL.md](../SKILL.md) §6 路徑速查表(本檔精簡版)
- [db-query-conventions.md](db-query-conventions.md) — DB 操作 BAD/GOOD
- [common-mistakes.md](common-mistakes.md) — 反模式速查
- [upsert-story-cheatsheet.md](upsert-story-cheatsheet.md) — CLI 完整範例
- `CLAUDE.md` §0 雙倉庫架構認知 / §4 文件路徑
- `.claude/rules/db-first-no-md-mirror.md` — Story DB-first SoT
- `.claude/rules/single-engine-mode.md` — `.gemini/.agent/` 凍結說明
