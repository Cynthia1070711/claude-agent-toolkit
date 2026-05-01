#!/usr/bin/env node
/**
 * PermissionRequest Hook: Pipeline Auto-Approve
 * Story: cci-03-hook-skill-enhancement
 *
 * 在 Pipeline 模式下（PCPT_PIPELINE_MODE=1）自動授權白名單工具，
 * 取代全局 --dangerously-skip-permissions，提供精確的最小權限授權。
 *
 * 輸入格式（PermissionRequest 事件）：
 *   { tool_name: string, tool_input: object }
 *
 * 行為：
 *   - Pipeline 模式 + 白名單工具 → stdout 輸出 allow 決策 JSON
 *   - 非 Pipeline 模式 → exit 0 pass-through（正常顯示授權對話框）
 *   - 白名單外工具 → exit 0 pass-through
 *   - 所有錯誤 → fail-open exit 0
 *
 * BR-03: PCPT_PIPELINE_MODE=1 + 白名單工具 → allow
 * BR-04: 非 Pipeline 模式 → pass-through
 *
 * 安全設計：
 *   - 僅 PCPT_PIPELINE_MODE=1 時啟用，避免正常開發模式被繞過
 *   - 白名單限定 6 個常用工具：Read/Edit/Write/Bash/Grep/Glob
 *   - MCP 工具與 Agent 工具仍需手動授權
 */
'use strict';

const MAX_STDIN = 512 * 1024; // 512KB

/**
 * Pipeline 模式自動授權工具白名單
 */
const ALLOWED_TOOLS = new Set(['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob']);

/**
 * Core logic — exported for testing
 * @param {string} rawInput - stdin JSON 字串
 * @param {object} env - process.env（injectable for testing）
 * @returns {{ output: string, exitCode: number }}
 */
function evaluate(rawInput, env) {
  env = env || process.env;

  try {
    if (!rawInput || rawInput.trim() === '') {
      return { output: '', exitCode: 0 };
    }

    let input;
    try {
      input = JSON.parse(rawInput);
    } catch {
      // 非 JSON → fail-open
      return { output: '', exitCode: 0 };
    }

    // BR-04: 非 Pipeline 模式 → pass-through
    if (env.PCPT_PIPELINE_MODE !== '1') {
      return { output: '', exitCode: 0 };
    }

    const toolName = input.tool_name || '';
    if (!toolName || typeof toolName !== 'string') {
      return { output: '', exitCode: 0 };
    }

    // 白名單外工具 → pass-through（保留正常授權對話框）
    if (!ALLOWED_TOOLS.has(toolName)) {
      return { output: '', exitCode: 0 };
    }

    // BR-03: Pipeline 模式 + 白名單工具 → allow
    const decision = JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: {
          behavior: 'allow',
        },
      },
    });

    return { output: decision, exitCode: 0 };
  } catch {
    // fail-open: 任何錯誤均 exit 0
    return { output: '', exitCode: 0 };
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
    if (result.output) {
      process.stdout.write(result.output);
    }
    process.exit(result.exitCode);
  });
}

module.exports = { evaluate, ALLOWED_TOOLS };
