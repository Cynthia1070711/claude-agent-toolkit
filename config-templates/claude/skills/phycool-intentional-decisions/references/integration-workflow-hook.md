# Phycool Intentional Decisions — Three-Layer Integration / Workflow / Hook

> **抽出自** `.claude/skills/phycool-intentional-decisions/SKILL.md` 2026-05-16 P2 modularization (Mode B 8-aspect validation pass). 主 SKILL.md ≤300 行,本檔承載 Skills + Docs + Platform 三層整合 + create-story/dev-story/CR/Stop hook 整合點 + UserPromptSubmit Layer 10 完整內容。

---

## 8. Three-Layer Integration (Skills + Docs + System Platform)

> 這是 v1.3 Framework 的關鍵升級。IDD 不只是 code 層的標註,還必須與 phycool-* skills、docs、phycool-system-platform 三層同步。

### 8.1 Why Three Layers?

```
Layer A: phycool-system-platform (導航層)
  └─ 19 modules × 36 files
  └─ 平台全域鳥瞰

Layer B: 40+ phycool-* skills (規範層)
  └─ 各模組詳細規範與 SOP

Layer C: docs/* 技術文檔 (證據層)
  └─ functional-specs, technical-specs, ADR, knowledge-base
```

IDD 必須穿透三層,因為:
- **新對話**可能從任一層進入(skill 關鍵字 / doc RAG / system-platform 導航)
- **新開發者**可能從任一層開始探索
- **三引擎**(Claude/Gemini/Antigravity)共享這三層

### 8.2 related_skills 使用規範

在建立 IDD 時,必須列出 **所有相關的 phycool-* skills**:

```json
{
  "idd_id": "IDD-COM-001",
  "related_skills": [
    "phycool-editor-arch",        // 主要: editor 架構
    "phycool-member-plans",       // 主要: plan gating 規則
    "phycool-editor-data-features", // 次要: data feature 模組
    "phycool-pdf-engine"          // 次要: PDF 層 gate
  ]
}
```

**規則**:
- 至少列 1 個 primary skill
- 跨模組決策必須列所有影響 skills
- 使用 `phycool-*` 完整名稱

### 8.3 related_docs 使用規範

```json
{
  "related_docs": [
    "docs/technical-decisions/ADR-IDD-COM-001.md",  // 必須: 對應 ADR
    "docs/project-planning-artifacts/functional-specs/member-plan-gating.md",
    "memory/project_free_plan_full_access.md"
  ]
}
```

**規則**:
- `adr_path` 欄位是主要 ADR(必填)
- `related_docs` 是 **額外** 相關文件(functional-specs / memory / knowledge-base)
- 使用相對路徑(從 project root)

### 8.4 platform_modules 使用規範

對照 `phycool-system-platform` 的 19 modules:

```
Editor, Admin, Member, Payment, Auth, PDF, SignalR, i18n, 
Branding, Legal, Announcement, Remittance, Invoice, License, 
DataSource, BusinessAPI, DevConsole, CI, Deployment
```

```json
{
  "platform_modules": ["Editor", "Member"]   // IDD-COM-001 影響 Editor + Member
}
```

**規則**:
- 列出所有 **直接受影響** 的模組
- 跨 3+ 模組的 IDD 必須更新 phycool-system-platform CrossCutting/ 文件

### 8.5 DevConsole 整合

IDD 管理可透過 DevConsole Web UI 操作：

| 頁面 | 路由 | 功能 |
|------|------|------|
| IDD 決策 | `/intentional` | 瀏覽/篩選 active IDDs（idd_type/criticality/status），展開檢視 forbidden_changes |
| 技術債 | `/tech-debt` | 瀏覽/篩選 tech_debt_items（與 IDD 互斥） |

**Backend API**: `GET /api/intentional` (list + filter) / `GET /api/intentional/:id` (detail)
**前端**: `tools/dev-console/src/pages/Intentional.tsx` + `services/intentionalApi.ts`
**導航**: `Layout.tsx` NAV_ITEMS 含 `/intentional`（icon: 🛡️, i18n: `t.nav.intentional`）

### 8.6 4 層標註部署統計 (2026-04-13 驗證)

| 層級 | 目標 | 實測數據 |
|------|------|---------|
| Code | `[Intentional: IDD-XXX]` 標註 | 424 occurrences / 119 files |
| ADR | `ADR-IDD-{TYPE}-{NNN}.md` 文件 | 10/10 files |
| DB | `intentional_decisions` 表 | 10 active (4 critical: COM-001, COM-002, REG-001, REG-002) |
| Memory | MEMORY.md manifest | 4 critical → 4 entries (COM-001, COM-002, REG-001, REG-002) |

**涵蓋模組**: Backend Services (60+ files), Frontend Editor (20+ files), DevOps/Hooks (39+ files)

### 8.7 phycool-system-platform 同步要求

IDD 建立後,必須同步更新 `phycool-system-platform` 對應 module 的 reference 文件:

```
.claude/skills/phycool-system-platform/references/
  Editor/
    overview.md         ← 加入 IDD-COM-001 連結
    business-rules.md   ← 加入 "Free plan editor 全開放" 條目
  Member/
    overview.md         ← 加入 IDD-COM-001 連結
```

**檢查清單**(建立 IDD 時):
- [ ] `related_skills` 所有 skill 的 SKILL.md 已加 `[Intentional: IDD-XXX]` 標註
- [ ] `platform_modules` 所有 module 的 references/**.md 已加 IDD 章節
- [ ] `adr_path` ADR 文件已建立
- [ ] `related_docs` 其他文件(若已存在)有 cross-reference

### 8.6 Skill-IDD Sync Gate

參見 `.claude/rules/skill-idd-sync-gate.md` — 強制檢查規則:

- 觸發時機: IDD 建立 / 更新 / code 變更 / skill 變更
- 檢查命令: `node .context-db/scripts/skill-idd-sync-check.js --changed-files <list>`
- Gate 失敗 → block commit

---

## 9. Workflow Integration Points

### 9.1 create-story (Step 3 插入)

```
建立新 Story 時:
  1. 讀取 story file_list (預計修改檔案)
  2. 呼叫 search_intentional_decisions({file_path IN file_list})
  3. 若有 active IDD:
     → 在 Dev Notes 加入警告:
       "⚠️ 此 Story 將修改 {file},該檔案有 active IDD-XXX"
       "Forbidden: {forbidden_changes}"
       "請確認本 Story 不違反該決策"
  4. 在 Required Skills 加入 phycool-intentional-decisions
```

### 9.2 dev-story Step 5 §0.6 (IDD Pre-Edit Awareness Gate via search_intentional_decisions)

> **Implementation: G5 Story `td-bmad-search-idd-pre-edit-dev-story`** (2026-05-03,epic-devcons P3/S)。對齊 `.claude/rules/capability-integration-mandate.md` v1.0.0 §3 Mandatory 5 步 Step 2 BMAD 整合。Pattern reuse 自 create-story step-06 §8.5 IDD Warning。Template 結構: dev-story step-05 §0.5 God Node Pre-Check(Title provenance + MCP block + Output 用途 + Fallback)。

**位置**: `_bmad/bmm/workflows/4-implementation/dev-story/steps/step-05-implement-task.md` §0.6(在 §0.5 之後 + §1 Review Current Task 之前)

**MCP tool**: `mcp__phycool-context__search_intentional_decisions({file_path, status:'active'})`(file_path LIKE 反查 related_files,正確 MCP tool。**注意**: `verify_intentional_annotations` 是 IDD 健康度 audit 工具,**不是** edit-time IDD constraint check 工具)

**流程**(對齊 step-06 §8.5 既有範式):

```
For each file in Story file_list:
  mcp__phycool-context__search_intentional_decisions({
    file_path: "{file}",
    status: "active",
    limit: 5
  })

合併命中 → 以 idd_id dedupe → 取 union of forbidden_changes
```

**Output format**(若命中 ≥ 1 IDD):

```
🛡️ IDD Pre-Edit Check: 對 {N} files 完成 query,命中 {M} active IDDs
  ⚠️ {idd_id} ({title}) — criticality: {criticality}
    - Forbidden: {forbidden_change_1}
    - Forbidden: {forbidden_change_2}
  Decision: {decision 摘要}
```

**Critical IDD 命中額外 advisory HALT**(non-blocking):

```
🚨 CRITICAL IDD HIT — proceed only if proposed edits do NOT violate any forbidden_changes
   Confirm understanding before continuing.
```

寫入 dev-story tracking file `[IDD Awareness Confirmed @ {ts}] {idd_ids comma-separated}` marker。

**Fallback**:
- 0 hit(file_list 不涉 active IDD related_files)→ silent skip(對齊 step-06 §8.5,不留空標題)
- `search_intentional_decisions` 連線失敗 → log warning + continue(non-fatal,advisory 設計確保 dev-story 不卡死)

**Token budget 對抗**:
- file_list 5-15 files × ~500-1500 tokens / query
- idd_id dedupe 後通常 0-3 unique critical IDDs
- Total 增量 ~3K-15K tokens(與 §0.5 god_node 5-call ~5K 同量級)

**互補關係**:
- §0.6 = **pre-edit 前置阻擋**(主動 query + advisory HALT)
- code-review `.claude/rules/skill-idd-sync-gate.md` = **retrospective 後置兜底**(CR phase audit)
- 雙保險,缺一不可

### 9.3 dev-story Step 8 (Boy Scout Sweep 排除 IDD)

```
Boy Scout Rule sweep 時:
  1. 查 story file_list 的 open debts
  2. 過濾掉 [Intentional:] 標註的程式碼區塊
  3. Quick-fix 其他 debts (5-Min Rule)
```

### 9.4 code-review Step 3.5 (IDD Detection Gate)

```
對每個 DEFERRED / ACCEPTED / WON'T FIX 項目:

  Q1: 這是因為 Business 決策而不修嗎? → IDD-COM
  Q2: 這是因為 Strategy 方向而不修嗎? → IDD-STR
  Q3: 這是因為法規/合規而不修嗎? → IDD-REG
  Q4: 這是因為 User feedback 而不修嗎? → IDD-USR

  若任一為 Yes:
    → 不可標 WON'T FIX 或 DEFERRED
    → MUST:
       1. 建立 ADR-IDD-{TYPE}-{NNN}
       2. Code 加 [Intentional: IDD-XXX] 標註
       3. 呼叫 add_intentional_decision
       4. 更新 related_skills 的 SKILL.md
       5. 更新 phycool-system-platform 對應 module
       6. 寫入 memory (若 criticality='critical')
       7. 更新 MEMORY.md (若 criticality='critical')
       8. 從 tech_debt_items 移除(若誤寫入)
```

### 9.5 Stop Hook (Annotation Verify)

```
提交前掃描 commit diff:
  對於每個 [Intentional: IDD-XXX] 引用:
    → 驗證 IDD-XXX 存在於 intentional_decisions 表
    → 若不存在 → BLOCK commit

  對於每個修改的 file:
    → 呼叫 verify_intentional_annotations({scope: 'file', file_path})
    → 若發現 mismatched_locations → BLOCK commit
    → 若發現 orphaned_idd → 警告(不 block)
```

---

## 10. UserPromptSubmit Hook Layer 10 (formerly Layer 7)

> **Note (2026-04-20)**: 歷史上稱 Layer 7,實際 pre-prompt-rag.js 的 IDD 注入為 Layer 10(td-rule-violation-rag-inject 之後 11 層總計:Session/Violations/Task/**IDD**/Pipeline/Skill/LSP/Code/Doc)。實作參考 `.claude/hooks/pre-prompt-rag.js:1098-1111` `injectIntentionalDecisionsV13`,受 `intent === 'code'` gated(`ctr-p2-hook-intent` 起 discussion 模式 skip)。

### 10.1 Injection Logic

修改 `.claude/hooks/pre-prompt-rag.js`,新增 **Layer 10: IDD + Skill Cross-Reference**(DLA-07 導入時稱 Layer 7):

```javascript
async function injectIntentionalDecisionsV13(prompt, fileHints, budget = 2000) {
  const keywords = extractKeywords(prompt, 5);
  const fileLike = fileHints[0] ? `%${fileHints[0]}%` : '%';

  const rows = db.prepare(`
    SELECT idd_id, idd_type, title, decision, forbidden_changes,
           criticality, adr_path, related_skills, platform_modules
    FROM intentional_decisions
    WHERE status = 'active'
      AND (
        idd_id IN (
          SELECT idd_id FROM intentional_decisions_fts
          WHERE intentional_decisions_fts MATCH ?
          ORDER BY rank LIMIT 5
        )
        OR related_files LIKE ?
        OR criticality = 'critical'
      )
    ORDER BY
      CASE criticality
        WHEN 'critical' THEN 1
        WHEN 'normal' THEN 2
        ELSE 3
      END,
      updated_at DESC
    LIMIT 5
  `).all(keywords.slice(0, 3).join(' OR '), fileLike);

  if (!rows.length) return '';

  let output = '## 🛡️ Intentional Decisions (故意設計,請勿違反)\n\n';
  let used = 0;
  for (const r of rows) {
    const forbidden = JSON.parse(r.forbidden_changes || '[]');
    const skills = JSON.parse(r.related_skills || '[]');
    const entry = `- **${r.idd_id}** (${r.idd_type})${r.criticality === 'critical' ? ' ⚠️ CRITICAL' : ''}: ${r.title}\n`
      + `  - Decision: ${r.decision}\n`
      + (forbidden.length ? `  - ❌ Forbidden: ${forbidden.join(' / ')}\n` : '')
      + (skills.length ? `  - Related Skills: ${skills.join(', ')}\n` : '')
      + `  - See: ${r.adr_path}\n`;
    if (used + entry.length > budget * 4) break;
    output += entry;
    used += entry.length;
  }
  return output;
}
```

### 10.2 Priority Ordering

```
Layer 1: Session history
Layer 2: Story progress
Layer 3: Tech debt
Layer 4: Decisions (general)
Layer 5: Code RAG
Layer 6: Document RAG
Layer 7: ⭐ Intentional Decisions (NEW)
```

### 10.3 Budget Control

| Criticality | Token budget per entry |
|:----------:|:----------------------:|
| `critical` | ~400 tokens |
| `normal` | ~300 tokens |
| `low` | 不注入(除非明確查詢) |

**Total Layer 7 budget**: ~2000 tokens (上限)

---

