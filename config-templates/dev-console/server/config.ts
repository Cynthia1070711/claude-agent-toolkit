// ============================================================
// DevConsole Server Config — 環境變數讀取 + 預設值
// ============================================================
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// tools/dev-console/ 的根目錄（server/config.ts 往上一層）
const PROJECT_BASE = path.resolve(__dirname, '..');

export const config = {
  port: parseInt(process.env['PORT'] ?? '3001', 10),

  // DB 路徑：環境變數優先 → fallback 至 ../../.context-db/phycool.db
  dbPath: process.env['MEMORY_DB_PATH']
    ? path.resolve(process.env['MEMORY_DB_PATH'])
    : path.resolve(PROJECT_BASE, '../../.context-db/phycool.db'),

  // PhyCool 專案根目錄（供 .context-db 腳本路徑組裝 / Story source_file 解析等用途）
  projectRoot: process.env['PROJECT_ROOT']
    ? path.resolve(process.env['PROJECT_ROOT'])
    : path.resolve(PROJECT_BASE, '../..'),

  // Vite dev server URL（CORS 允許來源）
  allowedOrigin: 'http://localhost:5174',

  // USD → TWD 換算率，供 Dashboard Token 成本顯示 NT 金額。
  // 手動維護（非即時牌告）— 需調整時改 .env 的 USD_TO_TWD 或此預設值。
  // 設為 0 表示不換算，前端只顯示 USD。
  usdToTwd: Number(process.env['USD_TO_TWD'] ?? 32.5) || 0,
} as const;
