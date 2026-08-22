# Brownfield 校正框架 — A/F/I/J/K 深度範式

> `module-conformance-loop` SKILL.md v2.0.0 §0 定位 + §1 原則 6 + Step 4/5 之深度展開。
> 本檔承載「定位 / 真相錨點 / 交棒接合 / 基線凍結 / 校正台帳」5 塊深度內容,SKILL.md 保持精煉。

---

## A. BMAD 體系定位(本 skill 在 BMAD 哪裡)

### A.1 BMAD 4-Phase vs 本 skill

| BMAD Phase | workflow | 產出文檔 | 本 skill 關係 |
|:--|:--|:--|:--|
| Phase 1 Analysis | `research` / `create-product-brief` | product-brief | — |
| **Phase 2 Planning** | **`prd`** | **PRD** | **校正既有 PRD**(非從零生成)|
| **Phase 3 Solutioning** | **`create-architecture` / `create-tech-spec` / `create-epics-and-stories`** | **architecture(ADR)/ tech-spec(SDD)/ epics** | **校正既有 ADR/SDD/IDD** |
| **Phase 4 Implementation** | **`create-story` → `dev-story` → `code-review`** | Story / code / CR report | **交棒目標**(消費校正後文檔)|

### A.2 對標 BMAD 既有 brownfield workflow

| workflow | 職能(workflow.yaml description)| 與本 skill |
|:--|:--|:--|
| `document-project` | 掃 brownfield codebase/architecture 生成 reference 文檔 | 本 skill 更**聚焦逐模組校正**(非全量文檔化)|
| `correct-course` | sprint 執行中分析單一 change impact → change proposal | 本 skill 更**系統**(9 維度逐模組);功能新增 / 重大偏移可**委派** correct-course |

### A.3 鐵證:create-story 是消費者非生產者

`create-story/workflow.yaml` 的 `input_file_patterns` 將 `prd` / `architecture` / `ux` 全標 **`SELECTIVE_LOAD`(fallback)** —— 上游 epics 已含內容,這些只在缺時才載入。**create = 消費設計規範,不生產**。故 brownfield 必先校正(本 skill)使文檔與 code + 需求一致,再交棒 Phase 4 → Phase D 不偏移。

---

## F. code ≠ 正確規範(真相錨點 SUPREME · 對應 §1 原則 6 / IL5 / F9)

### F.1 雙重語意陷阱

| 維度 | 「D1 基線不動」的意思 |
|:--|:--|
| **時間維度**(✅ 對)| 校正階段不改 code,等 Phase D dev-story 才改 |
| **真相維度**(❌ 陷阱)| code 行為 = 正確規範 ← **錯!最危險的 brownfield 陷阱** |

### F.2 三類證據的真相層級

校正錨點 = **正確需求**(PRD 意圖 / 使用者裁決 / 商業規則)。code 只是**現狀證據之一**:
- code 對 → 文檔對齊 code(正常校正)
- code 錯(bug / 技術債 / 反模式)→ 文檔寫**正確需求** + 記偏移 finding + 標 Phase D 修正

### F.3 反例(禁止)

❌ audit 發現 `GetPermissions` 有 dead code helper 永回 true(bug),校正 SDD 時寫「權限一律放行(照 code 現況)」→ Phase D 照此規範實作 → 權限漏洞永久固化成「設計」。
✅ 正確:SDD 寫「依角色權限矩陣判定(正確需求)」+ 記 drift finding「code helper dead code 永回 true,Phase D 修」+ blast radius。

---

## I. 校正產出 → Story enrichment 接合契約(對應 Step 4 / F12)

每個 resolved finding **必接進 Phase D 執行載體**,否則 dev agent 載入時拿不到脈絡 → 仍偏移(白校正)。

| finding 類型 | 校正產出 | 接進 Story 欄位 |
|:--|:--|:--|
| 偏移 / 不全 | 校正後 SDD/PRD/Skill | `sdd_spec`(路徑)+ `dev_notes`(file:line)|
| 功能新增 | 新 ADR/SDD/IDD | `implementation_approach`(Phase 計畫)+ `sdd_spec` |
| 商業策略 | ADR-IDD | `dev_notes` 引用 `IDD-{TYPE}-{NNN}` |
| schema | Migration 設計 | `implementation_approach` + `dev_notes` |

**驗證**:Story enrichment 任一欄位都找不到某 resolved finding 的校正後文檔路徑 → 接合斷裂 → 補(F12 Red Flag)。

---

## J. 基線凍結 + correct-course 對接(對應 §1 原則 + Step 5)

### J.1 基線凍結
校正啟動時記錄 `{baseline_commit, baseline_ts}`(寫 audit baseline header + Memory)。開發中途 code 被別軌 / 其他 session 改動 → 校正失準。凍結後若基線變動,受影響模組 audit 重跑(對齊 verification-protocol)。

### J.2 correct-course 對接
「功能新增 / 重大偏移」finding 牽涉既定 epic/PRD 大改 → 委派 BMAD `correct-course`(產出 `sprint-change-proposal-{date}.md`),不在本 skill 內硬塞。**純新功能**(無任何既有規範)→ 走 BMAD Phase 1-3 正向流程,**非本校正 skill**(校正處理「既有功能」)。

---

## K. 校正台帳 + 雙層 DoD(讓「最終全部統一」可驗證 · 對應 Step 5 / F12)

### K.1 校正台帳(結構化,證明「全部統一無遺漏」)

每 finding 一列(Memory category=decision 或 audit baseline 表):

| 欄位 | 說明 |
|:--|:--|
| `finding_id` | `{module}-{seq}` |
| `類型` | 偏移 / 缺漏 / 不全 / 遺失 / 功能新增 |
| `證據` | file:line |
| `校正動作` | 校正既有 / 新生成 + 文檔路徑 |
| `Phase D blast radius` | `gitnexus_impact` 風險等級(LOW/MED/HIGH/CRITICAL)|
| `裁決者` | 使用者(重大)/ 主控端(輕微)|
| `狀態` | open / closed |

### K.2 雙層 DoD

**單模組 DoD**(該模組可宣告校正完成):
- [ ] 所有 finding(5 類)狀態 `closed`
- [ ] 9 文檔位置同步(各走對應 skill/workflow)
- [ ] D9 跨文檔 SSoT 一致(術語 / 常數 / 狀態機 / cross-cutting)
- [ ] resolved finding 全接進 Story enrichment(I)
- [ ] 使用者放行(Step 2.4)

**全任務 DoD**(全模組校正完畢可交棒 Phase 4):
- [ ] 所有模組單模組 DoD ✅
- [ ] 全模組整合收口(cross-cutting reconciliation pass — 跨模組交界一致)
- [ ] 校正台帳 **0 open finding**
- [ ] Epic 推進地圖更新(對齊 `.claude/rules/execution-tree-doc-sop.md`)

---

## 對應 SKILL.md 規範錨點

| 本檔段 | SKILL.md 錨點 |
|:--|:--|
| A | §0 BMAD 體系定位 |
| F | §1 原則 6 + IL5 + F9 + Pressure Test Test 4 |
| G(排序)| §1 原則 7 + F10 + Test 5(本檔未展開,規範在 SKILL.md)|
| H(裁決)| Step 2.6 + IL6 + F11(規範在 SKILL.md)|
| I | Step 4 + F12 |
| J | Step 1 基線凍結 + Step 5 correct-course |
| K | Step 5 + F12 |
