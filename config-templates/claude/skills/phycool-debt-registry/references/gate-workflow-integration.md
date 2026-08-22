# phycool-debt-registry — §13-§17 Production Gate + Workflow + Known Issues + Cross-Ref + Sync Gate

> **抽出自** `.claude/skills/phycool-debt-registry/SKILL.md` 2026-05-16 P2 modularization (saas-to-skill Mode B 8-aspect validation pass). 主 SKILL.md ≤300 行,本檔承載 §13-§17 Production Gate + Workflow + Known Issues + Cross-Ref + Sync Gate。

---

## 13. Production Gate (v3.0 分級制)

### 13.1 舊 Gate (v2.1.1)

```yaml
tech-debt-limit: 15          # open debts ≤ 15
zero-critical-debt: true     # CRITICAL = 0
```

**問題**: 所有嚴重度一視同仁,LOW debt 佔用 gate 配額。

### 13.2 新 Gate (v3.0)

```yaml
# 按嚴重度分級
p0-critical-debt: 0     # CRITICAL 必須 0 (block done)
p1-high-debt: 5         # HIGH ≤ 5 (block done)
p2-medium-debt: 20      # MEDIUM ≤ 20 (warn only)
p3-low-debt: unlimited  # LOW 不計入 gate
p4-accepted-debt: unlimited  # ACCEPTED 不計入 gate

# Category 特殊規則
test-debt: 0            # TD 類必須 0 (Murat 堅持)

# 年齡 gate
accepted-age-limit: 365   # ACCEPTED 超過 365 天強制 re-triage
deferred-age-limit: 90    # DEFERRED 超過 90 天強制升級或改 ACCEPTED

# 關聯驗證
orphaned-deferred: 0      # DEFERRED 必須有 target_story
missing-review-date: 0    # ACCEPTED 必須有 review_date
# 新增 (dla-08 CR F-13, 2026-04-11):
orphaned-target-story: 0  # target_story 必須存在於 stories 表 (FK 驗證)
```

### 13.3 Gate Integration

**code-review workflow**:
- Step 5 (Production Gate Check) 檢查所有 gate
- 若任一失敗 → block Story done 狀態

**dev-story workflow**:
- Step 8.6 (Boy Scout sweep 完) 檢查 p0/p1 gate
- 若 p0 > 0 → warn
- 若 p1 > 5 → warn

### 13.4 Orphan Target Story Protection (F-13, dla-08 CR → dla-11 FIXED)

> **dla-11-tech-debt-orphan-audit** 已實作以下保護措施 (2026-04-13):
>
> 1. ✅ `upsert-debt.js --validate-target` flag: 寫入前 `SELECT story_id FROM stories WHERE story_id = ?`, 不存在則 exit 1 + 不寫入 DB
> 2. ✅ 一次性 orphan audit 完成: 24 筆 orphan → 16 wont-fix + 8 unassigned (target_story=NULL)
> 3. ⬜ code-review Phase 2.5 FK gate: 待未來 Epic 整合 `--validate-target` 到 CR workflow
>
> **使用方式**:
> ```bash
> # 帶 FK guard (建議用於 code-review DEFERRED 項目寫入)
> node .context-db/scripts/upsert-debt.js --validate-target --inline '{"target_story":"existing-story-id", ...}'
>
> # 不帶 flag (向後相容, target_story 不存在仍可寫入)
> node .context-db/scripts/upsert-debt.js --inline '{"target_story":"any-string", ...}'
> ```

---

## 14. Workflow Integration Points

### 14.1 create-story

**Step 3 (context analysis)**:
```
1. search_debt({related_files IN story.file_list, status='open'})
2. 若有 open debts → 加入 Story Dev Notes
3. 若 debt 適用當前 Story → 加入 tasks 順便處理
4. 若 debt 需另一 Story → 標 dependency
```

### 14.2 dev-story

**Step 3 (start implementation)**:
```
1. search_debt({related_files, status='open'})
2. 顯示 open debts 清單
3. 提示「可修 inline?」
```

**Step 8 (Boy Scout Sweep)**:
```
1. 查當前 file_list 的 open debts
2. 5-Minute Rule filter
3. Inline fix 候選
4. upsert-debt --resolve
```

**Step 9 (commit verification)**:
```
1. 對 commit diff 執行 Stale Detection 機制 3
2. 若 pattern 消失 → auto-resolve
```

### 14.3 code-review

**Step 3 (deep review)**:
```
1. 發現 new debts → 計算 Priority Score
2. 對每個 non-FIXED 答 Q1-Q5
3. 5-Minute Rule 通過則 FIX (不可 WON'T FIX)
```

**Step 4 (classification)**:
```
For each non-FIXED debt:
  - Score > 50  → FIX NOW (not deferred)
  - 25-50 → DEFERRED (must have target_story)
  - 10-25 → ACCEPTED (review_date = +90d)
  - < 10  → ACCEPTED (review_date = +365d)
```

**Step 5 (Production Gate)**:
```
Check all gates in §13
Block done if any fails
```

### 14.4 tasks-backfill-verify

**v3.0 新增檢查**:
- 若 file_list 有 open debts 且未 sweep → warn
- 若 commit diff 有 [Intentional:] 引用 → verify IDD 存在 (via verify_intentional_annotations)

**v3.0.1 CR 角色獨立性(2026-04-14 強化 — eft-editor-batch-image-panel-free-open 事故)**:

Skill 必須在 dev-story 和 code-review 兩階段**各自獨立調用**。違反 = CR 審查失效。

| 階段 | 角色 | 動作本質 |
|------|------|---------|
| dev-story Step 9 | Implementer 自證回填 | 根據自身 implementation 寫 ✅/⬜ |
| **code-review Step 5b** | **Adversarial Reviewer 對抗審查** | 獨立 Read code 重驗 file:line,翻轉偽 ✅ |

**FORBIDDEN**:
- ❌ dev 已跑 Skill → CR 跳過(dev 自證 ≠ CR 對抗,兩者不可互換)
- ❌ tasks 內容相同 → 不需重跑(「相同」是 CR 獨立判斷產出)
- ❌ 沿用 dev file:line 不 Read code(行號可能漂移)
- ❌ 把 tasks 合併到 Step 4 auto-fix 的 `upsert-story.js --merge` patch

**落地層**:
- `_bmad/bmm/workflows/4-implementation/code-review/steps/step-05b-tasks-backfill.md` Block 2 (HARD REQUIREMENT)
- `step-06-report-archive.md` §6.5 Upstream Doc Review History 回寫 + §6.7 Target Story Cross-Sync + §7.5 Gate 6 (Skill marker + test_count 非 NULL)+ Gate 7 (Doc + Cross-Sync)
- `.claude/rules/tasks-backfill.md` §CR Phase Independence

**Incident**: 2026-04-14 `eft-editor-batch-image-panel-free-open` CR 合併 tasks 寫入到 Step 4 auto-fix 跳過 Skill → memory DB id=3287 (decision) + id=876 (tech failure)

---

## 15. Known Issues (KB pointers)

| KB ID | 標題 | 路徑 |
|-------|------|------|
| KB-workflow-003 | Code Review WON'T FIX 誤判 | `docs/knowledge-base/troubleshooting/workflow/code-review-wont-fix-misuse.md` |
| KB-workflow-005 | Tech debt registry ID 命名衝突 | `docs/knowledge-base/troubleshooting/workflow/debt-id-collision.md` |
| KB-framework-001 | v2.1.1 → v3.0 Migration (new) | `docs/knowledge-base/framework/debt-registry-v3-migration.md` |
| KB-framework-002 | Stale Debt Detection false positive | `docs/knowledge-base/framework/stale-debt-false-positive.md` |

---

## 16. Cross-Reference with phycool-intentional-decisions (v3.0 新增)

### 16.1 互斥原則

**關鍵判斷**:

```
遇到「不修」情境
  ↓
由 Business/Strategy/Legal/User 決策驅動?
  ├ 是 → phycool-intentional-decisions (IDD skill)
  └ 否 → phycool-debt-registry (本 skill)
```

### 16.2 歸屬判斷錯誤的處理

若發現 debt 被錯誤分類:

**tech_debt_items 中的 IDD 候選** → 移至 `intentional_decisions`:
1. 建立 ADR-IDD-XXX
2. add_intentional_decision
3. Code 加 [Intentional: IDD-XXX] 標註
4. 從 tech_debt_items 移除 (status='migrated-to-idd')

**intentional_decisions 中的 pure debt** → 移至 `tech_debt_items`:
1. 重新分類 category/severity
2. upsert-debt.js --inline
3. Retire 原 IDD record (status='retired')
4. 更新 code 標註 ([Intentional:] → 移除)

### 16.3 Watches 機制

本 skill frontmatter 會 watch:
- `.claude/skills/phycool-intentional-decisions/SKILL.md`

反之亦然。確保兩個 skill 任一更新時,對方會收到 stale 提示。

---

## 17. Skill Sync Gate Integration (v3.0 新增)

### 17.1 觸發條件

若 Story 變更:
- `tech_debt_items` schema (例如 ALTER TABLE)
- `upsert-debt.js` CLI 介面
- `search_debt` MCP tool 介面
- 本 skill 任何章節

→ 必須同步檢查:
- `phycool-intentional-decisions` SKILL.md 的 §15 (Relationships)
- `.claude/rules/skill-idd-sync-gate.md`
- `phycool-system-platform` DevOps 模組
- `phycool-context-memory` SKILL.md

### 17.2 同步檢查工具

```bash
node .context-db/scripts/skill-idd-sync-check.js --skill phycool-debt-registry
```

---


---
