// ============================================================
// DevConsole Express API Server
// AC-2: bind 127.0.0.1:3001（localhost only）
// AC-2: CORS 僅允許 http://localhost:5174
// ============================================================
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { getDb, getDbStats } from './db.js';
import healthRouter from './routes/health.js';
import memoryRouter from './routes/memory.js';
import storiesRouter from './routes/stories.js';
import decisionsRouter from './routes/decisions.js';
import crIssuesRouter from './routes/cr-issues.js';
import techDebtRouter from './routes/tech-debt.js';
import dashboardRouter from './routes/dashboard.js';
import sprintRouter from './routes/sprint.js';
import sessionsRouter from './routes/sessions.js';
import exportRouter from './routes/export.js';
import systemRouter from './routes/system.js';
import documentsRouter from './routes/documents.js';
import reviewsRouter from './routes/reviews.js';
import schemaRouter from './routes/schema.js';
import patternsRouter from './routes/patterns.js';
import workflowsRouter from './routes/workflows.js';
import intentionalRouter from './routes/intentional.js';
import reconciliationRouter from './routes/reconciliation.js';
import ruleViolationsRouter from './routes/rule-violations.js';
import godnodesRouter from './routes/godnodes.js';
import dashboardChartsRouter from './routes/dashboard-charts.js';
import emergenceRouter from './routes/emergence.js';
import workersRouter from './routes/workers.js';
import channelRouter from './routes/channel.js';
import roadmapRouter from './routes/roadmap.js';

const app = express();

// ── CORS（僅允許 Vite dev server）──
app.use(
  cors({
    origin: config.allowedOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: false,
  }),
);

// ── JSON body parser ──
app.use(express.json());

// ── Routes ──
app.use('/api/health', healthRouter);
app.use('/api/memory', memoryRouter);
app.use('/api/stories', storiesRouter);
app.use('/api/decisions', decisionsRouter);
app.use('/api/cr-issues', crIssuesRouter);
app.use('/api/tech-debt', techDebtRouter);
app.use('/api', dashboardRouter);
app.use('/api/sprint', sprintRouter);
// [tdb-2 BR-014] /api/sync/{preview,execute} retired 2026-07-28 — sprint-status.yaml frozen,
// yaml↔DB drift detection has no target left to detect against.
app.use('/api/sessions', sessionsRouter);
app.use('/api/memory/export', exportRouter);
app.use('/api/system', systemRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/schema', schemaRouter);
app.use('/api/patterns', patternsRouter);
app.use('/api/workflows', workflowsRouter);
app.use('/api/intentional', intentionalRouter);
app.use('/api/reconciliation', reconciliationRouter);
app.use('/api/rule-violations', ruleViolationsRouter);
app.use('/api/godnodes', godnodesRouter);
app.use('/api/dashboard', dashboardChartsRouter);
app.use('/api/emergence', emergenceRouter);
app.use('/api/workers', workersRouter);
app.use('/api/channel', channelRouter);
app.use('/api/roadmap', roadmapRouter);

// ── Startup ──
const server = app.listen(config.port, '127.0.0.1', () => {
  const dbStats = getDbStats();
  const dbStatus = dbStats.connected
    ? `✅ DB 連線成功 (${(dbStats.sizeBytes / 1024 / 1024).toFixed(1)} MB, ${dbStats.tableCount} 表)`
    : `⚠️  DB 未連線 — 請確認 ${config.dbPath} 存在`;

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  DevConsole API Server                   ║`);
  console.log(`╠══════════════════════════════════════════╣`);
  console.log(`║  API URL  : http://127.0.0.1:${config.port}      ║`);
  console.log(`║  Frontend : ${config.allowedOrigin}  ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log(`  ${dbStatus}\n`);
});

// ── Graceful shutdown（SIGTERM + SIGINT for tsx watch Ctrl+C）──
function gracefulShutdown() {
  server.close(() => {
    const db = getDb();
    if (db) db.close();
    console.log('[DevConsole] Server shutdown gracefully');
    process.exit(0);
  });
}
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export default app;
