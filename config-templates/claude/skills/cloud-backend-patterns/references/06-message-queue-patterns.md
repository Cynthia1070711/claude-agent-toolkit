# 06 - Message Queue Patterns

> 蒸餾自 aws-agent-skills/sqs

## Standard vs FIFO 選擇

| 特性 | Standard | FIFO |
|---|---|---|
| Throughput | 幾乎無限 | 300 TPS(可提升至 3000) |
| 順序 | 不保證 | 嚴格順序 |
| Delivery | At-least-once(可能 duplicate) | Exactly-once |
| 名稱 | 任意 | 必 `.fifo` 結尾 |
| Message Group ID | N/A | 必填(同 group 內順序) |
| Deduplication ID | N/A | 5 分鐘內 dedupe |

### 選擇邏輯
- **訊息順序重要嗎?** → FIFO
- **單筆訊息可重複處理嗎?** → Standard
- **TPS > 3000?** → Standard(或多 FIFO queue 分流)
- **同類訊息需序列處理?** → FIFO + 同 Message Group ID

## Dead-Letter Queue(DLQ)

失敗訊息隔離,避免 poison message 卡死 consumer。

### 配置
```
Main Queue: maxReceiveCount = 3
   ↓ 3 次失敗
DLQ: 隔離分析
```

### Iron Laws
- ✅ 所有 production queue 必設 DLQ
- ✅ DLQ 設 alarm(message count > 0 通知 oncall)
- ✅ DLQ 訊息 retention ≥ 14 天(分析時間)
- ❌ DLQ 自己再轉 DLQ(無限套娃)
- ❌ 直接刪除 DLQ 訊息(失去 audit)

### Replay from DLQ
分析失敗原因 + 修 code → 把 DLQ message 重 inject 回 main queue。

## Visibility Timeout

訊息被 consumer 取出後,隱藏一段時間避免重複處理。

```
T0: Producer sends message
T1: Consumer receives + processes
    Visibility timeout starts(預設 30s)
T2: Consumer 處理完 + DeleteMessage → 訊息真的刪除
   或
T2: Consumer 處理超時 → 訊息重新可見 → 另一 consumer 取走
```

### Iron Laws
- ✅ Visibility timeout > 平均處理時間 × 6
- ✅ 長處理任務用 `ChangeMessageVisibility` 延長(heartbeat)
- ❌ Visibility timeout 過短 → 同訊息被多 consumer 處理
- ❌ Visibility timeout 過長 → 失敗訊息延遲重試

## Long Polling

```python
sqs.receive_message(
    QueueUrl=queue_url,
    WaitTimeSeconds=20,        # 0 = short polling(每次 API call 立刻回);20 = long polling(等到有訊息或 20s)
    MaxNumberOfMessages=10
)
```

**Iron Law**: 永遠 long polling(降低 API call + 提升即時性)。

## Idempotent Consumer

Standard queue 可能 duplicate → consumer 必 idempotent。

### Pattern A: Dedup Table
```python
def process_message(msg):
    msg_id = msg['MessageId']
    if redis.set(f'processed:{msg_id}', 1, nx=True, ex=86400):  # 24h
        # 首次處理
        do_work(msg)
    else:
        # 已處理過,直接 ack
        pass
    sqs.delete_message(...)
```

### Pattern B: Idempotency Key in Business Logic
```sql
INSERT INTO orders (id, ...) VALUES (@order_id, ...)
ON CONFLICT (id) DO NOTHING;
```

## Producer Patterns

### Batch Send
```python
sqs.send_message_batch(
    QueueUrl=url,
    Entries=[
        {'Id': '1', 'MessageBody': '...'},
        {'Id': '2', 'MessageBody': '...'},
    ]   # 最多 10 筆 / batch
)
```

### Message Attributes(metadata)
```python
sqs.send_message(
    QueueUrl=url,
    MessageBody='...',
    MessageAttributes={
        'EventType': {'DataType': 'String', 'StringValue': 'OrderCreated'},
        'Priority': {'DataType': 'Number', 'StringValue': '5'},
    }
)
```

## Consumer Patterns

### Worker Pattern
```python
while True:
    messages = sqs.receive_message(QueueUrl=url, WaitTimeSeconds=20, MaxNumberOfMessages=10)
    for msg in messages.get('Messages', []):
        try:
            process(msg)
            sqs.delete_message(QueueUrl=url, ReceiptHandle=msg['ReceiptHandle'])
        except Exception as e:
            log_error(e)
            # 不 delete → visibility timeout 後重試,N 次後進 DLQ
```

### Lambda / Function Trigger
- 自動 scaling
- Batch size 可設(1-10000)
- Partial batch failure 支援(僅失敗的訊息進 DLQ)

## Azure Service Bus 對應(PhyCool 用)

| AWS SQS | Azure Service Bus |
|---|---|
| Queue | Queue |
| FIFO | Session-enabled queue |
| DLQ | Dead Letter Queue(自動) |
| Visibility Timeout | Lock Duration(預設 60s) |
| Message Attributes | Application Properties |
| Long Polling | ReceiveAsync(timeout) |

PhyCool 既有: `phycool-background-services` + Service Bus priority queue(對齊 `phycool-pdf-engine`)。

## Common Pitfalls

- ❌ Standard queue 不 idempotent consumer → duplicate 處理(重複扣款 / 重發 email)
- ❌ 無 DLQ → poison message 卡死 queue
- ❌ Short polling → API call 爆炸 + 高延遲
- ❌ Visibility timeout 過短 → race condition
- ❌ Batch size 過大 → 單筆失敗整 batch retry
- ❌ FIFO 高 throughput 需求未分多 queue → bottleneck
- ❌ Message body 過大(SQS 上限 256KB)→ 改存 S3 + queue 傳 reference
