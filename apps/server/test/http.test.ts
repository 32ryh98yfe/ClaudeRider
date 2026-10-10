// A file that fails while it is being read (EIO here; EMFILE or EACCES in the field) must end that one response,
// never the process (M4 item 4: `createReadStream().pipe(res)` had no error handler).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createStatic } from '../src/http/static.ts';
import { createArtRoute } from '../src/http/artIndex.ts';

// /proc/self/mem is a Linux-only regular-file fixture whose read fails with EIO.
// On macOS a dangling symlink tests a missing file instead, not stream failure.
describe.skipIf(process.platform !== 'linux')('static and art streams', () => {
  let dir = '';
  let server: Server;
  let base = '';
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cr-http-'));
    writeFileSync(join(dir, 'ok.txt'), 'fine');
    // a regular file by stat whose read fails with EIO
    symlinkSync('/proc/self/mem', join(dir, 'bad.txt'));
    symlinkSync('/proc/self/mem', join(dir, 'bad.png'));
    const serveStatic = createStatic(dir);
    const serveArt = createArtRoute([dir]);
    server = createServer((req, res) => { if (!serveArt(req, res) && !serveStatic(req, res)) res.writeHead(405).end(); });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

  it('a read error aborts that response and the server keeps serving', async () => {
    const failed = async (url: string): Promise<boolean> => {
      try { const r = await fetch(url); await r.arrayBuffer(); return false; } catch { return true; }
    };
    expect(await failed(`${base}/bad.txt`)).toBe(true);
    expect(await failed(`${base}/art/overrides/bad.png`)).toBe(true);
    expect(await (await fetch(`${base}/ok.txt`)).text()).toBe('fine');
  });
});
