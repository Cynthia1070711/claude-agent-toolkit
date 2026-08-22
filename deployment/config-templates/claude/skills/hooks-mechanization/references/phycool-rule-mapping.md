# PhyCool Rules → Hook 機械化對照表

PhyCool 當前 31 條 rules 的機械化可行性逐條分析。**本檔是這個 skill 的 single source of truth**;主檔 SKILL.md 提到「該轉哪些」時直接讀這份,不要憑記憶回答。

最後審查日期:2026-05-16(以摘要與已上傳 31 條 rules 為依據)

---

## 機械化等級定義

| 等級 | 意義 |
|---|---|
| 🟢 **完全機械化** | 可寫成 hook 完全取代,rule 檔可退役 |
| 🟡 **部分機械化** | Hook 處理高頻違規場景,rule 檔精簡保留 |
| 🔴 **保留 rule** | 規則本質為價值觀 / 高階指引,無可觀測訊號,不適合 hook |
| ⚫ **退役** | 規則已過時或被新功能取代,直接砍 |

---

## SUPREME 層 9 條

### 1. constitutional-standard.md 🟡
- Code Verification 段:read-before-modify 段 → 🟢 hook(read-before-edit-guard.js)
- Backend Contract Mandate:🔴 保留(需語意判斷)
- Depth-First Mandate:🔴 保留(指導思考方式)
- External Source Citation Mandate:🟡 PostToolUse prompt 型 hook 可抽查

**動作**:rule 精簡至 ≤50 行(刪 read-before-modify 段、刪 citation 細節)。

### 2. ~~dual-repo-push-discipline.md~~ ✅ [RETIRED 2026-05-16]
- **狀態**: rule 已 retire,5 條 SOP 整合至 `.claude/rules/single-engine-mode.md` §FROZEN Future-Unfreeze SOP
- **歷史評估**(留存供參): 完全可機械化:`git push` 攔截 + remote 同步檢查
- **退役原因**: Single-Engine Mode FROZEN 2026-05-05 後 toolkit 開發暫停,push discipline 無 active 場景。若未來解凍 toolkit 開發,參考 `single-engine-mode.md` §FROZEN Future-Unfreeze SOP 5 條 + 配套 hook 可重啟建立。

### 3. capability-integration-mandate.md 🔴
- MCP/Schema/Hook 5 步整合是設計流程,非運行時檢查
- 保留,但精簡至 ≤40 行

### 4. pipeline-handshake-protocol.md 🟡
- Handshake 訊號:🟢 改用 SubagentStart/SubagentStop 原生 hook
- v4.0.0 狀態流圖:🔴 保留(指引 Claude 流程)
- **Phase 2 Hook 7**:`.claude/hooks/handshake-bridge.js`

**動作**:rule 精簡至 ≤30 行,只保留狀態流圖。

### 5. parallel-batch-conflict-isolation.md 🟡
- 5 軸 conflict matrix 偵測:🟢 hook
- 衝突解決指南:🔴 保留
- **Phase 2 Hook 9**:`.claude/hooks/conflict-matrix-precheck.js`

**動作**:rule 精簡至 ≤60 行,保留 5 軸定義與決策樹。

### 6. parallel-worker-identity.md ⚫
- 4-Tuple Identity 與 `parallel-batch-conflict-isolation.md` 95% 重疊
- **動作**:整條刪除,概念合併到 parallel-batch-conflict-isolation

### 7. encoding-discipline.md 🟢
- UTF-8 BOM 偵測完全可機械化
- **Phase 2 Hook 1**:`.claude/hooks/encoding-bom-guard.js`

**動作**:rule 退役。

### 8. mcp-payload-discipline.md 🟢
- 6 式 payload 錯誤可全部 schema validate
- **Phase 2 Hook 4**:`.claude/hooks/mcp-payload-validator.js`

**動作**:rule 縮減至 6 行宣告式陳述。

### 9. cr-web-mandate.md 🟡
- Vite dev/prod parity:🟡 build hook 可檢查
- Excel dev/prod 行為:🔴 保留(語意)
- **動作**:rule 加 `paths: src/web/**, vite.config.*, **/excel-*`,只在這些檔案被讀時載入

---

## Workflow/Story 治理 8 條

### 10. create-story-enrichment.md 🟡
- Story 富化檢查:🟡 PostToolUse hook 偵測新建 docs/stories/*.md 是否含必要 frontmatter
- 富化指引內容:🔴 保留
- **動作**:加 `paths: docs/stories/**`

### 11. depth-gate-warn-mandatory-resolution.md 🟡
- Depth gate warn:🟡 prompt 型 hook 在 Stop 時評估
- Mandatory resolution 文字:🔴 保留
- **動作**:加 `paths: docs/stories/**, bmad/**`

### 12. cr-debt-doc-audit.md 🟡
- 文檔債務:🟡 async hook 定期 scan
- 稽核 SOP:🔴 保留
- **動作**:加 `paths: docs/cr-debt/**`

### 13. db-first-no-md-mirror.md 🟢
- DB-first 順序檢查可機械化
- **Phase 2 Hook 3**:`.claude/hooks/db-first-write-guard.js`

**動作**:rule 縮減至 3 行。

### 14. execution-tree-doc-sop.md 🔴
- 樹狀文件格式是指引性
- **動作**:加 `paths: docs/**/*.md`,只在編輯 doc 時載入

### 15. canvas-layout-invariants.md 🔴
- Canvas/Fabric.js 不變式:語意檢查,難機械化
- **動作**:加 `paths: **/canvas/**, **/*.fabric.*`

### 16. story-lifecycle-invariants.md 🟡
- I1-I9 不變式:🟡 部分可 hook 偵測(如 status 必須循序)
- 不變式定義:🔴 保留
- **動作**:加 `paths: docs/stories/**, bmad/**`,並考慮轉成 `.claude/skills/story-lifecycle/SKILL.md`

### 17. tasks-backfill.md 🟡
- UI Chrome MCP Live Check:🟡 PostToolUse hook 觸發 chrome-devtools MCP
- 回填邏輯:🔴 保留
- **動作**:加 `paths: docs/stories/**, docs/tasks/**`

### 17.5 db-longfield-revision-safety.md 🔴(2026-08-04 `bwu-13-bmad-mechanism-gap-closure` 新增,原內容於 `create-story-enrichment.md` 遷入)
- 長欄位(≥5,000 字元或含 code fence)修訂安全路徑 + Then 子句行號修後值紀律:皆為撰寫前 Self-Check 指引,無 runtime 可觀測違規訊號可供 hook 攔截(修訂動作發生於 Agent 對話內、非檔案系統事件)
- **動作**:保留為純規則;`paths` 已涵蓋 create-story / dev-story / code-review 三 workflow + `upsert-story.js`,無需額外機械化

---

## Memory/Context 5 條

### 18. context-memory.md ⚫
- 四層架構描述是技術文件,非 Claude 該做的事
- **動作**:移到 `docs/architecture/context-memory.md`,rule 刪除

### 19. auto-skill-detection.md ⚫
- Keyword matching + 連帶載入 ≤3 違反官方 progressive disclosure 設計
- 改用每個 skill 的 description 自然觸發
- **動作**:整條刪除

### 20. code-quality.md 🟡
- Read-before-modify:🟢 hook(已含在 Hook 10)
- DRY、Minimal complexity:🔴 保留
- **動作**:rule 精簡至 ≤30 行

### 21. deployment-doc-freshness.md 🟡
- 部署文件 staleness 偵測:🟡 async hook 比對 git log
- 新鮮度標準:🔴 保留
- **動作**:加 `paths: docs/deployment/**, *.config.*`

### 22. settings-json-edit-policy.md 🟢
- 二次確認可機械化(PreToolUse 詢問)
- **Phase 2 Hook 6**:`.claude/hooks/settings-edit-policy.js`

**動作**:rule 退役。

---

## Skill 治理 5 條

### 23. skill-creation-discipline.md 🔴
- Cap 100/60/160 SUPREME 是組織決策
- **動作**:保留,但精簡至 ≤40 行,Cap 數字也可由 hook 在 skill 新建時檢查

### 24. skill-sync-gate.md 🟡 → 與 #25 整併
### 25. skill-idd-sync-gate.md 🟡 → 與 #24 整併
- 兩條皆談 skill 同步,90% 重疊
- **動作**:整併為單一 `skill-sync.md`,加 `paths: .claude/skills/**`,並寫 PostToolUse hook 偵測 SKILL.md 變更後通知 IDD 對應

### 26. skill-tool-invocation-mandatory.md 🟡
- §Bootstrap Exemption:Claude 4.7 已內建 SKILL.md 主動讀取行為,該段可刪
- 其他段:🔴 保留
- **動作**:刪除 Bootstrap Exemption 段,rule 精簡至 ≤40 行

### 27. subagent-blocked-tools.md 🔴
- 3-Tier Boundary 是設計層規範,subagent frontmatter 內 `tools:` 已強制
- **動作**:保留但精簡;subagent 端的 tools 限制是真正的強制機制

---

## 驗證/同步 4 條

### 28. verification-protocol.md 🟢
- Stop 時驗證可改 prompt 型 hook
- **Phase 2 Hook 5**:prompt-type Stop hook

**動作**:rule 退役。

### 29. spec-timeliness.md 🟡
- Spec 過時偵測:🟡 async hook 比對 git 時間戳
- Timeliness 標準:🔴 保留
- **動作**:加 `paths: docs/specs/**, docs/sdd/**`

### 30. testing.md 🟡
- 跑測試的時機:🟡 prompt 型 Stop hook 評估
- TDD 流程:🔴 保留
- **動作**:加 `paths: **/*test*, **/*spec*`

### 31. toolkit-mirror-immediate-sync.md ⚫
- Toolkit 已停用
- **動作**:整條刪除,連 `.claude/hooks/toolkit-mirror-sync-detector.js` 一併移除

---

## 機械化彙總

| 等級 | 數量 | 處置 |
|---|---|---|
| 🟢 完全機械化(rule 退役) | 6 | encoding / dual-push / db-first / mcp-payload / verification / settings-policy |
| 🟡 部分機械化(hook + 精簡 rule) | 16 | constitutional / handshake / conflict-matrix / cr-web / 大部分 workflow + memory |
| 🔴 保留為純規則 | 5 | capability-integration / canvas / execution-tree / skill-creation / subagent-blocked |
| ⚫ 退役 | 4 | context-memory / auto-skill-detection / parallel-worker-identity / toolkit-mirror |
| **總計** | **31** | **可機械化 70%(22 條),純規則 16%(5 條),退役 14%(4 條)** |

---

## Token 收益估算

| 階段 | always-on rules tokens |
|---|---|
| 現況(全 always-on) | ~42k |
| Phase 2 退役 6 + 整併 2 + 退役 4 | ~28k |
| Phase 2 + 11 條加 `paths:` | ~14k(只在工作目錄匹配時載入) |
| Phase 3 進一步將部分轉為 skills | ~10k |

預估 rules 區塊從 **42k → 10k**(節省 32k always-on)。

---

## 執行順序建議

1. **先做退役 ⚫(4 條)** — 風險最低,立即省 token
2. **再做完全機械化 🟢(6 條)** — 對應 Phase 2 Hook 1~6,逐條驗證
3. **接著做整併 🟡** — skill-sync-gate + skill-idd-sync-gate
4. **最後做 `paths:` 標籤化** — 對 11 條加 frontmatter,**但要注意 Issue #23478 / #21858 已知 bug**(Write 不觸發、user-level paths 失效),重要規則保留在 CLAUDE.md 或寫 PostToolUse hook 兜底

---

## 配套 hook 文件交叉索引

| Rule | 對應 Hook 檔 | 在 Phase 2 文件中的編號 |
|---|---|---|
| encoding-discipline | encoding-bom-guard.js | Hook 1 |
| ~~dual-repo-push-discipline~~ [RETIRED 2026-05-16] | ~~dual-repo-push-gate.js~~ (未實作) | Hook 2 — 整合至 `single-engine-mode.md` §FROZEN SOP |
| db-first-no-md-mirror | db-first-write-guard.js | Hook 3 |
| mcp-payload-discipline | mcp-payload-validator.js | Hook 4 |
| verification-protocol | (prompt-type,直接設 settings.json) | Hook 5 |
| settings-json-edit-policy | settings-edit-policy.js | Hook 6 |
| pipeline-handshake-protocol | handshake-bridge.js | Hook 7 |
| parallel-batch-conflict-isolation | conflict-matrix-precheck.js | Hook 9 |
| code-quality (read-before) | read-before-edit-guard.js + track-reads.js | Hook 10 |