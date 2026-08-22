// ============================================================
// en.ts — English locale
// ============================================================
import type { Locale } from './zh-TW';

const en: Locale = {
  // ── Layout / Navigation ──
  nav: {
    dashboard: 'Dashboard',
    stories: 'Stories',
    sessions: 'Sessions',
    memory: 'Memory',
    decisions: 'Decisions',
    crIssues: 'CR Issues',
    techDebt: 'Tech Debt',
    sprint: 'Sprint',
    system: 'System',
    documents: 'Documents',
    schema: 'Schema Explorer',
    patterns: 'Patterns',
    intentional: 'Intentional Decisions',
    godNodes: 'God Nodes',
    emergence: 'Emergence',
    channel: 'Channel',
    roadmap: 'Roadmap',
  },
  header: {
    brand: 'DevConsole',
    standalone: 'Standalone',
    dbConnected: 'DB Connected',
    dbDisconnected: 'DB Disconnected',
    dbChecking: 'Checking…',
    collapseSidebar: 'Collapse sidebar',
    expandSidebar: 'Expand sidebar',
    langSwitch: '中',
  },

  // ── Dashboard ──
  dashboard: {
    title: 'Dashboard',
    totalStories: 'Total Stories',
    completionRate: 'Completion Rate',
    inProgress: 'In Progress',
    memoryRecords: 'Memory Records',
    dbSize: 'DB Size',
    lastUpdated: 'Last Updated',
    recentActivity: 'Recent Activity',
    loadError: 'Failed to load data',
    dbOffline: 'DB Offline',
    conversations: 'Conversations',
    docCount: 'Documents',
    chunkCount: 'Chunks',
    embeddingModel: 'Embedding Model',
    symbolCoverage: 'Symbol Coverage',
    // dvs-07: WFQ visualization
    wfqSectionTitle: 'Pipeline Operations',
    wfqTokenConsumption: 'Token Consumption',
    wfqPipelineSuccessRate: 'Pipeline Success Rate',
    wfqAvgDuration: 'Avg Duration',
    wfqTrendTitle: 'Token Trend (7 Days)',
    wfqModelTitle: 'Model Distribution',
    wfqTrendInput: 'Input',
    wfqTrendOutput: 'Output',
    wfqTrendCache: 'Cache',
    wfqNoData: 'No WFQ data available',
    wfqCostHint: 'Cost',
    wfqRuns: 'runs',
    wfqTokenIncomplete: 'Token data not fully collected (OTel integration pending). Values are approximate.',
    // Date range filter (defaults to the whole current month)
    wfqRangeFrom: 'From',
    wfqRangeTo: 'To',
    wfqRangeReset: 'This month',
    /** Live tokens not yet flushed to DB by the SessionEnd hook */
    wfqPendingHint: 'incl. live',
  },

  // ── Stories / Kanban ──
  stories: {
    title: 'Story Kanban',
    loading: 'Loading…',
    allEpics: 'All Epics',
    epicLabel: 'Epic:',
    viewDetail: 'View Detail',
    noStories: '—',
    errorLoad: 'Load failed',
    // DVS-07: Filter + Search + Sort
    searchPlaceholder: 'Search stories…',
    sortLabel: 'Sort:',
    sortDateDesc: 'Date DESC',
    sortDateAsc: 'Date ASC',
    sortEpicAZ: 'Epic A→Z',
    sortEpicZA: 'Epic Z→A',
    emptyToday: 'No stories executed today',
    emptyFiltered: 'No stories match the current filters',
    rerunBadgeTitle: 'This phase was re-run',
    rerunPhase: {
      create: 'create',
      dev: 'dev',
      review: 'review',
    },
    dateRange: {
      today: 'Today',
      threeDays: '3 Days',
      thisWeek: 'This Week',
      thisMonth: 'This Month',
      all: 'All',
    },
  },

  // ── Stats Bar ──
  stats: {
    total: 'Total',
    backlog: 'Backlog',
    ready: 'Ready',
    inProgress: 'In Progress',
    review: 'Review',
    done: 'Done',
    cancelled: 'Cancelled',
  },

  // ── Kanban Columns ──
  kanban: {
    backlog: 'Backlog',
    readyForDev: 'Ready',
    inProgress: 'In Progress',
    review: 'Review',
    done: 'Done',
  },

  // ── Story Detail (page) ──
  storyDetail: {
    backToKanban: 'Back to Kanban',
    loading: 'Loading…',
    fileNotFound: 'Story file not found',
    storyNotFound: 'Story not found',
    loadFailed: 'Load failed',
    noContent: 'No content data for this Story',
    complexity: 'Complexity',
    priorityLabel: 'Priority',
    statusLabel: 'Status',
    typeLabel: 'Type',
    depsLabel: 'Dependencies',
    sddSpec: 'SDD Spec',
    noComment: '(no comment)',
    updating: 'Updating…',
    createdAt: 'Created',
    startedAt: 'Started',
    completedAt: 'Completed',
    updatedAt: 'Last Updated',
    phaseTimeline: 'Phase Timeline',
    sectionStory: 'User Story',
    sectionBackground: 'Background',
    sectionAC: 'Acceptance Criteria',
    sectionTasks: 'Tasks',
    sectionDevNotes: 'Dev Notes',
    sectionApproach: 'Implementation Approach',
    sectionTesting: 'Testing Strategy',
    sectionSkills: 'Required Skills',
    sectionFiles: 'Files',
    sectionCR: 'CR Summary',
  },

  // ── Sessions ──
  sessions: {
    title: 'Sessions Timeline',
  },

  // ── Memory ──
  memory: {
    title: 'Memory',
  },

  // ── Decisions ──
  decisions: {
    title: 'Technical Decisions',
  },

  // ── CR Issues ──
  crIssues: {
    title: 'CR Issues Tracker',
  },

  // ── Tech Debt ──
  techDebt: {
    title: 'Tech Debt Tracker',
  },

  // ── Sprint ──
  sprint: {
    title: 'Sprint Progress',
  },

  // ── System ──
  system: {
    title: 'System Tools',
  },

  // ── Documents ──
  documents: {
    title: 'Documents',
    searchPlaceholder: 'Search documents (fuzzy match)…',
    allCategories: 'All Categories',
    noResults: 'No matching documents',
    totalDocs: '{count} documents total',
    chunks: 'Chunks',
    tokens: 'Tokens',
    lastUpdated: 'Updated',
    backToList: 'Back to list',
    loadError: 'Failed to load documents',
    searchMinChars: 'Enter at least 2 characters',
    openInVsCode: 'Open in VS Code',
    searchResults: '{count} results',
    relatedDocs: 'Related Documents',
    noRelatedDocs: 'No related documents',
    catRequirements: 'Requirements',
    catTechnical: 'Technical',
    catAnalysis: 'Analysis & Review',
    catKnowledge: 'Knowledge Base',
    catWorkflow: 'Workflows',
    catOther: 'Other',
  },

  // ── Schema Explorer ──
  schema: {
    title: 'Schema Explorer',
    tables: 'tables',
    totalRows: 'total rows',
    filterPlaceholder: 'Filter tables...',
    selectPrompt: 'Select a table to explore',
    columns: 'Columns',
    indexes: 'Indexes',
    data: 'Data',
    colName: 'Name',
    colType: 'Type',
    colPk: 'PK',
    colNotNull: 'Not Null',
    colDefault: 'Default',
    loading: 'Loading...',
    rows: 'rows',
    noData: 'No data in this table',
  },

  // ── Patterns ──
  patterns: {
    title: 'Continuous Learning',
    subtitle: 'Phase 4 pattern observations and vector updates',
    domainActivity: 'Domain Activity',
    symbolVectors: 'Symbol Vectors',
    docVectors: 'Doc Vectors',
    pending: 'Pending',
    processed: 'Processed',
    observations: 'Pattern Observations',
    colFile: 'File',
    colDomain: 'Domain',
    colTool: 'Tool',
    colOccurrences: 'Occurrences',
    colConfidence: 'Confidence',
    colLastSeen: 'Last Seen',
    changeType: 'Change Type',
    firstSeen: 'First Seen',
    memoryCoverage: 'Memory Vector Coverage',
    retrievalActivity: 'Retrieval Activity',
    hotEntries: 'Hot Entries',
    topKeywords: 'Search Keywords',
    noObservations: 'No observations yet',
    showMore: 'Show more',
    showLess: 'Collapse (show first 20)',
  },

  // ── God Nodes (td-devconsole-godnode-and-mem-dashboard) ──
  godNodes: {
    title: 'God Nodes Centrality Dashboard',
    subtitle: 'High-centrality symbol ranking (per ADR-GOVERNANCE-001) — Top List with bars + By Namespace breakdown',
    topNLabel: 'Top-N:',
    namespaceLabel: 'Namespace:',
    allNamespaces: 'All',
    includeGenerated: 'Include generated code',
    excluded: 'Excluded',
    distribution: 'Distribution',
    topList: 'Top List',
    loading: 'Loading…',
    empty: 'No god node data (possibly new deployment or migration not run)',
    loadError: 'Load failed',
    copyTooltip: 'Copy file path',
    copied: 'Copied',
    copyFailed: 'Copy failed',
  },

  // ── Memory DB Dashboard charts (in /patterns sidebar) ──
  dashboardCharts: {
    dailyContextTitle: 'Daily add_context trend (by category)',
    dailyContextSubtitle: 'Last 30 days',
    debtSeverityTitle: 'Tech Debt severity × status',
    iddSubtypesTitle: 'IDD 4 sub-types',
    storyFunnelTitle: 'Story status funnel',
    noData: 'No data',
  },

  // ── Emergence (ecc-emergence-ui-v2 4-pool architecture) ──
  emergence: {
    evolve: {
      title: '🧬 Evolution Candidates',
      subtitle: 'Mature instinct clusters eligible for skill/hook evolution',
      emptyState: 'No mature candidates yet',
      emptyHint: 'Requires ≥2 same-domain approved instincts (skill) / ≥3 with avg conf≥0.75 (agent-hook)',
      generateSkillBtn: '⚙️ Generate Skill',
      generateHookBtn: '🔧 Generate Hook',
      hitlModalTitle: '⚠️ HITL Generation Guide — Manual Skill tool invocation required',
      closeBtn: 'Understood · Close',
      skillCapWarn: '⚠ Skill Cap approaching limit · Consider retiring 1 skill first',
      skillCapBlock: '🚫 Skill Cap full · Must retire 1 skill before creating a new one',
    },
    pools: {
      skill:     { title: 'Skill Pool',    chip: 'Generated',   emptyHint: 'No generated skills yet' },
      candidate: { title: 'Candidate Pool', chip: 'Candidate',   emptyHint: 'No mature candidates yet' },
      observe:   { title: 'Observe Pool',  chip: 'Observing',   emptyHint: 'No instincts under observation' },
      rejected:  { title: 'Rejected Pool', chip: 'Rejected',    emptyHint: 'No rejected records' },
    },
    modal: {
      tabOverview:      'Overview',
      tabAdvanced:      'Advanced',
      sectionPurpose:   'Purpose',
      sectionStatus:    'Current Status',
      sectionImpact:    'Impact',
      sectionImprove:   'Improvement',
    },
    actions: {
      dislike:  '👎 Downvote',
      restore:  '↩️ Restore',
      pause:    '⏸ Pause',
      delete:   '🗑 Delete',
      generate: '✨ Generate',
    },
    scoring: {
      adoption: {
        zero:  'Not yet used cross-session',
        one:   'Used {n} time(s)',
        few:   'Used {n} times in same context',
        many:  'Used {n} times globally',
      },
    },
  },

  // ── Common ──
  common: {
    search: 'Search',
    filter: 'Filter',
    export: 'Export',
    cancel: 'Cancel',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    save: 'Save',
    close: 'Close',
    noData: 'No data',
    error: 'Error',
    success: 'Success',
  },
};

export default en;
