#!/usr/bin/env node
/**
 * PreToolUse Hook: Pre-Commit Quality Check
 * Story: ecc-01-pre-commit-quality-hook
 *
 * 攔截 git commit 命令，掃描 staged files 偵測：
 *   - BR-001: Secrets (AWS Key / API Key / GitHub PAT / JWT / Azure / high-entropy)
 *   - BR-002: Debug 殘留 (console.log / debugger / Console.WriteLine)
 *   - BR-003: Commit message 格式 (conventional commit)
 *
 * Exit codes: 0 = 允許 commit, 2 = 阻擋 commit
 * 所有 catch block 均 exit 0（非阻擋）
 */
'use strict';

const { spawnSync } = require('child_process');

const MAX_STDIN = 512 * 1024; // 512KB
const MAX_FILES = 50;

// BR-001: Secret patterns
const SECRET_PATTERNS = [
  { pattern: /AKIA[A-Z0-9]{16}/, name: 'AWS Access Key' },
  { pattern: /api[_-]?key\s*[=:]\s*['"][^'"]{8,}['"]/i, name: 'API Key assignment' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub PAT' },
  { pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\./, name: 'JWT Token' },
  { pattern: /AccountKey=[a-zA-Z0-9+/=]{20,}/i, name: 'Azure Connection String' },
  { pattern: /['"][a-zA-Z0-9+/]{40,}['"]/, name: 'Generic high-entropy string' }
];

// BR-002: Debug patterns by file type
// Console.WriteLine 排除 Program.cs/Startup.cs（AC-2 明確要求 non-Program.cs）
const CONSOLE_WRITELINE_EXCLUDE = /(?:^|[/\\])(?:Program|Startup)\.cs$/;

function getDebugPatterns(filePath) {
  const patterns = [];
  if (/\.(ts|tsx)$/.test(filePath)) {
    patterns.push(
      { pattern: /\bconsole\.log\s*\(/, name: 'console.log', severity: 'warning' },
      { pattern: /\bdebugger\b/, name: 'debugger statement', severity: 'error' }
    );
  }
  if (/\.cs$/.test(filePath)) {
    if (!CONSOLE_WRITELINE_EXCLUDE.test(filePath)) {
      patterns.push(
        { pattern: /\bConsole\.WriteLine\s*\(/, name: 'Console.WriteLine', severity: 'warning' }
      );
    }
    patterns.push(
      { pattern: /\bSystem\.Diagnostics\.Debug\.WriteLine\s*\(/, name: 'Debug.WriteLine', severity: 'warning' }
    );
  }
  return patterns;
}

function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*');
}

function isTestFile(filePath) {
  return /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath) || /Tests\.cs$/.test(filePath);
}

function shouldCheckFile(filePath) {
  return /\.(cs|ts|tsx|js|jsx)$/.test(filePath);
}

function getStagedFiles() {
  const r = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  if (r.status !== 0) return [];
  return r.stdout.trim().split('\n').filter(f => f.length > 0);
}

function getStagedFileContent(filePath) {
  const r = spawnSync('git', ['show', `:${filePath}`], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  if (r.status !== 0) return null;
  return r.stdout;
}

/**
 * 掃描 staged content，回傳 issues。
 * @param {string} content   - 檔案內容（已從 git show 讀取）
 * @param {string} filePath  - 僅用於判斷 debug pattern
 * @returns {{ type, message, line, severity }[]}
 */
function scanContent(content, filePath) {
  const issues = [];
  const lines = content.split('\n');
  const checkDebug = !isTestFile(filePath);
  const debugPatterns = checkDebug ? getDebugPatterns(filePath) : [];

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    // BR-001: secret detection（所有可檢查的檔案，排除註解行和測試檔）
    if (!isCommentLine(line) && !isTestFile(filePath)) {
      for (const { pattern, name } of SECRET_PATTERNS) {
        if (pattern.test(line)) {
          issues.push({ type: 'secret', message: `Potential ${name} exposed`, line: lineNum, severity: 'error' });
          break; // 同一行只報一個 secret
        }
      }
    }

    // BR-002: debug remnant（非測試檔、排除註解行）
    if (checkDebug && !isCommentLine(line)) {
      for (const { pattern, name, severity } of debugPatterns) {
        if (pattern.test(line)) {
          issues.push({ type: 'debug', message: `${name} found (debug remnant)`, line: lineNum, severity });
          break;
        }
      }
    }
  });

  return issues;
}

function findFileIssues(filePath) {
  try {
    const content = getStagedFileContent(filePath);
    if (!content) return [];
    return scanContent(content, filePath);
  } catch {
    return [];
  }
}

/**
 * BR-003: Commit message format validation
 * @param {string} command - 完整 bash 命令字串
 * @returns {{ firstLine: string, issues: object[] } | null}
 */
function validateCommitMessage(command) {
  let msg = null;

  // HEREDOC 優先：$(cat <<'EOF'\n...\nEOF) 取首行
  // 必須在 -m "..." 之前匹配，避免 double-quote regex 先捕獲整個 HEREDOC 塊
  const hd = command.match(/\$\(cat\s+<<'?EOF'?\s*\n([\s\S]*?)\nEOF/);
  if (hd) {
    msg = hd[1];
  } else {
    // -m "..."（含多行）
    const dq = command.match(/(?:-m|--message)\s+"((?:[^"\\]|\\.)*)"/s);
    if (dq) msg = dq[1];
  }

  if (!msg) {
    // -m '...'
    const sq = command.match(/(?:-m|--message)\s+'((?:[^'\\]|\\.)*)'/s);
    if (sq) msg = sq[1];
  }

  if (!msg) return null;

  const firstLine = msg.split('\n')[0].trim();
  const issues = [];
  const re = /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\(.+\))?!?:\s*.+/;

  if (!re.test(firstLine)) {
    issues.push({
      type: 'format',
      message: 'Commit message 不符合 conventional commit 格式',
      suggestion: '格式：type(scope): description，例如 "feat(auth): add login"'
    });
  }

  if (firstLine.length > 72) {
    issues.push({ type: 'length', message: `Commit message 首行過長 (${firstLine.length} 字元，上限 72)` });
  }

  if (re.test(firstLine)) {
    const afterColon = firstLine.split(':').slice(1).join(':');
    if (afterColon && /^\s+[A-Z]/.test(afterColon)) {
      issues.push({ type: 'capitalization', message: 'type 後 description 首字母應為小寫' });
    }
    if (firstLine.endsWith('.')) {
      issues.push({ type: 'punctuation', message: 'Commit message 不應以 . 結尾' });
    }
  }

  return { firstLine, issues };
}

/**
 * Core logic — exported for testing
 * @param {string} rawInput - stdin JSON string
 * @returns {{ output: string, exitCode: number }}
 */
function evaluate(rawInput) {
  try {
    const input = JSON.parse(rawInput);
    const command = input.tool_input?.command || '';

    // 非 git commit → pass-through
    if (!command.includes('git commit')) return { output: rawInput, exitCode: 0 };

    // --amend → 跳過（避免無限迴圈）
    if (command.includes('--amend')) return { output: rawInput, exitCode: 0 };

    const allStaged = getStagedFiles();
    if (allStaged.length === 0) {
      console.error('[pre-commit] No staged files found.');
      return { output: rawInput, exitCode: 0 };
    }

    const toCheck = allStaged.filter(shouldCheckFile).slice(0, MAX_FILES);
    console.error(`[pre-commit] Checking ${toCheck.length}/${allStaged.length} staged file(s)...`);

    let errorCount = 0;
    let warningCount = 0;

    for (const file of toCheck) {
      const issues = findFileIssues(file);
      if (issues.length > 0) {
        console.error(`\n[FILE] ${file}`);
        for (const issue of issues) {
          const label = issue.severity === 'error' ? 'ERROR' : 'WARNING';
          console.error(`  ${label} Line ${issue.line}: ${issue.message}`);
          if (issue.severity === 'error') errorCount++;
          else warningCount++;
        }
      }
    }

    // BR-003: Commit message
    const msgResult = validateCommitMessage(command);
    if (msgResult && msgResult.issues.length > 0) {
      console.error('\n[COMMIT-MSG] Issues:');
      for (const issue of msgResult.issues) {
        console.error(`  WARNING ${issue.message}`);
        if (issue.suggestion) console.error(`    TIP ${issue.suggestion}`);
        warningCount++;
      }
    }

    const total = errorCount + warningCount;
    if (total > 0) {
      console.error(`\nSummary: ${total} issue(s) (${errorCount} error(s), ${warningCount} warning(s))`);
    }

    if (errorCount > 0) {
      console.error(`\n[pre-commit] BLOCKED: Fix ${errorCount} error(s) before committing.`);
      return { output: rawInput, exitCode: 2 };
    }

    if (total === 0) {
      console.error('\n[pre-commit] All checks passed!');
    } else {
      console.error('\n[pre-commit] Warnings found. Commit allowed.');
    }
  } catch (e) {
    console.error(`[pre-commit] Internal error: ${e.message}`);
  }

  return { output: rawInput, exitCode: 0 };
}

// ── stdin entry point ──────────────────────────────────────────────────────
if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
  });
  process.stdin.on('end', () => {
    const result = evaluate(data);
    process.stdout.write(result.output);
    process.exit(result.exitCode);
  });
}

module.exports = { evaluate, scanContent, validateCommitMessage, shouldCheckFile, isTestFile };
