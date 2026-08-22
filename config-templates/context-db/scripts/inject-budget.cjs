// ============================================================
// [bwu-14-inject-budget-dimension-and-mirror] Layer 12 注入預算 —— 唯一定義站點
//
// 🔴 為何是一處定義、兩處消費而非各自內聯:
//   本卡開工前，Layer 12（ECC Instinct 注入）預算存在兩份獨立實作 —— hook 側
//   `pre-prompt-rag.js` 已於 bwu-11 改字元制（450 字元），DevConsole 觀測端
//   `emergence.ts` 仍以 1200 token 計，且兩者的 entry 格式（markdown bullet vs
//   `[Instinct] trigger → action`）與 used 起算基準（hook 含 header 長度起算 /
//   端點從 0 起算）亦不同。單純對齊常數值不足以讓儀表板變準，因為 used 的計算
//   基準本身就不同 —— 真正的 parity 需要「常數 + entry 格式 + 起算基準」三者
//   共用，而非兩份同值常數。
//
// 🔴 為何是 .cjs 而非 .js:
//   `.context-db/package.json` 宣告 "type":"module"（`.context-db/scripts/` 無
//   自身 package.json，向上層目錄繼承此設定），而 `.claude/hooks/*.js` 是
//   CommonJS（`require('./_lib')`）。要讓兩邊消費同一份定義，本檔必須是 .cjs
//   —— ESM 側以 createRequire 取用。反過來寫會炸（"module is not defined in
//   ES module scope"），`ctrl-unread-sql.cjs:15-19` 具名記載同型缺陷，whp-8
//   曾實際踩到，且隔離單元測試測不出來（直接 import 繞過 require() 的實際路徑
//   解析），唯端到端 spawn / build 才捕捉得到。
// ============================================================
'use strict';

/**
 * Layer 12（ECC Instinct）注入預算，單位字元。
 * bwu-11 由 1200 token 改為此值（hook 側單獨宣告）；bwu-14 收斂為兩側共用的唯一定義站點。
 */
const INSTINCT_CHARS = 450;

/**
 * 起算基準（header）—— hook 側 `used` 從此字串長度起算（含 header），
 * 端點若要與 hook 端 parity，`used` 亦須以此值起算，而非從 0 開始。
 */
const INSTINCT_HEADER = '## 🧠 ECC 直覺（機器從開發行為湧現 · 已依當前視窗採納分數過濾）\n\n'
  + '以下為已驗證的 instinct,反映過往開發行為累積的模式,依當前視窗情境採納分數篩選後列出,供參考:\n\n';

/**
 * 單則 instinct 的注入格式（hook 側 markdown bullet，兩側共用）。
 * @param {{adoption_score: number, trigger: string, action: string}} row
 * @returns {string}
 */
function formatInstinctEntry(row) {
  return `- (score ${row.adoption_score}) ${row.trigger} → ${row.action}\n`;
}

module.exports = { INSTINCT_CHARS, INSTINCT_HEADER, formatInstinctEntry };
