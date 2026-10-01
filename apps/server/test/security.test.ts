// M4 security review regressions (docs/design/reviews/M4-server-security.md): per-IP and global caps, sockets that
// never read, frame floods, lobby state abuse and input filters, on the fake clock with scripted clients.
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { ByteWriter, PingMsg, encodeC2SLobby, type Transport } from '@cr/net';
import { wsTransport } from '../src/net/wsTransport.ts';
import { LOADOUT, World } from './fixture.ts';

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
