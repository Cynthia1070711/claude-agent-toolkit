// ============================================================
// memory.ts — Memory DB 前端型別定義
// AC-6/7: 搜尋、瀏覽、CRUD 相關介面
// ============================================================

export interface ContextEntry {
  id: number;
  session_id: string | null;
  agent_id: string;
  timestamp: string;
  category: string;
  tags: string | null;
  title: string;
  content: string;
  related_files: string | null;
  story_id: string | null;
  epic_id: string | null;
}

export interface TechEntry {
  id: number;
  created_by: string;
  created_at: string;
  updated_at: string | null;
  category: string;
  tech_stack: string | null;
  tags: string | null;
  title: string;
  problem: string | null;
  solution: string | null;
  outcome: string;
  lessons: string | null;
  code_snippets: string | null;
  related_files: string | null;
  references: string | null;
  confidence: number;
}

export type MemoryEntry = ContextEntry | TechEntry;
export type MemoryType = 'context' | 'tech';

export interface SearchResult<T> {
  items: T[];
  total: number;
}

export interface BrowseResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MemoryStats {
  contextEntries: number;
  techEntries: number;
  stories: number;
  conversations: number;
  dbSizeBytes: number;
  lastModified: string | null;
}

export interface CrudResponse {
  success: boolean;
  id?: number;
}

// ── Category 常數定義 ─────────────────────────────────────────

export const CONTEXT_CATEGORIES = [
  'decision',
  'pattern',
  'debug',
  'lesson',
  'warning',
  'session',
  'general',
] as const;

export type ContextCategory = (typeof CONTEXT_CATEGORIES)[number];

export const TECH_CATEGORIES = [
  'test_pattern',
  'mock_strategy',
  'bdd_scenario',
  'architecture',
  'performance',
  'security',
  'general',
] as const;

export type TechCategory = (typeof TECH_CATEGORIES)[number];
