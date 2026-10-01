// Full 8-bot races on the shipped tracks: finishers, wall discipline, stuck detection, pace window.
import { describe, expect, it } from 'vitest';
import { AI_TIERS, Phase, raceTicksOf, type WorldState } from '@cr/sim';
import { existsSync } from 'node:fs';
import { loadContent } from '@cr/content';
import { bakedTrack, makeRig } from './rig.ts';

const CHARS = ['clay', 'pixel', 'turbo', 'anchor', 'rune', 'nova', 'kage', 'bisque'] as const;
const KARTS = ['pebble', 'clay_comet', 'arrowhead', 'tugboat', 'glacier_sled', 'neon_blade', 'jet_kettle', 'crown_cruiser'] as const;

function race(rel: string, mode: 'speed' | 'item', tier: 'pro' | 'racer' = 'pro') {
  const slots = CHARS.map((c, i) => ({ kind: 'bot' as const, characterId: c, kartBodyId: KARTS[i]!, name: c, ai: tier, vMul: AI_TIERS[tier].vMul }));
  const rig = makeRig(bakedTrack(rel), { mode, slots, seed: 4242 });
  const lastDist = new Float64Array(8).fill(-1e9), lastMove = new Int32Array(8);
  let maxStuck = 0;
  const w: WorldState = rig.w;
  while (w.phase !== Phase.DONE && w.tick < 60 * 60 * 6) {
    rig.tick();
    if (w.phase < Phase.RACING) continue;
    for (const k of w.karts) {
      if (k.race.finishTick >= 0) { lastMove[k.slot] = w.tick; continue; }
      if (k.race.raceDist > lastDist[k.slot]! + 2) { lastDist[k.slot] = k.race.raceDist; lastMove[k.slot] = w.tick; }
      maxStuck = Math.max(maxStuck, w.tick - lastMove[k.slot]!);
    }
  }
  const finishers = w.karts.filter((k) => k.race.finishTick >= 0);
  const hard = w.karts.reduce((a, k) => a + k.stats.hardHits, 0);
  const winner = Math.min(...finishers.map((k) => raceTicksOf(w, k))) / 60;
  return { w, finishers: finishers.length, hardPerBotLap: hard / (8 * rig.cfg.laps), winner, maxStuck, respawns: w.karts.reduce((a, k) => a + k.stats.respawns, 0) };
}

describe('races', () => {
  it('meadow_loop speed: ≥ 7/8 finish, ≤ 0.3 hard hits per bot-lap, nobody stuck > 5 s, winner in 100–130 s', () => {
    const r = race('clayhill_village/meadow_loop', 'speed');
    expect(r.w.phase).toBe(Phase.DONE);
    expect(r.finishers).toBeGreaterThanOrEqual(7);
    expect(r.hardPerBotLap).toBeLessThanOrEqual(0.3);
    expect(r.maxStuck).toBeLessThanOrEqual(300);
    expect(r.winner).toBeGreaterThan(100);
    expect(r.winner).toBeLessThan(130);
  });

  it('meadow_loop item: ≥ 6/8 finish and nobody stuck > 5 s', () => {
    const r = race('clayhill_village/meadow_loop', 'item', 'racer');
    expect(r.finishers).toBeGreaterThanOrEqual(6);
    expect(r.maxStuck).toBeLessThanOrEqual(300);
  });

  it('proving_ring speed: all finish cleanly', () => {
    const r = race('spark_circuit/proving_ring', 'speed');
    expect(r.finishers).toBe(8);
    expect(r.respawns).toBe(0);
    expect(r.hardPerBotLap).toBeLessThanOrEqual(0.3);
  });
});

// Content lock (M3): every shipped speed track, 8 Pro bots. Race-time window from the lap formula
// (laps = clamp(round(115 / refLapSec), 1, 5)): ≈ 115 s at reference pace, so 85–150 s for Pro bots with traffic.
const ROOT = new URL('../../../', import.meta.url);
const SPEED_TRACKS = loadContent().tracks.all
  .filter((t) => t.modes.includes('speed') && t.id !== 'proving_ring' && existsSync(new URL(`tracks/${t.themeId}/${t.id}.ctd`, ROOT)))
  .map((t) => `${t.themeId}/${t.id}`);

describe('speed races on every track', () => {
  it('finds the roster', () => { expect(SPEED_TRACKS.length).toBeGreaterThanOrEqual(20); });
  for (const rel of SPEED_TRACKS) {
    it(`${rel.split('/')[1]}: ≥ 7/8 finish, ≤ 0.3 hard hits per bot-lap, nobody stuck > 5 s, winner in 85–150 s`, () => {
      const r = race(rel, 'speed');
      expect(r.w.phase).toBe(Phase.DONE);
      expect(r.finishers).toBeGreaterThanOrEqual(7);
      expect(r.hardPerBotLap).toBeLessThanOrEqual(0.3);
      expect(r.maxStuck).toBeLessThanOrEqual(300);
      expect(r.winner).toBeGreaterThan(85);
      expect(r.winner).toBeLessThan(150);
    });
  }
});
