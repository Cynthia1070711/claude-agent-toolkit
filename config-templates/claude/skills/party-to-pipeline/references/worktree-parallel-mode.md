# Worktree Parallel Mode — party-to-pipeline opt-in 並行隔離(v5.5.0 L3)

> **2026-06-10 建立**(第二輪 CEO 研究 v2.2.0 整合落地)。worktree 與 party-to-pipeline 整合的 **opt-in 能力規範**。
>
> **定位**:opt-in 互補(對齊 `ADR-AIOS-004` **W2**),**非全面並行 W3**(W3 已 CEO 否決)。實作就緒但 **opt-in 預設不啟用**(`dispatch -Worktree` switch 不帶則現行行為完全不變),正式全面啟用待解凍 gate。
>
> **完整研究 SSoT**:`docs/project-planning-artifacts/reference/開發中問題討論及分析報告/worktree-party-to-pipeline-integration-research-2026-06-09.md`(v2.2.0 · §12 整合章節)。本檔只放「× party-to-pipeline 整合」操作規範,**不重述 worktree 機制**(機制層由 [worktree-manager](../../worktree-manager/SKILL.md) skill CRUD + TRS-33 人類 SOP 覆蓋)。

---

## §1 定位:opt-in 互補(非全面架構)

| 維度 | 內容 |
|:--|:--|
| **ADR-AIOS-004 W2 裁定** | worktree = **opt-in 工具**(非常駐);使用者已裁「monorepo 全面 worktree 太複雜」,**W3 全面並行已否決** |
| **commit 異常常態解** | pathspec commit + baseline 差集 + 留言板序列化(現行 · 覆蓋日常多軌並行)— worktree **非日常必需** |
| **worktree 角色** | 「高衝突風險批次 / risky parallel refactor」的 **opt-in 物理加固**(`requires_worktree` flag) |
| **啟用範式** | `dispatch-general.ps1 -Worktree` switch **per-dispatch opt-in**(不帶 = 現行行為);全面預設啟用待解凍 gate(對齊 ADR-AIOS-004 ENV flag 預設 off 觀察期 >5% 才升) |

---

## §2 commit 異常三層解構(整合對象核心問題)

> 多軌多子視窗並行(N 平級中控 + 各自 worker 子視窗,共用主場單一 `.git/index`)的 commit 異常**不是單一問題,是三層**:

| 層 | 衝突源 | worktree 能解? | 解法 |
|:--|:--|:--:|:--|
| **L1 worker index race** | C1 同檔寫 / C2 index staging / **C3 commit 誤掃他軌 dirty**(2026-06-03 事故) | ✅ **物理根治**(每軌獨立 `.git/worktrees/<軌>/index`) | worktree 隔離 + get-shit-done manifest fail-closed(每軌只認自己登記的 worktree) |
| **L2 中控 merge race** | **C10 N 平級中控並行 merge 回主場** | ⚠️ **不直接解**(worktree 隔離 worker,**不隔離整合層中控**) | crystal **rebase-in-worktree + `--ff-only`** + coordinator **merge 序列化** + ECC `merge-tree --write-tree` 零副作用預測 |
| **L3 語意衝突** | C8/C9 兩軌真改同檔邏輯 | ❌ **永遠不解** | Conflict Matrix(`parallel-batch-conflict-isolation.md`)+ pipeline_notes 並行通告 + 任務切分 |

**核心洞察**(4 開源方案 get-shit-done/ECC/workmux/crystal 一致):worktree 物理根治 L1,但 **L2(N 平級中控並行 merge)無銀彈** — 所有方案都靠「序列化 + ff-only」迴避,無自動並行 merge。

---

## §3 main-pinned 鐵律(B1 · P0 致命邊界)

> **控制平面 main-pinned 絕對路徑 · 執行平面 worktree-local**。違反 = worker 在 worktree fresh checkout 找不到 gitignored stateful → MCP 崩。

| 平面 | 內容 | 落點 |
|:--|:--|:--|
| **控制平面(main-pinned)** | `.context-db` / IPC / tracker / log / 留言板 | 絕對路徑指主 repo,**絕不進 worktree** |
| **執行平面(worktree-local)** | tracked code | worker cwd = worktree |

**證據錨**:`.context-db/server.js:31-33` `DB_PATH=path.join(__dirname,'phycool.db')` + `import 'better-sqlite3'` → 相對路徑使 worker 在 worktree 內找不到 DB → MCP 崩。**B1 spike 已實證**(worktree cwd 經雙根 + 絕對路徑 + NODE_PATH main-pinned 連主 repo DB stories=1205 ✓ + git 物理隔離 ✓)。

---

## §4 dispatch -Worktree 用法 + worker 雙根(scripts 層 PoC 已落地)

```powershell
# opt-in 啟用 worktree(不帶 -Worktree 則現行行為完全不變)
dispatch-general.ps1 -TaskId X -PromptFile Y -Model opus-5 -Worktree
dispatch-general.ps1 -StoryId Z -Phase dev-story -Worktree   # BMAD 三階段亦支援
```

**雙根契約**(全向後相容 ENV-gated):

| 元件 | 機制 |
|:--|:--|
| `shared-utils.ps1` | `Get-ProjectRoot`(`PIPELINE_CONTROL_ROOT` 優先)+ `Get-WorkRoot`(`PIPELINE_WORK_ROOT`,fallback ProjectRoot) |
| `dispatch-general.ps1 -Worktree` | `git worktree add` + 雙根 env 注入(`PIPELINE_CONTROL_ROOT`=主 repo / `PIPELINE_WORK_ROOT`=worktree)+ 動態生成 `workers-mcp.json`(phycool-context `server.js` 絕對路徑解 B1)+ ② `baseline_commit` 寫 task json / pipeline_notes |
| `worker-{general,dev,create,review}.ps1` | `Get-WorkRoot` + `Set-Location WorkRoot`(執行平面)+ `WorkersMcpConfig` 用動態 config + DB/IPC/log/NODE_PATH 仍 main-pinned + 收尾 `Push-Location WorkRoot` |

**worktree 命名/清理復用既有** [worktree-manager](../../worktree-manager/SKILL.md):`git worktree add .claude/worktrees/<name> -b story/<name>`;`.claude/worktrees/` 已 gitignored(TRS-33)。

---

## §5 三情境衝突適配(研究 §6)

| 情境 | 適配 | 關鍵衝突 | 整合模型 |
|:--|:--:|:--|:--|
| **二 單軌中控 · 多 worktree** | ✅ **最佳適配** | C9 共享 code(conflict matrix 排不同批) | 單中控序列 merge(C10=0) |
| **一 雙軌中控 · 各帶 worktree** | ⚠️ 需加層 | **C10 雙中控 merge race**(worktree 隔離 worker 不隔離中控) | **M1** 輕量(中控主 working tree + pathspec + 錯峰,C10 緩解)/ **M2** 完整(track/front + track/back 軌道隔離,C10 根除) |
| **三 雙軌 × 各多 worktree** | ⚠️⚠️ 最複雜 | C10 + 跨軌 C8/C9/C11 | **M2 必須** + 最嚴跨軌 conflict matrix |

**漸進路線**:先情境二(單軌多 worktree)→ 情境一(雙軌各單 worktree 驗雙中控)→ 情境三(全開)。

---

## §6 強化優先序(CEO v2.2.0 結論)

> 若要強化多軌並行 commit 異常防護,優先序:

1. **L2「跨軌 merge 序列化 + `--ff-only` to main」**(crystal 範式 · 根治 C10 · 不需 worktree · 成本低)— **第一優先**
2. **L1 opt-in worktree**(高衝突批次物理隔離 · 對齊 ADR-AIOS-004 `requires_worktree`)
3. **L1 manifest fail-closed 加固**(get-shit-done 範式 · 即使不上 worktree 也能強化現行 baseline 差集)

---

## §7 既有資產復用(禁重造)

| 資產 | 角色 | 邊界 |
|:--|:--|:--|
| `worktree-manager` skill v1.1.1 | worktree CRUD(create/list/clean/diagnose) | 機制層,本檔不重述 |
| TRS-33(epic-trs · done) | 人類 worktree 並行 SOP(部署手冊 PART 8.5 + AGENTS.md §18.2/18.3) | 人類操作層 |
| ADR-AIOS-004(2026-05-08 Accepted) | Lock + Worktree W2 opt-in 互補決策 | 治理決策 SSoT |
| `parallel-batch-conflict-isolation.md` | 5 軸 Conflict Matrix(L3 語意衝突事前避免) | 衝突偵測層 |

---

## §8 FORBIDDEN

| # | 禁止 | 原因 |
|:-:|:--|:--|
| W1 | 控制平面(`.context-db`/IPC/tracker/log/留言板)進 worktree | B1 致命 — worker fresh checkout 找不到 stateful → MCP 崩 |
| W2 | 以「worktree 解語意衝突」為由跳過 conflict matrix / 任務切分 | L3 worktree 永不解,兩軌改同檔仍 merge 衝突 |
| W3 | 走全面 W3(預設啟用 worktree / Lock 退役) | 違 ADR-AIOS-004 W2 裁定 + 使用者「monorepo 全面太複雜」 |
| W4 | 雙軌(情境一/三)未上 M1/M2 即並行 merge 回主場 | C10 雙中控 merge race(2026-06-03 事故升級版) |
| W5 | 無解凍 gate(ECC + m0-4)即正式全面啟用(預設帶 -Worktree)| 違使用者暫緩裁示 + 跳過 S2 pilot 驗收 |

---

## §9 落地狀態 + 解凍 gate

| 階段 | 狀態 |
|:--|:--:|
| scripts 層 PoC(dispatch -Worktree + 4 worker 雙根 + 動態 mcp + ② baseline_commit) | ✅ 落地(向後相容 ENV-gated) |
| B1 spike(go/no-go gate) | ✅ GO(worktree cwd 連主 repo DB 1205 + git 隔離 + setup 10.5s) |
| **正式全面啟用 / 端到端 S2 pilot** | ⏸ **暫緩**(使用者 2026-06-09 裁示;解凍 gate = 後台軌 ECC + m0-4 定價 Phase D 告一段落) |
| **① startup-ack 中控偵測** | 🔻 降級「待 ROI 重估」(= 已知缺陷 D14;E2 主對話監看已覆蓋 + worker 互動模式人可見 → 機械 poll 非必需;BMAD CEO 裁決,worktree 定稿時重估,B signal file 為屆時首選範式但不預設做) |

**解凍時走** S2 pilot(情境二 2-3 worktree + 崩潰演練 + 故意共享檔衝突測試)→ S3 升版。

---

## §10 Related

- 研究報告 SSoT:`docs/.../worktree-party-to-pipeline-integration-research-2026-06-09.md`(v2.2.0)
- 交接主檔:`docs/tracking/active/worktree-party-to-pipeline-交接.md`
- `worktree-manager` skill — worktree CRUD 機制層
- `ADR-AIOS-004` — Lock + Worktree W2 opt-in 決策 SSoT
- `parallel-batch-conflict-isolation.md` — 5 軸 Conflict Matrix(L3 層)
- 開源範式:`claude token減量策略研究分析/工作流/`(get-shit-done / ECC / workmux / crystal / worktrees/learn-claude-code)
