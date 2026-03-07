import TelegramBotApi from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const token = process.env.TELEGRAM_BOT_TOKEN!;
const bot = new TelegramBotApi(token, { polling: true });

console.log('Bot 已啟動，請在 Telegram 對 @alicev2_bot 發送任意訊息...');

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from?.first_name || 'Unknown';
  console.log(`\n========================================`);
  console.log(`  你的 User ID: ${chatId}`);
  console.log(`  名稱: ${name}`);
  console.log(`========================================\n`);
  console.log('請把上面的 User ID 貼給我，然後按 Ctrl+C 關閉。');
  bot.sendMessage(chatId, `你的 User ID 是: ${chatId}`);
});
