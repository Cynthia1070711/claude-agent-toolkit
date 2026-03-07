# TRS-21: 專案 GEMINI.md 對齊 CLAUDE.md 結構

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-21 |
| **狀態** | done |
| **複雜度** | M |
| **優先級** | P1 |
| **建立時間** | 2026-02-25 21:51 |
| **依賴** | TRS-20（先瘦全域，再瘦專案） |
| **類型** | D 類（操作流程優化） |
| **建立者** | CC-OPUS（Party Mode） |
| **建議執行者** | GC-PRO 或 CC-OPUS |

---

## 目標

將專案 `GEMINI.md` 從 832 行重寫為 ~150 行，與 `CLAUDE.md`（119 行）同構對齊，消除與 AGENTS.md v4.0 的大量重複。

---

## 問題描述

### 現況

- 專案 `GEMINI.md` = **832 行**，是 `CLAUDE.md`（119 行）的 **7 倍**
- AGENTS.md v4.0（984 行）已覆蓋絕大部分內容：觸發規則(§4)、技術棧(§1)、測試帳號、文件路徑(§3)
- 專案 GEMINI.md 有 **~650 行與 AGENTS.md 重複**
- §0.0-§0.2（64 行）全域已有，不需重複
- §1 Triggers（170 行）用完整 YAML 格式，CLAUDE.md 同等內容只用 6 行

### 與 CLAUDE.md 的差異對比

| 項目 | CLAUDE.md | GEMINI.md | 差異 |
|------|-----------|-----------|------|
| 行數 | 119 | 832 | 7 倍 |
| Triggers 格式 | 6 行自然語言 | 170 行 YAML | 28 倍 |
| Skill 索引 | 16 行表格 | 15 行表格 | 相當 |
| Test Accounts | 10 行 | 13 行 | 相當 |
| Workflow Commands | 3 行 | 50 行 | 16 倍 |
| 建置指令 | 無（在 AGENTS.md） | 25 行 | 多餘 |
| Chrome MCP 協議 | 無（在 Skill） | 40 行 | 多餘 |
| BDD 標準 | 無（在 AGENTS.md） | 20 行 | 多餘 |

### 根因分析

1. 專案 GEMINI.md 在 AGENTS.md v3.0 時期建立，當時需要獨立承載完整規範
2. AGENTS.md v4.0 升級（TRS-13 Phase 2）後，GEMINI.md 的內容大部分已移入共用層
3. CLAUDE.md 在 TRS-2 中完成精簡，但 GEMINI.md 未同步

---

## 實作方案

### Phase 1：砍掉與 AGENTS.md/全域重複的章節

| 章節 | 行數 | 動作 | 理由 |
|------|------|------|------|
| §0.0 Constitutional Mandate | 18 行 | 🗑️ 刪除 | 全域 GEMINI.md §1 + AGENTS.md §2 已覆蓋 |
| §0 Inheritance Notice | 16 行 | 🗑️ → 1 行 | 用 `> Extends ~/.gemini/GEMINI.md` 取代 |
| §0.1 Timestamp Rule | 20 行 | 🗑️ 刪除 | 全域 GEMINI.md §1 已覆蓋 |
| §0.2 Analysis Guidelines | 30 行 | 🗑️ 刪除 | 全域 GEMINI.md §2 已覆蓋 |
| §4 Project Architecture | 50 行 | 🗑️ 刪除 | AGENTS.md §1 已覆蓋 |
| §8 UI/UX Protocol | 30 行 | 🗑️ 刪除 | AGENTS.md §6 + Skill 已覆蓋 |
| §9 Chrome MCP Protocol | 40 行 | 🗑️ 刪除 | Skill `/example-testing-patterns` 已覆蓋 |
| §11 File Hygiene | 15 行 | 🗑️ 刪除 | AGENTS.md 已覆蓋 |
| §12 Quick Reference | 15 行 | 🗑️ 刪除 | AGENTS.md 已覆蓋 |
| §13 BDD Standards | 20 行 | 🗑️ 刪除 | AGENTS.md 已覆蓋 |
| §14 Building and Running | 25 行 | 🗑️ 刪除 | AGENTS.md 已覆蓋 |

### Phase 2：壓縮保留章節至 CLAUDE.md 同構格式

| 新章節 | 對應 CLAUDE.md | 來源 | 目標行數 |
|--------|---------------|------|---------|
| **§1 Triggers** | CLAUDE.md §1 | 原 §1（170 行 YAML → 自然語言） | ~15 行 |
| **§2 Skill 索引** | CLAUDE.md §2 | 原 §2（保留表格 + 禁止事項 + Canonical） | ~35 行 |
| **§3 Test Accounts** | CLAUDE.md §3 | 原 §3（保留） | ~10 行 |
| **§4 Document Locations** | CLAUDE.md §4 | 原 §7（保留表格） | ~15 行 |
| **§5 Workflow Checklists** | CLAUDE.md §5 | 原 §6.4（壓縮為 3 行） | ~8 行 |
| **§6 Project Status** | CLAUDE.md §6 | 原 §10（保留引用） | ~5 行 |
| **§7 Workflow Commands** | CLAUDE.md §7 | 原 §5（壓縮 + 保留 Gemini 扁平格式） | ~12 行 |

### Phase 3：新增 Gemini 專屬差異章節

```markdown
## 8. Gemini 專屬配置

### Skills 路徑
- Gemini CLI Skills: `.gemini/skills/`
- Skills 清單: `.gemini/skills/skills_list.md`

### 指令格式
- Gemini 扁平格式: /bmad-type-module-name
- Claude 階層格式: /bmad:module:type:name
- 轉換: 連字號(-) ↔ 冒號(:)，順序「類型-模組-名稱」↔「模組:類型:名稱」
```

### Phase 4：保留 Agent Identity 章節

```markdown
## 9. Agent Identity — Gemini CLI

（保留現有 TRS-13 Phase 1 建立的 Agent ID 對照表 + 交接三步驟）
```

---

## 目標結構（精簡後 ~150 行）

```
# GEMINI.md (Project: MyProject Platform - MyProject MVP)
> Extends ~/.gemini/GEMINI.md (Global). Azure PaaS deployment.

§1 Triggers                     (~15 行) — 與 CLAUDE.md §1 同構
§2 Skill 索引                   (~35 行) — 與 CLAUDE.md §2 同構
§3 Test Accounts                (~10 行) — 與 CLAUDE.md §3 同構
§4 Document Locations           (~15 行) — 與 CLAUDE.md §4 同構
§5 Workflow Completion Checklists (~8 行) — 與 CLAUDE.md §5 同構
§6 Project Status               (~5 行)  — 與 CLAUDE.md §6 同構
§7 Workflow Commands             (~12 行) — Gemini 扁平格式（GEMINI 獨有）
§8 Gemini 專屬配置              (~15 行) — Skills 路徑 + 指令格式轉換（GEMINI 獨有）
§9 Agent Identity               (~20 行) — GC-PRO / GC-FLASH + 交接三步驟
```

---

## 驗收標準

- [x] 專案 GEMINI.md 行數 ≤ 180 行 — 171 行
- [x] 結構與 CLAUDE.md 同構（§1-§6 章節一對一對應）
- [x] §0.0-§0.2 完全移除（全域已覆蓋）
- [x] §4/§8/§9/§11-§14 完全移除（AGENTS.md 已覆蓋）
- [x] §1 Triggers 從 170 行 YAML 壓縮為 ~15 行自然語言（19 行）
- [x] Gemini 專屬差異（Skills 路徑、指令格式）有獨立章節保留（§8）
- [x] Agent Identity 章節完整保留（§9）
- [x] Gemini CLI 執行 `/memory` 驗證能正確讀取 — 全域+專案雙層完整載入
- [x] 執行一個簡單的 workflow-status 確認行為不退化 — GC-PRO 2026-02-27 驗證通過，正確讀取 sprint-status.yaml 並產出完整狀態報告

---

## 預估效益

| 指標 | Before | After | 節省 |
|------|:------:|:-----:|:----:|
| 專案 GEMINI.md 行數 | 832 | ~150 | -682 行 |
| Token 消耗/對話 | ~8,000 | ~1,500 | -6,500 tokens |
| 與 CLAUDE.md 結構差異 | 完全不同 | 同構 | 維護成本大幅降低 |

### 合併 TRS-20 + TRS-21 總效益

| 指標 | Before | After | 節省 |
|------|:------:|:-----:|:----:|
| GEMINI 憲章總行數 | 1,220 | ~250 | **-970 行（-79.5%）** |
| Token 節省/對話 | — | — | **~9,300 tokens** |

---

## 風險

- 🟢 低：Gemini CLI 指令遵循度下降（核心規則保留，只刪重複內容）
- 🟡 中：精簡過度遺漏 Gemini 專屬行為（緩解：§8 獨立章節保留差異）
- 🟡 中：Antigravity IDE 讀取路徑差異（緩解：Antigravity 主要靠 `.agent/rules/`，不強依賴 GEMINI.md）

---

## Required Skills

> dev-story 和 code-review 執行時，必須先載入以下 Skills。

- 無特定 Skill 需求（純文件精簡任務）
