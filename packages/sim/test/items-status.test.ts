// Status rules (12-items-spec §6): hard CC refreshes (never stacks, never shortens), 36-tick immunity, throttle stacks
// ≤ 3 with caps 0.60/0.52/0.44·V_REF, shield/halo/grace and their exceptions, mash-out escape times.
import { describe, expect, it } from 'vitest';
import { Edge } from '@cr/sim';
import { EF, EFlag } from '../src/items/codes.ts';
import { scheduleEffect } from '../src/items/effects.ts';
import { airborneLift } from '../src/items/kinematics.ts';
import { scenario, type Scenario } from './items-rig.ts';

function cruising(count = 2): Scenario {
  const sc = scenario({ count });
  sc.until(() => sc.w.tick >= sc.w.goTick + 120);
  return sc;
}
let seed = 1000;
/** Schedules `code` on `victim` starting at the next tick (+ `lead`), from source slot `source`. */
function hit(sc: Scenario, code: number, victim = 0, lead = 1, blockable = true, source = 1): void {
  scheduleEffect(sc.w, sc.ctx, code, victim, source, sc.w.tick + lead, 0, 0, blockable ? EFlag.BLOCKABLE : 0, seed++);
}
const results = (sc: Scenario, victim: number, code: number): string[] =>
  sc.events.filter((e) => e.t === 'effect' && e.victim === victim && e.effect === code).map((e) => (e as { result: string }).result);

describe('hard crowd control', () => {
  it('refreshes instead of stacking and never shortens; the later end drives the kinematics', () => {
    const sc = cruising();
    const st = sc.w.karts[0]!.status;
    hit(sc, EF.spin); sc.advance(1);
    const S = sc.w.tick;
    expect([st.cc, st.ccStart, st.ccEnd]).toEqual([EF.spin, S, S + 60]);
    sc.advance(9); hit(sc, EF.spin); sc.advance(1);                // S + 10: spin again → end S + 70
    expect([st.cc, st.ccEnd]).toEqual([EF.spin, S + 70]);
    sc.advance(9); hit(sc, EF.trap_bug); sc.advance(1);            // S + 20: longer trap takes over
    expect([st.cc, st.ccStart, st.ccEnd]).toEqual([EF.trap_bug, S + 20, S + 104]);
    sc.advance(9); hit(sc, EF.spin); sc.advance(1);                // S + 30: shorter spin is absorbed
    expect([st.cc, st.ccEnd]).toEqual([EF.trap_bug, S + 104]);
    expect(results(sc, 0, EF.spin)).toEqual(['hit', 'hit', 'hit']);
    expect(sc.w.effects.filter((e) => e.victim === 0 && (e.flags & EFlag.DRIVER) !== 0)).toHaveLength(1);
  });

  it('is followed by 36 ticks of hard-CC immunity (soft effects still land)', () => {
    const sc = cruising();
    const st = sc.w.karts[0]!.status;
    hit(sc, EF.spin); sc.advance(1);
    const E = st.ccEnd;
    sc.until(() => st.cc === 0);
    expect(sc.w.tick).toBe(E - 1);
    expect(st.immuneUntil).toBe(E + 36);
    sc.until(() => sc.w.tick === E + 34);
    hit(sc, EF.stun); hit(sc, EF.mirror); sc.advance(1);          // starts at E + 35
    expect(results(sc, 0, EF.stun)).toEqual(['immune']);
    expect(results(sc, 0, EF.mirror)).toEqual(['hit']);
    hit(sc, EF.stun); sc.advance(1);                               // starts at E + 36
    expect(results(sc, 0, EF.stun)).toEqual(['immune', 'hit']);
  });

  it('cancels the active boost and the drift, keeps the items', () => {
    const sc = cruising();
    const k = sc.w.karts[0]!;
    k.drive.boostTicks = 100; k.drive.boostKind = 4; sc.give(0, 'context_shield', 'turbo_token');
    hit(sc, EF.spin); sc.advance(1);
    expect([k.drive.boostTicks, k.drive.boostKind, k.drive.drift]).toEqual([0, 0, 0]);
    expect([k.items.slot0, k.items.slot1]).toEqual([sc.code('context_shield'), sc.code('turbo_token')]);
  });

  it('airborne lifts the kart past 3 m mid-flight (ground traps then miss)', () => {
    expect(airborneLift(33, 66)).toBeCloseTo(4, 6);
    expect(airborneLift(10, 66)).toBeLessThan(3);
    expect(airborneLift(20, 66)).toBeGreaterThan(3);
  });
});

describe('throttle stacks', () => {
  it('≤ 3 concurrent stacks (a 4th replaces the oldest); cap (0.60 − 0.08·(n − 1))·V_REF', () => {
    const sc = cruising();
    const m = sc.ctx.scratch.mods[0]!;
    const caps: number[] = [];
    for (let i = 0; i < 4; i++) { hit(sc, EF.throttle, 0, 1, false); sc.advance(1); caps.push(m.vCapMul * 34); }
    expect(caps[0]).toBeCloseTo(20.4, 6);
    expect(caps[1]).toBeCloseTo(17.68, 6);
    expect(caps[2]).toBeCloseTo(14.96, 6);
    expect(caps[3]).toBeCloseTo(14.96, 6);
    const active = sc.w.effects.filter((e) => e.victim === 0 && e.code === EF.throttle);
    expect(active).toHaveLength(3);
    expect(m.gaugeMul).toBe(0.5);
  });
});

describe('shield, halo and grace', () => {
  it('the shield absorbs one blockable hit, then grace 18; drones and tethers pass', () => {
    const sc = cruising();
    const st = sc.w.karts[0]!.status;
    st.shieldUntil = sc.w.tick + 180;
    hit(sc, EF.throttle, 0, 1, false); hit(sc, EF.airborne); sc.advance(1);
    const S = sc.w.tick;
    expect(results(sc, 0, EF.airborne)).toEqual(['shielded']);
    expect(results(sc, 0, EF.throttle)).toEqual(['hit']);          // unblockable
    expect([st.shieldUntil, st.shieldGraceUntil, st.cc]).toEqual([0, S + 18, 0]);
    sc.advance(8); hit(sc, EF.spin); sc.advance(1);                // S + 9: inside the grace
    expect(results(sc, 0, EF.spin)).toEqual(['immune_grace']);
    sc.until(() => sc.w.tick === S + 17); hit(sc, EF.spin); sc.advance(1); // S + 18: grace over
    expect(results(sc, 0, EF.spin)).toEqual(['immune_grace', 'hit']);
  });

  it('the halo absorbs like the shield (shield first when both are up)', () => {
    const sc = cruising();
    const st = sc.w.karts[0]!.status;
    st.shieldUntil = st.haloUntil = sc.w.tick + 100;
    hit(sc, EF.stun); sc.advance(1);
    expect([st.shieldUntil > 0, st.haloUntil > 0]).toEqual([false, true]);
    sc.advance(30); hit(sc, EF.stun); sc.advance(1);
    expect(results(sc, 0, EF.stun)).toEqual(['shielded', 'shielded']);
    expect(st.haloUntil).toBe(0);
  });

  it('track-hazard effects are never shielded', () => {
    const sc = cruising();
    sc.w.karts[0]!.status.shieldUntil = sc.w.tick + 100;
    scheduleEffect(sc.w, sc.ctx, EF.spin, 0, 255, sc.w.tick + 1, 0, 0, EFlag.BLOCKABLE | EFlag.HAZARD, 77);
    sc.advance(1);
    expect(results(sc, 0, EF.spin)).toEqual(['hit']);
    expect(sc.w.karts[0]!.status.shieldUntil).toBeGreaterThan(sc.w.tick); // not consumed
    const st = sc.w.karts[0]!.stats;
    expect([st.hitsTaken, st.attacksBlocked]).toEqual([0, 0]);               // item stats ignore track hazards
    expect(sc.decisions.filter((d) => d.k === 'result').at(-1)).toMatchObject({ victim: 0, result: 'hit' });
  });

  it('effect ids are deterministic and scheduling is idempotent by id', () => {
    const sc = cruising();
    const a = scheduleEffect(sc.w, sc.ctx, EF.stun, 0, 1, sc.w.tick + 5, 0, 0, 0, 42);
    const b = scheduleEffect(sc.w, sc.ctx, EF.stun, 0, 1, sc.w.tick + 5, 0, 0, 0, 42);
    expect(a).not.toBeNull();
    expect(b).toBeNull();
    const ids = sc.w.effects.map((e) => e.id);
    expect([...ids].sort((x, y) => x - y)).toEqual(ids);           // sorted by id
  });
});

describe('mash-out (§6.4)', () => {
  /** Trap `code` on kart 0 at S; alternating taps every `period` ticks from S + `lag`. Returns ticks in the trap. */
  function escape(code: number, period: number, lag = 0): number {
    const sc = cruising();
    const st = sc.w.karts[0]!.status;
    hit(sc, code, 0, 1, false);
    const S = sc.w.tick + 1;
    let dir = 1;
    for (let t = 0; t < 200; t++) {
      const next = sc.w.tick + 1;
      if (period > 0 && next >= S + lag && (next - S - lag) % period === 0) { sc.press(0, dir > 0 ? Edge.TAP_L : Edge.TAP_R); dir = -dir; }
      sc.advance(1);
      if (st.cc === 0) break;
    }
    expect(st.cc).toBe(0);
    // the CC ends in phase 8 of tick ccEnd − 1 (it is not active at ccEnd)
    const end = sc.events.find((e) => e.t === 'effectEnd' && e.victim === 0 && e.effect === code)!;
    return end.tick + 1 - S;
  }

  it('6 / 10 / 15 Hz alternating taps escape the bomb in 76 / 61 / 48 ticks (floor)', () => {
    expect(escape(EF.trap_bomb, 0)).toBe(132);
    expect(escape(EF.trap_bomb, 10)).toBe(76);
    expect(escape(EF.trap_bomb, 6)).toBe(61);
    expect(escape(EF.trap_bomb, 4)).toBe(48);
    expect(escape(EF.trap_bomb, 3)).toBe(48);
  });

  it('the bug trap reaches its 48-tick floor after 6 credits', () => {
    expect(escape(EF.trap_bug, 4)).toBe(48);
    expect(escape(EF.trap_bug, 0)).toBe(84);
  });

  it('late taps shift the escape by at most the lateness', () => {
    const base = escape(EF.trap_bomb, 6);
    for (const d of [1, 2, 3, 5, 8]) {
      const late = escape(EF.trap_bomb, 6, d);
      expect(late - base).toBeGreaterThanOrEqual(0);
      expect(late - base).toBeLessThanOrEqual(d);
    }
  });

  it('same-direction taps and taps closer than 3 ticks are not credited; escape boost 30 follows', () => {
    const sc = cruising();
    const st = sc.w.karts[0]!.status;
    hit(sc, EF.trap_bomb, 0, 1, false); sc.advance(1);
    for (let i = 0; i < 20; i++) { sc.press(0, Edge.TAP_L); sc.advance(4); }   // one direction only
    expect(st.mashCredits).toBe(1);
    sc.press(0, Edge.TAP_R); sc.advance(1); sc.press(0, Edge.TAP_L); sc.advance(1); // second right after the first
    expect(st.mashCredits).toBe(2);
    sc.until(() => st.cc === 0, 200);
    sc.advance(1);
    expect(sc.w.karts[0]!.drive.instTicks).toBe(30);
    expect(sc.events.some((e) => e.t === 'escape' && e.kart === 0)).toBe(true);
  });
});
