// Authority roll (HalfSipHash-2-4, secret key), rank buckets with distance overrides, validity rerolls, personal boxes
// and roulette timing (12-items-spec §5, §8).
import { describe, expect, it } from 'vitest';
import { Edge, Phase, type Decision } from '@cr/sim';
import { halfSipHash24Bytes } from '../src/items/siphash.ts';
import { rollHash, rollItem, REROLL_SHIFT } from '../src/items/roll.ts';
import { boxRespawnDelay, bucketFor, rollValid, ROULETTE_TICKS } from '../src/items/boxes.ts';
import { IT } from '../src/items/codes.ts';
import { makeItemRace, raceConfig, runItemRace, scenario, RING } from './items-rig.ts';
import { bakedTrack, getContent } from './rig.ts';

type Grant = Extract<Decision, { k: 'grant' }>;
const grants = (ds: readonly Decision[]): Grant[] => ds.filter((d): d is Grant => d.k === 'grant');

describe('HalfSipHash-2-4', () => {
  it('matches the reference 32-bit test vectors (key 00..07, input 00..n-1)', () => {
    const data = Array.from({ length: 16 }, (_, i) => i);
    const out = [0, 1, 2, 3].map((n) => halfSipHash24Bytes(0x03020100, 0x07060504, data, n));
    expect(out).toEqual([0x5b9f35a9, 0xb85a4727, 0x03a662fa, 0x04e7fe8a]);
  });

  it('the roll message depends on every word and on the secret', () => {
    const cfg = raceConfig(bakedTrack(RING));
    const s = new Uint32Array([1, 2, 3, 4]);
    const base = rollHash(cfg, s, 3, 7, 1000, 0);
    expect(rollHash(cfg, s, 3, 7, 1000, 0)).toBe(base);
    for (const h of [rollHash(cfg, s, 4, 7, 1000, 0), rollHash(cfg, s, 3, 8, 1000, 0), rollHash(cfg, s, 3, 7, 1001, 0), rollHash(cfg, s, 3, 7, 1000, 1), rollHash(cfg, new Uint32Array([1, 2, 3, 5]), 3, 7, 1000, 0)]) expect(h).not.toBe(base);
  });

  it('rolls follow the bucket weights (≈ ±3% over 20k rolls)', () => {
    const c = getContent();
    const cfg = raceConfig(bakedTrack(RING));
    const s = new Uint32Array([9, 8, 7, 6]);
    const n = new Map<number, number>();
    for (let i = 0; i < 20000; i++) { const code = rollItem(c, cfg, s, i & 7, i >> 3, 5000 + i, 'top'); n.set(code, (n.get(code) ?? 0) + 1); }
    for (const [id, wt] of c.drop.solo.buckets.top) expect((n.get(c.items.get(id).code) ?? 0) / 200).toBeCloseTo(wt, -0.5);
  });
});

describe('rank buckets (§8.2)', () => {
  const race = makeItemRace({ track: RING });
  const { w, ctx } = race;
  const L = race.track.lapLength;
  function set(ranksAndDist: [number, number][]): void {
    ranksAndDist.forEach(([rank, d], i) => { const k = w.karts[i]!; k.race.rank = rank; k.race.raceDist = d; });
  }
  it('N = 8 gives 1 / 2–3 / 4–6 / 7–8', () => {
    set([[1, 1000], [2, 995], [3, 990], [4, 985], [5, 980], [6, 975], [7, 970], [8, 965]]);
    expect(w.karts.map((k) => bucketFor(w, ctx, k))).toEqual(['top', 'high', 'high', 'mid', 'mid', 'mid', 'low', 'low']);
  });
  it('> 350 m behind the leader shifts one bucket toward low (at most to mid); > 600 m → low', () => {
    set([[1, 1000], [2, 600], [3, 390], [4, 620], [5, 610], [6, 605], [7, 900], [8, 380]]);
    expect(w.karts.map((k) => bucketFor(w, ctx, k))).toEqual(['top', 'mid', 'low', 'mid', 'mid', 'mid', 'low', 'low']);
  });
  it('more than a lap behind the racer directly ahead → turbo only (no roll)', () => {
    set([[1, 3000], [2, 2990], [3, 2980], [4, 2970], [5, 2960], [6, 2950], [7, 2940], [8, 2940 - L - 1]]);
    expect(bucketFor(w, ctx, w.karts[7]!)).toBe('turbo');
    expect(bucketFor(w, ctx, w.karts[6]!)).toBe('low');
  });
  it('N = 4: p = (rank − 1)/3 → top / mid / mid / low', () => {
    const r4 = makeItemRace({ track: RING, count: 4 });
    r4.w.karts.slice(0, 4).forEach((k, i) => { k.race.rank = i + 1; k.race.raceDist = 100 - i; });
    expect(r4.w.karts.slice(0, 4).map((k) => bucketFor(r4.w, r4.ctx, k))).toEqual(['top', 'mid', 'mid', 'low']);
  });
});

describe('validity rerolls (§8.4)', () => {
  it('leader-targeted items are invalid for the leader, team-only items in solo', () => {
    const race = makeItemRace({ track: RING });
    const { w, ctx } = race;
    w.karts.forEach((k, i) => { k.race.rank = i + 1; });
    expect(rollValid(w, ctx, w.karts[0]!, IT.top1_missile)).toBe(false);
    expect(rollValid(w, ctx, w.karts[0]!, IT.throttle_drone)).toBe(false);
    expect(rollValid(w, ctx, w.karts[0]!, IT.firewall)).toBe(false);
    expect(rollValid(w, ctx, w.karts[1]!, IT.top1_missile)).toBe(true);
    expect(rollValid(w, ctx, w.karts[1]!, IT.alignment_halo)).toBe(false);
    const team = makeItemRace({ track: RING, teams: 'squad' });
    team.w.karts.forEach((k, i) => { k.race.rank = i + 1; });
    expect(rollValid(team.w, team.ctx, team.w.karts[2]!, IT.top1_missile)).toBe(false); // leader (slot 0) is a teammate
    expect(rollValid(team.w, team.ctx, team.w.karts[1]!, IT.top1_missile)).toBe(true);
    expect(rollValid(team.w, team.ctx, team.w.karts[1]!, IT.alignment_halo)).toBe(true);
  });

  it('up to 3 rerolls (reroll index in the box-id high bits), then Turbo Token', () => {
    const calls: { slot: number; boxId: number; tick: number }[] = [];
    // a rigged roll that always answers Top-1 Missile: invalid for the leader, valid for everyone else
    const race = makeItemRace({ track: RING, rollOverride: (slot, boxId, tick) => { calls.push({ slot, boxId, tick }); return IT.top1_missile; } });
    const { w } = race;
    const rankAt = new Map<string, number>();
    while (grants(race.decisions).length < 16 && w.tick < 4000) {
      const before = w.karts.map((k) => k.race.rank);
      const n = race.decisions.length;
      race.tick();
      for (const d of grants(race.decisions.slice(n))) rankAt.set(`${d.tick}/${d.slot}`, before[d.slot]!);
    }
    expect(grants(race.decisions).length).toBeGreaterThanOrEqual(16);
    let leaderGrants = 0;
    for (const g of grants(race.decisions)) {
      const leader = rankAt.get(`${g.tick}/${g.slot}`) === 1;
      if (leader) leaderGrants++;
      expect(g.item, `slot ${g.slot} tick ${g.tick}`).toBe(leader ? IT.turbo_token : IT.top1_missile);
      const mine = calls.filter((c) => c.slot === g.slot && c.tick === g.tick).map((c) => c.boxId >>> REROLL_SHIFT);
      expect(mine).toEqual(leader ? [0, 1, 2, 3] : [0]);
      expect(calls.find((c) => c.slot === g.slot && c.tick === g.tick)!.boxId & 0xffff).toBe(g.boxId);
    }
    expect(leaderGrants).toBeGreaterThan(0);
  });
});

describe('roll determinism', () => {
  const run = (secret: Uint32Array) => grants(runItemRace({ track: RING, secret, seed: 11, laps: 2 }).race.decisions).map((d) => `${d.tick}/${d.slot}/${d.item}`);
  it('same secret + inputs → same grants; a different secret → different grants', () => {
    const a = run(new Uint32Array([1, 2, 3, 4]));
    expect(a.length).toBeGreaterThan(20);
    expect(run(new Uint32Array([1, 2, 3, 4]))).toEqual(a);
    expect(run(new Uint32Array([5, 6, 7, 8]))).not.toEqual(a);
  });

  it('a predictor never calls rollItem or emits (the roll is authority-only; without a grant the slot stays unknown)', () => {
    const race = makeItemRace({ track: RING, role: 'predictor', rollOverride: () => { throw new Error('predictor rolled'); } });
    expect(() => race.run(1500)).not.toThrow();
    expect(race.w.phase).toBeGreaterThanOrEqual(Phase.RACING);
    expect(race.decisions).toEqual([]);
    const boxes = race.events.filter((e) => e.t === 'box').length;
    expect(boxes).toBeGreaterThan(4);                              // it did open boxes…
    for (const k of race.w.karts) expect([k.items.slot0, k.items.slot1]).toEqual([0, 0]); // …but never invented an item
  });
});

describe('personal boxes and the roulette (§5)', () => {
  it('each box breaks per racer and respawns 150–180 ticks later, derived from the box id', () => {
    const r = runItemRace({ track: RING, seed: 3, laps: 1 });
    const boxes = r.race.events.filter((e) => e.t === 'box');
    expect(boxes.length).toBeGreaterThan(8);
    for (let id = 0; id < 30; id++) { const d = boxRespawnDelay(id); expect(d).toBeGreaterThanOrEqual(150); expect(d).toBeLessThanOrEqual(180); }
    // no racer opens the same box twice within its respawn delay
    const last = new Map<string, number>();
    for (const e of boxes) {
      if (e.t !== 'box') continue;
      const key = `${e.kart}/${e.boxId}`, prev = last.get(key);
      if (prev !== undefined) expect(e.tick - prev).toBeGreaterThanOrEqual(boxRespawnDelay(e.boxId));
      last.set(key, e.tick);
    }
  });

  it('pickup → roulette 30 ticks: the item is usable from P + 30, not before; full slots break the box for nothing', () => {
    const sc = scenario({ count: 1, track: RING });
    const k = sc.w.karts[0]!;
    sc.until(() => grants(sc.decisions).length > 0, 600);
    const g = grants(sc.decisions)[0]!;
    const P = g.tick;
    expect([k.items.rouletteSlot, k.items.rouletteEnd, k.items.rouletteBox]).toEqual([0, P + ROULETTE_TICKS, g.boxId]);
    expect(k.items.slot0).toBe(g.item);
    expect(sc.w.boxRespawn[g.boxId * 8]).toBe(P + boxRespawnDelay(g.boxId));
    sc.until(() => sc.w.tick === P + ROULETTE_TICKS - 2);
    sc.press(0, Edge.USE_ITEM); sc.advance(1);                    // P + 29: still spinning
    expect(sc.decisions.filter((d) => d.k === 'use')).toHaveLength(0);
    expect(k.items.slot0).toBe(g.item);
    sc.advance(1);                                                 // P + 30 lands
    expect(k.items.rouletteSlot).toBe(-1);
    expect(sc.events.some((e) => e.t === 'itemGranted' && e.tick === P + 30)).toBe(true);
    // fill both slots and drive into the next row: the box breaks, no grant
    sc.give(0, 'context_shield', 'context_shield');
    const n = grants(sc.decisions).length, nb = sc.events.filter((e) => e.t === 'box').length;
    sc.until(() => sc.events.filter((e) => e.t === 'box').length > nb, 900);
    expect(grants(sc.decisions)).toHaveLength(n);
  });
});
