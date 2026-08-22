---
paths:
  - "audit/**"
  - "docs/tracking/**"
  - "docs/implementation-artifacts/reviews/**"
  - "docs/implementation-artifacts/specs/**"
  - "docs/implementation-artifacts/stories/**"
  - "docs/technical-decisions/**"
  - "_bmad/**"
  - "**/*audit*"
  - "**/*review*"
  - "**/*verify*"
---

# Constitutional Depth-First Verification Mandate (CRITICAL — Permanent)

> **抽出自**: `.claude/rules/constitutional-standard.md` (2026-05-16 split,paths-scoped 降載入成本)
> **嚴重等級**: CRITICAL — Permanent
> **建立日期**: 2026-04-09

任何「檢查 / 審查 / 確認 / 驗證 / 完整性」類問題,**必須預設深度路徑**:讀取實際內容 + 逐項對照要求 + 主動挑戰,**禁止**用統計 metadata 代替內容驗證。

## 觸發關鍵字(中英文)

當使用者 prompt 包含以下任一關鍵字,**立即進入深度驗證模式**:
- 「檢查 / 審查 / 確認 / 驗證」
- 「完整 / 齊全 / 補全 / 都 ... 了嗎」
- 「有做 / 沒問題 / 沒漏 / 對的嗎」
- "verify / check / audit / review / confirm / complete"
- "all done / everything / correct"

## 強制執行清單

| 情境 | ❌ 禁止(淺層) | ✅ 要求(深度) |
|------|----------------|----------------|
| **檢查 Story 框架** | SQL 查欄位長度 / 狀態統計 | **逐一 Read user_story / background / AC 完整內容**,對照 Framework 規範 |
| **檢查 Code** | grep 存在性 | **Read file:line**,對照 spec / skill / ADR |
| **檢查 Docs** | ls 檔案列表 | **Read 完整內容**,對照 code(真相來源) |
| **檢查 DB 記錄** | COUNT(*) / LENGTH(col) | **SELECT full content**,對照要求逐項 |
| **檢查 Memory** | search 標題 | **include_content:true** 讀完整內容 |
| **檢查 Skill 同步** | 比對 file 存在 | **Read SKILL.md 全文**,驗證內容一致 |

## Mandatory Flow (3 層深度)

```
Layer 1 (必做): 讀取實際內容(Read/SELECT/cat)
Layer 2 (必做): 對照已知要求/規範/Framework 逐項驗證
Layer 3 (必做): 主動挑戰「upsert warning / 格式 / 品質 / 邊界案例」
```

**一次到位,不等用戶追問。**

## FORBIDDEN

- ❌ **Statistics Fallacy**: 用 COUNT / LENGTH / 狀態分佈代替內容檢查
- ❌ **Warning Blindness**: 忽略 upsert-*.js / linter / compiler 的 warning
- ❌ **False Context Economy**: 為了「省 token」做淺層檢查(追問 2-3 次的成本 > 一次深度)
- ❌ **Effort Theater**: 選「看起來有做事」而非「真正需要深度」
- ❌ **Default OK**: 假設「沒報 error 就是 OK」
- ❌ **Metadata Only**: 不讀實際內容就下結論

## 自我挑戰檢核(每次回答前 3 題)

1. **「如果我是用戶,會追問什麼?」** — 若答得出來,應該先補上
2. **「這個統計/標題/metadata 代表實質品質嗎?」** — 若不代表,必須讀實際內容
3. **「有沒有 warning 被我忽略了?」** — 若有,必須調查並說明

## Audit Anti-Patterns Mandate(2026-05-05 整併)

Audit / 檢查 / 比對任務 4 條反模式:

- **L1 Cross-validation Mandatory**: 7 維度文檔同 term 一致性檢查為前提
- **L2 Multi-Perspective EXCEPTION**: 真實 vs 自我模擬陷阱(Party Mode 顯式調用為例外)
- **L3 自建 artifacts 不該作 evidence**: 自製 SDD Spec 反逆推作 evidence = bias
- **L4 Task framing**: 完整讀取使用者指示,不裁切

**Self-Check 4 題每次 Audit 前必問**:
1. 已 cross-validate 7 維度同 term 一致?(L1)
2. 是否被 multi-perspective 自我模擬混淆?(L2)
3. 我引用的 evidence 是 user 提供的還是我自建的?(L3)
4. 完整讀過 user 指示了嗎?(L4)

## Incident Records

- **2026-04-09 Epic DLA 框架檢查事故**: 第一次問「dla 框架補全了嗎」→ 只查欄位長度 + 狀態分佈 + 依賴統計。第二次問「都檢查過內容了嗎」→ 才實際讀 user_story/background/AC,發現 1 typo + 3 Stories AC 偏少。
- **2026-03-21 33% false positive 事故**: tracking docs + memory DB 與實際 code 有 33% 不一致。
- **2026-04-29 Session 56 Audit Phase F 60% false positive 事故**(`eft-trial-autocharge-impl`): 11 個 Critical/High findings 是 false positive(confirmation bias + 自分飾 Party Mode + 自建 SDD Spec 逆推)。60% 比既有 33% 更嚴重,規則層強化以防新對話視窗 cold start 失傳。

## 跨情境應用範例

| 情境 | ❌ 淺層 | ✅ 深度 |
|------|---------|---------|
| 「任務交接.md 過時了嗎?」 | `wc -l` 看行數 | Read 完整檔案 → 比對 Session 實際狀態 → 列出過時段落 |
| 「skill 有沒有遺漏重點?」 | `grep` 關鍵字 | Read SKILL.md 全文 → 對照最近 Story 實作 → 逐章節評估 |
| 「Memory DB 有沒有紀錄?」 | `search_context` 只看標題 | `search_context({include_content: true})` → 讀完整內容 |
| 「DB Migration 成功?」 | 看 exit code = 0 | `SELECT * FROM 新表` 驗證 schema + `INSERT/SELECT` 測試 trigger |
| 「Pipeline CR 通過?」 | 看 stories.status = done | Read review_reports.findings JSON → 逐項檢查 FIXED/DEFERRED |

## Related

- `.claude/rules/constitutional-standard.md` — Code Verification + Timestamp + Language(always-on 核心)
- `.claude/rules/constitutional-backend-contract.md` — Backend Contract(paths-scoped)
- `.claude/rules/constitutional-external-citation.md` — External Source Citation(paths-scoped)
