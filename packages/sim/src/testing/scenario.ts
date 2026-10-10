// Shared determinism scenario (Node tests and the browser selftest page run exactly this).
import type { ContentTables } from '@cr/content';
import type { BakedTrack } from '../track/BakedTrack.ts';
import { SIM_VERSION, type RaceConfig, type SlotConfig, type WorldState } from '../core/state.ts';
import { createWorld } from '../core/world.ts';
import { makeContext } from '../api.ts';
import { step } from '../step.ts';
import { appendDriftRequest, Edge, Held, makeInput, type InputFrame } from '../core/input.ts';
import { ArraySink, type SimEvent } from '../core/events.ts';
import { hashWorld } from '../core/hash.ts';
import { AI_TIERS } from '../ai/api.ts';
import { createAiDriver } from '../ai/driver.ts';

const CHARS = ['clay', 'pixel', 'turbo', 'anchor', 'rune', 'nova', 'kage', 'bisque'] as const;
const KARTS = ['pebble', 'clay_comet', 'arrowhead', 'tugboat', 'glacier_sled', 'neon_blade', 'jet_kettle', 'crown_cruiser'] as const;
const TIERS = ['rookie', 'racer', 'pro', 'legend'] as const;

/** 8 mixed-tier bots and a short explicit drift-pulse sequence; hashes every `every` ticks (hex). */
export function determinismScenario(track: BakedTrack, content: ContentTables, mode: 'speed' | 'item', ticks = 2400, every = 120, seed = 77,
  observe?: (tick: number, w: Readonly<WorldState>, inputs: readonly InputFrame[], events: readonly SimEvent[]) => void): string[] {
  const slots: SlotConfig[] = CHARS.map((c, i) => ({ kind: 'bot', team: 0, name: c, characterId: c, kartBodyId: KARTS[i]!, ai: TIERS[i % 4]!, vMul: AI_TIERS[TIERS[i % 4]!].vMul }));
  const cfg: RaceConfig = {
    simVersion: SIM_VERSION, mode, teams: 'solo', trackId: track.id, trackHash: track.hash, laps: track.laps, slots, seed,
    rules: { retireTicks: 600, friendlyFire: 'area', itemSet: 'standard', rubberBand: false, instantBoostInItem: true }, introTicks: 0, countdownTicks: 180,
  };
  const w = createWorld(cfg, track, content);
  const sink = new ArraySink();
  const ctx = makeContext({ track, cfg, content, role: 'authority', events: sink });
  const drivers = slots.map((s, i) => createAiDriver(track, content, i, AI_TIERS[s.ai!], {}, 99 + i));
  const inputs = slots.map(() => makeInput());
  const out: string[] = [];
  for (let t = 1; t <= ticks; t++) {
    for (let i = 0; i < 8; i++) drivers[i]!.decide(w, inputs[i]!);
    // Inside the first 600 ticks so both the browser and Worker parity tests exercise it. The kart reaches this
    // straight through normal acceleration; only controls are overridden, never its pose, speed or drive state.
    if (t >= 300 && t <= 326) {
      const input = inputs[0]!;
      input.throttle = 15; input.brake = 0; input.steer = t <= 312 ? -127 : 127;
      input.held = t >= 306 && t <= 310 ? Held.DRIFT : 0;
      input.edges = t === 300 || t === 306 || t === 309 || t === 312 ? Edge.DRIFT : 0;
      input.steerIntent = t < 312 ? -1 : 1;
      input.driftRequests = input.edges & Edge.DRIFT ? appendDriftRequest(0, input.steerIntent) : 0;
      if (t === 309) { input.driftRequests = appendDriftRequest(input.driftRequests, -1); input.driftRequests = appendDriftRequest(input.driftRequests, 1); }
      // Fresh opposite intent arrives before the old smoothed sign changes, like simultaneous arrow + Shift.
      if (t === 312) input.edges |= Edge.TAP_R;
    }
    step(w, inputs, ctx);
    observe?.(t, w, inputs, sink.list);
    sink.list.length = 0;
    for (const inp of inputs) { inp.edges = 0; inp.driftRequests = 0; }
    if (t % every === 0) out.push(hashWorld(w).toString(16).padStart(8, '0'));
  }
  return out;
}
