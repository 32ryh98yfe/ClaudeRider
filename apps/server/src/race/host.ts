// Hosts one RaceRoom for a lobby room (20-netcode-spec §4.1): LOADING (until every human reported `loaded` with the
// right track hash, or 15 s) → RACE on the shared 60 Hz clock (race tick k runs at global tick startTick + k, catching
// up at most 5 ticks per server tick) → results. Humans attach over a race channel of their socket; a returning
// session re-attaches to the same slot and resumes.
import type { ContentTables } from '@cr/content';
import { C2S, u32Hex, type Channel } from '@cr/net';
import { RaceRoom, randomSecret, type RaceResult } from '@cr/room';
import type { BakedTrack, RaceConfig } from '@cr/sim';

export interface RaceHuman { sessionId: string; slot: number; token: string; loaded: boolean; channel: Channel | null }

export interface RaceHostOptions {
  cfg: RaceConfig;
  track: BakedTrack;
  content: ContentTables;
  humans: { sessionId: string; slot: number }[];
  nowMs: () => number;
  /** Global tick at which loading gives up waiting (late loaders start AI-driven). */
  loadDeadlineTick: number;
  log?: (m: string) => void;
}

export class RaceHost {
  readonly raceId = u32Hex(randomSecret()).slice(0, 16);
  readonly cfg: RaceConfig;
  readonly room: RaceRoom;
  readonly humans = new Map<string, RaceHuman>();
  /** Global tick of race tick 0; provisional (the load deadline) until `finalize`. */
  startTick: number;
  final = false;
  result: RaceResult | null = null;
  endedAtTick = -1;
  /** Wall time of each room.tick() in ms (load statistics). */
  lastTickMs = 0;
  private readonly log: (m: string) => void;

  constructor(o: RaceHostOptions) {
    this.cfg = o.cfg;
    this.log = o.log ?? ((): void => { /* quiet */ });
    this.startTick = o.loadDeadlineTick;
    this.room = new RaceRoom({
      config: o.cfg, track: o.track, content: o.content, clock: { nowMs: o.nowMs }, collectEvents: false,
      limits: { perSec: 70, burst: 10 }, log: (m) => this.log(`[race ${this.raceId}] ${m}`),
    });
    for (const h of o.humans) this.humans.set(h.sessionId, { ...h, token: u32Hex(randomSecret()), loaded: false, channel: null });
    this.room.onEnd((r) => { this.result = r; });
  }

  /** (Re)attaches a human's socket: INPUT and RESUME frames go to the room; kicks close the socket. */
  attach(sessionId: string, mux: { channel(accept: (t: number) => boolean, o?: { id?: string; closeRaw?: boolean }): Channel }): void {
    const h = this.humans.get(sessionId);
    if (!h) return;
    h.channel?.detach();
    h.channel = mux.channel((t) => t === C2S.INPUT || t === C2S.RESUME, { id: sessionId, closeRaw: true });
    this.room.attach({ id: sessionId, slot: h.slot, transport: h.channel, resumeToken: h.token });
  }

  detach(sessionId: string, reason: string): void {
    const h = this.humans.get(sessionId);
    if (!h) return;
    this.room.detach(sessionId, reason);
    h.channel?.detach();
    h.channel = null;
  }

  markLoaded(sessionId: string): void { const h = this.humans.get(sessionId); if (h) h.loaded = true; }

  allLoaded(connected: (sessionId: string) => boolean): boolean {
    for (const h of this.humans.values()) if (!h.loaded && connected(h.sessionId)) return false;
    return true;
  }

  finalize(startTick: number): void { this.startTick = startTick; this.final = true; }

  /** Advances the race to global tick G (≤ 5 ticks of catch-up per call). */
  tick(G: number, now: () => number): void {
    if (!this.final && G < this.startTick) return;
    if (!this.final) this.final = true; // the load deadline passed
    const target = G - this.startTick;
    let n = 0;
    while (this.room.tickNo < target && n < 5) {
      const t0 = now();
      this.room.tick();
      this.lastTickMs = now() - t0;
      n++;
      if (this.result && this.endedAtTick < 0) this.endedAtTick = G;
    }
  }

  dispose(): void {
    for (const id of [...this.humans.keys()]) this.detach(id, 'race over');
  }
}
