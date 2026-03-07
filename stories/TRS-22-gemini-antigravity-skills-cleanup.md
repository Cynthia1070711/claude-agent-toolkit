# TRS-22: Gemini + Antigravity Skills 清理

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-22 |
| **狀態** | done |
| **複雜度** | S |
| **優先級** | P1 |
| **建立時間** | 2026-02-25 22:56 |
| **依賴** | 無（獨立執行，可與 TRS-20/21 平行） |
| **類型** | D 類（操作流程優化） |
| **建立者** | CC-OPUS（Party Mode） |
| **建議執行者** | GC-PRO 或 CC-OPUS |

---

## 目標

刪除 `.gemini/skills/` 和 `.agent/skills/` 中 23 個與 MyProject 無關的 Skills，對齊 TRS-4 對 `.claude/skills/` 的清理成果。同步更新兩邊的 `skills_list.md`。

---

## 問題描述

### 現況

TRS-4 已清理 `.claude/skills/`（git status 顯示多個 `D` 刪除記錄），但 `.gemini/skills/` 和 `.agent/skills/` **完全未同步**：

| 引擎 | Skills 數 | Skills 總行數 | 無關 Skills |
|------|----------|-------------|-----------|
| `.claude/skills/`（TRS-4 已清理） | 21 | 9,388 | ✅ 已刪除 |
| `.gemini/skills/` | **41** | **15,505** | 🔴 23 個未刪 |
| `.agent/skills/` | **41** | **14,962** | 🔴 23 個未刪 |

### 根因分析

1. TRS-4 scope 僅覆蓋 `.claude/skills/`
2. 三引擎 Skills 目錄從 BMAD installer 安裝時同步複製，之後各自獨立管理
3. 沒有跨引擎 Skills 同步機制

---

## 實作方案

### Phase 1：刪除 23 個無關 Skills 目錄

以下目錄在 `.gemini/skills/` 和 `.agent/skills/` 中**各刪除一份**（共 46 個目錄）：

| # | Skill 名稱 | 無關原因 |
|---|-----------|---------|
| 1 | `golang-patterns` | MyProject 不使用 Go |
| 2 | `golang-testing` | 同上 |
| 3 | `java-coding-standards` | MyProject 不使用 Java |
| 4 | `jpa-patterns` | 同上 |
| 5 | `springboot-patterns` | 同上 |
| 6 | `springboot-security` | 同上 |
| 7 | `springboot-tdd` | 同上 |
| 8 | `springboot-verification` | 同上 |
| 9 | `postgres-patterns` | MyProject 使用 SQL Server |
| 10 | `clickhouse-io` | MyProject 不使用 ClickHouse |
| 11 | `backend-patterns` | 通用，已被 MyProject 專用 Skills 覆蓋 |
| 12 | `frontend-patterns` | 同上 |
| 13 | `coding-standards` | 同上 |
| 14 | `project-guidelines-example` | 範例模板 |
| 15 | `continuous-learning` | 實驗性，未使用 |
| 16 | `continuous-learning-v2` | 同上 |
| 17 | `eval-harness` | 同上 |
| 18 | `iterative-retrieval` | 同上 |
| 19 | `strategic-compact` | 同上 |
| 20 | `verification-loop` | 同上 |
| 21 | `webgpu-threejs-tsl` | MyProject 不使用 WebGPU |
| 22 | `security-review` | 通用版，有專用 `example-auth-identity` |
| 23 | `tdd-workflow` | 通用版，有專用 `example-testing-patterns` |

### Phase 2：更新 skills_list.md

- `.gemini/skills/skills_list.md`：移除 23 個無關 Skills 的列表項（140→~40 行）
- `.agent/skills/skills_list.md`：同步更新

### Phase 3：驗證

- 確認 `.gemini/skills/` 和 `.agent/skills/` 的 Skill 數量與 `.claude/skills/` 一致
- 確認 Gemini CLI `create-story` 的 Skills 掃描只列出 MyProject 相關 Skills

---

## 驗收標準

- [x] `.gemini/skills/` 中 23 個無關目錄已刪除
- [x] `.agent/skills/` 中 23 個無關目錄已刪除（+1 額外刪除 `webgpu-claude-skill-main`）
- [x] `.gemini/skills/skills_list.md` 已更新，只保留 MyProject 專用 + 必要通用 Skills（140→44 行）
- [x] `.agent/skills/skills_list.md` 已同步更新（140→40 行）
- [x] 三引擎 Skills 數量一致：`.claude/` 21 / `.gemini/` 18 / `.agent/` 17（差異為各引擎獨有 Skill）

---

## 執行紀錄

| 時間 | Agent | 動作 |
|------|-------|------|
| 2026-02-25 23:41 | CC-OPUS | TRS-22 執行完成，47 個目錄刪除，skills_list.md 精簡 |

---

## 預估效益

| 指標 | Before | After | 節省 |
|------|:------:|:-----:|:----:|
| `.gemini/skills/` 數量 | 41 | ~18 | -23 |
| `.agent/skills/` 數量 | 41 | ~18 | -23 |
| Skills 總行數（兩引擎合計） | 30,467 | ~18,000 | ~12,000 行 |
| `skills_list.md` 行數（每份） | 140 | ~40 | -100 行 |
| create-story 掃描效率 | 掃 41 項 | 掃 18 項 | 誤觸發風險降低 |

---

## 風險

- 🟢 低：誤刪 MyProject 需要的 Skill（清單已與 TRS-4 對齊驗證）
- 🟢 低：Antigravity 行為退化（Skills 是 on-demand 載入，刪除未使用的不影響）
