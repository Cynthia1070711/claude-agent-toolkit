# PCPT 編輯器校正循環 — 應用實例

> `module-conformance-loop` SKILL.md §2 適用場景 之 PCPT 編輯器 10 模組校正循環(2026-05-17 啟動)應用實例。
> 通用 SOP 見 SKILL.md;此檔僅紀錄 PCPT 編輯器特定的模組順序 / 路徑 / Story id / Memory id / 跨切面 issue 對應。

---

## 觸發背景

2026-05-17 PCPT 編輯器 10 模組 8 維度 Conformance Audit 啟動。第 1 模組(QRCODE)完成完整 Step 1-4 循環(see Memory id=4162)。
本 Skill 由 PCPT 編輯器校正過程抽象化通用化而來(see Memory id=4165 觸發事件)。

---

## 模組順序(使用者列表)

| # | 模組 | 對應 audit baseline | 已 enriched Story | 進度 |
|:--:|:--|:--|:--|:--:|
| 1 | QRCODE | `qrcode-audit.md` | `eft-qrcode-module-correction` | ✅ DONE |
| 2 | 其他工具(對齊/欄位/形狀/多選)| `other-tools-audit.md` | `eft-other-tools-correction` | ⏳ Step 3 待執行 |
| 3 | 雙面列印 | `duplex-audit.md` | `eft-duplex-module-correction` | ⏳ |
| 4 | 區塊分割 | `block-split-audit.md` | `eft-block-split-module-correction` | ⏳ |
| 5 | 三角桌牌 | `triangle-card-audit.md` | `eft-triangle-card-correction` | ⏳ |
| 6 | 圖層功能 | `layer-visibility-audit.md` + zorder | `eft-layer-visibility-correction` + `eft-layers-panel-zorder-complete` | ⏳ |
| 7 | 對齊工具 |(歸 other-tools)| - | ⏳ |
| 8 | 裁切堆疊排序 | `cut-stack-sorting-audit.md` | `eft-cut-stack-sorting-correction` | ⏳ |
| 9 | 水平鏡像(資料來源/批次圖檔/QRCODE/序號)| `horizontal-mirror-audit.md` | 待 Phase 7b N1 create | ⏳ |
| 10 | Preview Modal | `preview-modal-audit.md` |(out-of-scope per 使用者列表)| n/a |

---

## Audit Baseline 目錄

`docs/implementation-artifacts/audits/2026-05-17-editor-conformance-audit/`
- `_audit-guide.md` — 10 模組 × 8 維度 audit guide
- `_enrichment-guide.md` — Story enrichment 5 維度範本
- `{module}-audit.md` × 10(qrcode/other-tools/duplex/block-split/triangle-card/layer-visibility/align-tools/cut-stack-sorting/horizontal-mirror/preview-modal)
- `cross-cutting-issues.md` — 8 條跨切面議題(CC-01 / CC-02a/b/c / CC-03 / CC-04 / CC-05 / CC-Feature-01)
- `summary.md` — 12 CRITICAL drift matrix
- `dashboard.html` — 視覺 Dashboard(Bento Grid + Dark Mode)

---

## D3 PRD 章節對應表

| 模組 | PRD 章節 |
|:--|:--|
| QRCODE | 27.* §2.3 + 19.* §6 |
| 其他工具 | 17.* §6 + 27.* §2.3 |
| 雙面列印 | 27.* §2.3 + 19.* §6.2 + 13.* §14 |
| 區塊分割 | 27.* §2.3 + 13.* §14 + 18.*(若存)|
| 三角桌牌 | 21.*(若存)+ 27.* §2.3 |
| 圖層功能 | 13.* §14 + 27.* §2.3 |
| 對齊工具 |(歸 17.* §6)|
| 裁切堆疊 | 34.* §5 + 27.* §2.3 |
| 水平鏡像 | 19.* §6 + 27.* §2.3 + 子模組(資料來源 14.* / 批次圖檔 20.* / QRCODE 19.* / 序號 15.*)|

---

## 已升版 Skill(Phase A qrcode 同步,Module-1 done 時)

| Skill | 升版前 | 升版後(2026-05-17) |
|:--|:--:|:--:|
| phycool-editor-arch | v2.1.0 | **v2.2.0**(7 FORBIDDEN 新增)|
| phycool-floating-ui | v3.0.0 | **v3.1.0**(Z-Index Hierarchy 7 Tier)|
| phycool-design-system | v2.0.0 | **v2.1.0**(cornerSize=6, mtr cornerStyle='circle')|
| phycool-zustand-patterns | v2.0.0 | **v2.1.0**(CC-03 + CC-04)|
| phycool-editor-data-features | v4.1.0 | **v4.2.0**(7 FORBIDDEN 新增)|
| phycool-intentional-decisions | - | references/4-layer-annotation-system.md L92 修正 |

---

## D5 Technical Spec / UIUX

- SDD Spec:`docs/implementation-artifacts/specs/epic-eft/*-spec.md`(共 9 個 enriched)
- Preflight Validation Contract:`docs/implementation-artifacts/specs/preflight-validation-contract.md` §5 QRCode/Barcode + §6-13 其他模組
- UIUX:`平台UIUX排版範例/會員前台UIUX/PCPT 編輯器介面規格.md` v1.7

---

## 跨切面 5 issue verification matrix(使用者 2026-05-17 17:55 補充)

| # | 補充內容 | Audit | UIUX v1.7 | Skill | Story stub(Phase 7b 待 create)|
|:-:|:--|:--:|:--:|:--:|:--|
| 1.1 | [?] 說明面板 z-index 被遮蓋 | CC-01 ✅ | §10 Z-Index 7 Tier ✅ | floating-ui v3.1.0 ✅ | N4 `eft-help-panel-zindex-9000` P1/S |
| 1.2a | lockUniScaling 鎖比例側邊單邊拉伸 | CC-02a ✅ | §11 Truth Table ✅ | editor-arch v2.2.0 §10 ✅ | N5 `eft-transform-handles-lockuniscaling-fix` P1/M |
| 1.2b | 旋轉 mtr 圓形 | CC-02b ✅ | §11 cornerStyle='circle' ✅ | design-system v2.1.0 ✅ | N6 `eft-transform-handles-visual-spec` P2/S(含 b+c)|
| 1.2c | 縮放 cornerSize=6(1/2)| CC-02c ✅ | §11 cornerSize=6 ✅ | design-system v2.1.0 ✅ | N6 同上 |
| 1.3 | 超線提醒呼吸燈 + 開關 + 預覽/PDF 過濾 | CC-Feature-01 ✅ | §12 Layer 導航 ✅ | editor-arch v2.2.0 §15 ✅ | N3 `eft-out-of-bounds-warning-feature` P1/M |

---

## 關聯 Memory id

- id=4161 — 10 模組 audit baseline
- id=4162 — qrcode 17 issue baseline + Step 2 使用者定案(8 QR bug + 4 cross-cutting + 1 NEW-01)
- id=4163 — Phase 6+7a session summary
- id=4164 — Phase 7a all done summary
- id=4165 — **5 步驟 SOP 觸發事件**(本 Skill 通用化來源,2026-05-17 16:30+ 使用者重新闡述)
- id=4166 — Module-2「其他工具」Step 2 使用者定案(8 變更 + 4 BUG + 跨切面 5 issue verify)

---

## 追蹤文檔

- Session 接續入口:`docs/tracking/active/2026-05-17-editor-conformance-handoff.md`
- Epic 推進地圖:`docs/tracking/active/Epic-eft編輯器模組校正執行樹狀圖.md`(對齊 `.claude/rules/execution-tree-doc-sop.md` v1.1 ≤ 100 行)
