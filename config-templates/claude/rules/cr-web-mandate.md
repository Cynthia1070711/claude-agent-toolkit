---
name: cr-web-mandate
description: Code-review Worker/Vite/Excel dev/prod parity 強制驗證 — 永久守護 Two-Mode Architecture 不漂移
version: 1.0.0
updated: 2026-05-13
paths:
  - "src/YourApp/Web/ClientApp/src/hooks/useExcelWorker*"
  - "src/YourApp/Web/ClientApp/src/workers/**"
  - "src/YourApp/Web/ClientApp/src/components/Editor/DataImportModal*"
  - "src/YourApp/Web/ClientApp/src/components/Editor/panels/DataSourcePanel*"
  - "src/YourApp/Web/ClientApp/vite.config.ts"
---

# CR-WEB-MANDATE — Worker/Vite/Excel dev/prod Parity 強制驗證

> **Core Principle**: dev mode + prod build 行為分裂是過去 7 次 Excel Worker regression chain 的根因(`mqv-18 → mqv-24 → mqv-28 → edf-01 → eft-coep-fix → multi-layer-fix-stack → bundling-refactor`)。任何涉 Worker / Vite / Excel 的 code change **必在 CR Phase B 跑 prod-like build verify**,**不接受純 dev mode + Vitest 通過就標 done**。

> **觸發 Story**: `eft-excel-upload-critical-path-recovery`(2026-05-13)— Round B 連續上傳測試發現過去 5 個 CR 92-95 分都漏抓 dev cross-origin 真因,即使 Vitest 17 tests 全 PASS。對齊 SDD Spec 附錄 A Evidence Chain E1-E7。

---

## Applies When

任何 code change 命中以下任一,**CR 階段強制執行 CR-WEB-MANDATE prod-like verify**:

| 觸發點 | 範例 |
|:-------|:-----|
| useExcelWorker.ts / DataImportModal / DataSourcePanel 修改 | hook fallback / 錯誤 taxonomy / UX flow |
| ExcelWorker.ts(`src/workers/`)修改 | parse 邏輯 / message flow / chunk size |
| vite.config.ts 修改 | worker config / build target / cert / HMR |
| Worker / SharedWorker / ServiceWorker 相關 code 修改 | 任何 `new Worker(...)` / `?worker&inline` directive 使用 |
| `import { ... } from 'xlsx'` 使用點修改 | parse library 升級 / API 變更 |
| Vite 升版(major / minor)| 4 → 5 → 6 → 7 → 8 任何 |
| ASP.NET Core Razor 服務 wwwroot / `dotnet publish` config 修改 | static file middleware / output path |

---

## Mandatory Flow(CR Phase B,**HARD GATE**)

### Step 1: 確認 Pre-Flight

```bash
# server 在跑
curl -k -s -o NUL -w "Backend: %{http_code}\n" https://localhost:7135  # 預期 200/302
curl -k -s -o NUL -w "Vite: %{http_code}\n" https://localhost:5173      # 預期 200

# Chrome MCP 可用
# (mcp__chrome-devtools__list_pages 確認)
```

### Step 2: vite build prod-like 模擬

```bash
cd src/YourApp/Web/ClientApp
npm run build
# 預期: exit 0 + dist/wwwroot 出現 hashed bundle + worker inline base64
```

### Step 3: 啟動 prod-like server

```bash
cd ../  # 回到 PhyCool.Web/
dotnet run --environment Production
# 預期: console 看到 Now listening on https://localhost:7135
# 不應該有 Vite HMR / dev mode warning
```

### Step 4: Chrome MCP Live Verify

**至少執行 4 個 cell(prod-like vs dev parity)**:

| Cell | 操作 | 預期結果 |
|:-----|:-----|:--------|
| C1 | dev mode 上傳 30 / 500 / 2000 筆 | fallback warn console + 解析成功 |
| C2 | dev mode 上傳 5000+ 筆(若 plan allows)| truncate + upgrade toast |
| C3 | prod-like build 上傳 30 / 500 / 2000 筆 | **0 fallback warn**(Worker 真實運作)+ 解析成功 |
| C4 | prod-like DevTools Network 截圖 | 0 個 5173 URL + Worker URL = `data:application/javascript;base64,...` |

### Step 5: CR Report 加 marker

CR Report MUST 含:

```markdown
## CR-WEB-MANDATE Verification

| Cell | Plan | 結果 | 截圖 |
|:-----|:----:|:----:|:-----|
| C1 dev fallback 30/500/2000 | A1/A4 | ✅ | docs/.../cr-web-c1-{ts}.png |
| C2 dev truncate 5000+ | A1 | ✅ | docs/.../cr-web-c2-{ts}.png |
| C3 prod-like 30/500/2000 | A1/A4 | ✅ | docs/.../cr-web-c3-{ts}.png |
| C4 prod-like Network 0個5173 | - | ✅ | docs/.../cr-web-c4-{ts}.png |

[CR-WEB-MANDATE Live Verification @ {ts} — A1+A4 plans, dev+prod parity 4 cells PASS]
```

---

## FORBIDDEN(等同 CR 失敗)

- ❌ **僅跑 Vitest jsdom 17 tests PASS 就標 done**(jsdom 不模擬 W3C 同源,prod build 行為與 dev 完全不同)
- ❌ **僅跑 `webServer: vite preview` Playwright E2E**(已單一 origin 自然繞過跨源 bug,**不算 prod-like verify**)
- ❌ **僅 dev mode 上傳成功就算過**(dev mode 走主線程 fallback,Worker 真實行為未驗)
- ❌ **跳過 Step 2-3(npm run build + dotnet run --environment Production)**僅靠口頭聲稱 prod 不踩
- ❌ **CR Report 缺 `[CR-WEB-MANDATE Live Verification @ ts]` marker**(視同未執行,HARD BLOCK)
- ❌ **單 plan 驗證**(必須 ≥ 2 plan — Free + 1 付費,確保 plan-aware quota 邏輯不漏網)

---

## 例外(必明示理由)

### 例外 A:Bug fix 不涉 Worker code 路徑
若 diff 不命中 `Applies When` 矩陣 → 自動 skip,CR Report 標明「不適用 CR-WEB-MANDATE」。

### 例外 B:Server 不可用 / SSL 阻擋
若 prod-like server 啟動失敗(無法 dotnet run)或 Chrome SSL block,CR Report 標明具體錯誤 + 開 follow-up tech debt + 由 reviewer 加 `[CR-WEB-MANDATE PARTIAL — {reason}]` marker。

### 例外 C:Documentation-only Story
若 file_list 純文檔(`.md` only),skip。

---

## Self-Check(Reviewer 標 CR done 前必問 3 題)

1. **「本 PR 是否命中 Applies When 矩陣?」** → 是 → MUST 執行 Mandatory Flow Step 1-5
2. **「我是否憑 Vitest PASS / Playwright vite preview / dev mode OK 就標 done?」** → 是 → STOP,執行 prod-like build verify
3. **「CR Report 是否含 `[CR-WEB-MANDATE Live Verification @ ts]` marker?」** → 否 → 補執行 + 截圖 + 標記後才能 done

---

## Evidence Chain(對齊 SDD Spec 附錄 A E1-E7)

| # | Evidence | 含意 |
|:-:|---------|------|
| E1 | useExcelWorker.ts:23 `import ExcelWorker from '../workers/ExcelWorker.ts?worker&inline'` | Vite directive 使用 |
| E2 | `?worker&inline` 在 dev mode **不真 inline**(URL-based wrapper)| dev 跨源 fail → 主線程 fallback |
| E3 | `vite build` **真 inline 為 base64 dataURL** | prod 同 origin → W3C PASS |
| E4 | localhost prod-like(`dotnet run --environment Production`)**不踩** | 本機可 reproduce prod |
| E5 | Azure App Service Production **不踩** | 部署環境天然 single origin |
| E6 | `eft-excel-upload-quota-e2e-live-verify` `webServer: vite preview` 8/8 GREEN | prod build 已驗 |
| E7 | `eft-excel-worker-bundling-refactor` 2026-05-12 done | Worker bundling 範式落地 |

---

## Incident Records

- **2026-05-12 ~ 2026-05-13** `eft-excel-upload-critical-path-recovery`:過去 5 個 CR(`eft-excel-upload-multi-layer-fix-stack` / `eft-excel-worker-bundling-refactor` / `eft-excel-upload-plan-quota-enforcement` / `eft-data-module-full-qa-loop` / `eft-excel-upload-quota-e2e-live-verify`)Vitest 全 PASS + Score 92-95,但都沒在 dev mode + 真實 Chrome + cross-origin Worker constructor 場景 verify → 連續 7 次 regression chain 累積 dev 偽 OK 但 prod 行為未驗。本 rule 建立以**機制性強制** dev/prod parity 永久守護。

---

## Related Rules / Docs

- `.claude/rules/tasks-backfill.md` §UI Task Chrome MCP Live Check — UI 通用驗證(本 rule 為 Worker/Vite/Excel-specific 補強)
- `.claude/rules/constitutional-standard.md` §Code Verification Mandate — Read actual code 為基底
- `.claude/rules/depth-gate-warn-mandatory-resolution.md` — WARN 不可忽略
- `docs/implementation-artifacts/specs/epic-eft/eft-excel-upload-critical-path-recovery-spec.md` 附錄 A E1-E7
- `docs/implementation-artifacts/runbooks/excel-upload-deploy-verify.md` — 5-min Self-Verify SOP

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| 1.0.0 | 2026-05-13 | Initial creation. 觸發 Story: `eft-excel-upload-critical-path-recovery` AC-10 (BR-CR-MANDATE-01)。對齊 Two-Mode Architecture 永久守護。Memory tech_entries id=1267 (architecture, supersede 1265/1266)。 |
