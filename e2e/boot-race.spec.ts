// E2E: boot → lobby (≤ 8 s, no console errors) → autopilot race → results; Node vs Chromium determinism.
import { readFileSync } from 'node:fs';
import { expect, test, type ConsoleMessage } from '@playwright/test';
import { loadContent } from '@cr/content';
import { loadCtrk, toArrayBuffer } from '@cr/sim';
import { determinismScenario } from '@cr/sim/testing/scenario.ts';

// SwiftShader is a CPU rasterizer: keep the canvas small and let the sim run ahead of rendering.
const FAST = 'renderer=webgl2&quality=low&dpr=0.5';

function collectErrors(page: import('@playwright/test').Page): string[] {
  const errors: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() !== 'error') return;
    const txt = m.text();
    if (/GL Driver Message|GPU stall due to ReadPixels/.test(txt)) return; // SwiftShader driver chatter
    errors.push(txt);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

test('boot → title → lobby → autopilot race → results', async ({ page }) => {
  const errors = collectErrors(page);
  const t0 = Date.now();
  await page.goto(`/?${FAST}&autopilot=1&simRate=20&laps=1`);
  await page.waitForFunction(() => (window as unknown as { __cr?: { ready?: boolean } }).__cr?.ready === true, null, { timeout: 30_000 });
  await expect(page.locator('.title')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('quick-race')).toBeVisible();
  const bootMs = Date.now() - t0;
  expect(bootMs, `boot → lobby took ${bootMs} ms`).toBeLessThan(8_000 * 2); // headless CPU rendering gets 2× slack
  await page.getByTestId('quick-race').click();
  await page.waitForFunction(() => (window as unknown as { __cr?: { race?: string } }).__cr?.race === 'running', null, { timeout: 60_000 });
  await page.waitForFunction(() => (window as unknown as { __cr?: { race?: string } }).__cr?.race === 'done', null, { timeout: 180_000 });
  await expect(page.getByTestId('results')).toBeVisible();
  const rows = await page.locator('[data-testid=results] tbody tr').count();
  expect(rows).toBe(8);
  expect(errors).toEqual([]);
});

test('Node and Chromium produce identical world hashes', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/selftest.html?track=meadow_loop');
  await page.waitForFunction(() => (window as unknown as { __selftest?: unknown }).__selftest !== undefined, null, { timeout: 120_000 });
  const browser = await page.evaluate(() => (window as unknown as { __selftest: unknown }).__selftest) as { speed: string[]; item: string[] } | { error: string };
  expect('error' in browser ? browser.error : '').toBe('');
  const buf = readFileSync(new URL('../apps/client/public/tracks/meadow_loop.ctrk', import.meta.url));
  const track = loadCtrk(toArrayBuffer(buf));
  const content = loadContent();
  const node = { speed: determinismScenario(track, content, 'speed'), item: determinismScenario(track, content, 'item') };
  expect((browser as { speed: string[] }).speed).toEqual(node.speed);
  expect((browser as { item: string[] }).item).toEqual(node.item);
  expect(errors).toEqual([]);
});
