import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArtIndex } from '../server/src/http/artIndex.ts';

const here = dirname(fileURLToPath(import.meta.url));
const artDir = resolve(here, 'public/art/overrides');

/**
 * Codex art overrides (ADR-013): serves `/art/overrides/index.json` in dev (same index as the Node server), tells the
 * client to drop its art caches when a file in the folder changes, and writes the index into the build for static hosts.
 */
function artOverrides(): Plugin {
  return {
    name: 'cr-art-overrides',
    configureServer(server) {
      server.middlewares.use('/art/overrides/index.json', (_req, res) => {
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('cache-control', 'no-cache');
        res.end(JSON.stringify(buildArtIndex([artDir])));
      });
      server.watcher.add(artDir);
      const changed = (file: string): void => { if (file.startsWith(artDir)) server.ws.send({ type: 'custom', event: 'art-overrides:update' }); };
      server.watcher.on('add', changed).on('change', changed).on('unlink', changed);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'art/overrides/index.json', source: JSON.stringify(buildArtIndex([artDir])) });
    },
  };
}

export default defineConfig({
  plugins: [preact(), artOverrides()],
  server: { port: 5173, strictPort: false, host: '127.0.0.1' },
  build: {
    target: 'es2023', outDir: 'dist', emptyOutDir: true,
    rolldownOptions: { input: { main: resolve(here, 'index.html'), selftest: resolve(here, 'selftest.html') } },
  },
  worker: { format: 'es' },
});
