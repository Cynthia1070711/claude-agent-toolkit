---
paths:
  - "_bmad/**"
  - ".claude/hooks/subagent-context-inject.js"
  - ".claude/hooks/subagent-context-inject.test.js"
  - "scripts/story-pipeline-interactive.ps1"
---

# Subagent Blocked Tools & Depth Limits

> Source: Hermes `tools/delegate_tool.py:31-38` DELEGATE_BLOCKED_TOOLS + `:52-53` MAX_DEPTH
> PCPT 移植: `subagent-context-inject.js` SubagentStart Hook 注入

## Applies When

子代理（subagent）被啟動時（Claude Code `Agent` tool / Pipeline sub-window），本規則透過 `subagent-context-inject.js` SubagentStart Hook 自動注入至 additionalContext。

**不適用**: 主視窗（parent）本身、使用者直接操作的互動式 session。

## Boundary Matrix (3-Tier, v1.1.0)

> **v1.1.0 重組**: 原 flat "Blocked Tools (6 items)" 遇灰色地帶 subagent 無法自主決策。v1.1.0 參考 agent-skills-main `security-and-hardening/SKILL.md` 的 3-Tier Boundary System,重組為 **Always Do / Ask First / Never Do** 三層。原 6 條保留於 Tier 3,新增 3 條 Always Do(正面規則)+ 3 條 Ask First(中間層)。
>
> **PCPT 完整 OWASP 通用方法論 SSoT**: 本 3-Tier 為 subagent 簡化決策版。完整 OWASP Top 10 C# code patterns(BAD/GOOD)+ Zod→FluentValidation 對照 + Audit Triage 決策樹 + IDD-REG 自動查詢見 `/security-review §OWASP Code Patterns & Audit Triage`(G2 v2.1.0+)。

### Tier 1 — Always Do(subagent 可自主執行,無需問 parent)

| # | 動作 | 理由 |
|:-:|------|------|
| **A1** | **Read / Grep / Glob 專案檔案**(非 `.env` / `credentials` / `secrets`,由 settings.json `permissions.deny` 強制) | 資訊蒐集是 subagent 主職責,無副作用 |
| **A2** | **MCP `mcp__pcpt-context__search_*`**(context DB 讀取) | 查詢 SSoT 安全,有 Hook Health Check 保護 |
| **A3** | **TodoWrite / 內部 note-taking**(不寫專案檔案) | 推理步驟化,不產生外部 side-effect |

### Tier 2 — Ask First(遇到時需回報 parent 等決策,不可自主執行)

| # | 動作 | 回報方式 | 理由 |
|:-:|------|---------|------|
| **Q1** | **新 OAuth provider 整合**(非既有 Google OAuth) | stdout 標 `[NEEDS-APPROVAL: new-oauth]` + provider 名稱 | 牽涉 client_id/secret 存儲,parent 需確認合規路徑 |
| **Q2** | **新 PII 欄位 storage**(姓名/Email/電話以外的 PII) | 標 `[NEEDS-APPROVAL: new-pii]` + 欄位清單 | 關聯 IDD-REG-001 個資 180 天保存,新欄位需 ADR |
| **Q3** | **新外部 API 整合**(非 ECPay/SendGrid/Google 等既有整合) | 標 `[NEEDS-APPROVAL: new-external-api]` + API 名稱 | parent 需確認 secrets 管理 + rate-limit 策略 |

### Tier 3 — Never Do(絕對禁止,無任何例外)

| # | Blocked Tool | Hermes 對應 | 禁止理由 |
|:-:|-------------|-------------|---------|
| **N1** | **Agent** (recursive delegation) | `delegate_task` | 防遞迴委派,depth 爆炸,context 指數膨脹 |
| **N2** | **AskUserQuestion** | `clarify` | 子代理不應直接問 user,應由 parent 中介 |
| **N3** | **MEMORY.md / memory/*.md 寫入** | `memory` | SSoT 保護,避免多代理同時寫造成衝突 |
| **N4** | **claude-max Telegram bridge** | `send_message` | 防訊息風暴(多子代理同時發) |
| **N5** | **寫 .ps1 / .js 腳本並執行** | `execute_code` | 子代理應 step-by-step 推理,不寫 script 繞過觀察 |
| **N6** | **ECPay Live API 直接呼叫** | _(PCPT 特有)_ | 防未授權付款,必須 parent 確認 |

### Tier 判斷流程

```
subagent 遇到待執行動作
  ├ Tier 3 (N1-N6) 匹配? → Yes → STOP,stdout 回報 blocked 並終止
  ├ Tier 2 (Q1-Q3) 匹配? → Yes → stdout 標 [NEEDS-APPROVAL: ...],等 parent 指示
  └ 其他 → 預設 Tier 1 (Always Do),可自主執行
```

## Depth & Concurrency Limits

| 參數 | 值 | 說明 | Source |
|------|-----|------|--------|
| **MAX_DEPTH** | 2 | parent(0) → child(1) → grandchild rejected(2) | `delegate_tool.py:53` |
| **MAX_CONCURRENT_CHILDREN** | 3 | 同時併發子代理上限 | `delegate_tool.py:52` |

## FORBIDDEN

- 子代理遞迴啟動 Agent tool（depth > 1）
- 子代理直接寫入 `memory/*.md` 或 `MEMORY.md`
- 子代理透過 claude-max skill 發送 Telegram 訊息
- 子代理自行產生 .ps1 / .js 腳本並立即執行（可寫檔但不可 Bash 執行）
- 子代理直接呼叫 ECPay production API（sandbox 除外）
- 繞過本規則的任何方式（如修改 Hook 使其不注入 NOTICE）

## Self-Check (子代理每次操作前)

子代理須自問 3 題：

1. **「我是否正在啟動另一個子代理？」** → 是 → STOP，depth 限制禁止
2. **「我是否正在寫入 memory 檔案？」** → 是 → STOP，回報 parent 處理
3. **「我是否正在直接呼叫外部付款 API？」** → 是 → STOP，需 parent 授權

## Hook 注入機制 (v1.2.0 升級, 2026-04-25 動態全文注入)

`subagent-context-inject.js` 在 SubagentStart 事件觸發時，**動態 `readFileSync()` 本規則完整內容**（自動扣除 frontmatter）注入至 `additionalContext`：

```
=== Subagent Safety Rule (full content from .claude/rules/subagent-blocked-tools.md) ===

# Subagent Blocked Tools & Depth Limits
... (完整 3-Tier 矩陣 A1-A3 / Q1-Q3 / N1-N6 + Self-Check 3 題 + Depth Limits + FORBIDDEN)
```

**設計原則 v1.2.0**: SSoT 保留在本 rule 檔,hook 透過 `loadBlockedToolsContent()` 動態讀全文 — rule 更新時 hook 自動跟隨,**無需改 hook code**。**Fallback 機制**: 讀檔失敗 fall back to 4-line `BLOCKED_TOOLS_FALLBACK`。非 pipeline 模式亦注入（CR td-39 + token-decrease-paths-rollout 雙修）。

**主視窗條件載入**: 本 rule frontmatter 加 `paths` 限定僅在動 `_bmad/**` / `subagent-context-inject.js` / `story-pipeline-interactive.ps1` 時主視窗才載入(v1.2.0)。**子代理不受影響** — SubagentStart hook 強制注入完整內容,主視窗載入與否互不干擾。

**為什麼升級**: 原 4 行 Notice (~99 token) 子代理拿到內容**不足以 self-check 3-Tier Boundary**(無 Q1-Q3 灰色地帶決策邏輯)。升級後子代理拿 ~3K 完整矩陣,**反降智** ✅。

## Related Rules

- `.claude/rules/skill-sync-gate.md` — 三引擎同步要求
- `.claude/rules/constitutional-standard.md` — Code Verification Mandate

## Version History

| 版本 | 日期 | 變更 |
|------|------|------|
| **1.2.0** | **2026-04-25** | **Hook 注入機制升級為動態全文 + 主視窗 paths 條件化**。`subagent-context-inject.js` 加 `loadBlockedToolsContent()` 動態 `readFileSync()` 完整 .md(扣 frontmatter),子代理拿到 ~3K 完整 3-Tier 矩陣 + Self-Check 3 題(原 99 token Notice 內容**不足以 self-check** Q1-Q3 灰色地帶)。本 rule 加 `paths` frontmatter,主視窗從 always-on 改為條件載入(省 -3.0k always-on)。Fallback: 讀檔失敗 fall back to 4-line `BLOCKED_TOOLS_FALLBACK`。SSoT 保留 rule 檔,rule 更新時 hook 自動跟隨。**反降智** ✅。Story: token-decrease-paths-rollout Phase 3 H4(`claude token減量策略研究分析/專案優化項目計畫.md` §15-21)。三引擎同步 md5 `1b299d018e32e8d2b71117f645b3551e`。 |
| **1.1.0** | **2026-04-24** | **3-Tier Boundary Matrix 重組** — 原 flat "Blocked Tools (6 items)" 改為 Always Do(A1-A3 新增)/ Ask First(Q1-Q3 新增)/ Never Do(N1-N6 保留) 三層。參考 agent-skills-main `security-and-hardening/SKILL.md` 3-Tier Boundary System。解決灰色地帶 subagent 無法自主決策問題。觸發: 2026-04-24 Party Mode 深度整合分析 F2(`claude token減量策略研究分析/專案優化項目計畫.md`)。 |
| 1.0.0 | 2026-04-16 | Initial creation. Hermes DELEGATE_BLOCKED_TOOLS + MAX_DEPTH 移植。Story: td-39-subagent-blocked-tools |
