# phycool-debt-registry — §5 Priority Score 公式

> **抽出自** `.claude/skills/phycool-debt-registry/SKILL.md` 2026-05-16 P2 modularization (saas-to-skill Mode B 8-aspect validation pass). 主 SKILL.md ≤300 行,本檔承載 §5 Priority Score 公式。

---

## 5. Priority Score 公式 (v3.0 新增)

```
Priority Score = (Severity × BlastRadius × BusinessImpact) ÷ FixCost

Severity:
  P0 = 10, P1 = 7, P2 = 4, P3 = 2, P4 = 1

BlastRadius:
  全站 = 10
  模組 = 5
  單檔 = 2
  單行 = 1

BusinessImpact:
  Revenue = 10
  Core feature = 7
  Admin = 3
  Dev experience = 1

FixCost:
  XS (<1h) = 1
  S (1-3h) = 2
  M (1d) = 5
  L (2-3d) = 10
  XL (>3d) = 20

決策閾值:
  > 50   → Fix Now (本週)
  25-50  → Fix Next Sprint (2-4 週)
  10-25  → Track & Watch (Accepted +90d)
  < 10   → Accept (Accepted +365d)
```

### 5.1 實例計算

| Debt ID | Severity | BR | BI | FC | Score | 決策 |
|---------|:-------:|:--:|:--:|:--:|:-----:|:----:|
| TD-eft-405-01 | 10 | 10 | 10 | 2 | **500** | Fix Now |
| TD-EFT-COEP-M1 | 7 | 5 | 7 | 5 | **49** | Fix Next Sprint |
| TD-EFT-PPR-03 | 4 | 2 | 3 | 2 | **12** | Track & Watch |
| TD-EFT-PPR-05 | 2 | 1 | 1 | 2 | **1** | Accept (+365d) |

### 5.2 公式使用場景

- **code-review Step 4**: 對每個 non-FIXED debt 計算 Score,決定分類
- **Quarterly Audit**: 對 Accepted debt 重新計算,決定是否升級
- **Sprint Planning**: 排序 DEFERRED debt 決定執行順序

### 5.3 Pre-Production Debt-Reduction Principle (v3.2.0 新增 — eft-dashboard-monetization-funnel R3)

> **核心原則**: Localhost dev 階段是**技術債黃金修復期**,不應使用 Priority Score 的 `BusinessImpact=DevExp=1` 係數壓低 score 作為 ACCEPT/DEFER 的理由。

#### Framework-Level Bias 揭露

Priority Score 公式 `(Severity × BlastRadius × BusinessImpact) ÷ FixCost` 的 BusinessImpact enum(Revenue=10 / Core=7 / Admin=3 / DevExp=1)**本身就是 post-deployment context 的權重**。套用到 pre-production 階段等於**用錯評估尺**:

- **Pre-Azure**: FixCost 實質最低(CI pipeline 塑形中、無客戶協調、無 data migration)、defer-to-prod 代價最高(slot swap + SLA + hotfix window)
- **錯誤行為**: 把 BusinessImpact=1 代入公式 → 得極低 score → ACCEPT/DEFER
- **正確行為**: 在 localhost 階段,`FixCost ≤ S=2` 的 debt 預設 FIX,不論 Score 高低

#### 強制欄位(v3.2.0 tech_debt_items schema 建議擴充)

| 欄位 | 適用 | 說明 |
|------|------|------|
| `pre_production_rationale` | Pre-Azure 階段 ACCEPT/DEFER 必填 | 單行說明「為何在 dev 階段仍選擇不修」。禁止通用文字如「跨 Story 範疇」— 必須具體描述技術阻擋 |
| `fix_cost_spike_evidence` | FixCost ≥ M=5 時必填 | Spike 實測證據(test 檔路徑或 commit hash)。禁純估算 |
| `review_trigger` | ACCEPT 事件驅動重評 | ENUM: `azure-deployment-kickoff-minus-90d` / `epic-completion` / `nuget-ecosystem-matured` / `api-version-upgrade` |

#### Phase A Triage 強制檢核(2026-04-20 新增)

CR Agent 在 Phase A triage 時,若打算 ACCEPT/DEFER 必須先回答 4 題:

1. **Glob 過周邊基礎設施嗎?** — Test debt: `**/*Factory*.cs` + `**/*Fixture*.cs` + csproj PackageReference;Route debt: `**/*Route*.cs` + `public partial class Program`
2. **FixCost 有 spike 實測證據嗎?** — 若 ≥ M=5 且無 spike,必試修後再分類
3. **ACCEPT 理由是否包含「Pre-production 黃金修復期除外條款」?** — 即「已驗證無法在 dev 階段消化的具體技術阻擋」
4. **信任的『歷史技術阻擋』是否超過 6 個月?** — 若是,技術生態可能已改變,必重驗

任一題答不出 → **禁止 ACCEPT/DEFER**,必須實修或 spike 驗證。

#### 歷史事故(建立此 principle 的根因)

| 日期 | Story | R1 誤判 | R2/R3 實測 | 高估倍數 |
|------|-------|---------|-----------|:------:|
| 2026-04-20 | eft-dashboard-monetization-funnel F4 | DEFERRED (MEDIUM)「跨 controller 重構」 | FIXED: helper method 抽取 -17 lines | — |
| 2026-04-20 | eft-dashboard-monetization-funnel F5 | ACCEPTED (LOW)「需改 4 files 非 5-Min」 | FIXED: +1 ViewModel field + 1 test <10 lines | — |
| 2026-04-20 | eft-dashboard-monetization-funnel F7 | ACCEPTED (LOW, +365d)「WebApplicationFactory XL=20」 | FIXED: S=2, 既有 CustomWebApplicationFactory 1+ 年前建好 | **10x** |

**Cost ratio ≥ 3x = framework-level bias signal** — 觸發本 principle review + 未來 CR 重新 triage。

詳見 memory `memory/reference_cr_phase_a_rescue_patterns.md`(建立中)。

---

### 5.4 R3-Rescue Sweep Protocol (v3.3.0 新增 — td-accepted-debt-r3-rescue-sweep)

> **核心機制**: Pre-Production Principle (§5.3) 的**程序化落地** — 透過 `.context-db/scripts/accepted-debt-rescue-audit.js` v2 掃描全池 open/accepted/deferred/pending_archive debt,套用 **12 delta Feasibility Scoring** 揭露 framework-level FixCost bias,同時偵測三類 **systemic anti-flags**(Zombie / Orphan / Phantom)補足結構性 workflow 缺陷。

#### 5.4.1 v2 Feasibility Scoring — 12 Delta Rules (Base 40)

**Base**: `40` (v1 `50` → v2 `40` rebalance,降 D3 主導性)
**Clamp**: `0-100` (IDD 例外保留 `-999` sentinel)

| # | Rule | 觸發條件 | Δ | 設計意圖 |
|:-:|------|---------|:--:|---------|
| D1 | Low severity | `severity='low'` | +10 | 低 sev 更易被高估 FixCost |
| D2 | CQD/TD category | `category IN ('cqd','td')` | +10 | 程式碼質量 debt 通常修復快 |
| **D3** | No fix_cost spike | `fix_cost IS NULL` | **+10** (v1: +15) | v1 99% 觸發過度主導 → 校準 -5 |
| D4 | Single file | `affected_files.length ≤ 1` | +10 | 單檔修復 FixCost 最低 |
| D5 | Empirical keyword | desc/guidance 含 `WebApplicationFactory` / `Testcontainers` / `既有` / `已就緒` | +10 | 基礎設施已就緒,spike 易成功 |
| D6 | Blocker keyword | 含 `schema migration` / `ARCHITECTURE_REDESIGN` / `INFRASTRUCTURE_CHANGE` | -20 | 真實阻擋,spike 不建議 |
| D7 | Has target_story | `target_story IS NOT NULL` | -5 | 已歸因,非本 sweep 重點 |
| D8 | Critical/high severity | `severity IN ('critical','high')` | -20 | 高 sev 獨立修復流程 |
| D9 | IDD/intentional | `category IN ('idd','intentional')` | **-999** | 絕對排除 (IDD 走 intentional_decisions 表) |
| **D10** | **Zombie** 🆕 v2 | `origin_story.status='done'` | **+10** | **殭屍 debt** — 源 Story 已關閉未 close loop |
| **D11** | **Orphan** 🆕 v2 | `target_story.status='done'` | **+20** | **孤兒 debt** — target 已失去承接能力 |
| **D12** | **Phantom** 🆕 v2 | `target_story IS NOT NULL AND stories.story_id 查無` | **+15** | **虛構 cleanup story** 名,承接失效 |

**Bucket 分級**:
- **High** (65-100): 優先 spike 試修 → FIXED 或 append `R3_RESCUE_META` blob
- **Medium** (40-64): `review_date +90d` ACCEPTED 觀察
- **Low** (0-39): `review_date +365d` long-term ACCEPTED
- **Excluded** (-999): IDD 不入掃描

#### 5.4.2 Systemic Flags — 三類結構性偏差偵測

Sweep 不僅揭露 FixCost bias,更揭露 R1→R2 workflow 的 close-loop 結構性缺陷:

| Flag | 定義 | 根因(workflow gap) | 修復方向 |
|------|------|--------------------|---------|
| **Zombie** | origin_story.status=done 但 debt 仍 open | dev/CR workflow 未在 Story done 時 audit zombie → **close loop 缺失** | Story done trigger zombie audit(Framework v1.4) |
| **Orphan** | target_story.status=done → debt 失去承接 | `cr-debt-doc-audit.md` A3「DEFERRED target_story 必驗 status 非 done」CR 階段執行不嚴 | 明文化 A3 + 自動 detect gate |
| **Phantom** | target_story 非 null 但 stories 表不存在 | `upsert-debt.js --validate-target` 為 opt-in flag 而非 mandatory | 強制 `--validate-target` + 寫入時 FK 驗證 |

**比例警戒閾值**:

| 指標 | GREEN | YELLOW | RED |
|------|:-----:|:------:|:---:|
| Zombie % of pool | < 40% | 40-80% | **≥ 80%** (close-loop 嚴重缺失) |
| Orphan count | 0 | 1-2 | **≥ 3** (違反 A3) |
| Phantom count | 0 | 1-5 | **> 5** (target 管理系統性問題) |

#### 5.4.3 CLI Usage

```bash
# 完整 audit 掃描全池 + systemic flags
node .context-db/scripts/accepted-debt-rescue-audit.js --feasibility all
#   Output: candidates.json (含 systemic_flags.{zombie_count, zombie_pct, orphan_count, phantom_count})
#           candidates.csv  (14 cols × N rows)

# 只看 High bucket (候選資格最強)
node .context-db/scripts/accepted-debt-rescue-audit.js --feasibility high

# 單 debt explain (診斷 D1-D12 觸發明細)
node .context-db/scripts/accepted-debt-rescue-audit.js --explain {debt_id}

# 批次 append R3_RESCUE_META blob 到 High+Medium description 末尾
# (補 pre_production_rationale + fix_cost_spike_evidence + review_trigger)
node .context-db/scripts/accepted-debt-rescue-audit.js \
  --mode backfill-rationale --by {agent-id} --in {sweep-story-id}

# 批次轉 FIXED (High bucket 全部, 慎用 — 建議先人工 review)
node .context-db/scripts/accepted-debt-rescue-audit.js \
  --resolve-top --by {agent-id} --in {sweep-story-id}
```

#### 5.4.4 觸發時機

| 時機 | Trigger | 動作 |
|------|--------|------|
| **Azure deployment kickoff − 90d** | 日曆事件 | 全域 sweep + 目標將 High bucket 歸零或接受 post-prod |
| **每 Epic 完成後** | Epic status → done | 該 Epic 關聯 debt 局部 sweep |
| **30d rolling violation RED** | `query-violations.js` status=RED | Sweep + cross-correlate violation 類型 |
| **Quarterly debt review** | 每季初 | 全域 sweep 作 baseline trend analysis |

#### 5.4.5 Case Study — eft-dashboard-monetization-funnel F7 (10× bias 事件)

**事故時序**:

| 階段 | 動作 | 結論 |
|------|------|------|
| R1 dev | 估算 TD-eft-mf-003 = XL=20 | 基於 1+ 年前 `FaqRouteIntegrationTests.cs:12` 註解「WebApplicationFactory 不可用」folklore |
| R2 CR | dev agent 標 DEFERRED Priority Score 低 | ACCEPTED +365d |
| **R3 spike** | CR ultrathink 挑戰,實際 Read + Glob 驗 | `Testcontainers.MsSql` nuget 存在 + `AssetServiceFix10Tests` working pattern → FixCost = **S=2** (2h),+9 HTTP route tests |

**Ratio**: `XL=20 → S=2` = **10× bias**

**根因 (三層 structural)**:
1. **Layer 1 FixCost**: 未做 spike,引用過時 folklore 註解作 evidence(違反 `constitutional-standard.md` Code Verification Mandate)
2. **Layer 2 close-loop**: R1 dev/CR cycle 未強制挑戰「這個估算是否超過 6 個月」(觸發 D10 Zombie 偵測)
3. **Layer 3 target management**: 若 TD-eft-mf-003 有 target_story 可能已 orphan(觸發 D11)

**防未來機制** (本 Skill 提供):
- §5.3.3 Phase A Triage 4 題強制檢核 (Glob 驗 / FixCost spike / ACCEPT 理由 / >6m folklore 重驗)
- §5.4 R3-Rescue Sweep Protocol v2 audit
- Framework v1.4 計劃: `upsert-story.js` Story done → auto zombie audit
- `.claude/rules/cr-debt-doc-audit.md` 規劃 Phase A5 zombie/orphan 強制檢測章節

#### 5.4.6 Coordination with Violation Tracker

與 `rule_violation` tracker (ctr-p2-violation-tracker + `td-rule-violation-auto-detect-hook` + `td-rule-violation-workflow-postcheck`) **雙向同步**:

| 方向 | 同步項目 | 單一真相來源 |
|------|---------|-------------|
| Violation → Debt | 30d RED rolling → trigger sweep | `query-violations.js` stats.status='RED' |
| Debt → Violation | Zombie/Orphan/Phantom detection → log as `rule_violation` category='cr-debt-doc-audit.md' violation | `accepted-debt-rescue-audit.js` systemic_flags |
| Shared keyword map | `td-rule-violation-workflow-postcheck` keyword scan reuse | `.context-db/scripts/_ref/violation-keyword-map.json` (已建立 2026-04-21, 37 keywords × 9 rules mirrors `detect-rule-violation-core.cjs` SSoT, 2 vitest cross-consistency tests PASS) |

#### 5.4.7 td-accepted-debt-r3-rescue-sweep 實戰揭露數據 (2026-04-20)

本 Story CR 完成後實測掃描結果 (v2 audit, 61 candidates):

| 指標 | 數值 | Status |
|------|:---:|:------:|
| 掃描池 (含 case-insensitive status variants) | 61 | v1 只 35 (+74%) |
| High bucket | 54 / 61 (88.5%) | ⚠ ≥ 15% bias threshold |
| **Zombie** (origin done) | **60 / 61 (98.4%)** | 🔴 **RED** 極嚴重 close-loop 缺失 |
| **Orphan** (target done) | 3 | 🟡 YELLOW (CR 後轉 ACCEPTED 歸 0) |
| **Phantom** (target 不存在) | 15 | 🔴 RED (4 筆指向 `eft-gallery-dead-code-cleanup` 虛構 story) |
| 100% R3_RESCUE_META blob 覆蓋 | 61 / 61 | ✅ AC-4 full coverage |

**核心洞察**: FixCost bias 只是冰山一角,真正根因是 **dev/CR workflow close-loop 結構性缺失**(98.4% zombie ratio)。

---


---
