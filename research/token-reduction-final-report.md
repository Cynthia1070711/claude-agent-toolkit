# MyProject Claude Code Token 減量策略 — 最終彙整報告

> **彙整日期**：2026-02-25
> **研究期間**：2026-02-22 ~ 2026-02-25
> **涵蓋來源**：16 份分析報告 + 17 個 TRS Stories
> **參與引擎**：Claude Opus 4.6 / Sonnet 4.6 / Gemini 3.1 Pro / Gemini Pro / 6 個 Web AI 平台
> **用途**：Token 減量策略的單一事實來源（Single Source of Truth），取代所有先前個別報告

---

## 一、問題全貌與量化基線

### 1.1 三層載入架構

Claude Code 每次新對話的初始 token 消耗分為三層：

| 層級 | 內容 | 載入方式 | 優化前 Token 數 |
|:----:|------|---------|:--------------:|
| Layer 1 | 全域 `~/.claude/CLAUDE.md` | Always-On（100%） | ~3,640 |
| Layer 2 | 專案 `CLAUDE.md` + `.claude/rules/*` | Always-On（100%） | ~11,000 |
| Layer 3 | Skills 描述摘要 + MCP 工具描述 | Always-On（摘要）| ~800 |
| **合計** | | | **~15,440** |

> **關鍵發現**：Skills 的完整內容為 On-Demand 載入（50-80% 機率性），但摘要描述（skills_list.md）為 Always-On。

### 1.2 Workflow 執行開銷

除了啟動稅之外，每次 BMAD Workflow 執行還會消耗大量 token：

| Workflow | 核心檔案 | 行數 | 預估 Token/次 |
|----------|---------|:----:|:------------:|
| code-review | instructions.xml (923 行) + checklist.md | 1,115 | ~12,000 |
| create-story | instructions.xml + checklist.md (358 行) | 1,006 | ~10,200 |
| dev-story | instructions.xml | 624 | ~7,000 |
| **Sprint 循環合計** | | | **~31,200** |

> Sprint 循環 = create-story → dev-story → code-review（每個 Story 一輪）

### 1.3 Prompt Caching 快取殺手

以下項目會破壞 KV 張量快取，導致重複計費：

| 快取殺手 | 嚴重度 | 狀態 |
|----------|:------:|:----:|
| 專案 CLAUDE.md §10 動態 Sprint 狀態 | **致命** | ✅ 已修復（TRS-0） |
| 全域 CLAUDE.md `Last Updated` 時間戳 | 中度 | ✅ 已移除（TRS-0） |
| sprint-status.yaml 每次全量讀取 | 高度 | ⏳ TRS-9 規劃完成 |
| project-context.md 頻繁更新 | 中度 | ⚠️ 需注意更新頻率 |

---

## 二、安全紅線與邊界防禦

### 2.1 四條絕對防線

以下規則在**所有優化中絕對不可觸碰**：

1. **`.claude/rules/constitutional-standard.md`（11 行）** — 強制繁中輸出，Always-On 載入
2. **全域 CLAUDE.md 時間戳規則（2 行）** — 強制 `Get-Date` 取得真實時間，禁止推斷
3. **全域 CLAUDE.md 禁止時間估算（2 行）** — 用複雜度 S/M/L/XL 取代
4. **Skill 載入率 50-80% 的物理限制** — 任何「必須 100% 執行」的規則絕不可從 rules/ 移至 Skills

### 2.2 瘦身風險矩陣

| 風險等級 | 項目 | 判定依據 |
|:--------:|------|---------|
| 🔴 高 | constitutional-standard 任何修改 | 遺失 = 全系統語言失控 |
| 🔴 高 | 時間戳/禁估算規則移至 Skill | Skill 載入率僅 50-80%，Rules 為 100% |
| 🟡 中 | Workflow XML 壓縮過度 | 可能破壞步驟邏輯，需逐行驗證 |
| 🟢 低 | CLAUDE.md 冗餘段落刪除 | 原生行為或已有 Skill 覆蓋 |

### 2.3 .claudeignore 安全注意事項

> **Gemini 3.1 Pro 研究發現**：`.claudeignore` 在某些邊界情況可能被繞過讀取 `.env`。建議在 `.claude/settings.json` 中額外配置 deny 規則作為雙重防護。

---

## 三、四類節省分類框架

### A 類：Session 固定開銷（每次新對話）— ✅ 已完成

每次開啟新 Claude Code 視窗的靜態 token 消耗。

| 項目 | 優化前 | 優化後 | 減幅 |
|------|:------:|:------:|:----:|
| 全域 CLAUDE.md | 388 行 / ~3,640 tok | 25 行 / ~250 tok | **-93%** |
| 專案 CLAUDE.md | 742 行 / ~8,000 tok | 117 行 / ~1,200 tok | **-85%** |
| .claude/rules/ | 9 檔 397 行 / ~3,000 tok | 6 檔 37 行 / ~300 tok | **-90%** |
| Skills 摘要 | 42 個 / ~800 tok | 20 個 / ~400 tok | **-50%** |
| **合計** | **~15,440 tok** | **~2,150 tok** | **-86%** |

**每日影響**（5 次新視窗）：77,200 → 10,750 tok，**每日節省 ~66,450 tok**

### B 類：Workflow 執行開銷 — ✅ 已完成（TRS-6~10）

BMAD Workflow instructions/checklist 的壓縮。

| 執行 Story | 壓縮目標 | 預估節省 |
|-----------|---------|:--------:|
| TRS-6 | create-story/checklist.md 情緒化填充清除 | -1,200 tok/次 |
| TRS-7 | create-story/instructions.xml 去重 | -1,500 tok/次 |
| TRS-8 | code-review/instructions.xml 壓縮 | -4,000+ tok/次 |
| TRS-9 | sprint-status.yaml 多次全量讀取優化 | -6,000 tok/次 |
| TRS-10 | dev-story/instructions.xml 壓縮 | -800 tok/次 |
| **合計** | | **~14,200 tok/Sprint 循環** |

### C 類：防禦性保護 — ✅ 部分完成

一次性設定，永久生效的防護機制。

| 項目 | 狀態 | 效果 |
|------|:----:|------|
| .claudeignore 封鎖無效檔案 | ✅ 完成 | 永久阻絕模型讀取 node_modules 等 |
| §10 動態狀態解耦 | ✅ 完成 | 恢復 Prompt Cache 命中率 |
| Last Updated 時間戳移除 | ✅ 完成 | 保護快取穩定性 |
| Session 紀律制度化 (TRS-15) | ✅ 完成 | 禁止在 Party Mode 寫程式碼等操作規範 |
| Agents & Commands 清理 (TRS-16) | ✅ 完成 | 移除 3 個 agents + 11 個 commands |

### D 類：操作流程優化 — ✅ 部分完成

改變讀寫模式以降低 token 消耗。

| 項目 | 狀態 | 預估節省 |
|------|:----:|:--------:|
| 技術債側車文件架構 (TRS-11) | ✅ 完成 | -7,700 tok/次技術債操作 |
| Story 模板章節標注 (TRS-12) | ✅ 完成 | -7,500 tok/骨架 Story |
| Epic README 自動同步 (TRS-17) | ✅ 完成 | -4,300~6,300 tok/Story 生命週期 |

---

## 四、已完成 Story 執行摘要

### 4.1 第一階段（A 類基礎瘦身）

| Story | 標題 | 核心成果 |
|:-----:|------|---------|
| TRS-0 | .claudeignore + 狀態解耦 | 建立 `.claudeignore`、移除 §10 動態狀態、消除 Last Updated |
| TRS-1 | 全域 CLAUDE.md 極致瘦身 | 388 → 25 行（-94%），刪除 Thinking Protocol 等冗餘 |
| TRS-2 | 專案 CLAUDE.md 瘦身 | 742 → 117 行（-84%），移除事故敘述和重複段落 |
| TRS-3 | Rules 精簡重組 | 刪除 3 檔（agents/hooks/patterns），精簡 5 檔，397 → 37 行 |
| TRS-4 | Skills 清理 | 刪除 22 個無關 Skills（42 → 20 個） |
| TRS-5 | Workflow 壓縮規劃 | 產出 B 類壓縮方案，識別 10 個具體壓縮點 |

### 4.2 第二階段（B 類 Workflow 壓縮 + C/D 類）

| Story | 標題 | 核心成果 |
|:-----:|------|---------|
| TRS-6 | checklist.md 情緒化填充清除 | 移除 COMPETITION SUCCESS METRICS 等情緒化內容（-58%） |
| TRS-7 | instructions.xml 去重 | create-story Step 1 copy-paste 重複合併 |
| TRS-8 | code-review XML 壓縮 | 923 行 instructions.xml 深度審計與壓縮 |
| TRS-9 | sprint-status.yaml 讀取優化 | 3 個 workflow 的多次全量讀取改為 1 次+變數傳遞 |
| TRS-10 | dev-story XML 壓縮 | Step 1/2 重複 context loading 合併 |
| TRS-11 | 技術債側車文件架構 | `.debt.md` 三層上下文設計，消除跨 Story 全文讀取 |
| TRS-12 | Story 模板章節標注 | create-story 精準讀取功能規格的特定章節 |
| TRS-15 | Session 紀律制度化 | PreCompact Hook + 操作規範 |
| TRS-16 | Agents & Commands 清理 | 補完 TRS-4 盲點，刪除 `.claude/agents/`(3) + `.claude/commands/`(11) |
| TRS-17 | Epic README 自動同步 | PostToolUse Hook + `sync-epic-readme.ps1` 自動生成 |

### 4.3 第三階段（E 類 多 Agent 並行策略）

| Story | 標題 | 核心成果 |
|:-----:|------|---------|
| TRS-31 | 多 Agent 並行執行策略報告 | 三層架構定案（Worktree + File Lock + Total Commit）+ 部署必讀整合 |

### 4.4 未執行 Story

| Story | 標題 | 類別 | 狀態 | 備註 |
|:-----:|------|:----:|:----:|------|
| TRS-13 | 雙引擎 SOP 標準化 | E 類 | backlog | Gemini CLI + Claude Code 協作流程標準化 |
| TRS-14 | 三引擎統一憲章 | E 類 | backlog | AGENTS.md + `.shared/` 目錄 + MCP 同步 |
| TRS-18 | `.claude/settings.json` deny 規則建立 | C 類 | backlog | .claudeignore 第二道安全防線 |
| TRS-19 | 技術債側車 `.debt.md` 消費端啟用 | D 類 | backlog | 兌現 TRS-11 ~7,700 tok/次效益 |
| TRS-32 | File Lock 機制實作 | E 類 | ready-for-dev | 3 個 PS1 腳本 + 4 引擎 Hook 配置 |
| TRS-33 | Worktree 並行 SOP + 部署整合 | E 類 | ready-for-dev | 部署手冊更新 + Merge 衝突 SOP |

---

## 五、多引擎協作策略（TRS-13 / TRS-14 待執行）

### 5.1 三引擎架構對照

| 維度 | Claude Code | Gemini CLI | Antigravity IDE |
|------|------------|------------|-----------------|
| Context Window | 200K tok | 1M tok | 200K tok（Claude） |
| 配置根目錄 | `.claude/` | `.gemini/` | `.agent/` |
| 指令檔 | `CLAUDE.md` | `GEMINI.md` | `AGENTS.md`（共用） |
| Rules | `.claude/rules/*.md` | `.gemini/rules/*.md` | N/A |
| Skills | `.claude/skills/*/SKILL.md` | `.gemini/skills/*/SKILL.md` | `.agent/skills/*/SKILL.md` |
| MCP 配置 | `.claude/settings.json` (`url`) | `~/.gemini/settings.json` (`serverUrl`) | 同 Claude |

### 5.2 設計方案概要

**統一憲章 AGENTS.md**：單一來源 + symlink 多路分發，三引擎共用核心規範。

**`.shared/` 目錄**：

```
.shared/
  rules/          → 共用規則（symlink 至各引擎）
  skills/         → 共用 Skills
  mcp/            → MCP 配置模板
  sync-mcp.ps1   → MCP 同步腳本
```

**雙引擎 SOP（四階段迴圈）**：

1. **規劃** — Claude Code（架構決策、Story 建立）
2. **實作** — Gemini CLI（開發、追蹤文檔，利用 1M context）
3. **審核** — Claude Code（code-review、品質守門）
4. **追蹤** — Gemini CLI（sprint-status 更新、歸檔）

### 5.3 Agent ID 注入機制

| 引擎 | Agent ID | 用途 |
|------|----------|------|
| Claude Code (Opus) | CC-OPUS | Commit/追蹤標記 |
| Gemini CLI (Pro) | GC-PRO | Commit/追蹤標記 |
| Antigravity (Opus) | AG-OPUS | Commit/追蹤標記 |

---

## 六、進階工具與底層機制參考

### 6.1 Prompt Caching 經濟學

- **Cache Write**：輸入 token 的 1.25 倍（首次載入多付 25%）
- **Cache Read**：輸入 token 的 0.10 倍（命中快取省 90%）
- **乘數效應**：同一 Session 多次呼叫，快取命中率越高節省越大
- **破壞機制**：任何快取前綴的修改（如動態狀態、時間戳）會使整段快取失效

### 6.2 MCP Tool Search（F 類參考）

> **Gemini 研究發現**：`ENABLE_TOOL_SEARCH=auto:10` 可將 MCP 工具描述從 ~77,000 tok 降至 ~8,700 tok（-89%）。目前需確認 Antigravity 環境支援。

### 6.3 CMV 上下文記憶體虛擬化（F 類參考）

> **Web AI 平台研究**：Trim 功能可無損削減 50-70% 上下文。Claude Code 的 AutoCompact 已提供類似功能。

### 6.4 子代理隔離策略

- Subagent 模式：獨立 context，不污染主 context
- 代理團隊模式：共用 context，適合協作但 token 倍增
- **Party Mode 陷阱**：6 Agent 共用 context 可達 90,000 tok，禁止在其中寫程式碼

---

## 七、量化效益總覽

### 7.1 已實現

| 指標 | 數值 |
|------|:----:|
| 每次會話靜態成本減幅 | **-86%**（15,440 → 2,150 tok） |
| 每日啟動稅節省（5 次視窗） | **-66,450 tok/日** |
| 每週節省 | **~332,250 tok** |

### 7.2 全部完成預估（含 B/D 類）

| 類別 | 預估節省 | 對 Epic QGR 65 Stories 影響 |
|------|:--------:|:--------------------------:|
| B 類（Workflow 壓縮） | ~14,200 tok/Sprint 循環 | ~533,000 tok |
| D 類（操作流程優化） | ~19,550 tok/操作 | ~1,042,975 tok |
| E 類（多引擎協作） | ~40% Claude token 轉移至 Gemini | 質性效益 |
| **合計預估** | | **~2,567,175 tok** |

### 7.3 ROI 排序

| 排名 | 優化項目 | 節省量 | 複雜度 | 狀態 |
|:----:|---------|:------:|:------:|:----:|
| 1 | A 類 Session 瘦身 | ~13,290 tok/session × 5 | S~M | ✅ 完成 |
| 2 | D-1 技術債側車文件 | ~7,700 tok/次 × 65 stories | L | ✅ 完成 |
| 3 | B-3/4/5 sprint-status 讀取優化 | ~6,000 tok/次 | L | ✅ 完成 |
| 4 | B-7 code-review XML 壓縮 | ~4,000 tok/次 | L | ✅ 完成 |
| 5 | D-4/TRS-17 Story 模板+Epic 自動化 | ~11,800 tok/Story | L | ✅ 完成 |
| 6 | E 類多引擎協作 | 質性（40% 轉移） | XL | ⏳ 待執行 |

---

## 八、依賴圖與執行狀態

```
TRS-0（P0）✅ → TRS-1（P0）✅ → TRS-2（P0）✅ → TRS-3（P0）✅
                                                        ↓
TRS-4（P1）✅ ──→ TRS-16（P1）✅
        ↓
TRS-5（P1 規劃）✅
  ├→ TRS-6（P0）✅ → TRS-7（P0）✅ → TRS-8（P0）✅
  │                                       ├→ TRS-9（P1）✅ → TRS-10（P1）✅
  │                                       └→ TRS-11（P2）✅
  ├→ TRS-12（P2，獨立）✅
  ├→ TRS-13（P1，依賴 TRS-6~10）⏳ ← 多引擎 SOP
  │    └→ TRS-14（P2）⏳ ← 三引擎統一憲章
  ├→ TRS-15（P2，獨立）✅
  └→ TRS-17（P1，依賴 TRS-0+TRS-9）✅

TRS-0 ──→ TRS-18（P0，獨立）⏳ ← settings.json deny 規則
TRS-11 ──→ TRS-19（P0，獨立）⏳ ← .debt.md 消費端啟用
```

**完成度**：15/19 Stories Done（79%），剩餘 4 個：2 個 P0 高優先級 + 2 個 E 類多引擎協作。

---

## 九、研究文件來源索引

### 9.1 前期研究（Phase: 研究，2026-02-22~23）

| # | 文件 | 產出者 | 核心貢獻 |
|:-:|------|--------|---------|
| 1 | 研究任務.md | Alan（人類） | 原始任務指派 |
| 2 | 研究分析報告.md | Antigravity (Gemini CLI) | 首份完整分析，建立基礎框架 |
| 3 | 邊界問題分析報告.md | Antigravity (Claude Opus 4.6) | Skill 50-80% 載入率發現、安全紅線定義 |
| 4 | Skills排查清單.md | Antigravity (Claude Opus 4.6) | 42 個 Skills 完整排查，22 個建議移除 |
| 5 | 減量策略.md | 多 Web AI 平台 | 6 平台研究彙整、CMV/Trim 概念、55+ 引用 |
| 6 | 其它關於token減量優化網站.md | Alan（人類） | 4 個參考 URL |

### 9.2 深度分析（Phase: 策略制定，2026-02-24）

| # | 文件 | 產出者 | 核心貢獻 |
|:-:|------|--------|---------|
| 7 | CLAUDE_TOKEN減量規劃策略(WEB CLAUDE).md | BMAD Party Mode | 最完整策略文件：Phase 0-7 藍圖、A/B/C/D 分類 |
| 8 | Claude Code Token 減量策略規劃(Web Gemini).md | Gemini 3.1 Pro | MCP Tool Search、Prompt Caching 物理學、Cursor 對比 |
| 9 | CLAUDE sonnet 4.6 EXtended分析報告.md | Sonnet 4.6 Extended | 差距分析：3 個盲點 + Party Mode Token 陷阱 |
| 10 | GEMINI PRO分析研究成果.md | Gemini Pro | Epic README 凍結、tech-debt-ledger 追加總帳 |
| 11 | 依照當前PHYCOOL該如何制訂策略呢_.md | Gemini (Web) | 雙引擎 SOP 設計、TOML 指令 |
| 12 | PHYCOOL_Claude_Code_Token_減量策略_深度分析報告.md | BMAD CEO (Opus 4.6) | 逐行審計、精確量化 |
| 13 | PHYCOOL_Token減量_全研究成果彙整報告.md | BMAD CEO (Opus 4.6) | A~F 類全量追蹤表 |
| 14 | web_claude多agnet協作策略.md | BMAD CEO (Opus 4.6) | 三引擎架構對照、AGENTS.md 設計 |
| 15 | Party_Mode_討論總結報告.md | BMAD Party Mode | 環境驗證、TRS-6~15 Story 規劃 |

### 9.3 執行紀錄（Phase: 實施，2026-02-24~25）

| # | 文件 | 內容 |
|:-:|------|------|
| 16 | stories/execution-log.md | TRS-0~TRS-17 完整執行追蹤 |
| 17 | stories/TRS-*.md (15 個) | 各 Story 獨立規格與驗收紀錄 |

---

## 十、語言選擇規則備忘

| 檔案類型 | 語言 | 原因 |
|----------|------|------|
| Workflow 指令（instructions.xml、checklist.md、workflow.yaml） | **英文** | AI 消費，英文 token 效率遠高於中文（中文每字 2-3 tokens） |
| Story、追蹤報告、CR 報告、說明文件 | **繁體中文** | 人類閱讀，遵循 constitutional-standard |

---

## 附錄 A：6 個 AI 平台策略適用性矩陣

| 平台 | 關鍵策略 | MyProject 適用性 |
|------|---------|:-------------:|
| Gemini | 1M context、Grounding API、延遲快取 | ✅ 高（作為開發引擎） |
| ChatGPT | Instruction Slot、Memory、GPTs | ⚠️ 中（參考架構） |
| GitHub Copilot | .github/copilot-instructions.md、Context Files | ⚠️ 低（非主力工具） |
| DeepSeek | 671B MoE、低成本推理 | ❌ 不適用 |
| Grok | 131K context、X 平台整合 | ❌ 不適用 |
| 豆包 | 128K context、中文特化 | ❌ 不適用 |

## 附錄 B：外部參考資源

- [Claude Code Sub-agents 官方文件](https://docs.anthropic.com/en/docs/claude-code/sub-agents)
- [claude-code-buddy (MeMesh)](https://github.com/nicobailon/claude-code-buddy)
- [Anthropic Claude Code GitHub](https://github.com/anthropics/claude-code)
- [Gemini CLI GitHub Issue #16058](https://github.com/google-gemini/gemini-cli/issues/16058) — 全域 GEMINI.md 衝突問題

## 附錄 C：Skills 完整排查結果

### 已刪除（22 個）

| 分類 | 數量 | 明細 |
|------|:----:|------|
| 不相關技術棧 | 13 | golang-patterns, golang-testing, springboot-*, java-*, jpa-*, postgres-*, clickhouse-io, webgpu-* (2), project-guidelines-example |
| 已被覆蓋 | 3 | backend-patterns, coding-standards, frontend-patterns |
| 需 bash hooks / 未啟用 | 4 | continuous-learning (2), strategic-compact, eval-harness |
| 已被 BMAD 覆蓋 | 2 | verification-loop, iterative-retrieval |

### 已保留（20 個）

| 分類 | 數量 | 明細 |
|------|:----:|------|
| 憲章級 | 1 | constitutional-standard |
| MyProject 專用 | 16 | example-admin-module, -auth-identity, -business-api, -design-system, -editor-arch, -floating-ui, -i18n-seo, -payment-subscription, -pdf-engine, -progress-animation, -sqlserver, -testing-patterns, -tooltip, -type-canonical, -zustand-patterns, epic-config-sync |
| 通用有價值 | 2 | security-review, skill-builder |
| 管理工具 | 1 | tdd-workflow |
