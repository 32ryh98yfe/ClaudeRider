// The missing-input rule (20-netcode-spec §6.2), shared by the authority and the predictor.
import { describe, expect, it } from 'vitest';
import { makeInput, type InputFrame } from '@cr/sim';
import { InputRing, NET, RunningInput, stepMissing } from '../src/index.ts';

const frame = (o: Partial<InputFrame>): InputFrame => Object.assign(makeInput(), o);

describe('missing inputs (§6.2)', () => {
  it('holds steer, throttle and held bits; releases the brake after MISSING_BRAKE_HOLD ticks; never synthesizes edges', () => {
    const cur = frame({ steer: 127, throttle: 15, brake: 15, held: 1, edges: 4, steerIntent: 1, driftRequests: 341 });
    const seen: [number, number, number, number, number][] = [];
    for (let miss = 1; miss <= 8; miss++) { stepMissing(cur, miss); expect(cur.driftRequests).toBe(0); seen.push([cur.steer, cur.throttle, cur.brake, cur.held, cur.edges]); }
    expect(NET.MISSING_BRAKE_HOLD).toBe(2);
    expect(seen.map((x) => x[2])).toEqual([15, 15, 0, 0, 0, 0, 0, 0]);
    expect(seen.map((x) => x[0])).toEqual([127, 127, 127, 127, 127, 127, 107, 90]);
    for (const x of seen) { expect(x[1]).toBe(15); expect(x[3]).toBe(1); expect(x[4]).toBe(0); }
  });

  it('a held brake turn of ≤ 8 ticks never reaches the 11-tick spin-out through the hold (8 + 2 < 11)', () => {
    expect(8 + NET.MISSING_BRAKE_HOLD).toBeLessThan(11);
    // RunningInput.seek stops early once steering has decayed to 0 past MISSING_HOLD: the brake must be released by then
    expect(NET.MISSING_BRAKE_HOLD).toBeLessThanOrEqual(NET.MISSING_HOLD);
  });

  it('RunningInput.seek over a gap equals advancing tick by tick, brake included', () => {
    for (const steer of [0, 3, 127]) {
      const ring = new InputRing();
      ring.set(10, frame({ steer, throttle: 15, brake: 15 }));
      const walk = new RunningInput(), jump = new RunningInput();
      walk.seek(ring, 10);
      for (let t = 11; t <= 60; t++) {
        expect(walk.advance(ring, t)).toBe(false);
        jump.seek(ring, t);
        expect([jump.cur.steer, jump.cur.throttle, jump.cur.brake], `steer ${steer} tick ${t}`).toEqual([walk.cur.steer, walk.cur.throttle, walk.cur.brake]);
        expect(walk.cur.brake, `tick ${t}`).toBe(t - 10 <= NET.MISSING_BRAKE_HOLD ? 15 : 0);
      }
    }
  });
});
