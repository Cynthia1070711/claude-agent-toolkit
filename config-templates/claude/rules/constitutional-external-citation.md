---
paths:
  - "docs/**"
  - "**/*.md"
  - "src/**"
  - "_bmad/**"
---

# Constitutional External Source Citation & Information Retrieval Mandate (CRITICAL — Permanent)

> **抽出自**: `.claude/rules/constitutional-standard.md` (2026-05-16 split,paths-scoped 降載入成本)
> **嚴重等級**: CRITICAL — Permanent
> **建立日期**: 2026-04-24 v2(DETECT-FETCH-CITE 完整三步)

引用外部 URL / 官方文檔 / 第三方 API spec / 套件版本行為的陳述,**必須走完整 DETECT → FETCH → CITE 三步循環**,不可依賴訓練資料記憶。

## §DETECT 步驟(辨識何時需 fetch)

agent 遇到以下情境必觸發 DETECT:
- 引用第三方 API / 套件版本行為(ECPay / SendGrid / EF Core / React)
- 規範性陳述(RFC / W3C / 政府公告 / OWASP)
- 跨 Story 引用(可能已有相關決策 / debt / IDD)
- 「我記得 X 是這樣...」「以前做過類似的...」(訓練資料 / 模糊記憶)
- 商業規則 / 合規要求(GDPR / 個資法 / 財政部規格)

**禁止**: 直接以記憶回答而不走 DETECT。

## §FETCH 步驟(分兩分支)

### 分支 A — 內部 RAG 優先(MCP query 6 步順序)

遇 PhyCool 內部相關資訊,**必先**依下列順序查 Context Memory DB,**不要直接 WebFetch**:

| 順序 | MCP Tool | 用途 |
|:-:|----------|------|
| 1 | `mcp__phycool-context__search_documents` | 查 PhyCool 內部 PRD / spec / 技術文件 |
| 2 | `mcp__phycool-context__search_context` | 查歷史 session / decision / pattern / debug |
| 3 | `mcp__phycool-context__search_intentional_decisions` | 查 IDD-COM/STR/REG/USR 決策 |
| 4 | `mcp__phycool-context__search_tech` | 查歷史技術方案 / bugfix |
| 5 | `mcp__phycool-context__search_debt` | 查歷史 tech debt(已解 / 已分類) |
| 6 | `mcp__phycool-context__search_glossary` | 查術語定義(避免歧義) |

**內部找到** → 引用該記錄 ID(如 `[Source: context_entries id=3287 | Verified 2026-04-24]`),**跳過外部 fetch**

### 分支 B — 外部 WebFetch(內部 6 步全查不到才走)

```
1. WebFetch(URL)取得最新內容
2. 必走 §CITE 記錄 source + fetch_date
3. (建議)add_context({category:'reference', source_url, fetched_at}) 入 RAG 池
```

## §CITE 步驟

### 強制禁止

- ❌ 「React 18 的 useSyncExternalStore 建議這樣用」(無引用)
- ❌ 「ECPay 最新 CheckMacValue 規範是...」(無 fetch_date)
- ❌ 「.NET 8 默認 xxx」(可能過時)
- ❌ 「這個 NuGet 套件 v3.x 已 deprecated」(需 WebFetch 實測)
- ❌ 「根據 RFC 7807 的 problem+json 格式...」(未附 URL / section 號)

### 正確格式

對話引用:
```
[Source: https://react.dev/reference/react/useSyncExternalStore | Fetched 2026-04-24]
官方建議僅用於 read-only store,修改請用 useState。
```

程式碼註解:
```csharp
// Source: https://learn.microsoft.com/en-us/dotnet/api/system.runtime.serialization.formatters.binary.binaryformatter
// Fetched 2026-04-24
// BinaryFormatter is obsolete since .NET 5, do not use.
```

## 觸發時機

1. **WebFetch / WebSearch 結果引入對話** → 必帶完整 URL + 抓取日期
2. **引用套件官方文檔** → package + version + URL + fetch_date
3. **規範性陳述**(RFC / W3C / 政府公告) → URL + section 號
4. **第三方 API 行為描述**(ECPay / SendGrid / Google) → fetch_date 優先於「記憶中的版本」

## Anti-Speculation Mandate(2026-05-05 整併)

30 詞投機表(無證據禁用):**可能 / 估計 / 應該 / 大概 / 似乎 / 推測 / ~% / ~分鐘 / ~小時 / 約 / 暫估 / 略 / 預估 / 可能會 / 應當 / 或許 / 可以說 / 看起來 / 似乎是 / 一般而言 / 通常 / 常見地 / 多數情況 / 預設 / 應該是 / 推論 / 推估 / 大約 / 可知 / 預測**

**Self-Check 4 題**:
1. 我有 file:line evidence 嗎?
2. claim 與 diff 對照過嗎?
3. 別名是否 case-insensitive 確認過?
4. 獨立 reviewer 對照過嗎?

**Migration 必附 4-tuple**: `{source, target, claim_count, verification_method}`

## 與既有 Mandate 的關係

三條 Mandate 構成完整**證據鏈**:

| Mandate | 適用範圍 | 證據要求 |
|---------|---------|---------|
| Code Verification Mandate | PhyCool 本地 code 行為 | Read tool + file:line |
| Backend Contract Verification | DB schema / API response / Entity 語意 | Read backend .cs file:line |
| **External Source Citation**(本條) | 外部文件 / 官方 spec / 套件行為 | URL + fetch_date |

本地必 Read、backend contract 必引、**外部文件必 cite**。任一缺失等於 agent 依賴記憶,違反憲政層級。

## Related

- `.claude/rules/constitutional-standard.md` — Code Verification + Timestamp + Language(always-on 核心)
- `.claude/rules/constitutional-backend-contract.md` — Backend Contract(paths-scoped)
- `.claude/rules/constitutional-depth-first.md` — Depth-First Verification(paths-scoped)
