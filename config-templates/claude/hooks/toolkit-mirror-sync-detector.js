#!/usr/bin/env node
/**
 * Toolkit Mirror Sync Detector — Stop Hook(advisory)
 *
 * 偵測本 session commit / Edit 觸及主 SSoT 配置檔案,
 * 對比 `<deployment-mirror-root>/` 鏡像 mtime / hash,未同步 → stderr 警告 + 提示。
 *
 * 對齐:
 * - `.claude/rules/toolkit-mirror-immediate-sync.md` v1.0 立即同步原則
 * - `<deployment-mirror-root>/SYNC-LOG.md` 同步紀錄機制
 *
 * Mode: advisory(不 BLOCK,只 stderr 提醒)
 * Trigger: Stop event(每次 Claude response 完成)
 *
 * 部署提示:
 *   1. 複製本 hook 至 `.claude/hooks/toolkit-mirror-sync-detector.js`
 *   2. 修改 TOOLKIT_MIRROR_ROOT 為您的部屬鏡像 root path(範例: `deployment-mirror`)
 *   3. 修改 SANITIZATION_PATTERN 為您專案的業務字面 pattern(範例: 專案名 / IDD 編號 / Story-id 前綴)
 *   4. 修改 SYNC_RANGES 為您專案的同步範圍對應
 *   5. 在 `.claude/settings.json` hooks 區段註冊 Stop event
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = process.cwd();

// ⚙️ 部署時修改:設定為您專案的部屬鏡像 root path
const TOOLKIT_MIRROR_ROOT = 'deployment-mirror';

// 觸發鏡像同步的範圍(對齐 toolkit-mirror-immediate-sync.md §Applies When)
const SYNC_RANGES = [
  {
    source: '.context-db/server.js',
    mirror: `${TOOLKIT_MIRROR_ROOT}/config-templates/context-db/server.js`,
    sanitize: false,  // 通用 JS,通常無業務字面
  },
  {
    source: '.context-db/scripts/',
    mirror: `${TOOLKIT_MIRROR_ROOT}/config-templates/context-db/scripts/`,
    sanitize: true,
  },
  {
    source: '.claude/rules/',
    mirror: `${TOOLKIT_MIRROR_ROOT}/config-templates/claude/rules/`,
    sanitize: true,
  },
  {
    source: '.claude/hooks/',
    mirror: `${TOOLKIT_MIRROR_ROOT}/config-templates/claude/hooks/`,
    sanitize: true,
  },
  {
    source: '.claude/agents/',
    mirror: `${TOOLKIT_MIRROR_ROOT}/config-templates/claude/agents/`,
    sanitize: true,
  },
  {
    source: '.claude/commands/',
    mirror: `${TOOLKIT_MIRROR_ROOT}/config-templates/claude/commands/`,
    sanitize: true,
  },
  {
    source: '_bmad/bmm/workflows/4-implementation/',
    mirror: `${TOOLKIT_MIRROR_ROOT}/bmad-overlay/4-implementation/`,
    sanitize: true,
  },
  {
    source: '.mcp.json',
    mirror: `${TOOLKIT_MIRROR_ROOT}/.mcp.json`,
    sanitize: true,
  },
];

// ⚙️ 部署時修改:設定為您專案的脫敏 grep pattern
// 範例:business name / IDD 編號 / Story-id 前綴
const SANITIZATION_PATTERN = /<your-project-name>|IDD-(COM|REG|USR)|<your-story-prefix>/g;

function getRecentChangedFiles() {
  try {
    const stagedAndUnstaged = execSync('git diff HEAD --name-only', {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return stagedAndUnstaged ? stagedAndUnstaged.split('\n') : [];
  } catch {
    return [];
  }
}

function checkSyncRange(changedFiles, range) {
  const sourceFiles = changedFiles.filter(f =>
    range.source.endsWith('/') ? f.startsWith(range.source) : f === range.source
  );

  if (sourceFiles.length === 0) return null;

  const warnings = [];
  for (const sourceFile of sourceFiles) {
    const mirrorFile = range.source.endsWith('/')
      ? sourceFile.replace(range.source, range.mirror + '/')
      : range.mirror;

    const sourceFullPath = path.join(PROJECT_ROOT, sourceFile);
    const mirrorFullPath = path.join(PROJECT_ROOT, mirrorFile);

    if (!fs.existsSync(sourceFullPath)) continue;

    let mirrorExists = fs.existsSync(mirrorFullPath);
    let mirrorOlderThanSource = false;

    if (mirrorExists) {
      const sourceMtime = fs.statSync(sourceFullPath).mtimeMs;
      const mirrorMtime = fs.statSync(mirrorFullPath).mtimeMs;
      mirrorOlderThanSource = mirrorMtime < sourceMtime - 1000;
    }

    if (!mirrorExists || mirrorOlderThanSource) {
      warnings.push({
        sourceFile,
        mirrorFile,
        reason: !mirrorExists ? 'mirror 不存在' : 'mirror mtime 早於 source(可能未同步)',
        sanitize: range.sanitize,
      });
    }
  }

  return warnings.length > 0 ? warnings : null;
}

function main() {
  const changedFiles = getRecentChangedFiles();
  if (changedFiles.length === 0) return;

  const allWarnings = [];
  for (const range of SYNC_RANGES) {
    const w = checkSyncRange(changedFiles, range);
    if (w) allWarnings.push(...w);
  }

  if (allWarnings.length === 0) return;

  console.error('');
  console.error('⚠️  [Toolkit Mirror Sync Detector] 偵測未同步鏡像:');
  console.error('═══════════════════════════════════════════════════');
  for (const w of allWarnings) {
    console.error(`  📁 source : ${w.sourceFile}`);
    console.error(`  📁 mirror : ${w.mirrorFile}`);
    console.error(`  ⚠️  reason: ${w.reason}`);
    if (w.sanitize) {
      console.error(`  🔒 sanitize: 必檢業務字面(grep 0 命中)`);
    }
    console.error('  ───────────────────────────────────────────────');
  }
  console.error('');
  console.error('📖 對齐 .claude/rules/toolkit-mirror-immediate-sync.md v1.0 立即同步原則');
  console.error('🚨 嚴禁延後 — 黃金期禁投機 + Memory 最新精確原則');
  console.error('📝 同步後必更新 <deployment-mirror-root>/SYNC-LOG.md 紀錄機制');
  console.error('');
}

try {
  main();
} catch (err) {
  console.error(`⚠️  [Toolkit Mirror Sync Detector] hook 偵測異常(忽略不阻擋): ${err.message}`);
}
