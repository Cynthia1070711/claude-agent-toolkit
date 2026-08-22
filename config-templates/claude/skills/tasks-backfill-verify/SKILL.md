---
name: tasks-backfill-verify
description: >
  Tasks 回填驗證。dev-story / code-review 完成後，逐項驗證 Tasks 並回填 DB。
  觸發關鍵字：tasks backfill, 回填驗證, tasks-backfill-verify, 逐項驗證回填
version: 2.2.0
updated: 2026-08-04
disable-model-invocation: false
triggers:
  - tasks backfill
  - backfill verify
  - dev-story completion
  - code-review verification
  - tasks-backfill-verify
  - review audit
  - R-verified marker
  - two-stage backfill
  - test_count 語意
author: CC-OPUS
created: 2026-03-17
last-synced-epic: epic-bwu
last-synced-date: 2026-08-04
---
# Tasks 回填驗證 Skill

---

## 概覽

本 Skill 負責 **逐項驗證 Story Tasks 完成狀態並回填 DB**。由子視窗 agent 在 dev-story 或 code-review 結束前呼叫。

---

## test_count 語意定義(口徑 A · 生效分界日 2026-08-04)

> `bwu-13-bmad-mechanism-gap-closure` 治理裁定:`stories.test_count` 全庫口徑不一致(新增案例數 vs 套件總數混用),裁定採**口徑 A**。

**定義**:`test_count` = **本卡新增或修改的測試案例數**(不是模組 / 套件總測試數)。

**理由**(三條可稽核):
1. 口徑 B「相關套件總數」的「相關套件」本身未定義,選它等於用一個未定義詞取代另一個
2. `multi-track-orchestration/SKILL.md:115` 與 `:162` 已把 `test_count` 用作中控 GATE 的紅旗判讀信號(`test_count=0` 等),口徑 B 下一張 doc-only 卡觸碰成熟模組即回報數百,紅旗訊號結構性失效
3. 模組總體測試厚度已可由 coverage 工具回答,Story 列上的欄位應承載本卡交付量,兩者職責分離

**取數方式**:數本卡新增或修改的測試案例數(如新增的 `it(...)`/`[Fact]` 數量),非 `dotnet test`/`npx vitest run` 回報的套件總測試數。

**生效分界日 2026-08-04,既有卡不回填**:分界日之前的既有卡 `test_count` **不回填** —— 全庫 1,432 張 story 中 630 張 `test_count` 非 NULL;為統一口徑竄改歷史紀錄會使既有 CR 報告與 DB 值脫節,成本與風險均高於收益。分界日後第一張適用卡即本卡自身。

---

## ⛔ 核心禁令(違反任何一條視為回填失敗)

1. **禁止盲勾** — 沒有讀取程式碼、沒有 file:line 證據，不可標記 ✅
2. **✅/⬜ 必須在行首** — `- ✅ **1.1** 描述`，禁止放在行末或描述中間
3. **禁止 [x]/[ ] 格式** — 必須用 ✅/⬜ emoji
4. **禁止 JSON array** — tasks 欄位必須是 Markdown 字串
5. **每個 task 必須獨立驗證** — 不可因為「看起來都做了」就全部勾 ✅
6. **(v2.0.0 新增) review 階段禁止保留 dev ✅ 不動** — review 必獨立逐項 audit，marker 必升級為 ✅✅ + `[R-verified @ {ISO timestamp}]`，或不一致時改 ❌ + CR finding。review 階段 tasks 內容必**完全不同**於 dev 階段（SHA-256 比對不等）

---

## 🔥 兩階段差異化 SOP (CRITICAL — v2.0.0 新增)

> **使用者指控背景** (2026-05-16): dev 標 ✅ 後，review 看到既有 ✅ 就跳過 file:line audit，等同 review 失去獨立審查意義。本章節強制 review 必獨立逐項 audit + 升級 marker。

### 階段差異化 marker 規範

| 階段                      | Marker                                                  | 含義                                                                      |
| :------------------------ | :------------------------------------------------------ | :------------------------------------------------------------------------ |
| **dev**             | `- ✅ **1.1** 描述 (file:line)`                       | 首次驗證，Read code + file:line evidence                                  |
| **review (PASS)**   | `- ✅✅ **1.1** 描述 (file:line) [R-verified @ {ts}]` | 獨立重 Read code，確認 dev evidence 仍對，升級雙勾 + timestamp annotation |
| **review (REJECT)** | `- ❌ **1.1** 描述 (預期 X vs 實際 Y)` + CR finding   | dev ✅ 與 file:line 對不上，改 ❌ + 加 CR finding                         |
| **未實作**          | `- ⬜ **1.1** 描述 (未實作原因)`                      | dev / review 任一階段都可標                                               |

### review 階段必走獨立 audit (v2.0.0)

```
1. 對每個 dev ✅，重新 Read code 對照 file:line
2. 證據仍對 → 升級 ✅ → ✅✅ + 加 [R-verified @ {YYYY-MM-DDTHH:mm:ss+08:00}]
3. 證據不對 → 改 ❌ + 加 CR finding (review_reports.findings)
4. tasks 字串組裝後 self-check：
   - tasks.match(/✅✅/g).length ≥ 1  (至少 1 個 review-verified)
   - OR tasks.match(/❌/g).length ≥ 1  (review 發現問題)
   - 否則代表「未獨立 audit」→ STOP，重新跑 Step 7
5. tasks 內容 SHA-256 必 ≠ dev 階段 tasks SHA-256（必有實質變更）
```

### 機械式守護 (v2.0.0 三層配套)

| 守護層                                       | 位置                                                         | 行為                                                                                                                    |
| :------------------------------------------- | :----------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------- |
| **L1 SOP 升版（本檔）**                | `.claude/skills/tasks-backfill-verify/SKILL.md`            | 規範 dev/review marker 差異化 + Step 7 review-only audit                                                                |
| **L2 stop-report.ps1 review 嚴格模式** | `.claude/skills/party-to-pipeline/scripts/stop-report.ps1` | review phase 檢查`tasks.indexOf('✅✅') !== -1 && /\[R-verified @ /.test(tasks)`，否則 backfilled=false → ACK reject |
| **L3 PostToolUse Bash hard-block**     | `.claude/hooks/tasks-backfill-review-audit-enforcer.js`    | 偵測 upsert-story.js --status done 時 tasks SHA-256 vs dev 階段，相同 (copy-paste) 或缺 ✅✅ → exit 2                  |

---

## 執行步驟

### Step 1: 讀取 Story Tasks

從 DB 讀取當前 Story 的 tasks 欄位：

```bash
node .context-db/scripts/query-stories.js --id {story-id} --format json
```

提取 `tasks` 欄位內容，列出每個 task/subtask 項目。

### Step 2: 取得程式碼變更清單

```bash
git diff HEAD~1 --name-only
```

取得本次變更的檔案列表，作為驗證依據。

### Step 3: 逐項驗證（CRITICAL — 每個 task 獨立驗證）

**對每個 task/subtask 逐一執行以下動作（不可跳過任何一項）：**

1. **讀取相關程式碼** — 用 Read 工具打開 task 描述中提到的檔案，定位到具體行號
2. **確認實作存在** — 驗證程式碼邏輯是否符合 task 描述的要求
3. **確認測試覆蓋**（bwu-3-dev-consume-review-audit BR-022 升級 — 有合格表時逐列對映，無表時原措辭保留）：
   - **若 Story 有 create-story `step-06` §7.5 產出的具名測試案例表**（`node .context-db/scripts/test-spec-audit.js {story_key} --json` 的 `.verdict === 'consume'`）→ 逐列對映：本 task 涉及哪幾列表格資料，其中哪幾列已解析為 `testHit` 非 `null` 的真測試、哪幾列仍為 `null`（未覆蓋）。未覆蓋的列具名列出，不可籠統標「有測試」
   - **若無合格表**（`verdict` 為 `fallback`/`skip`）→ 檢查是否有對應的測試檔案/測試方法覆蓋此 task（原有邏輯）
4. **記錄證據** — 記下 file:line 作為標記依據
5. **判定完成狀態**：

| 情況                                  | 標記    | 範例                                                                       |
| ------------------------------------- | ------- | -------------------------------------------------------------------------- |
| 有實作 + 有 file:line 證據 + 測試通過 | ✅      | `- ✅ **1.1** 建立介面 (Services/IFoo.cs:1-5)`                           |
| 有實作但缺測試                        | ✅ 附註 | `- ✅ **1.2** 實作服務 (Services/Foo.cs:10, 無獨立測試但被 AC 測試覆蓋)` |
| 部分實作或缺證據                      | ⬜      | `- ⬜ **1.3** 整合測試 (尚未實作，需 WebApplicationFactory)`             |
| 完全未實作                            | ⬜      | `- ⬜ **2.1** 索引建立 (Migration 中未包含)`                             |

#### 各類型 Task 的驗證標準（CRITICAL — 必須按類型採用對應驗證方式）

| Task 類型          | 必須確認的證據                                         | 無法確認時                               |
| ------------------ | ------------------------------------------------------ | ---------------------------------------- |
| 程式碼實作         | Read 實際檔案 + file:line 存在且邏輯符合描述           | ⬜ 附「找不到實作 at {預期路徑}」        |
| 測試               | Read 測試檔案 + 確認 Assert/Should 非空方法            | ⬜ 附「測試不存在 / 無有效 assertion」   |
| Migration          | 確認 .cs Migration 檔案存在 + 內容包含預期 Schema 變更 | ⬜ 附「Migration 未建立 / 缺少預期欄位」 |
| ADR/文件           | Read 目標文件 + 確認對應章節內容存在                   | ⬜ 附「文件不存在 / 缺少該章節」         |
| Story 狀態更新      | 執行 `search_stories({story_id})` 確認 `status` 欄位值符合預期 | ⬜ 附「DB 查無此 Story / status 未更新」 |
| DB 欄位回寫        | 執行 query-stories.js + 確認目標欄位非空               | ⬜ 附「DB 查詢顯示欄位仍為空」           |

### Step 4: 組裝回填內容

將驗證結果組裝為 Markdown 字串格式。**✅/⬜ 必須在每行最前面（`- ` 之後）**：

```
### Task 1: 任務標題

- ✅ **1.1** 描述 (檔案路徑:行號)
- ✅ **1.2** 描述 (檔案路徑:行號, 測試通過)
- ⬜ **1.3** 描述 (尚未實作/缺少測試)

### Task 2: 任務標題

- ✅ **2.1** 描述 (檔案路徑:行號)
- ⬜ **2.2** 描述 (原因)
```

**正確位置**：`- ✅ **1.1** 描述 (證據)`
**錯誤位置**：`- **1.1** 描述 ✅` ← 禁止把 ✅ 放在行末

### Step 5: 自我檢查（回填前必須通過）

逐項確認：

- [ ] 每個 ✅ 我都**實際讀取了程式碼**並找到 file:line 證據
- [ ] 每個 ⬜ 都附有未完成原因
- [ ] ✅/⬜ 都在 `- ` 之後、`**X.X**` 之前（行首位置）
- [ ] tasks 是 Markdown 字串（不是 JSON array）
- [ ] file_list 是 Markdown 表格（不是 JSON array）
- [ ] test_count 是整數
- [ ] test_count 為**本卡新增或修改**的測試案例數（非模組/套件總測試數,2026-08-04 起生效;完整定義見上方 §test_count 語意定義,回填者須能說明取數方式)
- [ ] 沒有任何一個 task 是「沒驗證就勾的」
- [ ] 對照上方「各類型 Task 的驗證標準」表格，每個 task 採用了對應類型的驗證方式

### Step 6: 執行 DB 回填

```bash
node .context-db/scripts/upsert-story.js --merge {story-id} --inline '{
  "tasks": "### Task 1: ...\n\n- ✅ **1.1** ...(file:line)\n- ⬜ **1.2** ...(原因)",
  "file_list": "| 操作 | 檔案 | 說明 |\n|------|------|------|\n| 修改 | path/to/file.cs | 說明 |",
  "test_count": 8
}'
```

使用 `--merge` 確保不覆蓋其他欄位。

### Step 7: review 階段獨立 audit (v2.0.0 新增 — 僅 phase=code-review 走)

當 `$env:PIPELINE_PHASE === 'code-review'`，**Step 6 前**必走 Step 7：

1. 從 DB 讀取 dev 階段 tasks 內容（`stories.tasks` 字段現值）+ 計算 SHA-256
2. 對每個 dev `✅` marker，Read code 對照 file:line：
   - 證據仍對 → 升級：`- ✅ ...` → `- ✅✅ ... [R-verified @ {Get-Date -Format 'yyyy-MM-ddTHH:mm:ss+08:00'}]`
   - 證據不對 / 找不到 → 改 marker：`- ✅ ...` → `- ❌ ... (預期 X，實際 Y 不一致)` + 加 CR finding 至 `review_reports.findings`
3. 對每個 dev `⬜` marker：重新 evaluate，若實作了升級為 ✅✅，若仍未實作保留 ⬜
4. **併入逐 case 對帳結果**（bwu-3-dev-consume-review-audit BR-023 — 僅 Story 有具名測試案例表且 code-review `step-03c` §6 已產出對帳結果時執行）：對每個 task marker，若其涉及的表列在 §6 對帳中已標示對映到具體案例，於該 marker 附註引用的案例名（如 `[cases: BR005_Conflict_Returns409, BR006_MissingScope_Returns403]`），使 tasks 標記與對帳結果引用同一組事實，不產生兩套獨立結論
5. 組裝完成後 self-check：
   - `[✅✅]` count ≥ 1 (至少 1 個 review-verified)，**或**
   - `[❌]` count ≥ 1 (review 發現問題)
   - **若 review 後 tasks 與 dev 完全相同（SHA-256 相同）→ STOP，重新跑 Step 7**
6. 寫回 DB (Step 6 upsert)，touch `stories.review_completed_at` 至當前 UTC+8 timestamp

#### review 階段 ATDD example

dev 階段 tasks（現值）：

```
### Task 1: 建立 AuthService
- ✅ **1.1** AuthService.cs 建立 (Services/AuthService.cs:1-50)
- ✅ **1.2** 註冊 DI (Program.cs:42)
- ⬜ **1.3** 整合測試
```

review 階段 tasks（Step 7 後）：

```
### Task 1: 建立 AuthService
- ✅✅ **1.1** AuthService.cs 建立 (Services/AuthService.cs:1-50) [R-verified @ 2026-05-16T23:00:00+08:00]
- ❌ **1.2** DI 註冊不一致 (預期 Program.cs:42 AddScoped<IAuthService, AuthService>()，實際 Program.cs:38 用 AddSingleton 違反 SOP) — CR finding F-001
- ⬜ **1.3** 整合測試 — review 確認仍未實作，加入 backlog
```

---

## 格式規範速查

| 規則                                       | ✅ 正確                                                                      | ❌ 禁止                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| 完成標記位置                               | `- ✅ **1.1** 描述 (file:line)`                                            | `- **1.1** 描述 ✅`                            |
| 未完成標記位置                             | `- ⬜ **1.1** 描述 (原因)`                                                 | `- **1.1** 描述 ⬜`                            |
| checkbox 格式                              | 不使用                                                                       | `- [x]` / `- [ ]`                            |
| tasks 型別                                 | Markdown 字串                                                                | JSON array`[{...}]`                            |
| 驗證方式                                   | 讀程式碼 + file:line                                                         | 盲勾 / 推測                                      |
| **(v2.0.0) review 雙勾 + timestamp** | `- ✅✅ **1.1** 描述 (file:line) [R-verified @ 2026-05-16T22:30:00+08:00]` | 缺 ✅✅ 或缺`[R-verified @ ...]` annotation    |
| **(v2.0.0) review 拒絕標記**         | `- ❌ **1.1** 描述 (預期 X 實際 Y)` + CR finding                           | review 階段保留 dev`- ✅ ...` 不動             |
| **(v2.0.0) review 階段 tasks 內容**  | SHA-256 ≠ dev 階段 tasks SHA-256                                            | review tasks 完全 copy dev tasks（未獨立 audit） |

---

## 與 Pipeline 的關係

| 層級                                          | 角色                                            |
| --------------------------------------------- | ----------------------------------------------- |
| **Story Context** (Build-StoryContext)  | 指引 — 告知 agent 結束前要呼叫本 Skill         |
| **Enforce Prompt** (Rule 6)             | 提醒 — 短命令確保 agent 不忘記                 |
| **本 Skill** `/tasks-backfill-verify` | **執行引擎** — 載入後按 SOP 逐項驗證回填 |

三層架構確保回填不被遺漏：知道要做 → 被提醒要做 → 有 SOP 引導做。

---

## FORBIDDEN Loophole Closure (v2.0.0 — 對齊 saas-to-skill 八面向 §8)

每條 FORBIDDEN 含三元素：`Forbidden` (what) + `Common Rationalization` (why agent 違反) + `Red Flag` (可偵測訊號)。

### F1 — review 階段保留 dev ✅ 不動

- **Forbidden**: review 階段 tasks 字串內容完全等於 dev 階段（SHA-256 相同）
- **Common Rationalization**: "dev 已驗證過了，我看內容對就好，沒必要再 Read code 重 verify"
- **Red Flag**: `tasks.match(/✅✅/g).length === 0 && tasks.match(/❌/g).length === 0`（無 review marker 升級）

### F2 — review marker 不加 ✅✅ 或 [R-verified] timestamp annotation

- **Forbidden**: review 階段已重 Read code 但 marker 仍是 single ✅
- **Common Rationalization**: "marker 升級是 cosmetic，實質意義一樣"
- **Red Flag**: stop-report.ps1 review 階段 `backfilled=false`，`reviewMarkerCount = 0`

### F3 — 用 Bash grep / sed 模擬 ✅✅ marker

- **Forbidden**: 不字面調用 `Skill(skill="tasks-backfill-verify")`，用 Bash `echo "✅✅"` 或 `sed -i 's/✅/✅✅/g'` 偽造 marker
- **Common Rationalization**: "Skill tool 載不到時手寫 marker 也達 SOP 結果"
- **Red Flag**: transcript 無 `Skill(skill="tasks-backfill-verify"` 字面調用記錄 + `tasks` 變更 timestamp 與 Bash sed 操作 timestamp 相近

### F4 — review 階段未 touch review_completed_at timestamp

- **Forbidden**: stories.tasks 升級但 stories.review_completed_at 仍為 NULL 或等於 dev completed_at
- **Common Rationalization**: "tasks marker 升級就夠了，timestamp 是 metadata 細節"
- **Red Flag**: `review_completed_at IS NULL OR review_completed_at <= completed_at`

---

## Version History

|      版本      |         日期         | 變更                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| :-------------: | :------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **2.2.0** | **2026-08-04** | **bwu-13-bmad-mechanism-gap-closure — `test_count` 口徑 A 語意定義落地**。新增「§test_count 語意定義」章節(口徑 A = 本卡新增或修改的測試案例數 + 三條治理理由 + 取數方式 + 生效分界日 `2026-08-04` 不回填聲明);Step 5 自我檢查清單新增語意檢查項(既有「test_count 是整數」型別項旁補「本卡新增或修改」語意項),使機械閘門不再對「型別對但語意錯」的填值結構性失明。同批於 `.claude/rules/tasks-backfill.md` 與 `.context-db/scripts/migrate-stories-v2.js:36` 補同一定義。triggers 加 `test_count 語意`。走**字面** `Skill(skill="skill-builder")` Mode B。 |
| **2.1.1** | **2026-07-28** | **tdb-2-sprint-status-freeze-refs BR-015** — §驗證判準表「Sprint-status 更新」列改為「Story 狀態更新」,驗證方式從 Read `sprint-status.yaml` 改為 `search_stories({story_id})` 確認 `status` 欄位值,不合規描述改為「DB 查無此 Story / status 未更新」。觸發:`sprint-status.yaml` 已於同批凍結(`# FREEZE-MARKER:tdb-2-sprint-status-freeze-refs`),原驗證方式指向已凍結檔案已不成立。走**字面** `Skill(skill="skill-builder")` Mode B。 |
| **2.1.0** | **2026-07-28** | **bwu-3-dev-consume-review-audit — Step 3 §3 + Step 7 逐 case 對帳擴充**（BR-022/023）。觸發：create-story `step-06` §7.5 現已產出具名測試案例表（`stories.testing_strategy`），但本 Skill 的測試覆蓋檢查仍只問「有沒有」，缺一份可比對的表。本次新增：(1) Step 3 §3 加分支——有合格表（`test-spec-audit.js` `.verdict === 'consume'`）→ 逐列對映本 task 涉及的表列，未覆蓋列具名列出；無表時原措辭（「檢查是否有對應的測試檔案/測試方法覆蓋此 task」）**逐字保留**，不破壞既有 44/60 存量卡的檢核路徑。(2) Step 7 新增第 4 項「併入逐 case 對帳結果」——review 階段若 code-review `step-03c` §6 已產出對帳，task marker 附註對映的案例名，使 tasks 與 CR 對帳表引用同一組事實。**v2.0.0 設計性非冪等完整保留**：`stop-report.ps1` 與 `tasks-backfill-review-audit-enforcer.js` 兩守護檔未觸碰，review 階段仍需 `✅✅` + `[R-verified @ ISO]`、SHA-256 仍須 ≠ dev 階段（原 Step 7 步驟 4/5 僅重編號為 5/6，內容逐字未改）。frontmatter `version`/`updated`/`last-synced-epic`/`last-synced-date` 四欄同步 bump（對齊 `depth-gate-warn-mandatory-resolution.md` 已知失敗模式——上一張卡的 Mode B 曾只 bump 前兩者，留後兩者 stale）。走**字面** `Skill(skill="skill-builder")` Mode B。 |
| **2.0.0** | **2026-05-16** | **Major version (breaking for review agents)** — 新增「dev vs review 兩階段差異化 SOP」（§Two-Stage）。觸發背景：使用者指控既有 SOP 不區分 dev/review，review agent 看到 dev ✅ 即跳過 file:line audit，等同 review 失去獨立審查意義。修補三層配套：(1) SOP 升版（本步）：dev ✅ → review 升級 ✅✅ + `[R-verified @ ts]` annotation，不一致改 ❌ + CR finding；(2) `stop-report.ps1` review 嚴格 marker check；(3) `tasks-backfill-review-audit-enforcer.js` PostToolUse Bash hard-block。新增 Step 7（review-only audit）、核心禁令 #6、FORBIDDEN Loophole Closure F1-F4（對齊 saas-to-skill v3.3.0 八面向 §8）、Format 速查 review 雙勾行、ATDD example。frontmatter version 1.1.3 → 2.0.0、updated 2026-04-10 → 2026-05-16、last-synced-epic env-optimization-20260516、triggers 加 `code-review verification` / `review audit` / `R-verified marker` / `two-stage backfill`。 |
|      1.1.3      |      2026-04-10      | Stop hook D19 fix 對齊 — review phase 強制 tasksHasCheck（no fallback），dev phase 保留 devComplete fallback。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
|      1.0.0      |      2026-03-17      | 初版建立 — Step 1-6 SOP + 5 條核心禁令 + Format 速查 + Pipeline 整合三層。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

---

## 除錯參考

> 相關除錯知識請查閱 `docs/knowledge-base/` 目錄。
