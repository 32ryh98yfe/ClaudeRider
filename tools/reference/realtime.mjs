/* global window, document, MediaRecorder, FileReader */
// Browser plugin not available. Validate actual wall-clock rendering and save unretimed Chrome video.
// node tools/reference/realtime.mjs <dev-url> <clip-id> </absolute/output>
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

const [base, clip, output] = process.argv.slice(2);
if (!base || !clip || !output || !isAbsolute(output)) throw new Error('usage: realtime.mjs <dev-url> <clip-id> </absolute/output>');
const url = new URL(base);
for (const [key, value] of Object.entries({ go: '1', reference: clip, capture: '0', authority: 'main', quality: 'low', renderer: 'webgl2', dpr: '1', bloom: '0', seed: '4242', laps: '99' })) {
  if (!url.searchParams.has(key) || ['go', 'reference', 'capture', 'authority', 'seed'].includes(key)) url.searchParams.set(key, value);
}
if (!url.searchParams.has('track')) url.searchParams.set('track', 'proving_ring');
await mkdir(output, { recursive: true });
const chrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ ...(existsSync(chrome) ? { executablePath: chrome } : {}), args: ['--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [], warnings = [];
await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
page.on('console', (message) => {
  if (message.type() === 'warning') warnings.push(message.text());
  if (message.type() === 'error') errors.push(message.text());
});
try {
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__cr?.reference && window.__cr?.race === 'running', null, { timeout: 180_000 });
  const recordingStartTick = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('No game canvas');
    const stream = canvas.captureStream(60);
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 4_000_000 });
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    window.__referenceMovie = { recorder, stream, chunks };
    recorder.start();
    return window.__cr.session.world().tick;
  });
  await page.waitForFunction(() => window.__cr.session.world().tick >= window.__cr.reference.durationTicks, null, { timeout: 60_000 });
  const video = await page.evaluate(() => new Promise((resolve, reject) => {
    const { recorder, stream, chunks } = window.__referenceMovie;
    recorder.onstop = () => {
      for (const track of stream.getTracks()) track.stop();
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }));
    };
    recorder.stop();
  }));
  await writeFile(join(output, 'realtime.webm'), Buffer.from(video, 'base64'));
  const telemetry = await page.evaluate(() => ({ ...window.__cr.reference.telemetry(), netStats: window.__cr.session.net.stats, budget: window.__cr.budget }));
  const first = telemetry.frames[0], last = telemetry.frames.at(-1);
  const renderSeconds = (last.wallTimeMs - first.wallTimeMs) / 1000;
  const renderedFps = (telemetry.frames.length - 1) / renderSeconds;
  const report = { mode: 'real-time-replay', title: await page.title(), url: page.url(), meaningfulContent: (await page.locator('body').innerText()).slice(0, 2000),
    frameworkOverlays: await page.locator('vite-error-overlay').count(), recordedFrames: telemetry.frames.length, renderSeconds, renderedFps,
    meets30fps: renderedFps >= 30, physicsTicks: telemetry.ticks.length - 1, errors, warnings,
    recordingStartTick, note: 'Native Chrome canvas MediaRecorder avoids unavailable Playwright FFmpeg. Video shows actual 3D gameplay at wall-clock speed; the DOM HUD is in final.png. Use deterministic PNG sequences for exact source-frame alignment. No retiming.',
  };
  await page.screenshot({ path: join(output, 'final.png') });
  await writeFile(join(output, 'telemetry.json'), JSON.stringify(telemetry, null, 2) + '\n');
  await writeFile(join(output, 'realtime.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  await context.close();

  if (errors.length || report.frameworkOverlays) throw new Error('Browser runtime errors; inspect realtime.json');
} finally { await browser.close(); }
