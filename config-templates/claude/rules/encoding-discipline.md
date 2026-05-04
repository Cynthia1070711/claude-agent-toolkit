# Encoding Discipline — PowerShell 5.1 繁中 UTF-8 機械守護 (SUPREME)

> **嚴重等級**: SUPREME (對齊 phycool-windows-ps-encoding Skill + check-ps-encoding.cjs CI guard)
> **建立**: 2026-05-04 (party-to-pipeline v5.0.0 T3.3 task)

---

## 1. Purpose

本 rule 為 SUPREME pointer,主規範指向 `phycool-windows-ps-encoding` Skill 完整內容。任何 .ps1 開發 / 編輯 / Hook 都必對齊以下 4 大要求,違反 = CI guard `scripts/check-ps-encoding.cjs` BLOCK。

---

## 2. Mandatory Action 矩陣

| 場景 | 必走機制 | 主規範 |
|:-----|:---------|:------|
| `.ps1` 含中文 / em dash | UTF-8 with BOM (前 3 byte EF BB BF) | phycool-windows-ps-encoding §3 |
| `.ps1` 頂端 init | `[Console]::OutputEncoding` + `[Console]::InputEncoding` + `$PSDefaultParameterValues['*:Encoding']='utf8'` 3 行 (param() 之前) | phycool-windows-ps-encoding §3 |
| 文件讀寫 | `Read-Utf8File` / `Write-Utf8File` / `Read-JsonFile` / `Write-JsonFile` (shared-utils.ps1 T5.5 helpers) 取代 `Get-Content` / `Set-Content` / `Out-File` 預設 | phycool-windows-ps-encoding §4 |
| Stop Hook stdin | `[Console]::InputEncoding = UTF8` 後 `[Console]::In.ReadToEnd()` | phycool-windows-ps-encoding §5 |
| Start-Process 中文 | 改 `@tempfile` 範式(避 Win32 ANSI 截斷) | phycool-windows-ps-encoding §6 |
| 危險字元 | 移除 em dash (—) → `--`;box drawing 移除 / curly quotes / 全形 | phycool-windows-ps-encoding §7 |

---

## 3. FORBIDDEN

對齊 phycool-windows-ps-encoding §FORBIDDEN 8 條 + 本 rule 加機械層:

- ❌ 跳過 CI guard `scripts/check-ps-encoding.cjs` 直接 commit `.ps1` 改動
- ❌ 解釋「.ps1 已運作沒亂碼」忽略 BOM 缺失 (PS 5.1 dot-source silent fail 隱性風險)

---

## 4. CI Guard

```bash
node scripts/check-ps-encoding.cjs
# Exit 0 = all pass
# Exit 1 = violations + reason on stderr (按檔案 / 規則列)
```

加入 `.scripts/check-hygiene.ps1` chain (commit 前自動跑)。

---

## 5. Self-Check (commit `.ps1` 前 4 題)

1. `.ps1` 含中文嗎? → 必有 UTF-8 BOM (VS Code 右下角)
2. 頂端 3 行 UTF-8 init 在 `param()` 之前嗎?
3. 用 `Read/Write-Utf8File` helpers 而非 `Get/Set-Content` 預設嗎?
4. 危險字元 (em dash / box drawing / curly quotes) 移除了嗎?

---

## 6. Related

- `.claude/skills/phycool-windows-ps-encoding/SKILL.md` v1.0.0 — 主規範 (12 章)
- `.claude/skills/party-to-pipeline/scripts/shared-utils.ps1` T5.5 — 4 helpers (Read/Write-Utf8File / Read/Write-JsonFile)
- `scripts/check-ps-encoding.cjs` — CI guard (5 條規則)

---

## 7. Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.0.0** | **2026-05-04** | 初版建立。SUPREME pointer rule,主規範 in phycool-windows-ps-encoding Skill。對齊 party-to-pipeline v5.0.0 T3.3 task + check-ps-encoding.cjs CI guard (T3.2)。 |
