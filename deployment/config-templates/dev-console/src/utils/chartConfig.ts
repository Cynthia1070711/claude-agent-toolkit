// ============================================================
// chartConfig.ts — Chart.js 全域深色主題配置
// DVS-05: Dashboard + Sprint 圖表
// 注意：僅引入用到的模組（Tree-shaking），禁止 import 'chart.js/auto'
// ============================================================
import {
  Chart,
  ArcElement,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';

// 按需註冊（Tree-shaking）— dvs-07 新增 LineElement/PointElement/Filler 供折線圖使用
Chart.register(ArcElement, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Filler, Tooltip, Legend);

// 深色主題全域設定（對應 --dvc-text-secondary = #94a3b8）
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = '#334155'; // --dvc-border
Chart.defaults.font.family = "'Inter', system-ui, -apple-system, sans-serif";

export { Chart };

// Story 狀態配色（對應 AC-5）
export const STATUS_COLORS: Record<string, string> = {
  done: '#22c55e',           // --dvc-status-ok (green)
  'in-progress': '#f59e0b',  // --dvc-status-warning (amber)
  review: '#8b5cf6',         // purple
  'ready-for-dev': '#6366f1', // --dvc-accent (indigo)
  backlog: '#475569',         // --dvc-slate-600
  cancelled: '#334155',       // --dvc-slate-700
};

// 複雜度配色（Indigo 漸變，對應 AC-7）
export const COMPLEXITY_COLORS: Record<string, string> = {
  XS: '#818cf8',     // indigo-400
  S: '#6366f1',      // indigo-500
  M: '#4f46e5',      // indigo-600
  L: '#4338ca',      // indigo-700
  XL: '#3730a3',     // indigo-800
  untagged: '#475569', // slate-600
};
