# Sub-agent 委派 PIVOT 模板

## 為什麼用 PIVOT

edf-15 事故(2026-04-06)教訓:edf-13 的 create-story / dev-story / code-review 三個 workflow 都沒 Read `ProjectsController.cs`,從 Skill 描述推測 DB 單位為 px,實際是 mm。導致 100% 新建 A4 專案尺寸污染。

**PIVOT 模板設計目標**:
- **結構性強制 Constitutional Standard** — sub-agent 在結構上無法跳過 Read 程式碼
- **file:line 證據必須** — 每個結論都要能被重新驗證
- **禁止推測語氣** — 「應該是」「可能是」「通常」都被過濾

## PIVOT 五段式結構

```
P — Problem         (問題敘述,中控填寫)
I — Investigation   (強制讀檔清單,中控預先指定)
V — Verification    (file:line 證據要求)
O — Output          (結構化 JSON)
T — Trace           (Skill 與 Story 的牽連)
```

---

## 完整 prompt 模板(直接複製使用)

```markdown
# 子代理任務:模組測試問題深度分析

## P — Problem

測試模組: {L2 模組名,如 DataSourcePanel}
測試帳號: {user1@example.com / Free Plan}
測試操作: {使用者的具體操作步驟}
預期結果: {SKILL.md BR 規則或功能規格描述}
實際結果: {使用者回饋的實際現象}
Alan 原話: "{逐字引用使用者回饋}"

## I — Investigation (強制讀檔清單)

你必須 Read 以下檔案才能繼續分析,**絕對禁止從記憶或 Skill 描述推測**:

### 1. 直接相關的元件/Hook/Service (中控預先指定)
- {file_path_1}
- {file_path_2}
- {file_path_3}

### 2. 相關的 Type 定義
- src/types/*.ts (若涉及型別)

### 3. 相關的 Backend Contract (若涉及 DB/API)
- Models/{Entity}.cs
- Controllers/{Entity}Controller.cs
- Data/TestDataSeeder.cs (若涉及種子資料)

### 4. 相關的 Skill (READ-ONLY,對照用)
- .claude/skills/phycool-{related-skill}/SKILL.md
- .claude/skills/phycool-{related-skill}/references/*.md

### 5. 相關的 Functional Spec (若有)
- docs/project-planning-artifacts/functional-specs/{area}/{spec}.md

## V — Verification (file:line 證據要求)

你的分析必須**每個結論都附 file:line 證據**,格式:
```
claim: {結論}
evidence:
  file: {file_path}
  line: {line_number_or_range}
  excerpt: |
    {程式碼引用原文}
```

**禁止使用以下語氣**:
- ❌ 「應該是」
- ❌ 「可能是」
- ❌ 「通常會」
- ❌ 「照理說」
- ❌ 「根據 Skill 描述」(Skill 不是 truth source)
- ❌ 「我記得」

**必須使用的語氣**:
- ✅ 「根據 {file}:{line},實際行為是...」
- ✅ 「對比 Spec BR-XXX 與 {file}:{line},發現...」
- ✅ 「程式碼路徑 A → B → C 的實際流程是...」

## O — Output (結構化 JSON)

回傳以下結構(不要額外文字):

```json
{
  "verdict": "Bug | Spec_Gap | Design_Drift | Plan_Matrix_Mismatch | Skill_Outdated | SaaS_Compliance | User_Misunderstanding",
  "severity": "P0 | P1 | P2 | P3",
  "root_cause": {
    "summary": "一句話結論",
    "category": "A1 | A2 | A3 | A4 | B1 | B2 | B3 | B4 | B5 | C1 | C2 | C3 | D1 | D2 | D3 | E1 | E2",
    "evidence": [
      {
        "claim": "...",
        "file": "...",
        "line": "123-145",
        "excerpt": "..."
      }
    ]
  },
  "scope_of_impact": {
    "affected_files": ["..."],
    "affected_modules": ["..."],
    "affected_plans": ["Free", "Basic"],
    "affected_users_pct_estimate": "100% | 70% | 30% | <5%"
  },
  "cmrd_candidates": [
    {
      "story_id": "eft-existing-story",
      "score": 75,
      "reason": "同檔案 + 同 BR + 相似症狀"
    }
  ],
  "story_action": {
    "type": "merge_to_existing | amend_ac | new_story",
    "target_story_id": "eft-xxx" | null,
    "ac_draft": {
      "id": "AC-N",
      "plan": "A1",
      "symptom": "...",
      "expected": "...",
      "br_ref": "BR-DATA-02",
      "discovered_in_module": "DataSourcePanel"
    }
  },
  "skill_corrections_needed": [
    {
      "skill": "phycool-editor-data-features",
      "section": "L92 BR-DATA-02",
      "current_text": "...",
      "should_be": "...",
      "evidence_file": "...",
      "evidence_line": "..."
    }
  ],
  "cross_module_impacts": ["module-X", "module-Y"]
}
```

## T — Trace (Skill 與 Story 的牽連)

回報:
1. 你 Read 了哪些檔案(供中控查核)
2. 哪些 Skill 需要校正(加入 Skill Sync Pool)
3. 哪些既有 Stories 有相關性(CMRD 候選)
4. 是否觸發新的 root cause category(可能需要擴展 taxonomy)

## 嚴格要求

1. **Constitutional 強制**: Read 程式碼優先於 Skill 推測
2. **file:line 證據**: 每條結論必須有檔案行數引用
3. **CMRD 查詢**: 必須執行 search_stories 找相關 Stories
4. **禁止推測語氣**: 只寫「根據 X,實際 Y」
5. **結構化回傳**: 嚴格遵守 JSON schema
```

---

## 中控委派範例

```
[中控] 使用 Agent tool
  subagent_type: general-purpose
  description: "分析 DataSourcePanel A1 問題"
  prompt: [完整 PIVOT 模板,填入具體值]

[Sub-agent 在背景執行]
  - Read useDataSourceValidation.ts
  - Read DataSourcePanel.tsx
  - Read ProductFeature.cs (Basic quota)
  - Grep "HasFeature|FeatureFlag"
  - search_stories(query="quota toast", epic_id="epic-eft")
  - 產出 JSON

[中控接收 JSON]
  - 解析 verdict / root_cause / cmrd_candidates
  - 決策: merge_to_existing / amend_ac / new_story
  - 執行 upsert-story.js (或 MCP)
  - 加入 Skill Sync Pool
  - 告知 Alan 結果
```

---

## 常見錯誤模式

| 錯誤 | 後果 | 防範 |
|------|------|------|
| Sub-agent 沒 Read 程式碼 | 重複 edf-15 事故 | P 段「絕對禁止推測」+ V 段格式要求 |
| 只 Read 前端沒 Read 後端 | 誤判 contract | I 段列出 Backend Contract 必讀檔 |
| CMRD 只查同模組 | 漏跨模組合併 | O 段 cmrd_candidates 必填 |
| 回傳自然語言報告 | 中控解析失敗 | O 段嚴格 JSON schema |
| 覆蓋既有 Skill 校正 | Git 衝突 | T 段列出校正,進入 Pool 批次處理 |

---

## 延伸:Sub-agent 自我檢查清單

Sub-agent 回傳前必須自檢:

- [ ] 我 Read 了 Investigation 清單的所有檔案嗎?
- [ ] 每個結論都有 file:line 證據嗎?
- [ ] 我有用「應該」「可能」「通常」等推測語氣嗎?
- [ ] 我執行 search_stories 找 CMRD 候選了嗎?
- [ ] 我的 JSON 符合 schema 嗎?
- [ ] 我識別了 root cause category 嗎?(5 大類 16 子類)
- [ ] 我回報了 Skill corrections 了嗎?(若有)
- [ ] 我標記了 cross_module_impacts 了嗎?(若有)

只有全部 ✅ 才能回傳結果給主控端。
