# Cross-Module Relevance Detection (CMRD) Algorithm

## 目的

每次使用者回饋新問題時,**在建立新 Story 之前**,必須查所有 active Stories 找跨模組相關性,避免碎片化與重複修復。

## 核心洞見

edf-13 事故教訓:同一個根因(mm/px 單位污染)在 useProjectLoader / useSaveProject / ProjectsController 三處串聯,但 Story 拆成獨立問題就會錯失統一修復機會。CMRD 正是為了**主動識別跨模組同根因**。

## 5 維度評分演算法

```python
def cmrd_score(new_issue, story):
    score = 0
    
    # 維度 1: 同檔案 (+50, 最強信號)
    if any(f in story.affected_files for f in new_issue.affected_files):
        score += 50
    
    # 維度 2: 同 BR-XXX 規則 (+25)
    if any(br in story.br_refs for br in new_issue.br_refs):
        score += 25
    
    # 維度 3: 同根因類別 (+30)
    if new_issue.root_cause_category == story.primary_root_cause:
        score += 30
    
    # 維度 4: 相似症狀模式 (+20)
    if new_issue.symptom_pattern in story.symptom_patterns:
        score += 20
    
    # 維度 5: 相似修復模式 (+20)
    if new_issue.fix_pattern in story.fix_patterns:
        score += 20
    
    # 輔助信號
    if new_issue.module_family == story.module_family:  # 同元件家族(*Panel)
        score += 10
    
    if set(new_issue.affected_plans) & set(story.affected_plans):
        score += 5
    
    return score
```

## 決策閾值

| Score 區間 | 動作 | 主控端決策 |
|:---------:|------|-----------|
| **≥ 50** | 自動合併到該 Story | 無需人工介入,直接 upsert AC |
| **25-49** | 建議合併 | 主控端審查 sub-agent 建議,決定是否合併 |
| **< 25** | 建立新 Story | 無相關性,獨立處理 |

## Sub-agent 必須執行的查詢

```javascript
// 每次分析時,sub-agent 必須執行以下查詢
const queries = await Promise.all([
  // 維度 1: 同檔案
  search_stories({
    query: new_issue.affected_file_basename,
    epic_id: 'epic-eft',
    status: 'in-progress',
    fields: 'story_id,title,acceptance_criteria'
  }),
  
  // 維度 2: 同 BR
  search_stories({
    query: new_issue.br_id,
    epic_id: 'epic-eft',
    status: 'in-progress'
  }),
  
  // 維度 3: 同根因類別
  search_stories({
    query: new_issue.root_cause_category_keyword,
    epic_id: 'epic-eft',
    status: 'in-progress'
  }),
  
  // 維度 4+5: 相似症狀/修復
  search_context({
    query: new_issue.symptom_description,
    filters: { category: 'eft-pattern' }
  })
]);

// 合併查詢結果並去重
const candidate_stories = unique_by_story_id(queries);

// 對每個候選 Story 計算 CMRD score
const scored = candidate_stories.map(story => ({
  story,
  score: cmrd_score(new_issue, story)
}));

// 排序取最高分
scored.sort((a, b) => b.score - a.score);
const best = scored[0];

return {
  candidates: scored,
  recommendation: 
    best?.score >= 50 ? { action: 'auto_merge', target: best.story.story_id } :
    best?.score >= 25 ? { action: 'suggest_merge', target: best.story.story_id } :
    { action: 'new_story', target: null }
};
```

## 實際範例

### 範例 1: 強信號(自動合併,score=95)

```
新問題:
  模組: ImagePanel
  檔案: src/components/Editor/ImagePanel.tsx:142
  症狀: 上傳 11MB 圖片後 silent fail,無 toast
  BR: BR-IMG-01
  根因類別: B1 (SaaS Quota Messaging)
  Plans: [A1 Free]

既有 Story:
  id: eft-saas-quota-toast-missing
  檔案: [useDataSourceValidation.ts:67, ImagePanel.tsx:142]
  BR: [BR-DATA-02, BR-IMG-01]
  根因類別: B1
  Plans: [A1 Free, A2 Basic]
  AC-1: DataSourcePanel Excel 51 列 silent 截斷

CMRD 計算:
  +50 (同檔案 ImagePanel.tsx)
  +25 (同 BR-IMG-01)
  +30 (同 B1 類別)
  +20 (相似症狀「silent fail 無 toast」)
  +20 (相似修復「呼叫 UpgradeModal」)
  +5  (Plan 重疊 A1)
  = 150 (capped at 100)

決策: 自動合併 → 新增 AC-2 到 eft-saas-quota-toast-missing
```

### 範例 2: 中等信號(建議合併,score=40)

```
新問題:
  模組: BatchImagePanel
  檔案: src/components/Editor/BatchImagePanel.tsx:220
  症狀: 批次上傳無 progress bar
  BR: BR-BATCH-01
  根因類別: B5 (SaaS Loading Transparency)
  Plans: [A1, A2, A3, A4, A5]

既有 Story:
  id: eft-saas-loading-transparency
  檔案: [DataSourcePanel.tsx:89, ExcelWorker.ts:134]
  BR: [BR-DATA-01]
  根因類別: B5
  Plans: [A1, A2]
  AC-1: Excel 大檔案上傳無進度回饋

CMRD 計算:
  +0  (不同檔案)
  +0  (不同 BR)
  +30 (同 B5 類別)
  +20 (相似症狀「無 progress feedback」)
  +20 (相似修復「useSignalRProgress Hook 推播」)
  +10 (同元件家族 *Panel)
  +5  (Plan 重疊 A1/A2)
  = 85 → **建議合併**

決策: 提交給主控端審查,推薦合併理由:
  "兩個問題根因都是 SaaS Loading Transparency 缺失,
   修復模式相同(引入 Progress Hook),
   可一次修兩個模組,節省 token"
```

### 範例 3: 弱信號(建新 Story,score=15)

```
新問題:
  模組: PageSettingsPanel
  檔案: src/components/Editor/PageSettingsPanel.tsx:45
  症狀: mm/px 單位顯示錯亂
  BR: BR-LAYOUT-01
  根因類別: A4 (Bug Boundary Contract)
  Plans: [A1, A2, A3, A4, A5]

既有 Story:
  id: eft-saas-quota-toast-missing
  檔案: [ImagePanel.tsx:142, useDataSourceValidation.ts:67]
  BR: [BR-IMG-01, BR-DATA-02]
  根因類別: B1
  Plans: [A1, A2]

CMRD 計算:
  +0  (不同檔案)
  +0  (不同 BR)
  +0  (不同類別 A4 vs B1)
  +0  (症狀不相似)
  +0  (修復不相似)
  +10 (同家族 *Panel)
  +5  (Plan 重疊 A1/A2)
  = 15 → **建新 Story**

決策: 建立新 Story eft-bug-dimensions-unit-drift
```

## 合併進入 Story 的 Amendment 格式

```markdown
## Amendment #{N} (2026-04-XX HH:mm)

- **Source**: 測試 {module} / Plan {plan} / Operation {op}
- **Triggering feedback**: "{Alan 原話}"
- **Sub-agent analysis**: {file_path}:{line_range}
- **CMRD score**: {score} (dimensions: {breakdown})
- **Merged reason**: {"同檔案+同 BR+同類別" or 其他 score 解釋}
- **Impact**: 擴大 affected_modules 集合 / 擴大 affected_plans 集合
- **New AC added**: AC-{N} (見下方 acceptance_criteria 區塊)
- **Skill drift detected**: {yes/no, 若 yes 列出 skill + section}
```

## 演算法邊界情境

### 情境 1: 多個候選 Stories score 相近

```
決策順序:
  1. 優先合併到 affected_modules 較多的 Story(累積根因更明確)
  2. 其次優先合併到 ac_count 較少的 Story(避免 Story 過肥)
  3. 最後看建立時間,優先合併到較早建立的 Story
```

### 情境 2: Story 已達 AC 上限 (15)

```
即使 CMRD score ≥ 50,也不合併
改為: 建立 cross-ref 新 Story
  新 Story 命名: eft-{category}-{slug}-part2
  設定 related_stories: [原 Story ID]
```

### 情境 3: 涉及多個根因類別

```
Sub-agent 必須回傳 root_cause_category 的主要類別(primary)
合併判定只看 primary,不看 secondary
避免一個 Story 混入多個根因造成後續修復困難
```

## 禁止的做法

- ❌ 只查同模組的 Stories(必須跨模組查所有 active)
- ❌ 只看檔案名稱不看行號(file:line 定位才精確)
- ❌ 手動估計 score(必須逐維度計算)
- ❌ CMRD score < 25 還強制合併(會造成 Story 碎片化)
- ❌ 合併時不記錄 Amendment(失去追溯性)

## 延伸閱讀

- `story-merge-rules.md`(未來章節,Story 8 條合併規則)
- `sds-refinement-gate.md`(SDS 公式與 Phase 3.5 拆分)
- `root-cause-taxonomy.md`(5 大類 16 子類)
