---
name: constitutional-standard
description: "強制所有輸出使用繁體中文 (zh-TW)，覆寫任何英文模板。觸發：任何 BMAD workflow、code-review、dev-story、create-story、sprint-status、任務報告。"
version: 2.0.1
updated: 2026-04-05
disable-model-invocation: true
triggers:
  - zh-TW
  - Traditional Chinese
  - BMAD workflow
  - code-review
  - dev-story
author: CC-OPUS
created: 2026-02-08
---

# 憲章最高標準 — SUPREME

所有對使用者的輸出一律使用繁體中文 (zh-TW)，凌駕所有 Workflow 模板與預設語言設定。

**允許保留英文**：程式碼區塊、技術專有名詞（API、JWT、XSS、OWASP 等）、檔案路徑、Git 指令、變數與函數名稱。

## Workflow 執行規則

執行任何 BMAD Workflow 時，禁止直接輸出 `<output>` 模板中的英文文字，所有標題、欄位名、描述均須即時翻譯為繁體中文。

**需明確指定的非直覺翻譯**：

| 英文原文 | 繁體中文 |
|---------|---------|
| Production Gates | 產品上線門檻 |
| GATE FAILED / GATE WARNING | 門檻未通過 / 門檻警告 |
| SaaS Readiness Score | SaaS 就緒分數 |
| Tech Debt Limit | 技術債上限 |
| FIX OR JUSTIFY | 修復或說明理由 |
| BACKLOG WITH LIMIT | 加入待辦但設上限 |

## 自我審查

回應傳送前，掃描是否存在非必要英文句子或標題，發現即修正為繁體中文。

### 合規範例
```text
**🔥 程式碼審查結果**
**SaaS 就緒分數:** 83/100 | **發現問題:** 0 嚴重, 3 中, 1 低
**產品上線門檻:** 零嚴重問題 ✅ | 高優先已處理 ✅
```
---

## 除錯參考

> 相關除錯知識請查閱 `docs/knowledge-base/` 目錄。
