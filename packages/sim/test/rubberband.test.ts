// Rubber-band cap (14-ai-spec §7, ADR-009): ±4% keyed to the distance from the reference human; off for humans,
// Legend, Time Attack and the final 15%; never lifts a bot above 1.00.
import { describe, expect, it } from 'vitest';
import type { KartState, StepContext, WorldState } from '@cr/sim';
import { referenceDist, rubberBandMul } from '../src/race/rubberband.ts';

const L = 1000;
type Slot = { kind: 'human' | 'bot' | 'empty'; ai?: 'rookie' | 'racer' | 'pro' | 'legend'; vMul: number };

function scene(slots: Slot[], dist: number[], o: { finish?: number[]; mode?: string; rb?: boolean; laps?: number; tick?: number } = {}) {
  const karts = dist.map((d, i) => ({ slot: i, race: { raceDist: d, finishTick: o.finish?.[i] ?? -1 } }));
  const w = { tick: o.tick ?? 1000, karts } as unknown as WorldState;
  const ctx = {
    cfg: { mode: o.mode ?? 'speed', laps: o.laps ?? 3, slots, rules: { rubberBand: o.rb ?? true } },
    track: { lapLength: L },
  } as unknown as StepContext;
  const mul = (i: number): number => rubberBandMul(w, karts[i] as unknown as KartState, ctx);
  return { w, ctx, mul };
}

const H: Slot = { kind: 'human', vMul: 1 };
const bot = (ai: Slot['ai'], vMul = 1): Slot => ({ kind: 'bot', ai, vMul });

describe('rubber-band capMul (§7)', () => {
  it('ahead of the human: neutral to 20 m, linear to −4% at 200 m, flat beyond', () => {
    const at = (d: number): number => scene([H, bot('pro')], [500, 500 + d]).mul(1);
    expect(at(0)).toBe(1);
    expect(at(20)).toBe(1);
    expect(at(110)).toBeCloseTo(0.98, 12);
    expect(at(200)).toBeCloseTo(0.96, 12);
    expect(at(900)).toBeCloseTo(0.96, 12);
  });

  it('behind: Rookie/Racer gain up to +4% at 250 m but never exceed 1.00 overall; Pro gets no lift', () => {
    const at = (b: Slot, d: number): number => scene([H, b], [900, 900 - d]).mul(1);
    expect(at(bot('racer'), 30)).toBe(1);
    expect(at(bot('racer', 0.9), 140)).toBeCloseTo(1.02, 12);
    expect(at(bot('racer', 0.9), 250)).toBeCloseTo(1.04, 12);
    expect(at(bot('rookie', 0.99), 400)).toBeCloseTo(1 / 0.99, 12); // vMul · cap = 1.00
    expect(at(bot('racer', 1), 400)).toBe(1);
    expect(at(bot('pro', 0.95), 400)).toBe(1);
  });

  it('off for humans, Legend, Time Attack, when the room disables it, and in the final 15% of the race', () => {
    expect(scene([H, H], [0, 300]).mul(1)).toBe(1);
    expect(scene([H, bot('legend')], [0, 300]).mul(1)).toBe(1);
    expect(scene([H, bot('pro')], [0, 300], { mode: 'timeAttack' }).mul(1)).toBe(1);
    expect(scene([H, bot('pro')], [0, 300], { rb: false }).mul(1)).toBe(1);
    expect(scene([H, bot('pro')], [2000, 2849]).mul(1)).toBeLessThan(1);
    expect(scene([H, bot('pro')], [2000, 2850]).mul(1)).toBe(1);
    expect(scene([bot('pro'), bot('pro')], [0, 300]).mul(1)).toBe(1); // no human
  });

  it('reference: the lower median of the humans; a finished human keeps advancing at V_REF', () => {
    expect(referenceDist(scene([H, H, H, H, bot('pro')], [400, 100, 300, 200, 0]).w, scene([H, H, H, H], [400, 100, 300, 200]).ctx)).toBe(200);
    const s = scene([H, H, H, bot('pro')], [900, 100, 500, 0]);
    expect(referenceDist(s.w, s.ctx)).toBe(500);
    // human finished 60 ticks ago on a 3-lap race: 3000 + 60 · 34/60 = 3034
    const f = scene([H, bot('pro')], [3000, 2000], { finish: [940, -1], tick: 1000 });
    expect(referenceDist(f.w, f.ctx)).toBeCloseTo(3034, 9);
  });

  it('is pure: repeated calls give the same value and change nothing', () => {
    const s = scene([H, bot('racer', 0.93), bot('pro')], [700, 480, 820]);
    const a = [s.mul(1), s.mul(2)], b = [s.mul(1), s.mul(2)];
    expect(b).toEqual(a);
    expect(s.w.karts.map((k) => k.race.raceDist)).toEqual([700, 480, 820]);
  });
});
