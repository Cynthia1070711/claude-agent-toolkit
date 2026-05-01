# Auto Skill Detection (Non-Workflow Tasks)

Automatically scan every user prompt for keywords matching PCPT skills.

## Trigger
- Any prompt involving code changes, feature development, bug fixes, or technical questions

## Process
1. Parse user message for domain keywords
2. Match against `.claude/skills/skills_list.md` trigger keywords
3. If matched, silently load the matched Skill(s) via Read
4. **Domain 連帶載入**：查找匹配 Skill 所屬 Domain（參照 `.claude/skills/skills_list.md` `## Domain Profile` 區段）
   - Domain 成員 ≤3：連帶載入同 Domain 全部成員 Skill
   - Domain 成員 ≥4：僅載入 primary Skill + 依 prompt 語義最相關的 2 個
   - 每次觸發總載入上限：≤3 個 Skill（含初始匹配 Skill）
5. Do NOT announce skill loading — just use the loaded knowledge

## Examples
- "ECPay Webhook issue" → 匹配 `payment-subscription` → payment Domain (3 成員) → 連帶載入 `invoice-receipt` + `remittance-review`
- "Admin Dashboard KPI" → 匹配 `admin-dashboard` → admin Domain (4 成員) → 載入 primary `admin-module` + `admin-rbac`（語義相關）
- "Zustand stale closure" → 匹配 `zustand-patterns` → state Domain (2 成員) → 連帶載入 `type-canonical`
- "CSS style change" → 匹配 `design-system` → design Domain (3 成員) → 連帶載入 `tooltip` + `progress-animation`
- "Add Migration" → 匹配 `sqlserver` → database Domain (1 成員) → 無額外連帶

## Skip When
- User explicitly invokes `/pcpt-xxx`
- Purely conversational (no code implications)
- BMAD workflow already handles skill loading
