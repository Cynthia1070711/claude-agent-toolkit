# TRS-24: .agent/skills/ YAML 標頭適配 Antigravity 規範

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-24 |
| **狀態** | done |
| **複雜度** | M |
| **優先級** | P1 |
| **建立時間** | 2026-02-25 23:30 |
| **依賴** | TRS-22（先清理無關 Skills，再適配保留的 Skills） |
| **類型** | D 類（操作流程優化） |
| **建立者** | CC-OPUS（Party Mode） |
| **建議執行者** | CC-OPUS 或 AG-OPUS |

---

## 目標

將 `.agent/skills/` 中保留的 ~18 個 MyProject 專用 Skills 的 YAML 標頭（name、description）適配 Antigravity IDE 的語義觸發規範，確保 Skills 能被正確發現與注入。

---

## 問題描述

### 現況

`.agent/skills/` 是從 `.claude/skills/` 直接複製，YAML 標頭未針對 Antigravity IDE 的規範做適配。

### Antigravity IDE Skills 規範（來源：入門指南 §Skills 章節）

| 規範 | 要求 | 現況 |
|------|------|------|
| **name 格式** | ≤64 字元、小寫+連字號 | ✅ 已符合（如 `example-editor-arch`） |
| **name 詞形** | **必須動名詞形式**（e.g., `testing-code` 非 `test-patterns`） | ❌ 大部分不是動名詞 |
| **name 禁止** | **不得包含 "claude" 或 "anthropic"** | ⚠️ 需掃描確認 |
| **description** | 語義觸發關鍵字，影響自動匹配準確度 | ⚠️ 當前 description 為 Claude Code 設計 |
| **觸發機制** | Antigravity 靠 description 關鍵字自動匹配 | 與 Gemini CLI 的 `activate_skill` 不同 |

### 需要重新命名的 Skills（預估）

| 現行 name | 建議動名詞 name | 理由 |
|-----------|----------------|------|
| `example-editor-arch` | `managing-editor-architecture` | 動名詞 |
| `example-type-canonical` | `defining-typescript-types` | 動名詞 |
| `example-testing-patterns` | `testing-myproject-patterns` | 動名詞 |
| `example-payment` | `managing-payment-subscription` | 動名詞 |
| `example-pdf-engine` | `generating-pdf-documents` | 動名詞 |
| `example-auth-identity` | `managing-auth-identity` | 動名詞 |
| `example-sqlserver` | `querying-sqlserver-database` | 動名詞 |
| `example-admin-module` | `building-admin-module` | 動名詞 |
| `example-floating-ui` | `implementing-floating-ui` | 動名詞 |
| `example-i18n-seo` | `implementing-i18n-seo` | 動名詞 |
| `example-design-system` | `applying-design-system` | 動名詞 |
| `example-business-api` | `integrating-business-api` | 動名詞 |

> 注意：上述建議僅為初稿，需驗證 ≤64 字元限制。

---

## 實作方案

### Phase 1：掃描禁止字

```bash
grep -ri "claude\|anthropic" .agent/skills/*/SKILL.md --include="*.md" -l
```

移除或替換 YAML name 中包含 "claude" 或 "anthropic" 的字串。

### Phase 2：重新命名 YAML name

- 逐一更新每個 SKILL.md 的 YAML front matter `name:` 為動名詞形式
- 確保 ≤64 字元
- 目錄名稱保持不變（只改 YAML 內的 name）

### Phase 3：優化 description 語義觸發

- 調整 description 文案，確保包含 Antigravity 語義觸發所需的關鍵字
- 參考 CLAUDE.md §2 Skill 索引中的觸發關鍵字清單

### Phase 4：驗證

- 確認所有 YAML name 為動名詞形式
- 確認零 "claude"/"anthropic" 殘留
- 確認 ≤64 字元
- （選配）在 Antigravity IDE 中測試語義觸發是否正確

---

## 驗收標準

- [x] 所有 `.agent/skills/*/SKILL.md` 的 YAML name 為動名詞形式（17/17 全部以 -ing 動詞開頭）
- [x] 零 "claude"/"anthropic" 在 YAML name 中（grep 確認無匹配）
- [x] 所有 name ≤64 字元（最長 33 字元：`managing-payment-subscription`）
- [x] description 包含語義觸發關鍵字（17/17 均含對應領域關鍵字）
- [x] `.agent/skills/skills_list.md` 同步更新（含 15 專案 + 2 通用 Skills）
- [x] grep 驗證通過

---

## 風險

- :yellow_circle: 中：動名詞命名變更可能影響 `.claude/skills/` 和 `.gemini/skills/` 的一致性（緩解：三引擎 Skills 各自獨立管理）
- :green_circle: 低：Antigravity 語義觸發未必嚴格要求動名詞（緩解：入門指南明確要求）
