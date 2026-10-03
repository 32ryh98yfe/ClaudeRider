/* global window */
// Browser plugin not available: use the installed Playwright + Chrome, never download a browser.
// node tools/reference/capture.mjs <dev-url> <clip-id> </absolute/output> [frames] [width] [height]
// Deterministic render replay, not real-time footage: two physical ticks + one 1/30 s draw per saved frame.
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

const [base, clip, output, countArg, widthArg, heightArg] = process.argv.slice(2);
if (!base || !clip || !output || !isAbsolute(output)) throw new Error('usage: capture.mjs <dev-url> <clip-id> </absolute/output> [frames] [width=960] [height=720]');
const url = new URL(base);
for (const [key, value] of Object.entries({ go: '1', reference: clip, capture: '1', authority: 'main', quality: 'low', renderer: 'webgl2', dpr: '1', bloom: '0', seed: '4242', laps: '99' })) {
  if (!url.searchParams.has(key) || ['go', 'reference', 'capture', 'authority', 'seed'].includes(key)) url.searchParams.set(key, value);
}
if (!url.searchParams.has('track')) url.searchParams.set('track', 'proving_ring');
if (url.searchParams.get('autopilot') === '1') throw new Error('Reference replay and autopilot are mutually exclusive');
const viewport = { width: Number(widthArg ?? 960), height: Number(heightArg ?? 720) };
const chrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ ...(existsSync(chrome) ? { executablePath: chrome } : {}), args: ['--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', ...(process.env.REFERENCE_SOFTWARE_GL === '1' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])] });
const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
const errors = [], consoleMessages = [];
// Isolate the repository's known missing favicon; all other resource/console errors remain failures.
await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
page.on('console', (message) => {
  if (message.type() === 'warning' || message.type() === 'error') consoleMessages.push({ type: message.type(), text: message.text() });
  if (message.type() === 'error') errors.push(message.text());
});
await mkdir(output, { recursive: true });
try {
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__cr?.reference && window.__cr?.race === 'running', null, { timeout: 180_000 });
  await page.evaluate(() => window.__cr.reference.ready);
  const identity = { url: page.url(), title: await page.title(), content: (await page.locator('body').innerText()).slice(0, 2500), overlay: await page.locator('vite-error-overlay').count() };
  if (!identity.title || identity.overlay || errors.length) throw new Error(`Reference page failed to load: ${JSON.stringify({ identity, errors })}`);
  const durationTicks = await page.evaluate(() => window.__cr.reference.durationTicks);
  const count = Math.min(Number(countArg ?? durationTicks / 2), durationTicks / 2);
  if (!Number.isInteger(count) || count < 1) throw new Error('Frame count must be a positive integer');
  const wallStart = Date.now();
  await page.screenshot({ path: join(output, 'frame-00000.png') });
  for (let index = 1; index <= count; index++) {
    const frame = await page.evaluate(() => window.__cr.reference.captureFrame());
    if (frame.tick !== index * 2) throw new Error(`Frame ${index} is at tick ${frame.tick}`);
    await page.screenshot({ path: join(output, `frame-${String(index).padStart(5, '0')}.png`) });
    if (index % 30 === 0) console.log(JSON.stringify({ captured: index, total: count, tick: frame.tick }));
  }
  const telemetry = await page.evaluate(() => ({ ...window.__cr.reference.telemetry(), netStats: window.__cr.session.net.stats }));
  await writeFile(join(output, 'telemetry.json'), JSON.stringify(telemetry, null, 2) + '\n');
  const report = { mode: 'deterministic-render-replay', browserPath: 'Playwright (Browser plugin not available)', viewport, identity, clip, frames: count + 1,
    simulationSeconds: count / 30, captureWallSeconds: (Date.now() - wallStart) / 1000, errors, consoleMessages };
  await writeFile(join(output, 'capture.json'), JSON.stringify(report, null, 2) + '\n');
  if (errors.length) throw new Error(`Browser errors during capture: ${errors.join('\n')}`);
  console.log(JSON.stringify({ output, frames: report.frames, tick: telemetry.ticks.at(-1)?.tick, hash: telemetry.ticks.at(-1)?.hash, captureWallSeconds: report.captureWallSeconds }));
} finally { await browser.close(); }
