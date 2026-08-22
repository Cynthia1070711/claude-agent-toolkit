#!/usr/bin/env node
// skill-index-drift-detector.js (PostToolUse · Edit|Write · non-blocking)
//
// 觸發:`.claude/skills/{name}/SKILL.md` 被 Edit/Write 之後。
// 偵測:CLAUDE.md §2 Skill Index 是否已列舉該 skill。
// 行為:未列舉 → stderr warn(exit 0,不阻擋主流程)。
// 動機:2026-05-23 Party Mode 收斂 Action ①,CLAUDE.md §2 落後實際 +27 skill (39.7% drift)。

'use strict';
const fs = require('fs');
const path = require('path');

let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { stdin += c; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(stdin || '{}');
    const filePathRaw = (data.tool_input && data.tool_input.file_path) || '';
    if (!filePathRaw) { process.exit(0); }

    const norm = filePathRaw.replace(/\\/g, '/');
    if (!/\.claude\/skills\/.+\/SKILL\.md$/i.test(norm)) { process.exit(0); }

    const segments = norm.split('/');
    const skillMdIdx = segments.findIndex(s => /^SKILL\.md$/i.test(s));
    if (skillMdIdx < 1) { process.exit(0); }
    const skillName = segments[skillMdIdx - 1];

    // 跳過非 skill 目錄
    const SKIP = ['__tests__', 'generated', 'scripts', 'references', 'assets', 'examples'];
    if (SKIP.includes(skillName)) { process.exit(0); }

    // 跳過 BMAD 系列(CLAUDE.md §2 不收 bmad:* skill)
    const claudeIdx = segments.indexOf('.claude');
    if (claudeIdx >= 0 && segments[claudeIdx + 1] === 'skills' && segments[claudeIdx + 2] === 'bmad') {
      process.exit(0);
    }

    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
    if (!fs.existsSync(claudeMdPath)) { process.exit(0); }
    const content = fs.readFileSync(claudeMdPath, 'utf8');

    // 抓 §2 Skill Index 段落(從 ## 2. 到下個 ## n. 或檔尾)
    const s2Match = content.match(/^##\s+2\.[^\n]*\n[\s\S]*?(?=\n##\s+(?:\d+\.|[A-Za-z])|\Z)/m);
    const indexBody = s2Match ? s2Match[0] : content;

    // 比對候選(原名 / 去 phycool- 縮寫名)
    const candidates = [skillName];
    if (skillName.startsWith('phycool-')) {
      candidates.push(skillName.replace(/^phycool-/, ''));
    }

    const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hit = candidates.some(n => {
      const re = new RegExp(`(^|[\\s·,/\`*])${escapeRe(n)}([\\s·,/\`*]|$)`, 'm');
      return re.test(indexBody);
    });

    if (!hit) {
      const ts = new Date().toLocaleString('sv', { timeZone: 'Asia/Taipei' });
      process.stderr.write(
        `[skill-index-drift] ${ts} ⚠️  SKILL.md 已寫入但 CLAUDE.md §2 未列舉:\n` +
        `  skill: ${skillName}\n` +
        `  path:  ${filePathRaw}\n` +
        `  動作: 執行 Skill(skill="cc-config-author") 並補入 §2 對應子節\n` +
        `  解:   2026-05-23 Party Mode Action ① drift 修補 (CLAUDE.md §2 vs .claude/skills/ +27 偏移)\n`
      );
    }
    process.exit(0);
  } catch (err) {
    // fail-open:hook 內部錯不阻擋主流程
    process.stderr.write(`[skill-index-drift] hook internal error: ${err.message}\n`);
    process.exit(0);
  }
});

// stdin 沒進來時 5s 自殺
setTimeout(() => process.exit(0), 5000);
