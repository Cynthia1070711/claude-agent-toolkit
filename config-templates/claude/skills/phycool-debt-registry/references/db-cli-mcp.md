# phycool-debt-registry — §10-§12 DB Schema + CLI + MCP

> **抽出自** `.claude/skills/phycool-debt-registry/SKILL.md` 2026-05-16 P2 modularization (saas-to-skill Mode B 8-aspect validation pass). 主 SKILL.md ≤300 行,本檔承載 §10-§12 DB Schema + CLI + MCP。

---

## 10. DB Schema (v3.0 擴充)

### 10.1 tech_debt_items 新欄位

```sql
-- v3.0 新增欄位
ALTER TABLE tech_debt_items ADD COLUMN category TEXT;
  -- 'SD' | 'CQD' | 'TD' | 'DD' | 'DpD'

ALTER TABLE tech_debt_items ADD COLUMN severity TEXT;
  -- 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

ALTER TABLE tech_debt_items ADD COLUMN priority_score REAL;
  -- 計算結果 (optional, auto-computed)

ALTER TABLE tech_debt_items ADD COLUMN blast_radius TEXT;
  -- 'global' | 'module' | 'file' | 'line'

ALTER TABLE tech_debt_items ADD COLUMN business_impact TEXT;
  -- 'revenue' | 'core' | 'admin' | 'dev'

ALTER TABLE tech_debt_items ADD COLUMN fix_cost TEXT;
  -- 'XS' | 'S' | 'M' | 'L' | 'XL'

ALTER TABLE tech_debt_items ADD COLUMN related_skills TEXT;
  -- JSON array of skill names

ALTER TABLE tech_debt_items ADD COLUMN platform_modules TEXT;
  -- JSON array of module names (e.g., ["Editor","Member"])

ALTER TABLE tech_debt_items ADD COLUMN review_date TEXT;
  -- For ACCEPTED status

ALTER TABLE tech_debt_items ADD COLUMN accepted_reason TEXT;
  -- Why ACCEPTED (required if status='accepted')

ALTER TABLE tech_debt_items ADD COLUMN boy_scout_fixed INTEGER DEFAULT 0;
  -- 1 if fixed by Boy Scout sweep

ALTER TABLE tech_debt_items ADD COLUMN quick_fix_candidate INTEGER DEFAULT 0;
  -- 1 if passes 5-Minute Rule (heuristic)

ALTER TABLE tech_debt_items ADD COLUMN stale_reason TEXT;
  -- 'file_not_exist' | 'pattern_not_found' | 'skill_updated' | null
```

### 10.2 Status Enum 擴充

```sql
-- v3.0: 新增 'accepted' 和 'pending_archive' 狀態
CHECK(status IN ('open', 'fixed', 'wont-fix', 'accepted', 'pending_archive', 'archived'))
```

---

## 11. CLI Commands

### 11.1 Push (建立 debt)

```bash
node .context-db/scripts/upsert-debt.js --inline '{
  "debt_id": "TD-eft-001",
  "category": "CQD",
  "severity": "P2",
  "title": "ImagePanel React key warning",
  "description": "L36 render list 缺 key prop",
  "related_files": ["src/.../ImagePanel.tsx:36"],
  "related_skills": ["phycool-editor-arch"],
  "platform_modules": ["Editor"],
  "blast_radius": "file",
  "business_impact": "dev",
  "fix_cost": "XS",
  "status": "open"
}'
```

### 11.2 Query

```bash
# 查單筆
node .context-db/scripts/upsert-debt.js --query --id TD-eft-001

# 查 Story 相關
node .context-db/scripts/upsert-debt.js --query --target eft-image-panel-v2-ui

# 查 Skill 相關 (v3.0 新增)
node .context-db/scripts/upsert-debt.js --query --skill phycool-editor-arch

# 查 Module 相關 (v3.0 新增)
node .context-db/scripts/upsert-debt.js --query --module Editor

# 統計
node .context-db/scripts/upsert-debt.js --stats
```

### 11.3 Resolve

```bash
node .context-db/scripts/upsert-debt.js --resolve TD-eft-001 \
  --by 'CC-OPUS' \
  --in 'eft-image-panel-v2-ui' \
  --commit-sha abc1234
```

### 11.4 Triage (v3.0 新增)

```bash
# 計算 Priority Score
node .context-db/scripts/upsert-debt.js --compute-score TD-eft-001

# 批次 triage (對 open debts 重新分類)
node .context-db/scripts/upsert-debt.js --triage --status open

# Layer 1-2 automation (dla-04 done, 2026-04-11)
node .context-db/scripts/debt-layer1-hygiene.js         # Schema + Normalize + File Check + Dedup + Archive + Phase 5a compaction_preprune cleanup
node .context-db/scripts/debt-layer2-stale.js           # Pattern Grep + Commit Diff + Skill-aware
node .context-db/scripts/debt-stale-report.js           # Unified Layer 1+2 JSON report (AC-11 canonical)

# Layer 3-5 automation (dla-08 done, 2026-04-11)
node .context-db/scripts/debt-layer3-quickfix.js                                             # Multi-signal Quick-Fix (S1..S4 strict AND + [Intentional:] exclusion)
pwsh .context-db/scripts/debt-layer4-subagent-triage.ps1 -InputFile <L3-report>              # Real Haiku Priority Score + schema JSON
pwsh .context-db/scripts/debt-layer4-subagent-triage.ps1 -InputFile <L3-report> -MockMode    # Heuristic fallback
node .context-db/scripts/debt-layer5-alan-review.js --layer4-report <path> --layer3-report <path>    # zh-TW markdown for human review
node .context-db/scripts/debt-layer5-alan-review.js --apply-file decisions.json --execute    # batch soft-delete apply

# Supporting infra (dla-08 done)
node .context-db/scripts/debt-layer-rollback.js --backup / --list / --from <file>            # backup + rollback
node .context-db/scripts/apply-migration.js <migration.sql>                                   # transactional SQL apply with auto-backup
node .context-db/scripts/memory-to-idd-migration.js [--execute]                               # Inventory + ripgrep + ADR generation for IDD seeds
```

---

## 12. MCP Tools Usage

### 12.1 search_debt (已擴充)

```typescript
// v3.0 新增參數
search_debt({
  query: string,
  story_id?: string,
  target_story?: string,
  status?: string,
  severity?: string,
  category?: string,          // NEW: SD/CQD/TD/DD/DpD
  skill_name?: string,        // NEW: related_skills 反查
  platform_module?: string,   // NEW: platform_modules 反查
  min_priority_score?: number, // NEW
  include_stats?: boolean,
  limit?: number
})
```

### 12.2 Usage Examples

```typescript
// 查 Editor 模組的 HIGH 優先 debt
search_debt({
  platform_module: "Editor",
  severity: "P1",
  status: "open"
})

// 查某 skill 相關的 open debt
search_debt({
  skill_name: "phycool-editor-arch",
  status: "open",
  include_stats: true
})

// 查 Priority Score > 50 的 debt (需要立即修)
search_debt({
  min_priority_score: 50,
  status: "open"
})
```

---


---
