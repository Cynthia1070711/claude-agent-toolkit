#!/usr/bin/env node
/**
 * cross-ref-precheck.js — PreToolUse hook (matcher: Edit|Write)
 *
 * PhyCool Cross-Ref Discipline 機械守護:
 * 偵測 Edit/Write 工具對 .claude/(hooks/.rules/.skills/.agents/.commands/) +
 * .claude/settings.json / .mcp.json / CLAUDE.md / CLAUDE.local.md 的寫入動作,
 * 透過 git grep + Glob 對檔案 basename 做跨檔引用掃描,
 * 將找到的 references 注入 additionalContext 提示 Claude 對齊處理。
 *
 * 對齊 SOP:
 *   - .claude/rules/cross-ref-discipline.md v1.0.0 (2026-05-16 建立)
 *   - .claude/rules/gitnexus-discipline.md (GitNexus 工具優先順序)
 *
 * 行為設計:
 *   - 非阻擋(exit 0 always),advisory only
 *   - 偵測 silent failure 不報錯(維持 Claude 工作流)
 *   - timeout 2000ms,git grep --max-count=15 限制速度
 *   - 區分 ACTIVE config vs 歷史不可變範圍
 *
 * settings.json 註冊:
 *   "PreToolUse": [{
 *     "matcher": "Edit|Write",
 *     "hooks": [{
 *       "type": "command",
 *       "command": "cd \"$CLAUDE_PROJECT_DIR\" && node .claude/hooks/cross-ref-precheck.js",
 *       "timeout": 2000
 *     }]
 *   }]
 *
 * 2026-05-16 14:44 deployed for PhyCool env-optimization Phase 9.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// 觸發路徑模式 — 命中任一即執行 cross-ref 掃描
const TRIGGER_PATTERNS = [
  /\.claude[\\\/]hooks[\\\/].+\.js$/,
  /\.claude[\\\/]rules[\\\/].+\.md$/,
  /\.claude[\\\/]skills[\\\/].+[\\\/]SKILL\.md$/,
  /\.claude[\\\/]skills[\\\/].+[\\\/]references[\\\/].+\.md$/,
  /\.claude[\\\/]agents[\\\/].+\.md$/,
  /\.claude[\\\/]commands[\\\/].+\.md$/,
  /\.claude[\\\/]settings(\.local)?\.json$/,
  /[\\\/]\.mcp\.json$/,
  /^\.mcp\.json$/,
  /[\\\/]CLAUDE\.md$/,
  /[\\\/]CLAUDE\.local\.md$/,
  /^CLAUDE\.md$/,
  /^CLAUDE\.local\.md$/,
];

// 歷史不可變範圍 — 出現在這些路徑的 reference 視為歷史紀錄,不需驚擾
const IMMUTABLE_PATTERNS = [
  /docs[\\\/]tracking[\\\/]archived[\\\/]/,
  /docs[\\\/]implementation-artifacts[\\\/]reviews[\\\/]/,
  /docs[\\\/]implementation-artifacts[\\\/]specs[\\\/]/,
  /docs[\\\/]technical-decisions[\\\/]ADR-/,
  /audit[\\\/]description-trigger-audit/,
  /sprint-status\.yaml$/,
  /當前開發環境配置健檢任務[\\\/]stories[\\\/]/,
  /\.gemini[\\\/]/,                    // single-engine-mode FROZEN baseline
  /\.agent[\\\/]/,                     // 同上
  /backups[\\\/]\d{4}-\d{2}-\d{2}/,    // backup snapshots
  /_archive[\\\/]/,                    // archived content
];

function isImmutable(filePath) {
  return IMMUTABLE_PATTERNS.some(re => re.test(filePath));
}

// ─────────────────────────────────────────────────────────
// Phase 2B 蒸餾自 ECC governance-capture (2026-05-22 Stage α + 2026-05-23 D15-v2-B 補強)
// Upstream: ECC-main (MIT) governance-capture L26-56 — 5 通用 patterns 取自原版
// Scope: 9 SECRET_PATTERNS (5 通用 + 4 PhyCool 業務) + 6 SENSITIVE_PATHS · advisory only · exit 0 always
// 未蒸餾:APPROVAL_COMMANDS(屬 PreToolUse:Bash matcher 範圍,留獨立 hook 處理)
// 適配深度提升: L2 (40%) → L3 (60%+),對齊 tianji-pavilion v1.4.0 references/adaptation-depth.md §2 D4
// 走 Skill(skill="hooks-mechanization") 7-step playbook · 對齊 hooks-creation-discipline.md SUPREME
// ─────────────────────────────────────────────────────────

const SECRET_PATTERNS = [
  // 通用 5 patterns(對齊 ECC 原版,修 aws_key /i flag bug · D15-v2-B 2026-05-23)
  { name: 'aws_key', pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/i },
  { name: 'generic_secret', pattern: /(?:secret|password|token|api[_-]?key)\s*[:=]\s*["'][^"']{8,}/i },
  { name: 'private_key', pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/ },
  { name: 'jwt', pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'github_token', pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/ },
  // PhyCool 業務 4 patterns(D15-v2-B 適配補強,2026-05-23 對齊 tianji-pavilion v1.4.0 D4-5)
  { name: 'ecpay_credentials', pattern: /(?:HashKey|HashIV|MerchantID)\s*[:=]\s*["'][A-Za-z0-9]{8,}["']/i },
  { name: 'sendgrid_api', pattern: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/ },
  { name: 'azure_storage', pattern: /DefaultEndpointsProtocol=https?;AccountName=[a-z0-9]+;AccountKey=[A-Za-z0-9+/=]{40,}/ },
  { name: 'anthropic_api', pattern: /sk-ant-(?:api03|admin01)-[A-Za-z0-9_-]{93,}/ },
];

const SENSITIVE_PATHS = [
  /\.env(?:\.|$)/,
  /credentials/i,
  /secrets?\./i,
  /\.pem$/,
  /\.key$/,
  /id_rsa/,
];

function detectSecretsInText(text) {
  if (!text || typeof text !== 'string') return [];
  const findings = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(text)) findings.push(name);
  }
  return findings;
}

function isSensitivePath(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  return SENSITIVE_PATHS.some(re => re.test(filePath));
}

function extractBasename(filePath) {
  // 提取適合作為 grep search term 的 unique identifier:
  //   - .claude/skills/{name}/SKILL.md → 用 parent dir name(skill name),避免「SKILL」匹配整個 repo
  //   - .claude/skills/{name}/references/X.md → 同上(referenced as skill name)
  //   - .claude/{rules,hooks,agents,commands}/X.{md,js,...} → 用 file basename
  //   - settings.json / .mcp.json / CLAUDE.md → 用完整 basename(已具獨特性)
  const normalized = filePath.replace(/\\/g, '/');

  const skillMatch = normalized.match(/\.claude\/skills\/([^\/]+)\/(?:SKILL\.md|references\/)/);
  if (skillMatch) return skillMatch[1];  // skill name from parent dir

  const base = path.basename(normalized);
  const stripped = base.replace(/\.(md|js|cjs|mjs|json|ps1)$/i, '');

  // 過濾過於通用的 basename 避免 false positive(SKILL / index / readme 等)
  if (/^(SKILL|index|README|CHANGELOG|LICENSE)$/i.test(stripped)) {
    return null;  // Skip cross-ref scan for these generic names
  }
  return stripped;
}

function safeGitGrep(searchTerm) {
  // 用 git ls-files + grep,限制速度與範圍
  // --max-count=20 限制每檔最多 20 hits,-l 只列檔名
  try {
    const result = execSync(
      `git grep -l --max-count=20 -F ${JSON.stringify(searchTerm)} -- ":!*.log" ":!node_modules/*" ":!.git/*"`,
      { encoding: 'utf8', timeout: 1500, stdio: ['pipe', 'pipe', 'ignore'] }
    );
    return result.split('\n').map(s => s.trim()).filter(Boolean);
  } catch (e) {
    // git grep exit 1 = no matches; exit 128 = not git repo / other error
    // 都靜默返回空陣列
    return [];
  }
}

function classifyRefs(refs, targetFile) {
  const active = [];
  const immutable = [];
  const selfRef = [];

  for (const ref of refs) {
    const normalized = ref.replace(/\\/g, '/');
    const targetNormalized = targetFile.replace(/\\/g, '/');

    if (normalized === targetNormalized || normalized.endsWith('/' + path.basename(targetFile))) {
      // 同名檔(可能 .claude/.gemini/.agent 三引擎副本)
      selfRef.push(ref);
    } else if (isImmutable(ref)) {
      immutable.push(ref);
    } else {
      active.push(ref);
    }
  }

  return { active, immutable, selfRef };
}

function buildContextNote(filePath, refs, isNewFile) {
  const { active, immutable, selfRef } = classifyRefs(refs, filePath);

  // 沒任何 reference + 新檔 → 無需提醒
  if (active.length === 0 && immutable.length === 0 && isNewFile) {
    return null;
  }

  // 純粹自我引用 / 全歷史不可變 → 輕量提示
  if (active.length === 0 && (immutable.length > 0 || selfRef.length > 0)) {
    return `The file ${filePath} has cross-references only in immutable history scope (${immutable.length} files in docs/tracking/archived, ADR, CR reports, etc.). ` +
      `Per .claude/rules/cross-ref-discipline.md, immutable history is not modified. ` +
      `No ACTIVE config refs detected — proceeding without orphan-ref risk.`;
  }

  // 有 ACTIVE refs → 完整提示
  const sampleRefs = active.slice(0, 8);
  const moreCount = Math.max(0, active.length - 8);
  const sampleStr = sampleRefs.map(r => `  - ${r}`).join('\n');

  return `The file ${filePath} has ${active.length} ACTIVE config cross-reference(s)` +
    (moreCount > 0 ? ` (showing first 8 of ${active.length}; ${moreCount} more)` : '') +
    `:\n${sampleStr}\n` +
    (immutable.length > 0 ? `Plus ${immutable.length} immutable history refs (not affected). ` : '') +
    `Per .claude/rules/cross-ref-discipline.md §3 Mandatory Pre-Action Flow, before making this Edit/Write: ` +
    `(1) Verify ACTIVE refs are included in the change scope (avoid orphan refs), ` +
    `(2) If renaming/deleting, plan surgical edits across all listed files in same commit, ` +
    `(3) For HIGH-impact symbols, consider mcp__gitnexus__impact for blast radius analysis.`;
}

// ── ecc-08 BR-ECC-08-02: cross_ref instinct permanent evidence (dual-layer) ──────
// advisory additionalContext (既有) + permanent evidence (.context-db/ecc-state/cross-ref-state.json)
// 對齊 ecc-07 dual-layer 範式 + IInstinctDispatcher schema + constitutional §Timestamp UTC+8
function writeCrossRefEvidence(targetFile, activeCount, immutableCount) {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const permFile = path.join(projectDir, '.context-db', 'ecc-state', 'cross-ref-state.json');
  if (!fs.existsSync(permFile)) return; // init-ecc-state.cjs 預建 · fail-open skip
  let state;
  try {
    const raw = fs.readFileSync(permFile, 'utf8');
    state = JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw);
    if (typeof state !== 'object' || state === null) return;
  } catch { return; }
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const ts = d.toISOString().replace(/\.\d{3}Z$/, '').replace('Z', '') + '+08:00';
  state.last_dispatch = ts;
  state.dispatch_count = (state.dispatch_count || 0) + 1;
  state.success_count = (state.success_count || 0) + 1;
  const entry = { timestamp: ts, status: 'success', action_taken: `cross_ref scan: ${targetFile} · active_refs=${activeCount} immutable=${immutableCount}` };
  state.history = [].concat(Array.isArray(state.history) ? state.history : (state.history ? [state.history] : []), [entry]).slice(-50);
  try {
    const tmp = permFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, permFile);
  } catch { /* fail-open */ }
}

(async () => {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const filePath = (data.tool_input?.file_path || '').replace(/\\/g, '/');
  if (!filePath) process.exit(0);

  // 只攔截 trigger paths,其他放行
  const matches = TRIGGER_PATTERNS.some(re => re.test(filePath));
  if (!matches) process.exit(0);

  // 判斷新檔 vs 既有檔
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  let isNewFile = false;
  try {
    isNewFile = !fs.existsSync(absolutePath);
  } catch {
    isNewFile = false;
  }

  // 對 basename 跑 git grep
  const searchTerm = extractBasename(filePath);
  if (!searchTerm || searchTerm.length < 3) process.exit(0);

  const refs = safeGitGrep(searchTerm);
  const crossRefNote = (refs.length > 0) ? buildContextNote(filePath, refs, isNewFile) : null;

  // ecc-08 BR-ECC-08-02: cross_ref permanent evidence dual-write (對齊 ecc-07 範式)
  if (refs.length > 0) {
    const { active, immutable } = classifyRefs(refs, filePath);
    writeCrossRefEvidence(filePath, active.length, immutable.length);
  }

  // Phase 2B 蒸餾自 ECC governance-capture:secret + sensitive path 偵測(advisory)
  // tool_input 欄位視動作型別不同:Write 用 content / Edit 用 new_string / MultiEdit 略過
  const writeContent = String(data.tool_input?.content || '');
  const editContent = String(data.tool_input?.new_string || '');
  const combinedContent = writeContent + ' ' + editContent;
  const secrets = detectSecretsInText(combinedContent);
  const sensitivePathHit = isSensitivePath(filePath);

  const securityNotes = [];
  if (secrets.length > 0) {
    securityNotes.push(
      `The tool input for ${filePath} contains ${secrets.length} pattern(s) matching hardcoded secret format(s): ${secrets.join(', ')}. ` +
      `The change scope may include credential material that ECC governance-capture would normally flag.`
    );
  }
  if (sensitivePathHit) {
    securityNotes.push(
      `The target file path ${filePath} matches sensitive path patterns (e.g., .env, credentials, secrets, .pem, .key, id_rsa). ` +
      `Writes to this location are typically reserved for credential material.`
    );
  }

  const combinedNote = [crossRefNote, ...securityNotes].filter(Boolean).join('\n\n');
  if (!combinedNote) process.exit(0);

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: combinedNote,
    }
  }));
  process.exit(0);
})().catch(err => {
  // Fail-safe: any error → silent pass (don't block Claude's work)
  process.stderr.write(`[cross-ref-precheck] ${err.message}\n`);
  process.exit(0);
});
