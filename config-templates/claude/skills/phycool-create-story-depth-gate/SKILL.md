---
name: phycool-create-story-depth-gate
version: 1.6.1
updated: 2026-08-01
last-synced-epic: epic-bwu
author: CC-OPUS
domain: devops
description: >
  觸發:create-story workflow 進入 step-07 DB upsert 前的深度品質閘門(D1-D7)。依 file_list
  分消費/修改型 required_skills、ADR/IDD 交叉、PRD 源頭存在性裁決(涵蓋中文/含空白路徑)、
  Chrome MCP live reverify、迭代污染、跨 Story 一致性、Self-Write(testing_strategy 結構 +
  BR 覆蓋 fail-loud)。WARN 等同 BLOCK,除非 `--accept-warn` 明確接受。完整歷程見 §8。
triggers:
  - "create-story depth"
  - "story depth gate"
  - "深度驗證"
  - "深度閘門"
  - "depth validation"
  - "iteration pollution"
  - "迭代污染"
  - "cross-reference gate"
  - "skill read verify"
  - "ADR IDD cross-ref"
  - "chrome mcp reverify"
  - "stale reference detection"
watches:
  - glob: ".context-db/phycool.db"
    domain: devops
  - glob: "_bmad/bmm/workflows/4-implementation/create-story/**"
    domain: devops
  - glob: ".claude/rules/create-story-enrichment.md"
    domain: devops
allowed-tools: Bash, Read, Grep, Glob
---

# PhyCool Create-Story Depth Gate v1.0

> **Purpose**: create-story workflow **step-06 §9.5(5 維形式閘門)通過後,step-07 DB upsert 前**必執行的 **第二層實質深度閘門**。
>
> **設計原則**: 形式驗證(Q1 有 file:line / Q4 有 `- [ ]` / Q5 有 `### Phase N:`)**不等於**實質驗證。Skill 是否真讀了、ADR 是否真交叉了、Chrome MCP 是否真活驗了 — 這些必須強制檢查,否則 create-story 產出的 Story 會在 dev-story 階段撞牆(Skill 內容不符 / ADR 已 superseded / 實際 code 狀態已變)。
>
> **核心口號**: **形式 ≠ 實質,閘門要 Read 不要 List。**

---

## 1. Overview

### 1.1 為什麼需要 Depth Gate?

**觸發事件**(2026-04-14,`eft-gallery-templates-modal-wiring` Story 補全事故):

1. 5 維形式閘門(Q1-Q5)**全過**,Story 進 ready-for-dev
2. 但深度檢查發現 **8 個 issue**:
   - I1: GalleryController 讀半邊 → 誤判 gating(實際 dead code)
   - I2: IDD-COM-001 `platform_modules` 未同步 ADR v1.6(迭代污染)
   - I3: Skill `phycool-member-plans` §3.2 陳述過簡(未指 file:line)
   - I4: Skill `phycool-e2e-playwright` §3 `.auth/user.json` 命名過時
   - I5: auth.fixture.ts 無 per-plan fixture(Story E2E 模板引用不存在)
   - I6: 本 Story tech_debt 流程錯誤(`--inline status:resolved` 單步,正確應雙步驟)
   - I7: bf-3 父規格版本權限表與 ADR-BUSINESS-001 v1.2 衝突
   - I8: Chrome MCP SSL 阻擋 → live verify 無法執行

**根因**: 形式閘門只驗「有沒有 file:line 格式」「DoD 超過 5 條」,**沒驗「file:line 真的指向正確位置嗎」「DoD 真的涵蓋 ADR 變動嗎」**。

### 1.2 Depth Gate 設計目標

| # | 目標 | 實現方式 |
|:-:|------|---------|
| 1 | 強制 Read Skill 內容 | D1 要求對每個 `required_skills` 提供「Read 證據 + 引用章節」 |
| 2 | 強制 ADR / IDD 交叉 | D2 scan affected_files 反查 IDD forbidden_changes + 驗 ADR 版本 |
| 3 | 追溯原始需求 | D3 找 PRD / functional-spec 源頭附 file:line |
| 4 | Chrome MCP live 驗證 | D4 對 UI Story 強制 live DOM 抓取(pre-dev reverify) |
| 5 | 迭代污染偵測 | D5 驗 Background code snippet 行號漂移 + ADR 版本 + commit 存活 |
| 6 | 跨 Story 一致性 | D6 掃同 Epic + soft dep Story 的 file_list / AC 衝突 |

### 1.3 Not For

- 形式檢查(5 維 Q1-Q5)→ step-06 §9.5 已處理
- NULL field audit → step-07 已處理
- SDD Spec Gate → step-06 §0 已處理
- Tasks backfill → `/tasks-backfill-verify` 另有 Skill
- Code verification in dev-story → Constitutional Mandate + dev-story step-03 處理

---

## 2. 6 Depth Gates (D1-D6)

### 2.1 Gate D1 — Required Skills 實質 Read 驗證

**目的**: 避免「列 Skill 名但不讀內容」→ dev 依賴過時規範

**執行**:
1. 讀 DB `stories.required_skills`(逗號分隔字串)+ `stories.file_list`
2. **v1.6.0**:對每個 Skill 先以 `classifySkillRefs(required_skills, file_list)`(`.context-db/scripts/depth-gate-heuristics.js`)判定為 `modify`(該 skill 的 `SKILL.md` 在本卡 `file_list` 內)或 `consume`(只讀不改) —— 以 `{skill}/SKILL.md` 子字串比對 `file_list`,`file_list` 為 NULL/空時全部視為 `consume`
3. 對每個 Skill(不分 modify/consume):
   - Read `.claude/skills/{skill}/SKILL.md` 前 150 行
   - 抽取 frontmatter `version` + `updated` + `last-synced-epic`
   - 抽取相關章節(search SKILL 內匹配 Story 關鍵詞)
4. 在 `stories.dev_notes` 末尾附加:
   ```markdown
   ## Skill Verified (Depth Gate D1 @ {ts})
   - phycool-debt-registry@3.1.2 (updated 2026-04-14, synced epic-eft) §2.1 FIXED 流程 §6 5-Minute Rule
   - phycool-e2e-playwright@1.2.3 §3 目錄結構 §5 setup
   ...
   ```

**BLOCK 條件**:
- Skill 檔不存在(不分 modify/consume,皆 BLOCK —— v1.6.0 未弱化此既有檢查)
- Skill `updated` 早於 ADR last-modified > 60 天(Skill 可能過時)
- Skill 版本低於 required_skills 欄位期望版本

**WARN 條件**(不 BLOCK,寫 dev_notes 警告):
- **v1.6.0**:**僅 `modify` 型** Skill 的 `last-synced-epic` 非當前 Epic 才告警;`consume` 型(只引用不修改)不告警,但仍照常印出 `✅ verified` 行(可見度不減)。全庫實測(2026-08-01):epic drift WARN 對數由 2435 降至 250(原 2185 對 = 89.7% 屬 consume 型只讀 skill 誤告警)。判定邏輯見 `buildSkillReadReport()`(`.context-db/scripts/depth-gate-heuristics.js`),`run-depth-gate.js` 的 `runD1()` 為其薄呼叫端。

---

### 2.2 Gate D2 — ADR + IDD 交叉驗證

**目的**: 避免變更違反 forbidden_changes / 引用過時 ADR 版本

**執行**:
1. 從 `stories.affected_files` + `file_list` + `background` Grep 所有 `IDD-{TYPE}-\d+` 和 `ADR-{TYPE}-\d+` 引用
2. 對每個引用:
   - **ADR**: Glob `docs/technical-decisions/{ADR-*}.md` → Read → 抽 Review History 最新版本
     - 若 Story 引用版本(如 v1.0)< ADR 實際最新版本(如 v1.6)→ WARN iteration pollution
   - **IDD**: `mcp__phycool-context__get_intentional_decision idd_id={IDD-*}` → 取完整欄位
     - 驗 `forbidden_changes` 清單是否有任一項違反 Story 設計
     - 驗 `platform_modules` 是否涵蓋 Story affected_files 所屬 module
     - 驗 `related_skills` 是否涵蓋 Story `required_skills`
3. 再反查: 對每個 affected_file 呼叫 `search_intentional_decisions({file_path})` → 找隱性命中的 IDD
4. 在 `stories.dev_notes` 末尾附加:
   ```markdown
   ## ADR/IDD Cross-Ref (Depth Gate D2 @ {ts})
   - ADR-BUSINESS-001 v1.6 (Story 引 v1.2, WARN: 3 版差距,建議 re-verify) — 不違反
   - IDD-COM-001 (active, critical) — forbidden_changes: [3 項] — 本 Story 不違反
   - IDD-COM-001 platform_modules 缺 "Dashboard" (應擴展 — 建議 upsert-intentional merge)
   ```

**BLOCK 條件**:
- 違反任一 IDD `forbidden_changes`
- 引用的 ADR 為 `Superseded` 狀態

**WARN 條件**:
- ADR 版本過時(Story 引 v1.0,實際 v1.6)
- IDD `platform_modules` / `related_skills` 與 Story scope 不對齊(需更新 IDD)

---

### 2.3 Gate D3 — PRD / functional-spec 源頭追溯

**目的**: 確保 Story user_story 能追溯原始需求,避免「憑空出現」需求

**執行**:
1. 從 `stories.discovery_source` 欄位抽出源頭 hint(如 "Alan 問題 #7.2")
2. `mcp__phycool-context__search_documents query={title} category=functional-spec/prd/ux-spec` → 找原始需求段落
3. **v1.6.0**:`harvestSpecRefs(story.background, PROJECT_ROOT)`(`.context-db/scripts/depth-gate-heuristics.js`)取代原 `docs\/[\w\-./]+\.md` regex —— 從 background 收集候選(反引號片段 + 空白分隔 token)→ 守衛過濾(拒前導 `/`、拒含 `\`、要求 ≥2 段、拒 `.`/`*` 段)→ **以 `fs.existsSync` 檔案系統存在性為裁決者**,不再限定 `.md` 副檔名或 ASCII 字元類,涵蓋中文 / 含空白 / 目錄型 SSoT(如 `claude token減量策略研究分析/ATDD-SDD-TDD-BDD/規格驅動開發範式/`)。舊版「補 regex 的 Unicode 修飾符」修法經實測無效(該修飾符不改變 `\w` 的字元集合),故改走存在性裁決而非調整字元類。
4. 在 `stories.dev_notes` 末尾附加:
   ```markdown
   ## Requirement Source (Depth Gate D3 @ {ts})
   - PRD: docs/.../functional-specs/PCPT-MVP/5.*定價功能.md §3.2
   - Discovery: Alan 問題 #7.2+#8.2 (2026-04-07)
   - Supersede: ADR-BUSINESS-001 v1.2 覆寫原 bf-3 父規格 L56-60 版本權限表
   ```

**WARN 條件**(不 BLOCK):
- 找不到源頭 + `story_type != "Bug Fix"`(純 internal refactor 可 override)
- 找到源頭但已被 ADR superseded 未標註

---

### 2.4 Gate D4 — Chrome MCP Live Reverify (UI Story only) + SSL 三層對比 (v1.2)

**目的**: 對 UI Story 在 dev 開工前做「實況活驗」,抓出 Story Background 與當前實際狀態的差距

**觸發條件**(自動):
- `affected_files` 任一含 `.cshtml` / `.tsx` / `.razor` / `.css` / `.razor.cs`
- 或 `tags` 含 `ui` / `modal` / `dashboard` / `chrome-mcp-live`

**執行**:
1. 前置檢查:
   ```bash
   curl -k -s -o /dev/null -w "%{http_code}" https://localhost:7135
   curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
   mcp__chrome-devtools__list_pages
   ```
2. 若 backend/vite 非 200/302 → **BLOCK**,提示使用者啟動 server
3. 若 `navigate_page` 到 Dashboard 得 `chrome-error://` → **BLOCK**,提示:
   ```
   Chrome 拒絕 localhost 自簽憑證。請在 PowerShell 以管理員權限執行:
     dotnet dev-certs https --clean
     dotnet dev-certs https --trust
   重啟 Chrome 後 Depth Gate D4 將可執行。
   ```
4. 對每個主要 AC 執行 `evaluate_script` 抓 DOM 狀態,比對 AC 預期
5. 發現「實際 state ≠ AC 預設」→ 補 `dev_notes` `## Reverify Discrepancy` 段落 + 建議 AC 修正
6. 發現「非 AC 範圍內的 bug」→ 建議建立 follow-up Story
7. `take_screenshot` 存 `docs/implementation-artifacts/reviews/epic-{epic}/{story}-predev-d4-{plan}.png`

**BLOCK 條件**:
- Backend / vite 未跑
- Chrome SSL 阻擋未解決
- AC 主要行為實際狀態完全不符(需 Story scope 重審)
- **(v1.2 新增)SSL thumbprint 三層不匹配**: Kestrel cert ≠ CurrentUser\Root ≠ CurrentUser\My
  - 自動診斷: PowerShell 抓取三個 thumbprint 對比
  - 修復 4 步: (1) Remove-Item stale Root cert → (2) `taskkill /F /IM chrome.exe /T` → (3) `dotnet dev-certs https --clean && --trust` → (4) `start-servers pcpt --restart`(讓 Kestrel reload cert,常被遺漏)
  - 詳見 `phycool-e2e-playwright §8.5` + Memory DB `search_tech("dev-certs Chrome")` tech id=879

**WARN 條件**:
- AC 前提過時(如 Gallery 已全開放,Story AC-4 仍寫「Free 應顯示 previewHint」)→ 建議 AC 修正

---

### 2.5 Gate D5 — Iteration Pollution Detection

**目的**: 偵測 Story Background 引用的 code / commit / ADR 是否已漂移 / 被 revert / superseded

**執行**:
1. 從 `stories.background` Grep 所有 `FileName.ext:L\d+` 引用
2. 對每個引用:
   - `Read FileName.ext offset=L-3 limit=10`(Read 周圍 10 行)
   - 驗該 line 實際內容是否含 Story 描述的關鍵字
   - 若內容大幅偏離 → WARN 行號漂移
3. Grep Story 中所有 `commit {sha}` 引用,執行 `git cat-file -e {sha}` 驗 commit 存活
4. Grep Story 中所有 `ADR-*` / `IDD-*` 引用,驗:
   - ADR 檔案存在 + status 非 Superseded
   - IDD `status=active`(未 retired/superseded)
5. 在 `stories.dev_notes` 末尾附加:
   ```markdown
   ## Iteration Pollution Check (Depth Gate D5 @ {ts})
   - _DashboardModalsGallery.cshtml:6 (#galleryModal) — ✅ verified
   - _DashboardModalsGallery.cshtml:133 (#templatesModal) — ✅ verified
   - commit 73a2fb26 — ✅ alive in git log
   - ADR-BUSINESS-001 — ⚠ Story 引 v1.2, ADR 實際 v1.6 (3 版差距)
   ```

**WARN 條件**(不 BLOCK,但應補 dev_notes):
- 行號漂移 > 10 行
- ADR 版本差距 ≥ 2
- IDD status 為 retired

**BLOCK 條件**:
- commit 不存活(被 revert 或 rebase 刪除)
- 引用的 ADR 完全不存在

---

### 2.6 Gate D6 — Cross-Story Consistency

**目的**: 避免同 Epic 或 soft dep Story 修改相同檔案產生衝突

**執行**:
1. `search_stories({epic_id})` 取同 Epic 所有 Story(status != done 或 < 7 天完成)
2. 解析 `stories.dependencies` 欄位,遞迴找 soft dep Story
3. 比對當前 Story `affected_files` 與其他 Story `affected_files`:
   - 若同一檔案被兩 Story 修改且兩 Story 都 in-progress / ready-for-dev → **WARN 檔案衝突**
   - 建議 Sprint Planning 協調順序
4. 驗 `dependencies` 欄位的實際狀態(若 dep 為 done → OK;若 dep 為 backlog → WARN soft dep 未就緒)
5. 在 `stories.dev_notes` 末尾附加:
   ```markdown
   ## Cross-Story Dependency (Depth Gate D6 @ {ts})
   - eft-dashboard-free-gating-removal (soft dep, backlog, 檔案衝突: dashboard-core.js)
   - eft-e2e-per-plan-storage-state-setup (新建 sibling, backlog, 無衝突)
   ```

**WARN 條件**:
- 同 Epic + file 衝突未協調
- Hard dep Story 仍 backlog

**BLOCK 條件**:
- Story 聲稱依賴的 dep 實際不存在於 DB

---

### 2.7 Gate D7 — Self-Write Verification(v1.1 新增)

**目的**: Story DB 寫入後驗證各欄位實際內容完整性,偵測「Agent 執行聲稱成功但 DB 欄位實際為空/損壞/截斷」的情境(如 bash heredoc escape 失敗、template literal 未展開、regex replace miss)。

**觸發事件(v1.1, 2026-04-14)**: `eft-gallery-templates-modal-wiring` 修補時 Node bash heredoc 將 `${}`/backtick 吃掉,Phase 3.2 整段變為 `\` 字元,但 stdout 誤報 `Phase 3.2 replaced: YES`。Agent 信任 stdout 未 self-verify,使用者第 4 次追問才發現。D7 自動化防止此問題再發生。

**執行**(對 DB 已寫入的 Story 欄位):

**7.1 欄位最小長度檢查**:

| 欄位 | 最小長度 |
|------|:-------:|
| user_story | 100 |
| background | 300 |
| acceptance_criteria | 500 |
| tasks | 500 |
| dev_notes | 500 |
| implementation_approach | 1000 |
| testing_strategy | 500 |
| definition_of_done | 300 |
| risk_assessment | 200 |
| rollback_plan | 200 |

- `length == 0` → **BLOCK**(欄位空白)
- `length < minLen` → **WARN**(可能截斷/損壞)

**7.1b `testing_strategy` 結構驗證**(v1.5.0 新增,v1.5.1 抽出,M/L/XL only)：

補 7.1 純字元數檢查之不足 —「500 字元散文」與「500 字元合格案例表」在 7.1 下等價,7.1b 補結構驗證。判定邏輯位於 **`.context-db/scripts/testing-strategy-structure.js`**(`checkTestingStrategyStructure()`),比照 `markdown-normalize.js` 的抽出範式 —— 本 script 為 CLI(載入即 `main()`),內部函式無法被測試 import,抽出後由 `.context-db/tests/testing-strategy-structure.test.js` 回歸鎖定(**v1.6.1**:52 項,含識別碼形狀 BR id 述詞 + 該述詞的誤收守門 + vacuous-coverage fail-loud + whp-7 活體 30-token 回歸案例)。

四項斷言(任一不符 → **WARN**,S/XS 跳過不計)：

1. markdown 表格存在(表頭列 + `|---|` 分隔列)
2. **表格列中**≥1 個 cell 符合案例名 pattern(`{BR_ID}_{Scenario}_{Expected}`,BR id 段 + ≥2 段底線)
3. `acceptance_criteria` 以 `/\[Verifies:([^\]\n]+)\]/g` 抽出**識別碼形狀** BR id(**v1.6.1**:`BR` 後**直接接數字**(`BR001`)**或**接 `-`/`_` 分隔的英數段(`BR-G01` / `BR-PREVIEW-01` / `BR-CCG-L5-01`),末段須含數字;排除 `BR-00N`/`BR-XXX` 型佔位符,亦排除**僅以 BR 二字起首的一般識別碼**(`BRANCH-01` / `BROWSER-02` / `BRIDGE_V3` —— v1.6.0 的可選分隔符寫法會誤收這類,見 §8)—— 取代 v1.5.x 的純數字 `/^BR-?\d+$/i`,全庫實測 M/L/XL 卡中約六成半曾解析出 0 個 BR,本判準救回 241 卡、0 卡退步),正規化(轉大寫 + 去非英數)後比對**表格列**是否涵蓋,未覆蓋者具名列出
4. **v1.6.0 新增**:斷言 3 若解析出 **0 個** cited BR id(且 `testing_strategy` 非空、非 S/XS)→ fail-loud(訊息指出可行動原因:缺 `[Verifies:]` 標記,或標記內容皆非 BR id 形狀),取代 v1.5.x 的靜默 PASS —— 原「0 覆蓋卻仍 PASS」正是全庫 313/477 卡空轉的根因

severity 一律 **WARN**,不進 `result.blocks`(BLOCK 保留給既有 EMPTY / 格式損壞 / lifecycle 檢查)。

**掃描與比對紀律**(v1.5.1 修正,皆有回歸測試鎖定)：

- **行尾先正規化**(`\r\n?` → `\n`)才跑行錨定 regex。`upsert-story.js` 的 `normalizeMarkdownBreaks` 只處理 `\n`,DB 內確實存在含 CR 的 Story 欄位;未正規化時 CRLF 表格會被判成「無表格」→ 假 WARN → 依 `depth-gate-warn-mandatory-resolution.md` 升為 exit 2,擋掉合格 Story。對齊 `.claude/rules/crlf-normalize-discipline.md` §3.1。
- **覆蓋以表格列為準,且比對帶數字邊界**。BR-004 要求「≥1 case row 對映」,故只掃 `|` 開頭的列 —— 僅出現在前後散文的 BR id 不算覆蓋;數字邊界則使 `BR-01` 不會被只含 `BR-012` 的表誤判為已覆蓋。
- **案例數計 distinct**,同一案例名在多個表格重述不重複計入。
- **regex 字元類互斥以保線性**。`BR[A-Z]*` 與 `\d+`、`[^\]\n]+` 與其前綴皆不重疊 —— 「無巢狀量詞」不足以擔保線性,**相鄰且重疊**的量詞同樣會退化:v1.5.0 的 `[A-Z0-9]*\d+` 與 `\s*([^\]]+)` 實測 30k 字元 234ms、200k 字元約 10s(二次方),互斥化後同輸入 <1ms 且對真實案例名(含 `BRWH01_` 前綴)行為完全相同。

**7.2 格式損壞偵測**(regex-based pattern match):

| 模式 | 偵測 regex | 觸發情境 |
|------|-----------|---------|
| Triple-backslash sequence | `/\\{3,}/` | bash heredoc 連續 escape 失敗 |
| Unreplaced template placeholder | `/\$\{[\w-]+\}/` | JS template literal 未展開 |
| Empty/adjacent code fence | ``/```[^\n`]*\n\s*```/`` | 內容被吃掉剩空 code fence |
| Stray backslash + newline + bullet | `/\\\n(?:Step\|\*\*\|-)/` | escape 殘留於 Step/bullet 前 |
| Orphan backtick pair | ``/`\n\s*\n?`/`` | code fence 內容消失 |

任一 match → **BLOCK**

**7.3 Phase Breakdown 實際計數**:
- `implementation_approach` 中 `## Phase N:` 計數 < 2 → **WARN**

**7.4 DoD Checkbox 實際計數**:
- `definition_of_done` 中 `- [ ]` 計數 < 5 → **WARN**

**7.5 必填欄位**:
- `create_agent`, `sdd_spec`, `status` 任一 NULL/empty → **BLOCK**

---

## 3. CLI Usage

### 3.1 手動執行

```bash
# 對單一 Story 執行 D1-D7
node .claude/skills/phycool-create-story-depth-gate/scripts/run-depth-gate.js {story_id}

# 只執行特定 gate
node .claude/skills/phycool-create-story-depth-gate/scripts/run-depth-gate.js {story_id} --only D1,D4,D7

# 跳過 Chrome MCP(CI 環境無 Chrome)
node .claude/skills/phycool-create-story-depth-gate/scripts/run-depth-gate.js {story_id} --skip-d4

# Dry run(只輸出報告,不寫 DB dev_notes)
node .claude/skills/phycool-create-story-depth-gate/scripts/run-depth-gate.js {story_id} --dry-run
```

### 3.2 Exit Code

| Exit | 意義 |
|:---:|------|
| 0 | 全 Gate PASS |
| 1 | 有 WARN 但無 BLOCK(Story 可繼續,dev_notes 附警告) |
| 2 | 有 BLOCK(Story 退回 backlog) |
| 3 | Script 錯誤(非 Gate 失敗) |

### 3.3 Output 格式

輸出 markdown Report 到 stdout + 寫 `stories.dev_notes` 末尾:

```markdown
# Depth Gate Report — {story_id} @ {ts}

| Gate | Status | Summary |
|:---:|:------:|---------|
| D1 Skill Read | ✅ PASS | 4 Skills verified (@ versions) |
| D2 ADR/IDD | ⚠ WARN | IDD-COM-001 platform_modules 缺 Dashboard |
| D3 PRD Source | ✅ PASS | bf-3 parent-spec §3.2 located |
| D4 Chrome MCP | ✅ PASS | A4/A5/A1 live verified, 7 AC aligned |
| D5 Iteration | ⚠ WARN | ADR-BUSINESS-001 版本差距 v1.2 vs v1.6 |
| D6 Cross-Story | ✅ PASS | 無衝突 |

**Overall**: 4 PASS + 2 WARN + 0 BLOCK → Story ✅ can proceed with warnings
```

---

## 4. Workflow 整合

`_bmad/bmm/workflows/4-implementation/create-story/steps/step-06.5-depth-gate.md`(新檔)在 step-06 §9.5 後、step-07 前 invoke 本 Skill。

詳見 workflow step 檔案。

---

## 5. FORBIDDEN

- ❌ 跳過 Depth Gate 直接 step-07 upsert Story 為 ready-for-dev
- ❌ 5 維形式閘門全過 = 深度足夠(形式 ≠ 實質)
- ❌ UI Story 跳過 D4(除非使用者明確 override + server 不可用 + 記錄原因於 dev_notes)
- ❌ 列 Skill 名但不 Read 內容(D1 要求 Read 證據,否則 BLOCK)
- ❌ 引用 ADR 但不 Read 實際版本(D2 要求驗版本)
- ❌ 靜默忽略 WARN(必須 dev_notes 記錄,code-review 時逐項交代)

---

## 6. Quick Decision Flow

```
create-story step-06 §9.5 (5 維閘門) 通過
  ↓
Depth Gate D1 (Skill Read)
  ├ BLOCK → halt
  └ PASS → D2
        ↓
  D2 (ADR/IDD Cross-Ref)
  ├ BLOCK (違反 forbidden) → halt
  ├ WARN (版本差) → note + 繼續
  └ PASS → D3
        ↓
  D3 (PRD Source)
  └ PASS / WARN → D4
        ↓
  UI Story? ─── Yes → D4 (Chrome MCP Live)
        │              ├ BLOCK (server down / SSL) → halt
        │              ├ WARN (AC 前提過時) → note + 繼續
        │              └ PASS → D5
        │
        └── No → Skip D4 → D5
        ↓
  D5 (Iteration Pollution)
  ├ BLOCK (commit 不存在) → halt
  ├ WARN (行號漂移 / 版本差) → note + 繼續
  └ PASS → D6
        ↓
  D6 (Cross-Story Consistency)
  └ 輸出 Report + 寫 dev_notes + exit
        ↓
  step-07 (DB upsert + status=ready-for-dev)
```

---

## 7. Related Rules / Skills

- `.claude/rules/create-story-enrichment.md` — create-story 必填欄位 + 5 維品質閘門
- `.claude/rules/constitutional-standard.md` — Code Verification Mandate + Depth-First Verification
- `.claude/rules/skill-idd-sync-gate.md` — Skill 與 IDD 同步(dev-story / code-review 階段)
- `.claude/rules/tasks-backfill.md` — UI Task Chrome MCP Live Check(CR 階段)
- `/phycool-debt-registry` — Tech Debt Framework v3.0
- `/phycool-intentional-decisions` — IDD 4 層標註系統
- `/phycool-e2e-playwright` — Playwright 規範(D4 Chrome MCP alternative)

---

## 8. Version History

| 版本 | 日期 | 變更 |
|:---:|------|------|
| **1.6.1** | **2026-08-01** | **`bwu-8-gate-regex-and-audit-heuristics` code-review 修復同步(6 項 FIXED,3 項 ACCEPTED)**。**§7.1b 斷言 3 述詞收緊**:v1.6.0 交付的 `^BR[-_]?[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$` 中,`[-_]?` 的可選分隔符使任何**僅以 BR 二字起首的一般識別碼**同樣通過 —— CR 實測 `BRANCH-01` / `BROWSER-02` / `BRIDGE_V3` / `BREAKING-1` 全被計為 cited BR id,且是靜默計入,屬本卡所修病灶的同型復發。改為 `^BR(?:\d+\|[-_]…)$`(BR 後直接接數字,或必須有分隔符)。對全庫 3,863 個相異 `[Verifies:]` token 實測,新舊述詞判定 **0 分歧**(全庫無「BR + 字母且無分隔符」形態),故為純粹移除誤收路徑,零回歸;另補 2 道守門測試(`BR001_IdentifiersMerelyStartingWithBr_NotTreatedAsBrIds` + `BR004_RealBrIdShapes_SurviveTheNarrowing`),還原探針實跑確認轉紅,測試 50→52 項。**同批 CR 修復(不改本 skill 描述語意)**:`harvestSpecRefs` 的靜默 catch 改 fail-loud(四類畸形輸入實測皆不 throw,原註解宣稱的觸發情境不成立,而在一張以消滅 fail-silent 為主題的卡內留靜默 catch 自相矛盾);D3 harvest 的 scan-cost 守門拆為**兩道**(原僅一道且只覆蓋其中一個成本模型):① regex 掃描沿用重複輸入 + AC3 的 500ms 牆鐘斷言(該上界本為 regex 回溯而寫,實測 2ms);② 檔案系統呼叫改以 `vi.spyOn(fs,'existsSync')` **斷言呼叫次數**(每個存活候選恰一次 stat)而非時間 —— 本卡已將 D3 精度模型從「猜字元類」改為「問檔案系統」,呼叫次數才是新的成本模型,而原輸入去重後僅剩 1 個候選、根本測不到它。**牆鐘時間不適合量測此維度**:CR 實測 Windows 上耗時由檔案系統快取與機器負載主導、不隨候選數單調變化(n=30000 中位數 369ms 但 n=20000 為 681ms),故 code-review 第一版「30k 相異候選 + 500ms 時間斷言」連跑 5 次即紅 1 次(574ms);改計數後連跑 8 次全綠;AC6 的 fixture 量測註解補可重跑指令並標明數字為快照(AC 寫 380 列 / dev 測 354 / CR 測 488,同日三讀三個數,唯「空白 cell = 0」三方一致 —— 該裁定所依據的正是這個數);`harvestSpecRefs` JSDoc 的 "first-seen order" 校正為實際行為(反引號片段恆排在裸 token 之前,影響 D3 `.slice(0, 3)` 預覽取樣)。 |
| **1.6.0** | **2026-08-01** | **`bwu-8-gate-regex-and-audit-heuristics` — D1/D3/D7 三處比對範圍過窄 + 靜默 continue/跳過修復**。**D7**(§7.1b 斷言 3):`NUMERIC_BR = /^BR-?\d+$/i` 換為識別碼形狀述詞(`BR` + `-`/`_` 分隔英數段、末段須含數字),涵蓋 `BR-PREVIEW-01`/`BR-CCG-L5-01` 型多段前綴,同時保留排除 `BR-00N`/`BR-XXX` 型佔位符的原意 —— 全庫實測 477 張 M/L/XL 卡中 313 張(65.6%)曾解析出 0 個 BR,本判準救回 241 張、0 張退步(對 whp-7-guardian-daemon 活體 30-token fixture 斷言 `citedBrCount===24`,2 個帶尾綴散文的複合 token 仍拒)。**§7.1b 新增斷言 4**:0 cited BR 時由靜默 PASS 改 fail-loud(訊息含可行動原因),`testing_strategy` 為空時不重複報。**D3**:`docs\/[\w\-./]+\.md` regex(字元類不含中文、`docs/` 前綴硬編碼)換為**檔案系統存在性裁決**——harvest 候選(反引號片段 + 空白 token)→ 4 道守衛(拒前導 `/`/拒含 `\`/要求 ≥2 段/拒 `.`、`*` 段)→ `fs.existsSync`,涵蓋含空白的中文目錄型 SSoT。舊 debt 建議「補 Unicode 修飾符」經 Node v24.12.0 實測無效(`\w` 與該修飾符無關)。**D1**:新增 `file_list` 機械推導 consume/modify 分類,epic drift WARN 僅對 modify 型觸發,不弱化 SKILL.md 不存在的 BLOCK;全庫 epic drift WARN 對數 2435→250。判定邏輯抽至新檔 `.context-db/scripts/depth-gate-heuristics.js`(`harvestSpecRefs`/`classifySkillRefs`/`buildSkillReadReport`,同 `markdown-normalize.js` 抽出範式 —— `run-depth-gate.js` 載入即呼叫 `main()`,無法被測試 import),`.context-db/tests/depth-gate-heuristics.test.js` 16 項 + `testing-strategy-structure.test.js` 新增 11 項(50 項)+ `test-spec-audit.test.js` 新增 5 項(13 項)回歸鎖定。四處放寬各以還原探針驗證會轉紅(NUMERIC_BR 還原→2 案例紅;D3 harvest 還原→5 案例紅;D1 分類還原→1 案例紅;`resolveTestHit` 還原→1 案例紅)。消費 5 筆 open debt(`TD-DEPTHGATE-D7-NUMERIC-BR-REGEX-TOO-NARROW` / `TD-DEPTHGATE-D3-REGEX-MISSING-U-FLAG` / `TD-DEPTHGATE-D1-SKILL-CONSUME-VS-MODIFY` / `TD-BWU3-TESTHIT-FIRST-MATCH-MAY-BE-NON-TEST` / `TD-BWU3-FIXTURE-UNNAMED-NARROWER-THAN-TASK`),D3 那筆 `fix_guidance` 先更正(移除失效的「補 u 旗標」建議)再標 fixed。`Skill(skill="skill-builder")` Mode B(§Related 見 test-spec-audit.js AC5 resolveTestHit 修復,不在本 skill 範疇內另記)。 |
| **1.5.1** | **2026-07-28** | **`bwu-2-create-testspec-production` code-review — §7.1b 抽出至 `.context-db/scripts/testing-strategy-structure.js` + 四項掃描修正**。抽出理由:本 script 為 CLI(載入即 `main()`),內部函式無法被測試 import,v1.5.0 的判定邏輯因此零自動化覆蓋;比照 `markdown-normalize.js` 自 `upsert-story.js` 抽出的既有範式,配 `.context-db/tests/testing-strategy-structure.test.js` 26 項 vitest(6 項突變全數 RED 驗證)。修正:(1) **CRLF 表格被誤判「無表格」** —— `[ \t]*\n` 跨不過 `\r`,而 `normalizeMarkdownBreaks` 只處理 `\n`、DB 內確有含 CR 欄位,假 WARN 經 `depth-gate-warn-mandatory-resolution.md` 升為 exit 2 會擋掉合格 Story(違反 `crlf-normalize-discipline.md` §3.1);(2) **BR 覆蓋改以表格列為準 + 數字邊界比對** —— 原以整欄 substring 比對,散文提及即算覆蓋、且 `BR-01` 會被 `BR-012` 誤命中,偏離 BR-004「≥1 case row 對映」;(3) **案例數改計 distinct** —— 原計 occurrence,同名在多表重述會灌水(本卡實測報 44、實為 40);(4) **regex 字元類互斥化** —— v1.5.0 敘述的「無巢狀量詞」不足以擔保線性,相鄰重疊量詞 `[A-Z0-9]*\d+` 與 `\s*([^\]]+)` 實測 30k 字元 234ms、200k 約 10s(二次方),改 `[A-Z]*\d+` 與 `[^\]\n]+` 後同輸入 <1ms 且對 `BRWH01_` 等真實案例名行為不變;v1.5.0 標示的「3000 字元最壞輸入 <1ms」所用輸入並非真正最壞情況,敘述一併校正。另修正 usage 字串誤植的 `--only D1,D4`(parseArgs 只接受 `--only=` 等號形式,空格形式會被靜默忽略並跑完全部 gate)。`Skill(skill="skill-builder")` Mode B。 |
| **1.5.0** | **2026-07-28** | **`bwu-2-create-testspec-production` — D7 §7.1b `testing_strategy` 結構驗證新增** + **§7.7 自我指涉誤報修復**。§7.1b:M/L/XL 三項斷言(markdown 表格存在 / 案例名 pattern / AC-cited BR 覆蓋含正規化),S/XS 跳過,severity 一律 WARN 不進 blocks,regex anchored 無巢狀量詞(3000 字元最壞輸入 <1ms 實測)。§7.7 修復:掃描 `dev_notes` 前先切除本 script 自己 append 的 `# Depth Gate Report` 區段(對應 `TD-depth-gate-md-check-self-reference`),避免下一輪對自己上次輸出誤報換行 WARN。`Skill(skill="skill-builder")` Mode B。 |
| **1.0.0** | 2026-04-14 | Initial creation。觸發事件: `eft-gallery-templates-modal-wiring` Story 補全事故,identifies 8 issues 於形式閘門之外的深度問題。Skill 6 Gate 設計 + workflow step-06.5 整合 + rule 補強。 |
| **1.1.0** | 2026-04-14 | 新增 **Gate D7 Self-Write Verification** — 觸發事件: 同 Story 修補 I6 Phase 3.2 時 bash heredoc 吃掉 `${}`/backtick 導致 DB 欄位損壞,但 stdout 誤報 success。D7 自動化偵測(5 項:欄位最小長度 / 格式損壞 pattern / Phase 計數 / DoD checkbox 計數 / 必填欄位)防止 Agent 自寫自驗失誤。 |
| **1.1.1** | 2026-04-14 | D4 加 `--d4-manual` flag — Agent Chrome MCP 實測後可 bypass CLI curl probe(bash 環境 curl false-positive),script 檢查 dev_notes 是否含 `[Chrome MCP Live Verification @ ...]` marker 認證。 |
| **1.2.0** | 2026-04-14 | **D4 加 SSL thumbprint 三層對比** — PowerShell 抓取 Kestrel cert vs CurrentUser\Root vs CurrentUser\My,不匹配直接 BLOCK + 提示 4 步修復(清 stale Root / taskkill chrome / dev-certs re-trust / **start-servers pcpt --restart 讓 Kestrel reload cert**)。觸發事件: 本次 Story Wave 4 Chrome MCP 活驗時 SSL 阻擋,根因為 Kestrel long-running process 用記憶體舊 cert,不 reload,D4 原先無此檢查。See Memory DB tech id=879 + context id=3294。 |
| **1.2.1** | 2026-04-14 | **D5 fuzzy basename match** — Background 用 short path 時(如 `Index.cshtml:28` 不是 `src/.../Views/Dashboard/Index.cshtml:28`),D5 原先只做 `path.join(PROJECT_ROOT, shortPath)` 找不到 → false WARN。v1.2.1 加 recursive basename walk(exclude node_modules/bin/obj 等),8 層深度,只要找到同 basename 就認定 verified。觸發事件: 使用者質疑「WARN 不改會沿用舊設計」,迫使反思 D5 工具設計缺陷。 |
| **1.2.2** | 2026-04-14 | **D2 scope-aware drift** — ADR 版本 drift 原先數字比對(v1.2 vs v1.6)會 false WARN,但若 Story 有 scope 限定(如 v1.2 對應 Dashboard scope,v1.3+ 是 Editor scope 非本 Story)。v1.2.2 加 `ADR-XXX Scope Limitation` 章節偵測(regex `Scope Limitation\|scope 限定\|scope 對應`),若 dev_notes 有此章節 → 認 scope-aligned PASS,否則保留 WARN + 提示補章節。同樣觸發於「WARN 不改沿用舊設計」反思。 |
| **1.3.0** | 2026-04-14 | **🚨 WARN MANDATORY RESOLUTION POLICY** — 核心語意改變:WARN 預設**等同 BLOCK**(exit=2),必須 `--accept-warn "具體理由"` 才能 exit=1 通過。觸發事件: 使用者嚴厲指控「這是很嚴重的投機問題!!!」— 之前 Agent 將 WARN 視可忽略導致每次 create-story 累積相同 WARN。機制性防線: (1) CLI hard block (2) workflow step-06.5 Exit Code 表改寫 (3) `.claude/rules/depth-gate-warn-mandatory-resolution.md` 強制 rule (4) `memory/feedback_depth_gate_warn_not_optional.md` 永久反饋 (5) CLAUDE.md Forbidden Patterns 補「Depth Gate WARN 視可忽略」。**五層防線,Agent 無法繞過**。 |
