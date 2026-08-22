# 08 - State Machine Workflow Patterns

> 蒸餾自 aws-agent-skills/step-functions

## ASL(Amazon States Language)核心 State Types

| State | 用途 |
|---|---|
| **Task** | 執行一個動作(Lambda / API call / Service) |
| **Choice** | 條件分支(if/else) |
| **Parallel** | 平行執行多個分支 |
| **Map** | 對 array 並行處理(類似 map-reduce) |
| **Wait** | 延時(到固定時間 或 等 N 秒) |
| **Pass** | 傳資料不執行(transform input/output) |
| **Succeed** | 標記成功結束 |
| **Fail** | 標記失敗結束 |

## 範例: Order Processing State Machine

```json
{
  "StartAt": "ValidateOrder",
  "States": {
    "ValidateOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:ValidateOrder",
      "Next": "CheckInventory",
      "Retry": [{
        "ErrorEquals": ["States.Timeout"],
        "IntervalSeconds": 2,
        "MaxAttempts": 3,
        "BackoffRate": 2.0
      }],
      "Catch": [{
        "ErrorEquals": ["ValidationError"],
        "Next": "OrderFailed"
      }]
    },
    "CheckInventory": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.inventory.available",
          "BooleanEquals": true,
          "Next": "ProcessPayment"
        }
      ],
      "Default": "OrderFailed"
    },
    "ProcessPayment": {
      "Type": "Parallel",
      "Branches": [
        {
          "StartAt": "ChargeCard",
          "States": { "ChargeCard": { "Type": "Task", "Resource": "...", "End": true } }
        },
        {
          "StartAt": "ReserveInventory",
          "States": { "ReserveInventory": { "Type": "Task", "Resource": "...", "End": true } }
        }
      ],
      "Next": "ShipOrder"
    },
    "ShipOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:ShipOrder",
      "End": true
    },
    "OrderFailed": {
      "Type": "Fail",
      "Cause": "Order processing failed"
    }
  }
}
```

## Retry + Catch 範式

### Retry(指數 backoff)
```json
"Retry": [{
  "ErrorEquals": ["States.Timeout", "ServiceUnavailable"],
  "IntervalSeconds": 2,
  "MaxAttempts": 5,
  "BackoffRate": 2.0
}]
```

對應實際 retry: 2s → 4s → 8s → 16s → 32s

### Catch(錯誤分流)
```json
"Catch": [
  {
    "ErrorEquals": ["States.Timeout"],
    "Next": "RetryLater"
  },
  {
    "ErrorEquals": ["ValidationError"],
    "Next": "NotifyUser"
  },
  {
    "ErrorEquals": ["States.ALL"],
    "Next": "GenericErrorHandler"
  }
]
```

## Express vs Standard 選擇

| 特性 | Express | Standard |
|---|---|---|
| 執行時間 | ≤ 5 分鐘 | ≤ 1 年 |
| 計費 | 按 request + duration | 按 state transition |
| Throughput | 100k execution / sec | 2k execution / sec |
| Visual debug | ❌ | ✅ |
| Audit log | CloudWatch Logs | Execution history(完整) |
| 適用 | 高 throughput / 短任務 / Streaming | 業務流程 / 長任務 / 需 audit |

## Map State(批次處理)

```json
{
  "ProcessBatch": {
    "Type": "Map",
    "ItemsPath": "$.orders",
    "MaxConcurrency": 10,
    "Iterator": {
      "StartAt": "ProcessSingleOrder",
      "States": {
        "ProcessSingleOrder": {
          "Type": "Task",
          "Resource": "...",
          "End": true
        }
      }
    },
    "Next": "Done"
  }
}
```

對 array 並行處理,類似 map-reduce。

## Saga Pattern(分散式交易)

每個 step 有對應 compensating action(撤銷):

```
ChargeCard → ReserveInventory → ShipOrder
   ↓               ↓                 ↓
RefundCard ← ReleaseInventory ← CancelShipment
```

任一 step 失敗,反向執行 compensating actions。

## Long-running Tasks

Step Functions 自身限制(Standard 1 年),但單一 Task 也有限(Lambda 15 分鐘)。

### Pattern A: Activity(callback)
```json
{
  "WaitForApproval": {
    "Type": "Task",
    "Resource": "arn:aws:states:::activity:ManualApproval",
    "TimeoutSeconds": 86400
  }
}
```

外部 worker poll task → 完成後 callback `SendTaskSuccess`。

### Pattern B: Wait + Re-check
```json
{
  "WaitState": { "Type": "Wait", "Seconds": 60, "Next": "CheckStatus" },
  "CheckStatus": {
    "Type": "Task",
    "Resource": "...",
    "Next": "IsComplete"
  },
  "IsComplete": {
    "Type": "Choice",
    "Choices": [{ "Variable": "$.complete", "BooleanEquals": true, "Next": "Done" }],
    "Default": "WaitState"
  }
}
```

## BMAD Workflow 對應(PhyCool)

PhyCool 用 BMAD workflow 取代 cloud state machine:
- `bmad:bmm:workflows:dev-story` → 對應 State Machine
- Tasks → 對應 ASL Task states
- Acceptance Criteria → 對應 Choice + Catch
- Story 完成 → 對應 Succeed
- Story 失敗 / blocked → 對應 Fail

但 PhyCool 也有業務層 state machine,如 `phycool-payment-subscription` PdfJob:
- Queued → Processing → Completed / Failed / Cancelled

## Iron Laws

- ✅ 長任務必用 Activity / Callback,不要 Lambda 卡 15 分鐘
- ✅ Retry 必設 MaxAttempts + BackoffRate(指數)
- ✅ Catch `States.ALL` 兜底,避免未處理 error 直接 Fail
- ✅ Map state MaxConcurrency 設合理值(避免下游 overflow)
- ❌ State machine 步驟 > 50 → 拆 sub-workflow
- ❌ 不用 Saga / compensating action → 失敗無法 rollback
- ❌ Express 用於長任務(> 5 分鐘) → 改 Standard
- ❌ Standard 用於高 throughput streaming → 改 Express(節省 cost)
