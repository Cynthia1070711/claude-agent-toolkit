---
name: bug-fix-verification
description: >
  Use when 驗證審查報告 Bug 是否真的修復、記錄新 Bug、或在 dev-story 收尾與
  code-review Production Gate 之前把 FIXED / DEFERRED 結果同步寫入
  review_findings 與 tech_debt_items 兩張 DB 表時。
  觸發關鍵字：bug-fix-verification, bug 驗證, 修復驗證, BUG 狀態更新,
  驗證修復, 審查 Bug, review bug, 查 Bug, Bug 搜尋, Bug 記錄, review_findings
version: 2.1.0
updated: 2026-07-27
triggers:
  - bug verification
  - fix verification
  - review bug
author: CC-OPUS
created: 2026-03-23
last-synced-epic: epic-ctr
last-synced-date: 2026-07-27
---

# Bug Fix Verification — 審查報告 Bug 追蹤與修復驗證

---

## 核心原則

**Story done ≠ Bug fixed。** 必須讀取實際程式碼驗證每個 Bug 的修復狀態。

---

## DB Schema 參考（review_findings 表）

> Source of truth: `.context-db/scripts/init-review-tables.js`

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| `id` | INTEGER PK | auto | 主鍵 |
| `finding_id` | TEXT UNIQUE | Y | Bug 唯一識別碼（如 `REV-2026-03-22-auth-code-cc-opus-BUG-001`）|
| `report_id` | TEXT FK | Y | 關聯報告 ID（如 `REV-2026-03-22-auth-code-cc-opus`）|
| `module_code` | TEXT | Y | 模組代碼（如 `auth`, `admin-member`, `pdf-engine`）|
| `severity` | TEXT | Y | `P0` / `P1` / `P2` / `P3` / `P4` |
| `bug_type` | TEXT | Y | Bug 類型（如 `Security`, `Logic`, `Data`, `Performance`, `Authorization`）|
| `dimension` | TEXT | N | SaaS 維度（如 `功能完整性`, `安全合規`, `權限邊界`）|
| `title` | TEXT | Y | Bug 標題 |
| `description` | TEXT | N | 詳細描述 |
| `file_path` | TEXT | N | 發生檔案路徑 |
| `line_number` | INTEGER | N | 行號 |
| `root_cause` | TEXT | N | 根因分析 |
| `fix_suggestion` | TEXT | N | 修復建議 |
| `affected_files` | TEXT | N | 受影響檔案（JSON 陣列字串）|
| `regression_risk` | TEXT | N | 迴歸風險（低/中/高）|
| `suggested_story` | TEXT | N | 建議修復 Story |
| `engine` | TEXT | Y | 審查引擎（`cc-opus`, `gemini`, `antigravity`）|
| `cross_confirmed` | INTEGER | N | 多引擎確認（0/1）|
| `cross_engines` | TEXT | N | 確認引擎列表（JSON）|
| `repro_steps` | TEXT | N | 重現步驟（E2E 模式）|
| `expected_result` | TEXT | N | 預期結果 |
| `actual_result` | TEXT | N | 實際結果 |
| `screenshot_before` | TEXT | N | 截圖路徑（前）|
| `screenshot_after` | TEXT | N | 截圖路徑（後）|
| `console_errors` | TEXT | N | 控制台錯誤 |
| `network_issues` | TEXT | N | 網路問題 |
| **`fix_status`** | TEXT | N | **`open`** / `fixing` / `fixed` / `wont_fix` / `deferred`（預設 `open`）|
| **`fix_story_id`** | TEXT | N | 修復該 Bug 的 Story ID |
| **`fix_notes`** | TEXT | N | 修復備註 |
| **`fixed_at`** | TEXT | N | 修復完成時間（台灣時間 ISO 8601）|
| **`fixed_by`** | TEXT | N | 修復者（`CC-OPUS`, `CC-SONNET`, `Alan`）|
| `verified_at` | TEXT | N | 驗證時間 |
| `verified_by` | TEXT | N | 驗證者 |
| `created_at` | TEXT | auto | 建立時間 |
| `updated_at` | TEXT | auto | 更新時間 |

**FTS5 全文索引**：`review_findings_fts` — 可搜尋 title, description, fix_suggestion, file_path, module_code（trigram 分詞，支援中文 3 字元搜尋）

**目前統計**：939 findings（642 open + 297 fixed）

---

## 觸發時機

| 場景 | 指令 | 說明 |
|------|------|------|
| Story 修復驗證 | `/bug-fix-verification {story-id}` | 驗證 Story 相關 Bug 是否真的修復 |
| 搜尋已知 Bug | `/bug-fix-verification search {keyword}` | FTS5 全文搜尋 Bug |
| 檔案相關 Bug | `/bug-fix-verification check {file_path}` | 查詢某檔案的所有已知 Bug |
| 模組 Bug 總覽 | `/bug-fix-verification module {module_code}` | 列出模組下所有 Bug 及狀態 |
| 記錄新 Bug | `/bug-fix-verification add {report_id}` | 開發中發現新 Bug 時記錄 |
| 標記已修復 | `/bug-fix-verification fix {finding_id} {story_id}` | 修復完成後更新狀態 |
| 全量統計 | `/bug-fix-verification stats` | 按模組/嚴重度/狀態統計 |
| 全量驗證 | `/bug-fix-verification --full --epic {epic-id}` | 掃描 Epic 所有 Story |

---

## 執行流程

### Mode 1: 查詢 Bug（search / check / module）

#### search — 全文搜尋
```bash
# 透過 review-db-writer.js CLI 查詢
node .context-db/scripts/review-db-writer.js --query-findings --module {module_code}

# 或直接用 DevConsole API（更方便）
# GET http://localhost:5174/api/reviews/findings?search={keyword}&pageSize=20
```

#### check — 檔案相關 Bug
```bash
# 查詢 file_path 包含指定路徑的 findings
cd tools/dev-console && node -e "
const db = require('better-sqlite3')('../../.context-db/phycool.db', {readonly:true});
const rows = db.prepare(\`SELECT finding_id, severity, fix_status, title
  FROM review_findings WHERE file_path LIKE ?
  ORDER BY CASE severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END\`)
  .all('%{file_path}%');
rows.forEach(r => console.log(r.fix_status.padEnd(8), r.severity, r.finding_id, r.title));
db.close();
"
```

#### module — 模組總覽
```bash
node .context-db/scripts/review-db-writer.js --query-findings --module {module_code}
```

---

### Mode 2: Story 修復驗證（預設模式）

#### Step 1: 定位 Bug 來源

從 review_findings 表查詢與 Story 相關的 Bug：

```bash
# 方法 A：按 fix_story_id 查詢（Bug 已標記要由此 Story 修復）
cd tools/dev-console && node -e "
const db = require('better-sqlite3')('../../.context-db/phycool.db', {readonly:true});
const rows = db.prepare('SELECT * FROM review_findings WHERE fix_story_id = ? OR suggested_story LIKE ?')
  .all('{story-id}', '%{story-id}%');
console.log(JSON.stringify(rows, null, 2));
db.close();
"

# 方法 B：按 module_code 查詢所有 open Bug
cd tools/dev-console && node -e "
const db = require('better-sqlite3')('../../.context-db/phycool.db', {readonly:true});
const rows = db.prepare(\"SELECT finding_id, severity, bug_type, title, file_path, line_number, fix_status FROM review_findings WHERE module_code = ? AND fix_status = 'open' ORDER BY CASE severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END\")
  .all('{module_code}');
rows.forEach(r => console.log(r.severity, r.fix_status.padEnd(8), r.finding_id.substring(0,50), '|', r.title.substring(0,60)));
db.close();
"
```

也可從 Story 的 DB 記錄取得來源：
```
search_stories(story_id: "{story-id}", include_details: true)
```

#### Step 2: 逐一程式碼驗證（CRITICAL）

**對每個 Bug 執行**：

```
1. Read 受影響檔案的指定行號（file_path:line_number）
2. 比對 Bug 的 description / root_cause 中描述的問題是否已修復
3. 判定狀態：
   - FIXED — 程式碼已修正，附 file:line 證據
   - PARTIAL — 部分修復，說明缺失部分
   - OPEN — 未修復，問題仍存在
   - NOT_APPLICABLE — 程式碼重構導致 Bug 描述不再適用
   - FALSE_POSITIVE — Bug 描述有誤，程式碼原本就正確
```

#### Step 3: 更新 review_findings DB

**已修復的 Bug**：
```bash
node .context-db/scripts/review-db-writer.js --update-finding "{finding_id}" '{
  "fix_status": "fixed",
  "fix_story_id": "{story-id}",
  "fix_notes": "已在 {story-id} 中修復。證據: {file_path}:{line_number}",
  "fixed_by": "CC-OPUS"
}'
```
> `fixed_at` 由 review-db-writer.js 自動設定（當 fix_status = 'fixed' 時）

**未修復的 Bug**：
```bash
node .context-db/scripts/review-db-writer.js --update-finding "{finding_id}" '{
  "fix_status": "deferred",
  "fix_notes": "待 {target-story-id} 修復"
}'
```

**誤報 Bug**：
```bash
node .context-db/scripts/review-db-writer.js --update-finding "{finding_id}" '{
  "fix_status": "wont_fix",
  "fix_notes": "FALSE_POSITIVE — {原因}"
}'
```

#### Step 4: 同步寫入 tech_debt_items（僅 deferred Bug）

```bash
node .context-db/scripts/upsert-debt.js --inline '{
  "debt_id": "{finding_id}",
  "story_id": "epic-rev1",
  "category": "deferred",
  "severity": "{P0→critical, P1→high, P2→medium, P3→low, P4→low}",
  "title": "{Bug 標題}",
  "description": "{原始 Bug 描述}",
  "target_story": "{target-story-id}",
  "status": "pending"
}'
```

---

### Mode 3: 記錄新 Bug（add）

開發過程中發現新 Bug 時：

```bash
node .context-db/scripts/review-db-writer.js --write-finding '{
  "finding_id": "DEV-{story-id}-{seq}",
  "report_id": "{nearest-report-id-or-DEV-ADHOC}",
  "module_code": "{module}",
  "severity": "P{0-4}",
  "bug_type": "{Security|Logic|Data|Performance|Authorization}",
  "dimension": "{SaaS 維度}",
  "title": "{Bug 標題}",
  "description": "{詳細描述}",
  "file_path": "{檔案路徑}",
  "line_number": {行號},
  "root_cause": "{根因}",
  "fix_suggestion": "{修復建議}",
  "engine": "CC-OPUS"
}'
```

> 若無對應 report_id，使用 `DEV-ADHOC` 作為佔位。

---

### Mode 4: 標記已修復（fix）

```bash
node .context-db/scripts/review-db-writer.js --update-finding "{finding_id}" '{
  "fix_status": "fixed",
  "fix_story_id": "{story-id}",
  "fix_notes": "{修復說明}",
  "fixed_by": "CC-OPUS"
}'
```

---

### Mode 5: 統計（stats）

```bash
node .context-db/scripts/review-db-writer.js --stats
```

或更詳細的自訂查詢：
```bash
cd tools/dev-console && node -e "
const db = require('better-sqlite3')('../../.context-db/phycool.db', {readonly:true});
console.log('=== By fix_status ===');
db.prepare('SELECT fix_status, COUNT(*) as cnt FROM review_findings GROUP BY fix_status').all()
  .forEach(r => console.log(r.fix_status.padEnd(12), r.cnt));
console.log('\n=== Open by module ===');
db.prepare(\"SELECT module_code, COUNT(*) as cnt FROM review_findings WHERE fix_status='open' GROUP BY module_code ORDER BY cnt DESC\").all()
  .forEach(r => console.log(r.module_code.padEnd(25), r.cnt));
console.log('\n=== Open by severity ===');
db.prepare(\"SELECT severity, COUNT(*) as cnt FROM review_findings WHERE fix_status='open' GROUP BY severity ORDER BY CASE severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END\").all()
  .forEach(r => console.log(r.severity, r.cnt));
db.close();
"
```

---

## 產出驗證報告

```markdown
## Bug 修復驗證報告 — {story-id}

| Finding ID | 嚴重度 | 標題 | 狀態 | 證據 |
|------------|:------:|------|:----:|------|
| REV-xxx-BUG-001 | P0 | ... | FIXED | file:line |
| REV-yyy-BUG-003 | P1 | ... | OPEN | 說明 |

### 統計
- 總 Bug 數: N
- FIXED: X (附 file:line)
- OPEN: Y (待修復)
- WONT_FIX: Z (誤報/不適用)
- 新發現: W
```

---

## 與 Workflow 的整合

### dev-story（Step 9 前）
1. 載入本 Skill
2. 執行 Step 1-2（查詢 + 驗證）
3. 若有 OPEN 的 P0/P1 Bug → 阻止推進至 review
4. 結果記錄在 tracking file

### code-review（Step 5 Production Gate 前）
1. 載入本 Skill
2. 執行完整 Step 1-4
3. FIXED Bug 更新 review_findings
4. DEFERRED Bug 同步寫入 tech_debt_items
5. 報告附在 CR report 尾部

### 日常開發
- 修改檔案前：`/bug-fix-verification check {file_path}` 查詢已知 Bug
- 發現新 Bug：`/bug-fix-verification add {report_id}` 記錄
- 修復完成：`/bug-fix-verification fix {finding_id} {story_id}` 更新狀態

---

## 商業規則驗證（PhyCool 特有）

驗證時須納入以下商業規範：

- **定價策略**：Free 2頁+浮水印 → Business 5000頁+API
- **退款規則**：7天試用→取消不扣款；扣款後不退款（僅 Admin 特殊退款）
- **產品定位**：PCPT = 批次列印 SaaS，禁止 Undo/Redo
- **ValidateUserPermission**：PlanExpiresAt + GracePeriod + MaxPdfPages + ForceWatermark

---

## DevConsole Web UI

審查報告 Bug 也可在 DevConsole 瀏覽和管理：
- **列表頁**：http://localhost:5174/reviews
- **報告詳細**：http://localhost:5174/reviews/{report_id}
- 支援修復狀態下拉更新、全文搜尋、嚴重度篩選

---

## FORBIDDEN

- ❌ 未讀程式碼就標記 FIXED
- ❌ 僅依據 Story status=done 判定 Bug 已修復
- ❌ 跳過商業規則驗證（定價/退款/產品定位）
- ❌ 新發現的 Bug 不建立追蹤
- ❌ OPEN 的 P0/P1 Bug 不阻止 Production Gate
- ❌ **（2026-07-27 新增）為省 description token 而重新加回 `disable-model-invocation: true`**
  - **Common Rationalization**：「這個 skill 只有 workflow 會用到，設 DMI 可以省 context」
  - **Red Flag**：pipeline 的 `code-review/steps/step-05-production-gate.md:45` 與 `dev-story/steps/step-09-completion.md:112` 皆明文 `Invoke the Skill tool`，`party-to-pipeline/scripts/protocol-template.md:46/156/205` 亦列為必經步驟。設 DMI 會讓這些步驟收到 `<tool_use_error>... cannot be used with Skill tool due to disable-model-invocation</tool_use_error>` 而必然失敗
  - 若日後真要恢復零 context 成本，**必須同時**把上述 5 處改為「Read SKILL.md 後照 SOP 手動執行」，不可只改 frontmatter

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **2.1.0** | **2026-07-27** | **移除 `disable-model-invocation: true`** — 該旗標使 pipeline 明文要求的 `Invoke the Skill tool` 步驟必然失敗。實證：2026-07-27 子視窗調用回 `<tool_use_error>Skill bug-fix-verification cannot be used with Skill tool due to disable-model-invocation</tool_use_error>`（同旗標於 2026-07-25 四次調用尚可通過，frontmatter 自 2026-03-28 `a45e6f9d` 未變、工作樹乾淨，CLI 已升至 2.1.220 — 判定為執行期 enforcement 收緊）。同步：description 改 `Use when` 開頭第三人稱（對齊 quick_validate CSO-USEWHEN，移除 DMI 後 description 進入模型 budget 故需符規）+ 新增本 Version History + FORBIDDEN 補「禁為省 token 加回 DMI」三元素。代價：description 進入 2% context budget。觸發：party-to-pipeline 薄手子視窗閘門實查（17 session 全掃）。 |
| 2.0.1 | 2026-04-05 | Epic SKU Skill Upgrade — metadata 補全。 |
| 2.0.0 | 2026-03-28 | Context Memory DB Phase 4/5 — DMI 最佳化 + frontmatter 合規。 |
| 1.0.0 | 2026-03-23 | 初版建立（epic-fix5）— review_findings 全量驗證。 |
- ❌ 直接操作 SQLite（必須通過 review-db-writer.js CLI）
