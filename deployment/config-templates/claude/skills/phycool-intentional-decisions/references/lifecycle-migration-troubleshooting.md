# Phycool Intentional Decisions — Lifecycle / Migration / Production Gate / Troubleshooting

> **抽出自** `.claude/skills/phycool-intentional-decisions/SKILL.md` 2026-05-16 P2 modularization (Mode B 8-aspect validation pass). 主 SKILL.md ≤300 行,本檔承載 Re-evaluation Lifecycle + Migration Playbook + Production Gate + Known Issues & Troubleshooting 完整內容。

---

## 11. Re-evaluation Lifecycle

### 11.1 Event-Triggered Re-evaluation

```
re_evaluation_trigger 是文字描述,不是日期:
  ✅ "Free conversion rate < 1% 連續 2 個月"
  ✅ "當 iOS 17 發布時"
  ✅ "Legal audit 通知變更"
  ❌ "2026-10-01" (這是 scheduled,不是 triggered)
```

### 11.2 Scheduled Re-evaluation (Quarterly Audit)

每季執行一次 audit:

```bash
node .context-db/scripts/idd-quarterly-audit.js
```

**動作**:
- 列出所有 active IDD
- 檢查 code_locations 是否還存在(用 verify_intentional_annotations)
- 檢查 re_evaluation_trigger 是否發生
- 輸出 audit 報告給 Alan 決策

### 11.3 Supersession Workflow

當決策有新版本時:

```
IDD-COM-001 → IDD-COM-005 (新決策)

步驟:
  1. 建立 IDD-COM-005 (status='active')
  2. 更新 IDD-COM-001:
     - status = 'superseded'
     - superseded_by = 'IDD-COM-005'
  3. 更新所有 code 標註從 IDD-COM-001 → IDD-COM-005
  4. 建立 ADR-IDD-COM-005 (in Context 提及 supersedes ADR-IDD-COM-001)
  5. 更新相關 skills / system-platform
  6. 保留 ADR-IDD-COM-001 (不刪,加 "Superseded by IDD-COM-005" 標題)
```

### 11.4 Retirement Workflow

當決策不再有效(例如商業模式改變,該 gating 不再需要):

```
IDD-COM-001 retired

步驟:
  1. 更新 IDD-COM-001:
     - status = 'retired'
     - retired_at = NOW()
  2. Code 標註可保留作為歷史(加 "RETIRED" 前綴),或移除
  3. ADR 標題加 "[RETIRED]" 前綴
  4. 更新 related_skills / system-platform (移除或標記 retired)
```

---

## 12. Migration Playbook (從現有 MEMORY.md 盤點)

### 12.1 現有 IDD Candidate 清單 (10+ 筆)

掃描 `MEMORY.md` + `CLAUDE.md` 得出以下現有 Intentional Decisions,需要 migrate 為 IDD:

| 候選 IDD ID | Type | 描述 | 來源 | Migration 優先級 |
|------------|:----:|------|------|:---------------:|
| IDD-COM-001 | COM | Free plan editor 全開放 | MEMORY.md L39 "FREE plan full access" | P0 |
| IDD-COM-002 | COM | 無退款 + 7 天試用 + Admin only | MEMORY.md L42 "Refund policy" | P0 |
| IDD-COM-003 | COM | ImagePanel v2 對 Free 保持可開啟 | 本次 Session 討論 | P1 |
| **IDD-COM-004** | COM | PdfJob 業務重要記錄不自動強刪 (4 Retention BG Service 跳過) | `memory/intentional_idd_com_004.md` + ADR-BUSINESS-004 §4 Asset 表備註 *1 | P0 |
| IDD-STR-001 | STR | PCPT 批次列印 SaaS, 非圖片編輯器 | MEMORY.md L40 "PCPT product scope" | P0 |
| IDD-STR-002 | STR | Admin URL `/Admin/` → `/mgmt/` Convention | ADR-URL-001 (已有 ADR) | P2 (升 IDD 即可) |
| IDD-STR-003 | STR | DB-first Story (Epic MQV 繞過 checklist) | Memory id=149 | P1 |
| IDD-REG-001 | REG | 個資保存政策 / GDPR | 待確認 | P1 |
| IDD-REG-002 | REG | 統一發票電子化規範 | phycool-invoice-receipt | P1 |
| IDD-USR-001 | USR | 測試帳號 A1-A5 特殊 seeder | TestAccountSeeder.cs | P2 |
| IDD-USR-002 | USR | 編輯器預設右側 Panel 位置 | edf-14 | P2 |

### 12.2 Migration 步驟

對每筆候選 IDD:

```
Step 1: 建立 ADR
  → docs/technical-decisions/ADR-IDD-{TYPE}-{NNN}-{title}.md
  → 從 MEMORY.md 條目 + CLAUDE.md rules 提取 context/decision/reason

Step 2: 掃描現有 code 找對應位置
  → Grep 相關關鍵字 (e.g., "Free", "isFreeUser", "refund")
  → 列出所有 file:line

Step 3: 在 code 加 [Intentional: IDD-XXX] 標註
  → Block 註解格式 (critical)
  → 單行格式 (normal)

Step 4: upsert intentional_decisions
  → 使用 upsert-intentional.js --inline '{...}'

Step 5: 更新 related_skills 的 SKILL.md
  → 加 [Intentional: IDD-XXX] 標註到相關章節

Step 6: 更新 phycool-system-platform
  → references/{Module}/overview.md 加 IDD 章節

Step 7: 若 criticality='critical':
  → 寫入 memory/intentional_xxx.md
  → 更新 MEMORY.md (CRITICAL rule 格式)

Step 8: 更新 MEMORY.md 原條目(加 "→ See IDD-XXX")
```

### 12.3 Migration 執行順序

由 **P0 → P1 → P2**:

```
Day 1 (dla-07 完成後立即):
  IDD-COM-001 (Free plan)
  IDD-COM-002 (無退款)
  IDD-STR-001 (PCPT scope)

Day 2 (dla-07 後續):
  IDD-COM-003, IDD-STR-003
  IDD-REG-001, IDD-REG-002

Day 3 (dla-09 執行時一併處理):
  IDD-STR-002 (升格)
  IDD-USR-001, IDD-USR-002
```

### 12.4 Migration 驗證

完成後跑:

```bash
node .context-db/scripts/upsert-intentional.js --verify
# Expected:
#   valid: 10+
#   missing_adr: 0
#   orphaned_idd: 0
#   mismatched_locations: 0
```

---

## 13. Production Gate

### 13.1 IDD-related Production Gates

```yaml
# code-review 結束前檢查
idd-annotation-coverage:
  description: 所有 active IDD 的 code_locations 都能找到對應標註
  check: verify_intentional_annotations --scope all
  fail_if: mismatched_locations > 0

idd-orphaned-reference:
  description: 不能有 code [Intentional: IDD-XXX] 指向不存在的 IDD
  check: verify_intentional_annotations --scope changed
  fail_if: missing_adr > 0

idd-critical-has-memory:
  description: criticality='critical' 的 IDD 必須有 memory file + MEMORY.md 條目
  check: SELECT COUNT(*) FROM intentional_decisions WHERE criticality='critical' AND memory_file_path IS NULL
  fail_if: count > 0

idd-has-adr:
  description: 所有 active IDD 必須有 ADR file 存在
  check: 對每筆 active IDD 驗證 adr_path 檔案存在
  fail_if: missing_count > 0
```

### 13.2 Gate Integration with tasks-backfill-verify

```
tasks-backfill-verify (dla-07 後):
  1. 既有檢查 (tasks 都完成)
  2. NEW: IDD gates 通過檢查
  3. 若任一 IDD gate 失敗 → 整個 Story 回到 review 狀態
```

---


---

## 16. Known Issues & Troubleshooting

### 16.1 IDD Annotation 不同步問題

**症狀**: code 層 `[Intentional: IDD-XXX]` 存在,但 DB 查詢找不到 IDD-XXX

**原因**:
- IDD 建立時只寫了 code 標註,忘記 `upsert-intentional.js`
- IDD 被 supersede 但 code 未更新

**解法**:
```bash
node .context-db/scripts/upsert-intentional.js --verify
# → 會顯示 missing_adr 清單
# 對每筆 → 建立對應 IDD record 或更新 code
```

### 16.2 Skill Name Collision

**症狀**: `related_skills` 列了不存在的 skill,verify 失敗

**原因**: 手動輸入錯誤 / skill 改名未同步

**解法**:
- 使用 skills_list.md 作為 canonical source
- `upsert-intentional.js` 寫入時驗證 `related_skills` 每筆都在 skills_list.md 中

### 16.3 Hook Layer 10 預算溢出(歷史稱 Layer 7)

**症狀**: pre-prompt-rag.js 注入內容過多,吃掉 context budget

**原因**:
- 有大量 `criticality='critical'` IDD
- 或 prompt 同時 match 多筆 IDD

**解法**:
- 調整 budget 上限(預設 2000 tokens)
- 降低部分 IDD 的 criticality (critical → normal)
- 提供更精準的 prompt keywords

### 16.4 Memory File 路徑不同步

**症狀**: MEMORY.md 的 pointer 指向不存在的 memory file

**原因**: memory file 被刪 / 移動

**解法**:
```bash
node .context-db/scripts/verify-memory-paths.js
# → 掃描 MEMORY.md 所有 pointer,驗證 memory/*.md 存在
```

### 16.5 dev-story Step 5 §0.6 Pre-Edit Gate 行為(2026-05-03 v1.4.0 新增)

**0 hit silent skip**:
- 若 file_list 不涉 active IDD `related_files`,§0.6 silent skip 不輸出空標題(對齊 create-story step-06 §8.5 範式)
- 不會 hard-block dev-story 流程,Agent 直接進入 §1 Review Current Task

**search_intentional_decisions 連線失敗(MCP server unavailable)**:
- §0.6 log warning(stderr)+ continue(non-fatal)
- dev-story 仍可推進,但失去 IDD pre-edit awareness 雙保險(retrospective skill-idd-sync-gate.md 後置兜底仍生效)
- 修復路徑: 重啟 MCP server / 確認 `.context-db/phycool.db` 存在 / 跑 `verify_intentional_annotations({scope:'all'})` 驗 IDD 表健康

**Critical IDD HIT advisory non-blocking**:
- §0.6 對 critical IDD 命中觸發 advisory HALT prompt,但**不 hard-block**
- Agent 自我確認 proposed edits 不違反 `forbidden_changes` 後繼續實作
- 若實際違反 → code-review skill-idd-sync-gate.md retrospective audit 兜底攔截

---

