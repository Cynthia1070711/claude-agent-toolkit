# phycool-debt-registry — §19 Migration v2.1.1 → v3.0

> **抽出自** `.claude/skills/phycool-debt-registry/SKILL.md` 2026-05-16 P2 modularization (saas-to-skill Mode B 8-aspect validation pass). 主 SKILL.md ≤300 行,本檔承載 §19 Migration v2.1.1 → v3.0。

---

## 19. Migration Plan: v2.1.1 → v3.0

### 19.1 Schema Migration

dla-07 Story 會執行:

```sql
-- Add new columns
ALTER TABLE tech_debt_items ADD COLUMN category TEXT;
ALTER TABLE tech_debt_items ADD COLUMN severity TEXT;
ALTER TABLE tech_debt_items ADD COLUMN priority_score REAL;
-- ... (see §10.1)

-- Extend status CHECK
-- (SQLite does not support ALTER TABLE CHECK, need recreate)

-- Add indexes
CREATE INDEX idx_debt_category ON tech_debt_items(category);
CREATE INDEX idx_debt_severity ON tech_debt_items(severity);
CREATE INDEX idx_debt_skill ON tech_debt_items(related_skills);
```

### 19.2 Data Migration

dla-08 Story 會執行:

1. **Layer 1-4 Automation** → 961 → ~50
2. **分類遷移**: 對 ~50 筆 open debts 補 `category` / `severity` / `platform_modules`
3. **WON'T FIX 重分類**: 307 → ACCEPTED / Quick Fix / Stale
4. **BPD 遷移**: 識別 IDD 候選 → 移至 `intentional_decisions`

---

## §Cross-Story Recurring Regression Detection（v3.5.0, 2026-05-12）

同一根因類別的 regression 在多個 Story 內反覆出現（≥ 3 次），需建立 chain debt record 連結歷史 tech entries。

**識別方式**:
```
search_debt({ query: 'worker regression' })
search_tech({ query: 'Worker CSP COEP' })
```

**Chain debt record 範例（tech id=759 4-chain）**:

| # | Story | 時間 | 根因 |
|:-:|-------|------|------|
| 1 | mqv-18 | 2026-03 | Worker 跨域 + Modal 遮蓋 |
| 2 | mqv-24/28 | 2026-03 | Worker onerror fallback |
| 3 | eft-datasource-worker-coep-fix | 2026-04-08 | COEP require-corp block（tech id=759）|
| 4 | eft-excel-upload-multi-layer-fix-stack | 2026-05-12 | Chrome 145+ blob worker cross-origin block |
| → | Debt: **TD-EFT-EXCEL-001** | P2/M | target_story: pcpt-excel-upload-worker-bundling-refactor |

**寫入 chain debt 規範**:
1. `debt_id` 含 story prefix（如 TD-EFT-EXCEL-001）
2. `description` 含完整 regression chain（Story list + 根因）
3. `target_story` 必指向正式修復 Story
4. `root_cause` 說明為何歷次 patch 仍無法根治

**已知 recurring regression chains**:
- **Worker CSP chain**（TD-EFT-EXCEL-001）：mqv-18→mqv-28→eft-coep-fix→eft-excel-stack；正式解 pcpt-excel-upload-worker-bundling-refactor

---

## Version History

| 版本 | 日期 | 變更 |
|------|------|------|
| **3.5.0** | **2026-05-12** | **§Cross-Story Recurring Regression Detection 新增**。觸發：eft-excel-upload-multi-layer-fix-stack（第 5 次同模式 Worker regression）。加入 chain debt record 識別方式 + tech id=759 4-chain 完整範例 + TD-EFT-EXCEL-001 初始範例。version bump 3.4.0→3.5.0。 |
| **3.4.0** | **2026-04-24** | **§18.2a Agent 常見合理化陷阱表(R1-R5 5 條 pattern + Red Flag + 正確動作 + 與既有 5.3/5.4/13.4/18.2 機制對照)**。來源: agent-skills-main `code-review-and-quality` + `incremental-implementation` Common Rationalizations pattern,融入 PhyCool 既有 5-Min Rule / Pre-Production Principle / R3-Rescue 體系。觸發: 2026-04-24 Party Mode 深度整合分析 F1(`claude token減量策略研究分析/專案優化項目計畫.md`)。性質: 決策前主觀偵測層,與 §5.4 事後量化 audit 互補,非重複。 |
| **3.3.2** | **2026-04-21** | **§18.2 +"INFO label trap" + "Phase A Q4 三內容欄位 gap" 兩條 FORBIDDEN**。觸發 Story: `td-testcontainers-template-library` CR R2 ultrathink 挑戰 — R1 把 5 項 documentation drift 標 "INFO 不計 Score" 偽裝 defer,使用者三題挑戰(`修復的技術債有回原 story 註記嗎?`)曝露 Phase A Q4 只驗 cr_* 統計欄位 PASS 但 tasks/dev_notes/file_list 三內容欄位均有 drift。R2 rescue 全補齊,並固化本 skill §18.2 + `.claude/rules/cr-debt-doc-audit.md` A5 雙層防護。See context_entries id=3822 / rule_violation id=3823 / CR Report Appendix B lesson。 |
| **3.3.1** | 2026-04-21 | §5.4.6 SSoT 「已建立」標示 (check-violation-repeat.js + violation-keyword-map.json) — epic-ctr Phase 4 L5 Exit-gate 閉環所需。 |
| **3.3.0** | 2026-04-20 | **R3-Rescue Sweep Protocol 固化** (§5.4). v2 audit 12 delta 公式 (+D10 Zombie / +D11 Orphan / +D12 Phantom, D3 校準 +15→+10, Base 50→40 rebalance). 三類 systemic flags (Zombie origin-done / Orphan target-done / Phantom target-missing) 偵測機制. CLI `accepted-debt-rescue-audit.js` v2 + `--mode backfill-rationale`. 觸發時機 4 類 (Azure kickoff-90d / Epic 完成 / violation RED / Quarterly). Case study: eft-dashboard-monetization-funnel F7 10× FixCost bias. 觸發 Story: `td-accepted-debt-r3-rescue-sweep` CR 實測揭露 zombie 98.4% (60/61) + orphan 3 + phantom 15. Triggers +5 keywords (R3-rescue/rescue sweep/zombie debt/orphan target/phantom target). Watches +accepted-debt-rescue-audit.js. |
| **3.2.0** | 2026-04-20 | **Pre-Production Debt-Reduction Principle** (§5.3). Framework-Level BusinessImpact 誤用校正 (pre-production 階段 `BusinessImpact=DevExp=1` 誤用作 ACCEPT/DEFER 理由). 強制欄位: `pre_production_rationale` / `fix_cost_spike_evidence` / `review_trigger`. Phase A Triage 4 題強制檢核 (Glob 驗 / FixCost spike / ACCEPT 理由 / >6m folklore 重驗). 觸發 Story: `eft-dashboard-monetization-funnel` R3 揭露 R1 era 10× FixCost 高估 bias. |
| **3.0.0** | 2026-04-09 | Framework v1.3 升級. 6 分類 / 5 嚴重度 / Priority Score / 5-Min Rule / Boy Scout / Stale Detection / 5-Layer Triage / ACCEPTED 分類. BPD 移至 `phycool-intentional-decisions`. Cross-ref with IDD skill. |
| 2.1.1 | 2026-03-25 | Triple-write + DB-first finalized |
| 2.0.0 | 2026-03-10 | DB-first replacing registry.yaml |
| 1.0.0 | 2026-02-15 | Initial |

---

## 除錯參考

> 相關除錯知識請查閱 `docs/knowledge-base/` 目錄。

**相關 KB**:
- `docs/knowledge-base/troubleshooting/workflow/code-review-wont-fix-misuse.md` (KB-workflow-003)
- `docs/knowledge-base/framework/debt-registry-v3-migration.md` (待建立,dla-07)

---
