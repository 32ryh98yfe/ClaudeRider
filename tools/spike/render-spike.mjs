// Spike S1/S2: render the WebGPU spike page in headless Chromium and measure non-black pixels.
/* global window, document, Image */
import { chromium } from '@playwright/test';
const url = process.argv[2] ?? 'http://127.0.0.1:5173/spike.html';
const variants = [
  { name: 'webgl2-swiftshader', q: '?renderer=webgl2', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  { name: 'auto-webgpu-swiftshader', q: '?renderer=auto', args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
];
for (const v of variants) {
  const browser = await chromium.launch({ args: v.args });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const t0 = Date.now();
  await page.goto(url + v.q);
  try { await page.waitForFunction(() => window.__spike, null, { timeout: 90000 }); } catch { logs.push('TIMEOUT'); }
  const res = await page.evaluate(() => window.__spike);
  const shot = await page.screenshot({ path: `/tmp/claude-0/-home-user-ClaudeRider/4ffacf22-1d12-5179-a0b7-d8a51c4bc20c/scratchpad/spike-${v.name}.png` });
  const stats = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data;
    let nonBlack = 0, sum = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { const l = d[i] + d[i + 1] + d[i + 2]; if (l > 30) nonBlack++; sum += l; }
    return { nonBlackFrac: nonBlack / n, meanLum: sum / n / 3 };
  }, shot.toString('base64'));
  console.log(JSON.stringify({ variant: v.name, ms: Date.now() - t0, res, stats, logs: logs.slice(0, 15) }, null, 1));
  await browser.close();
}
