// L10 UI e2e: every menu screen opens, keyboard navigation and Esc-back work, language toggles, rebinding with conflict
// detection, offline states for Quick Match and Custom Room, results fixture, and no console errors throughout.
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

const FAST = 'renderer=webgl2&quality=low&dpr=0.5';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() !== 'error') return;
    const txt = m.text();
    if (/GL Driver Message|GPU stall due to ReadPixels/.test(txt)) return;
    errors.push(txt);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}
async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __cr?: { ready?: boolean } }).__cr?.ready === true, null, { timeout: 60_000 });
}

test('menus: lobby → settings / garage / mode select / time attack / queue / room, keyboard + Esc', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`/?${FAST}&lang=ko`);
  await ready(page);
  await expect(page.locator('.title')).toBeVisible();
  await expect(page.locator('.title .disclaimer')).toContainText('Anthropic');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('lobby')).toBeVisible();
  await expect(page.getByTestId('quick-race')).toBeVisible();
  await expect(page.locator('.challenges .ch-list li')).toHaveCount(3);

  // keyboard navigation: arrows focus a control, Enter activates it
  await page.keyboard.press('ArrowDown');
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(focused).toBe('BUTTON');

  // language toggle (Korean default → English → Korean)
  await expect(page.getByTestId('quick-race')).toContainText('빠른 레이스');
  await page.getByTestId('lang-toggle').click();
  await expect(page.getByTestId('quick-race')).toContainText('Quick Race');
  await page.getByTestId('lang-toggle').click();
  await expect(page.getByTestId('quick-race')).toContainText('빠른 레이스');

  // settings: About shows the disclaimer; rebinding detects a conflict and moves the key
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await page.getByTestId('tab-about').click();
  await expect(page.locator('.about-disclaimer')).toContainText('Nexon');
  await page.getByTestId('tab-controls').click();
  await page.getByTestId('bind-drift-0').click();
  await expect(page.locator('.modal.capture')).toBeVisible();
  await page.keyboard.press('Space'); // already used by item/booster
  await expect(page.locator('.modal h2')).toContainText('이미 쓰이는 키');
  await page.locator('.modal [data-autofocus]').click();
  await expect(page.getByTestId('bind-drift-0')).toContainText('Space');
  const keys = await page.evaluate(() => JSON.parse(localStorage.getItem('cr.save.v1') ?? '{}').settings.keys as Record<string, string[]>);
  expect(keys['drift']![0]).toBe('Space');
  expect(keys['item']).not.toContain('Space');
  await page.getByText('기본값으로').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('lobby')).toBeVisible();

  // garage opens and Esc returns
  await page.getByTestId('open-garage').click();
  await expect(page.getByTestId('garage')).toBeVisible();
  await expect(page.locator('.char-grid .gtile')).toHaveCount(12);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('lobby')).toBeVisible();

  // mode select: pick item mode, back
  await page.getByTestId('change-setup').click();
  await page.getByTestId('mode-card-item').click();
  await expect(page.getByTestId('mode-card-item')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('lobby')).toBeVisible();

  // time attack lists tracks
  await page.getByTestId('open-timeattack').click();
  await expect(page.getByTestId('ta-start')).toBeVisible();
  await page.keyboard.press('Escape');

  // quick match and custom room show proper offline states against the stub
  await page.getByTestId('quick-match').click();
  await expect(page.getByTestId('queue-offline')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('open-room').click();
  await expect(page.getByTestId('room-landing')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('lobby')).toBeVisible();
  expect(errors).toEqual([]);
});

test('results fixture renders 8 rows, rewards and actions', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`/?${FAST}&screen=results&demo=results&lang=en`);
  await ready(page);
  await expect(page.getByTestId('results')).toBeVisible();
  await expect(page.locator('[data-testid=results] tbody tr')).toHaveCount(8);
  await expect(page.locator('.res-rewards')).toBeVisible();
  await expect(page.getByTestId('again')).toBeVisible();
  expect(errors).toEqual([]);
});

test('HUD fixture shows every core element', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`/?${FAST}&demo=hud&v=item`);
  await ready(page);
  for (const sel of ['.hud-rank', '.hud-standings li', '.hud-lap', '.hud-speed', '.hud-slots .slot.big', '.hud-minimap', '.hud-feed li', '.hud-incoming']) {
    await expect(page.locator(sel).first(), sel).toBeVisible();
  }
  await expect(page.locator('.lap-timers dd').nth(2)).not.toBeEmpty();
  expect(errors).toEqual([]);
});
