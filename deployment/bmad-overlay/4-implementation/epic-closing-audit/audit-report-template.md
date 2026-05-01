# Epic 完結審計報告 — {{epic_id}}

> **執行日期:** {{date}}
> **觸發工作流:** `_bmad/bmm/workflows/4-implementation/epic-closing-audit`
> **觸發指令:** `/bmad:bmm:workflows:epic-closing-audit {{epic_id}}`

---

## 審計摘要

| 項目 | 結果 | 嚴重度 |
|------|------|--------|
| DB Schema 一致性 | _待填入_ | _待填入_ |
| 文檔過時狀態 | _待填入_ | _待填入_ |
| Skill 覆蓋率 | _待填入_ | _待填入_ |
| ADR 缺口數 | _待填入_ | _待填入_ |
| **整體健康分數** | **_/100** | _待計算_ |

**生成修復 Story 數:** _待填入_

---

## Section 1：DB Schema 一致性審計

### 1.1 Migration 狀態

| 項目 | 值 |
|------|-----|
| **最新 Migration 名稱** | _待填入_ |
| **最新 Migration 日期** | _待填入_ |
| **database-schema.md 最後更新** | _待填入_ |
| **差距天數** | _待計算_ |
| **嚴重度** | _CRITICAL / WARNING / OK_ |

### 1.2 Epic 新增 Entity/欄位

| Entity / 欄位 | 所屬 Migration | 在 Schema 文檔中記錄？ |
|---------------|---------------|----------------------|
| _待填入_ | _待填入_ | ❌ / ✅ |

### 1.3 建議行動

_待填入（如需更新 database-schema.md 的具體章節）_

---

## Section 2：文檔過時掃描

### 2.1 Epic 修改的核心模組

| 模組類型 | 檔案清單（從 Story File List 提取） |
|----------|----------------------------------|
| Controllers | _待填入_ |
| Services | _待填入_ |
| Models | _待填入_ |
| Config / Program.cs | _待填入_ |

### 2.2 文檔新鮮度評估

| 文檔路徑 | 最後更新 | 差距（天） | 涵蓋的受影響模組 | 狀態 |
|----------|----------|-----------|-----------------|------|
| docs/project-planning-artifacts/technical-specs/database-schema.md | _待填入_ | _待計算_ | Models | _STALE / OK_ |
| docs/project-planning-artifacts/architecture/platform-services.md | _待填入_ | _待計算_ | Services | _STALE / OK_ |
| docs/project-planning-artifacts/architecture/authentication.md | _待填入_ | _待計算_ | Auth | _STALE / OK_ |
| docs/project-planning-artifacts/architecture/pdf-engine.md | _待填入_ | _待計算_ | PDF | _STALE / OK_ |
| docs/project-planning-artifacts/architecture/editor-architecture.md | _待填入_ | _待計算_ | Editor | _STALE / OK_ |
| docs/project-context.md | _待填入_ | _待計算_ | 全局 | _STALE / OK_ |

### 2.3 建議行動

_待填入（列出需優先更新的文檔及具體更新範圍）_

---

## Section 3：Skill 覆蓋率分析

### 3.1 覆蓋率摘要

| 指標 | 值 |
|------|-----|
| **Epic 新增模式總數** | _待填入_ |
| **已有 Skill 覆蓋** | _待填入_ |
| **無 Skill 覆蓋** | _待填入_ |
| **覆蓋率** | _%_ |

### 3.2 未覆蓋模式清單

| 新模式 / 新服務 | 類型 | 建議 Skill 主題 |
|----------------|------|----------------|
| _待填入_ | Service / Model / Frontend | _待填入_ |

### 3.3 建議行動

_待填入（建議新建 Skill 的優先順序）_

---

## Section 4：ADR 缺口評估

### 4.1 現有 ADR 總覽

- **ADR 總數:** _待填入_
- **ADR 目錄:** `docs/technical-decisions/`

### 4.2 Epic 重大架構決策

| 決策描述 | 決策類型 | 對應 ADR | 狀態 |
|----------|----------|----------|------|
| _待填入_ | 新 Entity / 新 Service / 新中間件 / 外部整合 | _ADR-XX 或 —_ | COVERED / NEEDS_ADR |

### 4.3 建議行動

_待填入（列出需新建 ADR 的決策，含建議標題）_

---

## Section 5：修復 Story 自動生成

### 5.1 生成 Story 清單

| Story ID | 標題 | 優先級 | 複雜度 | 觸發原因 |
|----------|------|--------|--------|---------|
| _待填入_ | _待填入_ | P0/P1/P2 | S/M/L | DB/Doc/Skill/ADR |

### 5.2 更新記錄

- **sprint-status.yaml:** _已新增 N 個 backlog 項目_
- **追蹤檔案:** _已建立 N 個 .track.md_

### 5.3 Context Memory DB 整合預留（AC-9）

> 若 TD-32a/b/c/d 完成後，以下查詢可改用 DB 介面：
> - 文檔新鮮度查詢 → `doc_index` 表
> - Skill 觸發歷史 → `workflow_executions` 表
> - 新 Story 寫入 → `stories` 表

---

## Section 6：總結與後續行動

### 6.1 整體健康評分

| 分類 | 得分 | 扣分原因 |
|------|------|---------|
| DB Schema (25分) | _/25_ | _待填入_ |
| 文檔新鮮度 (25分) | _/25_ | _待填入_ |
| Skill 覆蓋率 (25分) | _/25_ | _待填入_ |
| ADR 完整度 (25分) | _/25_ | _待填入_ |
| **總分** | **/100** | |

### 6.2 優先修復行動

1. _待填入（依優先級排序）_
2. _待填入_
3. _待填入_

### 6.3 下一次審計建議

- **下次觸發點:** Epic {{epic_id}} 完結後第一個新 Epic 的 50% 里程碑
- **建議使用:** `/bmad:bmm:workflows:epic-closing-audit {next_epic_id}`

---

*此報告由 Epic Closing Audit Workflow 自動生成 — TD-28*
