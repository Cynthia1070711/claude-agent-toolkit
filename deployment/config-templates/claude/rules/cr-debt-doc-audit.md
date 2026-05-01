---
paths:
  - "_bmad/bmm/workflows/**/code-review/**"
  - "_bmad/bmm/workflows/**/dev-story/**"
  - "src/**"
  - ".context-db/scripts/upsert-debt.js"
  - ".context-db/scripts/upsert-story.js"
  - ".context-db/scripts/log-rule-violation.js"
  - "docs/implementation-artifacts/reviews/**"
  - ".claude/skills/pcpt-debt-registry/**"
  - ".claude/skills/pcpt-intentional-decisions/**"
---

# CR Post-Fix Audit Gate — 技術債挑戰 + 文檔同步

## Applies When

code-review workflow Step 4 (auto-fix) 完成後、Step 5/6 (report/archive) 之前。

## Core Principle

> **Agent 天生傾向過度保守分類 debt（ACCEPTED/DEFERRED 比 FIXED 容易寫）。** 每個非 FIXED 項目必須經過實際試修挑戰,不可僅憑估計成本分類。文檔同步缺漏則會導致下一次對話看到 stale 資訊。

---

## Phase A: 技術債自我挑戰（4 題必答）

### A1. 該 Story 是否有殘留的技術債？

**動作**: `search_debt(story_id={story_key})` 查 DB + 確認 `cr_issues_deferred` 非零則列出每筆

### A2. 殘留的技術債為什麼不直接修復？

**動作**: 對每筆非 FIXED 項目,**實際嘗試修復**（不是估算）：

| 步驟 | 要求 |
|------|------|
| 1. 定位 | Read file:line 確認問題存在 |
| 2. 試修 | 寫出修復 code（即使不確定是否正確） |
| 3. 驗測 | 跑 test 驗證修復是否破壞 |
| 4. 判斷 | 試修成功 → 改為 FIXED；試修失敗 → 記錄失敗理由 |

**FORBIDDEN**:
- 「估計需要 20 行」但未實際寫 code → 不可分類為 DEFERRED/ACCEPTED
- 「需要重構多個 test」但未實際試改一個 → 不可分類為 DEFERRED/ACCEPTED
- 「系統性問題」但未量化具體幾個檔/幾行 → 不可分類為 DEFERRED/ACCEPTED

#### A2.1: ACCEPT/DEFER 前必 Glob 周邊基礎設施 (v2 強化, 2026-04-20 eft-dashboard-monetization-funnel R3)

在分類非 FIXED 前,MUST glob 相關基礎設施:

| 債類型 | 必 glob 的 pattern |
|-------|-------------------|
| Test debt | `**/*Factory*.cs` + `**/*Fixture*.cs` + `.csproj` 的 `<PackageReference>` |
| Route debt | `**/*Route*.cs` + grep `public partial class Program` |
| DB debt | `**/Testcontainers*` + `**/*DbContext*` |
| Integration test debt | `**/CustomWebApplicationFactory*` + `Testcontainers.MsSql` nuget |

**禁止**: 假設基礎設施不存在即斷言 XL FixCost。1+ 年前的「已放棄」註解可能已過時,**必先 glob 驗證**。

#### A2.2: FixCost ≥ M=5 必須 spike 實測 (v2 強化)

任何聲稱 FixCost M/L/XL 的 debt,**必須 spike 至少 1 test** 證明成本,禁純估算:
- Spike 成功 → 改為 FIXED,記錄實際行數
- Spike 失敗 → `fix_cost_spike_evidence` 欄位記錄具體 technical barrier(非 folklore)

#### A2.3: Pre-production ACCEPT/DEFER 特殊約束 (v2 新增)

Localhost dev 階段為 debt 黃金修復期:
- **BusinessImpact 不可用 DevExp=1 壓低 score** 作為 ACCEPT 唯一理由
- **FixCost ≤ S=2 禁止 ACCEPT/DEFER**(除非 IDD-USR 明確論證)
- **ACCEPT 必填 `pre_production_rationale`** 顯式化「即使 dev 階段仍不修」的具體理由

### A3. 延後的有沒有於關聯 Story 註記？

**動作**:

| 分類 | 必要關聯 |
|------|---------|
| DEFERRED | `target_story` 必非 NULL + `search_stories({target_story})` 確認 Story 存在 |
| ACCEPTED | `review_date` 必非 NULL + `accepted_reason` 必非 NULL |
| IDD | ADR 檔存在 + `add_intentional_decision` DB 有記錄 + code annotation 存在 |

**驗證**: 直接 query DB 確認欄位非 NULL,不信任 upsert 回傳的 "成功" 訊息。

### A4. 修復的技術債有沒有回原 Story 註記？(統計欄位層)

**動作**: 確認 `stories` 表以下欄位與實際修復結果一致：

| DB 欄位 | 預期值 |
|---------|--------|
| `cr_score` | 反映最終（修復後）score |
| `cr_issues_total` | 去重後 findings 總數 |
| `cr_issues_fixed` | FIXED 數量（含追加修復） |
| `cr_issues_deferred` | DEFERRED + ACCEPTED + IDD 數量 |
| `cr_summary` | 非 NULL，含修復/延後摘要 |

**驗證**: `search_stories({story_id, fields:"cr_score,cr_issues_total,cr_issues_fixed,cr_issues_deferred,cr_summary"})` 逐欄比對。

> **注意**: A4 的五個 cr_* 欄位僅為 **必要條件非充分條件**。A5 是 Phase A 的**內容層**必答題,不可以 A4 PASS 宣告 Phase A 完成。

### A5. 修復痕跡回註三內容欄位?(內容層 — 2026-04-21 td-testcontainers R2 ultrathink 固化新增)

**動作**: 確認 `stories` 表以下**三內容欄位**反映 CR 修改痕跡:

| DB 欄位 | 檢核要點 | 驗證方式 |
|---------|---------|---------|
| `tasks` | 對每個 FIXED finding,`tasks` 字串可 grep 到 `+CR F#` 或 `+CR [描述]` 修復痕跡註記;每個 `file:line` 範圍反映最終實測 line count(非 dev-story 估算值) | `search_stories({story_id, fields:"tasks"}).tasks.match(/\+CR /g)` 筆數 ≥ FIXED 數 |
| `dev_notes` | dev_notes 中引用的版本/連結/file:line/nuget 版本等 reference,與現況一致(無 stale 如 `v3.x` vs 實際 csproj `v4.*`) | 對 dev_notes 引用的每個技術版本 grep 當前 csproj / package.json / Models 驗證 |
| `file_list` | file_list 含本次 CR 階段 MODIFY 的所有檔案(不只 dev-story 階段的 NEW/MODIFY),含 `.claude/settings.local.json` / rule / skill 等可能被忽略的類別 | 執行 `git status --porcelain` + git diff --name-only;每個 modified path 應在 file_list 出現(或有合理豁免如 `session-snapshot.md`/`auto-generated timestamp` etc.) |

**驗證**: 若以上任一欄位未反映 CR 痕跡 → **HARD BLOCK**,須回 Step 4/5 補 upsert-story.js --merge 寫 tasks/dev_notes/file_list 三欄位。

**背景事故**: 2026-04-21 `td-testcontainers-template-library` CR R1 階段把 5 項 documentation drift 標示為 "INFO 不計 score" 視作 "Step 6 merge 備註" 實際未執行欄位 update 就結束 workflow。使用者 ultrathink 三題挑戰(`Q3: 修復的技術債有回原 story 註記嗎?`)曝露此 gap — R1 Phase A Q4 只驗 cr_* 統計欄位 PASS 但 tasks/dev_notes/file_list 三內容欄位都有 drift。R2 rescue 全數補齊後本 A5 規則被固化。See `memory/feedback_cr_must_try_fix_before_defer.md` + `pcpt-debt-registry` v3.3.2 §18.2 INFO label trap FORBIDDEN。

**FORBIDDEN**:
- ❌ 「INFO drift 留給 Step 6 一次 merge」但實際未 upsert tasks/dev_notes/file_list → 屬隱性 defer
- ❌ 以 `cr_issues_total=N / cr_issues_fixed=N / cr_issues_deferred=0` 自認 100 分,但 tasks 仍保留 dev-story 原始描述(無 CR 修復痕跡)
- ❌ `dev_notes` 引用的版本/連結/file:line 與 CR 實測不符 → 下次 Agent 引用會誤判

---

## Phase B: 文檔同步檢查（4 項必查）

| # | 項目 | 驗證方式 | 不合規動作 |
|:-:|------|---------|-----------|
| B1 | CR Report 反映最終 score | Read report header `Score:` 行 | Edit 修正 |
| B2 | Sprint-status.yaml 有此 Story 條目 | Grep `{story_key}` | 新增 entry |
| B3 | Reviews README 有此 CR entry | Grep `{story_key}` in README.md | 新增 entry |
| B4 | Tracking file 反映最終結果 | Read tracking 最後一筆 CR 記錄 | Edit 修正 |

---

## Phase C: Skill Sync Gate（已有 rule,此處提醒觸發）

驗證 `.claude/rules/skill-sync-gate.md` 已執行。若 file_list 含 Frontend architecture / component / CSS 變更 → 確認 Skill Impact Report 已產出且 ✅ 或 Mode B 已執行。

---

## Phase D: Rule Violation Logging (mandatory, 2026-04-20 新增)

CR 過程中若發生以下任一情境 → MUST 執行 `log-rule-violation.js` 記錄到 `context_entries.category='rule_violation'`:

| 情境 | violated_rule | severity |
|------|--------------|----------|
| R1 → R2/R3 rescue(Phase A 分類被挑戰並修正) | `memory/feedback_cr_must_try_fix_before_defer.md` | high |
| CR Report 含 `⚠ WARN` 但未 accept-warn 也未解決 | `.claude/rules/depth-gate-warn-mandatory-resolution.md` | high |
| FixCost 估算引用 > 6 個月前記錄為依據(未 spike 驗證) | `.claude/rules/constitutional-standard.md` | medium |
| Skill FORBIDDEN 清單項目被跳過 | 對應 Skill SKILL.md FORBIDDEN section | medium |
| Pre-production ACCEPT/DEFER 無 `pre_production_rationale` | `.claude/skills/pcpt-debt-registry/SKILL.md §5.3` | medium |

**CLI 範例**:
```bash
node .context-db/scripts/log-rule-violation.js \
  --rule "memory/feedback_cr_must_try_fix_before_defer.md" \
  --loaded true \
  --cli-enforced false \
  --phase code-review \
  --severity high \
  --summary "R1 Phase A 僅估算 FixCost 未試修就 DEFER,R2 挑戰後實修符合 5-Min Rule" \
  --story {story_key} \
  --epic {epic} \
  --tags "phase-a-no-try-fix,rN-rescue"
```

**Enforcement**:
- 本 `.claude/rules/cr-debt-doc-audit.md` 自檢 checklist 加 `☐ Phase D 違規 log 完成`
- 未完成 = WARN(依 `.claude/rules/depth-gate-warn-mandatory-resolution.md`)
- Dashboard: http://localhost:5174/rule-violations 查 4 區塊儀表板

**Why mandatory?** 本 tracker 存在目的是量化 attention dilution,但本身會被 attention dilution 污染 — Agent 犯錯後容易忘記打卡 → DB 低估違規率。Phase D 強制檢核關閉此觀察者悖論。

---

## 執行時機

```
code-review Step 4 auto-fix 完成
  ↓
Step 4.5 CR Post-Fix Audit Gate（本 rule）
  Phase A: 技術債挑戰 5 題(含 A5 三內容欄位檢核,2026-04-21 新增)
  Phase B: 文檔同步 4 項
  Phase C: Skill Sync 確認
  Phase D: Rule Violation Logging
  ↓
Step 5/6: Report + Archive
```

## FORBIDDEN

- ❌ 跳過 Phase A 直接寫 CR Report（debt 可能被錯誤分類）
- ❌ 以「估算成本」替代「實際試修」判斷 DEFERRED/ACCEPTED
- ❌ 信任 upsert script 回傳 "成功" 不 query 驗證 DB 實際值
- ❌ CR Report / sprint-status / README / tracking 任一未更新就宣告完成
- ❌ **以「INFO 級不計 Score」迴避 Phase A 試修 rule** — INFO label 不改變 defer 本質,任何 drift 都應經 `feedback_cr_must_try_fix_before_defer.md` 檢驗(2026-04-21 td-testcontainers R2 固化)
- ❌ **A4 PASS 但 A5 不做** — tasks/dev_notes/file_list 三內容欄位未反映 CR 修改痕跡 = Reader 讀 tasks 看不到 `+CR F#` = 未註記 = 下次 Agent 會誤判(2026-04-21 td-testcontainers R2 固化)

## Incident Record

- **2026-04-16 eft-imagepanel-gallery-unified 事故**: CR Step 4 將 act() warnings 分類為 ACCEPTED（估計 7+ tests 要改、Priority Score 4）。使用者挑戰後實際試修只需改 5 個 test 各加 1 行 `await waitFor(...)`，共 5 行 < 3 分鐘。同時 CR Report 留 stale score 95（應 100）、sprint-status 無條目、Reviews README 無 entry。觸發本 rule 建立。
- **2026-04-21 td-testcontainers-template-library 事故**: CR R1 把 5 項 documentation drift 標示為 "INFO 不計 score" 視作 "Step 6 merge 備註" 實際未執行欄位 update。使用者 ultrathink 三題挑戰(「修復的技術債有回原 story 註記嗎?」)曝露 **R1 Phase A Q4 只驗 cr_* 統計欄位 PASS 但 tasks/dev_notes/file_list 三內容欄位都有 drift**。R2 rescue 補齊後固化本 rule **A5**(內容層檢核)+ FORBIDDEN 兩條。See `memory/feedback_cr_must_try_fix_before_defer.md` + `pcpt-debt-registry` v3.3.2 §18.2 INFO label trap FORBIDDEN + `docs/implementation-artifacts/reviews/epic-dla/td-testcontainers-template-library-code-review-report.md` Appendix B lesson。

## Version History

| 版本 | 日期 | 變更 |
|------|------|------|
| 1.0.0 | 2026-04-16 | Initial creation. eft-imagepanel-gallery-unified CR 事故觸發。 |
| **2.0.0** | **2026-04-21** | **Phase A 加 A5 內容層檢核 + 兩條 FORBIDDEN**。事故觸發: td-testcontainers-template-library CR R1 把 5 項 drift 標 "INFO 不計 Score" 偽裝 defer → 使用者 ultrathink 三題挑戰曝露 Phase A Q4 只驗 cr_* 統計欄位 gap。固化 tasks/dev_notes/file_list 三內容欄位必驗,防 next-conversation 同模式再犯。 |
