# 三引擎 Skill 差異對照

## 檔案路徑

| 引擎 | 路徑 | 優先順序 |
|------|------|---------|
| Claude Code | `.claude/skills/{name}/SKILL.md` | Enterprise > 個人 > 專案 |
| Gemini CLI | `.gemini/skills/{name}/SKILL.md` | Workspace > User > Extension |
| Antigravity | `.agent/skills/{name}/SKILL.md` | 全域 > 專案 |

## YAML Frontmatter 欄位比較

| 欄位 | Claude | Gemini | Antigravity | 說明 |
|------|--------|--------|-------------|------|
| `name` | ✅ | ✅ | ✅ | kebab-case, ≤64 字元 |
| `description` | ✅ | ✅ (≤1024) | ✅ (≤1024) | 觸發路由依據 |
| `disable-model-invocation` | ✅ | ❌ | ❌ | `true` 時僅允許手動 /name 觸發 |
| `user-invocable` | ✅ | ❌ | ❌ | `false` 時隱藏 /name 選單 |
| `allowed-tools` | ✅ | ❌ | ❌ | 限制可用工具 |
| `model` | ✅ | ❌ | ❌ | 指定模型 |
| `effort` | ✅ | ❌ | ❌ | 推理強度 |
| `context` | ✅ | ❌ | ❌ | `fork` = subagent 隔離 |
| `argument-hint` | ✅ | ❌ | ❌ | 自動補全提示 |
| `agent` | ✅ | ❌ | ❌ | 配合 `context: fork` 使用 |
| `version` | 自訂 | 自訂 | 自訂 | 語義化版本（三引擎皆可用） |
| `watches` | 自訂 | 自訂 | 自訂 | 過期偵測（三引擎皆可用） |
| `hooks` | ✅ | ❌ | ❌ | Claude Code hooks 事件綁定（PostToolUse/Stop 等） |
| `shell` | ✅ | ❌ | ❌ | Skill 執行時觸發的 Shell 命令 |

## 觸發機制比較

| 引擎 | 自動觸發 | 手動觸發 | 說明 |
|------|---------|---------|------|
| Claude | 根據 description 語義匹配 | `/name` | 低觸發傾向，description 需「強推」 |
| Gemini | 呼叫 `activate_skill` 工具 | 使用者確認後載入 | 需使用者確認 |
| Antigravity | 語義關鍵字自動匹配 | `/name` | 全自動觸發 |

## 部署操作 SOP

### Step 1: Claude 版建立

建立 `.claude/skills/{name}/SKILL.md`，包含 Claude 獨有欄位。

### Step 2: Gemini 版

複製 Claude 版，移除 Claude 獨有 YAML 欄位：
```
移除: disable-model-invocation, user-invocable, allowed-tools, model, effort, context, argument-hint, hooks, shell, agent
保留: name, description, version, author, created, updated, last_synced_epic, last_synced_date, watches
```

### Step 3: Antigravity 版

同 Gemini 版。另需確認：
- name 欄位不含競品名稱（`claude`, `anthropic`, `gemini`, `google`）
- SKILL.md 字元數注意 Workflow 12,000 上限（Skill 無硬限但建議精簡）

### Step 4: References 同步

三引擎的 `references/` 內容完全一致，直接複製。

### Step 5: 驗證

```bash
# 行數驗證
wc -l .claude/skills/{name}/SKILL.md   # ≤ 500

# 三引擎一致性（除 YAML 差異）
diff <(sed '/^disable-model-invocation/d;/^user-invocable/d;/^allowed-tools/d;/^model:/d;/^effort:/d;/^context:/d;/^argument-hint/d' .claude/skills/{name}/SKILL.md) .gemini/skills/{name}/SKILL.md

# References 一致性
diff -r .claude/skills/{name}/references/ .gemini/skills/{name}/references/
diff -r .claude/skills/{name}/references/ .agent/skills/{name}/references/
```
