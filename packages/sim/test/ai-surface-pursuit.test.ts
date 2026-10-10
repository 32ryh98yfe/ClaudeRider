import { describe, expect, it } from 'vitest';
import { AI_TIERS, createAiDriver, makeInput } from '@cr/sim';
import { InputDelayLine } from '../src/ai/lookahead.ts';
import { loopKit } from './fixtures/kits.ts';
import { getContent } from './rig.ts';
import { place, racingRig, speedOf } from './util.ts';

describe('AI pursuit on a vertical surface', () => {
  for (const u of [-2, 0, 2]) it(`passes the upright and inverted loop with lateral start ${u} m`, () => {
    const kit = loopKit(), rig = racingRig(kit.track);
    rig.run(180);
    const k = place(rig, 0, { s: kit.loopS0 - 20, u, speed: 28.9 });
    const driver = createAiDriver(kit.track, getContent(), 0, AI_TIERS.pro, { noJitter: true, lookaheadTicks: 8, lineNoise: 0, mistakeRate: 0 }, 41);
    const delay = new InputDelayLine(8), out = makeInput();
    let verticalTicks = 0, invertedTicks = 0, minimum = Infinity;
    for (let tick = 0; tick < 360 && k.race.loc.s < kit.loopS1 + 15; tick++) {
      rig.tick((_w, inputs) => { driver.decide(rig.w, out); delay.push(out, inputs[0]!); });
      if (Math.abs(k.body.fy) > 0.9) verticalTicks++;
      if (k.body.ny < -0.9) invertedTicks++;
      minimum = Math.min(minimum, speedOf(k));
    }
    expect(k.race.loc.s).toBeGreaterThan(kit.loopS1 + 14);
    expect(verticalTicks).toBeGreaterThan(20); expect(invertedTicks).toBeGreaterThan(10);
    expect(minimum).toBeGreaterThan(20);
    expect(k.stats.respawns).toBe(0); expect(k.stats.wallHits).toBe(0);
    expect(driver.stats.recoveries).toBe(0); expect(driver.stats.resets).toBe(0);
  });
});
