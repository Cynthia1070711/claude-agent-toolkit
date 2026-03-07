# Token 減量策略 — Story 執行紀錄

> **執行日期**: 2026-02-24
> **執行者**: Claude Opus 4.6

---

## TRS-0: 止血 — .claudeignore 建立與狀態解耦 ✅

**狀態**: 完成
**複雜度**: S | **優先級**: P0

### 執行內容
1. **建立 `.claudeignore`** — 封鎖 node_modules、dist、build、*.log、.env、lock files、.vs、.git、IDE 暫存、大型生成檔（*.Designer.cs、ModelSnapshot）、非專案資料夾（claude token減量策略研究分析/、.gemini/、.agent/）
2. **專案 CLAUDE.md §10 狀態解耦** — 移除硬編碼的 Sprint 狀態摘要（Epic 列表、Active Story、SUSPENDED 等動態內容），替換為路徑引用（`docs/project-context.md` + `sprint-status.yaml`）
3. **全域 CLAUDE.md 移除 Last Updated** — 刪除第 5 行 `Last Updated: 2026-01-31`，消除快取殺手

### 修改檔案
- 新建: `.claudeignore`
- 編輯: `CLAUDE.md`（專案）§10
- 編輯: `~/.claude/CLAUDE.md`（全域）header

### 效益
- 快取命中率恢復（消除 §10 動態狀態造成的 KV 張量快取失效）
- .claudeignore 阻絕模型讀取無效大檔案

---

## TRS-1: 全域 CLAUDE.md 極致瘦身 ✅

**狀態**: 完成
**複雜度**: M | **優先級**: P0

### 執行內容
完全重寫 `~/.claude/CLAUDE.md`，保留核心規則，刪除所有冗餘。

**刪除項目**:
- §5 Thinking Protocol（167 行）— Claude 4.6 原生 Extended Thinking
- §2.1 Default to Action（7 行）— 原生行為
- §2.2 Parallel Tool Execution（7 行）— 原生行為
- §3 Context Window Management（12 行）— 原生行為
- §7 Quick Reference Card（12 行）— 與前面章節重複
- §5.1-5.6 所有 Thinking 子章節、Natural Language Markers、Anti-Patterns 等

**保留並精簡**:
- Language Policy → 2 行
- Timestamp → 2 行
- Code Quality → 3 行
- Reporting（禁止時間估算）→ 2 行
- Dev Environment → 2 行
- File Encoding → 1 行

### 修改檔案
- 重寫: `~/.claude/CLAUDE.md`

### 效益
- **388 行 → 25 行（-94%）**
- **~3,640 tokens → ~250 tokens（-93%）**

---

## TRS-2: 專案 CLAUDE.md 瘦身 ✅

**狀態**: 完成
**複雜度**: L | **優先級**: P0

### 執行內容
完全重寫專案 `CLAUDE.md`，消除與全域重複的內容、冗長的事故背景敘述、詳細的 workflow 步驟。

**刪除/合併項目**:
- §0.1 Timestamp Rule — 已在全域 CLAUDE.md
- §0.2 Analysis & Reporting — 已在全域 CLAUDE.md
- §0.3 Constitutional Standard 詳述 — 由 `.claude/rules/constitutional-standard.md` 自動載入
- §1.1-§1.6 詳細 Trigger 定義 — 合併為精簡的 §1 Triggers 段落
- §1.7 BMAD Skills 自動化詳述 — 精簡為 2 行說明
- §4 Project Architecture（BMAD 結構樹）— 低價值
- §5 Workflow Commands 完整表格 — 精簡為 2 行
- §6 Task Execution Protocol 全部 — 精簡為 §5 Workflow Completion Checklists
- §8 UI/UX Protocol — 合併進 §1 Triggers
- §9 Chrome MCP E2E Protocol — 合併進 §1 Triggers
- §11 File Hygiene — 移至 §1 Commit 觸發
- §12 Quick Reference — 刪除（重複）
- §13 BDD Standards — 刪除（workflow 內部處理）
- 所有事故背景敘述（2026-01-31、2026-02-01、2026-02-08 事故）— 僅保留規則本身

### 修改檔案
- 重寫: `CLAUDE.md`（專案）

### 效益
- **742 行 → 117 行（-84%）**
- **~8,000 tokens → ~1,200 tokens（-85%）**

---

## TRS-3: .claude/rules/ 精簡重組 ✅

**狀態**: 完成
**複雜度**: M | **優先級**: P0

### 執行內容

**刪除 3 個無關檔案**:
1. `agents.md`（50 行）— 描述通用 Claude Code agents，與 BMAD 不同體系
2. `hooks.md`（47 行）— macOS/bash hooks 描述，Windows 不適用
3. `patterns.md`（56 行）— TypeScript/Node.js patterns，MyProject 後端是 C#

**精簡 4 個檔案**:
4. `coding-style.md`: 71 行 → 6 行 — 移除 JS/TS 範例，保留核心原則
5. `performance.md`: 48 行 → 4 行 — 精簡為 3 條要點
6. `security.md`: 37 行 → 8 行 — 移除 TS 範例，保留檢查清單
7. `git-workflow.md`: 46 行 → 4 行 — 僅保留 commit 格式和 PR 要點
8. `testing.md`: 31 行 → 4 行 — 保留覆蓋率和 TDD 核心

**未修改**:
- `constitutional-standard.md`（11 行）— 憲章級，絕不動

### 修改檔案
- 刪除: `agents.md`, `hooks.md`, `patterns.md`
- 精簡: `coding-style.md`, `performance.md`, `security.md`, `git-workflow.md`, `testing.md`

### 效益
- **9 檔 397 行 → 6 檔 ~37 行（-91%）**
- **~3,000 tokens → ~300 tokens（-90%）**

---

## TRS-4: Skills 清理 ✅

**狀態**: 完成
**複雜度**: S | **優先級**: P1

### 執行內容

**刪除 22 個 Skills 目錄**:

| 分類 | 數量 | 明細 |
|------|:----:|------|
| 不相關技術棧 | 13 | golang-patterns, golang-testing, springboot-patterns, springboot-security, springboot-tdd, springboot-verification, java-coding-standards, jpa-patterns, postgres-patterns, clickhouse-io, webgpu-threejs-tsl, webgpu-claude-skill-main, project-guidelines-example |
| 已被專用 Skill 覆蓋 | 3 | backend-patterns, coding-standards, frontend-patterns |
| 需 bash hooks / 從未啟用 | 4 | continuous-learning, continuous-learning-v2, strategic-compact, eval-harness |
| 已被 BMAD 覆蓋 | 2 | verification-loop, iterative-retrieval |

**更新 `skills_list.md`**: 140 行 → 47 行

### 修改檔案
- 刪除: 22 個 `.claude/skills/` 子目錄
- 重寫: `.claude/skills/skills_list.md`

### 效益
- **42 → 20 個 Skills（-52%）**
- Description 摘要 token ~800 → ~400（-50%）
- 大幅降低誤觸發不相關 Skill 的機率

---

## TRS-5: BMAD Workflow Instructions 壓縮（規劃）✅

**狀態**: 完成（規劃文件產出，不在此階段修改 XML）
**複雜度**: M | **優先級**: P1

### 執行內容
分析三組核心 workflow 的壓縮機會：
- code-review: 1,115 行（instructions.xml 923 行最大）
- create-story: 1,006 行（checklist.md 358 行有 50% 情緒化填充）
- dev-story: 624 行

### 產出檔案
- `claude token減量策略研究分析/stories/TRS-5-workflow-compression-plan.md`

### 識別的壓縮機會
1. create-story/checklist.md 情緒化填充刪除（-58%）
2. create-story/instructions.xml Step 1 重複邏輯合併（-~100 行）
3. sprint-status.yaml 多次全量讀取優化（跨 3 個 workflow）
4. 硬編碼 Skill 對照表移除
5. code-review/instructions.xml 待詳細審計

---

## TRS-6 ~ TRS-15: 第二階段 Stories（Party Mode 討論產出）

> **建立日期**: 2026-02-24 20:55
> **建立者**: BMAD Party Mode（PM / Architect / Analyst / Dev / TEA）
> **性質**: 全部為 backlog 狀態，待逐步執行

### B 類：Workflow 執行開銷壓縮

| Story ID | 標題 | 複雜度 | 優先級 | 狀態 |
|----------|------|:------:|:------:|:----:|
| TRS-6 | create-story/checklist.md 情緒化填充清除 | S | P0 | backlog |
| TRS-7 | create-story/instructions.xml 去重與硬編碼清除 | M | P0 | backlog |
| TRS-8 | code-review/instructions.xml 深度審計與壓縮 | L | P0 | backlog |
| TRS-9 | sprint-status.yaml 多次全量讀取優化 | L | P1 | backlog |
| TRS-10 | dev-story/instructions.xml 壓縮 | M | P1 | backlog |

### D 類：操作流程優化

| Story ID | 標題 | 複雜度 | 優先級 | 狀態 |
|----------|------|:------:|:------:|:----:|
| TRS-11 | 技術債側車文件（Sidecar）架構 | L | P2 | done |
| TRS-12 | Story 模板章節標注與依賴摘要 | M | P2 | backlog |

### E 類：多引擎協作策略

| Story ID | 標題 | 複雜度 | 優先級 | 狀態 |
|----------|------|:------:|:------:|:----:|
| TRS-13 | 雙引擎（Gemini CLI + Claude Code）SOP 標準化 | L | P1 | backlog |
| TRS-14 | 三引擎統一憲章（AGENTS.md）與共用資源架構 | XL | P2 | backlog |

### C 類：防禦性保護

| Story ID | 標題 | 複雜度 | 優先級 | 狀態 |
|----------|------|:------:|:------:|:----:|
| TRS-15 | Session 紀律制度化與 PreCompact Hook | S | P2 | done |

### TRS-16: Agents & Commands 清理 (新增)

> **建立日期**: 2026-02-25 00:31
> **狀態**: done

刪除 `.claude/agents/` (3) 和 `.claude/commands/` (11) 中不相關項目，補完 TRS-4 盲點。

---

## TRS-17: Epic README 自動同步機制（事故驅動新增）

> **建立日期**: 2026-02-25 09:17
> **建立者**: Claude Opus 4.6（事故分析 → 自動化方案設計）
> **性質**: backlog，D 類操作流程優化

### 事故背景

QGR-E1 完成後發現 Epic QGR README.md 的 Phase 1 Group D 狀態未同步更新，觸發根因分析。

### 方案

將 Epic README 從「Claude 手動維護」轉為「腳本自動生成」：
1. 建立 `epic-config.yaml` — 靜態結構定義（一次寫入）
2. 建立 `sync-epic-readme.ps1` — YAML→Markdown 生成器
3. 設定 PostToolUse Hook — sprint-status.yaml 變更時自動觸發
4. 加入 .claudeignore — Claude 不再讀寫 README

| Story ID | 標題 | 複雜度 | 優先級 | 狀態 |
|----------|------|:------:|:------:|:----:|
| TRS-17 | Epic README 自動同步機制（PostToolUse Hook + 衍生視圖） | L | P1 | backlog |

### 預估效益

- 每個 Story 生命週期節省 ~4,300-6,300 tokens
- 剩餘 67 Stories 總節省：~288,100-422,100 tokens
- 徹底消除人為遺漏更新事故

---

## TRS-11: 技術債側車文件（Sidecar）架構 ✅

**狀態**: 完成
**複雜度**: L | **優先級**: P2
**完成時間**: 2026-02-25 12:34

### 執行內容

建立技術債側車文件架構，讓 code-review 發現技術債時不再需要讀取目標 Story 全文，改為寫入蒸餾過的 `.debt.md` 側車文件。

**1. 建立目錄結構**:
- 新建: `docs/implementation-artifacts/tech-debt/README.md` — 說明檔案格式、命名規則、三層上下文、生命週期

**2. 修改 code-review/instructions.xml**:
- Step 2: 移除跨 Epic Story 地圖預載（~5 行 action → 1 行 comment）
- Step 4: 延後項目處理從「讀取所有 Story 全文 + 寫入目標 Story」改為「寫入 .debt.md 側車文件」
  - 移除 Phase 1+2 的 Story 地圖建構（讀取所有 epic-*/stories/）
  - 移除 Phase 4 的目標 Story 載入與修改
  - 新增側車文件寫入（三層上下文：修復層+影響層+業務脈絡層）
  - 路由決策改為從 `sprint_status_cache` 查詢（不讀 Story 全文）
- Step 6: 新增 Story done 時自動刪除對應 `.debt.md`

**3. 修改 dev-story/instructions.xml**:
- Step 2: 新增側車文件載入步驟
  - 檢查 `tech-debt/{story_key}.debt.md` 是否存在
  - 存在則載入 fix_guidance、problem_location 作為開發上下文

**4. 更新 checklist.md**:
- 延後項目驗證步驟改為側車文件寫入流程
- 新增 Story done 時刪除側車文件的驗證項

### 修改檔案
- 新建: `docs/implementation-artifacts/tech-debt/README.md`
- 修改: `_bmad/bmm/workflows/4-implementation/code-review/instructions.xml`
- 修改: `_bmad/bmm/workflows/4-implementation/code-review/checklist.md`
- 修改: `_bmad/bmm/workflows/4-implementation/dev-story/instructions.xml`

### 效益
- 每次技術債操作：讀取 ~7,750 tokens → 寫入 ~50 tokens（-99.4%）
- 每個 Story 平均 1.5 個技術債，65 Stories 預估節省：~754,875 tokens
- dev-story 消費側車文件僅需 ~50 tokens（vs 讀取目標 Story 全文 ~3,000 tokens）

---

### 依賴圖（更新）

```
TRS-5（規劃完成）
  ├→ TRS-6（P0）→ TRS-7（P0）→ TRS-8（P0）
  │                                    ├→ TRS-9（P1）→ TRS-10（P1）
  │                                    └→ TRS-11（P2）→ done ✅
  ├→ TRS-12（P2，獨立）
  ├→ TRS-13（P1，依賴 TRS-6~10 完成）→ TRS-14（P2）
  ├→ TRS-15（P2，獨立）→ done ✅
  ├→ TRS-16（P1，依賴 TRS-4）→ done ✅
  └→ TRS-17（P1，依賴 TRS-0 + TRS-9，獨立可交付）
```

---

## TRS-31: 多 Agent 並行執行策略報告 ✅

**狀態**: 完成
**複雜度**: S | **優先級**: P1
**執行日期**: 2026-02-27

### 執行內容

Party Mode 討論（Winston + Amelia + Bob）中針對三個核心問題進行分析：
1. Commit 是否消耗 Token → 結論：git 指令不耗，Agent 思考過程耗
2. 多 Agent 同時 Commit 風險 → 結論：staging area 污染、index.lock 衝突
3. 同時讀寫同一檔案 → 結論：靜默覆蓋，需要隔離機制

產出三層解決架構：
- Layer 1: Git Worktree（同引擎多開）
- Layer 2: File Lock 機制（跨引擎同目錄）
- Layer 3: Total Commit 模式（commit 策略）

### 交付物
- `docs/專案部屬必讀/multi-agent-parallel-execution-strategy.md`（策略報告）
- `TRS-32-file-lock-mechanism.md`（File Lock Story）
- `TRS-33-worktree-parallel-sop.md`（Worktree SOP Story）
- `docs/專案部屬必讀/README.md` 更新
- `multi-engine-collaboration-strategy.md` §5.5 新增陷阱 #7, #8 + §9.3 新增 Phase 3
- `最終彙整報告.md` §4.3 + §4.4 更新

### 關鍵發現
- 同引擎多開（5×CC-OPUS）→ File Lock 失效（Agent ID 相同），必須用 Worktree
- `claude -w <name>` 或 `claude --worktree <name>` 可直接建立隔離工作區
- 首次使用會觸發 GitHub 認證，之後重新進入不會再跳
- Worktree 內 commit 零風險（各自獨立 staging area + branch）

---

### 預估總效益（全部完成後）

| 類別 | 預估節省 | 對 Epic QGR 65 Stories 的影響 |
|------|:--------:|:---------------------------:|
| B 類（TRS-6~10）| ~8,200 tokens/Sprint 循環 | ~533,000 tokens |
| D 類（TRS-11~12, TRS-17）| ~19,550 tokens/操作 | ~1,042,975 tokens |
| E 類（TRS-13~14）| ~40% Claude token 轉移至 Gemini | 質性效益 |
| C 類（TRS-15）| 行為性節省 | 質性效益 |

---

## 總效益摘要

| 項目 | 瘦身前 | 瘦身後 | 減幅 |
|------|:------:|:------:|:----:|
| 全域 CLAUDE.md | 388 行 / ~3,640 tokens | 25 行 / ~250 tokens | **-94%** |
| 專案 CLAUDE.md | 742 行 / ~8,000 tokens | 117 行 / ~1,200 tokens | **-84%** |
| .claude/rules/ | 9 檔 397 行 / ~3,000 tokens | 6 檔 37 行 / ~300 tokens | **-91%** |
| Skills 摘要 | 42 個 / ~800 tokens | 20 個 / ~400 tokens | **-50%** |
| **每次會話靜態成本** | **~15,440 tokens** | **~2,150 tokens** | **-86%** |
