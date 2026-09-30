// ClaudeRider server: node apps/server/src/main.ts [--port 8787] [--host 127.0.0.1] [--static apps/client/dist] [--tracks <dir>] [--art <dir>]
// Serves the built client, /health, and the game WebSocket on /ws (lobby JSON + binary race frames, ADR-007).
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { loadContent } from '@cr/content';
import { createStatic } from './http/static.ts';
import { createArtRoute } from './http/artIndex.ts';
import { startGameServer } from './game/run.ts';

const args = process.argv.slice(2);
const opt = (f: string, def: string): string => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1]! : def; };
const port = Number(opt('--port', process.env['PORT'] ?? '8787'));
const host = opt('--host', process.env['HOST'] ?? '127.0.0.1');
const staticDir = opt('--static', new URL('../../client/dist', import.meta.url).pathname);
const publicTracks = new URL('../../client/public/tracks', import.meta.url).pathname;
const tracksDirs = [opt('--tracks', ''), join(staticDir, 'tracks'), publicTracks].filter((d) => d && existsSync(d));

// Codex art overrides: the live source folder first (drop a file, reload), then the copy in the build
const artDirs = [opt('--art', ''), new URL('../../client/public/art/overrides', import.meta.url).pathname, join(staticDir, 'art', 'overrides')].filter((d) => d && existsSync(d));

const serveStatic = createStatic(staticDir);
const serveArt = createArtRoute(artDirs);
const started = Date.now();
const game = startGameServer({ content: loadContent(), tracksDirs, log: (m) => console.log(`[game] ${m}`) });

const server = createServer((req, res) => {
  const url = req.url ?? '/';
  if (url === '/health' || url.startsWith('/health?')) {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, uptimeSec: Math.round((Date.now() - started) / 1000), ...game.stats() }));
    return;
  }
  if (serveArt(req, res)) return;
  if (!serveStatic(req, res)) res.writeHead(405).end();
});

// perMessageDeflate off (latency, CPU); frames are ≤ a few KB, lobby JSON ≤ 4 KB
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 64 * 1024 });
server.on('upgrade', (req, socket, head) => {
  const path = (req.url ?? '').split('?')[0];
  if (path !== '/ws') { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => game.accept(ws));
});

server.listen(port, host, () => console.log(`[server] http://${host}:${port}  ws=/ws  static=${staticDir}  tracks=${tracksDirs.join(',') || '(none)'}`));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { game.stop(); wss.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1000).unref(); });
