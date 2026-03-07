# TRS-17: Epic README 自動同步機制（PostToolUse Hook + 衍生視圖）

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-17 |
| **狀態** | done |
| **複雜度** | L |
| **優先級** | P1 |
| **建立時間** | 2026-02-25 09:17:58 |
| **最後更新** | 2026-02-25（邊界分析後修正設計） |
| **依賴** | TRS-0（.claudeignore 已建立） |
| **後續** | 無（獨立可交付） |
| **來源** | Epic QGR Group D 更新遺漏事故分析、全研究彙整報告 D 類 |
| **類型** | D 類（操作流程優化） |

---

## 目標

將 Epic README.md 從「Claude 手動維護的文件」轉變為「腳本自動生成的衍生視圖」，透過 Claude Code PostToolUse Hook 在 sprint-status.yaml 更新時自動觸發 PowerShell 腳本重新生成 README，實現 **零 Claude Token** 的 README 維護。

---

## 問題描述

### 事故觸發

2026-02-25 執行 QGR-E1 dev-story + code-review 後，發現 `epic-qgr/README.md` 的 Phase 1 Group D 狀態未同步更新（E1 已 Done 但 README 仍標記為進行中）。

### 根因分析

Epic README.md 存在 **靜態規劃 vs 動態追蹤混雜** 問題：

| 內容類型 | 範例 | 變更頻率 | 佔比 |
|---------|------|---------|------|
| 靜態（Charter） | 目標、Story 清單、依賴鏈 | 建立時一次 | ~40% |
| 半動態（策略） | 執行順序、執行策略 | Phase 切換時 | ~30% |
| 高動態（狀態） | Story 狀態 emoji、Done 計數、驗算 | 每完成一個 Story | ~30% |

每次 Story 完成都需要 Claude 花 ~4,300 tokens 讀取 + 更新 README：

| 操作 | Token 消耗 |
|------|:---------:|
| 讀取 README 全文（700 行） | ~3,500 |
| 分析並定位需更新位置 | ~300 |
| 執行 Edit 更新多處 | ~500 |
| **小計** | **~4,300** |

且人為遺漏風險高（README 有多處需同步：Story 總覽計數、完整盤點表、執行順序圖 Group 狀態、Phase 統計、驗算公式）。

---

## 設計方案

### 核心原則：常態零 Token + 例外邊際成本

```
常態路徑（~84 次/Epic）：Story 狀態變更
  sprint-status.yaml 更新 → Hook → 腳本自動生成 README → 零 token

例外路徑（~10-15 次/Epic）：結構變更（新 Story / 新 Group / CR 中繼資訊）
  Workflow 本身已在執行中（create-story / code-review）
  → 順手更新 epic-config.yaml → 邊際成本 ~200-300 tok
  → 由 Skill 規範更新規則，按需載入
```

### 架構圖

```
                    ┌─────────────────────────────────────┐
                    │      常態路徑（零 token）             │
                    │                                     │
sprint-status.yaml ─┤──(PostToolUse Hook)──→ sync-epic-readme.ps1
                    │                              │
                    │                    ┌─────────┴─────────┐
                    │                    │ 讀取                │
                    │              epic-config.yaml    sprint-status.yaml
                    │                    │                     │
                    │                    └─────────┬───────────┘
                    │                              │
                    │                        README.md（自動生成）
                    │                              │
                    │                        .claudeignore（Claude 不讀）
                    └─────────────────────────────────────┘

                    ┌─────────────────────────────────────┐
                    │    例外路徑（Workflow 邊際成本）        │
                    │                                     │
                    │  code-review 發現技術債               │
                    │    → 新建 Story（已有流程）            │
                    │    → 順手更新 epic-config.yaml         │
                    │       （Skill 觸發，+200 tok）        │
                    │                                     │
                    │  create-story / 需求變更               │
                    │    → 新建 Story + Group（已有流程）     │
                    │    → 順手更新 epic-config.yaml         │
                    │       （Skill 觸發，+300 tok）        │
                    └─────────────────────────────────────┘
```

### 檔案結構

```
docs/implementation-artifacts/stories/
├── epic-qgr/
│   ├── epic-config.yaml       ← 新建：靜態結構（建立 Epic 時一次寫入）
│   ├── README.md              ← 腳本自動生成（加入 .claudeignore）
│   └── (stories/*.md)
│
scripts/
└── sync-epic-readme.ps1       ← 新建：YAML→Markdown 生成器
│
.claude/skills/
└── epic-config-sync/SKILL.md  ← 新建：例外路徑規範 Skill
```

---

## Task 清單

### Task 1: 建立 `epic-config.yaml` 格式規範

靜態設定檔，每個 Epic 建立時一次寫入，僅腳本消費（Claude 不讀）：

```yaml
# epic-config.yaml — Epic 靜態結構定義
epic: qgr
title: "專案品質差距修復 (Quality Gap Repair)"
created: "2026-02-19"
source: "project-quality-gap-analysis-report.md v4.1"
objective: "系統性修復品質差距分析報告中識別的未實作功能"

# Story 中繼資訊（標題/複雜度/優先級）
stories:
  qgr-p0-1-ts-compilation-fix:
    title: "TypeScript 編譯錯誤修復"
    complexity: S
    priority: P0
  qgr-s1-csp-security-headers:
    title: "CSP + 安全 Headers 完善"
    complexity: S
    priority: P0
  # ... 所有 Story 定義

# Phase / Group 結構
phases:
  - id: skills
    name: "Skills Code Review"
    priority: P0
    groups:
      - id: sk
        name: "Skills 建立與補強"
        stories: [qgr-sk-1, qgr-sk-2, qgr-sk-3, qgr-sk-4, qgr-sk-5, qgr-sk-6, qgr-sk-7]

  - id: phase0
    name: "Phase 0: 編譯阻塞修復"
    priority: P0
    groups:
      - id: p0
        name: "編譯修復"
        stories: [qgr-p0-1-ts-compilation-fix]

  - id: phase1
    name: "Phase 1: P0 核心功能"
    priority: P0
    groups:
      - id: group-a
        name: "安全基礎"
        stories: [qgr-s1-csp-security-headers]
      - id: group-b
        name: "測試覆蓋"
        stories: [qgr-t1-admin-auth-service-tests, qgr-t2-pdf-generator-service-tests, qgr-t3-webhooks-controller-tests]
      - id: group-c
        name: "認證/金流鏈"
        stories: [qgr-m1-emailsender-sendgrid, qgr-m2-oauth-device-management, fra-1-refund-permission-downgrade, fra-2-pdf-page-limit-config, fra-4-purchase-policy-disclosure]
        dependencies: {fra-4: [fra-1]}
      - id: group-d
        name: "編輯器核心"
        parallel: true
        stories: [qgr-e1-orientation-switch, qgr-e2-copy-paste-shortcut]
      - id: group-e
        name: "PDF 引擎"
        parallel: true
        stories: [qgr-d1-pdf-worker-progress, qgr-d2-pdf-rate-limit-circuit-breaker]

  - id: phase2
    name: "Phase 2: P1 功能完善"
    priority: P1
    groups:
      - id: 2-a
        name: "會員平台"
        stories: [qgr-m3-forgot-password-page, qgr-m6-plan-upgrade-prorate, qgr-m7-ecpay-webhook-retry]
      # ... 2-B ~ 2-G

  - id: phase3
    name: "Phase 3: P2 持續改善"
    priority: P2
    groups:
      - id: 3-all
        name: "持續改善"
        stories: [qgr-m4-avatar-upload, qgr-m5-recaptcha-contact-form, ...]

# 執行策略（純文字，腳本原封不動輸出）
strategies:
  - title: "推進節奏"
    content: |
      1. Phase 0 立即啟動 — 解除建構阻塞
      2. Phase 1 分批推進 — Group A~E 互不相依
      3. Phase 2 依模組推進 — 2-A~2-G 按模組分群
      4. Phase 3 視產品需求排入

# 風險與注意事項（純文字）
risks:
  - "上下文管理: 每個 Story 在獨立對話視窗中完善"
  - "拆分判斷: 複雜度 L 以上 Story 可能需拆分"
```

### Task 2: 建立 `scripts/sync-epic-readme.ps1`

PowerShell 腳本功能：

1. **輸入判斷**: 接收 Hook 環境變數，僅當修改檔案為 `sprint-status.yaml` 時執行
2. **YAML 解析**: 以 regex 提取 sprint-status.yaml 中所有 `key: value` 行的 Story 狀態 + 行內註解中的 CR 中繼資訊
3. **Config 掃描**: 遍歷 `docs/implementation-artifacts/stories/epic-*/epic-config.yaml`
4. **狀態計算**:
   - 每 Group: Done/Total 計數 → Group 狀態 emoji
   - 每 Phase: 完成率百分比
   - 全域: Done/Review/Ready/In-Progress/Backlog/Cancelled 統計
5. **CR 中繼資訊解析**: 從 sprint-status.yaml 行內註解提取 CR Score、test 數、deferred 路由
   - 格式: `# P0, M — CR Score:81 (3M+2L, 4 Fixed, 1 Deferred), 15 tests`
   - Regex: `CR\s*(?:Score|R\d)?:(\d+).*?(\d+)\s*tests`
6. **Markdown 生成**: 輸出完整 README.md

### Task 3: 設定 Claude Code PostToolUse Hook

```jsonc
// .claude/settings.local.json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -ExecutionPolicy Bypass -File scripts/sync-epic-readme.ps1"
          }
        ]
      }
    ]
  }
}
```

腳本內部判斷：僅當修改檔案為 `sprint-status.yaml` 時執行同步，否則 `exit 0`。

### Task 4: 更新 `.claudeignore`

```
# Epic README — 由 sync-epic-readme.ps1 自動生成
docs/implementation-artifacts/stories/epic-*/README.md
```

### Task 5: 建立例外路徑 Skill — `epic-config-sync`

**設計原則**：所有會建立 Story 的 Workflow / Agent 模式，在寫入 sprint-status.yaml 後必須同步更新 epic-config.yaml。Skill 按需載入（非 Always-On），僅在觸發時消耗 token。

**觸發來源盤點（7 Workflow + 1 手動）**：

| # | 觸發來源 | 場景 | 頻率 |
|:-:|---------|------|:----:|
| 1 | **create-story** | 從 backlog 補全 Story，可能發現需拆分子 Story | 每 Story |
| 2 | **code-review** | 發現技術債 → 在原 Epic 新建 backlog Story | 每 3-5 Story |
| 3 | **auto-pilot** | 全自動串接 create→dev→review，批量建立 Story | 連續執行 |
| 4 | **party-mode** | 多 Agent 討論決議新增 Story / Group / Phase | 不定期 |
| 5 | **sprint-planning** | 初始化 Sprint，從 Epic 文件提取全部 Story | Epic 啟動時 |
| 6 | **correct-course** | Sprint 中途變更，新增 Story 因應調整 | 不定期 |
| 7 | **retrospective** | Epic 完成回顧，識別遺漏工作建議新 Story | Epic 結束時 |
| 8 | **手動（使用者）** | 中途修改/新增功能需求，直接建立 Story | 不定期 |

> **SM / PM / Analyst / Architect** 等 Agent 透過上述 Workflow 間接觸發，不需獨立列為觸發源。

**Skill 內容規範**：

```markdown
# epic-config-sync Skill

## 觸發關鍵字
epic-config, 新建 Story, 新增 Group, 結構變更, Epic README 更新,
backlog Story, 技術債路由, Sprint 變更, Story 拆分

## 核心規則
當任何 Workflow 或 Agent 在 sprint-status.yaml 中新增 Story 行時，
必須同步更新對應 Epic 的 epic-config.yaml。
README.md 由腳本自動生成，禁止手動編輯。

## 場景 A: 新建單一 Story
觸發: code-review 技術債路由 / create-story 拆分 / dev-story 發現遺漏
步驟:
1. 在 sprint-status.yaml 新增 Story 行（已有流程）
2. 在 epic-config.yaml → stories 區塊追加中繼資訊（title/complexity/priority）
3. 在 epic-config.yaml → 對應 Group.stories 陣列追加 Story ID
4. 若有依賴關係，在 Group.dependencies 區塊追加

## 場景 B: 新增整批 Story + 新 Group
觸發: party-mode 討論決議 / 使用者新增功能需求 / sprint-planning 初始化
步驟:
1. 在 sprint-status.yaml 批量新增 Story 行（已有流程）
2. 在 epic-config.yaml → 對應 Phase 新增 Group 區塊（id + name）
3. 在 epic-config.yaml → stories 區塊批量追加 Story 中繼資訊
4. 若有跨 Group 依賴，在 Phase 級別追加 dependencies
5. 若需要新 Phase，在 phases 陣列新增 Phase 區塊

## 場景 C: Story 依賴關係變更
觸發: correct-course 調整 / retrospective 發現遺漏依賴
步驟:
1. 在 epic-config.yaml → 對應 Group.dependencies 區塊新增/修改

## 場景 D: auto-pilot 連續執行
觸發: auto-pilot 自動串接 create→dev→review
步驟:
1. auto-pilot 每完成一輪 create-story 時檢查 epic-config.yaml 一致性
2. 若 sprint-status.yaml 有新 Story 但 config 未定義 → 執行場景 A
3. auto-pilot 不建立新 Group（結構變更需人工介入或 party-mode 決議）

## 驗證步驟（每次更新後執行）
1. 確認 sprint-status.yaml 中所有 Story ID 在 epic-config.yaml 中都有定義
2. 確認 epic-config.yaml 中所有 Story ID 在 sprint-status.yaml 中都有對應行
3. 若發現不一致 → 標記為孤兒（orphan）並在 README 末尾顯示警告

## 禁止事項
- ❌ 不得直接編輯 README.md（由腳本自動生成）
- ❌ 不得在 epic-config.yaml 中寫入動態狀態（status/cr_score）
- ❌ 不得刪除 epic-config.yaml 中既有的 Story 定義
- ❌ auto-pilot 模式下不得自動建立新 Group/Phase（需人工決議）
```

### Task 6: 驗證

1. **常態路徑測試**: 修改 sprint-status.yaml 中某 Story 狀態 → 確認 README 自動更新
2. **例外路徑測試**: 模擬 code-review 新建 Story → 確認 epic-config.yaml 更新 + README 反映
3. **Claude 隔離測試**: 確認 Claude 不讀取 README（.claudeignore 排除）
4. **一致性測試**: 生成的 README 與原手動維護版本在資訊完整度上等價

---

## 邊界場景覆蓋分析

### 設計原則

> 常態（高頻）走自動化零 token；例外（低頻）搭 Workflow 順風車，邊際成本極低。
> 所有會建立 Story 的 Workflow / Agent 模式都納入 Skill 觸發範圍。

### 按 Workflow 的覆蓋矩陣

| Workflow / Agent | 建立 Story 場景 | epic-config 更新方式 | Token 成本 |
|-----------------|----------------|-------------------|:---------:|
| **create-story** | 從 backlog 補全，可能拆分子 Story | Skill 場景 A（每次觸發） | ~200（邊際） |
| **code-review** | 技術債路由 → 新建 backlog Story | Skill 場景 A（僅有新 Story 時） | ~200（邊際） |
| **auto-pilot** | 全自動批量建立 + 開發 + 審查 | Skill 場景 D（每輪檢查一致性） | ~100/輪（邊際） |
| **party-mode** | 多 Agent 討論決議新增 Story/Group/Phase | Skill 場景 B（討論結束後批量更新） | ~300（邊際） |
| **sprint-planning** | 初始化 Sprint，提取全部 Story | Skill 場景 B（Epic 啟動時一次性） | ~500（一次性） |
| **correct-course** | Sprint 中途變更，新增 Story | Skill 場景 A 或 B | ~200-300（邊際） |
| **retrospective** | Epic 回顧識別遺漏，建議新 Story | Skill 場景 A 或 C | ~200（邊際） |
| **手動（使用者）** | 中途新增功能需求 | Skill 場景 A 或 B | ~200-300（邊際） |

### SM / PM / Agent 角色說明

SM、PM、Analyst、Architect、Dev、TEA 等 Agent 透過上述 Workflow **間接**觸發 Skill，不需獨立列為觸發源：
- **SM** → 透過 sprint-planning、correct-course、retrospective
- **PM** → 透過 party-mode、create-story（上下文提供）
- **Architect** → 透過 party-mode、correct-course（架構影響分析）
- **Dev** → 透過 dev-story（發現遺漏 → Follow-up 記錄）
- **TEA** → 透過 code-review（Issue 追蹤 → 技術債路由）

### 常態 vs 例外覆蓋摘要

| 路徑 | 頻率 | 處理機制 | Token 成本 | 遺漏風險 |
|------|:----:|---------|:---------:|:--------:|
| Story 狀態變更 | ~84 次/Epic | Hook + 腳本自動 | **0** | 無 |
| CR 中繼資訊（score/tests） | 每個 Done Story | sprint-status 行內註解 → 腳本解析 | **0** | 無 |
| 單一 Story 新建 | ~15-20 次/Epic | Workflow 中 + Skill 場景 A | ~200（邊際） | 極低 |
| 批量 Story + 新 Group | ~2-5 次/Epic | Workflow 中 + Skill 場景 B | ~300（邊際） | 極低 |
| 依賴關係變更 | ~5-10 次/Epic | Workflow 中 + Skill 場景 C | ~100（邊際） | 極低 |

### 三道安全網防止遺漏

1. **Skill 觸發**: 所有 7 個 Workflow + 手動場景都有明確的 Skill 場景對應，Claude 在 Workflow 執行中被引導更新 epic-config.yaml
2. **孤兒偵測**: `sync-epic-readme.ps1` 每次執行時比對 sprint-status.yaml vs epic-config.yaml，發現不一致則在 README 末尾標記 `⚠️ 孤兒 Story: {id}（未在 epic-config.yaml 中定義）`
3. **下次 Hook 觸發**: 即使某次漏更新 config，下次任何 Story 狀態變更都會觸發腳本重跑，孤兒偵測立即報告

---

## 驗收標準

- [x] `epic-config.yaml` 格式規範定義完成
- [x] Epic QGR 的 `epic-config.yaml` 建立（從現有 README 抽取靜態結構）
- [x] `scripts/sync-epic-readme.ps1` 腳本完成（含孤兒 Story 偵測）
- [x] 腳本可正確解析 sprint-status.yaml（regex 模式，無外部依賴）
- [x] 腳本可正確解析 sprint-status.yaml 行內註解的 CR 中繼資訊
- [x] 腳本可正確生成 README.md（含執行順序圖 + emoji 狀態 + 統計計數 + CR 明細）
- [x] Claude Code PostToolUse Hook 設定完成
- [x] Hook 僅在 sprint-status.yaml 變更時觸發（不影響其他 Edit/Write）
- [x] `.claudeignore` 已排除 `epic-*/README.md`
- [x] `epic-config-sync` Skill 建立完成（含四個場景的規範 A/B/C/D）
- [x] 常態路徑驗證：修改 sprint-status 狀態 → README 自動更新
- [ ] 例外路徑驗證：模擬新建 Story → epic-config 更新 → README 反映（需實際 Workflow 觸發）
- [ ] 孤兒偵測驗證：sprint-status 有但 config 沒有的 Story → README 標記警告（已內建，待實際觸發）

---

## 風險

- 🟡 中：PowerShell YAML 解析使用 regex 而非專用模組，sprint-status.yaml 格式變更可能破壞解析
  - 緩解：sprint-status.yaml 格式已穩定（flat key-value），且腳本有格式驗證
- 🟡 中：epic-config.yaml 初次建立需從現有 README 手動抽取，一次性成本
  - 緩解：僅需做一次，後續新 Epic 直接從模板建立
- 🟢 低：PostToolUse Hook 在每次 Edit/Write 時觸發判斷
  - 緩解：非 sprint-status.yaml 時直接 exit 0，overhead < 100ms
- 🟢 低：例外路徑 Skill 未載入導致 epic-config 未更新
  - 緩解：孤兒偵測機制會在下次 Hook 觸發時報告異常

---

## 預估效益

| 指標 | 改善前（手動） | 改善後（自動） | 節省 |
|------|:-------------:|:------------:|:----:|
| 常態：Claude 讀取+更新 README | ~4,300 tok/Story | **0** | -4,300 |
| 例外：新建 Story 更新 config | 0（不存在此流程） | ~200 tok（邊際） | +200 |
| 例外：新增 Group 更新 config | 0（不存在此流程） | ~300 tok（邊際） | +300 |
| 人為遺漏修復成本 | ~2,000 tok（不定期） | **0** | -2,000 |
| **每 Story 加權平均節省** | — | — | **~4,100 tok** |
| **67 Stories 總節省** | — | — | **~274,700 tok** |

### 額外質性效益

- README 與 sprint-status.yaml **100% 一致**（機器生成無人為錯誤）
- Prompt Caching **完全保護**（README 被 .claudeignore 排除）
- Group D 類型的遺漏事故 **徹底消除**
- 孤兒偵測提供**安全網**，即使例外路徑漏更新也能及時發現
- 未來新 Epic 只需建 `epic-config.yaml`，README 自動產生

---

## 與其他 TRS Story 的關係

| 關聯 Story | 關係 | 說明 |
|-----------|------|------|
| TRS-0 | 前置 | .claudeignore 基礎設施已就緒 |
| TRS-9 | 互補 | TRS-9 優化 sprint-status.yaml 讀取，TRS-17 消除 README 讀寫 |
| TRS-11 | 同類 | 皆為 D 類操作流程優化，側車文件 vs 衍生視圖 |
| TRS-12 | 互補 | Story 模板章節標注 + README 自動生成 = 全鏈路自動化 |

---

## 設計決策紀錄

### 為什麼不結構化 sprint-status.yaml（方案 A 否決）

> **分析日期**: 2026-02-25
> **結論**: 否決。結構化後 sprint-status.yaml 從 ~1,500 tok 膨脹至 ~5,400 tok（3.6×），
> 每 Story 生命週期 3 次 workflow 讀取增量 +11,700 tok，超過消除 README 讀取的收益 -7,800 tok，
> 淨損益 **-3,900 tok/Story（虧損）**。

### 為什麼用 Skill 處理例外而非重新設計

> 例外場景（新建 Story、新 Group）發生在已執行中的 Workflow 裡（create-story / code-review），
> Claude 本來就在花 token 跑這些 Workflow。讓它順手更新 epic-config.yaml 只是邊際成本 ~200-300 tok，
> 而 Skill 只在例外觸發時載入（非 Always-On），不增加每次會話靜態成本。
