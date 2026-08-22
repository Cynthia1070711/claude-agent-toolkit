---
paths:
  - ".claude/hooks/**.js"
  - ".claude/settings.json"
---

# Hooks Creation Discipline — Hook 建立/修改強制走 `Skill(hooks-mechanization)` (SUPREME)

> **建立**: 2026-05-16 22:30
> **嚴重等級**: SUPREME (對齊 `skill-tool-invocation-mandatory.md` 兄弟規範)
> **觸發背景**: 2026-05-16 audit 發現規範層 (`skill-tool-invocation-mandatory`) 對 SKILL.md 有規範，但對 `.claude/hooks/*.js` 連規範都沒。新建/修改 hooks 完全依 Agent 自律，已驗證會踩反模式（em-dash 編碼 / 缺 fail-open / BOM strip 漏處理 / timeout 過短）。

---

## 1. Purpose

任何 `Edit/Write .claude/hooks/*.js`（排除 `_test.js`）必**先**字面調用 `Skill(skill="hooks-mechanization")`。對齊 `hooks-mechanization` SKILL §「何時使用這個 skill」line 22-32 自身規範，將「規範自身」升級為「機械強制」。

---

## 2. Applies When

| 動作 | 觸發點 |
|:---|:---|
| 新建 hook | Write `.claude/hooks/{name}.js` |
| 修改 hook 邏輯 | Edit `.claude/hooks/{name}.js`（含 matcher / timeout / handler 變更）|
| 退役 hook | 從 `settings.json` 移除註冊 + 刪除 `.js` 檔 |
| hook timeout / matcher 變更（透過 settings.json）| Edit `settings.json` hooks 區塊（由 `config-protection.js` 既有守門）|

---

## 3. Mandatory Action 矩陣

| 情境 | 必調用 Skill tool |
|:---|:---|
| 新建 PreToolUse / PostToolUse / Stop / SubagentStop / FileChanged hook | `Skill(skill="hooks-mechanization")` 走 7-step playbook |
| 修改 hook 邏輯（matcher / timeout / fail-open / handler）| `Skill(skill="hooks-mechanization")` |
| 退役 hook（per hooks-mechanization §7 step 7）| `Skill(skill="hooks-mechanization")` + GitNexus impact 分析 |

---

## 4. FORBIDDEN（4 條 — 對齊 saas-to-skill v3.3.0 八面向 §8 Loophole Closure 三元素格式）

### F1 — Edit/Write `.claude/hooks/*.js` 不先 `Skill(hooks-mechanization)`

- **Forbidden**: 跳過字面 Skill tool 調用直接 Edit/Write hook 檔案
- **Common Rationalization**: "範本一目了然，不需要載 skill"
- **Red Flag**: transcript 無 `Skill(skill="hooks-mechanization")` 字面調用記錄（hook 守門於 TTL 內回溯 transcript；TTL 值見 `skill-tool-invocation-guard.js` 的 `TRANSCRIPT_GREP_TTL_MS`，現為 15 min）

### F2 — 跳過 7-step playbook（Step 1 釐清訊號 → Step 7 退役 rule）

- **Forbidden**: 直接寫 hook 不釐清「規則可觀測訊號」、不選對 lifecycle event、不選對 handler 型別
- **Common Rationalization**: "我有經驗，直接寫就好"
- **Red Flag**: 新 hook 缺 fail-open 結構 / 缺 stdin BOM strip / 用 em dash U+2014 / timeout < 2000ms

### F3 — hook timeout < 2000ms

- **Forbidden**: 設 `timeout` 在 settings.json 註冊低於 2000ms
- **Common Rationalization**: "簡單 check 1 秒夠"
- **Red Flag**: Windows cold start 至少 500ms + Node.js init，timeout < 2000 容易誤殺合法呼叫

### F4 — `additionalContext` 寫成命令句

- **Forbidden**: 注入 `additionalContext` 字串以「Always」/「Must」/「Required」/「You should」等命令句開頭
- **Common Rationalization**: "直接告訴 Claude 該怎做更清楚"
- **Red Flag**: hooks-mechanization SKILL.md L184 明示「命令句會觸發 prompt-injection 防禦，被 surface 給使用者」。`additionalContext` 必寫成**陳述句**

---

## 5. Self-Check（Edit/Write hooks 前必自問 4 題）

1. **「我是否已字面調用 `Skill(skill="hooks-mechanization")`？」** → 否 → STOP，先 invoke
2. **「我設計的 hook 符合 7-step playbook Step 1（可觀測訊號）？」** → 否 → STOP，回去釐清
3. **「我設計的 hook 含 fail-open + BOM strip + timeout ≥ 2000ms？」** → 否 → STOP，加入
4. **「`additionalContext` 是陳述句而非命令句？」** → 否 → STOP，改寫

任一否 → **STOP**，先 `Skill(hooks-mechanization)`。

---

## 6. Hook 機械守護

`.claude/hooks/hooks-skill-invocation-guard.js`（PreToolUse Edit|Write，hard-block）— 偵測 `file_path` 符合 `.claude/hooks/**.js`，transcript 於 TTL 內無 `Skill(skill="hooks-mechanization")` 字面調用 → exit 2 + stderr（TTL 值見 `skill-tool-invocation-guard.js` 的 `TRANSCRIPT_GREP_TTL_MS`，現為 15 min）。

### 配套設計

| 機制 | 行為 |
|:---|:---|
| **Hard-block** | `exit 2` + stderr 詳細訊息（含 file_path / last invocation ts / bypass 指令）|
| **Self-skip** | `path.basename(filePath) === SELF_BASENAME` 時放行（避免 hook 改自己 deadlock）|
| **Test 檔豁免** | `.test.js` / `_test.js` 皆不攔截（測試檔不需走 hooks-mechanization；pattern 見 `hooks-skill-invocation-guard.js` 的 `TEST_FILE_PATTERN`）|
| **ENV bypass** | `PHYCOOL_HOOKS_BYPASS=1` 緊急豁免（對齊 settings-json-edit-policy 範式）|
| **Fail-open** | 任何 hook 內部 error → `exit 0`（不擋工作流）|

---

## 7. Bootstrap Exemption（對齊 skill-tool-invocation-mandatory v1.2.0 §Bootstrap Exemption）

### 三條件齊備時主視窗可豁免

✅ **C1** — Hook 規範 pipeline 自身行為（基礎建設層，非業務 hook）
✅ **C2** — 對應 Story / commit message 明文記錄「首次部署 bootstrap」
✅ **C3** — Memory DB `add_context(category=decision)` 寫入豁免決策

### 豁免邊界

| 動作 | 豁免? | 理由 |
|:---|:--:|:---|
| **首次部署 `hooks-skill-invocation-guard.js`**（本 rule 配套 hook 自身）| ✅ 允許 | hook 未生效前無法被攔截，屬 chicken-and-egg |
| Self-edit 該 hook（部署後）| ✅ 允許 | `SELF_BASENAME` 自動 self-skip |
| 修改其他既有 hook（部署後）| ❌ 不豁免 | 必走 `Skill(hooks-mechanization)` |
| 新建非 bootstrap hook | ❌ 不豁免 | 同上 |

---

## 8. 與其他規範的關係

| 規範 | 角色 |
|:---|:---|
| `.claude/rules/skill-tool-invocation-mandatory.md` v1.2.0 | 兄弟規範（對 SKILL.md），對齊 Mandatory Action 矩陣與 FORBIDDEN 範式 |
| `.claude/rules/cross-ref-discipline.md` v1.0.0 | hooks 變更前必走 GitNexus + Grep（本 rule 補充 hooks-mechanization 字面調用層）|
| `.claude/rules/encoding-discipline.md` SUPREME | `.ps1` UTF-8 BOM（本 rule 規範 `.js` 走 No-BOM 對應 phycool-windows-ps-encoding §8.3）|
| `.claude/rules/crlf-normalize-discipline.md` CRITICAL | script 處理流程必先 normalize CRLF + BOM（本 rule 規範新 hook 必走）|
| `.claude/rules/settings-json-edit-policy.md` HIGH | hooks 註冊到 settings.json 走 PowerShell bypass |

---

## 9. Hook 退役流程（per hooks-mechanization §7 step 7）

當新 hook 取代舊 rule 段落 / 舊 hook 後：

1. 確認新 hook 在生產環境穩定 ≥ 3 天（無 fail-open exit 1 異常）
2. **GitNexus impact 分析**：`mcp__gitnexus__impact({target: "<舊 rule/hook 名稱>", direction: "upstream"})`
3. **Grep 全範圍**：列出所有引用舊 rule/hook 的 ACTIVE config 檔案
4. **Surgical edit**：補全所有 references（指向新 hook / 移除過時段落）
5. **Memory DB**：`add_context(category=decision)` 記錄 retire 理由
6. **物理刪除舊檔**：從 `settings.json` 移除註冊 + 刪除 `.js` 檔（或 paths-scoped rule 縮減段落）

對齊使用者 2026-05-16 補充指令「清除前先調用 gitnexus 分析相關聯進行補全，避免修正 A 後 B 引用或參照時功能異常」。

---

## 10. Incident Records

### 2026-05-16 — 本規則觸發建立

**事件**: 2026-05-16 22:00 ultrathink audit 識別「規範層 + 機械層雙 GAP」：
- `hooks-mechanization` SKILL.md 自身規範「何時使用」(line 22-32)，但無 rule 強制
- 既有 rules 中**無**「Edit/Write `.claude/hooks/**.js` 前必走 `Skill(hooks-mechanization)`」字面要求
- Agent 過去直接寫 hook 已踩反模式：em dash U+2014 / 缺 fail-open / stdin BOM 漏 strip / timeout 過短

**處理**:
- 本 rule v1.0.0 建立（SUPREME，paths-scoped `.claude/hooks/**.js`）
- 配套 hook `hooks-skill-invocation-guard.js` 建立（PreToolUse Edit|Write hard-block）
- 註冊到 `settings.json` 走 PowerShell bypass（per `settings-json-edit-policy.md`）

---

## 11. Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.0.0** | **2026-05-16** | 初版建立。觸發: 2026-05-16 ultrathink audit 發現 `hooks-mechanization` SKILL 已部署但無 rule 強制走 SKILL，對齊 `skill-tool-invocation-mandatory` 兄弟規範補機械守護層。SUPREME 等級。paths-scoped `.claude/hooks/**.js`。4 FORBIDDEN F1-F4 含三元素（對齊 `saas-to-skill` v3.3.0 八面向 §8 Loophole Closure）。配套 hook `hooks-skill-invocation-guard.js`（PreToolUse Edit\|Write hard-block，Self-skip + Test 檔豁免 + ENV bypass + Fail-open）。Bootstrap Exemption 對齊 `skill-tool-invocation-mandatory` v1.2.0。Hook 退役流程整合使用者 2026-05-16 補充指令「清除前必走 GitNexus 分析」。 |
