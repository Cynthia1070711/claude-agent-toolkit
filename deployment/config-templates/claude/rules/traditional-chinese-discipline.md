---
paths:
  - "src/**"
  - "docs/**"
  - ".claude/**"
  - ".gemini/**"
  - ".agent/**"
  - "memory/**"
  - "CLAUDE.md"
  - "CLAUDE.local.md"
  - "_bmad/**"
  - "scripts/**"
  - "**/*.md"
  - "**/*.cshtml"
  - "**/*.razor"
  - "**/*.tsx"
  - "**/*.ts"
  - "**/*.cs"
---

# Traditional Chinese Discipline (CRITICAL — Permanent)

> **2026-05-02 td-privacy-v2 CR 觸發**: 326 處「對齐」漏網事件,觸發本 rule 建立。
> **2026-05-16 抽至 paths-scoped rule**: 原 CLAUDE.md §1 inline 6 行抽出,paths 廣域覆蓋編輯場景。

## Core Principle

PhyCool 是 **zh-TW 繁體中文專案**,**所有 Chinese 必繁體**。LLM token-level greedy decoding 易在 Traditional Chinese 上下文中漏網**簡體字符 token**(尤其 14-stroke 繁體 vs 6-stroke 簡體落差大者:齊→齐 / 龍→龙 / 飛→飞 / etc.)。

## Root Cause(深度分析)

Claude 訓練資料中簡中網頁佔比遠高於繁中(中國 1B+ vs 台港 25M),token 頻次偏向簡體 → 即使 prompt 設定繁中模式,個別字符 token 仍可能 fallback 至簡體版本。

**對齊** 字面有 326 跨 83 檔污染就是此 token-level drift 的範例(記入 Memory category=pattern, id=3988 延伸)。

## 三層 Prevention

### Layer 1 — Awareness(寫前自檢)

寫繁中前自檢以下高風險詞彙的字符是否簡體漏網:

| 繁體 | 簡體(避免)| 高風險語境 |
|------|------|------|
| 對齊 | 對齐 | code review / spec alignment |
| 論述 | 论述 | docs / spec |
| 語言 | 语言 | i18n / locale |
| 議題 | 议题 | meeting / discussion |
| 設定 | 设定 | config / settings |
| 讀取 | 读取 | file IO / DB query |
| 購買 | 购买 | payment / order |
| 階段 | 阶段 | phase / lifecycle |
| 驗證 | 验证 | validation / test |
| 間題 | 问题 | bug / issue |
| 邏輯 | 逻辑 | logic |
| 實際 | 实际 | runtime / actual |
| 評估 | 评估 | review / audit |
| 還是 | 还是 | conditional |
| 進度 | 进度 | progress |
| 確認 | 确认 | verify / acknowledge |
| 後續 | 后续 | follow-up |
| 細節 | 细节 | detail |
| 樣式 | 样式 | style / CSS |

### Layer 2 — Detection(掃描)

```bash
node scripts/check-traditional-chinese.cjs
```

掃描範圍: `src/` + `docs/` + `.claude/.gemini/.agent/skills` + `CLAUDE.md`。
偵測 100+ 高風險簡→繁字符對。

### Layer 3 — Auto-fix(批次修復)

```bash
node scripts/check-traditional-chinese.cjs --fix
```

Idempotent 批次修復。**--fix 為全 repo 工具**(無單檔模式)— 單檔少量修復一律手動 Edit;批次前先無 --fix 掃描審視清單。

### Layer 2.5 — 豁免機制(2026-06-06 建立,--fix 誤傷「故意簡體」事故觸發)

**故意簡體**(教學對照範例 / zh-CN 資源斷言 / CR 報告違規描述引用)**不是違規**,工具以三層防護辨識,掃描標 `EXEMPT` 透明列出、`--fix` 絕不觸碰:

| 層 | 機制 | 覆蓋場景 |
|:-:|------|---------|
| L1 | 結構排除(EXCLUDE_PATTERNS)| `worktrees/`(隔離 git 工作區)/ `i18n/` / build output / `logs/` |
| L2-A | **同行繁簡並列啟發**(行內同時含簡體字及其對應繁體 → 該字豁免)| 教學箭頭「對齊→对齐」/ 本檔對照表 / aria-label 繁簡欄 |
| L2-B | **標記詞啟發**(行含「簡體/简体/zh-CN/zh_CN/簡繁」→ 整行豁免)| audit 自檢題「(無簡體字符如 对齐)」/ CR 違規描述 / zh-CN JSON 字串 |
| L3 | **顯式造冊** `scripts/check-tc-exemptions.json`(file 級整檔 / line 級 match,必附 reason)| 啟發無法覆蓋者(如 zh-CN 測試斷言整檔)|

**新寫故意簡體時**:優先讓內容天然命中 L2(同行給出繁體對照、或行內含「簡體」字樣);無法時**必須登記 L3 造冊檔並附 reason**,禁裸寫。

**正確修復義務(對稱面)**:豁免僅限上述故意場景;敘述正文中的簡體殘留(如 .cs 註解「對齐 IDD-XXX」)**必須真修**,禁以「歷史檔不動」為由放任(2026-06-06 真殘留 26 檔 73 處即此類,已修)。

## Applies When

任何寫入以下類型檔案時:
- `.md` markdown(docs / specs / SKILL.md / rules / tracking)
- `.cshtml` / `.razor`(Razor view)
- `.tsx` / `.ts`(React component / type / hook)
- `.cs`(C# code 含中文 comment / log message / exception message / DB seed data)

特別注意:
- **AskUserQuestion options**(本 session 違規範例)
- **Memory DB context_entries content**
- **CLI output message**
- **Error code userMessage**

## Self-Check(寫繁中前 3 題)

1. **我打算寫哪些高風險詞彙?**(對齊 / 驗證 / 邏輯 / 實際 / 階段 / 後續 / 設定 / 讀取 等)
2. **每個字符是否確認繁體?**(尤其 14-stroke 繁 vs 6-stroke 簡落差大者)
3. **若量大,是否跑 check-traditional-chinese.cjs?**(避免漏網事件累積)

## Incident Records

- **2026-05-02 td-privacy-v2 CR**:326 處「對齐」漏網跨 83 檔污染,觸發本規範建立
- **2026-05-16 AskUserQuestion 簡體漂移**:「谁進/仅本/实際/评查」等多處簡體字符漏網,User 即時指正(Memory id=4145)
- **2026-06-06 --fix 誤傷「故意簡體」**:為修 1 字跑全域 --fix → 181 檔 871 處被改,四類誤傷(zh-CN 測試斷言半改 / 本檔對照表毀損 / audit 自檢題範例 / CR 報告違規描述引用「簡體「對齐」漏網」被改成同字失真)+ 雙 worktree 各 54 檔污染。User 兩度指正後精準還原 21 處 + worktree checkout,並觸發 Layer 2.5 豁免機制建立(三層防護 + 造冊檔);豁免護航下重跑 --fix 真修 26 檔 73 處真殘留

## Related

- `.claude/rules/constitutional-standard.md` §Language Standard — zh-TW 全域規範
- `scripts/check-traditional-chinese.cjs` — 偵測工具(2026-06-06 升級 line-based + 三層豁免)
- `scripts/check-tc-exemptions.json` — 故意簡體豁免造冊檔(file/line 級,必附 reason)
- `memory/feedback_typo_align_qi_vs_hou.md` — 對齊 typo memory
- Memory DB pattern id=3988 — token-level drift root cause
