// Static file serving for the built client (SPA fallback, immutable caching for hashed assets).
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.ktx2': 'image/ktx2',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.wasm': 'application/wasm', '.ctrk': 'application/octet-stream', '.vis': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8',
};

export function createStatic(rootDir: string): (req: IncomingMessage, res: ServerResponse) => boolean {
  const root = resolve(rootDir);
  const fileAt = (p: string): string | null => {
    try { return statSync(p).isFile() ? p : null; } catch { return null; }
  };
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    let path: string;
    try { path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname); } catch { res.writeHead(400).end(); return true; }
    const target = normalize(join(root, path));
    if (target !== root && !target.startsWith(root + sep)) { res.writeHead(403).end(); return true; }
    let file = fileAt(target) ?? fileAt(join(target, 'index.html'));
    // SPA fallback for extension-less routes only; missing assets are real 404s
    if (!file && !extname(path)) file = fileAt(join(root, 'index.html'));
    if (!file) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return true; }
    const hashed = file.includes(`${sep}assets${sep}`);
    res.writeHead(200, {
      'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    if (req.method === 'HEAD') { res.end(); return true; }
    createReadStream(file).pipe(res);
    return true;
  };
}
