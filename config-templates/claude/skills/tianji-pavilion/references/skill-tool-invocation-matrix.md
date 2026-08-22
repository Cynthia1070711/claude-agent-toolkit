# Phase 3 Skill Tool Invocation Matrix — 字面調用閘門

> **建立**: 2026-05-23 v1.4.0
> **觸發**: 既有 §Integration Points 表格(SKILL.md L385-403)只說「invoked from Phase 3」屬精神對齊,沒明示「字面 Skill tool 強制」,未對齊 3 個 SUPREME mandate。Stage α 5 commits message 全部「對齊 Skill(X) 精神」但無字面 invoke 痕跡(Memory id=4287 已記 Phase 2C 第 4 次重複犯錯)。
> **對應**: SKILL.md §Integration Points 摘要 — 本檔提供完整 spec

---

## 1. Phase 3 整合動作 → Skill tool 矩陣

| Phase 3 整合動作觸及的檔案類別 | 必字面調用 Skill tool | 對齊 SUPREME mandate |
|:----|:----|:----|
| Edit/Write `.claude/skills/**/SKILL.md`(SaaS 模組 `phycool-*`) | `Skill(skill="saas-to-skill")` Mode A/B/C | `skill-tool-invocation-mandatory.md` v1.2.0 |
| Edit/Write `.claude/skills/**/SKILL.md`(workflow/utility/tool 既有 Skill) | `Skill(skill="saas-to-skill")` Mode B(SOP 通用) | 同上 |
| 新建 `.claude/skills/{name}/SKILL.md`(workflow/utility/tool) | `Skill(skill="skill-builder")` | `skill-tool-invocation-mandatory.md` v1.2.0 |
| Edit/Write `.claude/skills/**/references/*.md` | `Skill(skill="saas-to-skill")` Mode B(伴隨 SKILL.md 升版) | 同上 |
| 新建 / 修改 `.claude/hooks/*.js`(非 `_test.js`) | `Skill(skill="hooks-mechanization")` 7-step playbook | `hooks-creation-discipline.md` v1.0.0 SUPREME |
| Edit `.claude/settings.json` hooks 區塊(timeout / matcher 變更) | `Skill(skill="hooks-mechanization")` | 同上 |
| Edit/Write `.claude/rules/*.md` | `Skill(skill="cc-config-author")` 7-step audit | `cross-ref-discipline.md` v1.0.0 SUPREME |
| Edit/Write `.claude/commands/*.md` | `Skill(skill="cc-config-author")` | 同上 |
| Edit/Write `.claude/agents/*.md` | `Skill(skill="cc-config-author")` | 同上 |
| Edit `.claude/settings.json`(非 hooks 區塊) | `Skill(skill="cc-config-author")` | 同上 |
| Edit `.mcp.json` | `Skill(skill="cc-config-author")` | 同上 |
| Edit `CLAUDE.md` / `CLAUDE.local.md` | `Skill(skill="cc-config-author")` | 同上 |

---

## 2. 為何字面調用(而非精神對齊)?

依 Memory id=4287(Stage α Phase 2C rule_violation, severity=high):

> **「精神對齊 SOP 步驟」≠「字面調用 Skill tool」**

Agent 過往跳過字面調用直接 Edit SKILL.md 的合理化:

- ❌ "技術上對齊 SOP 步驟,效果一樣"
- ❌ "範本一目了然,不需要載 skill"
- ❌ "我有經驗,直接寫就好"

**Memory id=4287 統計**: Phase 2C 屬 **第 4 次重複犯錯** — 證明「精神對齊」防線無效,必走字面層強制。

對齊 `skill-tool-invocation-mandatory.md` v1.2.0 §Core Principle:

> 「Edit/Write `.claude/skills/**/SKILL.md` 或 `references/*.md` 前必先 `Skill(skill="skill-builder")` 或 `Skill(skill="saas-to-skill")` 字面調用,否則 hook BLOCK 循環式錯。」

---

## 3. Phase 3 主動偵測流程(Agent 自我驅動)

Phase 3 Distillation 階段,Agent 收到「執行整合」指令時,**主動偵測**整合動作觸及的檔案類別,對應字面 Skill tool 調用:

```
1. Agent 收到 Phase 3 整合指令
   ↓
2. 列舉本次整合預計觸及的檔案路徑(distillation-record.md 必填欄位)
   ↓
3. 對每個檔案路徑,對照本 §1 矩陣
   ↓
4. 對應的 Skill tool 字面調用清單(可能 ≥ 1 個 Skill)
   ↓
5. 依清單逐一字面調用 Skill(skill="X")
   ↓
6. Skill SOP 載入後,執行 Edit / Write 動作
   ↓
7. 完成後在 distillation-record.md 記錄字面調用痕跡(commit message 或 transcript)
```

---

## 4. 跳過違規補登流程(對齊 Memory id=4287 範式)

若 Agent 因任何理由跳過字面 Skill 調用,**MUST 立即補登 rule_violation**:

```bash
node .context-db/scripts/log-rule-violation.js \
  --rule '.claude/rules/skill-tool-invocation-mandatory.md' \
  --loaded true \
  --cli-enforced false \
  --phase tianji-phase-3-distillation \
  --severity high \
  --summary 'Phase 3 整合動作觸及 {file_path} 但跳過 Skill({tool}) 字面調用 · 補登第 N 次重複犯錯' \
  --tags 'tianji-phase-3,skill-tool-bypass,phase-3-distillation'
```

**補登時機**: 動作完成同 commit;不可拖延至下次。

---

## 5. Bootstrap Exemption 對齊

對齊 `skill-tool-invocation-mandatory.md` v1.2.0 §Bootstrap Exemption — Pipeline 自舉場景豁免:

三條件齊備可豁免字面 Skill tool 調用:

- **C1** 該 Skill 規範 pipeline 自身行為(基礎建設層)
- **C2** 對應 Story AC 明文豁免
- **C3** Memory DB `add_context` 寫入豁免決策

**不適用 tianji-pavilion 本身**:本 Skill 不規範 pipeline 自身行為(規範外部資源評估流程),所以 tianji-pavilion 整合動作仍須字面 Skill tool 調用,**無豁免**。

---

## 6. Self-Check(Phase 3 整合執行前 4 題)

1. **「我列出了本次整合預計觸及的所有檔案路徑嗎?」** → 否 → STOP,填 `distillation-record.md`
2. **「我對照本檔 §1 矩陣識別了對應 Skill tool 嗎?」** → 否 → STOP,對照
3. **「我已字面調用對應 Skill tool 嗎(transcript 可見 `Skill(skill="X")` 動作)?」** → 否 → STOP,字面調用
4. **「若跳過字面調用,我有補登 rule_violation 嗎?」**(對齊 §4)→ 否 → STOP,補登

任一答 No → 違反 SUPREME mandate,屬高嚴重 rule_violation。

---

## 7. 與蒸餾深度的關係

本 matrix 規範**字面調用機制層**;`references/adaptation-depth.md` 規範**內容深度層**。兩者協作:

| 層級 | 文檔 | 規範範疇 |
|:----|:----|:----|
| **字面層** | 本檔(skill-tool-invocation-matrix.md)| Phase 3 動作前必走的 Skill tool 字面調用閘門 |
| **內容層** | `adaptation-depth.md` | Phase 3 蒸餾完成後的 5 級評分 + 4 維度 + 5 self-check |

兩者皆對齊 saas-to-skill v3.3.0 §5.4 八面向驗證(機制層 = 面向 6 Cross-Skill 引用;內容層 = 面向 8 FORBIDDEN Loophole Closure)。

---

## 8. Related References

- `.claude/rules/skill-tool-invocation-mandatory.md` v1.2.0 SUPREME — SKILL.md 動作必走字面調用
- `.claude/rules/hooks-creation-discipline.md` v1.0.0 SUPREME — hooks 動作必走 hooks-mechanization
- `.claude/rules/cross-ref-discipline.md` v1.0.0 SUPREME — .claude/** 跨檔引用必查
- `.claude/skills/cc-config-author/SKILL.md` — .claude/ 配置 7-step audit
- `.claude/skills/hooks-mechanization/SKILL.md` — hooks 7-step playbook
- `.claude/skills/saas-to-skill/SKILL.md` v3.3.0 — Mode A/B/C SOP
- `.claude/skills/skill-builder/SKILL.md` — 新建非 SaaS Skill
- `references/adaptation-depth.md` — 蒸餾完成後內容層深度量化

---

## 9. Incident Records

### 2026-05-23 — 本 matrix 觸發建立

**事件**: Stage α ultrathink session 揭露既有 tianji-pavilion §Integration Points 表格(SKILL.md L385-403)只說「invoked from Phase 3」屬精神對齊,沒明示「字面 Skill tool 強制」。5 commits message 全部「對齊 Skill(X) 精神」但無字面 invoke 痕跡,僅 Phase 2C 被記 Memory id=4287(第 4 次重複犯錯,severity=high)。

Phase 2A / 2B / 3 屬 **systematic under-reporting** — 同質違規但未補登 rule_violation,需 3 條補登(對齊 §4 流程)。

**處理**:

- 本 reference v1.4.0 建立(對齊 SKILL.md §Integration Points 摘要)
- §1 矩陣強制 12 動作類別 → 4 個 Skill tool 對應
- §4 跳過違規補登流程固化
- 對齊 3 SUPREME mandate(skill-tool-invocation-mandatory + hooks-creation-discipline + cross-ref-discipline)
- 對齊使用者 ultrathink 訊息「進行 skill 建立或更新時是否有調用 skill-builder、saas-to-skill;建立 hooks 時是否有調用 hooks-mechanization;進行開發專案其他配置時是否有調用 cc-config-author 評估」
