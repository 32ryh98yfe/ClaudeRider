// SimLink scenario runner (20-netcode-spec §13): one authority and N NetClients in one process on virtual time.
// The authority is injected (RaceRoom lives in @cr/room, which depends on this package); anything with the RaceRoom
// peer API works, so the same harness drives the server room and the offline Worker's room alike.
import type { ContentTables } from '@cr/content';
import { MAX_KARTS, type BakedTrack, type Decision, type InputFrame, type RaceConfig, type Tick, type WorldState } from '@cr/sim';
import { ByteReader, ByteWriter, u32Hex } from '../protocol/bytes.ts';
import { C2S, NET } from '../protocol/ids.ts';
import { PingMsg, PongMsg } from '../protocol/messages.ts';
import { FlatWorld, flatHash, flattenWorld } from '../protocol/world.ts';
import { FrameMux } from '../mux.ts';
import type { Transport } from '../transport.ts';
import { NetClient } from '../client/NetClient.ts';
import { simLink, type LinkProfile, type SimLinkPair } from './link.ts';
import { VirtualLoop, prng } from './vtime.ts';

export interface AuthorityLike {
  attach(p: { id: string; slot: number; transport: Transport; resumeToken: string }): void;
  detach(peerId: string, reason: string): void;
  tick(): void;
  readonly world: Readonly<WorldState>;
  /** Every decision the authority emitted (items); compared with what each client received. */
  readonly decisionLog?: readonly Decision[];
}

export interface ScenarioOptions {
  cfg: RaceConfig;
  track: BakedTrack;
  content: ContentTables;
  makeAuthority: (nowMs: () => number) => AuthorityLike;
  /** Slots driven by simulated players (each gets a NetClient and a link). */
  humans: number[];
  link: (slot: number) => { up: LinkProfile; down: LinkProfile };
  /** Per-tick input of a simulated player (decides on that client's predicted world). */
  driver: (slot: number) => (w: Readonly<WorldState>, out: InputFrame) => void;
  seed: number;
  /** Race ticks to run after the start. */
  ticks: number;
  /** Global server tick of race tick 0 (clients sync their clocks before it). */
  startTick?: Tick;
  frameHz?: number;
  frameJitterMs?: number;
  skewPpm?: (slot: number) => number;
  /** S9: cut a client's connection at race tick `atTick` and reconnect `forMs` later. */
  disconnect?: { slot: number; atTick: Tick; forMs: number };
  /** Stall a client's uplink at race tick `atTick` for `ms` (its inputs reach the server late, nothing is lost). */
  stall?: { slot: number; atTick: Tick; ms: number };
  /** GC pause injection: every `everyMs` a client stalls for `ms`. */
  gcPause?: { everyMs: number; ms: number };
  realNow?: () => number;
  /** Called after every client frame (tracing). */
  onFrame?: (slot: number, nc: NetClient, virtualMs: number) => void;
}

export interface ClientMetrics {
  slot: number;
  localCorrections: number[];       // per reconciliation: local kart drawn-pose correction (m)
  remoteErrors: number[];            // per frame × remote kart: drawn − true position (m)
  remoteHumanErrors: number[];       // the same, remote players only
  updateMs: number[];                // CPU time of each update() (real ms)
  snapshots: number;
  snapshotMismatches: number;        // decoded snapshot ≠ authority at that tick (must be 0: lossless)
  reconciles: number;
  predictedMatches: number;          // reconciliations that needed no replay
  downKBps: number; upKBps: number;  // including modelled WS + TCP/IP framing
  downPayloadKBps: number; upPayloadKBps: number;
  downMsgsPerSec: number; upMsgsPerSec: number;
  /** S9: ms from reconnect until a snapshot at or after the reconnect tick was decoded. */
  resumeMs: number | null;
  /** M8: item grants (any kart) whose decision arrived before the client's timeline reached the roulette landing. */
  grants: number; grantsKnownBeforeLanding: number;
  /**
   * M3: effects on this client's kart whose schedule arrived after their start tick on this client's timeline,
   * counting only effects scheduled with the ADR-007 lead (≥ 21 ticks); shorter leads are counted separately.
   */
  effectsOnMe: number; effectsLate: number;
  /** The same for effects on any kart (a proxy when players are rarely hit in short races). */
  effectsAll: number; effectsAllLate: number;
  /** Effects scheduled with less than the 21-tick SCE lead, and how many of those arrived after their start. */
  shortLeadEffects: number; shortLeadLate: number;
  /** The client's decision log equals the authority's (unchanged over EVENTS). */
  decisionsEqual: boolean | null;
  client: NetClient;
}

export interface ScenarioResult { clients: ClientMetrics[]; serverTicks: number; serverTickMs: number[]; finalHashMatch: boolean }

const TICK = NET.TICK_MS;

export function runScenario(o: ScenarioOptions): ScenarioResult {
  const loop = new VirtualLoop();
  const rng = prng(o.seed);
  const realNow = o.realNow ?? (() => (globalThis as unknown as { performance: { now(): number } }).performance.now());
  const startTick = o.startTick ?? 90;
  const authority = o.makeAuthority(() => loop.now);
  const endRaceTick = o.ticks;
  const histLen = endRaceTick + 400;

  // server-side history for the error metrics: kart positions and full-world hashes by tick
  const hist = new Float64Array(histLen * MAX_KARTS * 3);
  const hashes = new Uint32Array(histLen);
  const flat = new FlatWorld();
  const record = (): void => {
    const w = authority.world;
    if (w.tick >= histLen) return;
    for (let s = 0; s < MAX_KARTS; s++) {
      const b = w.karts[s]!.body, at = (w.tick * MAX_KARTS + s) * 3;
      hist[at] = b.px; hist[at + 1] = b.py; hist[at + 2] = b.pz;
    }
    hashes[w.tick] = flatHash(flattenWorld(w, flat));
  };
  record();

  const serverTickMs: number[] = [];
  const pw = new ByteWriter(32), pr = new ByteReader();
  const pingIn = { pingId: 0, clientMs: 0 };

  interface C {
    slot: number; token: string; nc: NetClient; links: SimLinkPair[]; m: ClientMetrics; clockOffset: number; skew: number;
    reconnectAt: number; resumeFrom: number; nextGc: number; pending: number[];
  }
  const clients: C[] = [];

  const connect = (slot: number, token: string): SimLinkPair => {
    const link = simLink(loop, o.link(slot), rng);
    const mux = new FrameMux(link.server);
    const ch = mux.channel((t) => t === C2S.INPUT || t === C2S.RESUME, { closeRaw: true });
    mux.onOther = (b) => {
      if (b[0] !== C2S.PING) return;
      const p = PingMsg.decode(pr.reset(b), pingIn);
      const g = loop.now / TICK;
      pw.reset();
      PongMsg.encode(pw, { pingId: p.pingId, clientMsEcho: p.clientMs, serverTick: Math.floor(g), tickPhase: (g - Math.floor(g)) * 65536 });
      link.server.send(pw.finish());
    };
    authority.attach({ id: `p${slot}`, slot, transport: ch, resumeToken: token });
    return link;
  };

  const authFlat = new FlatWorld();
  for (const slot of o.humans) {
    const token = u32Hex([rng() * 4294967296, rng() * 4294967296, rng() * 4294967296, rng() * 4294967296]);
    const m: ClientMetrics = {
      slot, localCorrections: [], remoteErrors: [], remoteHumanErrors: [], updateMs: [], snapshots: 0, snapshotMismatches: 0, reconciles: 0, predictedMatches: 0,
      downKBps: 0, upKBps: 0, downPayloadKBps: 0, upPayloadKBps: 0, downMsgsPerSec: 0, upMsgsPerSec: 0, resumeMs: null, client: null as unknown as NetClient,
      grants: 0, grantsKnownBeforeLanding: 0, effectsOnMe: 0, effectsLate: 0, effectsAll: 0, effectsAllLate: 0, shortLeadEffects: 0, shortLeadLate: 0, decisionsEqual: null,
    };
    const c: C = {
      slot, token, nc: null as unknown as NetClient, links: [connect(slot, token)], m, clockOffset: rng() * 100000,
      skew: (o.skewPpm?.(slot) ?? 0) * 1e-6, reconnectAt: -1, resumeFrom: -1, nextGc: o.gcPause?.everyMs ?? Infinity, pending: [],
    };
    c.nc = new NetClient({
      transport: c.links[0]!.client, track: o.track, content: o.content, cfg: o.cfg, slot, startTick, mode: 'synced', resumeToken: token,
      nowMs: () => loop.now * (1 + c.skew) + c.clockOffset,
      inputProvider: o.driver(slot),
      onSnapshot: (meta, auth) => {
        m.snapshots++;
        if (meta.tick < histLen && hashes[meta.tick] !== flatHash(flattenWorld(auth, authFlat))) m.snapshotMismatches++;
        if (c.resumeFrom >= 0 && meta.tick >= c.resumeFrom && m.resumeMs === null) m.resumeMs = loop.now - c.reconnectAt;
      },
      onDecision: (d, predTick) => {
        if (d.k === 'grant') { m.grants++; if (predTick < d.tick + 30) m.grantsKnownBeforeLanding++; }
        if (d.k === 'effect') {
          const late = predTick >= d.start;
          if (d.start - d.tick < NET.SCE_LEAD) { m.shortLeadEffects++; if (late) m.shortLeadLate++; }
          else {
            m.effectsAll++; if (late) m.effectsAllLate++;
            if (d.victim === slot) { m.effectsOnMe++; if (late) m.effectsLate++; }
          }
        }
      },
      onReconcile: (corr, replayed) => {
        m.reconciles++;
        if (!replayed) m.predictedMatches++;
        m.localCorrections.push(corr[slot]!);
      },
    });
    m.client = c.nc;
    clients.push(c);
  }

  // server ticks: race tick k happens at global tick startTick + k (a drift-free schedule)
  let k = 0;
  const serverTick = (): void => {
    k++;
    const t0 = realNow();
    authority.tick();
    serverTickMs.push(realNow() - t0);
    record();
    const st = o.stall;
    if (st && k === st.atTick) clients.find((x) => x.slot === st.slot)?.links.at(-1)?.stallUp(st.ms);
    const d = o.disconnect;
    if (d && k === d.atTick) {
      const c = clients.find((x) => x.slot === d.slot);
      if (c) {
        c.links[c.links.length - 1]!.cut(50);
        loop.after(d.forMs, () => {
          const link = connect(c.slot, c.token);
          c.links.push(link);
          c.reconnectAt = loop.now;
          c.resumeFrom = authority.world.tick;
          c.nc.replaceTransport(link.client);
        });
      }
    }
    if (k < endRaceTick + 300) loop.at((startTick + k + 1) * TICK, serverTick);
  };
  loop.at((startTick + 1) * TICK, serverTick);

  // client frame loops (60 or 144 Hz, optional jitter and GC pauses)
  const hz = o.frameHz ?? 60;
  const off = { x: 0, y: 0, z: 0 };
  for (const c of clients) {
    const frame = (): void => {
      if (o.gcPause && loop.now >= c.nextGc) { c.nextGc = loop.now + o.gcPause.everyMs; loop.after(o.gcPause.ms, frame); return; }
      const t0 = realNow();
      c.nc.update(loop.now * (1 + c.skew) + c.clockOffset);
      c.m.updateMs.push(realNow() - t0);
      o.onFrame?.(c.slot, c.nc, loop.now);
      // record where each remote kart is drawn; judged against the server once it reaches that tick
      const w = c.nc.world, p = c.nc.prev, a = c.nc.alpha;
      if (w.tick >= 2 && w.phase >= 2) {
        for (let s = 0; s < MAX_KARTS; s++) {
          if (s === c.slot || !w.karts[s]!.active) continue;
          const b = w.karts[s]!.body, pb = p.karts[s]!.body;
          c.nc.visualOffset(s, off);
          c.pending.push(w.tick, a, s, pb.px + (b.px - pb.px) * a + off.x, pb.py + (b.py - pb.py) * a + off.y, pb.pz + (b.pz - pb.pz) * a + off.z, o.humans.includes(s) ? 1 : 0);
        }
      }
      if (authority.world.tick < endRaceTick) loop.after(1000 / hz + (o.frameJitterMs ? (rng() * 2 - 1) * o.frameJitterMs : 0), frame);
    };
    loop.at(rng() * 16, frame);
  }

  loop.run((startTick + endRaceTick + 300) * TICK);

  const lastTick = authority.world.tick;
  const liveSec = loop.now / 1000;
  for (const c of clients) {
    const m = c.m, arr = c.pending;
    for (let i = 0; i < arr.length; i += 7) {
      const T = arr[i]!, a = arr[i + 1]!, s = arr[i + 2]!;
      if (T > lastTick || T < 1 || T >= histLen) continue;
      const at1 = (T * MAX_KARTS + s) * 3, at0 = ((T - 1) * MAX_KARTS + s) * 3;
      const x = hist[at0]! + (hist[at1]! - hist[at0]!) * a;
      const y = hist[at0 + 1]! + (hist[at1 + 1]! - hist[at0 + 1]!) * a;
      const z = hist[at0 + 2]! + (hist[at1 + 2]! - hist[at0 + 2]!) * a;
      const e = Math.hypot(arr[i + 3]! - x, arr[i + 4]! - y, arr[i + 5]! - z);
      m.remoteErrors.push(e);
      if (arr[i + 6]) m.remoteHumanErrors.push(e);
    }
    let upW = 0, upB = 0, upM = 0, dnW = 0, dnB = 0, dnM = 0;
    for (const l of c.links) { upW += l.up.wireBytes; upB += l.up.bytes; upM += l.up.msgs; dnW += l.down.wireBytes; dnB += l.down.bytes; dnM += l.down.msgs; }
    m.upKBps = upW / 1024 / liveSec; m.downKBps = dnW / 1024 / liveSec;
    m.upPayloadKBps = upB / 1024 / liveSec; m.downPayloadKBps = dnB / 1024 / liveSec;
    m.upMsgsPerSec = upM / liveSec; m.downMsgsPerSec = dnM / liveSec;
    // the authority runs past the end of the clients' frames, so compare what was delivered: an exact prefix
    // that covers every decision up to the client's last authoritative tick
    if (authority.decisionLog) {
      const got = c.nc.decisions, all = authority.decisionLog;
      const due = all.filter((d) => d.tick <= c.nc.auth.tick).length;
      m.decisionsEqual = got.length >= due && canon(got) === canon(all.slice(0, got.length));
    }
  }
  // after the race every client's authoritative world equals the server's (lossless snapshots, same tick)
  const finalHashMatch = clients.every((c) => {
    const t = c.nc.auth.tick;
    return t < histLen && hashes[t] === flatHash(flattenWorld(c.nc.auth, authFlat));
  });
  return { clients: clients.map((c) => c.m), serverTicks: k, serverTickMs, finalHashMatch };
}

/** Key-order independent JSON (decoded decisions list their fields in wire order). */
const canon = (xs: readonly object[]): string => JSON.stringify(xs.map((x) => Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1)))));

export function percentile(xs: readonly number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]!;
}
