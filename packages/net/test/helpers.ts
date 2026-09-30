// Shared test fixtures: a compiled test track, race configs and a seeded PRNG.
import { readFileSync } from 'node:fs';
import { loadContent, type ContentTables } from '@cr/content';
import { AI_TIERS, loadCtrk, toArrayBuffer, type BakedTrack, type RaceConfig, type SlotConfig } from '@cr/sim';
import { buildTrack } from '@cr/trackc/build.ts';

let cached: BakedTrack | null = null;
export function testTrack(): BakedTrack {
  if (cached) return cached;
  const file = new URL('../../../tracks/spark_circuit/proving_ring.ctd', import.meta.url).pathname;
  cached = loadCtrk(toArrayBuffer(buildTrack(readFileSync(file, 'utf8'), file).ctrk));
  return cached;
}

let content: ContentTables | null = null;
export const testContent = (): ContentTables => (content ??= loadContent());

const CHARS = ['clay', 'pixel', 'turbo', 'anchor', 'rune', 'nova', 'kage', 'bisque'] as const;
const KARTS = ['pebble', 'clay_comet', 'arrowhead', 'tugboat', 'glacier_sled', 'neon_blade', 'jet_kettle', 'crown_cruiser'] as const;

/** `humans` human slots first, then bots; `empty` trailing empty slots. */
export function raceConfig(o: { humans?: number; empty?: number; mode?: 'speed' | 'item'; laps?: number; seed?: number; introTicks?: number } = {}): RaceConfig {
  const track = testTrack();
  const humans = o.humans ?? 0, empty = o.empty ?? 0;
  const slots: SlotConfig[] = CHARS.map((c, i): SlotConfig => {
    if (i >= 8 - empty) return { kind: 'empty', team: 0, name: '', characterId: c, kartBodyId: 'pebble', vMul: 1 };
    if (i < humans) return { kind: 'human', team: 0, name: `h${i}`, characterId: c, kartBodyId: KARTS[i]!, vMul: 1 };
    return { kind: 'bot', team: 0, name: `b${i}`, characterId: c, kartBodyId: KARTS[i]!, ai: 'pro', vMul: AI_TIERS.pro.vMul };
  });
  return {
    simVersion: 1, mode: o.mode ?? 'speed', teams: 'solo', trackId: track.id, trackHash: track.hash, laps: o.laps ?? 1, slots, seed: o.seed ?? 7,
    rules: { retireTicks: 600, friendlyFire: 'area', itemSet: 'standard', rubberBand: false, instantBoostInItem: true },
    introTicks: o.introTicks ?? 30, countdownTicks: 180,
  };
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
