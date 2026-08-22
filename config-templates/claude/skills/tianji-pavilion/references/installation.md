# Installation Guide — Tianji-Pavilion v1.2.0

This skill ships **8 deterministic hooks** in `assets/hooks/` plus a DB
schema patch in `scripts/db-patch-init-db.js`. Install in 5 steps.

---

## Prerequisites

- Claude Code CLI (any recent version supporting hooks)
- Node.js (any recent LTS)
- `better-sqlite3` available in the project — if your project already uses
  `.context-db` (Memory MCP, RAG, etc.) it is typically already installed
- `.context-db/context.db` exists (the patch script will not create the DB
  itself; it only adds new tables)
- `$CLAUDE_PROJECT_DIR` resolves to your project root (Claude Code sets
  this automatically)

If any prerequisite is missing, **hooks soft-skip** rather than blocking.
This is intentional: a first-time project setup must never be bricked by
a guard skill.

---

## Step 1 — Apply DB schema patch

```powershell
node "$env:CLAUDE_PROJECT_DIR\.claude\skills\tianji-pavilion\scripts\db-patch-init-db.js" apply
```

What it does:
- Adds `baseline_snapshots` table (25 columns) to `.context-db/context.db`
- Adds `external_evaluations` table (33 columns)
- Adds 7 supporting indexes
- Uses `CREATE TABLE IF NOT EXISTS` — idempotent, safe to re-run

Verify:

```powershell
node "$env:CLAUDE_PROJECT_DIR\.claude\skills\tianji-pavilion\scripts\db-patch-init-db.js" verify
```

Expected output:
```
[tianji-db-patch] verify OK
  baseline_snapshots: 25 columns
  external_evaluations: 33 columns
```

---

## Step 2 — Copy hook scripts to `.claude/hooks/`

```powershell
$src = ".claude\skills\tianji-pavilion\assets\hooks"
$dst = ".claude\hooks"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item "$src\_lib.js"                        "$dst\_lib.js" -Force
Copy-Item "$src\baseline-snapshot-gate.js"      "$dst\tianji-baseline-snapshot-gate.js"
Copy-Item "$src\concurrent-pilot-guard.js"      "$dst\tianji-concurrent-pilot-guard.js"
Copy-Item "$src\q4-audit-gate.js"               "$dst\tianji-q4-audit-gate.js"
Copy-Item "$src\impulse-cooldown-guard.js"      "$dst\tianji-impulse-cooldown-guard.js"
Copy-Item "$src\pilot-timebox-monitor.js"       "$dst\tianji-pilot-timebox-monitor.js"
Copy-Item "$src\reject-cooldown-check.js"       "$dst\tianji-reject-cooldown-check.js"
Copy-Item "$src\ssot-sync-checker.js"           "$dst\tianji-ssot-sync-checker.js"
Copy-Item "$src\scope-creep-detector.js"        "$dst\tianji-scope-creep-detector.js"
```

Critical: `_lib.js` is `require()`-d by all 8 hooks, so it MUST sit in
the same directory (`.claude\hooks\_lib.js`). The hooks use the relative
path `require('./_lib')`.

### ⚠️ 部署前必讀:live ↔ assets ↔ dist 刻意分歧台帳(bwu-10 新增)

上方 `Copy-Item ... -Force` 會以本目錄(assets)的內容**覆蓋** `.claude/hooks/`(live)既有檔案。下表記錄 live(`.claude/hooks/`)、assets(本 skill 內可攜出範本,`assets/hooks/`)、dist(`dist/portable-skills/`,對外發佈的脫敏版)三方之間**刻意保留、不應消除**的分歧:

| 分歧項 | live | assets | dist | 理由 |
|---|---|---|---|---|
| hook 檔名 prefix | `tianji-*.js`(如 `tianji-baseline-snapshot-gate.js`) | 無 prefix(如 `baseline-snapshot-gate.js`) | 同 assets | live 端與其他 skill 的 hook 共用 `.claude/hooks/` 同一目錄,prefix 避免跨 skill 命名碰撞;assets/dist 各自是單一 skill 的可攜出範本,無碰撞疑慮,prefix 由部署者於 Step 2 複製時另行命名 |
| DB 路徑常數字面 | `.context-db/phycool.db` | 同 live(字面,未脫敏) | `{{CONTEXT_DB}}/memory.db`(佔位符) | dist 是給外部 adopter 的脫敏發佈版,不得含 PhyCool 專案字面;佔位符由 adopter 依 `INSTALL.md` 替換為自己專案的 DB 路徑 |
| 程式碼結構檢索文檔檔名 | `references/gitnexus-integration.md` | 同 live | `references/code-index-integration.md` | dist 脫敏將專屬工具名 GitNexus 泛化為 `{{CODE_INDEX}}` 概念(見 dist `INSTALL.md` 佔位符表),檔名同步改為通用命名,避免暗示 adopter 必須採用特定廠商工具 |
| 本台帳(分歧記錄本身) | 本檔含本台帳章節 | 同 live | dist 端 `installation.md` **不同步**本台帳 | 台帳內容描述的是「live ↔ assets」兩端的部署關係,對只持有 dist 可攜出副本、從未見過 live 端的 adopter 而言沒有可對應的一方 —— 同步等於在對方文件裡描述一個對方看不到的東西,無指涉對象 |

**下列項目是本次(bwu-10)消除的分歧,已非分歧,記錄於此供追溯**:`resolveDbPath()` 的 `process.env.CLAUDE_PROJECT_DIR || process.cwd()` fallback,原僅 live 端具備,assets/dist 端缺席。**這是行為變更(behavior change),不是單純衛生同步**——可攜出範本原本在 `CLAUDE_PROJECT_DIR` 未設時 `resolveDbPath()` fail-closed 回 `null`,所有 tianji hook 因而靜默 `softSkip`;bwu-10 後三方一致改為 cwd fallback。

- **消除依據**:本檔上方 `Copy-Item ... -Force` 會以 assets 覆蓋 live;若 adopter 專案的 `settings.json` 走 `cd "<abs path>" && node ...` 慣例(常見於路徑含特殊字元時)導致 `CLAUDE_PROJECT_DIR` 未設,覆蓋後所有 tianji hook 會靜默失效——這不是「未記錄的分歧」,而是「照著本檔自己的部署指令操作就會關掉這個 skill」。且同目錄的 `scope-creep-detector.js` 的 `openWritableDb()` 函式註解早已宣稱與 `_lib.js` 的 `resolveDbPath()` parity——這份宣告在 bwu-10 之前並不成立,本次消除使其成真。
- **dist 生效條件**:dist 副本的 `CONTEXT_DB_RELATIVE` 為 `{{CONTEXT_DB}}/memory.db` 佔位符字面,cwd fallback 邏輯雖已同步至 dist 副本,但**只有 adopter 依 `INSTALL.md` 將 `{{CONTEXT_DB}}` 替換為自己專案的實際路徑後,fallback 才會在其專案內實際生效**——同步的價值在於「替換後行為與 live 一致」,而非 dist 副本本身立即可運作。

---

## Step 3 — Merge `assets/settings-snippet.json` into `.claude/settings.json`

The snippet registers 8 hooks across 4 events:

| Event | Matcher | Hook count |
|---|---|---|
| `PreToolUse` | `Bash` | 4 |
| `PostToolUse` | `Bash` | 1 |
| `PostToolUse` | `Edit\|Write\|MultiEdit` | 1 |
| `SessionStart` | `startup\|resume` | 1 |
| `UserPromptSubmit` | (none) | 1 |

If your `.claude/settings.json` already has entries under any of these
event+matcher pairs, **append** the `tianji-*` command objects to the
existing `hooks` array rather than creating duplicate matcher entries.
Duplicates cause both to fire, which is usually harmless but wastes
budget.

Validate with:
```powershell
node -e "JSON.parse(require('fs').readFileSync('.claude\settings.json','utf8'))"
```

Any output means valid JSON. An error means manual repair needed.

---

## Step 4 — Reload Claude Code

Run `/clear` or restart the CLI. Hook config is snapshotted at session
start — mid-session changes do not take effect until reload.

---

## Step 5 — Verify with `/hooks`

Inside Claude Code, run:

```
/hooks
```

Expected: 8 `tianji-*` commands listed across the 4 events. Specifically:

```
PreToolUse / Bash → 4 tianji-* commands
PostToolUse / Bash → 1 tianji-* command
PostToolUse / Edit|Write|MultiEdit → 1 tianji-* command
SessionStart / startup|resume → 1 tianji-* command
UserPromptSubmit → 1 tianji-* command
```

### End-to-end test

```powershell
git worktree add ..\wt-test -b pilot/nonexistent-id
```

Expected output:
```
[tianji] BLOCKED: F2 violation — no baseline_snapshots row for
external_id="nonexistent-id". ...
```

Exit code 2 from the hook prevents the worktree from being created. If
you see this, all 8 hooks are correctly wired and the DB read path works.

---

## Uninstall

```powershell
# 1. Remove hook scripts
Remove-Item ".claude\hooks\tianji-*.js"
Remove-Item ".claude\hooks\_lib.js"  # if no other skills use it

# 2. Remove entries from .claude\settings.json
#    (manual edit; delete the tianji-* command objects)

# 3. (Optional) Drop DB tables
#    Note: this loses all evaluation history. Usually you want to KEEP these.
sqlite3 .context-db\context.db <<EOF
DROP TABLE IF EXISTS external_evaluations;
DROP TABLE IF EXISTS baseline_snapshots;
EOF

# 4. Reload Claude Code
```

---

## Common pitfalls

### "Hook doesn't fire"

1. Run `/hooks`. Missing? settings.json entry wrong or not reloaded.
2. JSON valid? `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))"`.
3. Hook file at the path in settings.json? `Test-Path` it.
4. Session restarted after settings edit? Hook config is snapshotted at start.

### "Hook fires but always says 'skipped (context-db unavailable)'"

Either `$CLAUDE_PROJECT_DIR` is not set, `.context-db/context.db` does not
exist, or `better-sqlite3` is not installed.

```powershell
echo $env:CLAUDE_PROJECT_DIR
Test-Path ".context-db\phycool.db"
npm ls better-sqlite3
```

If `better-sqlite3` missing: `npm install better-sqlite3`.

### "F2 blocks but my baseline row exists"

The `external_id` extracted from the branch name must match the DB row
exactly. The hook extracts:

| Command pattern | Extracted external_id |
|---|---|
| `git worktree add ../wt -b pilot/awesome-rules` | `awesome-rules` |
| `git worktree add ../wt -B pilot/foo-bar` | `foo-bar` |
| `git worktree add ../wt -b feature/x` | (none — hook skips) |

If mismatched, either rename the branch or update the row:

```sql
UPDATE baseline_snapshots SET external_id = 'awesome-rules' WHERE id = 42;
```

### "F8 fires on files I expected to be in scope"

Check the pilot's `scope_in_scope_paths`:

```sql
SELECT scope_in_scope_paths FROM external_evaluations
 WHERE pilot_worktree = '<path>' AND pilot_end IS NULL;
```

Path-prefix matching: `src/foo` in-scope means `src/foo/bar.ts` matches
but `src/baz.ts` does not. Widen scope deliberately via UPDATE + Phase 5
ADR addendum.

### "Bypass for genuine emergencies"

There is no built-in bypass flag. Bypass is intentional friction.

If a true emergency requires bypassing F3 (production fire requires
hot-fix pilot while another pilot is open), comment out the offending
hook in `.claude\settings.json`, document the override in a commit
message tagged `tianji-override:`, then restore the hook in the same
session. `git log --grep='tianji-override'` makes the audit trivial.

For F2/F11 bypasses, manually INSERT a placeholder row to satisfy the
gate, then update it post-emergency. Same audit trail principle applies.

---

## See also

- `references/hooks-troubleshooting.md` — detailed diagnostic flow
- `references/hook-output-contracts.md` — what each hook emits
- `references/hook-registry.md` — F# to hook mapping table
- `references/db-schema-spec.md` — DB tables this skill reads/writes
