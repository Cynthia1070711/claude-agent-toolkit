# PhyCool

> Project-level memory. **目標 ≤ 120 行**(超過 200 行 Claude 指令遵循率明顯下降)。
> 細節分流到 `.claude/rules/` 與 `.claude/skills/`,大型文件用 `@docs/foo.md` 引用。

## Stack

- Backend: C# / ASP.NET Core MVC / SQL Server / IIS
- Cloud: Microsoft Azure (PaaS)
- Frontend: React 18 + Zustand + Fabric.js
- Build: Vite (web), Visual Studio 2026 (backend)
- Pkg mgr: npm (web), NuGet (.NET)

## Commands

- `dotnet build` — 編譯後端
- `dotnet test` — 跑後端測試
- `npm run dev` — 啟動 Vite dev server (web)
- `npm run build` — 產生 production bundle
- `npm test` — 跑前端測試
- `pwsh ./scripts/deploy-iis.ps1` — 部署到 IIS

## Conventions

- 檔名:kebab-case(`my-component.tsx`)
- 函式:camelCase
- 類別 / interface:PascalCase
- Commit:Conventional Commits(`feat(scope): subject`)
- 編碼:UTF-8 with BOM(PowerShell / C# / Razor)
- 文檔語言:Traditional Chinese (zh-TW)
- 貨幣:NT$
- file:line 引用為憲法級規則

## Architecture references

- Context memory:`@docs/architecture/context-memory.md`
- BMAD v6 pipeline:`@docs/architecture/bmad-pipeline.md`
- Story status flow:`@docs/architecture/story-lifecycle.md`

## Do NOT

- 不要使用「對齁」typo(正確是「對齊」)
- 不要 hard-code 路徑;用 `$CLAUDE_PROJECT_DIR`
- 不要在 PowerShell 用 `Out-File`(無 BOM);用 `[System.IO.File]::WriteAllText`
- 不要直接編輯 `appsettings.Production.json`(機密走 Azure Key Vault)
- 不要 push 到 main(走 PR 流程)
- 不要在 docs/ 寫 .md 前未先註冊到 .context-db(DB-first)

## Workflow

1. 新功能:走 BMAD v6 pipeline(PM → Architect → Implementer → Verifier)
2. 修 bug:read-before-modify,跑相關測試,引用 file:line
3. 文檔變更:先 .context-db 再 .md

> 如果你發現要做的事不在這 4 條 workflow,先問再做。