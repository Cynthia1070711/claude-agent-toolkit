#!/usr/bin/env node
/**
 * record-phase-timestamp.js
 *
 * 為 BMAD workflow(create-story / dev-story / code-review)手動執行情境補強
 * stories 表 `*_started_at` / `*_completed_at` 時間戳寫入。
 *
 * 背景:
 *   Pipeline(story-pipeline-interactive.ps1)透過 `Update-DbStatus` 寫入時間戳,
 *   但**手動**執行 workflow(不透過 pipeline)時會完全繞過此機制。
 *
 *   本 helper 補上這個缺口:在 workflow step-01 載入 Story 後立即呼叫一次,
 *   以 COALESCE 保護避免覆蓋 pipeline 已寫入的值(幂等)。
 *
 * 用法:
 *   node scripts/record-phase-timestamp.js <story_id> <phase> [--ts <ISO8601>]
 *
 * Phase 選項(全部 COALESCE 保護,避免覆蓋既有值):
 *   create-start    → 寫 stories.create_started_at
 *   create-complete → 寫 stories.create_completed_at
 *   dev-start       → 寫 stories.started_at
 *   dev-complete    → 寫 stories.completed_at
 *   review-start    → 寫 stories.review_started_at
 *   review-complete → 寫 stories.review_completed_at
 *
 * Flags:
 *   --ts <ISO8601>  覆蓋預設 taiwanNow(),用指定時間寫入(supports backfill 歷史 phase 時間)
 *                   格式: '2026-04-21T08:10:00+08:00' (must include +08:00 timezone)
 *                   v2.0.0 新增 — td-rule-violation-auto-detect-hook Round-4 rescue 需求
 *
 * 行為:
 *   - 預設時間戳用 Taiwan UTC+8 (ISO 8601 with +08:00 offset); --ts 可覆蓋
 *   - **全部用 COALESCE 保護** — 只在欄位為 NULL 時寫入,絕不覆蓋既有值
 *   - 若需強制更新已寫入的 complete 時間戳,請直接用 SQL 或 upsert-story.js
 *     (避免 helper 誤覆蓋 pipeline/workflow 已寫入的真實時間)
 *   - 始終同步更新 stories.updated_at(即使 COALESCE 沒變動目標欄位)
 *   - 寫入失敗非致命(exit 0 + stderr warning),不阻斷 workflow
 *   - 找不到 story_id 非致命(exit 0 + warning)
 *
 * Exit code:
 *   0 = 成功 OR 非致命警告(找不到 story / DB 寫入失敗)
 *   1 = 參數錯誤
 *
 * @version 2.3.0 — rerun 判準改以 worker_runs.attempt > 1 為準(原單憑「欄位已有值」會把 create-story 單輪內三個 create-start 呼叫點的後兩次誤判為重跑,使每張正常建卡都被標偽 [rerun];三呼叫點為不同情境分工不可刪,故改判準)
 * @version 2.2.1 — rerun 標記限 *-start phases(*-complete preserved = 同 run 內 upsert 先寫的正常時序,非重跑;bwu-7 CR 實證誤標修正)
 * @version 2.2.0 — 重跑偵測自動標註 pipeline_notes(欄位已有值時;--ts backfill 除外)+ PHYCOOL_DB_PATH 測試隔離
 * @version 2.1.0 — dev-start / review-start 附帶原子 status 推進(I2/I8 enforcement,2026-07-29 看板失真修復)
 * @story td-rule-violation-auto-detect-hook (Round-4 rescue 2026-04-21) — 加 --ts override 支援 backfill 歷史 CR start time
 * @see .claude/skills/claude-launcher-interactive/scripts/story-pipeline-interactive.ps1:247-253 (pipeline 原寫入點)
 * @see .claude/rules/story-lifecycle-invariants.md v2.0.0 I8/I9
 */

'use strict';

const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// Phase 映射
// ─────────────────────────────────────────────────────────────────────────────

// 全部 COALESCE 保護 — 避免覆蓋既有值(safety by default)
// 強制覆蓋請直接用 SQL 或 upsert-story.js,避免 helper 意外污染
//
// [2026-07-29 hotfix] dev-start / review-start 附帶原子 status 推進(promote,只進不退):
// 本 helper 為直接 SQL 不經 upsert-story.js,原本只寫時間戳 → I2/I8 不變量在階段執行
// 期間持續違反,DevConsole /stories 看板卡片停留前一狀態欄(使用者 2026-07-29 實測回報)。
// *-complete 刻意不在此推進 — workflow 收尾走 upsert-story.js merge,由其
// AUTO_PROMOTE_RULES 處理(同步補 started_at → in-progress 條目),避免雙寫入口。
const PHASE_MAP = {
    'create-start':    { column: 'create_started_at'    },
    'create-complete': { column: 'create_completed_at'  },
    'dev-start':       { column: 'started_at',          promote: { from: 'ready-for-dev', to: 'in-progress' } },
    'dev-complete':    { column: 'completed_at'         },
    'review-start':    { column: 'review_started_at',   promote: { from: 'in-progress',   to: 'review' } },
    'review-complete': { column: 'review_completed_at'  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 參數解析 (v2.0.0 — 支援 --ts <ISO8601> override)
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let storyId = null;
let phase = null;
let tsOverride = null;

for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--ts') {
        tsOverride = args[++i] || null;
    } else if (!storyId) {
        storyId = a;
    } else if (!phase) {
        phase = a;
    }
}

if (!storyId || !phase) {
    process.stderr.write(
        'Usage: node scripts/record-phase-timestamp.js <story_id> <phase> [--ts <ISO8601>]\n' +
        'Phase: ' + Object.keys(PHASE_MAP).join(' | ') + '\n' +
        '--ts  ISO8601 with +08:00 timezone (e.g., 2026-04-21T08:10:00+08:00) — overrides taiwanNow()\n'
    );
    process.exit(1);
}

const config = PHASE_MAP[phase];
if (!config) {
    process.stderr.write(`[error] Unknown phase: ${phase}\n`);
    process.stderr.write('Valid phases: ' + Object.keys(PHASE_MAP).join(' | ') + '\n');
    process.exit(1);
}

// --ts 驗證:必須含時區(+08:00 或 Z),避免 ambiguous local time
if (tsOverride) {
    const tsPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/;
    if (!tsPattern.test(tsOverride)) {
        process.stderr.write(`[error] --ts '${tsOverride}' invalid ISO8601 (must include +08:00 / Z timezone)\n`);
        process.stderr.write(`[error] Example: 2026-04-21T08:10:00+08:00\n`);
        process.exit(1);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Taiwan UTC+8 timestamp (ISO 8601 with explicit +08:00 offset)
// ─────────────────────────────────────────────────────────────────────────────

function taiwanNow() {
    const now = new Date();
    // 取 UTC 分量手動加 8 小時,避免受執行主機時區影響
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const hours = now.getUTCHours() + 8;

    // 處理跨日
    const dateObj = new Date(Date.UTC(year, now.getUTCMonth(), now.getUTCDate(), hours, now.getUTCMinutes(), now.getUTCSeconds()));
    const y = dateObj.getUTCFullYear();
    const mo = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getUTCDate()).padStart(2, '0');
    const h = String(dateObj.getUTCHours()).padStart(2, '0');
    const mi = String(dateObj.getUTCMinutes()).padStart(2, '0');
    const s = String(dateObj.getUTCSeconds()).padStart(2, '0');

    return `${y}-${mo}-${d}T${h}:${mi}:${s}+08:00`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB 寫入(非致命錯誤處理)
// ─────────────────────────────────────────────────────────────────────────────

// PHYCOOL_DB_PATH override 對齊 upsert-debt.js 既有範式(測試隔離用)
const dbPath = process.env.PHYCOOL_DB_PATH || path.join(__dirname, '..', '.context-db', 'phycool.db');
const betterSqlitePath = path.join(__dirname, '..', '.context-db', 'node_modules', 'better-sqlite3');

function recordTimestamp() {
    let Database;
    try {
        Database = require(betterSqlitePath);
    } catch (e) {
        process.stderr.write(`[warn] better-sqlite3 not available: ${e.message}\n`);
        process.stderr.write('[warn] timestamp write skipped (non-fatal)\n');
        process.exit(0);
    }

    let db;
    try {
        db = new Database(dbPath);
    } catch (e) {
        process.stderr.write(`[warn] Cannot open DB at ${dbPath}: ${e.message}\n`);
        process.exit(0);
    }

    try {
        // v2.0.0: --ts override 優先於 taiwanNow()
        const writeTs = tsOverride || taiwanNow();
        const updateTs = taiwanNow(); // updated_at 始終為當下時間,不受 --ts 影響

        // COALESCE 保護: 所有 phase 僅在目標欄位為 NULL 時寫入,避免覆蓋既有值
        // updated_at 始終同步(即使 COALESCE 沒改動目標欄位,也記錄本次 helper 呼叫)
        // promote(dev-start / review-start): 同一 UPDATE 內以 CASE 原子推進 status,
        // 僅當現值 === promote.from 才推(只進不退;fix-Rn 重派時 status=review 不會被倒退)
        const promoteClause = config.promote
            ? ', status = CASE WHEN status = ? THEN ? ELSE status END'
            : '';
        const sql = `UPDATE stories SET ${config.column} = COALESCE(${config.column}, ?)${promoteClause}, updated_at = ? WHERE story_id = ?`;
        const params = config.promote
            ? [writeTs, config.promote.from, config.promote.to, updateTs, storyId]
            : [writeTs, updateTs, storyId];

        const info = db.prepare(sql).run(...params);

        if (info.changes === 0) {
            process.stderr.write(`[warn] Story not found in DB: ${storyId} (non-fatal)\n`);
            process.exit(0);
        }

        // 驗證實際生效的值(判斷是新寫入還是 COALESCE 保留既有;promote phase 一併回讀 status)
        const row = db.prepare(`SELECT ${config.column} AS col, status FROM stories WHERE story_id = ?`).get(storyId);
        const actualTs = row ? row.col : writeTs;
        const isPreserved = actualTs !== writeTs;
        const backfillMarker = tsOverride && !isPreserved ? ' [--ts backfill]' : '';
        const statusNote = config.promote && row ? `, status=${row.status}` : '';

        // [v2.2.0 rerun 標記] 欄位已有值 = 本 phase 曾執行過,本次為重跑(斷電續跑 / 補全 / R2)。
        // stories 時間戳語意維持「首次」不覆寫;重跑事實 append 至 pipeline_notes(append-only,
        // 三條既有注入路徑會帶給承接 agent),逐次精確起訖以 worker_runs 為 SSoT。
        // --ts backfill(補填歷史)非重跑,不標記。
        // [v2.2.1] 僅 *-start 標記 —— 重跑的第一信號必為 start;*-complete 的 preserved 幾乎恆為
        // 「同一 run 內 upsert-story.js 先寫入」的正常收尾時序(2026-07-29 bwu-7 CR 實證:
        // review-complete 補強呼叫誤標 [rerun],該行已由中控 append 更正註記),非重跑。
        // [v2.3.0] 重跑判準改以 worker_runs.attempt 為準,不再單憑「欄位已有值」。
        //   原判準把「同一輪內的重複呼叫」也算成重跑 —— create-story workflow 有三個 create-start
        //   呼叫點,且三者是不同情境的分工而非冗餘:step-00 §0.5 為 FIRST ACTION(story_key 已知時)、
        //   step-01 §1b 補呼叫(story_key 至 step-01 才確定)、step-07 §4.4 safety net(Story 首次
        //   建立、step-00 當下不在 DB)。刪任一個都會在對應情境留下 create_started_at = NULL,
        //   故正解是改判準而非減呼叫點。
        //   worker_runs 查不到(手動軌無登記列 / 表不可讀)一律不標記 —— 寧可漏標不可誤標。
        let rerunNote = '';
        if (isPreserved && !tsOverride && phase.endsWith('-start')) {
            const PHASE_TO_RUN = { create: 'create-story', dev: 'dev-story', review: 'code-review' };
            const runPhase = PHASE_TO_RUN[phase.replace(/-start$/, '')];
            let realRerun = false;
            try {
                const r = runPhase
                    ? db.prepare('SELECT MAX(attempt) AS mx FROM worker_runs WHERE story_id = ? AND phase = ?').get(storyId, runPhase)
                    : null;
                realRerun = !!(r && r.mx > 1);
            } catch { /* worker_runs 不可查 -> 保守不標記 */ }

            if (realRerun) {
                const marker = `\n\n[rerun] ${phase} 再次執行 @ ${updateTs}(stories.${config.column} 保留首次值 ${actualTs};status=${row ? row.status : '?'})— record-phase-timestamp v2.3.0 自動標註,依據 worker_runs.attempt > 1,逐次起訖詳 worker_runs`;
                db.prepare(`UPDATE stories SET pipeline_notes = COALESCE(pipeline_notes, '') || ? WHERE story_id = ?`)
                  .run(marker, storyId);
                rerunNote = ', [rerun] 已標註 pipeline_notes';
            }
        }

        process.stdout.write(
            `[ok] ${phase}: stories.${config.column} = ${actualTs}${backfillMarker} ` +
            `(story_id=${storyId}${isPreserved ? ', preserved existing value' : ''}${statusNote}${rerunNote})\n`
        );
        process.exit(0);
    } catch (e) {
        process.stderr.write(`[warn] Failed to record phase timestamp: ${e.message}\n`);
        process.exit(0); // 非致命
    } finally {
        try { db.close(); } catch { /* ignore */ }
    }
}

recordTimestamp();
