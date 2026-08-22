---
name: start-servers
description: |
  啟動專案所有開發伺服器。支援全部啟動或選擇性啟動。
  觸發關鍵字：啟動伺服器, start servers, 開啟 server, 啟動服務, 開 server, 重啟, restart
version: 2.2.0
updated: 2026-05-23
disable-model-invocation: true
triggers:
  - start-servers
  - dev servers
  - start development
  - backend stdout capture
  - backend stdout 觀測
  - 進階觀測模式
  - multi-component diagnostic
  - 4-layer pipeline boundary
author: CC-OPUS
created: 2026-03-17
watches:
  - glob: ".claude/skills/start-servers/scripts/*.ps1"
    domain: devops
last-synced-epic: epic-stage-beta
last-synced-date: 2026-05-23
last-synced-story: stage-beta-β-1-start-servers-backend-stdout-capture
---

# Start Servers

**收到指令後直接執行腳本，不要反問使用者。** 根據使用者的自然語言意圖對應參數：

| 使用者說 | 執行指令 |
|---------|---------|
| 啟動伺服器 / start servers / 開 server | `powershell -File .claude/skills/start-servers/scripts/start-servers.ps1` |
| 重啟 / restart / 重新啟動 | `powershell -File .claude/skills/start-servers/scripts/start-servers.ps1 --restart` |
| 檢查狀態 / check / 伺服器狀態 | `powershell -File .claude/skills/start-servers/scripts/start-servers.ps1 --check` |
| 只啟動 pcpt / 只開前端 | `powershell -File .claude/skills/start-servers/scripts/start-servers.ps1 pcpt` 或 `vite` |
| 單一重啟 pcpt(dev-certs 重建後 cert reload)| `powershell -File .claude/skills/start-servers/scripts/start-servers.ps1 pcpt --restart` |

> ⚠️ **cert reload 觸發情境**: 執行 `dotnet dev-certs https --clean && dotnet dev-certs https --trust` 後,Kestrel backend 已載入舊 cert 至記憶體不會自動 reload,**必須** `pcpt --restart`,否則 Chrome 會顯示 `ERR_CERT_AUTHORITY_INVALID`(cert thumbprint 不匹配 CurrentUser\Root)。詳見 `phycool-e2e-playwright §8.5` + Memory DB tech id=879。

## 伺服器

| 代號 | Port | 說明 |
|------|------|------|
| pcpt | 7135 | ASP.NET Core 主站 |
| vite | 5173 | Vite Dev Server（編輯器 React）|
| dvc | 5174 | DevConsole 記憶庫管理介面 |

## 存取位址

- 平台：https://localhost:7135
- Admin：https://localhost:7135/mgmt/login
- 編輯器：https://localhost:7135/Editor
- Vite Dev Server：**https**://localhost:5173(2026-05-12 epic-eft 起改 HTTPS,共用 dotnet dev-cert,詳 `vite.config.ts:104-113`;若 `.certs/dev-cert.pem` 不存在會 silently fallback HTTP,需先 `dotnet dev-certs https -ep .certs/dev-cert.pem --format pem`)
- DevConsole：http://localhost:5174

---

## 進階模式:backend stdout capture(systematic-debugging Phase 1 step 4 整合)

當 backend ASP.NET Core 出現 silent fail / 5xx 但 console 無有效 trace / EF Core slow query 需 trace 時,啟用 stdout capture,對齊 [`systematic-debugging`](../systematic-debugging/SKILL.md) §Phase 1 step 4 *Gather Evidence in Multi-Component Systems*(SKILL.md:103-139)。

### 4-Layer Pipeline Boundary Instrumentation

| Layer | 邊界 | 觀測指令 |
|:----:|:----|:----|
| **L1 Kestrel** | HTTP request 進 Kestrel | `dotnet run --project src/YourApp/Web *>&1 \| Tee-Object -FilePath logs/backend-stdout-{ts}.log` |
| **L2 Middleware** | Auth / RequestLogging / ErrorHandling | `appsettings.Development.json` 加 `Logging.LogLevel.Microsoft.AspNetCore = "Debug"` |
| **L3 Controller** | Action method entry/exit | `ILogger<T>` + `LogInformation("Entering {ActionName}", nameof(...))` |
| **L4 Service / EF Core** | DB query / Service call | 對齊 Phase 4 EF Core LogLevel.Information(Stage α 已啟用 · `appsettings.Development.json`)+ SQL Query Store(Stage α verified) |

### 啟用範例(PowerShell)

```powershell
# Tee-Object 同時捕捉 stdout 至檔案 + console(對齊 systematic-debugging Phase 1 step 4 evidence gathering)
$Ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogDir = "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory $LogDir | Out-Null }
$LogPath = "$LogDir/backend-stdout-$Ts.log"
powershell -File .claude/skills/start-servers/scripts/start-servers.ps1 pcpt *>&1 | Tee-Object -FilePath $LogPath
```

### 何時觸發進階模式

- backend silent fail(無 5xx response 但功能異常)
- E2E test fail 但 Chrome MCP / Playwright console 無 stack trace
- EF Core SQL > 500ms slow query 需 file:line trace(對齊 Stage β β-8 Application Insights 整合)
- Multi-component 整合測試(對齊 systematic-debugging Phase 1 step 4)
- ecc-07~10 L2 atomic instincts dispatch quality 觀測(對齊 IDD-STR-001 D4 evidence-based gate)

### 與 systematic-debugging 銜接(Iron Law 守護)

取得 stdout log 後 **MUST** 回到 systematic-debugging SKILL Phase 1 → 4 完整紀律:

1. **Phase 1 Root Cause**: Read errors carefully(L1-L4 log 完整讀)+ Reproduce + Check recent changes + **Multi-Component Diagnostic**(本章 4-Layer boundary)+ Trace data flow
2. **Phase 2 Pattern Analysis**: Find working examples(對比 Stage α 16 actions 成功 log)
3. **Phase 3 Hypothesis Testing**: Single hypothesis · minimal test · verify before continuing
4. **Phase 4 Implementation**: Failing test case · single fix · verify · 若 3+ fixes 失敗 → 質疑架構(Iron Law #3)

> ⚠️ **Iron Law**: 收到 log evidence 後**禁直接 propose fix**,必走 Phase 1 → 4 完整紀律。違反者命中 systematic-debugging SKILL.md §Common Rationalizations「Just try changing X」紅旗 + Iron Law #1 NO FIXES WITHOUT ROOT CAUSE。

---

## Version History

| 版本 | 日期 | 變更 |
|:----:|:----:|:----|
| **2.2.0** | **2026-05-23** | Stage β β-1 紀律補完。新增「進階模式 · backend stdout capture」章節,對齊 `.claude/skills/systematic-debugging/SKILL.md:103-139` Phase 1 step 4 *Multi-Component Diagnostic* 4-Layer Pipeline Boundary(L1 Kestrel / L2 Middleware / L3 Controller / L4 Service+EF Core)+ Tee-Object PowerShell snippet + 與 systematic-debugging Iron Law 銜接守護。新增 5 trigger keywords(backend stdout capture / 觀測 / 進階觀測模式 / multi-component diagnostic / 4-layer pipeline boundary)。觸發:Stage β P0 紀律補完(`claude token減量策略研究分析/實施報告/Stage-β-execution-tree.md` β-1)為 ecc-07~10 L2 atomic instincts dispatch quality 觀測軸基建。Cross-ref: `phycool-e2e-playwright §8.5` + Memory DB tech id=879 + IDD-STR-001 critical(不違反 4 forbidden_changes,本章不啟用 Phase 3 multi-agent / 不引入 HyperAgents / 不用 Opus 承載 dispatch / 非 production 化)。對齊 saas-to-skill Mode B 八面向驗證 + skill-tool-invocation-mandatory 字面 Skill tool 調用 ✅ + single-engine-mode `.claude/` 唯一 SSoT ✅。 |
| 2.1.2 | 2026-05-12 | epic-eft Vite HTTPS 整合(dotnet dev-cert 共用 `.certs/dev-cert.pem`)+ cert reload 機制(`pcpt --restart`)+ ERR_CERT_AUTHORITY_INVALID troubleshooting。 |
| 2.1.x | 2026-04-05 | epic-sku DevConsole(5174)整合 + check-status 模式 + 單一 server 啟動參數(`pcpt` / `vite` / `dvc`)。 |
| 2.x.x | 2026-03-17 | 初版建立 — PowerShell 啟動腳本 + 全部啟動 / restart / check / 單一啟動 5 種模式。 |

---

## Source & Attribution

- **Skill**: `.claude/skills/start-servers/SKILL.md` v2.2.0
- **Script**: `.claude/skills/start-servers/scripts/start-servers.ps1`
- **Integrated**: `.claude/skills/systematic-debugging/SKILL.md` v1.0.0(MIT · Jesse Vincent 2025 superpowers-main distilled)
- **Memory DB tech id**: 879(dev-cert reload mechanism)
- **Related ADR**: ADR-ECC-LEARNING-001(Stage β β-1 為 ecc-07 L2 instinct dispatch 觀測基建)+ IDD-STR-001 critical(對齊 D4 evidence-based gate)
