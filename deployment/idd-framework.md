# IDD Framework — 故意性決策債 4 層標註體系

> **版本**: 1.0.0
> **建立日期**: 2026-05-01
> **資料快照日**: 2026-05-01
> **核心 Skill**: `/pcpt-intentional-decisions`(v1.3.0)
> **核心 Rule**: `.claude/rules/skill-idd-sync-gate.md`(v1.0.0)

---

## 1. 為何需要 IDD

傳統「Tech Debt 登記」在以下情境失效:

| 情境 | 問題 |
|:----|:----|
| 商業政策決定不修(如 Free Plan 全開放)| 登錄 debt 累積 → 反覆討論「為何不修」浪費 token |
| 法規 / 合規限制(如 GDPR 180d 禁登)| 不是 debt,是法律必須 |
| 策略決定保留(如某 trial 設計)| 與架構選擇等同,非債 |
| User feedback 反向決定(用戶要求 keep)| 反映需求,不是技術問題 |

→ 用 **IDD(Intentional Decision Debt)** 4 sub-types 取代 tech debt 不當分類:

| Sub-Type | 含義 | 範例 |
|:----|:----|:----|
| **IDD-COM** | Commercial Compromise(商業考量)| Free Plan 編輯器全開放(IDD-COM-001)/ Trial 重置策略 |
| **IDD-STR** | Strategic(策略方向)| Subscription cancel 90d 冷靜期 / Token 不轉移制 |
| **IDD-REG** | Regulatory(法規 / 合規)| 帳號刪除 180d 禁登(GDPR Art.17 + 個資法 §11)/ 法律政策 modal data-bs-keyboard=false |
| **IDD-USR** | User Feedback(使用者反向)| 某 UI 元素「故意不調」因用戶 feedback |

**IDD 與 Tech Debt 互斥**:不能既登 IDD 又登 debt。

---

## 2. 4 層標註架構(Code / ADR / DB / Memory)

每筆 IDD 必同時存在於 4 層,任一遺漏即視為 broken:

### Layer 1 — Code 標註(`[Intentional: IDD-XXX]`)

```csharp
// src/Platform/App.Web/Services/SubscriptionService.cs:198
public async Task StartTrialAsync(string userId)
{
    // [Intentional: IDD-COM-001] Free plan editor 全開放,不加 isFreeUser gate
    // 商業決策:Trial 7 天無功能限制,提升轉換率
    await _trialService.GrantFullAccessAsync(userId);
}
```

```typescript
// src/.../components/Editor/ImagePanel.tsx:45
// [Intentional: IDD-COM-001] 不加 plan-gate,Free 用戶可使用全部 image 功能
export function ImagePanel() { ... }
```

### Layer 2 — ADR 紀錄(`docs/technical-decisions/ADR-IDD-{TYPE}-{NNN}.md`)

```markdown
# ADR-IDD-COM-001: Free Plan Editor 全開放策略

## Decision
Free 方案使用者進入編輯器後,**所有功能(ImagePanel / BatchImagePanel / SerialNumber / 
QR / Barcode / Excel Import)無 plan-gate 阻擋**。

## Forbidden Changes
- ❌ 在任何 editor component 加 `if (isFreeUser) return null;`
- ❌ 在 Service 層加 `RequirePlan(PlanType.Basic)` 阻擋 Free
- ❌ 在 Workflow 加「升級提示彈窗」干擾編輯流程

## Re-evaluation Trigger
若 trial 轉換率 < 5% 連續 3 個月 → 重新評估是否加 soft-gate
```

### Layer 3 — DB 紀錄(`intentional_decisions` 表)

```sql
INSERT INTO intentional_decisions (
  idd_id, idd_type, status, criticality,
  title, context, decision, reason,
  forbidden_changes,            -- JSON array
  related_files,                -- JSON array
  related_skills,               -- JSON array
  related_idd,                  -- JSON array (other IDD cross-ref)
  platform_modules,             -- JSON array (pcpt-system-platform 模組)
  adr_path,
  signoff_by, signoff_at,
  re_evaluation_trigger,
  created_at, updated_at
) VALUES (
  'IDD-COM-001', 'IDD-COM', 'active', 'critical',
  'Free Plan Editor 全開放策略',
  ...
);
```

### Layer 4 — Memory 標註(`memory/intentional_xxx.md` + MEMORY.md)

```markdown
# memory/intentional_idd_com_001.md

---
name: IDD-COM-001
description: Free Plan Editor 全開放(無 plan-gate)
type: intentional
---

商業決策:Free 7d trial 期間無功能限制,提升轉換率。
不加 isFreeUser gate 於任何 editor component。
ADR: docs/technical-decisions/ADR-IDD-COM-001.md
```

```markdown
# memory/MEMORY.md

- `IDD-COM-001` — Free editor 全開放,禁加 isFreeUser gate(實際路徑:`<workspace-root>/memory/intentional_idd_com_001.md`)
```

---

## 3. IDD Lifecycle State Machine

```
[draft]
  ↓ (Party Mode 討論定案 + signoff)
[active] ────────────────────┐
  │                           │
  │ (re-evaluation_trigger)   │ (forbidden_changes 違反 → BLOCK)
  ↓                           │
[review] ─→ [retired]    [violation_block]
              ↓
         [superseded] (新 IDD 取代)
```

| 狀態 | 含義 |
|:----|:----|
| `draft` | 提議中,未經 signoff |
| `active` | 生效中,Skill-IDD-Sync-Gate 持續保護 |
| `review` | 觸發 re_evaluation_trigger,等待重新討論 |
| `retired` | 不再生效(條件變化),保留歷史不刪 |
| `superseded` | 被新 IDD 取代,留 cross-ref |
| `violation_block` | dev-story commit 觸發 forbidden_changes 命中,自動 BLOCK |

---

## 4. Skill-IDD-Sync-Gate(雙層 Sync Gate)

`.claude/rules/skill-idd-sync-gate.md` 在 dev-story Step 8.2 執行(在 skill-sync-gate 之後):

### 4.1 Mandatory Flow

```
1. Scan file_list → 提取當次修改的 files
2. Query active IDDs (status='active'):
   node .context-db/scripts/skill-idd-sync-check.js --changed-files <list>
3. 對每筆受影響 IDD:
   ├─ 讀 forbidden_changes JSON array
   ├─ 對 commit diff 做 pattern match
   ├─ 違反 → BLOCK + 顯示違反清單
   └─ 未違反 → PASS
4. 若 IDD 的 related_skills 同時在 Changed Skills 中:
   → 警告:本次同時動到 IDD-XXX 和其 related skill
   → 建議:重新確認 IDD 是否仍有效
```

### 4.2 code-review Phase B IDD Detection Gate

對每個 DEFERRED / ACCEPTED / WONT_FIX,執行 Q1-Q4:

```
Q1: 因 Business 決策不修嗎? → IDD-COM
Q2: 因 Strategy 方向不修嗎? → IDD-STR
Q3: 因 法規/合規 不修嗎? → IDD-REG
Q4: 因 User feedback 不修嗎? → IDD-USR
```

任一為 Yes → **必轉 IDD,不可留 debt**:
1. 建立 ADR-IDD-{TYPE}-{NNN}
2. Code 加 `[Intentional: IDD-XXX]`
3. `add_intentional_decision`(含 related_skills / platform_modules)
4. criticality='critical' → 寫 `memory/intentional_xxx.md` + 更新 `MEMORY.md`
5. 更新 related_skills SKILL.md(加 `[Intentional:]` 章節)
6. 更新 pcpt-system-platform 對應 module 文件

Q1-Q4 全 No → 繼續 pcpt-debt-registry 既有流程。

---

## 5. 現存 IDD 範例(2026-05-01)

從 `memory/intentional_*.md` 與 `docs/technical-decisions/ADR-IDD-*.md` 可見:

| IDD ID | 類型 | 標題 | criticality | 狀態 |
|:----|:----|:----|:----:|:----:|
| **IDD-COM-001** | COM | Free Plan Editor 全開放 | critical | active |
| **IDD-COM-002** | COM | (商業考量範例 2)| high | active |
| **IDD-COM-003** | COM | (商業考量範例 3)| medium | active |
| **IDD-COM-004** | COM | PdfJob 不自動強刪(Project Retention)| critical | active |
| **IDD-REG-001** | REG | (法規範例 1)| critical | active |
| **IDD-REG-002** | REG | (法規範例 2)| critical | active |
| **IDD-REG-003** | REG | 法律政策 Modal 強制操作禁 ESC(GDPR Art.7 + 個資法 §7)| critical | active |
| **IDD-REG-004** | REG | 帳號刪除 180d Email Hash 禁登(防 Trial Abuse 反 Freemium 漏斗)| critical | active |
| **IDD-REG-005** | REG | Card4No+Card6No SHA-256 Fingerprint 180d ban(多維 Trial Abuse 防護)| critical | active |
| **IDD-STR-***| STR | (策略類)| varies | active |
| **IDD-USR-***| USR | (用戶反向類)| varies | active |

> 完整列表請執行 `mcp__pcpt-context__search_intentional_decisions`,或於 DevConsole `/intentional-decisions` 頁瀏覽。

---

## 6. forbidden_changes 範例

**IDD-COM-001 範例**:

```json
{
  "forbidden_changes": [
    {
      "pattern": "if\\s*\\(\\s*isFreeUser\\s*\\)",
      "files": ["src/**/components/Editor/**"],
      "violation_message": "禁在 editor component 加 isFreeUser gate(IDD-COM-001 Free 全開放)"
    },
    {
      "pattern": "RequirePlan\\(.*PlanType\\.Basic.*\\)",
      "files": ["src/**/Services/Editor*.cs"],
      "violation_message": "禁在 Service 層加 RequirePlan 阻擋 Free 編輯功能(IDD-COM-001)"
    }
  ]
}
```

**IDD-REG-003 範例**:

```json
{
  "forbidden_changes": [
    {
      "pattern": "<.+_(Policy|Disclosure)Modal[^>]*data-bs-backdrop=\"(?!static)",
      "files": ["src/**/Views/Shared/_*Policy*Modal.cshtml", "src/**/Views/Shared/_*Disclosure*Modal.cshtml"],
      "violation_message": "法律政策 modal 必設 data-bs-backdrop=\"static\" data-bs-keyboard=\"false\"(GDPR Art.7 明確同意要求)"
    }
  ]
}
```

---

## 7. IDD vs Tech Debt 決策樹

```
發現「不修」的決策時 →
  Q1: 是商業策略嗎?      → Yes → IDD-COM
  Q2: 是法規合規嗎?      → Yes → IDD-REG
  Q3: 是策略架構選擇嗎?  → Yes → IDD-STR
  Q4: 是用戶反向 feedback? → Yes → IDD-USR
  全 No → Tech Debt(進 pcpt-debt-registry 5-layer triage)
```

---

## 8. 自助驗證指令

```powershell
# 列出所有 active IDD
node .context-db/scripts/upsert-intentional.js --list --status active

# 驗證 4 層標註完整性(Layer 1 Code 標註)
Select-String -Path "src\**\*.cs","src\**\*.tsx" -Pattern "\[Intentional:\s*IDD-(COM|STR|REG|USR)-\d+\]" |
  Group-Object Filename | Format-Table

# 驗證 Layer 2 ADR 存在
Get-ChildItem docs\technical-decisions\ADR-IDD-*.md | Select-Object Name

# 驗證 Layer 4 Memory 存在
Get-ChildItem memory\intentional_*.md

# 跑全量同步檢查(scan-code/doc/skill 三組)
node .context-db/scripts/scan-code-idd-references.js
node .context-db/scripts/scan-doc-idd-references.js
node .context-db/scripts/scan-skill-idd-references.js
node .context-db/scripts/build-idd-cross-reference.js
```

---

## 9. Related Reading

- `rules-deep-dive.md` #11 — Skill-IDD-Sync-Gate Rule
- `skills-deep-dive.md` §7 — Sync Gates 三層
- `memory-system-deep-dive.md` — `intentional_decisions` 表 schema
- `bmad-workflows-evolution.md` — code-review Phase B IDD Detection Gate
- `.claude/skills/pcpt-intentional-decisions/SKILL.md` — 完整 SOP
- `docs/technical-decisions/` — ADR-IDD-* 完整紀錄

---

## 10. 版本歷史

| 版本 | 日期 | 變更 |
|:----|:----|:----|
| 1.0.0 | 2026-05-01 | 初版建立。4 層標註架構 + Skill-IDD-Sync-Gate + Lifecycle State Machine + 4 sub-types(COM/STR/REG/USR)+ forbidden_changes JSON pattern |
