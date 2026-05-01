# Dual-Repo Push Discipline — 雙倉庫推送紀律 (SUPREME)

> **嚴重等級**: SUPREME(等同 Constitutional Standard)
> **建立日期**: 2026-05-01
> **觸發事件**: 2026-05-01 v1.8.0 toolkit 推送過程使用者明示「分不清楚要推送到哪個倉庫」風險

---

## 1. 為何需要本 Rule

當前開發環境同時維護**兩個性質完全不同**的 GitHub 倉庫:

| Repo | 角色 | 風險 |
|:----|:----|:----|
| **<your-private-repo>**(私人)| your SaaS product 實際開發 | 包含業務 code / 客戶資料 / 內部 Stories / IDD |
| **claude-agent-toolkit**(公開)| 蒸餾大神工作流的智能開發環境 toolkit | 公開可見,絕禁業務外洩 |

**誤推風險**:
- 業務 code 推至公開 toolkit → 商業機密外洩
- toolkit 通用範本推回 PCPT 取代業務 code → 開發中斷
- 同一 commit 混雜兩種性質 → 無法乾淨分離

→ 必須**機械強制**雙倉庫識別。

---

## 2. Applies When

任何以下動作前必檢查:
- `git push`
- `git commit`(若涉及兩種性質內容應拆 commit)
- `git checkout -b release/...`
- `gh pr create`
- 任何 `Copy-Item` / `cp` 跨 repo 操作

---

## 3. Mandatory Pre-Operation Verification(機械強制)

### Step 1: 確認當前 cwd 與 origin

```bash
pwd
git remote -v
```

**期望輸出對照表**:

| cwd 路徑 | origin URL 應為 |
|:----|:----|
| `.../<your-workspace-root>` | `https://github.com/<your-org>/<your-private-repo>.git` |
| `.../claude-agent-toolkit`(任一 clone)| `https://github.com/<your-org>/<your-toolkit>.git` |

**若 origin 不符 cwd 預期** → 立即 STOP,排查 remote 設定錯誤。

### Step 2: 對照變更內容 vs Decision Tree

依「`CLAUDE.md` §0.3 變更內容 → 推送目標決策樹」分類:

```
變更類型 X
  → 屬 PCPT-MVP only? → cwd 必為 PCPT,origin 必為 <your-private-repo>
  → 屬 toolkit only?  → cwd 必為 toolkit,origin 必為 claude-agent-toolkit
  → 蒸餾鏡像?         → 先 commit PCPT 主 SSoT → 後續手動 sync 至 toolkit
```

### Step 3: 脫敏驗證(僅推 toolkit 時)

```bash
# toolkit 內絕禁 pcpt / pcpt 字面
node deployment/scripts/verify-deployment-docs.cjs

# Phase 1 V-8 必 0 命中
```

### Step 4: 推送策略選擇

| Repo | 推送方式 |
|:----|:----|
| **<your-private-repo>** | `git push origin main`(私人 repo,直接 push)|
| **claude-agent-toolkit** | **必走 release branch + PR**(`git checkout -b release/vX.Y.Z` → `git push origin release/...` → `gh pr create --base master`)— **絕禁** `git push origin master` |

---

## 4. FORBIDDEN(嚴重等級 SUPREME)

- ❌ **在 PCPT-MVP cwd 內推到 toolkit origin**(或反之)— 業務外洩 / toolkit 污染
- ❌ **將業務 code / Stories / Memory / ADR / `pcpt-*` Skill 字面**推到公開 toolkit
- ❌ **直接 `git push origin master`** 至 toolkit(必走 release branch + PR)
- ❌ **toolkit 內含 `pcpt` / `pcpt` 字面**(V-8 強制 0 命中)
- ❌ **同一 commit 同時涉及兩 repo 性質的內容**(必拆 commit)
- ❌ **「研究蒐集池」**(`claude token減量策略研究分析/` 除 `1.專案部屬必讀/` 外)推到 toolkit
- ❌ **跳過 `git remote -v`** 直接推
- ❌ **跳過 verify-deployment-docs.cjs** 推 toolkit
- ❌ **使用 `git push --force` 至 toolkit master**(任何 reset/rebase 必先共識)

---

## 5. 蒸餾鏡像同步 SOP(PCPT → toolkit)

當 PCPT 配置升級需鏡像至 toolkit:

```
1. PCPT 端先 commit + push(主 SSoT 已 ready)
2. cd to toolkit clone
3. git checkout master + git pull
4. git stash(若有未推改動)
5. git checkout -b release/v{X.Y.Z}
6. PowerShell Copy-Item(脫敏處理):
   - PCPT/.claude/hooks/* → toolkit/deployment/config-templates/claude/hooks/
   - PCPT/.claude/rules/* → toolkit/deployment/config-templates/claude/rules/
   - PCPT/.claude/agents/* → toolkit/deployment/config-templates/claude/agents/
   - PCPT/.claude/commands/* → toolkit/deployment/config-templates/claude/commands/
   - PCPT/.context-db/scripts/* → toolkit/deployment/config-templates/context-db/scripts/
   - PCPT/_bmad/bmm/workflows/4-implementation/* → toolkit/deployment/bmad-overlay/4-implementation/
   - PCPT/scripts/verify-*.cjs → toolkit/deployment/scripts/
   - PCPT/claude\ token減量策略研究分析/1.專案部屬必讀/*.md → toolkit/deployment/
7. **脫敏批次**(必執行):
   - pcpt → pcpt / pcpt → PCPT(全文 case-sensitive replace)
   - pcpt.Web → App.Web / pcpt.Platform → Platform
   - pcpt.db → context-memory.db / pcpt.local → app.local
8. node deployment/scripts/verify-deployment-docs.cjs → 必 5-phase ALL PASS
9. git add . && git commit -m "release: vX.Y.Z — ..."
10. git push origin release/v{X.Y.Z}
11. gh pr create --base master --head release/v{X.Y.Z}
```

---

## 6. Self-Check(commit / push 前每次必自問)

1. **「`pwd` + `git remote -v` 我執行過了嗎?」**
2. **「我現在 cwd 對應的 repo 性質,與本次變更內容一致嗎?」**
3. **「若推 toolkit,我跑過 verify-deployment-docs.cjs 並 V-8 為 0 命中嗎?」**
4. **「若推 toolkit,我用 release branch + PR 而非 master 直推嗎?」**
5. **「同一 commit 是否混雜兩種性質?需拆嗎?」**

任一答案 No / 不確定 → **STOP**,先確認再執行。

---

## 7. Incident Records

- **2026-05-01 v1.8.0 推送事件**: 使用者明示「分不清楚要推送到哪個倉庫」並要求建立機械強制機制。本 rule 由此觸發建立。前次因 toolkit 缺乏脫敏 verify 與雙 repo 識別,人工流程脆弱(雖然該次推送成功,但靠人工警惕)。

---

## 8. Related

- `CLAUDE.md` §0(專案憲章 always-on)— 雙倉庫架構認知主表
- `memory/repo_dual_architecture.md`(完整詳述 + 蒸餾流範式)
- `.claude/rules/constitutional-standard.md`(SUPREME 同等級)
- `.claude/rules/deployment-doc-freshness.md`(toolkit 文檔新鮮度)
- `claude token減量策略研究分析/1.專案部屬必讀/SANITIZATION-POLICY.md`(toolkit 脫敏準則)
- `scripts/verify-deployment-docs.cjs`(toolkit CI 自動化)

---

## 9. Version History

| 版本 | 日期 | 變更 |
|:----|:----|:----|
| 1.0.0 | 2026-05-01 | 初版建立。雙倉庫角色矩陣 + Decision Tree + Mandatory Pre-Op Verification 4 步 + 8 條 FORBIDDEN + 鏡像 SOP + Self-Check 5 題。觸發事件:v1.8.0 推送過程使用者明示需機械強制機制 |
