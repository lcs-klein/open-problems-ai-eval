import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@opae/core': path.resolve(__dirname, './packages/core/src/index.ts'),
      '@opae/ui': path.resolve(__dirname, './packages/ui/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
  },
});
