// The client's single game socket (ADR-007: one WebSocket, binary frames): lobby JSON both ways, PING/PONG clock sync
// shared with the race, and a race channel for the NetClient. Drops reconnect with backoff and resume the session
// (`hello.resume`) for up to 60 s. A server of another protocol or simulation version is refused for good: retrying
// cannot help, only a reload (with the new client) can; `versionMismatch` tells the store to say so.
import {
  ByteReader, ByteWriter, C2S, ClockSync, FrameMux, LOBBY_PROTOCOL_VERSION, NET, PingMsg, PongMsg, S2C, decodeLobby, encodeC2SLobby,
  type C2SLobby, type Channel, type Loadout, type PongT, type S2CLobby, type Transport,
} from '@cr/net';
import { SIM_VERSION } from '@cr/sim';
import { wsTransport } from './transports.ts';

const RESUME_KEY = 'cr.net.resume';

export type ConnEvent = 'open' | 'reconnecting' | 'reconnected' | 'closed';

export class LobbyConnection {
  readonly clock = new ClockSync();
  transport: Transport | null = null;
  mux: FrameMux | null = null;
  /** Called for every server lobby message. */
  onLobby: ((m: S2CLobby) => void) | null = null;
  onEvent: ((e: ConnEvent) => void) | null = null;
  /** Fast pings (250 ms) while a race is loading. */
  loading = false;
  tickEpochMs = 0;
  /**
   * The server refused our protocol version (`error: version`) or welcomed us with another simulation version (the
   * snapshot layout would not decode). Set until the next connect(); no reconnects are attempted meanwhile.
   */
  versionMismatch = false;
  private url = '';
  private name = '';
  private loadout: Loadout | null = null;
  private wanted = false;
  private welcomed = false;
  private attempt = 0;
  private dropAt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pw = new ByteWriter(16);
  private readonly pr = new ByteReader();
  private readonly pong: PongT = { pingId: 0, clientMsEcho: 0, serverTick: 0, tickPhase: 0 };
  private waiters: { ok: () => void; fail: (e: Error) => void }[] = [];

  get connected(): boolean { return this.welcomed && this.transport !== null; }

  /** Opens the socket and resolves on `welcome` (rejects on error or after 8 s). */
  connect(url: string, name: string, loadout: Loadout): Promise<void> {
    this.url = url; this.name = name; this.loadout = loadout; this.wanted = true; this.attempt = 0; this.versionMismatch = false;
    if (this.connected) { this.send({ t: 'loadout', loadout }); return Promise.resolve(); }
    const p = new Promise<void>((ok, fail) => this.waiters.push({ ok, fail }));
    this.open();
    return p;
  }

  send(m: C2SLobby): boolean {
    if (!this.transport) return false;
    this.transport.send(encodeC2SLobby(m));
    return true;
  }

  /** A fresh race channel (snapshots, events, relays) on the current socket; null while disconnected. */
  raceChannel(): Channel | null {
    return this.mux ? this.mux.channel((t) => t === S2C.SNAPSHOT || t === S2C.EVENTS || t === S2C.INPUT_RELAY) : null;
  }

  /** Server wall clock minus Date.now() (for lobby countdowns). */
  clockOffsetMs(): number {
    if (!this.clock.ready || !this.tickEpochMs) return 0;
    return this.clock.serverMs(performance.now(), this.tickEpochMs) - Date.now();
  }

  /** Drops the socket and reconnects (resuming the session) — used when the race stream stalls. */
  forceReconnect(): void { if (this.transport && this.wanted) this.transport.close(4006, 'stalled'); }

  close(): void {
    this.wanted = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.stopPings();
    this.transport?.close(1000, 'bye');
  }

  private open(): void {
    let ws: WebSocket;
    try { ws = new WebSocket(this.url); } catch (e) { this.failAll(e as Error); return; }
    const t = wsTransport(ws);
    const mux = new FrameMux(t);
    this.welcomed = false;
    const timeout = setTimeout(() => { if (!this.welcomed) { t.close(4000, 'timeout'); } }, 8000);
    ws.addEventListener('open', () => {
      this.transport = t; this.mux = mux;
      let resume: string | null = null;
      try { resume = sessionStorage.getItem(RESUME_KEY); } catch { /* storage off */ }
      t.send(encodeC2SLobby({ t: 'hello', v: LOBBY_PROTOCOL_VERSION, name: this.name, loadout: this.loadout!, ...(resume ? { resume } : {}) }));
    });
    mux.onOther = (b) => {
      if (b[0] === S2C.PONG) { PongMsg.decode(this.pr.reset(b), this.pong); this.clock.onPong(this.pong, performance.now()); return; }
      if (b[0] !== S2C.LOBBY_JSON) return;
      let m: S2CLobby;
      try { m = decodeLobby(b) as S2CLobby; } catch { return; }
      // version refusals (the server's, or ours on a welcome from another simulation version) end in onClose below,
      // which reports them once; the store is not told about the welcome, so nothing is sent on this socket
      if (m.t === 'error' && m.code === 'version' && !this.welcomed) { this.refuseVersion(t, timeout); return; }
      if (m.t === 'welcome' && m.simVersion !== SIM_VERSION) { this.refuseVersion(t, timeout); return; }
      if (m.t === 'welcome') this.onWelcome(m, timeout);
      this.onLobby?.(m);
    };
    mux.onClose = () => {
      clearTimeout(timeout);
      const was = this.transport === t;
      if (was) { this.transport = null; this.mux = null; }
      this.stopPings();
      if (this.versionMismatch) { this.welcomed = false; this.failAll(new Error('version')); this.onEvent?.('closed'); return; }
      if (!this.welcomed && this.attempt === 0 && !this.dropAt) { this.failAll(new Error('connection failed')); this.onEvent?.('closed'); return; }
      this.welcomed = false;
      if (this.wanted) this.scheduleRetry(); else this.onEvent?.('closed');
    };
  }

  private onWelcome(m: Extract<S2CLobby, { t: 'welcome' }>, timeout: ReturnType<typeof setTimeout>): void {
    clearTimeout(timeout);
    const reconnected = this.dropAt > 0;
    this.welcomed = true;
    this.attempt = 0; this.dropAt = 0;
    if (m.resume) { try { sessionStorage.setItem(RESUME_KEY, m.resume); } catch { /* storage off */ } }
    if (m.tickEpochMs) this.tickEpochMs = m.tickEpochMs;
    this.startPings();
    const ws = this.waiters.splice(0);
    for (const w of ws) w.ok();
    this.onEvent?.(reconnected ? 'reconnected' : 'open');
  }

  private refuseVersion(t: Transport, timeout: ReturnType<typeof setTimeout>): void {
    clearTimeout(timeout);
    this.versionMismatch = true;
    this.wanted = false;
    t.close(4002, 'version');
  }

  private scheduleRetry(): void {
    if (!this.dropAt) this.dropAt = performance.now();
    if (performance.now() - this.dropAt > NET.RECONNECT_MS) { this.wanted = false; this.onEvent?.('closed'); return; }
    this.onEvent?.('reconnecting');
    const delay = Math.min(4000, 250 * 2 ** this.attempt++);
    this.retryTimer = setTimeout(() => this.open(), delay);
  }

  private startPings(): void {
    this.stopPings();
    const tick = (): void => {
      if (!this.transport) return;
      const now = performance.now();
      if (!this.clock.due(now, this.loading)) return;
      const p = this.clock.ping(now);
      this.pw.reset(); PingMsg.encode(this.pw, p);
      this.transport.send(this.pw.finish());
    };
    tick();
    this.pingTimer = setInterval(tick, 125);
  }

  private stopPings(): void { if (this.pingTimer) clearInterval(this.pingTimer); this.pingTimer = null; }

  private failAll(e: Error): void { const ws = this.waiters.splice(0); for (const w of ws) w.fail(e); }
}

export { C2S };
