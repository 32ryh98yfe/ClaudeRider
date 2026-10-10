// Version refusals on the lobby socket (M5): an M4 client used to pass the handshake and then freeze in every race,
// because the snapshot layout changed with SIM_VERSION 2. The client now sends LOBBY_PROTOCOL_VERSION in hello,
// refuses a welcome from another simulation version, never retries either refusal, and the store shows
// errors.version_mismatch ("reload") instead of "offline".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOBBY_PROTOCOL_VERSION, decodeLobby, encodeS2CLobby, type C2SLobby, type Loadout, type S2CLobby } from '@cr/net';
import { SIM_VERSION } from '@cr/sim';

type Listener = (e: unknown) => void;

/** A WebSocket stand-in: the test plays the server through accept / receive / serverClose. */
class FakeWS {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static all: FakeWS[] = [];
  readyState = 0;
  binaryType = 'blob';
  bufferedAmount = 0;
  readonly sent: Uint8Array[] = [];
  closedWith: [number, string] | null = null;
  readonly url: string;
  private readonly ls = new Map<string, Listener[]>();
  constructor(url: string) { this.url = url; FakeWS.all.push(this); }
  addEventListener(type: string, f: Listener): void { this.ls.set(type, [...(this.ls.get(type) ?? []), f]); }
  send(b: Uint8Array): void { this.sent.push(b.slice()); }
  close(code = 1000, reason = ''): void {
    if (this.readyState >= FakeWS.CLOSING) return;
    this.readyState = FakeWS.CLOSED;
    this.closedWith = [code, reason];
    queueMicrotask(() => this.emit('close', { code, reason }));
  }
  accept(): void { this.readyState = FakeWS.OPEN; this.emit('open', {}); }
  receive(m: S2CLobby): void { const b = encodeS2CLobby(m); this.emit('message', { data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }); }
  serverClose(code: number, reason: string): void { this.close(code, reason); }
  hello(): Extract<C2SLobby, { t: 'hello' }> { return decodeLobby(this.sent[0]!) as Extract<C2SLobby, { t: 'hello' }>; }
  private emit(type: string, e: unknown): void { for (const f of this.ls.get(type) ?? []) f(e); }
}

const LOADOUT: Loadout = { characterId: 'clay', kartBodyId: 'pebble', livery: { primary: '#d97757', secondary: '#faf9f5', pattern: 0, number: 7 } };
const welcome = (simVersion: number): S2CLobby => ({ t: 'welcome', session: 's1', serverVersion: 1, simVersion, resume: '0'.repeat(32) });
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

beforeEach(() => {
  FakeWS.all = [];
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.stubGlobal('WebSocket', FakeWS);
  vi.stubGlobal('window', {});
  vi.stubGlobal('location', { search: '', hostname: '127.0.0.1', protocol: 'http:', host: '127.0.0.1:5173' });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('lobby socket version refusals', () => {
  it('hello carries LOBBY_PROTOCOL_VERSION (3 for ordered v10 input); a matching welcome connects', async () => {
    const { LobbyConnection } = await import('../src/net/connection.ts');
    const c = new LobbyConnection();
    const p = c.connect('ws://x/ws', 'Me', LOADOUT);
    const ws = FakeWS.all.at(-1)!;
    ws.accept();
    expect(LOBBY_PROTOCOL_VERSION).toBe(3);
    expect(ws.hello().v).toBe(LOBBY_PROTOCOL_VERSION);
    ws.receive(welcome(SIM_VERSION));
    await expect(p).resolves.toBeUndefined();
    expect(c.connected).toBe(true);
    expect(c.versionMismatch).toBe(false);
    c.close();
  });

  it('a welcome from another simulation version is refused: closed 4002, connect() rejects, no reconnect', async () => {
    const { LobbyConnection } = await import('../src/net/connection.ts');
    const c = new LobbyConnection();
    const events: string[] = [], msgs: S2CLobby[] = [];
    c.onEvent = (e) => events.push(e); c.onLobby = (m) => msgs.push(m);
    const p = c.connect('ws://x/ws', 'Me', LOADOUT);
    const ws = FakeWS.all.at(-1)!;
    ws.accept();
    ws.receive(welcome(SIM_VERSION - 1));
    await expect(p).rejects.toThrow('version');
    expect(ws.closedWith).toEqual([4002, 'version']);
    expect(c.versionMismatch).toBe(true);
    expect(c.connected).toBe(false);
    expect(msgs).toEqual([]); // the store never sees that welcome
    expect(events).toEqual(['closed']);
    vi.advanceTimersByTime(20_000);
    expect(FakeWS.all.length).toBe(1);
  });

  it('the server refusing the protocol version (error: version, close 4002) is final too', async () => {
    const { LobbyConnection } = await import('../src/net/connection.ts');
    const c = new LobbyConnection();
    const events: string[] = [];
    c.onEvent = (e) => events.push(e);
    const p = c.connect('ws://x/ws', 'Me', LOADOUT);
    const ws = FakeWS.all.at(-1)!;
    ws.accept();
    ws.receive({ t: 'error', code: 'version' });
    ws.serverClose(4002, 'version');
    await expect(p).rejects.toThrow('version');
    expect(c.versionMismatch).toBe(true);
    expect(events).toEqual(['closed']);
    vi.advanceTimersByTime(20_000);
    expect(FakeWS.all.length).toBe(1);
  });

  it('a reconnect that meets a newer server stops retrying and reports the mismatch', async () => {
    const { LobbyConnection } = await import('../src/net/connection.ts');
    const c = new LobbyConnection();
    const events: string[] = [];
    c.onEvent = (e) => events.push(e);
    const p = c.connect('ws://x/ws', 'Me', LOADOUT);
    FakeWS.all[0]!.accept();
    FakeWS.all[0]!.receive(welcome(SIM_VERSION));
    await p;
    FakeWS.all[0]!.serverClose(1006, 'drop'); // the server restarts with a new build
    await flush();
    vi.advanceTimersByTime(300);
    expect(FakeWS.all.length).toBe(2);
    FakeWS.all[1]!.accept();
    FakeWS.all[1]!.receive(welcome(SIM_VERSION + 1));
    await flush();
    expect(c.versionMismatch).toBe(true);
    expect(events).toEqual(['open', 'reconnecting', 'closed']);
    vi.advanceTimersByTime(60_000);
    expect(FakeWS.all.length).toBe(2);
  });

  it('the lobby store shows errors.version_mismatch (ko/en: reload) instead of offline', async () => {
    const store = await import('../src/net/lobby.ts');
    await import('../src/net/online.ts'); // installs the live connect() (read through the module: it is reassigned)
    const { errorKey } = await import('../src/ui/screens/room/errors.ts');
    const { t, locale } = await import('../src/i18n/index.ts');
    const lobby = store.lobby;
    const p = store.connect('Me', LOADOUT);
    const ws = FakeWS.all.at(-1)!;
    ws.accept();
    ws.receive(welcome(SIM_VERSION - 1));
    await expect(p).rejects.toThrow('version');
    expect(lobby.error.value).toBe('version');
    expect(lobby.conn.value).toBe('offline');
    expect(errorKey('version')).toBe('errors.version_mismatch');
    const was = locale.value;
    locale.value = 'en'; expect(t('errors.version_mismatch')).toMatch(/reload/i);
    locale.value = 'ko'; expect(t('errors.version_mismatch')).toContain('새로고침');
    locale.value = was;
  });
});
