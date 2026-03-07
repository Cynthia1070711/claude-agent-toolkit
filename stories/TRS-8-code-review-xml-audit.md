# TRS-8: code-review/instructions.xml 深度審計與壓縮

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-8 |
| **狀態** | done |
| **複雜度** | L |
| **優先級** | P0 |
| **建立時間** | 2026-02-24 20:55 |
| **依賴** | TRS-7 |
| **後續** | TRS-9 |
| **來源** | B-7 + B-9（全研究彙整報告）、TRS-5 §2.5 |
| **類型** | B 類（Workflow 執行開銷） |

---

## 目標

對 `code-review/instructions.xml`（923 行）和 `code-review/checklist.md`（129 行）進行深度審計，壓縮至 ~600 行和 ~80 行。

---

## 問題描述

### 問題 1：instructions.xml 是三組 Workflow 中最大的檔案（B-7）
923 行，每次 code-review 消耗 ~11,500 tokens。需要詳細拆解：
- 與 checklist.md 的重複驗證邏輯
- 英文模板的冗餘描述
- 可合併的步驟

### 問題 2：checklist.md Summary Metrics 模板（B-9）
Summary Metrics 展示模板（`{{total_issues}}` 表格）與 instructions.xml 最終報告重複，浪費 ~300 tokens。

---

## 驗收標準

> **驗證時間**: 2026-02-24 22:09 | **驗證者**: Claude Opus 4.6

- [x] instructions.xml 行數 < 650 行 — ✅ 原始 769 行 → **471 行**（壓縮 39%）
- [x] checklist.md 行數 < 85 行 — ✅ 原始 109 行 → **58 行**（壓縮 47%）
- [x] 以下內容**絕不可壓縮**（安全禁區）：
  - ~~HALT 觸發條件完整列表~~ — ⚠️ 原始 `instructions.xml` 中無 HALT 字面條件（`grep -i halt` 為空），HALT 屬 dev-story workflow，不適用於 code-review
  - Production Gate 驗證邏輯 — ✅ `instructions.xml:36-42`（gate 定義）+ `:337-374`（Step 5 完整驗證）保留
  - Sprint Status 雙寫邏輯（Story 文件 + YAML 兩處同步） — ✅ `:377`（Story Status）+ `:382-392`（YAML 同步）保留
  - Required Skills 載入步驟 — ✅ `:52-72`（完整 Skill invoke + FORBIDDEN rules 儲存）保留
- [x] checklist.md Summary Metrics 模板已移除 — ✅ 原始 line 95 起的表格+簽名（~15 行）已完全刪除
- [x] Auto-Deferred 三個精細子清單合併為單一確認項 — ✅ 原始 4 子區塊 16 項 → 3 項 → 合併為 **1 項**完整處理鏈（`checklist.md:41`）
- [x] 用真實 Story（含技術債路由）執行完整 code-review 驗證無迴歸 — ✅ 以 `qgr-t3-webhooks-controller-tests` 執行完整 code-review，CR 報告已產出、tracking 已歸檔，無迴歸
- [x] `git diff` 追蹤所有變更行 — ✅ 所有變更在 git 工作區（unstaged），可完整追蹤

---

## 風險

- 🟠 高：包含 HALT 觸發條件和 Production Gate——MEMORY.md 中標記為 CRITICAL 的防線
- **強制要求**：獨立分支操作 + 完整端到端迴歸測試
- 建議由 Claude Opus 4.6 執行（非 Haiku/Sonnet）

---

## 預估效益

- 每次 code-review 節省 ~4,300 tokens
- Epic QGR 65 Stories 預估節省：~279,500 tokens（**最高單項效益**）
