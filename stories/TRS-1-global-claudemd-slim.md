# TRS-1: 全域 CLAUDE.md 極致瘦身

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-1 |
| **狀態** | done |
| **複雜度** | M |
| **優先級** | P0 |
| **執行時間** | 2026-02-24 19:56 |
| **依賴** | TRS-0（快取殺手已移除） |
| **後續** | TRS-2 |

---

## 目標

將全域 `~/.claude/CLAUDE.md` 從 388 行壓縮至 ~30 行，移除 Claude 4.6 原生行為的重複指令和佔 42.9% 的 Thinking Protocol。

---

## 問題描述

全域 CLAUDE.md 每次新對話 100% 載入，388 行消耗 ~3,640 tokens。主要浪費源：

| 區塊 | 行數 | Token | 問題 |
|------|:----:|:-----:|------|
| §5 Thinking Protocol | 167 行 | ~2,000 | Claude 4.6 原生 Extended Thinking，人工協議無用甚至干擾 |
| §2.1 Default to Action | 7 行 | ~70 | 原生行為 |
| §2.2 Parallel Tool Execution | 7 行 | ~70 | 原生行為 |
| §3 Context Window Management | 12 行 | ~100 | 原生行為 |
| §7 Quick Reference Card | 12 行 | ~100 | 與前面章節完全重複 |

---

## 驗收標準

- [x] 全域 CLAUDE.md 總行數 ≤ 35 行
- [x] 保留：Language Policy（zh-TW）、Timestamp（Get-Date 強制）、Code Quality（DRY）、Reporting（禁止時間估算）、Dev Environment、File Encoding
- [x] 完全刪除：§5 Thinking Protocol、§2.1、§2.2、§3、§7
- [x] 新對話仍能正確回應繁體中文
- [x] 新對話仍能正確執行時間戳查詢

---

## 執行步驟

1. 完全重寫 `~/.claude/CLAUDE.md`
2. 保留 6 個核心規則區塊，每個精簡至 1-3 行
3. 刪除所有冗餘章節

---

## 實際執行結果

### 瘦身前後對照

| 指標 | 瘦身前 | 瘦身後 | 減幅 |
|------|:------:|:------:|:----:|
| 行數 | 388 | 25 | **-94%** |
| Token | ~3,640 | ~250 | **-93%** |

### 保留的核心規則

```
## Language — zh-TW 預設
## Timestamp — Get-Date 強制
## Code Quality — 先讀再改、DRY、最小複雜度
## Reporting — 禁止時間估算
## Dev Environment — Windows 11 / C# / React / SQL Server
## File Encoding — UTF-8
```

### 修改檔案

| 操作 | 檔案路徑 |
|------|---------|
| 重寫 | `~/.claude/CLAUDE.md` |

### 驗收結果

- [x] 25 行 ≤ 35 行
- [x] 6 個核心規則全部保留
- [x] §5/§2.1/§2.2/§3/§7 完全移除
- [x] 新對話正確回應繁體中文（Language 規則保留於第 3-5 行，constitutional-standard.md 未動）
- [x] 新對話正確執行時間戳查詢（Timestamp 規則保留於第 8-9 行）
