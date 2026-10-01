// Shared determinism scenario (Node tests and the browser selftest page run exactly this).
import type { ContentTables } from '@cr/content';
import type { BakedTrack } from '../track/BakedTrack.ts';
import { SIM_VERSION, type RaceConfig, type SlotConfig } from '../core/state.ts';
import { createWorld } from '../core/world.ts';
import { makeContext } from '../api.ts';
import { step } from '../step.ts';
import { makeInput } from '../core/input.ts';
import { ArraySink } from '../core/events.ts';
import { hashWorld } from '../core/hash.ts';
import { AI_TIERS } from '../ai/api.ts';
import { createAiDriver } from '../ai/driver.ts';

const CHARS = ['clay', 'pixel', 'turbo', 'anchor', 'rune', 'nova', 'kage', 'bisque'] as const;
const KARTS = ['pebble', 'clay_comet', 'arrowhead', 'tugboat', 'glacier_sled', 'neon_blade', 'jet_kettle', 'crown_cruiser'] as const;
const TIERS = ['rookie', 'racer', 'pro', 'legend'] as const;

/** 8 mixed-tier bots, `ticks` ticks; returns the world hash every `every` ticks (hex). */
export function determinismScenario(track: BakedTrack, content: ContentTables, mode: 'speed' | 'item', ticks = 2400, every = 120, seed = 77): string[] {
  const slots: SlotConfig[] = CHARS.map((c, i) => ({ kind: 'bot', team: 0, name: c, characterId: c, kartBodyId: KARTS[i]!, ai: TIERS[i % 4]!, vMul: AI_TIERS[TIERS[i % 4]!].vMul }));
  const cfg: RaceConfig = {
    simVersion: SIM_VERSION, mode, teams: 'solo', trackId: track.id, trackHash: track.hash, laps: track.laps, slots, seed,
    rules: { retireTicks: 600, friendlyFire: 'area', itemSet: 'standard', rubberBand: false, instantBoostInItem: true }, introTicks: 0, countdownTicks: 180,
  };
  const w = createWorld(cfg, track, content);
  const ctx = makeContext({ track, cfg, content, role: 'authority', events: new ArraySink() });
  const drivers = slots.map((s, i) => createAiDriver(track, content, i, AI_TIERS[s.ai!], {}, 99 + i));
  const inputs = slots.map(() => makeInput());
  const out: string[] = [];
  for (let t = 1; t <= ticks; t++) {
    for (let i = 0; i < 8; i++) drivers[i]!.decide(w, inputs[i]!);
    step(w, inputs, ctx);
    for (const inp of inputs) inp.edges = 0;
    if (t % every === 0) out.push(hashWorld(w).toString(16).padStart(8, '0'));
  }
  return out;
}
