# BMAD 架構演進與優化策略指南

**版本**: 2.0.0
**建立日期**: 2026-02-27
**最後更新**: 2026-04-03（Epic BU 完成 + ECC 計畫確立）
**適用範圍**: BMAD Method 架構版本遷移決策 + Token 優化策略 + ECC 整合評估 + Code-Review 客製化分析
**來源**: Party Mode 架構討論（CC-OPUS, 2026-02-27 初版 → 2026-04-03 Epic BU 升級）

---

## 目的

本文件記錄以下分析結果，供**新專案初始化**或**舊專案升級評估**時參考：

1. 當前 BMAD 架構的 Token 靜態消耗量化數據
2. BMAD v6.2.2 最新架構與 PCPT 自訂系統的差異
3. everything-claude-code (ECC) v1.9.0 功能覆蓋分析
4. Epic BU 升級成果（2026-04-03）
5. 遷移策略決策框架
6. 多引擎協作架構相容性考量

---

## 1. Token 靜態消耗量化基準

### 1.1 Always-Loaded 靜態消耗（PCPT 專案實測）

> 計算規則：CJK 字元 ÷ 1.5 = tokens、英文字元 ÷ 4 = tokens

| 分類 | 檔案 | 字元數 | 估算 Tokens |
|------|------|-------:|----------:|
| CLAUDE.md 全域 | `~/.claude/CLAUDE.md` | 655 | 221 |
| CLAUDE.md 專案 | `./CLAUDE.md` | 4,510 | 1,276 |
| CLAUDE.md 本地 | `./CLAUDE.local.md` | 688 | 241 |
| Rules x6 | `coding-style` / `constitutional` / `git` / `perf` / `security` / `testing` | 1,135 | 433 |
| Auto-Memory | `MEMORY.md` | 1,196 | 436 |
| **Always-Loaded 總計** | | **8,184** | **~2,607** |

### 1.2 On-Demand 載入

| 觸發時機 | 檔案 | Tokens |
|----------|------|-------:|
| create-story | `skills_list.md` | 604 |
| Workflow 執行 | `instructions.xml` + `checklist.md` | 1,500-3,000（視工作流而定） |
| Agent 啟用 | `.agent.md`（單個） | 400-800 |

### 1.3 與業界基準對比

| 框架 | 靜態消耗 | 備註 |
|------|-------:|------|
| Claude Code 預設 | ~18,000 | 無任何框架，純 System Prompt + 工具定義 |
| ECC 優化後 | ~10,000 | everything-claude-code 瘦身版 |
| **PCPT 專案（TRS 後）** | **~2,607** | 經 35 個 TRS Story 優化 |
| 理論最低 | ~1,500 | 僅保留 CLAUDE.md + 1 條 Rule |

**結論（v1.1.0 時）**：2,607 tokens 佔 200K context window 的 **1.3%**，已無進一步壓縮的必要。

> **v2.0.0 更新（2026-04-03）**：經過 Epic 系列擴展，Always-On 已升至 ~19,090 tokens（63 Skills × ~84 tok + 15 Rules/497L + MEMORY.md ~1,300 tok）。但 Opus 4.6 使用 1M context window，佔比僅 ~1.9%。Token 減量仍在監控中（見 `claude-token-decrease` Skill §6 ROI Ranking）。

---

## 2. BMAD 架構版本對照表

### 2.1 版本識別

| 維度 | 舊版（PCPT 使用中） | 最新版 v6.0.3 |
|------|----------------------|--------------|
| 安裝方式 | `npx bmad-method@alpha install` (alpha) | `npx bmad-method install` (stable) |
| 安裝時間 | 2026-01-01 | 2026-02-23 release |
| 原始碼目錄 | `_bmad/`（安裝後） | `src/`（原始碼）→ `_bmad/`（安裝後） |

### 2.2 結構性差異

| 維度 | 舊版 | 最新 v6.0.3 | 影響 |
|------|------|------------|------|
| **頂層模組數** | 4（bmm + bmb + cis + core） | 2（bmm + core）+ utility | 最新版少 2 個完整模組 |
| **總檔案數** | **652** | **225** | 最新版精簡 **65%** |
| **BMB 模組** | 完整獨立（5 agents, 7 workflows） | 已移除 | Builder 功能不再作為獨立模組 |
| **CIS 模組** | 完整獨立（6 agents, 4 workflows） | 合併進 `default-party.csv` | 創意 Agent 僅在 Party Mode 中使用 |
| **Agent 格式** | `.agent.md`（Markdown + 嵌入邏輯） | `.agent.yaml`（結構化 YAML） | YAML 更精簡、解析更穩定 |
| **Agent 平均大小** | ~6KB（dev.md = 6,046 bytes） | ~2KB（dev.agent.yaml = 2,154 bytes） | **單一 Agent 省 64%** |
| **共用元件** | 無（每個 Agent 嵌入完整 handler） | `utility/agent-components/`（12 個共用 handler） | DRY 原則，減少重複 |
| **Teams 概念** | 無 | `teams/` 目錄（可定義 Agent 子集） | 按需載入 Agent 組合 |
| **Party 花名冊** | 20 agents（4 模組分散） | 20 agents（BMM 9 + CIS-like 11 在 CSV） | 新增 5 個 Party-only 角色 |
| **IDE 安裝器** | 僅 Claude Code | Claude Code + Codex + Copilot + Kilo + Rovo Dev | 多 IDE 一鍵安裝 |

### 2.3 核心工作流大小差異

| 工作流 | 舊版（行數 / 大小） | 最新 v6.0.3（行數 / 大小） | 差異 |
|--------|-------------------|-------------------------|------|
| `dev-story/instructions.xml` | 436 行 / 24KB | 410 行 / 21KB | 最新小 13% |
| `code-review/instructions.xml` | 483 行 / 26KB | 226 行 / 10KB | **最新小 53%** |
| `create-story/instructions.xml` | 449 行 / 25KB | 346 行 / 19KB | 最新小 23% |

> **重要**：舊版的 code-review 比最新版大 2.1 倍，原因是包含 PCPT 專案客製化規則（Zustand/useState 驗證、CR 延後項目路由等）。這些客製化必須在遷移時保留。

### 2.4 最新版新增的 Agent 角色（Party Mode 專用）

| Agent | 圖示 | 身份 | 用途 |
|-------|------|------|------|
| Leonardo di ser Piero | 🎨 | 文藝復興全才 | 跨學科連結 |
| Salvador Dali | 🎭 | 超現實主義挑釁者 | 潛意識探索 |
| Edward de Bono | 🧩 | 水平思考先驅 | 系統性創意工具 |
| Joseph Campbell | 🌟 | 英雄旅程學者 | 原型敘事 |
| Steve Jobs | 🍎 | 組合式天才 | 交叉創新 |

### 2.5 最新版的 `.claude/skills/`（BMAD 自身的開源運維 Skills）

| Skill | 用途 |
|-------|------|
| `bmad-os-audit-file-refs` | 審計檔案引用合規性 |
| `bmad-os-changelog-social` | 從 CHANGELOG 生成社群公告 |
| `bmad-os-diataxis-style-fix` | Diataxis 文檔風格檢查 |
| `bmad-os-draft-changelog` | 自動起草 CHANGELOG |
| `bmad-os-gh-triage` | GitHub Issue 分類 |
| `bmad-os-release-module` | NPM 發版管理 |
| `bmad-os-review-pr` | 對抗式 PR 審查 |

> 注意：這些是 BMAD 開源專案自身的運維 Skills，**不是**使用者專案的業務 Skills。使用者專案的 Skills（如 `pcpt-*`）由團隊自行建立。

---

## 3. everything-claude-code (ECC) 功能覆蓋分析

### 3.1 已具備的 ECC 功能

| ECC 功能 | 我們的對應實作 | 覆蓋率 |
|----------|--------------|--------|
| TDD 工作流 | `/tdd` command + `tdd-workflow` Skill + `rules/testing.md` | 90% |
| Code Review | `/code-review` BMAD Workflow（含 PCPT 客製化） | 100%+ |
| Security Review | `/security-review` Skill + `rules/security.md` | 70% |
| Build Error Fix | `/build-fix` command + `build-error-resolver` agent | 80% |
| Plan Mode | `/plan` command + `planner` agent | 85% |
| Checkpoint | `/checkpoint` command | 80% |
| Verify | `/verify` command | 80% |
| 記憶持久化 | Auto-Memory `MEMORY.md` + BMAD `_memory/` | 60% |
| Hooks 防護 | PostToolUse（Epic sync）+ PreCompact（snapshot） | 40% |
| Secrets 保護 | `.claude/settings.json` deny rules + `.gemini/hooks/secret-guard.js` | 70% |

### 3.2 缺失的 ECC 功能與評估

| ECC 功能 | 價值描述 | 對專案影響 | 建議 |
|----------|---------|-----------|------|
| **持續學習 v2（Instinct System）** | 自動觀察開發習慣 → 信心分數 → 演化為 Skill | 🟡 中 | 可用 PreCompact Hook 簡化版替代 |
| **SessionStart/SessionEnd Hooks** | 啟動時自動載入近 7 天記憶，結束時萃取經驗 | 🟡 中 | Claude Code 已有 Auto-Memory，可新增 SessionStart Hook |
| **AgentShield 紅藍軍安全審計** | Opus 模型驅動的對抗式配置掃描 | 🟢 低 | 我們有 rules + security-review Skill，足夠 |
| **Token 經濟學（系統提示詞瘦身）** | 靜態消耗 18k → 10k | 🟢 低 | 我們已達 2,607，**遠優於 ECC 的 10k** |
| **動態提示詞注入** | 按階段切換注入內容 | 🟢 低 | BMAD Workflow 已實現按需載入 |
| **MCP 數量嚴格控制** | < 10 MCP + < 80 工具 | 🟢 低 | 目前 MCP 數量已精簡 |

### 3.3 結論

> **v1.1.0（2026-02-27）**：不需要額外引入 ECC 套件。BMAD + TRS 組合已覆蓋 ECC 80%+ 核心功能。
>
> **v2.0.0（2026-04-03）**：經六輪 Party Mode 深度分析 ECC v1.9.0，確認 5 項值得引入的 Hook 基礎設施強化已全部落地（Epic ECC 5/5 done）。13 項不適用（已有更好方案）。ECC 整體採用度從 85% 提升至 **92%**。

### 3.4 ECC v1.9.0 更新分析（v2.0.0, 2026-04-03）

> 六輪 Party Mode 深度分析 ECC v1.9.0 後，確認 7 項可引入優化，建立 **Epic ECC**（5 Stories）：

| 項目 | 優先級 | 說明 | CR Score | 狀態 |
|------|:------:|------|:--------:|:----:|
| Pre-Commit 品質 Hook | P0 | Bash PreToolUse 攔截 git commit（secrets/console.log/msg） | 92 | ✅ done |
| Config Protection Hook | P0 | PreToolUse 保護 settings/pipeline/config | 92 | ✅ done |
| RAG Pipeline 模式 | P1 | Pipeline 中省 ~3,500 tok/prompt（PIPELINE_PHASE env var） | — | ✅ done |
| suggest-compact Hook | P1 | Stop hook 工具計數 + 閾值提醒 | 95 | ✅ done |
| MCP Health Check Hook | P1 | PreToolUse 探測 + PostToolUseFailure 重連 | 94 | ✅ done |

**Epic ECC 完成（2026-04-03）**：5/5 done, avg CR 93.8, 72 tests 全部通過。
新增 4 個 hook 腳本 + 1 個現有 hook 修改，覆蓋 5 個 hook event。
Hook 檔案位置：`.claude/hooks/`（pre-commit-quality, config-protection, suggest-compact, mcp-health-check）。

> P2 長期項目（CL v2 Instinct 閉環 + Safety Guard）暫未建 Story，視需求再啟動。

---

## 3.5 Epic BU — BMAD Upgrade 成果（2026-04-03）

> BMAD 安裝版 v6.0.0-alpha.21 → v6.2.2 概念升級完成（6 Stories, avg CR 95.2）

| 升級項 | Story | 交付物 | 核心價值 |
|--------|-------|--------|---------|
| Workflow XML→MD 遷移 | bu-02 (L, CR:88) | 3 workflow.md + 34 step 文件 | 維護性提升，子視窗只載入當前 step |
| 三層平行 Review | bu-01 (M, CR:100) | Blind+Edge+Acceptance+Triage | 與 SaaS 9 維正交，bug 發現率提升 |
| Skill Validator | bu-03 (S, CR:94) | 14 規則 + check-hygiene 整合 | 92 Skill 品質自動防線 |
| Quick Dev oneshot | bu-04 (S, CR:94) | step-oneshot + self-check + XS 路徑 | 微任務零 overhead |
| Edge Case Hunter | bu-05 (S, done) | 獨立 Skill（5 維 + DB 映射） | Pipeline 外單獨調用 |
| Review Trail | bu-06 (S, CR:100) | path:line 導覽 + blast-radius 排序 | 結構化人工 review |

> **關鍵架構決策**：Pipeline（story-pipeline-interactive.ps1）是 DB-first 架構，不直接載入 workflow 文件。格式遷移對 Pipeline 零影響。BMAD standalone 模式透過 workflow.yaml → workflow.md 路由。

---

## 4. 遷移策略決策框架

### 4.1 決策樹

```
是否為新專案？
├─ 是 → 直接使用最新 BMAD v6.0.3 安裝
│       npx bmad-method install
│       然後套用本範本包的 overlay + config-templates
│
└─ 否（舊專案）→ 評估遷移必要性
    │
    ├─ 目前 Token 消耗是否造成問題？
    │   └─ 否（如 PCPT: 2,607 tokens）→ 不遷移，維持現狀
    │
    ├─ BMAD 官方是否提供 in-place migration 工具？
    │   ├─ 是 → 評估自動遷移風險後決定
    │   └─ 否（截至 v6.0.3 尚未提供）→ 不遷移
    │
    └─ 是否有大量未客製化的 Workflow？
        ├─ 是 → 可考慮選擇性更新（cherry-pick）
        └─ 否（如 PCPT: code-review 高度客製化）→ 不遷移
```

### 4.2 PCPT 專案決策

**決策 v1.1.0（2026-02-27）**：維持舊版架構，不遷移至 v6.0.3。
**決策 v2.0.0（2026-04-03）**：已完成 Epic BU 概念升級，保留安裝基底但遷移 Workflow 格式。

| 考量因素 | v1.1.0 評估 | v2.0.0 更新 |
|----------|------------|------------|
| Token 壓力 | 無（2,607 tok） | 上升至 19,090 tok（Opus 1M 佔 1.9%，監控中） |
| 客製化程度 | 高（2.1x） | 更高（Workflow 2,202 行，含三層平行 + 34 step 文件） |
| 專案階段 | Phase 4 | Phase 4（Epic BU 證明可安全遷移 Workflow 格式） |
| 遷移工具 | 無 | 不需要（Epic BU 已手動遷移 + 保留 XML 備份） |
| 風險 | 高 | 低（Pipeline DB-first 不依賴 Workflow 格式） |
| ROI | 低 | **已實現**（三層平行 + Skill Validator + Quick Dev） |

### 4.3 新專案建議

**新專案應安裝最新 BMAD v6.2.2 後套用 Epic BU overlay：**

```bash
# Step 1: 安裝最新版 BMAD
npx bmad-method install

# Step 2: 複製本範本包
Copy-Item -Path "原始專案\docs\專案部屬必讀" -Destination "新專案\docs\專案部屬必讀" -Recurse

# Step 3: 套用 Epic BU overlay（Markdown step 分檔 + PCPT 自訂功能）
# overlay 已使用 v6.2.2 相容的 workflow.md + steps/ 格式
Copy-Item -Path "docs\專案部屬必讀\bmad-overlay\4-implementation\*" `
          -Destination "_bmad\bmm\workflows\4-implementation\" -Recurse -Force

# Step 4: 配置各引擎（同 README.md Step 4）
```

> **v2.0.0 變更**：overlay 已從 XML instructions.xml 格式升級為 Markdown workflow.md + steps/ 格式。
> 包含 PCPT 自訂：DB-first、三層平行 Review、SaaS Production Gates、Skill 整合、KB 查詢等。
> 舊 instructions.xml 保留為 DEPRECATED 備份，可在遷移完成確認後刪除。

---

## 5. 新專案的 BMAD v6.0.3 配置注意事項

### 5.1 Agent 格式變更

新專案安裝後的 Agent 為 `.agent.yaml` 格式：

```yaml
# 最新格式範例（dev.agent.yaml）
agent:
  metadata:
    id: "_bmad/bmm/agents/dev.md"
    name: Amelia
    title: Developer Agent
    icon: 💻
    module: bmm
    capabilities: "story execution, test-driven development"
    hasSidecar: false

  persona:
    role: Senior Software Engineer
    identity: Executes approved stories with strict adherence...
    communication_style: "Ultra-succinct..."
    principles: |
      - All tests must pass 100% before review
      - Every task must be covered by unit tests

  critical_actions:
    - "READ the entire story file BEFORE any implementation"
    - "Execute tasks IN ORDER as written"

  menu:
    - trigger: DS or fuzzy match on dev-story
      workflow: "{project-root}/_bmad/bmm/workflows/..."
```

### 5.2 模組結構變更

```
最新版安裝後的 _bmad/ 結構（預期）：
_bmad/
├── _config/
│   ├── agent-manifest.csv     ← 合併了 BMM + CIS agents
│   └── ...manifests
├── bmm/
│   ├── agents/                ← .agent.yaml 格式（非 .agent.md）
│   ├── teams/                 ← 新概念：Agent 子集組合
│   ├── workflows/
│   └── data/
├── core/
│   ├── agents/
│   ├── tasks/
│   └── workflows/
└── utility/
    └── agent-components/      ← 新概念：共用 handler 元件
```

> **注意：不再有 `bmb/` 和 `cis/` 獨立目錄。**

### 5.3 TRS Overlay 相容性對照

| Overlay 檔案 | 與 v6.0.3 相容性 | 處理方式 |
|-------------|-----------------|---------|
| `code-review/instructions.xml` | 🟡 需 diff | 最新原廠 226 行 vs overlay 471 行；overlay 含 PCPT 客製化規則，通用專案可能不需要 |
| `code-review/checklist.md` | 🟡 需 diff | 確認最新版是否已內含壓縮後的項目 |
| `create-story/instructions.xml` | 🟡 需 diff | 最新原廠 346 行 vs overlay 449 行；overlay 含 Skills 自動化邏輯 |
| `create-story/checklist.md` | 🟢 可用 | 通用壓縮版，不含專案特定邏輯 |
| `dev-story/instructions.xml` | 🟢 可用 | 差異僅 6%（410 vs 436 行） |
| `dev-story/checklist.md` | 🟢 可用 | 通用壓縮版 |

### 5.4 新專案的 Overlay 策略建議

```
通用策略（非 PCPT 專案）：
1. 安裝最新 BMAD v6.0.3
2. 先不套用 overlay，直接使用最新原廠版
3. 僅複製 config-templates/ 和 scripts/
4. 開發過程中若發現 Workflow 需要客製化，再建立專案專屬 overlay

PCPT 衍生專案：
1. 安裝最新 BMAD v6.0.3
2. diff overlay vs 最新原廠版
3. PCPT 特有規則僅 44 行（17%），直接保留在 instructions.xml 即可（見 §7.3）
4. 套用壓縮版 checklist（通用部分）
```

---

## 6. 多引擎協作相容性

### 6.1 架構版本對多引擎的影響

| 維度 | 舊版 | 最新 v6.0.3 | 影響 |
|------|------|------------|------|
| Agent ID 命名 | `_bmad/bmm/agents/dev.md` | `_bmad/bmm/agents/dev.md`（安裝後路徑不變） | 🟢 無影響 |
| sprint-status.yaml | 自訂格式 | 原廠 template 格式 | 🟡 需確認欄位相容 |
| tracking files | `.track.md` | 無原廠規範（自訂） | 🟢 無影響 |
| 交接協議 | 四引擎統一 | 安裝器支援更多 IDE | 🟢 向下相容 |

### 6.2 各引擎的 BMAD 版本感知

| 引擎 | 感知 BMAD 版本的方式 | 版本遷移影響 |
|------|--------------------|----|
| Claude Code | 讀取 `_bmad/` 目錄結構 + CLAUDE.md | 需確認路徑引用正確 |
| Gemini CLI | 讀取 `.gemini/skills/` + GEMINI.md | Skills 獨立，不受 BMAD 版本影響 |
| Antigravity | 讀取 `.agent/` 目錄 | 獨立配置，不受影響 |
| Rovo Dev | 讀取 `.rovodev/config.yml` | 獨立配置，不受影響 |

> **結論**：BMAD 版本遷移主要影響 Claude Code。其他引擎的配置與 BMAD `_bmad/` 目錄解耦。

---

## 7. Code-Review Workflow 客製化深度分析

> 來源：Party Mode 架構討論 2026-02-27，逐行比對 upstream vs PCPT 版本。

### 7.1 差異量化

| 版本 | Steps | 行數 | 大小 |
|------|-------|------|------|
| 最新 v6.0.3 upstream | 5 | 226 | 10KB |
| PCPT 版本 | 6 | 483 | 26KB |
| **差異** | +1 Step | **+257 行** | +16KB |

### 7.2 超出 upstream 的 257 行分類

| 客製化區塊 | 行數 | 分類 | 說明 |
|-----------|------|------|------|
| SaaS Production Standards（嚴重度分級 + 審查維度 + Production Gates） | ~30 | 通用增強 | 任何 SaaS 專案都適用 |
| Required Skills 動態載入機制 | ~20 | PCPT 特有 | 讀取 Story 的 `## Required Skills` 並載入 Skill 的 FORBIDDEN 規則 |
| Tech Debt 累積統計（從 sprint-status 讀取） | ~10 | 通用增強 | 技術債預警機制 |
| 強制完整讀取協議（禁止 Grep 推斷） | ~8 | 通用增強 | 品質保證 |
| SaaS 六維度深度審查（Security/Scalability/Observability/DataConsistency/ErrorHandling/TestCoverage） | ~15 | 通用增強 | 企業級審查標準 |
| Skill FORBIDDEN 規則檢查 | ~8 | PCPT 特有 | 檢查 Base64/Zustand/BackOffice namespace 等 |
| 自動修復流程（CRITICAL → HIGH → MEDIUM → LOW） | ~40 | 通用增強 | upstream 是詢問使用者，我們改為自動修復 |
| 架構 Bug 強制修復（useState/Zustand 重複檢測） | ~16 | PCPT 特有 | CLAUDE.md §1 的架構規則 |
| 技術債側車文件寫入（Sidecar Architecture, .debt.md） | ~70 | 通用增強 | 延後項目根因分析 + 路由 + 側車文件 |
| Production Gate 驗證（Zero Critical / High Resolved / Debt Limit / SaaS Score） | ~30 | 通用增強 | 品質閘門 |
| Review Agent 追蹤欄位填寫 | ~6 | PCPT 特有 | 多引擎追蹤 |
| 審查報告生成 + 追蹤歸檔（Step 6 全新） | ~70 | 通用增強 | CR report + tracking archive |

### 7.3 結論：「抽離 PCPT 規則到 Skill」的 ROI 不足

| 分類 | 行數 | 佔比 |
|------|------|------|
| **通用增強**（任何專案都適用的品質提升） | ~213 行 | 83% |
| **PCPT 特有**（僅此專案需要的規則） | ~44 行 | 17% |

PCPT 特有的 44 行中，大部分已透過 Skills 機制間接處理：
- Required Skills 載入 = 載入 **機制**，規則本身在各 Skill 的 SKILL.md 中
- Skill FORBIDDEN 檢查 = 讀取 Skill 清單，不是硬編碼
- useState/Zustand 檢查 = 已寫在 CLAUDE.md §1 觸發規則中
- Review Agent 追蹤欄位 = 6 行，不值得抽離

> **決策：不執行 Phase 3 抽離。** 44 行的維護成本遠低於建立新 Skill + 修改 Skill 載入邏輯的成本。

### 7.4 新專案如何處理 code-review 的 overlay

```
場景 A：通用新專案
  1. 使用最新 v6.0.3 原廠版（226 行）
  2. 逐步添加需要的通用增強（SaaS Standards、Production Gates 等）
  3. 不需要 PCPT 特有的 44 行

場景 B：PCPT 衍生專案
  1. 直接套用 bmad-overlay/ 中的完整版（483 行）
  2. diff 確認與最新原廠版的相容性
  3. 修改 PCPT 特有規則為新專案的規則

場景 C：想要通用增強但不要 PCPT 規則
  1. 基於 bmad-overlay/ 版本
  2. 刪除 Required Skills 載入（20 行）、Skill FORBIDDEN 檢查（8 行）、
     useState/Zustand 架構 Bug 檢查（16 行）
  3. 保留 SaaS Standards、Production Gates、Sidecar Architecture、
     自動修復、Review Report（~213 行通用增強）
```

---

## 8. ECC (everything-claude-code) 微優化評估

> 來源：Party Mode 架構討論 2026-02-27，評估 ECC 值得引入的功能。

### 8.1 已評估的 ECC 功能與決策

| ECC 功能 | 價值 | 複雜度 | 決策 | 理由 |
|----------|------|--------|------|------|
| SessionStart Hook | 🟡 中 | S | 📝 記錄待評估 | Claude Code 目前無原生 SessionStart Hook；可在 CLAUDE.md 中加入首次對話指引替代 |
| PreCompact 記憶萃取 | 🟢 低 | S | 📝 記錄待評估 | MEMORY.md 目前僅 3 條記錄，使用率偏低 |
| AgentShield 安全審計 | 🟢 低 | M | ❌ 不引入 | 已有 rules/security.md + security-review Skill |
| Token 經濟學瘦身 | 🟢 低 | S | ❌ 不引入 | 我們 2,607 tokens 已遠優於 ECC 的 10,000 |
| 動態提示詞注入 | 🟢 低 | M | ❌ 不引入 | BMAD Workflow 已實現按需載入 |
| 持續學習 v2（Instinct System） | 🟡 中 | XL | ❌ 不引入 | 完整系統過於複雜，簡化版見下方 B2 |

### 8.2 可行的 ECC 微優化（未來參考）

#### B1. SessionStart 自動讀取指引

**現狀**：每次新會話需手動讀取 sprint-status.yaml 和 MEMORY.md。
**替代方案**：Claude Code 無 SessionStart Hook，但可在 CLAUDE.md 中加入：

```markdown
## 6. Project Status
執行任務前，主動讀取：
- `docs/project-context.md` — Epic 進度、當前工作、架構決策
- `docs/implementation-artifacts/sprint-status.yaml` — Story 層級狀態
```

> **現狀**：CLAUDE.md §6 已包含此指引。Claude Code 的 Auto-Memory 也會自動載入 MEMORY.md。此項**已等效實現**。

#### B2. PreCompact Hook 記憶萃取

**現狀**：`pre-compact-snapshot.ps1` 在壓縮前保存快照，但不萃取學習。
**可能的增強**：

```powershell
# pre-compact-snapshot.ps1 增強版（概念）
# 在保存快照的同時，輸出提醒讓 AI 在壓縮前記錄關鍵發現

Write-Host "📝 REMINDER: Before compacting, consider updating MEMORY.md with:"
Write-Host "  - New debugging insights discovered this session"
Write-Host "  - Workflow patterns that worked or failed"
Write-Host "  - Architecture decisions made"
```

> **評估**：MEMORY.md 的更新目前依賴 AI 自主判斷（auto-memory 機制），PreCompact Hook 的提醒效果有限。**建議觀察 MEMORY.md 自然增長情況後再決定。**

### 8.3 ECC 功能覆蓋度總結

```
已覆蓋（不需引入）：
  ✅ TDD 工作流        → /tdd command + tdd-workflow Skill
  ✅ Code Review        → BMAD code-review workflow（比 ECC 更強）
  ✅ Security Review    → security-review Skill + rules/security.md
  ✅ Build Error Fix    → /build-fix command
  ✅ Plan Mode          → /plan command + planner agent
  ✅ Checkpoint/Verify  → /checkpoint + /verify commands
  ✅ Token 優化         → 2,607 tokens（優於 ECC 的 10,000）
  ✅ SessionStart 指引  → CLAUDE.md §6 已包含

不需要（過度工程化）：
  ❌ AgentShield        → 已有足夠安全防護
  ❌ 動態提示詞注入     → BMAD 按需載入已足夠
  ❌ 持續學習 v2        → 複雜度 XL，ROI 不足

觀察中：
  🟡 PreCompact 記憶萃取 → 待 MEMORY.md 使用率提升後再評估
```

---

## 9. 未來演進建議

### 9.1 短期（維持現狀）

- PCPT 專案：不遷移，繼續使用舊版架構 + TRS 優化
- 新專案：直接 `npx bmad-method install` 使用最新版
- overlay 套用前先 diff 確認相容性
- code-review 的客製化**不抽離**（PCPT 特有部分僅 44 行）

### 9.2 中期（觀察 BMAD 官方動態）

- 等待 BMAD 官方提供 **in-place migration 工具**
- 關注 `npx bmad-method upgrade` 或類似指令的發布
- 若出現自動遷移方案，評估風險後可考慮舊專案升級
- 觀察 MEMORY.md 自然增長，評估 PreCompact 萃取的必要性

### 9.3 長期（架構演進方向）

- **Agent YAML 化**：未來所有新專案的 Agent 使用 `.agent.yaml` 格式
- **通用增強 overlay 打包**：將 SaaS Standards、Production Gates、Sidecar Architecture 打包為可選 overlay（~213 行），供任何新專案選用
- **Teams 概念導入**：按工作流需求載入 Agent 子集，而非全量載入
- **ECC 持續學習簡化版**：若 MEMORY.md 使用量增加，考慮 PreCompact Hook 增強

---

## 附錄 A：研究報告引用來源

| 報告 | 路徑 |
|------|------|
| BMAD-METHOD 與 ECC 完整比較 | `claude token減量策略研究分析/BMAD-METHOD 與 everything-claude-code 比較.md` |
| Token 減量策略深度分析 | `claude token減量策略研究分析/PCPT_Claude_Code_Token_減量策略_深度分析報告.md` |
| Token 減量最終彙整 | `claude token減量策略研究分析/PCPT_Claude_Code_Token減量策略_最終彙整報告.md` |
| 多 Agent 協作策略 | `claude token減量策略研究分析/web_claude多agnet協作策略.md` |
| 最新 BMAD v6.0.3 原始碼 | `claude token減量策略研究分析/BMAD-METHOD-main/` |

## 附錄 B：關鍵版本號

| 元件 | 版本 | 備註 |
|------|------|------|
| BMAD Method（PCPT 安裝版） | v6.0.0-alpha.21 | 2026-01-01 安裝 |
| BMAD Method（最新 stable） | v6.0.3 | 2026-02-23 release |
| Claude Code CLI | Opus 4.6 / Sonnet 4.6 / Haiku 4.5 | 主線開發引擎 |
| 部署手冊 | v3.0.0 | 本文件為補充附件 |
