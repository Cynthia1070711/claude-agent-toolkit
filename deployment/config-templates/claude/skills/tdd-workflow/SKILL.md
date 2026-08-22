---
name: tdd-workflow
description: >
  Test-Driven Development workflow enforcing 80%+ coverage.
  Use when writing new features, fixing bugs, or refactoring code.
  Covers TDD red-green-refactor cycle, ATDD acceptance tests,
  and test category mapping (CMD/QRY/EVT/SEC).
  PhyCool-specific patterns see /phycool-testing-patterns.
version: 2.2.0
updated: 2026-06-10
triggers:
  - new feature
  - bug fix
  - 80%+ coverage
  - TDD
  - RED GREEN REFACTOR
  - TDD philosophy
  - DAMP over DRY
  - failing test first
  - red-green cycle
  - Test Pyramid
  - Prove-It Pattern
author: CC-OPUS
created: 2026-02-01
---

# TDD Workflow

> PhyCool 專案的測試框架細節（xUnit, Moq, Vitest, Playwright, fabric mock）見 `/phycool-testing-patterns`。
> 本 Skill 定義 TDD 方法論流程，與技術棧無關。

## Coverage Requirements

- Minimum **80%** coverage（Unit + Integration + E2E）
- 所有 edge cases 覆蓋
- Error scenarios 必測
- Boundary conditions 必驗證

---

## TDD Flow（適用於所有程式碼變更）

### Step 1: Query First
開始前查記憶庫：`search_tech` 搜尋同類問題（category: bugfix/debug）

### Step 2: ATDD First
從 AC / bug description 寫 Acceptance Test（驗證修復後預期行為）。

> **M/L/XL story-level ATDD red gate**: M/L/XL Story 進入編碼前，story 級 ATDD 驗收測試須先 RED（對齊 `_bmad/bmm/workflows/4-implementation/dev-story/steps/step-05-implement-task.md §0.4` + `testarch/atdd` workflow）。錨定 Story D0 SPEC Kernel Success signal = 此 story 級測試全綠。S 卡 per-change ATDD 即足（三層分層）。

### Step 3: TDD RED
寫**失敗**的 Unit Test。命名規則：
- 有 BR: `{BR_ID}_{Scenario}_{ExpectedResult}`
- 無 BR: `BUG{ID}_{Scenario}_{Expected}`

### Step 4: TDD GREEN
寫**最少量**程式碼讓測試通過

### Step 5: TDD IMPROVE
重構，不改變行為（所有測試仍通過）

### Step 6: Verify Coverage
確認 80%+ 覆蓋率

---

## Test Category Mapping

| 領域 | 測試類別 | 範例 |
|------|---------|------|
| 邊界/輸入驗證 | CMD tests | 參數範圍、空值、格式 |
| 認證/授權規則 | SEC tests | 角色存取、權限檢查 |
| 查詢/讀取操作 | QRY tests | 資料回傳、分頁、篩選 |
| 事件/通知觸發 | EVT tests | Webhook、SignalR、Email |

---

## Debug Limit

測試失敗修復 ≤ **3 輪**。超過 → 觸發 context compression 或重新分析根因。

## Post Bug-Fix

1. 用 `add_tech(category: "bugfix")` 記錄修復到記憶庫
2. 測試名稱含 Bug ID 確保可追溯

---

## Common Mistakes

| ❌ 錯誤 | ✅ 正確 |
|---------|---------|
| 測試實作細節（internal state） | 測試使用者可見行為 |
| 脆弱選擇器（CSS class） | 語意選擇器（data-testid, role） |
| 測試間有依賴 | 每個測試獨立 setup |
| 先寫 code 再補 test | 先寫 test 再寫 code（TDD） |
| 跳過 error path | Happy path + Error path 都測 |

---

## Best Practices

1. **Tests First** — 永遠 TDD
2. **One Assert Per Test** — 聚焦單一行為
3. **Descriptive Names** — 測試名說明意圖
4. **AAA Pattern** — Arrange-Act-Assert
5. **Mock External Only** — 只 mock 外部依賴
6. **Fix Implementation, Not Tests** — 除非測試本身有誤

---

## TDD Philosophy & Cycle (v2.1.0 新增)

> **背景**: 既有 §TDD Flow 是 PhyCool 6 步**操作流程**(Query→ATDD→RED→GREEN→IMPROVE→Coverage),本章補完整 RED/GREEN/REFACTOR **哲學基礎**與深度範式。
>
> **來源**: agent-skills-main `test-driven-development/SKILL.md` 完整方法論,融入 PhyCool 既有 ATDD First + BR 命名 + Context DB 自動學習體系。

### §X.1 RED → GREEN → REFACTOR 三 commit 完整循環

| Step | 動作 | Commit 命名 | CI 狀態 | 為什麼 |
|:-:|------|------------|:-----:|------|
| **RED** | 寫**會失敗**的 test,斷言命中目標行為(throws / wrong value / missing side-effect) | `test(xxx): add failing test for {behavior}` | 🔴 **MUST red** | 證明 test 真的在驗證該行為,不是 trivially pass |
| **GREEN** | 寫**最少 code** 讓 test 過,**不**追求漂亮 | `feat(xxx): make test pass` 或 `fix(xxx): {root cause}` | 🟢 **MUST green** | 證明該 code 確實解決問題,非 over-engineering |
| **REFACTOR** | **不改行為**改善 code 質量,持續跑 test 確認綠 | `refactor(xxx): improve readability` | 🟢 持續 green | 保留行為的同時提升可維護性 |

**FORBIDDEN**:

- ❌ GREEN 時順便加新功能(違反「最少 code」)
- ❌ REFACTOR 時順便改 test 斷言(違反「不改行為」)
- ❌ RED 寫的 test 命名模糊(`Should().NotBeNull()` 無法證明命中)

### §X.2 DAMP over DRY(Test 容許重複保可讀)

**DAMP** = **D**escriptive **A**nd **M**eaningful **P**hrases

在 production code DRY 是優點,**但在 test code 中過度 DRY 反而傷害可讀性**:

```csharp
// BAD: 抽 helper 讓 test 不直觀
[Fact]
public void Refund_FromCancelledState_Throws()
{
    var order = CreateTestOrderInCancelledState();  // helper 隱藏關鍵 setup
    Assert.Throws<InvalidStateTransition>(() => order.Refund());
}

// GOOD: DAMP - 重複 setup 換可讀性
[Fact]
public void Refund_FromCancelledState_Throws()
{
    var order = new Order { Status = OrderStatus.Cancelled, Amount = 100 };
    Assert.Throws<InvalidStateTransition>(() => order.Refund());
}
```

**判準**: 讀者能否**只看本 test 函數**就理解 setup 與斷言?可以 → DAMP;不能 → 該抽 helper。

### §X.3 Prove-It Pattern(Cross-ref F4 Bug Fix Proof Chain)

bug fix 必走**兩 commit 證明鏈**(test reproduce 必紅 → fix 必綠),**詳完整實作見 `/phycool-testing-patterns §Bug Fix Proof Chain`**(F4 既有實作層,本 skill 為哲學層)。

兩處關係:

| Skill 章節 | 角色 | 內容 |
|-----------|------|------|
| 本 §X.3(哲學層) | 為什麼必兩 commit | 證明 bug 真存在 + fix 真有效 |
| `/phycool-testing-patterns §Bug Fix Proof Chain`(實作層) | 怎麼做 | 命名規則 + git log 驗證 + CR 階段 5b 必查 |

### §X.4 Test Pyramid 哲學基礎

PhyCool 既有 `/phycool-testing-patterns §1 Test Pyramid` 規範比例(Unit 80% / Integration critical / E2E key flows),本章補**為什麼**這個比例:

| 層 | 速度 | 穩定度 | 維護成本 | 為何此比例 |
|----|:----:|:----:|:------:|----------|
| **Unit (80%)** | ms 級 | 高 | 低 | 純函數邏輯,反饋最快,最該大量寫 |
| **Integration (critical)** | s 級 | 中 | 中 | 驗證跨層真整合(API+DB+Cache),只測關鍵路徑 |
| **E2E (key flows)** | min 級 | 低(易 flaky) | 高 | 全棧驗證,只測使用者最常走流程 |

**反 Ice-cream-cone**(E2E 過多 → 慢 + 脆 + 假錯多):

- ❌ 用 E2E 測商業邏輯(該用 Unit)
- ❌ 用 Integration 測 UI 互動(該用 E2E)
- ❌ 用 Unit 測「點按鈕後彈窗顯示」(該用 component test)

### §X.5 Context DB 整合 — 測試自動學習(三層)

PhyCool 學習機制分**三層**,L1 是 agent 主動,L2/L3 為 hook 自動:

| 層 | 機制 | DB Table | 觸發 | 讀取場景 |
|:-:|------|---------|:---:|---------|
| **L1 Explicit**(本章重點) | `add_context({category:'debug'})` | `context_entries` | agent 主動 | `pre-prompt-rag.js` Layer 4 自動注入 prompt(質性) |
| **L2 Behavioral** | `PostToolUse` hook `observe-pattern.js` | `pattern_observations`(18 domains 含 `test`) | 每次 Edit/Write 自動 | DevConsole `/patterns` 儀表板(熱區趨勢、量性) |
| **L3 Retrieval** | MCP Server `logRetrieval()` | `retrieval_observations` / `retrieval_hits` / `retrieval_keywords` | 每次 `search_*` MCP tool 呼叫自動 | DevConsole `/patterns` 熱門 keyword + 命中率(行為) |

**三層互補**:
- L1 = 「我學到 BUG-XXX root cause 是 Y」(agent 經驗教訓)
- L2 = 「test domain 本週 Edit 18 次 → 熱區」(專案行為趨勢)
- L3 = 「`search_context` 最常被查 keyword 是 ECPay」(團隊學習熱點)

**詳細機制見 `/phycool-context-memory §Phase 4 Continuous Learning`**。

#### L1 — Explicit Knowledge(本層詳述)

bug fix 完成後**強制**寫入記憶庫,讓下次類似 bug agent 預先警示:

```bash
# bug fix 完成後執行(對應既有 §Post Bug-Fix Step 1):
node .context-db/scripts/upsert-debt.js --resolve TD-bug-XXX --by CC-OPUS --in {story_id}

# 或 MCP tool:
mcp__phycool-context__add_context({
  category: 'debug',
  title: 'BUG-XXX root cause: {one-line}',
  content: '{full root cause analysis + fix approach + test name}',
  tags: ['bugfix', '{module}', 'BUG-XXX']
})
```

**自動觸發機制**:`pre-prompt-rag.js` Layer 4(task-aware tech debt + decisions)會在新 prompt 涉及相同 module 時自動注入此記錄,agent 看到後**不會重蹈覆轍**。

### §X.6 Cross-Reference

- **PhyCool stack 實作層**:`/phycool-testing-patterns`(xUnit/Vitest/Testcontainers/Playwright fixture / archetype)
- **Bug fix 兩 commit 規範**:`/phycool-testing-patterns §Bug Fix Proof Chain`(F4)
- **Integration 決策矩陣**:`/phycool-integration-testing`(decision matrix + fixture selection + FixCost heuristics)
- **記憶庫 MCP tools**:`/phycool-context-memory §3 MCP Tools`(23 個 search/add tools)

---

## Version History

| 版本 | 日期 | 變更 |
|------|------|------|
| **2.2.0** | **2026-06-10** | **同步 dev-story W2 蒸餾**：§Step 2 ATDD First 加 M/L/XL story-level ATDD red gate cross-ref（對齊 dev-story step-05 §0.4 + testarch/atdd），錨定 Story D0 SPEC Kernel Success signal。S 卡 per-change ATDD 即足（三層分層，使用者 2026-06-10 裁定）。走 `Skill(skill="skill-builder")` Mode B。 |
| **2.1.0** | **2026-04-24** | **§TDD Philosophy & Cycle 新增**(§X.1-X.6)— RED/GREEN/REFACTOR 三 commit 循環 + DAMP over DRY + Prove-It Pattern cross-ref + Test Pyramid 哲學基礎 + Context DB 自動學習整合。來源:agent-skills-main `test-driven-development/SKILL.md` 完整方法論。觸發:2026-04-24 Party Mode 深度整合分析 G1(`claude token減量策略研究分析/專案優化項目計畫.md` Phase 2)。 |
| 2.0.1 | 2026-04-05 | (既有版本) |
