# Debugging — Hook 不觸發 / 失敗的排查流程

依以下順序排查,通常 5 步內找到原因。

---

## 步驟 1:hook 是否被 Claude Code 看見?

開啟 Claude Code,輸入 `/hooks`。

- 沒看到 → settings.json 沒讀到,或 JSON syntax 錯。
- 看到了但 count 是 0 → matcher 沒匹配當前事件。
- 看到了 → 進步驟 2。

**檢查清單**:
1. settings.json 是否在正確位置?(專案 `.claude/settings.json` 或 user `~/.claude/settings.json`)
2. JSON 是否合法?用 `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json'))"` 驗證
3. 是否從 session 啟動後才改?如果是,**必須重啟**(`/clear` 或關 CLI)

---

## 步驟 2:hook 腳本能不能單獨跑?

不要在 Claude Code 內 debug,先在 terminal 跑:

```bash
# Bash / WSL
echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"ls"}}' \
  | node .claude/hooks/my-hook.js
echo "exit code: $?"

# PowerShell
$input = '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"ls"}}'
$input | node .claude/hooks/my-hook.js
$LASTEXITCODE
```

預期:exit code 為 0 或 2,stdout 為空或合法 JSON。

如果跑不起來:
- `node -c hook.js` 檢查語法
- 加 `console.error("checkpoint A")` 印 debug 到 stderr
- 確認 hook script 有 read permission

---

## 步驟 3:在 Claude Code 內看 verbose 輸出

啟動 Claude Code 後按 `Ctrl+O` 切到 verbose mode。此時:
- Hook 的 stderr **會顯示**
- Hook 的 stdout(JSON)**會顯示**
- Exit code **會顯示**

跑一次會觸發 hook 的動作。觀察:
- Hook 真的有被呼叫嗎?
- 收到什麼 stdin?(有些版本會 dump)
- exit code 是什麼?

---

## 步驟 4:用真實 stdin 重現

如果 verbose mode 看到 hook 收到的 stdin 跟你測試時不同,把真實 stdin 存成檔案再灌:

```bash
# 從 transcript 取出
cat ~/.claude/projects/*/sessions/*.jsonl | grep '"hook_event_name"' | head -1 \
  | jq -r '.input' > test-input.json

# 用真實輸入跑
cat test-input.json | node .claude/hooks/my-hook.js
echo $?
```

---

## 步驟 5:檢查 Claude Code 邏輯

如果 hook 本身沒問題,但 Claude 行為仍不對:

1. **JSON 是否符合 schema**?用 `jq` 檢查每個欄位都在預期位置
2. **是否寫到 `hookSpecificOutput`**?新規範要求,不是扁平的 `decision` / `additionalContext`
3. **`hookEventName` 是否跟事件對應**?寫錯 case sensitivity 會被忽略
4. **`stop_hook_active` 是否處理**?Stop hook 無限迴圈典型症狀

---

## 常用診斷工具

### 即時看 hook 觸發

寫一個最小 logger hook,掛在所有事件,看實際 stdin:

```javascript
// .claude/hooks/_logger.js
const fs = require('fs');
(async () => {
  let raw = '';
  for await (const c of process.stdin) raw += c;
  fs.appendFileSync('.claude/audit/hook-trace.log',
    new Date().toISOString() + '\n' + raw + '\n\n', 'utf8');
  process.exit(0);
})();
```

然後 `tail -f .claude/audit/hook-trace.log` 即時觀察。

### settings.json 變更後即時驗證

```bash
# JSON syntax
node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))" && echo OK

# Hook 路徑存在性
node -e "
  const cfg = JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'));
  const fs = require('fs');
  const path = require('path');
  function check(hooks) {
    for (const ev of Object.values(hooks || {})) {
      for (const group of ev) {
        for (const h of group.hooks || []) {
          const m = (h.command || '').match(/node\s+([^\s\"]+)/);
          if (m) {
            const p = m[1].replace(/^\.\\.claude/, '.claude');
            if (!fs.existsSync(p)) console.log('MISSING:', p);
          }
        }
      }
    }
  }
  check(cfg.hooks);
"
```

---

## 常見錯誤訊息對照

| 訊息 | 真正原因 |
|---|---|
| `JSON parse failed` | hook stdout 含非 JSON 文字(shell profile / console.log) |
| `Hook timeout` | timeout 太短;Windows 上 Node cold start 慢 |
| `Hook not found` | settings.json 路徑寫錯,或檔案沒 commit 進專案 |
| `Permission denied` | Windows 罕見;Linux/Mac 上要 chmod +x |
| Hook 跑但沒 effect | 不是 hookSpecificOutput 格式,或 hookEventName 拼錯 |
| Stop 無限迴圈 | 沒處理 `stop_hook_active` |
| `additionalContext` 被 surface 給 user | 寫成命令句而非陳述句 |

---

## 環境特殊問題

### Windows 11 + PowerShell

- `cd "path with spaces"` 必須加引號
- 反斜線在 JSON 內要 escape(或用正斜線)
- PowerShell 5.1 預設輸出 UTF-16,寫 hook output 時務必 `[System.Text.Encoding]::UTF8`
- `CLAUDE_CODE_USE_POWERSHELL_TOOL=1` 開啟後,Bash 工具會走 PowerShell,部分 bash 慣用語法不通

### WSL

- WSL 路徑 `/mnt/c/Users/Alan/...` 在 settings.json 內不可用(Windows host 看不到)
- 跨 boundary 跑 hook 會很慢(每次 ~200ms overhead)

### Antigravity IDE

- IDE 內 Claude Code 與 CLI 共用 settings.json
- 若 IDE 跑 hook 異常,先用 CLI 直接跑 `claude` 排除是 IDE 包裝問題

---

## 最後一招:對照官方 schema

如果以上都試過還是不對,直接讀官方文件確認當前版本的 hook schema(版本之間欄位有變):

- https://code.claude.com/docs/en/hooks(規範)
- https://code.claude.com/docs/en/hooks-guide(教學)
- `/help hooks` 在 CLI 內查看

當前文件以 **2026 Apr v2.1.140+** 為準。