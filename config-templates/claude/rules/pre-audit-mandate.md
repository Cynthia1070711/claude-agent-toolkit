---
paths:
  - "_bmad/**/workflows/**"
  - "docs/implementation-artifacts/stories/**"
  - "docs/tracking/**"
  - "docs/technical-decisions/**"
  - ".claude/audit/**"
  - ".claude/hooks/**"
  - ".claude/rules/**"
  - ".claude/skills/**"
  - "scripts/**"
  - "claude token減量策略研究分析/實施報告/**"
---

# Pre-Audit Mandate — 任務開工前 6 步必走 (SUPREME)

> **建立**: 2026-05-23 (Stage-β mid-session Party Mode Action ② P0/S)
> **嚴重等級**: SUPREME(對齊 `constitutional-depth-first.md` / `cross-ref-discipline.md` 兄弟規範)
> **觸發背景**: Stage-β mid-session-handoff-brief §2 紀律 2 + Memory id=4311 lesson — Agent 無腦執行新建任務時,常發生「重複實作 / 重複架構 / 已有類似 hook/skill 卻從零再造」狀況

---

## 1. Why This Rule

Stage β P0~P0.8 期間,多次發生 Agent 收到任務即動手新建,完工後才發現:
- 既有 hook/skill 已涵蓋目標(redundant build)
- 既有 ADR 已記錄類似決策(blind re-invent)
- 既有 implementation 60%+ 對齊,只需 wrapper/升級而非從零

對齊 **Anti-Pattern: Scale-Stale Reciprocity**(`skill-creation-discipline.md`)+ **L3 自建 artifacts 不作 evidence**(Memory id=4307)。

使用者原話(handoff brief §2):
> 「執行任務前須先驗證了解任務相對應當前的開發環境配置及況態,再來執行任務,**不是無腦執行**,完成後才發現已經有重複或已經有類似的架構的狀況」

---

## 2. Applies When

任何以下情境觸發 6 步 Pre-Audit Flow:

| # | 情境 | 觸發信號 |
|:-:|:----|:----|
| 1 | 收到「新建 / 建立 / 新增 / 設計 / 機械化」task initiation keyword | user prompt content |
| 2 | BMAD workflow dev-story / create-story / code-review step 開工 | bmad workflow trigger |
| 3 | 涉及 `.claude/{hooks,rules,skills,agents,commands}/` 新增 / 修改 | Write/Edit path matches paths frontmatter |
| 4 | 涉及 `scripts/**/*.{cjs,js,ps1}` 新增 | Write path matches |
| 5 | 任何「審計 / audit / 比對 / 全範圍檢查 / drift / 同步」任務 | task description keyword |
| 6 | Story stub 從零展開(create-story workflow Mode A)| BMAD trigger |

---

## 3. Mandatory Pre-Task Flow (6 步)

### Step 1: Read 6-Layer Retrieval SSoT

```
Read claude token減量策略研究分析/開發環境檢索架構全景/README.md
```

確認當前檢索基礎建設能力範圍(6 層 + 23 MCP tools + 11-Layer pre-prompt-rag + GitNexus + Chrome MCP)。

### Step 2: Glob 既有相關 hooks / skills / scripts

依 task domain 列舉既有實作:
```
Glob .claude/hooks/*.js                # 既有 hooks
Glob .claude/skills/*/SKILL.md         # 既有 skills
Glob .claude/rules/*.md                # 既有 rules
Glob scripts/**/*.{cjs,js,ps1}         # 既有 scripts
Glob .context-db/scripts/*.{cjs,js}    # 既有 DB scripts
```

### Step 3: Read 對應 SUPREME rules + ADR + Memory

- Grep `.claude/rules/*.md` 對 task keyword
- `mcp__phycool-context__search_intentional_decisions` 查 IDD
- `mcp__phycool-context__search_context` (category:decision/pattern/lesson)
- Glob `docs/technical-decisions/ADR-*.md` 查既有 ADR

### Step 4: 比對 task scope vs 既有 implementation

**對齊矩陣**(必填,寫入 dev_notes / tracking 或 stdout):

| 維度 | 既有實作 | 目標 task | 對齊度 |
|:----|:----|:----|:----:|
| Trigger event | (現有 hook 已 cover?) | (要 cover) | NN% |
| Data flow | ... | ... | NN% |
| Config | ... | ... | NN% |
| **總對齊度** | — | — | **NN%** |

### Step 5: 若 60%+ 對齊 → 升級而非從零

- dev_notes 寫 audit finding(對齊百分比 + 具體 file:line)
- 改設計為「wrapper / extend / 升級」非「從零實作」
- **禁從零實作**

### Step 6: 若 < 30% 對齊 → 走完整新建流程

依 task 性質 走對應 SOP:
- Hook 新建 → `Skill(skill="hooks-mechanization")` 7-step playbook
- SaaS 模組 Skill → `Skill(skill="saas-to-skill")` Mode A
- 非 SaaS Skill → `Skill(skill="skill-builder")`
- Rule / CLAUDE.md / settings.json → `Skill(skill="cc-config-author")` 7-step audit
- 走 `cross-ref-discipline.md` §3 Pre-Action Flow + `capability-integration-mandate.md`

30%-60% 灰色地帶:**用戶決定**(stdout 列對齊矩陣 + 兩條路徑 trade-off,等使用者放行)。

---

## 3.5 Commit Pre-Check(commit 前 5 題必自答 · v1.1.0 新增)

> **觸發背景**: 2026-05-23 c84b71cc commit(79 files 入版控)之前未檢查並行 agent 工作狀態,僥倖 verify clean 但違反專業團隊紀律(per multi-agent coordination incident)。本 §3.5 將「commit 前 self-check」固化為 SUPREME rule。

任何 `git commit` 之前必走以下 5 題自答,違反 = Pre-Audit Mandate 精神延伸至 commit 階段:

1. **「我有跑 `git status` 看 untracked + modified + staged 範圍嗎?」** → 否 → STOP,先跑
2. **「我有跑 `git diff --staged` 逐 file 看內容嗎?(或 `--stat` 看整體 + 抽樣 ≥ 3 critical files)」** → 否 → STOP,先跑
3. **「我有檢查並行 agent / session 是否在動同範圍 files 嗎?」**(`git log --since="6 hours ago"` + 看是否 ≥ 2 distinct epic tracks)→ 否 → STOP,先跑
4. **「本 commit scope 是否含意外 file?」**(尤其 `git add .` / `git add dir/` 整包 add 後 / .gitignore 變更後 file 新曝光)→ 不確定 → 逐 file 確認來源
5. **「commit message 是否反映真實變更(不誇大不漏項)?」** → 否 → 重寫

### 特別場景補強

| 場景 | 必走動作 |
|:----|:----|
| **整目錄 `git add path/`** | 必先 `git status --untracked-files=all` 看 untracked sub-files + 確認所有 file 來源 |
| **`.gitignore` 變更後** | 必先 `git status` 看新「曝光」的 file 是否需 stash / 評估;若 ≥ 10 file 新曝光必先逐 file verify 來源(`pre-commit-quality.js` BR-006 機械守護) |
| **並行 agent 場景** | 必先 `git log --all --since="6 hours ago" -- changed_paths` 看別 agent 是否動過(`pre-commit-quality.js` BR-004 機械守護) |
| **大量 staged files**(≥ 5)| 必跑 `git diff --staged --stat` 看 file 範圍 + 抽樣 ≥ 3 critical files(`pre-commit-quality.js` BR-005 advisory 提醒) |

### 機械守護(配套 hook)

`.claude/hooks/pre-commit-quality.js` v 2026-05-23 升級含 BR-004/005/006(在 BR-001 secret detection + BR-002 debug remnant + BR-003 commit message format 之上):

- **BR-004 Multi-agent**: 偵測近 6h ≥ 2 epic tracks → stderr advisory warn
- **BR-005 Self-check reminder**: ≥ 5 staged files → 提醒 §3.5 5 題自答
- **BR-006 Gitignore flood**: `.gitignore` 同 commit 帶 ≥ 10 files → 警告 exception rule 新曝光

Hook advisory 非 hard-block(BR-001 only block),但出現任一 BR-004/005/006 warning 必停下重走 §3.5 5 題。

---

## 4. FORBIDDEN

- ❌ **F1**: 收到「建立 X hook」即立刻 Write,跳過 Step 1-4
  - Common Rationalization: 「明顯該建,不必查既有」/「快速推進更重要」
  - Red Flag: transcript 缺 `Glob .claude/hooks/*.js` 或 Grep 既有 hook 步驟

- ❌ **F2**: Step 4 對齊矩陣未列,直接「我覺得 < 30%」推斷
  - Common Rationalization: 「明顯對齊度低,不必列表」
  - Red Flag: dev_notes / stdout 缺對齊百分比 + 維度列舉

- ❌ **F3**: 既有實作 60%+ 對齊卻仍從零實作(redundant build)
  - Common Rationalization: 「既有版本太舊,重寫比改快」/「升級風險高」
  - Red Flag: 新建檔 vs 既有檔 file 重疊功能 > 60% 經 grep 證實

- ❌ **F4**: 跳過 Step 3 Memory / IDD / ADR query
  - Common Rationalization: 「不需要,我記得沒有相關 ADR」
  - Red Flag: transcript 缺 `mcp__phycool-context__search_*` 紀錄

- ❌ **F5**: Step 5 升級路徑識別後仍堅持新建,未證明 risk
  - Common Rationalization: 「升級 risk 高」(無具體證據)
  - Red Flag: 未列舉升級具體 risk(file:line / dependency / API break)即放棄

- ❌ **F6**: `git add .` / `git add dir/` 整包 add 不逐 file verify(§3.5 第 4 題,v1.1.0 新增)
  - Common Rationalization: 「我知道這目錄都是我的,不必查」/「scope 應該乾淨」
  - Red Flag: transcript 缺 `git diff --staged --stat` 或 `git show <hash> --stat` 抽樣步驟;尤其 `.gitignore` 同 commit 變更時無 file 來源 verify

---

## 5. Self-Check (任務開工前必自問 5 題 · v1.1.0 新增 Q5)

1. **「我有 Read 開發環境檢索架構全景 README 嗎?」** → 否 → STOP,先 Read
2. **「我有 Glob 既有 hooks/skills/scripts 對應 task domain 嗎?」** → 否 → STOP,先 Glob
3. **「我有列對齊矩陣與百分比嗎?」** → 否 → STOP,先列
4. **「對齊 60%+ 時我是否選擇了升級路徑而非從零?」** → 否 → STOP,重新評估
5. **「commit 前我有走 §3.5 5 題 self-check 嗎?(git status + git diff --staged + 並行 agent check + scope verify + message verify)」** → 否 → STOP,先走完

任一答案 No → **STOP**,回 Step 1(或 §3.5)重來。

---

## 6. Incident Records

### 2026-05-23 — 本規則觸發建立

**事件**: Stage β P0~P0.8 期間多次無腦新建。Memory id=4311 lesson 固化 — Agent 收到 task initiation 即動手,完工後才發現重複或既有架構已涵蓋。

**處理**: 本 rule v1.0.0 建立(SUPREME paths-scoped),Stage-β mid-session Party Mode 9 專家共識 Action ② P0/S 機械化此 lesson。

**配套**(後續可進化):
- UserPromptSubmit hook 偵測 task initiation keyword → inject 6-step Self-Check(P1 backlog)
- 整合到 `pre-prompt-rag.js` Layer 11 Rule Violation Hot Zones(P2 backlog)

---

## 7. Related Rules

- `.claude/rules/constitutional-depth-first.md` — Depth-First Verification(本 rule 補強 pre-task 階段)
- `.claude/rules/cross-ref-discipline.md` — Cross-Ref Pre-Action Flow(本 rule 補強 task initiation 階段)
- `.claude/rules/capability-integration-mandate.md` — Capability ↔ Consumption 5 步整合
- `.claude/rules/skill-creation-discipline.md` — Skill 新建 3 題必檢 + Cap 規則
- `.claude/rules/hooks-creation-discipline.md` — Hook 建立走 hooks-mechanization
- `.claude/rules/skill-tool-invocation-mandatory.md` — Skill tool 字面調用
- `Memory id=4311` (`context_entries`) — Pre-Audit Mandate lesson source

---

## 8. Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.1.0** | **2026-05-23** | **§3.5 Commit Pre-Check 5 題 新增**(SUPREME 等級延伸至 commit 階段)。觸發:2026-05-23 c84b71cc commit 79 files 入版控前未檢查並行 agent 工作狀態,僥倖 verify clean 但違反專業團隊紀律(multi-agent coordination incident)。本次新增:(1) §3.5 5 題自答(git status / git diff --staged / 並行 agent / scope / message)+ 4 特別場景補強(整目錄 add / .gitignore 變更 / 並行 agent / ≥ 5 staged files);(2) FORBIDDEN F6 整包 add 不 verify(含三元素 Common Rationalization + Red Flag);(3) Self-Check Q5(commit 前 §3.5 自答);(4) 機械守護配套 `.claude/hooks/pre-commit-quality.js` 升級 BR-004 multi-agent + BR-005 self-check reminder + BR-006 gitignore flood guard。Skill 路由:cc-config-author(rule edit) + hooks-mechanization(pre-commit-quality.js BR-004~006 升級)雙 Skill fresh invoke + 8 面向驗證(N/A SaaS) + 走自己建立的 Pre-Audit Mandate 6 步 Self-Apply(對齊 65% Step 5 升級既有 hook 而非從零)。 |
| **1.0.0** | **2026-05-23** | 初版建立。觸發:Stage-β mid-session-handoff-brief §2 紀律 2 + Memory id=4311 lesson。SUPREME 等級,paths-scoped 至 `_bmad/**/workflows/**` / `docs/implementation-artifacts/stories/**` / `docs/tracking/**` / `docs/technical-decisions/**` / `.claude/audit/**` / `.claude/{hooks,rules,skills}/` / `scripts/**` / `claude token減量策略研究分析/實施報告/**`。Mandatory 6-step pre-task flow + 5 FORBIDDEN F1-F5(含 Common Rationalization + Red Flag,對齊 saas-to-skill v3.3.0 八面向 §8 Loophole Closure 三元素格式)+ Self-Check 4 題 + Incident Records + Related rules 7 條。本 rule 由 Stage-β mid-session Party Mode 9 專家共識 Action ② P0/S 機械化。配套後續可進化:UserPromptSubmit hook(P1)+ pre-prompt-rag Layer 11(P2)。 |
