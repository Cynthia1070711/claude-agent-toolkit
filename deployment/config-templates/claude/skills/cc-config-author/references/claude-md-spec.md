# CLAUDE.md / CLAUDE.local.md 規範(2026 Apr)

依官方 docs 與 2026 年累積的最佳實踐彙整。任何要動 CLAUDE.md 的場景,先讀這份。

---

## 核心原則

CLAUDE.md 是 **always-on context**,每次 session 都載入,直接進入 Claude 的 system prompt。

> Claude Code 的 system prompt 已佔約 50 條指令槽。模型可靠處理 150-200 條指令。因此 CLAUDE.md 實際可用 **100-150 條指令槽**。

每多一行,就排擠其他 always-on 內容(rules、skills metadata)的注意力。

---

## 三層階層

| 層級 | 路徑 | 載入時機 | 共享範圍 |
|---|---|---|---|
| User-level | `~/.claude/CLAUDE.md` | 任何 session | 個人,跨專案 |
| Project root | `<repo>/CLAUDE.md` | 在此 repo 啟動 session | 團隊,版控 |
| Project local | `<repo>/CLAUDE.local.md` | 在此 repo 啟動 session | 個人,gitignore |
| Subdirectory | `<repo>/subdir/CLAUDE.md` | Claude 讀此目錄檔案時 lazy-load | 子模組 |

**載入順序**:User-level → Project root → Project local → Subdirectory(各層級可疊加,衝突時更具體者勝)

---

## 行數預算(嚴格遵守)

| 檔案 | 軟上限 | 硬上限 | 超出後果 |
|---|---|---|---|
| `~/.claude/CLAUDE.md` | 80 行 | 150 行 | 影響所有專案 |
| 專案根 `CLAUDE.md` | 120 行 | 200 行 | **超過 200 行 Claude 開始忽略部分指令** |
| `CLAUDE.local.md` | 30 行 | 80 行 | 個人偏好應極簡 |
| 子目錄 `CLAUDE.md` | 50 行 | 100 行 | Lazy-load,可寫多一點 |

⚠️ **PhyCool 警示**:CLAUDE.local.md 目前估 ~300+ 行(含 CC-OPUS/SONNET/HAIKU 角色 + Delegation Matrix),嚴重超出。Phase 3 拆分至 subagent 後降至 ≤25 行。

---

## 該放什麼(5 大區塊)

依官方建議,有效的 CLAUDE.md 涵蓋 5 區塊(順序由影響大到小):

### 1. Commands(最高 ROI)

Claude 不知道你的專案怎麼 build/test/lint,告訴它:

```markdown
## Commands
- `dotnet test` — 跑 .NET 測試
- `npm run dev` — 啟動前端
- `pwsh ./scripts/deploy.ps1 -Env staging` — 部署到 staging
```

### 2. Architecture(專案結構)

```markdown
## Architecture
- Backend: ASP.NET Core MVC + SQL Server
- Frontend: React 18 + Zustand + Fabric.js
- Hosting: IIS on Azure VM(漸進遷移至 App Service)
- 主要目錄:
  - `src/PhyCool.Web/` — MVC 主專案
  - `src/PhyCool.Domain/` — 領域模型
```

### 3. Conventions(命名、風格、Commit)

```markdown
## Conventions
- C#: 用 PascalCase,async 方法加 Async 後綴
- 檔案:kebab-case for .razor,PascalCase for .cs
- Commit:conventional-commits(feat / fix / chore / refactor)
- PR:標題 ≤72 chars,body 必含 file:line 引用變更點
```

### 4. Workflow(流程)

```markdown
## Workflow
- 寫新功能先建 docs/stories/<id>.md
- BMAD v6 status flow: DRAFT → READY_FOR_ARCH → READY_FOR_BUILD → IN_PROGRESS → DONE
- 完成前必跑 `dotnet test --filter <name>`
```

### 5. Gotchas(陷阱)

```markdown
## Gotchas
- DO NOT 修改 .generated/ 內檔案,用 codegen.ts 重生
- DO NOT 寫 console.log 到 production,用 ILogger
- DO use [System.IO.File]::WriteAllText 而非 Out-File(PS 5.1 BOM 問題)
```

---

## 不該放什麼(常見錯誤)

1. **不該放 Claude 已會的事**
   - ❌ `Always think step by step`
   - ❌ `Be a senior engineer`
   - ❌ `Use best practices`

2. **不該放 linter / formatter 處理的事**
   - ❌ `Indent with 2 spaces`(`.editorconfig` 處理)
   - ❌ `Use single quotes`(prettier 處理)

3. **不該放只在特定場景需要的事**
   - ❌ Deployment 詳細步驟(放 skill)
   - ❌ 特定模組規範(放 `.claude/rules/` + paths)

4. **不該放會過期的具體版本**
   - ❌ `Use React 18.2.0`(寫 `React 18+`)
   - ❌ `dotnet 8.0.300`(寫 `dotnet 8 LTS`)

---

## CLAUDE.local.md 特殊用途

- **個人偏好**:語言、貨幣、tone
- **個人 todo**:暫時的「我這週在做 X」筆記
- **單機環境**:`C:/path` 之類的本地路徑

**範例**(精簡到極致):

```markdown
# CLAUDE.local.md

## Personal preferences
- Language: zh-TW
- Currency: NT$
- Tone: direct, flag risks, no optimistic framing
- file:line citations are constitutional

## Local environment
- Project root: ${PROJECT_ROOT}
- PowerShell 5.1 → encoding requires explicit BOM
```

15 行搞定。**任何超過 30 行的 CLAUDE.local.md 都該拆**。

---

## @import 機制(2026 Mar 新增)

CLAUDE.md 可以 `@` import 其他檔案:

```markdown
## Architecture
@docs/architecture/overview.md

## Workflow
@.claude/team-conventions.md
```

最多 5 層巢狀。第一次遇到外部 @import **會跳出 approval dialog** 確認安全。

**何時用**:
- 多人專案,把 architecture 拆檔讓不同 owner 維護
- CLAUDE.md 主檔精簡到 ≤120 行,細節拆檔

**何時不用**:
- 小團隊,直接寫在 CLAUDE.md 內更直覺
- import 內容也是 always-on,沒省 token

---

## 健檢清單

當你要修改 CLAUDE.md 時:

- [ ] 行數 ≤120(軟)/ ≤200(硬)
- [ ] 沒有 Claude 已會的廢話
- [ ] 沒有 linter 處理的事
- [ ] 有 Commands 區塊
- [ ] 有 Architecture 區塊
- [ ] 有 Gotchas 區塊
- [ ] 沒有具體版本號(用 LTS 或 X+)
- [ ] 沒有只在特定檔案類型需要的規則(那些要進 .claude/rules/ + paths)

---

## /memory 與 /init 命令

- `/init` — 在新專案執行,Claude 自動分析 codebase 產生起始 CLAUDE.md
- `/memory` — 列出當前 session 載入了哪些 memory 檔案(用來除錯 rules 是否真的載入)
- `/compact` — 主動壓縮歷史(建議 60% context 時做)

---

## PhyCool 當前狀態與建議

依摘要與已上傳檔案:

- 專案根 `CLAUDE.md`:14 行 ✅ 在最佳區間
- `CLAUDE.local.md`:估 ~300+ 行 ❌ 嚴重超標,Phase 3 重構
- `~/.claude/CLAUDE.md`(user-level):未知,需單獨健檢

**建議**:Phase 3 把 CLAUDE.local.md 縮到 ≤25 行,參考上面「特殊用途」範例。