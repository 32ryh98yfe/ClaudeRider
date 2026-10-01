// Test fixture: a GameServer on a fake clock, in-memory tracks, and scripted clients over queued loopback transports.
import { readFileSync } from 'node:fs';
import { loadContent, type TrackId } from '@cr/content';
import { loadCtrk, toArrayBuffer, type BakedTrack } from '@cr/sim';
import { buildTrack } from '@cr/trackc/build.ts';
import { FrameMux, NET, decodeLobby, encodeC2SLobby, loopbackPair, S2C, type C2SLobby, type Loadout, type S2CLobby, type Transport } from '@cr/net';
import { GameServer, type LobbyTimings, type TrackSource } from '../src/lobby/server.ts';

const trackCache = new Map<string, BakedTrack>();
function bake(dir: string, id: string): BakedTrack {
  const hit = trackCache.get(id);
  if (hit) return hit;
  const file = new URL(`../../../tracks/${dir}/${id}.ctd`, import.meta.url).pathname;
  const t = loadCtrk(toArrayBuffer(buildTrack(readFileSync(file, 'utf8'), file).ctrk));
  trackCache.set(id, t);
  return t;
}

export const memoryTracks = (): TrackSource => {
  const tracks = new Map<TrackId, BakedTrack>([['proving_ring', bake('spark_circuit', 'proving_ring')]]);
  return { list: () => [...tracks.keys()], has: (id: string): id is TrackId => tracks.has(id as TrackId), get: (id) => tracks.get(id)! };
};

export class FakeClock {
  now = 0;
  readonly epochWallMs = 1_700_000_000_000;
  nowMs(): number { return this.now; }
  serverTick(n: number): number { return n / NET.TICK_MS; }
  wallMs(n: number): number { return this.epochWallMs + n; }
}

export const LOADOUT: Loadout = { characterId: 'clay', kartBodyId: 'pebble', livery: { primary: '#d97757', secondary: '#faf9f5', pattern: 0, number: 7 } };

export class World {
  readonly clock = new FakeClock();
  readonly queue: (() => void)[] = [];
  readonly server: GameServer;
  G = 0;
  readonly onTick: (() => void)[] = [];
  constructor(timings: Partial<LobbyTimings> = {}) {
    this.server = new GameServer({ tracks: memoryTracks(), content: loadContent(), clock: this.clock, timings, introTicks: 30 });
  }
  /** Delivers queued messages (repeatedly, until quiet). */
  flush(): void { for (let i = 0; i < 100 && this.queue.length; i++) { const q = this.queue.splice(0); for (const f of q) f(); } }
  /** Advances time tick by tick, running the server and any per-tick hooks. */
  advance(ms: number): void {
    const end = this.clock.now + ms;
    while (this.clock.now < end) {
      this.clock.now = Math.min(end, (this.G + 1) * NET.TICK_MS);
      const g = Math.floor(this.clock.serverTick(this.clock.now) + 1e-9);
      while (this.G < g) { this.G++; this.server.tick(this.G); }
      this.flush();
      for (const f of this.onTick) f();
      this.flush();
    }
  }
  client(name: string): TestClient { return new TestClient(this, name); }
}

export class TestClient {
  readonly w: World;
  readonly name: string;
  transport: Transport;
  serverSide: Transport;
  mux: FrameMux;
  readonly got: S2CLobby[] = [];
  /** The close reason once the server closed this connection. */
  closed: string | null = null;
  constructor(w: World, name: string) {
    this.w = w; this.name = name;
    const [c, s] = loopbackPair(1, (fn) => { w.queue.push(fn); });
    this.transport = c; this.serverSide = s;
    this.mux = new FrameMux(c);
    this.mux.onOther = (b) => { if (b[0] === S2C.LOBBY_JSON) this.got.push(decodeLobby(b) as S2CLobby); };
    this.closed = null;
    this.mux.onClose = (r) => { this.closed = r; };
    w.server.accept(s);
  }
  send(m: C2SLobby): this { this.transport.send(encodeC2SLobby(m)); this.w.flush(); return this; }
  hello(resume?: string): this { return this.send({ t: 'hello', v: 1, name: this.name, loadout: LOADOUT, ...(resume ? { resume } : {}) }); }
  last<T extends S2CLobby['t']>(t: T): Extract<S2CLobby, { t: T }> | undefined {
    for (let i = this.got.length - 1; i >= 0; i--) if (this.got[i]!.t === t) return this.got[i] as Extract<S2CLobby, { t: T }>;
    return undefined;
  }
  all<T extends S2CLobby['t']>(t: T): Extract<S2CLobby, { t: T }>[] { return this.got.filter((m) => m.t === t) as Extract<S2CLobby, { t: T }>[]; }
  errors(): string[] { return this.all('error').map((e) => e.code); }
  /** Drops the connection (server sees a close). */
  drop(): void { this.transport.close(1006, 'drop'); this.w.flush(); }
  /** A new connection resuming the session. */
  reconnect(): this {
    const token = this.last('welcome')!.resume!;
    const [c, s] = loopbackPair(1, (fn) => { this.w.queue.push(fn); });
    this.transport = c; this.serverSide = s;
    this.mux = new FrameMux(c);
    this.mux.onOther = (b) => { if (b[0] === S2C.LOBBY_JSON) this.got.push(decodeLobby(b) as S2CLobby); };
    this.closed = null;
    this.mux.onClose = (r) => { this.closed = r; };
    this.w.server.accept(s);
    return this.hello(token);
  }
}
