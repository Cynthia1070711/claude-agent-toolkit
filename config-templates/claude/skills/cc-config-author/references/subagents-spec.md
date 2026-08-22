# Subagents 規範(.claude/agents/*.md, 2026 Apr)

Subagent 是 isolated context 的「外包工作者」。Parent 把任務 prompt 派發,subagent 用自己的 context window 跑完回傳摘要。**Parent 看不到 subagent 內部過程**。

---

## 為什麼用 subagent

**好處**:
- Isolated context — 不污染 parent
- 平行執行 — 多個 subagent 同時跑
- 模型分層 — Opus 規劃,Sonnet/Haiku 執行
- 工具限制 — 不同角色不同工具白名單

**代價**(嚴禁樂觀):
- Token 倍增 — 官方明示 **4-7x tokens**,Agent Teams 達 **15x**
- 不繼承 skills — 必須在 frontmatter `skills:` 顯式 preload
- 不繼承 parent read 歷史 — 配合 hook 時要注意 cache key
- 啟動延遲 — 每個 spawn 額外 1-2 秒

---

## Frontmatter 16 欄位

| 欄位 | 必填 | 用途 |
|---|---|---|
| `name` | ✅ | Subagent 識別 |
| `description` | ✅ | 何時委派(parent 用此判斷) |
| `tools` | ❌ | 工具白名單(omit = 繼承 parent) |
| `disallowedTools` | ❌ | 工具黑名單 |
| `model` | ❌ | `sonnet` / `opus` / `haiku` 或完整 ID |
| `effort` | ❌ | low/medium/high/xhigh/max |
| `permissionMode` | ❌ | default / plan / auto |
| `mcpServers` | ❌ | 限制 MCP 存取 |
| `hooks` | ❌ | Subagent 內嵌 hook(Stop hook 自動轉 SubagentStop) |
| `maxTurns` | ❌ | Turn 上限 |
| `skills` | ❌ | **必填當需要 skill 時**,subagent 不繼承 parent skills |
| `isolation` | ❌ | `worktree` 表示在 git worktree 隔離 |
| `memory` | ❌ | true / false,是否持久化 memory |
| `background` | ❌ | true = 不阻塞 parent |
| `color` | ❌ | UI 顏色(純展示) |
| `initialPrompt` | ❌ | spawn 時的初始 prompt 補充 |

---

## 必填欄位深度

### name

- Lowercase + hyphens, ≤64 chars
- 不可含 `claude`
- 對應 `Use the <name> subagent` 顯式呼叫

### description

**這是 parent 自動委派的依據**。比 skill description 更關鍵,因為 subagent 啟動成本高,選錯浪費大。

**Anti-pattern**:

```yaml
description: A helpful agent.   # ❌ Claude 永遠不會選你
```

**好範例**:

```yaml
description: |
  Use when the user describes a new feature, story, or non-trivial bug, BEFORE
  any implementation begins. This agent reads the request, performs SDD spec
  drafting per BMAD v6 methodology, asks clarifying questions, and produces
  docs/stories/ spec files. Triggers: "新功能"、"新 story"、"幫我規劃"、
  "先寫 spec"、any user prompt that lacks a clear implementation target.
```

關鍵元素:
1. **When** to use(時機)
2. **Why** to use(意圖)
3. **Trigger phrases**(具體語句)
4. **Output**(產出形式)

---

## 工具限制(tools / disallowedTools)

### tools(白名單)

```yaml
tools: Read, Glob, Grep                # 唯讀
tools: Read, Glob, Grep, Write, Edit   # 標準實作工具
tools: Read, Bash, mcp__chrome-devtools  # 含特定 MCP
```

**Omit `tools` 的意義**:繼承 parent 的工具(含 MCP)。

### disallowedTools(黑名單)

```yaml
disallowedTools: ["Write", "Edit"]   # 禁止修改檔案
```

通常用 `tools` 白名單就夠,黑名單適合「繼承全工具但排除某些」。

---

## 模型分層策略

最大化效益的分工:

| Subagent 角色 | 推薦模型 | Effort | 理由 |
|---|---|---|---|
| Orchestrator / PM | opus | xhigh | 規劃需要深度推理 |
| Architect / Reviewer | opus | xhigh | 架構決策影響深遠 |
| Implementer | sonnet | high | 主力幹活,平衡成本 |
| Verifier / Tester | sonnet | high | 驗證需要嚴謹 |
| Explorer / Search | haiku | medium | 唯讀搜尋,Haiku 夠用 |
| Documenter | haiku | medium | 簡單格式化 |

**節省範例**:explorer 用 haiku 對比 sonnet,**約省 5x token cost**。

---

## skills preload(關鍵)

⚠️ **Subagent 不繼承 parent 的 skills**。必須顯式列出:

```yaml
---
name: orchestrator-pm
skills:
  - story-spec-author
  - bmad-v6-conventions
---
```

Subagent 啟動時,**完整載入** 這些 skills 的 SKILL.md body(不是只 metadata)。

**為什麼這設計**:Subagent context 從零開始,需要 self-contained instructions。

**多 skill 範例**:

```yaml
skills:
  - story-spec-author
  - bmad-v6-conventions
  - cr-web-build
```

3 個 skill 全載入,要算進 subagent token budget。

---

## isolation: worktree

2026 Apr 新增。讓 subagent 在 isolated git worktree 工作,完全避免檔案衝突。

```yaml
---
name: refactor-worker
isolation: worktree
---
```

**何時用**:
- 多個 subagent 平行改檔案(避免 conflict)
- 實驗性重構(可獨立 commit,不污染主分支)

**不用時的後果**:多個 subagent 改同檔案 → 後寫的覆蓋前寫的(無 lock 機制,Claude Code 不會自動合併)。

---

## hooks(subagent 內嵌)

Subagent 內可定義自己的 hooks:

```yaml
---
name: db-reader
tools: Bash
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate-readonly-query.sh"
---
```

**特殊轉換**:Subagent frontmatter 內的 `Stop` hook 會自動轉為 parent session 的 `SubagentStop` 事件。

---

## maxTurns

```yaml
maxTurns: 20
```

防止 subagent 無限迴圈。預設無上限,但建議所有 subagent 都設(尤其是有副作用的)。

實務值:
- Explorer:5-10
- Implementer:30-50
- Long-running(整合測試):100

---

## permissionMode

```yaml
permissionMode: default   # 一般工作
permissionMode: plan      # 只能 Read,不能執行修改
permissionMode: auto      # 自動授權(慎用,僅在受信任的 subagent)
```

**Plan mode** 適合 explorer / reviewer。

---

## 完整範本(對應 PhyCool Phase 3 拆分)

### orchestrator-pm.md

```yaml
---
name: orchestrator-pm
description: |
  Use when the user describes a new feature, story, or non-trivial bug, BEFORE
  any implementation begins. This agent reads the request, performs SDD spec
  drafting per BMAD v6 methodology, asks clarifying questions, and produces
  docs/stories/ spec files. Triggers: "新功能"、"新 story"、"幫我規劃"、
  "先寫 spec"、any user prompt that lacks a clear implementation target.
tools: Read, Glob, Grep, Write, Edit
model: opus
effort: xhigh
permissionMode: default
skills:
  - story-spec-author
  - bmad-v6-conventions
maxTurns: 50
color: blue
---

You are PhyCool's Product Manager agent. (詳見 PHASE3 文件)
```

### explorer.md

```yaml
---
name: explorer
description: |
  Use for codebase-wide search, dependency discovery, or "where is X
  implemented" questions. Read-only. Returns concise findings with file:line
  references. Triggers: "find"、"search"、"where is"、"哪裡實作"、
  "依賴"、"who calls"、any exploration without intent to modify.
tools: Read, Glob, Grep, mcp__phycool-context
model: haiku
effort: medium
permissionMode: plan
maxTurns: 10
color: gray
---

You are PhyCool's Codebase Explorer. (詳見 PHASE3 文件)
```

---

## subagent 之間能溝通嗎?

**Subagent**:不能。Parent dispatches → child runs → 摘要回 parent。**沒有 lateral 溝通**。

**Agent Teams**(實驗性,需 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`):隊員之間可直接訊息傳遞。但 token cost **15x**,謹慎使用。

---

## 行數預算

| 部位 | 軟上限 | 硬上限 |
|---|---|---|
| Subagent system prompt(SKILL.md body) | 150 行 | 300 行 |

超過要拆 references/。**Subagent 不繼承 skills**,所以 references 必須在 frontmatter `skills:` 列出對應 skill。

---

## 健檢清單

新建 subagent:

- [ ] `name` 無大寫底線、不含 `claude`
- [ ] `description` 第三人稱、含 trigger phrases
- [ ] `tools` 限制白名單(若不需全工具)
- [ ] `model` 與 `effort` 對應角色複雜度(別所有都 opus)
- [ ] `skills:` 列出所有需要的 skill(不繼承 parent)
- [ ] `maxTurns` 設上限
- [ ] `permissionMode: plan` 若是唯讀
- [ ] 考慮過 `isolation: worktree` 若是並行修改

---

## 成本警示(PhyCool 具體影響)

依摘要,PhyCool Phase 3 規劃 5 個 subagent。**最壞情況**(全平行,全用 opus):
- 5 個 isolated context × 平均 60K tokens × xhigh effort
- 估**每次 user request 消耗 300-500K tokens**

**緩解**:
- explorer 用 haiku(省 5x)
- 不該所有都 spawn,user 明確只改 typo 時直接讓 main agent 處理
- 設 maxTurns 避免無限消耗