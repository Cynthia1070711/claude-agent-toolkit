// ============================================================
// schemaApi.ts — Schema Explorer API fetch wrapper
// Phase 4+5: DB Schema 瀏覽端點
// ============================================================
import { apiFetch } from './apiClient.js';

export interface TableInfo {
  name: string;
  row_count: number;
  column_count: number;
}

export interface TableDetail {
  name: string;
  columns: { cid: number; name: string; type: string; notnull: number; dflt_value: string | null; pk: number }[];
  indexes: { seq: number; name: string; unique: number; origin: string; partial: number }[];
  row_count: number;
}

export interface TableRows {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchTables(): Promise<TableInfo[]> {
  return apiFetch<TableInfo[]>('/schema/tables');
}

export async function fetchTableDetail(name: string): Promise<TableDetail> {
  return apiFetch<TableDetail>(`/schema/tables/${encodeURIComponent(name)}`);
}

export async function fetchTableRows(name: string, page = 1, pageSize = 20): Promise<TableRows> {
  return apiFetch<TableRows>(`/schema/tables/${encodeURIComponent(name)}/rows?page=${page}&pageSize=${pageSize}`);
}
