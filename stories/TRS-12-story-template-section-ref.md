# TRS-12: Story 模板章節標注與依賴摘要

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-12 |
| **狀態** | done |
| **複雜度** | M |
| **優先級** | P2 |
| **建立時間** | 2026-02-24 20:55 |
| **依賴** | 無（獨立任務） |
| **後續** | 無 |
| **來源** | D-4（全研究彙整報告）、策略文件 Phase 6 §10 |
| **類型** | D 類（操作流程優化） |

---

## 目標

改善 Story 模板的 Dev Notes 路徑引用格式，讓 create-story 精準讀取功能規格的特定章節而非全文。

---

## 問題描述

### 問題 1：Dev Notes 路徑引用缺乏章節標注
MyProject 骨架 Story（QGR-A3/A4/A5 等）的 Dev Notes 只記錄文件路徑：
```markdown
| 規格 | 功能規格 #25 §5.1 | 站台基本設定 |
```
create-story 補全時讀取整份功能規格（~8,000 tokens），但只用到 §5.1（~400 tokens）。

### 問題 2：Story 依賴欄位缺乏介面摘要
```markdown
# 現狀：只有 Story ID
| **依賴** | QGR-A1 (可平行但建議一起) |

# 改善：包含具體介面
| **依賴** | QGR-A1（AdminDashboardService.cs: GetRevenueAsync() / GetPdfCountAsync()）|
```

---

## 驗收標準

- [x] create-story/template.md 已新增「Dev Notes 路徑引用規範」
  - 路徑必須為完整相對路徑
  - 功能規格引用必須標注章節號（如 §5.1）
  - 標注「僅讀此節」以限制讀取範圍
- [x] Story 依賴欄位格式已更新（含具體介面名稱）
- [x] 現有骨架 Story（QGR-A3/A4/A5 等）已補充章節標注（可選，不強制）
- [x] Tech Debt 整合格式已標準化寫入 template

---

## 風險

- 🟢 低：模板修改，不影響現有 Workflow 行為

---

## 預估效益

- 每個骨架 Story 的 create-story 節省 ~7,500 tokens
- 長期降低所有新建 Story 的規格讀取浪費

---

## 完成記錄

| 日期 | 變更 | 作者 |
|------|------|------|
| 2026-02-24 21:45 | TRS-12 全部驗收標準完成 | Claude Opus 4.6 |

### 修改檔案清單

| 操作 | 檔案路徑 | 說明 |
|------|----------|------|
| 修改 | `_bmad/bmm/workflows/4-implementation/create-story/template.md` | 新增路徑引用規範、依賴欄位格式、Tech Debt 標準區塊 |
| 修改 | `_bmad/bmm/workflows/4-implementation/create-story/instructions.xml` | Step 6 新增 PATH REFERENCE RULE + DEPENDENCY INTERFACE RULE |
| 修改 | `docs/implementation-artifacts/stories/epic-qgr/qgr-a3-maintenance-middleware.md` | Dev Notes 路徑從 `功能規格 #3 §6` → 完整相對路徑 + 僅讀此節 |
| 修改 | `docs/implementation-artifacts/stories/epic-qgr/qgr-a4-site-info-settings.md` | Dev Notes 路徑從 `功能規格 #25 §5.1` → 完整相對路徑 + 僅讀此節 |
| 修改 | `docs/implementation-artifacts/stories/epic-qgr/qgr-a5-brand-customization.md` | Dev Notes 路徑 + 依賴欄位格式更新 |
