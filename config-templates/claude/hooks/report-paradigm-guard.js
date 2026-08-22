#!/usr/bin/env node
/**
 * report-paradigm-guard.js — PostToolUse hook (matcher: Edit|Write)
 *
 * PhyCool report-paradigm skill bridge (advisory only, no block).
 *
 * Detects Write/Edit operations on report-class documents (*report*.{md,html},
 * handoff / completion / 執行樹 / 推進地圖 / 總結 / Master_Plan / Strategy_Report /
 * 實施報告 / 校正報告 patterns) and injects additionalContext reminding Claude
 * that the report-paradigm skill governs report consolidation + HTML paradigms
 * (multipage report-assets architecture, Mermaid, module-overview card
 * six-element spec).
 *
 * Background: 2026-06-06 rule→skill migration (user ruling). The former
 * .claude/rules/doc-consolidation-discipline.md was paths-scoped but Bug #23478
 * means paths rules never load on Write — exactly the "generate report" moment
 * the rule was meant to govern. This hook is the mechanical "present at
 * generation time" bridge: detect report writes → remind → skill loads full
 * spec on demand (progressive disclosure). Party Mode convergence: Memory id=4981.
 *
 * Behavior: advisory only — never blocks, never throws. Dedupe: injects at most
 * once per session (tmp flag keyed by session_id) to avoid context spam during
 * batch report edits. Fail-open: any internal error → exit 0.
 *
 * Registration in settings.json (existing Edit|Write PostToolUse group):
 *   {
 *     "type": "command",
 *     "command": "cd \"${PROJECT_ROOT}\" && node .claude/hooks/report-paradigm-guard.js",
 *     "timeout": 3000
 *   }
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// Report-class document patterns (aligned with former rule paths frontmatter;
// path-level match so files inside 校正報告/實施報告 folders also hit)
const REPORT_PATTERNS = [
  /[^/]*report[^/]*\.(md|html)$/i,        // *report*.md / *report*.html (filename)
  /[\\/](校正報告|實施報告)[\\/]/,          // report-system folders (any file inside)
  /[^/]*handoff[^/]*\.md$/i,
  /[^/]*completion[^/]*\.md$/i,
  /執行樹[^/]*\.md$/,
  /推進地圖[^/]*\.md$/,
  /[^/]*總結[^/]*\.md$/,
  /Master_Plan[^/]*\.md$/i,
  /Strategy_Report[^/]*\.(md|html)$/i,
];

// Skip paths (avoid self-trigger on skill assets / hooks / node_modules / archives)
const SKIP_PATTERNS = [
  /[\\/]\.claude[\\/]/,
  /[\\/]node_modules[\\/]/,
  /[\\/]_archive[\\/]/,
];

(async () => {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;

  let data;
  try {
    data = JSON.parse(raw.replace(/^﻿/, ''));
  } catch {
    process.exit(0); // malformed input — silent pass
  }

  const filePath = (data.tool_input?.file_path || '').replace(/\\/g, '/');
  if (!filePath) process.exit(0);

  if (SKIP_PATTERNS.some(p => p.test(filePath))) process.exit(0);
  if (!REPORT_PATTERNS.some(p => p.test(filePath))) process.exit(0);

  // Dedupe: inject at most once per session (batch report edits would spam context)
  const sessionId = String(data.session_id || 'unknown').replace(/[^a-zA-Z0-9-]/g, '');
  const flagFile = path.join(os.tmpdir(), `phycool-report-paradigm-guard-${sessionId}.flag`);
  try {
    if (fs.existsSync(flagFile)) process.exit(0);
    fs.writeFileSync(flagFile, new Date().toISOString());
  } catch {
    // flag IO failure — fall through and inject anyway (at worst a duplicate)
  }

  // Advisory injection (declarative statements — not imperative, per prompt-injection defense)
  const note = `The file ${filePath} matches a report-class document pattern (任務報告 / 報告 HTML 體系). ` +
    `The report-paradigm skill (.claude/skills/report-paradigm/SKILL.md, migrated 2026-06-06 from the retired doc-consolidation-discipline rule) defines the governing paradigms: ` +
    `report consolidation (統一資料夾 / 總計畫章節化 / 禁另建新報告檔 / 安全整合刪除流程 grep-before-delete), ` +
    `HTML multipage architecture (root index + report-assets/{css,js,pages} 共用檔, 禁內嵌重複 style/script, Mermaid CDN), ` +
    `and the module-overview card six-element spec (mcard: NO 序號 / 名稱 / 三組狀態標籤含事件時間 / 說明 ≤5 行 / 備註 ≤3 行 / 最後更新時間, 全卡等高). ` +
    `Invoking Skill(skill="report-paradigm") loads the full spec, references and the copy-ready mcard template. ` +
    `This reminder appears once per session.`;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: note,
    }
  }));
  process.exit(0);
})().catch(err => {
  process.stderr.write(`[report-paradigm-guard] ${err.message}\n`);
  process.exit(0);
});
