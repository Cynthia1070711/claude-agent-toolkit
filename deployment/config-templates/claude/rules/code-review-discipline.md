---
name: code-review-discipline
description: CR 12 條紀律指標型集合檔 — 重建斷鏈 SSoT,終結跨 4 個 CR 視窗重複踩坑的懸空指標
version: 1.0.0
updated: 2026-07-29
paths:
  - "_bmad/bmm/workflows/4-implementation/code-review/**"
  - "docs/implementation-artifacts/reviews/**"
  - "docs/tracking/**"
---

# Code Review Discipline — 12 條指標型集合

> **重建背景**: 本檔案原為近 30 天 CR 違規並列第一的目標(MEMORY.md「CR Discipline 集合」bullet + 12 支 memory stub 的 `promoted_to` frontmatter 皆指向此檔),但實際從未存在(39 條 rules 中 0 命中),致 whp-5 / whp-7 / bwu-4 / bwu-5 四個 CR 視窗各自重複調查同一懸空指標。12 支 stub 原文已於 2026-05-05 memory 升格時清空為 30 行空殼,且該 memory 目錄非 git repo(不可復原),故本檔採**指標型重建**:每條一行規則陳述,優先 `See` 指向現存 SSoT(不重複展開全文);若無其他既存 SSoT 涵蓋該主題,本節陳述即為現行唯一權威定義。
>
> **12 支對應 memory stub**(位於 Claude Code 使用者層 auto-memory 目錄,非本 repo):`feedback_cr_must_run_tsc_not_just_vitest.md`(§1)/ `feedback_cr_5min_boyscout_default.md`(§2)/ `feedback_cr_must_try_fix_before_defer.md`(§3)/ `reference_cr_signature_based_skip_pattern.md`(§4)/ `reference_cr_gitignored_file_list_glob_pattern.md`(§5)/ `feedback_cr_score_includes_fixed.md`(§6)/ `feedback_direct_fix_over_new_story.md`(§7)/ `feedback_cr_autofix_no_ask.md`(§8)/ `feedback_cr_must_independent_backfill.md`(§9)/ `feedback_cr_phase_chrome_mcp_marker_independent.md`(§10)/ `feedback_cr_defer_verify_target_status.md`(§11)/ `feedback_parity_claim_must_read_pattern.md`(§12)。

---

## §1 tsc 型別檢查不可省

CR 對 TypeScript(或其他強型別語言)相關程式碼變更,不得只憑 Vitest / xUnit 測試綠燈判定過關 —— 測試 mock 可能繞過型別系統,必須額外確認 `tsc --noEmit`(或對應編譯/型別檢查指令)通過。

See: 現無其他既存 SSoT,本節為現行唯一權威定義(原文不可復原,詳見上方重建背景)。

## §2 5-Minute Rule + Boy Scout 為預設處理方式

CR 發現的技術債若符合 5-Minute 條件(≤5 行 / 0 跨檔依賴 / 0 副作用 / 0 test break 風險 / ≤5 分鐘可完成),禁止標記 WON'T FIX 或 DEFERRED,必須直接 inline 修復;dev-story 階段對當前 Story `file_list` 反查 open debts 亦適用同一 Boy Scout Sweep 標準。

See: `.claude/skills/phycool-debt-registry/references/rules-and-automation.md` §6(5-Minute Rule)+ §7(Boy Scout Rule)。

## §3 DEFER/ACCEPT 前必先實際試修

CR 對非 FIXED 項目(DEFERRED/ACCEPTED)分類前,必須實際嘗試修復(定位 → 試修 → 驗測 → 判斷),禁止僅憑估算成本(如「估計需要 20 行」)未實際動手就分類;FixCost ≤ S=2 禁止 ACCEPT/DEFER。

See: `.claude/rules/cr-debt-doc-audit.md` Phase A A2(含 A2.1 周邊基礎設施 Glob 驗證 / A2.2 FixCost≥M=5 必 spike 實測 / A2.3 Pre-production 特殊約束)。

## §4 Signature-based 重複判定跳過樣式

CR 對重複出現、已判定過的 finding 類型,可用 signature(問題特徵樣式,如錯誤訊息 / pattern / 受影響檔案類型組合)比對既有已處理紀錄,命中即可跳過重複深度分析並沿用先前判定;但比對邏輯本身須避免過度寬鬆而漏放真正的新問題。

See: 現無其他既存 SSoT,本節為現行唯一權威定義(原文不可復原,詳見上方重建背景)。

## §5 Gitignored 目錄 file_list 驗證必用 glob-aware 工具

CR 驗證 file_list / 受影響檔案清單時,若範圍含 `.gitignore` 排除但仍受 git 追蹤的目錄(如 `dist/`),Grep 工具會依 `.gitignore` 規則略過而回傳假性 0 命中,必須改用 Bash `grep -r`(或等效不受 `.gitignore` 影響的工具)驗證,不可只憑 Grep 工具零命中判定乾淨。

See: 現無其他既存 SSoT,本節為現行唯一權威定義(`bwu-6-hooks-collateral-hygiene` dev_notes D-3 為同一模式的獨立實例佐證:`dist/` 對 Grep 工具全盲,驗證改走 Bash `grep -r`)。

## §6 CR Score 計算須反映已修復項目

CR 完成後的 `cr_score` / `cr_issues_fixed` / `cr_issues_deferred` / `cr_summary` 等統計欄位,必須反映最終(含追加修復後)結果,不可沿用初次掃描時的舊值。

See: `.claude/rules/cr-debt-doc-audit.md` Phase A A4。

## §7 可直接修復優先於另開新 Story

CR 發現屬程式碼可直接修復範疇(非需求變更 / 非跨團隊協調)的問題,優先在本卡內直接修復,不為了流程形式另開新 Story 追蹤小型技術修正 —— 除非修復規模超出本卡 file_list / scope 邊界或需要獨立驗收。

See: 現無其他既存 SSoT,本節為現行唯一權威定義(原文不可復原,詳見上方重建背景)。

## §8 Auto-fix 階段禁詢問使用者

code-review workflow Step 4 auto-fix 為強制執行,直接修復不詢問使用者許可 —— Step 1→5 連續執行,不得在 Step 之間插入 [c]/[y]/[a] 確認提示。

See: `_bmad/bmm/workflows/4-implementation/code-review/workflow.md`(Step 4 auto-fix mandate)。

## §9 CR 階段 tasks-backfill 必須獨立驗證

`/tasks-backfill-verify` 必須在 dev-story 與 code-review 兩階段各自獨立調用,不可因 dev-story 已回填就跳過 —— dev 是自證回填,CR 是對抗審查,兩者角色不可互換,CR 必須親自重新 Read 每個 task 涉及的 code 並重新驗證 file:line。

See: `.claude/rules/tasks-backfill.md` §CR Phase Independence。

## §10 CR 階段 Chrome MCP marker 須獨立產出

涉及 UI 的 Story,CR 階段的 Chrome MCP Live Verification 必須獨立於 dev-story 階段的 Vitest 驗證重新執行(讀 DOM computed style / 互動驗證 / 截圖),不可用 dev 階段已跑過的驗證結果替代。

See: `.claude/rules/tasks-backfill.md` §UI Task Chrome MCP Live Check 軌 2。

## §11 DEFER 前必驗證 target_story 狀態

CR 將問題分類為 DEFERRED 時,`target_story` 欄位不得為 NULL,且必須以 `search_stories({target_story})` 確認該 Story 確實存在於 DB,不可標記轉移給一個不存在的目標。

See: `.claude/rules/cr-debt-doc-audit.md` Phase A A3。

## §12 Parity 宣稱必須實際 Read 對照驗證

宣稱兩端(如 dev/prod、程式碼/文檔、前端/後端)行為一致(parity)前,必須實際執行對照驗證(build + live 測試 + Read 原始碼),不可僅憑印象或部分測試(如僅 Vitest jsdom / 僅 dev mode)就宣稱一致。

See: `.claude/rules/cr-web-mandate.md`(完整 dev/prod parity 強制驗證流程,含 FORBIDDEN + Self-Check)。

---

## Related

- `.claude/rules/cr-debt-doc-audit.md` — CR Post-Fix Audit Gate(§3 / §6 / §11 SSoT 來源)
- `.claude/rules/tasks-backfill.md` — Tasks Backfill Mandatory Rules(§9 / §10 SSoT 來源)
- `.claude/rules/cr-web-mandate.md` — CR-WEB-MANDATE(§12 SSoT 來源)
- `.claude/skills/phycool-debt-registry/references/rules-and-automation.md` — 5-Min + Boy Scout Rule(§2 SSoT 來源)
- `_bmad/bmm/workflows/4-implementation/code-review/workflow.md` — code-review BMAD workflow(§8 SSoT 來源)

---

## Incident Records

- **2026-05-05 ENV-05 舊裁定與本次重建的關係**: `專案環境配置健檢/stories/ENV-05-single-engine-mode-ssot-establishment.md` + `專案環境配置健檢/03-執行計畫清單.md` 曾裁定「不重建 code-review-discipline」,改以 `add_context` reference 覆蓋。該解法經 3 個月實證失效 —— whp-5 / whp-7 / bwu-4 / bwu-5 四個 CR 視窗各自重新踩到同一懸空指標並花費調查成本。中控 2026-07-29 於 MEMORY.md 加註「→ bwu-6 重建」構成較新裁定,`bwu-6-hooks-collateral-hygiene` 據此執行本檔重建。
- **2026-07-29 bwu-6-hooks-collateral-hygiene**: 本檔重建。承接 debt `TD-RULES-CODE-REVIEW-DISCIPLINE-DANGLING-REF`。12 支 memory stub 原文已於 2026-05-05 升格時清空為空殼,且 memory 目錄非 git repo 不可復原,故採指標型重建(§1 / §4 / §5 / §7 無其他既存 SSoT,本檔即為現行唯一權威定義;其餘 8 條指向現存 rule / skill / workflow 檔)。

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| 1.0.0 | 2026-07-29 | 初版重建。承接 bwu-5 CR §7 debt `TD-RULES-CODE-REVIEW-DISCIPLINE-DANGLING-REF`。12 條指標型集合:§1 / §4 / §5 / §7 無既存 SSoT 故本檔即為權威定義;§2 → `phycool-debt-registry` 5-Min/Boy Scout Rule;§3 / §6 / §11 → `cr-debt-doc-audit.md` Phase A;§8 → code-review BMAD `workflow.md`;§9 / §10 → `tasks-backfill.md`;§12 → `cr-web-mandate.md`。走 `Skill(skill="cc-config-author")`。 |
