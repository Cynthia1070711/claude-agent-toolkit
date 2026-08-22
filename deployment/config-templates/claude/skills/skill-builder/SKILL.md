---
name: skill-builder
description: 建立或更新通用（非 phycool-* SaaS 模組）Claude Code 自訂 skill。當使用者要求建立新 skill、更新既有通用/工具 skill、擴展 Claude 能力、workflow 自動化、或說「幫我建立/更新一個 skill」時觸發。支援：Mode A 建立（從零規劃→產 SKILL.md→驗證打包）+ Mode B 更新既有通用 skill（生命週期同步，參照 saas-to-skill Mode B 8 面向驗證）。遵循 Claude Code 擴展規範（v2.1.85）。
version: 3.3.0
updated: 2026-05-29
argument-hint: "[skill-name] — e.g., api-generator, deploy-helper"
triggers:
  - create new skill
  - workflow automation
author: CC-OPUS
created: 2026-01-29
watches:
  - glob: ".claude/skills/skill-builder/scripts/*.py"
    domain: skill
last-synced-epic: epic-skl
last-synced-date: 2026-05-09
---

# Skill Builder (v3.0 — Lifecycle + Value Domain Validation)

> 依據 Claude Code v2.1.85 官方 Skill 規範（`claude-tools/references/extension-system.md`）

## 工作流程

```
使用者需求 → 1.釐清需求 → 2.決定架構 → 3.初始化 → 4.編寫內容 → 5.驗證
```

### 步驟 1：釐清需求

詢問使用者：
- 這個 skill 要解決什麼問題？
- 誰會觸發？使用者手動（`disable-model-invocation: true`）還是 Claude 自動？
- 需要什麼輸入（`$ARGUMENTS`）？
- 在主對話 inline 執行，還是隔離 subagent（`context: fork`）？
- 需要即時資料注入（動態預處理語法）嗎？

### 步驟 2：決定架構

根據需求選擇 Skill 類型和功能：

**Skill 類型選擇：**

| 類型 | 何時使用 | 範例 |
|------|----------|------|
| 參考型（Reference） | 背景知識、規範、慣例 | API 設計規範、編碼標準 |
| 任務型（Task） | 有明確步驟的操作 | 部署流程、commit 工作流 |
| 工具型（Tool） | 多種獨立操作 | PDF 工具、SQL 輔助 |
| 能力型（Capability） | 整合多功能系統 | 專案管理、資料分析 |

**Frontmatter 功能選擇（完整清單）：**

| 欄位 | 用途 | 何時使用 |
|------|------|---------|
| `name` | 顯示名稱（kebab-case, ≤64 字元） | 建議必填 |
| `description` | Claude 判斷何時載入的依據 | 建議必填，務必詳細 |
| `version` | 版本號（semver） | **必填** — 版本管控追蹤用 |
| `updated` | 最後更新日期（YYYY-MM-DD） | **必填** — 追蹤 Skill 時效性 |
| `argument-hint` | 自動完成提示 | 有參數時加 |
| `disable-model-invocation` | `true` = 僅使用者可觸發 | 有副作用的操作（deploy, commit） |
| `user-invocable` | `false` = 隱藏 `/` 選單 | 背景知識，使用者不需手動呼叫 |
| `allowed-tools` | 活躍時自動核准的工具 | 限制工具存取（唯讀模式等） |
| `model` | 模型覆寫 | 需要特定模型（如 Opus 做複雜分析） |
| `effort` | 推理深度覆寫 | `low`/`medium`/`high`/`max` |
| `context` | `fork` = 隔離 subagent 執行 | 研究任務、不需對話歷史 |
| `agent` | `context: fork` 時的 subagent 類型 | `Explore`/`Plan`/`general-purpose`/自訂 |
| `hooks` | Skill 生命週期 hooks | 需要事件觸發腳本 |
| `shell` | `bash`（預設）或 `powershell` | Windows 環境 |
| `watches` | staleness 偵測 glob 陣列 | SaaS 模組 Skill 建議加 |
| `author` | 作者標識 | 記錄建立者 |
| `created` | 建立日期（YYYY-MM-DD） | 記錄首次建立日期 |
| `last-synced-epic` | 最後同步的 Epic ID | saas-to-skill Mode C 使用 |
| `last-synced-date` | 最後同步日期（YYYY-MM-DD） | staleness detection |

**Invocation Control 決策：**

| 設定 | 使用者可呼叫 | Claude 可呼叫 | Context 載入時機 |
|------|:-:|:-:|------|
| 預設 | Yes | Yes | description 常駐, 全文按需載入 |
| `disable-model-invocation: true` | Yes | No | 零 context，呼叫時才載入 |
| `user-invocable: false` | No | Yes | description 常駐, 全文按需載入 |

**目錄結構決策：**

| 目錄 | 何時使用 |
|------|---------|
| `references/` | 詳細文件、API 規格、schema（>SKILL.md 可容納量時拆分） |
| `scripts/` | 可執行腳本（Python/Bash/Node.js） |
| `assets/` | 模板、圖片、樣板專案 |

**Freedom Level 決策（Skill 自由度 × 類型對應）：**

| Skill 類型 | Degree of Freedom | 適用場景 | PhyCool 範例 |
|-----------|:-----------------:|---------|-------------|
| Reference（參考型） | 低 | 純查詢/索引，Agent 照章取用 | `claude-tools` |
| Task（任務型） | 中低 | 執行特定任務，有明確步驟 | `start-servers` |
| Tool（工具型） | 中 | 提供工具/腳本，多種獨立操作 | `tasks-backfill-verify` |
| Capability（能力型） | 中高 | 提供領域能力，整合多功能系統 | `phycool-payment-subscription` |
| Discipline（紀律型） | 高 | 強制紀律/規範，Agent 必須服從 | `constitutional-standard` |

> Freedom Level 越高 → Iron Law 越嚴格 → §步驟 6 Pressure Test 越重要。

**生命週期設計（SaaS 模組 Skill 必看）：**

| 問題 | 答案 → 設定 |
|------|-----------|
| Skill 管理的程式碼會隨 Story 變動嗎？ | Yes → 加 `watches` glob |
| 此 Skill 是 SaaS 模組還是工具型？ | SaaS → 用 `/saas-to-skill` 建立 |
| 需要追蹤最後同步的 Epic 嗎？ | Yes → 加 `last-synced-epic` |
| 版本策略？ | patch=規則微調 / minor=新增規則 / major=架構變更 |

### 步驟 3：初始化 Skill

```
python .claude/skills/skill-builder/scripts/init_skill.py <skill-name> --path <目標路徑>
```

或手動建立目錄結構。skill-name 規則：小寫字母 + 數字 + 連字號，≤64 字元。

### 步驟 4：編寫 SKILL.md

**核心原則：**
- SKILL.md < 500 行，大文件拆到 `references/`
- 只寫 Claude 不知道的資訊（專案特有規範、模板、路徑）
- 用範例代替冗長說明
- 從 SKILL.md 引用 supporting files：`見 [reference.md](references/reference.md)`

**字串替換（Dynamic Values）：**

| 變數 | 說明 | 範例 |
|------|------|------|
| `$ARGUMENTS` | 所有傳入參數 | `/deploy staging` → `$ARGUMENTS` = `staging` |
| `$ARGUMENTS[N]` / `$N` | 第 N 個參數（0-based） | `/migrate SearchBar React Vue` → `$0`=SearchBar |
| `${CLAUDE_SESSION_ID}` | 當前 session ID | 用於 log 或 session-specific 檔案 |
| CLAUDE_SKILL_DIR (用 dollar+braces 包裹) | SKILL.md 所在目錄 | 引用腳本路徑 |

**動態注入（Preprocessing）：**

在 SKILL.md 中使用 `!` + backtick 包裹 shell 命令，Claude Code 會在送給模型前先執行並替換輸出。

範例用法（寫在 SKILL.md 中）：
- PR diff → 用 gh pr diff
- 變更檔案 → 用 gh pr diff --name-only
- PR 評論 → 用 gh pr view --comments

> 注意：上述語法會觸發 shell 權限檢查。如果 Skill 只是教學文件（如本 Skill），應避免直接寫入可執行語法。

**Extended Thinking 提示：**

在 skill 內容中加入 "ultrathink" 可觸發高深度推理。

**Supporting Files 引用方式：**

```markdown
## 額外資源
- 完整 API 規格見 [api-spec.md](references/api-spec.md)
- 使用範例見 [examples.md](references/examples.md)
```

### 步驟 5：驗證

```
python .claude/skills/skill-builder/scripts/quick_validate.py <skill-path>
```

驗證檢查：
- SKILL.md 存在且 < 500 行
- Frontmatter 格式正確
- name 符合 kebab-case 規則（≤64 字元）
- description 存在且 > 20 字元
- 引用的 supporting files 存在
- TB-LEVEL: description 字數 < 對應 budget level（getting-started 150 / frequently-loaded 200 / general 500）
- CSO-USEWHEN: description 前 150 字含「Use when」/「Triggers:」/「觸發」開頭詞
- CSO-3RD: description 用 third-person（避免 I / you / 我 / 你 等第一/二人稱代詞）
- CSO-ANTI-SUMMARY: description 不摘要 workflow body（避免「步驟 N」/「Phase N」/「Step N」）

## Context 成本注意事項

| 設定 | Context 消耗 |
|------|:---:|
| description（預設） | 佔 2% context budget（fallback 16,000 chars） |
| `disable-model-invocation: true` | **零**（直到使用者呼叫） |
| `user-invocable: false` | 佔 2% budget |
| Supporting files | **零**（Claude 用 Read 按需載入） |

超過 budget 時 `/context` 會顯示警告。Override: `SLASH_COMMAND_TOOL_CHAR_BUDGET` 環境變數。

## 腳本說明

| 腳本 | 用途 |
|------|------|
| `scripts/init_skill.py` | 初始化 skill 骨架 |
| `scripts/quick_validate.py` | 驗證 skill 格式 |
| `scripts/package_skill.py` | 打包成 .skill 檔案 |

### 步驟 6：Subagent Pressure Test（必做）

> ⚠️ **未做 Pressure Test → skill-builder 工作流程未完成。**
> 新 Skill 寫完就上線 = 沒有測試的程式碼上 production。

**執行流程**：

1. 識別 Iron Laws：從 SKILL.md FORBIDDEN 段落取出核心規則（1-3 條）
2. 設計 Pressure Scenarios：每條 Iron Law 至少 1 個「Agent 在壓力下如何被誘導違規」情境
3. Combine 3+ Pressures：設計多壓組合情境（時間壓力 × 路徑依賴 × 合理化動機）
4. Rationalization Table：從既有 feedback memory 取 verbatim 藉口，對照 Iron Law
5. Red Flags：列出可偵測的危險訊號（語言/行為/輸出格式/缺失步驟）

**完整範本見** [references/pressure-test-template.md](references/pressure-test-template.md)（含 5 區塊範本 + 真實 incident 範例）

**Freedom Level 與 Pressure Test 強度**：

| Freedom Level | Pressure Test 要求 |
|:-------------:|-------------------|
| Reference / Task | 1-2 Iron Laws + 1 Scenario |
| Tool / Capability | 2-3 Iron Laws + Combined Pressure Test |
| Discipline | 3 Iron Laws + 2+ Combined Tests + Rationalization Table（必填）|

---

## Mode B：更新既有通用 skill（v3.3.0 · 參照 saas-to-skill Mode B）

> 上方 5 步工作流程 = **Mode A 建立**。本 Mode B 補「**更新既有通用/工具 skill**」（生命週期同步），填補 gap：skill-builder 原僅建立、saas-to-skill 的 update 範疇排除通用 skill。
> **工具邊界（canonical）**：通用 skill 建立 + 更新 → **本 skill-builder**；phycool-* SaaS 模組建立 + 更新 → **saas-to-skill**。

### 觸發
通用 skill（如 ui-ux-pro-max / claude-token-decrease / party-to-pipeline）內容過期（對應 toolkit / 規範 / 行為 / 套件版本變更）或需 version bump。

### 5 步（參照 saas-to-skill Mode B §5.3 update 機制）
1. **READ 當前 skill 全文**（含 references/）
2. **READ 變更後對應來源**（toolkit / 方法論 / 規範，取 file:line 證據；通用 skill 對應的非 SaaS 業務 code）
3. **比對 skill 描述 vs 實態 → EDIT 不一致段落**（附證據）
4. **frontmatter bump**：version（patch=微調 / minor=新增 / major=架構）+ updated + last-synced-date
5. **8 面向全範圍驗證（直接參照 saas-to-skill §5.4）**：① FORBIDDEN/規範 ② user-story/行為 ③ code-pattern BAD/GOOD ④ references/ 子檔 Grep ⑤ Troubleshooting ⑥ Cross-Skill 引用一致 ⑦ Version History + frontmatter ⑧ FORBIDDEN Loophole Closure 三元素（Forbidden/Common Rationalization/Red Flag）
6. **skills_list.md 同步**（觸發詞有變時）

### 與 saas-to-skill Mode B 的差異（通用 skill 免做）
- ❌ 不走 SaaS-specific：C1-C10 約束矩陣 / 商業規則 ✅❌ grounding / DDD aggregate boundary（僅 phycool-* SaaS 模組）
- ✅ 共用：8 面向驗證 + 生命週期 frontmatter + Skill Sync 精神

> **字面調用紀律**：更新通用 skill 前必先 `Skill(skill="skill-builder")`（對齊 `skill-tool-invocation-mandatory.md` 矩陣 + skill-tool-invocation-guard.js v2 已 enforce「Create/update Workflow/Utility Skill → skill-builder」）。skill-builder 自身更新 = bootstrap → §Bootstrap Exemption（Memory decision 記錄）。

---

## 參考資料

- 完整 Frontmatter 規範 + 範本見 [skill-template.md](references/skill-template.md)
- 5 種 Skill 類型完整範例見 [skill-examples.md](references/skill-examples.md)
- Subagent Pressure Test 完整範本見 [pressure-test-template.md](references/pressure-test-template.md)

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **3.3.0** | **2026-05-29** | 補「Mode B：更新既有通用 skill」段落（參照 saas-to-skill Mode B update 機制 + 8 面向驗證），填補「更新既有 utility skill」工具 gap（skill-builder 原僅建立 / saas-to-skill update 排除 utility）。canonical 工具邊界：通用 skill 建立+更新→skill-builder / phycool-* SaaS→saas-to-skill。description 加「更新」+ Mode A/B。觸發：2026-05-29 UI v3 session ui-ux-pro-max(utility)更新誤用 saas-to-skill 暴露 gap（使用者裁定）。對齊 skill-tool-invocation-mandatory.md 矩陣補列 + §Bootstrap Exemption（自身更新）。 |
| **3.2.0** | **2026-05-09** | skl-02 上線 — quick_validate.py 加 4 條 CSO + Token Budget 檢查（TB-LEVEL / CSO-USEWHEN / CSO-3RD / CSO-ANTI-SUMMARY）；§步驟 5「驗證」段落補列 4 條新檢查；frontmatter last-synced-epic 更新為 epic-skl。 |
| **3.1.0** | **2026-05-08** | skl-01 上線 — §步驟 2 新增「Freedom Level 決策」表（5 類型：Reference/Task/Tool/Capability/Discipline）；§步驟 6 新增「Subagent Pressure Test（必做）」章節 + 引用 references/pressure-test-template.md（5 區塊範本）；未做 Pressure Test = 工作流程未完成 enforcement。 |
| 3.0.1 | 2026-04-05 | 修復 watches glob 路徑。 |
| 3.0.0 | 2026-04-05 | 初版建立，工作流程 5 步驟 + 腳本說明。 |
