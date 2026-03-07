# TRS-15: Session 紀律制度化與 PreCompact Hook

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-15 |
| **狀態** | done |
| **複雜度** | S |
| **優先級** | P2 |
| **建立時間** | 2026-02-24 20:55 |
| **依賴** | 無（獨立任務，可隨時執行） |
| **後續** | 無 |
| **來源** | 策略文件 Phase 5 §9、C-7（全研究彙整報告） |
| **類型** | C 類（防禦性保護） |

---

## 目標

將 Session 使用紀律文件化，並評估 PreCompact Hook 的 Windows 相容性與實施價值。

---

## 驗收標準

### Session 邊界規則文件
- [x] 建立 `docs/reference/session-discipline.md`，定義：
  - 正確的 Session 使用方式（每 Workflow 獨立 Session + /clear）
  - 禁止的 Session 模式（廚房水槽模式、跨 Story 連續執行）
  - 引導式 /compact 節奏（每 30-40 次對話主動壓縮）
  - compact 保存焦點的指定語法

### PreCompact Hook 評估
- [x] 評估 PreCompact Hook 在 Windows 11 + Antigravity IDE 環境下的可行性
- [x] 可行：Claude Code 原生支援 `PreCompact` 事件，Windows PowerShell 完全相容
- [x] 實作 `scripts/pre-compact-snapshot.ps1` 自動摘要機制
- [x] 註冊至 `.claude/settings.local.json` 的 `PreCompact` Hook

### 實作產出
- `docs/reference/session-discipline.md` — Session 紀律規範文件
- `scripts/pre-compact-snapshot.ps1` — PreCompact 自動快照腳本
- `.claude/settings.local.json` — 新增 PreCompact Hook 配置
- `docs/tracking/active/session-snapshot.md` — 自動生成的快照（每次壓縮前更新）

---

## 風險

- 🟢 低：主要是文件撰寫
- PreCompact Hook 因「每任務新視窗」模式，ROI 已降級（全研究彙整報告 C-7）

---

## 預估效益

- 行為性節省：避免 Session 污染導致的 token 浪費
- PreCompact Hook：條件性效益，依使用模式而定
