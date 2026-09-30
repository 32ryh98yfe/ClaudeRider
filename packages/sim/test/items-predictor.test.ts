// Authority vs predictor (B3, 20-netcode-spec §8): a predictor world fed only the authority's decisions (never the
// secret) with identical inputs stays hash-identical to the authority every tick of a full item race; late decisions
// are repaired through applyDecision's rollback tick.
import { describe, expect, it } from 'vitest';
import { applyDecision, cloneWorld, copyWorld, createWorld, hashWorld, makeContext, makeInput, step, ArraySink, copyInput,
  type Decision, type InputFrame, type WorldState } from '@cr/sim';
import { makeItemRace, MEADOW, RING, type ItemRaceOptions } from './items-rig.ts';

function predictorFor(o: ItemRaceOptions) {
  const auth = makeItemRace(o);
  const w = createWorld(auth.cfg, auth.track, auth.ctx.content);
  const ctx = makeContext({ track: auth.track, cfg: auth.cfg, content: auth.ctx.content, role: 'predictor', events: new ArraySink() });
  return { auth, w, ctx };
}

describe('authority vs predictor', () => {
  for (const o of [{ track: MEADOW, teams: 'solo', seed: 21, tiers: ['pro', 'racer', 'legend', 'rookie'], laps: 3 }, { track: RING, teams: 'squad', seed: 22, tiers: ['racer'], laps: 3 }] as const) {
    it(`zero-latency loopback: identical hashWorld every tick for a full ${o.teams} item race (${o.track.split('/')[1]})`, () => {
      const { auth, w, ctx } = predictorFor({ ...o, tiers: [...o.tiers] });
      let fed = 0, mismatch = -1, rollbacks = 0;
      const frames: InputFrame[] = auth.inputs.map(() => makeInput());
      while (auth.w.phase !== 4 && auth.w.tick < 60 * 60 * 5) {
        auth.tick((_w, inp) => { for (let i = 0; i < 8; i++) copyInput(frames[i]!, inp[i]!); });
        for (; fed < auth.decisions.length; fed++) if (applyDecision(w, auth.decisions[fed]!) !== null) rollbacks++;
        step(w, frames, ctx);
        if (mismatch < 0 && hashWorld(w) !== hashWorld(auth.w)) mismatch = w.tick;
      }
      expect(auth.w.phase).toBe(4);
      expect(mismatch).toBe(-1);
      expect(rollbacks).toBe(0);                        // every decision arrived before its tick was simulated
      const kinds = new Set(auth.decisions.map((d) => d.k));
      for (const k of ['grant', 'use', 'commit', 'effect', 'result', 'hazard', 'hazardRemove'] as const) expect(kinds.has(k), k).toBe(true);
    });
  }

  it('late decisions: applyDecision patches spinning roulettes in place and returns rollback ticks otherwise; after reconciling the predictor converges', () => {
    const { auth, w, ctx } = predictorFor({ track: RING, seed: 23, laps: 2, tiers: ['pro', 'racer'] });
    const DELAY = 6, RING_N = 64;
    const snaps: WorldState[] = Array.from({ length: RING_N }, () => cloneWorld(auth.w));
    const hist: InputFrame[][] = Array.from({ length: RING_N }, () => auth.inputs.map(() => makeInput()));
    const queue: Decision[] = [];
    let fed = 0, patched = 0, rolled = 0, mismatched = 0, checked = 0;
    const log = w.decisions;
    while (auth.w.phase !== 4 && auth.w.tick < 60 * 60 * 4) {
      const t = auth.w.tick + 1;
      auth.tick((_w, inp) => { for (let i = 0; i < 8; i++) copyInput(hist[t % RING_N]![i]!, inp[i]!); });
      copyWorld(snaps[t % RING_N]!, auth.w);
      for (; fed < auth.decisions.length; fed++) queue.push(auth.decisions[fed]!);
      // deliver decisions DELAY ticks late (the predictor already simulated their tick)
      let from = Infinity;
      while (queue.length && queue[0]!.tick <= t - DELAY) {
        const d = queue.shift()!;
        const r = applyDecision(w, d);
        if (r === null) { if (d.k === 'grant') patched++; } else if (r < from) from = r;
      }
      if (from !== Infinity) {
        rolled++;
        // restore the authoritative snapshot just before `from`, keep the client's own decision log, re-simulate
        copyWorld(w, snaps[(from - 1) % RING_N]!);
        w.decisions = log;
        for (let s = from; s < t; s++) step(w, hist[s % RING_N]!, ctx);
      }
      step(w, hist[t % RING_N]!, ctx);
      // once every decision up to t is delivered the worlds must agree (outstanding grants only hide slot contents)
      if (!auth.decisions.some((d) => d.tick > t - DELAY && d.tick <= t)) { checked++; if (hashWorld(w) !== hashWorld(auth.w)) mismatched++; }
    }
    expect(auth.w.phase).toBe(4);
    expect(patched).toBeGreaterThan(5);
    expect(rolled).toBeGreaterThan(5);
    expect(checked).toBeGreaterThan(1000);
    expect(mismatched).toBe(0);
  });

  it('a future decision is only scheduled (no rollback)', () => {
    const race = makeItemRace({ track: RING });
    const d: Decision = { k: 'effect', tick: race.w.tick + 5, eff: 1, code: 5, victim: 0, source: 1, start: race.w.tick + 26, dur: 54, flags: 2 };
    expect(applyDecision(race.w, d)).toBeNull();
    expect(applyDecision(race.w, { ...d, tick: race.w.tick })).toBe(race.w.tick);
    expect(race.w.decisions.items).toHaveLength(2);
  });
});
