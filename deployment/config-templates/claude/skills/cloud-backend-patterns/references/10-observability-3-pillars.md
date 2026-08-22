# 10 - Observability(3 Pillars)

> 蒸餾自 aws-agent-skills/cloudwatch

## 3 Pillars 對照

| Pillar | 回答 | 工具 |
|---|---|---|
| **Logs** | 「**發生了什麼?**」(事件 / 文字 record) | CloudWatch Logs / OTel Logs / Application Insights |
| **Metrics** | 「**多少?多快?多頻繁?**」(時序數值) | CloudWatch Metrics / Prometheus / OTel Metrics |
| **Traces** | 「**為何慢?在哪卡住?**」(分散式 request path) | X-Ray / Jaeger / OTel Traces |

3 者互補,缺一不可。

## Pillar 1: Logs

### 結構化 Logs(JSON)
```json
{
  "timestamp": "2026-05-19T10:00:00Z",
  "level": "ERROR",
  "service": "order-service",
  "request_id": "req-uuid",
  "user_id": "user-123",
  "tenant_id": "tenant-A",
  "trace_id": "trace-xyz",
  "message": "Failed to charge card",
  "error": { "type": "PaymentError", "code": "card_declined" },
  "context": { "order_id": "ord-456", "amount": 1500 }
}
```

### Iron Laws
- ✅ 永遠用結構化 JSON(非 plain text)
- ✅ 必有: timestamp / level / service / request_id / trace_id
- ✅ 包含 user_id / tenant_id 方便 audit + filter
- ✅ 不 log 敏感資料(password / SSN / credit card)
- ❌ `console.log(error)` 直接吐 stack 至 stdout(難解析)
- ❌ 把 entire object stringify 進 log(成本爆 + 隱私)

### Log Levels
| Level | 用途 | 頻率 |
|---|---|---|
| TRACE | 詳細執行 | dev only |
| DEBUG | 除錯 | dev only |
| INFO | 重要事件 / 業務 milestone | production |
| WARN | 異常但可繼續 | production |
| ERROR | 失敗 / exception | production + alert |
| FATAL | 系統崩潰 | production + page oncall |

### Log Retention
- INFO: 30-90 天
- ERROR / FATAL: 1-7 年(audit / compliance)
- Cold storage(S3 / Blob)便宜

## Pillar 2: Metrics

### Metric 4 種類型(Prometheus 範式)

| 類型 | 範例 | 行為 |
|---|---|---|
| **Counter** | `http_requests_total` | 只增不減(reset on restart) |
| **Gauge** | `memory_used_bytes` / `active_connections` | 任意上下 |
| **Histogram** | `request_duration_seconds`(buckets) | 分布 + 百分位 |
| **Summary** | 類似 histogram | client-side 計算百分位 |

### Cardinality 注意

❌ 高 cardinality label(user_id / request_id 作 label)→ metric 爆炸
✅ 低 cardinality(method / status / endpoint pattern)

```
# ✅ Good
http_requests_total{method="GET", endpoint="/api/users", status="200"}

# ❌ Bad — 高 cardinality
http_requests_total{user_id="user-12345"}   # 每個 user 一條 metric line
```

### 關鍵 Application Metrics(SaaS)

- **RED Method**(Request)
  - **R**ate(每秒 req 數)
  - **E**rrors(錯誤率)
  - **D**uration(請求耗時 p50 / p95 / p99)

- **USE Method**(Resource)
  - **U**tilization(CPU / memory %)
  - **S**aturation(queue depth)
  - **E**rrors(資源層級錯誤)

- **業務 metrics**:
  - 訂單成立率
  - 支付成功率
  - 註冊轉換率
  - 重要 API 響應時間

## Pillar 3: Traces

### Distributed Trace 結構

```
Request enters → Trace ID 產生 → 在所有 service 間傳遞

Service A [span_id=1] (200ms)
  ├─ DB Query [span_id=2] (50ms, parent=1)
  ├─ Call Service B [span_id=3] (130ms, parent=1)
  │   ├─ External API [span_id=4] (100ms, parent=3)
  │   └─ Cache lookup [span_id=5] (5ms, parent=3)
  └─ Send Email (async) [span_id=6] (10ms, parent=1)
```

### Span Attributes
```
{
  "name": "POST /api/orders",
  "trace_id": "abc123",
  "span_id": "span1",
  "parent_span_id": null,
  "start_time": "...",
  "end_time": "...",
  "duration_ms": 234,
  "attributes": {
    "http.method": "POST",
    "http.status_code": 201,
    "user.id": "user-123",
    "tenant.id": "tenant-A"
  }
}
```

### OpenTelemetry(統一標準)

```csharp
// C# .NET
services.AddOpenTelemetry()
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddEntityFrameworkCoreInstrumentation()
        .AddOtlpExporter(o => o.Endpoint = new Uri("http://otel-collector:4317")))
    .WithMetrics(metrics => metrics
        .AddAspNetCoreInstrumentation()
        .AddRuntimeInstrumentation()
        .AddOtlpExporter());
```

PhyCool 對應: `phycool-otel-micro-collector` 已實作。

## Alarm 設計

### Static Threshold
```
CPU > 80% for 5 minutes → notify
```

### Anomaly Detection
基於歷史 baseline(每週同時段同 metric):
```
Request rate < baseline - 3σ for 5 minutes → notify
```

### Composite Alarm
```
(CPU > 80% AND Memory > 80%) OR DiskSpace < 10% → page oncall
```

### Iron Laws
- ✅ 每個 alarm 必有 runbook(怎麼處理)
- ✅ Alarm 必先測試(故意觸發確認 notify 到)
- ❌ Alarm fatigue(太多 noise alarm)→ 忽略真實警報
- ❌ Threshold 過嚴(每天觸發 100 次)→ 警報疲勞
- ❌ Threshold 過鬆(故障了還沒 alarm)→ 形同無監控

## SLO / SLI / Error Budget

### SLI(Service Level Indicator)— 實際測量
- 可用性 = success requests / total requests
- 延遲 = p95 < 200ms 的比例

### SLO(Service Level Objective)— 目標
- 99.9% availability(每月可 down 43 分鐘)
- 99.95%(每月 21.6 分鐘)
- 99.99%(每月 4.3 分鐘)

### Error Budget(預算)
- 100% - SLO = Error Budget
- 99.9% SLO → 0.1% budget = 每月 43 分鐘 downtime 允許
- 燒完 → 凍結新功能,專注穩定性

### Burn Rate Alert
```
24h burn rate > 14.4 (2 分鐘內燒完 1 月預算 1%) → page oncall
1h burn rate > 1 (1 月預算正在加速燒) → notify
```

## Logs / Metrics / Traces 整合

關鍵: 三者透過 **trace_id / request_id** 關聯。

```
從 alarm 開始
  → 看 metric 趨勢(何時開始)
  → 取 trace_id sample 看 trace 細節(在哪卡住)
  → 用 trace_id 查 logs(具體錯誤)
```

## Common Pitfalls

- ❌ 只有 logs 沒有 metrics → 無法 alert / 趨勢分析
- ❌ 只有 metrics 沒有 logs → 知道有問題不知道原因
- ❌ 不傳 trace_id → 跨 service debug 困難
- ❌ Log everything → 成本爆 + 找不到關鍵 log
- ❌ Alarm 無 runbook → oncall 不知道怎麼處理
- ❌ SLO 設 100% → 永遠在燒 budget,不可能達成
- ❌ Cardinality 失控(user_id 作 metric label)→ Prometheus crash
