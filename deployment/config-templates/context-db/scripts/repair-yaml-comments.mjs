// 修復 sprint-status.yaml 中的亂碼 comment
// 從 DB 讀取正確的 title，重建 comment
import Database from 'better-sqlite3';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const DB_PATH = path.join(__dirname, '..', 'phycool.db');
const YAML_PATH = path.join(projectRoot, 'docs', 'implementation-artifacts', 'sprint-status.yaml');

const db = new Database(DB_PATH, { readonly: true });
db.pragma('journal_mode = WAL');

// 讀取所有 DB stories
const dbStories = db.prepare('SELECT story_id, title, complexity, priority, cr_score, test_count, dev_agent, review_agent, cr_summary, started_at, completed_at, review_completed_at, create_agent, create_completed_at, dependencies FROM stories').all();
const storyMap = new Map();
dbStories.forEach(s => storyMap.set(s.story_id, s));

console.log(`DB stories loaded: ${storyMap.size}`);

// 讀取 YAML
const yamlContent = readFileSync(YAML_PATH, 'utf8');
const lines = yamlContent.split(/\r?\n/);

let repairedCount = 0;
let skippedCount = 0;
let notInDbCount = 0;

const newLines = lines.map((line, idx) => {
  // 只處理 story 行（indented key: value # comment）
  const match = line.match(/^(\s+)([\w-]+):\s+([\w-]+)(.*)/);
  if (!match) return line;

  const [, indent, storyId, status, rest] = match;
  const commentMatch = rest.match(/#\s*(.*)/);
  const comment = commentMatch ? commentMatch[1] : '';

  // 檢查是否含 U+FFFD 或高位 bytes 損壞
  const hasReplacement = comment.includes('\uFFFD');
  const hasGarbled = /[\x80-\xff]/.test(comment) && !/[\u4e00-\u9fff]/.test(comment.replace(/[a-zA-Z0-9\s+\-()\/.:,_=@#|&;'">!?%*~`\[\]{}\\^$]+/g, ''));

  if (!hasReplacement && !hasGarbled) return line; // 正常行不動

  // 從 DB 取得正確資料
  const dbStory = storyMap.get(storyId);
  if (!dbStory) {
    notInDbCount++;
    console.log(`  [SKIP] L${idx + 1} ${storyId} — not in DB`);
    return line;
  }

  // 重建 comment
  const parts = [];

  // 複雜度 + 優先級
  if (dbStory.complexity) parts.push(dbStory.complexity);
  if (dbStory.priority) parts.push(dbStory.priority);

  // CR Score
  if (dbStory.cr_score) parts.push(`CR:${dbStory.cr_score}`);

  // Test count
  if (dbStory.test_count) parts.push(`${dbStory.test_count} tests`);

  // CR summary (fixed/deferred counts) — 從原始 comment 提取 ASCII 部分
  const crFixMatch = comment.match(/(\d+\s+fixed\s*\([^)]+\))/);
  const crDeferMatch = comment.match(/(\d+\s+deferred\s*\([^)]+\))/);
  const crWontMatch = comment.match(/(\d+\s+wont_fix\s*\([^)]+\))/);
  if (crFixMatch) parts.push(crFixMatch[1]);
  if (crDeferMatch) parts.push(crDeferMatch[1]);
  if (crWontMatch) parts.push(crWontMatch[1]);

  // Title（從 DB）
  if (dbStory.title) parts.push(dbStory.title);

  // Agent info — 從原始 comment 提取
  const agentInfo = comment.match(/\((?:created|dev|reviewed|verified|cr)[^)]*\)/g);
  if (agentInfo) {
    // 嘗試從 DB 重建
  }

  // 日期資訊 — 從 DB 重建
  const dateParts = [];
  if (dbStory.create_agent && dbStory.create_completed_at) {
    dateParts.push(`created: ${dbStory.create_agent} ${dbStory.create_completed_at.substring(0, 10)}`);
  }
  if (dbStory.dev_agent && dbStory.completed_at) {
    dateParts.push(`dev: ${dbStory.dev_agent} ${dbStory.completed_at.substring(0, 10)}`);
  }
  if (dbStory.review_agent && dbStory.review_completed_at) {
    dateParts.push(`reviewed: ${dbStory.review_agent} ${dbStory.review_completed_at.substring(0, 10)}`);
  }
  if (dateParts.length > 0) {
    parts.push(`(${dateParts.join(', ')})`);
  } else {
    // 從原始 comment 提取 agent/date info（ASCII 部分）
    const agentMatch = comment.match(/\(((?:created|dev|reviewed|verified|cr)[:, \w\d-]+)\)/);
    if (agentMatch) parts.push(`(${agentMatch[1]})`);
  }

  // 依賴
  if (dbStory.dependencies) {
    parts.push(`depends: ${dbStory.dependencies}`);
  }

  const newComment = parts.join(', ');
  const newLine = `${indent}${storyId}: ${status}  # ${newComment}`;

  repairedCount++;
  console.log(`  [FIX] L${idx + 1} ${storyId}`);

  return newLine;
});

// 寫回 — 用 UTF-8 無 BOM
const output = newLines.join('\r\n');
writeFileSync(YAML_PATH, output, 'utf8');

db.close();

console.log(`\n=== 修復完成 ===`);
console.log(`修復: ${repairedCount} 行`);
console.log(`跳過(正常): ${lines.length - repairedCount - notInDbCount - skippedCount} 行`);
console.log(`跳過(不在DB): ${notInDbCount} 行`);
