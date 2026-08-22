# Skill 生命週期同步協議

## 核心問題

Skill 是「凍結的知識」— 記錄建立時的程式碼狀態。但程式碼持續演進，若 Skill 不同步更新：
1. AI 載入過期 Skill → 產出基於舊設計的程式碼
2. 新程式碼被舊規則覆蓋 → 引入回歸 Bug
3. Code Review 才發現 → 浪費開發時間

---

## 一、六類變更觸發分類

### T1: 決策更正（Decision Corrections）

**場景**：Code Review 後決定改用不同架構模式
**偵測信號**：
- ADR（`docs/technical-decisions/`）新增或修改
- Code Review 報告中標記為「架構變更」的 issue
- 記憶庫 `add_context(category: "decision")` 新增記錄

**搜尋策略**：
1. 提取決策中的關鍵概念（如 `/admin/` → `/mgmt/`）
2. Grep 所有 `phycool-*/SKILL.md` + `references/` 搜尋舊概念
3. 逐一比對命中段落是否需更新

**受影響範圍**：可能影響任何 Skill，需全域搜尋

### T2: Schema 資料結構變更

**場景**：新增 Migration、修改 Entity、改變 Table 關聯
**偵測信號**：
- `Migrations/**/*.cs` 檔案新增或修改
- `Models/**/*.cs` 檔案結構改變

**搜尋策略**：
1. 解析 Migration 內容 → 提取變更的 Entity/Column 名稱
2. 搜尋所有 Skill 中引用該 Entity/Table 的段落
3. 特別關注 `phycool-sqlserver`、`phycool-admin-module`、`phycool-payment-subscription`

**受影響範圍**：資料模型相關 Skill + 引用該 Entity 的所有 Skill

### T3: UIUX 流程生命週期變動

**場景**：FloatingToolbar 改了互動模式、Canvas 新增操作步驟
**偵測信號**：
- React 元件 (`*.tsx`) 的 props/state/lifecycle 改變
- Zustand store 的 action/state 增刪
- CSS 動畫/過渡效果改變

**搜尋策略**：
1. 比對 Skill 中的「Workflow」「執行步驟」段落
2. 檢查「禁止事項」是否仍然有效
3. 檢查元件介面描述是否與新 props 一致

**受影響範圍**：`phycool-editor-arch`、`phycool-floating-ui`、`phycool-zustand-patterns`、`phycool-progress-animation`

### T4: 商業規則變動 🔴 最危險

**場景**：Free 版從限制功能改為全功能開放、退款政策變更
**偵測信號**：
- Service 層 (`*Feature*.cs`, `*Service*.cs`) 邏輯修改
- Controller 層權限/驗證邏輯改變
- 方案矩陣 / 定價 / 配額 數值變更

**搜尋策略**：
1. 從變更的 Service/Controller 提取商業規則關鍵字
2. **反向索引搜尋**：Grep 所有 Skill 中描述該規則的段落
3. 特別比對數值型規則（配額、價格、限制數量）

**受影響範圍**：`phycool-payment-subscription`、`saas-vibe-coding-guard`、`phycool-auth-identity`、`phycool-admin-module`

> ⚠️ 商業規則變動是最危險的變更類型 — 過期的規則會導致 AI 直接產出違反新規則的程式碼。

### T5: 路由變更

**場景**：Admin URL 從 `/Admin/` 改為 `/mgmt/`
**偵測信號**：
- Route Convention / Area config / Controller Route Attribute 變更
- Middleware 路由邏輯修改

**搜尋策略**：
1. 提取舊路由路徑字串
2. Grep 所有 Skill 內容搜尋硬編碼路由
3. 包含 references/ 中的程式碼範例

**受影響範圍**：`phycool-admin-module`、`phycool-auth-identity`、business-rules.md

### T6: 套件/版本/其他變更

**場景**：Fabric.js 升級、.NET 版本升級、安全策略調整
**偵測信號**：
- `package.json` / `.csproj` 版本變更
- 安全設定 (`appsettings.json`, Startup.cs) 修改
- Design Token CSS Variable 重命名

**搜尋策略**：
1. 從 dev-story file_list 提取變更的關鍵概念
2. 通用語義搜尋所有 Skill 內容

---

## 二、影響分析工作流

```
輸入: dev-story 完成後的 file_list + 變更摘要

Step 1: 變更分類
  → 將每個變更檔案歸入 T1-T6 類別

Step 2: 概念提取
  → 從變更中提取核心概念（Entity名、Route路徑、規則名、API名）

Step 3: 反向搜尋（全域）
  → Grep .claude/skills/*/SKILL.md + references/
  → 搜尋提取的概念關鍵字
  → 範圍包含非 phycool-* Skill（Governance/Tool-Workflow/Third-Party 類型）

Step 4: 影響報告
  → 產出 Skill Update Impact Report（表格格式）
  → 標記嚴重度：🔴 HIGH（商業規則/安全） / 🟡 MEDIUM（流程/UI） / 🟢 LOW（格式/命名）
  → 按 Skill 類型分類（見下方「非 phycool Skill 受影響情境」）

### 非 phycool Skill 受影響情境（全域搜尋新增範圍）

下列 Skill 雖非 phycool-* 前綴，但可能引用商業概念或技術路徑，全域搜尋時需一併掃描：

| 情境 | 受影響 Skill 類型 | 範例 |
|------|-----------------|------|
| 商業規則變動（定價/配額/退款政策） | Governance | `constitutional-standard`（引用退款條件） |
| 路由/URL 變更 | Tool-Workflow | `claude-tools`（引用 `/Admin/` 或 `/mgmt/` 路徑） |
| 測試標準變更（覆蓋率/門禁條件） | Tool-Workflow | `tdd-workflow`（引用覆蓋率門檻） |
| 金流/第三方整合變更 | Third-Party | `ECPay-API-Skill-master`（引用金流關鍵字） |
| 品質標準變更（Checklist 項目） | Tool-Workflow | `skill-builder`（引用 Skill 品質門檻） |

> 搜尋路徑：`.claude/skills/*/SKILL.md`（包含所有子目錄）
```

---

## 三、更新執行協議

### 前置條件
- 影響分析已完成，有明確的受影響 Skill 清單
- 變更後的程式碼已通過測試

### 執行步驟

```
1. READ 受影響 Skill 全文（SKILL.md + 相關 references/）
2. READ 變更後的程式碼檔案（取得 file:line 新證據）
3. 逐段比對：
   - Skill 中的每條規則 vs 程式碼實態
   - 識別：過期段落 / 缺失的新規則 / 數值不一致
4. EDIT 更新：
   - 修正過期描述（附 file:line 新證據）
   - 新增反映新程式碼的規則
   - 更新程式碼範例（✅/❌）
5. 更新 Frontmatter：
   - version: patch=規則微調 / minor=新增規則 / major=架構變更
   - last_synced_date: 當前台灣時間
   - last_synced_epic: 當前 Epic
   - watches: 若程式碼路徑改變則更新 glob
6. 更新 description：若觸發關鍵字需增減
7. 同步三引擎：.claude/ → .gemini/ → .agent/
8. 更新 skills_list.md：若觸發關鍵字有變
```

### FORBIDDEN

- ❌ 未 Read 程式碼就更新 Skill（盲改）
- ❌ 刪除仍然有效的規則
- ❌ 更新 Skill 後不同步三引擎
- ❌ 更新後不驗證一致性

---

## 四、一致性驗證清單

更新完成後，逐項確認：

- [ ] 每條規則有 file:line 程式碼證據
- [ ] 沒有刪除仍有效的規則
- [ ] 新規則反映程式碼最新狀態
- [ ] 數值型規則（配額、價格、限制）與程式碼一致
- [ ] 程式碼範例（✅/❌）可直接編譯/執行
- [ ] version 已正確 bump
- [ ] watches glob 仍匹配目標程式碼路徑
- [ ] 三引擎檔案一致（除 Claude 獨有欄位）
- [ ] skills_list.md 觸發關鍵字同步

---

## 五、Skill Sync Gate — 強制門禁整合

> 完整規則定義：`.claude/rules/skill-sync-gate.md`
> 與 `tasks-backfill-verify` 並列為 dev-story/code-review **雙門禁**。

### dev-story 整合點（Step 8 後、歸檔前 — **強制**）

```
1. 掃描 file_list → 提取核心變更概念（Entity/Route/Rule/API）
2. Grep 反向搜尋 .claude/skills/*/SKILL.md + references/（全域）
3. 產出 Skill Impact Report（表格：受影響 Skill | 段落 | 類型 | ✅/⬜）
4. 有受影響 Skill → 執行 Mode B 更新（含 version bump + 三引擎同步）
5. 更新後標記 ✅，附版本號和修改摘要
6. 無受影響 Skill → 記錄「Skill Sync Check: 無受影響 Skill」
```

**FORBIDDEN**：
- ❌ 跳過 Skill 影響掃描
- ❌ 受影響 Skill 標記「延後更新」（必須同一 Story 內同步）

### code-review 整合點（Step 3 深度審查 — **強制**）

```
1. 檢查 dev-story 是否已產出 Skill Impact Report
2. 未產出 → 自行執行掃描
3. 有受影響但未同步（⬜）→ 標記為 MUST FIX issue
4. 已同步（✅）→ Read 更新後的 Skill 確認與程式碼一致
```

### Epic Closing 整合點（Mode C — **強制**）

Epic 完成時：
1. 批次掃描所有 phycool-* Skill 的 `last_synced_epic`
2. 與當前 Epic 不符者 → 觸發批次更新
3. 更新所有相關 Skill 的 `last_synced_epic` + `last_synced_date`

### 執行順序

```
dev-story 完成 → Skill Sync Gate → tasks-backfill-verify → 歸檔
```
