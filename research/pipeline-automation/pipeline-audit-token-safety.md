# Pipeline 中控調度與 Token 安全閥 (Central Dispatch & Token Safety)

## 文件資訊

| 欄位 | 值 |
|------|-----|
| **文件 ID** | pipeline-audit-token-safety |
| **歸屬** | Claude 智能中控自動化排程 |
| **優先級** | P1 |
| **類型** | DevOps/Tooling |
| **複雜度** | L |
| **狀態** | 已完成 |
| **來源** | Batch 2-4 執行缺陷 + Token 耗盡無預警中斷 + 中控調度需求 |
| **建立日期** | 2026-03-01 |
| **更新日期** | 2026-03-02 |

---

## 目標

As a MyProject 平台開發者/SM,
I want 主視窗 Claude 作為中控，分批開啟新視窗完整執行 BMAD workflows（create → dev → review），並在 Token 達 90% 安全閥時主動停止排程,
so that 自動化排程如同手動操作般完整可靠，且不因 Token 配額耗盡導致任務中斷。

---

## 現況基礎設施分析

### 已有元件（可直接複用）

| 元件 | 路徑 | 能力 |
|------|------|------|
| **story-pipeline.ps1** | `scripts/story-pipeline.ps1` | 單 Story 三階段管線（create → dev → review），自動狀態判斷跳過已完成階段 |
| **batch-runner.ps1** | `scripts/batch-runner.ps1` | 最多 5 個 Story 並行，錯開 10~15 秒，隱藏視窗，Markdown 報告 |
| **epic-auto-pilot.ps1** | `scripts/epic-auto-pilot.ps1` | 整個 Epic 迴圈自動化，支援 Claude + Gemini 雙引擎 |
| **claude-session.ps1** | `.claude/skills/claude-launcher/scripts/` | Claude CLI 統一會話管理（run/spawn/background/parallel） |

### 已有的模型配置（story-pipeline.ps1）

| 階段 | 模型 | 配置位置 |
|------|------|---------|
| create-story | Opus | L324 `Build-CreatePrompt` |
| dev-story | Sonnet | L350 `Build-DevPrompt` |
| code-review | Opus | L389 `Build-ReviewPrompt` |

### 已有的 Prompt 結構（純 BMAD Skill 調用）

```powershell
Build-CreatePrompt → "/bmad:bmm:workflows:create-story $StoryId"
Build-DevPrompt    → "/bmad:bmm:workflows:dev-story $StoryId"
Build-ReviewPrompt → "/bmad:bmm:workflows:code-review $StoryId"
```

> 等同手動在 Claude Code 內輸入 `/bmad:...`，因此**已能完整執行 BMAD workflows**。

### 已有的關鍵機制

| 機制 | 說明 |
|------|------|
| 嵌套會話防護 | `Remove-Item Env:CLAUDECODE` 避免 nested session 錯誤 |
| 超時保護 | 每階段 45 分鐘（可調 `-TimeoutMin`），超時自動殺進程 |
| 狀態判斷 | 讀取 `sprint-status.yaml` 自動決定從哪個階段開始 |
| Review 重試 | code-review 失敗最多重試 2 次（`-MaxReviewRetries`） |

---

## 問題分析

### 問題 1：Claude `-p` 實例走捷徑（已有機制，需強化）
- Pipeline 中 Claude 完成程式碼工作但跳過 metadata 更新
- Story 檔案狀態、sprint-status.yaml、tracking file 三者不同步
- 詳細根因分析見下方「`-p` 模式不完整載入 BMAD Workflow 根因深度分析」

### 問題 2：狀態不同步（已有機制，需補 audit）
- Story 檔案 `## Story 資訊` 表格狀態 vs sprint-status.yaml 不一致
- Tracking file 在 active/ 和 archived/ 同時存在
- H1 emoji 與實際狀態不匹配

### 問題 3：Token 耗盡無預警（核心缺口 — 需新建）
- Batch 4 執行到一半 Token 配額用完，Claude 靜默失敗
- 後續 Story 仍嘗試啟動，浪費等待時間
- **無法在啟動前偵測 Token 使用率**

### 問題 4：中控視窗缺乏調度可視性（需強化）
- 主視窗 Claude 透過 `run_in_background` 啟動 batch-runner，但無法即時掌握進度
- 批次完成前只能被動等待

---

## `-p` 模式不完整載入 BMAD Workflow 根因深度分析

### 根本原因：三層結構

```
Layer 1（表面）── Prompt 格式正確
│  "/bmad:bmm:workflows:create-story $StoryId"
│  等同手動輸入，Skill 能被識別並載入 ✅
│
Layer 2（執行層）── Context Window 壓力導致 auto-skip
│  ├─ Prompt + CLAUDE.md + constitutional-standard 佔用 ~30% context
│  ├─ workflow.yaml + instructions.xml (600+ 行) 載入 ~25% context
│  ├─ 實際 Story 檔案 + sprint-status.yaml 讀取 ~20% context
│  ├─ Step 1~8 的程式碼讀寫操作 ~15% context
│  └─ Step 9 (metadata 同步) 時剩餘 < 10% context
│     → LLM 自動優化：縮減或跳過「非核心」步驟 ❌
│
Layer 3（最深層）── 模型自適應行為
│  ├─ `-p` 模式 = 「一次性完成」的隱含指令
│  ├─ LLM 傾向「快速完成主業務，跳過確認式互動」
│  ├─ Workflow Engine 的 checkpoint（ask: Continue? y/n）在 `-p` 模式中
│  │   被 auto-YOLO，無法暫停驗證
│  └─ 結果：metadata 更新被視為「非核心」而被省略 ❌
```

### `-p` 模式 vs 互動模式的關鍵差異

| 特性 | 互動模式 | `-p` 模式 | 對 BMAD 的影響 |
|------|---------|---------|---------------|
| **Context 分配** | 彈性分配，保留給互動 | Prompt 優先佔用 | 後期步驟 context 不足 |
| **Checkpoint 機制** | 每個 `<ask>` 停下等使用者確認 | auto-YOLO 跳過所有確認 | metadata 步驟被快速通過 |
| **檔案寫入時序** | 漸進式（逐步 Save） | 批量式（傾向最後一次 Save） | 中間狀態可能遺漏 |
| **錯誤恢復** | 使用者可介入修正 | 自動選擇路徑（可能選錯） | 無法手動糾正 |
| **Skill 快取** | 動態重新載入 | 啟動時一次性掃描 | 快取可能不是最新版 |

### 為什麼「偶爾」成功、「偶爾」失敗？

| 因素 | 成功時 | 失敗時 |
|------|--------|--------|
| Story 複雜度 | 簡單（File List < 20 項） | 複雜（File List 50+ 項） |
| sprint-status.yaml 大小 | 小（載入快，耗 token 少） | 大（載入慢，佔更多 context） |
| 並行數量 | 單獨執行 | 5 個並行（file lock 競爭） |
| Model Sampling | 恰好選擇完整執行路徑 | 恰好選擇快速路徑 |

### 實際事故時序重現

**失敗案例**（QGR-E1，複雜 Story）：
```
[0%   ] Prompt 注入 → context 用 5%
[5%   ] CLAUDE.md + Skills 載入 → context 用 30%
[35%  ] workflow.yaml + instructions.xml 載入 → context 用 55%
[55%  ] Step 1-4: 讀取 Story + 載入 Skills → context 用 65%
[65%  ] Step 5-8: 實際程式碼工作（50+ 檔案） → context 用 92%
[92%  ] Step 9: metadata 同步 → context 剩餘 8%
         → LLM 只更新了 Story 檔案，跳過 sprint-status.yaml ❌
         → emoji 更新也被省略 ❌
```

**成功案例**（QGR-S3，簡單 Story）：
```
[0%   ] Prompt → 5%
[5%   ] CLAUDE.md + Skills → 30%
[30%  ] workflow + instructions → 50%
[50%  ] Step 1-4: 讀取 Story → 55%
[55%  ] Step 5-8: 程式碼工作（15 檔案） → 75%
[75%  ] Step 9: metadata 同步 → context 剩餘 25%
         → 完整更新 Story + sprint-status + tracking + emoji ✅
```

### 已驗證：`--append-system-prompt` 可與 `-p` 模式併用

```
CLI Help 確認：
  --append-system-prompt <prompt>  Append a system prompt to the default system prompt
  -p, --print                     Print response and exit

兩個參數互相獨立，可同時使用。
--append-system-prompt 追加至現有 System Prompt（保留 CLAUDE.md + constitutional-standard）。
--system-prompt 則會完全覆蓋，不適用。
```

### 解決方案：三層防護

#### 第 1 層：`--append-system-prompt` 強制指令（story-pipeline.ps1 修改）

```powershell
# 現行（L172）：
claude -p $promptText --model $Model --dangerously-skip-permissions

# 修改為：
$enforcePrompt = @"
MANDATORY: Execute ALL workflow steps in EXACT order. Do NOT skip any step.
Step 9 metadata sync MUST update BOTH:
  1. Story file "## Story 資訊" table Status field
  2. sprint-status.yaml development_status entry
Also update: tracking file, H1 emoji.
Skipping ANY metadata step is a CRITICAL violation.
"@

claude -p $promptText --model $Model `
       --append-system-prompt $enforcePrompt `
       --dangerously-skip-permissions
```

**效果**：在 System Prompt 層級強制約束，LLM 在 context 壓力下也會優先保留 metadata 步驟。

#### 第 2 層：Phase 間隔 + 獨立視窗（已有，需調整間隔）

每個 Phase 獨立新視窗 = 全新 Claude 會話，context 從零開始。
Phase 間隔 12 秒確保 filesystem sync 完成 + 避免 rate limiting。

#### 第 3 層：batch-audit.ps1 事後驗證 + AutoFix（新建）

即使第 1、2 層仍有漏網，第 3 層 audit 掃描 7 個 Check 函式，偵測並自動修復不同步。

**預期效果**：三層防護將失敗率從 15-20% 降至 < 1%。

---

## 四大需求對應方案

### 需求 1：主視窗 Claude 中控調度

**現況**：主視窗 Claude 已可透過 Bash `run_in_background` 啟動 batch-runner.ps1，完成後自動通知。

**強化方向**：
- 主視窗 Claude 維持**排程決策權**：決定何時啟動下一批、是否暫停、是否跳過
- 每批完成後，主視窗解析 batch report + audit 結果，再決定下一步
- 中控流程圖：

```
┌──────────────────────────────────────────────────────────────────┐
│  主視窗 Claude（中控）                                             │
│                                                                  │
│  1. 讀取 sprint-status.yaml → 識別待處理 Stories                   │
│  2. 分批規劃（每批最多 5 個）                                       │
│  3. ★ 檢查 Token 使用率                                           │
│     ├─ < 90% → 繼續                                              │
│     └─ ≥ 90% → ⛔ 停止，輸出警示                                  │
│  4. 啟動 batch-runner.ps1 (run_in_background)                     │
│  5. 等待完成通知                                                   │
│  6. 執行 batch-audit.ps1 → 驗證 + AutoFix                         │
│  7. 解析結果 → 決定是否繼續 Batch N+1                              │
│     ├─ 全部 Done → 繼續下一批                                      │
│     ├─ 有失敗 → 記錄，繼續或暫停                                   │
│     └─ Token 耗盡 → ⛔ 停止                                       │
│  8. 重複 3-7 直到全部完成或 Token 不足                              │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼ batch-runner（每個 Story 間隔 12 秒啟動）
┌──────────────────────────────────────────────────────────────────┐
│  Story-A pipeline    ──12s──    Story-B pipeline   ──12s── ...   │
│                                                                  │
│  每個 Story pipeline 內部：                                       │
│  ┌─────────┐  12s  ┌─────────┐  12s  ┌──────────┐               │
│  │ create  │ ────→ │  dev    │ ────→ │ review   │               │
│  │ (Opus)  │       │(Sonnet) │       │ (Opus)   │               │
│  │ 新視窗  │       │ 新視窗  │       │ 新視窗   │               │
│  └─────────┘       └─────────┘       └──────────┘               │
│  完整 BMAD          完整 BMAD          完整 BMAD                  │
│  workflow           workflow           workflow                   │
└──────────────────────────────────────────────────────────────────┘
```

### 需求 2：子視窗完整執行 BMAD Workflows（每階段獨立新視窗）

**核心原則**：每個 Story 的 create / dev / review **各自開啟獨立新視窗**，確保每個階段都是全新 Claude 會話，完整載入 BMAD workflow。

**現有問題**：

`claude -p` 模式的一次性 prompt 有時無法完整執行 BMAD workflow 全部步驟：
- BMAD skill 載入不完整（跳過 instructions.xml 的部分步驟）
- Metadata 更新被省略（Story 狀態、tracking file、emoji 未更新）
- 根因：`-p` 模式是「一次性輸入」，Claude 傾向快速完成而非嚴格遵循 workflow

**已有但需強化**：

| 項目 | 現況 | 差距 |
|------|------|------|
| Prompt 格式 | 純 `/bmad:bmm:workflows:*`（等同手動） | ✅ 格式正確 |
| 新視窗獨立環境 | `Remove-Item Env:CLAUDECODE` | ✅ 已隔離 |
| Phase 間等待 | **僅 3 秒**（filesystem sync） | ❌ **需改為 10-15 秒** |
| Workflow 完整性 | `-p` 模式偶爾走捷徑 | ❌ 需強化保障機制 |

**方案選項**（確保 BMAD workflow 完整執行）：

| 方案 | 做法 | 優點 | 缺點 |
|------|------|------|------|
| **A. `--append-system-prompt` 強制指令** ★ 採用 | 追加系統提示強制完整執行 + metadata 雙同步 | 不改架構，最小改動 | 增加少量 system prompt token |
| **B. 改用互動模式 + pipe** | `echo "/bmad:..." \| claude --model opus` | 更接近手動操作 | 需驗證 pipe 模式下 skill 載入行為 |
| **C. Prompt 內嵌 workflow 完整內容** | 將 BMAD instructions.xml 內容直接寫入 prompt | 保證內容載入 | Token 消耗大幅增加，違反減量目標 |
| **D. 事後 audit 補救** ★ 採用 | batch-audit.ps1 偵測並自動修復 | 架構穩定，兜底保障 | 事後修復，非事前預防 |

> **已驗證**：`--append-system-prompt` 可與 `-p` 模式併用（CLI Help 確認，兩參數互相獨立）。

**決策**：採用 **A + D 三層防護**（詳見上方「解決方案：三層防護」），預期失敗率從 15-20% 降至 < 1%。

### 需求 5：視窗開啟間隔 10-15 秒（防 Ban 機制）

**核心原則**：所有新 Claude 會話的開啟都必須間隔 10-15 秒，模擬人類手動操作節奏，避免短時間密集開啟被 Claude 服務端限流或 Ban。

**現有差距**：

| 間隔點 | 現況 | 需求 |
|--------|------|------|
| batch-runner 啟動 Story 之間 | 12 秒（`-IntervalSec 12`） | ✅ 已滿足 |
| story-pipeline 內 create → dev 之間 | **3 秒**（僅 filesystem sync） | ❌ **需改為 10-15 秒** |
| story-pipeline 內 dev → review 之間 | **3 秒** | ❌ **需改為 10-15 秒** |
| review 被退回後 dev-fix 重跑之間 | **3 秒** | ❌ **需改為 10-15 秒** |

**修改位置**（story-pipeline.ps1）：

```powershell
# 現行（L332, L358, L413）
Start-Sleep -Seconds 3   # Brief pause for file system sync

# 應改為
$PhaseInterval = 12   # 秒，可由參數 -PhaseIntervalSec 控制
Write-Log "Waiting ${PhaseInterval}s before next phase (rate-limit protection)..."
Start-Sleep -Seconds $PhaseInterval
```

**時序圖（修改後）**：

```
batch-runner 啟動 Story-A ─────────── 12s ─── 啟動 Story-B ─── 12s ─── ...
                │                                  │
                ▼                                  ▼
Story-A:  [create] ── 12s ── [dev] ── 12s ── [review]
Story-B:                 [create] ── 12s ── [dev] ── 12s ── [review]

每個 [...] = 獨立新視窗 Claude 會話
每個 ── Ns ── = 間隔等待（10-15 秒）
```

### 需求 6：每階段獨立新視窗確保 BMAD Workflow 完整載入

**核心原則**：create 完成後 → 關閉該視窗 → 等待 10-15 秒 → 開全新視窗執行 dev → 完成後關閉 → 等待 → 開全新視窗執行 review。**絕不在同一個 Claude 會話中連續執行多個階段**。

**現況分析**：

story-pipeline.ps1 **已符合此設計** — 每個 Phase 都透過 `Start-Process` 開啟獨立 PowerShell 視窗：

```
Phase 1 (create): Start-Process → 新 PowerShell 視窗 → claude -p "..." → 完成後視窗關閉
Phase 2 (dev):    Start-Process → 新 PowerShell 視窗 → claude -p "..." → 完成後視窗關閉
Phase 3 (review): Start-Process → 新 PowerShell 視窗 → claude -p "..." → 完成後視窗關閉
```

每個視窗是**完全獨立的 Claude 會話**，不共享上下文。

**但差距在於可靠性**：`claude -p` 一次性 prompt 模式下，BMAD workflow 載入的穩定度不如手動輸入。

**強化方案**（與需求 2 整合）：

```
現行 prompt 結構：
  claude -p "/bmad:bmm:workflows:create-story qgr-e7" --model opus

強化後 prompt 結構（方案 A）：
  claude -p "/bmad:bmm:workflows:create-story qgr-e7" --model opus \
    --append-system-prompt "你必須完整執行 BMAD workflow 的每一個步驟，
    包含：載入 instructions.xml → 逐步執行所有 Step →
    更新 Story 狀態 + sprint-status.yaml + tracking file + H1 emoji。
    禁止跳過任何 metadata 更新步驟。"
```

**驗證標準**（判斷 workflow 是否完整執行）：

| 檢查項 | 驗證方式 | 自動化 |
|--------|---------|--------|
| Story 狀態已更新 | 比對 sprint-status.yaml before/after | batch-audit Check 1 |
| Tracking file 已更新 | 檢查 active/*.track.md 最後修改時間 | batch-audit Check 6 |
| H1 emoji 正確 | 比對 emoji vs 狀態 | batch-audit Check 7 |
| CR 報告已建立（review） | 檢查 reviews/ 目錄 | batch-audit Check 5 |
| Story metadata 完整 | DEV Agent / Review Agent 欄位非空 | batch-audit Check 3 |

### 需求 3：模型配置（Create=Opus / Dev=Sonnet / Review=Opus）

**現況已滿足**：story-pipeline.ps1 已配置正確的模型分配。

```
story-pipeline.ps1:
├─ create-story  → claude -p "..." --model opus     (Opus 4.6)
├─ dev-story     → claude -p "..." --model sonnet   (Sonnet 4.6)
└─ code-review   → claude -p "..." --model opus     (Opus 4.6)
```

**原因**：
- **Opus 4.6 用於 create/review**：需要深度理解 Epic 結構、依賴項、架構決策、品質審查
- **Sonnet 4.6 用於 dev**：開發執行效率高、token 成本低、速度快

### 需求 4：Token 90% 安全閥（核心新功能）

**現況缺口**：目前僅有**事後偵測**（掃描 log 找 "You've hit your limit"），無**事前預防**。

**方案設計**：

#### 4A. Token 使用率偵測機制

```
偵測方式（按優先級排序）：

1. Claude API 回應 Header（最精準）
   - x-ratelimit-remaining-tokens / x-ratelimit-limit-tokens
   - 需 claude CLI 支援輸出此資訊 → 目前不直接暴露

2. claude --usage 指令（若 CLI 支援）
   - 查詢當前帳號 token 使用量
   - 需驗證 CLI 版本是否支援

3. 累積估算法（實際可行的方案） ★ 推薦
   - 每個 pipeline 階段完成後，解析 log 中的 token 使用量
   - 累積加總，對照已知的日配額計算使用率
   - 公式：usage% = (累積 tokens / 日配額) × 100

4. 錯誤模式偵測（最後防線）
   - 掃描 log 中的 "You've hit your limit"
   - 偵測到 → 立即標記為 100%，停止所有排程
```

#### 4B. 安全閥觸發流程

```
┌─────────────────────────────────────────────┐
│  Token 安全閥（90% 閾值）                     │
│                                             │
│  ▶ 觸發時機：                                │
│    - batch-runner 啟動前（Pre-launch Check）  │
│    - 每個 Story pipeline 啟動前              │
│    - 每個 Phase 完成後（Phase Gate Check）    │
│                                             │
│  ▶ 觸發動作：                                │
│    1. 輸出紅色警示標語：                      │
│       ╔══════════════════════════════════╗   │
│       ║  ⛔ TOKEN 安全閥已觸發              ║   │
│       ║  當前使用率：92.3%（超過 90% 閾值） ║   │
│       ║  剩餘配額不足以完成下一個任務        ║   │
│       ║  配額重置時間：18:00 Asia/Taipei   ║   │
│       ║  已停止排程，不再開啟新視窗          ║   │
│       ╚══════════════════════════════════╝   │
│    2. 不啟動任何新的 Claude 實例              │
│    3. 等待已啟動的實例自然完成（不強殺）      │
│    4. 回傳 exit code 99 給主視窗中控          │
│    5. 主視窗記錄待重跑清單 + 重置時間         │
└─────────────────────────────────────────────┘
```

#### 4C. 安全閥層級架構

| 層級 | 檢查點 | 觸發者 | 動作 |
|------|--------|--------|------|
| **L1 — Pre-batch** | batch-runner 啟動前 | `Test-TokenHealth` | 整批不啟動，exit 99 |
| **L2 — Pre-story** | 每個 Story pipeline 啟動前 | batch-runner 迴圈中檢查 | 不啟動該 Story，跳過 |
| **L3 — Phase Gate** | 每個 Phase 完成後 | story-pipeline `Test-PhaseGate` | 中止後續階段 |
| **L4 — 事後偵測** | 批次完成後 audit | batch-audit `Test-TokenExhaustion` | 標記受影響 Story |

---

## 六大需求總覽

| # | 需求 | 現況 | 差距 | 改動量 |
|---|------|------|------|--------|
| 1 | 主視窗 Claude 中控調度 | 可啟動 batch-runner | 需強化閉環決策迴圈 | 流程設計 |
| 2 | 子視窗完整執行 BMAD workflows | Prompt 格式正確 | `-p` 模式偶爾走捷徑 | +`--append-system-prompt` |
| 3 | 模型 Opus/Sonnet/Opus | **已滿足** | 無 | 0 |
| 4 | Token 90% 安全閥 | 僅事後偵測 | **核心缺口** — 需 4 層安全閥 | 新建 + 修改 |
| 5 | 視窗間隔 10-15 秒（防 Ban） | batch-runner 間 12s ✅ / Phase 間僅 3s ❌ | **Phase 間隔不足** | story-pipeline 小改 |
| 6 | 每階段獨立新視窗完整載入 | **已滿足**（每 Phase = 獨立 Start-Process） | 需搭配需求 2+5 強化可靠性 | 0（架構已正確） |

---

## 實作範圍分析

### 已完成（無需修改）

| 項目 | 滿足需求 |
|------|---------|
| story-pipeline.ps1 每 Phase 獨立新視窗（`Start-Process`） | 需求 6（獨立會話） |
| story-pipeline.ps1 純 BMAD prompt（`/bmad:bmm:workflows:*`） | 需求 2（完整 workflow） |
| story-pipeline.ps1 模型配置 Opus/Sonnet/Opus | 需求 3（模型分配） |
| batch-runner.ps1 Story 間隔 12 秒（`-IntervalSec 12`） | 需求 5（部分滿足） |
| 主視窗 `run_in_background` 啟動 batch | 需求 1（中控基礎） |
| 狀態自動判斷 + 超時保護 + Review 重試 | 需求 2（可靠性） |

### 需要新建

| 項目 | 對應需求 | 說明 |
|------|---------|------|
| **batch-audit.ps1** | 需求 1（中控決策依據） | 批次後驗證 + AutoFix，7 個 Check 函式（~320 行） |
| **Token 使用率追蹤** | 需求 4（90% 安全閥） | 累積估算 + 錯誤模式偵測 |

### 需要修改

| 項目 | 對應需求 | 修改內容 |
|------|---------|---------|
| **story-pipeline.ps1** | 需求 4 + 5 + 2 | Phase 間隔 3s→12s、`Test-PhaseGate` Token 閘門、`--append-system-prompt` 強制 workflow 完整性（+50 行） |
| **batch-runner.ps1** | 需求 4 | `Test-TokenHealth` L1/L2 安全閥 + TOKEN-LIMIT 分類（+70 行） |

### 修改細節：story-pipeline.ps1

```diff
# ── 需求 5：Phase 間隔改為 10-15 秒 ──
- Start-Sleep -Seconds 3   # Brief pause for file system sync  (L332, L358, L413)
+ $PhaseInterval = 12       # 新增參數 -PhaseIntervalSec，預設 12
+ Write-Log "Waiting ${PhaseInterval}s before next phase (rate-limit protection)..."
+ Start-Sleep -Seconds $PhaseInterval

# ── 需求 2：強化 BMAD workflow 完整性 ──
  在 Invoke-Phase 的 claude 呼叫中加入 --append-system-prompt：
+ --append-system-prompt "你必須完整執行 BMAD workflow 每一步驟，
+   包含 metadata 更新（Story 狀態 + sprint-status.yaml + tracking + emoji）。
+   禁止跳過任何步驟。"

# ── 需求 4：Phase Gate Token 檢查 ──
+ function Test-PhaseGate { ... }   # 掃描 log 偵測 Token 耗盡
+ 在 Invoke-Phase return 前加入閘門檢查
```

---

## 待釐清事項

### Q1：Token 配額數值如何取得？

Claude Max 方案的日配額資訊目前無公開 API 可查。可能方案：

| 方案 | 可行性 | 精度 |
|------|--------|------|
| A. 手動設定日配額上限（Config 參數） | ✅ 立即可行 | 中 — 需人工維護 |
| B. 解析 claude CLI 輸出的 token 統計 | ⚠️ 需驗證 | 高 |
| C. 監控 API 回應的 rate-limit header | ❌ CLI 不暴露 | 最高 |
| D. 計算每批次估算成本 × 剩餘批次數 | ✅ 可行 | 低 |

**建議**：採用 **A + 錯誤模式偵測** 組合：
- 設定 `-DailyTokenLimit` 參數（預設值基於方案等級）
- 每個 Phase 完成後累積 token 使用量
- 達 90% → 預警停止
- 偵測到 "You've hit your limit" → 100% 強制停止

### Q2：安全閥觸發後的待重跑清單如何持久化？

| 方案 | 說明 |
|------|------|
| A. 寫入 batch-audit JSON | 與 audit 結果合併，主控讀取後決定 |
| B. 寫入 sprint-status.yaml 註解 | 簡單但不結構化 |
| C. 獨立 `token-safety-queue.json` | 最清晰，支援跨 session 恢復 |

### ~~Q3：`--append-system-prompt` 是否在 `-p` 模式下可用？~~ ✅ 已解答

**結論**：可以。CLI Help 確認兩參數互相獨立，`--append-system-prompt` 追加至現有 System Prompt（保留 CLAUDE.md + constitutional-standard），不會覆蓋。

---

## 交付物清單

| # | 檔案 | 動作 | 說明 |
|---|------|------|------|
| 1 | `scripts/batch-audit.ps1` | **新建** | 7 Check + AutoFix + JSON 輸出（~320 行） |
| 2 | `scripts/story-pipeline.ps1` | **修改** | Phase 間隔 12s + `--append-system-prompt` + `Test-PhaseGate`（+50 行） |
| 3 | `scripts/batch-runner.ps1` | **修改** | `Test-TokenHealth` + L1/L2 安全閥 + TOKEN-LIMIT 分類（+70 行） |

---

## 實戰驗證：Batch 4 測試（2026-03-01）

### 測試配置

| 項目 | 值 |
|------|-----|
| 批次模式 | Custom（`-StoryIds @('qgr-s6','qgr-m10','qgr-s7')`） |
| Story 間隔 | 12 秒 |
| 每階段超時 | 45 分鐘 |
| 總耗時 | 00:29:24 |

### 結果

| Story | 初始狀態 | 最終狀態 | 實際結果 | 耗時 |
|-------|---------|---------|---------|------|
| qgr-s6 | in-progress | done | CR:86, 41 tests | 00:21:24 |
| qgr-m10 | in-progress | done | CR:100, 5 fixed | 00:13:00 |
| qgr-s7 | ready-for-dev | done | CR:100, 0 fixed | 00:28:55 |

**結論**：三個 Story 全部成功完成（all → done），驗證 Pipeline 三層防護與 batch-runner 核心流程可行。

### 發現的 Bug（已修正）

Batch 4 測試中 qgr-s6 與 qgr-m10 被**錯誤分類為 TOKEN-LIMIT**（實際已成功完成）。根因分析揭露兩個 Bug，詳見下方「Bug 修正紀錄」。

---

## Bug 修正紀錄

### Bug 1：Write-Log Pipeline 洩漏（batch-runner.ps1）

**發現時間**：2026-03-01 Batch 4 測試後
**影響**：`Test-TokenHealth` 返回值被污染，安全閥判斷失效

**根因分析**：

```
batch-runner.ps1 的 Write-Log 函式使用 Write-Output 輸出日誌行。
在 PowerShell 中，Write-Output 產生的值會進入 pipeline（函式返回值流）。

當 Test-TokenHealth 內部呼叫 Write-Log 時：
  Write-Log "TOKEN SAFETY: ..."   # 產生 pipeline 輸出
  return $false                    # 預期返回 $false

實際返回值：@("[$timestamp] [ERROR] TOKEN SAFETY: ...", $false)
→ 這是一個陣列（truthy），在 Boolean 判斷中 = $true
→ 安全閥永遠被繞過 ❌
```

**修正**：

```diff
function Write-Log {
    param([string]$Msg, [string]$Level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Msg"
-   Write-Output $line                # ❌ 污染 pipeline
+   $color = switch ($Level) {
+       "ERROR" { "Red" }
+       "WARN"  { "Yellow" }
+       "OK"    { "Green" }
+       default { "White" }
+   }
+   Write-Host $line -ForegroundColor $color  # ✅ 不進入 pipeline
    $line | Out-File -Append -FilePath $LogFile -Encoding UTF8
}
```

**教訓**：PowerShell 函式中所有 `Write-Output`（或未捕獲的表達式）都會進入 pipeline 返回值流。在需要明確返回值的函式中，必須使用 `Write-Host` 輸出日誌。

---

### Bug 2：Test-TokenHealth 掃描歷史 Log 導致誤判（batch-runner.ps1）

**發現時間**：2026-03-01 Batch 4 測試後
**影響**：舊批次 log 中的 rate-limit 字串觸發誤報，正常 Story 被標記為 TOKEN-LIMIT

**根因分析**：

```
原始 Test-TokenHealth 掃描 logs/ 目錄下所有 claude-*.log：

  $recentLogs = Get-ChildItem -Path $LogDir -Filter "claude-*.log"

logs/ 目錄累積了過去所有批次的 log 檔案。
當歷史 log 中包含 "You've hit your limit" 等 rate-limit 字串時：
  → Test-TokenHealth 誤判為當前批次 Token 耗盡
  → $Script:TokenExhausted = $true
  → 後續所有 Story 被阻擋 ❌
```

**使用者指正**：

> 「將 Test-TokenHealth 的 log 掃描變更為當前批次與原本的全目錄有什麼差異，若之後更換 EPIC story 是不是又會變更，這個問題應該是要將目錄改為動態而不是固定的吧？」

**決策**：採用**時間過濾**（而非名稱/目錄過濾），確保 Epic 無關性：

| 檢查點 | 時間窗口 | 原因 |
|--------|---------|------|
| `pre-batch` | 當前時間前 1 小時 | 偵測近期是否已有 Token 耗盡事件 |
| `pre-story` | `$StartTime`（批次啟動時間）起算 | 只看本批次內的 log |
| L4 事後掃描 | `$StartTime` 起算 | 只分析本批次產生的 log |

**修正**：

```diff
function Test-TokenHealth {
    param([string]$CheckPoint = "pre-story")
    ...
+   # 時間過濾：pre-batch=1小時窗口, pre-story/L4=批次啟動後
+   $cutoffTime = switch ($CheckPoint) {
+       "pre-batch" { (Get-Date).AddHours(-1) }
+       default     { $StartTime }
+   }
+
-   $recentLogs = Get-ChildItem -Path $LogDir -Filter "claude-*.log"
+   $recentLogs = Get-ChildItem -Path $LogDir -Filter "claude-*.log" -ErrorAction SilentlyContinue |
+       Where-Object { $_.LastWriteTime -ge $cutoffTime } |
+       Sort-Object LastWriteTime -Descending
    ...
}
```

**教訓**：Log 掃描必須以**時間**為過濾維度（動態），而非以檔名模式或固定目錄為過濾維度（靜態），否則更換 Epic 或 Story 命名規則時會失效。

---

### 安全閥層級架構（修正後）

| 層級 | 檢查點 | 時間窗口 | 觸發者 | 動作 |
|------|--------|---------|--------|------|
| **L1 — Pre-batch** | batch-runner 啟動前 | 前 1 小時 | `Test-TokenHealth("pre-batch")` | 整批不啟動，exit 99 |
| **L2 — Pre-story** | 每個 Story 啟動前 | 批次啟動後 | `Test-TokenHealth("pre-story")` | 不啟動該 Story，標記 TOKEN-LIMIT |
| **L3 — Phase Gate** | 每個 Phase 完成後 | Phase log 全文 | `Test-PhaseGate` (story-pipeline) | 中止後續階段 |
| **L4 — 事後偵測** | 批次完成後 | 批次啟動後 | batch-runner 結果分類 | 標記受影響 Story |

---

## Change Log

| 日期 | 變更 | 作者 |
|------|------|------|
| 2026-03-01 | Story 建立（來源：Batch 2-4 Pipeline 缺陷 + Token 耗盡事故） | CC-OPUS |
| 2026-03-01 | 從 Epic QGR 移出至「Claude 智能中控自動化排程」資料夾 | CC-OPUS |
| 2026-03-01 | 重構為需求分析文件：聚焦 4 大需求（中控/完整 workflow/模型配置/Token 安全閥），對照現有基礎設施分析差距 | CC-OPUS |
| 2026-03-01 | 新增需求 5（視窗間隔 10-15s 防 Ban）+ 需求 6（每階段獨立新視窗完整載入 BMAD），更新六大需求總覽表 | CC-OPUS |
| 2026-03-01 | 新增「`-p` 模式不完整載入根因深度分析」：三層根因（context 壓力→auto-skip→模型自適應）、成功/失敗差異表、三層防護方案、Q3 已驗證可用 | CC-OPUS |
| 2026-03-01 | 實作完成：(1) batch-audit.ps1 新建 7 Check + AutoFix + JSON ~280 行 (2) story-pipeline.ps1 +60 行：Phase 間隔 12s + --append-system-prompt + Test-PhaseGate (3) batch-runner.ps1 +80 行：Test-TokenHealth 4 層安全閥 + TOKEN-LIMIT + exit 99 | CC-OPUS |
| 2026-03-01 | Batch 4 測試（S6/M10/S7）：3/3 全部成功完成（all → done），驗證三層防護可行 | CC-OPUS |
| 2026-03-02 | Bug 修正：(1) Write-Log `Write-Output` → `Write-Host` 修復 pipeline 洩漏 (2) Test-TokenHealth 改為時間過濾（pre-batch=1hr / pre-story=$StartTime），消除歷史 log 誤判 | CC-OPUS |
