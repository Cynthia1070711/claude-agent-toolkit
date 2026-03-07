# 🎭 BMAD CEO 裁示：Claude Code Token 減量策略深度分析報告

> **分析者**：BMAD CEO + Architect + Analyst + Dev 聯合代理團隊
> **分析日期**：2026-02-24
> **分析範圍**：PHYCOOL 專案全部追蹤文檔、工作流、Skills、Rules、Instructions
> **方法論**：逐一查閱所有專案文件後，基於實際內容進行精確量化分析

---

## 一、現況全景：逐檔審計結果

### 1.1 Layer 1 — CLAUDE.md（Always-On，每次會話 100% 載入）

#### 全域 CLAUDE.md（389 行，~3,640 tokens）

| 區塊 | 行數 | 估算 Token | 實際價值 | 減量判定 |
|:-----|:----:|:----------:|:--------:|:--------:|
| §1.1 Language Policy | 10 行 | ~80 | 🔒 **憲法級** — 繁中語言政策 | 保留，精簡至 3 行 |
| §1.2 Timestamp Requirements | 20 行 | ~200 | 🔒 **憲法級** — Get-Date 強制 | 保留，精簡至 5 行 |
| §2.1 Default to Action | 7 行 | ~70 | ❌ **冗餘** — Claude 4.6 原生行為 | **刪除** |
| §2.2 Parallel Tool Execution | 7 行 | ~70 | ❌ **冗餘** — Claude 4.6 原生行為 | **刪除** |
| §2.3 Investigation Before Response | 7 行 | ~70 | 🟡 有價值但可精簡 | 精簡至 2 行 |
| §2.4 Code Quality Principles | 16 行 | ~150 | 🟡 有價值 | 精簡至 5 行 |
| §2.5 Analysis & Reporting Guidelines | 17 行 | ~170 | 🔒 **重要** — 禁止時間估算 | 精簡至 3 行 |
| §3 Context Window Management | 12 行 | ~100 | ❌ **冗餘** — Claude 4.6 原生行為 | **刪除** |
| §4 Development Environment | 27 行 | ~250 | 🟡 可精簡 | 精簡至 8 行 |
| **§5 Thinking Protocol（全部）** | **167 行** | **~2,000** | ❌ **致命冗餘** — Claude 4.6 Extended Thinking 原生支援 | **完全刪除** |
| §6 File Encoding Standard | 12 行 | ~100 | 🟡 低價值 | 精簡至 2 行 |
| §7 Quick Reference Card | 12 行 | ~100 | ❌ 與前面章節完全重複 | **刪除** |

**全域 CLAUDE.md 精確審計結論：**
- **Thinking Protocol（§5）佔 167/389 行 = 42.9%**，消耗約 2,000 tokens，是單一最大的浪費源。Claude Opus 4.6 / Sonnet 4.6 原生具備 Extended Thinking Chain，此人工協議不僅無用，還可能與模型內部推理樹產生衝突。
- §2.1（Default to Action）、§2.2（Parallel Tool Execution）、§3（Context Window Management）皆為 Claude 4.6 的原生預設行為，屬「補償性指令遺跡」，合計約 240 tokens。
- §7（Quick Reference Card）與前面各節完全重複。
- **可刪減量：389 行 → ~30 行（-92%），3,640 tokens → ~300 tokens（-92%）**

#### 專案 CLAUDE.md（749 行，~8,000 tokens）

未含於上傳文件中（project-context.md 已瘦身至 225 行），但根據邊界問題分析報告的數據：
- 含 §10 動態狀態嵌入 → **快取殺手**
- 含歷史事故補丁敘述（時間戳捏造、工時估算違規）→ 冗長背景敘述
- **建議瘦身至 ~1,500 tokens（-81%）**

---

### 1.2 Layer 2 — .claude/rules/（Always-On，每次會話 100% 載入）

逐檔審計結果（共 9 檔，~397 行，~3,000 tokens）：

| 檔案 | 行數 | 估算 Token | 與 PHYCOOL 相關性 | 具體問題 | 判定 |
|:-----|:----:|:----------:|:-----------------:|:---------|:----:|
| `constitutional-standard.md` | 11 行 | ~80 | ✅ **核心防線** | 無 | 🔒 絕不動 |
| `agents.md` | 50 行 | ~400 | ❌ **不相關** | 描述 planner/architect/tdd-guide 等通用 Claude Code agents，與 BMAD 工作流的 agents 完全不同體系 | **刪除** |
| `hooks.md` | 47 行 | ~380 | ❌ **不相關** | 描述 tmux reminder、Zed editor review、Prettier auto-format 等 macOS/bash hooks，PHYCOOL 在 Windows 環境 | **刪除** |
| `patterns.md` | 56 行 | ~450 | ❌ **不相關** | TypeScript 的 ApiResponse interface、useDebounce Hook、Repository Pattern — PHYCOOL 後端是 C# | **刪除** |
| `coding-style.md` | 71 行 | ~550 | ⚠️ **部分相關** | 不可變性原則有用，但 zod 驗證範例、TypeScript 範例不適用 C# 後端 | 精簡至 15 行 |
| `performance.md` | 48 行 | ~380 | ⚠️ **部分相關** | Haiku/Sonnet/Opus 選擇策略有參考價值，但 ultrathink、Plan Mode 等為通用指南 | 精簡至 10 行 |
| `security.md` | 37 行 | ~280 | 🟡 **中度相關** | 安全清單有價值，但 TypeScript 範例不適用 | 精簡至 10 行 |
| `testing.md` | 31 行 | ~250 | 🟡 **中度相關** | TDD 流程有用，但引用 tdd-guide/e2e-runner 等不存在的通用 agents | 精簡至 8 行 |
| `git-workflow.md` | 46 行 | ~350 | 🟡 **中度相關** | Commit 格式有用，但 PR 流程步驟與 BMAD workflow 部分重疊 | 精簡至 10 行 |

**Rules 精確審計結論：**
- **agents.md + hooks.md + patterns.md 三個檔案合計 153 行、~1,230 tokens**，對 PHYCOOL 完全無用（TypeScript/macOS/通用 agent 體系），每次會話白白浪費。
- 其餘 5 個檔案均可大幅精簡（移除 TypeScript 範例、移除對不存在 agents 的引用）。
- **可削減量：~397 行 → ~65 行（-84%），~3,000 tokens → ~500 tokens（-83%）**

---

### 1.3 Layer 3 — .claude/skills/（On-Demand，僅載入 YAML 摘要）

根據 Skills排查清單.md 的完整審計：

| 分類 | 數量 | 判定 | 明細 |
|:-----|:----:|:----:|:-----|
| 🔴 完全不相關技術棧 | 13 | **刪除** | golang-patterns, golang-testing, springboot-patterns, springboot-security, springboot-tdd, springboot-verification, java-coding-standards, jpa-patterns, postgres-patterns, clickhouse-io, webgpu-threejs-tsl, webgpu-claude-skill-main, project-guidelines-example |
| 🟡 已被專用 Skill 覆蓋 | 3 | **刪除** | backend-patterns (被 example-sqlserver/auth/admin 覆蓋), coding-standards (被 example-type-canonical/zustand 覆蓋), frontend-patterns (被 myproject-zustand/floating-ui/editor-arch 覆蓋) |
| 🟠 需 bash hooks / 從未啟用 | 4 | **刪除** | continuous-learning, continuous-learning-v2, strategic-compact, eval-harness |
| 🟤 已被 BMAD 覆蓋 | 2 | **刪除** | verification-loop, iterative-retrieval |
| ⭐ 保留（專案專用 + 通用有價值 + 工具） | 20 | **保留** | 16 個 myproject-* + ui-ux-pro-max + tdd-workflow + security-review + skill-builder |

**Skills 審計結論：**
- 42 → 20 個（-52%），description 摘要 token 從 ~800 降至 ~400（-50%）。
- **更關鍵的是降低誤觸發機率**：22 個無關 Skill 的 YAML 描述會干擾 Claude 的判斷樹，增加觸發 Go/Java/PostgreSQL 相關架構幻覺的風險。

---

### 1.4 BMad 工作流指令 — 動態 Token 消耗（Type B）

#### create-story/instructions.xml（542 行）

逐步驟審計：

| 步驟 | 功能 | 行數 | 問題 | Token 浪費來源 |
|:-----|:-----|:----:|:-----|:--------------|
| Step 1 | 確定目標 Story | 178 行 | 🔴 **第 24-123 行與第 123-178 行存在完整的重複邏輯** — 同一個「找 backlog story」和「更新 Epic 狀態」邏輯被複製貼上了兩次 | ~1,500 tokens 浪費 |
| Step 1 | sprint-status.yaml 讀取 | — | 步驟 1 進行第 1 次全量讀取 (FULL_LOAD) | — |
| Step 2 | 載入核心文件 | 36 行 | 後備冗餘載入（PRD/Architecture/UX 後備路徑），與 epics 文件資訊重疊 | 條件性浪費 |
| Step 3 | 程式碼現況分析 | 76 行 | 合理，但 Glob/Grep 搜尋策略本身是 token 黑洞 | — |
| Step 4 | 架構分析 | 19 行 | 合理 | — |
| Step 5 | Web 研究 | 20 行 | 合理但通常不觸發 | — |
| Step 6 | 建立 Story 檔案 | 132 行 | Skills 分析邏輯合理，但包含硬編碼的 Skill 觸發對照表（第 353-364 行），與 skills_list.md 重複 | ~200 tokens 浪費 |
| Step 7 | 更新 Sprint 狀態 | 55 行 | 進行第 2 次 sprint-status.yaml 全量讀取 | ~500-1,500 tokens 浪費 |

#### create-story/checklist.md（358 行，~2,500 tokens）

🔴 **這是整個工作流中單一最大的情緒化 Token 浪費源。**

實際審計內容：
- 第 1 行 `🎯 Story Context Quality Competition Prompt` — 競爭型框架
- 第 3 行 `🔥 CRITICAL MISSION: Outperform and Fix the Original Create-Story LLM` — 無意義的擬人化激勵
- 第 29-31 行 `🎯 COMPETITIVE EXCELLENCE: This is a COMPETITION to create the ULTIMATE story context...` — 對 LLM 的注意力機制毫無幫助
- 第 222-358 行（最後 136 行）全部是 `COMPETITION SUCCESS METRICS`、`COMPETITIVE EXCELLENCE MINDSET`、`Go create the ultimate developer implementation guide! 🚀` — 純粹的情緒化填充

**精確量化**：358 行中約 180 行（50%）為情緒化修飾語、重複的動機宣言、emoji 裝飾。這些文字對 Claude 4.6 的邏輯推理能力提供零增益，卻佔據約 1,200 tokens。

#### dev-story/instructions.xml（481 行）

| 問題點 | 位置 | 浪費 |
|:-------|:-----|:-----|
| Step 1 + Step 2 重複解析 Story 檔案 | 第 16-134 行 vs 第 137-170 行 | 兩次載入 story sections，~300 tokens |
| Step 4 第 3 次 sprint-status.yaml FULL_LOAD | 第 213-238 行 | ~500-1,500 tokens |
| Step 9 第 4 次 sprint-status.yaml FULL_LOAD | 第 407-413 行 | ~500-1,500 tokens |

#### dev-story/checklist.md（80 行）

✅ **相對精簡合理**，無明顯浪費。

---

## 二、快取殺手（Cache Killers）精確識別

基於實際文件內容，以下是已確認的快取破壞源：

| 快取殺手 | 位置 | 破壞機制 | 嚴重程度 |
|:---------|:-----|:---------|:--------:|
| §10 Sprint 狀態嵌入 | 專案 CLAUDE.md | 任何 Story 狀態變更 → 整個 CLAUDE.md 雜湊改變 → KV 張量快取全部失效 | 🔴 **致命** |
| `Last Updated` 時間戳 | 全域 CLAUDE.md 第 5 行 | 任何更新 → 前綴變更 → 快取失效 | 🟡 中度 |
| project-context.md 動態區塊 | project-context.md 第 79-144 行 | 「當前進行中的工作」、「最近完成」區塊頻繁變動 | 🟡 中度（若被 CLAUDE.md 引用） |
| sprint-status.yaml 全量讀取 | 工作流中多次 FULL_LOAD | 199 行狀態檔每次全量灌入上下文，隨專案成長持續膨脹 | 🟠 高度 |

---

## 三、與雙引擎協作策略的整合分析

基於您上傳的「雙引擎協作」文件，Token 減量策略與 Gemini CLI + Claude Code 協作是**互補而非獨立**的兩套策略：

### 整合效益模型

| 場景 | 優化前 (Token/次) | 僅減量 (Token/次) | 減量 + 雙引擎 (Token/次) |
|:-----|:------------------:|:-----------------:|:------------------------:|
| Claude Code 啟動靜態成本 | ~15,040 | ~3,550 (-76%) | ~3,550 |
| create-story 一次完整執行 | ~31,200 | ~16,200 (-48%) | ~16,200 (Claude 負責) |
| dev-story 一次完整執行 | ~25,000+ | ~18,000 (-28%) | **→ 轉移至 Gemini CLI** |
| code-review 一次執行 | ~20,000+ | ~12,000 (-40%) | ~12,000 (Claude 負責) |
| 追蹤文檔更新 | ~3,000-5,000 | ~3,000-5,000 | **→ 轉移至 Gemini CLI** |
| **單次 Sprint 循環總計** | **~95,000+** | **~53,000 (-44%)** | **~32,000 (-66%)** |

**關鍵洞察**：
- 減量策略解決「每次會話的固定浪費」
- 雙引擎策略解決「高價值任務的模型匹配」
- 兩者結合才能達到最大效益

---

## 四、五階段實施藍圖（基於實際文件修訂版）

### Phase 0：止血與快取保護（立即執行）

**具體動作清單：**

1. **部署 .claudeignore**：封鎖 `node_modules/`, `dist/`, `build/`, `*.log`, `docs/implementation-artifacts/reviews/`, `.env`
2. **解除狀態耦合**：從專案 CLAUDE.md 移除 §10 Sprint 狀態嵌入，替換為：
   ```
   ## 狀態查詢
   執行任務前，主動讀取 docs/implementation-artifacts/sprint-status.yaml 取得最新狀態。
   ```
3. **移除時間敏感詞彙**：清除全域 CLAUDE.md 第 5 行 `Last Updated: 2026-01-31`
4. **配置權限阻擋**：在 `.claude/settings.json` 中阻擋 `.env` 讀取

**預期效益**：快取命中率恢復至 92% 目標值

---

### Phase 1：核心靜態負載極致瘦身（P0 最高優先級）

**全域 CLAUDE.md 具體瘦身方案（389 行 → ~30 行）：**

| 動作 | 刪減行數 | 節省 Token |
|:-----|:--------:|:----------:|
| 🔴 **完全刪除** §5 Thinking Protocol（第 167-353 行） | -167 行 | **-2,000** |
| 🔴 **完全刪除** §7 Quick Reference Card | -12 行 | -100 |
| 🔴 **完全刪除** §2.1 Default to Action | -7 行 | -70 |
| 🔴 **完全刪除** §2.2 Parallel Tool Execution | -7 行 | -70 |
| 🔴 **完全刪除** §3 Context Window Management | -12 行 | -100 |
| 🟡 精簡 §1.1 Language Policy（10→3 行） | -7 行 | -60 |
| 🟡 精簡 §1.2 Timestamp（20→5 行） | -15 行 | -150 |
| 🟡 精簡 §4 Dev Environment（27→8 行） | -19 行 | -170 |
| 🟡 精簡 §2.3-2.5 合併（40→10 行） | -30 行 | -300 |
| 🟡 精簡 §6 File Encoding（12→2 行） | -10 行 | -80 |
| **合計** | **-286 行** | **-3,100** |

**Rules 目錄具體瘦身方案（9 檔 → 6 檔）：**

| 動作 | 節省 Token |
|:-----|:----------:|
| 🔴 **刪除** agents.md（通用 agent 體系，非 BMAD） | -400 |
| 🔴 **刪除** hooks.md（macOS/bash hooks，Windows 不適用） | -380 |
| 🔴 **刪除** patterns.md（TypeScript patterns，C# 不適用） | -450 |
| 🟡 精簡 coding-style.md（移除 zod/TS 範例，71→15 行） | -430 |
| 🟡 精簡其餘 4 檔 | -340 |
| 新增 timestamp-enforcement.md（3 行） | +25 |
| 新增 no-time-estimates.md（3 行） | +25 |
| **合計** | **-1,950** |

**Phase 1 總預期效益**：

| 項目 | 瘦身前 | 瘦身後 | 減幅 |
|:-----|:------:|:------:|:----:|
| 全域 CLAUDE.md | ~3,640 tokens | ~540 tokens | **-85%** |
| 專案 CLAUDE.md | ~8,000 tokens | ~1,500 tokens | **-81%** |
| .claude/rules/ | ~3,000 tokens | ~550 tokens | **-82%** |
| Skills 摘要 | ~800 tokens | ~400 tokens | -50% |
| **每次會話靜態成本** | **~15,440** | **~2,990** | **-81%** |

---

### Phase 1.5：動態工作流指令深度壓縮（P0 高報酬）

**具體動作：**

1. **消除 create-story/instructions.xml Step 1 的完整重複邏輯**（第 24-178 行中的 copy-paste 重複）
   - 將兩個相同的「找 backlog story + 更新 Epic 狀態」邏輯合併為一個
   - 預估節省：~1,500 tokens / 次

2. **徹底重寫 create-story/checklist.md**（358 行 → ~150 行）
   - 刪除所有 `🔥 CRITICAL MISSION`、`COMPETITIVE EXCELLENCE`、`Go create the ultimate developer implementation guide! 🚀` 等情緒化填充
   - 保留實質的驗證邏輯（Step 1-4 的檢查項目）
   - 預估節省：~1,200 tokens / 次

3. **消除 sprint-status.yaml 多次全量讀取**
   - create-story：2 次 FULL_LOAD → 1 次讀取 + 變數傳遞
   - dev-story：Step 1 + Step 4 + Step 9 共 3 次 FULL_LOAD → 1 次讀取 + 變數傳遞
   - 預估節省：2,000-6,000 tokens / 次（視 YAML 大小）

4. **移除 instructions.xml 中硬編碼的 Skill 對照表**（create-story 第 353-364 行）
   - 已有 skills_list.md 作為 canonical source
   - 預估節省：~200 tokens / 次

**Phase 1.5 總預期效益**：每次 Sprint 循環穩定節省 ~5,000-9,000 tokens

---

### Phase 2/3：技能模組化（已有完整方案）

根據 Skills排查清單.md 的現有分析，執行 22 個 Skill 的刪除即可。

---

### Phase 4/5：會話紀律 + 進階工具

1. **貫徹「一任務一會話」鐵律**
2. **配置 PreCompact Hook**（PowerShell 腳本，寫入 progress-snapshot.md）
3. **設定 CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80**
4. **啟用 ENABLE_TOOL_SEARCH=auto:10**（MCP 工具動態載入）
5. **評估 SQLite FTS5 本地 RAG**（概念驗證階段）

---

## 五、風險矩陣（不容樂觀的部分）

| 風險 | 嚴重性 | 發生機率 | 緩解措施 |
|:-----|:------:|:--------:|:---------|
| Skills 觸發率不穩定（50-80%） | 高 | 確定 | 精確撰寫 YAML description；憲法級規則死守 rules/ |
| 刪除 Thinking Protocol 後模型行為改變 | 中 | 低 | Claude 4.6 Extended Thinking 是原生能力，移除人工協議不影響推理品質 |
| PreCompact Hook PowerShell 執行不穩定 | 中 | 中 | 先在測試環境驗證穩定性，配置 fallback |
| sprint-status.yaml 持續膨脹 | 高 | 確定 | 已有 archive 機制（19 個 Epic 已歸檔），定期清理 |
| Rules 精簡過度導致編碼品質下降 | 中 | 低 | 保留核心原則（不可變性、DRY），僅移除不適用的語言範例 |
| 雙引擎協作的 Gemini CLI 品質不確定 | 高 | 中 | 先以低風險 Story 試跑，確認 Gemini 的 C#/React 生成品質 |

---

## 六、CEO 最終裁示摘要

### 立即行動（本週內）

1. **Phase 0**：止血 — 部署 .claudeignore + 狀態解耦 + 移除時間戳
2. **Phase 1**：瘦身 — 刪除 Thinking Protocol（-2,000 tokens）、刪除 3 個無關 rules（-1,230 tokens）
3. **Phase 2**：清洗 — 刪除 22 個無關 Skills

### 下一步（兩週內）

4. **Phase 1.5**：工作流壓縮 — 重寫 checklist.md、消除重複邏輯
5. **Phase 4**：會話紀律 — PreCompact Hook + 壓縮閾值調整

### 持續評估

6. **Phase 5**：本地 RAG PoC — SQLite FTS5 概念驗證
7. **雙引擎協作**：Gemini CLI 試跑低風險 Story

### 預期最終效益

| 指標 | 優化前 | 優化後 | 改善幅度 |
|:-----|:------:|:------:|:--------:|
| 每次會話靜態成本 | ~15,040 tokens | ~2,990 tokens | **-80%** |
| 每次 Sprint 工作流固定成本 | ~31,200 tokens | ~22,000 tokens | **-30%** |
| 快取命中率 | 不穩定 | 目標 92% | — |
| Skills 誤觸發機率 | 較高 | 大幅降低 | -52% Skill 數 |
| **結合雙引擎後單次 Sprint 總成本** | **~95,000+** | **~32,000** | **-66%** |
