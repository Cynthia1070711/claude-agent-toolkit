---
name: full-module-qa-loop
description: 功能模組全方位半自動手動檢測閉環工作流。由 Party Mode 多 Agent 討論 → Contract Verification 商業規則驗證 → 測試樹建立 → Chrome MCP 觀察員模式 + 使用者手動測試 + 子代理深度分析 + 跨 Story 根因合併(CMRD)+ 檢測階段 Skill 即時校正(池化)+ Story Refinement Gate(SDS 拆分) → Pipeline 批次修復組成的 5 階段工作流。適用於任何需要「使用者驗收 + 系統化修復」雙向閉環的模組級 QA 任務。特別適合 MVP 上線前的信心重建工程、多方案(Plan)矩陣合規驗證、跨模組根因識別與收斂。
triggers: 全方位檢測, 全功能測試, 模組深度檢測, 半自動手動 QA, 半自動化檢測, Chrome MCP 全檢, 使用者驗收迴圈, 模組全檢, Epic 深度修復, 信心重建工程, 跨模組根因合併, Story refinement gate, comprehensive module detection, manual qa loop, full feature audit, confidence rebuild workflow
version: 1.0.0
created: 2026-04-07
updated: 2026-04-07
author: CC-OPUS (Party Mode 4-round consensus)
module: qa-workflow
scope: cross-project
domain: testing
last-synced-epic: epic-eft
watches:
  - docs/tracking/active/**
  - docs/implementation-artifacts/stories/**
  - .claude/rules/constitutional-standard.md
  - .claude/rules/skill-sync-gate.md
---

# Full Module QA Loop — 模組全方位檢測閉環工作流

> **一句話定位**:把「使用者手動測試 + Chrome MCP 觀察員 + Sub-agent 分析 + 跨 Story 合併 + Skill 即時校正 + Refinement Gate + Pipeline 修復」打包為可重用的 5 階段閉環。

---

## 適用時機(When to use)

本 Skill 專為以下情境設計:

| 情境 | 為何適用 |
|------|---------|
| **MVP 上線前信心重建** | 大規模功能修復後需要全量驗證,建立「產品就緒」信心指標 |
| **多方案(Plan)矩陣合規** | 5 Plan × N 功能 × 防呆 × UI/UX 的組合爆炸需正交取樣 |
| **跨模組根因識別** | 多處症狀疑似同根因,需要 CMRD 5 維度相關性分析 |
| **商業規則校正期** | 發現 Skill/Spec/程式碼三向不一致,需要使用者介入決策 |
| **使用者為首席驗收者** | Product Owner 願意投入時間換取檢測深度 |
| **全功能模組深度掃描** | 不只測功能,還要校正 UI/UX 生命週期、防呆機制、商業邏輯 |

## 不適用時機(When NOT to use)

| 情境 | 應改用 |
|------|-------|
| 單一 Bug 修復 | `bug-fix-verification` |
| 全自動化 E2E 測試 | `phycool-e2e-playwright` |
| 純程式碼審查(無使用者驗收) | `code-review` |
| 時間壓力極高快速交付 | `quick-flow-solo-dev` |
| 模組功能未實作 | `party-to-pipeline` → 建立新 Story |

---

## 5 階段總覽

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase 1: Party Mode 多 Agent 討論                                │
│ ─────────────────────────────────────                           │
│ • 調用 /bmad:core:workflows:party-mode                          │
│ • 多輪收斂測試樹結構 + 執行 SOP + 商業規則假設                    │
│ • 產出: 多 Agent 共識紀錄                                        │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ Phase 2: 測試樹建立 + Contract Verification                      │
│ ─────────────────────────────────────                           │
│ Step 0: Backend Contract Verification (file:line 證據)          │
│ Step 1: 建立測試樹骨架 (L0-L3 × 5D 矩陣)                        │
│ Step 2: 建立 Story 增量規則檔                                    │
│ Step 3: 建立 Sub-agent PIVOT SOP 檔                             │
│ Step 4: 建立 Skill Sync Pool 初始檔                             │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ Phase 3: 半自動化檢測 7 步閉環 (per L2 模組)                     │
│ ─────────────────────────────────────                           │
│ 1. 中控 Chrome MCP 初始化 + 基線 snapshot                        │
│ 2. 使用者手動切換 N 個帳號測試                                    │
│ 3. 使用者回饋問題(歸總 UI/UX + 商業 + 防呆)                      │
│ 4. 中控委派 Sub-agent 深度分析(PIVOT + 證據)                    │
│ 5. Sub-agent 執行 CMRD 查所有 active Stories                    │
│ 6. 中控決策: 補到既有 Story 或建新 Story                         │
│ 7. Skill 池化即時校正 + 進入下個模組                             │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ Phase 3.5: Story Refinement Gate (強制節點)                      │
│ ─────────────────────────────────────                           │
│ • 計算所有 Story 的 SDS (Story Difficulty Score)                │
│ • SDS > 50 強制拆分 (4 策略選降幅最大)                           │
│ • 重建依賴圖 (spec → bug → saas → drift)                        │
│ • 產出 Refinement Report + Pipeline Batch Plan                  │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ Phase 4: Pipeline 批次修復 (動態排程)                            │
│ ─────────────────────────────────────                           │
│ • 依賴鏈排序                                                     │
│ • 衝突矩陣 (同檔案不並行)                                        │
│ • 動態排程 (併行上限 3,slot 空出立即補位)                        │
│ • 每 Story 完成觸發 tasks-backfill + Skill sync                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 核心原則(8 條)

1. **Party Mode 強制前置** — 任何複雜檢測議題必須先經多 Agent 討論收斂(禁止跳過 Phase 1)
2. **Contract Verification 優先** — 商業規則真相報告先於測試樹建立(依 Constitutional Backend Contract Verification Mandate)
3. **人機協作雙角色** — 使用者 = 手動測試(驗收者);中控 = Chrome MCP 觀察員(證據收集);Sub-agent = 深度分析(file:line 證據)
4. **跨 Story 根因合併** — 新問題回饋進來時,必須查所有 active Stories 跑 CMRD 5 維度(禁止同模組盲合併)
5. **檢測階段 Skill 即時校正** — 發現 Skill drift 立即池化補充(detection-time sync),不延後到修復階段
6. **Refinement 強制節點** — Pipeline 啟動前必須拆分 SDS > 50 的 Story,否則 Pipeline 必然失敗
7. **Token 經濟學** — 主控端輕量統籌,sub-agent 重量分析,節省 90% 主控 context
8. **Constitutional 強制** — 所有分析必須 Read 程式碼取 file:line 證據,嚴禁從 Skill 描述推測

---

## Phase 1: Party Mode 多 Agent 討論

**目的**:收斂測試樹結構、執行 SOP、商業規則假設。

**強制前置**:調用 `/bmad:core:workflows:party-mode`,由 orchestrator 選擇 3-4 位最相關的 Agent 展開討論。

**推薦 Agent 組合**:

| 議題 | Primary | Secondary | Tertiary |
|------|---------|-----------|----------|
| 測試樹結構設計 | 🧪 Murat (TEA) | 🎨 Sally (UX) | 📋 John (PM) |
| Story 合併策略 | 🏃 Bob (SM) | 🔬 Dr. Quinn (CPS) | 📊 Mary (Analyst) |
| 商業規則校正 | 📊 Mary | 🏗️ Winston (Architect) | 📋 John |
| 拆分演算法 | 🔬 Dr. Quinn | 🏃 Bob | 🧪 Murat |

**收斂條件**:
- 使用者輸入 `*exit` 或確認共識
- 或 4+ 輪後邊際效益遞減

**產出**:
- 多 Agent 討論對話紀錄(自動透過 Context DB 儲存)
- 測試樹 L0-L3 結構草案
- 執行 SOP 初步版本
- 商業規則待驗證清單

**詳見**:`references/phase-structure.md` §Phase 1

---

## Phase 2: 測試樹建立 + Contract Verification

**Step 0 — Backend Contract Verification(最重要)**

**為什麼必須做**:Constitutional Standard 要求所有商業規則必須有 file:line 程式碼證據,不得從 Skill/文件推測。

**15 分鐘流程**:
```
1. 列出所有 Party Mode 提出的商業規則假設
2. 對每條假設,委派 sub-agent Read 對應程式碼
3. Sub-agent 回傳 file:line 證據表
4. 產出「商業規則真相報告」三欄表(假設 / 現狀 / 差異)
5. 使用者決策最終規則
6. 同步更新相關 Skill 文件
7. 建立 ADR-BUSINESS-XXX 決策紀錄(可選但推薦)
```

**Step 1-4 — 建立工作流所需檔案**:
- 測試樹骨架 YAML(docs/tracking/active/{project}-test-tree.md)
- Story 增量規則(epic-eft 或自定義 epic-id)
- Sub-agent PIVOT SOP
- Skill Sync Pool 初始 JSON

**詳見**:`references/phase-structure.md` §Phase 2

---

## Phase 3: 半自動化檢測 7 步閉環

**核心**:per L2 模組執行的 7 步閉環,形成全功能檢測。

```
1. [中控] Chrome MCP 初始化 + 基線 snapshot
2. [使用者] 手動切換 N 個帳號逐一測試
3. [使用者] 歸總回饋問題(UI/UX + 商業 + 防呆)
4. [中控] 立即 take_snapshot + take_screenshot + console/network
5. [中控→Sub-agent] PIVOT 委派深度分析 + CMRD 查既有 Stories
6. [中控] 決策: 補 AC 到既有 Story / 建新 Story / cross-ref
7. [中控] Skill 池化校正(不立即 edit,累積批次處理)→ 下個模組
```

**Chrome MCP 觀察員工具集(7 個,最小必要)**:
- `list_pages` / `navigate_page` / `take_snapshot` / `take_screenshot`
- `list_console_messages` / `list_network_requests` / `evaluate_script`

**禁止**中控使用 click/type/fill/drag/press_key(這些是使用者的工作,中控只觀察不操作)。

**詳見**:
- `references/chrome-mcp-observer-sop.md`(7 工具 4 Phase SOP)
- `references/sub-agent-pivot-template.md`(PIVOT 委派模板)
- `references/cmrd-algorithm.md`(5 維度相關性演算法)

---

## Phase 3.5: Story Refinement Gate(強制節點)

**為什麼強制**:SDS > 50 的 Story 進 Pipeline 必然失敗(dev-story Sonnet 成功率 <50%)。

**SDS 公式**:
```
SDS = AC_count × 1.5
    + affected_files × 2.0
    + cross_module_count × 5.0
    + br_rules_count × 1.0
    + plan_matrix_coverage × 0.5
    + estimated_minutes / 10
    + skill_corrections_count × 1.5
```

**觸發規則**:
- SDS > 50 → **強制拆分**
- SDS 35-50 → 建議拆分
- SDS < 35 → 直接 ready-for-dev

**4 拆分策略**(選 SDS 降幅最大):
1. 根因類別拆(Bug / SaaS / Drift / Spec)
2. 影響檔案集合拆(graph connected components)
3. Plan 矩陣拆(Free / Paid / Max-Tier)
4. BR 規則拆(逐條 BR-* 分組)

**詳見**:`references/sds-refinement-gate.md`

---

## Phase 4: Pipeline 批次修復

**策略**:動態排程(party-to-pipeline §5)

**執行規則**:
- 依賴鏈排序(spec Story 先跑)
- 衝突矩陣(同檔案禁並行)
- 併行上限 3,slot 空出立即補位
- 每 Story 完成觸發 `tasks-backfill-verify` + Skill Sync Gate

**詳見**:`.claude/skills/party-to-pipeline/SKILL.md` §5

---

## FORBIDDEN(8 條)

- ❌ 跳過 Party Mode 前置直接進 Phase 2
- ❌ 跳過 Contract Verification Step 0(違反 Constitutional)
- ❌ Sub-agent 分析時從 Skill 描述推測程式碼行為(違反 Backend Contract Mandate)
- ❌ 中控親自 Read 大量程式碼而不委派 sub-agent(浪費主控 context)
- ❌ Pipeline 前跳過 Refinement Gate(SDS > 50 Story 會 Pipeline 失敗)
- ❌ 同一 Skill 檔案被多個並行 sub-agent 校正(Git 衝突)
- ❌ Story 合併只看同模組不跑 CMRD(遺漏跨模組根因)
- ❌ 使用者回饋問題不先查既有 Stories 直接建新 Story(碎片化)

---

## 關聯規則(必讀)

- `.claude/rules/constitutional-standard.md` — **Code Verification Mandate** + **Backend Contract Verification Mandate**
- `.claude/rules/skill-sync-gate.md` — Skill 同步規則(本 Skill 是 detection-time 版本的延伸)
- `.claude/rules/tasks-backfill.md` — Pipeline 完成後的 tasks 回填驗證
- `.claude/rules/context-memory.md` — Sub-agent 發現後的 Memory DB 寫入規則

---

## 關聯 Skill(觸發載入)

- `party-to-pipeline` — Phase 4 Pipeline 動態排程執行
- `claude-launcher-interactive` — Pipeline 啟動引擎
- `bug-fix-verification` — 修復後的驗證
- `tasks-backfill-verify` — Pipeline 完成後 tasks 驗證

---

## 三引擎同步要求

本 Skill 必須同步至:
- `.claude/skills/full-module-qa-loop/`(Claude Code CLI)
- `.gemini/skills/full-module-qa-loop/`(Gemini)
- `.agent/skills/full-module-qa-loop/`(Agent Universal)

**同步時機**:
- Skill 建立時(含所有 references + templates)
- 任何 SKILL.md frontmatter 欄位變更時
- 任何 references/*.md 內容變更時

---

## 參考文件(references/)

| 檔案 | 內容 |
|------|------|
| `phase-structure.md` | 5 階段完整詳細定義 + Step 分解 |
| `chrome-mcp-observer-sop.md` | Phase 3 觀察員模式 7 工具 × 4 Phase SOP |
| `sub-agent-pivot-template.md` | Sub-agent 委派 PIVOT 5 段式模板 |
| `cmrd-algorithm.md` | Cross-Module Relevance Detection 5 維度演算法 |
| `sds-refinement-gate.md` | Phase 3.5 SDS 公式 + 4 拆分策略 |
| `root-cause-taxonomy.md` | 5 大類 × 16 子類根因分類學 |

## 範本(templates/)

| 檔案 | 用途 |
|------|------|
| `test-tree-skeleton.md` | L0-L3 測試樹骨架範本(含 5D 矩陣欄位) |

---

## 版本歷史

- **v1.0.0** (2026-04-07) — 初版,Party Mode 4 輪收斂成果(Bob/Murat/Sally/John/Mary/Winston/Dr.Quinn 共識)
