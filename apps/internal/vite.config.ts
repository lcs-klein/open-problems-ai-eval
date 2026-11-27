import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      '@opae/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@opae/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@data': path.resolve(__dirname, '../../data/internal'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../../dist/internal'),
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
  },
});
