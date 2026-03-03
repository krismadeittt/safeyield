import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import antiDevtools from './src/plugins/antiDevtools';

export default defineConfig({
  plugins: [react(), antiDevtools()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
