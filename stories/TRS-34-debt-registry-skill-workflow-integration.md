# 🟢 Story TRS-34: Debt Registry Skill + Workflow 整合

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | trs-34-debt-registry-skill-workflow-integration |
| **Epic** | Epic TRS — Token 減量策略 (Token Reduction Strategy) |
| **優先級** | P0 |
| **類型** | Feature + Process Fix |
| **複雜度** | L (5-8 SP) |
| **狀態** | done |
| **DEV Agent** | CC-OPUS (Claude Opus 4.6) |
| **DEV 完成時間** | 2026-02-28 01:09 |
| **Review Agent** | CC-OPUS (Claude Opus 4.6) |
| **Review完成時間** | 2026-02-28 01:19 |
| **來源** | BA-9 CR 分析發現 retained 追蹤斷鏈 — Party Mode 共識決策 |
| **依賴** | 無 |
| **阻擋** | 所有後續 code-review / create-story / dev-story 的債務追蹤品質 |
| **建立日期** | 2026-02-28 |
| **Create Agent** | CC-OPUS |
| **Create完成時間** | 2026-02-28 00:33 |

---

## Story

As a **MyProject 開發團隊**,
I want **消除 CR "retained" 追蹤黑洞，建立技術債中央登錄與雙向追溯機制**,
so that **所有未修復的 CR issue 都有明確分類和追蹤，下游 Story 自動獲知前置技術債，Epic 結束前可執行完整盤點**.

---

## Background

### 問題根因

2026-02-28 分析 QGR-BA-9 時發現：CR 標記為「保留」的 L2 項目完全未進入任何追蹤管道。Tech Debt 表格空白、無側車文件、無 registry entry、下游 Story (BA-8) 不知道此問題存在。

Party Mode 討論確認這是 **系統性缺陷**：
- Epic QGR 已完成 20+ Story，每個平均 1-2 個 retained → 估計 20-40 個隱藏技術債
- Production Gate `tech-debt-limit` 計數不含 retained，形同虛設
- 業界標準（GitLab, DORA, Backstage）明確禁止 Silent Debt

### 已完成

- [x] `/example-debt-registry` Skill v1.0.0 已建立
- [x] `tech-debt/registry.yaml` 初始結構已建立（含 BA-9-L2）
- [x] `skills_list.md` + `CLAUDE.md` 索引已同步
- [x] `.agent-file-policy.yaml` 已新增 registry.yaml 為 exclusive_write
- [x] `multi-agent-parallel-execution-strategy.md` 已新增 §10
- [x] `docs/專案部屬必讀/` 部署文件已全數更新（Task 7 完成）

---

## Tasks / Subtasks

### Task 1: Workflow 整合 — code-review instructions.xml ✅

- [x] **1.1** Step 4 消除 "retained" 分類，新增強制三分類區塊 (FIXED / DEFERRED / WON'T FIX)
- [x] **1.2** 新增 `/example-debt-registry` Push mode 呼叫指令（Phase 2.5 registry.yaml push）
- [x] **1.3** 新增 Push Checklist 驗證步驟（Phase 6）

### Task 2: Workflow 整合 — create-story instructions.xml ✅

- [x] **2.1** Step 6 新增 Pull mode 自動掃描 `registry.yaml`
- [x] **2.2** 匹配 target_story → 注入 Dev Notes「前置技術債」區塊
- [x] **2.3** 自動加入對應修復 Task/Subtask

### Task 3: Workflow 整合 — dev-story instructions.xml ✅

- [x] **3.1** Step 1 新增 Pull mode 掃描（primary: registry, fallback: legacy sidecar）
- [x] **3.2** 顯示前置技術債摘要，提醒開發者

### Task 4: 回溯盤點 — Audit 模式首次執行 ✅

- [x] **4.1** 掃描所有 Epic QGR + FRA done Story 的 CR 報告（33+ 份）
- [x] **4.2** Grep "Retained" / "保留" 找出所有未追蹤項目
- [x] **4.3** 逐一分類為 DEFERRED 或 WON'T FIX（41 entries）
- [x] **4.4** 補登錄 registry.yaml（13 pending + 5 resolved + 23 wont_fix）
- [x] **4.5** DEFERRED 項目補建 sidecar `.debt.md`（8 個側車檔案）
- [x] **4.6** 更新源頭 Story Tech Debt 表格 + H1 emoji（源頭 Story 已 done，emoji 狀態正確）
- [x] **4.7** 驗證 — Audit 再跑一次確認 0 斷鏈（SK-7 + A10-1 斷鏈已補修）

### Task 5: Production Gate 修正 ✅

- [x] **5.1** code-review instructions.xml 的 `tech-debt-limit` gate 改為從 `registry.yaml` 計數（<= 15 pending）
- [x] **5.2** 新增 `zero-critical-debt` gate + Step 1/Step 5 改用 registry 計數

### Task 6: story-status-emoji 協作更新 ✅

- [x] **6.1** 更新 `/story-status-emoji` SKILL.md — 新增 registry 查詢方式（Primary: registry, Fallback: section）
- [x] **6.2** Mode A 步驟更新，含 registry 查詢為主要偵測方式

### Task 7: 部署文件與多 Agent 策略同步

- [x] **7.1** `.agent-file-policy.yaml` 新增 `registry.yaml` 為 `exclusive_write`
- [x] **7.2** `multi-agent-parallel-execution-strategy.md` 新增 §10（registry 與多 Agent 協作）
- [x] **7.3** `開發前環境部署_v3.0.0.md` 新增 §4.10 技術債中央登錄協議 + §9.7 檢查清單
- [x] **7.4** `開發前環境部署_v3.0.0.md` 更新 §4.6 Production Gate 改為 registry 驅動
- [x] **7.5** `開發前環境部署_v3.0.0.md` 更新 §4.7 側車模式配合 Debt Registry
- [x] **7.6** `worktree-quick-reference.md` 新增 registry.yaml merge 規則
- [x] **7.7** `docs/專案部屬必讀/README.md` 更新結構索引 + TRS 成果 + 版本歷史

---

## Required Skills

- `/example-debt-registry` — **PRIMARY**: 本 Story 的核心規範
- `/story-status-emoji` — 協作更新（emoji 偵測方式改為 registry 查詢）

---

## Dev Notes

### 檔案影響範圍

| 操作 | 檔案 | 說明 |
|------|------|------|
| 修改 | `_bmad/bmm/workflows/4-implementation/code-review/instructions.xml` | Step 4 三分類 + Push |
| 修改 | `_bmad/bmm/workflows/4-implementation/create-story/instructions.xml` | Step 1 Pull |
| 修改 | `_bmad/bmm/workflows/4-implementation/dev-story/instructions.xml` | Step 1 Pull |
| 已建立 | `.claude/skills/example-debt-registry/SKILL.md` | Skill 規範 |
| 已建立 | `docs/implementation-artifacts/tech-debt/registry.yaml` | 中央索引 |
| 修改 | `.claude/skills/story-status-emoji/SKILL.md` | registry 查詢協作 |
| 更新 | 所有 done Story 的 Tech Debt 表格 + H1 emoji | 回溯修復 (Task 4) |
| 已修改 | `.agent-file-policy.yaml` | registry.yaml exclusive_write (Task 7) |
| 已修改 | `docs/專案部屬必讀/multi-agent-parallel-execution-strategy.md` | §10 新增 (Task 7) |
| 已修改 | `docs/專案部屬必讀/開發前環境部署_v3.0.0.md` | §4.10 + §9.7 + 版本 3.2.0 (Task 7) |
| 已修改 | `docs/專案部屬必讀/worktree-quick-reference.md` | registry merge 規則 (Task 7) |
| 已修改 | `docs/專案部屬必讀/README.md` | 結構索引 + 版本 1.4.0 (Task 7) |

### 實際變更檔案清單

| 操作 | 檔案 | Task |
|------|------|------|
| 修改 | `_bmad/bmm/workflows/4-implementation/code-review/instructions.xml` | T1, T5 |
| 修改 | `_bmad/bmm/workflows/4-implementation/create-story/instructions.xml` | T2 |
| 修改 | `_bmad/bmm/workflows/4-implementation/dev-story/instructions.xml` | T3 |
| 修改 | `.claude/skills/story-status-emoji/SKILL.md` | T6 |
| 重寫 | `docs/implementation-artifacts/tech-debt/registry.yaml` | T4 (41 entries) |
| 新增 | `docs/implementation-artifacts/tech-debt/fra-1-refund-permission-downgrade.debt.md` | T4 |
| 新增 | `docs/implementation-artifacts/tech-debt/fra-2-pdf-page-limit-config.debt.md` | T4 |
| 新增 | `docs/implementation-artifacts/tech-debt/fra-4-purchase-policy-disclosure.debt.md` | T4 |
| 新增 | `docs/implementation-artifacts/tech-debt/qgr-t3-webhooks-controller-tests.debt.md` | T4 |
| 新增 | `docs/implementation-artifacts/tech-debt/qgr-a10-1-apikey-provider-service.debt.md` | T4 |
| 新增 | `docs/implementation-artifacts/tech-debt/qgr-m1-emailsender-sendgrid.debt.md` | T4 |
| 新增 | `docs/implementation-artifacts/tech-debt/qgr-d1-pdf-worker-progress.debt.md` | T4 |
| 新增 | `docs/implementation-artifacts/tech-debt/qgr-ba-9-api-auth-middleware.debt.md` | T4 |
| 刪除 | `docs/implementation-artifacts/tech-debt/qgr-m10-checkout-modal-dry-refactor.debt.md` | T4 (舊命名) |
| 修改 | `.claude/skills/skills_list.md` | 索引同步 |
| 修改 | `CLAUDE.md` | §2 Skill 索引新增 debt-registry |
| 修改 | `docs/implementation-artifacts/stories/epic-qgr/qgr-ba-9-api-auth-middleware.md` | T4 (源頭 Tech Debt 表格) |
| 修改 | `docs/implementation-artifacts/stories/epic-qgr/README.md` | T4 (樹狀圖同步) |
| 修改 | `docs/implementation-artifacts/stories/epic-qgr/EPIC-QGR推進樹狀圖.md` | T4 (推進樹狀圖同步) |
| 修改 | `docs/tracking/archived/epic-qgr/qgr-ba-9-api-auth-middleware.track.md` | T4 (追蹤檔補充) |

### 注意事項

- ⚠️ instructions.xml 為 AI 消費，使用英文（遵循 MEMORY.md 語言選擇規則）
- ⚠️ registry.yaml 修改頻繁，需注意多 Agent 並行時的衝突（參考 TRS-32 File Lock）

---

## Change Log

| 日期 | 變更 | 作者 |
|------|------|------|
| 2026-02-28 | Story 建立 — Skill 已先行完成，本 Story 聚焦 workflow 整合 + 回溯盤點 | CC-OPUS |
| 2026-02-28 | 新增 Task 7（部署文件同步）— 全部完成；更新已完成清單 + 檔案影響範圍 | CC-OPUS |
| 2026-02-28 | dev-story 完成 — T1-T6 全部完成，回溯盤點 41 entries (13P+5R+23W)，8 新 sidecar，0 斷鏈 | CC-OPUS |
| 2026-02-28 | code-review 完成 — Score:74 (4M+3L All Fixed), 計數修正(14P→13P,22W→23W)+BA-9 sidecar schema修復+File List補完+Task描述修正 | CC-OPUS |
