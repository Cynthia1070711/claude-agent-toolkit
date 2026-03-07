# Claude Telegram Bridge v2.0 — 產品需求文檔 (PRD)

## 1. 產品概述

### 1.1 產品名稱
Claude Telegram Bridge v2.0 — 多輪對話持久模式

### 1.2 問題陳述

現有 v1.0 橋接每條 Telegram 訊息都 spawn 獨立 `claude -p "message"` 進程（one-shot 模式），
每次重新載入專案上下文（CLAUDE.md + 27 skills + rules），造成：

| 問題 | 影響 |
|------|------|
| 回應極慢 | 每次啟動 10+ 秒載入上下文 |
| Token 重複消耗 | 每條訊息都重新載入相同的專案上下文 |
| 無對話記憶 | 每次都是全新會話，無法延續上下文 |

### 1.3 解決方案

改造為 **stream-json 持久進程模式**：一個 Claude CLI 進程持續運行，
Telegram 訊息透過 stdin JSON 送入，實現真正的多輪對話。

### 1.4 目標使用者

專案開發者（YourName），透過 Telegram 行動端遠端操作 Claude Code CLI。

---

## 2. 功能定義

### 2.1 核心功能

| # | 功能 | 說明 | 優先級 |
|---|------|------|--------|
| F1 | Stream-JSON 持久進程 | 上下文只載入一次，多輪對話有記憶 | P0 |
| F2 | 訊息佇列 | 快速連發訊息不會遺失，依序處理 | P0 |
| F3 | 自動重連 | 進程死亡後下次訊息自動重啟，使用者無感 | P0 |
| F4 | Typing 心跳 | Claude 思考時 Telegram 顯示「正在輸入...」| P0 |
| F5 | 殭屍進程清理 | 服務啟動/關閉時自動清理殘留進程 | P0 |

### 2.2 指令系統

| 指令 | 功能 | 說明 |
|------|------|------|
| `/new [路徑]` | 開新終端 | 結束現有進程，啟動新的 Claude 會話 |
| `/stop` | 停止終端 | 結束 Claude 進程 |
| `/clear` | 清除記憶 | 送 `/clear` 到 Claude stdin，清空對話上下文 |
| `/status` | 查看狀態 | 運行中/已停止、模型、工作目錄、對話輪數、累計 token |
| `/model <name>` | 切換模型 | haiku/sonnet/opus，重啟進程生效 |
| `/cd <路徑>` | 切換目錄 | 變更工作目錄，需重啟進程 |
| `/bookmark` | 路徑書籤 | 列出/新增/刪除常用工作目錄 |
| `/resume` | 恢復會話 | 使用上次的 Claude session ID 恢復 |
| `/help` | 使用說明 | 指令列表 |

### 2.3 額外功能

| # | 功能 | 說明 | 優先級 |
|---|------|------|--------|
| F6 | 模型切換 `/model` | 預設 Sonnet，可隨時切換 Haiku/Opus | P1 |
| F7 | Token 用量追蹤 | 每輪回應附上 `📊 input: 1.2k / output: 856 tokens (3.2s)` | P1 |
| F8 | 回應時間統計 | 記錄每次回應耗時，`/status` 顯示平均速度 | P1 |
| F9 | 多工作目錄書籤 | `/bookmark add name path` → `/cd name` 快速切換 | P2 |
| F10 | 檔案上傳 | Telegram 傳圖片/文件 → 自動存到 `_uploads/` → 通知 Claude | P2 |

---

## 3. 使用情境

### 情境 1：日常多輪對話（P0 核心價值）

```
使用者: 查看目前的 git status
Claude: 目前在 main 分支，有 3 個未追蹤檔案...
使用者: 那些未追蹤的檔案是什麼？
Claude: （記得上下文）分別是 src/new-feature.ts、tests/new-feature.test.ts...
使用者: 把它們 commit 起來
Claude: （依然記得上下文）好的，已建立 commit...
```

**v1.0 無法實現**：每條訊息都是新會話，Claude 不記得前一條訊息的結果。

### 情境 2：快速連發訊息

```
使用者快速發送：
  "讀取 src/types.ts"
  "然後加上 StreamEvent 型別"
  "用 export interface"

→ 訊息佇列依序處理，不會遺失任何一條
```

### 情境 3：進程意外中斷

```
Claude 進程因記憶體不足被 OS kill
  → 使用者不知道，繼續發訊息
  → Bridge 偵測到進程已死
  → 自動重啟新進程
  → 訊息順利送達
  → 使用者完全無感
```

### 情境 4：模型切換

```
使用者: /model haiku
Bot: ✅ 模型已切換為 haiku，重新啟動 Claude 進程...
使用者: 快速看一下這個檔案有幾行
Claude (haiku): 這個檔案有 42 行。
使用者: /model opus
Bot: ✅ 模型已切換為 opus，重新啟動 Claude 進程...
使用者: 幫我重構這段複雜的邏輯
Claude (opus): 好的，讓我分析這段程式碼...
```

### 情境 5：工作目錄書籤

```
使用者: /bookmark add myproject C:SERSYOURNAMEPROJECTSMYPROJECT
Bot: ✅ 已儲存書籤 'myproject'

使用者: /bookmark add sideproject D:\SideProject
Bot: ✅ 已儲存書籤 'sideproject'

使用者: /cd myproject
Bot: ✅ 工作目錄已切換至 C:SERSYOURNAMEPROJECTSMYPROJECT
```

---

## 4. 架構對比

### v1.0 — One-shot 模式

```
Telegram 訊息 1 → spawn claude -p "訊息1" → [載入上下文] → API → 回應 → 進程退出
Telegram 訊息 2 → spawn claude -p "訊息2" → [載入上下文] → API → 回應 → 進程退出
Telegram 訊息 3 → spawn claude -p "訊息3" → [載入上下文] → API → 回應 → 進程退出
                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                   每次都重新來過，上下文重複載入 3 次
```

### v2.0 — 持久 Stream-JSON 模式

```
Telegram 訊息 1 ─┐
                  │    ┌─────────────────────────────────────┐
Telegram 訊息 2 ─┼──→ │  claude --input-format stream-json   │ ──→ Telegram 回覆
                  │    │  (持續運行的單一進程)                  │
Telegram 訊息 3 ─┘    │  上下文只載入一次，對話有記憶          │
                       └─────────────────────────────────────┘
```

---

## 5. 驗收標準

| # | 驗證項目 | 預期結果 |
|---|----------|----------|
| V1 | 啟動服務 → 發送第一條訊息 | Claude 進程啟動為 stream-json 模式 |
| V2 | 發送第二條訊息 | **不產生新進程**，透過 stdin 送入 |
| V3 | 連續快速發 3 條訊息 | 佇列依序處理，無遺失 |
| V4 | 觀察回應結尾 | 顯示 `📊 token 統計 (耗時)` |
| V5 | `/model haiku` | 模型切換 + 進程重啟 |
| V6 | 手動 kill Claude 進程 → 發送訊息 | 自動重連 |
| V7 | `/new` | 舊進程結束、新進程啟動 |
| V8 | `/bookmark add test C:\temp` → `/cd test` | 路徑切換成功 |
| V9 | 在 Telegram 傳送圖片 | 存到 `_uploads/` 並通知 Claude |
| V10 | `/status` | 顯示運行狀態、模型、累計 token、平均耗時 |
| V11 | 關閉服務 → 重新啟動 | 殭屍進程被清理 |

---

## 6. 非功能需求

| 類別 | 需求 |
|------|------|
| 效能 | 首次啟動後，後續訊息回應延遲 < 2 秒（不含 Claude API 處理時間）|
| 可靠性 | 進程意外退出後 100% 自動恢復 |
| 安全性 | Bot Token 和 Allowed User IDs 透過環境變數配置，不硬編碼 |
| 相容性 | Node.js 18+、Windows 11、Claude CLI 最新版 |
| 可觀測性 | Token 用量追蹤 + 回應時間統計 + `/status` 即時查詢 |
