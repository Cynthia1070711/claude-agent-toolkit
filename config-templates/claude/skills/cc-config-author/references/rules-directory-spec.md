# .claude/rules/ 目錄規範(2026 Apr)

`.claude/rules/` 是 CLAUDE.md 的「模組化分身」。任何 .md 檔案放進去都會被當作 memory 載入。**但載入機制與 CLAUDE.md 不同**,有 4 個已知 bugs 要避開。

---

## 載入機制

| 規則類型 | 載入時機 | 等同於 |
|---|---|---|
| 無 frontmatter | Session 啟動時全載入 | 同 CLAUDE.md(unconditional) |
| 有 `paths:` frontmatter | Claude **Read** 匹配檔案時 lazy-load | 路徑限定 |
| 子目錄內 | 同上,依目錄結構 | 子模組 |

> 引用 shanraisshan/claude-code-best-practice(2026 May):
> `.claude/rules/*.md` with `paths:` YAML frontmatter are lazy-loaded only when Claude touches matching files; without frontmatter they load into every session like CLAUDE.md

---

## paths frontmatter 語法

```yaml
---
paths:
  - "src/api/**/*.ts"
  - "**/*.config.{ts,json}"
  - "docs/stories/**"
---

# Rule body 從這裡開始
```

**glob 模式支援**:
- `**` — 任何深度的目錄
- `*` — 任何字串(單層)
- `{a,b}` — 多選
- `?` — 單字元

**範例**:

| 想匹配 | 寫法 |
|---|---|
| 所有 .ts 與 .tsx | `"**/*.{ts,tsx}"` |
| `src/` 或 `lib/` 下的 .ts | `"{src,lib}/**/*.ts"` |
| 任何 README | `"**/README.md"` |
| 排除 generated | 不支援排除,只能用更精確的 include |

---

## 4 個已知 Bugs(必避)

### Bug #23478 — paths 規則在 Write 工具觸發時不載入

**Status**:Open(2026 Feb 5)、macOS 確認、Windows 推測同

**症狀**:`.claude/rules/api.md` 有 `paths: src/api/**/*.ts`,Claude 新建 `src/api/foo.ts` 時,規則**不會載入**。只在 Read `src/api/*.ts` 時才載入。

**影響**:任何「檔案創建時的約束」用 paths 不可靠。例如:
- 「新建 .md 加 # created 標頭」→ 失效
- 「新建 .ts 加 license header」→ 失效

**workaround**:
1. 規則同時放 `CLAUDE.md`(犧牲細粒度)
2. 寫 PostToolUse hook 偵測 Write 並注入 additionalContext
3. 在 rule 內容首行寫明「此規則理應在 Write 時觸發但因 Bug #23478 失效,改由 hook 兜底」

### Bug #21858 — user-level rules 的 paths 完全失效

**Status**:Open(2026 Jan 30)、Windows 確認

**症狀**:把 `paths:` 規則放 `~/.claude/rules/` 永遠不載入,即使 Read 匹配檔案。

**影響**:跨專案共用 paths 規則的構想行不通。

**workaround**:
1. 規則只在專案層使用(`.claude/rules/`)
2. 多專案 symlink 同一份 rule 檔
3. 或包成 plugin 散布

### Bug #16299 — 部分版本 paths rules 全載入(無視 frontmatter)

**Status**:Reported 2026 Jan 5、macOS

**症狀**:某些版本 Claude Code 把 `.claude/rules/*.md` 全載入,**忽略** paths frontmatter,造成 context 爆炸。

**驗證**:`/memory` 列出實際載入的檔案,對照 frontmatter 設定。

**workaround**:升級到最新 Claude Code 版本(2026 Mar+ 已修)。

### Bug #16853 — paths 規則在 Read 也偶有不載入

**Status**:Reported 2026 Jan 8、macOS

**症狀**:邊緣情況下,Read 匹配 paths glob 的檔案,規則仍不載入。

**workaround**:用 `/memory` 命令驗證,必要時把規則移回 CLAUDE.md。

---

## 子目錄組織

可以分子目錄,但**識別不變**(無 namespace):

```
.claude/rules/
├── code-style.md
├── frontend/
│   ├── react.md
│   └── styles.md
└── backend/
    ├── api.md
    └── db.md
```

掃描遞迴,所有 .md 都會被處理。子目錄純粹組織用,**沒有觸發隔離效果**(除了 paths frontmatter)。

---

## 行數預算

| 規則類型 | 軟上限 | 硬上限 |
|---|---|---|
| 無 paths(always-on) | 60 行 | 100 行 |
| 有 paths(lazy-load) | 150 行 | 250 行 |

⚠️ **PhyCool 警示**:當前 31 條 rules 全 always-on,**估 42k tokens**。即使每條 50 行也累積爆炸。

---

## 該放 rule、CLAUDE.md、還是 skill?

決策樹:

```
規則是?
├─ 全域不可妥協、跨所有工作場景 → CLAUDE.md
├─ 只在特定檔案類型工作時需要 → .claude/rules/ + paths:
├─ 只在使用者明確要某工作流時需要 → .claude/skills/
└─ 規則違規可被程式偵測 → 寫 Hook(載入 hooks-mechanization skill)
```

**ROI 比較**:

| 方案 | always-on 成本 | 觸發精度 | 違規攔截 |
|---|---|---|---|
| CLAUDE.md | 全載入,佔指令槽 | 100%(每次) | 依賴 Claude 自律 |
| Rule(無 paths) | 全載入,排擠他項 | 100%(每次) | 依賴 Claude 自律 |
| Rule(有 paths) | 0(lazy-load) | 80%(看 bug) | 依賴 Claude 自律 |
| Skill | ~100 tokens metadata | 視 description 準確度 | 依賴 Claude 自律 |
| Hook | 0(執行檔) | 100%(事件觸發) | 程式強制 |

**選擇原則**:能 hook 就 hook,不能就 paths-scoped rule,真的全域才 CLAUDE.md。

---

## frontmatter 完整欄位

依官方 docs(2026 Apr):

```yaml
---
paths:               # 選填,YAML list of glob strings
  - "..."
  - "..."
# Cursor 用 globs:, Claude Code 用 paths:, 寫錯不會報錯但沒效果
---
```

⚠️ 不要用 Cursor 的 `globs:` 語法 — Claude Code 用 `paths:`。

---

## 健檢清單

任何新建 `.claude/rules/*.md`:

- [ ] 規則是否真的需要 always-on?能不能變 skill 或 hook?
- [ ] 加了 paths frontmatter 嗎?
- [ ] paths 字串用雙引號?
- [ ] 確認不是放在 `~/.claude/rules/` 用 paths(Bug #21858)
- [ ] 規則內容 ≤ 預算行數
- [ ] 規則內容是「Claude 該怎麼做」的指引,不是「Claude 已會的事」
- [ ] 若是創建時規則,理解 Bug #23478 並有 hook 兜底計畫

---

## PhyCool 現況與建議

依摘要,31 條 rules 中:

- 🟢 6 條可機械化為 hook(Phase 2 處理)
- 🟡 16 條可加 paths(Phase 1 處理,注意 bugs)
- 🔴 5 條保留 always-on
- ⚫ 4 條退役(Phase 1 處理)

詳細對照見 `hooks-mechanization` skill 的 `references/phycool-rule-mapping.md`。