import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js', 'scripts/**/*.test.cjs'],
    globals: true,
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: [
        'scripts/_migrations/tech-debt-schema.js',
        'scripts/_helpers/severity-canonical.js',
        'scripts/debt-layer3-quickfix.js',
        'scripts/debt-layer5-alan-review.js',
        'scripts/debt-layer-rollback.js',
        'scripts/apply-migration.js',
        'scripts/scan-code-idd-references.js',
        'scripts/scan-doc-idd-references.js',
        'scripts/scan-skill-idd-references.js',
        'scripts/skill-idd-sync-check.js',
        'scripts/build-idd-cross-reference.js',
        'scripts/debt-layer1-hygiene.js',
        'scripts/debt-layer2-stale.js',
        'scripts/debt-stale-report.js',
        'scripts/boy-scout-sweep.js',
        'scripts/upsert-intentional.js',
        'scripts/compute-centrality.cjs',
        'scripts/upsert-debt.js',
        'scripts/log-rule-violation.js',
        'scripts/query-violations.js',
        'scripts/detect-rule-violation-core.cjs',
      ],
      reporter: ['text', 'text-summary'],
      ignoreEmptyLines: true,
      thresholds: {
        perFile: false,
      },
    },
  },
});
