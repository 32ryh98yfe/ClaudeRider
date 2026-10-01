// M4 security review regressions (docs/design/reviews/M4-server-security.md): per-IP and global caps, sockets that
// never read, frame floods, lobby state abuse and input filters, on the fake clock with scripted clients.
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { loadContent } from '@cr/content';
import { startGameServer } from '../src/game/run.ts';
import { ByteWriter, PingMsg, encodeC2SLobby, type RoomSettings, type Transport } from '@cr/net';
import { wsTransport } from '../src/net/wsTransport.ts';
import { addressKey } from '../src/net/address.ts';
import { cleanChat, cleanName } from '../src/lobby/validate.ts';
import { LOADOUT, World, type TestClient } from './fixture.ts';

const SETTINGS: RoomSettings = { mode: 'speed', teams: 'solo', track: 'proving_ring', laps: 1, fillBots: true, botTier: 'rookie', isPrivate: true, maxHumans: 8 };
const ping = (id: number): Uint8Array => { const w = new ByteWriter(16); PingMsg.encode(w, { pingId: id, clientMs: id }); return w.finish().slice(); };

/** A socket that never reads: everything sent to it stays queued, so its bufferedAmount only grows. */
function deafSocket(): Transport & { queued: number; sends: number; closedWith: string | null } {
  return {
    id: 'deaf', onMessage: null, onClose: null, queued: 0, sends: 0, closedWith: null,
    send(b: Uint8Array) { this.queued += b.length; this.sends++; },
    close(_code?: number, reason = 'closed') { this.closedWith = reason; },
    bufferedAmount() { return this.queued; },
  };
}

describe('connections', () => {
  it('per-address caps: 8 sockets and 16 sessions per address by default; other addresses are unaffected (item 3)', () => {
    const w = new World();
    const a = Array.from({ length: 8 }, (_, i) => w.client(`A${i}`, '10.0.0.1').hello());
    expect(a.every((c) => c.last('welcome') && !c.closed)).toBe(true);
    const ninth = w.client('A8', '10.0.0.1');
    w.flush();
    expect(ninth.closed).toBe('too many connections');
    expect(ninth.errors()).toEqual(['serverFull']);
    expect(w.client('B', '10.0.0.2').hello().last('welcome')).toBeDefined();
    // a closed socket frees its slot
    a[0]!.drop();
    expect(w.client('A9', '10.0.0.1').hello().last('welcome')).toBeDefined();
    // hello → disconnect loops (the review's 5000-session lockout) stop at the per-address session cap
    const w2 = new World();
    const welcomed: boolean[] = [];
    for (let i = 0; i < 20; i++) { const c = w2.client(`L${i}`, '10.0.0.3').hello(); welcomed.push(!!c.last('welcome')); c.drop(); }
    expect(welcomed.filter(Boolean)).toHaveLength(16);
    expect(w2.client('Other', '10.0.0.4').hello().last('welcome')).toBeDefined();
    // sessions that never joined a room expire ~10 s after their socket closed, freeing the address again
    w2.advance(12_000);
    expect(w2.server.stats().sessions).toBe(1);
    expect(w2.client('Back', '10.0.0.3').hello().last('welcome')).toBeDefined();
  });

  it('the ws heartbeat terminates a peer that stops answering pings; a live peer stays (item 3)', async () => {
    const game = startGameServer({ content: loadContent(), tracksDirs: [], heartbeatMs: 40 });
    const http = createServer();
    const wss = new WebSocketServer({ server: http });
    wss.on('connection', (ws, req) => game.accept(ws, req.socket.remoteAddress));
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
    const url = `ws://127.0.0.1:${(http.address() as AddressInfo).port}`;
    const connect = (autoPong: boolean): Promise<{ ws: WebSocket; closed: Promise<number> }> => new Promise((ok) => {
      const ws = new WebSocket(url, { autoPong });
      const closed = new Promise<number>((r) => ws.on('close', (code) => r(code)));
      ws.on('open', () => ok({ ws, closed }));
    });
    try {
      const deaf = await connect(false);
      const live = await connect(true);
      const code = await Promise.race([deaf.closed, new Promise<number>((r) => setTimeout(() => r(-1), 2000))]);
      expect(code).toBe(1006); // terminated, no close handshake
      expect(live.ws.readyState).toBe(WebSocket.OPEN);
      live.ws.close();
    } finally {
      game.stop(); wss.close(); http.close();
    }
  });

  it('a session in a room keeps its resume window; address keys group IPv6 by /64', () => {
    const w = new World();
    const h = w.client('Host', '10.0.0.5').hello();
    h.send({ t: 'create', settings: SETTINGS });
    h.drop();
    w.advance(12_000);
    h.reconnect();
    expect(h.errors()).not.toContain('resumeExpired');
    expect(h.last('room')).toBeDefined();
    expect(addressKey('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(addressKey('203.0.113.9')).toBe('203.0.113.9');
    expect(addressKey('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(addressKey('2001:db8:1:2:ffff:0:0:9')).toBe('2001:db8:1:2::/64');
    expect(addressKey('::1')).toBe('0:0:0:0::/64');
    expect(addressKey(undefined)).toBe('unknown');
  });

  it('a socket whose hello is refused (bad name) is still closed by the hello timeout (item 6)', () => {
    const w = new World();
    const c = w.client('');
    c.hello();
    expect(c.errors()).toContain('nameInvalid');
    expect(c.closed).toBeNull();
    w.advance(11_000);
    expect(c.closed).toBe('hello timeout');
    // a good hello on time is never timed out
    const ok = w.client('Fine').hello();
    w.advance(11_000);
    expect(ok.closed).toBeNull();
    expect(ok.last('welcome')).toBeDefined();
  });
});

describe('floods and sockets that never read (item 2)', () => {
  it('a PING flood from a socket that never reads is closed once its unsent bytes pass the limit', () => {
    const w = new World({}, { maxBufferedBytes: 4096 });
    const t = deafSocket();
    w.server.accept(t);
    t.onMessage!(encodeC2SLobby({ t: 'hello', v: 1, name: 'Deaf', loadout: LOADOUT }));
    expect(w.server.stats().sessions).toBe(1);
    let id = 0;
    for (let i = 0; i < 60 * 60 && !t.closedWith; i++) { for (let k = 0; k < 20; k++) t.onMessage!(ping(id++)); w.advance(1000 / 60); }
    expect(t.closedWith).toBe('not reading');
    expect(t.queued).toBeLessThan(4096 + 64);
    const sends = t.sends;
    for (let k = 0; k < 100; k++) t.onMessage?.(ping(id++));
    w.advance(1000);
    expect(t.sends).toBe(sends); // nothing more is queued for it
    expect(w.server.stats().connected).toBe(0);
  });

  it('frames past the token bucket are dropped before any work, with one rateLimited per second', () => {
    const w = new World();
    const c = w.client('Flood').hello();
    for (let i = 0; i < 1000; i++) c.transport.send(ping(i));
    for (let i = 0; i < 1000; i++) c.transport.send(encodeC2SLobby({ t: 'ready', ready: true }));
    w.flush();
    expect(c.pongs).toBeLessThanOrEqual(60);
    expect(c.errors().filter((e) => e === 'rateLimited')).toHaveLength(1);
    // the bucket refills: a well-behaved client a few seconds later is served again
    w.advance(3000);
    const before = c.pongs;
    c.transport.send(ping(5000)); w.flush();
    expect(c.pongs).toBe(before + 1);
    expect(c.closed).toBeNull();
  });

  it('wsTransport terminates a ws whose bufferedAmount passes 1 MiB instead of queueing more', () => {
    const ws = Object.assign(new EventEmitter(), {
      OPEN: 1, CLOSING: 2, CLOSED: 3, readyState: 1, bufferedAmount: 0, binaryType: '', terminated: 0, closedGracefully: 0,
      send(b: Uint8Array) { this.bufferedAmount += b.length; },
      terminate() { this.terminated++; this.readyState = 3; },
      close() { this.closedGracefully++; },
    });
    const t = wsTransport(ws as unknown as WebSocket);
    const chunk = new Uint8Array(64 * 1024);
    for (let i = 0; i < 40 && !ws.terminated; i++) t.send(chunk);
    expect(ws.terminated).toBe(1);
    expect(ws.bufferedAmount).toBeLessThanOrEqual((1 << 20) + chunk.length);
    t.send(chunk);
    expect(ws.bufferedAmount).toBeLessThanOrEqual((1 << 20) + chunk.length);
    // a close while the backlog is over the limit terminates too (a close frame would never flush)
    const ws2 = Object.assign(new EventEmitter(), { ...ws, readyState: 1, bufferedAmount: 2 << 20, terminated: 0, closedGracefully: 0 });
    wsTransport(ws2 as unknown as WebSocket).close(4008, 'not reading');
    expect(ws2.terminated).toBe(1);
    expect(ws2.closedGracefully).toBe(0);
  });
});

const host = (w: World, name: string, ip?: string): TestClient => {
  const h = w.client(name, ip).hello();
  h.send({ t: 'create', settings: SETTINGS });
  return h;
};

describe('race spam (item 1)', () => {
  it('a global race cap answers serverFull; the room stays and can start once a slot frees', () => {
    const w = new World({}, { maxRaces: 2 });
    const a = host(w, 'A').send({ t: 'start' });
    const b = host(w, 'B').send({ t: 'start' });
    expect(w.server.stats().races).toBe(2);
    const c = host(w, 'C').send({ t: 'start' });
    expect(c.errors()).toContain('serverFull');
    expect(w.server.stats().races).toBe(2);
    expect(c.last('room')!.room.phase).toBe('waiting');
    expect(a.errors()).toEqual([]);
    expect(b.errors()).toEqual([]);
  });

  it('one address runs at most 2 races at once; others are unaffected', () => {
    const w = new World();
    host(w, 'A1', '10.1.0.1').send({ t: 'start' });
    host(w, 'A2', '10.1.0.1').send({ t: 'start' });
    const a3 = host(w, 'A3', '10.1.0.1').send({ t: 'start' });
    expect(a3.errors()).toContain('rateLimited');
    expect(w.server.stats().races).toBe(2);
    host(w, 'B1', '10.1.0.2').send({ t: 'start' });
    expect(w.server.stats().races).toBe(3);
  });

  it('a race whose humans all left is stopped after the resume window, freeing the address', () => {
    const w = new World({ reconnectMs: 5000 });
    const hosts = [host(w, 'S1', '10.2.0.1').send({ t: 'start' }), host(w, 'S2', '10.2.0.1').send({ t: 'start' })];
    expect(w.server.stats().races).toBe(2);
    for (const h of hosts) h.drop();
    w.advance(3000);
    expect(w.server.stats().races).toBe(2); // still resumable
    w.advance(4000);
    expect(w.server.stats().races).toBe(0);
    expect(w.server.stats().rooms).toBe(0);
    const again = host(w, 'S3', '10.2.0.1').send({ t: 'start' });
    expect(again.errors()).toEqual([]);
    expect(w.server.stats().races).toBe(1);
  });
});

describe('lobby state abuse', () => {
  it('join is refused while the player is loading or racing, so their race room is not orphaned (item 7)', () => {
    const w = new World();
    const a = host(w, 'Racer').send({ t: 'start' });
    const raceRoom = a.last('room')!.room.code;
    expect(w.server.roomByCode(raceRoom)!.phase).toBe('loading');
    const b = host(w, 'Other');
    const other = b.last('room')!.room.code;
    a.send({ t: 'join', code: other });
    expect(a.errors()).toContain('inRace');
    expect(w.server.roomByCode(other)!.humans()).toHaveLength(1);
    expect(w.server.roomByCode(raceRoom)!.humans()).toHaveLength(1);
    // outside a race the same join works
    const c = w.client('Idle').hello();
    c.send({ t: 'join', code: other });
    expect(c.errors()).toEqual([]);
    expect(w.server.roomByCode(other)!.humans()).toHaveLength(2);
  });

  it('resumes: at most one per second per session, and a replaced socket does not re-broadcast the room (item 8)', () => {
    const w = new World();
    const a = host(w, 'Host');
    const b = w.client('Member').hello();
    b.send({ t: 'join', code: a.last('room')!.room.code });
    w.advance(1500);
    const roomsAtA = a.all('room').length;
    // resume over a second socket while the first is still open: only the resumer gets a view
    b.reconnect();
    expect(b.last('welcome')).toBeDefined();
    expect(b.closed).toBeNull();
    expect(a.all('room').length).toBe(roomsAtA);
    // a resume storm: refused until a second has passed
    const before = b.all('welcome').length;
    b.reconnect();
    expect(b.errors()).toContain('rateLimited');
    expect(b.closed).toBe('resume too soon');
    expect(b.all('welcome').length).toBe(before);
    w.advance(1100);
    b.reconnect();
    expect(b.all('welcome').length).toBe(before + 1);
    // a real drop and return changes the member's connected state: everyone is told
    b.drop();
    expect(a.all('room').length).toBe(roomsAtA + 1);
    w.advance(1100);
    b.reconnect();
    expect(a.all('room').length).toBe(roomsAtA + 2);
  });

  it('room-code guessing: 10 failed joins per address per minute, then every join is refused until the minute ends (item 11)', () => {
    const w = new World();
    const real = host(w, 'Host').last('room')!.room.code;
    const g = w.client('Guess', '10.3.0.1').hello();
    const wrong = real === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
    for (let i = 0; i < 10; i++) { g.send({ t: 'join', code: wrong }); w.advance(200); }
    expect(g.errors().filter((e) => e === 'notFound')).toHaveLength(10);
    g.send({ t: 'join', code: real });
    expect(g.errors().at(-1)).toBe('rateLimited');
    expect(w.server.roomByCode(real)!.humans()).toHaveLength(1);
    // another address is not affected, and the guesser can join again a minute later
    const other = w.client('Friend', '10.3.0.2').hello();
    other.send({ t: 'join', code: real });
    expect(other.errors()).toEqual([]);
    w.advance(60_000);
    g.send({ t: 'join', code: real });
    expect(w.server.roomByCode(real)!.humans()).toHaveLength(3);
  });
});

describe('input filters', () => {
  it('a bot tier of constructor (or any inherited key) falls back to the room tier and the race runs (item 9)', () => {
    const w = new World();
    const h = host(w, 'Host');
    for (const [slot, tier] of [[3, 'constructor'], [4, '__proto__'], [5, 'toString'], [6, 'legend']] as const) {
      h.send({ t: 'slot', slot, action: 'bot', tier: tier as 'legend' });
    }
    const v = h.last('room')!.room;
    expect(v.slots.slice(3, 7).map((x) => x.tier)).toEqual(['rookie', 'rookie', 'rookie', 'legend']);
    h.send({ t: 'start' });
    w.advance(2000);
    expect(h.errors()).toEqual([]);
    expect(w.server.stats().races).toBe(1);
  });

  it('names and chat lose every bidi isolate and invisible character; blank-looking names are refused (item 10)', () => {
    expect(cleanName('a⁦b⁧c⁨d⁩e')).toBe('abcde');
    expect(cleanName('x؜y­z͏w')).toBe('xyzw');
    for (const blank of ['ㅤ', 'ﾠﾠ', '­', '͏', 'ᅟᅠ', '​ㅤ', '⠀', '...', '  ']) expect(cleanName(blank)).toBeNull();
    expect(cleanName('클로드 7')).toBe('클로드 7');
    expect(cleanName('Ana-1')).toBe('Ana-1');
    expect(cleanChat('hi⁦‮ there ')).toBe('hi there');
    expect(cleanChat('ㅤ­')).toBeNull();
    expect(cleanChat('👍')).toBe('👍');
  });
});
