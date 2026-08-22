#!/usr/bin/env node
/**
 * audit-config.js — Claude Code 配置健檢工具
 *
 * 掃描整個 .claude/ 目錄與 CLAUDE.md / CLAUDE.local.md,
 * 對照 2026 Apr 規範產生不合規報告。
 *
 * Usage:
 *   node .claude/skills/cc-config-author/scripts/audit-config.js
 *   或當作 slash command 的後端:`/cc-audit`
 *
 * Output:
 *   - 摘要表格(總分、不合規數)
 *   - 每檔案的問題清單
 *   - 預估 token 預算 vs 實際
 *   - 已知 bugs 對當前配置的影響
 */

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────
// 規範常數(來自 references/)
// ─────────────────────────────────────────────────────────

const LIMITS = {
  CLAUDE_MD_SOFT: 120,
  CLAUDE_MD_HARD: 200,
  CLAUDE_LOCAL_SOFT: 30,
  CLAUDE_LOCAL_HARD: 80,
  RULE_NO_PATHS_SOFT: 60,
  RULE_NO_PATHS_HARD: 100,
  RULE_WITH_PATHS_SOFT: 150,
  RULE_WITH_PATHS_HARD: 250,
  SKILL_BODY_SOFT: 300,
  SKILL_BODY_HARD: 500,
  COMMAND_SOFT: 50,
  COMMAND_HARD: 100,
  SUBAGENT_SYSTEM_SOFT: 150,
  SUBAGENT_SYSTEM_HARD: 300,
  // PhyCool-specific cap per .claude/rules/skill-creation-discipline.md §2 (2026-05-10 上修)
  PHYCOOL_SKILLS_PHYCOOL_PREFIX_CAP: 100,  // phycool-* SaaS module Skill
  PHYCOOL_SKILLS_GENERIC_CAP: 60,           // workflow / utility / tool Skill
  PHYCOOL_SKILLS_TOTAL_CAP: 160,
  PHYCOOL_HOOKS_CAP: 50,                    // .claude/hooks/*.js soft cap
  PHYCOOL_RULES_ALWAYS_ON_CAP: 15,          // 對齊 official 建議 ≤15 always-on
};

const DEPRECATED_ENV = ['MAX_THINKING_TOKENS', 'CLAUDE_CODE_NO_FLICKER'];

const RESERVED_NAME_KEYWORDS = ['claude'];

// ─────────────────────────────────────────────────────────
// Helper: Skill Name 驗證(對齊 Agent Skills spec + deepagents _validate_skill_name)
//
// 規則(對齊 Agent Skills specification):
//   1. 1-64 字元
//   2. Unicode lowercase alphanumeric + hyphens(支援 café / über-tool 等 accented)
//   3. 不可 `-` 開頭/結尾
//   4. 不能連續 `--`
//   5. `name` 必須等於 parent directory name
//
// 蒸餾來源: claude token減量策略研究分析/工作流/deepagents-main/libs/deepagents/
//          deepagents/middleware/skills.py L324-362 _validate_skill_name
// 對齊: Stage α Phase 2A · α-13 deepagents 純邏輯移植(40 行純 JS,non-SKILL.md)
// ─────────────────────────────────────────────────────────

function validateSkillName(name, directoryName) {
  if (!name) return { valid: false, error: 'name is required' };
  if (name.length > 64) return { valid: false, error: 'name exceeds 64 characters' };
  if (name.startsWith('-') || name.endsWith('-') || name.includes('--')) {
    return { valid: false, error: 'name must not start/end with hyphen or contain consecutive hyphens' };
  }
  // Unicode lowercase alphanumeric + hyphens 對齊 Python isalpha+islower / isdigit
  // \p{Ll}=Lowercase Letter / \p{Nd}=Decimal Number(涵蓋 café/über-tool/其他 script)
  if (!/^[\p{Ll}\p{Nd}-]+$/u.test(name)) {
    return { valid: false, error: 'name must be Unicode lowercase alphanumeric with single hyphens only' };
  }
  if (name !== directoryName) {
    return { valid: false, error: `name '${name}' must match directory name '${directoryName}'` };
  }
  return { valid: true, error: '' };
}

// ─────────────────────────────────────────────────────────
// Helper: YAML frontmatter 解析(輕量,只認 key: value 與 list)
// ─────────────────────────────────────────────────────────

function parseFrontmatter(content) {
  // CRLF normalization: Windows file saves are CRLF (\r\n). Without this,
  // lines[0] becomes "---\r" and equality check against "---" fails,
  // causing false "missing frontmatter" reports across all SKILL.md files
  // on Windows. (Bug discovered 2026-05-16 — affected entire .claude/skills/ audit.)
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') return { hasFm: false, fm: {}, bodyStartLine: 0 };

  const fm = {};
  let i = 1;
  let currentKey = null;
  let currentList = null;
  let blockScalar = null; // null | '|' | '>'
  let blockLines = [];
  let blockIndent = 0;

  function flushBlock() {
    if (currentKey && blockScalar) {
      fm[currentKey] = blockLines.join(blockScalar === '>' ? ' ' : '\n').trim();
      blockScalar = null;
      blockLines = [];
    }
  }

  for (; i < lines.length; i++) {
    if (lines[i] === '---') { flushBlock(); break; }
    const line = lines[i];

    // Active block scalar: collect indented lines
    if (blockScalar) {
      const m = line.match(/^(\s+)(.*)$/);
      if (m && (blockIndent === 0 || m[1].length >= blockIndent)) {
        if (blockIndent === 0) blockIndent = m[1].length;
        blockLines.push(m[2]);
        continue;
      } else {
        flushBlock();
      }
    }

    // List item
    if (/^\s*-\s+/.test(line) && currentKey) {
      if (!currentList) currentList = [];
      currentList.push(line.replace(/^\s*-\s+/, '').replace(/^["']|["']$/g, '').trim());
      fm[currentKey] = currentList;
      continue;
    }
    // Key: value
    const m = line.match(/^(\S[^:]*?):\s*(.*)$/);
    if (m) {
      currentKey = m[1].trim();
      currentList = null;
      const val = m[2].trim();
      if (val === '|' || val === '>') {
        blockScalar = val;
        blockLines = [];
        blockIndent = 0;
      } else if (val) {
        fm[currentKey] = val.replace(/^["']|["']$/g, '');
      } else {
        fm[currentKey] = null;
      }
    }
  }
  flushBlock();
  return { hasFm: true, fm, bodyStartLine: i + 1 };
}

function countLines(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split('\n').length;
  } catch {
    return 0;
  }
}

function readFileSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────
// 各檢查項
// ─────────────────────────────────────────────────────────

const findings = [];

function add(severity, file, msg) {
  findings.push({ severity, file, msg });
}

// 1. CLAUDE.md / CLAUDE.local.md 行數
function checkClaudeMd() {
  const candidates = ['CLAUDE.md', 'CLAUDE.local.md'];
  for (const f of candidates) {
    if (!fs.existsSync(f)) {
      if (f === 'CLAUDE.md') add('warn', f, '專案根缺 CLAUDE.md,建議至少加 commands/architecture/conventions 三段');
      continue;
    }
    const lines = countLines(f);
    const isLocal = f === 'CLAUDE.local.md';
    const soft = isLocal ? LIMITS.CLAUDE_LOCAL_SOFT : LIMITS.CLAUDE_MD_SOFT;
    const hard = isLocal ? LIMITS.CLAUDE_LOCAL_HARD : LIMITS.CLAUDE_MD_HARD;
    if (lines > hard) {
      add('error', f, `${lines} 行,超過硬上限 ${hard}。Claude 開始忽略指令。建議拆分到 .claude/rules/ + paths`);
    } else if (lines > soft) {
      add('warn', f, `${lines} 行,超過軟上限 ${soft}。建議精簡或拆分。`);
    } else {
      add('ok', f, `${lines} 行,在預算內(soft ${soft})`);
    }
  }
}

// 2. .claude/rules/*.md
function checkRules() {
  const dir = '.claude/rules';
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  add('info', dir, `共 ${files.length} 條 rules`);

  let alwaysOnCount = 0;
  let pathsScopedCount = 0;
  let totalLines = 0;

  for (const f of files) {
    const p = path.join(dir, f);
    const content = readFileSafe(p);
    if (!content) continue;
    const { hasFm, fm } = parseFrontmatter(content);
    const lines = content.split('\n').length;
    totalLines += lines;

    if (!hasFm || !fm.paths) {
      alwaysOnCount++;
      if (lines > LIMITS.RULE_NO_PATHS_HARD) {
        add('error', p, `${lines} 行 always-on(無 paths),超過硬上限 ${LIMITS.RULE_NO_PATHS_HARD}`);
      } else if (lines > LIMITS.RULE_NO_PATHS_SOFT) {
        add('warn', p, `${lines} 行 always-on,超過軟上限 ${LIMITS.RULE_NO_PATHS_SOFT}。考慮加 paths frontmatter`);
      }
    } else {
      pathsScopedCount++;
      if (lines > LIMITS.RULE_WITH_PATHS_HARD) {
        add('warn', p, `${lines} 行(paths-scoped),超過硬上限 ${LIMITS.RULE_WITH_PATHS_HARD}`);
      }
    }
  }

  add('info', dir, `always-on: ${alwaysOnCount} 條 / paths-scoped: ${pathsScopedCount} 條 / 總行數: ${totalLines}`);

  // PhyCool 警示:Always-on > 15 時提醒
  if (alwaysOnCount > 15) {
    add('warn', dir, `Always-on rules 過多(${alwaysOnCount}),官方建議 ≤15。考慮加 paths 或轉成 skill/hook`);
  }
}

// 3. .claude/skills/*/SKILL.md
function checkSkills() {
  const dir = '.claude/skills';
  if (!fs.existsSync(dir)) return;
  const skillDirs = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  add('info', dir, `共 ${skillDirs.length} 個 skills`);

  for (const sd of skillDirs) {
    const skillFile = path.join(dir, sd, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      add('error', skillFile, 'SKILL.md 不存在');
      continue;
    }
    const content = readFileSafe(skillFile);
    const { hasFm, fm, bodyStartLine } = parseFrontmatter(content);

    // 必填欄位
    if (!hasFm) {
      add('error', skillFile, '缺 YAML frontmatter');
      continue;
    }
    if (!fm.name) add('error', skillFile, '缺 name 欄位');
    if (!fm.description) add('error', skillFile, '缺 description 欄位');

    // name 規則(對齊 Agent Skills spec + deepagents _validate_skill_name 5 條規則)
    if (fm.name) {
      const nameCheck = validateSkillName(fm.name, sd);
      if (!nameCheck.valid) {
        add('error', skillFile, `name 違反 Agent Skills spec: ${nameCheck.error}`);
      }
      // RESERVED_NAME_KEYWORDS 額外檢查(PhyCool-specific,非 Agent Skills spec)
      for (const reserved of RESERVED_NAME_KEYWORDS) {
        if (fm.name.includes(reserved)) {
          add('warn', skillFile, `name "${fm.name}" 含保留字 "${reserved}",可能被 Anthropic 拒絕`);
        }
      }
    }

    // description 第三人稱檢查(粗略)
    if (fm.description) {
      const desc = Array.isArray(fm.description) ? fm.description.join(' ') : fm.description;
      if (/^I /.test(desc) || /\bI help\b/.test(desc)) {
        add('warn', skillFile, 'description 似為第一人稱,建議改為第三人稱(This skill should be used...)');
      }
      if (desc.length < 50) {
        add('warn', skillFile, `description 過短(${desc.length} chars),Claude 可能 undertrigger`);
      }
      if (desc.length > 1024) {
        add('warn', skillFile, `description 超過 1024 chars,浪費 always-on tokens`);
      }
    }

    // body 行數
    const bodyLines = content.split('\n').length - bodyStartLine;
    if (bodyLines > LIMITS.SKILL_BODY_HARD) {
      add('error', skillFile, `body ${bodyLines} 行,超過硬上限 ${LIMITS.SKILL_BODY_HARD}。拆 references/`);
    } else if (bodyLines > LIMITS.SKILL_BODY_SOFT) {
      add('warn', skillFile, `body ${bodyLines} 行,超過軟上限 ${LIMITS.SKILL_BODY_SOFT}`);
    }
  }
}

// 4. .claude/commands/*.md
function checkCommands() {
  const dir = '.claude/commands';
  if (!fs.existsSync(dir)) return;
  const files = [];
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) files.push(p);
    }
  }
  walk(dir);

  add('info', dir, `共 ${files.length} 個 commands`);

  for (const f of files) {
    const content = readFileSafe(f);
    const { hasFm, fm } = parseFrontmatter(content);
    const lines = content.split('\n').length;

    if (hasFm && fm.description) {
      const len = (Array.isArray(fm.description) ? fm.description.join(' ') : fm.description).length;
      if (len > 60) {
        add('warn', f, `description ${len} chars,/help 顯示會截斷(建議 ≤60)`);
      }
    } else {
      add('warn', f, '缺 description,/help 列表會顯示首行 prompt(通常難看)');
    }

    if (lines > LIMITS.COMMAND_HARD) {
      add('warn', f, `${lines} 行,超過軟上限,考慮改寫成 skill`);
    }
  }
}

// 5. .claude/agents/*.md
function checkAgents() {
  const dir = '.claude/agents';
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

  add('info', dir, `共 ${files.length} 個 subagents`);

  for (const f of files) {
    const p = path.join(dir, f);
    const content = readFileSafe(p);
    const { hasFm, fm, bodyStartLine } = parseFrontmatter(content);

    if (!hasFm) {
      add('error', p, '缺 frontmatter');
      continue;
    }
    if (!fm.name) add('error', p, '缺 name');
    if (!fm.description) add('error', p, '缺 description');

    const systemLines = content.split('\n').length - bodyStartLine;
    if (systemLines > LIMITS.SUBAGENT_SYSTEM_HARD) {
      add('warn', p, `system prompt ${systemLines} 行,超過硬上限 ${LIMITS.SUBAGENT_SYSTEM_HARD}`);
    }

    // Skills preload 提醒
    if (!fm.skills) {
      add('info', p, '未列出 skills:。若需要 parent skill,須顯式 preload(不繼承)');
    }
  }
}

// 6.5 user-level ~/.claude/CLAUDE.md audit (2026-05-16 added)
function checkUserClaudeMd() {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) return;
  const userClaudeMd = path.join(home, '.claude', 'CLAUDE.md');
  if (!fs.existsSync(userClaudeMd)) {
    add('info', '~/.claude/CLAUDE.md', '不存在 user-level CLAUDE.md(個人偏好可省略)');
    return;
  }
  const lines = countLines(userClaudeMd);
  if (lines > 150) {
    add('warn', '~/.claude/CLAUDE.md', `${lines} 行,超過 user-level 硬上限 150。影響所有專案`);
  } else if (lines > 80) {
    add('warn', '~/.claude/CLAUDE.md', `${lines} 行,超過軟上限 80。建議精簡`);
  } else {
    add('ok', '~/.claude/CLAUDE.md', `${lines} 行,在預算內(soft 80 / hard 150)`);
  }
}

// 6.7 PhyCool Skill Cap audit (對齊 skill-creation-discipline.md §2,2026-05-16 added)
function checkPhycoolSkillCaps() {
  const dir = '.claude/skills';
  if (!fs.existsSync(dir)) return;
  const skillDirs = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  const phycoolPrefixed = skillDirs.filter(n => /^phycool-/.test(n));
  const generic = skillDirs.filter(n => !/^phycool-/.test(n));

  add('info', `${dir}/(PhyCool Cap)`, `phycool-* 數量: ${phycoolPrefixed.length} / Cap ${LIMITS.PHYCOOL_SKILLS_PHYCOOL_PREFIX_CAP}`);
  add('info', `${dir}/(PhyCool Cap)`, `generic 數量: ${generic.length} / Cap ${LIMITS.PHYCOOL_SKILLS_GENERIC_CAP}`);
  add('info', `${dir}/(PhyCool Cap)`, `總計: ${skillDirs.length} / Cap ${LIMITS.PHYCOOL_SKILLS_TOTAL_CAP}`);

  if (phycoolPrefixed.length > LIMITS.PHYCOOL_SKILLS_PHYCOOL_PREFIX_CAP) {
    add('error', dir, `phycool-* Skill 數 ${phycoolPrefixed.length} 超 Cap ${LIMITS.PHYCOOL_SKILLS_PHYCOOL_PREFIX_CAP}`);
  }
  if (generic.length > LIMITS.PHYCOOL_SKILLS_GENERIC_CAP) {
    add('error', dir, `通用 Skill 數 ${generic.length} 超 Cap ${LIMITS.PHYCOOL_SKILLS_GENERIC_CAP}`);
  }
  if (skillDirs.length > LIMITS.PHYCOOL_SKILLS_TOTAL_CAP) {
    add('error', dir, `總 Skill 數 ${skillDirs.length} 超 Cap ${LIMITS.PHYCOOL_SKILLS_TOTAL_CAP}`);
  }
}

// 6.8 .claude/hooks/ audit (2026-05-16 added per user request — Skill author 未涵蓋)
function checkHooks() {
  const dir = '.claude/hooks';
  if (!fs.existsSync(dir)) return;
  const all = fs.readdirSync(dir, { withFileTypes: true });
  const jsFiles = all.filter(e => e.isFile() && e.name.endsWith('.js')).map(e => e.name);
  const testFiles = jsFiles.filter(n => n.endsWith('.test.js'));
  const productionFiles = jsFiles.filter(n => !n.endsWith('.test.js'));

  add('info', dir, `共 ${jsFiles.length} 個 .js (production: ${productionFiles.length} / tests: ${testFiles.length})`);

  if (productionFiles.length > LIMITS.PHYCOOL_HOOKS_CAP) {
    add('warn', dir, `production hooks ${productionFiles.length} 超 Cap ${LIMITS.PHYCOOL_HOOKS_CAP},考慮整併`);
  }

  // 對每個 production hook 檔做品質檢查
  for (const f of productionFiles) {
    const p = path.join(dir, f);
    const content = readFileSafe(p);
    if (!content) continue;

    // Best practice: shebang + JSON parse try-catch + exit 0 fail-safe
    const normalized = content.replace(/\r\n/g, '\n');
    const firstLine = normalized.split('\n')[0];
    const hasShebang = firstLine.startsWith('#!');
    const hasTryCatch = /try\s*\{[\s\S]*JSON\.parse/.test(normalized);
    const hasExitZeroFailsafe = /catch\s*[\s\S]*\{[\s\S]*process\.exit\(0\)/.test(normalized);

    if (!hasShebang) {
      add('warn', p, '缺 shebang `#!/usr/bin/env node`(Linux/Mac 直接執行可能失敗)');
    }
    if (!hasTryCatch && content.includes('JSON.parse')) {
      add('warn', p, 'JSON.parse 缺 try-catch(malformed input 會 throw,阻擋 Claude)');
    }
    if (!hasExitZeroFailsafe && content.includes('process.stdin')) {
      add('warn', p, '缺 fail-safe `catch { process.exit(0) }`(advisory hook 不該 throw)');
    }
  }

  // 檢查 settings.json 引用的 hook 是否都存在
  const settingsPath = '.claude/settings.json';
  if (fs.existsSync(settingsPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const missingHooks = [];
      for (const groups of Object.values(cfg.hooks || {})) {
        for (const g of groups) {
          for (const h of (g.hooks || [])) {
            const m = (h.command || '').match(/node\s+(\.claude\/hooks\/[^\s"']+\.js)/);
            if (m) {
              const hookPath = m[1].replace(/\\/g, '/');
              if (!fs.existsSync(hookPath)) {
                missingHooks.push(hookPath);
              }
            }
          }
        }
      }
      if (missingHooks.length > 0) {
        add('error', settingsPath, `引用的 hook 不存在: ${missingHooks.join(', ')}`);
      }
    } catch (e) {
      // settings.json 解析失敗已在 checkSettingsJson 報告,此處不重複
    }
  }
}

// 7. .claude/settings.json
function checkSettingsJson() {
  const f = '.claude/settings.json';
  if (!fs.existsSync(f)) {
    add('warn', f, '不存在 settings.json');
    return;
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    add('error', f, `JSON syntax 錯誤: ${e.message}`);
    return;
  }
  add('ok', f, 'JSON syntax 合法');

  // Deprecated env
  if (cfg.env) {
    for (const k of DEPRECATED_ENV) {
      if (k in cfg.env) {
        add('error', f, `env.${k} 已 deprecated(Opus 4.7),請移除`);
      }
    }
    // Autocompact 過晚
    const pct = parseInt(cfg.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE);
    if (!isNaN(pct) && pct > 70) {
      add('warn', f, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=${pct},建議 ≤60。1M context 過晚 compact 已造成 lost-in-the-middle`);
    }
  }

  // .gemini / .agent permissions(Single-Engine Mode 後應移除)
  const allow = cfg.permissions?.allow || [];
  const ghosts = allow.filter(p => /\.(gemini|agent)/.test(p));
  if (ghosts.length > 0) {
    add('warn', f, `permissions.allow 仍含 ${ghosts.length} 項 .gemini/.agent 條目,Single-Engine Mode 後可移除`);
  }

  // Hooks 統計
  const hooks = cfg.hooks || {};
  let totalHooks = 0;
  let syncStopHooks = 0;
  let stopTimeoutSum = 0;
  for (const [event, groups] of Object.entries(hooks)) {
    for (const g of groups) {
      for (const h of (g.hooks || [])) {
        totalHooks++;
        if (event === 'Stop' && !h.async) {
          syncStopHooks++;
          stopTimeoutSum += h.timeout || 60000;
        }
      }
    }
  }
  add('info', f, `共 ${totalHooks} 個 hooks`);
  if (syncStopHooks > 3) {
    add('warn', f, `Stop 事件有 ${syncStopHooks} 個同步 hook,timeout 合計 ${stopTimeoutSum}ms。建議 ≥3 個改 async: true`);
  }
}

// ─────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────

console.log('# Claude Code 配置健檢報告\n');
console.log(`掃描時間: ${new Date().toISOString()}`);
console.log(`掃描根目錄: ${process.cwd()}\n`);

checkClaudeMd();
checkUserClaudeMd();  // 2026-05-16: 加 user-level ~/.claude/CLAUDE.md audit
checkRules();
checkSkills();
checkPhycoolSkillCaps();  // 2026-05-16: PhyCool-specific Cap audit
checkHooks();             // 2026-05-16: hooks audit (previously not audited)
checkCommands();
checkAgents();
checkSettingsJson();

// 輸出
const groups = { error: [], warn: [], info: [], ok: [] };
for (const f of findings) groups[f.severity].push(f);

console.log('## 摘要\n');
console.log(`- 🔴 Errors: ${groups.error.length}`);
console.log(`- 🟡 Warnings: ${groups.warn.length}`);
console.log(`- 🔵 Info: ${groups.info.length}`);
console.log(`- 🟢 OK: ${groups.ok.length}\n`);

if (groups.error.length > 0) {
  console.log('## 🔴 必修\n');
  for (const f of groups.error) console.log(`- **${f.file}**: ${f.msg}`);
  console.log();
}

if (groups.warn.length > 0) {
  console.log('## 🟡 建議\n');
  for (const f of groups.warn) console.log(`- **${f.file}**: ${f.msg}`);
  console.log();
}

if (groups.info.length > 0) {
  console.log('## 🔵 觀測\n');
  for (const f of groups.info) console.log(`- **${f.file}**: ${f.msg}`);
  console.log();
}

console.log('\n---');
console.log('完整規範請讀 .claude/skills/cc-config-author/references/');
console.log('已知 bugs 影響請讀 references/known-bugs.md');

process.exit(groups.error.length > 0 ? 1 : 0);