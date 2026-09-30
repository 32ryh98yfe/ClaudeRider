// E2E across modes (M3): Time Attack records a ghost and races it on the next run; a Squad race ends with a team
// verdict. Both run offline (the authority in a Worker) with the autopilot at 20× sim rate on the short oval.
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

const FAST = 'renderer=webgl2&quality=low&dpr=0.5&autopilot=1&simRate=20&laps=1';

type CrWindow = { __cr?: { race?: string; session?: Record<string, unknown> } };

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() !== 'error') return;
    if (/GL Driver Message|GPU stall due to ReadPixels/.test(m.text())) return; // SwiftShader driver chatter
    errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function raceToResults(page: Page, query: string): Promise<void> {
  await page.goto(`/?${FAST}&go=1&${query}`);
  await page.waitForFunction(() => (window as CrWindow).__cr?.race === 'running', null, { timeout: 90_000 });
  await page.waitForFunction(() => (window as CrWindow).__cr?.race === 'done', null, { timeout: 180_000 });
  await expect(page.getByTestId('results')).toBeVisible();
}

test('Time Attack: the first run saves a ghost, the second run races it', async ({ page }) => {
  test.setTimeout(420_000);
  const errors = collectErrors(page);
  await raceToResults(page, 'track=proving_ring&mode=timeAttack');
  // solo: one row, and the recorded run is written to IndexedDB after the finish
  expect(await page.locator('[data-testid=results] tbody tr').count()).toBe(1);
  await page.waitForTimeout(2_000);

  await page.goto(`/?${FAST}&go=1&track=proving_ring&mode=timeAttack`);
  await page.waitForFunction(() => (window as CrWindow).__cr?.race === 'running', null, { timeout: 90_000 });
  const ghost = await page.evaluate(() => (window as CrWindow).__cr?.session?.['ghostRun'] != null);
  expect(ghost, 'the second Time Attack run loads the saved ghost').toBe(true);
  expect(errors).toEqual([]);
});

test('Squad: 2 teams of 4 race and the results show the team verdict', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  await raceToResults(page, 'track=proving_ring&mode=speed&teams=squad');
  const teams = await page.evaluate(() => ((window as CrWindow).__cr?.session?.['config'] as { teams?: string } | undefined)?.teams);
  expect(teams).toBe('squad');
  expect(await page.locator('[data-testid=results] tbody tr').count()).toBe(8);
  await expect(page.locator('.res-rank.win, .res-rank.lose')).toBeVisible();
  expect(errors).toEqual([]);
});
