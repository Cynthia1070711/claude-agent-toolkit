# Slash Commands 完整參考

> **版本**: 1.0.0
> **建立日期**: 2026-05-01
> **資料快照日**: 2026-05-01
> **驗證**: `(Get-ChildItem .claude\commands\*.md).Count` 應 = 13 / `(Get-ChildItem $HOME\.claude\commands\*.md).Count` 應 = 3

---

## 1. Commands 體系定位

Slash Command 是 Claude Code 的「**快捷指令包**」 — 使用者輸入 `/<name>` 立即觸發該 command 內的 SOP / agent 路由 / workflow 啟動。

| 屬性 | Slash Command | Skill |
|:----|:----|:----|
| 觸發方式 | 顯式輸入 `/<name>` | 隱式關鍵字匹配 / Workflow 主動載入 |
| Token 成本 | 命令本身極小,內部呼叫 agent / skill 才計成本 | SKILL.md 全文載入(觸發時)|
| 適用場景 | UI / UX 互動入口 | 領域 SOP / Pattern |
| 數量 | 13 專案 + 3 全域 | 74 |

---

## 2. 專案層 Slash Commands(13)

`.claude/commands/*.md`

| # | Command | 用途 | 內部呼叫 |
|:-:|:----|:----|:----|
| 1 | `/bmad` | BMAD workflow 主路由 | 觸發 `/bmad:module:type:name` 格式 |
| 2 | `/build-fix` | Build / TypeScript 錯誤診斷 + 修復 | `build-error-resolver` agent(Read / Write / Edit / Bash / Grep / Glob)|
| 3 | `/checkpoint` | 儲存 session state checkpoint | `pipeline-checkpoint.js --save` |
| 4 | `/code-review` | 觸發 code-review workflow | BMAD Phase 4 code-review 13 step |
| 5 | `/e2e` | Playwright E2E 測試執行 | `e2e-runner` agent + Vercel Browser / Playwright fallback |
| 6 | `/plan` | Story / Epic 規劃 | `planner` agent + AskUserQuestion + ExitPlanMode |
| 7 | `/refactor-clean` | 大型重構 / 死碼清理 | `refactor-cleaner` agent(knip / depcheck / ts-prune)|
| 8 | `/skill-create` | 新 Skill 腳手架(等同 `Skill(skill="skill-builder")`)| skill-builder |
| 9 | `/tdd` | TDD methodology 執行 | `tdd-guide` agent + RED-GREEN-REFACTOR |
| 10 | `/test-coverage` | Coverage 分析 + gaps | Vitest / xUnit reports |
| 11 | `/update-codemaps` | CODEMAPS 同步 | `doc-updater` agent + `docs/CODEMAPS/*` |
| 12 | `/update-docs` | 文檔同步 workflow | `doc-updater` agent |
| 13 | `/verify` | 通用驗證(build / test / coverage)| ⚠️ **不可** 與 `/tasks-backfill-verify` 混用 |

> README.md 在 `.claude/commands/` 自動更新,記錄 commands 索引(2025-12-27 last updated)。

---

## 3. 全域層 Slash Commands(3)

`~/.claude/commands/*.md`

| # | Command | 用途 |
|:-:|:----|:----|
| 1 | `/claude-max` | Telegram bridge 管理(雙向 CLI ↔ Telegram 遠端執行)|
| 2 | `/啟動電報` | 啟動 Claude Max Telegram Service(`npm run dev` in `claude-telegram-bridge/`)|
| 3 | `/停止電報` | 停止 Claude Max Telegram Service(`taskkill` zombie node.exe)|

> 全域 commands 與專案無關,適用所有 Claude Code 專案。

---

## 4. Workflow 整合層(由 Skill 暴露的「準 commands」)

部分 Skill 在 `skills_list.md` 註冊為 `/<skill-name>` 形式,實際透過 Skill tool 觸發,非真正 commands:

| 偽 Command | 對應 Skill | 用途 |
|:----|:----|:----|
| `/saas-to-skill` | `saas-to-skill` v3.1.0 | Mode A/B/C 三模式(Create/Update/Audit)|
| `/skill-builder` | `skill-builder` v3.0.1 | 新 Workflow / Utility Skill 腳手架 |
| `/sdd-spec-generator` | `sdd-spec-generator` | M/L/XL Story SDD Spec 自動生成 |
| `/tasks-backfill-verify` | `tasks-backfill-verify` | Tasks 逐項回填驗證(file:line 證據)|
| `/start-servers` | `start-servers` | Backend 7135 / Frontend 5173 啟動 |
| `/branch-merge` | `branch-merge` | Story branch merge to main |
| `/worktree-manager` | `worktree-manager` | Git worktree 管理 |
| `/quick-dev` | `quick-dev` | 微任務 zero blast radius 路徑 |
| `/edge-case-hunter` | `edge-case-hunter` | 5 維邊界條件分析 |
| `/security-review` | `security-review` v2.1.0 | OWASP + ASP.NET Core 對齊 |
| `/tdd-workflow` | `tdd-workflow` v2.1.0 | TDD RED/GREEN/REFACTOR + DAMP / Prove-It |
| `/constitutional-standard` | `constitutional-standard` | zh-TW + UTC+8 + Code Verification |
| `/claude-tools` | `claude-tools` | Claude Code CLI 完整參考 |
| `/claude-token-decrease` | `claude-token-decrease` | Token 減量規範框架(11 categories)|
| `/ui-ux-pro-max` | `ui-ux-pro-max` | UI/UX 設計智能 |
| `/save-to-memory` | `save-to-memory` | 對話內容存 Context DB |
| `/party-to-pipeline` | `party-to-pipeline` | Party Mode → Pipeline 任務委派 |
| `/smart-review-fix` | `smart-review-fix` | Smart review-fix 閉環 |
| `/bug-fix-verification` | `bug-fix-verification` | Bug fix 後驗證 |
| `/epic-config-sync` | `epic-config-sync` | Epic README 自動同步 |
| `/story-status-emoji` | `story-status-emoji` | Story 標題狀態 emoji |
| `/claude-launcher`, `-interactive`, `-memory` | `claude-launcher*` | Story pipeline 啟動三變體 |
| `/autorun-e2e` | `autorun-e2e` | E2E 任務獨立視窗執行 |
| `/pipeline-window-control` | `pipeline-window-control` | Pipeline 子視窗控制 |

> 完整列表 + Trigger 關鍵字見 `.claude/skills/skills_list.md`。

---

## 5. BMAD Workflow Commands(`/bmad:*` 路由)

```
/bmad:bmm:workflows:create-story    ← Phase 4 Story 創建
/bmad:bmm:workflows:dev-story       ← Phase 4 Story 實作
/bmad:bmm:workflows:code-review     ← Phase 4 Story 審查
/bmad:bmm:workflows:sprint-planning
/bmad:bmm:workflows:sprint-status
/bmad:bmm:workflows:correct-course
/bmad:bmm:workflows:retrospective
/bmad:bmm:workflows:epic-closing-audit
/bmad:bmm:workflows:auto-pilot
/bmad:bmm:workflows:document-project
/bmad:bmm:workflows:testarch
/bmad:bmm:workflows:bmad-quick-flow
/bmad:bmm:agents:dev                ← Amelia
/bmad:bmm:agents:architect          ← Winston
/bmad:bmm:agents:tea                ← Murat
/bmad:bmm:agents:ux-designer        ← Sally
/bmad:core:workflows:party-mode     ← Party Mode 17 agents 圓桌討論
```

---

## 6. Custom Subagent Commands(`.claude/agents/`)

10 個自訂 subagent(可由 commands 內部呼叫):

| Agent | Model | 主要工具 | 觸發 |
|:----|:----:|:----|:----|
| `architect.md` | opus | Read / Grep / Glob | 系統設計 / 架構決策 |
| `build-error-resolver.md` | (auto)| Read / Write / Edit / Bash / Grep / Glob | Build / TypeScript 錯誤 |
| `code-reviewer.md` | opus | Read / Grep / Glob / Bash | Code review(MUST USE for all changes)|
| `database-reviewer.md` | (auto)| Read / Grep / Glob | Migration / Schema review |
| `doc-updater.md` | (auto)| Read / Write / Edit | 文檔 / CODEMAPS sync |
| `e2e-runner.md` | (auto)| Read / Write / Edit / Bash | Playwright E2E |
| `planner.md` | (auto)| Read / Grep / Glob | Story / Epic 規劃 |
| `refactor-cleaner.md` | (auto)| Read / Write / Edit / Bash | 大型重構 / 死碼清理 |
| `security-reviewer.md` | (auto)| Read / Write / Edit / Bash | OWASP / secrets / RBAC |
| `tdd-guide.md` | (auto)| Read / Write / Edit / Bash | TDD methodology |

---

## 7. 自助驗證指令

```powershell
# 列出 13 專案 commands
Get-ChildItem .claude\commands\*.md | Select-Object Name

# 列出 3 全域 commands
Get-ChildItem $HOME\.claude\commands\*.md | Select-Object Name

# 列出 10 subagents
Get-ChildItem .claude\agents\*.md | Where-Object { $_.Name -ne 'README.md' }

# 確認 BMAD agents
Import-Csv _bmad\_config\agent-manifest.csv | Format-Table name, displayName, module -AutoSize
```

---

## 8. Related Reading

- `skills-deep-dive.md` — 74 Skills 完整列表(對應 §4 偽 commands)
- `bmad-workflows-evolution.md` — `/bmad:*` 路由詳細
- `hooks-events-deep-dive.md` §7 — settings.json 註冊
- `.claude/commands/README.md` — 即時索引

---

## 9. 版本歷史

| 版本 | 日期 | 變更 |
|:----|:----|:----|
| 1.0.0 | 2026-05-01 | 初版建立。13 專案 + 3 全域 + 10 subagents + 17 BMAD workflow / agent commands + 25+ Skill 偽 commands |
