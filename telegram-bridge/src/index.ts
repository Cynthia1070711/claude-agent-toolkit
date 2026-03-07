// ============================================================
// Claude Telegram Bridge v2.0 — 進入點
// ============================================================

import dotenv from 'dotenv';
import path from 'path';
import type { AppConfig } from './types';
import { ClaudeManager } from './claude-manager';
import { SessionStore } from './session-store';
import { TelegramBot } from './telegram-bot';

// 載入環境變數
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main(): Promise<void> {
  console.log('========================================');
  console.log(' Claude Telegram Bridge v2.0');
  console.log(' Stream-JSON 持久進程模式');
  console.log('========================================');

  // --- Pre-flight 檢查 ---

  // 1. 殭屍進程清理
  console.log('[Pre-flight] 清理殘留進程...');
  const killed = ClaudeManager.cleanupZombies();
  if (killed > 0) {
    console.log(`[Pre-flight] 已清理 ${killed} 個殘留進程`);
  } else {
    console.log('[Pre-flight] 無殘留進程');
  }

  // 2. 環境變數驗證
  const config = loadConfig();
  console.log(`[Pre-flight] Bot Token: ...${config.telegramBotToken.slice(-6)}`);
  console.log(`[Pre-flight] 允許使用者: ${config.allowedUserIds.join(', ')}`);
  console.log(`[Pre-flight] 預設目錄: ${config.defaultWorkingDir}`);
  console.log(`[Pre-flight] 預設模型: ${config.defaultModel}`);

  // 3. 資料庫初始化
  const store = new SessionStore();
  console.log('[Pre-flight] 資料庫就緒');

  // 4. 啟動 Telegram Bot
  const bot = new TelegramBot(config, store);
  bot.start();

  // 5. 優雅關閉
  const shutdown = (signal: string) => {
    console.log(`\n[Bridge] 收到 ${signal}，正在關閉...`);
    bot.stop();
    console.log('[Bridge] 已關閉。');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Windows Ctrl+C 額外處理
  if (process.platform === 'win32') {
    process.on('SIGHUP', () => shutdown('SIGHUP'));
  }

  console.log('[Bridge] 所有系統就緒，等待 Telegram 訊息...');
}

function loadConfig(): AppConfig {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('❌ 缺少環境變數 TELEGRAM_BOT_TOKEN');
    console.error('   請複製 .env.example 為 .env 並填入 Bot Token');
    process.exit(1);
  }

  const userIds = process.env.ALLOWED_USER_IDS;
  if (!userIds) {
    console.error('❌ 缺少環境變數 ALLOWED_USER_IDS');
    process.exit(1);
  }

  return {
    telegramBotToken: token,
    allowedUserIds: userIds.split(',').map((id) => parseInt(id.trim(), 10)),
    defaultWorkingDir: process.env.DEFAULT_WORKING_DIR || process.cwd(),
    defaultModel: process.env.DEFAULT_MODEL || 'sonnet',
  };
}

main().catch((err) => {
  console.error('❌ 啟動失敗:', err);
  process.exit(1);
});
