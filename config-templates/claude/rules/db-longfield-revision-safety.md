---
paths:
  - "_bmad/bmm/workflows/**/create-story/**"
  - "_bmad/bmm/workflows/**/dev-story/**"
  - "_bmad/bmm/workflows/**/code-review/**"
  - ".context-db/scripts/upsert-story.js"
---

# DB Long-Field Revision Safety

> **遷移來源**:`.claude/rules/create-story-enrichment.md`(2026-08-01 由 `bwu-9-ac-authoring-safe-revision` 建立,2026-08-04 由 `bwu-13-bmad-mechanism-gap-closure` 遷出獨立成檔)。
> **遷移理由**:兩節治理的行為(長欄位局部修訂安全路徑 / Then 子句行號修後值)三筆來源 debt 全部誕生於 **code-review 階段**,但落點檔 `create-story-enrichment.md` 的 `paths` 與 `Applies When` 皆僅涵蓋 create-story workflow,治理範圍與觸達範圍不一致。本檔 `paths` 同時涵蓋 create-story / dev-story / code-review 三 workflow + `upsert-story.js`,使該紀律在其真正治理的場景中都能被載入。**遷移的是規範文字,不是能力**——`upsert-story.js` 的 `--inline` / `--merge` 能力本身完全不動,詳見下方 IDD-STR-003 界線措辭。

---

## 長欄位局部修訂安全路徑

**核心問題**:`stories` 表的長 markdown 欄位(`acceptance_criteria` / `testing_strategy` 等)只能整欄覆寫。當措辭層級的小錯誤(數量詞與列舉不符、案例名少一段、行號沿用修前值)需要修正時,「改一個字」與「重寫萬字欄位」是同一個動作 —— 整欄覆寫對含大量反引號 / code fence 的欄位毀損風險極高,使這類小錯誤被理性 DEFER 後永久累積成無人敢動的 debt。

### 觸發條件

修訂 `stories` 表**長 markdown 欄位**(欄位現值 **≥ 5,000 字元** 或 **含 code fence**)時,以下路徑為**強制**,不得走整欄覆寫。

### 正確作法 — `--merge <story-id> <json-file>` 三參數檔案路徑形式

1. 用 Write 工具(或等效的程式化寫檔手段)產生 patch JSON 檔,內容為 `{"{欄位名}": "{完整新值}"}`(只需帶要修改的欄位,`--merge` 為部分更新)
2. 執行:

```bash
node .context-db/scripts/upsert-story.js --merge <story-id> <json-file-path>
```

3. 確認 stdout 含 `🔀 Story <id> 已 merge 更新` 且不含 `❌ Fatal`

### 禁用 `--inline` 承載長欄位內容的理由

`--inline '<json>'` 將 JSON 內容當作 shell 命令列參數傳遞,長欄位內密佈的反引號 / 管線符號 / code fence 三個反引號會被 shell 解讀為命令替換 / 管線操作,造成內容截斷或毀損。**JSON 檔案格式內反引號不需跳脫、換行以 `\n` 表示**,故長 markdown 欄位可用檔案路徑形式原樣承載,完全避開 shell 轉義層。

> ⚠️ **本條款僅界定「長欄位場景禁用 `--inline`」,不得解讀或執行為移除、削減 `--inline` / `--merge` 能力本身** —— `--inline` 對短欄位 / 無反引號內容仍是合法且常用的形式;`--merge` 模式(含 `--inline` 與檔案路徑兩種子形式)本身是 DB-first Story 寫入的基礎機制。對齊 `IDD-STR-003`(`docs/technical-decisions/ADR-IDD-STR-003-db-first-story-繞過-create-story-checklist-epic-mqv.md`)forbidden change「請勿移除 upsert-story.js --merge 模式」。

### 兩項寫入層前提(動手前必知)

1. **`_doUpsert` 對長欄位執行 `applyMarkdownNormalization`**(`.context-db/scripts/upsert-story.js:142-143` 呼叫點 + `:86-90` `MARKDOWN_BREAK_FIELDS` 清單,含 `acceptance_criteria` / `testing_strategy` 等 10 個欄位):此 normalize 對 list marker / heading / ordered-list 前補段落空行,regex **不區分 code fence 內外**。**修訂應限於行內字元替換**(不引入新的 `\n` + list marker / heading / 數字. 組合);若修訂會引入新行結構,動手前須先對現值與擬修訂後值分別跑 normalize,驗證兩者皆為 **fixed point**(即 `normalizeMarkdownBreaks(text) === text`,`.context-db/scripts/markdown-normalize.js:28-37`),避免寫入層附帶插入非預期空行。
2. **`stories.updated_at` 必然刷新**,為唯一合法且不可避免的附帶變更。

### CLI 完整契約參照

```bash
node upsert-story.js <json-file>                              # 完整 upsert
node upsert-story.js --inline '<json>'                        # 完整 upsert (inline JSON)
node upsert-story.js --merge <story-id> <json-file>            # 部分更新 — 長欄位安全路徑
node upsert-story.js --merge <story-id> --inline '<json>'      # 部分更新 (inline) — 僅限短欄位
```

（`.context-db/scripts/upsert-story.js:363-372` usage 區塊 + `:381-390` `--merge` 解析邏輯 + `:375-378` `readJsonFile` 附帶 BOM strip)

---

## Then 子句行號須為修後預期值

**根因**:create 階段撰寫 AC 的 Then 子句時,常直接沿用 step-03(讀碼分析)當下讀到的行號,但未推演「執行本 AC 之後」這些行號會如何位移 —— 若同一 AC 內較前面的修改(如插入一行)會使後面引用點的行號下移,而 AC 文字仍寫修前行號,會造成 dev 階段驗證失敗或誤判。

### 條款

AC 的 Then 子句列舉原始碼行號時,**該行號須為「執行本 AC 之後」的預期值**,並於文字中明確標註(如「修後預期 `:144`」)。若同一 AC 內含多個引用點,且前面的修改會使後面引用點位移,**須逐點推演**每個引用點的修後行號,不得整段沿用 step-03 讀碼時的修前行號。

### 具體反例(本次觸發事件)

`bwu-6-hooks-collateral-hygiene` AC1(b) 的兩個呼叫點皆在 `.claude/skills/tianji-pavilion/assets/hooks/ssot-sync-checker.js`:第一個呼叫點(`:114`)修改為加入獨佔一行的 `'PostToolUse'` 引數,使該檔案自 `:114` 之後的所有行**下移一行** —— 第二個呼叫點因而從修前的 `:143` 位移至修後的 `:144`。但 AC1(b) 文字仍寫 `ssot-sync-checker.js:143`,未反映修後位移,形成 `TD-BWU6-AC1B-LINE-NUMBER-STALE-AFTER-OWN-EDIT` debt(已由 `bwu-9-ac-authoring-safe-revision` 修復)。

### Self-Check(撰寫含行號的 Then 子句前必問)

1. 本 AC 的 When 子句是否會修改「引用行號所在檔案」的行數(新增/刪除行)?
2. 若是,本 AC 內是否有**多個**引用點位於同一檔案?
3. 較前面的引用點修改,是否會使較後面的引用點行號位移?
4. 若有位移,Then 子句是否已標註為「修後預期」而非沿用讀碼時的原始值?

任一步驟未確認 → STOP,重新推演修後行號。

---

## Related

- `.claude/rules/create-story-enrichment.md` — create-story 階段其餘紀律的正典落點(本檔內容曾是該檔一部分,遷出後該檔留具名 pointer)
- `.claude/rules/story-lifecycle-invariants.md` — Story 狀態機不變量
- `docs/technical-decisions/ADR-IDD-STR-003-db-first-story-繞過-create-story-checklist-epic-mqv.md` — `--merge` 能力邊界的治理決策來源

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.0.0** | **2026-08-04** | 初版建立。自 `.claude/rules/create-story-enrichment.md` v1.1.0 遷出「長欄位局部修訂安全路徑」+「Then 子句行號須為修後預期值」兩節(內容逐字保留,含 IDD-STR-003 界線措辭與 bwu-6 `:143`→`:144` 反例),`paths` 改涵蓋 create-story / dev-story / code-review 三 workflow + `upsert-story.js`(原檔僅涵蓋 create-story,而三筆觸發本兩節建立的來源 debt 全部誕生於 code-review 階段)。觸發:`bwu-13-bmad-mechanism-gap-closure` 消費 `TD-BWU9-LONGFIELD-DISCIPLINE-REACH-GAP`。走 `Skill(skill="cc-config-author")`。 |
