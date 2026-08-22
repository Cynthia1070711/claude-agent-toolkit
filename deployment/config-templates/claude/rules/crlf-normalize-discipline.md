---
paths:
  - "scripts/**/*.{cjs,js,mjs,ts}"
  - "scripts/**/*.ps1"
  - "scripts/**/*.sh"
  - ".claude/hooks/**/*.js"
  - ".claude/hooks/**/*.cjs"
  - ".claude/skills/**/scripts/**/*.{js,cjs,ps1,sh}"
  - ".context-db/scripts/**/*.{js,cjs}"
---

# CRLF + BOM Normalize Discipline — 批次腳本處理 Mixed Line Endings + UTF-8 BOM (CRITICAL)

> **嚴重等級**: CRITICAL
> **建立**: 2026-05-16(P2-Wave-2/3 14 SKILLs frontmatter loss + 3 SKILLs BOM false positive 雙事故觸發)
> **配套 Hook**: `.claude/hooks/crlf-normalize-guard.js`(PreToolUse Edit|Write advisory)

---

## 1. Why This Rule

Windows 環境(PowerShell 5.1 / VS / Antigravity)預設寫入 **CRLF (`\r\n`)** 行尾 + 某些檔案有 **UTF-8 BOM (`﻿` = 0xEF 0xBB 0xBF)**。批次腳本若不 normalize,strict 比對(如 `lines[0] === '---'`)會誤判:

- **CRLF**: `lines[0] === '---\r'` 不等於 `'---'` → frontmatter detection fail
- **BOM**: `lines[0] === '﻿---'` 不等於 `'---'` → frontmatter detection fail
- **混合**: 部分檔 LF / 部分 CRLF,行為不一致

## 2. Incident Records

### 2026-05-16 P2-Wave-2/3 frontmatter loss (CRLF)

`scripts/temp/wave-2-3-cores.cjs` extractFrontmatter 未 normalize CRLF,導致 14 SKILLs 被誤判為「無 frontmatter」,新 core 覆寫時完整 frontmatter 全部遺失。從 `git show HEAD~1` 還原 + script 修補 `.replace(/\r\n/g, '\n')`。

### 2026-05-16 P3 3 SKILLs BOM false positive

`phycool-admin-module / admin-rbac / auth-identity` SKILL.md 有 UTF-8 BOM,audit-config.js 與 Claude Code SKILL loader 都因 `lines[0] !== '---'` 嚴格比對失敗,標 "缺 YAML frontmatter"(實際有,只是 BOM 干擾)。BOM 剝除後恢復正常。

---

## 3. Mandatory Pre-Read Normalize Patterns

### 3.1 Node.js / JavaScript

```javascript
// ✅ RECOMMENDED: 一次性 normalize CRLF + BOM
const fs = require('fs');
const raw = fs.readFileSync(filePath, 'utf8');
const content = raw
  .replace(/^﻿/, '')      // 去 BOM (file start only)
  .replace(/\r\n/g, '\n');     // CRLF → LF

const lines = content.split('\n');
if (lines[0] === '---') { /* frontmatter detected */ }
```

```javascript
// ❌ FORBIDDEN: 直接 split('\n') 不 normalize
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');
if (lines[0] === '---') { /* FAIL on CRLF/BOM files */ }
```

### 3.2 PowerShell 5.1

```powershell
# ✅ RECOMMENDED: 讀取後明確 normalize
$content = (Get-Content $filePath -Raw -Encoding UTF8).Replace("`r`n", "`n").TrimStart([char]0xFEFF)
$lines = $content -split "`n"

# 轉成 CRLF(Windows 標準寫回):
(Get-Content "script.ps1") | Set-Content "script.ps1"

# 轉成 LF(Unix 標準,給 bash/sh 用):
(Get-Content "script.sh" -Raw).Replace("`r`n", "`n") | Set-Content "script.sh" -NoNewline

# 去 BOM 寫入(UTF-8 No-BOM):
[System.IO.File]::WriteAllText($filePath, $content, [System.Text.UTF8Encoding]::new($false))
```

### 3.3 Bash

```bash
# ✅ RECOMMENDED: dos2unix 或 sed normalize
sed -i 's/\r$//' file.sh                 # CRLF → LF
sed -i '1s/^\xEF\xBB\xBF//' file.sh       # 去 BOM (第一行)

# 或一行:
sed -i -e 's/\r$//' -e '1s/^\xEF\xBB\xBF//' file.sh
```

---

## 4. FORBIDDEN

❌ **`fs.readFileSync(path, 'utf8').split('\n')` 不 normalize**
   Common Rationalization: "我寫的 .md/.json 都是 LF,不需要處理"
   Red Flag: 處理跨平台或 git autocrlf 檔時 `lines[0] !== '---'` 誤判

❌ **`lines[0] === '---'` 嚴格比對前未去 BOM**
   Common Rationalization: "BOM 很少見"
   Red Flag: PhyCool 已多次踩 BOM 陷阱(P2 fix 還原 + P3 admin-module/rbac/auth-identity false positive)

❌ **`fs.writeFileSync(path, content)` 寫 JSON IPC 不指定 UTF-8 No-BOM**
   Common Rationalization: "Node 預設 UTF-8 沒 BOM"
   Red Flag: 部分環境 / 工具會自動添加 BOM,造成下游 parser 失敗

❌ **PowerShell `Set-Content` 預設 (Windows-1252 / OEM) 寫繁中**
   Common Rationalization: "輸出顯示正常"
   Red Flag: Set-Content 不指定 `-Encoding UTF8` 可能亂碼;UTF8 預設加 BOM 不一定可接受

❌ **批次腳本處理多檔不 sample-test 第一個檔**
   Red Flag: 14 檔 batch write 全壞才發現

---

## 5. Self-Check(寫批次 script 前 4 題)

1. **「我讀檔後是否立即 normalize CRLF + BOM?」** → 否 → STOP,加 `.replace(/\r\n/g, '\n').replace(/^﻿/, '')`
2. **「我用 `===` 比對行內容?是否考慮 trailing `\r`?」** → 是 → 加 normalize
3. **「我寫檔時是否明確指定 UTF-8 No-BOM?」** → 否 → 加 `[System.Text.UTF8Encoding]::new($false)` (PS) 或 fs.writeFileSync(path, content, 'utf8')(Node 預設 OK)
4. **「批次處理多檔前,我有 sample-test 一個檔的輸出?」** → 否 → STOP,先驗證 1 個檔

---

## 6. Hook 機械守護

`.claude/hooks/crlf-normalize-guard.js`(PreToolUse Edit|Write,advisory):
- 偵測 `.cjs/.js/.mjs/.ps1/.sh` 檔內容
- 若 `split('\n')` 出現但無 `\\r\\n` normalize 或 BOM strip → 注入 additionalContext
- Non-blocking,提示工程師加 normalize 邏輯

---

## 7. Cross-Reference

- `.claude/rules/encoding-discipline.md` — PowerShell 5.1 UTF-8 BOM(對 `.ps1/.cs/.razor/.cshtml` 必含 BOM)
- `.claude/rules/cross-ref-discipline.md` — 改 hook/rule/skill 前 cross-ref 查詢(本 rule 配套)
- `.claude/skills/cc-config-author/scripts/audit-config.js` — parser 已加 CRLF normalize(2026-05-16 V2-01 修補),BOM tolerance 待加

> **語境區別**: encoding-discipline.md 規範 `.ps1/.cs` 等檔**必含 BOM**(VS 2026 / PowerShell 5.1 預設要求);本 rule 規範 **script 處理流程**讀其他檔時必先 normalize CRLF + BOM。兩者互補不衝突。

---

## 8. 繁體中文編碼安全保證(2026-05-16 補充)

**Q**: 移除 BOM 會造成繁中亂碼嗎?
**A**: **不會**。BOM 與繁中字元編碼是**兩件獨立的事**。

### 8.1 核心區別

| 概念 | 角色 | 影響繁中? |
|------|------|----------|
| UTF-8 編碼 | 字元編碼方式(萬→3 bytes `E8 90 AC`) | ✅ 繁中存活的根本 |
| UTF-8 BOM | 檔頭 3 bytes `EF BB BF` 標誌 | ❌ 只是檔頭標誌,不影響內容 |

### 8.2 為何 .ps1/.cs 必含 BOM 但 .md 可不含

| 檔案類型 | BOM 需求 | 原因 |
|----------|---------|------|
| `.ps1` / `.psm1` | **必含** | PowerShell 5.1 `Get-Content` 預設 Windows-1252,無 BOM 繁中變亂碼 |
| `.cs` / `.razor` / `.cshtml` / `.sln` / `.csproj` | **必含** | VS 2026 / MSBuild ASCII fallback 風險 |
| `.md` / `.json` / `.yml` | **No-BOM 標準** | GitHub / npm / Jekyll / VS Code / Antigravity 預設 UTF-8 |

**核心原則**: 看檔案類型決定 BOM,**不是看是否含繁中**。

### 8.3 安全寫法 cheatsheet

| 場景 | 安全寫法 |
|------|---------|
| Node 寫 `.md/.json` | `fs.writeFileSync(path, content, 'utf8')` (預設 No-BOM) |
| Node 寫 `.ps1/.cs` | `fs.writeFileSync(path, '﻿' + content, 'utf8')` (加 BOM) |
| PS 寫 `.md/.json` | `[System.IO.File]::WriteAllText($p, $c, [System.Text.UTF8Encoding]::new($false))` (`$false`=No-BOM) |
| PS 寫 `.ps1/.cs` | `[System.IO.File]::WriteAllText($p, $c, [System.Text.UTF8Encoding]::new($true))` (`$true`=BOM) |

### 8.4 驗證:2026-05-16 3 SKILLs BOM 剝除實測

```
phycool-admin-module 開頭 bytes:
  2d 2d 2d 0a              ← "---\n" (frontmatter delimiter)
  6e 61 6d 65 ...          ← "name: " (ASCII)
  e5 be 8c e5 8f b0        ← "後台" (繁中 UTF-8 3 bytes/字 完整保留)
  e6 a8 a1 e7 b5 84        ← "模組" (繁中 UTF-8 3 bytes/字 完整保留)
```

✅ 繁中 byte-for-byte 保留,SKILL loader + audit-config.js 均正常 parse description。

---

## 8. Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.0.0** | **2026-05-16** | 初版建立。觸發:P2-Wave-2/3 frontmatter loss + P3 BOM false positive 雙事故。CRITICAL 等級。paths-scoped 至 scripts/ + hooks/ + skills scripts/。配套 hook `.claude/hooks/crlf-normalize-guard.js` PreToolUse advisory。 |
