// ============================================================
// exportApi.ts — 匯出 API URL 建構工具
// AC-3: 觸發瀏覽器下載（GET 端點自帶 Content-Disposition）
// ============================================================

export type ExportFormat = 'json' | 'csv';
export type ExportType = 'context' | 'tech';

export interface ExportOptions {
  type: ExportType;
  format: ExportFormat;
  category?: string;
}

/**
 * 建構匯出 URL，供 window.open() 或 <a> 觸發下載
 */
export function buildExportUrl(options: ExportOptions): string {
  const params = new URLSearchParams({
    type: options.type,
    format: options.format,
  });
  if (options.category) {
    params.set('category', options.category);
  }
  return `/api/memory/export?${params.toString()}`;
}
