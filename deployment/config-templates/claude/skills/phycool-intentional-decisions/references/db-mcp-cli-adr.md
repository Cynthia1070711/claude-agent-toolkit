# Phycool Intentional Decisions — DB Schema / MCP Tools / CLI / ADR Template

> **抽出自** `.claude/skills/phycool-intentional-decisions/SKILL.md` 2026-05-16 P2 modularization (Mode B 8-aspect validation pass). 主 SKILL.md ≤300 行,本檔承載 intentional_decisions 表 schema + 4 MCP tools + CLI 指令 + ADR 範本 完整內容。

---

## 3. DB Schema Deep Dive

### 3.1 Key Fields 詳解

| 欄位 | 說明 | 範例 |
|------|------|------|
| `idd_id` | UNIQUE id,格式 `IDD-{TYPE}-{NNN}` | `IDD-COM-001` |
| `idd_type` | 4 sub-types 之一 | `COM` |
| `criticality` | 決定是否寫 MEMORY.md | `critical` / `normal` / `low` |
| `forbidden_changes` | JSON array,禁止動作清單 | `["請勿加 isFreeUser 阻擋"]` |
| `related_skills` | 關聯 phycool-* skill | `["phycool-editor-arch"]` |
| `platform_modules` | phycool-system-platform 模組 | `["Editor","Member"]` |
| `re_evaluation_trigger` | 觸發重新評估的事件 | `"Conversion < 1% 連續 2 月"` |
| `last_verified_at` | 最後一次 code 驗證時間 | `2026-04-09T19:38:58+08:00` |

### 3.2 Status Transition

```
active → retired (決策已無效,例如商業模式改變)
active → superseded (由新 IDD 取代,例如 IDD-COM-001 → IDD-COM-005)
```

**禁止直接 DELETE**: 所有 IDD 只能 retire 或 supersede,保留歷史追溯。

### 3.3 Sync to context_entries (為什麼?)

`intentional_decisions` 是主表,但 `UserPromptSubmit Hook` 的 `pre-prompt-rag.js` 已經查詢 `context_entries`。自 `ctr-p2-hook-intent` 起，IDD Layer 10 注入受 `detectCodeIntent()` intent gating 控制 — intent=discussion 時不注入 IDD（節省 ~1.5k tokens/prompt）。雙寫架構讓:

- **新對話自動感知 IDD**: Hook 已有 decision 層注入,自動涵蓋 intentional 類別
- **舊工具相容**: `search_context(category='intentional')` 立即可用,不需改 MCP tools
- **Single query multi-sources**: Hook 不需要同時查兩個表

---

## 4. MCP Tools (4 新 tools)

### 4.1 `search_intentional_decisions`

```typescript
// Input
{
  query: string,              // FTS5 (>= 3 chars, 空字串回最近)
  idd_type?: 'COM'|'STR'|'REG'|'USR',
  status?: 'active'|'retired'|'superseded',
  criticality?: 'critical'|'normal'|'low',
  file_path?: string,         // 反查: 該檔案有哪些 IDD
  skill_name?: string,        // 反查: 該 skill 相關的 IDD
  platform_module?: string,   // 反查: 該 module 相關的 IDD
  limit?: number              // default 10
}

// Output
{
  items: [{
    idd_id, idd_type, title, decision, reason,
    forbidden_changes, criticality, adr_path,
    related_skills, platform_modules, status
  }],
  total: number
}
```

### 4.2 `get_intentional_decision`

```typescript
// Input
{ idd_id: string }

// Output: 單筆完整內容含 code_locations JSON + context + alternatives
```

### 4.3 `add_intentional_decision`

```typescript
// Input
{
  idd_id, idd_type, title, context, decision, reason,
  code_locations,     // JSON array
  adr_path,
  signoff_by, signoff_date,
  re_evaluation_trigger?,
  forbidden_changes,  // JSON array
  criticality,
  related_skills,     // JSON array
  related_docs,       // JSON array
  platform_modules,   // JSON array
  tags
}

// Output: { success: boolean, idd_id: string }
```

### 4.4 `verify_intentional_annotations`

```typescript
// Input
{
  scope?: 'all' | 'changed' | 'file',
  file_path?: string          // required if scope='file'
}

// Output
{
  valid: [{idd_id, files: [{path, line}]}],
  missing_adr: [...],         // code 有 [Intentional: X] 但 DB 無 X
  orphaned_idd: [...],        // DB 有 X 但 code 找不到引用
  mismatched_locations: [...], // DB code_locations 已過時
  summary: { checked: N, valid: M, issues: K }
}
```

---

## 5. CLI Tools

### 5.1 `upsert-intentional.js` 指令

```bash
# 建立新 IDD
node .context-db/scripts/upsert-intentional.js --inline '{
  "idd_id": "IDD-COM-001",
  "idd_type": "COM",
  "title": "Free plan editor 全開放",
  "context": "...",
  "decision": "...",
  "reason": "...",
  "adr_path": "docs/technical-decisions/ADR-IDD-COM-001.md",
  "signoff_by": "Alan (PO)",
  "signoff_date": "2026-04-08T00:00:00+08:00",
  "criticality": "critical",
  "forbidden_changes": ["請勿加 isFreeUser 阻擋"],
  "related_skills": ["phycool-editor-arch","phycool-member-plans"],
  "platform_modules": ["Editor","Member"]
}'

# 查詢
node .context-db/scripts/upsert-intentional.js --query --file ImagePanel.tsx
node .context-db/scripts/upsert-intentional.js --query --skill phycool-editor-arch
node .context-db/scripts/upsert-intentional.js --query --module Editor

# 驗證 (掃描 code [Intentional:] 對照 DB)
node .context-db/scripts/upsert-intentional.js --verify
node .context-db/scripts/upsert-intentional.js --verify --scope changed

# Retire / Supersede
node .context-db/scripts/upsert-intentional.js --retire IDD-COM-001
node .context-db/scripts/upsert-intentional.js --supersede IDD-COM-001 --by IDD-COM-005
```

### 5.2 Error Handling

| 錯誤代碼 | 意義 | 處理 |
|:-------:|------|------|
| `IDD_001` | `idd_id` 重複 | 改用 `--update` 或換 id |
| `IDD_002` | 缺 `adr_path` | 必填,先建 ADR |
| `IDD_003` | `adr_path` 文件不存在 | 先建立 ADR file |
| `IDD_004` | `related_skills` 含無效 skill | 檢查 skills_list.md |
| `IDD_005` | `code_locations` 格式錯誤 | 必須 JSON array |

### 5.3 DLA-09 Scanner Tools (三層掃描器 — 建立於 2026-04-10)

> **前置條件**: `.context-db/phycool.db` 存在 (dla-07 初始化)

```bash
# ── Scanner Layer 1: 掃描 phycool-* Skills ───────────────────
node .context-db/scripts/scan-skill-idd-references.js
# 掃描 43+ SKILL.md, 輸出含 IDD 引用的 skills 清單
# Expected: ✅ Scanned N skills, found M IDD references

# ── Scanner Layer 2: 掃描 src/ code annotations ──────────────
node .context-db/scripts/scan-code-idd-references.js
# 掃描 src/ + .claude/rules/ + .claude/hooks/
# 偵測 [Intentional: IDD-XXX] 標註, 分類 valid vs orphaned
# Expected: ✅ Scanned N files, found M annotations, K orphaned

# ── Scanner Layer 3: 掃描 docs/ + system-platform ────────────
node .context-db/scripts/scan-doc-idd-references.js
# 掃描 docs/**/*.md + .claude/skills/phycool-system-platform/references/
# 包含 system-platform 模組 IDD 章節存在性報告
# Expected: ✅ Scanned N docs, found M IDD references

# ── Cross-Reference Builder (執行三個 scanner + 合併 + 更新 DB) ─
node .context-db/scripts/build-idd-cross-reference.js
# 產出: .context-db/idd-cross-reference.json
# 若 DB 有 active IDD → 自動 UPDATE related_skills/docs/platform_modules
# --dry-run: 不更新 DB, 只建 JSON

# ── Sync Check Tool (Skill-IDD Gate 守衛) ────────────────────
# 模式 1: 檢查特定已變更檔案是否違反 IDD forbidden_changes
node .context-db/scripts/skill-idd-sync-check.js \
  --changed-files "src/A.cs,.claude/skills/phycool-editor-arch/SKILL.md"

# 模式 2: 全量 audit 所有 active IDDs 完整性
node .context-db/scripts/skill-idd-sync-check.js --full-audit

# 模式 3: 檢查特定 skill 對應的所有 IDD
node .context-db/scripts/skill-idd-sync-check.js --skill phycool-editor-arch

# Exit codes: 0=PASS, 1=BLOCKED (violations), 2=ERROR
```

**MCP verify_intentional_annotations (DLA-09 增強)**:
```
# orphaned_idd 陣列現已實作 (server.js:2919)
# 讀取 idd-cross-reference.json → 比對 DB active records
# → 若 code 有 [Intentional: IDD-XXX] 但 DB 無此 IDD → orphaned_idd 陣列加入
# 若 idd-cross-reference.json 不存在 → summary.cross_ref_warning 提示先跑 build-idd-cross-reference.js
verify_intentional_annotations({scope: "all"})
```

**典型工作流**:
```bash
# 1. 每次 Epic 或重大變更後: 重建 cross-reference index
node .context-db/scripts/build-idd-cross-reference.js

# 2. dev-story commit 前: 執行 sync check
node .context-db/scripts/skill-idd-sync-check.js --changed-files "<changed_files>"

# 3. code-review 前: 全量 audit
node .context-db/scripts/skill-idd-sync-check.js --full-audit
verify_intentional_annotations({scope: "all"})
```

---

## 6. ADR Template

完整範本位於: `docs/technical-decisions/templates/ADR-IDD-template.md`

**必填區塊清單**(參見 §2.2 範例):
1. Classification (Type/Status/Created/Signoff)
2. Context
3. Decision
4. Why Not "Technical Fix"?
5. Code Impact (file:line × N)
6. Re-evaluation Trigger
7. Alternatives Considered
8. Forbidden Changes
9. Related Skills
10. Related Docs

**檔案命名規則**:
```
docs/technical-decisions/ADR-IDD-{TYPE}-{NNN}-{kebab-title}.md

TYPE: COM / STR / REG / USR
NNN: 3 位編號(001~999),同 type 內遞增
kebab-title: 短標題,kebab-case
```

**範例**:
- `ADR-IDD-COM-001-free-plan-editor-no-gating.md`
- `ADR-IDD-STR-002-admin-url-mgmt-convention.md`
- `ADR-IDD-REG-001-personal-data-retention-180d.md`
- `ADR-IDD-USR-001-test-account-fixed-seeder.md`

---

