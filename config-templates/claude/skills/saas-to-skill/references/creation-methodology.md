# SaaS 模組 Skill 化完整規範（9 份跨引擎研究報告系統化整合）

> 綜合 ChatGPT / Claude / Copilot / DeepSeek / Gemini / GROK / Perplexity / 豆包×2 共 9 份研究報告。
> 原始報告：`claude token減量策略研究分析/saas-to-skills/`

---

## §1 建立優先順序

1. **先做全域約束**（多租戶隔離 + 命名規範）— 影響所有模組，報酬率最高
2. **再做高風險複雜模組**（金流/支付/權限）— 商業規則最複雜，最易被 AI 誤導
3. **然後做 MVP 核心模組**（編輯器/PDF）— 特殊邏輯多
4. **最後做輔助模組**（Design System/Tooltip/Progress）— 風險較低

## §2 十步映射清單

1. **梳理功能模組清單**：列出所有核心模組與子功能（讀 functional-specs/ + architecture/）
2. **拆解單一職責**：每個模組細分為單一職責明確的 Skill（見 §11 DDD 方法論）
3. **定義元數據**：YAML frontmatter（name, description）+ body metadata（version, watches）
4. **撰寫指令**：操作流程、約束條件、✅/❌ 範例（見 §8 反幻覺機制）
5. **綁定資源**：scripts/、references/、assets/ 分離
6. **設計權限**：allowed-tools 最小化（見 §14 安全合規）
7. **編寫測試**：觸發測試、邊界測試（見 §15 品質門檻）
8. **整合 CI/CD**：安全掃描 + 自動化驗證
9. **組合編排**：跨模組業務用 DAG 編排多 Skill
10. **定期治理**：Epic Audit 審核使用率、優化 token、版本升級

## §3 六區塊結構

| 區塊 | 內容 | 載入層級 |
|------|------|---------|
| YAML Frontmatter | name + description（路由導航） | L1：初始化掃描 |
| 核心概述 | 一句話總結 + 目標受眾 | L2：意圖命中 |
| 功能清單 | 支援的具體功能 | L2 |
| 絕對限制 | 不可違反的操作 | L2（防護網核心） |
| 執行步驟 | 逐步操作指南 | L2 |
| 參照路徑 | references/ 相對路徑 | L3：按需讀取 |

## §4 Spec + Skill 雙軌制

| 軌道 | 聚焦 | 產出 |
|------|------|------|
| **功能 Spec**（做什麼） | 業務需求 | 功能描述、交互邏輯、邊界、異常場景 |
| **Skill Spec**（怎麼做） | 技術約束 | 技能邊界、技術棧模式、編碼規範、測試標準 |

四階段工作流（豆包2 SDD 模式）：
1. **規劃**：PRD + Tech Spec + Memory Bank
2. **規範**：功能 Spec + Skill Spec + C1-C10 約束映射
3. **生成**：基於 Skill 約束產出 SKILL.md
4. **驗證**：quick_validate + 程式碼證據比對 + 三引擎同步

## §5 Token 預算控制

| 層級 | 預估消耗 | 載入時機 |
|------|---------|---------|
| L1 Metadata | ~100 tokens/skill | Session 啟動（全部掃描） |
| L2 Body | 1000-3000 tokens | 意圖命中（單一 Skill） |
| L3 References | 500-2000 tokens/file | 明確需要時（按需讀取） |

**預算限制**：
- description 總預算 = context window 的 2%（~16,000 字元）
- SKILL.md 本體 < 500 行
- description ≤ 1024 字元
- L1+L2 合計 < 5000 tokens
- `disable-model-invocation: true` = **零 context**（直到使用者呼叫）

## §6 Description 強推策略

Claude CLI 有「低觸發傾向」，description 必須刻意寫得積極：
- 中英文觸發關鍵字混合（≥10 個）
- 涵蓋常見用語 + 技術術語 + 模組名稱
- 明確列出「適用於：...」情境清單
- 避免過度泛化（「處理資料」）或過度狹窄（「修改第 42 行」）
- 將最重要的觸發詞放在前 100 字元（AI 注意力集中區域）

## §7 Not For / Boundaries

每個 Skill 必須明確聲明**不處理的範圍**：
- 防止與其他 Skill 職責衝突
- 防止 AI 將不相關任務路由到此 Skill
- 格式：`## 不適用範圍 (Not For)` + `❌` 前綴
- 每項附「用 `/xxx`」指引正確的 Skill

## §8 反幻覺機制（完整策略）

### 8.1 結構化知識注入（RAG 模式）
- Skill 中的商業規則必須基於程式碼事實，不可基於假設
- 每條規則附 `file:line` 程式碼證據
- references/ 綁定知識來源（DB Schema、API Spec、Canonical Source）

### 8.2 ✅/❌ 程式碼範例（反向約束）
- 約束描述使用 ✅/❌ 程式碼範例而非純文字
- ✅ 範例必須可直接編譯/執行
- ❌ 範例附原因說明
- 範例來自實際程式碼庫（非虛構）

### 8.3 MCP 即時 Grounding
- 靜態 SKILL.md 無法提供即時 Schema/API 狀態
- MCP Context Memory DB 提供即時資料補充（search_context / search_tech）
- 開發時先呼叫 MCP 確認真實欄位，再套用 Skill 規範
- 互補關係：Skill 管規則，MCP 管事實

### 8.4 單元測試與合成測試
- 為高風險約束編寫驗證測試（商業規則/金流/權限）
- 邊界條件必須在 Skill 中明確列出
- 測試命名：`{BR_ID}_{Scenario}_{ExpectedResult}`

### 8.5 Agent Drift 防控
- description 明確列出適用場景與負向約束
- 範圍化操作：限定可修改的檔案路徑、可調用的工具
- 多 Skill 協作時透過 DAG 明確依賴與數據流

## §9 跨平台路徑

| Agent | Skill 路徑 |
|-------|-----------|
| Claude Code | `.claude/skills/{name}/` |
| Gemini CLI | `.gemini/skills/{name}/` |
| Antigravity | `.agent/skills/{name}/` |

本專案使用 Claude + Gemini + Antigravity 三引擎。部署見 three-engine-spec.md。

## §10 Watches 設計指南

每個 SaaS 模組 Skill 必須在 body metadata 配置 watches glob patterns：

```
watches:
  - "src/.../Services/*Payment*.cs" (domain: payment)
  - "src/.../Controllers/*Webhook*.cs" (domain: payment)
```

- glob 覆蓋該模組的核心程式碼目錄（後端 + 前端）
- domain 標籤對應 DDD 領域
- dev-story 自動比對 file_list vs watches → 偵測 staleness

---

## §11 模組分解方法論（DDD + SRP）

### 聚合邊界分析

採用領域驅動設計（DDD）的**聚合（Aggregate）**概念作為 Skill 邊界的主要候選：
- **高功能內聚**：同一聚合根下的功能歸同一 Skill
- **持久化邊界**：共用同一資料表/Entity 的功能歸同一 Skill
- **松耦合**：跨聚合的操作透過 Service 層協調，不混入單一 Skill

### 粒度決策矩陣

| 信號 | 粒度決策 | 範例 |
|------|---------|------|
| 模組有 5+ 獨立功能 | 模組級 Skill | `phycool-payment-subscription`（含訂閱/退款/Webhook/序號） |
| 功能有專屬 UI 元件 + 獨立互動邏輯 | 功能級 Skill | `phycool-floating-ui`（FloatingToolbar/FloatingCard） |
| 跨 3+ 模組的技術模式 | 架構 Skill | `phycool-zustand-patterns`（所有 React 組件共用） |
| 單一橫切面（DB/部署/測試） | 基礎設施 Skill | `phycool-sqlserver`（所有 DB 操作共用） |

### 多租戶安全邊界（PhyCool 專屬）

所有涉及資料讀寫的 Skill 必須強制宣告：
- DB 查詢必須帶 TenantId/UserId 過濾（C1 約束）
- 禁止全域管理者權限繞過安全機制
- 所有 Service 層操作必須封裝在已驗證的 Controller/Server Action 中

## §12 商業規則編碼模式

### 規則結構

每條商業規則在 Skill 中的編碼格式：

```markdown
### BR-001: {規則名稱}

**規則**：{一句話描述}
**來源**：`{Service/Controller 路徑}:{行號}`
**約束分類**：C{N}（見 constraint-matrix.md）

✅ 正確做法：
```csharp
// 示例代碼
```

❌ 錯誤做法：
```csharp
// 示例代碼 — 原因：{為何錯誤}
```
```

### 商業規則來源優先級

1. **程式碼**（Service/Controller 實作）— 永遠是 source of truth
2. **功能規格**（functional-specs/）— 需與程式碼交叉驗證
3. **ADR 決策記錄**（technical-decisions/）— 架構決策補充
4. **記憶庫**（Context Memory DB）— 歷史決策參考

### 數值型規則強制要求

配額、價格、限制數量等數值型規則**必須附具體數值**：
- ❌ 「限制 PDF 頁數」
- ✅ 「Free plan 限制 MaxPdfPages = 2，含浮水印」

## §13 資料庫結構整合

### DB Schema 在 Skill 中的呈現方式

- **不要**在 SKILL.md 中嵌入完整 Schema dump
- **要**在 references/ 中提供關鍵 Entity 摘要（欄位名 + 類型 + 約束）
- **要**指引 AI 使用 MCP `search_symbols` 查詢最新 Schema
- **要**列出 Entity 間的關聯關係（FK、Navigation Property）

### Migration 變更追蹤

- Skill 中引用的 Entity/Column 名稱必須與最新 Migration 一致
- Migration 新增/修改時，觸發 Mode B 更新流程
- watches glob 包含 `Migrations/**/*.cs`

## §14 安全合規模式

### 最小權限原則

- Skill 可選配 `allowed-tools` 限制可用工具
- 唯讀分析型 Skill：`allowed-tools: Read, Grep, Glob`
- 開發型 Skill：不設 allowed-tools（使用預設全工具）
- 部署型 Skill：`disable-model-invocation: true`（必須手動觸發）

### 敏感資料防洩漏

- Skill 中禁止硬編碼任何 secrets（API Key / Connection String / Password）
- 引用路徑時使用環境變數或 Azure Key Vault 語法
- 測試帳號資料允許寫入 Skill（已在 CLAUDE.md 中公開）

### C1-C10 約束強制

建立任何新 Skill 時，必須對照 constraint-matrix.md 標記涉及的約束類別。
🔴 CRITICAL（C1/C2/C3/C6）約束必須在「絕對限制」區塊最前面。

## §15 品質門檻與測試策略

### 建立完成 Checklist

- [ ] SKILL.md ≤ 500 行
- [ ] description ≤ 1024 字元，含 ≥10 觸發關鍵字（中英混合強推）
- [ ] body metadata 含 version + watches + last_synced_epic
- [ ] watches glob 覆蓋核心程式碼路徑
- [ ] Not For 段落存在（明確排除範圍）
- [ ] 約束規則附 file:line 程式碼證據
- [ ] 每條商業規則附 ✅/❌ 程式碼範例（反幻覺）
- [ ] Token 預算 L1+L2 < 5000 tokens
- [ ] quick_validate.py 通過
- [ ] 三引擎檔案已部署且一致
- [ ] skills_list.md 已更新

### 觸發測試（Skill 準確性驗證）

建立完成後，以自然語言測試 Skill 是否正確觸發：
1. 用模組名稱提問 → 應觸發對應 Skill
2. 用功能關鍵字提問 → 應觸發對應 Skill
3. 用不相關提問 → 不應觸發此 Skill

### 邊界測試

- 約束邊界：故意違反 Skill 中的 ❌ 規則 → AI 應拒絕並引用約束
- 職責邊界：模擬跨 Skill 的請求 → AI 應引導至正確 Skill

## §16 MCP 即時 Grounding 整合

### 靜態 Skill vs 動態 MCP 的互補關係

| 維度 | 靜態 Skill（SKILL.md） | 動態 MCP（Context Memory） |
|------|----------------------|--------------------------|
| 內容 | 商業規則、約束、流程、模式 | 即時 Schema、API 狀態、歷史決策 |
| 更新 | 手動（Mode B 更新） | 即時（程式碼變更自動反映） |
| Token | L2 載入 ~2000 tokens | 按查詢消耗 |
| 適合 | 穩定規則、架構模式 | 動態資料、頻繁變更的結構 |

### 在 Skill 中引導 MCP 使用

```markdown
## 開發前置步驟
1. 使用 `search_symbols("{EntityName}")` 確認最新 Schema
2. 使用 `search_tech("{模組名}")` 查詢歷史技術決策
3. 確認程式碼中的欄位名與本 Skill 描述一致，若不一致以程式碼為準
```

## §17 強型別 Skill（C#/.NET Semantic Kernel）

PhyCool 後端使用 ASP.NET Core，可透過 Semantic Kernel 將確定性邏輯封裝為強型別 Skill：

```csharp
[KernelFunction("get_plan_price")]
[Description("查詢指定方案的價格")]
public Task<decimal?> GetPriceAsync(string planCode) { ... }
```

- 適用場景：計費計算、配額驗證、狀態機轉換等確定性邏輯
- 優勢：100% grounding，消除計算幻覺
- 與 SKILL.md 互補：SKILL.md 管開發規範，`[KernelFunction]` 管執行精度
