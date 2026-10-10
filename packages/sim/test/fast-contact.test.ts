import { describe, expect, it } from 'vitest';
import { DT } from '@cr/sim';
import { KART_R } from '../src/kart/motion.ts';
import { corridor, flatPlane } from './fixtures/kits.ts';
import { place, racingRig } from './util.ts';

describe('adaptive high-speed static contact', () => {
  for (const speed of [180, 360]) for (const side of [-1, 1]) {
    it(`cannot cross a zero-thickness wall at ${speed}m/s toward side ${side}`, () => {
      const r = racingRig(corridor(16).track);
      // A normal half-step can put the centre beyond this plane. Its endpoint sphere then resolves
      // on the wrong side. Subsegments must meet it before crossing, for either wall winding.
      const k = place(r, 0, { s: 300, u: side * (8 - KART_R - 0.1), speed, yawDeg: side * -90 });
      r.tick((_w, f) => { f[0]!.throttle = 15; });
      expect(k.body.wallContact).toBe(1); expect(k.stats.wallHits).toBe(1);
      expect(k.body.pz * side).toBeLessThanOrEqual(8 - KART_R + 1 / 4096);
      expect(Object.values(k.body).every(Number.isFinite)).toBe(true);
      for (let t = 0; t < 8; t++) {
        r.tick((_w, f) => { f[0]!.throttle = 15; });
        expect(k.body.pz * side).toBeLessThanOrEqual(8 - KART_R + 1 / 4096);
        expect(Object.values(k.body).every(Number.isFinite)).toBe(true);
      }
    });
  }

  it('subdivision does not integrate gravity a second time', () => {
    const r = racingRig(flatPlane().track), k = place(r, 0, { s: 300, h: 10, speed: 180 });
    k.body.vy = -160; k.body.coyote = 0;
    r.tick();
    expect(k.body.grounded).toBe(0);
    expect(Math.abs(k.body.vy - (-160 - 28 * DT))).toBeLessThanOrEqual(1 / 4096);
    expect(Math.abs(k.body.px - (200 + 180 * DT))).toBeLessThanOrEqual(1 / 4096);
  });
});
