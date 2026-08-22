# phycool-context-memory — §4-§8 Hook Triple-Write + 5-Layer Memory + CMI-10 Hybrid Fusion + Doc Taxonomy + Sync Engine

> **抽出自** `.claude/skills/phycool-context-memory/SKILL.md` 2026-05-16 P2 modularization (saas-to-skill Mode B 8-aspect validation pass). 主 SKILL.md ≤300 行,本檔承載 §4-§8 Hook Triple-Write + 5-Layer Memory + CMI-10 Hybrid Fusion + Doc Taxonomy + Sync Engine。

---

## 4. Hook Triple-Write Insurance

> **目前 Hook 總數**: 65 個 handler（.claude/settings.json `ConvertFrom-Json` 實測 2026-08-03；下表為代表性條目非全列）
> 舊註記「15 個 handler（驗證 2026-04-13）」為長期未同步的 stale 值，tdb-4 順手校正
> ECC v1.9.0 (2026-04-03) 新增 4 個 handler，Stop hook 改為 pipeline-heartbeat

| Hook | Trigger | Purpose |
|------|---------|---------|
| Stop (×2) | Response complete | pipeline-heartbeat.js (signal) + incremental-embed.js (re-embed queue) |
| SessionStart (all) | Session starts | otel-auto-start.js (auto-start OTel collector port 49200, idempotent; rotation 由 collector 內部,不重啟) |
| SessionEnd | Conversation ends | log-session.js (unconditional INSERT) + otel-session-aggregate.js (glob-resilient: info.json PoT + glob jsonl + marker 冪等 → UPDATE workflow_executions；跨日零遺失) |
| PreCompact (×2) | Before compaction | precompact-tool-preprune.js (td-37: Pass 1 dedup + Pass 2 summarize → DB `compaction_preprune`) + log-session.js (2min dedup)。**tdb-4 (2026-08-03)**: `pre-compact-snapshot.ps1` 除役 + digest append 支線拆除,本鏈純 DB 寫零 `.md` 產出 |
| PostToolUse (×2) | Edit/Write | observe-pattern.js (18 domains) + file-lock-acquire.ps1 |
| PreToolUse (×3) | Bash/MCP/Edit | file-lock-check.ps1 + pre-commit-quality.js + mcp-health-check.js |
| PostToolUseFailure | MCP 失敗 | mcp-health-check.js (auto-reconnect) |
| UserPromptSubmit | User submits | pre-prompt-rag.js (11-layer context inject [Session/Violations/Task/IDD/Pipeline/Skill/LSP/Code/Doc] + intent gating: Code RAG/LSP/IDD/Violations conditional on `detectCodeIntent()`, not write) |
| SessionStart | compact/resume | session-recovery.js (HANDOFF_PREFIX inject + checkpoint inject + 30-min stale detect + legacy `[CONTEXT SUMMARY]:` detection) |
| SubagentStart | Sub-agent spawned | subagent-context-inject.js |

Full details (Pipeline Matrix, STORY_ID_REGEX, 11-Layer [DLA-07 IDD + td-rule-violation-rag-inject Layer 11], S_final phases, Phase 4 hooks, Retrieval):
[references/hooks-and-scripts.md](hooks-and-scripts.md)

---

## 5. 5-Layer Memory Architecture

| Layer | Tables | Purpose | Write Frequency | Token Cost |
|:-----:|--------|---------|:---------------:|:----------:|
| Strategic | `context_entries` | Decisions/patterns/session snapshots | Low | Medium (MCP) |
| Technical | `tech_entries` | Architecture/test patterns/bug fixes | Low | Medium (MCP) |
| Conversational | `conversation_sessions` + `turns` | Complete Q&A records | High (each response) | **0** (Hook) |
| Code | `symbol_index` + `embeddings` | Class/Method/Interface | **Auto** (incremental) | **0** (hook) |
| Behavioral | `pattern_observations` | File-change patterns + confidence | High (each Edit/Write) | **0** (hook) |

### Data Persistence (Ledger Dual-Write)

DB-Native tables (context_entries/tech_entries/workflow_executions/benchmarks/glossary) have **no filesystem counterpart**. Loss = unrecoverable.

```
Every DB-Native write -> synchronously appendFileSync ledger.jsonl (Git tracked)
  server.js appendLedger() wired to all 5 write handlers:
    add_context, add_tech, add_cr_issue, log_workflow, upsert_benchmark
Disaster recovery: node .context-db/scripts/restore.js         <- dry-run report
                   node .context-db/scripts/restore.js --apply <- replay into DB
                   node .context-db/scripts/restore.js --apply --force <- skip confirmation
```

> **Note**: ledger.jsonl is created on first MCP write after server restart. Format: one JSON object per line `{ts, table, op, data}`.

- Git-reconstructible data (Stories/CR/Sprint): DB = index layer, YAML/files = Source of Truth
- DB-Native data: DB + ledger.jsonl = Source of Truth

---

## 6. CMI-10 Hybrid Search 3-Tier Fallback + S_final 4-Axis Fusion (v2.8.0)

### 6.1 3-Tier Fallback

1. **ONNX vector search** (preferred): 384D Cosine Similarity, local all-MiniLM-L6-v2
2. **FTS5 Hybrid** (fallback): ONNX fails -> auto-switch `0.7*vector + 0.3*bm25` -> pure BM25
3. **LIKE fallback** (last resort): FTS5 also fails -> `LIKE '%query%'`, ensures search never blocks

### 6.2 S_final 4-Axis Fusion(pre-prompt-rag.js **Layer 3**, ADR-GOVERNANCE-001 v1.0)

> ⚠️ **Layer 標記校正(2026-05-27)**: 本融合在 `pre-prompt-rag.js` 的 **Layer 3**(11-Layer 真實層序,對齊架構全景 README §Layer5 表 Layer 3 = S_final 融合);原標「Layer 10」為 2026-05-16 拆檔時的舊層序殘留(Layer 10 實際是 IDD 注入)。

```
S_final = ALPHA·vec + BETA·graph + GAMMA·fts + DELTA·centrality
        = 0.6·vec   + 0.2·graph + 0.2·fts + 0.05·centrality   (since 2026-05-02)
```

**權重 SSoT**:
- ALPHA = 0.6(向量相似度,主軸)
- BETA  = 0.2(2-hop graph score via expandDependencies)
- GAMMA = 0.2(FTS5 文字相似度)
- **DELTA = 0.05(NEW v2.8.0)**:centrality_score 微幅加權,漸進不破壞既有 0.6/0.2/0.2 主軸

**RELATION_WEIGHTS**(graph score 量化):
```
{ inherits:1.0, implements:0.9, calls:0.7, uses_inferred:0.4 }
```

**SSoT 跨檔同步**(file:line 2026-05-27 驗證):
- `.claude/hooks/pre-prompt-rag.js:95`(DELTA 常數)
- `.claude/hooks/pre-prompt-rag.js:114-119`(RELATION_WEIGHTS)
- `.claude/hooks/pre-prompt-rag.js:273`(`calculateSfinal(symbols, pprScores = null)` 公式 · G14 P2 後簽名加 pprScores)
- `.context-db/scripts/compute-centrality.cjs`(離線批計算 RELATION_WEIGHTS 必對齊 → 寫入 god_nodes 表 via TRUNCATE+INSERT transaction,非 UPDATE symbol_index)

**Kill Switch**: Layer 3 加權若 retrieval_observations 命中率退化 ≥ 5% → 設 DELTA=0 即可回退(對齊 ADR-GOVERNANCE-001 §8.4)。

### 6.3 G14 P2 RepoMap v2 — DELTA·centrality 升級 Personalized PageRank(2026-05-27 · commit f8dc9d6d + e709abb8 啟用)

DELTA·centrality 由「靜態 god_nodes centrality(全局)」升級為「Personalized PageRank(相對當前任務)」:

- **ENV flag**: `PHYCOOL_PPR_ENABLED`(`.claude/settings.json:493`=true · `pre-prompt-rag.js:102` · 預設關向後相容)。關 → 靜態 centrality 行為不變;開 + intent=code → PPR rerank。
- **演算法**: `.context-db/scripts/repomap-ppr.cjs`(export `computePersonalizedPageRank(deps, seeds, symbolMeta)` + `buildSymbolMeta(db)`)。在 `symbol_dependencies` 圖跑 Personalized PageRank,seeds = 當前任務 vec 命中符號(`topSymbols.full_name`),讓結構權重「相對任務」而非全局。對齊 Aider repo-map SOTA。
- **Aider 抗污染 4 招**: ① sqrt(ref_count) 阻尼 ② hub 壓制(symbol_name 定義 ≥5 檔 ×0.1) ③ is_test 過濾 ④ vendor/temp 排除。DRY 重用 compute-centrality.cjs `RELATION_WEIGHTS` + `isTest`。
- **整合點**: `pre-prompt-rag.js:1113-1130`(Layer 3 · PPR_ENABLED → 算 pprScores → `calculateSfinal(expanded, pprScores)`)。
- **fail-safe**: PPR 失敗 → pprScores=null → fallback 靜態 centrality。**注入量不增**(留 `CODE_RAG_CHARS=1450` 內 rerank,只改排序不改集合大小 → ECC Layer 12 零影響)。bwu-11 起預算單位為字元;Layer 12 亦改為靜態 `INSTINCT_CHARS=450`,原「usedSoFar 動態扣減」機制已移除。
- **召回 gate**: F-S6 v2 召回保留 **100%**(退化 ≥5% ABORT · PPR 僅 rerank 把更相關 symbol 排上來,symbols 集合不變)。完整決策 + PoC + Aider 全景見改善計畫-專家深度分析.md §6.7。

---

## 7. Document Taxonomy (R9)

### Three-Layer Index Strategy

| Layer | Index Depth | Types | Examples |
|:-----:|------------|-------|----------|
| A | Full DB index (structured fields) | Story / CR Report / CR Issue / ADR / Tech Spec / YAML | `stories`, `cr_reports` |
| B | Directory index (`doc_index` path+title) | Functional Spec / Architecture / Analysis Reports / Tracking | `doc_index` |
| C | Not indexed | Skill definitions / CLAUDE.md / Token research / Epic README | Other mechanisms |

### Three-Level Classification

```
Level 1 (product_line): phycool / devops / ai-agent / research
Level 2 (product_sub):  pcpt / psop / platform / cc / gc / ag / memory
Level 3 (module):       editor / editor.shape / member / admin / ...
```

---

## 8. Sync Engine (R10 Three-Layer Sync)

### Layer 1 — Workflow Boundary Sync (0 tokens)

```bash
node .context-db/scripts/sync-workflow-output.js --story $StoryId --stage $Stage
```

Sync targets: Story status -> `stories` / CR reports -> `cr_reports + cr_issues` / YAML -> `sprint_index`

### Layer 2 — AI Workflow Write (few tokens)

AI actively calls `add_tech()` / `add_context()` when discovering technical insights.

### Layer 3 — Periodic Scan (0 tokens, Windows Task Scheduler)

| Frequency | Script | Schedule | Purpose |
|-----------|--------|----------|---------|
| Daily | `scan-doc-index.js` | 03:00 | doc_index rebuild + Document RAG freshness |
| Weekly | `validate-data.js` | Sun 04:00 | Git vs DB consistency check (read-only report) |
| Monthly | `cleanup-orphans.js` | 1st 05:00 | DELETE stale chunks / orphan embeddings / old queue |

**Task Scheduler**: Registered under `PhyCool\` folder. Wrapper .cmd files with detailed REM comments in `scripts/scheduled/`.

```
Install:  powershell -File scripts/scheduled/install-schedules.ps1
Verify:   Get-ScheduledTask -TaskPath '\PhyCool\'
Run now:  schtasks /Run /TN "PhyCool\ScanDocIndex"
Logs:     scripts/scheduled/logs/
```

---


---
