---
name: single-engine-mode
version: 1.0.0
created: 2026-05-05
status: active
paths:
  - ".claude/skills/**"
  - ".claude/rules/**"
  - ".claude/hooks/**"
  - ".gemini/**"
  - ".agent/**"
  - "1.專案部屬必讀/**"
  - "scripts/check-hygiene.ps1"
  - "scripts/*toolkit*"
---

# Single-Engine Mode — Claude Code Single Engine SSoT(Sync 機制退役層)

> **Effective Date**: 2026-05-05
> **Trigger**: 5/1 備份手動還原 + 使用者明確決策(停止三引擎 sync 機制 + 停止 toolkit 鏡像)
> **CEO sign-off**: 2026-05-05 ✅
> **Status**: active

---

## Core Decision(精確語意)

> **「停止三引擎同步」精確語意 = 暫停 Skill 更新時自動 Copy-Item 同步至 `.gemini/.agent` 的機制**,**不是**刪除這兩個目錄。

### 五條核心決策

1. **`.claude/` 為唯一 active SSoT** — 所有新 rule / skill / hook / command 變更只在此進行
2. **`.gemini/` + `.agent/` 為 frozen 5/1 baseline** — **保留供歷史參考**,**不再主動 sync update**
3. **Natural decay 是預期行為** — 因新 update 不再 propagate,.gemini/.agent 與 .claude/ 漸 drift 屬正常設計
4. **`1.專案部屬必讀/` Toolkit 鏡像 sync 機制停用** — 脫敏 detection 移除(由 ENV-04 完成)
5. **不再執行** PowerShell `Copy-Item .claude → .gemini/.agent` / md5 verify / Phase 4 三引擎同步

---

## FORBIDDEN(絕對禁止)

| # | 禁止動作 | 原因 |
|:-:|---------|------|
| 1 | 在 SKILL.md update 後執行 `Copy-Item .claude/skills/{name}/* .gemini/skills/{name}/` | sync 機制已退役 |
| 2 | 在 SKILL.md update 後執行 `Copy-Item .claude/skills/{name}/* .agent/skills/{name}/` | 同上 |
| 3 | 在新 rule / skill / saas-to-skill workflow 加入 Phase 4 三引擎同步步驟 | 違反 single-engine 設計 |
| 4 | 在 `scripts/check-hygiene.ps1` 重啟 Toolkit-Relevant Change Detection 邏輯 | toolkit 鏡像 sync 已停 |
| 5 | 在 `.claude/rules/*.md` 加 `.gemini/skills/**` 或 `.agent/skills/**` paths | conditional load 觸發無意義(baseline 凍結中) |
| 6 | 重新生成 `.toolkit-sync-pending.md` markers | sync detection 已退役 |
| 7 | **物理刪除 `.gemini/` 或 `.agent/` 目錄** | **保留 baseline 是核心決策**,不可誤解為「Single-Engine = 刪除」 |
| 8 | 跳過 `Skill(saas-to-skill)` 直接 Edit `.claude/skills/**/SKILL.md` | 違反 `skill-tool-invocation-mandatory.md` v1.1.0(該 rule 仍生效)|

---

## NOT FORBIDDEN(明示允許保留)

| # | 動作 | 理由 |
|:-:|------|------|
| 1 | `.gemini/` 和 `.agent/` 物理保留(752 + 675 git tracked files) | 5/1 baseline,歷史參考價值 |
| 2 | 偶爾 Read `.gemini/` 或 `.agent/` 作歷史對照 | 如查 5/1 之前的 SKILL 內容 / 比對 sync 前後 |
| 3 | 接受 `.gemini/.agent/` 與 `.claude/` 漸 drift(natural decay) | 預期行為,不是 bug |
| 4 | 在 `.claude/rules/single-engine-mode.md`(本 rule)的 paths 含 `.gemini/.agent` | 因為這是守護 rule,需要在動到這些目錄時觸發載入 |

---

## Self-Check(Agent 修改 Skill / Rule 前必問 4 題)

1. **「我是否在 SKILL.md update 後打算 Copy-Item 至 .gemini/.agent?」** → 是 → **STOP**(sync 機制已退役)
2. **「我是否在 saas-to-skill / skill-builder workflow 加入 Phase 4 三引擎同步步驟?」** → 是 → **STOP**
3. **「我是否在 paths 加 .gemini/skills 或 .agent/skills 期待 conditional load?」** → 是 → **STOP**(觸發無意義,baseline 凍結中)
4. **「我是否打算物理刪除 .gemini/ 或 .agent/ 目錄?」** → 是 → **STOP**(保留 baseline 是核心決策,別誤解 Single-Engine = 刪除)

---

## Background

### 觸發事件
2026-05-05 使用者於 5/1 備份還原後明確決策:
- **停止三引擎同步機制**(降低維護稅,但保留 baseline 不刪)
- **停止 toolkit 鏡像 sync 機制**(聚焦 PHYCOOL,但 `1.專案部屬必讀/` 已自然不存在)
- 全速推進 PHYCOOL MVP

### v2 語意修訂歷程(2026-05-05)
- **v1 誤解**:「停止三引擎同步」= 刪除 `.gemini/.agent`
  - 執行 ENV-01 commit `58a44849` 刪 1427 files
  - 使用者立即指出誤解
- **使用者明確澄清**:「**取消三引擎同步的意思是不需要再同步更新,而不是刪除!!**」
- **修復**:`git reset --soft HEAD~1` 撤銷 `58a44849`(reflog 90 天可救);使用者從備份還原 `.gemini/.agent` 物理檔案
- **本 rule v1.0.0 reflects 修訂後正確語意** — 停 sync 機制 ≠ 刪除目錄

---

## Migration Tasks(本次環境 cleanup 5 個 Story)

| Story | Phase | Status | Commit Hash | 動作 |
|:-----:|:-----:|:------:|:-----------:|------|
| **ENV-01 v2** | α | ✅ done | N/A | 3 toolkit-sync-pending markers 刪除 + 3 zombie pipelines cancel(α-1 .gemini/.agent 刪除已 CANCELLED 並 reset)|
| **ENV-02** | β | ✅ done | `94767b03` | 3 個 rule 移除三引擎 paths + sync FORBIDDEN(skill-sync-gate / skill-idd-sync-gate / skill-tool-invocation-mandatory v1.1.0)|
| **ENV-03** | β | ✅ done | `b9a34c2d` | `saas-to-skill/SKILL.md` v3.1.0 → v3.2.0,Mode B Phase 4 三引擎同步邏輯移除 |
| **ENV-04** | β | ✅ done | `a5b32d42` | `scripts/check-hygiene.ps1` Toolkit-Relevant Change Detection section 移除(229 → 153 行)|
| **ENV-05** | γ | 🔄 進行中 | (本 commit) | 建立本 rule + add_context reference 反向覆蓋 Global Memory dangling refs |

---

## Defer 列表(11 項,自然觸碰時 Boy Scout cleanup)

下列引用未在本次 cleanup 範圍,自然觸碰時順手清理:

1. `canvas-layout-invariants.md` L71/93/111 三引擎引用(歷史敘述)
2. `depth-gate-warn-mandatory-resolution.md` L55(歷史敘述)
3. `subagent-blocked-tools.md` cross-ref(歷史 incident records)
4. `story-lifecycle-invariants.md` long line(歷史 incident records)
5. `saas-to-skill/references/three-engine-spec.md`(已加 `[DEPRECATED]` header,內容保留作歷史)
6. `saas-to-skill/references/lifecycle-sync-protocol.md`
7. `saas-to-skill/references/skill-template.md`
8. `saas-to-skill/references/creation-methodology.md`
9. `CLAUDE.md` L88 long line(歷史 incident records)
10. Project memory `MEMORY.md` 4 個新 IDD 補登(走 `memory-to-idd-migration.js` 自動化,LOW priority)
11. **Global Memory `~/.claude/projects/.../memory/MEMORY.md` 5 個 SUPREME refs**(由 ENV-05 γ-2 add_context 反向覆蓋,自然消化)

> **Boy Scout Rule**: 下次自然觸碰到這些檔案時順手清理,不做專門 effort。

---

## FROZEN Future-Unfreeze SOP(原 dual-repo-push-discipline.md 整合 2026-05-16)

> **2026-05-16 整合**: `dual-repo-push-discipline.md` 已 retire(原 26 行 always-on),5 條 SOP 整合至此。若未來解凍 toolkit 開發,**重啟 git push 前必先 review 本 §**。

**5 條核心 SOP**(若未來解凍):
1. **每次 `git push` 前必 `pwd && git remote -v`** — 確認 cwd 對應 origin(PCPT 私 vs toolkit 公)
2. **同 commit 禁混雜兩 repo 性質** — 業務 code 與 toolkit 通用範本必拆 commit
3. **Toolkit push 必走 release branch + PR**,絕禁 `git push origin master`
4. **Toolkit 內絕禁 `phycool` / `PhyCool` 字面** — `verify-deployment-docs.cjs` V-8 強制 0 命中
5. **業務 code / Stories / Memory / ADR / `phycool-*` Skill 字面禁推 toolkit** — 商業機密外洩風險

**Self-Check(push 前 3 題,若解凍時必走)**:
1. `pwd + git remote -v` 我執行過嗎?
2. cwd 對應的 repo 與本次變更內容一致嗎?
3. 若推 toolkit,我跑過脫敏 grep 且為 0 命中嗎?

任一答案 No / 不確定 → STOP,先確認。

---

## Related

- **Skill 守護層**:
  - `.claude/rules/skill-sync-gate.md`(已修訂移除三引擎 paths,2026-05-05 ENV-02)
  - `.claude/rules/skill-idd-sync-gate.md`(同上)
  - `.claude/rules/skill-tool-invocation-mandatory.md` v1.1.0(2026-05-05 ENV-02 升版,保留 Skill tool 字面調用核心精神)
- **Skill 工具**:
  - `.claude/skills/saas-to-skill/SKILL.md` v3.2.0(2026-05-05 ENV-03 重寫,Mode B Phase 4 三引擎同步移除)
- **Hygiene 工具**:
  - `scripts/check-hygiene.ps1`(2026-05-05 ENV-04 移除 Toolkit-Relevant Change Detection section)
- **歷史參考(已 DEPRECATED)**:
  - `.claude/skills/saas-to-skill/references/three-engine-spec.md`(整檔 retire)
  - `.claude/rules/skill-tool-invocation-mandatory.md` v1.0.0 Version History 中三引擎相關歷史敘述
- **Cleanup 文檔**:
  - `專案環境配置健檢/`(健檢報告 + 5 Story 拆分 + 執行追蹤 + 總結報告)

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.0.0** | **2026-05-05** | 初版建立。觸發事件:5/1 備份手動還原 + 使用者明確 2 個決策(停三引擎 sync 機制 + 停 toolkit 鏡像)+ 全速推進 PHYCOOL。**v2 語意修訂歷程**:v1 誤解(刪 .gemini/.agent) → ENV-01 commit `58a44849` 過度刪除 → 使用者澄清「停止 sync ≠ 刪除」 → `git reset --soft HEAD~1` 撤銷 → 使用者從備份還原 → ENV-01 v2(縮減為 markers + zombies)+ ENV-02/03/04 完成 → 本 rule 建立。**核心**:`.claude/` active SSoT,`.gemini/.agent/` frozen baseline 保留,natural decay 是預期。詳見 `專案環境配置健檢/02-CEO決策備忘錄.md` v2 + `專案環境配置健檢/stories/ENV-01-stale-artifacts-cleanup.md` v2。 |
