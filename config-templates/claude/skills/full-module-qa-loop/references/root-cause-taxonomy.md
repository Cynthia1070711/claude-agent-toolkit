# Root Cause Taxonomy — 5 大類 × 16 子類

## 為什麼需要分類學

每個問題的根因類別決定**修復 SOP**:
- Bug 類 → 直接 dev-story 修 code
- SaaS 類 → 先設計 UX,再 dev-story
- Drift 類 → 批次比對 baseline 修
- Spec 類 → **回到 Party Mode 重新定義** → 更新 Skill
- Cross 類 → 視具體類型混合處理

分類錯 → 修復路徑錯 → 時間浪費。

---

## 分類總表

```
A. Bug Gap (code 與 spec 不符)
   A1. Logic Error
   A2. State Mutation
   A3. Race Condition
   A4. Boundary Contract

B. SaaS Compliance Gap (違反 SaaS 業界標準)
   B1. Quota Messaging Missing
   B2. Upgrade CTA Absent
   B3. Empty State Poor
   B4. Error Recovery Missing
   B5. Loading Transparency

C. Design Drift (UI/UX 與 baseline 不符)
   C1. Design Token Violation
   C2. Tooltip Native Fallback
   C3. Animation Inconsistent

D. Spec Gap (Spec 與 user intent 不符)
   D1. BR Rule Outdated
   D2. Functional Spec Drift
   D3. Plan Matrix Mismatch

E. Cross-cutting (跨類)
   E1. Skill Knowledge Void
   E2. Test Coverage Hole
```

---

## A. Bug Gap — 程式碼寫錯

### A1. Logic Error
**定義**: 條件判斷錯誤、計算錯誤、演算法錯誤
**範例**: edf-15 pxToMm 算錯方向導致尺寸污染
**修復路徑**: 直接 dev-story 修 code + 單元測試
**時間**: S (0.5-2h per Story)
**Skill 校正**: 通常不需要(除非揭露 BR 規則錯誤)

### A2. State Mutation
**定義**: Zustand store 污染、useState 複製 store 欄位、直接修改物件
**範例**: useState 鏡像 canvasStore 導致狀態不同步
**修復路徑**: 用 Store Selector 替代 useState + 驗證 immutability
**時間**: S-M
**Skill 校正**: 可能需要(更新 phycool-zustand-patterns 範例)

### A3. Race Condition
**定義**: 非同步順序錯誤、缺少版本號防護、並發衝突
**範例**: _previewVersion 防護失敗導致舊回呼覆寫新狀態
**修復路徑**: 加版本號 / Promise 鏈優化 / 測試並發場景
**時間**: M
**Skill 校正**: 可能需要(更新 pattern 範例)

### A4. Boundary Contract
**定義**: DB schema 單位/型別不符、API response 欄位錯、Entity model 語意錯
**範例**: edf-13 誤認 DB 存 px 實際存 mm
**修復路徑**: Constitutional Backend Contract Verification → Spec 與 code 同步
**時間**: M-L(常涉及 Migration)
**Skill 校正**: **必須**(更新 Skill 含 file:line Backend Contract 章節)

---

## B. SaaS Compliance Gap — 違反 SaaS 業界標準

### B1. Quota Messaging Missing
**定義**: 配額/限制觸發時無友善訊息 / silent fail / silent 截斷
**範例**: Excel 51 列直接截斷,使用者不知為何
**修復路徑**: 加 toast + 明確訊息 + 升級 CTA
**時間**: S
**業界對比**: Figma/Canva 都有明確的 quota 警告 toast
**Skill 校正**: 可能需要(更新 BR 描述包含「必須顯示 toast」)

### B2. Upgrade CTA Absent
**定義**: Locked state 無升級 CTA / 錯過轉換點
**範例**: 點擊 Pro 功能按鈕無反應,沒有引導升級
**修復路徑**: 加 UpgradeModal + CTA 按鈕 + 跳轉 /pricing
**時間**: S-M
**業界對比**: 所有 Freemium SaaS 必備
**Skill 校正**: 需要(更新 Skill 含 upgrade CTA 標準)

### B3. Empty State Poor
**定義**: 首次進入無引導 / 空狀態無說明 / 無 "快速開始" 範本
**範例**: 新使用者進入編輯器看到空白畫布沒有 onboarding
**修復路徑**: 加 EmptyState 元件 + 引導文案 + 範本連結
**時間**: M
**業界對比**: Notion/Figma 都有強大的 empty state 引導
**Skill 校正**: 需要(新增 UX empty state baseline)

### B4. Error Recovery Missing
**定義**: 錯誤訊息無 next action / 使用者不知如何恢復
**範例**: "產生 PDF 失敗" 只顯示訊息,沒有「重試」按鈕
**修復路徑**: 加 retry/undo/rollback 按鈕 + 錯誤訊息告訴使用者下一步
**時間**: S-M
**業界對比**: Slack 的訊息發送失敗有明確的 retry UI
**Skill 校正**: 可能需要

### B5. Loading Transparency
**定義**: Loading 狀態無進度可見 / >3s 無 spinner / >10s 無 cancel
**範例**: 大檔案 Excel 上傳無 progress bar,UI 疑似當機
**修復路徑**: 加 LoadingOverlay + 進度回報 + cancel 選項
**時間**: M
**業界對比**: 所有 SaaS 工具都有 progress feedback
**Skill 校正**: 可能需要(參考 phycool-progress-animation)

---

## C. Design Drift — UI/UX 與 baseline 不符

### C1. Design Token Violation
**定義**: Hardcoded Hex / 非 CSS Variable 間距 / 非 token 字體大小
**範例**: `color: #FF0000` 直接寫死,應該用 `var(--color-danger)`
**修復路徑**: 批次 grep/replace + 三引擎同步 design-system Skill
**時間**: S (可批次一次修多處)
**業界對比**: Canva/Figma 都有嚴格的 Design Token 系統
**Skill 校正**: 需要(更新 phycool-design-system forbidden 範例)

### C2. Tooltip Native Fallback
**定義**: 使用 `title` attr 而非 PhyCool Tooltip 元件
**範例**: `<button title="說明">` 觸發原生 tooltip(黃色)
**修復路徑**: 批次替換為 `<Tooltip content="...">` 元件
**時間**: S (可批次)
**Skill 校正**: 需要(更新 phycool-tooltip 範例)

### C3. Animation Inconsistent
**定義**: 使用 CSS `left/top` 而非 `transform` / 非 progress-animation skill 規範
**範例**: `left: 100px` 動畫卡頓,應該用 `transform: translateX(100px)`
**修復路徑**: 批次替換動畫方式
**時間**: S-M
**Skill 校正**: 需要(更新 phycool-progress-animation 範例)

---

## D. Spec Gap — 規格與意圖不符

### D1. BR Rule Outdated
**定義**: Skill BR-XXX 規則已過期,與最新商業決策不符
**範例**: plan-feature-matrix.md 列 Free 擋 14 個功能,實際 Memory id=1606 已改為 Editor 全開放
**修復路徑**: **回到 Party Mode 重新定義** → 更新 Skill → 建立 ADR
**時間**: M-L(含討論時間)
**Skill 校正**: **必須**(主要修復動作就是改 Skill)

### D2. Functional Spec Drift
**定義**: 功能規格書與實作長期不同步
**範例**: functional-specs/§5.3 描述 ShrinkToFit 應有最小字型限制,實際實作沒有
**修復路徑**: 補實作 OR 更新規格書
**時間**: M
**Skill 校正**: 需要(更新 Skill 對應章節)

### D3. Plan Matrix Mismatch
**定義**: Feature Flag 矩陣三向不一致(Memory / Skill / Code)
**範例**: Free Plan 能用什麼功能,三個地方說法不同
**修復路徑**: Contract Verification → 統一版本 → 建立 ADR-BUSINESS
**時間**: L(通常觸發連鎖校正)
**Skill 校正**: **必須**(plan-feature-matrix.md + pricing-plans.md)
**備註**: 這是 PCPT 專案最常見的根因之一

---

## E. Cross-cutting — 跨類

### E1. Skill Knowledge Void
**定義**: Skill 沒有記載某功能 / 關鍵商業規則漏掉
**範例**: phycool-editor-arch 沒有 Project.Width/Height 單位文件 → edf-13 事故根因之一
**修復路徑**: 補 Skill 章節 + 加 file:line 引用
**時間**: S-M
**Skill 校正**: **必須**
**預防**: Contract Verification 時檢查 Skill 覆蓋率

### E2. Test Coverage Hole
**定義**: 該行為無對應測試,所以 regression 無防護
**範例**: mm/px 單位沒有 contract test,所以 edf-13 沒攔截到
**修復路徑**: 加單元 / 整合 / E2E 測試
**時間**: S-M
**Skill 校正**: 可能需要(更新 testing-patterns 加範例)

---

## 分類決策樹(供 sub-agent 使用)

```
問題現象:
├─ 是「程式碼做錯事」嗎? → A 類
│   ├─ 條件/計算錯 → A1
│   ├─ State 污染 → A2
│   ├─ 並發問題 → A3
│   └─ DB/API 契約 → A4
│
├─ 是「功能能跑但 UX 不友善」嗎? → B 類
│   ├─ 配額沒 toast → B1
│   ├─ 鎖定沒 CTA → B2
│   ├─ 空狀態無引導 → B3
│   ├─ 錯誤無 next action → B4
│   └─ Loading 沒進度 → B5
│
├─ 是「視覺不符 baseline」嗎? → C 類
│   ├─ Hardcoded 顏色/間距 → C1
│   ├─ 原生 tooltip → C2
│   └─ 動畫卡頓 → C3
│
├─ 是「規格錯或過期」嗎? → D 類
│   ├─ BR 規則過期 → D1
│   ├─ 功能規格不同步 → D2
│   └─ Plan 矩陣矛盾 → D3
│
└─ 是「Skill 沒記載 / 無測試」嗎? → E 類
    ├─ Skill 知識缺 → E1
    └─ 測試覆蓋缺 → E2
```

---

## 修復 SOP 對照表

| 類別 | 修復路徑 | 時間 | 需要 Skill 校正? |
|:---:|---------|:---:|:---------------:|
| A1 Logic | dev-story + unit test | S | 否 |
| A2 State | Zustand selector 重構 | S-M | 可能 |
| A3 Race | 版本號防護 + 並發測試 | M | 可能 |
| A4 Contract | Backend Contract 校正 + Migration | M-L | **必須** |
| B1 Quota | 加 toast + 文案 | S | 可能 |
| B2 CTA | UpgradeModal 系統 | S-M | 是 |
| B3 Empty | EmptyState 元件 | M | 是 |
| B4 Recovery | retry/undo UX | S-M | 可能 |
| B5 Loading | Progress Hook | M | 可能 |
| C1 Token | 批次 grep/replace | S | 是 |
| C2 Tooltip | 元件替換 | S | 是 |
| C3 Animation | transform 替換 | S-M | 是 |
| D1 BR | **Party Mode + Skill edit** | M-L | **必須** |
| D2 Spec | 實作或規格對齊 | M | 是 |
| D3 Plan | **Contract Verification + ADR** | L | **必須** |
| E1 Knowledge | 補 Skill 章節 | S-M | **必須** |
| E2 Coverage | 加測試 | S-M | 可能 |

---

## 統計模式

某些根因類別**常見共同出現**,識別模式有助於 CMRD 合併:

| 常見共現 | 含義 |
|---------|------|
| A4 + E1 | DB schema 錯 + Skill 沒記載 → 典型 Backend Contract 事故 |
| A2 + D1 | State 污染 + BR 過期 → 可能是設計上的根本衝突 |
| B1 + B2 | 配額無 toast + 無 CTA → 整個 SaaS 合規層缺失 |
| C1 + C2 + C3 | 三種 drift 並存 → Design System 導入不完整 |
| D1 + D3 + E1 | BR 過期 + Plan 矩陣矛盾 + Skill 知識缺 → **重大商業模型更新未同步** |

這些共現模式在 Phase 3.5 Refinement 時會影響拆分策略選擇。

---

## 範例:edf-15 事故的分類學診斷

```
核心根因: mm/px 單位污染
分類: A4 (Boundary Contract) + E1 (Skill Knowledge Void)
  
  A4: ProjectsController.cs:84-85 存 mm(decimal 210m)
      但 useProjectLoader.ts 誤認為 px
      → Boundary Contract 錯

  E1: phycool-editor-arch 沒有 Project.Width/Height 單位文件
      → Sub-agent 從 Skill 描述推測,違反 Constitutional

修復 SOP:
  1. A4 修復: 統一 mm 為 source of truth + 加 Contract Test
  2. E1 修復: 更新 phycool-editor-arch 新增 Project Entity Units 章節
  3. 三引擎同步 Skill
  4. 建立 Constitutional Backend Contract Verification Mandate 規則
```
