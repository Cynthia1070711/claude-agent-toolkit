# 07 - Pub/Sub Topic Filter Patterns

> 蒸餾自 aws-agent-skills/sns

## Pub/Sub 核心模型

```
Producer → Topic → [Subscription Filter] → Subscriber 1
                ↓
                [Subscription Filter] → Subscriber 2
```

vs Queue(SQS):
- Queue = 1:1(一條訊息一個 consumer 處理)
- Pub/Sub = 1:N(一條訊息所有 subscriber 都收到)

## Subscription Types

| Type | 適用 |
|---|---|
| **HTTP/HTTPS** | Webhook(retry + backoff) |
| **Email / SMS** | 通知 |
| **SQS Queue** | Fanout 至 queue(後續 consumer 處理) |
| **Lambda / Function** | Direct trigger |
| **Application(Mobile push)** | iOS / Android |

## Filter Policy

每個 subscription 可設 filter,僅接收符合條件的訊息。

```json
{
  "event_type": ["OrderCreated", "OrderUpdated"],
  "amount": [{"numeric": [">=", 1000]}],
  "region": ["TW", "JP"],
  "tier": [{"exists": true}],
  "customer_email": [{"prefix": "vip@"}]
}
```

支援 operators:
- `exists`: 欄位是否存在
- `prefix` / `suffix`: 字串前綴 / 後綴
- `numeric`: 數值比較(`<`, `<=`, `=`, `>=`, `>`)
- `anything-but`: 排除
- `cidr`: IP 範圍

## Fanout Pattern

```
Order Created Event → SNS Topic
                       ├→ SQS: Email queue → SendGrid
                       ├→ SQS: Notification queue → Mobile push
                       ├→ SQS: Analytics queue → Data warehouse
                       ├→ SQS: Audit queue → AuditLog
                       └→ Lambda: Real-time dashboard update
```

優點:
- Producer 不需知道 subscriber
- 新增 consumer 不影響既有
- 各 subscriber 獨立 retry / scale

## Message Attributes(用於 filter)

```python
sns.publish(
    TopicArn=topic_arn,
    Message=json.dumps({...}),
    MessageAttributes={
        'event_type': {'DataType': 'String', 'StringValue': 'OrderCreated'},
        'amount': {'DataType': 'Number', 'StringValue': '1500'},
        'region': {'DataType': 'String', 'StringValue': 'TW'}
    }
)
```

**Iron Law**: Filter 條件用 **Message Attributes**(不解析 body),效能高 + filter 在 SNS side 做(不走 subscriber)。

## Topic 命名 / 結構

```
# Event-driven
order.created
order.updated
order.cancelled
user.signed-up
user.deleted

# 或階層式
events.order.created
events.user.signed-up

# 或 domain-driven
billing.payment.completed
analytics.metric.recorded
```

## Cross-Account Publishing

設 topic policy 允許其他 account publish:
```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::OTHER-ACCOUNT:root" },
  "Action": "sns:Publish",
  "Resource": "arn:aws:sns:..."
}
```

## FIFO Topic

SNS 也支援 FIFO(對應 SQS FIFO):
- `MessageGroupId`(同 group 內順序)
- `MessageDeduplicationId`(5 分鐘 dedupe)

## Retry / DLQ

HTTP/HTTPS subscription:
- 自動 retry(指數 backoff)
- 失敗訊息進 DLQ(SQS)

SQS subscription:
- 訊息直接進 queue,由 queue 處理 retry

## Azure 對應

| AWS SNS | Azure |
|---|---|
| Topic | Service Bus Topic |
| Subscription | Subscription |
| Filter Policy | SQL Filter / Correlation Filter |
| Fanout to SQS | Topic → multiple Subscription |

或 Azure Event Grid(更輕量,event-driven):
- Topic → Event Subscription → Handler(Function / Webhook / Queue)

PhyCool 對應: `phycool-signalr-realtime`(server push)+ `phycool-background-services`(Service Bus)。

## Iron Laws

- ✅ Filter 在 publish side 用 Message Attributes(不在 subscriber side parse body 才 drop)
- ✅ Fanout 用 SNS → SQS,而非 SNS 直推 Lambda(SQS 提供 buffer + retry)
- ❌ Topic 命名混亂(`Topic-1`, `MyTopic`)→ 用 domain-driven 命名
- ❌ 一個 topic 多種 event type 不 filter → subscriber 收一堆無關訊息
- ❌ Filter policy 過於複雜 → 改 split topic
- ❌ Cross-account 不設 condition → 任意 account 可 publish 垃圾
- ❌ HTTP subscription 不返回 200 → 觸發 retry 風暴
