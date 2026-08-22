# Adaptation Depth Specification — 蒸餾適配深度量化標準

> **建立**: 2026-05-23 v1.4.0
> **觸發**: Stage α 4 Phase 蒸餾深度 ultrathink 評估均值 ~56%(中等偏低)— 需固化量化標準防止「文檔聲稱優化適配但實際照搬」反模式
> **對應**: SKILL.md §Principle 3.5 摘要 — 本檔提供完整 spec
> **適用場景**: Phase 3 Essence Extraction 完成後,**裁決 GO/PILOT/REJECT 之前**強制走本評分標準

---

## 1. Adaptation Depth Tiers — 5 級量化評分

蒸餾本質是「將外部資源融合優化適配到 PhyCool 開發環境」,而非 byte-for-byte 移植。本量化標準防止「精神對齊但實作照搬」的偽蒸餾反模式。

| 等級 | % 範圍 | 定義 | Stage α 案例 |
|:---:|:---:|:----|:----|
| **L0 · 照搬**(Wholesale copy) | 0-20% | 原版 byte-for-byte 複製,無修改 | (Stage α 無此案例) |
| **L1 · 微調**(Surface tuning) | 20-40% | 表層 metadata 補強(frontmatter / triggers / attribution) + body 100% 照搬 | **Phase 2C** 3 superpowers skills(30%):14 欄位 + zh-TW triggers + Pressure Test 5 區塊,但 body 100% 一致 |
| **L2 · 混合**(Mixed adaptation) | 40-60% | 架構整合(融入既有 hook/skill)+ 部分內容適配,核心邏輯 byte-for-byte | **Phase 2B** ECC governance(40%):5 SECRET_PATTERNS + 6 SENSITIVE_PATHS 100% 照搬,architecture 60% 適配(融入 cross-ref-precheck) |
| **L3 · 優化適配**(Optimized adaptation) | 60-80% | 跨語言重寫 + 演算法優化 + 整合本地架構 + 本地化補強 | **Phase 2A** deepagents validateSkillName(75%):Python → JS + Unicode regex 優化 + 整合 audit-config framework |
| **L4 · 深度適配**(Deep adaptation) | 80%+ | algorithm idea level + 完整環境特化 + 法務合規 + workflow roadmap | **Phase 3** Khoj distillation(80%):algorithm idea + zh-TW 標點 + UTC+8 + ADR-KHOJ AGPL-3.0 REJECT + Stage β/γ roadmap |

**裁決基線**:

- **目標**: L3(60%+)或 L4
- **L2 接受條件**: 原版屬「通用 patterns / 規則」(e.g. SECRET_PATTERNS 正則本身)且 architecture 適配可彌補
- **L1 接受條件**: 對齊上游 maintainer 明示紀律(e.g. superpowers CLAUDE.md "do not modify body" 要求 — body 不改是正確選擇)
- **L0 不接受**: 純 `cp src dst` 無任何適配 = REJECT

---

## 2. Adaptation 4 Dimensions Checklist

每個 Phase 3 整合必逐項自檢 4 維度,每維度有 ≥ 1 個 ✅ 才算啟動該維度適配:

### D1 · 跨語言 / 語法轉換(Cross-language transform)

- [ ] 原版語言 → PhyCool 環境語言
  - Python → JavaScript / Node.js(範式: deepagents `skills.py` → `audit-config.js`)
  - Python → Markdown idea-level reference(範式: khoj `text_to_entries.py` → `khoj-distillation.md`)
  - C# → JavaScript(若 ECC PowerShell scripts 移植)
- [ ] 純文字 SKILL.md → SKILL.md(N/A 語言轉換,跳到 D2-D4)
- [ ] CommonJS / ESM module pattern 對齊 PhyCool `.claude/hooks/` 慣例(`require()` + `module.exports`)

### D2 · 演算法 / 實作優化(Algorithm / implementation optimization)

- [ ] 更精簡的等效實作
  - Python `for c in name: isalpha()` 逐字檢查 → JS `/^[\p{Ll}\p{Nd}-]+$/u` regex 一次性
  - 嵌套 if-else → table-driven dispatch
- [ ] 更高性能
  - O(n) loop → O(1) regex
  - 同步阻擋 → async / advisory `exit 0`(fail-open)
- [ ] 更精準的邊界處理
  - 補 fail-open(`exit 0` 全路徑)
  - 補 BOM strip + CRLF normalize(對齊 `.claude/rules/crlf-normalize-discipline.md`)
  - 補 timeout ≥ 2000ms(對齊 `.claude/rules/hooks-creation-discipline.md` F3)

### D3 · 架構整合(Architectural integration)

- [ ] **禁整 module 移植** — 必融入既有工作流
- [ ] 整合既有 hook / skill / pipeline
  - 範例: ECC governance-capture **不獨立成 hook**,融入 `cross-ref-precheck.js` advisory 流程(L256-265 `combinedNote`)
  - 範例: deepagents `_validate_skill_name` **不獨立 export**,融入 `audit-config.js checkSkills()` 流程(L274-286)
- [ ] 對齊既有架構慣例
  - advisory only(`exit 0` 全路徑)
  - paths-scoped frontmatter(rules / hooks)
  - progressive disclosure(references/ 拆分)
- [ ] 對齊既有 SUPREME mandate(constitutional-standard / cross-ref-discipline / single-engine-mode)

### D4 · 本地化補強(PhyCool environment localization)— 7 必補項

| # | 項目 | 對齊規範 |
|:-:|:----|:----|
| 1 | **語言**: zh-TW(繁體中文)| `.claude/rules/traditional-chinese-discipline.md` CRITICAL |
| 2 | **時區**: UTC+8 / Asia/Taipei | `.claude/rules/constitutional-standard.md` §Timestamp Mandate |
| 3 | **編碼**: UTF-8(`.md` / `.json` / `.cjs` / `.js` 用 **No-BOM**;`.ps1` / `.cs` / `.razor` / `.cshtml` 必含 BOM)| `.claude/rules/encoding-discipline.md` + `crlf-normalize-discipline.md` |
| 4 | **環境**: PowerShell **7.6.1**(Core)+ Node 18+ + Windows 11(Bash → pwsh -Command 中文路徑禁用 — quoting 雙層 escaping 衝突,必走 PowerShell tool 原生)| `.claude/skills/phycool-windows-ps-encoding/SKILL.md` |
| 5 | **業務 secret patterns**: ECPay HashKey/HashIV + SendGrid API key + Azure Storage key + Anthropic API key + reCAPTCHA SecretKey | `.claude/rules/mcp-payload-discipline.md` + PhyCool stack |
| 6 | **Workflow trigger**: dev-story / code-review / sprint-status.yaml / IDD framework / tasks-backfill-verify | BMAD workflow + `.claude/rules/tasks-backfill.md` |
| 7 | **法務合規**: ADR + LICENSE attribution + License compatibility(MIT/Apache 2.0 兼容 vs AGPL viral REJECT)| `docs/technical-decisions/ADR-EXTERNAL-NNN` 範式 |

---

## 3. Adaptation Self-Check(蒸餾完成前 5 題)

蒸餾完成 + 寫 `distillation-record.md` 前必逐題自答:

1. **「我是否做了跨語言 / 語法轉換?」**(D1)
   - 適用: 外部源 Python/Go/Rust + PhyCool stack JS/C#
   - 不適用: 外部源 SKILL.md → PhyCool SKILL.md(N/A,跳 Q2)

2. **「我是否補強了原版的演算法或邊界處理?」**(D2)
   - 否 → STOP,評估能否更精簡 / 更高性能 / 更精準

3. **「我是否融入既有 PhyCool 工作流而非新建獨立模組?」**(D3)
   - 否 → STOP,審視是否重複建造

4. **「我是否補強了 PhyCool 本地化 7 項?」**(D4)
   - zh-TW / UTC+8 / UTF-8 / PowerShell 7.6.1 / 業務 patterns / workflow trigger / 法務合規
   - 否 → STOP,逐項補

5. **「我能否量化評分 ≥ L2(40%)?」**(對齊 §1 Tiers)
   - 否 → STOP,加深適配或撤回整合決策

任一答 No → 不符合蒸餾本質,屬「照搬」反模式。

---

## 4. Stage α 4 Phase Adaptation Case Studies

### Phase 2A · deepagents validateSkillName(L3 75% 優化適配)

| 維度 | Evidence |
|:----|:----|
| D1 跨語言 | ✅ Python 40 行 → JS 16 行(`skills.py:L324-362` → `audit-config.js:L68-83`) |
| D2 演算法 | ✅ Python `for c in name: isalpha() and islower() or isdigit()` for-loop → JS `/^[\p{Ll}\p{Nd}-]+$/u` Unicode property escapes 一次性 regex |
| D3 架構整合 | ✅ 融入 `audit-config.js checkSkills()` L274-286,配合 `RESERVED_NAME_KEYWORDS` 補強 |
| D4 本地化 | ✅ 繁中註解(L75)+ PhyCool-specific `RESERVED_NAME_KEYWORDS` 規則 |
| 待補強 | 可選 phycool-* prefix 強化規則(D15-v2-A) |

### Phase 2B · ECC governance-capture(L2 40% 混合適配)

| 維度 | Evidence |
|:----|:----|
| D1 跨語言 | N/A(JS → JS) |
| D2 演算法 | 🟡 5 patterns + 6 paths byte-for-byte 一致(只差 aws_key `/i` flag 漏寫 — 🔴 潛在 bug) |
| D3 架構整合 | ✅ 不獨立成 hook,融入 `cross-ref-precheck.js` advisory(L256-265 `combinedNote`),`APPROVAL_COMMANDS` 明確選擇性排除 |
| D4 本地化 | 🟡 缺 PhyCool 業務 secret patterns(ECPay / SendGrid / Azure / Anthropic)— D15-v2-B 待補 |
| 待補強 | 必補 D15-v2-B + 修 aws_key `/i` flag |

### Phase 2C · superpowers 3 skills(L1 30% 微調)

| 維度 | Evidence |
|:----|:----|
| D1 跨語言 | N/A(SKILL.md → SKILL.md) |
| D2 演算法 | N/A(無演算法層,只 SOP 內容) |
| D3 架構整合 | 🟡 frontmatter 6→14 欄位 + Pressure Test 5 區塊新增 |
| D4 本地化 | 🟡 zh-TW triggers 14-15 個 + Source Attribution + Pressure Test;**但 body 100% 照搬**(對齊 superpowers maintainer 紀律 — "do not modify body") |
| 待補強 | 必補 D15-v2-C: 加 "PhyCool Workflow Integration" 章節(dev-story / sprint-status / IDD framework / incident records 對照) |

### Phase 3 · Khoj distillation(L4 80% 深度適配)

| 維度 | Evidence |
|:----|:----|
| D1 跨語言 | ✅ Python algorithm pseudocode → Markdown idea-level reference(`khoj-distillation.md`) |
| D2 演算法 | ✅ idea level only(0 line code copy) |
| D3 架構整合 | ✅ 對接 `incremental-embed.js` + `context_entries.content_hash` + PRAGMA verify |
| D4 本地化 | ✅ zh-TW 標點(`。/、/,`)+ UTC+8 timezone + zh-Hant locale + Stage β/γ roadmap + ADR-KHOJ AGPL-3.0 REJECT |
| 待補強 | (已充足) |

**4 Phase 均值**: ~56%(中等偏低)— 目標應 ≥ L3 (60%+) 起跳,Stage α 4/4 中只 2 個達標(Phase 2A + Phase 3)。

---

## 5. Anti-Patterns F12-F16(對齊 saas-to-skill v3.3.0 §5.4 面向 8 FORBIDDEN Loophole Closure 三元素)

### F12 · 純照搬無適配(Wholesale copy with surface metadata only)

❌ **Forbidden**: body 100% 照搬 + 只補 frontmatter / triggers / attribution = 偽蒸餾
   Common Rationalization: "對齊上游 maintainer 紀律,不能改 body"
   Red Flag: `distillation-record.md` 「適配深度」欄空白 OR < L2 (40%) 但仍 ACCEPT 整合

### F13 · 缺業務 patterns 補強(Generic patterns only, missing business-specific)

❌ **Forbidden**: 通用 secret patterns / validators 100% 移植,沒加 PhyCool 業務 specific
   Common Rationalization: "通用規則已涵蓋,業務 specific 留下次"
   Red Flag: SECRET_PATTERNS / SENSITIVE_PATHS / 規則 array 與原版 byte-for-byte 一致,0 個 ECPay / SendGrid / Azure / Anthropic 等 PhyCool stack 業務 patterns

### F14 · 缺 workflow trigger 整合(Missing PhyCool workflow trigger integration)

❌ **Forbidden**: SKILL.md "Real Examples" / "When To Apply" 沒對應 PhyCool 案例
   Common Rationalization: "範例已涵蓋通用情境"
   Red Flag: 蒸餾自外部 SKILL.md 但 PhyCool 版 0 處引用 dev-story / code-review / sprint-status.yaml / IDD framework / tasks-backfill-verify

### F15 · 演算法直譯無優化(Pure syntax transform without optimization)

❌ **Forbidden**: 跨語言重寫但 0 性能 / 精簡 / 邊界優化
   Common Rationalization: "對齊原版邏輯,不亂改"
   Red Flag: `distillation-record.md` "適配深度" 無 D2 evidence(無 regex 優化 / fail-open / BOM strip / timeout 等補強)

### F16 · 文檔聲稱浮誇(Inflated adaptation claims)

❌ **Forbidden**: `distillation-record.md` / commit message 聲稱「優化適配」但實際 < L3 (60%)
   Common Rationalization: "我有適配,只是表層"
   Red Flag: 量化評分 vs 文字聲稱不一致(claim "deeply adapted" 但 4 維度 ≤ 2 個 ✅)

---

## 6. 對齊 saas-to-skill v3.3.0 §5.4 八面向驗證

本檔對齊 saas-to-skill Mode B 八面向:

- **面向 3**(程式碼模式 BAD/GOOD): §1 Tiers 提供 5 級評分 + Stage α 案例對照
- **面向 4**(references/ 子檔): 本檔自身屬 references/ 拆分,符合 progressive disclosure
- **面向 8**(FORBIDDEN Loophole Closure): F12-F16 三元素強制(Forbidden / Common Rationalization / Red Flag)

---

## 7. Related References

- `references/principle-deep-dives.md` — Principle 3 完整論述
- `references/anti-patterns.md` — F1-F11 既有反模式
- `references/skill-tool-invocation-matrix.md` — Phase 3 動作 → Skill tool 字面調用矩陣
- `.claude/rules/skill-tool-invocation-mandatory.md` v1.2.0 SUPREME
- `.claude/rules/hooks-creation-discipline.md` v1.0.0 SUPREME
- `.claude/rules/cross-ref-discipline.md` v1.0.0 SUPREME
- `.claude/skills/saas-to-skill/SKILL.md` v3.3.0 §5.4 八面向驗證

---

## 8. Incident Records

### 2026-05-23 — 本 spec 觸發建立

**事件**: Stage α 4 Phase 蒸餾深度 ultrathink 評估揭露均值 ~56%(中等偏低),且發現:

- Phase 2B `aws_key` `/i` flag 漏寫(原版有)— 潛在 bug
- Phase 2C body 100% 照搬但缺 PhyCool workflow integration(D15-v2-C)
- Phase 2B 缺 PhyCool 業務 secret patterns(D15-v2-B)
- 前次驗證(2026-05-23T19:20)有 **L1 Statistics Fallacy** 反模式(只看 git stat 不對齊 file:line)

**處理**:

- 本 reference v1.4.0 建立(對齊 SKILL.md §Principle 3.5 摘要)
- 5 級評分 + 4 維度 + 5 self-check + Stage α 4 Phase 案例對照 + F12-F16 三元素
- 對齊 saas-to-skill v3.3.0 §5.4 八面向驗證
- 對齊使用者 ultrathink 訊息「禁止無腦直接照搬」+ 「比對、驗證、適配我們開發環境配置來進行優化」
- 本地化補強 D4 含 zh-TW + UTC+8 + UTF-8 + PowerShell 7.6.1 + 業務 patterns + workflow trigger + 法務合規 共 7 項
