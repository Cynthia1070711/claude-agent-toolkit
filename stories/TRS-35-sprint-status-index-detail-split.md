# 🟢 Story TRS-35: Sprint Status CR 摘要縮短 + 已完成 Epic 歸檔

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-35-SPRINT-STATUS-CR-SUMMARY-SLIM |
| **Epic** | Epic TRS - Token 減量策略 (Token Reduction Strategy) |
| **優先級** | P1 |
| **類型** | Optimization |
| **複雜度** | S (1-2 SP) |
| **狀態** | done |
| **來源** | Party Mode 討論 2026-03-01 + 深入分析報告校準 |
| **依賴** | 無 |
| **建立日期** | 2026-03-01 |
| **更新日期** | 2026-03-01 |
| **Create Agent** | Claude Opus 4.6 (CC-OPUS) |
| **Create完成時間** | 2026-03-01 09:35 |

---

## Story

As a 多引擎 AI Agent 開發者,
I want 縮短 sprint-status.yaml 每行的 CR 摘要格式並歸檔已完成 Epic,
so that 每行從 ~120 字元降至 ~40 字元（token 降 67%），同時解決 Edit 工具因長行匹配失敗導致 workflow 中斷的穩定性問題，且保留 Resume Mode 所需的關鍵指標。

---

## Background

### 現況問題

1. sprint-status.yaml 每行含完整 CR 摘要（~120 字元），導致 Edit `old_string` 匹配困難
2. Context window 接近滿載時，Edit 失敗導致 workflow 中斷退出（MEMORY.md 記錄 2 次）
3. CR 摘要在 sprint-status.yaml 中是第三份冗餘副本（CR report + tracking file 已有完整記錄）
4. 已完成 Epic（TRS 19 行、TD 28 行、QGR Skills 7 行）佔用不必要空間

### 深入分析報告結論

原方案（拆分 index + detail 檔案）被判定為 over-engineered：
- 拆檔不如縮行——零架構改動即可達成 70% 效果
- CR 摘要對 sprint-status workflow 的程式化處理無影響（YAML `#` 註解不被解析）
- 但 CR 摘要在 Resume Mode 銜接時提供「一眼總覽」價值，不應完全刪除
- **折衷方案**：保留關鍵指標（複雜度、CR 分數、測試數），砍冗餘資訊（Agent ID、日期、修復細節）

---

## 驗收標準 (Acceptance Criteria)

### AC-1: CR 摘要格式縮短
- [ ] 所有 done story 行縮短為統一格式：`story-id: done  # complexity, priority, CR:score, N tests`
- [ ] 範例：`qgr-a3-maintenance-middleware: done  # M, P1, CR:100, 46 tests`
- [ ] 移除：Agent ID、日期、修復細節、assigned/reviewed 資訊
- [ ] 保留：複雜度、優先級、最終 CR 分數、測試總數

### AC-2: 已完成 Epic 歸檔
- [ ] Epic TRS 全部 done stories（19 行）移至 sprint-status-archive.yaml
- [ ] Epic TD 全部 done stories（28 行）移至 sprint-status-archive.yaml
- [ ] Epic QGR Skills 全部 done（7 行）移至 sprint-status-archive.yaml
- [ ] sprint-status.yaml 行數從 ~240 行降至 ~186 行

### AC-3: 驗證
- [ ] sprint-status workflow 正常運作（計數不變）
- [ ] Edit 工具對縮短後的行格式匹配成功率驗證
- [ ] check-hygiene.ps1 通過

---

## 格式對照

```yaml
# Before (~120 字元):
qgr-a3-maintenance-middleware: done  # P1, M — CR R1:87 R2:100 (3H+5M+3L, 3H+L1 Fixed, 5M+2L WON'T FIX), CSS Token+審計日誌+測試補全, 46/46 tests (assigned: CC-OPUS, dev: CC-SONNET, reviewed: CC-OPUS 2026-03-01)

# After (~40 字元):
qgr-a3-maintenance-middleware: done  # M, P1, CR:100, 46 tests
```

## Token 減量預估（校準後）

| 指標 | 現在 | 優化後 | 節省 |
|------|------|--------|------|
| 每行平均字元 | ~120 | ~40 | 67% |
| 全檔 tokens | ~6,600 | ~3,700（縮行 + 歸檔） | 44% |
| Edit 穩定性 | 頻繁失敗 | 高度可靠（短行唯一匹配） | 質的提升 |
| 整體 workflow 節省 | — | ~2,900 tokens/次 | ~3-5% |

---

## Change Log

| 日期 | Agent | 動作 |
|------|-------|------|
| 2026-03-01 09:35 | CC-OPUS | 建立 Story（Party Mode 討論產出） |
| 2026-03-01 10:54 | CC-OPUS | 重寫為簡化版：縮行取代拆檔，保留折衷 CR 格式 |
| 2026-03-01 12:01 | CC-OPUS | 執行完成 — 244→180 行(-26%), 49 entries 歸檔至 sprint-status-archive.yaml |
