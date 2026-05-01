# Memory System 全景深度指南

> **版本**: 1.0.0
> **建立日期**: 2026-05-01
> **資料快照日**: 2026-05-01
> **驗證指令**: 見 §13

---

## 1. Memory System 5 大組件全景

PCPT 平台的「Memory System」由 5 個獨立但互通的組件組成:

```
┌──────────────────────────────────────────────────────────┐
│ 1. Context Memory DB (.context-db/context-memory.db)            │ ← SSoT(主)
│    SQLite + FTS5 + WAL + ONNX Embedding                   │
│    30+ tables / 23 MCP tools / 82 scripts                  │
├──────────────────────────────────────────────────────────┤
│ 2. memory/ 目錄(Auto-Memory 索引)                         │ ← 摘要型
│    MEMORY.md(150 行 ≤ index)+ 12 篇 *.md(detail)        │
├──────────────────────────────────────────────────────────┤
│ 3. .claude/agent-memory/(預留空間)                        │ ← 預留
│    .gitkeep 占位,未來 sub-agent session memory 用         │
├──────────────────────────────────────────────────────────┤
│ 4. DevConsole Web UI(視覺化介面)                          │ ← 查看
│    React + Express(localhost:5174 / 3001)                  │
├──────────────────────────────────────────────────────────┤
│ 5. ledger.jsonl(寫入 ledger,災備)                         │ ← 備援
│    所有 DB 寫入操作 append-only 記錄,DB 損壞時可重建      │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Context Memory DB — 4 層遞進架構

```
L0 知識記憶層(必要)
  ├── context_entries / tech_entries / tech_debt_items
  ├── intentional_decisions / stories / cr_reports / cr_issues
  ├── conversation_sessions / conversation_turns
  ├── doc_index / document_chunks / glossary
  ├── workflow_executions / benchmarks / test_journeys / test_traceability
  ├── pipeline_checkpoints / sprint_index / rule_violations
  └── FTS5 trigram 全文搜尋

L1 程式碼語意層(選用,需 .NET SDK)
  ├── symbol_index / symbol_dependencies / symbol_embeddings
  └── Roslyn AST 提取(class / method / interface / enum)

L2 向量語意層(選用,本地 ONNX 或 OpenAI)
  ├── context_embeddings / tech_embeddings / stories_embeddings
  ├── conversation_embeddings / debt_embeddings / document_embeddings
  └── Xenova/all-MiniLM-L6-v2 384D / Cosine Similarity

L3 動態注入層(選用,需 L0+L2)
  ├── UserPromptSubmit Hook(pre-prompt-rag.js)
  ├── 11 層 RAG 注入(見 hooks-events-deep-dive.md §4)
  └── S_final = 0.6×vec + 0.2×graph + 0.2×fts

Phase 4 連續學習層
  ├── retrieval_observations / retrieval_hits / retrieval_keywords
  ├── pattern_observations / embedding_queue
  └── PostToolUse observe-pattern.js + Stop incremental-embed.js
```

---

## 3. 30+ 表 完整 Schema 總覽

> 以下 schema 直接從 `.context-db/scripts/init-db.js` 摘錄(line numbers 為 init-db.js 行號)。

### 3.1 知識記憶層核心表(4)

| Table | Line | 用途 | FTS5 |
|:----|:--:|:----|:--:|
| **context_entries** | 48 | AI Agent 決策 / Pattern / Session / Debug 紀錄 | ✅ context_fts(title, content, tags)|
| **tech_entries** | 94 | 技術方案(成功/失敗)/ Bug 修復 / 架構決策 | ✅ tech_fts(title, problem, solution, lessons, tags)|
| **tech_debt_items** | 606 | Tech Debt v3.0 中央登錄(取代 registry.yaml)| ✅ tech_debt_fts |
| **intentional_decisions** | 981 | IDD-COM/STR/REG/USR 治理紀錄 | ✅ intentional_decisions_fts |

**context_entries 主欄位**:`id / agent_id / category / title / content / tags(JSON)/ story_id / epic_id / session_id / source_idd_id / created_at / updated_at`

**tech_debt_items 主欄位**:`debt_id / story_id / target_story / status(open/fixed/deferred/accepted/wont_fix)/ severity / category / fix_cost / root_cause / fix_guidance / discovered_by / blast_radius / business_impact / dev_exp_impact / priority_score / stale_reason / pre_production_rationale / sidecar_path`

**intentional_decisions 主欄位**:`idd_id / idd_type(COM/STR/REG/USR)/ status(active/draft/review/retired/superseded/violation_block)/ criticality(critical/high/medium/low)/ title / context / decision / reason / forbidden_changes(JSON)/ related_files / related_skills / related_idd / platform_modules / adr_path / signoff_by / signoff_at / re_evaluation_trigger`

### 3.2 Story 與 CR 治理表(4)

| Table | Line | 用途 |
|:----|:--:|:----|
| **stories** | 219 | DB-First Story 中央表(取代 .md 鏡像)|
| **cr_reports** | 316 | Code Review 報告(per round)|
| **cr_issues** | 366 | CR 問題 row(FIXED / DEFERRED / WONT_FIX)|
| **sprint_index** | 145 | Sprint 索引(epic / phase / status 統計)|

**stories 主欄位**(40+):`story_id / epic_id / domain / complexity / status / title / user_story / acceptance_criteria / tasks / dev_notes / implementation_approach / file_list / test_count / cr_score / cr_issues_total / cr_issues_fixed / cr_issues_deferred / cr_summary / create_completed_at / started_at / completed_at / review_started_at / review_completed_at / create_agent / dev_agent / review_agent / sdd_spec / depth_gate_status / lifecycle_invariants(I1-I9)`

### 3.3 對話記憶表(2)

| Table | Line | 用途 |
|:----|:--:|:----|
| **conversation_sessions** | 463 | Claude Code session metadata |
| **conversation_turns** | 514 | 逐輪 Q&A + token 估算 |

**conversation_sessions 欄位**:`id / agent_id / started_at / ended_at / first_prompt / summary / topics(JSON)/ transcript_path / story_id`

### 3.4 文件索引表(3)

| Table | Line | 用途 |
|:----|:--:|:----|
| **doc_index** | 416 | 文件目錄(spec / ADR / Skill / 其他)|
| **document_chunks** | 706 | Markdown section-level 內容區塊 |
| **glossary** | 853 | 術語 / 領域別名 |

### 3.5 程式碼語意層(3)

| Table | Line | 用途 |
|:----|:--:|:----|
| **symbol_index** | 160 | Roslyn AST class/method/interface/enum |
| **symbol_dependencies** | 179 | 依賴圖(calls / inherits / implements / uses)|
| **symbol_embeddings** | 199 | symbol 向量(384D)|

### 3.6 嵌入表(7)

| Table | Line | 對應主表 |
|:----|:--:|:----|
| **context_embeddings** | 775 | context_entries |
| **tech_embeddings** | 790 | tech_entries |
| **stories_embeddings** | 805 | stories |
| **conversation_embeddings** | 820 | conversation_sessions |
| **debt_embeddings** | 835 | tech_debt_items |
| **document_embeddings** | 751 | document_chunks |
| **symbol_embeddings** | 199 | symbol_index |

> 全部使用 `Xenova/all-MiniLM-L6-v2`(384D)本地 ONNX inference,**零 API 成本**(取代 OpenAI text-embedding-3-small 1536D)。

### 3.7 Phase 5 工作流 / 效能 / 測試表(4)

| Table | Line | 用途 |
|:----|:--:|:----|
| **workflow_executions** | 871 | Pipeline stage 完成記錄 + token / cost(input/output/cache_create/cache_read 4 欄位)|
| **benchmarks** | 906 | 效能基線(metric_name / context / unit / current_value)|
| **test_journeys** | 921 | E2E 測試路徑序列 |
| **test_traceability** | 938 | AC ↔ test 對應矩陣 |

### 3.8 Phase 4 連續學習表(3)

| Table | 用途 |
|:----|:----|
| **retrieval_observations** | 查詢級統計(tool_name / result_count / avg_similarity / duration_ms)|
| **retrieval_hits** | entry-level 熱度(hit_count / confidence / last_query)|
| **retrieval_keywords** | keyword 頻率分析 |
| **pattern_observations** | 18 領域 pattern(PostToolUse 自動寫入)|
| **embedding_queue** | 待嵌入 row queue(Stop incremental-embed.js 處理)|

### 3.9 Pipeline 與 Rule Violation(2)

| Table | Line | 用途 |
|:----|:--:|:----|
| **pipeline_checkpoints** | 956 | Orchestrator session state 恢復點 |
| **rule_violations** | (Phase 4 新增)| 規則違反 hot zones 統計(top-5 / 30 天)|

---

## 4. 23 MCP Tools 完整 API

由 `.context-db/server.js`(stdio)透過 `pcpt-context` MCP server 暴露:

### 4.1 Search Layer(10)— FTS5 + Hybrid Vector

| # | Tool | 用途 |
|:-:|:----|:----|
| 1 | `search_context` | context_entries FTS5 + optional vector rerank |
| 2 | `search_tech` | tech_entries 過濾 category / tech_stack / outcome |
| 3 | `search_debt` | tech_debt_items 過濾 status / severity / story_id / target_story |
| 4 | `search_stories` | stories 過濾 epic / domain / complexity / status + AC/tasks/dev_notes |
| 5 | `search_documents` | doc_index + document_chunks FTS5 |
| 6 | `search_glossary` | glossary canonical_name / aliases + domain 過濾 |
| 7 | `search_conversations` | conversation_sessions + turns(role / 日期過濾)|
| 8 | `search_intentional_decisions` | IDD-COM/STR/REG/USR + status / criticality |
| 9 | `search_symbols` | symbol_index 關鍵字搜尋 |
| 10 | `semantic_search` | 純向量 cosine ≥ 0.3(中英 mixed)|

### 4.2 Write Layer(4)

| # | Tool | 用途 |
|:-:|:----|:----|
| 11 | `add_context` | INSERT context_entries(agent_id / category / title / content / tags / story_id / epic_id)|
| 12 | `add_tech` | INSERT tech_entries(problem / solution / lessons / confidence)|
| 13 | `add_cr_issue` | CR findings → tech_entries(category=review)+ severity + resolution |
| 14 | `add_intentional_decision` | INSERT IDD(ADR path + signoff + forbidden_changes + re_evaluation_trigger)|

### 4.3 Retrieval & Trace(3)

| # | Tool | 用途 |
|:-:|:----|:----|
| 15 | `trace_context` | 從 FTS 種子展開 related_files + story_id 邊(深度 1-2)|
| 16 | `get_symbol_context` | symbol + 依賴(calls / inherits / implements / uses)|
| 17 | `get_session_detail` | session_id 完整 conversation_turns 列表 |

### 4.4 Analytics & Metadata(6)

| # | Tool | 用途 |
|:-:|:----|:----|
| 18 | `get_patterns` | pattern_observations(domain / min_confidence)|
| 19 | `get_intentional_decision` | 單一 IDD 完整紀錄(含 code_locations / forbidden_changes)|
| 20 | `list_sessions` | conversation_sessions 時間軸(date range)|
| 21 | `log_workflow` | INSERT workflow_executions(workflow_type / story_id / status / token / cost)|
| 22 | `upsert_benchmark` | benchmarks(metric_name / context / unit / current_value)|
| 23 | `verify_intentional_annotations` | 驗證 IDD 與 ADR / code 標註對應 |

---

## 5. 82 Scripts 分類索引(`.context-db/scripts/`)

### 5.1 Core 初始化 / Schema(2)
- `init-db.js` — 冪等 DB 初始化(WAL + FTS5 trigram + Phase Gate)
- `apply-migration.js` — 手動 migration 執行器

### 5.2 資料匯入 / 同步(8)
- `import-stories.js` / `import-cr-reports.js` / `import-cr-issues.js`
- `import-conversations.js` / `import-documents.js` / `import-adrs.js`
- `sync-from-yaml.js`(deprecated,改 DB-first)/ `sync-documents.js`

### 5.3 寫入工具(7)
- `upsert-debt.js`(--inline / --resolve / --query / --stats)
- `upsert-story.js`(--merge)
- `upsert-intentional.js`(IDD)
- `log-workflow.js` / `log-session.js` / `log-turn.js` / `log-rule-violation.js`

### 5.4 分析 / 報告(7)
- `run-accuracy-test.js` / `debt-stale-report.js` / `query-stories.js`
- `query-violations.js` / `query-watches-hits.js` / `query-preprune.js`
- `accepted-debt-rescue-audit.js`

### 5.5 Embedding / 向量(6)
- `generate-embeddings.js` / `local-embedder.js`(+ test)
- `backfill-embeddings.js` / `migrate-embeddings.js` / `embedding-sync.js` / `incremental-embed.js`

### 5.6 IDD 管理(7)
- `upsert-intentional.js` / `scan-code-idd-references.js` / `scan-doc-idd-references.js`
- `scan-skill-idd-references.js` / `build-idd-cross-reference.js`
- `skill-idd-sync-check.js` / `memory-to-idd-migration.js`

### 5.7 Debt 清理(6)
- `debt-layer1-hygiene.js` / `debt-layer2-stale.js` / `debt-layer3-quickfix.js`
- `debt-layer5-alan-review.js` / `debt-layer-rollback.js`
- `boy-scout-sweep.js` / `cleanup-orphans.js`

### 5.8 Code Review(5)
- `review-db-writer.js` / `review-task-matcher.js` / `init-review-tables.js`
- `batch-update-review-findings.cjs` / `backfill-findings-from-report.cjs` / `group-findings-to-stories.js`

### 5.9 Session 與 Pipeline(7)
- `pipeline-checkpoint.js` / `context-budget-monitor.js`
- `r5-session-context.js` / `r6-deep-enrichment.js`(+ memory-audit / fix-depth-gate / fix-fence-pair / memory-entries)

### 5.10 工具與測試(20+)
- `timezone.js` / `fix-timezone.js` / `restore.js` / `validate-server.js`
- `seed-data.js` / `infer-uses-deps.js` / `scan-doc-index.js`
- `observe-pattern.js` / `measure-hook-injection.js`
- `detect-rule-violation-core.cjs` / `backtest-rule-violation-detector.cjs` / `check-violation-repeat.js`
- `rebuild-watches-index.js` / `watches-hits.test.js` / `log-session.test.js` / `log-workflow.test.js`

---

## 6. memory/ 目錄(Auto-Memory)

### 6.1 結構

```
memory/
├── MEMORY.md                              ← 主索引(每次新對話全量載入,保持精簡)
├── feedback_db_first_write_before_md.md
├── feedback_log_workflow_must_include_duration.md
├── feedback_no_fake_pricing_examples.md
├── feedback_sdd_spec_mandatory_for_ml_xl.md
├── intentional_idd_com_001.md
├── intentional_idd_com_002.md
├── intentional_idd_com_004.md
├── intentional_idd_reg_001.md
├── intentional_idd_reg_002.md
├── project_retention_6_axes.md
└── reference_ctr_p2_hook_intent_shipped.md
```

### 6.2 命名約定

| 前綴 | 類別 | 用途 |
|:----|:----|:----|
| `user_*` | User 視角 | 使用者偏好、習慣、限制 |
| `feedback_*` | Feedback | 使用者糾正 / 確認的指引 |
| `project_*` | Project 上下文 | 跨 Story 商業政策、合規、retention 等 |
| `reference_*` | 參考資料 | 範式 / 學習成果摘要 |
| `intentional_*` | IDD 摘要 | 對應 intentional_decisions 表 critical IDD |

### 6.3 MEMORY.md 精簡原則(TD-36 教訓)

```
規則:
- MEMORY.md ≤ 200 行(超過會被截斷)
- 每行 ≤ ~150 字元(超過會被視覺破壞)
- 格式:`- [Title](file.md) — 一句話 hook`
- 詳細內容放對應 *.md
- 細項與事故記錄放 Context Memory DB(category=session / category=feedback)

實際數據(2026-05-01):
- 12 篇 *.md(避免任意數量擴張)
- MEMORY.md 索引 ≤ 13 條(對應 12 篇 + 1 條提醒)
```

---

## 7. .claude/agent-memory/ 預留空間

```
.claude/agent-memory/
└── .gitkeep         ← 唯一檔案
```

**用途**:預留給未來 sub-agent session memory 持久化。目前透過 `subagent-context-inject.js` hook 動態注入而非實體 storage。

**Roadmap**:Sub-agent 完成後可寫 result snapshot 至此(避免 conversation_sessions 表過大),Phase 5+ 啟用。

---

## 8. DevConsole Web UI(視覺化介面)

### 8.1 啟動方式

```powershell
# 方式一:手動 BAT(推薦)
雙擊執行 → claude token減量策略研究分析\記憶庫策略\手動開關Server\1.DevConsole啟動.bat

# 方式二:命令列
cd tools/dev-console && npm run dev
```

### 8.2 存取位址

- 前端 UI:`http://localhost:5174`
- 後端 API:`http://localhost:3001`

### 8.3 功能頁面

| 頁面 | 說明 |
|:----|:----|
| **Dashboard** | Story 狀態分佈 KPI + 最近活動(workflow_executions + sessions merge)|
| **Stories** | Kanban 看板 + Epic 篩選 + Story 詳情(Markdown 渲染)|
| **Memory** | 記憶庫搜尋 / 瀏覽 + 分類篩選 + 手動 CRUD |
| **Sessions** | conversation_sessions 工作紀錄時間軸 |
| **CR Issues** | cr_issues 追蹤 + Severity / Resolution 統計 |
| **Patterns** | retrieval_observations + retrieval_hits 熱門條目 |
| **Schema** | 30+ tables 線上 schema viewer |
| **Documents** | document_chunks Hybrid Fusion Search(FTS5 + Vector)|

### 8.4 語言切換

預設繁中,Header 右上角按鈕切英文。`localStorage` key=`dvc-lang` 儲存偏好。

### 8.5 注意事項

- DevConsole 為**唯讀查看**為主,不修改記憶庫核心資料
- Memory 頁面手動 CRUD 直接寫 SQLite,使用時注意正確性
- 需先確認 `.context-db/context-memory.db` 存在(完成 L0 部署)

---

## 9. ledger.jsonl(寫入 ledger,災備)

### 9.1 設計

所有 DB 寫入操作 append-only 記錄至 `.context-db/ledger.jsonl`:

```jsonl
{"ts":"2026-05-01T16:30:00+08:00","op":"INSERT","table":"context_entries","data":{...}}
{"ts":"2026-05-01T16:30:15+08:00","op":"UPDATE","table":"stories","id":"eft-...","fields":{...}}
```

### 9.2 災備流程

DB 損壞時:
1. 重建空白 DB(`init-db.js`)
2. Replay ledger.jsonl(順序執行 INSERT/UPDATE/DELETE)
3. 重建 FTS5 indexes
4. 重新生成 embeddings

> **Git 策略**:`ledger.jsonl` git-tracked(若非過大), `context-memory.db` 不 git-tracked(`.gitignore` 已含)。

---

## 10. IDD-Context 觸發器(Schema Migration 2026-04-11)

`intentional_decisions` 表透過 SQLite trigger 自動同步至 `context_entries`(category=intentional):

```sql
CREATE TRIGGER trg_idd_to_context_insert
AFTER INSERT ON intentional_decisions
BEGIN
  INSERT INTO context_entries (agent_id, category, title, content, tags, source_idd_id, ...)
  VALUES ('SYSTEM-IDD-SYNC', 'intentional', NEW.title, NEW.context, NEW.related_skills, NEW.idd_id, ...);
END;

-- 對應 UPDATE / DELETE trigger
```

**用途**:Layer 10 RAG 注入時 search_context category=intentional 即可命中 active IDD 的 forbidden_changes。

---

## 11. Token 減量實績

### 11.1 MEMORY.md 精簡(TD-36)

| 項目 | 精簡前 | 精簡後 | 節省 |
|:----|:----|:----|:----|
| MEMORY.md | 8,812 bytes(~3.8K tokens)| 788 bytes(~380 tokens)| ~3,420 |
| pipeline-lessons.md | 5,757 bytes(~2.1K tokens)| 已刪除 | ~2,100 |
| context-memory-db.md(新增)| — | ~200 tokens | +200 |
| **合計** | ~5.9K tokens | ~580 tokens | **~5,320 tokens(90%)** |

### 11.2 Embedding 成本

| 方案 | 維度 | 成本 | 速度 |
|:----|:----:|:----|:----|
| OpenAI text-embedding-3-small | 1536 | ~$0.02/5K symbols | API 呼叫 |
| **Xenova/all-MiniLM-L6-v2(本地)** | **384** | **$0**(零 API)| 本地 ONNX |

CMI-6(2026-03-09)切換為本地 ONNX 後零 API 成本。

---

## 12. 容錯降級

| 故障 | 降級行為 |
|:----|:----|
| MCP Server 未啟動 | search_* 工具不可用,直接讀 `memory/MEMORY.md` + `docs/tracking/active/` |
| DB 不存在 | `node .context-db/scripts/init-db.js` 重建 |
| FTS5 無結果 | 縮短 query(2-3 字核心)+ 移除 filter;仍無 → 視為未記錄 |
| ONNX 不可用(L2/L3)| `semantic_search` → `search_symbols` LIKE fallback;`pre-prompt-rag` → keyword fallback;完全停用 `set PROJECT_RAG_HOOK=false` |
| ledger.jsonl 損壞 | 從 git 恢復;若 git 也無 → DB 仍可繼續(只是失災備)|

---

## 13. 自助驗證指令

```powershell
# 列出 30+ 張表
$db = ".context-db\context-memory.db"
sqlite3 $db ".schema" | Select-String "^CREATE TABLE" | Measure-Object

# 列出 23 MCP tools
node .context-db/server.js --list-tools

# 列出 82 scripts
(Get-ChildItem .context-db\scripts\*.js,.context-db\scripts\*.cjs).Count

# 確認 11 hook layer RAG 注入正常
$env:PROJECT_RAG_HOOK_DEBUG = "true"
node .claude/hooks/pre-prompt-rag.js < /dev/null

# 列出 memory/ 結構
Get-ChildItem memory\ | Select-Object Name, Length

# 檢查 ledger.jsonl 寫入
Get-Content .context-db\ledger.jsonl | Select-Object -Last 5

# DevConsole 啟動驗證
curl http://localhost:3001/api/health  # 後端健康
curl http://localhost:5174              # 前端 UI
```

---

## 14. Related Reading

- `hooks-events-deep-dive.md` §4 — 11 層 RAG 注入詳細
- `idd-framework.md` — `intentional_decisions` 表使用情境
- `skills-deep-dive.md` — pcpt-context-memory / pcpt-debt-registry / pcpt-otel-micro-collector Skills
- `bmad-workflows-evolution.md` — workflow_executions / pipeline_checkpoints 整合
- `mcp-ecosystem.md` — pcpt-context vs 其他 MCP server

---

## 15. 版本歷史

| 版本 | 日期 | 變更 |
|:----|:----|:----|
| 1.0.0 | 2026-05-01 | 初版建立。5 大組件全景 + 30+ 表 schema(line-by-line)+ 23 MCP tools + 82 scripts + memory/ + agent-memory + DevConsole + ledger.jsonl |
