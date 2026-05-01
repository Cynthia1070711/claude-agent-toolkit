---
paths:
  - "src/Platform/App.Web/ClientApp/src/App.css"
  - "src/Platform/App.Web/ClientApp/src/App.tsx"
  - "src/Platform/App.Web/ClientApp/src/styles/editor.css"
  - "src/Platform/App.Web/ClientApp/src/hooks/useCanvasZoom.ts"
  - "src/Platform/App.Web/ClientApp/src/components/**/Canvas*.{tsx,ts,css}"
  - "src/Platform/App.Web/ClientApp/src/components/**/Ruler*.{tsx,ts,css}"
  - ".claude/skills/pcpt-editor-arch/**"
  - ".claude/skills/pcpt-floating-ui/**"
  - "_bmad/bmm/workflows/**/code-review/**"
---

# Canvas Layout Invariants — Canvas 佈局 Regression Guard

> **Core Principle**: Canvas frame must be **edge-to-edge with the viewport** across all 6 breakpoint × ruler cells. 使用者視覺對齊標準 = **canvas vs viewport**(不是 canvas vs ruler)。 任何用 `:has()` / `max-width: calc(100vw - *)` / wrapper padding 反向條件修補 = 混淆 invariant,跨 Story 反覆 regression 的根因。

---

## Applies When

Any modification touches any of:

- `.canvas-wrapper` CSS (App.css §5)
- `.canvas-frame` CSS (App.css §6)
- `.ruler-horizontal` / `.ruler-vertical` / `.ruler-origin` / `.ruler-container` CSS
- Tablet / Mobile `@media (max-width: 1199px)` / `(max-width: 767px)` rules affecting canvas-*
- `App.tsx` canvas DOM hierarchy (`editor-workspace → editor-main → canvas-container → canvas-wrapper → canvas-frame → ruler-container`)
- `useCanvasZoom.ts` `calculateFitZoom` container reference / padding parsing logic
- `styles/editor.css` 手機版 canvas-frame / ruler-container 規則 (L3333+)

---

## Canvas Alignment Invariant Table (MUST hold)

| # | Viewport | showRuler | wrapper padLR | frame gap_L | frame gap_R | ruler delta (R-frame.R) | 狀態 |
|:-:|:--------:|:---------:|:-------------:|:-----------:|:-----------:|:-----------------------:|:---:|
| C1 | ≥ 1200 | true | 0/0 | 0 | 0 | 0 | MUST HOLD |
| C2 | ≥ 1200 | false | 0/0 | 0 | 0 | hidden | MUST HOLD |
| C3 | 768-1199 | true | 0/0 | 0 | 0 | 0 | MUST HOLD (since ADR-CAL-001) |
| C4 | 768-1199 | false | 0/0 | 0 | 0 | hidden | MUST HOLD (since ADR-CAL-001) |
| C5 | < 768 | true | 0/0 | 0 | 0 (ruler-origin 20×20 overlay top-left — OPT-10 design) | 0 | MUST HOLD |
| C6 | < 768 | false | 0/0 | 0 | 0 | hidden | MUST HOLD |

### CLS Jump Guard (斷點不可跳)

- **1200 ↔ 1199** (desktop ↔ tablet): `frame.width Δ ≤ 1px`
- **768 ↔ 767** (tablet ↔ mobile): `frame.width Δ ≤ 1px`

> 允許 1px 差異因應 subpixel rounding + `window.innerWidth` scrollbar 邊界誤差。

---

## Mandatory Flow (when modifying canvas-* CSS / TSX)

1. **Read 現狀**: Read App.css §5-6 + `@media` + `:has()` 規則 + ruler-* + `styles/editor.css` L3333+
2. **Skill check**: Read `.claude/skills/pcpt-editor-arch/SKILL.md` §3 invariant table + FORBIDDEN + history index
3. **Chrome MCP Live 8-point Matrix Verification**:
   - Preflight: `curl https://localhost:7135` = 302 / `curl http://localhost:5173` = 200
   - `list_pages` 確認 Chrome 可用
   - Login: A4 Pro (user-tier-1@example.local / ChangeMe123!)
   - Navigate: Editor URL
   - **6 cells**: `resize_page` 1920 / 1100 / 625 × `showRuler` ON/OFF → `evaluate_script` 量 `frame.L/R/W` + `wrapperPadLR` + `rulerH.R`
   - **2 breakpoint CLS**: resize sequence `1400 → 1200 → 1199 → 1100` 與 `900 → 768 → 767 → 600`,每次 `evaluate_script` 量 `frame.width`,驗相鄰差 `≤ 1px`
   - `take_screenshot` × 6 (6 cells) + 2 (breakpoint transitions) 存 `docs/implementation-artifacts/reviews/epic-*/...-verification-*.png`
4. **Grep Orphan Guard** (皆須 = 0):
   - `grep -r "canvas-safe-margin" src/Platform/App.Web/ClientApp/src`
   - `grep -E '\.canvas-(frame|wrapper)\s*\{[^}]*max-width\s*:\s*calc\(100vw' src/` — 除非同檔同 selector 含 `@media (pointer: coarse)`
   - `grep ':has(.canvas-frame\[data-show-ruler' src/` (已於 eft-ruler 刪除,本 Rule 再禁)
5. **Playwright regression guard**: `e2e/editor/canvas-layout-invariants.spec.ts` PASS (8 tests: 6 FW cells + 2 CLS breakpoint)
6. **Skill sync gate**: 若 Skill §3 invariant 表需更新 → 走 `/saas-to-skill Mode B` + 三引擎同步 (`.claude/` + `.gemini/` + `.agent/`),禁止直接 Edit SKILL.md (2026-04-16 td-hook-test-enhancement 事故)

---

## FORBIDDEN (絕對禁止)

- ❌ `.canvas-wrapper` 或 `.canvas-frame` 加 `padding` 或 `max-width: calc(100vw - *)` — **除非** `@media (pointer: coarse)` 明確限定 (ADR-CAL-001 許可路徑)
- ❌ `:has(.canvas-frame[data-show-ruler="false"])` 或任何 ruler-state 反向條件修 wrapper padding (2026-04-17 eft-ruler 已禁 + 本 Rule 再強化)
- ❌ 直接 Edit `pcpt-editor-arch/SKILL.md` 不走 `/saas-to-skill Mode B` (violates `.claude/rules/skill-sync-gate.md`)
- ❌ 跳過 Chrome MCP 8-point matrix 直接標 ✅ (違反 `.claude/rules/tasks-backfill.md` UI Task Chrome MCP Live Check)
- ❌ 把 `ruler.right = frame.right` 當唯一 invariant — 必須**同時**驗 `frame.left = 0 + frame.right = viewport`(User 視覺標準)
- ❌ 將某 cell 差異分類為「intentional design」而不提供 `@media (pointer: coarse)` 明確條件 + ADR 記錄理由
- ❌ 以 `container.clientWidth - paddingX` 之外的方式計算 fit zoom available width (會受 canvas-frame max-width 誤導)

---

## Self-Check (canvas-* CSS / TSX 修改前)

Agent 須自問 **3 題**:

1. **「這個改動是否破壞 6 cells gap=0 invariant?」** → 是 → STOP,評估 `(pointer: coarse)` 方案或重新設計
2. **「斷點跳動 1200↔1199 / 768↔767 frame.width Δ 是否 ≤ 1px?」** → 否 → STOP,代表 @media 未覆蓋邊界或 max-width 殘留
3. **「是否動到 Skill §3 invariant 表 / FORBIDDEN / 歷史索引?」** → 是 → 走 `/saas-to-skill Mode B` 三引擎同步,禁直接 Edit

---

## Canvas Layout Regression Incident Index

| # | 時間 | Story | Root cause | 遺留 / 教訓 |
|:-:|------|-------|-----------|------------|
| 1 | 2026-02-10 | **TD-10** (App.css @version 2.2.0) | 引入 tablet `max-width: calc(100vw - 24px)` safe margin | ruler 在 flex 時看不出,OPT-10 後變純視覺空隙 |
| 2 | 未記 | **OPT-10** | ruler 改 `position: fixed` 脫離 flex | **未回檢 TD-10 max-width** |
| 3 | 2026-03-31 | **pcptr-12** (commit f9926537 CR:96) | `:has()` 反向移 wrapper padding + mobile 全寬 | 只修 ruler OFF + mobile,ruler ON + tablet max-width 仍在 |
| 4 | 2026-04-17 | **eft-ruler-canvas-padding-regression** (commit 337692b7 CR:94) | wrapper padding=0 / 刪 :has() / Ruler toggle CLS invariant | **Tablet 12px 錯誤分類為 AC-M3 intentional 未挑戰 TD-10** |
| 5 | 2026-04-17 | **eft-tablet-canvas-full-width-retire-td10** (ADR-CAL-001) | TD-10 退役 + 4 層 regression guard + 本 Rule 建立 | 目標:根治不再復發 |

---

## Related Rules / Docs

- `.claude/rules/skill-sync-gate.md` — Skill 與 code 的同步檢查 (三引擎要求)
- `.claude/rules/skill-idd-sync-gate.md` — IDD forbidden_changes 保護
- `.claude/rules/tasks-backfill.md` §UI Task Chrome MCP Live Check — 8-point matrix mandatory
- `.claude/rules/constitutional-standard.md` §Code Verification Mandate + §Depth-First Verification
- `.claude/skills/pcpt-editor-arch/SKILL.md` v1.14.0 §3 Canvas Layout Invariant Table
- `docs/technical-decisions/ADR-CAL-001-retire-td10-tablet-safe-margin.md`

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| 1.0.0 | 2026-04-17 | Initial creation. 跨 4 Story (TD-10/OPT-10/pcptr-12/eft-ruler) canvas tablet 呼吸空隙反覆 regression 根治。觸發 Story: `eft-tablet-canvas-full-width-retire-td10`。ADR-CAL-001 對應。 |
