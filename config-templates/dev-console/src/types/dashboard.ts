// ============================================================
// dashboard.ts — Dashboard API 型別定義
// DVS-05: Dashboard 總覽頁
// ============================================================
import type { StoryStats } from './stories';

export interface MemoryStats {
  contextEntries: number;
  techEntries: number;
  stories: number;
  conversations: number;
  dbSizeBytes: number;
  lastModified: string | null;
}

export interface ActivityItem {
  id: number;
  timestamp: string;
  title: string;
  content: string;
  category: string;
}

export interface EmbeddingStats {
  symbolEmbeddings: number;
  symbolIndex: number;
  documentEmbeddings: number;
  documentChunks: number;
  docIndex: number;
  modelName: string;
  dimensions: number;
  totalTextBytes: number;
  avgChunkLen: number;
  maxChunkLen: number;
  categoryCounts: { category: string; count: number }[];
}

export interface DashboardData {
  storyStats: StoryStats;
  memoryStats: MemoryStats | null;
  recentActivity: ActivityItem[];
  embeddingStats: EmbeddingStats | null;
}

export interface KpiItem {
  icon: string;
  label: string;
  value: string | number;
  subtitle?: string;
}
