// Wires the game server to real time and real sockets: the 60 Hz Ticker drives GameServer.tick, ws sockets become
// Transports, and a WebSocket ping every 15 s finds dead peers: a socket that misses 2 pongs in a row is terminated
// (an idle or half-open connection would otherwise hold its session and its per-address slot forever).
import type { WebSocket } from 'ws';
import type { ContentTables } from '@cr/content';
import { GameServer, type ServerLimits } from '../lobby/server.ts';
import { wsTransport } from '../net/wsTransport.ts';
import { Ticker } from './ticker.ts';
import { TrackStore } from './tracks.ts';

export interface RunningGame {
  /** A new socket; `ip` is its address key (see net/address.ts). */
  accept(ws: WebSocket, ip?: string): void;
  stats(): Record<string, number>;
  stop(): void;
  readonly server: GameServer;
  readonly ticker: Ticker;
}

export const HEARTBEAT_MS = 15_000;

export function startGameServer(o: { content: ContentTables; tracksDirs: string[]; log?: (m: string) => void; limits?: Partial<ServerLimits>; heartbeatMs?: number }): RunningGame {
  const ticker = new Ticker();
  const server = new GameServer({
    tracks: new TrackStore(o.tracksDirs), content: o.content, log: o.log, ...(o.limits ? { limits: o.limits } : {}),
    clock: { nowMs: () => ticker.now(), serverTick: (n) => ticker.serverTick(n), wallMs: (n) => ticker.wallMs(n), epochWallMs: ticker.epochWallMs },
  });
  ticker.onTick = (G) => server.tick(G);
  ticker.start();
  const missed = new Map<WebSocket, number>(); // pongs missed in a row
  const heartbeat = setInterval(() => {
    for (const [ws, n] of missed) {
      if (n >= 2) { ws.terminate(); missed.delete(ws); continue; }
      missed.set(ws, n + 1);
      try { ws.ping(); } catch { /* closing */ }
    }
  }, o.heartbeatMs ?? HEARTBEAT_MS);
  heartbeat.unref();
  return {
    server, ticker,
    accept(ws: WebSocket, ip?: string): void {
      missed.set(ws, 0);
      ws.on('pong', () => { if (missed.has(ws)) missed.set(ws, 0); });
      ws.on('close', () => missed.delete(ws));
      server.accept(wsTransport(ws), ip);
    },
    stats(): Record<string, number> {
      const c = [...ticker.costMs].sort((a, b) => a - b);
      const p99 = c.length ? c[Math.floor(c.length * 0.99)]! : 0;
      return { ...server.stats(), tick: ticker.tick, droppedTicks: ticker.dropped, tickP99Ms: Math.round(p99 * 1000) / 1000 };
    },
    stop(): void { ticker.stop(); clearInterval(heartbeat); },
  };
}
