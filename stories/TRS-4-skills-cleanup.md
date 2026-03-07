# TRS-4: Skills 清理

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-4 |
| **狀態** | done |
| **複雜度** | S |
| **優先級** | P1 |
| **執行時間** | 2026-02-24 20:00 |
| **依賴** | TRS-3（rules 已重組，避免 skill 與 rule 交叉引用問題） |
| **後續** | TRS-5 |

---

## 目標

刪除 22 個與 MyProject 技術棧無關的 Skills，降低每次新對話的 description 摘要 token 消耗，並大幅降低模型誤觸發不相關 Skill 的機率。

---

## 問題描述

42 個 Skills 中有 22 個對 MyProject 無用：

| 分類 | 數量 | 原因 |
|------|:----:|------|
| 完全不相關技術棧 | 13 | Go、Java/Spring Boot、PostgreSQL、ClickHouse、WebGPU — MyProject 用 C#/React/SQL Server |
| 已被專用 Skill 覆蓋 | 3 | backend-patterns、coding-standards、frontend-patterns — MyProject 已有 16 個專用 Skill |
| 需 bash hooks / 從未啟用 | 4 | continuous-learning v1/v2、strategic-compact、eval-harness — Windows 不支援 bash hooks |
| 已被 BMAD 覆蓋 | 2 | verification-loop、iterative-retrieval — BMAD code-review 已覆蓋 |

**關鍵影響**：22 個無關 Skill 的 YAML description 會干擾 Claude 的判斷樹，增加觸發 Go/Java/PostgreSQL 相關架構幻覺的風險。

---

## 驗收標準

- [x] 刪除 22 個 `.claude/skills/` 子目錄
- [x] 保留 20 個 Skills（1 憲章 + 15 MyProject 專用 + 4 通用工具）
- [x] `skills_list.md` 更新至僅列出保留的 20 個 Skills
- [x] 保留的 Skills 清單：constitutional-standard、15 個 myproject-*、ui-ux-pro-max、tdd-workflow、security-review、skill-builder

---

## 刪除清單（22 個）

```
golang-patterns, golang-testing,
springboot-patterns, springboot-security, springboot-tdd, springboot-verification,
java-coding-standards, jpa-patterns,
postgres-patterns, clickhouse-io,
webgpu-threejs-tsl, webgpu-claude-skill-main, project-guidelines-example,
backend-patterns, coding-standards, frontend-patterns,
continuous-learning, continuous-learning-v2, strategic-compact, eval-harness,
verification-loop, iterative-retrieval
```

## 保留清單（20 個）

```
constitutional-standard,
example-admin-module, example-auth-identity, example-business-api,
example-design-system, example-editor-arch, example-floating-ui,
example-i18n-seo, example-payment, example-pdf-engine,
example-progress-animation, example-sqlserver, example-testing-patterns,
example-tooltip, example-type-canonical, example-zustand-patterns,
ui-ux-pro-max, tdd-workflow, security-review, skill-builder
```

---

## 實際執行結果

### 瘦身前後對照

| 指標 | 瘦身前 | 瘦身後 | 減幅 |
|------|:------:|:------:|:----:|
| Skill 數量 | 42 | 20 | **-52%** |
| Description 摘要 token | ~800 | ~400 | **-50%** |
| skills_list.md 行數 | 140 | 47 | **-66%** |

### 修改檔案

| 操作 | 檔案路徑 |
|------|---------|
| 刪除 | 22 個 `.claude/skills/` 子目錄 |
| 重寫 | `.claude/skills/skills_list.md` |

### 驗收結果

- [x] 22 個子目錄已刪除
- [x] 20 個 Skills 完整保留（`ls` 確認）
- [x] `skills_list.md` 僅列出 20 個 Skills
- [x] 保留清單逐一核對：constitutional-standard (1) + example-admin-module, example-auth-identity, example-business-api, example-design-system, example-editor-arch, example-floating-ui, example-i18n-seo, example-payment, example-pdf-engine, example-progress-animation, example-sqlserver, example-testing-patterns, example-tooltip, example-type-canonical, example-zustand-patterns (15) + ui-ux-pro-max, tdd-workflow, security-review, skill-builder (4) = 20
