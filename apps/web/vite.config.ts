import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@opae/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@opae/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../../dist/web'),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/apps/web/src/admin/')) {
            return 'admin-workbench';
          }
          if (id.includes('node_modules/react')) {
            return 'vendor-react';
          }
          return undefined;
        },
      },
    },
  },
});
