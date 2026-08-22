# SKILL.md 六區塊標準模板

## YAML Frontmatter

### 必填 6 欄位（所有 SaaS Module Skill 均須顯式設定）

```yaml
---
name: phycool-{module-name}          # 必填：kebab-case ≤64 字元，phycool- 前綴
description: "PhyCool Platform {模組名稱}規範。觸發關鍵字：{keyword1}, {keyword2}, {keyword3}... 適用於：{場景1}、{場景2}。"
                                      # 必填：≤1024 字元，≥10 觸發關鍵字，中英混合
version: 1.0.0                        # 必填：semver（patch=微調/minor=新規則/major=架構變更）
updated: {YYYY-MM-DD}                 # 必填：最後更新日期（台灣時間）
disable-model-invocation: false       # 必填（Claude only）：false=允許自動觸發；true=僅手動
user-invocable: true                  # 必填（Claude only）：true=允許 /name 觸發；false=隱藏
---
```

### 按需 6 欄位（依 Skill 需求選擇性設定）

```yaml
---
# --- 按需欄位（不需要則省略，勿留空值） ---
argument-hint: "{story-id}"           # 按需：有參數輸入時才設，顯示補全提示
allowed-tools: "Read, Grep, Glob"     # 按需：唯讀 Skill 才設，限制工具存取
model: "claude-opus-4-6"             # 按需：僅需特定模型時才設
effort: "high"                        # 按需：深度推理 Skill 才設（high / max）
context: "fork"                       # 按需：研究型/隔離型 Skill 才設
agent: "..."                          # 按需：配合 context: fork 使用
---
```

### 完整 12 欄位決策矩陣

| 欄位 | SaaS Module Skill 預設 | 決策條件 | Claude Only |
|------|----------------------|---------|:-----------:|
| `name` | `phycool-{module}` | 必填，kebab-case ≤64 字元 | ❌ |
| `description` | ≤1024 字元，≥10 觸發詞 | 必填，中英混合「強推」策略 | ❌ |
| `version` | `1.0.0` | 必填，語義化版本（semver） | ❌ |
| `updated` | 當天日期 | 必填，格式 YYYY-MM-DD | ❌ |
| `argument-hint` | 不設 | 有參數輸入時才設 | ✅ |
| `disable-model-invocation` | `false` | SaaS Skill 需自動觸發；唯讀工具才設 `true` | ✅ |
| `user-invocable` | `true` | 允許 `/name` 手動觸發；隱藏式 Skill 才設 `false` | ✅ |
| `allowed-tools` | 不設 | 唯讀 Skill 才設 `Read, Grep, Glob` | ✅ |
| `model` | 不設 | 僅需特定模型時才設 | ✅ |
| `effort` | 不設 | 深度推理才設 `high` 或 `max` | ✅ |
| `context` | 不設 | 研究型/隔離型才設 `fork` | ✅ |
| `agent` | 不設 | 配合 `context: fork` 使用 | ✅ |

> ⚠️ Claude Only 欄位在 `.gemini/` 和 `.agent/` 版本中必須移除。

### 其他建議欄位（三引擎皆可用）

```yaml
author: {Agent ID}                    # 建議：建立者 Agent ID
created: {YYYY-MM-DD}                 # 建議：首次建立日期
last_synced_epic: {Epic名稱}          # 建議：最後同步的 Epic
last_synced_date: {YYYY-MM-DD}        # 建議：最後同步日期
watches:
  - glob: "src/YourApp/Web/{模組路徑}/**/*.cs"
    domain: {domain-tag}
  - glob: "src/YourApp/Web/ClientApp/src/{前端路徑}/**/*.{ts,tsx}"
    domain: {domain-tag}
```

---

## Body 六區塊結構

### 區塊 1: 標題 + 概述

```markdown
# PhyCool {Module} Standard

{一句話定位}。

**來源**:
- `docs/project-planning-artifacts/architecture/{相關文檔}.md`
- `docs/project-planning-artifacts/functional-specs/{相關規格}.md`
```

### 區塊 2: 適用場景 + 不適用範圍

```markdown
## 適用場景

- {場景1}
- {場景2}

## 不適用範圍 (Not For)

- ❌ {不處理的範圍1}（用 `/{other-skill}`）
- ❌ {不處理的範圍2}
```

### 區塊 3: 功能清單

```markdown
## 功能清單

| 功能 | 觸發關鍵字 | 說明 |
|------|-----------|------|
| {功能1} | {keywords} | {簡述} |
| {功能2} | {keywords} | {簡述} |
```

### 區塊 4: 絕對限制 (Constraints)

```markdown
## 絕對限制

> ⚠️ 以下為不可違反的規則。

### {約束類別} — {C1-C10 對應}

| 規則 | 說明 |
|------|------|
| {規則名} | {描述} |

**正確做法**：
```csharp
// ✅
{正確程式碼}
```

**錯誤做法**：
```csharp
// ❌
{錯誤程式碼}
```
```

### 區塊 5: 開發指南

```markdown
## 開發指南

### {常見任務1}

1. {步驟1}
2. {步驟2}

### {常見任務2}

{模式/範本}
```

### 區塊 6: 參照路徑

```markdown
## References

- 詳細 API 規格：[api-spec.md](references/api-spec.md)
- 資料庫 Schema：[db-schema.md](references/db-schema.md)
```

---

## 品質門檻 Checklist

建立完成後逐項確認：

- [ ] SKILL.md ≤ 500 行
- [ ] description ≤ 1024 字元
- [ ] 觸發關鍵字 ≥ 10 個（中英混合）
- [ ] watches glob 覆蓋核心程式碼路徑
- [ ] Not For 段落存在（明確排除範圍）
- [ ] 約束規則附 file:line 程式碼證據
- [ ] ✅/❌ 程式碼範例可編譯
- [ ] 三引擎檔案已部署且一致
- [ ] skills_list.md 已更新
- [ ] disable-model-invocation + user-invocable 已顯式設定（非依賴預設值）
- [ ] 若 Skill 有副作用操作，hooks 欄位已記載或 dev_notes 說明無需 hooks
