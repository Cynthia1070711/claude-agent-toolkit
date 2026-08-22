# Phase Structure — 5 階段完整定義

## Phase 1: Party Mode 多 Agent 討論

### 觸發條件
收到模組全方位檢測議題時,**必須立即**調用 Party Mode,禁止跳過。

### 執行流程

```
Step 1.1 讀取議題上下文
  → 閱讀 tracking 檔案 / Epic 進度 / Story 狀態
  → 確認當前焦點模組與範圍

Step 1.2 調用 Party Mode
  → Skill 工具: bmad:core:workflows:party-mode
  → 載入 agent-manifest.csv (20+ BMAD agents)

Step 1.3 智能選擇 3-4 位 Agent (每輪)
  Round 1 — 測試樹結構: Murat(TEA) + Sally(UX) + John(PM)
  Round 2 — 商業規則校正: Mary(Analyst) + Winston(Architect) + Murat + John
  Round 3 — 執行模式: Bob(SM) + Dr.Quinn(CPS) + Sally(UX) + Murat
  Round 4 — 收斂與拆分: Bob + Dr.Quinn + Mary + John

Step 1.4 多輪對話收斂
  → 每輪結束呈現 [選項] + [E]
  → 使用者主導下一輪方向
  → 收斂條件: *exit / 共識達成 / 邊際效益遞減(通常 3-5 輪)

Step 1.5 產出共識紀錄
  → 自動寫入 Context DB (session 記錄)
  → 可選: add_context(category="decision", title="Party Mode consensus")
```

### 產出
- 測試樹結構草案(L0-L3 × N 維度矩陣)
- 執行 SOP 初步版本(Chrome MCP 觀察員 + Sub-agent 委派)
- 商業規則待驗證清單(Phase 2 Step 0 的輸入)
- Story 合併策略(CMRD 演算法參數)
- Phase 3.5 拆分閾值(SDS 公式參數)

### 轉場條件(進入 Phase 2)
- 使用者明確選擇「進入 Phase 2」選項
- 或使用者 `*exit` Party Mode

---

## Phase 2: 測試樹建立 + Contract Verification

### Step 0 — Backend Contract Verification(最重要)

**為什麼必須做**:Constitutional Standard 要求所有商業規則必須有 file:line 證據。

**執行流程**:

```
Step 0.1 列出 Party Mode 提出的所有商業規則假設
  → 例如: "Free 可使用所有編輯器功能"
  → 例如: "Trial 7 天 = Professional 全功能"
  → 例如: "降級時專案保留但 Lock"

Step 0.2 每條假設委派 sub-agent Read 對應程式碼
  → Sub-agent 任務:
    • Read Models/*.cs (Entity)
    • Read Data/*Seeder.cs (種子資料)
    • Read Services/*Service.cs (業務邏輯)
    • Grep FeatureFlag / HasFeature 等關鍵字
  → 回傳格式: 三欄表 (假設 / 現狀 / 差異 + file:line)

Step 0.3 產出「商業規則真相報告」
  → 檔案: docs/tracking/active/{project}-business-rules-truth-report.md
  → 內容:
    • 假設與現狀對照
    • 差異分析
    • 建議的統一版本
    • 對應的 Skill 文件校正清單

Step 0.4 使用者決策
  → 對每條差異,使用者選擇: 保留現狀 / 更新程式碼 / 更新文件
  → 記錄決策至 Memory DB

Step 0.5 同步更新相關 Skill
  → Edit 相關 phycool-*/SKILL.md
  → 三引擎同步 (.claude + .gemini + .agent)
  → 記錄到 Skill Sync Pool

Step 0.6 建立 ADR 決策紀錄 (可選)
  → docs/technical-decisions/ADR-BUSINESS-XXX-*.md
  → 包含決策日期 / 決策者 / 依據 / 影響範圍

Step 0.7 Memory DB 寫入
  → add_context(category="decision", title="ADR-BUSINESS-XXX")
```

**預估時間**:15-45 分鐘(依商業規則複雜度)

### Step 1 — 建立測試樹骨架

**檔案**:`docs/tracking/active/{project}-full-test-tree.md`

**Schema**(參見 `templates/test-tree-skeleton.md`):
- L0: 整體信心指標(Confidence Scorecard)
- L1: 使用者目標(User Goals)
- L2: 功能模組(Modules)
- L3: 測試點(Test Points)
- 每個 L3 包含 5D 矩陣:
  - Plans 矩陣(N 個 Plan)
  - SaaS 合規維度(5 項)
  - UI/UX 生命週期(5 狀態)
  - 防呆機制(BR-* 規則對應)
  - 回歸測試標記

### Step 2 — 建立 Story 增量規則檔

**檔案**:`docs/tracking/active/{epic}-story-amendment-rules.md`

**內容**:
- Story 命名規則(`{epic}-{class}-{slug}`)
- CMRD 5 維度查詢參數
- 合併判定閾值(50 / 25 / <25)
- Amendment 格式範本
- Cross-ref 規則

### Step 3 — 建立 Sub-agent PIVOT SOP 檔

**檔案**:`docs/tracking/active/{epic}-subagent-sop.md`

**內容**:
- PIVOT 5 段式模板
- 強制 Read 清單(Constitutional 要求)
- 輸出 JSON schema
- CMRD 查詢自動化腳本

### Step 4 — 建立 Skill Sync Pool 初始檔

**檔案**:`docs/tracking/active/{epic}-skill-sync-pool.json`

**Schema**:
```json
{
  "phycool-{skill}": {
    "pending_corrections": [
      {
        "ac_ref": "{epic}-{story}.AC-{n}",
        "section": "{section-ref}",
        "current_text": "...",
        "should_be": "...",
        "evidence": "{file:line}"
      }
    ],
    "last_synced": null
  }
}
```

**批次同步時機**:
- 每天結束
- 或累積 5 個 corrections
- 或 L2 模組測試完成
- 避免並行修改同一 Skill 造成 Git 衝突

### 轉場條件(進入 Phase 3)
- Step 0-4 全部完成
- 商業規則真相報告 Alan 確認
- 測試樹骨架已建立並可瀏覽
- 第一個 L2 模組待測試

---

## Phase 3: 半自動化檢測 7 步閉環

### 單次迴圈(per L2 模組)

```
Step 3.1 [中控] Chrome MCP 初始化
  → mcp__chrome-devtools__list_pages (確認連線)
  → mcp__chrome-devtools__navigate_page (開啟目標 URL)
  → mcp__chrome-devtools__take_snapshot (基線)
  → 告知 Alan 目前模組 + 請切換帳號

Step 3.2 [使用者] 手動切換 N 個帳號測試
  → 使用者依序登入 A1 (Free) → A2 (Basic) → A3 (Advanced) → A4 (Pro) → A5 (Biz)
  → 每個帳號在同一模組執行測試劇本
  → 中控不操作,只觀察

Step 3.3 [使用者] 歸總回饋問題
  → 格式: "[模組] [帳號] [操作] → [預期] vs [實際] → [影響]"
  → 類型: UI/UX 不對 / 商業規則錯 / 防呆缺失 / 功能壞掉

Step 3.4 [中控] 立即證據收集 (< 5 秒)
  → take_snapshot → snapshot-{module}-{plan}-{seq}.md
  → take_screenshot → screenshot-{module}-{plan}-{seq}.png
  → list_console_messages → 收集 errors/warnings
  → list_network_requests → 收集 4xx/5xx

Step 3.5 [中控] 委派 Sub-agent 深度分析
  → Prompt 模板: PIVOT (Problem/Investigation/Verification/Output/Trace)
  → Sub-agent 強制 Read 程式碼取 file:line 證據
  → Sub-agent 執行 CMRD 查所有 active Stories
  → 回傳結構化 JSON

Step 3.6 [中控] 決策
  → CMRD score ≥ 50 → 自動合併到 candidate Story
  → CMRD score 25-49 → 建議合併 (主控判斷)
  → CMRD score < 25 → 建新 Story
  → 更新 DB (upsert-story.js or MCP)

Step 3.7 [中控] Skill 校正池化 + 下個模組
  → 若 Sub-agent 回報 skill_drift → 加入 Skill Sync Pool
  → 不立即 Edit (避免頻繁修改同檔案)
  → 告知 Alan 結果並詢問下一步
```

### 轉場條件(進入 Phase 3.5)
- 所有 L2 模組測試完成(使用者確認)
- 所有問題回饋已累積到 Stories
- Skill Sync Pool 批次同步完成

---

## Phase 3.5: Story Refinement Gate(強制節點)

### 執行流程

```
Step 3.5.1 列出所有 epic-{eft} Stories
  → 查詢: search_stories(epic_id='epic-eft')
  → 欄位: story_id, title, ac_count, affected_files, complexity

Step 3.5.2 計算每個 Story 的 SDS
  → 公式 (參見 sds-refinement-gate.md)
  → 產出: Story → SDS 分數表

Step 3.5.3 識別需要拆分的 Stories
  → SDS > 50 → 強制拆分
  → SDS 35-50 → 建議拆分(使用者判斷)
  → SDS < 35 → 保持

Step 3.5.4 對每個需拆分的 Story,評估 4 拆分策略
  → 策略 1: 根因類別拆 (Bug/SaaS/Drift/Spec)
  → 策略 2: 影響檔案集合拆 (graph connected components)
  → 策略 3: Plan 矩陣拆 (Free/Paid/Max-Tier)
  → 策略 4: BR 規則拆 (逐條 BR-* 分組)
  → 選: SDS 降幅最大者

Step 3.5.5 執行拆分
  → 建立子 Stories (parent-child 關聯)
  → 搬移 AC 到對應子 Story
  → 重建依賴鏈 (spec → bug → saas → drift)
  → 原 Story 標記為 split_parent

Step 3.5.6 產出 Refinement Report
  → 檔案: docs/tracking/active/{epic}-refinement-report.md
  → 內容:
    • 拆分前/後 Story 數量對比
    • SDS 降幅統計
    • 依賴圖 (Mermaid)
    • Pipeline Batch Plan

Step 3.5.7 更新所有 Stories status
  → in-progress → review → ready-for-dev
  → amendment_open → false
  → amendment_closed_at → 當前時間
```

### 轉場條件(進入 Phase 4)
- 所有 Stories SDS ≤ 35 或已拆分完成
- Refinement Report 產出
- Pipeline Batch Plan 確認
- 所有 Stories status = ready-for-dev

---

## Phase 4: Pipeline 批次修復

### 執行策略:動態排程模式

詳見 `party-to-pipeline/SKILL.md §5 動態排程模式`。

**核心規則**:
- 併行上限:3 個 Story
- 衝突迴避:同檔案不並行
- 依賴順序:blockedBy 先完成
- 補位機制:slot 空出立即從佇列補下一個無衝突 Story

### Per Story 執行

```
Step 4.1 啟動 claude-launcher-interactive
  → Skill: claude-launcher-interactive
  → 參數: -StoryId {story-id} -TimeoutMin 45

Step 4.2 子視窗執行 create-story (Opus)
  → 讀取 backlog 框架
  → Read codebase 補全 tasks/subtasks
  → 設定 status: ready-for-dev

Step 4.3 子視窗執行 dev-story (Sonnet)
  → ATDD → TDD RED → TDD GREEN → TDD REFACTOR
  → Run tests → 確認通過
  → 設定 status: review

Step 4.4 子視窗執行 code-review (Opus)
  → VSDD 審查 (Spec vs Code)
  → 修復 CRITICAL/HIGH issues
  → 設定 status: done

Step 4.5 主控端收到 task-notification
  → 讀取 output file
  → 驗證 tasks-backfill (∀ task 有 ✅ + file:line)
  → 觸發 Skill Sync Gate 驗證
  → 從佇列選下一個 Story 補位
```

### 轉場條件(工作流完成)
- 所有 Stories status = done
- sprint-status.yaml 更新
- Epic 整體驗收完成
- Commit + (可選) PR

---

## 階段時間預估

| Phase | 最短 | 一般 | 最長 |
|:-----:|:----:|:----:|:----:|
| 1 Party Mode | 30 分 | 60 分 | 120 分 |
| 2 Step 0 Verification | 15 分 | 30 分 | 60 分 |
| 2 Step 1-4 建檔 | 20 分 | 40 分 | 90 分 |
| 3 檢測閉環(per 模組) | 15 分 | 30 分 | 60 分 |
| 3 全部 N 模組 | 3 小時 | 6 小時 | 12 小時 |
| 3.5 Refinement | 20 分 | 45 分 | 90 分 |
| 4 Pipeline(per Story) | 40 分 | 60 分 | 120 分 |
| 4 全部 N Stories | 8 小時 | 15 小時 | 30 小時 |

**典型專案總時間**:2-5 個工作天(分散執行)
