// pnpm art:refs [--url http://127.0.0.1:8787] [--only <prefix>]: saves the game's procedural art for every Codex slot
// into art/codex/refs/<slotId>.png, to attach as a style and composition reference when generating that slot.
// Needs a built client (pnpm build); it starts the Node server on a spare port unless --url is given.
// Headless Chromium from /opt/pw-browsers (never run `playwright install`).
import { chromium } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = `${ROOT}art/codex/refs`;
const args = process.argv.slice(2);
const opt = (f: string): string | undefined => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const only = opt('--only') ?? '';

let server: ChildProcess | null = null;
let base = opt('--url');
if (!base) {
  const port = 8795;
  server = spawn(process.execPath, ['apps/server/src/main.ts', '--port', String(port), '--static', 'apps/client/dist'], { cwd: ROOT, stdio: 'ignore' });
  base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // ?art=0: never read overrides, so the refs are always the procedural art
  await page.goto(`${base}/?renderer=webgl2&quality=low&art=0&artrefs=1`);
  await page.waitForFunction(() => 'ready' in ((window as unknown as { __cr?: object }).__cr ?? {}) && '__crArt' in window, null, { timeout: 60_000 });
  const ids = (await page.evaluate(() => (window as unknown as { __crArt: { ids(): string[] } }).__crArt.ids())).filter((id) => id.startsWith(only));
  mkdirSync(OUT, { recursive: true });
  let n = 0;
  for (const id of ids) {
    const url = await page.evaluate((i) => (window as unknown as { __crArt: { png(id: string): Promise<string | null> } }).__crArt.png(i), id);
    if (!url) { console.warn(`skip ${id}: unknown slot`); continue; }
    writeFileSync(`${OUT}/${id}.png`, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
    n++;
  }
  console.log(`art:refs wrote ${n} images to art/codex/refs/`);
} finally {
  await browser.close();
  server?.kill();
}
