// Authoritative race room (ADR-007, 20-netcode-spec §4.2, §6, §9, §10). Runs identically in the Node server and in
// the browser Worker (offline): peers attach over a Transport, send stamped inputs, and receive EVENTS (ordered,
// acked, resumable), 30 Hz lossless SNAPSHOTs and per-tick INPUT_RELAYs. The room never rewinds: late inputs apply
// from the tick they arrive, missing inputs follow the shared hold/decay rule, and bots decide at t for t + 8.
// The M1 offline API (setInput / tick / drainEvents / world / prev / result) is kept for local use and tests.
import type { ContentTables } from '@cr/content';
import {
  appendDriftRequest, driftRequestAt, driftRequestCount, createWorld, cloneWorld, copyWorld, makeContext, step, createAiDriver, AI_TIERS, makeInput, copyInput, ArraySink, Phase, Edge, rollItem,
  type AuthorityHooks, type Decision, type BakedTrack, type InputFrame, type RaceConfig, type SimEvent, type StepContext, type WorldState, type AiDriver, type Tick,
} from '@cr/sim';
import {
  ByteReader, ByteWriter, C2S, S2C, NET, NetFlag, InputMsg, ResumeMsg, SnapshotEncoder, writeEvent, writeFrame, unwrapSeq16, u32Hex, hexU32,
  InputRing, stepMissing, ProtocolError, type Transport, type NetEvent, type InputMsgT,
} from '@cr/net';

export interface RoomClock { nowMs(): number }

export interface RaceRoomOptions {
  config: RaceConfig;
  track: BakedTrack;
  content: ContentTables;
  /** 128-bit item-roll key (4 words). Never sent to peers. Random when omitted. */
  secret?: Uint32Array;
  clock?: RoomClock;
  timing?: { leadTicks: number; snapshotEvery: number; botLookahead: number };
  /** Per-peer message limits (server). null/omitted = unlimited (offline Worker, tests). */
  limits?: { perSec: number; burst: number } | null;
  /** Keep cosmetic SimEvents for drainEvents() (default true). Server rooms pass false so nothing accumulates. */
  collectEvents?: boolean;
  /** Diagnostics (kicks, protocol errors). */
  log?: (msg: string) => void;
  /** How long a kicked peer may not re-attach (ms, needs `clock`; default 10 s). */
  kickMs?: number;
}

export interface PeerHandle { id: string; slot: number; transport: Transport; resumeToken: string }

export interface RaceResultRow { slot: number; rank: number; name: string; team: number; finished: boolean; raceTicks: number; bestLapTicks: number; kind: 'human' | 'bot' | 'empty'; points: number }
export interface RaceResult { trackId: string; mode: string; rows: RaceResultRow[]; winnerTeam: number; endTick: number }

export interface PeerStats { id: string; slot: number; bytesOut: number; msgsOut: number; bytesIn: number; msgsIn: number; skipping: boolean; slack: number; snapshots: number; keyframes: number; skippedSnapshots: number }

interface LogEntry { seq: number; tick: Tick; bytes: Uint8Array }

class SlotState {
  readonly ring = new InputRing(NET.INPUT_RING);
  readonly botRing = new InputRing(32);
  readonly late = makeInput();       // analog values of the newest late frame
  lateHas = false;
  lateAnalog = false;                // false when only edges arrived (frames older than N − 30)
  lateEdges = 0;
  readonly driftQueue: number[] = [];
  driftHead = 0;
  readonly local = makeInput();
  localSet = false;
  miss = 0;
  lastRealTick = 0;
  bot: AiDriver | null = null;       // configured bot
  takeover: AiDriver | null = null;  // AI driving a silent human
  aiActive = false;
}

class Peer {
  readonly id: string;
  readonly slot: number;
  readonly transport: Transport;
  readonly tokenHex: string;
  sentSeq = 0;
  ackSeq = 0;
  lastSnapTick = 0;
  snapsSinceKey = 0;
  needKey = true;
  slackEma = 0;
  slackN = 0;
  clampRun = 0;
  lateFlag = false;
  resyncFlag = false;
  maxStamped = 0;
  skipping = false;
  overKillSince = -1;
  window: number[] = [];
  violations: number[] = [];
  strikes = 0;
  bytesOut = 0; msgsOut = 0; bytesIn = 0; msgsIn = 0; snapshots = 0; keyframes = 0; skippedSnapshots = 0;
  constructor(h: PeerHandle) { this.id = h.id; this.slot = h.slot; this.transport = h.transport; this.tokenHex = h.resumeToken.toLowerCase(); }
}

const RELAY_MAX = 255;

export class RaceRoom {
  readonly config: RaceConfig;
  readonly track: BakedTrack;
  readonly world: WorldState;
  readonly prev: WorldState;
  /** Every decision emitted so far (items publish these; EVENTS carry them unchanged). */
  readonly decisionLog: Decision[] = [];
  private ctx: StepContext;
  private sink = new ArraySink();
  private collect: boolean;
  private inputs: InputFrame[];
  /** Opt-in development trace of the actual authoritative input after late-input selection. */
  inputObserver?: (tick: number, slot: number, input: Readonly<InputFrame>) => void;
  private slots: SlotState[];
  private endCbs: ((r: RaceResult) => void)[] = [];
  private ended = false;
  private authority: AuthorityHooks;
  private content: ContentTables;
  private clock: RoomClock | null;
  private limits: { perSec: number; burst: number } | null;
  private log: (m: string) => void;
  private lookahead: number;
  private snapEvery: number;

  // networking
  private peers = new Map<string, Peer>();
  private eventLog: LogEntry[] = [];
  private headSeq = 0;
  private relayQ: { slot: number; tick: Tick; frame: InputFrame }[] = [];
  private relayPool: InputFrame[] = [];
  private encoder: SnapshotEncoder;
  private ew = new ByteWriter(512);
  private mw = new ByteWriter(2048);
  private rd = new ByteReader();
  private inMsg: InputMsgT = { firstTick: 0, ackEventSeq: 0, frames: [] };
  private tmp = makeInput();
  private evCache = new Map<number, { bytes: Uint8Array; last: number }>();
  private relayCache = new Map<number, Uint8Array[]>();
  private peerList: Peer[] = [];
  /** Kicked peer ids → clock ms until which they may not re-attach (a kick would otherwise last one reconnect). */
  private readonly kickedUntil = new Map<string, number>();
  private readonly kickMs: number;
  private relayScratch: { slot: number; tick: Tick; frame: InputFrame }[] = [];

  constructor(o: RaceRoomOptions) {
    this.config = o.config;
    this.track = o.track;
    this.content = o.content;
    this.clock = o.clock ?? null;
    this.limits = o.limits ?? null;
    this.kickMs = o.kickMs ?? 10_000;
    this.collect = o.collectEvents !== false;
    this.log = o.log ?? ((): void => { /* quiet */ });
    this.lookahead = o.timing?.botLookahead ?? NET.BOT_LOOKAHEAD;
    this.snapEvery = o.timing?.snapshotEvery ?? NET.SNAPSHOT_EVERY;
    this.world = createWorld(o.config, o.track, o.content);
    this.prev = cloneWorld(this.world);
    this.encoder = new SnapshotEncoder(this.world.boxRespawn.length);
    const secret = o.secret ?? randomSecret();
    const world = this.world, content = o.content, cfg = o.config;
    this.authority = {
      rollItem: (slot, boxId, tick, bucket) => rollItem(content, cfg, secret, slot, boxId, tick, bucket),
      emit: (d) => { world.decisions.items.push(d); this.decisionLog.push(d); this.pushEvent(d); },
    };
    this.ctx = makeContext({ track: o.track, cfg: o.config, content: o.content, role: 'authority', authority: this.authority, events: this.sink });
    this.inputs = o.config.slots.map(() => makeInput());
    this.slots = o.config.slots.map((s, i) => {
      const st = new SlotState();
      if (s.kind === 'bot') st.bot = this.makeDriver(i, s.ai ?? 'racer');
      return st;
    });
    // bots decide their first `lookahead` ticks from the start grid
    for (let i = 0; i < this.slots.length; i++) {
      const st = this.slots[i]!;
      if (!st.bot) continue;
      st.bot.decide(this.world, this.tmp);
      for (let t = 1; t <= this.lookahead; t++) { st.botRing.set(t, this.tmp); this.queueRelay(i, t, this.tmp); this.tmp.edges = 0; this.tmp.driftRequests = 0; }
    }
  }

  /**
   * Bots and takeover drivers (14-ai §10): the character's personality, the race config (item brain, team rules) and
   * the lookahead, so the driver aims its frame at the tick it will be applied (applyTick = w.tick + 1 + lookaheadTicks).
   */
  private makeDriver(slot: number, tier: keyof typeof AI_TIERS, role: 'racer' | 'takeover' = 'racer'): AiDriver {
    const s = this.config.slots[slot]!;
    return createAiDriver(this.track, this.content, slot, AI_TIERS[tier], { character: s.characterId, role, lookaheadTicks: Math.max(0, this.lookahead - 1) },
      (this.config.seed ^ (slot * 7919)) >>> 0, this.config);
  }

  get tickNo(): number { return this.world.tick; }
  get phase(): number { return this.world.phase; }
  get eventSeqHead(): number { return this.headSeq; }

  // ------------------------------------------------------------ offline M1 API

  /** Latest local input for a human slot (no peer). Analog values persist; edges are OR-latched until the next tick. */
  setInput(slot: number, f: Readonly<InputFrame>): void {
    const st = this.slots[slot];
    if (!st) return;
    const edges = st.local.edges | f.edges;
    copyInput(st.local, f);
    st.local.edges = edges;
    st.localSet = true;
  }

  onEnd(cb: (r: RaceResult) => void): void { this.endCbs.push(cb); }

  drainEvents(out: SimEvent[]): void { this.sink.drain(out); }

  debugWorld(): Readonly<WorldState> { return this.world; }

  // ------------------------------------------------------------ peers

  attach(p: PeerHandle): void {
    const until = this.kickedUntil.get(p.id);
    if (until !== undefined && this.clock) {
      if (this.clock.nowMs() < until) { this.log(`refused ${p.id}: kicked`); p.transport.close(4001, 'kicked'); return; }
      this.kickedUntil.delete(p.id);
    }
    const old = this.peers.get(p.id);
    if (old) this.detach(p.id, 'replaced');
    const peer = new Peer(p);
    // a new or returning peer gets the whole resume log (it dedupes by seq) and a keyframe
    peer.sentSeq = this.oldestSeq() - 1;
    this.peers.set(p.id, peer);
    p.transport.onMessage = (b) => this.receive(peer, b);
    p.transport.onClose = (reason) => { if (this.peers.get(p.id) === peer) this.detach(p.id, reason); };
    this.sendCatchUpRelay(peer);
  }

  detach(peerId: string, reason: string): void {
    const p = this.peers.get(peerId);
    if (!p) return;
    this.peers.delete(peerId);
    if (p.transport.onMessage) p.transport.onMessage = null;
    p.transport.onClose = null;
    this.log(`detach ${peerId} slot ${p.slot}: ${reason}`);
  }

  hasPeer(peerId: string): boolean { return this.peers.has(peerId); }
  peerStats(): PeerStats[] {
    return [...this.peers.values()].map((p) => ({ id: p.id, slot: p.slot, bytesOut: p.bytesOut, msgsOut: p.msgsOut, bytesIn: p.bytesIn, msgsIn: p.msgsIn, skipping: p.skipping,
      slack: p.slackEma, snapshots: p.snapshots, keyframes: p.keyframes, skippedSnapshots: p.skippedSnapshots }));
  }

  /** True when every attached human peer has delivered its frame for `tick` (lockstep hosting, offline Worker). */
  readyFor(tick: Tick): boolean {
    for (const p of this.peers.values()) {
      const st = this.slots[p.slot];
      if (!st || this.config.slots[p.slot]?.kind !== 'human') continue;
      if (!st.ring.has(tick) && !st.lateHas) return false;
    }
    return true;
  }

  /** Is the slot currently driven by the takeover AI? */
  aiDriving(slot: number): boolean { return this.slots[slot]?.aiActive === true; }

  /** Room-wide PLAYER_RTT event (the host measures RTT from pings). */
  noteRtt(slot: number, ms: number): void {
    this.pushEvent({ k: 'rtt', tick: this.world.tick, slot, ms: Math.max(0, Math.min(65535, Math.round(ms))) });
  }

  private receive(p: Peer, b: Uint8Array): void {
    p.bytesIn += b.length; p.msgsIn++;
    if (!this.admit(p)) return;
    try {
      const r = this.rd.reset(b);
      switch (b[0]) {
        case C2S.INPUT: this.onInput(p, r); break;
        case C2S.RESUME: this.onResume(p, r); break;
        default: break; // PING and lobby frames are the host's business
      }
    } catch (e) {
      if (!(e instanceof ProtocolError)) throw e;
      this.strike(p, e.code);
    }
  }

  /**
   * Rate limit (§11: 70 msg/s, burst 10, > 3 violations/s disconnects). The budget is enforced over a 2 s window
   * (2·rate + burst): a TCP head-of-line stall after a lost segment delivers a few hundred ms of queued inputs at once,
   * which a strict 10-message burst would punish, while a sustained flood still trips it within a second.
   */
  private admit(p: Peer): boolean {
    const L = this.limits;
    if (!L || !this.clock) return true;
    const now = this.clock.nowMs();
    const win = p.window;
    while (win.length && win[0]! <= now - 2000) win.shift();
    if (win.length >= 2 * L.perSec + L.burst) {
      p.violations.push(now);
      while (p.violations.length && p.violations[0]! <= now - 1000) p.violations.shift();
      if (p.violations.length > 3) this.kick(p, 'rate_limited');
      return false;
    }
    win.push(now);
    return true;
  }

  private strike(p: Peer, why: string): void {
    p.strikes++;
    if (p.strikes > 20) this.kick(p, 'invalid');
    else this.log(`strike ${p.id}: ${why}`);
  }

  private kick(p: Peer, reason: string): void {
    this.log(`kick ${p.id}: ${reason}`);
    if (this.clock) this.kickedUntil.set(p.id, this.clock.nowMs() + this.kickMs);
    this.detach(p.id, reason);
    p.transport.close(4001, reason);
  }

  private onInput(p: Peer, r: ByteReader): void {
    const m = InputMsg.decode(r, this.inMsg);
    if (!m.valid) { this.strike(p, 'reserved bits'); return; }
    const acked = unwrapSeq16(m.ackEventSeq, p.sentSeq);
    if (acked > p.ackSeq && acked <= this.headSeq) p.ackSeq = acked;
    const st = this.slots[p.slot];
    if (!st || this.config.slots[p.slot]?.kind !== 'human') return;
    const N = this.world.tick + 1;
    for (let i = 0; i < m.frames.length; i++) {
      const f = m.frames[i]!;
      let T = m.firstTick + i;
      const slack = T - N;
      // Anti-spoof (ADR-007, 200 ms): once the arrival slack is established, a stamp far from it is replaced by the
      // estimate. A sustained shift (the client re-synced its clock) is accepted after half a second.
      if (p.slackN >= 30 && Math.abs(slack - p.slackEma) > NET.SPOOF_CLAMP && p.clampRun < 30) {
        p.clampRun++;
        T = N + Math.round(p.slackEma);
      } else {
        if (p.clampRun >= 30) p.slackEma = slack;
        p.clampRun = 0;
        p.slackEma = p.slackN === 0 ? slack : p.slackEma + 0.1 * (slack - p.slackEma);
        p.slackN++;
      }
      if (T > N + NET.MAX_AHEAD) { p.resyncFlag = true; continue; }
      if (T >= N) {
        st.ring.set(T, f);
        this.queueRelay(p.slot, T, f);
      } else {
        // late: analog values take over from N, edges are applied at N (frames older than N − 30 contribute edges only)
        if (T >= N - NET.MAX_BEHIND) { copyInput(st.late, f); st.lateAnalog = true; }
        st.lateEdges |= f.edges & ~Edge.DRIFT;
        this.enqueueDrifts(st, f);
        st.lateHas = true;
        p.lateFlag = true;
      }
      if (T > p.maxStamped) p.maxStamped = T;
    }
  }

  private onResume(p: Peer, r: ByteReader): void {
    const m = ResumeMsg.decode(r);
    if (u32Hex(m.token) !== p.tokenHex) { this.strike(p, 'resume token'); return; }
    const from = unwrapSeq16(m.lastEventSeq, this.headSeq);
    const oldest = this.oldestSeq();
    // resend everything after the client's last event (it may have lost some, e.g. on a channel nobody read); it dedupes by seq
    if (from + 1 >= oldest) p.sentSeq = Math.min(Math.max(from, oldest - 1), this.headSeq);
    else { p.sentSeq = Math.max(p.sentSeq, oldest - 1); p.resyncFlag = true; }
    p.needKey = true;
    this.sendCatchUpRelay(p);
  }

  // ------------------------------------------------------------ tick

  /** Exactly one simulation tick (§4.2). */
  tick(): void {
    copyWorld(this.prev, this.world);
    const w = this.world;
    const N = w.tick + 1;
    for (let s = 0; s < this.inputs.length; s++) { this.selectInput(s, N); this.inputObserver?.(N, s, this.inputs[s]!); }
    step(w, this.inputs, this.ctx);
    if (!this.collect) this.sink.list.length = 0;
    this.decideBots(N);
    this.flush(N);
    this.trimLog();
    if (w.phase === Phase.DONE && !this.ended) {
      this.ended = true;
      const r = this.result();
      for (const cb of this.endCbs) cb(r);
    }
  }

  private selectInput(s: number, N: Tick): void {
    const cur = this.inputs[s]!, st = this.slots[s]!, kind = this.config.slots[s]?.kind;
    if (kind === 'empty' || kind === undefined) { cur.steer = 0; cur.throttle = 0; cur.brake = 0; cur.held = 0; cur.edges = 0; cur.steerIntent = 0; cur.driftRequests = 0; return; }
    if (kind === 'bot') {
      const f = st.botRing.get(N);
      if (f) { copyInput(cur, f); st.miss = 0; } else stepMissing(cur, ++st.miss);
      return;
    }
    let human = false, mergedLate = false;
    const f = st.ring.get(N);
    if (f) {
      copyInput(cur, f);
      this.enqueueDrifts(st, f);
      if (st.lateHas) { cur.edges |= st.lateEdges; mergedLate = true; }
      human = true;
    } else if (st.lateHas) {
      if (st.lateAnalog) copyInput(cur, st.late); // otherwise keep holding the previous analog values
      cur.edges = st.lateEdges;
      human = true; mergedLate = true;
    } else if (st.localSet) {
      copyInput(cur, st.local);
      this.enqueueDrifts(st, st.local);
      st.local.edges = 0; st.local.driftRequests = 0;
      human = true;
    }
    st.lateHas = false; st.lateAnalog = false; st.lateEdges = 0;
    if (human || st.driftHead < st.driftQueue.length) {
      if (!human) { cur.edges = 0; cur.emote = 0; }
      cur.driftRequests = 0; cur.edges &= ~Edge.DRIFT;
      while (st.driftHead < st.driftQueue.length && driftRequestCount(cur.driftRequests) < 4) cur.driftRequests = appendDriftRequest(cur.driftRequests, st.driftQueue[st.driftHead++]!);
      if (cur.driftRequests) { cur.edges |= Edge.DRIFT; human = true; mergedLate = true; }
      if (st.driftHead === st.driftQueue.length) { st.driftQueue.length = 0; st.driftHead = 0; }
    }
    if (human) {
      st.miss = 0; st.lastRealTick = N;
      if (st.aiActive) { st.aiActive = false; this.log(`slot ${s}: control returned at ${N}`); }
      if (mergedLate) this.queueRelay(s, N, cur);
      return;
    }
    if (st.aiActive) {
      const b = st.botRing.get(N);
      if (b) { copyInput(cur, b); st.miss = 0; return; }
    }
    stepMissing(cur, ++st.miss);
  }

  private enqueueDrifts(st: SlotState, f: Readonly<InputFrame>): void {
    if (f.driftRequests) for (let i = 0; i < driftRequestCount(f.driftRequests); i++) st.driftQueue.push(driftRequestAt(f.driftRequests, i));
    else if (f.edges & Edge.DRIFT) st.driftQueue.push(f.steerIntent || Math.sign(f.steer));
  }

  private decideBots(N: Tick): void {
    const w = this.world;
    if (w.phase === Phase.DONE) return;
    const T = N + this.lookahead;
    for (let s = 0; s < this.slots.length; s++) {
      const st = this.slots[s]!, kind = this.config.slots[s]?.kind;
      if (kind === 'human' && !st.aiActive && N - st.lastRealTick >= NET.TAKEOVER_TICKS) {
        // a silent human (disconnected, or still loading) is driven by a Racer-profile AI with its personality
        st.takeover ??= this.makeDriver(s, 'racer', 'takeover');
        st.aiActive = true;
        this.log(`slot ${s}: AI takeover at ${N}`);
      }
      const d = kind === 'bot' ? st.bot : st.aiActive ? st.takeover : null;
      if (!d) continue;
      d.decide(w, this.tmp);
      st.botRing.set(T, this.tmp);
      this.queueRelay(s, T, this.tmp);
    }
  }

  // ------------------------------------------------------------ events

  private pushEvent(e: NetEvent): void {
    const w = this.ew.reset();
    writeEvent(w, e);
    this.eventLog.push({ seq: ++this.headSeq, tick: e.tick, bytes: w.finish() });
  }

  private oldestSeq(): number { return this.eventLog.length ? this.eventLog[0]!.seq : this.headSeq + 1; }

  private trimLog(): void {
    const minTick = this.world.tick - NET.EVENT_LOG_TICKS;
    let n = 0;
    while (n < this.eventLog.length && this.eventLog[n]!.tick < minTick && this.eventLog[n]!.seq <= this.minPendingSeq()) n++;
    if (n) this.eventLog.splice(0, n);
  }

  private minPendingSeq(): number {
    let m = this.headSeq;
    for (const p of this.peers.values()) if (p.sentSeq < m) m = p.sentSeq;
    return m;
  }

  private eventsMessage(firstSeq: number, cache: Map<number, { bytes: Uint8Array; last: number }>): { bytes: Uint8Array; last: number } | null {
    const hit = cache.get(firstSeq);
    if (hit) return hit;
    const i0 = firstSeq - this.oldestSeq();
    if (i0 < 0 || i0 >= this.eventLog.length) return null;
    const n = Math.min(255, this.eventLog.length - i0);
    let len = 4;
    for (let i = 0; i < n; i++) len += this.eventLog[i0 + i]!.bytes.length;
    const out = new Uint8Array(len);
    out[0] = S2C.EVENTS; out[1] = firstSeq & 0xff; out[2] = (firstSeq >>> 8) & 0xff; out[3] = n;
    let at = 4;
    for (let i = 0; i < n; i++) { const b = this.eventLog[i0 + i]!.bytes; out.set(b, at); at += b.length; }
    const res = { bytes: out, last: firstSeq + n - 1 };
    cache.set(firstSeq, res);
    return res;
  }

  // ------------------------------------------------------------ relay

  private queueRelay(slot: number, tick: Tick, f: Readonly<InputFrame>): void {
    const frame = this.relayPool.pop() ?? makeInput();
    copyInput(frame, f);
    this.relayQ.push({ slot, tick, frame });
  }

  private writeRelays(entries: ReadonlyArray<{ slot: number; tick: Tick; frame: InputFrame }>, exclude: number, out: Uint8Array[]): void {
    let i = 0;
    const list = this.relayScratch;
    list.length = 0;
    for (const e of entries) if (e.slot !== exclude) list.push(e);
    while (i < list.length) {
      let lo = list[i]!.tick, hi = lo, j = i;
      while (j < list.length && j - i < RELAY_MAX) {
        const t = list[j]!.tick;
        const nlo = Math.min(lo, t), nhi = Math.max(hi, t);
        if (nhi - nlo > 255) break;
        lo = nlo; hi = nhi; j++;
      }
      const w = this.mw.reset();
      w.u8(S2C.INPUT_RELAY); w.u32(lo); w.u8(j - i);
      for (let k = i; k < j; k++) { const e = list[k]!; w.u8(e.slot); w.u8(e.tick - lo); writeFrame(w, e.frame); }
      out.push(w.finish());
      i = j;
    }
  }

  private sendCatchUpRelay(p: Peer): void {
    const N = this.world.tick;
    const entries: { slot: number; tick: Tick; frame: InputFrame }[] = [];
    for (let s = 0; s < this.slots.length; s++) {
      if (s === p.slot) continue;
      const st = this.slots[s]!;
      for (let t = Math.max(1, N - 60); t <= N + NET.MAX_AHEAD; t++) {
        const f = st.ring.get(t) ?? st.botRing.get(t);
        if (f) entries.push({ slot: s, tick: t, frame: f });
      }
    }
    const out: Uint8Array[] = [];
    this.writeRelays(entries, -1, out);
    for (const b of out) this.send(p, b);
  }

  // ------------------------------------------------------------ flush

  private send(p: Peer, b: Uint8Array): void { p.bytesOut += b.length; p.msgsOut++; p.transport.send(b); }

  private flush(N: Tick): void {
    const snapTick = N % this.snapEvery === 0;
    if (this.peers.size === 0) { this.recycleRelay(); return; }
    const evCache = this.evCache, relayCache = this.relayCache;
    evCache.clear(); relayCache.clear();
    let captured = false;
    const now = this.clock?.nowMs() ?? 0;
    // a kick inside the loop removes from `peers`; iterate a reused snapshot of it
    const list = this.peerList;
    list.length = 0;
    for (const p of this.peers.values()) list.push(p);
    for (const p of list) {
      // backpressure (§9): skip SNAPSHOT/RELAY above 32 KB until below 16 KB; EVENTS always go out
      const buffered = p.transport.bufferedAmount();
      if (p.skipping ? buffered < NET.BP_LOW : buffered > NET.BP_HIGH) {
        p.skipping = !p.skipping;
        this.log(`${p.id}: backpressure ${p.skipping ? 'on' : 'off'} (${buffered} B buffered) at ${N}`);
      }
      if (buffered > NET.BP_KILL) {
        if (p.overKillSince < 0) p.overKillSince = now;
        else if (this.clock && now - p.overKillSince > NET.BP_KILL_MS) { this.kick(p, 'slow_consumer'); continue; }
      } else p.overKillSince = -1;

      while (p.sentSeq < this.headSeq) {
        const m = this.eventsMessage(p.sentSeq + 1, evCache);
        if (!m) { p.sentSeq = this.oldestSeq() - 1; p.resyncFlag = true; if (p.sentSeq >= this.headSeq) break; continue; }
        this.send(p, m.bytes);
        p.sentSeq = m.last;
      }

      if (snapTick) {
        if (p.skipping) p.skippedSnapshots++;
        else {
          if (!captured) { this.encoder.capture(this.world); captured = true; }
          this.sendSnapshot(p, N);
        }
      }

      if (!p.skipping && this.relayQ.length) {
        let msgs = relayCache.get(p.slot);
        if (!msgs) { msgs = []; this.writeRelays(this.relayQ, p.slot, msgs); relayCache.set(p.slot, msgs); }
        for (const b of msgs) this.send(p, b);
      }
    }
    this.recycleRelay();
  }

  private recycleRelay(): void {
    for (const e of this.relayQ) this.relayPool.push(e.frame);
    this.relayQ.length = 0;
  }

  private sendSnapshot(p: Peer, N: Tick): void {
    const enc = this.encoder;
    let base = p.needKey || p.snapsSinceKey >= NET.KEYFRAME_EVERY - 1 || !enc.hasBase(p.lastSnapTick) ? 0 : p.lastSnapTick;
    let body = enc.body(base);
    // "whenever the delta would be larger than a keyframe"
    if (base !== 0 && body.length > 600) { const key = enc.body(0); if (key.length <= body.length) { base = 0; body = key; } }
    const flags = (base === 0 ? NetFlag.KEYFRAME : 0) | (p.lateFlag ? NetFlag.LATE : 0) | (p.resyncFlag ? NetFlag.RESYNC : 0);
    const msg = enc.message({ tick: N, ackInputTick: Math.min(p.maxStamped, N), inputSlack: p.slackEma, netFlags: flags, eventSeqHead: p.sentSeq, baseTick: base }, body);
    this.send(p, msg);
    p.snapshots++;
    if (base === 0) { p.keyframes++; p.snapsSinceKey = 0; } else p.snapsSinceKey++;
    p.lastSnapTick = N; p.needKey = false; p.lateFlag = false; p.resyncFlag = false;
  }

  // ------------------------------------------------------------ result

  result(): RaceResult { return raceResult(this.world, this.config); }
}

/**
 * The result table of a finished world (pure; the same on the authority and on a client holding the authoritative
 * world, which is how a client recovers the result if the raceEnd message is lost).
 */
export function raceResult(w: Readonly<WorldState>, cfg: Readonly<RaceConfig>): RaceResult {
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

/** Per-room secret for keyed item rolls (4 words). Uses Web Crypto (Node ≥ 19 and browsers). */
export function randomSecret(): Uint32Array {
  const out = new Uint32Array(4);
  const c = (globalThis as { crypto?: { getRandomValues?(a: Uint32Array): Uint32Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(out);
  else for (let i = 0; i < 4; i++) out[i] = (Math.random() * 4294967296) >>> 0;
  return out;
}

/** A fresh 128-bit resume token as 32 hex chars. */
export const newResumeToken = (): string => u32Hex(randomSecret());
export { hexU32 };

export { Edge };
