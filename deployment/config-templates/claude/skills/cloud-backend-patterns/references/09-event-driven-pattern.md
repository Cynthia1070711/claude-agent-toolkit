# 09 - Event-Driven Pattern(Event Bus)

> 蒸餾自 aws-agent-skills/eventbridge

## Event-Driven 核心模型

```
Producer → Event Bus → Rule(Pattern Match)→ Target
                    ↘ Rule(Pattern Match)→ Target
                    ↘ Rule(Pattern Match)→ Target
```

vs Pub/Sub(SNS):
- SNS: 訂閱 topic,filter 限定
- EventBridge: 中央 event bus + rule-based routing,**支援 schema registry + 跨 account**

## Event Bus 類型

| 類型 | 用途 |
|---|---|
| **Default** | AWS service 事件預設進入 |
| **Custom** | 自訂應用 event |
| **Partner** | 第三方 SaaS 集成(Stripe / Datadog / Auth0) |

## Event Anatomy

```json
{
  "version": "0",
  "id": "uuid-here",
  "detail-type": "OrderCreated",
  "source": "com.mycompany.orders",
  "account": "123456789012",
  "time": "2026-05-19T10:00:00Z",
  "region": "us-east-1",
  "resources": ["arn:..."],
  "detail": {
    "orderId": "ord-123",
    "customerId": "cust-456",
    "amount": 1500,
    "items": [...]
  }
}
```

## Event Pattern(規則匹配)

```json
{
  "source": ["com.mycompany.orders"],
  "detail-type": ["OrderCreated", "OrderUpdated"],
  "detail": {
    "amount": [{"numeric": [">=", 1000]}],
    "region": ["TW", "JP"],
    "customer.tier": ["VIP", "Premium"],
    "items": {
      "category": ["electronics"]
    }
  }
}
```

支援 operators(同 SNS filter + 更多):
- `prefix` / `suffix` / `equals-ignore-case`
- `numeric` 範圍
- `exists` / `anything-but`
- `cidr`
- `wildcard`(EventBridge 新增)

## Targets(20+ 種)

- Lambda Function
- Step Functions
- SQS Queue / SNS Topic
- ECS Task / EC2 Run Command
- API Destination(HTTP webhook with retry / auth)
- Event Bus(跨 account / 跨 region)
- Kinesis Stream / Firehose
- ...

## Schema Registry

定義 event schema → 自動產出 SDK / type definitions。

```json
{
  "$schema": "http://json-schema.org/draft-04/schema#",
  "type": "object",
  "properties": {
    "orderId": { "type": "string" },
    "amount": { "type": "number" },
    "customerId": { "type": "string" }
  },
  "required": ["orderId", "amount", "customerId"]
}
```

Producer / Consumer 都用相同 schema → 類型安全。

## Cross-Account Event Routing

```
Account A(producer) → EventBridge Bus → Account B(consumer)
```

1. Account A: 寫 event 進自己的 bus
2. Account A bus 加 rule: target 是 Account B 的 bus
3. Account B bus 加 resource policy: 允許 Account A 寫入
4. Account B 加 rule: pattern match + target

## API Destination(替代 webhook)

EventBridge 內建管理 HTTP target:
- 自動 retry(指數 backoff)
- 失敗進 DLQ
- 認證(Basic / API Key / OAuth)管理
- Connection pooling

優於自建 webhook subscriber。

## Replay(時光倒流)

EventBridge archive → 過去 event 可重 replay 到 rule:
- 修 bug 後重跑歷史事件
- A/B test 新 consumer
- 災難恢復

## Patterns

### Pattern 1: Saga via Events
```
OrderCreated → ChargeCard
ChargeCardSucceeded → ReserveInventory
ReserveInventorySucceeded → ShipOrder
ShipOrderSucceeded → SendConfirmation

ChargeCardFailed → CancelOrder
ReserveInventoryFailed → RefundCard
```

每 event 觸發下一動作 + 失敗事件觸發 compensating action。

### Pattern 2: CQRS Read Model 更新
```
OrderCreated → Update Read Model A(顧客視圖)
            → Update Read Model B(管理者報表)
            → Update Read Model C(分析儀表板)
```

Write 走主 DB,Read 走多個 specialized read model。

### Pattern 3: Event-Driven Microservice
```
Service A(order) → OrderCreated event
                  ↓
Service B(inventory)→ 自動扣庫存
Service C(email)→ 自動寄確認信
Service D(analytics)→ 自動記錄
```

Service 間無直接 API call,僅透過 event 耦合。

## Azure 對應

| AWS EventBridge | Azure |
|---|---|
| Event Bus | Event Grid Topic |
| Rule + Pattern | Event Subscription + Filter |
| Schema Registry | Schema Registry(Service Bus) |
| API Destination | Webhook subscription |

PhyCool 對應:
- `phycool-signalr-realtime`(SignalR Hub event push)
- AIOS event bus(`aios-event-bus`,內部 event-driven)

## Iron Laws

- ✅ Event = 不可變事實(過去式命名:OrderCreated 而非 CreateOrder)
- ✅ Event 包含完整 context(consumer 不用再 query)
- ✅ Schema versioning(`v1`, `v2`)避免 breaking change
- ✅ Idempotent consumer(EventBridge at-least-once)
- ❌ Event 用 command 語氣(SaveOrder)→ 與 Pub/Sub 概念混淆
- ❌ Event payload 過大(> 256KB)→ 改放 reference + content store
- ❌ Tight coupling(consumer 假設特定 producer)→ 用 schema + version
- ❌ 不留 DLQ → 失敗 event silent lost
