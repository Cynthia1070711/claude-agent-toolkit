---
name: sdd-spec-generator
version: 1.2.0
updated: 2026-07-28
disable-model-invocation: true
description: "為 M/L/XL 複雜度 Story 產出 SDD Spec 文件。基於 SDD+ATDD+TDD 方法論，在 create-story 之前產出精確的技術規格（Business Rules + API Contract + DB Schema + Boundary Conditions），作為 Agent 開發閉環的約束邊界。測試規格表由 create-story step-06 §7.5 產出，非本 Skill 職責。觸發關鍵字：產出 spec, 建立規格, generate spec, spec-gen, SDD, 準備開發, 規格驅動"
triggers:
  - generate spec
  - SDD
  - spec-gen
author: CC-OPUS
created: 2026-03-11
last-synced-epic: epic-bwu
last-synced-date: 2026-07-28
---

# SDD Spec Generator (PhyCool 適配版)

將功能需求討論轉化為結構化 SDD Spec 文件，驅動 BMAD v6 的 create-story → dev-story → code-review 閉環。

```
需求討論 → [This Skill] → SDD Spec → create-story(AC+BR映射) → dev-story(TDD) → code-review(VSDD)
```

## 適用條件

| 條件 | 說明 |
|------|------|
| **啟用** | Story 複雜度 M/L/XL |
| **跳過** | Story 複雜度 S（AC 內嵌 BR 即可，無需獨立 Spec） |

## 輸出

僅產出一個文件：

| 文件 | 檔名 | 路徑 | 用途 |
|------|------|------|------|
| SDD Spec | `{story-id}-spec.md` | `docs/implementation-artifacts/specs/epic-{X}/` | Business Rules + API + DB + Boundary Conditions |

**不產出**：BDD Feature（已降級為需求溝通輔助）、Story（由 create-story workflow 產出）。測試規格表（具名測試案例表)由 create-story `step-06` §7.5 產出並寫入 `stories.testing_strategy`（M/L/XL 強制,七欄 schema 對照本 Spec §2 Business Rules;S 沿用既有格式),非本 Skill 職責 —— 2026-06-08 模型分層裁定(create/review=opus / dev=sonnet)使原「dev-story 直接從 BR 生成測試」的前提失效,詳見 `03-模型分層與測試職責裁定.md`。

## 執行流程

### Step 1: 讀取專案架構

讀取以下文件確認現有架構模式：
- `docs/project-planning-artifacts/architecture/platform-services.md`
- `docs/project-planning-artifacts/architecture/editor-canvas.md`（前端相關時）
- `docs/project-planning-artifacts/architecture/pdf-worker.md`（PDF 相關時）
- `docs/project-planning-artifacts/architecture/auth-payment.md`（認證/金流相關時）
- `docs/project-planning-artifacts/technical-specs/database-schema.md`（DB 相關時）
- `docs/project-planning-artifacts/technical-specs/error-codes.md`（Error Code 格式）

提取並遵守：
- MVC 分層模式（Controller → Service → Repository）
- 命名慣例（PascalCase C#、camelCase TS）
- 現有 data model 與關聯
- 技術選型（xUnit + FluentAssertions、EF Core、SQL Server）

### Step 2: 驗證需求完整性

確認以下項目清楚。缺失項**必須詢問使用者，禁止猜測**。

**必須確認：**
- [ ] 功能目的（解決什麼問題）— 對應 D0 Kernel Problem
- [ ] **Non-goals（明確不做什麼，劃範圍邊界防 scope creep）— 對應 §1.2 Out of scope + D0 Kernel Non-goals**
- [ ] **Success signal（可量測成功信號 + 驗證指令，feed Story D0 Kernel）— §1.4**
- [ ] 使用者角色（誰使用此功能）
- [ ] 主要操作流程（使用者如何互動）
- [ ] 資料模型（欄位、型別、與既有 table 的關聯）
- [ ] API endpoint（method, route, request/response）
- [ ] Business Rules（計算邏輯、約束、邊界值）— **每條必須獨立可測試，建議 EARS 句式**
- [ ] 錯誤處理（X 失敗時的行為）

**相關時確認：**
- [ ] 安全需求（auth, authorization, input validation）
- [ ] 效能約束
- [ ] Migration 影響（既有資料）

### Step 3: 指派 Feature ID

格式對齊 PhyCool 慣例：`{EPIC}-{TYPE}{NUMBER}`

範例：`QGR-A11`、`QGR-M10`、`TD-DB5`

### Step 4: 產出 Spec

讀取 `references/sdd-spec-template.md` 模板產出。

**語言規則：**
- Spec 主體使用**英文**（Agent 消費效率最高）
- Overview/Summary 區塊附繁中摘要（人類快速瀏覽）

**品質門檻：**
1. **每條 BR 必須可測試** — 有明確的 input → expected output
2. **BR 建議 EARS 句式** — `WHEN/IF/WHILE … SHALL …`，精確化系統契約（對齊 create-story template EARS + BDD 雙層）
3. **Success Signal 可量測** — §1.4 含驗證指令，禁描述性「正常運作」（feed Story D0 SPEC Kernel）
4. **SQL Server 原生型別** — `NVARCHAR(50)` 非 `string`；`DECIMAL(18,2)` 非 `float`
5. **Error Code 必須唯一** — 格式 `E-{MODULE}{SEQ}`，對齊 `error-codes.md`
6. **Boundary 值必須精確** — 具體數字，禁止「大量」「合理」
7. **不含實作細節** — Spec 說 WHAT，不說 HOW（無 C# class name、無 method signature）
8. **API route 對齊現有慣例** — 讀取架構文件確認 routing pattern

### Step 5: 輸出摘要

```
## 產出文件

功能: {Feature Name} ({Feature ID})
複雜度: {M / L / XL}
SDD Spec: docs/implementation-artifacts/specs/epic-{X}/{id}-spec.md

Business Rules: {N} 條（全部可測試）
API Endpoints: {N} 個
Boundary Conditions: {N} 個

下一步:
1. 審閱 Spec 正確性
2. 執行 create-story（AC 映射 Spec BR）
3. dev-story 從 BR 驅動 TDD
```

## 關鍵規則

1. **禁止捏造需求** — 對話未明確覆蓋的細節，必須詢問
2. **遵守現有架構** — 先讀架構文件，匹配其 pattern 和命名
3. **BR 必須可測試** — 每條 rule 是可驗證陳述
4. **Error Code 不重複** — 交叉檢查 `error-codes.md`
5. **Feature ID 一致性** — Spec 的 ID 必須對應後續 Story ID

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.2.0** | **2026-07-28** | **`bwu-2-create-testspec-production` — 解除舊有「dev-story 直接從 BR 生成 Test Skeleton」硬編碼敘述**。§輸出章節改為「測試規格表由 create-story `step-06` §7.5 產出並寫入 `stories.testing_strategy`,非本 Skill 職責」+ 引用 2026-06-08 模型分層裁定使原前提失效的理由(`03-模型分層與測試職責裁定.md`)。frontmatter description 同步補一句指向 §7.5。`Skill(skill="skill-builder")` Mode B。 |
| **1.1.0** | **2026-06-10** | **同步 BMAD workflow W1 蒸餾**：template §1.4 Success Signal（可量測 + 驗證指令，feed Story D0 SPEC Kernel）+ §2 BR EARS 句式建議；SKILL Step 2 加 Non-goals + Success signal 確認、品質門檻加 EARS + Success signal。對齊 `_bmad/.../create-story` D0 SPEC kernel + EARS/BDD 雙層 AC。維持 M/L/XL only（三層 spec 分層：重 SDD Spec / 中 D0 kernel / 輕 AC BR；S 卡用中+輕無重，使用者 2026-06-10 裁定）。走 `Skill(skill="skill-builder")` Mode B。 |
| 1.0.1 | 2026-04-05 | (既有版本) |

---

## 除錯參考

> 相關除錯知識請查閱 `docs/knowledge-base/` 目錄。
