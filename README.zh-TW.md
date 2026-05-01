# Claude Agent Toolkit (v1.8.0)

> **多引擎 AI Agent 協作工具包** — 經實戰驗證的部屬範本、Token 減量策略、Context Memory DB、BMAD 驅動工作流整合,支援 Claude Code / Gemini CLI / Antigravity IDE / Rovo Dev CLI。

**最後更新**: 2026-05-01
**語言**: [English](README.md) | [繁體中文](README.zh-TW.md)

---

## 主開發策略

本工具包是真實多引擎 AI Agent 專案累積優化智慧的**可部屬精煉版**(2026-01 → 2026-05)。經 **41 個 TRS Stories** 實戰驗證、**6 個 Epic(BU/CMI/CCI/ECC/WFQ/Phase4)** 確立、結晶為一鍵部屬。

### v1.8.0 新增(2026-05-01)

- **Skills 體系成熟**:74 個 Skills 跨 17 個 Domain Profile + 三引擎同步(`.claude/`/`.gemini/`/`.agent/`)
- **Hooks 擴增**:14 個 hooks(原 6),含 11 層 RAG 注入
- **Rules 整合**:20 個 rules + 5 條 SUPREME Mandate + 9 條 Lifecycle Invariants + 3-Tier Subagent Boundary
- **IDD Framework**:4 層標註(Code/ADR/DB/Memory)+ 4 sub-types(COM/STR/REG/USR)
- **Memory DB 規模化**:30+ tables / 23 MCP tools / 82 scripts / DevConsole Web UI
- **BMAD workflows 進化**:v6.0.0-alpha.21 + Epic BU 升級至 v6.2.2 概念(XML→Markdown step files)
- **Pipeline 6 層守護**:L5 Heartbeat + L6 429/Model Purity 偵測
- **OTel Token 追蹤**:`otel-micro-collector.js` + `workflow_executions` 表 4 token 欄位 + cost USD
- **Phase 4 Rule Violation Tracker**:5-Layer Anti-Recidivism Chain
- **9 篇深度補全文檔**:SANITIZATION-POLICY / skills / rules / idd / hooks / memory / mcp / bmad-workflows / commands

---

## 這個專案是什麼?

一個**完整、可攜帶的多引擎協作範本包**,結合:
- Token 經濟學(靜態成本從 ~18K → ~13K,-28%;歷史峰值 -76.5%)
- Context Memory DB(SQLite + FTS5 + 本地 ONNX,零 API 成本)
- 14 個 Hooks 生命週期自動化(RAG / Pipeline / Debt / IDD / Rule Violation)
- 74 個 Skills 自動偵測 + 三引擎同步
- 20 個 Rules 含 Constitutional / Verification / Sync Gates / IDD 保護
- BMAD workflow overlay(create-story / dev-story / code-review 共 41 個 step files)
- DevConsole Web UI 記憶庫視覺化

---

## 核心框架整合:BMAD Method × Everything Claude Code

| 框架 | 強項 | 整合方式 |
|:----|:----|:----|
| **BMAD Method** v6.0.0-alpha.21 | 規格驅動的敏捷團隊模擬,17 agents,4 phase workflows | `_bmad/` 目錄 + Markdown step file 格式(Epic BU)|
| **Everything Claude Code** v1.9.0 | Token 經濟學,TDD workflow,AgentShield,持續學習 | Hooks 整合 + RAG 注入 + Skills 市集 |
| **客製化加強** | DB-First Stories,Sync Gates,Pipeline 6 層守護,IDD | 本工具包 overlay |

**整合策略**:取兩家之長,以 overlay pattern 融合,透過 PowerShell 自動化部屬。

---

## 目錄

1. [解決什麼問題?](#解決什麼問題)
2. [架構全景](#架構全景)
3. [目錄結構](#目錄結構)
4. [快速開始](#快速開始)
5. [模組詳解](#模組詳解)
6. [研究報告索引](#研究報告索引)
7. [TRS 執行故事](#trs-執行故事)
8. [技術需求](#技術需求)
9. [部署情境](#部署情境)
10. [版本歷史](#版本歷史)
11. [授權與致謝](#授權與致謝)

---

## 解決什麼問題?

| 挑戰 | 症狀 | 解決方案 |
|:----|:----|:----|
| 靜態提示詞過大 | 每次新對話載入 ~18K tokens 才開始 | 三層 CLAUDE.md(全域 ≤30 行 / 專案 ≤200 / 本地)→ ~13K(-28%)|
| 跨對話知識遺失 | AI 每次重新學習相同 bug 修復/決策 | Context Memory DB + UserPromptSubmit hook 11 層 RAG 注入 |
| 多引擎協作混亂 | Claude / Gemini / Antigravity / Rovo Dev 各自為政 | 統一 `AGENTS.md` 憲章 + sprint-status.yaml + tracking files 狀態機 |
| Pipeline 靜默卡死 | 子視窗因配額耗盡 / 模型降級而停 | 6 層守護:L5 Heartbeat + L6 429/Model Purity 自動 kill |
| Skills 隨時間 drift | code 變了但 Skills 沒同步 → 下次對話用 stale SOP | Skill-Sync-Gate + Skill-IDD-Sync-Gate + 字面 Skill tool 調用強制 |
| 技術債看不見 | Defer 理由忘記、重複討論 | Tech Debt v3.0 框架(6 分類 × 5 嚴重度 × Priority Score × 5-Min Rule × Boy Scout × 5-Layer Triage)|
| 故意決策與 debt 混淆 | Free Plan 全開放被登成「TODO 後續修」 | IDD Framework:4 層標註,4 sub-types,forbidden_changes 保護 |

---

## 架構全景

### Token 消耗分層模型

```
Layer 0: 系統提示詞(不可修改)
Layer 1: ~/.claude/CLAUDE.md      (全域,≤30 行,~221 tokens) ← Always-On
Layer 2: ./CLAUDE.md              (專案,≤200 行,~1,276 tokens) ← Always-On
Layer 3: ./CLAUDE.local.md        (本地 Identity,~241 tokens) ← Always-On
Layer 4: .claude/rules/*.md       (20 rules,~5,400 tokens) ← Always-On
Layer 5: .claude/skills/*/SKILL.md descriptions(74 skills,~6,200 tokens)← Always-On(摘要)
Layer 6: Workflow 執行            (按任務,按需,~1,500-3,000 tokens)
```

### Context Memory DB 4 層架構

```
L0 知識記憶層(必要)
  ├── 30+ 表:context_entries / tech_entries / tech_debt_items /
  │   intentional_decisions / stories / cr_reports / cr_issues /
  │   conversation_sessions / conversation_turns / doc_index /
  │   document_chunks / glossary / workflow_executions / benchmarks /
  │   test_journeys / test_traceability / pipeline_checkpoints /
  │   sprint_index / rule_violations / 7 embedding 表
  ├── FTS5 trigram + WAL 模式 + ledger.jsonl(災備)
  └── 23 MCP tools(search × 10 / write × 4 / trace × 3 / analytics × 6)

L1 程式碼語意層(選用,需 .NET SDK)
  └── symbol_index / symbol_dependencies / symbol_embeddings(Roslyn AST)

L2 向量語意層(選用,本地 ONNX 或 OpenAI)
  └── Xenova/all-MiniLM-L6-v2(384D,零 API 成本)

L3 動態注入層
  └── UserPromptSubmit Hook → 11 層 RAG 注入
      (Session / Rule Violations / Story / Tech Debt / Decisions /
       Pipeline / Skills / LSP / Code RAG / IDD / Document RAG)

Phase 4 連續學習
  └── retrieval_observations / retrieval_hits / retrieval_keywords /
      pattern_observations / embedding_queue
```

### 多引擎協作架構

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ Claude Code │ Gemini CLI  │ Antigravity │ Rovo Dev    │
│ (CC-OPUS)   │ (GC-PRO)    │ (AG-OPUS)   │ (RD-SONNET) │
├─────────────┼─────────────┼─────────────┼─────────────┤
│ .claude/    │ .gemini/    │ .agent/     │ .rovodev/   │
│ 74 skills   │ 75 skills   │ 74 skills   │ -           │
└─────────────┴─────────────┴─────────────┴─────────────┘
        ↓ 透過共享狀態 ↓
┌──────────────────────────────────────────────────────┐
│ AGENTS.md(統一憲章)                                  │
│ sprint-status.yaml(狀態機)                           │
│ docs/tracking/active/*.track.md(每 Story 日誌)        │
│ context-memory.db(Context Memory DB SSoT)             │
└──────────────────────────────────────────────────────┘
```

---

## 目錄結構

```
claude-agent-toolkit/
├── deployment/
│   ├── config-templates/
│   │   ├── claude/                  ← 專案層 Claude 配置
│   │   │   ├── CLAUDE.md.template
│   │   │   ├── CLAUDE.local.md.template
│   │   │   ├── MEMORY.md.template
│   │   │   ├── settings.json.template
│   │   │   ├── settings.local.json.template
│   │   │   ├── hooks/
│   │   │   │   ├── pre-prompt-rag.js          ← 11 層 RAG 注入
│   │   │   │   ├── session-recovery.js
│   │   │   │   ├── precompact-tool-preprune.js
│   │   │   │   └── ... (共 14 hooks)
│   │   │   └── rules/                          ← 20 rules
│   │   │       ├── constitutional-standard.md
│   │   │       ├── verification-protocol.md
│   │   │       ├── skill-sync-gate.md
│   │   │       ├── skill-idd-sync-gate.md
│   │   │       ├── skill-tool-invocation-mandatory.md
│   │   │       ├── deployment-doc-freshness.md
│   │   │       ├── story-lifecycle-invariants.md
│   │   │       └── ... (12 個其他)
│   │   ├── claude-global/                      ← ~/.claude 全域層
│   │   │   ├── CLAUDE.md.template (27 行極簡)
│   │   │   ├── settings.json.template
│   │   │   └── commands/                       ← 3 個 Telegram bridge
│   │   ├── context-db/                         ← MCP server 範本
│   │   │   ├── server.js
│   │   │   ├── package.json.template
│   │   │   ├── mcp.json.template
│   │   │   └── scripts/init-db.js
│   │   ├── gemini/                             ← .gemini/ 範本
│   │   ├── antigravity/                        ← .agent/ 範本
│   │   └── rovodev/                            ← .rovodev/ 範本
│   ├── bmad-overlay/                           ← BMAD v6.2.2 概念
│   │   └── 4-implementation/
│   │       ├── code-review/   (13 step files + saas-standards.md)
│   │       ├── create-story/  (8 step files)
│   │       └── dev-story/     (13 step files)
│   ├── scripts/                                ← 自動化
│   │   ├── deploy-context-db.ps1
│   │   ├── story-pipeline.ps1
│   │   ├── batch-runner.ps1
│   │   ├── batch-audit.ps1
│   │   ├── epic-auto-pilot.ps1
│   │   ├── otel-micro-collector.js             ← Token 追蹤
│   │   ├── pipeline-recovery.js
│   │   ├── pipeline-quota-check.js
│   │   ├── pipeline-log-tokens.js
│   │   ├── verify-deployment-docs.cjs          ← 文檔新鮮度 CI
│   │   └── ... (10+ check-*.ps1/.cjs scripts)
│   └── docs/
│       ├── README.md
│       ├── 開發前環境部署_v3.0.0.md             ← 主部屬手冊
│       ├── BMAD架構演進與優化策略.md
│       ├── context-memory-db-strategy.md
│       ├── multi-agent-parallel-execution-strategy.md
│       ├── worktree-quick-reference.md
│       ├── SANITIZATION-POLICY.md              ← (NEW v1.8.0)
│       ├── skills-deep-dive.md                 ← (NEW v1.8.0)
│       ├── rules-deep-dive.md                  ← (NEW v1.8.0)
│       ├── idd-framework.md                    ← (NEW v1.8.0)
│       ├── hooks-events-deep-dive.md           ← (NEW v1.8.0)
│       ├── memory-system-deep-dive.md          ← (NEW v1.8.0)
│       ├── mcp-ecosystem.md                    ← (NEW v1.8.0)
│       ├── bmad-workflows-evolution.md         ← (NEW v1.8.0)
│       ├── commands-reference.md               ← (NEW v1.8.0)
│       └── global-claude-config.md             ← (NEW v1.8.0)
├── tools/
│   └── dev-console/                            ← React + Express Web UI
└── research/                                   ← 策略報告
    ├── token-reduction-final-report.md
    ├── multi-engine-collaboration-strategy.md
    ├── bmad-vs-everything-claude-code.md
    └── 當前環境完整快照_2026-05-01.md          ← (NEW v1.8.0 SSoT 快照)
```

---

## 快速開始

### 前置條件

```bash
node --version    # ≥18(MCP Server runtime)
git --version     # ≥2.30
claude --version  # Claude Code CLI(必要)
gemini --version  # 選用
```

### 5 步部屬

```powershell
# Step 1: 部屬 Context Memory DB(一鍵)
cd <your-project-root>
powershell -ExecutionPolicy Bypass `
  -File <toolkit-path>/deployment/scripts/deploy-context-db.ps1

# Step 2: 配置 CLAUDE.md(專案層)
cp <toolkit-path>/deployment/config-templates/claude/CLAUDE.md.template ./CLAUDE.md
# 編輯:專案名稱、Skill 索引、測試帳號、禁止事項

# Step 3: 部屬 Rules(19 個)
mkdir -p .claude/rules
cp <toolkit-path>/deployment/config-templates/claude/rules/*.md .claude/rules/

# Step 4: (選用)BMAD Overlay
cp -r <toolkit-path>/deployment/bmad-overlay/4-implementation/* `
       _bmad/bmm/workflows/4-implementation/

# Step 5: 驗證
claude mcp list                                     # MCP server 註冊
node <toolkit>/deployment/scripts/verify-deployment-docs.cjs   # 文檔新鮮度
```

### DevConsole Web UI(選用視覺化)

```bash
cd tools/dev-console
npm install
npm run dev
# 前端:http://localhost:5174
# API: http://localhost:3001
```

---

## 模組詳解

### 1. Token 經濟學

- **成果**:靜態提示詞從 ~18K → ~13K(-28%;歷史峰值 -76.5%)
- **策略**:三層 CLAUDE.md(全域 / 專案 / 本地)+ Skills 按需載入 + Rules 條件路徑
- **參考**:`research/token-reduction-final-report.md`

### 2. Context Memory DB

- **引擎**:SQLite + FTS5 trigram + WAL 模式
- **嵌入**:Xenova/all-MiniLM-L6-v2(384D,零 API)
- **資料表**:30+(知識 / 程式碼 / 向量 / Phase 4 學習 / Phase 5 度量)
- **MCP Tools**:23(search × 10 / write × 4 / trace × 3 / analytics × 6)
- **參考**:`deployment/docs/memory-system-deep-dive.md`

### 3. 多引擎協作

- **引擎**:Claude Code(CC)/ Gemini CLI(GC)/ Antigravity IDE(AG)/ Rovo Dev(RD)
- **憲章**:統一 `AGENTS.md` v3.0(857 行)
- **狀態**:`sprint-status.yaml` + `tracking/active/*.track.md`
- **MCP 共享**:stdio 相同 / HTTP 傳輸 key 不同(`url` vs `httpUrl` vs `serverUrl`)
- **參考**:`research/multi-engine-collaboration-strategy.md`

### 4. Pipeline 自動化(Epic WFQ)

- **3-slot 並行**:create / dev / review 同時跑,12s 間隔,8min watchdog
- **6 層守護**:
  - L1 Pre-batch token 檢查
  - L2 Pre-story token 檢查
  - L3 Phase Gate
  - L4 事後驗證
  - L5 Heartbeat(Stop hook timestamp)
  - L6 429/Model Purity(stderr 掃描,降級立即 kill)
- **Model Purity Rule**:**禁止** Opus→Sonnet 自動降級(會污染 code-review)
- **OTel Token 追蹤**:`otel-micro-collector.js`(port 49152-65535)→ JSONL → DB
- **參考**:`deployment/docs/Claude智能中控自動化排程/pipeline-audit-token-safety.md`

### 5. BMAD Workflow Overlay

- **基礎**:BMAD Method v6.0.0-alpha.21
- **概念升級**:v6.2.2(Markdown step file 格式,XML 已棄用)
- **3 大核心 Workflow**:
  - `code-review`:13 step + 三層平行(Blind / Edge / Acceptance)+ SaaS 9 維 + Phase A-D Audit
  - `create-story`:8 step + 7 Depth Gates(D1-D7)+ DB-first + ATDD
  - `dev-story`:13 step + Skill Staleness + Migration Cascade + KB Error Query + 三層 Sync Gates
- **參考**:`deployment/docs/bmad-workflows-evolution.md`

### 6. Skills 治理

- **總數**:74(47 領域 + 1 第三方 + 26 工具)
- **Domain Profile**:17 域,≤3 成員 → 全載;≥4 → primary + 最相關 2 個
- **三引擎同步**:`.claude/` ⟷ `.gemini/` ⟷ `.agent/`(md5 一致,除引擎特定 frontmatter)
- **Sync Gates 3 層**:skill-sync-gate / skill-idd-sync-gate / skill-tool-invocation-mandatory
- **參考**:`deployment/docs/skills-deep-dive.md`

### 7. IDD Framework(故意性決策債)

- **4 sub-types**:COM(商業)/ STR(策略)/ REG(法規)/ USR(用戶反向)
- **4 層標註**:Code(`[Intentional: IDD-XXX]`)/ ADR / DB(`intentional_decisions` 表)/ Memory(`memory/intentional_*.md` + MEMORY.md)
- **Forbidden Changes**:JSON pattern,由 Skill-IDD-Sync-Gate 保護
- **參考**:`deployment/docs/idd-framework.md`

---

## 研究報告索引

| 報告 | 路徑 |
|:----|:----|
| Token 減量最終彙整報告 v2.0 | `research/Claude_Code_Token_減量策略_最終彙整報告_v2.0.md` |
| 多引擎協作策略 | `research/multi-engine-collaboration-strategy.md` |
| BMAD-METHOD vs Everything Claude Code | `research/BMAD-METHOD 與 everything-claude-code 比較.md` |
| Hermes 導入(5 概念移植)| `research/hermes導入.md` |
| 專案優化項目計畫 F1-F5 / G1-G3 / H1-H4 | `research/專案優化項目計畫.md` |
| **當前環境完整快照 2026-05-01** | `research/當前環境完整快照_2026-05-01.md` ← (NEW v1.8.0)|

---

## TRS 執行故事(41 個實戰驗證)

| Epic | Stories | 成果 |
|:----|:----:|:----|
| TRS-0~34 | 35 | Token 靜態成本 -86%(15.4K→2.6K)|
| TD-15~19 | 5 | DB Schema 清理 + Skill Validator |
| TD-32~36 | 5 | Context Memory DB + MCP Server + ONNX |
| CMI-1~6 | 6 | 對話生命週期 + ETL + 對話級記憶 |
| WFQ-01~08 | 8 | Pipeline 配額 + Heartbeat + 429/Model Purity |
| ECC-01~05 | 5 | Hook 基礎設施(Pre-Commit / Config Protection / RAG / suggest-compact / MCP Health)|
| BU-01~06 | 6 | BMAD v6.2.2 升級(XML→MD + 三層平行 + Skill Validator)|

---

## 技術需求

| 元件 | 版本 | 必要性 | 用途 |
|:----|:----:|:----:|:----|
| Node.js | ≥18 | ✅ | MCP Server runtime |
| PowerShell | 5.1+ | ✅ | 自動化腳本(Windows)|
| Claude Code CLI | latest | ✅ | 主 AI 引擎 |
| Git | ≥2.30 | 建議 | 版本控制 |
| .NET SDK | ≥8 | 選用 | L1 Code RAG(Roslyn)|
| Gemini CLI | latest | 選用 | 多引擎支援 |
| Antigravity IDE | latest | 選用 | E2E 測試 + IDE 整合 |
| Rovo Dev CLI | latest | 選用 | Atlassian 整合 |

---

## 部署情境

| 情境 | 引擎 | 適用場景 |
|:----|:----|:----|
| **最小** | 僅 Claude Code | 個人開發、VS Code workflow |
| **雙引擎** | Claude + Gemini | 規劃 vs 執行分工 |
| **三引擎** | Claude + Gemini + Antigravity | + E2E 測試、IDE 整合 |
| **完整** | 全 4 引擎 | + Atlassian Jira/Confluence 整合 |

---

## 版本歷史

| 版本 | 日期 | 變更 |
|:----|:----|:----|
| **1.8.0** | **2026-05-01** | **新增 9 篇深度補全文檔**(SANITIZATION-POLICY / skills / rules / idd / hooks / memory / mcp / bmad-workflows / commands)+ **global-claude-config.md** + **當前環境完整快照 2026-05-01** SSoT。**數字校正**:14 hooks(原 6)/ 74 skills(原 38)/ 20 rules(原 7)/ 30+ DB tables / 23 MCP tools / 82 scripts。**維護機制**:`deployment-doc-freshness.md` rule + `verify-deployment-docs.cjs` CI advisory。**3 層 Sync Gates** 強制執行。**IDD 4 層標註** + 4 sub-types。**Pipeline 6 層守護**(L5 Heartbeat + L6 429/Model Purity + Model Purity Rule)。**OTel Token 追蹤**。**BMAD v6.2.2 概念升級**(Epic BU)。**Phase 4 Rule Violation Tracker**(5-Layer Anti-Recidivism Chain)。 |
| 1.7.1 | 2026-04-04 | Epic WFQ Pipeline 配額管理 + Heartbeat (L5) + 429/Model Purity (L6) + Recovery Script + OTel Token + Quota Prediction + Phase Timeout 分級 + ModelPricing + Model Purity Rule。-p 模式 Truth Table(v2.1.92)。DB Schema +4 欄位。BMAD Workflow 定義補強(4 GAP 修復)。6 Stories,avg CR 93.5。 |
| 1.7.0 | 2026-03-12 | G 類 SDD+ATDD+TDD 方法論(FLOW-OPT-001)+ Epic CMI 對話生命週期(CMI-1~6)+ bmad-overlay 同步 5 檔 + sdd-spec-generator skill。Token 減量 Session 成本 ~4,910 tokens(-68%)。 |
| 1.6.0 | 2026-03-07 | Context Memory DB 策略(TD-32~36)+ MCP Server + init-db + deploy-context-db.ps1 + context-memory-db.md rule + MEMORY.md template(~350 tokens)+ TD-15~19 schema 清理。 |
| 1.5.0 | 2026-03-02 | Pipeline 中控自動化 + Token 安全閥 + batch-audit + TRS-35/37/38(Sprint Status 縮行 / Registry 歸檔 / 單讀)。 |
| 1.4.0 | 2026-02-28 | 技術債中央登錄(TRS-34)+ worktree merge 規則。 |
| 1.3.0 | 2026-02-27 | Worktree 速查 + 主手冊 v3.1.0(PART 8.5 Worktree 並行 + merge SOP)。 |
| 1.2.0 | 2026-02-27 | BMAD 架構演進分析 + Token 量化 + ECC 覆蓋 + 遷移決策框架。 |
| 1.1.0 | 2026-02-27 | Rovo Dev CLI 範本 + CLI 安裝指南 + 條件部屬 + 環境矩陣 + 新引擎接入 SOP。 |
| 1.0.0 | 2026-02-27 | 初版:TRS 優化 overlay + 配置範本 + 自動化腳本。 |

---

## 授權與致謝

**授權**:MIT

**來源材料**:
- [BMAD-METHOD](https://github.com/bmadcode/BMAD-METHOD) — MIT License
- [Everything Claude Code](https://github.com/anthropics/everything-claude-code) — Anthropic 課程材料
- 客製化整合與加強由工具包作者完成

**致謝**:
- Anthropic 團隊提供 Claude Code CLI + MCP 協定
- BMAD Method 社群的規格驅動工作流方法論
- 所有 TRS Story 貢獻者實戰驗證優化

---

> **語言**: [English](README.md) | [繁體中文](README.zh-TW.md)
> **版本**: 1.8.0 | **最後更新**: 2026-05-01
