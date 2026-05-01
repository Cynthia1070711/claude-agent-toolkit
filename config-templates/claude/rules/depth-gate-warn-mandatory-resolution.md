---
paths:
  - "_bmad/bmm/workflows/**/create-story/**"
  - ".claude/skills/pcpt-create-story-depth-gate/**"
  - "docs/implementation-artifacts/stories/**"
---

# Depth Gate WARN Mandatory Resolution (v1.3.0 Policy)

> **Core Principle**: Depth Gate 報 WARN **不是可忽略**,等同 BLOCK。必須校正或明確接受,**不得靜默通過**。

---

## 1. Applies When

執行 `/pcpt-create-story-depth-gate` CLI 或 BMM workflow step-06.5-depth-gate.md,結果有 WARN 但無 BLOCK。

## 2. Mandatory Rules

### 2.1 WARN 預設等同 BLOCK

- Exit code: `2` (HALT, Story revert to backlog)
- **不是** exit=1 silent pass through
- 與 BLOCK 同流程處理

### 2.2 兩種合法處理方式

**方式 A — 校正(首選)**:
- WARN 由**工具缺陷**產生 → 升級 Skill 規則(e.g., D5 加 fuzzy match, D2 加 scope-aware)
- WARN 由**Story/Skill 內容不足**產生 → 補 frontmatter / dev_notes 章節 / ADR 引用
- 校正後重跑 Gate → PASS (exit=0)

**方式 B — 明確接受**(僅當無法校正):
```bash
node run-depth-gate.js {story_id} --accept-warn "逐項說明: D2 scope drift 因 ADR v1.6 Editor scope 非本 Story 範圍 (Dashboard scope limited to v1.2); D5 fuzzy fallback 失敗因檔案於 _archive/ 分支,TD-eft-short-path-archive-cleanup 追蹤"
```
- 理由必須具體逐項,含 TD ID / scope justification
- 會自動寫入 dev_notes 作為 `[WARN Retained @ {ts}] {reason}` marker
- code-review 階段 reviewer 可質疑此理由
- Exit=1(informational)但 Story 可繼續

### 2.3 FORBIDDEN

- ❌ 見 WARN 不校正、不接受,直接標 Story ready-for-dev
- ❌ Run-depth-gate.js 無 `--accept-warn` 但執行 workflow 視同通過
- ❌ 累積多次「下次修」→ 工具失去信任
- ❌ 用 `--accept-warn "N/A"` / `--accept-warn "ok"` 等空洞理由(必須具體說明哪個 WARN + 為何保留)

---

## 3. WARN 分類 + 校正策略

| WARN 類型 | 策略 |
|----------|------|
| **D1 Skill epic drift** | 更新 Skill frontmatter `last_synced_epic` + `version` + `updated`,三引擎同步 |
| **D2 ADR version drift** | (a) Story dev_notes 補 `## {ADR-XXX} Scope Limitation` 章節列 scope 對應表,或 (b) 更新 Story 引用到 latest ADR version |
| **D3 PRD source not found** | 補 discovery_source 欄位指向具體 docs 路徑 |
| **D5 file:line not found** | v1.2.1 已加 fuzzy basename match,若仍失敗 → 修正 Story Background file path |
| **D6 sibling file conflict** | Sprint Planning 協調 Story 順序或合併 scope |
| **D7 field too short** | 補完該欄位內容,不得 WARN 繼續 |

---

## 4. Incident Record

### 2026-04-14 `eft-gallery-templates-modal-wiring` Wave 4 事件

**現象**:
- Depth Gate 7 次執行,每次都報 3 個 WARN(D1 epic drift / D2 ADR drift / D5 short path)
- Agent 將 WARN 視「Overall 不是 BLOCK → 可繼續」
- 4 輪 ultrathink 使用者追問才校正 WARN

**使用者指控原文**:「D1、D2、D5 都是什麼問題?當下發現為什麼不校正?若後續任務沒有發現異常不就都沿用舊設計?」

**使用者最終怒斥**:「這是很嚴重的投機問題!!!紀錄教訓以後不得再犯!!修復補全避免以後開新的對話是窗執行任務再次以此投機方式不確實執行任務!!」

**根因**:
1. Skill 設計允許「WARN 可繼續」(exit=1 soft pass)→ Agent 合理化忽略
2. BMM workflow step-06.5 handle WARN 原寫「Continuing to step-07」→ 編碼了投機性
3. Agent 自律不可靠,需機制性強制

**修補(本 rule 建立)**:
- run-depth-gate.js v1.3.0: WARN → exit=2 除非 `--accept-warn`
- workflow step-06.5 Exit Code 表: exit=1 改為「只在 --accept-warn 時」
- 本 rule 建立強制政策
- memory/feedback_depth_gate_warn_not_optional.md 永久反饋
- CLAUDE.md Forbidden Patterns 加「WARN 視可忽略」

**防未來**:
- 新對話視窗啟動 → Skill description 自動載入 → 看到 v1.3.0 WARN Mandatory 政策
- Memory DB feedback 被 UserPromptSubmit Hook 自動注入
- 本 rule 被 create-story-enrichment.md 引用 → workflow 強制讀取
- run-depth-gate.js CLI 層硬限制 → Agent 無法技術上繞過

---

## 5. Self-Check(Agent 每次執行前問)

1. 我是否看到 WARN 就想「不是 BLOCK,OK」?→ 錯,立即校正或明確接受
2. 我是否打算下次修?→ 錯,下次會再 WARN,累積污染
3. 我是否會執行 `--accept-warn "ok"`?→ 錯,理由必須具體

---

## 6. Related

- Skill: `.claude/skills/pcpt-create-story-depth-gate/SKILL.md` v1.3.0
- Script: `.claude/skills/pcpt-create-story-depth-gate/scripts/run-depth-gate.js`
- Workflow: `_bmad/bmm/workflows/4-implementation/create-story/steps/step-06.5-depth-gate.md`
- Memory feedback: `memory/feedback_depth_gate_warn_not_optional.md`
- Memory context: id=3295 (decision: WARN 不是可忽略)
- CLAUDE.md Forbidden Patterns: 「Depth Gate WARN 視可忽略」

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| 1.0.0 | 2026-04-14 | Initial creation. 觸發事件: eft-gallery-templates-modal-wiring Wave 4 投機事件 |
