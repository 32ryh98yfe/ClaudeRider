import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildArtIndex, createArtRoute } from '../src/http/artIndex.ts';

describe('Codex art override index', () => {
  let live: string, built: string, server: Server, base: string;
  beforeAll(async () => {
    live = mkdtempSync(join(tmpdir(), 'cr-art-live-'));
    built = mkdtempSync(join(tmpdir(), 'cr-art-dist-'));
    writeFileSync(join(live, 'portrait.clay.png'), 'png');
    writeFileSync(join(live, 'portrait.clay.webp'), 'webp');
    writeFileSync(join(live, 'README.md'), '# not an image');
    writeFileSync(join(built, 'portrait.clay.webp'), 'stale');
    writeFileSync(join(built, 'ui.title.jpg'), 'jpg');
    const route = createArtRoute([live, built]);
    server = createServer((req, res) => { if (!route(req, res)) res.writeHead(404).end(); });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server.close(); rmSync(live, { recursive: true, force: true }); rmSync(built, { recursive: true, force: true }); });

  it('prefers WebP, lets the live folder win and skips non-images and missing folders', () => {
    const idx = buildArtIndex([live, built, join(live, 'missing')]);
    expect(Object.keys(idx).sort()).toEqual(['portrait.clay', 'ui.title']);
    expect(idx['portrait.clay']!.file).toBe('portrait.clay.webp');
    expect(idx['ui.title']!.file).toBe('ui.title.jpg');
  });

  it('always serves index.json, as {} when there are no overrides', async () => {
    expect(buildArtIndex([])).toEqual({});
    const r = await fetch(`${base}/art/overrides/index.json`);
    expect(r.status).toBe(200);
    expect(Object.keys(await r.json() as object)).toContain('portrait.clay');
  });

  it('serves images from the first folder that has them and refuses paths', async () => {
    expect(await (await fetch(`${base}/art/overrides/portrait.clay.webp`)).text()).toBe('webp');
    expect(await (await fetch(`${base}/art/overrides/ui.title.jpg`)).text()).toBe('jpg');
    expect((await fetch(`${base}/art/overrides/..%2F..%2Fetc%2Fpasswd`)).status).toBe(404);
    expect((await fetch(`${base}/art/overrides/README.md`)).status).toBe(404);
  });
});
