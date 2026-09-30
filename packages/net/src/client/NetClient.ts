// Client prediction and rollback (ADR-007, 20-netcode-spec §2 and §7). The client predicts the WHOLE world at tick
// P ≈ serverTick + lead: its own inputs from its ring, remote karts from relayed inputs (bots are relayed 8 ticks
// ahead), unknown inputs by the shared missing-input rule. On a snapshot it restores every kart from the authoritative
// world and replays to P — unless the snapshot equals what it predicted for that tick and no relayed input or decision
// contradicted the prediction since, in which case nothing needs to be redone. Corrections are hidden by per-kart
// springs (visualOffset); one-shot events pass through the deduper so replays never repeat sounds or effects.
import type { ContentTables } from '@cr/content';
import {
  applyDecision, copyInput, copyWorld, createWorld, cloneWorld, makeContext, makeInput, step, ArraySink, MAX_KARTS,
  type BakedTrack, type DecisionLog, type InputFrame, type RaceConfig, type SimEvent, type StepContext, type Tick, type WorldState,
} from '@cr/sim';
import { ByteReader, ByteWriter, ProtocolError, hexU32 } from '../protocol/bytes.ts';
import { C2S, NET, NetFlag, S2C } from '../protocol/ids.ts';
import { InputMsg, PingMsg, PongMsg, RelayMsg, ResumeMsg, decodeLobby, type InputMsgT, type PongT, type RelayT } from '../protocol/messages.ts';
import { EventsMsg, unwrapSeq16, type EventsT, type NetEvent } from '../protocol/events.ts';
import { SnapshotDecoder, type SnapshotMeta } from '../protocol/snapshot.ts';
import { FlatWorld, flatHash, flattenWorld } from '../protocol/world.ts';
import { InputRing, RunningInput, sameFrame } from '../inputs.ts';
import type { Transport } from '../transport.ts';
import { ClockSync } from './clock.ts';
import { EventDeduper } from './dedupe.ts';
import { VisualSmoother } from './smoothing.ts';

export interface NetStats {
  connected: boolean;
  rttMs: number; jitterMs: number; leadTicks: number; serverSlack: number; rate: number;
  predTick: Tick; authTick: Tick; serverTickEst: number;
  snapshots: number; keyframes: number; decodeErrors: number; lateFlags: number; hardResyncs: number;
  resims: number; resimTicks: number; resimSkipped: number; lastResimMs: number; maxResimMs: number;
  /** Magnitude of the last correction of the local kart (m) and the largest so far. */
  lastLocalCorrection: number; maxLocalCorrection: number; corrections: number;
  eventsIn: number; bytesIn: number; bytesOut: number; msgsIn: number; msgsOut: number;
  pingMs: number[];
}

export interface NetClientOptions {
  transport: Transport;
  track: BakedTrack;
  content: ContentTables;
  cfg: RaceConfig;
  slot: number;
  nowMs: () => number;
  /** Server tick at which race tick 0 happens (synced mode). */
  startTick?: Tick;
  /** 'synced' (online): ping clock sync, run-ahead lead and 59/61 rate control. 'free' (offline lockstep authority): a local 60 Hz clock. */
  mode?: 'synced' | 'free';
  /** A clock shared with the lobby connection; when absent the client sends its own pings. */
  clock?: ClockSync;
  /** 128-bit race resume token (hex) for C2S_RESUME. */
  resumeToken?: string;
  /** Per-tick input source (autopilot, scripted tests); otherwise frames passed to submit() are used. */
  inputProvider?: (w: Readonly<WorldState>, out: InputFrame) => void;
  /** Steps per update() call (default 5). */
  maxSteps?: number;
  smoothing?: { remoteMs?: number; localMs?: number; snapM?: number };
  /** Lobby JSON frames that arrive on this transport (the offline Worker sends raceEnd here). */
  onLobby?: (msg: unknown) => void;
  /** Called after each decoded snapshot (metrics, tests). */
  onSnapshot?: (meta: Readonly<SnapshotMeta>, auth: Readonly<WorldState>) => void;
  /** Called after each reconciliation with the drawn-pose correction per kart (m, 0 = none) and whether it replayed. */
  onReconcile?: (corrections: Readonly<Float64Array>, replayed: boolean) => void;
}

const HASH_RING = 256;

export class NetClient {
  readonly cfg: RaceConfig;
  readonly slot: number;
  readonly stats: NetStats;
  readonly clock: ClockSync;
  readonly smoother: VisualSmoother;
  private transport: Transport;
  private readonly ownClock: boolean;
  private readonly mode: 'synced' | 'free';
  private readonly nowMs: () => number;
  private startTick: Tick;
  private readonly maxSteps: number;
  private readonly inputProvider: NetClientOptions['inputProvider'];
  private readonly onLobby: NetClientOptions['onLobby'];
  private readonly onSnap: NetClientOptions['onSnapshot'];
  private readonly onRec: NetClientOptions['onReconcile'];
  private readonly corr = new Float64Array(MAX_KARTS);
  private readonly token: Uint32Array | null;

  private pred: WorldState;
  private prevW: WorldState;
  private readonly dec: SnapshotDecoder;
  private readonly log: DecisionLog = { items: [] };
  private readonly ctx: StepContext;
  private readonly sink = new ArraySink();
  private readonly out: SimEvent[] = [];
  private readonly dedupe = new EventDeduper(120);
  private readonly own = new InputRing(256);
  private readonly remote: InputRing[] = [];
  private readonly used: InputRing[] = [];
  private readonly usedKnown: Int32Array[] = [];
  private readonly running: RunningInput[] = [];
  private readonly inputs: InputFrame[] = [];
  private readonly pending = makeInput();
  private readonly frame = makeInput();
  private readonly queue: Uint8Array[] = [];
  private readonly hashTick = new Int32Array(HASH_RING).fill(-1);
  private readonly hashVal = new Uint32Array(HASH_RING);
  private readonly flat = new FlatWorld();
  private readonly w = new ByteWriter(64);
  private readonly r = new ByteReader();
  private readonly inMsg: InputMsgT = { firstTick: 0, ackEventSeq: 0, frames: [makeInput()] };
  private readonly relay: RelayT = { baseTick: 0, entries: [] };
  private readonly events: EventsT = { firstSeq: 0, decisions: [] };
  private readonly pong: PongT = { pingId: 0, clientMsEcho: 0, serverTick: 0, tickPhase: 0 };
  private readonly oldPos = new Float64Array(MAX_KARTS * 4);

  private acc = 0;
  private alphaV = 0;
  private lastNow = -1;
  private started = false;
  private haveSnap = false;
  private newSnap = false;
  private dirtyMin = Infinity;
  private dirtyMax = -Infinity;
  private lastSeq = 0;
  private resyncWanted = false;
  private rateV = 60;
  private serverSlack = NaN;
  private closed = false;
  private lastResumeMs = -Infinity;

  constructor(o: NetClientOptions) {
    this.cfg = o.cfg;
    this.slot = o.slot;
    this.transport = o.transport;
    this.mode = o.mode ?? 'synced';
    this.nowMs = o.nowMs;
    this.startTick = o.startTick ?? 0;
    this.maxSteps = o.maxSteps ?? 5;
    this.inputProvider = o.inputProvider;
    this.onLobby = o.onLobby;
    this.onSnap = o.onSnapshot;
    this.onRec = o.onReconcile;
    this.ownClock = !o.clock;
    this.clock = o.clock ?? new ClockSync();
    this.token = o.resumeToken ? hexU32(o.resumeToken) : null;
    this.smoother = new VisualSmoother(o.slot, o.smoothing);
    const w0 = createWorld(o.cfg, o.track, o.content);
    w0.decisions = this.log;
    this.pred = w0;
    this.prevW = cloneWorld(w0);
    this.dec = new SnapshotDecoder(w0);
    this.dec.world.decisions = this.log;
    this.ctx = makeContext({ track: o.track, cfg: o.cfg, content: o.content, role: 'predictor', events: this.sink });
    for (let s = 0; s < MAX_KARTS; s++) {
      this.remote.push(new InputRing(NET.INPUT_RING));
      this.used.push(new InputRing(NET.INPUT_RING));
      this.usedKnown.push(new Int32Array(NET.INPUT_RING).fill(-1));
      this.running.push(new RunningInput());
      this.inputs.push(makeInput());
    }
    this.stats = {
      connected: true, rttMs: 0, jitterMs: 0, leadTicks: 0, serverSlack: 0, rate: 60, predTick: 0, authTick: 0, serverTickEst: 0,
      snapshots: 0, keyframes: 0, decodeErrors: 0, lateFlags: 0, hardResyncs: 0, resims: 0, resimTicks: 0, resimSkipped: 0,
      lastResimMs: 0, maxResimMs: 0, lastLocalCorrection: 0, maxLocalCorrection: 0, corrections: 0,
      eventsIn: 0, bytesIn: 0, bytesOut: 0, msgsIn: 0, msgsOut: 0, pingMs: new Array<number>(MAX_KARTS).fill(0),
    };
    this.bind(o.transport);
  }

  // ------------------------------------------------------------ public surface (B9)

  get world(): Readonly<WorldState> { return this.pred; }
  get prev(): Readonly<WorldState> { return this.prevW; }
  get alpha(): number { return this.alphaV; }
  /** Latest authoritative world (decoded snapshot). */
  get auth(): Readonly<WorldState> { return this.dec.world; }
  get rate(): number { return this.rateV; }

  /** Latest sampled input; analog values persist, edges are latched until the next predicted tick consumes them. */
  submit(f: Readonly<InputFrame>): void {
    const edges = this.pending.edges | f.edges;
    copyInput(this.pending, f);
    this.pending.edges = edges;
  }

  /** Processes network input, reconciles, and advances the prediction. Returns ticks advanced. */
  update(nowMs: number): number {
    const dtMs = this.lastNow < 0 ? 0 : Math.max(0, Math.min(250, nowMs - this.lastNow));
    this.lastNow = nowMs;
    if (this.ownClock && this.mode === 'synced' && !this.closed && this.clock.due(nowMs, !this.started)) this.sendPing(nowMs);
    this.processIncoming(nowMs);

    let budget = this.maxSteps;
    let freeze = false;
    if (this.mode === 'synced') {
      if (!this.clock.ready) return 0;
      const est = this.clock.serverTick(nowMs) - this.startTick;
      const lead = this.clock.leadTicks();
      const target = est + lead;
      this.stats.serverTickEst = est; this.stats.leadTicks = lead;
      if (!this.started) {
        if (target < 1) { this.reconcile(); this.smoother.update(dtMs / 1000); return 0; }
        this.started = true;
        // joining a race in progress: start from the authoritative world instead of simulating from tick 0
        if (this.haveSnap && this.dec.world.tick > this.pred.tick) this.newSnap = true;
        this.reconcile();
        // run ahead to the target lead at once (every skipped tick still sends its input)
        this.acc = Math.max(0, target - this.pred.tick);
        budget = Math.min(240, Math.ceil(this.acc));
      } else this.reconcile();
      const err = this.pred.tick + this.acc - target;
      if (err < -NET.RESYNC_TICKS || this.resyncWanted) {
        // hard resync forward: catch up now (inputs for the skipped ticks are still sent, stamped as they are simulated)
        this.resyncWanted = false;
        this.stats.hardResyncs++;
        budget = Math.min(180, Math.max(budget, Math.ceil(-err)));
        this.acc = Math.max(this.acc, -err);
      } else if (err > NET.RESYNC_TICKS) {
        // too far ahead: hold until the server's clock catches up (rewinding would duplicate already-sent frames)
        this.stats.hardResyncs++;
        freeze = true;
      }
      const want = NET.SLACK_TARGET + this.clock.jitterTicks();
      const slack = this.serverSlack;
      this.rateV = Number.isNaN(slack) ? 60 : slack < want - 0.5 ? 61 : slack > want + 0.5 ? 59 : 60;
      // the slack loop is primary; the clock estimate only keeps it from wandering far (asymmetric routes, stale slack)
      if (err > 6 && this.rateV > 60) this.rateV = 60;
      if (err < -6 && this.rateV < 60) this.rateV = 60;
      if (!freeze) this.acc += (dtMs / 1000) * this.rateV;
    } else {
      this.reconcile();
      this.rateV = 60;
      this.acc += (dtMs / 1000) * 60;
    }

    let steps = 0;
    while (this.acc >= 1 && steps < budget) {
      if (this.mode === 'free' && this.pred.tick - this.dec.world.tick >= 40) { this.acc = Math.min(this.acc, 1); break; }
      this.advance();
      this.acc -= 1;
      steps++;
    }
    if (this.mode === 'free' && steps === budget && this.acc > 1) this.acc = 0; // slow down like a local game would
    this.alphaV = Math.max(0, Math.min(1, this.acc));
    this.smoother.update(dtMs / 1000);
    this.stats.predTick = this.pred.tick;
    this.stats.authTick = this.dec.world.tick;
    this.stats.rate = this.rateV;
    this.stats.rttMs = this.clock.rttMs;
    this.stats.jitterMs = this.clock.jitterMs;
    return steps;
  }

  /** Spring-smoothed correction offset for a kart (add to its drawn position). */
  visualOffset(slot: number, out: { x: number; y: number; z: number }): void {
    out.x = this.smoother.x[slot]!; out.y = this.smoother.y[slot]!; out.z = this.smoother.z[slot]!;
  }
  /** Heading correction offset (radians about +Y). */
  visualYaw(slot: number): number { return this.smoother.yaw[slot]!; }

  drainEvents(out: SimEvent[]): void { for (const e of this.out) out.push(e); this.out.length = 0; }

  /** Updates the race start tick (a second raceStart moved it). */
  setStartTick(t: Tick): void { this.startTick = t; }

  /** After a reconnect: bind the new transport and ask the room to resume (events after lastSeq + keyframe). */
  replaceTransport(t: Transport): void {
    this.bind(t);
    this.sendResume();
  }

  close(): void {
    this.closed = true;
    this.transport.onMessage = null;
    this.transport.onClose = null;
  }

  // ------------------------------------------------------------ transport

  private bind(t: Transport): void {
    this.transport = t;
    this.closed = false;
    this.stats.connected = true;
    t.onMessage = (b) => { this.queue.push(b); };
    t.onClose = () => { this.stats.connected = false; };
  }

  private send(b: Uint8Array): void {
    if (this.closed || !this.stats.connected) return;
    this.stats.bytesOut += b.length; this.stats.msgsOut++;
    this.transport.send(b);
  }

  private sendPing(now: number): void {
    const p = this.clock.ping(now);
    this.w.reset(); PingMsg.encode(this.w, p); this.send(this.w.finish());
  }

  private sendResume(): void {
    if (!this.token) return;
    this.w.reset();
    ResumeMsg.encode(this.w, { token: this.token, lastSnapTick: this.dec.world.tick, lastEventSeq: this.lastSeq & 0xffff });
    this.send(this.w.finish());
  }

  // ------------------------------------------------------------ incoming

  private processIncoming(now: number): void {
    for (let i = 0; i < this.queue.length; i++) {
      const b = this.queue[i]!;
      this.stats.bytesIn += b.length; this.stats.msgsIn++;
      try {
        switch (b[0]) {
          case S2C.SNAPSHOT: this.onSnapshot(b); break;
          case S2C.EVENTS: this.onEvents(b); break;
          case S2C.INPUT_RELAY: this.onRelay(b); break;
          case S2C.PONG: if (this.ownClock) { PongMsg.decode(this.r.reset(b), this.pong); this.clock.onPong(this.pong, now); } break;
          case S2C.LOBBY_JSON: this.onLobby?.(decodeLobby(b)); break;
          default: break;
        }
      } catch (e) {
        if (!(e instanceof ProtocolError)) throw e;
        this.stats.decodeErrors++;
        // a broken delta chain needs a keyframe: RESUME doubles as the request (throttled)
        if ((e.code === 'base' || b[0] === S2C.SNAPSHOT) && now - this.lastResumeMs > 500) { this.lastResumeMs = now; this.sendResume(); }
      }
    }
    this.queue.length = 0;
  }

  private onSnapshot(b: Uint8Array): void {
    const m = this.dec.decode(b);
    this.haveSnap = true;
    this.newSnap = true;
    this.stats.snapshots++;
    if (m.netFlags & NetFlag.KEYFRAME) this.stats.keyframes++;
    if (m.netFlags & NetFlag.LATE) this.stats.lateFlags++;
    if (m.netFlags & NetFlag.RESYNC) this.resyncWanted = true;
    this.serverSlack = m.inputSlack;
    this.stats.serverSlack = m.inputSlack;
    this.onSnap?.(m, this.dec.world);
  }

  private onEvents(b: Uint8Array): void {
    const m = EventsMsg.decode(this.r.reset(b), this.events);
    let seq = unwrapSeq16(m.firstSeq, this.lastSeq + 1);
    for (const e of m.decisions) {
      if (seq > this.lastSeq) { this.onEvent(e); this.lastSeq = seq; }
      seq++;
    }
  }

  private onEvent(e: NetEvent): void {
    this.stats.eventsIn++;
    switch (e.k) {
      case 'rtt': this.stats.pingMs[e.slot] = e.ms; return;
      case 'resync': this.resyncWanted = true; return;
      case 'timeAdjust': case 'mash': case 'unknown': return;
      default: {
        const t = applyDecision(this.pred, e);
        if (t !== null) this.markDirty(t);
      }
    }
  }

  private onRelay(b: Uint8Array): void {
    const m = RelayMsg.decode(this.r.reset(b), this.relay);
    const P = this.pred.tick;
    for (const e of m.entries) {
      if (e.slot === this.slot) continue;
      const T = m.baseTick + e.dTick;
      this.remote[e.slot]!.set(T, e.frame);
      if (T <= P) {
        const u = this.used[e.slot]!.get(T);
        // A matching guess still leaves the running miss count wrong, which only matters while steering can decay.
        if (!u || !sameFrame(u, e.frame) || (e.frame.steer !== 0 && this.usedKnown[e.slot]![T & (NET.INPUT_RING - 1)] !== T)) this.markDirty(T);
      }
    }
  }

  private markDirty(t: Tick): void {
    if (t < this.dirtyMin) this.dirtyMin = t;
    if (t > this.dirtyMax) this.dirtyMax = t;
  }

  // ------------------------------------------------------------ reconcile

  /** Decides whether the prediction must be redone from the latest authoritative world, and does it. */
  private reconcile(): void {
    if (!this.haveSnap) { this.dirtyMin = Infinity; this.dirtyMax = -Infinity; this.newSnap = false; return; }
    const N = this.dec.world.tick, P = this.pred.tick;
    let need = false;
    const hadSnap = this.newSnap;
    if (this.newSnap) {
      if (N > P) need = true;
      else {
        const i = N & (HASH_RING - 1);
        const match = this.hashTick[i] === N && this.hashVal[i] === flatHash(this.dec.flat);
        need = !match || this.dirtyMax > N;
      }
    } else if (this.dirtyMin <= P) need = true;
    this.newSnap = false;
    this.corr.fill(0);
    if (need) this.resimulate(); else if (hadSnap) this.stats.resimSkipped++;
    this.dirtyMin = Infinity; this.dirtyMax = -Infinity;
    if (hadSnap || need) this.onRec?.(this.corr, need);
  }

  private resimulate(): void {
    const t0 = this.nowMs();
    const N = this.dec.world.tick, P0 = this.pred.tick;
    const target = Math.max(N, P0);
    this.capturePoses();
    copyWorld(this.pred, this.dec.world);
    if (target === N) copyWorld(this.prevW, this.dec.world);
    for (let T = N + 1; T <= target; T++) {
      if (T === target) copyWorld(this.prevW, this.pred);
      this.simulate(T, T === N + 1);
    }
    if (target === N) for (let s = 0; s < MAX_KARTS; s++) this.running[s]!.seek(s === this.slot ? this.own : this.remote[s]!, N);
    this.applyCorrections();
    const ms = this.nowMs() - t0;
    this.stats.resims++;
    this.stats.resimTicks += target - N;
    this.stats.lastResimMs = ms;
    if (ms > this.stats.maxResimMs) this.stats.maxResimMs = ms;
  }

  private capturePoses(): void {
    const a = this.alphaV, A = this.prevW.karts, B = this.pred.karts;
    for (let s = 0; s < MAX_KARTS; s++) {
      const pa = A[s]!.body, pb = B[s]!.body;
      this.oldPos[s * 4] = pa.px + (pb.px - pa.px) * a;
      this.oldPos[s * 4 + 1] = pa.py + (pb.py - pa.py) * a;
      this.oldPos[s * 4 + 2] = pa.pz + (pb.pz - pa.pz) * a;
      this.oldPos[s * 4 + 3] = Math.atan2(pb.fx, pb.fz);
    }
  }

  private applyCorrections(): void {
    const a = this.alphaV, A = this.prevW.karts, B = this.pred.karts;
    for (let s = 0; s < MAX_KARTS; s++) {
      if (!B[s]!.active) continue;
      const pa = A[s]!.body, pb = B[s]!.body;
      const dx = this.oldPos[s * 4]! - (pa.px + (pb.px - pa.px) * a);
      const dy = this.oldPos[s * 4 + 1]! - (pa.py + (pb.py - pa.py) * a);
      const dz = this.oldPos[s * 4 + 2]! - (pa.pz + (pb.pz - pa.pz) * a);
      const dyaw = this.oldPos[s * 4 + 3]! - Math.atan2(pb.fx, pb.fz);
      const m = Math.sqrt(dx * dx + dy * dy + dz * dz);
      this.corr[s] = m;
      if (m > 0) {
        this.smoother.add(s, dx, dy, dz, dyaw);
        if (s === this.slot) {
          this.stats.corrections++;
          this.stats.lastLocalCorrection = m;
          if (m > this.stats.maxLocalCorrection) this.stats.maxLocalCorrection = m;
        }
      }
    }
  }

  // ------------------------------------------------------------ stepping

  /** One new predicted tick: sample, send and simulate. */
  private advance(): void {
    const T = this.pred.tick + 1;
    const f = this.frame;
    if (this.inputProvider) this.inputProvider(this.pred, f);
    else { copyInput(f, this.pending); this.pending.edges = 0; }
    this.own.set(T, f);
    this.inMsg.firstTick = T;
    this.inMsg.ackEventSeq = this.lastSeq & 0xffff;
    copyInput(this.inMsg.frames[0]!, f);
    this.w.reset(); InputMsg.encode(this.w, this.inMsg); this.send(this.w.finish());
    copyWorld(this.prevW, this.pred);
    this.simulate(T, false);
  }

  /** Steps pred from T−1 to T with the best known inputs (`seek` re-derives the running inputs after a restore). */
  private simulate(T: Tick, seek: boolean): void {
    for (let s = 0; s < MAX_KARTS; s++) {
      const ring = s === this.slot ? this.own : this.remote[s]!;
      const run = this.running[s]!;
      let known: boolean;
      if (seek) { run.seek(ring, T); known = ring.has(T); } else known = run.advance(ring, T);
      copyInput(this.inputs[s]!, run.cur);
      if (s !== this.slot) {
        this.used[s]!.set(T, run.cur);
        this.usedKnown[s]![T & (NET.INPUT_RING - 1)] = known ? T : -1;
      }
    }
    step(this.pred, this.inputs, this.ctx);
    const list = this.sink.list;
    for (let i = 0; i < list.length; i++) { const e = list[i]!; if (this.dedupe.admit(e, T)) this.out.push(e); }
    list.length = 0;
    if ((T & 1) === 0) {
      flattenWorld(this.pred, this.flat);
      const i = T & (HASH_RING - 1);
      this.hashTick[i] = T; this.hashVal[i] = flatHash(this.flat);
    }
  }
}

export { C2S };
