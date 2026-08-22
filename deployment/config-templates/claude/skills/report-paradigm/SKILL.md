---
name: report-paradigm
description: Use when 產出或更新任務報告(progress / completion / handoff / 階段 / 執行樹 / 總結)、生成或編輯報告 HTML、建立或更新功能模組總覽卡片、整併散落報告檔、報告版本演進升版時。PhyCool 任務報告文檔範式紀律(原 doc-consolidation-discipline rule v1.2.0 全文遷移)— 報告集中治理(統一資料夾 / 總計畫章節化 / 禁另建新報告檔 / 安全整合刪除流程)+ HTML 報告範式(多頁架構 report-assets / Mermaid 圖表 / 模組總覽卡片六要素全卡等高)。觸發詞:報告範式 / 任務報告 / 報告 HTML / 多頁架構 / report-assets / 總覽卡片 / 卡片範式 / 六要素 / 報告整合 / 散落報告 / handoff / completion report / Mermaid / 安全刪除歸檔 / 報告升版。
version: 1.2.0
updated: 2026-06-11
author: CC-OPUS
created: 2026-06-06
watches:
  - glob: "docs/tracking/active/phycool資訊校正任務/校正報告/report-assets/css/report.css"
    domain: report-paradigm
  - glob: "claude token減量策略研究分析/_HTML風格範式.html"
    domain: report-paradigm
---

# Report Paradigm — 任務報告文檔範式紀律(Discipline 型)

> **遷移來源**:`.claude/rules/doc-consolidation-discipline.md` v1.2.0(2026-06-06 使用者裁定全文遷移為 skill 後刪除原 rule)。
> **遷移理由**:paths-scoped rule 受 Bug #23478 影響 **Write 工具觸發時不載入**(生成報告恰是 Write 場景 → 規範必缺席);skill 採漸進式揭露(description 常駐 ~2% budget,全文按需載入),範式內容與更新集中此處。配套機械 hook `report-paradigm-guard.js`(PostToolUse)偵測報告類檔案寫入時注入調用提醒,補足「生成時自動在場」。
> **適用範圍**:**所有** PhyCool 多 session / 多階段任務 / 專案的報告文檔(非綁定任一特定任務)。

---

## 1. Purpose

任何任務 / 專案產生的報告文檔(progress / completion / handoff / 階段 / 執行樹 / 總結),**必須集中單一資料夾 + 採「總計畫 SSoT + 章節化」結構 + 依章節更新同一份文檔**,禁每次任務完成另建新報告檔。HTML 報告必遵循多頁架構與模組總覽卡片範式。從源頭杜絕「資料散亂、跨資料夾、資訊不同步」。

---

## 2. Applies When

| # | 情境 | 信號 |
|:-:|:----|:----|
| 1 | 產生任務進度 / 完成 / 階段報告 | progress report / completion report / 階段總結 |
| 2 | 產生 / 更新交接文檔 | handoff / mid-session brief / 交接任務 |
| 3 | 建立執行樹 / 推進地圖 | execution-tree / 推進地圖(另見 `execution-tree-doc-sop` rule 管格式) |
| 4 | 總計畫 / 策略報告版本演進 | Master_Plan / Strategy_Report / FastTrack 升版 |
| 5 | 報告對應 HTML 視覺化 | *.html 進度報告(**生成報告 HTML 必載本 skill**) |
| 6 | 多 session 任務跨對話接續 | 新 session 產出延續性文檔 |
| 7 | 功能模組總覽卡片建立 / 狀態變遷 | 總覽 / 索引頁逐模組卡片 |

---

## 3. 5 條核心規範(SUPREME for 文檔治理)

1. **統一資料夾**: 一個任務 / 專案的所有報告集中**單一資料夾**(如 `<任務>/實施報告/` 或 `docs/tracking/<epic>/`),禁散落根層 + 子目錄 + 他處。
2. **總計畫 SSoT + 章節化**: 一份**總計畫 SSoT**(`00-總計畫-<任務>.md`,含願景 / 決策 / 總進度 / 架構)+ 各**階段 / 章節文檔**(`01-<階段>.md` ~ `0N-<階段>.md`)。
3. **依章節更新同一份文檔**: 任務完成後**更新對應階段章節文檔**,**禁另建新報告檔**。版本演進 / handoff / completion report 一律**併入對應章節**(用 §版本歷程 / §里程碑 子節累積,而非新檔)。
4. **HTML 對應同檔更新 + 多頁架構 + 卡片範式**: 每章節對應**一份 HTML** 同檔加章節;禁每次另建新 HTML 報告。三套 HTML 範式詳見 references(主檔僅摘要):
   - **多頁架構**(2026-05-26 確立):根目錄只留 `00-總計畫(index)` 一個 HTML 入口 + 子目錄 `report-assets/{css,js,pages}/` 共用 asset(DRY 抽 ~95% 重複 CSS/JS);**禁各 HTML 內嵌重複 `<style>`/`<script>`**。詳 [references/html-multipage-paradigm.md](references/html-multipage-paradigm.md)。
   - **圖表**:甘特圖 / 依賴圖用 Mermaid CDN(`mermaid@11` esm),離線 fallback 顯示原始碼。同上 reference。
   - **模組總覽卡片六要素範式**(2026-06-05 確立 · 使用者裁定;序號釋義 2026-06-06 升版):總覽 / 索引頁功能模組卡片必含 ① NO 序號(左上,**純數字流水號依序排開** 1,2,3…非模組代號)② 名稱(格式「{名稱} · {代號}」,代號移入名稱保留追溯)③ 三組狀態標籤可複選(類型 × 校正階段 × 開發狀態,事件標籤註時間)④ 用途說明 ≤5 行 ⑤ 備註 ≤3 行 ⑥ 最後更新時間,**全卡等高 + 按序號排序**。完整規格(標籤色彩表 / 時間規則 / CSS class 對照 / HTML 模板)詳 [references/module-card-paradigm.md](references/module-card-paradigm.md) + 複製即用模板 [assets/mcard-template.html](assets/mcard-template.html)。
   - **模組報告內子功能項目狀態標註**(2026-06-11 確立 · 使用者裁定):模組報告(`module-{id}.html`)子功能項目(★ 校正速覽六欄表格 row / 章節卡片)必逐項標**開發狀態**,與總覽卡片開發狀態(✦/⚒/▢)雙層對應 — 已完成→`✅ 已完成<i>日期時間</i>`;未完成→備註原因 + 後續完成階段(拆子卡/defer/歸他軌/W2 端點)。鐵則:模組標「✦ 開發完成」前提=報告內子功能皆完成;有 defer 子功能則模組標「⚒ 開發中」+ 該子功能註原因+後續階段(**禁模組標完成但內含未註明 defer 子功能=報告誤導**)。詳 [references/module-card-paradigm.md](references/module-card-paradigm.md) §模組報告內子功能項目狀態標註。
5. **安全整合刪除流程**(見 §5): 整併舊散落檔時,**先彙整 → 確認整合完成 → 才刪 / 歸檔 → 刪前再次確認關鍵內容在主文檔**,防資訊遺失。

---

## 4. Mandatory Flow

### 4.1 新報告產出時(日常)
```
任務完成一階段 → 要寫報告
  ↓
判斷: 該任務報告資料夾是否已存在 00-總計畫 + 章節文檔?
  ├─ 是 → 更新對應階段章節文檔(Edit 既有 · 新增 §里程碑/§版本歷程 子節)· 禁另建新檔
  └─ 否(首次)→ 建統一資料夾 + 00-總計畫 + 對應章節文檔
  ↓
HTML(若需): 更新對應章節 HTML 同檔加章節 · 禁另建;
新報告體系首建 HTML → 走多頁架構(index + report-assets)+ 卡片範式(references 兩檔)
```

### 4.2 整併既有散落文檔時(治理)
見 §5 安全整合刪除流程(先彙整 → 確認 → 才刪)。

---

## 5. 安全整合刪除流程(防資訊遺失 · 鐵則)

> **鐵則**: 先彙整 → 確認整合完成 → 才刪 / 歸檔 → 刪前再次確認該文檔關鍵內容已在主文檔。

```
Step 1 完整清查: Glob 列出該任務所有散落報告檔 + 分類(總計畫/階段/handoff/HTML)
Step 2 建主文檔骨架: 統一資料夾 + 00-總計畫 + 0N-章節
Step 3 逐份深讀彙整: Read 每散落檔 → 完整保留關鍵內容(非摘要丟失)→ 彙整進對應章節
Step 4 刪前 grep 複查: 對每個待刪檔,grep 其代表性關鍵內容是否在主文檔(確認在 → 才可處置)
Step 5 安全處置: 移 `_archive/`(優先 · 可逆)或刪除。gitignored 檔真刪不可逆 → 必移 _archive
```

---

## 6. FORBIDDEN(三元素格式)

### F1 — 任務完成另建新報告檔(不併入章節)
- **Forbidden**: 每階段 / 每 session 完成即新建 `<任務>-<日期>-report.md/html`,不更新既有章節文檔
- **Common Rationalization**: 「新報告比較清楚」/「不想動既有文檔」
- **Red Flag**: 同任務資料夾出現 ≥ 3 份同性質報告(completion / handoff / progress)各自獨立檔

### F2 — 報告散落多資料夾
- **Forbidden**: 同任務報告分散根層 + 子目錄 + 他處
- **Common Rationalization**: 「放手邊方便」
- **Red Flag**: 同任務關鍵詞文檔出現在 ≥ 2 個不相關資料夾

### F3 — 版本演進另建新檔(v1→v2→v3 各獨立)
- **Forbidden**: Master_Plan_v1 / v1.1 / v1.2 / v1.3 / Ultimate 各自為檔不整併
- **Common Rationalization**: 「保留歷史版本」(歷史應入 §版本歷程 子節 + 舊檔歸檔,非主目錄並存)
- **Red Flag**: 同一文檔 ≥ 3 個版本檔在主目錄並存

### F4 — 整合未確認就刪除(資訊遺失風險)
- **Forbidden**: 散落檔內容未 grep 確認在主文檔就刪除(尤其 gitignored 不可逆)
- **Common Rationalization**: 「subagent 說整合完了」/「應該都搬過去了」
- **Red Flag**: transcript 缺 §5 Step 4 刪前 grep 複查;直接 `Remove-Item` / `rm` 散落檔

### F5 — 報告 HTML 不遵循多頁架構 / 卡片不遵循六要素範式
- **Forbidden**: 新 HTML 內嵌重複 `<style>`/`<script>` 不抽共用檔;總覽模組卡片缺序號 / 標籤無時間 / 不等高 / 用舊版自由格式;模組報告子功能項目未逐項標開發狀態 / 模組總覽標「✦ 開發完成」但報告內含未完成子功能不註原因+後續階段
- **Common Rationalization**: 「單頁報告內嵌比較快」/「卡片內容塞不下五行限制」/「這次先簡單做」/「模組大致完成就標 ✦,defer 子功能之後再說」
- **Red Flag**: 新報告 HTML `<style>` 區塊 > 50 行重複既有 report.css;總覽出現無 `mcard-no` 序號的模組卡;模組標 `mt-dev-done` 但報告速覽六欄/章節有子功能無「✅ 已完成」標註且無 defer 原因+後續階段

---

## 7. Self-Check(產報告 / 整併文檔前必自問 5 題)

1. **「該任務報告資料夾是否已有 00-總計畫 + 章節文檔?有 → 更新章節而非另建?」** → 否(另建)→ STOP
2. **「要產的報告是否該併入既有章節(version / handoff / completion)?」** → 是 → 併入,不另建
3. **「整併刪除前,有對每個待刪檔 grep 確認關鍵內容在主文檔?」** → 否 → STOP,先複查(§5 Step 4)
4. **「gitignored 檔是否用移 _archive 而非真刪?」** → 否(真刪)→ STOP,改歸檔(不可逆風險)
5. **「生成報告 HTML / 總覽卡片時,是否已讀 references 兩檔範式?」** → 否 → STOP,先讀(多頁架構 + 卡片六要素)

任一答案 No → **STOP**。

---

## 8. 機械守護(配套 hook)

`.claude/hooks/report-paradigm-guard.js`(PostToolUse,matcher `Edit|Write`,advisory 不阻擋):偵測報告類檔案寫入(`*report*.{md,html}` / `*handoff*` / `*completion*` / 執行樹 / 推進地圖 / 總結 / Master_Plan / Strategy_Report / 實施報告 / 校正報告)→ 注入 additionalContext 提示調用本 skill。**此 hook 是本 skill 的「生成時自動在場」橋樑**(根除原 rule 的 Write 不觸發缺陷):rule paths 載入靠 Read 觸發(Bug #23478),hook 改為機械偵測 Write/Edit → 提示 → skill 按需全文載入。

---

## 9. Incident Records

### 2026-05-25 — 原 rule 觸發建立
**事件**: 「智能開發環境賦能」任務累積 **25+ 份報告**(總計畫 5 版 + handoff v3~v6 + 4 階段執行樹 + 10 HTML completion report)散落根層 + 實施報告/,每次任務完成另建新檔,造成資料散亂、跨檔 drift、資訊不同步。使用者裁決整合為「總計畫 + 章節」結構並立為通用規範。
**處理**: 整合為 `00-總計畫 + 01-04 Stage`(md + HTML)· 30 舊檔移 `_archive/`(先彙整 → grep 確認 → 才歸檔,零遺失)· 原 rule v1.0.0 建立。Memory id=4371。

### 2026-06-05 — 卡片六要素範式確立
**事件**: 使用者裁定總覽卡片內容六要素規範(序號 / 名稱 / 三組標籤含時間 / 說明 ≤5 行 / 備註 ≤3 行 / 更新時間 / 全卡等高),後台總覽 28 卡首次落地(原 rule v1.2.0)。

### 2026-06-06 — rule → skill 遷移(本 skill 建立)
**事件**: 卡片範式固化入 rule 時,Bug #23478 暴露 paths rule **Write 不觸發** — 生成報告(Write)時規範必缺席,「rules 沒有作用」。Party Mode 收斂(Memory id=4981)後使用者裁定:**rule 全文遷移為本 skill(漸進式揭露)+ 機械 hook 管控 + 刪除原 rule**。走 skill-builder Mode A + hooks-mechanization。

---

## 10. Related(鄰近規範區別界定)

| 規範 | 管轄 | 與本 skill 區別 |
|:----|:----|:----|
| `.claude/rules/execution-tree-doc-sop.md` | 執行樹 / 推進地圖**格式**(≤100 行 + 6 章節)| 本 skill 管報告**整合結構 + HTML 範式**,execution-tree 是其中一類章節文檔的格式規範 |
| `.claude/rules/handoff-doc-discipline.md` | 跨 session 交接主檔(6 章節 ≤120 行 + 歷史子目錄)| 交接文檔特化;其歸檔流程沿用本 skill §5 安全整合刪除流程 |
| `.claude/rules/deployment-doc-freshness.md` | 部署指南新鮮度同步 | 本 skill 管**任務報告**治理,非部署指南 |
| `.claude/rules/spec-timeliness.md` | spec 文檔時效(code 為真相)| 本 skill 管報告**整合與範式**,非 spec 時效 |
| `.claude/rules/db-first-no-md-mirror.md` | Story **禁 .md 鏡像**(DB-first)| 本 skill 管**報告類**文檔(非 Story),互補 |
| `ui-ux-pro-max` skill | UI/UX 設計智庫(50 styles / tokens / a11y)| 本 skill 管 PhyCool 報告**體系治理範式**;設計細節(配色 / 字體 / 特效)查 ui-ux-pro-max |
| `claude token減量策略研究分析/_HTML風格範式.html` | HTML 視覺風格範本檔(複製起手用)| 本 skill 管規範,範本檔管視覺元件實作起點 |

---

## §Pressure Test(Discipline 型必備)

### Iron Laws

| # | Iron Law | 等級 |
|:-:|:--|:--:|
| IL1 | 禁任務完成另建新報告檔(必併入既有章節文檔)| SUPREME |
| IL2 | 禁整合未經 §5 Step 4 grep 複查就刪除散落檔(gitignored 必歸檔非真刪)| SUPREME |
| IL3 | 禁報告 HTML 內嵌重複 style/script(必走多頁架構共用檔)+ 禁總覽卡片偏離六要素範式 | SUPREME |

### Combined Pressure Tests

**Test 1**:「session 收尾趕時間,任務報告資料夾已有 00-總計畫,Agent 是否會圖快新建 `<task>-completion-2026-XX-XX.md` 而非更新章節?」
- **違規徵兆**:Write 新檔名含日期 + completion/report 字樣;既有章節文檔 mtime 未變
- **正確行為**:Edit 既有章節文檔加 §里程碑 子節(IL1)

**Test 2**:「整併 30 個散落報告,subagent 回報『已全部彙整』,Agent 是否會直接批次刪除原檔?」
- **違規徵兆**:無逐檔 grep 複查記錄即 Remove-Item;gitignored 檔真刪
- **正確行為**:對每個待刪檔 grep 代表性內容確認在主文檔 → 移 _archive(IL2)

**Test 3**:「快速做一頁臨時報告 HTML,Agent 是否會內嵌 200 行 style『先求有』?新模組卡是否會沿用舊 rcard 自由格式『反正之後再改』?」
- **違規徵兆**:新 HTML `<style>` 大段重複 report.css;卡片無序號 / 標籤無時間 / 不等高
- **正確行為**:引用共用 report-assets;卡片走 references/module-card-paradigm.md + assets 模板(IL3)

### Rationalization Table

| Iron Law 違規 | Rationalization 來源 |
|:--|:--|
| IL1 另建新報告檔 | 「新報告比較清楚」「不想動既有文檔」(2026-05-25 賦能任務 25+ 檔散亂實證)|
| IL2 未複查即刪 | 「subagent 說整合完了」(2026-05-26 子代理複製非移動 → 根殘留重複教訓)|
| IL3 內嵌 style | 「單頁比較快」(2026-05-26 實施報告 5 HTML 各內嵌 ~170 行重複 CSS 實證)|
| IL3 卡片自由格式 | 「內容塞不下行數限制」「先簡單做」(預防性,2026-06-05 範式確立)|

### Red Flags

- Write 檔名含 `-report-` / `-completion-` / `-handoff-` + 日期 → IL1
- `Remove-Item` / `rm` 報告檔且 transcript 無 grep 複查 → IL2
- 新 `.html` 含 `<style>` > 50 行且內容與 report.css 重複 → IL3
- 總覽卡片 HTML 無 `mcard-no` / 標籤無 `<i>` 時間 / 用已退役 `rcard` 自由格式 → IL3

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.2.0** | **2026-06-11** | **新增「模組報告內子功能項目狀態標註」範式**(使用者裁定 · 對齊後台軌中控任務紀律第 7 條)。現有六要素只到總覽卡片模組層(③ 開發狀態 mt-dev-*),補**子功能層**:模組報告(module-{id}.html)速覽六欄/章節子功能項目逐項標已完成(`✅ 已完成<i>日期時間</i>`)/未完成(原因+後續完成階段);鐵則=模組標「✦ 開發完成」前提為子功能皆完成,有 defer 則標「⚒ 開發中」+ 子功能註原因+後續階段。同步 references/module-card-paradigm.md §模組報告內子功能項目狀態標註 + SKILL.md §3#4 sub-bullet + §6 F5 三元素。觸發:2026-06-11 後台軌 4 卡正規化重跑暴露「模組標完成但內含 defer 子功能(m0-10 AC2→m0-10b / AC4 AIOS defer)」報告誤導風險。走 skill-builder Mode B。 |
| **1.1.0** | **2026-06-06** | **卡片 NO 序號釋義升版**(使用者新裁定,前台軌 00:44 留言知會):NO 序號徽章 = **純數字流水號依序排開**(1,2,3…全局連續),非模組代號;模組代號移入名稱欄「{名稱} · {代號}」格式保留追溯。同步:SKILL.md §3#4 摘要 + references/module-card-paradigm.md 規格表(#1/#2/排序規則)+ assets/mcard-template.html 範例。落地:前台總覽 54 卡(1-54,前台軌 commit 25b9dfcb)+ 後台總覽 28 卡(1-28,本次)。走 skill-builder Mode B。 |
| **1.0.0** | **2026-06-06** | 初版建立(skill-builder Mode A)。**載體遷移**:`.claude/rules/doc-consolidation-discipline.md` v1.2.0 全文遷移為本 skill 後刪除原 rule(使用者裁定 2026-06-06;根因 Bug #23478 paths rule Write 不觸發 → 生成報告時規範缺席,Party Mode 收斂 Memory id=4981)。承接原 rule 完整內容(5 核心規範 / Mandatory Flow / 安全刪除流程 / F1-F4 + 新增 F5 / Self-Check 4→5 題)+ 拆分 references/{html-multipage-paradigm, module-card-paradigm}.md + assets/mcard-template.html(漸進式揭露)。配套機械 hook `report-paradigm-guard.js`(PostToolUse advisory,走 hooks-mechanization 7-step)+ settings.json 註冊。Discipline 型:3 Iron Laws + 3 Combined Tests + Rationalization Table。原 rule Version History(1.0.0 2026-05-25 / 1.1.0 2026-05-26 / 1.2.0 2026-06-05)收錄於 §9 Incident Records 與本表追溯。 |
