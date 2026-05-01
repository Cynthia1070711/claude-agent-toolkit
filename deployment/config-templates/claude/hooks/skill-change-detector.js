#!/usr/bin/env node
/**
 * FileChanged Hook: Skill Change Detector
 * Story: cci-03-hook-skill-enhancement
 *
 * 偵測 SKILL.md 檔案變更，輸出影響報告供 skill-sync-gate 使用。
 * FileChanged 為 non-blocking 事件，僅負責偵測與報告，不阻擋操作。
 *
 * 輸入格式（FileChanged 事件）：
 *   { file_path: string, change_type: string }
 *
 * 行為：
 *   - SKILL.md 路徑 → 輸出 JSON 影響報告至 stderr（systemMessage 格式）
 *   - 非 SKILL.md → 靜默 exit 0
 *   - 所有錯誤 → fail-open exit 0
 *
 * BR-01: .claude/skills/[**]/SKILL.md 變更 -> {skill_name, domain, change_type} JSON
 * BR-02: 非 SKILL.md 檔案 -> 靜默 exit 0
 */
'use strict';

const path = require('path');
const fs = require('fs');

const MAX_STDIN = 512 * 1024; // 512KB

/**
 * 從 SKILL.md frontmatter 提取 description 欄位作為 domain
 * @param {string} skillMdPath - SKILL.md 的完整路徑
 * @returns {string} description 字串或 ''
 */
function extractDomain(skillMdPath) {
  try {
    const content = fs.readFileSync(skillMdPath, 'utf8');
    // 解析 YAML frontmatter: --- \n ... \n ---
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return '';
    const front = match[1];
    // 支援單行 description: 'value' 或 description: value
    const descMatch = front.match(/^description\s*:\s*['"]?(.+?)['"]?\s*$/m);
    if (descMatch) return descMatch[1].trim().slice(0, 80);
    return '';
  } catch {
    return '';
  }
}

/**
 * Core logic — exported for testing
 * @param {string} rawInput - stdin JSON 字串
 * @returns {{ stderrOutput: string, exitCode: number }}
 */
function evaluate(rawInput) {
  try {
    if (!rawInput || rawInput.trim() === '') {
      return { stderrOutput: '', exitCode: 0 };
    }

    let input;
    try {
      input = JSON.parse(rawInput);
    } catch {
      // 非 JSON → fail-open
      return { stderrOutput: '', exitCode: 0 };
    }

    // FileChanged 事件: file_path 在頂層
    const filePath = input.file_path
      || input.tool_input?.file_path
      || '';

    if (!filePath || typeof filePath !== 'string') {
      return { stderrOutput: '', exitCode: 0 };
    }

    const basename = path.basename(filePath);

    // BR-02: 非 SKILL.md → 靜默 exit 0
    if (basename !== 'SKILL.md') {
      return { stderrOutput: '', exitCode: 0 };
    }

    // BR-01: SKILL.md 匹配 → 提取 skill_name + domain
    const normalizedPath = filePath.replace(/\\/g, '/');
    const skillDir = path.basename(path.dirname(normalizedPath));
    const skillName = skillDir || 'unknown';
    const changeType = input.change_type || 'modified';

    // 嘗試從 SKILL.md frontmatter 讀取 description 作為 domain
    const description = extractDomain(filePath);

    const report = {
      skill_name: skillName,
      domain: description || skillName,
      change_type: changeType,
      file_path: normalizedPath,
      detected_at: new Date().toISOString(),
    };

    const message =
      `[skill-change-detector] SKILL.md 變更偵測：${skillName} (${changeType})\n` +
      JSON.stringify(report, null, 2);

    return { stderrOutput: message, exitCode: 0 };
  } catch {
    // fail-open: 任何錯誤均 exit 0
    return { stderrOutput: '', exitCode: 0 };
  }
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
    if (result.stderrOutput) {
      process.stderr.write(result.stderrOutput + '\n');
    }
    process.exit(result.exitCode);
  });
}

module.exports = { evaluate, extractDomain };
