# phycool-debt-registry — §6-§9 5-Min + Boy Scout + Stale + Triage

> **抽出自** `.claude/skills/phycool-debt-registry/SKILL.md` 2026-05-16 P2 modularization (saas-to-skill Mode B 8-aspect validation pass). 主 SKILL.md ≤300 行,本檔承載 §6-§9 5-Min + Boy Scout + Stale + Triage。

---

## 6. 5-Minute Rule — Quick Fix Inline (v3.0 新增)

> **核心原則**: 任何符合 5-Minute 條件的 debt,**禁止**標記為 WON'T FIX 或 DEFERRED,**必須** inline FIX。
>
> **為何?** 開發者本能選最低阻力路徑。若「修」比「標 WON'T FIX」阻力更高,則 WON'T FIX 會被濫用。必須讓「順手修」成為最低阻力。

### 6.1 5-Minute 條件 (必須全部滿足)

| 條件 | 說明 | 範例 ✅ | 反例 ❌ |
|------|------|---------|---------|
| ≤ 5 行 code change | 修改量小 | 提取常數 | 拆解 function |
| 0 跨檔依賴 | 只改本檔 | 改本檔變數名 | 改 API signature |
| 0 副作用 | public API/DB schema 不變 | 加 type annotation | 改 prop 介面 |
| 0 test break 風險 | 不觸動邏輯分支 | typo 修正 | 改條件判斷 |
| ≤ 5 分鐘可完成 | 時間短 | 加 const | 重構迴圈 |

### 6.2 Quick Fix Whitelist (明確可修)

- ✅ 硬編碼字串提取常數 (< 3 處引用)
- ✅ 變數命名一致化 (本檔內)
- ✅ 加 `const` / `readonly` / type annotation
- ✅ typo 修正 (comment / variable / log message)
- ✅ 移除 dead import / unused variable
- ✅ console.log → logger.debug
- ✅ 加缺失的 nullish check (本地變數)
- ✅ 修正 JSDoc / XML doc 拼寫

### 6.3 Quick Fix Blacklist (明確排除)

- ❌ 任何跨檔重構
- ❌ 任何 API / Component prop 變更
- ❌ 任何 DB schema 變更
- ❌ 任何測試新增 / 修改
- ❌ 任何 namespace / module 重組
- ❌ 任何條件邏輯變更
- ❌ 任何 IDD 標註區域 (`[Intentional:]`)

### 6.4 強制執行點

**code-review Step 3**: 凡是宣稱 WON'T FIX 的項目必須先過 5-Minute Rule 篩選,通過則立即修。

```
CR 發現 debt X
  ↓
通過 5-Minute Rule?
  ├ 是 → MUST FIX NOW (不可標 WON'T FIX)
  └ 否 → 繼續分類流程 (Q1-Q5 自檢)
```

---

## 7. Boy Scout Rule — Dev-Story Sweep (v3.0 新增) [IMPLEMENTED: dla-05]

> **核心原則**: dev-story Step 9 §7.5,必須執行 Boy Scout Sweep,對當前 Story 的 file_list 反查 open debts,適用 5-Minute Rule 的全部順手修掉。
>
> **實作腳本**: `.context-db/scripts/boy-scout-sweep.js` (dla-05, ESM, reuses Layer 3 S1-S4 classifier)

### 7.1 演算法

```
1. files = story.file_list (NEW/MODIFY only)
2. debts = boy-scout-sweep.js --files "{files}" (query tech_debt_items WHERE status='open' + LIKE match)
3. 4-signal classifier (S1 single_file, S2 low_severity, S3 refactor_category, S4 not_intentional):
     - ALL true → sweep candidate
     - ANY false → skip (reason logged)
4. Dev agent inline fix each candidate (≤5 lines, 0 cross-file deps, 0 side effects)
5. boy-scout-sweep.js --files "{files}" --execute --story {id} --agent {id}
     → upsert-debt.js --resolve + boy_scout_fixed=1 + stale_reason tag
6. Output: "🧹 Boy Scout Sweep: fixed N / skipped M debts"
7. Cap: max 10 candidates per sweep
```

### 7.2 CLI 使用

```bash
# Dry-run (default, BR-BS-06)
node .context-db/scripts/boy-scout-sweep.js --files "path1.ts,path2.cs"

# Execute mode (BR-BS-05)
node .context-db/scripts/boy-scout-sweep.js --files "..." --execute --story {story_id} --agent {agent_id}

# Custom report path
node .context-db/scripts/boy-scout-sweep.js --files "..." --output <path>
```

### 7.3 實作位置

`dev-story` workflow Step 9 §7.5 Boy Scout Sweep:
```
§7   Tasks DB Backfill
§7.5 Boy Scout Sweep (NEW — dla-05)
  1. Extract file_list → comma-separated
  2. boy-scout-sweep.js --files ... (dry-run scan)
  3. Agent inline fix candidates
  4. boy-scout-sweep.js --files ... --execute (resolve)
  5. Record results in tracking
§8   Skill Sync Gate
```

### 7.4 預期效果

每個 Story 平均順手修 2-5 筆 debt,從根源減少累積。S4 IDD 保護確保故意決策不被誤修。

---

## 8. Stale Detection 4 機制 (v3.0 新增)

> **核心原則**: PhyCool 的 debt 累積問題 (961 筆,95% 是噪音) 源於「只累積,不清理」。必須建立主動 stale detection 機制。

### 8.1 機制 1: File Existence Check (自動)

```
對每筆 open debt:
  for file in related_files:
    if not fs.exists(file):
      mark debt as stale (reason: 'file_not_exist')
```

**觸發**: Cron daily

### 8.2 機制 2: Pattern Grep Verification (自動)

```
對每筆 open debt:
  for file in related_files:
    grep debt.title 關鍵字 in file:
      if not found:
        mark debt as stale (reason: 'pattern_not_found')
```

**觸發**: Cron daily

### 8.3 機制 3: Commit Diff Verification (自動)

```
對每筆 open debt:
  commits = git log --format=%H -- {related_files}
  若 commit 之一觸及 related_files:
    檢查 diff 是否觸及 debt pattern:
      若觸及且 pattern 消失:
        mark debt as fixed (link commit_sha)
```

**觸發**: dev-story Step 9 (commit 後)

### 8.4 機制 4: Skill 規範已更新檢測 (v3.0 新增)

```
對每筆 open debt:
  if debt.related_skills 不為空:
    for skill in related_skills:
      check skill SKILL.md updated_at > debt.created_at:
        若 skill 相關章節已更新:
          mark debt as needs_review (reason: 'skill_updated_may_resolve')
```

**觸發**: Quarterly audit

**用途**: 當 skill 規範更新 (例如 phycool-zustand-patterns 新增 pattern),對應的 debt 可能已被 skill 指導下自動解決。

### 8.5 Stale 處理流程

```
Stale marked
  ↓
Status → 'pending_archive'
  ↓
30 天緩衝期 (防止誤判)
  ↓
Auto-archive (soft delete, status='archived')
  ↓
DevConsole /debts 不再顯示,但可從歷史查詢
```

---

## 9. 5-Layer Automation Triage (v3.0 新增)

> **核心原則**: 人工逐一處理不可行 (961 筆 × 3 min = 48 hours)。必須 **金字塔自動化**:上層高信心自動,下層低信心手動。

### 9.1 處理金字塔

```
┌───────────────────────────────────────────────┐
│ Layer 5: Manual Edge Review (Alan)            │ ~30 筆
├───────────────────────────────────────────────┤
│ Layer 4: Subagent Semantic Triage             │ ~140 筆
├───────────────────────────────────────────────┤
│ Layer 3: Heuristic Quick-Fix Filter           │ ~380 筆
├───────────────────────────────────────────────┤
│ Layer 2: Pattern Grep Verification            │ ~800 筆
├───────────────────────────────────────────────┤
│ Layer 1: File Existence + Dedup               │ ~961 筆
└───────────────────────────────────────────────┘
```

### 9.2 腳本清單

- **Layer 1**: `debt-layer1-hygiene.js` — Schema + Normalize + File Exist + Dedup + Archive + Phase 5a `compaction_preprune` 14-day cleanup (**dla-04 done**, Phase 5a added by **td-37**)
- **Layer 2**: `debt-layer2-stale.js` — Pattern Grep + Commit Diff + Skill-aware (**dla-04 done**, BR-TDI-06 parseAffectedFiles directory detection added by dla-08)
- **Unified Report**: `debt-stale-report.js` — 合併 Layer 1+2 輸出 AC-11 JSON (**dla-04 done**)
- **Layer 3**: `debt-layer3-quickfix.js` — Multi-Signal Quick-Fix Classifier (S1 single_file + S2 low_severity + S3 refactor_category + S4 not_intentional strict AND) (**dla-08 done v2.0**; **S4 exclusion ACTIVE** since dla-08b 2026-04-11: 183 annotations across 80 files → 4 debts excluded by S4 boundary protection, see `phycool-intentional-decisions` v1.2.1)
- **Layer 4**: `debt-layer4-subagent-triage.ps1` — Haiku Parallel Triage with Priority Score + schema-first JSON + few-shot (**dla-08 done v2.0**; PS 5.1-compat serial stdin-piped path for real mode)
- **Layer 5**: `debt-layer5-alan-review.js` — Alan Edge Review markdown (zh-TW, Priority Score sorted desc) + `--apply-file` batch soft-delete mode (**dla-08 done**)
- **Shared Schema Module**: `_migrations/tech-debt-schema.js` — canonical categories/severities + legacy mapping + Taiwan timestamp helpers, imported by Layer 1/2/3/5 + rollback + memory-to-idd (**dla-08 done BR-TDI-05**)
- **Rollback**: `debt-layer-rollback.js` — `createBackup()` + `rollbackFromBackup()` (**dla-08 done**)
- **Generic Migration Applier**: `apply-migration.js` — transactional SQL apply with auto-backup (**dla-08 done**)

**Total (Layer 1-5)**: implemented, real-run 49 min (dla-08 Phase 1-4 execution)

### 9.3 實作位置

- **Layer 1-2 + Unified Report**: 已於 **dla-04-stale-detection-db-hygiene** (2026-04-11) 建立
- **Layer 3-5 + 基礎建設**: 已於 **dla-08-current-debt-migration** (2026-04-11) 建立,整合 Layer 1-2 結果執行 961 → 42 open 的全量清理
- **首次 real Haiku triage 執行**: dla-08 Phase 4, 41 semantic debts classified, Priority Score 範圍 0.1-20 (top=20 Admin JsonIgnore security)

---


---
