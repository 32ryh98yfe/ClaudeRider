// ClaudeRider server: node apps/server/src/main.ts [--port 8787] [--host 0.0.0.0] [--static apps/client/dist]
// M1: static client + health. The WebSocket lobby/race host attaches here in lane L9.
import { createServer } from 'node:http';
import { createStatic } from './http/static.ts';

const args = process.argv.slice(2);
const opt = (f: string, def: string): string => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1]! : def; };
const port = Number(opt('--port', process.env['PORT'] ?? '8787'));
const host = opt('--host', process.env['HOST'] ?? '127.0.0.1');
const staticDir = opt('--static', new URL('../../client/dist', import.meta.url).pathname);

const serveStatic = createStatic(staticDir);
const started = Date.now();

const server = createServer((req, res) => {
  const url = req.url ?? '/';
  if (url === '/health' || url.startsWith('/health?')) {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, uptimeSec: Math.round((Date.now() - started) / 1000) }));
    return;
  }
  if (!serveStatic(req, res)) res.writeHead(405).end();
});

server.listen(port, host, () => console.log(`[server] http://${host}:${port}  static=${staticDir}`));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => server.close(() => process.exit(0)));
