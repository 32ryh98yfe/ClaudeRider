// Side-by-side before/after sheet for one or more fixed-camera views.
// node tools/shots/compare.mjs <beforeDir> <afterDir> <outDir> <view...>
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
const [before, after, out, ...views] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const b64 = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 590 } });
for (const v of views) {
  await page.setContent(`<body style="margin:0;background:#111;font:600 20px system-ui;color:#eee;display:flex">
    ${[['변경 전 · before', before], ['변경 후 · after', after]].map(([t, d]) => `<div style="width:960px"><div style="padding:8px 12px">${t} — ${v}</div><img src="${b64(`${d}/${v}.png`)}" style="width:960px;height:540px;display:block"></div>`).join('')}</body>`);
  await page.screenshot({ path: `${out}/${v}.png` });
  console.log(`${out}/${v}.png`);
}
await browser.close();
