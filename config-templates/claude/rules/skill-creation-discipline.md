---
paths:
  - ".claude/skills/**/SKILL.md"
  - ".gemini/skills/**/SKILL.md"
  - ".agent/skills/**/SKILL.md"
  - "scripts/audit-skill-overlap.cjs"
---

# Skill Creation Discipline — Skill 規模 cap + 重疊偵測 + 90d retire(SUPREME)

> **版本**: 1.0.0
> **適用情境**: Skill 數量治理 + 新建門檻 + 重疊整併 + 0 觸發 retire
> **嚴重等級**: SUPREME(對齊 `capability-integration-mandate.md` 兄弟規範)

---

## 1. Why This Rule

### 1.1 Scale-Stale Reciprocity 反模式

當 Skill 數量持續累積:
- **Stale 風險指數成長**: N Skills 同步維護成本 = O(N),每次 capability 變動需 N 點同步
- **跨 Skill 引用網稠密**: 多 Skill × 三引擎 = 大量 file md5 identical 維護
- **Domain Profile 連帶載入限制超出**: 部分 Domain 已超合理量
- **Hot vs Cold Path 不分**: 高頻 Skill 與罕用 Skill 同等待遇
- **新建門檻太低 → 規模膨脹**: 沒有「新建必須證明不能放在既有」rule

**反模式命名**: **Scale-Stale Reciprocity** — 越大越 stale,越 stale 越無法引導使用。

---

## 2. Cap 規則(以項目實況設定 baseline + buffer)

| 類別 | 建議 Cap | Buffer 邏輯 |
|:---|:---:|:---|
| **業務 SaaS Skill**(`<project>-*` prefix)| 視 baseline + 5-10% buffer | 留進化空間 |
| **通用 Skill**(workflow / utility / tool)| 視 baseline + 5-10% buffer | 留新工具空間 |
| **總計** | 業務 + 通用 + 5-10% buffer | 防超支 |

**超過 Cap force review**:
- 觸發 → 必走 §3 新建必檢 3 題
- 若 3 題任一答 NO(放既有 / 重疊低)→ 駁回新建,改加章節
- 若 Cap 已滿(0 buffer)→ 必先 retire 1 個既有 Skill 才能新建

---

## 3. 新建 Skill 必檢 3 題

### Q1: 既有相近主題?

**動作**:
```bash
# Glob + Read 5+ 個既有 SKILL.md description
node scripts/audit-skill-overlap.cjs --check-new "<新 Skill 名稱>" --description "<新 Skill 描述>"
```

**判定**:
- 若 description keyword overlap ≥ 70% with 既有 → **駁回**,改加章節到既有 Skill

### Q2: 不能放在既有 Skill?

**動作**: 自答以下 3 子問:
- 是否屬既有 Skill 範圍延伸?(若是 → 改加章節)
- 是否屬既有 Skill 「Not For」明示排除?(若是 → 新建合理)
- 是否屬全新 domain 從未出現?(若是 → 新建合理)

**判定**:
- Yes(可放既有)→ **駁回**新建
- Yes(屬「Not For」明示排除 / 全新 domain)→ Pass

### Q3: triggers 與既有 Skill 重疊度 ≤ 30%?

**動作**:
```bash
node scripts/audit-skill-overlap.cjs --check-new-triggers "<新 Skill triggers list>"
```

**演算法**: pair-wise Jaccard with 既有 Skill triggers
- Jaccard = |A ∩ B| / |A ∪ B|
- ≥ 50% → **駁回**(重大重疊)
- 30% < x < 50% → **Warn**(需具體理由)
- ≤ 30% → **Pass**

---

## 4. Audit 工具

### `scripts/audit-skill-overlap.cjs`

#### Phase 1: 90 天 0 觸發偵測(retire 候選)

**SQL**:
```sql
SELECT skill_name, MAX(observed_at) AS last_triggered
FROM retrieval_observations
GROUP BY skill_name
HAVING last_triggered < datetime('now','-90 days','+8 hours')
   OR last_triggered IS NULL
```

**輸出**: retire 候選清單

#### Phase 2: triggers Jaccard

```javascript
// 1. Read 全 .claude/skills/**/SKILL.md
// 2. 抽 triggers section(yaml frontmatter `triggers:` array)
// 3. pair-wise Jaccard 計算
// 4. ≥ 50% → 整併候選,30%-50% → Warn
```

#### Phase 3: description 主題比對

```javascript
// 1. 抽 yaml frontmatter `description:` 字段
// 2. tokenize + 去 stopwords
// 3. keyword overlap ≥ 70% → 整併候選
```

**呼叫範例**:
```bash
node scripts/audit-skill-overlap.cjs --json
node scripts/audit-skill-overlap.cjs --md > docs/audit-reports/<date>-skill-overlap-baseline.md
node scripts/audit-skill-overlap.cjs --check-new "<new-name>" --description "..."
```

---

## 5. FORBIDDEN(5 條,違反 = SUPREME 等級違規)

- ❌ **F1**: 新建 Skill 不答 §3 3 題 → 自動 BLOCK(對齊 capability-integration-mandate.md F5 placeholder 投機)
- ❌ **F2**: Skill 規模超 Cap 不 review → **違反 Scale-Stale Reciprocity 防線**
- ❌ **F3**: 新建 Skill 用 `Skill(skill="saas-to-skill")` 但漏走 §3 3 題 → 對齊 skill-tool-invocation-mandatory.md F1
- ❌ **F4**: 90 天 0 觸發 Skill 不 retire 任由累積 → **stale 累積**
- ❌ **F5**: triggers Jaccard ≥ 50% 既有重疊 Skill 不整併 → **規模惡性循環持續**

---

## 6. 整併 / Retire 流程

### 整併(merge candidate)

對齊 `Skill(skill="saas-to-skill")` Mode B 機制:

1. 確認 2 個 Skill 重疊(audit-skill-overlap 標記 ≥ 50% Jaccard 或 description ≥ 70%)
2. 走 saas-to-skill Mode B:
   - Step 1: 將 secondary Skill 內容合併入 primary Skill(加章節)
   - Step 2: 三引擎同步(.claude / .gemini / .agent)
   - Step 3: 刪除 secondary Skill 目錄(三引擎)
   - Step 4: 更新 `.claude/skills/skills_list.md` keyword matching
   - Step 5: Memory DB add_context category=decision 記錄整併

### Retire(90 天 0 觸發)

1. audit-skill-overlap Phase 1 標記
2. 確認確實無消費路徑(grep skill name 全 codebase)
3. 走 saas-to-skill Mode B:
   - Step 1: 標 frontmatter `status: retired` + `retired_date: YYYY-MM-DD`
   - Step 2: 三引擎同步
   - Step 3: Memory DB add_context 紀錄 retire 理由
4. **不立即刪除**,保留 6 個月觀察期(若有觸發即 reactivate)

---

## 7. Self-Check(每次新建 Skill 前必自問 4 題)

1. **「既有 .claude/skills/ N 個 Skill,有沒有相近主題?」**
   - Glob + Read 5+ 個 → 找到 → 駁回新建
2. **「我打算新建的 Skill 能不能放在既有 Skill 加章節?」**
   - 是 → 駁回新建,改加章節
3. **「triggers 與既有 Jaccard ≥ 50%?」**
   - 是 → 駁回新建,合併入既有
4. **「Cap 還有 buffer?業務 Skill / 通用 Skill / 總數 < 上限?」**
   - 否 → 必先 retire 1 個既有才能新建

---

## 8. Domain 治理

| Domain 類型 | 建議上限 |
|:---|:---:|
| Platform Core(architecture / state / design)| 10-12 |
| Backend Services(admin / db / error / background / routing / security)| 10-12 |
| Business Logic(payment / member / business-api 等)| 8-10 |
| Identity & Security | 3-5 |
| Third-Party | 1-3 |
| Infrastructure(pdf / signalr / i18n / cloud / e2e / testing)| 8-10 |
| Workflow Tools | ≤ 8(超過考慮整併三胞胎) |
| Pipeline & Automation | ≤ 8 |
| Development Utilities | 8-12 |

→ Workflow Tools / Pipeline 三胞胎現象(claude-launcher / e2e 多變體)為已知整併候選。

---

## 9. Hook 機制(advisory)

未來可建 `.claude/hooks/skill-creation-detector.js`(計畫):

```javascript
// FileChanged hook 偵測新建 .claude/skills/{name}/SKILL.md
// 自動跑 audit-skill-overlap.cjs --check-new
// 若 §3 3 題任一 fail → stderr 警告
// 不 BLOCK(advisory)
```

---

## 10. Related

- `capability-integration-mandate.md`(SUPREME 兄弟規範)
- `skill-sync-gate.md`(既有 Skill ↔ Code 軸)
- `skill-tool-invocation-mandatory.md`(saas-to-skill 字面調用)
- `auto-skill-detection.md`(Domain Profile 連帶載入)
- `audit-skill-overlap.cjs`(audit 工具)

---

## 11. Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.0.0** | **2026-05-02** | **初版建立**。Cap 規則(以項目 baseline + 5-10% buffer 設定),新建必檢 3 題,90d 0 觸發 retire 偵測,5 條 FORBIDDEN,Self-Check 4 題,audit-skill-overlap.cjs 工具支援。 |
