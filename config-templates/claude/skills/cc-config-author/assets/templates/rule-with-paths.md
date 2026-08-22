---
paths:
  - "src/api/**/*.cs"
  - "src/api/**/*.razor"
---

# API Layer 規範

> **使用此範本**:複製此檔案到 `.claude/rules/<your-rule-name>.md`,改 paths 與內容。
> **token 預算**:有 paths 的 rule 軟上限 150 行 / 硬上限 250 行。
> **Bug #23478 警示**:paths 規則在 **Write 工具觸發時不會載入**(只在 Read 觸發)。
> 「檔案創建約束」要靠 PostToolUse hook 兜底,不能單靠這個機制。

## 核心約束

- 所有 endpoint 必須有對應的 Swagger XML doc
- Error response 統一格式:`{ error: string, code: number, traceId: string }`
- 不可在 controller 直接呼叫 DbContext;走 Service 層
- 所有 mutation endpoint 必須有 `[Authorize]`

## 命名

- Controller:`<Resource>Controller`(複數)
- Service:`<Resource>Service` + `I<Resource>Service`
- DTO:`<Resource>Dto` 或 `<Action><Resource>Request`

## 文件 cross-reference

- 完整 API contract:`@docs/architecture/api-contract.md`
- ADR:`@docs/adr/api-versioning.md`

## Do NOT

- 不要把 business logic 寫在 controller
- 不要直接回傳 EF entity(走 DTO)
- 不要在 endpoint 內存取 `HttpContext.Session`(用 claims)