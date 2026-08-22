// ============================================================
// system.ts — 系統工具相關型別定義
// AC-4: HealthInfo / AC-5: ScriptResult / AC-6: ScriptHistory
// ============================================================

export interface HealthInfo {
  db: {
    connected: boolean;
    path: string;
    sizeBytes: number;
    tableCount: number;
    lastWriteTime: string | null;
  };
  records: {
    context: number;
    tech: number;
    cr_issues: number;
    conversations: number;
  };
}

export interface ScriptResult {
  success: boolean;
  output: string;
  exitCode: number;
  durationMs: number;
}

export interface ScriptHistory {
  name: string;
  startedAt: string;
  completedAt: string;
  exitCode: number;
  output: string;
  durationMs: number;
}
