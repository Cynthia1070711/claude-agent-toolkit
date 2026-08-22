#!/usr/bin/env node
/**
 * scripts/check-traditional-chinese.cjs — Traditional Chinese drift detector
 *
 * 觸發背景: 2026-05-02 td-privacy-v2-runtime-activation CR 發現 326 處「對齐」(齊→齐 簡體漏網)
 * 跨 83 個檔案。根因: LLM token-level greedy decoding 在 Traditional Chinese 上下文中,
 * 個別簡體字符 token 因訓練資料中簡中頻次遠高於繁中,容易被選中(尤其 14-stroke 繁體 vs 6-stroke 簡體
 * 落差大的字符)。
 *
 * 用途:
 * - CI / pre-commit: 阻擋簡體字混入 zh-TW 專案
 * - 手動掃描: node scripts/check-traditional-chinese.cjs [--fix] [--paths a,b,c]
 *
 * Usage:
 *   node scripts/check-traditional-chinese.cjs                  # 掃描預設路徑(advisory)
 *   node scripts/check-traditional-chinese.cjs --fix            # 自動修復(批次 replace)
 *   node scripts/check-traditional-chinese.cjs --paths "src/"   # 指定路徑
 *   node scripts/check-traditional-chinese.cjs --strict         # exit 1 if any hit
 *
 * Exit codes:
 *   0 = no hits OR --fix successful
 *   1 = hits found AND --strict OR --fix failed
 */

const fs = require('fs');
const path = require('path');

// 高風險簡體→繁體對應表(優先級: PhyCool zh-TW 專案最容易出現的 drift)
// 規則: 只列出**單向 1:1 映射** + **PhyCool 上下文中應為繁體**的字符。
// 不列入: 「對」「為」「們」等 PhyCool 已普遍用繁體不易出錯的字符。
const SIMPLIFIED_TO_TRADITIONAL = {
  // 高頻技術詞彙 high-risk
  '齐': '齊',     // 對齊/对齐(alignment)
  '齿': '齒',     // 齒輪/齿轮(gear)
  '龙': '龍',     // 龍/龙
  '飞': '飛',     // 飛行/飞行
  '丽': '麗',     // 華麗/华丽
  '灵': '靈',     // 靈活/灵活
  '虑': '慮',     // 考慮/考虑
  '虚': '虛',     // 虛擬/虚拟
  '虫': '蟲',     // 蟲/虫
  '观': '觀',     // 觀察/观察
  '论': '論',     // 討論/讨论
  '诉': '訴',     // 申訴/申诉
  '语': '語',     // 語言/语言
  '议': '議',     // 議題/议题
  '认': '認',     // 認識/认识
  '设': '設',     // 設定/设定
  '试': '試',     // 試驗/试验
  '诊': '診',     // 診斷/诊断
  '调': '調',     // 調整/调整
  '请': '請',     // 請求/请求
  '诸': '諸',     // 諸如/诸如
  '读': '讀',     // 讀取/读取
  '课': '課',     // 課程/课程
  '谁': '誰',     // 誰/谁
  '谅': '諒',     // 諒解/谅解
  '谈': '談',     // 談話/谈话
  '谢': '謝',     // 謝謝/谢谢
  '负': '負',     // 負責/负责
  '货': '貨',     // 貨幣/货币
  '质': '質',     // 質量/质量
  '贸': '貿',     // 貿易/贸易
  '资': '資',     // 資料/资料
  '赔': '賠',     // 賠償/赔偿
  '赖': '賴',     // 依賴/依赖
  '购': '購',     // 購買/购买
  '贵': '貴',     // 貴客/贵客
  '赞': '讚',     // 讚美/赞美
  '辩': '辯',     // 辯論/辩论
  '边': '邊',     // 邊界/边界
  '运': '運',     // 運作/运作
  '过': '過',     // 過程/过程
  '远': '遠',     // 遠程/远程
  '违': '違',     // 違反/违反
  '迟': '遲',     // 遲到/迟到
  '适': '適',     // 適合/适合
  '选': '選',     // 選擇/选择
  '递': '遞',     // 遞迴/递归
  '醒': '醒',     // (already same)
  '钟': '鐘',     // 時鐘/时钟
  '银': '銀',     // 銀行/银行
  '锁': '鎖',     // 鎖定/锁定
  '错': '錯',     // 錯誤/错误
  '镜': '鏡',     // 鏡像/镜像
  '门': '門',     // 門禁/门禁
  '问': '問',     // 問題/问题
  '阀': '閥',     // 閥值/阀值
  '闭': '閉',     // 關閉/关闭
  '问题': '問題', // 問題/问题(完整詞先匹配避免歧義)
  '间': '間',     // 之間/之间
  '阅': '閱',     // 閱讀/阅读
  '阶': '階',     // 階段/阶段
  '险': '險',     // 風險/风险
  '随': '隨',     // 隨機/随机
  '隐': '隱',     // 隱私/隐私
  '颗': '顆',     // 一顆/一颗
  '题': '題',     // 題目/题目
  '颜': '顏',     // 顏色/颜色
  '类': '類',     // 類型/类型
  '风': '風',     // 風險/风险
  '飞': '飛',     // 飛行(dup)
  '驶': '駛',     // 駕駛/驾驶
  '验': '驗',     // 驗證/验证
  '骤': '驟',     // 步驟/步骤
  '魔': '魔',     // (same)
  '鸟': '鳥',     // 鳥/鸟
  '鸿': '鴻',     // 鴻溝/鸿沟
  '鼓': '鼓',     // (same)
  '鼠': '鼠',     // (same)
  '鸡': '雞',     // 雞/鸡
  '鱼': '魚',     // 魚/鱼
  '齐': '齊',     // (dup, alignment 高頻)
};

// 已 reviewed 不列入掃描的字符(歷史包袱 / 通用 / 已用繁體):
// - 个 (counter): PhyCool 全用 個
// - 们 (plural): PhyCool 全用 們
// - 这 (this): PhyCool 全用 這
// - 个 (counter): PhyCool 全用 個

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const strict = args.includes('--strict');
const pathsArg = args.find(a => a.startsWith('--paths='));
const customPaths = pathsArg ? pathsArg.replace('--paths=', '').split(',') : null;

const DEFAULT_PATHS = [
  'src/YourApp',
  'docs',
  '.claude',
  '.gemini',
  '.agent',
  '_bmad',
  '.context-db',
  'CLAUDE.md',
  'CLAUDE.local.md',
];

const FILE_EXTENSIONS = ['.cs', '.cshtml', '.md', '.js', '.cjs', '.mjs', '.json', '.yaml', '.yml', '.ps1', '.txt'];

// 排除路徑(已知含 zh-CN / zh-Hans 簡中翻譯資料,簡體字符屬正常):
//   - I18nResourceSeeder.cs / *I18n*Resources*.cs(多語系翻譯來源,zh-CN 條目簡體合理)
//   - **/dist/, **/bin/, **/obj/, **/node_modules/(build / package output)
//   - **/Migrations/*.Designer.cs(EF auto-generated 含舊資料 snapshot)
//   - claude token減量策略研究分析/(研究蒐集池,未必繁中)
const EXCLUDE_PATTERNS = [
  /node_modules/,
  /[\\/](bin|obj|dist|out|coverage)[\\/]/,
  /[\\/]Migrations[\\/].*\.Designer\.cs$/,
  /I18nResourceSeeder\.cs$/i,
  /[\\/]i18n[\\/]/i,
  /[\\/]ClientApp[\\/]dist[\\/]/i,
  /\.min\.(js|css)$/i,
  /^claude token減量策略研究分析[\\/]/,
  /[\\/]worktrees[\\/]/,          // 2026-06-06: agent worktree 為隔離 git 工作區(主 repo 快照副本),主 repo 工具禁掃禁改(--fix 污染雙 worktree 各 54 檔事故)
  /[\\/]logs[\\/]/,               // 2026-06-06: pipeline 派發 prompt / log 非內容檔
];

// ─── 豁免機制(2026-06-06 建立,觸發:--fix 誤傷「故意簡體」事故)───
// 三層防護:
//   L1 結構排除   — EXCLUDE_PATTERNS(worktrees / i18n / build output)
//   L2 自動啟發   — H-A 同行繁簡並列(教學箭頭「對齊→对齐」/ aria-label 繁簡欄)該字豁免
//                  H-B 行含標記詞(簡體/简体/zh-CN/zh_CN/簡繁)整行豁免(自檢題/違規描述/zh-CN 字串)
//   L3 顯式造冊   — scripts/check-tc-exemptions.json(file 級整檔 / line 級 match 子串,必附 reason)
// 豁免處掃描時標 EXEMPT 透明列出(不靜默),--fix 絕不觸碰。
const EXEMPTIONS_FILE = path.join(__dirname, 'check-tc-exemptions.json');
const HB_MARKERS = ['簡體', '简体', 'zh-CN', 'zh_CN', 'zh-cn', '簡繁'];

function loadExemptions() {
  try {
    const raw = fs.readFileSync(EXEMPTIONS_FILE, 'utf8').replace(/^﻿/, '');
    const data = JSON.parse(raw);
    return Array.isArray(data.entries) ? data.entries : [];
  } catch (e) {
    return []; // 造冊檔不存在 / 壞損 → 僅啟發層生效(fail-open 不阻掃描)
  }
}

function normalizePath(p) {
  return p.replace(/\\/g, '/');
}

function getFileExemption(file, exemptions) {
  const norm = normalizePath(file);
  const fileEntry = exemptions.find(e => e.scope === 'file' && norm.endsWith(normalizePath(e.path)));
  const lineEntries = exemptions.filter(e => e.scope === 'line' && norm.endsWith(normalizePath(e.path)));
  return { fileEntry, lineEntries };
}

// 判定單行中某簡體字是否豁免;回傳豁免原因字串或 null
function lineExemptReason(line, simp, trad, lineEntries) {
  if (line.includes(trad) ) return 'H-A 繁簡並列';            // 教學箭頭 / 對照表 / aria-label 繁簡欄
  if (HB_MARKERS.some(m => line.includes(m))) return 'H-B 標記詞'; // 自檢題 / 違規描述 / zh-CN 字串
  const entry = lineEntries.find(e => e.match && line.includes(e.match));
  if (entry) return `造冊:${entry.reason.slice(0, 24)}`;
  return null;
}

function isExcluded(filePath) {
  return EXCLUDE_PATTERNS.some(re => re.test(filePath));
}

function walk(dirOrFile, files) {
  if (!fs.existsSync(dirOrFile)) return;
  const stat = fs.statSync(dirOrFile);
  if (stat.isFile()) {
    if (isExcluded(dirOrFile)) return;
    if (FILE_EXTENSIONS.some(ext => dirOrFile.endsWith(ext))) {
      files.push(dirOrFile);
    }
    return;
  }
  if (stat.isDirectory()) {
    if (dirOrFile.endsWith('node_modules') || dirOrFile.endsWith('bin') || dirOrFile.endsWith('obj')) return;
    if (isExcluded(dirOrFile + path.sep)) return;
    for (const entry of fs.readdirSync(dirOrFile)) {
      walk(path.join(dirOrFile, entry), files);
    }
  }
}

function main() {
  const paths = customPaths || DEFAULT_PATHS;
  const allFiles = [];
  for (const p of paths) walk(p, allFiles);

  const exemptions = loadExemptions();
  const pairs = Object.entries(SIMPLIFIED_TO_TRADITIONAL).filter(([s, t]) => s !== t);

  const hits = [];                 // 真違規(可 fix)
  const exemptFiles = [];          // file 級豁免命中(透明列出)
  const exemptLineLog = new Map(); // reason → count(line 級豁免統計)
  let fixedFiles = 0;
  let totalReplacements = 0;

  for (const file of allFiles) {
    let content;
    try { content = fs.readFileSync(file, 'utf8'); } catch (e) { continue; }
    if (!content) continue;
    if (!pairs.some(([simp]) => content.includes(simp))) continue; // 快速跳過無簡體檔

    const { fileEntry, lineEntries } = getFileExemption(file, exemptions);
    if (fileEntry) {
      exemptFiles.push({ file, reason: fileEntry.reason });
      continue; // 整檔豁免:不報違規、不 fix
    }

    // line-based 逐行掃描。
    // 故意不做 CRLF/BOM normalize(crlf-normalize-discipline.md 豁免情境):本工具需 byte-faithful
    // 寫回原檔,normalize 會把 CRLF 檔整檔轉 LF 造成大量行尾噪音 diff。安全性:所有判定只用
    // includes()(無 === 嚴格比對),行尾 \r 與首行 BOM 附著於行字串不影響子串判定;
    // 寫回 lines.join('\n') 原樣復原各行尾 \r。
    const lines = content.split('\n');
    const fileHits = [];   // { simp, trad, count }(真違規)
    let fileExemptCount = 0;
    let changed = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const [simp, trad] of pairs) {
        if (!line.includes(simp)) continue;
        const reason = lineExemptReason(line, simp, trad, lineEntries);
        if (reason) {
          fileExemptCount++;
          exemptLineLog.set(reason, (exemptLineLog.get(reason) || 0) + 1);
          continue; // 豁免:該行該字保留原樣
        }
        const count = line.split(simp).length - 1;
        const rec = fileHits.find(h => h.simp === simp);
        if (rec) rec.count += count; else fileHits.push({ simp, trad, count });
        if (fix) {
          lines[i] = lines[i].split(simp).join(trad);
          changed = true;
        }
      }
    }

    if (fileHits.length > 0) {
      hits.push({ file, fileHits, fileExemptCount });
      if (fix && changed) {
        try {
          fs.writeFileSync(file, lines.join('\n'), { encoding: 'utf8' });
          fixedFiles++;
          totalReplacements += fileHits.reduce((s, h) => s + h.count, 0);
        } catch (e) {
          console.error(`[ERROR] Failed to write ${file}: ${e.message}`);
        }
      }
    }
  }

  // 豁免透明報告(不靜默)
  const exemptLineTotal = [...exemptLineLog.values()].reduce((a, b) => a + b, 0);
  if (exemptFiles.length > 0 || exemptLineTotal > 0) {
    console.log(`\nℹ EXEMPT(故意簡體,不計違規、--fix 不觸碰):`);
    for (const { file, reason } of exemptFiles) {
      console.log(`  [整檔] ${file} — ${reason.slice(0, 60)}`);
    }
    for (const [reason, count] of exemptLineLog.entries()) {
      console.log(`  [行級] ${reason} × ${count} 處`);
    }
  }

  if (fix) {
    console.log(`\n✅ Auto-fix complete: ${fixedFiles} files modified, ${totalReplacements} replacements(豁免保留 ${exemptLineTotal} 處 + ${exemptFiles.length} 整檔)`);
    return 0;
  }

  if (hits.length === 0) {
    console.log('✅ No simplified Chinese drift detected in Traditional Chinese files');
    return 0;
  }

  console.log(`\n⚠ Found Simplified Chinese drift in ${hits.length} files:\n`);
  for (const { file, fileHits } of hits.slice(0, 50)) {
    console.log(`  ${file}`);
    for (const { simp, trad, count } of fileHits) {
      console.log(`    ${simp} → ${trad} (${count}x)`);
    }
  }
  if (hits.length > 50) {
    console.log(`  ... and ${hits.length - 50} more files`);
  }
  console.log(`\nTotal: ${hits.length} files. Run with --fix to auto-correct.`);

  return strict ? 1 : 0;
}

process.exit(main());
