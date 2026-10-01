/* global window, document -- page.evaluate callbacks run in the page */
// Fixed-camera before/after shots (SwiftShader WebGL2 unless the url says renderer=webgpu).
// node tools/shots/views.mjs <baseUrl> <outDir> <views.json>
// views.json: [{ "query": "freezeAt=300", "cams": [{ "name": "grid_chase", "cam": [px,py,pz,tx,ty,tz,fov], "hud": false }] }]
// Each group is one page load: the race freezes at `freezeAt` (Session), then every camera is pinned in turn through
// window.__cr.setCam and shot after `settle` ms, so before/after runs see the same world from the same pose.
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { WEBGPU_ARGS, webgpuInitScript } from './webgpu.mjs';

const [base, outDir, viewsFile, settleArg] = process.argv.slice(2);
if (!base || !outDir || !viewsFile) { console.error('usage: views.mjs <baseUrl> <outDir> <views.json> [settleMs]'); process.exit(2); }
const groups = JSON.parse(readFileSync(viewsFile, 'utf8'));
const settle = Number(settleArg ?? 9000);
mkdirSync(outDir, { recursive: true });
const gpu = /renderer=webgpu/.test(base);
const browser = await chromium.launch({ args: gpu ? WEBGPU_ARGS : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
for (const g of groups) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  if (gpu) await ctx.addInitScript(webgpuInitScript);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver Message|GPU stall/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  const first = g.cams[0].cam.join(',');
  await page.goto(`${base}${base.includes('?') ? '&' : '?'}${g.query}&cam=${first}`);
  const t0 = Date.now();
  await page.waitForFunction(() => typeof window.__cr?.frozen === 'number', null, { timeout: 600_000, polling: 1000 });
  console.log(`[${g.query}] frozen at tick ${await page.evaluate(() => window.__cr.frozen)} after ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  for (const c of g.cams) {
    await page.evaluate(([cam, hud]) => {
      window.__cr.setCam(...cam);
      let st = document.getElementById('views-hud');
      if (!st) { st = document.createElement('style'); st.id = 'views-hud'; document.head.appendChild(st); }
      st.textContent = hud ? '' : '[class^="hud"],[class*=" hud"],.race-hud,.hud{visibility:hidden!important}';
    }, [c.cam, c.hud !== false]);
    await page.waitForTimeout(c.settle ?? settle);
    const f = `${outDir}/${c.name}.png`;
    await page.screenshot({ path: f });
    console.log(`[shot] ${f}`);
  }
  await ctx.close();
}
await browser.close();
if (errors.length) { console.log(`[errors] ${errors.length}\n${errors.slice(0, 10).join('\n')}`); process.exitCode = 1; }
