---
paths:
  - "**/*.ps1"
  - "**/*.psm1"
  - "**/*.psd1"
  - "**/*.cs"
  - "**/*.razor"
  - "**/*.cshtml"
  - "**/*.sln"
  - "**/*.csproj"
---

# Encoding Discipline — PowerShell 5.1 繁中 UTF-8 機械守護 (SUPREME)

> **嚴重等級**: SUPREME (對齊 phycool-windows-ps-encoding Skill + check-ps-encoding.cjs CI guard + encoding-bom-guard.js PreToolUse hook)
> **建立**: 2026-05-04 (party-to-pipeline v5.0.0 T3.3 task)/ **paths-scoped**: 2026-05-16(原 always-on 70 行降級為 lazy-load,Write 場景由 encoding-bom-guard.js hook 兜底)

---

## 1. Purpose

本 rule 為 SUPREME pointer,主規範指向 `phycool-windows-ps-encoding` Skill 完整內容。任何 .ps1 開發 / 編輯 / Hook 都必對齊以下 4 大要求,違反 = CI guard `scripts/check-ps-encoding.cjs` BLOCK。

---

## 2. Mandatory Action 矩陣

| 場景 | 必走機制 | 主規範 |
|:-----|:---------|:------|
| `.ps1` 含中文 / em dash | UTF-8 with BOM (前 3 byte EF BB BF) | phycool-windows-ps-encoding §3 |
| `.ps1` 頂端 init | `[Console]::OutputEncoding` + `[Console]::InputEncoding` + `$PSDefaultParameterValues['*:Encoding']='utf8'` 3 行 (**param() 之後** — PowerShell parser 要求 param() 為第一個可執行語句) | phycool-windows-ps-encoding §3 |
| 文件讀寫 | `Read-Utf8File` / `Write-Utf8File` / `Read-JsonFile` / `Write-JsonFile` (shared-utils.ps1 T5.5 helpers) 取代 `Get-Content` / `Set-Content` / `Out-File` 預設 | phycool-windows-ps-encoding §4 |
| Stop Hook stdin | `[Console]::InputEncoding = UTF8` 後 `[Console]::In.ReadToEnd()` | phycool-windows-ps-encoding §5 |
| Start-Process 中文 | 改 `@tempfile` 範式(避 Win32 ANSI 截斷) | phycool-windows-ps-encoding §6 |
| 危險字元 | 移除 em dash (—) → `--`;box drawing 移除 / curly quotes / 全形空白 | phycool-windows-ps-encoding §7 |
| party-to-pipeline 宿主契約 | 禁 `Start-Process pwsh` / `pwsh.exe`(生產宿主鎖定 Windows PowerShell 5.1,2026-07-27 使用者裁定;變更宿主須先重跑 whp-1 R2) | phycool-windows-ps-encoding §13 |

---

## 3. FORBIDDEN

對齊 phycool-windows-ps-encoding §FORBIDDEN 8 條 + 本 rule 加機械層:

- ❌ 跳過 CI guard `scripts/check-ps-encoding.cjs` 直接 commit `.ps1` 改動
- ❌ 解釋「.ps1 已運作沒亂碼」忽略 BOM 缺失 (PS 5.1 dot-source silent fail 隱性風險)
- ❌ party-to-pipeline scripts 出現 `Start-Process pwsh` / `pwsh.exe`(宿主鎖定 Windows PowerShell 5.1;變更宿主須先重跑 whp-1 R2)

---

## 4. CI Guard

```bash
node scripts/check-ps-encoding.cjs
# Exit 0 = all pass
# Exit 1 = violations + reason on stderr (按檔案 / 規則列)
```

加入 `.scripts/check-hygiene.ps1` chain (commit 前自動跑)。

---

## 5. Self-Check (commit `.ps1` 前 5 題)

1. `.ps1` 含中文嗎? → 必有 UTF-8 BOM (VS Code 右下角)
2. 頂端 3 行 UTF-8 init 在 `param()` 之後嗎?(PowerShell parser 要求 param() 為第一個可執行語句)
3. 用 `Read/Write-Utf8File` helpers 而非 `Get/Set-Content` 預設嗎?
4. 危險字元 (em dash / box drawing / curly quotes / 全形空白) 移除了嗎?
5. (若為 party-to-pipeline scripts)是否出現 `Start-Process pwsh` / `pwsh.exe`?→ 必移除,宿主鎖定 Windows PowerShell 5.1

---

## 6. Related

- `.claude/skills/phycool-windows-ps-encoding/SKILL.md` v1.1.1 — 主規範 (13 章,含 §13 宿主契約)
- `.claude/skills/party-to-pipeline/scripts/shared-utils.ps1` T5.5 — 4 helpers (Read/Write-Utf8File / Read/Write-JsonFile)
- `scripts/check-ps-encoding.cjs` — CI guard (9 條規則,含 grandfather 造冊 scope 判定)

---

## 7. Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.1.1** | **2026-07-27** | **`td-devenv-guard-psenc-doc-convergence` code-review cross-ref 同步**。§6 Related 的 `phycool-windows-ps-encoding/SKILL.md` 版號引用 v1.1.0 → v1.1.1(該 Skill 於同一 CR 走 `Skill(skill="saas-to-skill")` Mode B 修復 3 項:AC16 漏改的 `references/header-explained.md` 錯誤 param() 順序章節、§13 兩處偵測範圍誤述、範本 em dash)。純版號引用同步,本 rule 之規範內容不變。走 `Skill(skill="cc-config-author")`。 |
| **1.1.0** | **2026-07-27** | **T17(`td-devenv-guard-psenc-doc-convergence`)規範文字矛盾校正**。§2 矩陣「param() 之前」→「param() 之後」+ 新增 party-to-pipeline 宿主契約列(指向 phycool-windows-ps-encoding §13);§3 FORBIDDEN 新增 pwsh spawn 一條;§5 Self-Check 4→5 題(Q2 順序修正 + 新增 Q5 host contract);§6 Related 版號/章節數/CI guard 規則數同步更新。走 `Skill(skill="cc-config-author")`。 |
| 1.0.0 | 2026-05-04 | 初版建立。SUPREME pointer rule,主規範 in phycool-windows-ps-encoding Skill。對齊 party-to-pipeline v5.0.0 T3.3 task + check-ps-encoding.cjs CI guard (T3.2)。 |
