/* global window, document, MediaRecorder, FileReader, requestAnimationFrame */
// Browser plugin not available: native Chrome/Playwright keys, normal input+authority+renderer, no state correction.
// node tools/reference/keyboard-play.mjs <dev-url> </absolute/output> [flat|R9L|R9R|R12L|R12R|R16L|R16R]
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
const [base, output, course = 'flat'] = process.argv.slice(2);
if (!base || !output || !isAbsolute(output)) throw new Error('Expected URL and absolute output directory');
const schedules = JSON.parse(await readFile(new URL('../../docs/research/handling-keyboard-scenarios.json', import.meta.url)));
const url = new URL(base);
for (const [key, value] of Object.entries({ go: '1', track: 'proving_ring', mode: 'speed', handling: course, quality: 'low', renderer: 'webgl2', dpr: '1', bloom: '0', seed: '4242', laps: '99' })) url.searchParams.set(key, value);
await mkdir(output, { recursive: true });
// installed Chrome when present (as capture.mjs), otherwise Playwright's bundled Chromium
const chrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ ...(existsSync(chrome) ? { executablePath: chrome } : {}), args: ['--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } }), errors = [], warnings = [], actions = [];
page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warnings.push(m.text()); });
await page.route('**/favicon.ico', r => r.fulfill({ status: 204, body: '' }));
try {
  await page.goto(url.href);
  await page.waitForFunction(() => window.__cr?.race === 'running', null, { timeout: 120000 });
  const initial = await page.evaluate(() => {
    const s = window.__cr.session, room = s.local.room, tick = room.tick.bind(room);
    window.__handling = { rows: [], frames: [], raw: window.__cr.inputTrace(true), applied: window.__cr.authorityInputTrace(true) };
    room.tick = (...args) => {
      const result = tick(...args), w = room.world, k = w.karts[0], b = k.body, d = k.drive;
      window.__handling.rows.push({ tick: w.tick, s: k.race.loc.s, u: k.race.loc.u, speed: Math.hypot(b.vx, b.vy, b.vz), slip: Math.atan2(b.vx * b.fz - b.vz * b.fx, b.vx * b.fx + b.vz * b.fz), yaw: b.yawRate, drift: d.drift, intent: d.driftIntentTicks, engagement: d.driftEngagement, boost: d.boostTicks, gauge: d.gauge, stock: d.boosters, wall: b.wallContact, respawns: k.stats.respawns, p: [b.px, b.py, b.pz], f: [b.fx, b.fy, b.fz], v: [b.vx, b.vy, b.vz] });
      return result;
    };
    const frame = t => { if (window.__handling.stop) return; window.__handling.frames.push({ time: t, tick: s.world().tick, draws: s.renderer.renderedFrameCount }); requestAnimationFrame(frame); }; requestAnimationFrame(frame);
    const stream = document.querySelector('canvas').captureStream(60), chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 3500000 });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); }; recorder.start();
    window.__handling.movie = { stream, chunks, recorder };
    return { tick: s.world().tick, version: s.config.simVersion, authority: s.authorityKind, autopilot: !!s.autopilot, reference: !!s.reference };
  });
  async function keys(name, down = [], up = []) {
    for (const key of up) await page.keyboard.up(key);
    for (const key of down) await page.keyboard.down(key);
    actions.push({ name, down, up, tick: await page.evaluate(() => window.__cr.session.world().tick) });
  }
  async function until(tick) { await page.waitForFunction(t => window.__cr.session.world().tick >= t, tick, { polling: 5, timeout: 20000 }); }
  await keys('throttle', ['ArrowUp']);
  if (course === 'flat') {
    const start = actions[0].tick + 20; await until(start);
    await keys('short-right', ['ArrowRight', 'ShiftLeft']); await page.waitForTimeout(30); await keys('release-shift', [], ['ShiftLeft']);
    await until(start + 40); await page.screenshot({ path: join(output, 'short-skid.png') });
    await keys('counter-left', ['ArrowLeft'], ['ArrowRight']); await until(start + 60);
    await keys('new-left', ['ShiftLeft']); await page.waitForTimeout(30); await keys('release-again', [], ['ShiftLeft']);
    await until(start + 85); await keys('boost', ['ControlLeft']); await until(start + 110);
    await keys('counter-under-boost', ['ArrowRight'], ['ArrowLeft']); await until(start + 145);
    await keys('rapid-sequence', [], ['ArrowRight', 'ControlLeft']);
    for (let n = 0; n < 7; n++) { await keys(`press-${n}`, ['ArrowLeft', 'ShiftLeft']); await keys(`release-${n}`, [], ['ShiftLeft']); }
    await until(start + 180); await keys('restore', ['ArrowRight'], ['ArrowLeft']); await until(start + 220);
  } else {
    const scenario = schedules.scenarios.find(s => s.radiusM === Number(course.slice(1, -1)));
    const turn = course.endsWith('L') ? 'ArrowLeft' : 'ArrowRight', opposite = turn === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    await until(scenario.entryTick); await keys('turn-once', [turn, 'ShiftLeft']);
    await until(scenario.entryTick + scenario.turnTicks); await keys('counter-held-shift', [opposite], [turn]);
    await until(scenario.entryTick + scenario.turnTicks + scenario.counterTicks); await keys('exit', [], [opposite, 'ShiftLeft']);
    await until(scenario.entryTick + scenario.turnTicks + scenario.counterTicks + 120);
  }
  await page.screenshot({ path: join(output, 'final.png') });
  const data = await page.evaluate(async () => {
    window.__handling.stop = true;
    const h = window.__handling, { recorder, chunks, stream } = h.movie;
    const video = await new Promise((resolve, reject) => { recorder.onstop = () => { stream.getTracks().forEach(t => t.stop()); const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(reader.error); reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' })); }; recorder.stop(); });
    return { rows: h.rows, frames: h.frames, raw: h.raw, applied: h.applied, video, net: window.__cr.session.net.stats };
  });
  await writeFile(join(output, 'realtime.webm'), Buffer.from(data.video, 'base64')); delete data.video;
  const seconds = (data.frames.at(-1).time - data.frames[0].time) / 1000;
  const report = { course, initial, url: page.url(), title: await page.title(), overlay: await page.locator('vite-error-overlay').count(), body: (await page.locator('body').innerText()).slice(0, 2000), errors, warnings, actions, renderedFps: (data.frames.at(-1).draws - data.frames[0].draws) / seconds, peakSlipDeg: Math.max(...data.rows.map(r => Math.abs(r.slip))) * 180 / Math.PI, wallTicks: data.rows.filter(r => r.wall).length, final: data.rows.at(-1), ...data };
  await writeFile(join(output, 'keyboard.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ course, initial, renderedFps: report.renderedFps, peakSlipDeg: report.peakSlipDeg, wallTicks: report.wallTicks, final: report.final, actions, errors, warnings }));
  if (errors.length || report.overlay) throw new Error('Browser runtime error');
} finally { await browser.close(); }
