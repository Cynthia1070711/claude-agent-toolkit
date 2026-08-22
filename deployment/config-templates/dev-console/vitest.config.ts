import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    workspace: [
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/__tests__/**/*.test.ts', 'server/services/__tests__/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['src/**/__tests__/**/*.test.tsx', 'src/**/__tests__/**/*.test.ts'],
          setupFiles: ['./vitest.setup.ts'],
          globals: true,
        },
      },
    ],
  },
});
