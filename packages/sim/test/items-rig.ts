// Item-race rig (lane L2): bots = the AI driver + the item brain (ai/items), an authority context with real hooks
// (keyed HalfSipHash rolls, decisions appended to world.decisions like RaceRoom does), and per-race tallies.
import type { AiTier, ItemId } from '@cr/content';
import { AI_TIERS, createWorld, makeContext, step, makeInput, ArraySink, createAiDriver, rollItem, Held,
  type AuthorityHooks, type BakedTrack, type Decision, type InputFrame, type RaceConfig, type SimEvent, type SlotConfig, type StepContext, type WorldState } from '@cr/sim';
import { createItemBrain, decideItem, type ItemBrain } from '../src/ai/items/index.ts';
import { bakedTrack, getContent } from './rig.ts';

export const CHARS = ['clay', 'pixel', 'turbo', 'anchor', 'rune', 'nova', 'kage', 'bisque'] as const;
export const KARTS = ['pebble', 'clay_comet', 'arrowhead', 'tugboat', 'glacier_sled', 'neon_blade', 'jet_kettle', 'crown_cruiser'] as const;
export const MEADOW = 'clayhill_village/meadow_loop', RING = 'spark_circuit/proving_ring';

export interface ItemRaceOptions {
  track?: string; teams?: 'solo' | 'duo' | 'squad'; tiers?: readonly AiTier[]; seed?: number; laps?: number;
  itemSet?: 'standard' | 'light' | 'chaos'; friendlyFire?: 'off' | 'area' | 'all'; secret?: Uint32Array;
  humans?: readonly number[]; introTicks?: number;
  /** Only the first `count` slots race (the rest are empty). */
  count?: number;
  role?: 'authority' | 'predictor';
  /** Replaces the rig's keyed-roll hooks (still recorded into `decisions`). */
  rollOverride?: (slot: number, boxId: number, tick: number) => number;
}

export interface ItemRace {
  w: WorldState; ctx: StepContext; cfg: RaceConfig; track: BakedTrack; inputs: InputFrame[]; events: SimEvent[];
  decisions: Decision[]; brains: (ItemBrain | null)[];
  /** One tick. `drive` may edit the inputs after the bots decided (human slots, forced edges). */
  tick(drive?: (w: WorldState, inputs: InputFrame[]) => void): void;
  run(n: number, drive?: (w: WorldState, inputs: InputFrame[]) => void): void;
}

export function raceConfig(track: BakedTrack, o: ItemRaceOptions = {}): RaceConfig {
  const teams = o.teams ?? 'solo';
  const tiers = o.tiers ?? ['pro'];
  const slots: SlotConfig[] = CHARS.map((c, i): SlotConfig => {
    const tier = tiers[i % tiers.length]!;
    const team = teams === 'solo' ? 0 : teams === 'duo' ? i >> 1 : i & 1;
    const human = o.humans?.includes(i);
    if (o.count !== undefined && i >= o.count) return { kind: 'empty', team, name: '', characterId: c, kartBodyId: KARTS[i]!, vMul: 1 };
    return human
      ? { kind: 'human', team, name: c, characterId: c, kartBodyId: KARTS[i]!, vMul: 1 }
      : { kind: 'bot', team, name: c, characterId: c, kartBodyId: KARTS[i]!, ai: tier, vMul: AI_TIERS[tier].vMul };
  });
  return {
    simVersion: 1, mode: 'item', teams, trackId: track.id, trackHash: track.hash, laps: o.laps ?? track.laps, slots, seed: o.seed ?? 4242,
    rules: { retireTicks: 600, friendlyFire: o.friendlyFire ?? 'area', itemSet: o.itemSet ?? 'standard', rubberBand: false, instantBoostInItem: true },
    introTicks: o.introTicks ?? 0, countdownTicks: 180,
  };
}

export function makeItemRace(o: ItemRaceOptions = {}): ItemRace {
  const track = bakedTrack(o.track ?? MEADOW);
  const content = getContent();
  const cfg = raceConfig(track, o);
  const w = createWorld(cfg, track, content);
  const secret = o.secret ?? new Uint32Array([0x1234567, 0x89abcdef, cfg.seed, 0x5eed]);
  const decisions: Decision[] = [];
  const roll = o.rollOverride;
  const hooks: AuthorityHooks = {
    rollItem: (slot, boxId, tick, bucket) => (roll ? roll(slot, boxId, tick) : rollItem(content, cfg, secret, slot, boxId, tick, bucket)),
    emit: (d) => { w.decisions.items.push(d); decisions.push(d); },
  };
  const sink = new ArraySink();
  const ctx = makeContext({ track, cfg, content, role: o.role ?? 'authority', authority: hooks, events: sink });
  const inputs = cfg.slots.map(() => makeInput());
  const drivers = cfg.slots.map((s, i) => (s.kind === 'bot' ? createAiDriver(track, content, i, AI_TIERS[s.ai!], {}, 99 + i + cfg.seed) : null));
  const brains = cfg.slots.map((s, i) => {
    if (s.kind !== 'bot') return null;
    const cm = content.characters.byId.get(s.characterId);
    return createItemBrain(i, AI_TIERS[s.ai!], { itemHoarding: cm?.personality.itemHoarding, aggression: cm?.personality.aggression }, 7 + i + cfg.seed);
  });
  const events: SimEvent[] = [];
  const race: ItemRace = {
    w, ctx, cfg, track, inputs, events, decisions, brains,
    tick(drive) {
      for (let i = 0; i < inputs.length; i++) {
        const d = drivers[i], b = brains[i];
        if (d) d.decide(w, inputs[i]!);
        if (b) decideItem(b, w, ctx, inputs[i]!);
      }
      drive?.(w, inputs);
      step(w, inputs, ctx);
      sink.drain(events);
      for (const inp of inputs) inp.edges = 0;
    },
    run(n, drive) { for (let i = 0; i < n; i++) race.tick(drive); },
  };
  return race;
}

export const DRAG = '_test/drag_oval';

/** Scripted human-only scenario (default: the drag oval's 1 km straight, no boxes): every kart at full throttle, steer 0. */
export interface Scenario extends ItemRace {
  aim: number[]; lookBack: boolean[]; startAt: number[]; brakeAt: number[]; steer: number[];
  /** Latches edges for `slot` on the next tick. */
  press(slot: number, edges: number): void;
  /** Advances n ticks with the script. */
  advance(n: number): void;
  /** Advances until `pred` holds (max `limit` ticks); returns the tick. */
  until(pred: () => boolean, limit?: number): number;
  give(slot: number, id: ItemId, second?: ItemId): void;
  code(id: ItemId): number;
}

export function scenario(o: ItemRaceOptions & { count: number; starts?: readonly number[] }): Scenario {
  const race = makeItemRace({ track: DRAG, ...o, humans: [0, 1, 2, 3, 4, 5, 6, 7] });
  const n = 8, go = race.w.goTick;
  const pending = new Array<number>(n).fill(0);
  const sc: Scenario = Object.assign(race, {
    aim: new Array<number>(n).fill(255), lookBack: new Array<boolean>(n).fill(false),
    startAt: Array.from({ length: n }, (_, i) => go + (o.starts?.[i] ?? 0)), brakeAt: new Array<number>(n).fill(1e9), steer: new Array<number>(n).fill(0),
    press(slot: number, edges: number) { pending[slot]! |= edges; },
    advance(k: number) {
      for (let t = 0; t < k; t++) race.tick((w, inp) => {
        for (let i = 0; i < n; i++) {
          const f = inp[i]!, next = w.tick + 1;
          const b = w.karts[i]!.body, fwd = b.vx * b.fx + b.vy * b.fy + b.vz * b.fz;
          f.throttle = next >= sc.startAt[i]! && next < sc.brakeAt[i]! ? 15 : 0;
          f.brake = next >= sc.brakeAt[i]! && fwd > 0.3 ? 15 : 0; // brake to a stop, then hold (a held brake at rest reverses)
          f.steer = sc.steer[i]!; f.aim = sc.aim[i]!; f.held = sc.lookBack[i] ? Held.LOOK_BACK : 0;
          f.edges = pending[i]!; pending[i] = 0;
        }
      });
    },
    until(pred: () => boolean, limit = 3000) { for (let t = 0; t < limit && !pred(); t++) sc.advance(1); return race.w.tick; },
    give(slot: number, id: ItemId, second?: ItemId) {
      const it = race.w.karts[slot]!.items;
      it.slot0 = race.ctx.content.items.get(id).code; it.slot1 = second ? race.ctx.content.items.get(second).code : 0;
    },
    code(id: ItemId) { return race.ctx.content.items.get(id).code; },
  });
  return sc;
}

export interface RaceTally {
  finishers: number; maxStuck: number; uses: Map<string, number>; hits: Map<string, number>; results: Map<string, number>;
  nanProjectiles: number; offTrackProjectiles: number; ticks: number;
}

/** Runs to the end and tallies item uses (by item id), effect hits (by effect id), results, stuck time and projectiles. */
export function runItemRace(o: ItemRaceOptions = {}, maxTicks = 60 * 60 * 6, afterTick?: (w: WorldState) => void): RaceTally & { race: ItemRace } {
  const race = makeItemRace(o);
  const { w, ctx } = race;
  const content = ctx.content;
  const lastDist = new Float64Array(8).fill(-1e9), lastMove = new Int32Array(8);
  let maxStuck = 0, nan = 0, off = 0;
  const uses = new Map<string, number>(), hits = new Map<string, number>(), results = new Map<string, number>();
  let ev = 0;
  while (w.phase !== 4 && w.tick < maxTicks) {
    race.tick();
    afterTick?.(w);
    for (; ev < race.events.length; ev++) {
      const e = race.events[ev]!;
      if (e.t === 'itemUse' || e.t === 'itemFizzle') { const id = content.items.byCode[e.item]?.id ?? '?'; uses.set(id, (uses.get(id) ?? 0) + 1); }
      if (e.t === 'effect') {
        results.set(e.result, (results.get(e.result) ?? 0) + 1);
        if (e.result === 'hit') { const id = content.effects.byCode[e.effect]?.id ?? '?'; hits.set(id, (hits.get(id) ?? 0) + 1); }
      }
    }
    for (const p of w.projectiles) {
      if (!Number.isFinite(p.px + p.py + p.pz + p.s + p.u + p.h)) nan++;
      const b = w.karts[p.target]!.body;
      if (p.phase === 0 && Math.abs(p.u) > 25) off++;
      void b;
    }
    if (w.phase < 2) continue;
    for (const k of w.karts) {
      if (k.race.finishTick >= 0) { lastMove[k.slot] = w.tick; continue; }
      if (k.race.raceDist > lastDist[k.slot]! + 2) { lastDist[k.slot] = k.race.raceDist; lastMove[k.slot] = w.tick; }
      maxStuck = Math.max(maxStuck, w.tick - lastMove[k.slot]!);
    }
  }
  const finishers = w.karts.filter((k) => k.race.finishTick >= 0).length;
  return { race, finishers, maxStuck, uses, hits, results, nanProjectiles: nan, offTrackProjectiles: off, ticks: w.tick };
}
