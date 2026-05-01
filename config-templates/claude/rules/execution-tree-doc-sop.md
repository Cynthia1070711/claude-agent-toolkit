# Execution Tree Doc SOP — Epic 推進地圖極簡規範 v1.1

> **Core Principle**: 此類文檔是**給使用者看的 Story 推進順序索引**,不是 Session 進度日誌、CR 結果存檔、商業策略 SSoT。
>
> **行數上限 ≤ 100 行**。workflows 執行時不讀此文檔,Agent 不該為了「展示成果」塞細節。

---

## Applies When

| 路徑 pattern | 用途 |
|--------------|------|
| `docs/tracking/active/Epic-*執行樹狀圖.md` / `Epic-*推進地圖.md` | Active Epic 推進地圖 |
| `docs/implementation-artifacts/stories/epic-*/EPIC-*推進樹狀圖.md` | Epic 批次執行地圖 |
| 任何「批次執行地圖」/「Story 執行順序」/「推進樹狀圖」性質文檔 | 同 SOP 約束 |

---

## 極簡範本(6 章節 ≤ 100 行)

| # | 章節 | 內容 | 行數預算 |
|:-:|:-----|:-----|:-------:|
| 1 | Header | 更新日期 / Agent / SOP 引用 / workflows 不讀標註 | 4 |
| 2 | 整體進度 | ASCII tree(Stories 總計 / Done / Backlog / 完成率 / 當前主軸)| 8 |
| 3 | 推進順序 | **編號清單**(全部 backlog 1, 2, 3...)分 P0/P1/P2/P3 4 sub-section,**每 story 1 行**(含 `P/S` + 30 字內備註如 `dep #N` / `S56 follow-up`)| 1 / story |
| 4 | 詳細資訊查詢路徑 | 表格(類型 / 來源 SSoT 路徑)| 10 |
| 5 | 更新紀錄 | ≤ 3 條(每 Session 1 行,>3 則最舊歸檔到 Memory DB)| 3 |

**已完成 Story 不列清單**(只在整體進度寫總數 `36 ✅ Done`)。**狀態圖例 / 依賴鏈 / Wave 分組摘要 / 已完成表全部砍掉**。

---

## FORBIDDEN

| ❌ 不該寫 | ✅ 應寫到哪 |
|----------|-----------|
| **已完成 Story 清單**(整表 36 row)| 整體進度只寫 `36 ✅ Done` 一行 |
| **Session 進度詳細 sub-section** | `任務交接.md` / Memory DB |
| **CR finding 表 / Phase A-D 結果 / Production Gates 表** | `docs/.../reviews/epic-X/{story}-cr-report.md` |
| **CRITICAL FIXED / HIGH inline FIXED 詳細列舉** | 同上 CR Report |
| **商業策略 SSoT 索引**(ADR cross-ref 表)| `docs/technical-decisions/` 目錄 |
| **Skill 升版承諾 / PRD 升版承諾** | Skill Sync Gate / dev-story Step 8 |
| **Reusable Pattern 提煉**(test_pattern / code pattern / methodology)| Memory DB `add_tech` |
| **累積 update notes**(每 Session 塞 100+ 字段落)| 更新紀錄表 1 行 + 詳情入 Memory |
| **commit hash / file:line / 詳細實作描述** | git log / CR Report |
| **Audit 4 反模式守護章節 L1-L4 結果** | constitutional-standard.md Incident Records |
| **Memory writeback 表 / IDD 表 / Migration 表** | Memory DB / DB schema 本身 |
| **依賴鏈 ASCII / Wave 分組摘要表 / 狀態圖例 / 已完成 Story 表** | 全砍 — 用「dep #N」inline 標記取代 |
| **行數 > 100** | 立即精簡 |

---

## MANDATORY

- ✅ **推進順序章節用編號清單**(1, 2, 3...),分 P0/P1/P2/P3 4 sub-section
- ✅ **每 story 1 行**(`{N}. {story-id}  P/S  備註 ≤ 30 字`)
- ✅ **總行數 ≤ 100**(超過必精簡)
- ✅ **每次更新 diff ≤ 10 行**(只調 Story 順序 / 整體進度數字 / 更新紀錄 1 行)
- ✅ **Header 引用本 SOP**(`遵循 .claude/rules/execution-tree-doc-sop.md v1.1`)
- ✅ **更新紀錄 ≤ 3 條**,超過則最舊歸檔到 Memory DB
- ✅ **Story 完成 → 從推進順序刪除**,整體進度 Done 數 +1(不在原位置留 strikethrough)

---

## Self-Check(每次更新前必問)

1. **這次 diff 是否 ≤ 10 行?** → 超過 = 塞了不該塞的,刪掉
2. **我是否打算加「已完成 Story 表」/「依賴鏈」/「Wave 分組摘要」?** → 全砍,只留 §推進順序
3. **我是否打算加 Session N 進度詳細?** → STOP,寫 任務交接.md / Memory DB
4. **總行數是否 ≤ 100?** → 超過 → 精簡
5. **使用者打開此文檔後,3 秒內看得到下一個要推進的 Story 是哪個?** → 看不到 = 失敗

---

## 範本參照

| 文檔 | 行數 | 狀態 |
|------|:----:|:----:|
| `docs/tracking/active/Epic-eft執行樹狀圖.md` | ~86 | ✅ **黃金範本 v1.1** |

未來新建 Epic 推進地圖一律以此為範本。**不得參照 QGR v5.1 (~220 行)** — 該版含已完成 83 Story 列舉表 + Batch 8 細節,屬 epic 已 done 後的存檔風格,不適用 active epic。

---

## 為什麼需要本 SOP

### 反模式重現案例

**2026-04-29 Epic-eft 推進地圖膨脹事件**:
- Session 51-56 每個 Session 在文檔內加 30-100 行進度詳細 sub-section
- 累積 6 個 Session 後從 ~200 行膨脹至 **789 行**
- 第一輪精簡至 194 行(對齊 QGR 範本)使用者仍指控「規範還是太複雜了,這是給我看的,只需要顯示 story 推進順序而已」
- 第二輪精簡至 86 行(極簡編號清單 + 已完成只記總數)
- 抽 SOP rule v1.1 規範架構防未來再犯

### 根本問題

1. **Agent 完成 Story 後傾向「展示成果」** → 把 CR 細節塞進來
2. **缺乏「使用者視角」設計** → 文檔變成 Agent 給 Agent 看的歷史檔案
3. **沒有機制性 enforcement** → 工具不阻擋膨脹 → drift 持續

### 本 SOP 解決方案

- **使用者視角優先**: §Self-Check Q5「3 秒內看得到下一個推進 Story」測試
- **行數上限 100**(對比 v1.0 的 250)→ 強制砍冗餘
- **已完成 Story 不列清單**(歷史歸 git log / Memory DB)
- **編號清單格式**(1, 2, 3...)→ 一目了然推進順序
- **CLAUDE.md trigger**(Always-On)+ Header SOP pointer(編輯時提示)

---

## Related Rules

- `.claude/rules/db-first-no-md-mirror.md` — DB 是 Story 結構化資料 SSOT,本 SOP 延伸到「推進地圖只放 index 不放 detail」
- `.claude/rules/cr-debt-doc-audit.md` — CR Phase B 文檔同步屬 CR Report,不寫推進地圖
- `.claude/rules/skill-sync-gate.md` — Skill 升版承諾屬 dev-story Skill Impact Report

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| 1.0.0 | 2026-04-29 | Initial creation. Epic-eft 樹狀圖膨脹至 789 行觸發。10 章節範本 + 行數上限 250 |
| **1.1.0** | **2026-04-29** | **使用者進一步要求極簡(「給我看的,只需要 story 推進順序」「已完成只要總數」)**。範本砍至 6 章節 + 行數上限 100。已完成 Story 表 / 依賴鏈 / Wave 分組摘要 / 狀態圖例全砍。Self-Check 加 Q5「3 秒內看得到下一個推進 Story」使用者視角測試。範本參照從 QGR v5.1 改為 Epic-eft v1.1(86 行)|
