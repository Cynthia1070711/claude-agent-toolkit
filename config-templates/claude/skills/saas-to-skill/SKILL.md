---
name: saas-to-skill
description: "SaaS 平台模組功能轉換為 Agent Skill 的方法論工具。建立新 Skill、更新現有 Skill、偵測 Skill 過期並同步更新。當需要將 SaaS 模組封裝為 Skill、現有 Skill 內容與程式碼不一致、商業規則/Schema/路由/UIUX 變更後需同步 Skill 時觸發。觸發關鍵字：建立 skill, 新增 skill, 模組轉 skill, skill 過期, skill 更新, skill sync, create module skill, skill lifecycle, skill 生命週期, 功能轉 skill, saas to skill, skill 不一致, skill drift, skill staleness fix"
version: 3.3.0
updated: 2026-05-08
disable-model-invocation: false
user-invocable: true
triggers:
  - create skill
  - module to skill
  - skill stale
  - skill sync
  - skill drift
author: CC-OPUS
created: 2026-03-27
last-synced-epic: epic-skl
last-synced-date: 2026-05-08
---

# SaaS-to-Skill — SaaS 平台模組 Skill 化完整規範

> **version**: 3.3.0 | **author**: CC-OPUS | **updated**: 2026-05-08 | **last_synced_epic**: epic-skl
>
> **watches**: `.claude/skills/phycool-*/SKILL.md`, `.claude/skills/phycool-*/references/*.md`, `.claude/skills/skills_list.md`
>
> **知識來源**: 9 份跨引擎研究報告（ChatGPT/Claude/Copilot/DeepSeek/Gemini/GROK/Perplexity/豆包×2）
>
> **v3.2.0 變更**(2026-05-05):Single-Engine Mode 落地 — Mode B Phase 4 三引擎同步機制移除。本 Skill 不再執行 Copy-Item 至 `.gemini/.agent`,Skill 更新只在 `.claude/skills/` 進行。`.gemini/.agent` 保留作 frozen 5/1 baseline。詳見 `.claude/rules/single-engine-mode.md`。

基於 9 份業界研究的系統化規範：將 SaaS 平台的**模組、功能、商業規則、DB 結構、使用者故事、全平台架構**封裝為結構化 Agent Skill，並在程式碼演進時持續同步。

## 適用場景

- **建立新 Skill**：將 SaaS 模組功能轉換為 `.claude/` 引擎 Agent Skill
- **更新既有 Skill**：程式碼/商業規則/架構變更後同步 Skill 內容
- **Epic 審計**：批次盤點所有 Skill 的新鮮度
- **規範查詢**：查閱 Skill 建立方法論、品質門檻、反幻覺策略

### Skill 涵蓋範圍

| 類型 | 說明 | 現有範例 |
|------|------|---------|
| **模組 Skill** | 單一業務模組的完整規範 | `phycool-payment-subscription`, `phycool-auth-identity` |
| **功能子 Skill** | 模組內特定功能的深層指南 | `phycool-floating-ui`, `phycool-tooltip` |
| **架構 Skill** | 跨模組技術架構規範 | `phycool-editor-arch`, `phycool-zustand-patterns` |
| **基礎設施 Skill** | 部署/DB/測試/CI 等橫切面 | `phycool-sqlserver`, `phycool-azure-infra`, `phycool-e2e-playwright` |
| **商業規則 Skill** | 金流/訂閱/權限等商業邏輯 | `phycool-payment-subscription`, `phycool-business-api` |
| **資料操作 Skill** | 匯入匯出/批次操作規範 | `phycool-admin-data-ops` |

## 不適用範圍 (Not For)

- ❌ 非 SaaS 模組的 Workflow/Utility Skill 建立（用 `/skill-builder`，如 claude-launcher、worktree-manager）
- ❌ 執行時商業規則守護（已整合至各模組 Skill）
- ❌ 文檔同步（用 `/phycool-doc-sync`）
- ❌ Workflow/Utility 類 Skill（僅處理 SaaS 模組功能 Skill）

---

## Mode A: 建立新 Skill (Create)

### Phase 1 — 模組盤點與分析

**輸入**：模組名稱 / 功能規格路徑 / project-context.md

**步驟**：
1. 讀取模組功能規格（`functional-specs/` / `architecture/`）+ 程式碼（Controllers/Services/Models）
2. 分析模組 DDD 聚合邊界（高內聚功能歸同一 Skill）— 詳見 [creation-methodology.md §11](references/creation-methodology.md)
3. 比對 `skills_list.md` 現有 Skill：
   - **重疊**：已有 Skill 覆蓋 → 改用 Mode B 更新
   - **缺口**：子功能未被覆蓋 → 納入新 Skill
4. 約束映射：對應 C1-C10 約束矩陣（見 [constraint-matrix.md](references/constraint-matrix.md)）
5. 決定 Skill 粒度：模組級（如 payment-subscription）還是功能級（如 tooltip）

**輸出**：模組能力清單 + 約束映射 + 建議（新建 / 更新 / 合併）

### Phase 2 — 規格定義（Spec + Skill 雙軌）

| 軌道 | 聚焦 | 內容 |
|------|------|------|
| **功能 Spec**（做什麼） | 業務需求 | 功能描述、交互邏輯、邊界、異常場景 |
| **Skill Spec**（怎麼做） | 技術約束 | 技能邊界、技術棧模式、編碼規範、測試分類 |

**漸進式揭露設計**：
- **L1** Metadata：YAML frontmatter ~100 tokens（session 啟動掃描）
- **L2** Body：SKILL.md < 500 行（意圖命中載入）
- **L3** References：references/ 按需讀取（日常零 token）

### Phase 3 — SKILL.md 生成（六區塊結構）

依照模板生成：見 [skill-template.md](references/skill-template.md)

| 區塊 | 內容 | 要點 |
|------|------|------|
| 1. YAML Frontmatter | name, description, version, watches | description 觸發詞要「強推」，中英混合 |
| 2. 概述 + 適用/不適用 | 一句話定位 + Not For | 明確排除範圍防止誤觸發 |
| 3. 功能清單 | 模組支援的具體功能 | 每項附觸發關鍵字 |
| 4. 絕對限制 | 不可違反的商業規則 | 附 ✅/❌ 程式碼範例 |
| 5. 開發指南 | 逐步操作、常見模式 | 只寫 AI 不知道的資訊 |
| 6. 參照路徑 | references/ 子檔案連結 | 每個引用附用途說明 |

**Frontmatter 欄位決策矩陣**（12 官方欄位 — SaaS Module Skill 預設值）：

| 欄位 | SaaS Module Skill 預設 | 決策條件 |
|------|----------------------|---------|
| `name` | `phycool-{module}` | 必填，kebab-case ≤64 字元 |
| `description` | ≤1024 字元，≥10 觸發詞 | 必填，中英混合「強推」策略 |
| `version` | `1.0.0` | 必填，語義化版本（semver） |
| `updated` | 當天日期 | 必填，格式 YYYY-MM-DD |
| `argument-hint` | 不設 | 有參數輸入時才設（如 `/skill {story-id}`） |
| `disable-model-invocation` | `false` | SaaS Skill 需自動觸發；唯讀工具才設 `true` |
| `user-invocable` | `true` | 允許 `/name` 手動觸發；隱藏式 Skill 才設 `false` |
| `allowed-tools` | 不設（不限制） | 唯讀 Skill 才設 `Read, Grep, Glob` |
| `model` | 不設 | 僅需特定模型時才設（如 `claude-opus-4-6`） |
| `effort` | 不設 | 深度推理 Skill 才設 `high` 或 `max` |
| `context` | 不設 | 研究型/隔離型 Skill 才設 `fork` |
| `agent` | 不設 | 配合 `context: fork` 使用 |

> 非 SaaS 場景（Workflow/Utility Skill）欄位決策見 `/skill-builder`。

**品質門檻**：
- [ ] SKILL.md ≤ 500 行
- [ ] description ≤ 1024 字元，含 ≥10 觸發關鍵字（中英混合「強推」策略）
- [ ] watches glob 覆蓋對應程式碼目錄
- [ ] 約束規則能在程式碼中找到 file:line 證據
- [ ] Token 預算 L1+L2 < 5000 tokens
- [ ] 每條商業規則附 ✅/❌ 程式碼範例（反幻覺機制 — 禁止純文字約束）
- [ ] frontmatter 含 version + watches + last_synced_epic
- [ ] Not For 段落存在且與相鄰 Skill 無職責重疊
- [ ] disable-model-invocation + user-invocable 已顯式設定（非依賴預設值）
- [ ] 若 Skill 有副作用操作，hooks 欄位已記載或 dev_notes 說明無需 hooks

### Phase 4 — `.claude/` 部署(v3.2.0 簡化 — Single-Engine)

**部署步驟**:
1. 寫入 `.claude/skills/{name}/SKILL.md` + `references/`
2. 更新 `.claude/skills/skills_list.md` 索引
3. 驗證 frontmatter YAML 合法 + watches glob 命中

**v3.2.0 變更**: 原 Phase 4 三引擎對齊步驟(Copy-Item 至 `.gemini/.agent`)已**移除**。Skill 更新只在 `.claude/` 進行,`.gemini/.agent` 保留作 frozen 5/1 baseline,natural decay 是預期行為。詳見 `.claude/rules/single-engine-mode.md`。

> ⚠️ **不再執行**: `Copy-Item .claude/skills/{name}/* .gemini/skills/{name}/`(以及 `.agent`),md5 三引擎 verify,Phase 4 三引擎部署檢核。違反者請 Self-Check Q1 of `single-engine-mode.md`。

---

## Skill Sync Gate（強制門禁）

> ⚠️ **dev-story/code-review 的雙門禁之一**（另一個是 tasks-backfill-verify）。
> 規則定義：`.claude/rules/skill-sync-gate.md`

**觸發條件**：file_list 含 Migration/Model/Service/Controller/Route/Component 變更時自動觸發。

**dev-story 流程**：Step 8 後 → Grep 反向搜尋受影響 Skill → 產出 Skill Impact Report → 有命中則執行 Mode B → 標記 ✅

**code-review 流程**：Step 3 → 檢查 Impact Report → 未同步（⬜）= MUST FIX

**核心禁止**：受影響 Skill 不可「延後更新」— 必須在同一 Story 內同步,否則下次對話載入舊規範。

---

## Mode B: 更新現有 Skill (Lifecycle Sync)

> ⚠️ **核心目的**：防止 Skill 內容過期，導致 AI 調用時用舊設計覆蓋新設計。

### 5.1 變更觸發偵測

**自動偵測**（現有 watches 機制）：
- dev-story 比對 file_list vs watches glob → `skill-staleness()` 記錄

**語義偵測**（本 Skill 新增）：

| 變更類型 | 偵測信號 | 搜尋策略 |
|---------|---------|---------|
| 決策更正 | ADR 新增/修改、CR 結論改變設計 | Grep 全 Skill 搜尋舊決策關鍵字 |
| Schema 變更 | Migration/*.cs 新增/修改 | 解析 Entity/Column 名 → 反向搜尋 Skill |
| UIUX 流程變動 | Component/*.tsx 生命週期改變 | 比對 Skill 中 Workflow 段落 |
| 商業規則變動 | Service/*Feature*.cs 邏輯修改 | 商業規則關鍵字反向搜尋 |
| 路由變更 | Convention/Route/Area 檔案變動 | 路由路徑字串 Grep 全 Skill |
| 套件/版本升級 | package.json / .csproj 變動 | API 名稱/模式反向搜尋 |

### 5.2 影響分析

1. 從 dev-story file_list 提取核心變更概念（Entity、Route、Rule、API）
2. Grep 所有 `.claude/skills/*/SKILL.md` + `references/` 搜尋這些概念（全域）
3. 產出 **Skill Update Impact Report**：

```
| 受影響 Skill | 類型 | 受影響段落 (line) | 變更類型 | 嚴重度 |
|-------------|------|-----------------|---------|--------|
| phycool-payment-subscription | SaaS Module | L42: 退款流程 | 商業規則變動 | 🔴 HIGH |
```

> Skill 類型分類：SaaS Module (phycool-*) / Governance (constitutional-standard) / Tool-Workflow (claude-tools, tdd-workflow) / Third-Party (ECPay-API-Skill-master)

### 5.3 更新執行(v3.2.0 簡化 — Single-Engine)

```
1. READ 當前 Skill 全文(僅 .claude/skills/)
2. READ 變更後程式碼(取得 file:line 新證據)
3. 比對 Skill 描述 vs 程式碼實態
4. EDIT 不一致段落(附 file:line 新證據,只動 .claude/skills/)
5. 更新 frontmatter:
   - version: bump (patch=規則微調 / minor=新增規則 / major=架構變更)
   - last_synced_date: 當前日期
   - last_synced_epic: 當前 Epic
   - watches: 若程式碼路徑改變則更新 glob
6. 更新 description: 若觸發關鍵字有變
```

**v3.2.0 變更**: 原步驟「複製至 `.gemini/.agent`」已**移除**。`.gemini/.agent` 保留 5/1 baseline,natural decay。

### 5.4 八面向全範圍驗證 (v3.3.0 升級 — 面向 8 FORBIDDEN Loophole Closure)

> **核心原則**：Skill 更新不只改 SKILL.md 表面數值。必須逐一驗證以下 8 個面向。

| # | 面向 | 驗證方式 | 範例 |
|:-:|:--|:--|:--|
| 1 | **規範/FORBIDDEN** | 檢查是否需新增禁止模式或修改現有規則 | z-index 變更 → FORBIDDEN 加「禁止硬編碼 z-index」 |
| 2 | **使用者故事/行為** | Feature Access Status / flow 描述是否反映最新行為 | Gallery 刪除修復 → 更新「Gallery Access Status」 |
| 3 | **程式碼模式 BAD/GOOD** | 是否需新增 code pattern 範例 | EF Core pitfall → 新增 BAD/GOOD ExecuteUpdateAsync 範例 |
| 4 | **references/ 子檔** | Grep references/*.md 搜尋受影響關鍵字 → 若命中則同步更新 | token-tables.md 有 z-index 表 → 更新 |
| 5 | **Troubleshooting** | 是否需新增常見錯誤/除錯指引條目 | Toast 被遮蓋 → 加 troubleshooting 條目 |
| 6 | **Cross-Skill 引用** | 跨 Skill 引用的數值/名稱是否仍正確 | design-system z-index 改 → floating-ui 引用是否衝突 |
| 7 | **Version History** | frontmatter version/updated + Version History table（若有）更新 | 1.5.2 → 1.6.0 + 表格新增行 |
| 8 | **FORBIDDEN Loophole Closure** | 每條 FORBIDDEN 必含 3 元素：Forbidden / Common Rationalization / Red Flag | 見下方格式規範 |

#### 面向 8：FORBIDDEN Loophole Closure 格式規範

每條 FORBIDDEN 條目必須強制三元素，目的是將 70+ feedback memory 的「事後修補」轉為「事前免疫」：

```markdown
❌ **[Forbidden 行為描述]**
   Common Rationalization: "[verbatim Agent 藉口 — 取自 feedback memory]"
   Red Flag: [可偵測的早期訊號，如：輸出出現 X / 缺少步驟 Y / 行為模式 Z]
```

**範例（來自 skill-tool-invocation-mandatory v1.1.0 Incident）**：

```markdown
❌ **Edit / Write SKILL.md 而不先調用 Skill tool**
   Common Rationalization: "技術上對齊 SOP 步驟，效果一樣，只是方式不同"
   Red Flag: 輸出包含 Edit/Write 工具呼叫 SKILL.md 路徑，但無 Skill(skill="saas-to-skill") 前置調用記錄
```

**面向 8 驗證步驟**：

1. 列出 SKILL.md 所有 FORBIDDEN 條目（Grep `❌` 或 `FORBIDDEN` 段落）
2. 對每條確認三元素齊全：`Forbidden` (what) + `Common Rationalization` (why) + `Red Flag` (when)
3. Rationalization 必須取自 `memory/feedback_*.md` 或 Context Memory DB verbatim 引用，禁止虛構
4. Red Flag 必須是具體可偵測訊號（非「行為不正確」之類的空洞描述）

**驗證 Checklist**:

- [ ] (面向 1) FORBIDDEN/Validation Checklist 段落已檢查
- [ ] (面向 2) Feature Status / User Story 描述已更新
- [ ] (面向 3) BAD/GOOD code pattern 範例已新增（若適用）
- [ ] (面向 4) references/ 子檔案 Grep 確認無過期引用
- [ ] (面向 5) Troubleshooting 表格已檢查（若適用）
- [ ] (面向 6) Cross-Skill 引用 Grep 確認一致
- [ ] (面向 7) frontmatter version/updated + Version History table 已更新
- [ ] **(面向 8) 每條 FORBIDDEN 含三元素 (Forbidden / Common Rationalization / Red Flag)**
- [ ] 更新後每條規則有 file:line 程式碼證據
- [ ] 未刪除仍有效的規則
- [ ] 新規則反映程式碼最新狀態
- [ ] watches glob 仍匹配目標程式碼路徑

> Incident (面向 1-7): 2026-04-13 — 手動更新 4 個 Skill 時只改表面數值（z-index 1000→1090），遺漏 Bootstrap 5 對照表、Toast Opacity Override pattern、Version History、frontmatter。被 Alan 追問後補做第二輪全量掃描。
> Incident (面向 8): 2026-04-28 Session 55 — 直接 Edit SKILL.md 繞過 Skill tool 調用，Agent rationalization「技術上對齊 SOP 精神，效果一樣」。觸發 skill-tool-invocation-mandatory v1.0.0 建立。面向 8 將此類 rationalization 轉為事前免疫條目。

### 5.5 完成檢核(v3.2.0 — Single-Engine)

- [ ] `.claude/skills/{name}/SKILL.md` Edit 完成 + frontmatter version bump
- [ ] `.claude/skills/skills_list.md` 觸發關鍵字同步更新(若有變)
- [ ] 七面向全範圍驗證 5.4 PASS

**v3.2.0 變更**: 原 5.5「三引擎同步」段落已**整段退役** — 不再執行 Copy-Item 至 `.gemini/.agent`,natural decay 是預期。

---

## Mode C: Epic Audit（批次新鮮度盤點）

> Epic 完成後或定期盤點，確保所有 Skill 與最新程式碼一致。

**觸發時機**：`/bmad:bmm:workflows:retrospective` 或手動執行 `/saas-to-skill audit`

**步驟**：
1. Glob 列出所有 `.claude/skills/phycool-*/SKILL.md`
2. 讀取每個 Skill 的 `last_synced_epic` — 與當前 Epic 比較
3. 過期 Skill（`last_synced_epic` ≠ 當前 Epic）→ 逐一執行 Mode B 流程
4. 產出 **Skill Freshness Report**：

```
| Skill | last_synced_epic | 當前 Epic | 狀態 |
|-------|-----------------|----------|------|
| phycool-payment-subscription | epic-fix8 | epic-qgr | 🔴 過期 |
| phycool-editor-arch | epic-qgr | epic-qgr | 🟢 同步 |
```

5. 過期 Skill 批次更新完成後，統一 bump version + 更新 `last_synced_epic`

---

## 與現有機制整合

| 機制 | 角色 | 互動 |
|------|------|------|
| `watches` glob | 檔案變更偵測 | 5.1 自動偵測的輸入源 |
| `skill-staleness` → DB | 過期記錄 | 5.2 影響分析的參考 |
| `phycool-doc-sync` | 文檔同步 | 互補：doc-sync 管文檔，本 Skill 管 Skill 內容 |
| `skill-builder` | 非 SaaS Skill | 分工：SaaS 模組 Skill 用本 Skill（自包含），非 SaaS Skill 用 builder |
| 各模組 Skill 內建約束 | 執行時守護 | 互補：各 Skill FORBIDDEN 區塊阻擋違規，本 Skill 確保規則正確 |
| MCP Context Memory | 即時資料 grounding | 互補：Skill 管靜態規則，MCP 提供即時 Schema/API 狀態防幻覺 |
| Semantic Kernel (C#) | 強型別 Skill | 互補：後端 `[KernelFunction]` 封裝確定性邏輯，SKILL.md 管開發規範 |
| **`.claude/rules/single-engine-mode.md`** (v3.2.0+) | Single-Engine SSoT 守護 | **本 Skill v3.2.0 不再執行 Phase 4 三引擎同步,遵循 single-engine-mode rule** |

---

## References

> **⚠️ Partial 三引擎敘述警告(v3.2.0+)**: 下列 references 仍含三引擎(`.gemini` / `.agent` / `Copy-Item` / 三引擎同步)歷史敘述(2026-05-05 ENV-03 scan 結果):
> - `three-engine-spec.md` — 整檔三引擎 spec(74 行,10 處)`[DEPRECATED]`
> - `lifecycle-sync-protocol.md` — 4 處(234 行)
> - `skill-template.md` — 3 處(173 行)
> - `creation-methodology.md` — 5 處(296 行)
> - `constraint-matrix.md` — 0 處(乾淨,不依賴三引擎)
>
> **新工作走 single-engine SOP** — 即 `.claude/skills/` 直接 Edit + version bump + 7 面向檢查。三引擎敘述屬歷史內容,Boy Scout Rule 自然觸碰時清理(Defer 列表中)。詳見 `.claude/rules/single-engine-mode.md` v1.0.0。

- 建立方法論（9 份研究報告精華）：[creation-methodology.md](references/creation-methodology.md) `[⚠ partial 三引擎敘述]`
- 生命週期同步協議：[lifecycle-sync-protocol.md](references/lifecycle-sync-protocol.md) `[⚠ partial 三引擎敘述]`
- SKILL.md 六區塊模板：[skill-template.md](references/skill-template.md) `[⚠ partial 三引擎敘述]`
- 三引擎差異對照：[three-engine-spec.md](references/three-engine-spec.md) `[DEPRECATED 2026-05-05 — Single-Engine Mode 落地後三引擎 sync 機制退役,本 reference 保留作歷史參考]`
- C1-C10 約束矩陣（分類 + 優先級 + 主責 Skill 映射）：[constraint-matrix.md](references/constraint-matrix.md) ✅ clean
- 模組-Skill 映射表：見 skills_list.md PhyCool 專案專用區段
- 9 份研究報告原始資料：`claude token減量策略研究分析/saas-to-skills/`（ChatGPT/Claude/Copilot/DeepSeek/Gemini/GROK/Perplexity/豆包×2）

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **3.3.0** | **2026-05-08** | skl-01 上線 — §5.4 七面向升八面向，新增「面向 8: FORBIDDEN Loophole Closure」強制三元素（Forbidden / Common Rationalization / Red Flag）。目的：將 70+ feedback memory 事後修補轉為事前免疫。Checklist 新增面向 8 驗證項目。frontmatter version 3.2.0→3.3.0。 |
| **3.2.0** | **2026-05-05** | **Single-Engine Mode 落地** — Mode B Phase 4 三引擎同步機制移除。本 Skill 不再執行 Copy-Item 至 `.gemini/.agent`,Skill 更新只在 `.claude/skills/` 進行。`.gemini/.agent` 保留作 frozen 5/1 baseline,natural decay 是預期。Phase 4 段落改為 single-engine `.claude/` 部署。Mode B 5.3 移除「複製至 .gemini/.agent」步驟。Mode B 5.5 三引擎同步段落整段退役,改為「完成檢核」。References 對 `three-engine-spec.md` 加 `[DEPRECATED]` 標記(reference 保留作歷史參考)。與現有機制整合表加入 `single-engine-mode.md` rule 互動。**保留核心**: Mode A/B/C 三種模式 + 七面向全範圍驗證 + 品質門檻 + watches 機制。觸發事件: 5/1 備份還原 + 使用者 5/5 決策(停三引擎 sync 機制 + 停 toolkit 鏡像)。詳見 `.claude/rules/single-engine-mode.md` v1.0.0(ENV-05 建立中)+ `專案環境配置健檢/stories/ENV-03-saas-to-skill-single-engine-rewrite.md`。 |
| 3.1.0 | 2026-04-13 | 七面向全範圍驗證(5.4)強化 — 新增 7 個面向 checklist 防止 Skill 更新只改表面數值遺漏實質內容。Incident: 2026-04-13 手動 z-index 1000→1090 更新遺漏 Bootstrap 5 對照表/Toast Opacity Override/Version History/frontmatter,被 Alan 追問後補。 |
| 3.0.0 | 2026-04-05 | Mode B/C 機制完善,Skill Sync Gate 強制門禁加入。 |
