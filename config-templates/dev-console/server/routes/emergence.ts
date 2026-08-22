// ============================================================
// emergence.ts — ECC 湧現迴路 API Routes (Express Router)
// GET /api/emergence/pipeline              — 湧現漏斗 4 階統計
// GET /api/emergence/instincts             — instinct 卡片資料(含 rejected_count)
// PUT /api/emergence/instincts/:id/note   — 寫入 user_note
// PUT /api/emergence/instincts/:id/like   — 讚(confidence boost · AC2)
// POST /api/emergence/instincts/:id/reject — 否決(AC3)
// GET /api/emergence/layer12              — Layer 12 注入觀測(AC5)
// ============================================================
import { Router, type Request, type Response } from 'express';
import { spawnSync } from 'child_process';
import path from 'path';
import { createRequire } from 'module';
import { getDb } from '../db.js';
import { config } from '../config.js';

const router = Router();

// bwu-14: Layer 12 預算 + entry 格式 + 起算基準收斂至單一定義站點（與 pre-prompt-rag.js
// 共用同一份 .cjs，取代原各自宣告的 450/1200 常數，見該檔檔頭說明）
const require = createRequire(import.meta.url);
const { INSTINCT_CHARS, INSTINCT_HEADER, formatInstinctEntry } = require(
  path.join(config.projectRoot, '.context-db', 'scripts', 'inject-budget.cjs')
) as {
  INSTINCT_CHARS: number;
  INSTINCT_HEADER: string;
  formatInstinctEntry: (row: { adoption_score: number; trigger: string; action: string }) => string;
};

// ── GET /pipeline ─────────────────────────────────────────────
// 湧現漏斗 4 階統計 (AC2)
router.get('/pipeline', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'DB 未連線' });
      return;
    }

    // 階 1 + 階 2: observations_queue
    const obsTotal = (db.prepare('SELECT COUNT(*) AS n FROM observations_queue').get() as { n: number }).n;
    const obsProcessed = (db.prepare('SELECT COUNT(*) AS n FROM observations_queue WHERE processed = 1').get() as { n: number }).n;
    const processedPct = obsTotal > 0 ? obsProcessed / obsTotal : 0;

    // 階 3: instincts by verifier_status
    const instRows = db.prepare('SELECT verifier_status, COUNT(*) AS n FROM instincts GROUP BY verifier_status').all() as { verifier_status: string; n: number }[];
    const instMap: Record<string, number> = {};
    for (const row of instRows) instMap[row.verifier_status] = row.n;
    const instTotal = instRows.reduce((s, r) => s + r.n, 0);
    const instApproved = instMap['approved'] ?? 0;
    const instNeedsEvidence = instMap['needs-more-evidence'] ?? 0;
    const instRejectedStatus = instMap['rejected'] ?? 0;

    // 階 4: instincts_rejected 表
    const rejTotal = (db.prepare('SELECT COUNT(*) AS n FROM instincts_rejected').get() as { n: number }).n;

    res.json({
      observations: {
        total: obsTotal,
        processed: obsProcessed,
        processedPct: Math.round(processedPct * 10000) / 10000,
      },
      instincts: {
        total: instTotal,
        approved: instApproved,
        needsEvidence: instNeedsEvidence,
        rejected: instRejectedStatus,
      },
      rejected: {
        total: rejTotal,
      },
      conversionRate: {
        obsToInstinct: obsTotal > 0 ? Math.round((instTotal / obsTotal) * 10000) / 10000 : 0,
        approvedPct: instTotal > 0 ? Math.round((instApproved / instTotal) * 10000) / 10000 : 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// normRejectKey — TS parity with upsert-instinct.js normRejectKey (byte-for-byte · AC4)
// mirror pre-prompt-rag.js @2026-05-28
function normRejectKey(trigger: string, action: string): string {
  return (trigger + '|' + action)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} |]/gu, '');
}

// ── GET /instincts ────────────────────────────────────────────
// instinct 卡片資料(additive: +rejected_count · 禁改既有 shape · AC4)
router.get('/instincts', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'DB 未連線' });
      return;
    }

    const rows = db.prepare(`
      SELECT id, trigger, action, confidence, scope, domain, source,
             source_session_id, evidence_jsonb, verifier_status, verifier_reason,
             created_at, last_seen, decay_at, project_type, business, adoption_score,
             description_zh, user_note
      FROM instincts
      ORDER BY confidence DESC, last_seen DESC
    `).all() as Array<{
      id: string;
      trigger: string;
      action: string;
      confidence: number;
      scope: string;
      domain: string;
      source: string;
      source_session_id: string | null;
      evidence_jsonb: string | null;
      verifier_status: string;
      verifier_reason: string | null;
      created_at: string;
      last_seen: string;
      decay_at: string | null;
      project_type: string | null;
      business: string | null;
      adoption_score: number;
      description_zh: string | null;
      user_note: string | null;
    }>;

    // AC4: 批次查 instincts_rejected norm_key → rejected_count mapping
    const rejRows = db.prepare('SELECT norm_key, reject_count FROM instincts_rejected').all() as { norm_key: string; reject_count: number }[];
    const rejMap = new Map<string, number>();
    for (const r of rejRows) if (r.norm_key) rejMap.set(r.norm_key, r.reject_count);

    // AC2: machine_star SSoT — 移除 user_star_rating/star_source(UI 不顯示手動覆寫)
    const instincts = rows.map(row => {
      const machine_star = Math.round(row.confidence * 10);
      const nk = normRejectKey(row.trigger, row.action);
      const rejected_count = rejMap.get(nk) ?? 0;
      return { ...row, machine_star, rejected_count };
    });

    res.json(instincts);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── PUT /instincts/:id/note ────────────────────────────────────
// 寫入 user_note (AC5) — 走 upsert-instinct.js note cmd
router.put('/instincts/:id/note', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'DB 未連線' });
      return;
    }

    // CR F2 修復:Express 5 req.params 值型別為 string | string[],強制轉 string 再 trim(消除 .trim() on union type 的 tsc TS2339)
    const id = String(req.params.id ?? '').trim();
    const { user_note } = req.body as { user_note: string };

    if (!id) {
      res.status(400).json({ error: 'id 必填' });
      return;
    }

    // Check exists
    const existing = db.prepare('SELECT id FROM instincts WHERE id = ?').get(id) as { id: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: `instinct id=${id} 不存在` });
      return;
    }

    // Direct UPDATE — 權威寫入(同步 · 同連線),確保 note 必落地(對齊 upsert-instinct.js cmdDecay UPDATE 範式)
    db.prepare('UPDATE instincts SET user_note = ? WHERE id = ?').run(
      user_note ?? null,
      id
    );

    // Append ledger record via upsert-instinct.js note cmd (AC5 appendLedger 留痕)
    // CR F3 修復:用 config.projectRoot 絕對路徑 — server cwd=tools/dev-console,原相對路徑 '.context-db/...' 解析錯誤致 ledger 永不寫;且補 result.status 檢查(原僅檢 result.error 漏 node 非零退出)
    const noteArg = user_note ?? '';
    const scriptPath = path.join(config.projectRoot, '.context-db', 'scripts', 'upsert-instinct.js');
    const result = spawnSync(
      'node',
      [scriptPath, 'note', '--id', id, '--user-note', noteArg],
      { cwd: config.projectRoot, encoding: 'utf8' }
    );

    if (result.error || result.status !== 0) {
      // note 已於上方 direct UPDATE 落地,ledger 留痕失敗僅告警(非致命)
      console.warn('[emergence] upsert-instinct.js note cmd 失敗(ledger 留痕略過):', result.error?.message ?? result.stderr);
    }

    res.json({ ok: true, id, user_note: user_note ?? null });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── PUT /instincts/:id/like ───────────────────────────────────
// 讚(confidence boost · 走 upsert-instinct.js like cmd · AC2)
router.put('/instincts/:id/like', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'DB 未連線' });
      return;
    }

    const id = String(req.params.id ?? '').trim();
    if (!id) {
      res.status(400).json({ error: 'id 必填' });
      return;
    }

    const existing = db.prepare('SELECT id FROM instincts WHERE id = ?').get(id) as { id: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: `instinct id=${id} 不存在` });
      return;
    }

    const scriptPath = path.join(config.projectRoot, '.context-db', 'scripts', 'upsert-instinct.js');
    const result = spawnSync(
      'node',
      [scriptPath, '--inline', JSON.stringify({ cmd: 'like', id })],
      { cwd: config.projectRoot, encoding: 'utf8' }
    );

    if (result.error || result.status !== 0) {
      console.error('[emergence] upsert-instinct.js like cmd 失敗:', result.error?.message ?? result.stderr);
      res.status(500).json({ error: 'like cmd 執行失敗', detail: result.stderr });
      return;
    }

    const out = JSON.parse(result.stdout.trim());
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /instincts/:id/reject ────────────────────────────────
// 否決(寫 instincts_rejected · 走 upsert-instinct.js reject cmd · AC3)
router.post('/instincts/:id/reject', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'DB 未連線' });
      return;
    }

    const id = String(req.params.id ?? '').trim();
    const { reason } = req.body as { reason?: string };

    if (!id) {
      res.status(400).json({ error: 'id 必填' });
      return;
    }

    // CR F3 修復:reject_reason schema 為 NOT NULL(init-db.js:1167)+ AC3「使用者否決並填理由」。
    // 後端補驗 reason 非空,防繞過前端(已 disabled)直呼致 cmdReject INSERT reject_reason=NULL
    // → SQLite NOT NULL 約束失敗 500(首次否決該 norm_key)。defense-in-depth。
    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'reason 必填' });
      return;
    }

    const existing = db.prepare('SELECT id FROM instincts WHERE id = ?').get(id) as { id: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: `instinct id=${id} 不存在` });
      return;
    }

    const scriptPath = path.join(config.projectRoot, '.context-db', 'scripts', 'upsert-instinct.js');
    const result = spawnSync(
      'node',
      [scriptPath, '--inline', JSON.stringify({ cmd: 'reject', id, reason: reason.trim() })],
      { cwd: config.projectRoot, encoding: 'utf8' }
    );

    if (result.error || result.status !== 0) {
      console.error('[emergence] upsert-instinct.js reject cmd 失敗:', result.error?.message ?? result.stderr);
      res.status(500).json({ error: 'reject cmd 執行失敗', detail: result.stderr });
      return;
    }

    const out = JSON.parse(result.stdout.trim());
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /layer12 ──────────────────────────────────────────────
// Layer 12 注入觀測(唯讀鏡像 pre-prompt-rag.js:1166-1175 @bwu-14 · AC5)
// bwu-14:預算常數/entry 格式/起算基準已收斂至 .context-db/scripts/inject-budget.cjs
// 單一定義站點,本端點與 hook 側皆為消費端 —— 原「禁改 pre-prompt-rag.js」的 DISJOINT
// 註記僅約束「禁為了本端點觀測而改動 hook 邏輯」,不含「禁共用常數」,本卡改動屬後者。
router.get('/layer12', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'DB 未連線' });
      return;
    }

    const projectType = typeof req.query.projectType === 'string' && req.query.projectType.trim()
      ? req.query.projectType.trim()
      : null;

    // CR F2 修復:對齊 pre-prompt-rag.js L1006 台灣時間格式(UTC+8)。decay_at 以 getTaiwanTimestamp()
    // 存 +08:00 字串,SQLite TEXT 為字典序比較;原 toISOString() 為 UTC(...Z),對 +08:00 字串有 8h 偏移
    // → 當日已衰退 instinct 會被誤判 decay_at > now 而錯誤注入(違反 AC5 parity + decayed 排除契約)。
    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';

    // mirror pre-prompt-rag.js:1166-1175 @bwu-14
    // WHERE: approved + 未衰退 + adoption 階梯過濾
    // sessionId 在 HTTP 情境無 live agent session → 空字串(對齊 L1007 null fallback)
    const instRows = db.prepare(`
      SELECT trigger, action, adoption_score, confidence
      FROM instincts
      WHERE verifier_status = 'approved'
        AND (decay_at IS NULL OR decay_at > ?)
        AND (
          adoption_score >= 4
          OR (adoption_score = 3 AND project_type = ?)
          OR (adoption_score BETWEEN 1 AND 2 AND project_type = ?)
          OR source_session_id = ?
        )
      ORDER BY adoption_score DESC, confidence DESC
      LIMIT 8
    `).all(now, projectType, projectType, '') as Array<{
      trigger: string;
      action: string;
      adoption_score: number;
      confidence: number;
    }>;

    // used 起算基準與 hook 側一致(含 header 長度),parity 才成立 —— 見 inject-budget.cjs 檔頭說明。
    // CR F1:零列時 hook 側為 `if (!rows.length) return ''`(整層不注入,連 header 都不輸出),
    // 故此處亦須為 0 —— 否則儀表板會在「無 instinct」狀態回報 94/450 已用,而下方列表同時
    // 顯示「目前無符合條件的 instinct 注入」,自相矛盾。
    let used = instRows.length > 0 ? INSTINCT_HEADER.length : 0;
    const injected: Array<{ score: number; trigger: string; action: string }> = [];

    for (const row of instRows) {
      const entry = formatInstinctEntry(row);
      if (used + entry.length > INSTINCT_CHARS) break;
      used += entry.length;
      injected.push({ score: row.adoption_score, trigger: row.trigger, action: row.action });
    }

    res.json({
      cap: INSTINCT_CHARS,
      used,
      pct: Math.round((used / INSTINCT_CHARS) * 10000) / 10000,
      projectType,
      injected,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /evolve-candidates ────────────────────────────────
// 演化候選推薦(AC6 · 純讀 · spawnSync ecc-evolve-detect.cjs)
router.get('/evolve-candidates', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'DB 未連線' });
      return;
    }

    const scriptPath = path.join(config.projectRoot, '.context-db', 'scripts', 'ecc-evolve-detect.cjs');
    const result = spawnSync('node', [scriptPath], {
      cwd: config.projectRoot,
      encoding: 'utf8',
    });

    if (result.error || result.status !== 0) {
      console.error('[emergence] ecc-evolve-detect.cjs 失敗:', result.error?.message ?? result.stderr);
      res.status(500).json({ error: 'evolve-detect 執行失敗', detail: result.stderr });
      return;
    }

    const parsed = JSON.parse(result.stdout.trim());

    // generatedAt 重算 — 確保 UTC+8(對齊 Constitutional §Timestamp Mandate)
    const generatedAt = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
    res.json({ ...parsed, generatedAt });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /evolve-candidates/reject ────────────────────────────
// 候選否決(批次否決成員 instinct → instincts_rejected · 閉環 P1 redundant 偵測 + P2 負樣本)。
// 候選為 evolve runtime 聚類(非 DB 實體),「否決」語意 = 批次 reject 其成員 instinct:
//   每個成員走 upsert-instinct.js reject cmd → 寫 instincts_rejected + reject_count++
//   → 成員落否決池 → 下次 ecc-evolve-detect.cjs 因成員 reject_count 升高而降權該聚類。
router.post('/evolve-candidates/reject', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'DB 未連線' });
      return;
    }

    const { member_ids, reason } = req.body as { member_ids?: string[]; reason?: string };

    if (!Array.isArray(member_ids) || member_ids.length === 0) {
      res.status(400).json({ error: 'member_ids 必填(非空陣列)' });
      return;
    }
    // 對齊 POST /instincts/:id/reject:reject_reason 為 NOT NULL(init-db.js:1167),後端補驗防繞過
    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'reason 必填' });
      return;
    }

    const scriptPath = path.join(config.projectRoot, '.context-db', 'scripts', 'upsert-instinct.js');
    const rejected: string[] = [];
    const failed: { id: string; detail: string }[] = [];

    for (const rawId of member_ids) {
      const id = String(rawId ?? '').trim();
      if (!id) continue;
      const existing = db.prepare('SELECT id FROM instincts WHERE id = ?').get(id) as { id: string } | undefined;
      if (!existing) { failed.push({ id, detail: '成員 instinct 不存在' }); continue; }

      const result = spawnSync(
        'node',
        [scriptPath, '--inline', JSON.stringify({ cmd: 'reject', id, reason: reason.trim() })],
        { cwd: config.projectRoot, encoding: 'utf8' }
      );
      if (result.error || result.status !== 0) {
        failed.push({ id, detail: result.error?.message ?? result.stderr ?? 'reject cmd 失敗' });
      } else {
        rejected.push(id);
      }
    }

    res.json({ ok: failed.length === 0, rejected: rejected.length, rejected_ids: rejected, failed });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── PUT /instincts/:id/dislike ────────────────────────────────
// 扣分(confidence -0.05 clamp ≥ 0.0 · ecc-emergence-ui-v2 AC4)
router.put('/instincts/:id/dislike', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) { res.status(503).json({ error: 'DB 未連線' }); return; }
    const id = String(req.params.id ?? '').trim();
    if (!id) { res.status(400).json({ error: 'id 必填' }); return; }
    const existing = db.prepare('SELECT id FROM instincts WHERE id = ?').get(id) as { id: string } | undefined;
    if (!existing) { res.status(404).json({ error: `instinct id=${id} 不存在` }); return; }
    const scriptPath = path.join(config.projectRoot, '.context-db', 'scripts', 'upsert-instinct.js');
    const result = spawnSync('node', [scriptPath, '--inline', JSON.stringify({ cmd: 'dislike', id })], { cwd: config.projectRoot, encoding: 'utf8' });
    if (result.error || result.status !== 0) {
      console.error('[emergence] upsert-instinct.js dislike cmd 失敗:', result.error?.message ?? result.stderr);
      res.status(500).json({ error: 'dislike cmd 執行失敗', detail: result.stderr });
      return;
    }
    const out = JSON.parse(result.stdout.trim()) as { ok: boolean; new_confidence: number };
    res.json({ ok: out.ok, id, confidence: out.new_confidence });
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

// ── PUT /instincts/:id/restore ────────────────────────────────
// 還原否決(ecc-emergence-ui-v2 AC5)
router.put('/instincts/:id/restore', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) { res.status(503).json({ error: 'DB 未連線' }); return; }
    const id = String(req.params.id ?? '').trim();
    if (!id) { res.status(400).json({ error: 'id 必填' }); return; }
    const existing = db.prepare('SELECT id FROM instincts WHERE id = ?').get(id) as { id: string } | undefined;
    if (!existing) { res.status(404).json({ error: `instinct id=${id} 不存在` }); return; }
    const scriptPath = path.join(config.projectRoot, '.context-db', 'scripts', 'upsert-instinct.js');
    const result = spawnSync('node', [scriptPath, '--inline', JSON.stringify({ cmd: 'restore', id })], { cwd: config.projectRoot, encoding: 'utf8' });
    if (result.error || result.status !== 0) {
      console.error('[emergence] upsert-instinct.js restore cmd 失敗:', result.error?.message ?? result.stderr);
      res.status(500).json({ error: 'restore cmd 執行失敗', detail: result.stderr });
      return;
    }
    const out = JSON.parse(result.stdout.trim());
    res.json(out);
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

// ── GET /generated-skills ─────────────────────────────────────
// 技能池列表(ecc-emergence-ui-v2 AC6)
router.get('/generated-skills', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) { res.status(503).json({ error: 'DB 未連線' }); return; }
    const rows = db.prepare(`
      SELECT gs.id, gs.instinct_cluster_id, gs.skill_path, gs.status, gs.generated_at,
             gs.paused_at, gs.deleted_at,
             em.improvement_pct, em.before_freq, em.after_freq
      FROM generated_skills gs
      LEFT JOIN effect_metrics em ON em.skill_id = gs.id
        AND em.measured_at = (SELECT MAX(measured_at) FROM effect_metrics WHERE skill_id = gs.id)
      WHERE gs.status != 'deleted'
      ORDER BY gs.status, gs.generated_at DESC
    `).all();
    res.json(rows);
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

// ── PUT /generated-skills/:id/pause ──────────────────────────
// 停用技能(ecc-emergence-ui-v2 AC6)
router.put('/generated-skills/:id/pause', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) { res.status(503).json({ error: 'DB 未連線' }); return; }
    const id = String(req.params.id ?? '').trim();
    if (!id) { res.status(400).json({ error: 'id 必填' }); return; }
    const existing = db.prepare('SELECT id FROM generated_skills WHERE id = ?').get(Number(id));
    if (!existing) { res.status(404).json({ error: `generated_skill id=${id} 不存在` }); return; }
    const scriptPath = path.join(config.projectRoot, '.context-db', 'scripts', 'upsert-generated-skill.js');
    const result = spawnSync('node', [scriptPath, '--inline', JSON.stringify({ cmd: 'pause', id: Number(id) })], { cwd: config.projectRoot, encoding: 'utf8' });
    if (result.error || result.status !== 0) {
      console.error('[emergence] upsert-generated-skill.js pause cmd 失敗:', result.error?.message ?? result.stderr);
      res.status(500).json({ error: 'pause cmd 執行失敗', detail: result.stderr });
      return;
    }
    res.json(JSON.parse(result.stdout.trim()));
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

// ── DELETE /generated-skills/:id ─────────────────────────────
// 刪除技能(ecc-emergence-ui-v2 AC6)
router.delete('/generated-skills/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) { res.status(503).json({ error: 'DB 未連線' }); return; }
    const id = String(req.params.id ?? '').trim();
    if (!id) { res.status(400).json({ error: 'id 必填' }); return; }
    const existing = db.prepare('SELECT id FROM generated_skills WHERE id = ?').get(Number(id));
    if (!existing) { res.status(404).json({ error: `generated_skill id=${id} 不存在` }); return; }
    const scriptPath = path.join(config.projectRoot, '.context-db', 'scripts', 'upsert-generated-skill.js');
    const result = spawnSync('node', [scriptPath, '--inline', JSON.stringify({ cmd: 'delete', id: Number(id) })], { cwd: config.projectRoot, encoding: 'utf8' });
    if (result.error || result.status !== 0) {
      console.error('[emergence] upsert-generated-skill.js delete cmd 失敗:', result.error?.message ?? result.stderr);
      res.status(500).json({ error: 'delete cmd 執行失敗', detail: result.stderr });
      return;
    }
    res.json(JSON.parse(result.stdout.trim()));
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

// ── GET /rejected ─────────────────────────────────────────────
// 否決池列表(ecc-emergence-ui-v2 AC5)
router.get('/rejected', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) { res.status(503).json({ error: 'DB 未連線' }); return; }
    const rows = db.prepare(`
      SELECT ir.id, ir.trigger, ir.action, ir.reject_reason, ir.reject_count,
             ir.rejected_at, ir.restored_at, ir.norm_key,
             i.confidence, (ROUND(i.confidence * 10)) AS machine_star,
             i.adoption_score
      FROM instincts_rejected ir
      LEFT JOIN instincts i ON i.id = (
        SELECT id FROM instincts WHERE trigger = ir.trigger AND action = ir.action LIMIT 1
      )
      WHERE ir.restored_at IS NULL
      ORDER BY ir.rejected_at DESC
    `).all();
    res.json(rows);
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

export default router;
