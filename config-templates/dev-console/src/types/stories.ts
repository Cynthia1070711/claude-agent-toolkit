// ============================================================
// stories.ts — Story API 型別定義
// DVS-03
// ============================================================

export interface StoryMetadata {
  complexity: string | null;
  priority: string | null;
  crScore: number | null;
  testCount: number | null;
  devAgent: string | null;
  reviewAgent: string | null;
  createdAgent: string | null;
  lastUpdated: string | null;
  comment: string;
  rerun: Record<string, number> | null;
}

export interface Story {
  id: string;
  key: string;
  epicId: string;
  title: string;
  status: string;
  isEpic: boolean;
  metadata: StoryMetadata;
}

export interface StoryStats {
  total: number;
  backlog: number;
  readyForDev: number;
  inProgress: number;
  review: number;
  done: number;
  cancelled: number;
  other: number;
}

export interface EpicSummary {
  epicId: string;
  storyCount: number;
  epicStatus: string;
}

export const KANBAN_COLUMNS = [
  { key: 'backlog', label: 'Backlog', statusClass: 'stat-backlog' },
  { key: 'ready-for-dev', label: 'Ready', statusClass: 'stat-ready' },
  { key: 'in-progress', label: 'In Progress', statusClass: 'stat-dev' },
  { key: 'review', label: 'Review', statusClass: 'stat-review' },
  { key: 'done', label: 'Done', statusClass: 'stat-done' },
] as const;

export const CANCELLED_STATUSES = new Set([
  'cancelled',
  'cancelled-merged',
  'superseded',
  'split',
]);

export const VALID_PATCH_STATUSES = [
  'backlog',
  'ready-for-dev',
  'in-progress',
  'review',
  'done',
] as const;

// ── Story 詳情（DVS-06 AC-5~6）──────────────────────────────
export interface StoryDetail {
  story_id: string;
  epic_id: string | null;
  title: string;
  status: string | null;
  priority: string | null;
  complexity: string | null;
  source_file: string | null;
}

export interface StoryContentResponse {
  content: string | null;
  error?: string;
  story: StoryDetail | null;
}

/** DVS-07: 結構化 Story 詳情（DB-first 卡片渲染）*/
export interface StructuredStoryDetail {
  story_id: string;
  epic_id: string | null;
  title: string;
  status: string | null;
  priority: string | null;
  complexity: string | null;
  story_type: string | null;
  tags: string | null;
  sdd_spec: string | null;
  dependencies: string | null;
  discovery_source: string | null;
  created_at: string | null;
  updated_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  create_started_at: string | null;
  create_completed_at: string | null;
  review_started_at: string | null;
  review_completed_at: string | null;
  dev_agent: string | null;
  review_agent: string | null;
  create_agent: string | null;
  cr_score: number | null;
  test_count: number | null;
  cr_issues_total: number | null;
  cr_issues_fixed: number | null;
  cr_issues_deferred: number | null;
  cr_summary: string | null;
  user_story: string | null;
  background: string | null;
  acceptance_criteria: string | null;
  tasks: string | null;
  dev_notes: string | null;
  required_skills: string | null;
  implementation_approach: string | null;
  testing_strategy: string | null;
  file_list: string | null;
  affected_files: string | null;
  pipeline_notes: string | null;
  source_type: 'db' | 'file' | 'hybrid';
  markdown_content: string | null;
  section_sources: Record<string, 'db' | 'md' | 'empty'>;
  report_content: string | null;
  report_path: string | null;
}
