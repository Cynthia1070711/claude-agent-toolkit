# Token Reduction — 34 Scenario Quantification Reference

> 四維度分類、TRS 交叉比對、ROI 量化。來源：CC-Agent v10.0 報告 §16、RC-Agent 量化基線。

---

## 1. 量化基線（RC Report）

| 指標 | 改善前 | 改善後 | 減量幅度 |
|------|:------:|:------:|:--------:|
| Session 靜態成本 | 15,040 tokens/session | 2,990 + 800 | **-78%** |
| Sprint Status 讀取 | 6,000 tokens/Sprint | 400 tokens | **-93%** |
| 重複錯誤重現 | 頻繁 | 趨近零 | **-90%** |
| 跨 Agent 知識傳遞 | 手動文件 | DB 共享 | 質變 |
| 新 Agent 冷啟動 | 讀文件 | DB 查詢 | **-70%** |

---

## 2. 34 場景四維度分類

### 維度 1 — Token 節省（T1~T7）

| ID | 場景 | 節省幅度 | 優先級 |
|:--:|------|:--------:|:------:|
| T1 | Sprint Status 索引（1,500 → 100 tokens） | **-93%** | P0 |
| T2 | Story 精準欄位提取（不讀全文） | **-60%** | P1 |
| T3 | Skill 觸發優化（DMI 精準匹配） | **-30%** | P2 |
| T4 | Design Token DB 快取（不讀 front-end-spec.md） | **-90%** | P2 |
| T5 | 重複檔案讀取消除（session 內） | **-40%** | P1 |
| T6 | Workflow 去重（同 session 不重複觸發） | **-50%** | P2 |
| T7 | project-context.md diff 查詢 | **-70%** | P2 |

### 維度 2 — 精準查詢加速（Q1~Q8）

| ID | 場景 | 效果 | 優先級 |
|:--:|------|------|:------:|
| Q1 | Tech KB 搜尋（分鐘級 → 秒級） | 量變→質變 | P0 |
| Q2 | 錯誤模式匹配（相似問題自動預警） | 避免重蹈覆轍 | P1 |
| Q3 | 跨 Epic Story 搜尋 | 關聯發現 | P0 |
| Q4 | CR 歷史模式查詢（同類問題命中） | 審查一致性 | P1 |
| Q5 | 依賴影響分析（Story 間連鎖） | 風險預判 | P2 |
| Q6 | 設計決策追溯（ADR 快速定位） | 架構一致性 | P2 |
| Q7 | 測試案例搜尋（AC → Test → Code） | 覆蓋率可視化 | P2 |
| Q8 | 失敗方案預警（已知不可行路線標記） | 避免浪費 | P0 |

### 維度 3 — 多 Agent 治理（G1~G8）

| ID | 場景 | 效果 | 優先級 |
|:--:|------|------|:------:|
| G1 | 跨引擎上下文交接 | CC→GC→AG 無縫銜接 | P0 |
| G2 | 統一命名規範（glossary） | 術語一致 | P1 |
| G3 | CR 判斷一致性（歷史判例查詢） | 標準化 | P1 |
| G4 | Workflow 步驟審計日誌 | 追蹤可見 | P2 |
| G5 | 新 Agent 冷啟動注入 | 快速上手 | P1 |
| G6 | MEMORY.md 事故共享 | 跨引擎 lesson | P2 |
| G7 | Skill 觸發歷史追蹤 | 觸發模式分析 | P2 |
| G8 | 併發衝突偵測 | 同時編輯預防 | P2 |

### 維度 4 — 資料記錄共享（D1~D8 + QA1~QA3）

| ID | 場景 | 效果 |
|:--:|------|------|
| D1 | Sprint 回顧自動生成 | 自動彙整完成度+阻塞原因 |
| D2 | Agent 產能 Dashboard | 每引擎 Story 完成率/tokens 消耗 |
| D3 | 技術債全景圖 | 嚴重度×模組 矩陣 |
| D4 | 效能基線趨勢 | build 時間 / test 耗時歷史 |
| D5 | 安全漏洞模式 | OWASP 分類命中率 |
| D6 | 使用者回饋關聯 | 回饋 → Story → 修復追蹤 |
| D7 | 文件版本索引 | 規格 vs 程式碼 drift 偵測 |
| D8 | 跨專案知識移植 | 可攜式記憶匯出 |
| QA1 | 測試覆蓋率趨勢 | AC → Test 覆蓋比例歷史 |
| QA2 | Flaky Test 黑名單 | 不穩定測試自動標記 |
| QA3 | AC 驗收歷史 | 接受/拒絕模式分析 |

---

## 3. P0 場景詳細分析

### T1 — Sprint Status 索引

**改善前**：每次 Workflow 讀取 sprint-status.yaml 全文（199+ 行，~1,500 tokens）。每 Sprint 讀取 4+ 次 = ~6,000 tokens。

**改善後**：`sprint_index` 表精準查詢。`SELECT * FROM sprint_index WHERE status='in-progress'` 回傳 ~100 tokens。

**節省**：6,000 → 400 tokens/Sprint = **-93%**

### Q1 — Tech KB 搜尋

**改善前**：遇到技術問題 → Grep 搜尋整個 codebase + 讀取多個參考文件 → 3,000~5,000 tokens × 人工判斷。

**改善後**：`search_tech("BackgroundService DbContext inject", { category: "pattern" })` → 300 tokens 精準結果，含歷史解法。

**效果**：分鐘級探索 → 秒級命中，+信心分數排名。

### Q8 — 失敗方案預警

**改善前**：Agent 嘗試已知不可行方案（如 ICU tokenizer 編譯問題、pgvector 本地安裝失敗），浪費 2,000~5,000 tokens。

**改善後**：`search_tech` 自動匹配 `category: "failure"` 記錄 → 「此方案在 Story X 已驗證不可行，建議改用 Y」。

**效果**：零浪費 + 直接指向替代方案。

### G1 — 跨引擎上下文交接

**改善前**：引擎交接依賴人工撰寫交接報告 + YAML 狀態讀取 → 交接資訊不完整，新引擎需重新理解上下文。

**改善後**：`search_context("", { story_id: "qgr-a2", limit: 5 })` → 自動取回 Story 完整決策歷史 + 最近 session 摘要。

**效果**：CC-OPUS → CC-SONNET 交接延遲從 ~3 分鐘降至 ~10 秒。

---

## 4. TRS 交叉比對

### TRS（Token Reduction Strategy）已完成成果

- Session 啟動稅：15,440 → 2,150 tokens/session（**-86%**）
- Workflow 最佳化：-14,200 tokens/Sprint cycle
- 操作最佳化：-19,550 tokens/operation
- QGR 65 Stories 預估節省 ~2.57M tokens

### Context DB vs TRS 互補性

```
34 場景中:
  TRS 完全覆蓋: 1 場景（T3 Skill 觸發最佳化 — 已由 DMI 實現）
  TRS 部分覆蓋: 2 場景（T5 重複讀取 — TRS 已減少但未消除）
  TRS 無法覆蓋: 31 場景（Q1-Q8 全部、G1-G8 全部、D1-D8 全部、QA1-QA3 全部）
```

**結論**：TRS = 管道瘦身（減少流入），Context DB = 精準灌溉（正確的水在正確的時機）。**互補不重疊**。

---

## 5. 知識累積複利效應

```
Phase 0: 查詢命中率 ~30%（僅 context + tech 兩表）
Phase 1: 查詢命中率 ~50%（+ stories + CR + symbols）
Phase 2: 查詢命中率 ~70%+（+ documents + vectors + graph）
Phase 3: 查詢命中率 ~85%+（+ conversations + workflow history）
```

每完成一個 Epic，記憶庫增加 ~50-100 條 context entries + ~20-30 條 tech entries + ~10-20 條 CR issues → 下一個 Epic 的查詢精準度持續提升。

---

## 6. 按場景分類的 Token 節省彙總

| 場景類型 | 改善前 tokens/次 | 改善後 tokens/次 | 節省 |
|---------|:----------------:|:----------------:|:----:|
| Sprint Status 查詢 | 1,500 | 100 | -93% |
| Story 文件讀取 | 800-2,000 | 200-400 | -60% |
| Tech 方案搜尋 | 3,000-5,000 | 300 | -90% |
| Design Token 查詢 | 1,000+ | 100 | -90% |
| 文檔語意搜尋 | 500-2,000/file | 300 (Hybrid) | -80% |
| Session 歷史查詢 | 不可能 | 200-500 | ∞ |
| 新 Agent 冷啟動 | 5,000-10,000 | 1,500 | -70% |
