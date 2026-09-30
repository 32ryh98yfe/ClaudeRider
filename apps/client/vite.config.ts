import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [preact()],
  server: { port: 5173, strictPort: false, host: '127.0.0.1' },
  build: {
    target: 'es2023', outDir: 'dist', emptyOutDir: true,
    rolldownOptions: { input: { main: resolve(here, 'index.html'), selftest: resolve(here, 'selftest.html') } },
  },
  worker: { format: 'es' },
});
