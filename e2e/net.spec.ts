// E2E (lane L9): two browser contexts join one custom room by its 6-char code, race 1 lap of Proving Ring online
// against bots, and both see the results; the offline race runs its authority in a Worker whose world hashes equal
// Node's. The room screens are L10's, so the lobby is driven through the dev hook `window.__crNet`.
import { readFileSync } from 'node:fs';
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { loadContent } from '@cr/content';
import { loadCtrk, toArrayBuffer } from '@cr/sim';
import { determinismScenario } from '@cr/sim/testing/scenario.ts';

const FAST = 'renderer=webgl2&quality=low&dpr=0.5';

interface NetHook {
  lobby: { conn: { value: string }; room: { value: { code: string; phase: string; slots: { state: string; name?: string }[] } | null }; lastResult: { value: { rows: unknown[] } | null }; error: { value: string | null } };
  actions: Record<string, (...a: unknown[]) => void>;
  connect(name: string, loadout: unknown): Promise<void>;
  workerSelftest(track: string): Promise<{ speed: string[]; item: string[] } | { error: string }>;
}
declare global { interface Window { __crNet?: NetHook; __cr?: Record<string, unknown> } }

const LOADOUT = { characterId: 'clay', kartBodyId: 'pebble', livery: { primary: '#d97757', secondary: '#faf9f5', pattern: 0, number: 7 } };

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

async function boot(page: Page, query: string): Promise<void> {
  await page.goto(`/?${FAST}&${query}`);
  await page.waitForFunction(() => window.__cr?.ready === true && window.__crNet !== undefined, null, { timeout: 60_000 });
}

test('two contexts join a custom room by code, race 1 lap online and both see results', async ({ browser }) => {
  const ctxA = await browser.newContext(), ctxB = await browser.newContext();
  const a = await ctxA.newPage(), b = await ctxB.newPage();
  const errA = collectErrors(a), errB = collectErrors(b);
  await Promise.all([boot(a, 'autopilot=1'), boot(b, 'autopilot=1')]);
  await a.evaluate((l) => window.__crNet!.connect('Alpha', l), LOADOUT);
  await b.evaluate((l) => window.__crNet!.connect('Bravo', l), LOADOUT);
  expect(await a.evaluate(() => window.__crNet!.lobby.conn.value)).toBe('online');

  await a.evaluate(() => window.__crNet!.actions['create']!({ mode: 'speed', teams: 'solo', track: 'proving_ring', laps: 1, fillBots: true, botTier: 'pro', isPrivate: true, maxHumans: 8 }));
  const code = await (await a.waitForFunction(() => window.__crNet!.lobby.room.value?.code ?? false)).jsonValue() as string;
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  await b.evaluate((c) => window.__crNet!.actions['join']!(c.toLowerCase()), code);
  await a.waitForFunction(() => window.__crNet!.lobby.room.value?.slots.filter((s) => s.state === 'human').length === 2);
  await b.evaluate(() => window.__crNet!.actions['ready']!(true));
  await a.waitForFunction(() => window.__crNet!.lobby.room.value?.slots.find((s) => s.name === 'Bravo')?.state === 'human');
  await a.evaluate(() => window.__crNet!.actions['start']!());

  // both load the track, the server starts the race when both reported `loaded`
  for (const p of [a, b]) await p.waitForFunction(() => window.__cr?.race === 'running', null, { timeout: 120_000 });
  expect(await a.evaluate(() => (window.__cr!['session'] as { authorityKind: string }).authorityKind)).toBe('server');
  for (const p of [a, b]) await p.waitForFunction(() => window.__cr?.race === 'done', null, { timeout: 200_000 });

  for (const p of [a, b]) {
    await expect(p.getByTestId('results')).toBeVisible();
    expect(await p.locator('[data-testid=results] tbody tr').count()).toBe(8);
  }
  const ra = await a.evaluate(() => window.__crNet!.lobby.lastResult.value);
  const rb = await b.evaluate(() => window.__crNet!.lobby.lastResult.value);
  expect(ra).toEqual(rb);
  const rows = (ra as { rows: { kind: string; finished: boolean }[] }).rows;
  expect(rows.filter((r) => r.kind === 'human').length).toBe(2);
  const stats = await a.evaluate(() => (window.__cr!['session'] as { net: { stats: { decodeErrors: number; snapshots: number } } }).net.stats);
  expect(stats.decodeErrors).toBe(0);
  expect(stats.snapshots).toBeGreaterThan(100);
  expect(errA).toEqual([]);
  expect(errB).toEqual([]);
  await ctxA.close(); await ctxB.close();
});

test('offline races run the authority in a Worker whose world hashes equal Node', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, 'autopilot=1&simRate=20&laps=1');
  const worker = await page.evaluate(() => window.__crNet!.workerSelftest('meadow_loop'));
  expect('error' in worker ? worker.error : '').toBe('');
  const track = loadCtrk(toArrayBuffer(readFileSync(new URL('../apps/client/public/tracks/meadow_loop.ctrk', import.meta.url))));
  const content = loadContent();
  expect((worker as { speed: string[] }).speed).toEqual(determinismScenario(track, content, 'speed', 600));
  expect((worker as { item: string[] }).item).toEqual(determinismScenario(track, content, 'item', 600));
  // the regular quick race path picks the Worker authority
  await page.keyboard.press('Enter');
  await page.getByTestId('quick-race').click();
  await page.waitForFunction(() => window.__cr?.race === 'running', null, { timeout: 60_000 });
  expect(await page.evaluate(() => (window.__cr!['session'] as { authorityKind: string }).authorityKind)).toBe('worker');
  expect(errors).toEqual([]);
});
