# Constitutional Standard — SUPREME

## Code Verification Mandate (CRITICAL — Permanent)

All tasks involving "verify", "analyze", "audit", "compare", "review", "tech debt inventory", or "status check" **must Read actual code (Read tool)** to obtain file:line evidence before concluding.

**Strictly forbidden**: Drawing conclusions solely from tracking docs (.track.md / sprint-status.yaml), memory DB records (search_context / search_debt), or other documents. These are **starting clues only**, not **conclusion evidence**.

**Mandatory flow**:
1. Query memory/docs → obtain "expected state" (clue)
2. **Read actual code** → confirm "true state" (evidence)
3. Compare expected vs true → produce conclusion (with file:line)
4. If mismatch → code is authoritative, mark doc/memory as needing update

**Incident record**: Tracking docs and memory DB have 33% false positive rate (2026-03-21 full audit found 14/43 DB records showing "open" but code already fixed).

---

## Timestamp Mandate (CRITICAL — Permanent)

All timestamps written to DB or files must be **Taiwan time (UTC+8)**.

**Forbidden**:
- JavaScript `new Date().toISOString()` → outputs UTC (off by 8 hours)
- SQLite `datetime('now')` → outputs UTC (off by 8 hours)

**Correct approaches**:
- **PowerShell**: `Get-Date -Format 'yyyy-MM-ddTHH:mm:ss+08:00'`
- **JavaScript**: custom `nowTs()` function (manual +8h) or `new Date().toLocaleString('sv', {timeZone:'Asia/Taipei'})`
- **SQLite**: use `datetime('now', '+8 hours')` or pass app-layer computed Taiwan time

**Incident record**: 2026-03-22 discovered review_reports.created_at and stories.updated_at mixed UTC/UTC+8, showing times 8 hours earlier than actual.

---

## Language Standard

All user-facing output must use Traditional Chinese (zh-TW). This rule overrides all Workflow templates.

**English allowed**: code, technical terms (API, JWT, CSRF etc.), paths, Git commands, variable/function names.

**Workflow execution**: Never copy English `<output>` templates verbatim — translate all titles, field names, descriptions to Traditional Chinese.

**Self-review**: Scan for unnecessary English sentences before sending — fix immediately.

Translation reference: `.claude/skills/constitutional-standard/SKILL.md`

---

## Backend Contract Verification Mandate (CRITICAL — Permanent)

任何涉及 **backend contract**（DB schema 欄位單位、API response 欄位格式、Entity model 語意）的 Spec、Story、或程式碼，**必須 file:line 引用 backend 程式碼**作為 Source of Truth。

**嚴格禁止**: 從前端程式碼行為、mock 資料、或舊 Spec 推測 backend contract。

**Mandatory flow**:
1. Spec/Story 涉及 DB 欄位（width/height/price/amount/etc.） → **Read Model .cs 檔**確認型別與單位
2. Spec/Story 涉及 API default 值 → **Read Controller .cs 檔**確認 default 賦值
3. 前端 hook/service 使用 API 欄位 → **Read 對應 Controller action** 確認欄位語意
4. 若 backend code 無法讀取 → 明確標記「Contract unverified — needs backend read before implementation」

**Applies to all workflow phases**:
- `create-story`: AC 中任何數值 contract 必須引用 backend file:line
- `dev-story`: 實作前確認 contract；不得假設「前端已用 px 所以 DB 也是 px」
- `code-review`: 驗證 AC contract 與實際 backend code 一致

**Incident record**: EDF-15 (2026-04-06) — edf-13 create-story/dev-story/code-review 三個 workflow 均未讀 `ProjectsController.cs`，誤認 DB 存 px。實際 `ProjectsController.cs:84-85` 以 `210m/297m`（C# decimal literal）儲存 mm。導致 100% 新建專案尺寸污染（A4 210mm → 793px 寫回 DB）。根因: Spec 從前端 mock 340（90mm×3.7795=340px）反推 DB 單位，跳過 backend code 讀取。

---

## Depth-First Verification Mandate (CRITICAL — Permanent, 2026-04-09 新增)

任何「檢查 / 審查 / 確認 / 驗證 / 完整性」類問題,**必須預設深度路徑**:讀取實際內容 + 逐項對照要求 + 主動挑戰,**禁止**用統計 metadata 代替內容驗證。

### 觸發關鍵字(中英文)

當使用者 prompt 包含以下任一關鍵字,**立即進入深度驗證模式**:
- 「檢查 / 審查 / 確認 / 驗證」
- 「完整 / 齊全 / 補全 / 都 ... 了嗎」
- 「有做 / 沒問題 / 沒漏 / 對的嗎」
- "verify / check / audit / review / confirm / complete"
- "all done / everything / correct"

### 強制執行清單

| 情境 | ❌ 禁止(淺層) | ✅ 要求(深度) |
|------|----------------|----------------|
| **檢查 Story 框架** | SQL 查欄位長度 / 狀態統計 | **逐一 Read user_story / background / AC 完整內容**,對照 Framework 規範 |
| **檢查 Code** | grep 存在性 | **Read file:line**,對照 spec / skill / ADR |
| **檢查 Docs** | ls 檔案列表 | **Read 完整內容**,對照 code(真相來源) |
| **檢查 DB 記錄** | COUNT(*) / LENGTH(col) | **SELECT full content**,對照要求逐項 |
| **檢查 Memory** | search 標題 | **include_content:true** 讀完整內容 |
| **檢查 Skill 同步** | 比對 file 存在 | **Read SKILL.md 全文**,驗證內容一致 |

### Mandatory Flow (3 層深度)

```
Layer 1 (必做): 讀取實際內容(Read/SELECT/cat)
Layer 2 (必做): 對照已知要求/規範/Framework 逐項驗證
Layer 3 (必做): 主動挑戰「upsert warning / 格式 / 品質 / 邊界案例」
```

**一次到位,不等用戶追問。**

### FORBIDDEN (絕對禁止)

- ❌ **Statistics Fallacy**: 用 COUNT / LENGTH / 狀態分佈代替內容檢查
- ❌ **Warning Blindness**: 忽略 upsert-*.js / linter / compiler 的 warning
- ❌ **False Context Economy**: 為了「省 token」做淺層檢查(追問 2-3 次的成本 > 一次深度)
- ❌ **Effort Theater**: 選「看起來有做事」而非「真正需要深度」
- ❌ **Default OK**: 假設「沒報 error 就是 OK」
- ❌ **Metadata Only**: 不讀實際內容就下結論

### 自我挑戰檢核(每次回答前)

寫完回答前,自問 3 個問題:
1. **「如果我是用戶,會追問什麼?」** — 若答得出來,應該先補上
2. **「這個統計/標題/metadata 代表實質品質嗎?」** — 若不代表,必須讀實際內容
3. **「有沒有 warning 被我忽略了?」** — 若有,必須調查並說明

### Incident Records

- **2026-04-09 Epic DLA 框架檢查事故**: 第一次問「dla 框架補全了嗎」→ 我只查欄位長度 + 狀態分佈 + 依賴統計。第二次問「都檢查過內容了嗎」→ 才實際讀 user_story/background/AC,發現 1 typo (dla-03 WON_T FIX) + 3 Stories AC 偏少 (dla-01/02/06 只 3-4 條)。若第一次就走深度路徑,可省 2 輪追問 context + 避免失去信任。
- **2026-03-21 33% false positive 事故**: tracking docs + memory DB 與實際 code 有 33% 不一致。導致 Code Verification Mandate 建立。Depth-First Verification 是它的延伸 — 不只 code 要讀,**任何聲稱「檢查過」的動作都必須深度讀取**。
- **2026-04-29 Session 56 Audit Phase F 60% false positive 事故**(`eft-trial-autocharge-impl`): Story 已 ready-for-dev 完整 enriched(Session 55 ultrathink 收斂),Session 56 誤觸 create-story + Party Mode「7 維度比對」,Agent 列 20 findings 推薦推翻 Session 55 決策。使用者 ultrathink 挑戰「相關決策已在首次 create 討論並更新過」後深度重讀,**11 個 Critical/High findings 是 false positive**(看到 PaymentSettings 既有就推論 SiteSettings 錯位 = confirmation bias;沒讀完整 ADR-MVP-OPS-001 §1 line 41 預留命名彈性 + §2 line 70-75 4 方案評估 reasoning;Party Mode「6 視角」自分飾增強 bias;自建 SDD Spec 反逆推作 evidence)。修補:rule_violations id=3920/3921/3922(constitutional/verification-protocol/context-memory)+ context_entries id=3925 提煉 **Audit 任務 4 條反模式**(L1 Cross-validation Mandatory 7 維度文檔同 term 一致性 / L2 Multi-Perspective 真實 vs 自我模擬陷阱 / L3 自建 artifacts 不該作 evidence / L4 Task framing 完整讀取使用者指示)+ 自我檢核 4 題每次 Audit 前必問。**教訓**: 7 維度文檔同 term 一致 = intentional decision,**不可推翻已 sign-off 決策**(Session 55 視同憲政層需嚴格守護);60% 比既有 33% 更嚴重,規則層強化以防新對話視窗 cold start 失傳。

### 跨情境應用範例

**範例 1**: 「任務交接.md 過時了嗎?」
- ❌ `wc -l` 看行數
- ✅ Read 完整檔案 → 比對 Session 27 實際狀態 → 列出過時段落

**範例 2**: 「這個 skill 有沒有遺漏重點?」
- ❌ `grep` 關鍵字
- ✅ Read SKILL.md 全文 → 對照最近 Story 實作 → 逐章節評估

**範例 3**: 「Memory DB 有沒有相關紀錄?」
- ❌ `search_context` 只看標題
- ✅ `search_context({include_content: true})` → 讀完整內容 → 判斷相關性

**範例 4**: 「DB Migration 成功了嗎?」
- ❌ 看 exit code = 0
- ✅ `SELECT * FROM 新表` 驗證 schema 欄位 + `INSERT/SELECT` 測試 trigger

**範例 5**: 「Pipeline CR 通過了嗎?」
- ❌ 看 stories.status = done
- ✅ Read review_reports.findings JSON → 逐項檢查 FIXED/DEFERRED 正確性

---

## External Source Citation & Information Retrieval Mandate (CRITICAL — Permanent, 2026-04-24 v2 完整 DETECT-FETCH-CITE)

引用外部 URL / 官方文檔 / 第三方 API spec / 套件版本行為的陳述,**必須走完整 DETECT → FETCH → CITE 三步循環**,不可依賴訓練資料記憶。

> **v2 升級**: F5 v1(2026-04-24)只覆蓋 CITE 步驟,v2 擴展為完整 DETECT/FETCH/CITE workflow + **內部 RAG 優先**順序(避免無謂外部 fetch)。
> **來源**: agent-skills-main `source-driven-development/SKILL.md` 完整方法論,融入 PCPT 既有 23 MCP tools + Context Memory DB 體系。觸發: 2026-04-24 Party Mode 深度整合分析 G3。

### §DETECT 步驟(辨識何時需 fetch)

agent 遇到以下情境必觸發 DETECT:

- 引用第三方 API / 套件版本行為(ECPay / SendGrid / EF Core / React)
- 規範性陳述(RFC / W3C / 政府公告 / OWASP)
- 跨 Story 引用(可能已有相關決策 / debt / IDD)
- 「我記得 X 是這樣...」「以前做過類似的...」(訓練資料 / 模糊記憶)
- 商業規則 / 合規要求(GDPR / 個資法 / 財政部規格)

**禁止**: 直接以記憶回答而不走 DETECT。

### §FETCH 步驟(分兩分支)

#### 分支 A — 內部 RAG 優先(MCP query 6 步順序)

遇 PCPT 內部相關資訊,**必先**依下列順序查 Context Memory DB,**不要直接 WebFetch**:

| 順序 | MCP Tool | 用途 |
|:-:|----------|------|
| 1 | `mcp__pcpt-context__search_documents` | 查 PCPT 內部 PRD / spec / 技術文件 |
| 2 | `mcp__pcpt-context__search_context` | 查歷史 session / decision / pattern / debug |
| 3 | `mcp__pcpt-context__search_intentional_decisions` | 查 IDD-COM/STR/REG/USR 決策 |
| 4 | `mcp__pcpt-context__search_tech` | 查歷史技術方案 / bugfix |
| 5 | `mcp__pcpt-context__search_debt` | 查歷史 tech debt(已解 / 已分類) |
| 6 | `mcp__pcpt-context__search_glossary` | 查術語定義(避免歧義) |

**內部找到** → 引用該記錄 ID(如 `[Source: context_entries id=3287 | Verified 2026-04-24]`),**跳過外部 fetch**

#### 分支 B — 外部 WebFetch(內部 6 步全查不到才走)

```
1. WebFetch(URL)取得最新內容
2. 必走 §CITE(下一步)記錄 source + fetch_date
3. (建議)`add_context({category:'reference', source_url, fetched_at})` 入 RAG 池,下次內部 search 即可命中
```

### §CITE 步驟(F5 v1 內容,保留)

#### 強制禁止

- ❌ 「React 18 的 useSyncExternalStore 建議這樣用」(無引用)
- ❌ 「ECPay 最新 CheckMacValue 規範是...」(無 fetch_date)
- ❌ 「.NET 8 默認 xxx」(可能過時)
- ❌ 「這個 NuGet 套件 v3.x 已 deprecated」(需 WebFetch 實測)
- ❌ 「根據 RFC 7807 的 problem+json 格式...」(未附 URL / section 號)

### 正確格式

對話引用:

```
[Source: https://react.dev/reference/react/useSyncExternalStore | Fetched 2026-04-24]
官方建議僅用於 read-only store,修改請用 useState。
```

程式碼註解:

```csharp
// Source: https://learn.microsoft.com/en-us/dotnet/api/system.runtime.serialization.formatters.binary.binaryformatter
// Fetched 2026-04-24
// BinaryFormatter is obsolete since .NET 5, do not use.
```

### 觸發時機

1. **WebFetch / WebSearch 結果引入對話** → 必帶完整 URL + 抓取日期
2. **引用套件官方文檔** → package + version + URL + fetch_date
3. **規範性陳述**(RFC / W3C / 政府公告) → URL + section 號
4. **第三方 API 行為描述**(ECPay / SendGrid / Google) → fetch_date 優先於「記憶中的版本」

### 與既有 Mandate 的關係

三條 Mandate 構成完整**證據鏈**:

| Mandate | 適用範圍 | 證據要求 |
|---------|---------|---------|
| Code Verification Mandate | PCPT 本地 code 行為 | Read tool + file:line |
| Backend Contract Verification | DB schema / API response / Entity 語意 | Read backend .cs file:line |
| **External Source Citation**(本條) | 外部文件 / 官方 spec / 套件行為 | URL + fetch_date |

本地必 Read、backend contract 必引、**外部文件必 cite**。任一缺失等於 agent 依賴記憶,違反憲政層級。

### 來源

agent-skills-main `source-driven-development/SKILL.md` 的 DETECT→FETCH→CITE cycle,融入 PCPT 既有 Verification 體系。觸發: 2026-04-24 Party Mode 深度整合分析 F5(`claude token減量策略研究分析/專案優化項目計畫.md`)。
