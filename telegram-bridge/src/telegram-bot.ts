// ============================================================
// Telegram Bot — UI 層（指令路由 + 輸出格式化）
// ============================================================

import TelegramBotApi from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import https from 'https';
import type { AppConfig, ClaudeOutput, Session, TokenUsage } from './types';
import { ClaudeManager } from './claude-manager';
import { SessionStore } from './session-store';

export class TelegramBot {
  private bot: TelegramBotApi;
  private config: AppConfig;
  private store: SessionStore;
  private claude: ClaudeManager;
  private typingIntervals: Map<number, NodeJS.Timeout> = new Map();
  private outputBuffers: Map<number, { text: string; timer: NodeJS.Timeout | null }> = new Map();
  private responseStartTimes: Map<string, number> = new Map();

  constructor(config: AppConfig, store: SessionStore) {
    this.config = config;
    this.store = store;
    this.claude = new ClaudeManager();
    this.bot = new TelegramBotApi(config.telegramBotToken, { polling: true });

    this.setupCommands();
    this.setupMessageHandler();
    this.setupClaudeEvents();
  }

  /** 啟動 Bot */
  start(): void {
    console.log('[TelegramBot] Bot 已啟動，等待訊息...');
  }

  /** 停止 Bot */
  stop(): void {
    this.bot.stopPolling();
    this.claude.cleanup();
    // 清理所有 typing interval
    for (const interval of this.typingIntervals.values()) {
      clearInterval(interval);
    }
    this.typingIntervals.clear();
    // 清理所有輸出緩衝 timer
    for (const buf of this.outputBuffers.values()) {
      if (buf.timer) clearTimeout(buf.timer);
    }
    this.outputBuffers.clear();
    this.store.close();
  }

  /** 取得 ClaudeManager 實例（供 index.ts 使用） */
  getClaudeManager(): ClaudeManager {
    return this.claude;
  }

  // --- 指令設定 ---

  private setupCommands(): void {
    this.bot.onText(/\/new(.*)/, (msg, match) => this.handleNew(msg, match?.[1]?.trim()));
    this.bot.onText(/\/stop/, (msg) => this.handleStop(msg));
    this.bot.onText(/\/clear/, (msg) => this.handleClear(msg));
    this.bot.onText(/\/status/, (msg) => this.handleStatus(msg));
    this.bot.onText(/\/model\s+(\w+)/, (msg, match) => this.handleModel(msg, match?.[1]));
    this.bot.onText(/\/cd\s+(.+)/, (msg, match) => this.handleCd(msg, match?.[1]?.trim()));
    this.bot.onText(/\/bookmark(.*)/, (msg, match) => this.handleBookmark(msg, match?.[1]?.trim()));
    this.bot.onText(/\/resume/, (msg) => this.handleResume(msg));
    this.bot.onText(/\/help/, (msg) => this.handleHelp(msg));
  }

  // --- 訊息處理 ---

  private setupMessageHandler(): void {
    this.bot.on('message', async (msg) => {
      // 忽略指令（已由 onText 處理）
      if (msg.text?.startsWith('/')) return;

      // 授權檢查
      if (!this.isAuthorized(msg.chat.id)) {
        await this.bot.sendMessage(msg.chat.id, '未授權的使用者。');
        return;
      }

      // 檔案上傳處理
      if (msg.document || msg.photo) {
        await this.handleFileUpload(msg);
        return;
      }

      // 一般文字訊息
      if (msg.text) {
        await this.handleTextMessage(msg.chat.id, msg.text);
      }
    });
  }

  private async handleTextMessage(chatId: number, text: string): Promise<void> {
    const session = this.getOrCreateSession(chatId);

    if (!this.claude.isRunning) {
      // 進程未運行 → 啟動 + 等待就緒 + 送入訊息
      await this.bot.sendMessage(chatId, '啟動 Claude 中...');
      this.claude.startSession(session);
      this.claude.once('ready', () => {
        this.startTypingHeartbeat(chatId);
        this.responseStartTimes.set(session.id, Date.now());
        this.claude.sendInput(text, session.claudeSessionId);
      });
    } else {
      // 進程運行中 → 直接送入
      this.startTypingHeartbeat(chatId);
      this.responseStartTimes.set(session.id, Date.now());
      this.claude.sendInput(text, session.claudeSessionId);
    }
  }

  // --- Claude 事件處理 ---

  private setupClaudeEvents(): void {
    this.claude.on('output', (output: ClaudeOutput) => {
      const session = this.getCurrentSession();
      if (!session) return;
      const chatId = session.chatId;

      switch (output.type) {
        case 'text':
          this.bufferOutput(chatId, output.content);
          break;

        case 'result':
          this.stopTypingHeartbeat(chatId);

          // 更新 session ID
          if (output.sessionId) {
            this.store.updateClaudeSessionId(session.id, output.sessionId);
          }

          // 更新 token 統計
          if (output.usage) {
            const durationMs = output.durationMs || 0;
            this.store.updateUsage(session.id, output.usage, durationMs);

            // 附上統計 footer
            const footer = this.formatUsageFooter(output.usage, durationMs);
            this.flushOutput(chatId, footer);
          } else {
            this.flushOutput(chatId);
          }
          break;

        case 'system':
          // 系統訊息不必發給使用者，僅 log
          console.log(`[System] ${output.content}`);
          break;

        case 'error':
          this.stopTypingHeartbeat(chatId);
          this.sendMessage(chatId, `❌ ${output.content}`);
          break;
      }
    });

    this.claude.on('closed', (code: number | null) => {
      const session = this.getCurrentSession();
      if (session) {
        this.stopTypingHeartbeat(session.chatId);
        if (code !== 0 && code !== null) {
          this.sendMessage(session.chatId, `⚠️ Claude 進程已退出 (code: ${code})。發送訊息將自動重啟。`);
        }
      }
    });
  }

  // --- 指令處理器 ---

  private async handleNew(msg: TelegramBotApi.Message, pathArg?: string): Promise<void> {
    const chatId = msg.chat.id;
    if (!this.isAuthorized(chatId)) return;

    // 停止現有進程
    this.claude.stopSession();

    // 決定工作目錄
    let workDir = this.config.defaultWorkingDir;
    if (pathArg) {
      // 檢查是否為書籤名稱
      const bookmarkPath = this.store.getBookmarkPath(chatId, pathArg);
      workDir = bookmarkPath || pathArg;
    }

    // 驗證路徑
    if (!fs.existsSync(workDir)) {
      await this.bot.sendMessage(chatId, `❌ 路徑不存在: ${workDir}`);
      return;
    }

    const session = this.store.createNewSession(chatId, workDir, this.config.defaultModel);
    await this.bot.sendMessage(chatId, `✅ 新終端已建立\n📂 ${workDir}\n🤖 模型: ${session.model}`);
  }

  private async handleStop(msg: TelegramBotApi.Message): Promise<void> {
    const chatId = msg.chat.id;
    if (!this.isAuthorized(chatId)) return;

    if (this.claude.isRunning) {
      this.claude.stopSession();
      await this.bot.sendMessage(chatId, '✅ Claude 進程已停止。');
    } else {
      await this.bot.sendMessage(chatId, 'ℹ️ 目前沒有運行中的 Claude 進程。');
    }
  }

  private async handleClear(msg: TelegramBotApi.Message): Promise<void> {
    const chatId = msg.chat.id;
    if (!this.isAuthorized(chatId)) return;

    if (this.claude.isRunning) {
      // 送 /clear 指令到 Claude stdin
      this.claude.sendInput('/clear');
      await this.bot.sendMessage(chatId, '✅ 已發送清除記憶指令。');
    } else {
      await this.bot.sendMessage(chatId, 'ℹ️ 目前沒有運行中的 Claude 進程。');
    }
  }

  private async handleStatus(msg: TelegramBotApi.Message): Promise<void> {
    const chatId = msg.chat.id;
    if (!this.isAuthorized(chatId)) return;

    const session = this.store.getActiveSession(chatId);
    const running = this.claude.isRunning;

    let status = running ? '🟢 運行中' : '🔴 已停止';
    let info = `狀態: ${status}\n`;

    if (session) {
      info += `📂 工作目錄: ${session.workingDirectory}\n`;
      info += `🤖 模型: ${session.model}\n`;
      info += `💬 對話輪數: ${session.turnCount}\n`;

      const totalTokens = session.totalInputTokens + session.totalOutputTokens;
      if (totalTokens > 0) {
        info += `📊 累計 Token: ${this.formatTokenCount(session.totalInputTokens)} in / ${this.formatTokenCount(session.totalOutputTokens)} out\n`;
      }
      if (session.avgResponseMs > 0) {
        info += `⏱️ 平均回應: ${(session.avgResponseMs / 1000).toFixed(1)}s\n`;
      }
    } else {
      info += '尚無會話紀錄。';
    }

    await this.bot.sendMessage(chatId, info);
  }

  private async handleModel(msg: TelegramBotApi.Message, model?: string): Promise<void> {
    const chatId = msg.chat.id;
    if (!this.isAuthorized(chatId)) return;

    const validModels = ['haiku', 'sonnet', 'opus'];
    if (!model || !validModels.includes(model)) {
      await this.bot.sendMessage(chatId, `❌ 無效的模型。可用: ${validModels.join(', ')}`);
      return;
    }

    const session = this.store.getActiveSession(chatId);
    if (session) {
      this.store.updateModel(session.id, model);
    }

    // 如果進程正在跑，需要重啟
    if (this.claude.isRunning) {
      this.claude.stopSession();
      await this.bot.sendMessage(chatId, `✅ 模型已切換為 ${model}，Claude 進程已重啟。`);
      // 用新模型重啟
      const updatedSession = this.store.getActiveSession(chatId);
      if (updatedSession) {
        this.claude.startSession(updatedSession);
      }
    } else {
      await this.bot.sendMessage(chatId, `✅ 模型已切換為 ${model}。下次啟動時生效。`);
    }
  }

  private async handleCd(msg: TelegramBotApi.Message, target?: string): Promise<void> {
    const chatId = msg.chat.id;
    if (!this.isAuthorized(chatId)) return;

    if (!target) {
      await this.bot.sendMessage(chatId, '❌ 請指定路徑或書籤名稱。用法: /cd <路徑|書籤名>');
      return;
    }

    // 先檢查書籤
    const bookmarkPath = this.store.getBookmarkPath(chatId, target);
    const resolvedPath = bookmarkPath || target;

    if (!fs.existsSync(resolvedPath)) {
      await this.bot.sendMessage(chatId, `❌ 路徑不存在: ${resolvedPath}`);
      return;
    }

    const session = this.store.getActiveSession(chatId);
    if (session) {
      this.store.updateWorkingDirectory(session.id, resolvedPath);
    }

    // 重啟進程以套用新路徑
    if (this.claude.isRunning) {
      this.claude.stopSession();
      const updatedSession = this.store.getActiveSession(chatId);
      if (updatedSession) {
        this.claude.startSession(updatedSession);
      }
      await this.bot.sendMessage(chatId, `✅ 工作目錄已切換，Claude 進程已重啟。\n📂 ${resolvedPath}`);
    } else {
      await this.bot.sendMessage(chatId, `✅ 工作目錄已切換。\n📂 ${resolvedPath}`);
    }
  }

  private async handleBookmark(msg: TelegramBotApi.Message, args?: string): Promise<void> {
    const chatId = msg.chat.id;
    if (!this.isAuthorized(chatId)) return;

    if (!args) {
      // 列出所有書籤
      const bookmarks = this.store.getBookmarks(chatId);
      if (bookmarks.length === 0) {
        await this.bot.sendMessage(chatId, 'ℹ️ 尚無書籤。\n用法: /bookmark add <名稱> <路徑>');
        return;
      }
      const list = bookmarks.map((b) => `  ${b.name} → ${b.path}`).join('\n');
      await this.bot.sendMessage(chatId, `📑 書籤列表:\n${list}`);
      return;
    }

    const parts = args.split(/\s+/);
    const action = parts[0];

    if (action === 'add' && parts.length >= 3) {
      const name = parts[1];
      const bmPath = parts.slice(2).join(' ');
      if (!fs.existsSync(bmPath)) {
        await this.bot.sendMessage(chatId, `❌ 路徑不存在: ${bmPath}`);
        return;
      }
      this.store.addBookmark(chatId, name, bmPath);
      await this.bot.sendMessage(chatId, `✅ 已儲存書籤 '${name}' → ${bmPath}`);
    } else if (action === 'del' && parts.length >= 2) {
      const name = parts[1];
      const removed = this.store.removeBookmark(chatId, name);
      if (removed) {
        await this.bot.sendMessage(chatId, `✅ 已刪除書籤 '${name}'`);
      } else {
        await this.bot.sendMessage(chatId, `❌ 書籤 '${name}' 不存在`);
      }
    } else {
      await this.bot.sendMessage(chatId, '用法:\n/bookmark — 列出\n/bookmark add <名稱> <路徑>\n/bookmark del <名稱>');
    }
  }

  private async handleResume(msg: TelegramBotApi.Message): Promise<void> {
    const chatId = msg.chat.id;
    if (!this.isAuthorized(chatId)) return;

    const session = this.store.getActiveSession(chatId);
    if (!session?.claudeSessionId) {
      await this.bot.sendMessage(chatId, 'ℹ️ 沒有可恢復的會話。');
      return;
    }

    if (this.claude.isRunning) {
      this.claude.stopSession();
    }

    await this.bot.sendMessage(chatId, `🔄 恢復會話 ${session.claudeSessionId.substring(0, 8)}...`);
    this.claude.startSession(session);
  }

  private async handleHelp(msg: TelegramBotApi.Message): Promise<void> {
    const chatId = msg.chat.id;
    const help = `Claude Telegram Bridge v2.0

指令:
/new [路徑]  — 開新終端
/stop        — 停止 Claude
/clear       — 清除對話記憶
/status      — 查看狀態
/model <name> — 切換模型 (haiku/sonnet/opus)
/cd <路徑>    — 切換工作目錄
/bookmark    — 管理路徑書籤
/resume      — 恢復上次會話
/help        — 顯示此說明

直接輸入文字即可與 Claude 對話。`;

    await this.bot.sendMessage(chatId, help);
  }

  // --- 檔案上傳 ---

  private async handleFileUpload(msg: TelegramBotApi.Message): Promise<void> {
    const chatId = msg.chat.id;
    if (!this.isAuthorized(chatId)) return;

    const session = this.getOrCreateSession(chatId);
    const file = msg.document || (msg.photo ? msg.photo[msg.photo.length - 1] : null);
    if (!file) return;

    try {
      const fileId = 'file_id' in file ? file.file_id : '';
      const fileInfo = await this.bot.getFile(fileId);
      const fileName = (msg.document as { file_name?: string })?.file_name || `photo_${Date.now()}.jpg`;

      const uploadDir = path.join(session.workingDirectory, '_uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filePath = path.join(uploadDir, fileName);
      const fileUrl = `https://api.telegram.org/file/bot${this.config.telegramBotToken}/${fileInfo.file_path}`;

      // 下載檔案
      await this.downloadFile(fileUrl, filePath);

      await this.bot.sendMessage(chatId, `✅ 檔案已儲存: _uploads/${fileName}`);

      // 通知 Claude
      if (this.claude.isRunning) {
        this.claude.sendInput(`使用者上傳了檔案 ${fileName}，已存到 ${filePath}`);
      }
    } catch (err) {
      await this.bot.sendMessage(chatId, `❌ 檔案上傳失敗: ${(err as Error).message}`);
    }
  }

  // --- 輸出緩衝（800ms 批次發送） ---

  private bufferOutput(chatId: number, text: string): void {
    let buf = this.outputBuffers.get(chatId);
    if (!buf) {
      buf = { text: '', timer: null };
      this.outputBuffers.set(chatId, buf);
    }

    buf.text += text;

    // 重設 timer（800ms 無新輸出時發送）
    if (buf.timer) clearTimeout(buf.timer);
    buf.timer = setTimeout(() => {
      this.flushOutput(chatId);
    }, 800);
  }

  private flushOutput(chatId: number, appendText?: string): void {
    const buf = this.outputBuffers.get(chatId);
    let text = buf?.text || '';

    if (buf?.timer) {
      clearTimeout(buf.timer);
    }
    this.outputBuffers.delete(chatId);

    if (appendText) {
      text += appendText;
    }

    if (text.trim()) {
      this.sendMessage(chatId, text);
    }
  }

  // --- Typing 心跳 ---

  private startTypingHeartbeat(chatId: number): void {
    // 先送一次
    this.bot.sendChatAction(chatId, 'typing').catch(() => {});

    // 每 4 秒更新（Telegram typing 狀態 5 秒過期）
    const interval = setInterval(() => {
      this.bot.sendChatAction(chatId, 'typing').catch(() => {});
    }, 4000);

    this.typingIntervals.set(chatId, interval);
  }

  private stopTypingHeartbeat(chatId: number): void {
    const interval = this.typingIntervals.get(chatId);
    if (interval) {
      clearInterval(interval);
      this.typingIntervals.delete(chatId);
    }
  }

  // --- 工具方法 ---

  private isAuthorized(chatId: number): boolean {
    return this.config.allowedUserIds.includes(chatId);
  }

  private getOrCreateSession(chatId: number): Session {
    const existing = this.store.getActiveSession(chatId);
    if (existing) return existing;
    return this.store.createNewSession(chatId, this.config.defaultWorkingDir, this.config.defaultModel);
  }

  private getCurrentSession(): Session | null {
    // 取得所有授權 chatId 的最新活躍 session
    for (const uid of this.config.allowedUserIds) {
      const session = this.store.getActiveSession(uid);
      if (session) return session;
    }
    return null;
  }

  private formatUsageFooter(usage: TokenUsage, durationMs: number): string {
    const inputK = this.formatTokenCount(usage.input_tokens);
    const outputK = this.formatTokenCount(usage.output_tokens);
    const seconds = (durationMs / 1000).toFixed(1);
    return `\n\n📊 ${inputK} in / ${outputK} out (${seconds}s)`;
  }

  private formatTokenCount(count: number): string {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return `${count}`;
  }

  private async sendMessage(chatId: number, text: string): Promise<void> {
    // Telegram 訊息上限 4096 字元，超過則分段發送
    const MAX_LEN = 4000;
    if (text.length <= MAX_LEN) {
      await this.bot.sendMessage(chatId, text).catch((err) => {
        console.error('[TelegramBot] 發送訊息失敗:', err.message);
      });
      return;
    }

    // 分段發送
    for (let i = 0; i < text.length; i += MAX_LEN) {
      const chunk = text.substring(i, i + MAX_LEN);
      await this.bot.sendMessage(chatId, chunk).catch((err) => {
        console.error('[TelegramBot] 發送訊息失敗:', err.message);
      });
    }
  }

  private downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      https.get(url, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    });
  }
}
