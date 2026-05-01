// Fix: D7 detects empty code fence pair between tsx and css blocks
// Add separator text between consecutive code fences
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const row = db.prepare("SELECT implementation_approach FROM stories WHERE story_id = 'eft-imagepanel-gallery-unified'").get();
let ia = row.implementation_approach;

// Replace all adjacent ``` + blank line + ``` patterns with a separator
// Pattern: `\`\`\``\n\n```lang` → `\`\`\`\n\nCSS keyframe for the above animation:\n\n\`\`\`lang`
// Use specific replacement: find ``` (closing tsx) followed by blank line then ```css
const before = ia;
ia = ia.replace(/```\n\n```css/g, '```\n\n對應 CSS keyframe 實作:\n\n```css');

// Also check for other language pairs
ia = ia.replace(/```\n\n```ts(?!x)/g, '```\n\n對應 hook 實作:\n\n```ts');
ia = ia.replace(/```\n\n```bash/g, '```\n\n對應驗證命令:\n\n```bash');
ia = ia.replace(/```\n\n```js/g, '```\n\n對應 JS 片段:\n\n```js');

const changed = ia !== before;
console.log('Changed:', changed);
console.log('New length:', ia.length);

// Count remaining empty fence pairs
const emptyPair = /```\s*\n\s*```/g;
const matches = ia.match(emptyPair) || [];
console.log('Remaining empty fence pairs:', matches.length);

if (changed) {
  const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
  db.prepare(
    'UPDATE stories SET implementation_approach = ?, updated_at = ? WHERE story_id = ?'
  ).run(ia, now, 'eft-imagepanel-gallery-unified');
  console.log('Fixed.');
}

db.close();
