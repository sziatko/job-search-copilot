import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** The dev server's tab: a red favicon and "DEV ·" in the title, so it can't pass for
 * production. Not in a build, nor in e2e (`--mode e2e`), whose screenshots are prod's. */
const devTab: Plugin = {
  name: 'dev-tab',
  apply: (_, { mode }) => mode === 'development',
  transformIndexHtml: (html) =>
    html.replaceAll('/favicon.', '/favicon-dev.').replace('<title>', '<title>DEV · '),
};

export default defineConfig({
  plugins: [react(), tailwindcss(), devTab],
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
