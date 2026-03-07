# TRS-25: .gemini/skills/ YAML 標頭適配 Gemini CLI 漸進式揭露

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-25 |
| **狀態** | done |
| **複雜度** | M |
| **優先級** | P1 |
| **建立時間** | 2026-02-25 23:30 |
| **依賴** | TRS-22（先清理無關 Skills，再適配保留的 Skills） |
| **類型** | D 類（操作流程優化） |
| **建立者** | CC-OPUS（Party Mode） |
| **建議執行者** | GC-PRO 或 CC-OPUS |

---

## 目標

優化 `.gemini/skills/` 中保留的 ~18 個 MyProject 專用 Skills 的 YAML 標頭，使 description 精準觸發 Gemini CLI 的 `activate_skill` 漸進式揭露機制。

---

## 問題描述

### 現況

`.gemini/skills/` 是從 `.claude/skills/` 直接複製，YAML 標頭未針對 Gemini CLI 的漸進式揭露做優化。

### Gemini CLI Skills 機制（來源：入門指南 §Skills 章節）

| 機制 | 說明 |
|------|------|
| **初始載入** | 模型只看到 Skill 名稱 + description（不載入完整內容） |
| **觸發** | 模型自主決定呼叫 `activate_skill`，需使用者確認後注入完整內容 |
| **發現優先級** | 工作區 > 使用者 > 擴充套件（同名覆蓋） |
| **管理指令** | `/skills list`、`/skills enable`、`/skills disable`、`gemini skills link` |

### 關鍵差異

| 維度 | Claude Code | Gemini CLI |
|------|------------|-----------|
| 觸發 | CLAUDE.md 觸發關鍵字 → 手動 `/skill-name` | description → 模型自動 `activate_skill` |
| 載入 | 全量注入 | 漸進式：先看 description，確認後才注入 |
| 重要性 | description 可選 | **description 是唯一觸發依據** |

### 問題

當前 Skills 的 description 可能過於簡短或不夠精準，導致 Gemini CLI 無法準確判斷何時該啟用 Skill。

---

## 實作方案

### Phase 1：審查當前 description

逐一檢查 `.gemini/skills/*/SKILL.md` 的 YAML description，與 CLAUDE.md §2 觸發關鍵字對照：

| Skill | CLAUDE.md 觸發關鍵字 | 目標：description 應包含 |
|-------|---------------------|------------------------|
| `example-editor-arch` | CanvasJson, Asset, diff_sync, Shape, Table | CanvasJson 資料架構、Asset 管理、Diff Sync 協議 |
| `example-payment` | ECPay, Payment, Subscription, 退款, Webhook | ECPay 金流、訂閱管理、Webhook 處理、退款流程 |
| `example-pdf-engine` | PDF, QuestPDF, PdfWorker, DPI, CutLine | PDF 生成、QuestPDF 引擎、座標轉換、裁切線 |
| ... | （其他同理） | |

### Phase 2：重寫 description

- 每個 description 應在 1-2 句話內覆蓋該 Skill 的**所有**觸發場景
- 包含技術名詞和中文關鍵字（模型理解雙語）
- 避免過於通用的描述（如「開發規範」）

### Phase 3：驗證

- 在 Gemini CLI 中執行 `/skills list` 確認所有 Skills 可見
- 測試 2-3 個場景，確認 `activate_skill` 被正確觸發
- 比較觸發準確度 Before/After

---

## 驗收標準

- [ ] 所有 `.gemini/skills/*/SKILL.md` 的 description 已重寫
- [ ] description 包含 CLAUDE.md §2 對應的觸發關鍵字
- [ ] `/skills list` 確認所有 Skills 可見且 description 正確
- [ ] 至少 3 個場景測試 `activate_skill` 觸發正確

---

## 風險

- :yellow_circle: 中：description 過於詳細可能造成誤觸發（緩解：Gemini CLI 有使用者確認步驟）
- :green_circle: 低：description 語言選擇（中/英）影響觸發準確度（緩解：雙語混合最佳）
