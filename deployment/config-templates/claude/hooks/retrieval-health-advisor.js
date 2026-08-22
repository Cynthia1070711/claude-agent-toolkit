#!/usr/bin/env node
// ============================================================
// retrieval-health-advisor.js — SessionStart 檢索健康告警(P1-B · G8 + G12)
// ============================================================
// 改善計畫 §5 P1-B + §9-E(V7 證偽 A4「暫緩」前提 → retrieval-health 該補)。
// 補齊「自動化最後一哩」: FTS5/embedding 全自動,但結構引擎與健康監測缺 surface。
//
// 偵測 4 訊號(全 read-only · fail-open · 健康時靜默無輸出):
//   ① GitNexus staleness : .gitnexus/meta.json lastCommit ≠ git HEAD(解 §9-A4 hook 不能調 MCP → 直接讀 meta.json)
//   ② doc embedding coverage < 95%(重用 validate-data.js 查詢 · V7 漂移防線)
//   ③ embedding_queue pending > 50
//   ④ god_nodes computed_at > 7d(symbol graph stale → 提示 refresh-all-retrieval)
//
// remediation: 一鍵 SKILL `node .context-db/scripts/refresh-all-retrieval.cjs`(--with-gitnexus 含 GitNexus)。
// 不在 hook 內跑 npx gitnexus analyze(會超時/燒 CPU)→ 純 advisory(對齊「先 advisory 觀察」)。
//
// 輸出: 有 issue → stdout 陳述句 advisory(SessionStart 注入 context · exit 0);健康 → 無輸出 exit 0。
// 鐵則: 永遠 exit 0(fail-open,絕不阻斷 session 啟動)。除錯訊息只走 stderr。
//
// 2026-05-27 · Track: 開發環境檢索架構改善 P1-B · 走 Skill(hooks-mechanization) 7-step
// ============================================================
'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const BASE = path.join(PROJECT_ROOT, '.context-db');
const DB_PATH = path.join(BASE, 'phycool.db');
const GITNEXUS_META = path.join(PROJECT_ROOT, '.gitnexus', 'meta.json');

const GOD_NODES_STALE_DAYS = 7;
const QUEUE_PENDING_THRESHOLD = 50;
const DOC_COVERAGE_MIN = 95;

function main() {
  const issues = [];

  // ① GitNexus staleness — 讀 meta.json lastCommit vs git HEAD(不調 MCP)
  try {
    if (fs.existsSync(GITNEXUS_META)) {
      const meta = JSON.parse(fs.readFileSync(GITNEXUS_META, 'utf8').replace(/^﻿/, ''));
      const head = execSync('git rev-parse HEAD', { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 1500 }).trim();
      if (meta.lastCommit && head && meta.lastCommit !== head) {
        issues.push(`GitNexus index 落後 HEAD(index@${meta.lastCommit.slice(0, 8)} vs HEAD@${head.slice(0, 8)})— 結構衝擊評估可能 stale,建議跑 npx gitnexus analyze`);
      }
    }
  } catch { /* fail-open */ }

  // ②③④ DB 健康(read-only · 從 .context-db/node_modules 載 better-sqlite3)
  try {
    const Database = require(path.join(BASE, 'node_modules', 'better-sqlite3'));
    const db = new Database(DB_PATH, { readonly: true });
    try {
      // ② doc embedding coverage
      const docTotal = db.prepare('SELECT COUNT(*) n FROM document_chunks').get().n;
      const docEmbed = db.prepare('SELECT COUNT(*) n FROM document_embeddings WHERE embedding IS NOT NULL').get().n;
      if (docTotal > 0) {
        const cov = (docEmbed / docTotal) * 100;
        if (cov < DOC_COVERAGE_MIN) {
          issues.push(`doc embedding coverage ${cov.toFixed(1)}% < ${DOC_COVERAGE_MIN}%(${docTotal - docEmbed} chunks 缺向量)— Layer 6 語意召回降級,跑 backfill-doc-embeddings.js 或 maintenance-refresh.cjs 補`);
        }
      }

      // ③ embedding_queue pending
      const pending = db.prepare('SELECT COUNT(*) n FROM embedding_queue WHERE processed = 0').get().n;
      if (pending > QUEUE_PENDING_THRESHOLD) {
        issues.push(`embedding_queue pending ${pending} > ${QUEUE_PENDING_THRESHOLD} — 向量增量積壓,跑 incremental-embed.js 消化`);
      }

      // ④ god_nodes staleness(computed_at 距今 > 7d)
      const gn = db.prepare('SELECT MAX(computed_at) m FROM god_nodes').get().m;
      if (gn) {
        const ageDays = (Date.now() - new Date(String(gn).replace(' ', 'T')).getTime()) / 86400000;
        if (ageDays > GOD_NODES_STALE_DAYS) {
          issues.push(`god_nodes centrality 已 ${ageDays.toFixed(0)} 天未重算(>${GOD_NODES_STALE_DAYS}d)— symbol 結構權重 stale,跑 refresh-all-retrieval.cjs 更新`);
        }
      }
    } finally {
      db.close();
    }
  } catch { /* fail-open(DB 不可達 / better-sqlite3 缺) */ }

  // 輸出: 健康靜默;有 issue → 陳述句 advisory(SessionStart stdout 注入 context)
  if (issues.length > 0) {
    const lines = issues.map((s, i) => `  ${i + 1}. ${s}`).join('\n');
    process.stdout.write(
      `[檢索健康] 偵測到 ${issues.length} 項檢索架構 staleness(advisory · 不阻斷):\n${lines}\n` +
      `  一鍵更新: node .context-db/scripts/refresh-all-retrieval.cjs（--with-gitnexus 含 GitNexus reindex）\n`
    );
  }
  process.exit(0);
}

try { main(); } catch (e) { process.stderr.write(`[retrieval-health-advisor] ${e.message}\n`); process.exit(0); }
