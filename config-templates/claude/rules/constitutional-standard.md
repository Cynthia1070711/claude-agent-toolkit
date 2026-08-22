# Constitutional Standard — SUPREME

> **2026-05-16 surgical split**: 原 244 行 always-on 拆解為 always-on 核心 3 mandates(本檔)+ 3 個 paths-scoped sub-rules(Backend Contract / Depth-First / External Source Citation)。其餘 Mandate(Audit Anti-Patterns / Anti-Speculation)整併進 sub-rules。Karpathy / Bilingual 規範保留於 MEMORY.md `See` 指向的對應檔(若存在)。

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

> **2026-05-31 upgraded to offset-aware principle** (賦能軌 Party Mode + user ruling; aligns `docs/technical-decisions/ADR-TZ-001-平台時區策略.md` §7). The literal "store UTC+8" was an i18n anti-pattern; the mandate's *intent* (Taiwan time shows correctly / no 8h-early bug) is fully preserved.

**Top principle**: every timestamp written to DB/file must be **offset-aware** — it carries `+08:00` or `Z`. **Naive wall-clock time is forbidden** (no tz marker → cross-tool compares are off by 8h). Different systems may pick different offsets and all comply:

| System | Stores | SSoT |
|--------|--------|------|
| Production platform `src/YourApp` | **UTC** (display / day-boundary convert to Taiwan via one helper, per ADR-TZ-001) | `ITaiwanTime.NowIso()` (Common/TaiwanTime.cs) / `DateTimeOffset.UtcNow` |
| Dev-env memory `.context-db` | **offset-aware Taiwan `+08:00`** | `.context-db/scripts/timezone.js` → `getTaiwanTimestamp()` |
| PowerShell | `+08:00` | `Get-Date -Format 'yyyy-MM-ddTHH:mm:ss+08:00'` |

**Forbidden (naive — the real trap)**: SQLite `datetime('now','+8 hours')` (naive Taiwan) · JS `toLocaleString('sv',{timeZone:'Asia/Taipei'})` (naive) · bare `new Date().toISOString()` into a Taiwan-domain column · prod `UtcNow.AddHours(8)` stored (Kind pollution, rejected by ADR-TZ-001 §6).

**Incident**: 2026-03-22 review_reports/stories mixed UTC/UTC+8 (8h early). 2026-05-31 賦能軌 TZ audit found `.context-db` scripts in 3 competing formats (offset-aware / naive Taiwan / bare UTC); root cause = this mandate itself mixed naive advice (PowerShell offset-aware vs SQLite/JS naive). This upgrade closes the naive loophole.

---

## Language Standard

All user-facing output must use Traditional Chinese (zh-TW). This rule overrides all Workflow templates.

**English allowed**: code, technical terms (API, JWT, CSRF etc.), paths, Git commands, variable/function names.

**Workflow execution**: Never copy English `<output>` templates verbatim — translate all titles, field names, descriptions to Traditional Chinese.

**Self-review**: Scan for unnecessary English sentences before sending — fix immediately.

Translation reference: `.claude/skills/constitutional-standard/SKILL.md`

---

## Paths-Scoped Sub-Rules(2026-05-16 拆解)

下列 3 個 sub-rules 由 paths frontmatter 條件載入,降低 always-on 成本但保留 SUPREME 等級規範:

| Sub-rule | paths 範圍 | 規範內容 |
|----------|-----------|---------|
| `.claude/rules/constitutional-backend-contract.md` | `**/*.cs`, `**/*.sql`, `Migrations/**`, backend Models/Controllers/Services | **Backend Contract Verification Mandate** — DB schema 欄位 / API contract / Entity 語意必 file:line 引用 backend code |
| `.claude/rules/constitutional-depth-first.md` | `audit/**`, `docs/tracking/**`, `docs/implementation-artifacts/reviews/**`, `_bmad/**` | **Depth-First Verification Mandate** + Audit Anti-Patterns — 檢查/驗證類問題必走深度路徑 + 4 條 Audit 反模式 |
| `.claude/rules/constitutional-external-citation.md` | `docs/**`, `**/*.md`, `src/**`, `_bmad/**` | **External Source Citation Mandate** + Anti-Speculation — DETECT/FETCH/CITE 三步循環 + 30 詞投機表 |

**重要**: paths-scoped 規則在 Write 工具觸發時不載入(Bug #23478)。配套 `.claude/hooks/cc-config-guard.js` + `.claude/hooks/cross-ref-precheck.js` PostToolUse hook 兜底。

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **2.0.0** | **2026-05-16** | **Surgical split** — 原 244 行 always-on 拆為 always-on 核心 3 mandates(本檔 ~70 行)+ 3 paths-scoped sub-rules(constitutional-backend-contract / depth-first / external-citation)。預估省 ~5k always-on tokens。對齊 P0-5 執行計畫(`claude token減量策略研究分析/環境配置優化建議-20260516/EXECUTION-PLAN-P0P1.md`)。觸發:2026-05-16 ultrathink session 對 Memory tokens 43.4k 過高根因分析,Party Mode CEO 收斂決議。 |
| 1.x.x | 2026-03 ~ 2026-05 | 累積 Mandate(完整歷史見 backup `claude token減量策略研究分析/環境配置優化建議-20260516/backups/2026-05-16-122549/rules/constitutional-standard.md`)|
