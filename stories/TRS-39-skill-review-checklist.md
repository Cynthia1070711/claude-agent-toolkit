# 🚫 Story TRS-39: Skill Review Checklist 合併檔建立 — CANCELLED

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-39-SKILL-REVIEW-CHECKLIST |
| **Epic** | Epic TRS - Token 減量策略 (Token Reduction Strategy) |
| **優先級** | P1 |
| **類型** | Architecture / Optimization |
| **複雜度** | M (3-5 SP) |
| **狀態** | cancelled |
| **來源** | Party Mode 討論 2026-03-01（Context 過載防幻覺研究報告） |
| **依賴** | 無 |
| **建立日期** | 2026-03-01 |
| **Create Agent** | Claude Opus 4.6 (CC-OPUS) |
| **Create完成時間** | 2026-03-01 11:33 |

---

## Story

As a 多引擎 AI Agent 開發者,
I want 建立單一合併的 `review-checklist.md`（~200 行），整合所有 Skills 的 FORBIDDEN 規則與審查要點，code-review 載入此檔取代逐一載入 4-5 個完整 SKILL.md,
so that CR 的 Skill 載入從 2,400-3,500 行降至 ~200 行（-91~94%），大幅降低 context 過載風險。

---

## Background

### 現況問題

Code-review workflow Step 1 逐一載入 Story 的 Required Skills（完整 SKILL.md）：

| 典型 Story | Skills 數量 | 載入行數 |
|-----------|-----------|---------|
| QGR-A3（Admin 後台） | 5 個 | 3,525 行 |
| QGR-BA-10（PDF 相關） | 4 個 | 2,894 行 |
| 平均 M 複雜度 Story | 4.17 個 | ~2,500 行 |

但 CR 時**只需要**每個 Skill 的：
- FORBIDDEN 規則（~10-20 行/Skill）
- 審查模式檢查清單（~20-30 行/Skill）
- **不需要**：教學範例、完整 schema、歷史背景、API 參考

### Skill 工具限制

Claude Code 的 Skill tool 固定載入 `SKILL.md`，無法指定替代檔案。因此不能直接建立 `SKILL.review.md` 讓 Skill tool 載入。

### 解法選擇

| 方案 | 做法 | 評估 |
|------|------|------|
| A. 獨立 review skill | 為每個 Skill 建 `-review` 版 | ❌ Skills 翻倍，維護成本高 |
| B. Read + limit | 重構 SKILL.md 置頂審查區 | ❌ 改動大，Skill 結構不適合 |
| **C. 合併 review 檔** | 單一 `review-checklist.md` | ✅ 一檔搞定，維護最低 |

---

## 驗收標準 (Acceptance Criteria)

### AC-1: 建立合併審查清單

- [ ] 建立 `.claude/skills/review-checklist.md`
- [ ] 涵蓋所有 10 個領域 Skills 的審查要點
- [ ] 每個 Skill 區塊結構：

```markdown
## {Skill 名稱}
### FORBIDDEN
- ❌ 規則 1
- ❌ 規則 2

### 審查檢查清單
- □ 檢查項 1
- □ 檢查項 2
```

- [ ] 總行數控制在 200 行以內
- [ ] 每個 Skill 區塊 ~15-25 行（FORBIDDEN 5-10 行 + 檢查清單 10-15 行）

### AC-2: 修改 code-review instructions.xml

- [ ] Step 1 Skill 載入改為：
  ```xml
  <action>Read .claude/skills/review-checklist.md</action>
  ```
- [ ] 移除逐一 Invoke Skill tool 的迴圈
- [ ] 保留 "Pay special attention to FORBIDDEN rules" 提示

### AC-3: 完整 Skill 補讀機制

- [ ] instructions.xml 新增條件：若審查中發現需要 Skill 深層知識（如完整 schema、API 參考），可按需載入完整 SKILL.md
- [ ] 此為 fallback，正常 CR 不應觸發

### AC-4: 維護規則文檔化

- [ ] review-checklist.md 檔頭加入維護指引：
  - 新增/修改 SKILL.md 的 FORBIDDEN 規則時，同步更新此檔
  - 每季檢查一致性

---

## Token 減量預估

| 指標 | 現在 | 優化後 | 節省 |
|------|------|--------|------|
| Skills 載入行數 | 2,400-3,500 | ~200 | **91-94%** |
| 單次 CR 節省 | — | — | **~2,200-3,300 行** |
| Sprint 8 Stories | ~20,000-28,000 | ~1,600 | **~18,000-26,000 行** |

**此 Story 為單次 CR 絕對節省量最高的優化項。**

---

## 需提取的 Skill FORBIDDEN 規則來源

| Skill | SKILL.md 行數 | FORBIDDEN 預估行數 |
|-------|-------------|-----------------|
| example-admin-module | 969 | ~15 |
| example-sqlserver | 987 | ~10 |
| example-testing-patterns | 706 | ~15 |
| example-design-system | 401 | ~10 |
| example-auth-identity | 462 | ~10 |
| example-pdf-engine | 813 | ~12 |
| example-editor-arch | 655 | ~15 |
| example-zustand-patterns | 316 | ~10 |
| example-payment | 615 | ~10 |
| example-business-api | 388 | ~8 |
| **合計** | **6,312** | **~115** |

加上審查檢查清單 ~85 行 → 總計 ~200 行。

---

## 變更檔案清單

| 檔案 | 變更類型 |
|------|---------|
| `.claude/skills/review-checklist.md` | 新建 |
| `_bmad/bmm/workflows/4-implementation/code-review/instructions.xml` | 修改（Step 1 Skill 載入邏輯） |

---

## Change Log

| 日期 | Agent | 動作 |
|------|-------|------|
| 2026-03-01 11:33 | CC-OPUS | 建立 Story（Party Mode Context 過載研究報告產出） |
| 2026-03-01 11:47 | CC-OPUS | 取消：create-story 已篩選 Required Skills，CR 載入完整 SKILL.md 是正確性驗證基礎，縮減=降質 |
