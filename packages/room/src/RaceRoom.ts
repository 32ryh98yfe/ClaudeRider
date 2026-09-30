// Authoritative race room (ADR-007). Runs identically in the Node server and in the browser (offline).
// M1: local/offline authority API (setInput + tick). Lane L9 adds peers/transports, relay, snapshots, resume.
import type { ContentTables } from '@cr/content';
import {
  createWorld, cloneWorld, copyWorld, makeContext, step, createAiDriver, AI_TIERS, makeInput, copyInput, ArraySink, Phase, Edge,
  type BakedTrack, type InputFrame, type RaceConfig, type SimEvent, type StepContext, type WorldState, type AiDriver,
} from '@cr/sim';

export interface RoomClock { nowMs(): number }

export interface RaceRoomOptions {
  config: RaceConfig;
  track: BakedTrack;
  content: ContentTables;
  secret?: Uint32Array;
  clock?: RoomClock;
  timing?: { leadTicks: number; snapshotEvery: number; botLookahead: number };
}

export interface RaceResultRow { slot: number; rank: number; name: string; team: number; finished: boolean; raceTicks: number; bestLapTicks: number; kind: 'human' | 'bot' | 'empty'; points: number }
export interface RaceResult { trackId: string; mode: string; rows: RaceResultRow[]; winnerTeam: number; endTick: number }

export class RaceRoom {
  readonly config: RaceConfig;
  readonly track: BakedTrack;
  readonly world: WorldState;
  readonly prev: WorldState;
  private ctx: StepContext;
  private sink = new ArraySink();
  private inputs: InputFrame[];
  private pending: InputFrame[];
  private bots: (AiDriver | null)[];
  private endCbs: ((r: RaceResult) => void)[] = [];
  private ended = false;

  constructor(o: RaceRoomOptions) {
    this.config = o.config;
    this.track = o.track;
    this.world = createWorld(o.config, o.track, o.content);
    this.prev = cloneWorld(this.world);
    this.ctx = makeContext({ track: o.track, cfg: o.config, content: o.content, role: 'authority', events: this.sink });
    this.inputs = o.config.slots.map(() => makeInput());
    this.pending = o.config.slots.map(() => makeInput());
    this.bots = o.config.slots.map((s, i) => {
      if (s.kind !== 'bot') return null;
      const tier = AI_TIERS[s.ai ?? 'racer'];
      const cm = o.content.characters.byId.get(s.characterId);
      const pers = cm ? { aggression: cm.personality.aggression } : {};
      return createAiDriver(o.track, o.content, i, tier, pers, (o.config.seed ^ (i * 7919)) >>> 0);
    });
  }

  get tickNo(): number { return this.world.tick; }
  get phase(): number { return this.world.phase; }

  /** Latest local input for a human slot. Edges are OR-latched until consumed by the next tick. */
  setInput(slot: number, f: Readonly<InputFrame>): void {
    const p = this.pending[slot];
    if (!p) return;
    const edges = p.edges | f.edges;
    copyInput(p, f);
    p.edges = edges;
  }

  onEnd(cb: (r: RaceResult) => void): void { this.endCbs.push(cb); }

  /** Exactly one simulation tick. */
  tick(): void {
    copyWorld(this.prev, this.world);
    const w = this.world;
    for (let i = 0; i < this.inputs.length; i++) {
      const bot = this.bots[i];
      if (bot) bot.decide(w, this.inputs[i]!);
      else { copyInput(this.inputs[i]!, this.pending[i]!); this.pending[i]!.edges = 0; }
    }
    step(w, this.inputs, this.ctx);
    if (w.phase === Phase.DONE && !this.ended) {
      this.ended = true;
      const r = this.result();
      for (const cb of this.endCbs) cb(r);
    }
  }

  drainEvents(out: SimEvent[]): void { this.sink.drain(out); }

  debugWorld(): Readonly<WorldState> { return this.world; }

  result(): RaceResult {
    const w = this.world, cfg = this.config;
    const pts = [10, 8, 6, 5, 4, 3, 2, 1];
    const rows: RaceResultRow[] = w.karts.filter((k) => k.active).map((k) => ({
      slot: k.slot, rank: k.race.rank, name: cfg.slots[k.slot]!.name, team: k.team, finished: k.race.finishTick >= 0,
      raceTicks: k.race.finishTick >= 0 ? k.race.finishTick - 1 + k.race.finishFrac - w.goTick : -1,
      bestLapTicks: k.race.bestLapTicks, kind: cfg.slots[k.slot]!.kind, points: k.race.finishTick >= 0 ? (pts[k.race.rank - 1] ?? 0) : 0,
    })).sort((a, b) => a.rank - b.rank);
    let winnerTeam = rows[0]?.team ?? 0;
    if (cfg.teams !== 'solo') {
      const sums = new Map<number, { p: number; best: number }>();
      for (const r of rows) { const s = sums.get(r.team) ?? { p: 0, best: 99 }; s.p += r.points; s.best = Math.min(s.best, r.rank); sums.set(r.team, s); }
      if (cfg.mode === 'item') winnerTeam = rows.find((r) => r.finished)?.team ?? winnerTeam;
      else winnerTeam = [...sums.entries()].sort((a, b) => b[1].p - a[1].p || a[1].best - b[1].best)[0]?.[0] ?? 0;
    }
    return { trackId: cfg.trackId, mode: cfg.mode, rows, winnerTeam, endTick: w.endTick };
  }
}

export { Edge };
