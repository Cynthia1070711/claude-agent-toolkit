# Release Notes v1.8.0(2026-05-01)

> **Claude Agent Toolkit** 版本升級:從 **v1.7.1**(文檔說明)→ **v1.8.0**(可部屬完整範本)
> **核心轉折**:本版補完 toolkit 從「documentation-only」→「**fully deployable**」缺失的 200+ 範本檔案。

---

## 🎯 本版目標

v1.7.1 之前 toolkit 為文檔導向 — 讀者複製後執行部屬命令會發現 **hooks 1/14、rules 7/20、skills 0/74、agents 0/10、commands 0/13、context-db scripts 1/82** 大量缺失導致 broken。

**v1.8.0 補完缺失,使 toolkit 可直接部屬到綠地 / 棕地專案**。

---

## 📊 缺口補完規模

| 軸 | v1.7.1 | v1.8.0 | 補入 |
|:--|:--:|:--:|:--:|
| Hooks 範本(`config-templates/claude/hooks/`)| 1 | **14** | +13 |
| Rules 範本(`config-templates/claude/rules/`)| 7 | **25** | +18 |
| Agents 範本(`config-templates/claude/agents/`)| 0 | **10** | +10 |
| Commands 範本(`config-templates/claude/commands/`)| 0 | **13** | +13 |
| Context-DB Scripts(`config-templates/context-db/scripts/`)| 1 | **82** | +81 |
| Context-DB Migrations(`config-templates/context-db/migrations/`)| 0 | **2** | +2 |
| BMAD Overlay 4-impl(`bmad-overlay/4-implementation/`)| 10(XML)| **75**(MD step files)| +65 |
| 深度補全文檔(`1.專案部屬必讀/`)| 0 | **10** | +10 |
| Root SSoT 快照 | 0 | **1** | +1 |
| Maintenance Rule(`.claude/rules/`)| 0 | **1** | +1 |
| Verify Script(`scripts/`)| 0 | **1** | +1 |
| **總計補入** | — | — | **~215 個檔案** |

---

## ✨ 新功能 / 新範本

### 1. 完整 Hooks 體系(14 個,從 1 擴增)

| 新增 Hook | 觸發事件 | 用途 |
|:----|:----|:----|
| `config-protection.js` | PreToolUse(Edit\|Write)| 攔截 settings.json / appsettings 編輯 |
| `debt-discovery.js` | Stop | 自動掃 git diff TODO/FIXME/HACK,寫 tech_debt_items |
| `detect-rule-violation-hint.js` | Stop | 38 keyword pattern 偵測規則違反 |
| `mcp-health-check.js` | PreToolUse + PostToolUseFailure | 驗證 MCP DB 可達 |
| `pipeline-auto-exit.js` | Stop | Pipeline daemon 完成自動退出 |
| `pipeline-heartbeat.js` | Stop | Watchdog timestamp(8min 無更新判卡死)|
| `pipeline-permission.js` | PermissionRequest | Pipeline 模式 auto-approve 白名單 |
| `pre-commit-quality.js` | PreToolUse(Bash)| git commit 前驗證 secrets / msg 格式 |
| `precompact-tool-preprune.js` | PreCompact | Hermes 移植雙 Pass(dedup + summarize)|
| `session-recovery.js` | SessionStart(compact\|resume)| 注入 Pipeline state + Session 摘要 |
| `skill-change-detector.js` | FileChanged(SKILL.md)| 偵測三引擎 SKILL.md 變更 |
| `subagent-context-inject.js` | SubagentStart | 注入 parent context + 3-Tier blocked tools |
| `suggest-compact.js` | Stop | 累計回應計數,>40 提醒 /compact |

### 2. 完整 Rules 體系(20 個 + 5 toolkit 通用)

新增 18 個 rules,含 5 條 SUPREME Mandate(Constitutional / Verification / Sync Gates / IDD / Lifecycle)+ 9 Lifecycle Invariants + 3-Tier Subagent Boundary。

### 3. 完整 Subagents(10 個)

Architect / Build-Error-Resolver / Code-Reviewer / Database-Reviewer / Doc-Updater / E2E-Runner / Planner / Refactor-Cleaner / Security-Reviewer / TDD-Guide。

### 4. 完整 Slash Commands(13 個)

`/bmad` / `/build-fix` / `/checkpoint` / `/code-review` / `/e2e` / `/plan` / `/refactor-clean` / `/skill-create` / `/tdd` / `/test-coverage` / `/update-codemaps` / `/update-docs` / `/verify`。

### 5. 完整 Context-DB MCP Server(82 scripts)

從 1 個 init-db.js 擴增至 82 scripts,含:
- **Init/Schema**: init-db.js / apply-migration.js
- **寫入工具**: upsert-debt.js / upsert-story.js / upsert-intentional.js / log-workflow.js / log-session.js / log-turn.js / log-rule-violation.js
- **匯入工具**: import-stories.js / import-cr-reports.js / import-conversations.js / import-documents.js / import-adrs.js
- **嵌入向量**: generate-embeddings.js / local-embedder.js / backfill-embeddings.js / migrate-embeddings.js / incremental-embed.js
- **IDD 管理**: skill-idd-sync-check.js / scan-code-idd-references.js / scan-doc-idd-references.js / scan-skill-idd-references.js / build-idd-cross-reference.js
- **Tech Debt 清理**: debt-layer1-hygiene.js / debt-layer2-stale.js / debt-layer3-quickfix.js / debt-layer-rollback.js / boy-scout-sweep.js / cleanup-orphans.js
- **Code Review**: review-db-writer.js / review-task-matcher.js / batch-update-review-findings.cjs / backfill-findings-from-report.cjs
- **Pipeline**: pipeline-checkpoint.js / context-budget-monitor.js / r5-* / r6-*
- **Rule Violation**: detect-rule-violation-core.cjs / backtest-rule-violation-detector.cjs / check-violation-repeat.js
- **Pattern**: observe-pattern.js / measure-hook-injection.js
- **工具**: timezone.js / fix-timezone.js / restore.js / validate-server.js / seed-data.js / scan-doc-index.js

### 6. BMAD Overlay v6.2.2 概念升級(Markdown step files)

從 instructions.xml(舊)→ workflow.md + steps/*.md(新):
- **code-review**:13 step files + workflow.md + saas-standards.md(SaaS 9 維)+ checklist.md
- **create-story**:8 step files + workflow.md + template.md(SDD+ATDD)+ checklist.md
- **dev-story**:13 step files + workflow.md + checklist.md
- 共 75 個 BMAD overlay 檔案(原 10)

### 7. 9 篇 Deep-Dive 文檔

- `SANITIZATION-POLICY.md`(脫敏 SSoT)
- `skills-deep-dive.md` / `rules-deep-dive.md` / `idd-framework.md`
- `hooks-events-deep-dive.md` / `memory-system-deep-dive.md`
- `mcp-ecosystem.md` / `bmad-workflows-evolution.md` / `commands-reference.md`
- `global-claude-config.md`(`~/.claude/` 全域層完整章節)

### 8. Maintenance Rule + Verify Script

- `.claude/rules/deployment-doc-freshness.md`:dev-story Step 8 + code-review Phase B 雙檢查點
- `scripts/verify-deployment-docs.cjs`:8 條脫敏 grep + Markdown link + 數字 drift + UTF-8 編碼自動化驗證

---

## 🔒 重度脫敏(品牌字面 0 命中)

**3 段式脫敏策略**:
1. 路徑泛化(`<workspace-root>`)
2. namespace 改 Platform / App.Web
3. 通用 pcpt→pcpt / pcpt→PCPT 全文替換

**驗證結果**(透過 `verify-deployment-docs.cjs`):
- V-1 真實 Email ✓ 0 / V-2 真實價格 ✓ 0 / V-3 MerchantID/API Key ✓ 0
- V-4 *.pcpt 域名 ✓ 0 / V-5 弱口令 ✓ 0 / V-6 Azure AccountKey ✓ 0
- V-7 U+FFFD 亂碼 ✓ 0 / **V-8 pcpt/pcpt 字面 ✓ 0**(品牌脫敏)

---

## 📦 部屬可用性升級

### v1.7.1 vs v1.8.0 部屬流程體驗

| 步驟 | v1.7.1 結果 | v1.8.0 結果 |
|:----|:----|:----|
| 1. `cp config-templates/claude/* .claude/` | hooks 缺 13 / rules 缺 18 / no agents / no commands | ✅ 全 14 hooks + 25 rules + 10 agents + 13 commands |
| 2. `deploy-context-db.ps1` | MCP server 啟動但無實作工具(只 init-db) | ✅ MCP server + 82 scripts(完整工具)|
| 3. `cp -r bmad-overlay/* _bmad/` | 套用舊 XML 格式(v6.2.2 已棄用) | ✅ 套用新 MD step files(v6.2.2 對齊)|
| 4. 開新對話 | 缺核心 hooks → RAG 注入失敗 / Pipeline heartbeat 失敗 | ✅ 14 hooks 全運作 + 11 層 RAG 注入完整 |

### 最低部屬條件達成
- ✅ Node.js ≥18(MCP Server runtime)
- ✅ Claude Code CLI(主引擎)
- ✅ PowerShell 5.1+(Windows 自動化)
- ✅ 範本完整性(無缺失)
- ✅ 脫敏完整性(可公開部屬)

---

## 🚀 快速部屬指令(v1.8.0 完整版)

```powershell
# 1. 部屬 Context Memory DB(含 server.js + 82 scripts + 2 migrations)
powershell -ExecutionPolicy Bypass -File <toolkit>/deployment/scripts/deploy-context-db.ps1

# 2. 部屬 Claude 配置(14 hooks + 25 rules + 10 agents + 13 commands)
mkdir .claude\hooks .claude\rules .claude\agents .claude\commands
Copy-Item <toolkit>\config-templates\claude\hooks\*.js .claude\hooks\
Copy-Item <toolkit>\config-templates\claude\rules\*.md .claude\rules\
Copy-Item <toolkit>\config-templates\claude\agents\*.md .claude\agents\
Copy-Item <toolkit>\config-templates\claude\commands\*.md .claude\commands\

# 3. 部屬 BMAD Overlay(75 step files + workflow.md + saas-standards.md)
Copy-Item <toolkit>\bmad-overlay\4-implementation\* _bmad\bmm\workflows\4-implementation\ -Recurse -Force

# 4. 部屬 settings.json + CLAUDE.md.template
Copy-Item <toolkit>\config-templates\claude\settings.json.template .claude\settings.json
Copy-Item <toolkit>\config-templates\claude\CLAUDE.md.template CLAUDE.md
# 編輯 CLAUDE.md 填入專案資訊

# 5. 驗證
node <toolkit>\scripts\verify-deployment-docs.cjs
claude mcp list
```

---

## ⚠️ Breaking Changes 與 Migration Notes

### 從 v1.7.1 升級
- **rules 名稱差異**:v1.7.1 toolkit 使用 `context-memory-db.md`,新版用 `context-memory.md`(對齊 PCPT 實際命名)。手動部屬時注意名稱差異。
- **bmad-overlay 格式**:v1.7.1 使用 `instructions.xml`,新版用 `workflow.md + steps/*.md`(BMAD v6.2.2 對齊)。建議完全替換。

### 第一次部屬(綠地專案)
- 直接套用新範本即可

### 棕地專案
- 既有 `.claude/hooks/` 若已有 hook → diff 後選擇性套用新版
- 既有 `.claude/rules/` 若已有 rule → 名稱衝突優先保留專案版,新規則補入
- 既有 `_bmad/` 若是 v6.0.0-alpha + XML overlay → 移除 instructions.xml,改套用 workflow.md(請執行 backup)

---

## 📊 數字 Drift Snapshot(2026-05-01)

| 項目 | 實際數量 |
|:----|:--:|
| .claude/hooks(active js)| 14 |
| .claude/skills | 74 |
| .claude/rules | 20 |
| .claude/agents | 10 |
| .claude/commands | 13 |
| .context-db/scripts | 82 |
| docs/technical-decisions(ADRs)| 36 |
| _bmad agents | 17 |
| _bmad workflow steps | ~75 |

---

## 🛡️ 持續維護機制(防再 stale)

- `.claude/rules/deployment-doc-freshness.md`:10 條觸發條件 + dev-story Step 8 + code-review Phase B 雙檢查點 + 6 條 FORBIDDEN
- `scripts/verify-deployment-docs.cjs`:4 phases CI 自動化驗證(8 條脫敏 + Markdown link + 5 數字 drift + UTF-8 BOM)
- `.github/workflows/pr-gate.yml` Job 7 advisory(計畫,`continue-on-error: true`)

---

## 📖 文檔導航更新

主索引 `README.md` 加入「2026-05-01 新增 9 篇深度補全」段落,連結:
- 部屬流程:`開發前環境部署_v3.0.0.md`(主手冊)
- 各機制深度:`hooks-events-deep-dive.md` / `rules-deep-dive.md` / `skills-deep-dive.md` / `idd-framework.md` / `memory-system-deep-dive.md` / `mcp-ecosystem.md` / `bmad-workflows-evolution.md`
- 全域層:`global-claude-config.md`
- Slash Commands:`commands-reference.md`
- 脫敏:`SANITIZATION-POLICY.md`
- 時點 SSoT:`當前環境完整快照_2026-05-01.md`(root level)

---

## 🤝 致謝

- **BMAD Method** 社群 — 規格驅動工作流方法論
- **Anthropic** Claude Code CLI + MCP 協定團隊
- **TRS Story 貢獻者** 41 個實戰驗證
- **Epic 貢獻者** BU(BMAD 升級)/ CMI(Memory)/ CCI(Hook 強化)/ ECC(框架整合)/ WFQ(Pipeline 配額)/ Phase4(Rule Violation Tracker)

---

## 🔮 下版預告(v1.9.0 規劃)

- `.github/workflows/pr-gate.yml` Job 7 自動化 CI 落地(目前計畫)
- Skills marketplace 整合(支援 toolkit 增量擴展 pcpt-* 之外的領域 Skills)
- DevConsole Web UI 範本化(目前需獨立部屬)
- 多語系 Skills(英中對照)

---

**版本**: 1.8.0
**發布日期**: 2026-05-01
**作者**: Claude Code (CC-OPUS) 協作 + Toolkit Author
**License**: MIT

---

## 完整版本歷史

| 版本 | 日期 | 主要變更 |
|:----|:----|:----|
| **1.8.0** | **2026-05-01** | **Toolkit 從 documentation-only → fully deployable**(+215 範本檔案)。Hooks 1→14 / Rules 7→25 / Agents 0→10 / Commands 0→13 / Context-DB scripts 1→82 / BMAD overlay 10→75 / 9 deep-dive docs / verify-deployment-docs.cjs CI / 重度脫敏 V-8 |
| 1.7.1 | 2026-04-04 | Epic WFQ Pipeline 配額管理 + Heartbeat (L5) + 429/Model Purity (L6) + OTel Token + Quota Prediction |
| 1.7.0 | 2026-03-12 | G 類 SDD+ATDD+TDD + Epic CMI 對話生命週期(CMI-1~6)+ bmad-overlay 同步 |
| 1.6.0 | 2026-03-07 | Context Memory DB 策略(TD-32~36)+ MCP Server + ONNX |
| 1.5.0 | 2026-03-02 | Pipeline 中控自動化 + Token 安全閥 + batch-audit |
| 1.4.0 | 2026-02-28 | 技術債中央登錄(TRS-34) |
| 1.3.0 | 2026-02-27 | Worktree 速查 + 主手冊 v3.1.0 |
| 1.2.0 | 2026-02-27 | BMAD 架構演進分析 + Token 量化 + ECC 覆蓋 |
| 1.1.0 | 2026-02-27 | Rovo Dev CLI 範本 + 條件部屬 + 環境矩陣 |
| 1.0.0 | 2026-02-27 | 初版:TRS 優化 overlay + 配置範本 + 自動化腳本 |
