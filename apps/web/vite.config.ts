import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Bind-mount file change events don't reliably reach containers on Windows/Docker
    // Desktop, so the watcher is told to poll instead (see docker-compose.yml).
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
});
