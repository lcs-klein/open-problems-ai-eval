import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  define: {
    __OPAE_GITHUB_REPO__: JSON.stringify(process.env.VITE_GITHUB_REPOSITORY || ''),
  },
  resolve: {
    alias: {
      '@opae/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@opae/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@data': path.resolve(__dirname, '../../data/public'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../../dist/public'),
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
  },
});
