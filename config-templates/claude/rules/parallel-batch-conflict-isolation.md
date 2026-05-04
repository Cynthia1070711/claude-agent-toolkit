# Parallel Batch Conflict Isolation — 並行批次衝突隔離 (SUPREME)

> **嚴重等級**: SUPREME(等同 Constitutional Standard / dual-repo-push-discipline / skill-tool-invocation-mandatory)
> **建立**: 2026-05-04 (party-to-pipeline v5.0.0 T4 系列)
> **觸發背景**: User ultrathink 補充「中控規劃制定批次排程時,同一批可併行的任務 story,必須分析各自任務不相關聯,不會修改到各自相關文檔才能規畫在同一批,避免 story-A 子視窗修改 B 檔案,story-B 子視窗也修改 B 檔案的衝突狀況,導致 commit 異常」
> **對齊**: `pipeline-handshake-protocol.md` (IPC schema) + `dual-repo-push-discipline.md` (cwd 識別) + `constitutional-standard.md` (Code Verification)

---

## 1. Purpose

當 party-to-pipeline 中控以 multi-Story 批次模式 (`-StoryIds A,B,C,D`) dispatch 多個 Story 並行執行時,**必須先做檔案衝突分析**,**禁止**任二 Story 同批時修改重疊的檔案集合。違反 → git status 混雜 / 後寫覆蓋前寫 / commit 時 staged file 撕裂 / SKILL.md 三引擎漂移 / sprint-status.yaml YAML 結構壞。

本 rule 規範**機械層強制執行**: orchestrator dispatch 前必跑 `Schedule-Batches` 計算 conflict matrix,衝突 Story 自動推到 sequential phase,絕禁 user 手動繞過。

---

## 2. Applies When

任何以下動作前必檢查:

- `orchestrator.ps1 -StoryIds A,B,C` (multi-Story 模式)
- `orchestrator.ps1 -StoryId X` (single-Story,**仍受本 rule 影響** — 若 X 涉 SUPREME files,需確認此 session 無其他並行 worker)
- 未來 parallel spawn 啟用後 (`td-pipeline-multi-story-parallel-spawn`)
- 任何 batch script / CI / 自動化跑多 Story 的場景

---

## 3. 7 種衝突源 (Critical Threat Surface)

| # | 衝突源 | 後果 | 嚴重度 |
|:-:|:---|:---|:---:|
| 1 | 同檔不同 worker 寫 (e.g., src/X.cs) | git status 混雜 / 後寫覆蓋 | 🔴 致命 |
| 2 | `sprint-status.yaml` 多 Story 同寫 | YAML 結構壞 / merge conflict | 🔴 致命 |
| 3 | 同 Skill SKILL.md (skill-sync-gate 雙觸發) | 三引擎 md5 漂移 + Skill SSoT 壞 | 🔴 致命 |
| 4 | 同 ADR / SUPREME rule .md | governance 文檔不一致 | 🔴 致命 |
| 5 | `.git/index.lock` 兩 worker 同 git add | git operation throw | 🟠 高 |
| 6 | EF Core Migrations 鏈 兩 Story 同建 | 編號衝突 / DB schema 撕裂 | 🔴 致命 |
| 7 | `obj/` build artifact 兩 worker 同 dotnet build | build 失敗或污染 | 🟡 中 |

---

## 4. 5 軸 Conflict Severity Matrix (SSoT)

兩兩 Story 計算 `expected_file_set` intersect,5 等級分類:

| 等級 | 命中模式 (`shared-utils.ps1 $Script:HardBlockFilePatterns`) | 排程決策 |
|:---:|:---|:---|
| **HARD_BLOCK** | `sprint-status.yaml` / `CLAUDE.md` / `MEMORY.md` / `.claude/rules/*.md` / `.claude/skills/*/SKILL.md` (skill-sync-gate 重疊) / `Migrations/` / `init-db.js` / `ADR-*.md` / `.context-db/phycool.db` / `.mcp.json` / `pipeline-config.json` / `settings.json` | **絕禁同批**,強制 sequential |
| **SOFT_BLOCK** | `src/**/*.cs` / `src/**/*.tsx` / `Services/` / `Controllers/` 任意檔交集 | **禁同批**,sequential |
| **WARN_REVIEW** | `src/types/**/*.ts` / `Constants.cs` / `Enums/` 等共用型別 | 標記後允許,需 Skill audit |
| **READ_SHARED** | `*.csproj` / `package.json` / `package-lock.json` (僅讀) | 允許並行 |
| **DISJOINT** | 完全 0 交集 | ✅ 可並行 |

> **未來新增 hot file → 必加入 `$Script:HardBlockFilePatterns` SSoT 同時更新本表**(skill-idd-sync-gate 同步要求)。

---

## 5. `expected_file_set` 5 來源 Union

每 Story 的預期影響檔案集合,由 5 來源 union 計算 (`Get-ExpectedFileSet` in shared-utils.ps1):

```
expected_file_set = {
  ∪ stories.file_list           (DB 欄位,enriched 後存在)
  ∪ stories.implementation_approach grep file:line paths
  ∪ stories.tasks grep "Edit X" / "Create Y" 路徑
  ∪ stories.required_skills 對應 Skill SKILL.md (三引擎 .claude/.gemini/.agent)
  ∪ shared write hot files (sprint-status.yaml + 對應 Epic ADR)
}
```

精度依 Story enrichment 階段:
- **未 enriched (status=backlog)**: 僅 5 (shared) + 部分 4 (skills) → 保守膨脹 conflict
- **已 enriched (status=ready-for-dev)**: 全 5 來源 → 較精準

---

## 6. 4-Layer Defense

### Layer 1: Pre-Flight Conflict Matrix (orchestrator dispatch 前)

```
1. Test-FileConflictMatrix -StoryIds (A,B,C,D)
   → 兩兩 intersect → 5 等級分類 (HARD/SOFT/WARN/READ/DISJOINT)
2. Schedule-Batches → greedy 拆 sequential phases
3. 列印「Batch 1: A,B,D / Batch 2: C」決策樹
```

### Layer 2: Greedy Batch Scheduler (拆 sequential)

`Schedule-Batches` greedy: 每 Batch 從 remaining 嘗試加入無 HARD_BLOCK 衝突 Story。Deadlock 時強制第一個 remaining 進新 Batch。

### Layer 3: Runtime Conflict Detection (執行中後備)

worker.ps1 結尾寫 tracker 加 `files_modified[]` (從 `git diff --name-only` 抓)。orchestrator runtime 可 poll 各 active worker tracker,intersect 任二有交集 → emergency pause + log。

### Layer 4: Git Operation Mutex (`.git/index.lock` 防護)

所有 git operation 走 `Invoke-GitOperation -Op { ... }`,使用 `[System.IO.File]::Open` `CreateNew` 模式建 lock file 確保互斥。或更激進: **worker 不做 git commit,中控統一 commit**(根本機制)。

---

## 7. FORBIDDEN(嚴重等級 SUPREME)

- ❌ **跳過 `Test-FileConflictMatrix`** 直接 multi-Story dispatch (orchestrator 機械層阻擋)
- ❌ **將 HARD_BLOCK 兩 Story 強制塞同 batch** (Schedule-Batches 不允許)
- ❌ **新增 hot file 不更新 `$Script:HardBlockFilePatterns` SSoT** (drift → 未來再犯)
- ❌ **worker.ps1 結尾不寫 `files_modified[]`** 至 tracker (Layer 3 後備失效)
- ❌ **跳過 `Invoke-GitOperation` mutex** 直接 git add / commit (race 風險)
- ❌ **「sequential 跑就不會衝突」合理化跳過 conflict matrix** (使用者意識仍需,且未來 parallel spawn 必走)
- ❌ **同 `story_id` 跨 worker upsert** Memory DB (Layer 3 hot-row 偵測,T5.7 補強)

---

## 8. Mandatory Pre-Flight Flow

```
中控 orchestrator.ps1 -StoryIds A,B,C,D
  ↓
Step 1: Validate all stories exist in DB (Get-StoryFromDb × N)
  ↓
Step 2: Test-FileConflictMatrix → 矩陣分析
  ↓
Step 3: Schedule-Batches → greedy 拆 batches
  ↓
Step 4: 列印 Conflict Matrix + Batch Decision Tree (使用者意識層)
  ↓
Step 5: Per-Story sequential dispatch (within batch + across batches)
  ↓ (each story)
  既有 single-Story flow (orchestrator self-recursive invoke)
    → 3 phases (create-story / dev-story / code-review)
    → ACK handshake (pipeline-handshake-protocol.md)
  ↓
Step 6: All batches done → Show-Summary
```

---

## 9. Self-Check (每次 multi-Story dispatch 前 5 題必自問)

1. **「我是否真的需要 multi-Story 模式?還是 sequential single-Story 更安全?」** (KISS)
2. **「`Test-FileConflictMatrix` 結果有任何 HARD_BLOCK 嗎?」** (有 → 確認 Schedule-Batches 已正確拆 batch)
3. **「Conflict matrix 列印的 conflict_files,我是否實際讀過 source Story 確認非誤判?」** (verification-protocol.md grep ≠ verification)
4. **「Batch 內若有 ≥ 2 Story,當前 v5.0.0 是 sequential 跑,使用者意識到嗎?」** (列印警告必到位)
5. **「未來啟用 parallel spawn (td-pipeline-multi-story-parallel-spawn) 時,Layer 3+4 是否已 ready?」** (前置條件)

---

## 10. Hook 機械守護

未來可建 `.claude/hooks/conflict-matrix-precheck.js` PreToolUse hook(advisory):
- 偵測 user 嘗試手動 `git add` 多檔當有 active worker tracker
- 對比 active workers' `files_modified[]` vs 即將 add 的 files
- 命中 → stderr 警告 + 提示 abort

---

## 11. Incident Records

- **2026-05-04 v5.0.0 (本 rule 觸發)**: User 提出 multi-Story 批次模式需檔案衝突隔離。觸發 T4 系列 8 項實作 (T4.1-T4.8) + 本 rule 建立。設計時參考既有 sprint-status.yaml / SKILL.md 多 Story 同寫的歷史風險 (epic-eft / epic-qgr CR Phase B 文檔同步衝突案例)。

---

## 12. Related

- `.claude/rules/pipeline-handshake-protocol.md` SUPREME — IPC schema 契約 (本 rule 補強並行衝突層)
- `.claude/rules/dual-repo-push-discipline.md` SUPREME — 雙倉庫推送紀律 (cwd 識別)
- `.claude/rules/skill-sync-gate.md` — Skill SSoT 同步 (Skill 共用衝突檢測)
- `.claude/rules/skill-idd-sync-gate.md` — IDD `forbidden_changes` 保護 (跨 Story 違反)
- `.claude/skills/party-to-pipeline/scripts/shared-utils.ps1` — `Get-ExpectedFileSet` / `Test-FileConflictMatrix` / `Schedule-Batches` / `Invoke-GitOperation` / `$Script:HardBlockFilePatterns` SSoT
- `memory/reference_party_orchestrator_v4.md` — v4.0.0 範式 (本 rule 為 v5.0.0 補強)

---

## 13. Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.0.0** | **2026-05-04** | 初版建立。觸發事件:User ultrathink 補充並行子視窗檔案衝突風險。對齊 party-to-pipeline v5.0.0 T4 系列 8 項實作 (T4.1-T4.8 in shared-utils.ps1 + orchestrator.ps1 + worker.ps1)。7 衝突源 + 5 軸 conflict matrix + 4-Layer Defense + 7 條 FORBIDDEN + Self-Check 5 題 + Mandatory 6 步 Pre-Flight Flow。 |
