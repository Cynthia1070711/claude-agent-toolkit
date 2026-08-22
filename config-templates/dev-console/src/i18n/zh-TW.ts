// ============================================================
// zh-TW.ts — 繁體中文語系（預設）
// ============================================================

const zhTW = {
  // ── Layout / Navigation ──
  nav: {
    dashboard: '儀表板',
    stories: 'Story 看板',
    sessions: '工作時間軸',
    memory: '記憶庫',
    decisions: '技術決策',
    crIssues: 'CR 議題',
    techDebt: '技術債',
    sprint: 'Sprint 進度',
    system: '系統工具',
    documents: '文檔瀏覽',
    schema: '資料庫結構',
    patterns: '學習模式',
    intentional: 'IDD 決策',
    godNodes: '核心節點',
    emergence: '湧現迴路',
    channel: '頻道',
    roadmap: '推進地圖',
  },
  header: {
    brand: 'DevConsole',
    standalone: 'Standalone',
    dbConnected: 'DB 已連線',
    dbDisconnected: 'DB 未連線',
    dbChecking: '確認中…',
    collapseSidebar: '收合側邊列',
    expandSidebar: '展開側邊列',
    langSwitch: 'EN',
  },

  // ── Dashboard ──
  dashboard: {
    title: '儀表板',
    totalStories: '總 Story 數',
    completionRate: '完成率',
    inProgress: '進行中',
    memoryRecords: '記憶庫記錄',
    dbSize: 'DB 大小',
    lastUpdated: '最後更新',
    recentActivity: '最近活動',
    loadError: '資料載入失敗',
    dbOffline: 'DB 未連線',
    conversations: '對話',
    docCount: '文檔總數',
    chunkCount: 'Chunk 數',
    embeddingModel: 'Embedding 模型',
    symbolCoverage: 'Symbol 向量覆蓋',
    // dvs-07: WFQ 視覺化
    wfqSectionTitle: 'Pipeline 運營',
    wfqTokenConsumption: 'Token 消耗',
    wfqPipelineSuccessRate: 'Pipeline 成功率',
    wfqAvgDuration: '平均耗時',
    wfqTrendTitle: 'Token 消耗趨勢（7天）',
    wfqModelTitle: '模型使用分佈',
    wfqTrendInput: 'Input',
    wfqTrendOutput: 'Output',
    wfqTrendCache: 'Cache',
    wfqNoData: '暫無 WFQ 資料',
    wfqCostHint: '成本',
    wfqRuns: '次執行',
    wfqTokenIncomplete: 'Token 數據尚未完整收集（OTel 整合待上線），數值僅供參考',
    // 統計區間（起日 ~ 迄日，預設本月全部）
    wfqRangeFrom: '起日',
    wfqRangeTo: '迄日',
    wfqRangeReset: '本月',
    /** 尚未經 SessionEnd 聚合進 DB 的即時量（主視窗進行中的 session）*/
    wfqPendingHint: '含即時未落盤',
  },

  // ── Stories / Kanban ──
  stories: {
    title: 'Story 看板',
    loading: '載入中…',
    allEpics: '全部 Epic',
    epicLabel: 'Epic:',
    viewDetail: '查看詳情',
    noStories: '—',
    errorLoad: '載入失敗',
    // DVS-07: 篩選 + 搜尋 + 排序
    searchPlaceholder: '搜尋 Story…',
    sortLabel: '排序:',
    sortDateDesc: '日期遞減',
    sortDateAsc: '日期遞增',
    sortEpicAZ: 'Epic A→Z',
    sortEpicZA: 'Epic Z→A',
    emptyToday: '今日尚無 Story 任務執行',
    emptyFiltered: '無符合篩選條件的 Story',
    rerunBadgeTitle: '此階段曾重跑（含斷電續跑 / 補全 / R2）',
    // 重跑徽章的 phase 顯示名。未列的 phase（如 Mode C 的 general）由 StoryCard 原樣 fallback。
    rerunPhase: {
      create: '建立',
      dev: '開發',
      review: '審查',
    },
    dateRange: {
      today: '今日',
      threeDays: '三天',
      thisWeek: '本週',
      thisMonth: '當月',
      all: '全部',
    },
  },

  // ── Stats Bar ──
  stats: {
    total: '總計',
    backlog: '待辦',
    ready: '待開發',
    inProgress: '開發中',
    review: '審查中',
    done: '完成',
    cancelled: '已取消',
  },

  // ── Kanban Columns ──
  kanban: {
    backlog: '待辦',
    readyForDev: '待開發',
    inProgress: '開發中',
    review: '審查中',
    done: '完成',
  },

  // ── Story Detail (page) ──
  storyDetail: {
    backToKanban: '返回看板',
    loading: '載入中…',
    fileNotFound: 'Story 檔案不存在',
    storyNotFound: '找不到此 Story',
    loadFailed: '載入失敗',
    noContent: '此 Story 尚無內容資料',
    complexity: '複雜度',
    priorityLabel: '優先級',
    statusLabel: '狀態',
    typeLabel: '類型',
    depsLabel: '依賴',
    sddSpec: 'SDD Spec',
    noComment: '(無註解)',
    updating: '更新中…',
    createdAt: '建立日期',
    startedAt: '開始日期',
    completedAt: '完成日期',
    updatedAt: '最後更新',
    phaseTimeline: '階段時間軸',
    // 區塊標題
    sectionStory: 'User Story',
    sectionBackground: '背景',
    sectionAC: 'Acceptance Criteria',
    sectionTasks: '任務清單',
    sectionDevNotes: '開發筆記',
    sectionApproach: '實作方法',
    sectionTesting: '測試策略',
    sectionSkills: '所需技能',
    sectionFiles: '相關檔案',
    sectionCR: 'Code Review 摘要',
  },

  // ── Sessions ──
  sessions: {
    title: '工作時間軸',
  },

  // ── Memory ──
  memory: {
    title: '記憶庫',
  },

  // ── Decisions ──
  decisions: {
    title: '技術決策',
  },

  // ── CR Issues ──
  crIssues: {
    title: 'CR 議題追蹤',
  },

  // ── Tech Debt ──
  techDebt: {
    title: '技術債追蹤',
  },

  // ── Sprint ──
  sprint: {
    title: 'Sprint 進度',
  },

  // ── System ──
  system: {
    title: '系統工具',
  },

  // ── Documents ──
  documents: {
    title: '文檔瀏覽',
    searchPlaceholder: '搜尋文檔內容（支援模糊比對）…',
    allCategories: '全部分類',
    noResults: '無符合的文檔',
    totalDocs: '共 {count} 份文檔',
    chunks: 'Chunks',
    tokens: 'Tokens',
    lastUpdated: '更新時間',
    backToList: '返回列表',
    loadError: '文檔載入失敗',
    searchMinChars: '請輸入至少 2 個字元',
    openInVsCode: '在 VS Code 開啟',
    searchResults: '{count} 筆搜尋結果',
    relatedDocs: '相關文檔',
    noRelatedDocs: '無相關文檔',
    // Category Group 名稱
    catRequirements: '需求功能文檔',
    catTechnical: '技術文檔',
    catAnalysis: '分析與審查',
    catKnowledge: '知識庫',
    catWorkflow: '工作流程',
    catOther: '其他',
  },

  // ── Schema Explorer ──
  schema: {
    title: '資料庫結構瀏覽',
    tables: '個資料表',
    totalRows: '筆資料',
    filterPlaceholder: '篩選資料表…',
    selectPrompt: '請選擇要瀏覽的資料表',
    columns: '欄位',
    indexes: '索引',
    data: '資料',
    colName: '欄位名稱',
    colType: '型別',
    colPk: '主鍵',
    colNotNull: '非空',
    colDefault: '預設值',
    loading: '載入中…',
    rows: '筆',
    noData: '此表尚無資料',
  },

  // ── Patterns ──
  patterns: {
    title: '持續學習',
    subtitle: 'Phase 4 模式觀察與向量更新',
    domainActivity: '領域活動',
    symbolVectors: 'Symbol 向量',
    docVectors: '文檔向量',
    pending: '等待中',
    processed: '已處理',
    observations: '模式觀察',
    colFile: '檔案',
    colDomain: '領域',
    colTool: '工具',
    colOccurrences: '次數',
    colConfidence: '信心值',
    colLastSeen: '最後出現',
    changeType: '變更類型',
    firstSeen: '首次出現',
    memoryCoverage: '記憶庫向量覆蓋',
    retrievalActivity: '檢索活動',
    hotEntries: '熱門條目',
    topKeywords: '搜尋關鍵字',
    noObservations: '尚無觀察記錄',
    showMore: '顯示更多',
    showLess: '收合(只顯示前 20)',
  },

  // ── God Nodes (td-devconsole-godnode-and-mem-dashboard) ──
  godNodes: {
    title: '核心節點 Centrality 儀表板',
    subtitle: '依 centrality_score 排序高依賴 symbol(對齊 ADR-GOVERNANCE-001)— Top List + bar 視覺化 ranking + By Namespace 統計',
    topNLabel: 'Top-N:',
    namespaceLabel: 'Namespace:',
    allNamespaces: '全部',
    includeGenerated: '包含 generated code',
    excluded: '已排除',
    distribution: '分佈統計',
    topList: '清單',
    loading: '載入中…',
    empty: '無 god node 資料(可能為新部署或 migration 未執行)',
    loadError: '載入失敗',
    copyTooltip: '複製檔案路徑',
    copied: '已複製',
    copyFailed: '複製失敗',
  },

  // ── Memory DB Dashboard charts (in /patterns sidebar) ──
  dashboardCharts: {
    dailyContextTitle: '每日 add_context 趨勢(by category)',
    dailyContextSubtitle: '過去 30 天',
    debtSeverityTitle: 'Tech Debt severity × status',
    iddSubtypesTitle: 'IDD 4 類型分佈',
    storyFunnelTitle: 'Story 狀態漏斗',
    noData: '尚無資料',
  },

  // ── Emergence (Story C evolve) ──
  emergence: {
    evolve: {
      title: '🧬 演化候選推薦',
      subtitle: '成熟 instinct 聚類可演化為新 skill/hook 的推薦清單',
      emptyState: '目前無成熟候選',
      emptyHint: '需 ≥2 同 domain approved instinct（skill）/ ≥3 且 avg conf≥0.75（agent-hook）',
      generateSkillBtn: '⚙️ 生成 Skill',
      generateHookBtn: '🔧 生成 Hook',
      hitlModalTitle: '⚠️ HITL 生成引導 — 需手動字面調用 Skill tool',
      closeBtn: '我已了解 · 關閉',
      skillCapWarn: '⚠ Skill Cap 接近上限 · 建議先 retire 1 個既有 Skill',
      skillCapBlock: '🚫 Skill Cap 已滿 · 必先 retire 1 個既有 Skill 才能新建',
    },
    pools: {
      skill:     { title: '技能池',  chip: '已生成',   emptyHint: '尚無已生成技能' },
      candidate: { title: '候選池',  chip: '候選中',   emptyHint: '目前無成熟候選' },
      observe:   { title: '觀察池',  chip: '觀察中',   emptyHint: '尚無觀察中本能' },
      rejected:  { title: '否決池',  chip: '已否決',   emptyHint: '尚無否決記錄' },
    },
    modal: {
      tabOverview:      '概覽',
      tabAdvanced:      '進階',
      sectionPurpose:   '主要用途',
      sectionStatus:    '當前狀況',
      sectionImpact:    '影響',
      sectionImprove:   '改善',
    },
    actions: {
      dislike:  '👎 扣分',
      restore:  '↩️ 還原',
      pause:    '⏸ 停用',
      delete:   '🗑 刪除',
      generate: '✨ 生成',
    },
    scoring: {
      adoption: {
        zero:  '尚未跨視窗使用',
        one:   '使用 {n} 次',
        few:   '同情境通用 {n} 次',
        many:  '全視窗通用 {n} 次',
      },
    },
  },

  // ── Common ──
  common: {
    search: '搜尋',
    filter: '篩選',
    export: '匯出',
    cancel: '取消',
    confirm: '確認',
    delete: '刪除',
    edit: '編輯',
    save: '儲存',
    close: '關閉',
    noData: '無資料',
    error: '錯誤',
    success: '成功',
  },
};

// 刻意不用 `as const`：Locale 型別只需保證兩語系 key 結構一致（翻譯完整性），
// 不該強制 en.ts 的字串值必須逐字等於 zh-TW 字面值（那樣會讓翻譯檔永遠無法通過型別檢查）。
export type Locale = typeof zhTW;
export default zhTW;
