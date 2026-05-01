# Rules 體系深度指南 (Rules Deep Dive)

> **版本**: 1.0.0
> **建立日期**: 2026-05-01
> **資料快照日**: 2026-05-01
> **驗證指令**: `(Get-ChildItem .claude\rules\*.md).Count` 應 = 19

---

## 1. Rules 體系定位

`.claude/rules/*.md` 是 Claude Code「**Always-On 行為準則**」 — 不像 Skill 按需載入,Rules **每次新對話固定載入**(因此必須精簡)。

| 屬性 | Rules | Skills |
|:----|:----|:----|
| 載入時機 | 每次對話固定 | 觸發關鍵字 / Workflow 主動 Read |
| Token 成本 | 固定開銷 | 零成本(未觸發不載入)|
| 內容性質 | 憲政級 / 跨領域 / 機械強制 | 領域 SOP / Pattern / Forbidden |
| 數量 | **19**(精簡為主) | 74(可擴展)|

> **Token 量化**:Rules 約 ~5,400 tokens(497 行 / ~31 KB),佔 Always-On 總量 ~28%。

---

## 2. 20 Rules 完整索引

| # | 檔案 | 嚴重度 | 觸發場景 | 一句話用途 |
|:-:|:----|:----:|:----|:----|
| **1** | `auto-skill-detection.md` | M | 任何 prompt | 解析使用者訊息關鍵字 → 匹配 pcpt-* Skill 自動載入(含 Domain 連帶)|
| **2** | `canvas-layout-invariants.md` | C | Canvas LayoutEngine 變更 | LayoutEngine 不變式契約:禁變更 mutations / required snapshot checks |
| **3** | `code-quality.md` | M | 任何 code 變更 | DRY / 最小複雜度 / 先讀再改 / 安全寫法 |
| **4** | `constitutional-standard.md` | C | **SUPREME** | zh-TW 輸出 / Code Verification Mandate / UTC+8 Timestamp / Backend Contract / Depth-First Verification / External Source Citation |
| **5** | `context-memory.md` | H | Context DB 操作 | 安全 READ pattern / 必要 error handling / 禁 N+1 / Conversation Start Ritual / 11 層 RAG |
| **6** | `cr-debt-doc-audit.md` | H | code-review 結束 | CR 階段強制 audit debt registry + doc freshness 才能歸檔 |
| **7** | `create-story-enrichment.md` | M | create-story 觸發 | Template enrichment / ADR 引用 / tech debt 預填 |
| **8** | `db-first-no-md-mirror.md` | C | DB-first Story | `.context-db/context-memory.db` 為 SSoT,markdown 為 async mirror,禁產 `docs/.../stories/{id}.md` 鏡像 |
| **9** | `depth-gate-warn-mandatory-resolution.md` | H | create-story Step 5 | Depth Gate WARN 等同 BLOCK,除非 `--accept-warn "理由"` |
| **10** | `execution-tree-doc-sop.md` | M | Epic 推進地圖 | 樹狀圖 ≤100 行 / 6 章節極簡 / 已完成 Story 不列清單只記總數 |
| **11** | `skill-idd-sync-gate.md` | H | dev-story Step 8.2 | 雙層 Sync Gate(在 skill-sync-gate 之後):code 變更不可違反 active IDD `forbidden_changes` |
| **12** | `skill-sync-gate.md` | H | dev-story Step 8.1 | Code 變更觸發 Skill Impact Report → `Skill(saas-to-skill)` Mode B 同步 |
| **13** | `skill-tool-invocation-mandatory.md` | C | 任何 SKILL.md 修改 | **字面 Skill tool 調用** mandatory(禁直接 Edit + 三引擎 Copy-Item 達 md5 但跳過 Skill tool)|
| **14** | `spec-timeliness.md` | M | PRD / Tech Spec | freshness SLA;>4 週 stale → WARN |
| **15** | `story-lifecycle-invariants.md` | C | Story 狀態變更 | I1-I9 9 條不變式(create_completed_at ⟺ create_agent / completed_at ⟺ dev_agent / review_completed_at ⟺ review_agent / review_started_at 等)|
| **16** | `subagent-blocked-tools.md` | H | SubagentStart hook | 3-Tier 分級:Always Do(Read/Grep/Memory)/ Ask First(新 OAuth/PII/外部 API)/ Never Do(Agent recursive / AskUserQuestion / MEMORY.md write / 寫 .ps1+執行 / ECPay Live API)|
| **17** | `tasks-backfill.md` | H | dev-story / code-review 結束 | 必呼叫 `/tasks-backfill-verify {story-id}` 把 file:line 證據填回 DB tasks |
| **18** | `testing.md` | M | 任何測試 | 80%+ coverage / TDD RED-GREEN-REFACTOR / Test Pyramid |
| **19** | `verification-protocol.md` | C | 跨檔變更 / 全面檢查 | 5-step flow:impact list → glob enumerate → read each → verification table → user confirmation |

> **嚴重度分級**:**C**(Critical / SUPREME)/ **H**(High)/ **M**(Medium)/ **L**(Low)

---

## 3. 4 大憲政級 Mandate(Constitutional Standard)

`constitutional-standard.md` 是所有 Rules 之冠,定義 **5 條 SUPREME** Mandate:

### 3.1 Code Verification Mandate

> 所有「驗證 / 分析 / 審查 / 對照 / 審計 / 技術債盤點 / 狀態檢查」**必 Read 實際 code(file:line 證據)** 才得結論。

**禁止**:僅憑 tracking docs / memory DB 記錄做結論
**Mandatory flow**:
1. Query memory/docs → 預期狀態(線索)
2. **Read 實際 code** → 真實狀態(證據)
3. Compare → 結論(file:line)
4. 不一致 → 以 code 為準,標記 doc/memory 待更新

**事故記錄**:2026-03-21 全量 audit 發現 14/43 DB 記錄聲稱「open」實際 code 已修(33% false positive)。

### 3.2 Timestamp Mandate

> 所有 timestamp 必 **UTC+8(台灣時間)**

**禁止**:
- ❌ JS `new Date().toISOString()` → UTC(差 8 小時)
- ❌ SQLite `datetime('now')` → UTC

**正確**:
- PowerShell:`Get-Date -Format 'yyyy-MM-ddTHH:mm:ss+08:00'`
- JS:`new Date().toLocaleString('sv', {timeZone:'Asia/Taipei'})`
- SQLite:`datetime('now', '+8 hours')` 或 app 層計算

**事故記錄**:2026-03-22 review_reports.created_at 與 stories.updated_at 混 UTC/UTC+8。

### 3.3 Backend Contract Verification Mandate

> Spec / Story / 程式碼涉 **backend contract**(DB schema 欄位單位、API response 格式、Entity 語意)**必 file:line 引用 backend code** 為 SoT。

**禁止**:從前端行為 / mock / 舊 Spec **推測** backend contract。

**事故記錄**:EDF-15(2026-04-06)Spec 從前端 mock 反推 DB 單位錯誤,導致 100% 新建專案尺寸污染。

### 3.4 Depth-First Verification Mandate

> 觸發詞「檢查 / 審查 / 確認 / 驗證 / 完整 / 齊全 / 補全 / 都...了嗎 / verify / check / audit / complete」必走 **3 層深度**。

**禁止淺層**:
- ❌ Statistics Fallacy(用 COUNT/LENGTH 代替內容檢查)
- ❌ Warning Blindness(忽略 upsert/linter/compiler warning)
- ❌ False Context Economy(為省 token 做淺層,追問成本 > 一次深度)
- ❌ Effort Theater(看起來有做事)
- ❌ Default OK(沒 error 就是 OK)
- ❌ Metadata Only(不讀實際內容就下結論)

**事故記錄**:2026-04-29 Session 56 Audit 60% false positive 事件(Audit 4 反模式 L1-L4 提煉)。

### 3.5 External Source Citation Mandate

> 引用外部 URL / 官方文檔 / 第三方 API spec / 套件版本行為 **必 DETECT → FETCH → CITE 三步**。

**禁止**:依靠訓練資料記憶
**正確格式**:
```
[Source: https://react.dev/reference/react/useSyncExternalStore | Fetched 2026-04-24]
官方建議僅用於 read-only store
```

**內部 RAG 優先 6 步**(避免無謂外部 fetch):
1. `mcp__pcpt-context__search_documents`
2. `mcp__pcpt-context__search_context`
3. `mcp__pcpt-context__search_intentional_decisions`
4. `mcp__pcpt-context__search_tech`
5. `mcp__pcpt-context__search_debt`
6. `mcp__pcpt-context__search_glossary`

內部找到 → 引用 record ID;6 步全查不到才 WebFetch。

---

## 4. Verification Protocol(5 步)

`verification-protocol.md` 適用於「跨檔變更 / 全面更新 / 連鎖影響」任務。

### Mandatory Flow

| Step | 動作 | FORBIDDEN |
|:-:|:----|:----|
| 1 | **Impact list** — 列所有變更點 + 影響類別 | 跳過此步 |
| 2 | **Glob enumerate** — Glob 各類所有檔案 | 憑記憶推斷「就這幾個檔」 |
| 3 | **Read each file** — 逐檔對照 change list 確認;>10 檔可委派 subagent 並行(subagent 也必 Read)| 標記未讀檔為 verified |
| 4 | **Verification report** — Table(File / Status / file:line evidence)涵蓋「需改」與「無需改」 | 結論無 file:line |
| 5 | **User confirmation** — 明列 verified / needs-change / no-change 數量 | 從 grep 結果單獨宣稱 all clear |

### 核心原則
- **grep ≠ verification**(找到「出現什麼」但漏語意不一致)
- **reading ≠ verification**(讀但未對照 change list = 表面)
- **Evidence mandatory**(每個結論必引 file:line)

---

## 5. Story Lifecycle Invariants I1-I9

`story-lifecycle-invariants.md` 定義 9 條狀態機不變式(`stories` 表):

| ID | Invariant | 含義 |
|:-:|:----|:----|
| I1 | `create_completed_at` → status ∈ {ready-for-dev, in-progress, review, done} | Created 才能進後續狀態 |
| I2 | `started_at` → status ∈ {in-progress, review, done} | Started 才能進 dev/review/done |
| I3 | `completed_at` → status ∈ {review, done} | Completed 才能進 review/done |
| I4 | `review_completed_at` → status = done | review_completed 必 done |
| I5 | `create_completed_at` ⟺ `create_agent`(對稱)| Create 完成必有 create_agent |
| I6 | `completed_at` ⟺ `dev_agent`(對稱)| Dev 完成必有 dev_agent |
| I7 | `review_completed_at` ⟺ `review_agent`(對稱)| Review 完成必有 review_agent |
| I8 | `review_started_at` → status ∈ {review, done}(2026-04-21 新增)| Review 開始才能進 review/done |
| I9 | `review_started_at` ⟺ `review_agent`(對稱,2026-04-21 新增)| Review 開始必有 review_agent |

---

## 6. Subagent 3-Tier Boundary

`subagent-blocked-tools.md` 定義 SubagentStart hook 注入的工具邊界:

### Tier 1 — Always Do(無需 ask parent)
- Read(讀任何 code)
- Grep(搜任何 pattern)
- Memory DB 查詢(`mcp__pcpt-context__search_*`)

### Tier 2 — Ask First(需 parent 確認)
- 新 OAuth provider 整合
- 新 PII 欄位 storage
- 新外部 API 整合(非 ECPay Live)

### Tier 3 — Never Do(絕對禁止)
1. Agent recursive delegation(子代理再呼 Agent)
2. AskUserQuestion(子代理直接問使用者)
3. MEMORY.md 寫入
4. claude-max Telegram(全域命令)
5. 寫 .ps1/.js 並執行
6. ECPay Live API(只能 stage)

---

## 7. Sync Gates 三層架構

對應 `skills-deep-dive.md §7`,Rules 層強制執行:

```
dev-story 結束
  ↓
Step 8.1 skill-sync-gate (Rules #12)
  → file_list 含 Migration/Model/Service/Controller/Route/Component
  → Grep pcpt-* 找受影響 Skill
  → 跑 Skill(saas-to-skill) Mode B 同步
  ↓
Step 8.2 skill-idd-sync-gate (Rules #11)
  → 對 active IDD related_files 比對 commit diff
  → 違反 forbidden_changes → BLOCK
  ↓
Step 8.3 skill-tool-invocation-mandatory (Rules #13)
  → 確認字面調用 Skill tool 而非自行 Edit
  ↓
Step 8.4 tasks-backfill (Rules #17)
  → /tasks-backfill-verify 填回 file:line 證據
  ↓
Archive
```

---

## 8. 自助驗證指令

```powershell
# 列出 20 rules
Get-ChildItem .claude\rules\*.md | Select-Object Name, @{N='LinesC';E={(Get-Content $_.FullName).Count}}

# 驗證 constitutional-standard 涵蓋 5 條 Mandate
Select-String .claude\rules\constitutional-standard.md -Pattern "Mandate" |
  Where-Object {$_.Line -match '##'}

# 驗證 IDD-Sync-Gate + Sync-Gate + Tool-Invocation 3 層存在
@(
  '.claude\rules\skill-sync-gate.md',
  '.claude\rules\skill-idd-sync-gate.md',
  '.claude\rules\skill-tool-invocation-mandatory.md'
) | ForEach-Object { Test-Path $_ }
# 應全 True
```

---

## 9. Related Reading

- `skills-deep-dive.md` §7 — Sync Gates(Rules 與 Skill 互動)
- `idd-framework.md` — IDD 4 層標註(Rules #11 保護的標的)
- `bmad-workflows-evolution.md` — dev-story Step 8 整合
- `.claude/rules/constitutional-standard.md` — SUPREME SSoT

---

## 10. 版本歷史

| 版本 | 日期 | 變更 |
|:----|:----|:----|
| 1.0.0 | 2026-05-01 | 初版建立。20 Rules 完整索引 + 5 Mandate + 9 Lifecycle Invariants + 3-Tier Boundary + 三層 Sync Gates |
