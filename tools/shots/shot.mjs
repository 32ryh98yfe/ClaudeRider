// Headless screenshots for visual review (SwiftShader WebGL2; never run `playwright install`).
// node tools/shots/shot.mjs <url> <outPrefix> [step...]
//   step: <ms> (wait, then screenshot) | key:<Key> | click:<selector> | eval:<js expression> | size:<w>x<h>
// Example: node tools/shots/shot.mjs "http://127.0.0.1:5173/?renderer=webgl2" /tmp/x 4000 key:Enter 4000
import { chromium } from '@playwright/test';
const [url, out, ...steps] = process.argv.slice(2);
if (!url || !out) { console.error('usage: shot.mjs <url> <outPrefix> [steps...]'); process.exit(2); }
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => { if (!/GL Driver Message/.test(m.text())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));
await page.goto(url);
let i = 0;
for (const s of steps.length ? steps : ['3000']) {
  if (s.startsWith('key:')) await page.keyboard.press(s.slice(4));
  else if (s.startsWith('click:')) await page.click(s.slice(6)).catch((e) => logs.push(`[click-fail] ${e.message}`));
  else if (s.startsWith('eval:')) logs.push(`[eval] ${JSON.stringify(await page.evaluate(s.slice(5)).catch((e) => String(e)))}`);
  else if (s.startsWith('size:')) { const [w, h] = s.slice(5).split('x').map(Number); await page.setViewportSize({ width: w, height: h }); }
  else { await page.waitForTimeout(Number(s)); const f = `${out}-${i++}.png`; await page.screenshot({ path: f }); logs.push(`[shot] ${f}`); }
}
console.log(logs.join('\n'));
await browser.close();
