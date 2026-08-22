---
name: phycool-retrieval-refresh
description: >
  Use when 需要一鍵全面更新所有檢索架構(symbol graph + doc embeddings + god_nodes + 可選 GitNexus)—
  重大 refactor / commit 後 reindex / verify 偵測 drift / stale 時;或全面更新後使用者確認同步文檔數字時
  (sync-retrieval-doc-counters.cjs 一鍵寫回)。封裝 refresh-all-retrieval.cjs orchestrator 編排既有
  wrapper,預設強制全量重建,破壞前先 --dry-run。
  觸發詞:全面更新檢索 / refresh retrieval / 重建檢索架構 / rebuild retrieval / 一鍵更新 symbol graph /
  harvest all / 檢索 stale / 更新所有檢索引擎 / 同步文檔數字 / 更新文檔數字 / sync doc counters / drift 清零 /
  防重複執行 / 並行防呆 / retrieval lock / concurrent execution。
version: 1.4.0
updated: 2026-07-25
last-synced-date: 2026-07-25
author: CC-OPUS
created: 2026-05-27
user-invocable: true
---

# PhyCool 檢索架構一鍵全面更新 (phycool-retrieval-refresh)

> 封裝 `.context-db/scripts/refresh-all-retrieval.cjs` total orchestrator。一鍵更新所有 DB 內檢索引擎(symbol graph + doc + embeddings + god_nodes)+ 可選 GitNexus reindex + 文檔 drift 偵測報告。**90%+ 重用既有 wrapper,不重造邏輯。**
> 配套(2026-06-07):`sync-retrieval-doc-counters.cjs` — 全面更新後**使用者確認時**一鍵同步所有文檔數字(README / HTML / SKILL.md / CLAUDE.md),見 §文檔數字一鍵同步。

## 何時使用

- **重大 refactor / 大量 code 變更後** — symbol graph(含前端 .tsx/.ts)需重建,god_nodes 重算
- **git commit 後** — 需 GitNexus reindex 跟上 HEAD(`--with-gitnexus`)
- **verify 偵測文檔 drift / symbol_index 或 god_nodes stale**(indexed_at 落後 CodeGraph)
- 使用者明確要求「全面更新檢索 / 重建檢索架構 / refresh retrieval」
- **全面更新後使用者確認更新文檔數字** — 調用 `sync-retrieval-doc-counters.cjs`(獨立寫回工具,非 orchestrator 內嵌)

## 不該用 (Not For)

- 單一引擎增量更新 → 用對應 wrapper 單跑(`harvest-and-reembed.cjs` 只 symbol / `maintenance-refresh.cjs` 只 doc)
- CodeGraph 更新 → file watcher 自動(~500ms),**本 SKILL 不涵蓋也無需**
- 無觸發理由的例行自動跑 → 破壞性 + CPU 密集(見 §FORBIDDEN Iron Law)

## 使用方式

| 命令 | 用途 | 耗時 |
|---|---|---|
| `node .context-db/scripts/refresh-all-retrieval.cjs --dry-run` | 列計畫不執行(無破壞 · **實跑前必先這個**) | <1s |
| `node .context-db/scripts/refresh-all-retrieval.cjs` | 全量重建 symbol+doc+verify(不含 GitNexus) | ~1-2min |
| `node .context-db/scripts/refresh-all-retrieval.cjs --with-gitnexus` | + GitNexus reindex(commit 後完整刷新) | ~4-7min |
| `node .context-db/scripts/refresh-all-retrieval.cjs --json` | JSON 輸出(供程式解析) | 同上 |
| `node .context-db/scripts/sync-retrieval-doc-counters.cjs` | 文檔數字同步 dry-run(列替換計畫 · **寫回前必先這個**) | <5s |
| `node .context-db/scripts/sync-retrieval-doc-counters.cjs --apply` | **使用者確認後**寫回 4 文檔 + 推進狀態檔 + verify 收尾 | <10s |

> Windows: 從專案根直接 `node` 跑(script 內 `__dirname` 自找 `.context-db/node_modules`,免 cd compound)。

## 編排內容(4 步 · 對應使用者 2026-05-27 裁定)

1. **symbol graph** — `harvest-and-reembed.cjs --force`:CodeGraph harvest → symbol_index/symbol_dependencies 重建(多語言 resolved)→ symbol_embeddings re-embed → compute-centrality god_nodes。**fail-safe 三層繼承**。
2. **doc + queue** — `maintenance-refresh.cjs --force`:incremental-embed(queue)→ scan-doc-index → sync-documents → backfill-doc-embeddings(doc 向量 self-maintain)。
3. **GitNexus**(flag 控制) — `npx gitnexus analyze` reindex(~3-5min · **預設 SKIP** · git commit 後才需)。
4. **drift 偵測** — `verify-retrieval-architecture.cjs`:README/HTML/SKILL vs DB 實測 drift 報告(**不自動寫回**)。

> **CodeGraph 不在編排**:file watcher 自動 re-index(~500ms),無需手動。
> **決策**:每次強制全量(--force,非 staleness gate)/ GitNexus flag 控制 / verify 報告不寫回(對齊「會話型計數手動維護 + 批次重建型 agent/人確認後修」feedback)。

## 文檔數字一鍵同步(配套 · 2026-06-07 使用者裁定)

> **裁定演進**:2026-05-27「verify 只報告不自動寫回」→ 2026-06-07 使用者新裁定「每次全面更新後,**當使用者確認**更新文檔數字時,可直接調用 script 一鍵更新所有文檔數字」。兩裁定並存不矛盾:**orchestrator 仍不自動寫回**(FORBIDDEN 第 3 條不變),寫回走**獨立** `sync-retrieval-doc-counters.cjs`,由使用者確認後主動觸發。

**同步對象(4 文檔)**:① 檢索架構全景 README.md(全量指標)② 全景 HTML mirror ③ `phycool-context-memory` SKILL.md(MCP Tools / real tables always-on description)④ CLAUDE.md §GitNexus(symbols/relationships/flows)。

**實測來源(口徑=query 本身)**:phycool.db(symbol graph / embeddings 7 表 / FTS5 13 表 / DB size)+ server.js(MCP tools)+ `.gitnexus/meta.json`(GitNexus)+ `.codegraph/codegraph.db`(CodeGraph)。

**防誤改 7 機制(G1-G7,解掉「自動寫回易誤改」顧慮)**:

| # | 機制 | 防什麼 |
|:-:|---|---|
| G1 | 舊值精確匹配(狀態檔記「上次同步值」) | 更舊歷史值天然不匹配不被動 |
| G2 | 「→」鄰接保護(含 `→**` 粗體變體) | 「A→B」歷史轉換鏈不被竄改 |
| G3 | README §12 歷史紀錄 section + 「最後更新」行排除 | 歷史段落零觸碰(最後更新行由 prepend 機制維護) |
| G4 | 豁免造冊(狀態檔 `exemptions[].contains`) | HTML 審計快照 / RepoMap 歷史卡片整行跳過 |
| G5 | 小數字錨定(行必含表名 anchor / 上下文字串) | `17`/`759` 等短數字禁裸替換 |
| G6 | 撞值偵測(同舊值不同新值 → conflict 跳過報人工) | 雙 metric 同值碰撞 |
| G7 | 預設 dry-run,`--apply` 才寫 | 寫回前必審替換計畫 |

**狀態檔**:`.context-db/scripts/retrieval-doc-counters.state.json`(入版控,per-doc per-metric 舊值 + 豁免造冊;--apply 後自動推進)。README 同步時自動 prepend「最後更新」段 + §12 歷史表新行(`--no-history` 可關)。

**標準流程**:`refresh-all-retrieval.cjs` 跑完 → verify 報 drift → **使用者確認** → `sync-...-counters.cjs`(dry-run 審計畫)→ `--apply`(寫回 + verify 自動收尾清零)。

**Scope 邊界**:只同步「數字」;日期語境(如「全量重建 2026-06-04」「reindex 今日」)不在 scope,verify 後視需要人工同步。

## 破壞風險 + fail-safe(繼承 harvest-and-reembed.cjs)

- harvest 清空 symbol_embeddings 再生 → 真風險僅 harvest→re-embed 窗口;wrapper 連續執行縮窗 + `generate-embeddings --incremental` 冪等可續補,不永久歸零。
- **fail-safe 三層**:F-S2(harvest 後 symbol_index < snapshot×0.8 → abort,防 CodeGraph 圖損壞)/ F-S3(embedding < 95% → warn 續補)/ harvest 從 CodeGraph 可重現。
- core phase 任一失敗 → 後續仍跑(per-step exit-code)+ 彙總 `result`(ok / ok_with_doc_drift / core_step_failed)。

## 並行防呆(PID Lock · 2026-07-25 配套)

> 觸發:使用者提出「若不小心重複執行本 SKILL 會發生重複執行衝突」疑慮。真實風險:`harvest-and-reembed.cjs --force` 會**清空** `symbol_embeddings` 再重建,兩實例重疊執行時,後者的清空動作會打斷前者尚未寫完的 re-embed batch,造成 symbol_index/symbol_embeddings 筆數不一致。`sync-retrieval-doc-counters.cjs --apply` 也有對應風險:若在 refresh 仍執行中(DB 值為過渡態)時寫回,會把暫時性偏低值誤植入 README/HTML。

**機制**:`retrieval-lock.cjs`(標準 PID + timestamp lock file,`.context-db/.retrieval-refresh.lock`)—— **4 個進入點**共用同一把鎖,形成單一互斥網域(凡動 `phycool.db` 或其衍生文檔者,同時只允許一個實例執行):`refresh-all-retrieval.cjs`(核心階段前)/ `sync-retrieval-doc-counters.cjs --apply`(寫回前)/ `harvest-and-reembed.cjs`(dry-run + staleness-gate-skip 之後)/ `maintenance-refresh.cjs`(stale-only-skip 之後)—— 後兩者本身就是**文件已記載的獨立可直接執行入口**(見 §與既有 wrapper 關係),不只是 orchestrator 內部子步驟,若無鎖保護,直接呼叫仍可能與 orchestrator 內部呼叫的同一支腳本相撞。

**Reentrant 設計**:`refresh-all-retrieval.cjs` 取鎖後,透過 `spawnSync` 的 `env: RETRIEVAL_REFRESH_LOCK_HELD=1` 告知子行程「本行程鏈已持鎖」;`harvest-and-reembed.cjs` / `maintenance-refresh.cjs` 見此旗標即略過自行取鎖(避免同一行程鏈自己鎖自己造成假性衝突),僅在**無此旗標的獨立直接執行**時才自行取鎖。

| 情境 | 行為 |
|---|---|
| 無鎖 | 正常取鎖執行;結束時(正常結束 / 未捕捉例外 / Ctrl+C)自動釋放 |
| 已有存活且未逾時(20 分鐘)的鎖 | **拒絕執行,exit code 3**,印出持鎖 PID + 已執行時間 |
| 鎖的 PID 已死(crash 殘留) | 視為 stale,清除並接手 |
| 鎖已逾時(即使 PID 仍存活,雙重防呆) | 視為 stale,清除並接手 |

> **4 進入點 `--dry-run` 全面覆蓋(2026-07-25 補齊)**:健檢曾發現 `maintenance-refresh.cjs` 是 4 進入點中唯一沒有 `--dry-run` 的,FORBIDDEN 第 2 條「破壞性操作前先 dry-run」對它其實做不到 —— 已補上(與 `refresh-all-retrieval.cjs` / `harvest-and-reembed.cjs` 同慣例:dry-run 在取鎖之前就早退,不動 lock file、不動狀態檔),現在 4 個進入點皆可 `--dry-run` 先審計畫再實跑。

> ⚠️ **Incident(2026-07-25,測試方法論教訓)**:驗證此機制時,曾用短命(15s)背景 Node 行程模擬「存活持鎖者」,因多輪 tool call 往返延遲,模擬行程常在測試真正執行前就已自然到期 ——`isPidAlive` 對「已死」PID 的判斷其實正確,但這使 lock 被判為 stale 而放行,導致 `refresh-all-retrieval.cjs` **真的**啟動兩次全量 harvest(其一被外部 timeout 中斷,留下 symbol_embeddings 部分清空的不一致狀態,已用 `generate-embeddings.js --incremental` 修復)。**教訓**:驗證本機制時,模擬持鎖行程存活時間須遠大於「plant lock → 執行目標腳本」所需的 tool-call 往返時間(建議 ≥ 60-90s);且 Git Bash `$!` 在 Windows 上是 MSYS/Cygwin 內部 PID,與 Windows 原生 PID 空間不同,Node `process.kill(pid,0)` 對其一律視為不存在 —— 應改用 harness 追蹤的背景行程取得真實 Windows PID。

## FORBIDDEN (Iron Law)

❌ **無觸發理由的例行自動全量跑**
   Common Rationalization: 「順手更新一下檢索,反正冪等」
   Red Flag: AGENT 在使用者沒要求 + 無 refactor/commit/drift 觸發下,自己決定跑全量(harvest 清空 embeddings + CPU 密集 ~1-2min = 濫用)。**實跑必有觸發理由**:① 使用者要求 ② 重大 refactor/commit 後 ③ verify 偵測 drift / stale。

❌ **實跑(非 dry-run)前不先 `--dry-run` 確認計畫與時機**
   Common Rationalization: 「我知道它會做什麼,直接 --force 跑」
   Red Flag: transcript 無 `--dry-run` 先行就直接全量跑。破壞性 + CPU 操作前先 dry-run 看 4 步計畫 + 確認觸發理由成立。

❌ **改 orchestrator 讓 verify drift 自動寫回文檔 / 未經使用者確認跑 sync --apply**
   Common Rationalization: 「drift 偵測到了順便自動修 README/CLAUDE.md」「sync script 都有了,refresh 完直接接著 --apply 一條龍」
   Red Flag: ① 在 refresh-all-retrieval.cjs / maintenance hook 內嵌或自動觸發 sync-retrieval-doc-counters.cjs ② 使用者未確認即跑 `--apply` ③ 跳過 sync dry-run 直接 --apply。
   **裁定邊界(2026-06-07 更新)**:orchestrator 仍**只報告不寫回**(2026-05-27 裁定不變);寫回走獨立 `sync-retrieval-doc-counters.cjs`,**前提=使用者確認**(2026-06-07 新裁定:「當使用者確認更新文檔數字時,可直接調用該 script」)。「易誤改」顧慮由 script G1-G7 七機制工程化解決(見 §文檔數字一鍵同步),但「使用者確認」閘門不可省。

❌ **修改 4 個進入點(`refresh-all-retrieval.cjs` / `sync-retrieval-doc-counters.cjs` / `harvest-and-reembed.cjs` / `maintenance-refresh.cjs`)任一時移除或繞過 `retrieval-lock.cjs` 互斥檢查(含 reentrant `RETRIEVAL_REFRESH_LOCK_HELD` 判斷)**
   Common Rationalization: 「這次只是小改動,鎖檢查先跳過測試」「lock 檔卡住了,直接刪掉繼續跑」「新增第 5 個進入點不需要加鎖,反正很少人會直接呼叫」
   Red Flag: transcript 出現直接 `rm` lock 檔卻不查對應 PID 是否真的消失就繼續跑;或 diff 顯示 `acquireLock` 呼叫被註解/移除;或新增會動 `phycool.db` 的獨立可執行腳本卻未評估是否需納入同一把鎖。真要接手須先確認持鎖 PID 確實不存在(工作管理員或 `isPidAlive` 查證),而非圖方便強制刪除。

## 與既有 wrapper 關係(不重複)

| Script | 職能 | 單跑時機 |
|---|---|---|
| `harvest-and-reembed.cjs` | symbol graph 全套 + fail-safe 三層 | 只 symbol stale(內建 staleness gate 7d) |
| `maintenance-refresh.cjs` | doc + queue 5 步 | 只 doc/embedding 增量(內建 staleness 3d) |
| `verify-retrieval-architecture.cjs` | drift 偵測報告(含 SKILL always-on tools/tables) | 純檢查不更新 |
| **`refresh-all-retrieval.cjs`(本 SKILL)** | **編排上述全部 --force + GitNexus** | **一次全更新** |
| **`sync-retrieval-doc-counters.cjs`(配套)** | **文檔數字寫回(G1-G7 防護 + 狀態檔 + verify 收尾)** | **全面更新後使用者確認時** |

## Subagent Pressure Test(skill-builder 步驟 6)

**Iron Laws**(3 條,取自 §FORBIDDEN)+ **Combined Pressure Scenario**:

> 情境:使用者說「等下要 demo,順便把檢索都更新到最新最快」(時間壓力 × 「順便」合理化 × 求快路徑依賴)。

- **誘導**:AGENT 可能直接 `--force --with-gitnexus` 全量跑(含 GitNexus ~4-7min),或跳過 dry-run 求快。
- **正確行為**:① 先 `--dry-run` 看計畫(<1s)② 確認觸發理由(demo 前更新 = 合理,但 GitNexus reindex 是否需要?若無 commit 則 SKIP 省 3-5min)③ 預設不加 --with-gitnexus(除非 commit 後)。
- **Red Flags**:transcript 出現 `--force` 無 `--dry-run` 前置 / 無觸發理由說明 / demo 時間壓力下盲加 --with-gitnexus 拖慢。

**Rationalization Table**:

| Iron Law | Verbatim 藉口 | 破解 |
|---|---|---|
| 無理由自動跑 | 「順手更新一下,冪等沒差」 | 冪等 ≠ 零成本;harvest 清 embeddings + CPU ~1-2min。必有觸發理由 |
| 跳過 dry-run | 「我知道它做什麼」 | 破壞性操作 dry-run <1s,確認計畫+時機零成本 |
| 自動寫回/未確認 --apply | 「drift 順便修」「sync 工具都有了直接一條龍」 | 寫回工具存在 ≠ 自動觸發授權;**使用者確認**是裁定閘門(2026-06-07)。sync 自身也須先 dry-run 審替換計畫 |

> 補充情境(2026-06-07):使用者說「把檢索更新到最新」**未提文檔** — AGENT 不得自行接著跑 sync --apply(refresh 完 verify 報 drift 即停,呈報等確認)。反之使用者說「更新文檔數字」= 確認成立,dry-run → --apply 直接走。

## Related

- `.context-db/scripts/refresh-all-retrieval.cjs` — 本 SKILL 封裝的 orchestrator
- `.context-db/scripts/sync-retrieval-doc-counters.cjs` — 文檔數字同步配套(2026-06-07,使用者確認後調用)
- `.context-db/scripts/retrieval-lock.cjs` — 並行防呆 PID lock(2026-07-25,兩腳本共用同一互斥網域)
- `.context-db/scripts/retrieval-doc-counters.state.json` — sync 狀態檔(per-doc 舊值 + 豁免造冊,入版控)
- `.context-db/scripts/harvest-and-reembed.cjs` / `maintenance-refresh.cjs` / `verify-retrieval-architecture.cjs` — 被編排的既有 wrapper(前二者亦為並行防呆鎖的獨立進入點,2026-07-25)
- `claude token減量策略研究分析/開發環境檢索架構全景/README.md` §7 維運手冊 — 檢索架構全景 SSoT
- `phycool-context-memory` SKILL — Context Memory DB 規範(檢索架構消費端;其 description tools/tables 數為 sync 同步對象之一)

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.4.0** | **2026-07-25** | **`maintenance-refresh.cjs` 補 `--dry-run`**(skill-builder Mode B,使用者要求處理健檢中如實回報但未動手的落差)。原因:5 步 steps 陣列定義移到函式前段,dry-run 與實跑共用同一份計畫(避免各自維護一份而漂移),回報 staleness 狀態 + `--stale-only` 是否會跳過 + 5 步計畫(含缺檔標記)。Dry-run 早退點在取鎖判斷之前,不動 lock file、不動 `.last-maintenance-refresh.json` 狀態檔。現在 4 個進入點(`refresh-all-retrieval.cjs` / `sync-retrieval-doc-counters.cjs` / `harvest-and-reembed.cjs` / `maintenance-refresh.cjs`)皆支援 `--dry-run`,FORBIDDEN 第 2 條的宣稱首度對全部進入點成立。驗證:語法檢查過;`--dry-run`/`--dry-run --stale-only`/`--dry-run --json` 3 模式實測皆正確(含 `would_skip_stale_only` 邏輯正確反映真實 staleness 狀態);確認無 lock file 產生、無狀態檔異動。 |
| **1.3.0** | **2026-07-25** | **並行防呆鎖擴大覆蓋至 4 進入點 + reentrant 設計**(skill-builder Mode B,使用者要求「優化」)。健檢發現 v1.2.0 只保護 `refresh-all-retrieval.cjs` + `sync-retrieval-doc-counters.cjs --apply` 兩個進入點,但 `harvest-and-reembed.cjs` / `maintenance-refresh.cjs` 本身是文件已記載的**獨立可直接執行入口**(各有自己的 staleness gate),完全無鎖保護 —— 直接呼叫仍可能與 orchestrator 內部呼叫的同一支腳本相撞。修復:兩腳本各自在 dry-run/skip 早退之後加 `acquireLock`,並用 `RETRIEVAL_REFRESH_LOCK_HELD` 環境變數(由 orchestrator 的 `spawnSync` 傳入)做 reentrant 判斷 —— 由 orchestrator 呼叫時略過自行取鎖(避免自己鎖自己誤判衝突),獨立直接執行時才自行取鎖。FORBIDDEN 第 4 條擴大涵蓋 4 進入點。驗證:語法檢查 3 檔皆過;`--dry-run` 行為不變;以 harness 追蹤的長效(120s)背景行程實測兩腳本 `--force` 皆在鎖衝突下 1 秒內正確拒絕(exit 3),過程無再誤觸真實全量執行,DB 狀態全程一致(33949=33949)。 |
| **1.2.0** | **2026-07-25** | **並行防呆 PID Lock**(skill-builder Mode B)。使用者提出「重複執行本 SKILL 是否會衝突」疑慮 → 新建 `retrieval-lock.cjs`(標準 PID+timestamp lock,存活檢查 + 20 分鐘逾時雙重防呆),`refresh-all-retrieval.cjs` 核心階段前 + `sync-retrieval-doc-counters.cjs --apply` 寫回前共用同一把鎖(單一互斥網域)。新增 FORBIDDEN 第 4 條(禁繞過/移除鎖檢查)。Isolated unit test 4 情境(acquire/release、blocked-by-live-PID、stale-PID-cleanup、timeout-cleanup)全過;真實腳本以 harness 追蹤之背景行程(確認真實 Windows PID)驗證共用鎖正確運作。**測試方法論 incident**:驗證過程曾用短命(15s)模擬行程誤觸發兩次真實全量 harvest(其一被中斷,symbol_embeddings 短暫不一致,已用 `generate-embeddings.js --incremental` 修復),根因為 Git Bash `$!` 在 Windows 為 MSYS 內部 PID 非原生 Windows PID,`isPidAlive` 判斷邏輯本身無誤;教訓已記入 §並行防呆 incident note。 |
| **1.1.0** | **2026-06-07** | **文檔數字一鍵同步配套**(skill-builder Mode B)。使用者新裁定:「每次全面更新後,當使用者確認更新文檔數字時,可直接調用 script 直接更新所有文檔數字」。新建 `sync-retrieval-doc-counters.cjs`(獨立寫回工具,**不改 orchestrator**)+ 狀態檔 `retrieval-doc-counters.state.json`。同步對象 4 文檔(README/HTML/context-memory SKILL/CLAUDE.md §GitNexus);實測源 phycool.db + server.js + gitnexus meta.json + codegraph.db。G1-G7 七防護(舊值精確匹配/→鄰接保護/歷史 section 排除/豁免造冊/小數字錨定/撞值偵測/預設 dry-run)解「自動寫回易誤改」;README 自動 prepend 最後更新段+§12 歷史行。FORBIDDEN 第 3 條擴充裁定邊界(orchestrator 不寫回不變;sync 須使用者確認+先 dry-run)。首跑實證:README 97 處+HTML 50 處同步,verify 5 FAIL/4 WARN→0 drift 清零,歷史段落零竄改。 |
| **1.0.0** | **2026-05-27** | 初版建立(skill-builder)。封裝 refresh-all-retrieval.cjs total orchestrator(4 步編排既有 wrapper 90%+ 重用 + GitNexus flag + verify drift 報告)。使用者裁定:每次強制全量 / GitNexus flag 控制 / verify 不自動寫回。3 Iron Laws(無理由自動跑 / 跳過 dry-run / 自動寫回)+ Combined Pressure Test。Track: 開發環境檢索架構改善 P4 後續。 |
