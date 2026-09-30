// Game server core (ADR-008, 20-netcode-spec §4–§5, 13-modes-rules §6–§7), independent of the socket library:
// `accept()` takes any byte Transport (a ws socket in production, a loopback pair in tests) and `tick(G)` is called by
// the 60 Hz ticker. It owns sessions (hello/welcome/resume), Quick Match (20 s search → 15 s stage → AI fill), custom
// rooms (6-char codes, host controls, slots/bots/teams, 20 s track roulette, 10 s all-ready auto-start, host migration)
// and hands races to RaceHost.
import { CHARACTER_IDS, KART_BODY_IDS, type AiTier, type ContentTables, type ModeId, type TeamFormat, type TrackId } from '@cr/content';
import { AI_TIERS, SIM_VERSION, type RaceConfig, type SlotConfig } from '@cr/sim';
import {
  ByteReader, ByteWriter, C2S, FrameMux, LOBBY_JSON_MAX, LOBBY_PROTOCOL_VERSION, NET, PingMsg, PongMsg, ProtocolError, decodeLobby, encodeS2CLobby, u32Hex,
  defaultRoomSettings, type C2SLobby, type Loadout, type RaceResultWire, type RoomSettings, type RoomSlotView, type RoomView, type S2CLobby, type Transport,
} from '@cr/net';
import { randomSecret } from '@cr/room';
import { RaceHost } from '../race/host.ts';
import type { BakedTrack } from '@cr/sim';

/** Where rooms get baked tracks (the on-disk TrackStore in production, an in-memory map in tests). */
export interface TrackSource { list(): TrackId[]; has(id: string): id is TrackId; get(id: TrackId): BakedTrack }
import { cleanChat, cleanLoadout, cleanName, cleanSettings, mergeSettings, normalizeCode, randomCode } from './validate.ts';

export const SERVER_VERSION = 1;

export interface ServerClock {
  /** Monotonic ms. */
  nowMs(): number;
  /** Fractional global tick at a monotonic time. */
  serverTick(nowMs: number): number;
  /** Wall-clock ms (Date.now() scale) at a monotonic time, for deadlines shown to clients. */
  wallMs(nowMs: number): number;
  readonly epochWallMs: number;
}

export interface LobbyTimings { searchMs: number; stageMs: number; rouletteMs: number; autoStartMs: number; resultsMs: number; loadMaxMs: number; reconnectMs: number; lobbyGraceMs: number; helloMs: number }
export const DEFAULT_TIMINGS: LobbyTimings = {
  searchMs: 20_000, stageMs: 15_000, rouletteMs: 20_000, autoStartMs: 10_000, resultsMs: 12_000, loadMaxMs: 15_000,
  reconnectMs: NET.RECONNECT_MS, lobbyGraceMs: 20_000, helloMs: 10_000,
};

export interface GameServerOptions {
  tracks: TrackSource;
  content: ContentTables;
  clock: ServerClock;
  timings?: Partial<LobbyTimings>;
  maxSessions?: number;
  log?: (m: string) => void;
  /** Race intro length (ticks) for online races. */
  introTicks?: number;
  rand?: (n: number) => Uint8Array;
}

type Phase = 'search' | 'stage' | 'waiting' | 'countdown' | 'roulette' | 'loading' | 'racing' | 'results';

interface Slot { state: 'open' | 'closed' | 'human' | 'bot'; session: Session | null; ready: boolean; team: number; tier: AiTier; joinedAt: number }

export class Session {
  readonly id: string;
  readonly token: string;
  name: string;
  loadout: Loadout;
  transport: Transport | null = null;
  mux: FrameMux | null = null;
  connected = false;
  disconnectedAt = 0;
  room: LobbyRoom | null = null;
  msgTimes: number[] = [];
  lastChatMs = -Infinity;
  constructor(id: string, token: string, name: string, loadout: Loadout) { this.id = id; this.token = token; this.name = name; this.loadout = loadout; }
}

export class LobbyRoom {
  readonly kind: 'custom' | 'quick';
  readonly code: string;
  settings: RoomSettings;
  readonly slots: Slot[];
  host: Session | null = null;
  phase: Phase;
  /** Monotonic deadline of the current timed phase (0 = none). */
  deadline = 0;
  votes = new Map<string, TrackId>();
  trackId: TrackId | null = null;
  race: RaceHost | null = null;
  resultsUntil = 0;
  queueKey = '';
  constructor(kind: 'custom' | 'quick', code: string, settings: RoomSettings) {
    this.kind = kind; this.code = code; this.settings = settings;
    this.phase = kind === 'quick' ? 'search' : 'waiting';
    this.slots = Array.from({ length: 8 }, () => ({ state: 'open' as const, session: null, ready: false, team: 0, tier: settings.botTier, joinedAt: 0 }));
  }
  humans(): Session[] { return this.slots.flatMap((s) => (s.state === 'human' && s.session ? [s.session] : [])); }
  slotOf(s: Session): number { return this.slots.findIndex((x) => x.session === s); }
  occupied(): number { return this.slots.filter((s) => s.state === 'human' || s.state === 'bot').length; }
}

const BOT_NAMES = ['Spark', 'Token', 'Prompt', 'Context', 'Vector', 'Embed', 'Attention', 'Gradient', 'Logit', 'Seed', 'Tensor', 'Kernel'];

export class GameServer {
  private readonly o: GameServerOptions;
  private readonly t: LobbyTimings;
  private readonly clock: ServerClock;
  private readonly sessions = new Map<string, Session>();       // by public id
  private readonly byToken = new Map<string, Session>();
  private readonly pendingHello = new Map<Transport, { mux: FrameMux; until: number }>();
  private readonly rooms = new Map<string, LobbyRoom>();         // custom, by code
  private readonly quick = new Map<string, { pending: LobbyRoom | null; lastTracks: TrackId[] }>();
  private readonly active = new Set<LobbyRoom>();                // every room with timers or a race
  private readonly pw = new ByteWriter(32);
  private readonly pr = new ByteReader();
  private readonly log: (m: string) => void;
  private readonly rand: (n: number) => Uint8Array;
  private nextId = 1;
  /** Cost of the last tick() in ms, and of each race room tick in it. */
  lastTickMs = 0;

  constructor(o: GameServerOptions) {
    this.o = o;
    this.t = { ...DEFAULT_TIMINGS, ...o.timings };
    this.clock = o.clock;
    this.log = o.log ?? ((): void => { /* quiet */ });
    this.rand = o.rand ?? ((n) => { const a = new Uint8Array(n); globalThis.crypto.getRandomValues(a); return a; });
  }

  // ------------------------------------------------------------ connections

  accept(t: Transport): void {
    const mux = new FrameMux(t);
    this.pendingHello.set(t, { mux, until: this.clock.nowMs() + this.t.helloMs });
    mux.onOther = (b) => this.onFrame(t, mux, b);
    mux.onClose = () => this.onClose(t);
  }

  private sessionOf(t: Transport): Session | null {
    for (const s of this.sessions.values()) if (s.transport === t) return s;
    return null;
  }

  private onFrame(t: Transport, mux: FrameMux, b: Uint8Array): void {
    const type = b[0];
    if (type === C2S.PING) { this.pong(t, b); return; }
    if (type !== C2S.LOBBY_JSON) return; // race frames outside a race are ignored
    let msg: C2SLobby;
    try { msg = decodeLobby(b, LOBBY_JSON_MAX) as C2SLobby; } catch (e) {
      if (e instanceof ProtocolError) { this.sendTo(t, { t: 'error', code: 'badMessage' }); return; }
      throw e;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') { this.sendTo(t, { t: 'error', code: 'badMessage' }); return; }
    const s = this.sessionOf(t);
    if (!s) { if (msg.t === 'hello') this.hello(t, mux, msg); else this.sendTo(t, { t: 'error', code: 'badMessage' }); return; }
    if (!this.admit(s)) { this.send(s, { t: 'error', code: 'rateLimited' }); return; }
    try { this.dispatch(s, msg); } catch (e) { this.log(`dispatch ${msg.t}: ${String((e as Error)?.stack ?? e)}`); this.send(s, { t: 'error', code: 'internal' }); }
  }

  /** ≤ 20 lobby messages per second per session. */
  private admit(s: Session): boolean {
    const now = this.clock.nowMs();
    while (s.msgTimes.length && s.msgTimes[0]! <= now - 1000) s.msgTimes.shift();
    if (s.msgTimes.length >= 20) return false;
    s.msgTimes.push(now);
    return true;
  }

  private pong(t: Transport, b: Uint8Array): void {
    try {
      const p = PingMsg.decode(this.pr.reset(b));
      const g = this.clock.serverTick(this.clock.nowMs());
      this.pw.reset();
      PongMsg.encode(this.pw, { pingId: p.pingId, clientMsEcho: p.clientMs, serverTick: Math.floor(g), tickPhase: (g - Math.floor(g)) * 65536 });
      t.send(this.pw.finish());
    } catch (e) { if (!(e instanceof ProtocolError)) throw e; }
  }

  private onClose(t: Transport): void {
    this.pendingHello.delete(t);
    const s = this.sessionOf(t);
    if (!s) return;
    s.connected = false;
    s.transport = null;
    s.mux = null;
    s.disconnectedAt = this.clock.nowMs();
    const r = s.room;
    if (r?.race) r.race.detach(s.id, 'socket closed');
    if (r && (r.phase === 'search' || r.phase === 'stage')) this.leaveRoom(s); // queued players do not hold a slot
    else if (r) this.broadcastRoom(r);
    this.log(`session ${s.id} disconnected`);
  }

  private hello(t: Transport, mux: FrameMux, m: Extract<C2SLobby, { t: 'hello' }>): void {
    this.pendingHello.delete(t);
    if (m.v !== LOBBY_PROTOCOL_VERSION) { this.sendTo(t, { t: 'error', code: 'version' }); t.close(4002, 'version'); return; }
    let s: Session | undefined;
    if (typeof m.resume === 'string') {
      s = this.byToken.get(m.resume);
      if (!s) this.sendTo(t, { t: 'error', code: 'resumeExpired' });
    }
    if (s) {
      if (s.transport && s.transport !== t) { const old = s.transport; this.detachTransport(s); old.close(4003, 'replaced'); }
    } else {
      const name = cleanName(m.name);
      if (!name) { this.sendTo(t, { t: 'error', code: 'nameInvalid' }); return; }
      if (this.sessions.size >= (this.o.maxSessions ?? 5000)) { this.sendTo(t, { t: 'error', code: 'serverFull' }); t.close(4004, 'full'); return; }
      s = new Session(`s${(this.nextId++).toString(36)}${u32Hex(randomSecret()).slice(0, 6)}`, u32Hex(randomSecret()), name, cleanLoadout(m.loadout));
      this.sessions.set(s.id, s);
      this.byToken.set(s.token, s);
    }
    s.transport = t;
    s.mux = mux;
    s.connected = true;
    const now = this.clock.nowMs();
    this.send(s, { t: 'welcome', session: s.id, serverVersion: SERVER_VERSION, simVersion: SIM_VERSION, resume: s.token, serverMs: this.clock.wallMs(now), tickEpochMs: this.clock.epochWallMs });
    const r = s.room;
    if (r) {
      if (r.race && r.race.humans.has(s.id)) {
        this.sendRaceStart(r, s);
        r.race.attach(s.id, mux);
      }
      if (r.kind === 'custom') this.broadcastRoom(r); else this.sendQueue(r);
    }
  }

  private detachTransport(s: Session): void {
    s.room?.race?.detach(s.id, 'replaced');
    s.transport = null; s.mux = null; s.connected = false;
  }

  // ------------------------------------------------------------ messages

  private dispatch(s: Session, m: C2SLobby): void {
    const r = s.room;
    switch (m.t) {
      case 'hello': return; // already welcomed
      case 'quick': return this.joinQuick(s, m.mode, m.teams);
      case 'quickCancel': if (r?.kind === 'quick' && (r.phase === 'search' || r.phase === 'stage')) this.leaveRoom(s); return;
      case 'create': return this.createRoom(s, m.settings);
      case 'join': return this.joinRoom(s, m.code);
      case 'leave': if (r && r.phase !== 'racing' && r.phase !== 'loading') this.leaveRoom(s); else if (r) this.send(s, { t: 'error', code: 'inRace' }); return;
      case 'ready': {
        if (!r || r.kind !== 'custom' || (r.phase !== 'waiting' && r.phase !== 'countdown')) return;
        const i = r.slotOf(s); if (i < 0) return;
        r.slots[i]!.ready = m.ready === true;
        this.cancelCountdown(r);
        this.checkAutoStart(r);
        return this.broadcastRoom(r);
      }
      case 'loadout': {
        s.loadout = cleanLoadout(m.loadout);
        if (r && r.kind === 'custom') this.broadcastRoom(r);
        return;
      }
      case 'settings': {
        if (!r || r.kind !== 'custom') return;
        if (r.host !== s) return this.send(s, { t: 'error', code: 'notHost' });
        if (r.phase !== 'waiting' && r.phase !== 'countdown') return this.send(s, { t: 'error', code: 'inRace' });
        r.settings = mergeSettings(r.settings, m.settings, this.o.tracks.list());
        this.applyTeams(r);
        this.cancelCountdown(r);
        return this.broadcastRoom(r);
      }
      case 'slot': return this.slotAction(s, m.slot, m.action, m.tier);
      case 'team': {
        if (!r || r.kind !== 'custom') return;
        if (r.host !== s) return this.send(s, { t: 'error', code: 'notHost' });
        const slot = r.slots[m.slot | 0];
        const nTeams = r.settings.teams === 'duo' ? 4 : r.settings.teams === 'squad' ? 2 : 1;
        if (!slot || !Number.isInteger(m.team) || m.team < 0 || m.team >= nTeams) return;
        slot.team = m.team;
        return this.broadcastRoom(r);
      }
      case 'start': return this.hostStart(s);
      case 'vote': {
        if (!r || r.phase !== 'roulette' || !this.o.tracks.has(m.trackId)) return;
        r.votes.set(s.id, m.trackId);
        return this.broadcastRoulette(r);
      }
      case 'chat': {
        if (!r) return;
        const now = this.clock.nowMs();
        if (now - s.lastChatMs < 1000) return this.send(s, { t: 'error', code: 'rateLimited' });
        const text = cleanChat(m.text);
        if (!text) return;
        s.lastChatMs = now;
        for (const h of r.humans()) this.send(h, { t: 'chat', from: s.name, text });
        return;
      }
      case 'loaded': {
        const race = r?.race;
        if (!race || !race.humans.has(s.id)) return;
        if (m.trackHash !== race.cfg.trackHash) { this.send(s, { t: 'error', code: 'trackHashMismatch' }); return; }
        race.markLoaded(s.id);
        if (!race.final && race.allLoaded((id) => this.sessions.get(id)?.connected === true)) this.finalizeStart(r!);
        return;
      }
      default: this.send(s, { t: 'error', code: 'badMessage' });
    }
  }

  // ------------------------------------------------------------ custom rooms

  private newCode(): string {
    for (let i = 0; i < 100; i++) { const c = randomCode(this.rand); if (!this.rooms.has(c)) return c; }
    throw new Error('room code space exhausted');
  }

  private createRoom(s: Session, raw: unknown): void {
    if (s.room && (s.room.phase === 'racing' || s.room.phase === 'loading')) return this.send(s, { t: 'error', code: 'inRace' });
    if (s.room) this.leaveRoom(s);
    const r = new LobbyRoom('custom', this.newCode(), cleanSettings(raw, this.o.tracks.list()));
    this.rooms.set(r.code, r);
    this.active.add(r);
    this.seat(r, s, 0);
    r.host = s;
    this.applyTeams(r);
    this.broadcastRoom(r);
    this.log(`room ${r.code} created by ${s.id}`);
  }

  private joinRoom(s: Session, raw: unknown): void {
    const code = normalizeCode(raw);
    if (!code) return this.send(s, { t: 'error', code: 'badCode' });
    const r = this.rooms.get(code);
    if (!r) return this.send(s, { t: 'error', code: 'notFound' });
    if (s.room === r) return this.broadcastRoom(r);
    if (r.phase !== 'waiting' && r.phase !== 'countdown') return this.send(s, { t: 'error', code: 'inRace' });
    const humans = r.humans().length;
    const free = r.slots.findIndex((x) => x.state === 'open');
    if (free < 0 || humans >= r.settings.maxHumans) return this.send(s, { t: 'error', code: 'full' });
    if (s.room) this.leaveRoom(s);
    this.seat(r, s, free);
    this.applyTeams(r);
    this.cancelCountdown(r);
    this.broadcastRoom(r);
  }

  private seat(r: LobbyRoom, s: Session, i: number): void {
    const slot = r.slots[i]!;
    slot.state = 'human'; slot.session = s; slot.ready = false; slot.joinedAt = this.clock.nowMs();
    s.room = r;
  }

  private leaveRoom(s: Session): void {
    const r = s.room;
    if (!r) return;
    s.room = null;
    const i = r.slotOf(s);
    if (i >= 0) { const slot = r.slots[i]!; slot.state = 'open'; slot.session = null; slot.ready = false; }
    r.votes.delete(s.id);
    r.race?.detach(s.id, 'left');
    if (r.kind === 'quick') {
      if (r.humans().length === 0 && (r.phase === 'search' || r.phase === 'stage')) this.closeRoom(r);
      else this.sendQueueAll(r);
      return;
    }
    if (r.host === s) {
      // host migration: the human who has been in the room longest
      const next = r.slots.filter((x) => x.state === 'human' && x.session).sort((a, b) => a.joinedAt - b.joinedAt)[0];
      r.host = next?.session ?? null;
    }
    if (!r.humans().length && !r.race) { this.closeRoom(r); return; }
    this.cancelCountdown(r);
    this.broadcastRoom(r);
  }

  private closeRoom(r: LobbyRoom): void {
    if (r.kind === 'custom') this.rooms.delete(r.code);
    else { const q = this.quick.get(r.queueKey); if (q?.pending === r) q.pending = null; }
    r.race?.dispose();
    r.race = null;
    this.active.delete(r);
    for (const s of r.humans()) if (s.room === r) s.room = null;
  }

  private slotAction(s: Session, i: number, action: string, tier?: AiTier): void {
    const r = s.room;
    if (!r || r.kind !== 'custom') return;
    if (r.host !== s) return this.send(s, { t: 'error', code: 'notHost' });
    if (r.phase !== 'waiting' && r.phase !== 'countdown') return this.send(s, { t: 'error', code: 'inRace' });
    const slot = r.slots[i | 0];
    if (!slot) return;
    switch (action) {
      case 'open': if (slot.state !== 'human') { slot.state = 'open'; slot.session = null; } break;
      case 'close': if (slot.state !== 'human') { slot.state = 'closed'; slot.session = null; } break;
      case 'bot': if (slot.state !== 'human') { slot.state = 'bot'; slot.session = null; slot.tier = tier && tier in AI_TIERS ? tier : r.settings.botTier; slot.ready = true; } break;
      case 'kick': {
        const victim = slot.session;
        if (!victim || victim === s) return;
        this.leaveRoom(victim);
        this.send(victim, { t: 'error', code: 'kicked' });
        return;
      }
      default: return;
    }
    this.cancelCountdown(r);
    this.checkAutoStart(r);
    this.broadcastRoom(r);
  }

  private applyTeams(r: LobbyRoom): void {
    r.slots.forEach((slot, i) => { slot.team = r.settings.teams === 'squad' ? i % 2 : r.settings.teams === 'duo' ? i >> 1 : 0; });
  }

  private everyoneReady(r: LobbyRoom): boolean {
    return r.slots.every((x) => x.state !== 'human' || x.session === r.host || x.ready);
  }

  private checkAutoStart(r: LobbyRoom): void {
    if (r.kind !== 'custom' || r.phase !== 'waiting') return;
    if (r.occupied() === 8 && this.everyoneReady(r) && r.humans().length > 0) {
      r.phase = 'countdown';
      r.deadline = this.clock.nowMs() + this.t.autoStartMs;
    }
  }

  private cancelCountdown(r: LobbyRoom): void {
    if (r.phase === 'countdown' && !(r.occupied() === 8 && this.everyoneReady(r))) { r.phase = 'waiting'; r.deadline = 0; }
  }

  private hostStart(s: Session): void {
    const r = s.room;
    if (!r || r.kind !== 'custom') return;
    if (r.host !== s) return this.send(s, { t: 'error', code: 'notHost' });
    if (r.phase !== 'waiting' && r.phase !== 'countdown') return;
    if (!this.everyoneReady(r)) return this.send(s, { t: 'error', code: 'notReady' });
    this.beginStart(r);
  }

  /** Start pressed or auto-start: a 20 s roulette first when the host chose Track Roulette. */
  private beginStart(r: LobbyRoom): void {
    if (r.settings.track === 'roulette') {
      r.phase = 'roulette';
      r.votes.clear();
      r.deadline = this.clock.nowMs() + this.t.rouletteMs;
      this.broadcastRoom(r);
      this.broadcastRoulette(r);
      return;
    }
    r.trackId = this.o.tracks.has(r.settings.track) ? r.settings.track : this.randomTrack([]);
    this.enterLoading(r);
  }

  private randomTrack(exclude: readonly TrackId[]): TrackId {
    const all = this.o.tracks.list();
    const pool = all.filter((t) => !exclude.includes(t));
    const from = pool.length ? pool : all;
    if (!from.length) throw new Error('no baked tracks available');
    return from[this.rand(1)[0]! % from.length]!;
  }

  // ------------------------------------------------------------ quick match

  private joinQuick(s: Session, mode: ModeId, teams: TeamFormat): void {
    if (s.room && (s.room.phase === 'racing' || s.room.phase === 'loading')) return this.send(s, { t: 'error', code: 'inRace' });
    const m: ModeId = mode === 'item' ? 'item' : 'speed';
    const tf: TeamFormat = teams === 'duo' || teams === 'squad' ? teams : 'solo';
    if (s.room) this.leaveRoom(s);
    const key = `${m}:${tf}`;
    let q = this.quick.get(key);
    if (!q) { q = { pending: null, lastTracks: [] }; this.quick.set(key, q); }
    let r = q.pending;
    if (!r || r.phase !== 'search' || r.humans().length >= 8) {
      r = new LobbyRoom('quick', '', { ...defaultRoomSettings(), mode: m, teams: tf, track: 'roulette', fillBots: true, botTier: 'racer', isPrivate: false, maxHumans: 8 });
      r.queueKey = key;
      r.phase = 'search';
      r.deadline = this.clock.nowMs() + this.t.searchMs;
      q.pending = r;
      this.active.add(r);
    }
    this.seat(r, s, r.slots.findIndex((x) => x.state === 'open'));
    // Squad alternates red/blue by join order, Duo pairs by join order
    r.humans().forEach((h, i) => { r!.slots[r!.slotOf(h)]!.team = tf === 'squad' ? i % 2 : tf === 'duo' ? i >> 1 : 0; });
    if (r.humans().length >= 8) this.enterStage(r);
    this.sendQueueAll(r);
  }

  private enterStage(r: LobbyRoom): void {
    const q = this.quick.get(r.queueKey);
    r.phase = 'stage';
    r.deadline = this.clock.nowMs() + this.t.stageMs;
    r.trackId = this.randomTrack(q?.lastTracks ?? []);
    if (q) { q.lastTracks.push(r.trackId); if (q.lastTracks.length > 3) q.lastTracks.shift(); if (q.pending === r) q.pending = null; }
    this.sendQueueAll(r);
  }

  private sendQueue(r: LobbyRoom, s?: Session): void {
    if (r.phase !== 'search' && r.phase !== 'stage') return;
    const msg: S2CLobby = { t: 'queue', phase: r.phase, endsAt: this.clock.wallMs(r.deadline), humans: r.humans().length, ...(r.phase === 'stage' && r.trackId ? { trackId: r.trackId } : {}) };
    for (const h of s ? [s] : r.humans()) this.send(h, msg);
  }
  private sendQueueAll(r: LobbyRoom): void { this.sendQueue(r); }

  // ------------------------------------------------------------ races

  private enterLoading(r: LobbyRoom): void {
    const trackId = r.trackId!;
    const track = this.o.tracks.get(trackId);
    const humans = r.humans();
    if (!humans.length) { this.closeRoom(r); return; }
    const cfg = this.buildConfig(r, trackId, track.hash, track.laps);
    const G = Math.floor(this.clock.serverTick(this.clock.nowMs()));
    const host = new RaceHost({
      cfg, track, content: this.o.content, nowMs: () => this.clock.nowMs(), log: this.log,
      humans: humans.map((s) => ({ sessionId: s.id, slot: r.slotOf(s) })),
      loadDeadlineTick: G + Math.ceil(this.t.loadMaxMs / NET.TICK_MS),
    });
    r.race = host;
    r.phase = 'loading';
    r.deadline = 0;
    // raceStart first: the client opens its race channel on it, so the catch-up relay that attach() sends is kept
    for (const s of humans) { this.sendRaceStart(r, s); if (s.mux) host.attach(s.id, s.mux); }
    if (r.kind === 'custom') this.broadcastRoom(r);
    this.log(`race ${host.raceId} loading ${trackId} (${humans.length} humans) room ${r.code || r.queueKey}`);
  }

  private buildConfig(r: LobbyRoom, trackId: TrackId, trackHash: string, trackLaps: number): RaceConfig {
    const st = r.settings;
    const used = new Set<string>();
    for (const x of r.slots) if (x.state === 'human' && x.session) used.add(x.session.loadout.characterId);
    const free = CHARACTER_IDS.filter((c) => !used.has(c));
    const rb = this.rand(16);
    const fill = r.kind === 'quick' || st.fillBots;
    const slots: SlotConfig[] = r.slots.map((x, i): SlotConfig => {
      if (x.state === 'human' && x.session) {
        return { kind: 'human', team: x.team, name: x.session.name, characterId: x.session.loadout.characterId, kartBodyId: x.session.loadout.kartBodyId, vMul: 1 };
      }
      const bot = x.state === 'bot' || (x.state === 'open' && fill);
      const characterId = free[(rb[i]! + i) % free.length] ?? CHARACTER_IDS[i % CHARACTER_IDS.length]!;
      const kartBodyId = KART_BODY_IDS[(rb[i + 8]! + i) % KART_BODY_IDS.length]!;
      if (!bot) return { kind: 'empty', team: x.team, name: '', characterId, kartBodyId, vMul: 1 };
      const tier = x.state === 'bot' ? x.tier : st.botTier;
      return { kind: 'bot', team: x.team, name: `${BOT_NAMES[(rb[i]! + i) % BOT_NAMES.length]}-${10 + (rb[i + 8]! % 90)}`, characterId, kartBodyId, ai: tier, vMul: AI_TIERS[tier].vMul };
    });
    const seedB = this.rand(4);
    return {
      simVersion: SIM_VERSION, mode: st.mode, teams: st.teams, trackId, trackHash, laps: st.laps === 'default' ? trackLaps : st.laps, slots,
      seed: ((seedB[0]! | (seedB[1]! << 8) | (seedB[2]! << 16) | (seedB[3]! << 24)) >>> 0),
      rules: {
        retireTicks: (st.retireSec ?? 10) * 60, friendlyFire: st.friendlyFire ?? 'area', itemSet: st.itemSet ?? 'standard',
        rubberBand: st.rubberBand ?? true, instantBoostInItem: st.instantBoostInItem ?? true,
      },
      introTicks: this.o.introTicks ?? 150, countdownTicks: 180,
    };
  }

  private sendRaceStart(r: LobbyRoom, s: Session): void {
    const race = r.race;
    const h = race?.humans.get(s.id);
    if (!race || !h) return;
    const G = Math.floor(this.clock.serverTick(this.clock.nowMs()));
    this.send(s, { t: 'raceStart', config: race.cfg, startTick: race.startTick, serverTick: G, yourSlot: h.slot, raceId: race.raceId, resumeToken: h.token, provisional: !race.final });
  }

  private finalizeStart(r: LobbyRoom): void {
    const race = r.race!;
    const G = Math.floor(this.clock.serverTick(this.clock.nowMs()));
    race.finalize(G + 60);
    r.phase = 'racing';
    for (const s of r.humans()) this.sendRaceStart(r, s);
    if (r.kind === 'custom') this.broadcastRoom(r);
    this.log(`race ${race.raceId} starts at tick ${race.startTick}`);
  }

  private endRace(r: LobbyRoom): void {
    const race = r.race!;
    const res = race.result!;
    const result: RaceResultWire = { ...res };
    for (const s of r.humans()) this.send(s, { t: 'raceEnd', result });
    r.phase = 'results';
    r.resultsUntil = this.clock.nowMs() + this.t.resultsMs;
    if (r.kind === 'custom') this.broadcastRoom(r);
    this.log(`race ${race.raceId} ended`);
  }

  // ------------------------------------------------------------ tick

  /** One server tick at global tick G: race rooms advance, lobby timers fire, stale sessions expire. */
  tick(G: number): void {
    const now = this.clock.nowMs();
    for (const r of [...this.active]) {
      try { this.tickRoom(r, G, now); } catch (e) {
        // isolate a failing room: its players get an error and the room is closed; every other room keeps running
        this.log(`room ${r.code || r.queueKey} failed: ${String((e as Error)?.stack ?? e)}`);
        for (const s of r.humans()) this.send(s, { t: 'error', code: 'internal' });
        this.closeRoom(r);
      }
    }
    if (G % 60 === 0) this.housekeeping(now);
  }

  private tickRoom(r: LobbyRoom, G: number, now: number): void {
    {
      const race = r.race;
      if (race) {
        race.tick(G, () => this.clock.nowMs());
        if (r.phase === 'loading' && race.final) { r.phase = 'racing'; for (const s of r.humans()) this.sendRaceStart(r, s); if (r.kind === 'custom') this.broadcastRoom(r); }
        if (race.result && r.phase === 'racing') this.endRace(r);
        // keep the room ticking ~2 s after the end so the final snapshots reach everyone, then release it
        if (race.result && race.endedAtTick >= 0 && G - race.endedAtTick > 120) { race.dispose(); r.race = null; }
      }
      if (r.phase === 'results' && now >= r.resultsUntil) this.afterResults(r);
      if (r.deadline && now >= r.deadline) this.onDeadline(r);
    }
  }

  private onDeadline(r: LobbyRoom): void {
    r.deadline = 0;
    switch (r.phase) {
      case 'search': this.enterStage(r); break;
      case 'stage': this.enterLoading(r); break;
      case 'countdown': this.beginStart(r); break;
      case 'roulette': {
        // everyone nominates; one nomination is drawn (no votes → any track)
        const noms = [...r.votes.values()];
        r.trackId = noms.length ? noms[this.rand(1)[0]! % noms.length]! : this.randomTrack([]);
        this.enterLoading(r);
        break;
      }
      default: break;
    }
  }

  private afterResults(r: LobbyRoom): void {
    r.race?.dispose();
    r.race = null;
    if (r.kind === 'quick') { this.closeRoom(r); return; }
    r.phase = 'waiting';
    r.trackId = null;
    for (const x of r.slots) if (x.state === 'human') x.ready = false;
    // players who never came back are removed from the room now
    for (const s of r.humans()) if (!s.connected) this.leaveRoom(s);
    if (this.rooms.has(r.code)) this.broadcastRoom(r);
  }

  private housekeeping(now: number): void {
    for (const [t, p] of this.pendingHello) if (now > p.until) { this.pendingHello.delete(t); t.close(4005, 'hello timeout'); }
    for (const s of [...this.sessions.values()]) {
      if (s.connected) continue;
      const away = now - s.disconnectedAt;
      const r = s.room;
      const inRace = r?.race?.humans.has(s.id) === true;
      if (r && !inRace && r.kind === 'custom' && r.phase === 'waiting' && away > this.t.lobbyGraceMs) this.leaveRoom(s);
      if (away > this.t.reconnectMs && !inRace) {
        if (s.room) this.leaveRoom(s);
        this.sessions.delete(s.id);
        this.byToken.delete(s.token);
      }
    }
  }

  // ------------------------------------------------------------ views

  private view(r: LobbyRoom, me: Session): RoomView {
    const slots: RoomSlotView[] = r.slots.map((x, i) => {
      const v: RoomSlotView = { slot: i, state: x.state, team: x.team };
      if (x.state === 'human' && x.session) {
        v.name = x.session.name; v.loadout = x.session.loadout; v.ready = x.ready || x.session === r.host;
        if (x.session === r.host) v.host = true;
        if (x.session === me) v.you = true;
      } else if (x.state === 'bot') { v.tier = x.tier; v.ready = true; }
      return v;
    });
    const phase: RoomView['phase'] = r.phase === 'search' || r.phase === 'stage' ? 'waiting' : r.phase;
    const endsAt = r.phase === 'results' ? r.resultsUntil : r.deadline;
    return {
      code: r.code, settings: r.settings, slots, phase, hostSession: r.host?.id ?? '', kind: r.kind,
      ...(endsAt ? { endsAt: this.clock.wallMs(endsAt) } : {}),
      ...(r.trackId ? { trackId: r.trackId } : {}),
    };
  }

  private broadcastRoom(r: LobbyRoom): void { for (const s of r.humans()) if (s.connected) this.send(s, { t: 'room', room: this.view(r, s) }); }

  private broadcastRoulette(r: LobbyRoom): void {
    const votes: Partial<Record<TrackId, number>> = {};
    for (const v of r.votes.values()) votes[v] = (votes[v] ?? 0) + 1;
    for (const s of r.humans()) this.send(s, { t: 'roulette', endsAt: this.clock.wallMs(r.deadline), votes });
  }

  private send(s: Session, m: S2CLobby): void { if (s.transport && s.connected) s.transport.send(encodeS2CLobby(m)); }
  private sendTo(t: Transport, m: S2CLobby): void { t.send(encodeS2CLobby(m)); }

  // ------------------------------------------------------------ introspection

  stats(): { sessions: number; connected: number; rooms: number; races: number; quickQueues: number } {
    let races = 0;
    for (const r of this.active) if (r.race) races++;
    return { sessions: this.sessions.size, connected: [...this.sessions.values()].filter((s) => s.connected).length, rooms: this.rooms.size, races, quickQueues: this.quick.size };
  }

  /** Test/diagnostic access. */
  roomByCode(code: string): LobbyRoom | undefined { return this.rooms.get(code); }
  sessionById(id: string): Session | undefined { return this.sessions.get(id); }
  activeRooms(): LobbyRoom[] { return [...this.active]; }
}
