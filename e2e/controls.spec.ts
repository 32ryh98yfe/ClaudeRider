// Exercise the real keyboard capture → menu bubble path. Calling Session.setPaused directly
// misses the Escape event that used to open and immediately close the pause menu.
import { expect, test, type Page } from '@playwright/test';

const FAST = 'renderer=webgl2&quality=low&dpr=0.5&go=1&track=meadow_loop&seed=4242&laps=99';
interface RaceProbe {
  isPaused: boolean;
  world(): { tick: number; phase: number };
  renderer: { scene: { getObjectByName(name: string): { visible: boolean; count?: number } | undefined } };
}
const snapshot = (page: Page) => page.evaluate(() => {
  const s = window.__cr?.['session'] as RaceProbe;
  const box = s.renderer.scene.getObjectByName('itemBoxes');
  return { tick: s.world().tick, paused: s.isPaused, boxes: box?.visible ? box.count ?? 0 : 0 };
});

async function start(page: Page, mode: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/GL Driver Message|GPU stall due to ReadPixels/.test(m.text())) errors.push(m.text());
  });
  await page.goto(`/?${FAST}&mode=${mode}`);
  await page.waitForFunction(() => window.__cr?.['race'] === 'running', null, { timeout: 90_000 });
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  return errors;
}

test('Escape pauses the offline clock once, survives key repeat, and resumes with fresh input', async ({ page }) => {
  const errors = await start(page, 'speed');
  await page.waitForFunction(() => (window.__cr?.['session'] as RaceProbe).world().phase === 2);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(300);
  await page.keyboard.down('Escape');
  await expect(page.locator('.pause-scrim')).toBeVisible();
  await expect.poll(async () => (await snapshot(page)).paused).toBe(true);
  const stopped = await snapshot(page);
  // A repeated keydown belongs to the original physical press, not a second resume action.
  await page.keyboard.down('Escape');
  await page.waitForTimeout(400);
  expect(await snapshot(page)).toEqual(stopped);
  await page.keyboard.up('Escape');
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('Escape');
  await expect(page.locator('.pause-scrim')).toHaveCount(0);
  await expect.poll(async () => (await snapshot(page)).tick).toBeGreaterThan(stopped.tick);
  expect((await snapshot(page)).paused).toBe(false);
  await page.keyboard.press('Escape');
  await expect(page.locator('.pause-scrim')).toBeVisible();
  await page.locator('.pause button').nth(2).click();
  await expect(page.locator('.race-settings')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.race-settings')).toHaveCount(0);
  await expect(page.locator('.pause-scrim')).toBeVisible();
  expect((await snapshot(page)).paused).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.pause-scrim')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const mode of ['speed', 'timeAttack', 'item', 'infinite']) {
  test(`${mode} displays item boxes only when the mode can collect them`, async ({ page }) => {
    const errors = await start(page, mode);
    if (mode === 'item') await expect.poll(async () => (await snapshot(page)).boxes).toBeGreaterThan(0);
    else expect((await snapshot(page)).boxes).toBe(0);
    expect(errors).toEqual([]);
  });
}
