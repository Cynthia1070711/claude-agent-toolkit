---
name: cloud-backend-patterns
version: 1.0.0
updated: 2026-05-19
description: "Cloud backend architecture methodology distilled from aws-agent-skills (IAM / Cognito / Secrets Manager / SQS / SNS / Step Functions / EventBridge / CloudWatch) into 7 platform-agnostic domains. Triggers: RBAC, IAM, authorization, policy, least privilege, permission boundary, trust relationship, multi-tenant, cross-tenant, cross-account, JWT validation, JWKS, RS256, OAuth, OIDC, token lifecycle, refresh token, MFA, secrets management, key rotation, versioning, staging labels, auto-fetch secrets, message queue, SQS, FIFO, dead-letter queue, visibility timeout, long polling, pub/sub, SNS, topic filter, fanout, workflow orchestration, state machine, ASL, step functions, retry catch, event-driven, EventBridge, event bus, pattern matching, observability, logs, metrics, traces, alarm, SLO, SLI, error budget, three pillars, access denied debug. Boundary: PhyCool 平台特定 RBAC 走 phycool-admin-account, JWT 細節走 phycool-auth-identity, Azure Service Bus 走 phycool-background-services, Azure Key Vault 走 phycool-azure-infra, OpenTelemetry 走 phycool-otel-micro-collector. 此 skill 提供 cloud-agnostic 通用方法論."
---

# Cloud Backend Patterns

雲端後端架構通用方法論,蒸餾自 aws-agent-skills 17 個 AWS skill 中 ⭐⭐⭐⭐+ 級 7 個領域。**Cloud-agnostic**(去除 AWS-specific 形體),適用任何 cloud provider(Azure / GCP / AWS / on-premise)。

## 7 領域索引

| 領域 | 主題 | Reference | PhyCool 對應 |
|---|---|---|---|
| §1 | **Authorization & Identity**(IAM + Cognito) | `01-policy-types-deep.md` + `02-token-validation-jwks.md` | `phycool-admin-account` + `phycool-auth-identity` |
| §2 | **Secrets Management** | `05-secrets-rotation-versioning.md` | `phycool-azure-infra`(Azure Key Vault) |
| §3 | **Message Queue**(SQS) | `06-message-queue-patterns.md` | `phycool-background-services`(Azure Service Bus) |
| §4 | **Pub/Sub**(SNS) | `07-pubsub-topic-filter.md` | `phycool-background-services` + `phycool-signalr-realtime` |
| §5 | **Workflow Orchestration**(Step Functions) | `08-state-machine-workflow.md` | `phycool-payment-subscription`(PdfJob)+ BMAD workflows |
| §6 | **Event-Driven**(EventBridge) | `09-event-driven-pattern.md` | `phycool-signalr-realtime` + AIOS event bus |
| §7 | **Observability**(CloudWatch) | `10-observability-3-pillars.md` | `phycool-otel-micro-collector` |

## §1 Authorization & Identity

### 4 種 Policy Types
- **Identity-based**: 附加在 user / role / group(「**你**能做什麼」)
- **Resource-based**: 附加在 resource(「**誰**能對我做什麼」)
- **Permission Boundary**: 設定 identity 的上限(委派管理用,**phycool-admin-account 缺項**)
- **Service Control Policy**: 組織級防火牆(SaaS 多租戶上限)

詳見 `references/01-policy-types-deep.md`

### Authentication vs Authorization 分離(Cognito User Pool vs Identity Pool)
- **User Pool**(誰):認證 + OAuth 2.0 / OIDC token
- **Identity Pool**(能做什麼):temporary credentials → access resources

### Token 三類 + lifetime
- **ID Token**(用戶身分 claims, 1h)
- **Access Token**(API 授權, 1h)
- **Refresh Token**(換新 ID/Access, 30d configurable)

詳見 `references/02-token-validation-jwks.md`

## §2 Secrets Management

### Iron Laws
- ❌ Hardcode secrets in code / config
- ✅ Auto-fetch from secrets store at runtime
- ✅ Rotation 策略(scheduled / on-demand)
- ✅ Versioning + Staging Labels(`CURRENT` / `PENDING` / `PREVIOUS`)

詳見 `references/05-secrets-rotation-versioning.md`

## §3 Message Queue

### Standard vs FIFO 選擇
- **Standard**: 高 throughput + at-least-once(可能 duplicate)+ 順序不保證
- **FIFO**: 順序保證 + exactly-once + 較低 throughput

### Dead-Letter Queue(DLQ)
失敗訊息隔離,避免 poison message 卡死 consumer。

詳見 `references/06-message-queue-patterns.md`

## §4 Pub/Sub

### Topic + Subscription + Filter Policy
- Topic 廣播 → 多 subscriber 各自過濾
- Fanout pattern: 一條訊息分發多個 downstream

詳見 `references/07-pubsub-topic-filter.md`

## §5 Workflow Orchestration

### State Machine ASL 範式
- **Task**: 執行一個動作
- **Choice**: 條件分支
- **Parallel**: 平行執行
- **Map**: 對 array 並行處理
- **Wait**: 延時
- **Pass / Succeed / Fail**: 流程控制

### Express vs Standard
- **Express**: 高 throughput / 5 分鐘內 / 不可重試
- **Standard**: 長執行 / 可重試 / 視覺化 audit

詳見 `references/08-state-machine-workflow.md`

## §6 Event-Driven

### Event Bus + Rule + Pattern Matching
- Event source(producer)→ Event Bus → Rule(pattern match)→ Target(consumer)
- Pattern matching JSON: prefix / exists / numeric / cidr / suffix

詳見 `references/09-event-driven-pattern.md`

## §7 Observability(3 Pillars)

### Logs / Metrics / Traces
- **Logs**: 結構化 + 索引 + 查詢
- **Metrics**: 時序數值 + alarm threshold
- **Traces**: distributed request tracking + span hierarchy

### Alarm 設計
- **Static threshold**: CPU > 80%
- **Anomaly detection**: 基於歷史 baseline
- **Composite**: 多 alarm 組合(AND/OR)

### SLO / SLI / Error Budget
- SLO(目標): 99.9% availability
- SLI(指標): 實際測量
- Error Budget(預算): 100% - SLO = 0.1% 容錯空間

詳見 `references/10-observability-3-pillars.md`

## §8 Best Practices(整合 IAM Best Practices)

1. **Least Privilege**: 僅授予必要權限
2. **MFA for human users**: 多因素驗證
3. **Roles over long-term keys**: 短期 token 取代靜態 keys
4. **Conditions**: 限制 by IP / Time / MFA / Resource tags
5. **Rotation**: 定期輪換 credentials
6. **Permission Boundaries**: 委派管理用
7. **CloudTrail / Audit Log**: 所有 API call 留 trail

## §9 與 PhyCool 既有 Skill 邊界

| 範圍 | 該用 |
|---|---|
| PhyCool 平台 RBAC 實作(ASP.NET Identity / AdminPermission) | `phycool-admin-account` |
| ASP.NET Identity / DeviceSession / JWT Cookie / Google OAuth | `phycool-auth-identity` |
| Security headers / Rate limit middleware | `phycool-security-middleware` |
| Azure Key Vault 整合 | `phycool-azure-infra` |
| Azure Service Bus / HostedService | `phycool-background-services` |
| SignalR Hub real-time push | `phycool-signalr-realtime` |
| OpenTelemetry exporter | `phycool-otel-micro-collector` |
| **通用方法論 / 設計範式 / debug SOP / 跨 cloud 概念** | **本 skill cloud-backend-patterns** |

**Iron Law**: 觸發 PhyCool 平台特定行為(/mgmt/* routes / AdminControllerBase / Azure SDK call)→ **必走** phycool-* skill。本 skill 僅提供 **抽象方法論**,**禁直接套用**到 PhyCool 平台特定實作。

## §10 Access Denied Debug 5-Step SOP

通用 authorization debug 流程:

1. **Verify identity**: 確認當前 principal(`whoami` / `sts get-caller-identity`)
2. **Check attached policies**: 列出所有附加 policy
3. **Simulate the action**: 用 policy simulator 測試
4. **Check explicit denies**: SCP / Permission Boundary 是否 deny
5. **Verify resource-based policies**: Resource 端是否允許

詳見 `references/04-access-denied-debug.md`

## FORBIDDEN

- ❌ 把本 skill 通用方法論直接套用 PhyCool 平台特定實作(必走 phycool-* skill)
- ❌ 在 code 寫 AWS-specific API call(arn / sts / cognito-idp)— PhyCool 是 Azure stack
- ❌ Hardcode secrets / API keys
- ❌ Static long-term credentials(用 role + temporary tokens)
- ❌ 跳過 Access Denied 5 步 SOP 直接猜原因
- ❌ Permission boundary 概念忽略(委派管理場景必用)
