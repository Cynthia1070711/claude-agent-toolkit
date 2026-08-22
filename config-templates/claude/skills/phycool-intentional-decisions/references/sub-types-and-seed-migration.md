# Phycool Intentional Decisions — Sub-Types & Seed Migration

> **抽出自** `.claude/skills/phycool-intentional-decisions/SKILL.md` 2026-05-16 P2 modularization (Mode B 8-aspect validation pass). 主 SKILL.md ≤300 行,本檔承載 4 Sub-Types 詳細定義 + dla-08 Seed Migration 狀態 完整內容。

---

### 1.4 4 Sub-Types 詳細定義

#### IDD-COM (Commercial Decision)

**定義**: 由 PO / Business 基於 定價 / 方案 / 轉換漏斗 / 市場策略做出的商業決策,導致某程式碼行為不應被「修正」。

**Lifecycle**: 商業策略週期(季度或以上)

**典型範例**:
- **IDD-COM-001** Free plan editor 全開放 — 商業轉換漏斗決策,editor 不做 Free plan gating,Gate 在 PDF 層
- **IDD-COM-002** 無退款 policy — 「7 天免費試用 + 無退款」商業模型,Admin only 處理退款
- **IDD-COM-003** ImagePanel v2 對 Free 保持可開啟 — 轉換漏斗設計,看到 upgrade modal 轉換率 3x 高於隱藏按鈕
- **IDD-COM-004** (v1.3.0, 2026-04-24) PdfJob 業務重要記錄不自動強刪 — 所有 4 Project Retention BG Service (軸 A1/A2/C1/C2) 遇 PdfJob 跳過不強刪。追認 `ProjectController.cs:L585 fix5-11` 商業註解。三重理由: 金流稽核 (PointsDeducted) + 下載權益 (OutputUrl) + 業務追溯 (狀態機)。關聯 ADR-BUSINESS-004 Master Index

**Re-evaluation Trigger**: Conversion rate 變動 / 競品策略變化 / 商業模型重新定位

#### IDD-STR (Strategic Decision)

**定義**: 由 PO / CTO 基於 產品定位 / 架構方向 / 技術選型 做出的長期策略決策。

**Lifecycle**: 長期策略(季度以上)

**典型範例**:
- **IDD-STR-001** PCPT 是批次列印 SaaS, 非圖片編輯器 — 無 Undo/Redo(含排序 undo UI,2026-04-19 narrowing)、無圖層組合,專注批次列印核心
- **IDD-STR-002** Admin URL `/Admin/` → `/mgmt/` Convention 集中化 — 架構標準化決策,禁止散落的 Admin route
- **IDD-STR-003** DB-first Story(Epic MQV 繞過 create-story checklist)— 效率優化決策,成熟 Epic 直接 upsert-story.js

**Re-evaluation Trigger**: 產品定位改變 / 架構重構需要 / 技術選型淘汰

#### IDD-REG (Regulatory / Compliance)

**定義**: 由 Legal / 法規 要求驅動的合規決策,通常涉及 個資 / GDPR / PIPL / 著作權 / 稅務。

**Lifecycle**: 法規變更觸發

**典型範例**:
- **IDD-REG-001** 個資保存 180 天(超過自動刪除) — GDPR / 個資法要求
- **IDD-REG-002** 統一發票電子化規格 — 財政部電子發票實施作業要點

**Re-evaluation Trigger**: 法規版本更新 / 監管機關通知 / Legal audit 發現

#### IDD-USR (User Decision)

**定義**: 由 End User / Feedback / UX 研究 驅動的決策,通常涉及 UX 偏好 / 無障礙 / 在地化。

**Lifecycle**: 使用者行為變化觸發

**典型範例**:
- **IDD-USR-001** 測試帳號 A1-A5 特殊行為(seeder 固定資料) — 開發測試便利性
- **IDD-USR-002** 編輯器預設右側 Panel 位置 — UX 研究顯示右側 panel 更符合使用習慣

**Re-evaluation Trigger**: User feedback 累積 / UX 重設計 / A/B test 結果

### 1.5 首批 Seed Migration 狀態 (dla-08 done, 2026-04-11)

上方 §1.4 定義的 10 筆 seed IDDs 已於 **dla-08-current-debt-migration** Phase 3 正式寫入 `intentional_decisions` 表,並產出對應 ADR 檔案:

| IDD | Criticality | ADR 檔案 | Code Impact |
|-----|------------|---------|-------------|
| **IDD-COM-001** | 🔴 critical | `docs/technical-decisions/ADR-IDD-COM-001-free-plan-editor-*.md` | 0 locations (驗證 Free gating 確實不存在) |
| **IDD-COM-002** | 🔴 critical | `ADR-IDD-COM-002-無退款-policy-*.md` | 20 locations (Admin refund services) |
| IDD-COM-003 | normal | `ADR-IDD-COM-003-imagepanel-v2-*.md` | 10 locations |
| **IDD-COM-004** (v1.3.0, code_locations 擴展 @ eft-trash-30day-auto-delete CR R2 2026-04-24) | 🔴 critical | `ADR-IDD-COM-004-pdfjob-protected-from-auto-delete.md` | **11 locations** (ProjectController.cs:L585-592 fix5-11 + ProjectEntityConfigurations.cs:L120 FK Restrict + PdfJob.cs:L141 + ProjectTrashCleanupService.cs:L3/L163/L207 軸 B + FreeNeverPaidTrashDailyPurgeService.cs:L5/L161/L206 軸 A2 + ServiceRegistrationExtensions.cs:L330 DI 註冊,**軸 A1/C1/C2 BG Service 待實作時續加**) |
| IDD-STR-001 | normal | `ADR-IDD-STR-001-pcpt-*.md` | 13 locations (narrowed 2026-04-19 15→13 淨減 2;2026-04-20 CR re-review F8 同步補 BatchImageSorter × 2 entries) |
| IDD-STR-002 | normal | `ADR-IDD-STR-002-admin-url-*.md` | 20 locations |
| IDD-STR-003 | normal | `ADR-IDD-STR-003-db-first-*.md` | 12 locations |
| **IDD-REG-001** | 🔴 critical | `ADR-IDD-REG-001-個資保存-*.md` | 10 locations |
| **IDD-REG-002** | 🔴 critical | `ADR-IDD-REG-002-統一發票-*.md` | 20 locations |
| IDD-USR-001 | normal | `ADR-IDD-USR-001-測試帳號-*.md` | 17 locations |
| IDD-USR-002 | normal | `ADR-IDD-USR-002-編輯器預設右側-*.md` | 20 locations |

**Criticality 升級**: 原 §1.4 default 只標 IDD-COM-001 為 critical, dla-08 依業界 **impact × reversibility matrix** 升 IDD-COM-002(revenue+legal hard reversal) + IDD-REG-001/002(法規 hard reversal)為 critical, 共 4 critical。

**Code annotation 狀態 (2026-04-12, dla-08b Code Review v1.2.2)**: 9 annotatable IDDs 已完成 code inline `[Intentional: IDD-XXX]` 標註套用 + XML doc 結構修復 + ADR reference 補強。scanner 回報 **167 annotations across 80 files** (post-CR cleanup: 移除 20 處 XML doc break 造成 CS1570 風險 + 刪除 10 個 naked annotation 改為 block-style with See: reference)。per-IDD: COM-002=26, COM-003=10, REG-001=9, REG-002=18, STR-001=11 (narrowed 2026-04-19 eft-batch-image-panel-sort-undo-redo-remove), STR-002=37, STR-003=12(ADR-sourced,scanner scope gap), USR-001=21, USR-002=31。Layer 3 S4 exclusion **ACTIVE** (40/44 debts not-intentional → 4 debts excluded by S4 protection)。`verify_intentional_annotations({scope:'all'})` returns `orphaned_idd=[], mismatched_locations=[], issues=0`。delivered by **dla-08b-intentional-annotations-boy-scout** (Phase 1: 50 critical locations committed 2026-04-11T19:33 sha a34dde92; Phase 2: 133 normal locations committed 2026-04-11T19:52 sha 54f49550; Phase 3 sync committed 2026-04-11T19:55 sha 5acf16ad; CR cleanup 2026-04-12 sha TBD fixes 20 CS1570 XML breaks + 10 naked)。

**Seed 建立流程**: `.context-db/scripts/memory-to-idd-migration.js` (Inventory + Node-native walker + ripgrep discovery + ADR §2.2 template)。可於未來新增 seed 時擴充 SEEDS array + 重跑 --execute。

---
