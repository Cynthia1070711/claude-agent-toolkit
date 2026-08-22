# Handler Types — command / http / prompt / agent

Claude Code hooks 支援 4 種 handler。挑錯型別會浪費時間與 token,先讀這份再決定。

---

## 1. command(最常用,90% 場景)

執行 shell 命令,stdin 收 JSON,stdout/stderr + exit code 回應。

```json
{
  "type": "command",
  "command": "node hook.js",
  "timeout": 30000,
  "async": false
}
```

**適合**:確定性檢查(grep / regex / 檔案存在 / 命令 parse)、注入靜態 context、寫 audit log。

**Async 變體**(Jan 2026):
```json
{ "type": "command", "command": "node telemetry.js", "async": true, "timeout": 10000 }
```
Async hook 在背景跑,**不阻擋** Claude。代價:無法回傳 `additionalContext`(到達時 Claude 已動了)、無法 block(exit 2 被忽略)。

**用 async 的場景**:telemetry、log shipping、cache warm-up、向量索引更新。

**不要用 async 的場景**:任何想影響 Claude 行為的場景(block、注入 context)。

---

## 2. http(2026 Feb 新增,跨團隊策略)

POST 到 URL,回傳 JSON 同 command。

```json
{
  "type": "http",
  "url": "http://policy.internal/hooks/pre-tool",
  "timeout": 30000,
  "headers": { "Authorization": "Bearer $POLICY_TOKEN" },
  "allowedEnvVars": ["POLICY_TOKEN"]
}
```

**HTTP body**:就是 command hook 從 stdin 收到的同一份 JSON,作為 POST body(`Content-Type: application/json`)。

**Response body**:跟 command hook 期望的 JSON 一樣。

**安全限制**:
- `allowedEnvVars` 必須白名單列出能傳給 hook 的環境變數,否則 secrets 不會被 expand
- URL 只能是 http/https,不支援 file://、ftp://
- `allowedHttpHookUrls` 在 settings 中可額外限制可呼叫的 URL

**適合**:
- 跨團隊共用安全策略(集中 server 維護一套規則)
- 把 hook 邏輯放在 cloud function,讓使用者不需要本地裝 node/python
- 需要 access database 或第三方 API 才能判斷的場景

**不適合**:
- 個人 / 小團隊使用(過度工程)
- 需要本地檔案系統 access 的場景(走 command 比較簡單)

---

## 3. prompt(LLM 評估,2026 Feb 強化)

把判斷外包給 Claude 自己。

```json
{
  "type": "prompt",
  "prompt": "Evaluate: did Claude actually run tests? Return {\"ok\": bool}",
  "timeout": 30
}
```

**特殊變數**:`$ARGUMENTS` 會被 hook input 整個 JSON 取代(可直接放進 prompt 中讓 LLM 看)。

**LLM 必須回傳 JSON**:
```json
{ "ok": true }
// 或
{ "ok": false, "reason": "missing test execution" }
```

**Claude Code 解讀**:`ok: false` → 視同 exit 2(blocks PreToolUse / forces Stop 繼續)。

**適合**:
- 需要語意判斷,不只 pattern match(「這段程式碼品質好嗎」、「真的驗證完了嗎」)
- 規則無法用正則表達(「commit message 是否合理」)
- 規則太多無法逐條寫 if(交給 LLM 整體判斷)

**不適合**:
- 高頻事件(每個 Edit/Write 都跑 prompt hook 會大幅增加 token cost)
- 確定性檢查(用 command 更快更可靠)
- 對 latency 敏感的場景(prompt 平均 1-3 秒)

**Cost 警告**:每次 prompt hook 觸發 ~500-2000 tokens(視 prompt 長度)。Stop hook 每輪都跑會累積,長 session 可能多幾萬 tokens。

---

## 4. agent(LLM + 工具,深度檢查)

Spawn 一個臨時 subagent,有 Read/Grep/Glob 等工具。

```json
{
  "type": "agent",
  "prompt": "Verify all test files have corresponding implementation files.",
  "timeout": 60
}
```

預設 timeout 60 秒(比 prompt 的 30 秒長,因為要跑工具)。

**回傳格式**:跟 prompt hook 一樣,LLM 必須回 `{ok: bool, reason?: string}`。

**適合**:
- 需要讀多個檔案才能判斷(「這次變更是否破壞 API contract」)
- 跨檔案一致性檢查(「所有 endpoint 是否都有 test」)
- 安全稽核(「這次 diff 是否引入新的 SQL injection 風險」)

**不適合**:
- 高頻事件(每次 Edit 都 spawn subagent 會爆炸)
- 簡單檢查(殺雞用牛刀)
- 預算敏感場景(agent hook 是最貴的型別)

**官方比較**:
> agent hooks 比 prompt hooks 更徹底但更慢(60s vs 30s timeout)

---

## 型別選擇決策樹

```
要 hook 做什麼?
├─ 阻擋 / 改寫 / 強制動作  → command (exit 2 / JSON)
├─ 注入 static context     → command (JSON additionalContext)
├─ 跨團隊集中策略           → http
├─ 語意判斷 (no files)     → prompt
├─ 跨檔案語意判斷           → agent
└─ 純背景任務               → command async: true
```

---

## 混合範例

同一個事件可以掛多個 hook,**並行執行**:

```json
{
  "PostToolUse": [
    {
      "matcher": "Edit|Write",
      "hooks": [
        { "type": "command", "command": "node lint.js" },
        { "type": "command", "command": "node log.js", "async": true },
        { "type": "prompt", "prompt": "Did this edit introduce dead code? Return {ok: bool}" }
      ]
    }
  ]
}
```

多個 hook 的 `additionalContext` 會**全部**傳給 Claude(順序由實作決定,別依賴順序)。

如果多個 hook 都想 `decision: "block"`,**任一阻擋都生效**(more restrictive wins)。

---

## PhyCool 既有 hook 分類

當前 18+ 個 hooks 全部是 `command` 型別。可考慮升級:

| Hook | 升級建議 |
|---|---|
| `detect-rule-violation-hint.js` | 改 `prompt` 型,語意判斷比正則更準 |
| `mcp-health-check.js` | 改 `http` 型,集中 MCP 健康狀態服務 |
| `debt-discovery.js` | 改 `agent` 型,有工具更能找出真正債務 |
| `ceo-briefing-generator.js` | 已是 LLM 任務,改 `agent` 型省去自己呼叫 API |
| `log-session.js` / `incremental-embed.js` | 改 `async: true`,加快 Stop chain |