# 多 Agent 並行執行策略 — Commit、檔案鎖定與 Worktree

> **建立者**: CC-OPUS（Party Mode 討論）
> **建立日期**: 2026-02-27 21:18
> **參與角色**: Winston (Architect) + Amelia (Dev) + Bob (SM)
> **狀態**: 策略定案，待 TRS-31~33 執行
> **關聯文件**: `claude token減量策略研究分析/multi-engine-collaboration-strategy.md`

---

## 一、問題背景

MyProject 專案使用四引擎（Claude Code CLI + Gemini CLI + Antigravity IDE + Rovo Dev CLI）協作開發，且經常**同一引擎多開**（如 5 個 CC-OPUS 同時執行不同 Story）。Party Mode 討論中識別出三個核心風險：

1. **Commit Token 成本** — Agent 在 commit 過程中消耗的 token
2. **多 Agent 同時 Commit** — Staging area 污染、index.lock 衝突
3. **同時讀寫同一檔案** — 靜默覆蓋、檔案損壞

---

## 二、三層解決架構

### 架構總覽

```
Layer 1: Worktree 隔離（解決同引擎多開）
  └── 每個 Agent 實例在獨立目錄工作，檔案不共享

Layer 2: File Lock 機制（解決跨引擎同目錄協作）
  └── .agent-locks.json 動態追蹤 + Hooks 自動攔截

Layer 3: Total Commit 模式（解決 commit 衝突與 token 浪費）
  └── Agent 不 commit，人工決定 commit 時機
```

### 場景 × 策略對應表

| 場景 | 推薦策略 | 原因 |
|------|---------|------|
| 5×CC-OPUS 並行推進 Sprint | **Worktree** | 同引擎共享 Agent ID，File Lock 無法區分實例 |
| CC + GC + AG + RD 跨引擎 | **Total Commit + File Lock** | 各引擎有不同 Agent ID，Lock 可正確區分 |
| 混合（2×CC + 1×GC + 1×AG） | **CC 用 Worktree + GC/AG 用 File Lock** | 分層處理 |

---

## 三、Layer 1 — Git Worktree 並行隔離

### 3.1 核心概念

Git Worktree 在同一個 repository 中建立多個獨立工作目錄，每個目錄 checkout 不同 branch，共享 `.git` 物件資料庫但檔案完全隔離。

```
主目錄:  MyProject-MVP/
          ├── .git/                    (共享的 git 資料庫)
          └── .claude/worktrees/
              ├── ba-3/                (實例 1 的獨立工作區，branch: story/ba-3)
              ├── ba-6/                (實例 2 的獨立工作區，branch: story/ba-6)
              ├── ba-9/                (實例 3 的獨立工作區，branch: story/ba-9)
              ├── a10-3/               (實例 4 的獨立工作區，branch: story/a10-3)
              └── d3/                  (實例 5 的獨立工作區，branch: story/d3)
```

### 3.2 操作 SOP

#### 建立 Worktree（每個 Story 只做一次）

```powershell
# 方法 1: Claude Code 內建指令（會觸發一次 GitHub 認證）
claude -w ba-3

# 方法 2: 手動建立（不觸發 GitHub 認證）
git worktree add .claude/worktrees/ba-3 -b story/ba-3 HEAD
cd .claude/worktrees/ba-3
claude
```

#### 5 Agent 並行場景完整操作

```powershell
# === 開 5 個 PowerShell 視窗 ===

# 視窗 1
claude -w ba-3
# 視窗 2
claude -w ba-6
# 視窗 3
claude -w ba-9
# 視窗 4
claude -w a10-3
# 視窗 5
claude -w d3
```

#### 重新進入已存在的 Worktree（不會觸發 GitHub 認證）

```powershell
cd C:\Users\Alan\Desktop\Projects\MyProject-MVP\.claude\worktrees\ba-3
claude              # 新對話
claude --resume     # 接續上次對話
```

#### Worktree 內的 Commit 策略

**Worktree 內可以自由 commit**，因為每個 worktree 有獨立的 staging area 和 branch，互不干擾。

```
Worktree 內 Commit = 零風險
  → 不會 staging 污染（各自獨立）
  → 不會 index.lock 衝突（不同目錄）
  → 不會覆蓋其他 Agent 的工作（檔案隔離）
```

#### 完成後統一 Merge

```powershell
# 回到主目錄
cd C:\Users\Alan\Desktop\Projects\MyProject-MVP

# 依序 merge 各 branch
git merge story/ba-3
git merge story/ba-6    # ← Program.cs DI 註冊行衝突，保留兩邊即可
git merge story/ba-9    # ← 同上
git merge story/a10-3
git merge story/d3

# 清理 worktree
git worktree remove .claude/worktrees/ba-3
git worktree remove .claude/worktrees/ba-6
git worktree remove .claude/worktrees/ba-9
git worktree remove .claude/worktrees/a10-3
git worktree remove .claude/worktrees/d3
```

### 3.3 Worktree 生命週期

| 退出情境 | 行為 |
|---------|------|
| `/exit` 且無任何改動 | 自動刪除 worktree + branch |
| `/exit` 且有改動，選 `Remove worktree` | 刪除（改動丟失） |
| `/exit` 且有改動，選 `Keep worktree` | 保留在磁碟上，可重新進入 |
| 手動清理 | `git worktree remove .claude/worktrees/<name>` |
| 查看所有 worktree | `git worktree list` |

### 3.4 為什麼同引擎多開「必須」用 Worktree

| 問題 | 同目錄多開 | Worktree 多開 |
|------|:---:|:---:|
| Agent ID 相同（File Lock 失效） | ❌ | ✅ 不需要 Lock（檔案隔離） |
| 共享 staging area（互相污染） | ❌ | ✅ 各自獨立 |
| `git checkout` 影響所有實例 | ❌ | ✅ 各自獨立 branch |
| 同時寫同一檔案（靜默覆蓋） | ❌ | ✅ 各自有副本 |

---

## 四、Layer 2 — 動態 File Lock 機制

> **適用場景**：跨引擎在同一目錄協作（CC + GC + AG + RD 各一個）

### 4.1 架構設計

```
.agent-file-policy.yaml    ← 靜態宣告：哪些檔案是 hot file
.agent-locks.json           ← 動態登記簿：哪個 Agent 正在寫哪個檔案
scripts/file-lock-check.ps1    ← Hook 觸發：寫入前檢查
scripts/file-lock-acquire.ps1  ← Hook 觸發：寫入時登記
scripts/file-lock-release.ps1  ← 手動/自動：完成後釋放
```

### 4.2 靜態政策宣告 `.agent-file-policy.yaml`

```yaml
# .agent-file-policy.yaml — 檔案並發政策宣告
# 所有 Agent 在操作前必須讀取此檔案

hot_files:
  # === 致命衝突區（任一時刻僅一個 writer） ===
  - pattern: "src/**/Program.cs"
    policy: exclusive_write
    reason: "DI 註冊集中點，多 Agent 同時修改必衝突"

  - pattern: "src/**/ApplicationDbContext.cs"
    policy: exclusive_write
    reason: "DbSet 集中點"

  - pattern: "src/**/ApplicationDbContextModelSnapshot.cs"
    policy: exclusive_write
    reason: "EF 自動生成，無法手動 merge"

  - pattern: "sprint-status.yaml"
    policy: exclusive_write
    reason: "四引擎唯一狀態真相來源"

  # === 高衝突區（同領域序列化） ===
  - pattern: "src/**/Controllers/Admin/ApiKeyManagement*"
    policy: domain_lock
    domain: "api-key-admin"
    reason: "A10-3/A10-4/A10-6 共用"

  - pattern: "src/**/Services/Business/*"
    policy: domain_lock
    domain: "business-api"
    reason: "BA-3/BA-6/BA-9 共用 namespace"

  # === 安全區（可自由並行） ===
  - pattern: "src/**/Views/**"
    policy: free

  - pattern: "tests/**"
    policy: free

  - pattern: "docs/**"
    policy: free
```

### 4.3 動態鎖定登記簿 `.agent-locks.json`

```json
{
  "version": 1,
  "locks": [
    {
      "file": "src/MyProject.Web/Program.cs",
      "agent": "CC-SONNET",
      "story": "QGR-BA-3",
      "type": "write",
      "acquired": "2026-02-27T18:00:00+08:00",
      "ttl_minutes": 30
    }
  ]
}
```

**設計決策：**

| 決策 | 選擇 | 原因 |
|------|------|------|
| 鎖定粒度 | 檔案級 | Story 級太粗，行級太細 |
| TTL（存活時間） | 30~60 分鐘自動過期 | 防止 Agent 崩潰後死鎖 |
| 讀鎖 vs 寫鎖 | 只鎖寫入，讀取自由 | 多 Agent 同時讀取完全安全 |
| 衝突行為 | 警告但不阻斷 | Agent 看到鎖定後自主決定先做其他事 |

### 4.4 跨引擎 Hook 配置

#### Claude Code — `.claude/settings.json`

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{
          "type": "command",
          "command": "powershell -File scripts/file-lock-check.ps1 -AgentId CC-OPUS",
          "timeout": 5000
        }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{
          "type": "command",
          "command": "powershell -File scripts/file-lock-acquire.ps1 -AgentId CC-OPUS",
          "timeout": 5000
        }]
      }
    ]
  }
}
```

#### Gemini CLI — `.gemini/settings.json`

```json
{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": "write_file|edit_file|replace_in_file",
        "hooks": [{
          "type": "command",
          "command": "powershell -File scripts/file-lock-check.ps1 -AgentId GC-PRO",
          "name": "FileLockCheck",
          "timeout": 5000
        }]
      }
    ],
    "AfterTool": [
      {
        "matcher": "write_file|edit_file|replace_in_file",
        "hooks": [{
          "type": "command",
          "command": "powershell -File scripts/file-lock-acquire.ps1 -AgentId GC-PRO",
          "name": "FileLockAcquire",
          "timeout": 5000
        }]
      }
    ]
  }
}
```

#### Antigravity IDE — `.agent/rules/file-lock-awareness.md`

```markdown
# File Lock 感知規則（Always On）

在修改任何 .cs / .ts / .yaml 檔案前，必須：
1. 讀取專案根目錄的 `.agent-locks.json`
2. 檢查目標檔案是否有其他 Agent 的寫入鎖
3. 如有鎖定且未過期 → 暫停此檔案的修改，先處理其他任務
4. 如無鎖定 → 執行 file-lock-acquire.ps1 後再寫入
5. Story 完成時 → 執行 file-lock-release.ps1 釋放所有鎖定
```

#### Rovo Dev CLI — Charter 配置注入同樣規則

### 4.5 Lock 腳本規格（待 TRS-32 實作）

| 腳本 | 功能 | 關鍵機制 |
|------|------|---------|
| `file-lock-check.ps1` | 寫入前檢查鎖定狀態 | 清理過期鎖 → 正規化路徑 → 比對 Agent ID |
| `file-lock-acquire.ps1` | 寫入時登記鎖定 | Mutex 防止 lock 檔本身的 race condition |
| `file-lock-release.ps1` | 完成後釋放鎖定 | 支援按 Agent/Story/FilePath 三種粒度釋放 |

---

## 五、Layer 3 — Total Commit 模式

> **適用場景**：跨引擎在同一目錄協作，且不使用 Worktree

### 5.1 核心規則

```
所有 Agent 只做 Read + Edit/Write，不做 git add / git commit / git push
例外：sprint-status.yaml 和 tracking file 允許 Agent 直接更新（但不 commit）
```

### 5.2 Commit 流程

```
1. 多個 Agent 完成各自的 Story 任務（只改檔案，不 commit）
2. Alan 決定 commit 時機 → 開任意 Agent 作為 Committer
3. Committer Agent 執行：
   a. git status（查看所有 dirty files）
   b. 讀取 sprint-status.yaml 確認哪些 Story 完成
   c. 按 Story 分組 git add + git commit：
      git add <BA-3 相關檔案> && git commit -m "feat(QGR-BA-3): API 政策勾稽 Modal"
      git add <BA-9 相關檔案> && git commit -m "feat(QGR-BA-9): API 認證中介層"
   d. 執行 check-hygiene.ps1
   e. 更新 tracking file
```

### 5.3 優勢與風險

| 優勢 | 說明 |
|------|------|
| 零 staging 污染 | 沒有 Agent 執行 `git add`，不會互相污染 |
| 零 index.lock 衝突 | 沒有 Agent 執行 `git commit`，不會鎖檔 |
| 省 Token | 省掉每個 Agent 的 diff 分析 + commit message 生成 |
| 人工檢查點 | Alan 決定 commit 時機，等於手動 review gate |

| 風險 | 嚴重度 | 緩解方案 |
|------|:---:|------|
| Agent 崩潰無 checkpoint | 🟠 | 各引擎自有保護：Gemini Shadow Git / AG 撤銷 / CC `/undo` |
| 同檔案覆蓋 | 🔴 | 搭配 File Lock 機制（Layer 2） |
| 大量 uncommitted changes | 🟡 | 每 1~2 個 Story 做一次 Total Commit |

### 5.4 何時用 Total Commit vs Worktree

| 條件 | 策略 |
|------|------|
| 同引擎多開（5×CC） | **Worktree**（必須），Agent 在 worktree 內自由 commit |
| 跨引擎同目錄（CC+GC+AG+RD） | **Total Commit + File Lock** |
| 單 Agent 獨立工作 | 自由 commit，無需任何額外機制 |

---

## 六、Commit 與 Token 消耗分析

### 6.1 Commit 過程的 Token 消耗拆解

| 動作 | 是否消耗 Token | 預估 Token 數 |
|------|:---:|:---:|
| `git add` + `git commit`（shell 指令） | ❌ | 0 |
| Agent 讀取 `git diff` 分析變更 | ✅ | ~500-5,000 |
| Agent 生成 commit message | ✅ | ~200-500 |
| Agent 讀取 `git status` 驗證 | ✅ | ~100-300 |
| `check-hygiene.ps1` | ✅（若觸發 AI 分析） | 依規模 |

### 6.2 各引擎 Commit Token 成本差異

| 引擎 | Token 成本 | 建議 |
|------|-----------|------|
| GC-PRO (Gemini CLI) | 免費（Google AI Studio API Key） | dev-story commit 交給 GC-PRO |
| CC-OPUS (Claude Code) | 付費（Claude Max / API Key） | 給明確 commit message 避免分析開銷 |
| AG (Antigravity) | 依模型（Gemini 免費 / Claude 付費） | 選用 Gemini 模型做 commit |
| RD (Rovo Dev CLI) | 點數制（Haiku 0.4x 最便宜） | 可作為低成本 Committer |

---

## 七、推進樹狀圖並行衝突分析

> 基於 `EPIC-QGR推進樹狀圖.md` 方案 A（5 Agent 並行）的衝突處理

### 7.1 Hot File 衝突矩陣

| 檔案 | 哪些 Story 會修改 | 衝突策略 |
|------|-----------------|---------|
| `Program.cs`（DI 註冊） | BA-3, BA-6, BA-9 | Worktree 隔離 → merge 時解衝突（加行即可） |
| `ApplicationDbContext.cs` | BA-3（若加 DbSet） | Worktree 隔離 |
| `sprint-status.yaml` | 所有 Story | 每個 worktree 有副本，merge 時以最新為準 |
| `ApiKeyManagementController.cs` | A10-3, A10-4, A10-6 | 序列執行（推進樹已標記 🔴） |

### 7.2 Worktree 下的 5 Agent 運行時行為

```
Agent 1 (worktree/ba-3):
  → 修改自己副本的 Program.cs（加 DI）
  → 修改自己副本的 ApplicationUser.cs
  → commit 到 story/ba-3 branch → 完成

Agent 2 (worktree/ba-6):
  → 修改自己副本的 Program.cs（加 DI）← 不衝突！各自的副本
  → 新建 ConnectorProxyService.cs
  → commit 到 story/ba-6 branch → 完成

Agent 3 (worktree/ba-9):
  → 修改自己副本的 Program.cs（加 DI）← 不衝突！
  → 新建 BusinessApiAuthMiddleware.cs
  → commit 到 story/ba-9 branch → 完成

Agent 4 (worktree/a10-3): 不碰 hot file → 完全獨立
Agent 5 (worktree/d3):    不碰 hot file → 完全獨立

Merge 時 Program.cs 衝突範例：
  <<<<<<< story/ba-3
  builder.Services.AddScoped<IApiPolicyService, ApiPolicyService>();
  =======
  builder.Services.AddScoped<IConnectorProxyService, ConnectorProxyService>();
  >>>>>>> story/ba-6

  解法：兩邊都保留（DI 註冊行無邏輯依賴）
```

---

## 八、TRS Story 規劃

| Story ID | 標題 | 複雜度 | 優先級 | 依賴 | 交付物 |
|----------|------|:---:|:---:|------|--------|
| **TRS-31** | 多 Agent 並行執行策略報告（本文件） | S | P1 | 無 | 本 .md 文件 + 部署必讀 README 更新 |
| **TRS-32** | File Lock 機制實作 | M | P1 | TRS-31 | 3 個 PS1 腳本 + .agent-file-policy.yaml + 4 引擎 Hook 配置 |
| **TRS-33** | Worktree 並行 SOP + 部署整合 | S | P1 | TRS-31 | 部署手冊更新 + Worktree 使用指南 + merge 衝突 SOP |

---

## 九、與現有文件的關係

| 文件 | 關係 |
|------|------|
| `multi-engine-collaboration-strategy.md` §3.2 | 本文件的 Layer 1/3 延伸了 §3.2 四階段 SOP |
| `multi-engine-collaboration-strategy.md` §5.5 | 建議新增陷阱 #7：多 Agent 並行寫入同一檔案 |
| `EPIC-QGR推進樹狀圖.md` 衝突風險矩陣 | 本文件 §7 提供了 Worktree 下的具體解決方案 |
| `開發前環境部署_v3.0.0.md` | TRS-33 將 Worktree SOP 整合至部署手冊 |

---

## 十、Tech Debt Registry 與多 Agent 協作

> **關聯**: `/example-debt-registry` Skill v1.0.0 | TRS-34

### 10.1 registry.yaml 作為 Hot File

`tech-debt/registry.yaml` 是技術債中央索引，多 Agent 同時執行 code-review 時會觸發 Push 模式寫入。

**已納入 `.agent-file-policy.yaml`**:

```yaml
- pattern: "docs/implementation-artifacts/tech-debt/registry.yaml"
  policy: exclusive_write
  reason: "Tech debt central registry - concurrent code-review Push conflicts"
```

**衝突場景與策略**:

| 場景 | 策略 |
|------|------|
| 5×CC-OPUS Worktree 並行 code-review | 各 worktree 有 registry.yaml 副本，**merge 時合併 entries**（ID 唯一不衝突） |
| CC + GC 跨引擎同目錄 code-review | File Lock exclusive_write 保護，序列寫入 |
| 單一 Agent code-review | 無衝突，直接寫入 |

### 10.2 Sidecar 檔案的隔離策略

| 模式 | Sidecar 行為 |
|------|-------------|
| Worktree | 各 worktree 獨立建立 sidecar，merge 時以 story/branch 版本為準（sidecar 以 source_story 命名，不同 Story 不衝突） |
| 同目錄 File Lock | Sidecar 檔名含 source_story key，各 Agent 寫不同檔案，天然不衝突 |
| Total Commit | 同上，sidecar 檔案互不干擾 |

### 10.3 三種模式的多 Agent 行為

| Mode | 讀/寫 | 並發安全 | 需 File Lock? |
|------|:-----:|:--------:|:---:|
| **Push** (code-review) | 寫 registry + 寫 sidecar | registry 需保護，sidecar 天然安全 | ✅ registry 需要 |
| **Pull** (create-story/dev-story) | 讀 registry + 讀 sidecar | 只讀，完全安全 | ❌ |
| **Audit** (retrospective/party) | 讀 registry + 讀 CR 報告 → 寫 registry（補登錄） | 建議單 Agent 執行 | ✅ 補登錄時需要 |

### 10.4 Merge 後的 registry 合併 SOP

```
Worktree merge registry.yaml 衝突時：

1. 兩邊的 entries 全部保留（不同 source_story → 不同 ID）
2. last_updated 取較晚的日期
3. 驗證：所有 entry ID 無重複
4. 驗證：所有 DEFERRED entry 的 sidecar 檔案存在
```

---

## 版本歷史

| 版本 | 日期 | 變更 |
|------|------|------|
| 1.0.0 | 2026-02-27 | 初版：Party Mode 討論成果彙整，三層架構定案 |
| 1.1.0 | 2026-02-28 | 新增 §10 Tech Debt Registry 與多 Agent 協作（TRS-34） |
