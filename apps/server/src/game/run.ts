// Wires the game server to real time and real sockets: the 60 Hz Ticker drives GameServer.tick, ws sockets become
// Transports, and the server measures each socket's RTT with WebSocket ping frames (PLAYER_RTT / ping pills).
import type { WebSocket } from 'ws';
import type { ContentTables } from '@cr/content';
import { GameServer } from '../lobby/server.ts';
import { wsTransport } from '../net/wsTransport.ts';
import { Ticker } from './ticker.ts';
import { TrackStore } from './tracks.ts';

export interface RunningGame {
  accept(ws: WebSocket): void;
  stats(): Record<string, number>;
  stop(): void;
  readonly server: GameServer;
  readonly ticker: Ticker;
}

export function startGameServer(o: { content: ContentTables; tracksDirs: string[]; log?: (m: string) => void }): RunningGame {
  const ticker = new Ticker();
  const server = new GameServer({
    tracks: new TrackStore(o.tracksDirs), content: o.content, log: o.log,
    clock: { nowMs: () => ticker.now(), serverTick: (n) => ticker.serverTick(n), wallMs: (n) => ticker.wallMs(n), epochWallMs: ticker.epochWallMs },
  });
  ticker.onTick = (G) => server.tick(G);
  ticker.start();
  return {
    server, ticker,
    accept(ws: WebSocket): void { server.accept(wsTransport(ws)); },
    stats(): Record<string, number> {
      const c = [...ticker.costMs].sort((a, b) => a - b);
      const p99 = c.length ? c[Math.floor(c.length * 0.99)]! : 0;
      return { ...server.stats(), tick: ticker.tick, droppedTicks: ticker.dropped, tickP99Ms: Math.round(p99 * 1000) / 1000 };
    },
    stop(): void { ticker.stop(); },
  };
}
