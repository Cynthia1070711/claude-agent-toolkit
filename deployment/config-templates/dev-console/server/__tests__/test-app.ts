// ============================================================
// test-app.ts — Reusable Express app builder for supertest route tests
// Usage: buildTestApp([["/api/godnodes", godnodesRouter]])
// Story: td-devconsole-godnode-route-tests-supertest (BR-RT-005)
// ============================================================
import express, { type Application, type Router } from 'express';

/**
 * Build a minimal Express app for supertest route-layer testing.
 * Mounts the provided routers at the given paths, applies express.json() middleware.
 * Does NOT start a server (supertest manages that internally).
 */
export function buildTestApp(mounts: Array<[path: string, router: Router]>): Application {
  const app = express();
  app.use(express.json());
  for (const [path, router] of mounts) {
    app.use(path, router);
  }
  return app;
}
