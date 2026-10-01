// Implements the lobby store contract (net/lobby.ts) over the live socket, and routes races: `raceStart` stores a
// pending online race and opens the race screen, whose Session picks it up; a second raceStart for the same race moves
// its start tick; `raceEnd` finishes it. Importing this module installs everything (Session.ts imports it).
import { signal } from '@preact/signals';
import type { RaceConfig, Tick } from '@cr/sim';
import { EarlyFrameBuffer, type Channel, type Loadout, type RaceResultWire, type S2CLobby, type Transport } from '@cr/net';
import { lobby, lobbyActions, handleServer, installSender, setConnectImpl, connect } from './lobby.ts';
import { LobbyConnection } from './connection.ts';
import { navigate } from '../ui/store/route.ts';
import { workerSelftest } from './workerSelftest.ts';

export interface OnlineRaceInfo {
  raceId: string;
  config: RaceConfig;
  startTick: Tick;
  serverTick: Tick;
  yourSlot: number;
  resumeToken?: string;
  /** performance.now() when the first raceStart arrived. */
  receivedAt: number;
}

/** What a running online Session exposes to the connection. */
export interface ActiveOnlineRace {
  readonly raceId: string;
  setStartTick(t: Tick): void;
  finish(result: RaceResultWire): void;
  replaceTransport(t: Transport): void;
}

export const conn = new LobbyConnection();
/** The race waiting for its Session (set by raceStart, taken by Session). */
export const pendingRace = signal<OnlineRaceInfo | null>(null);
let active: ActiveOnlineRace | null = null;
let lastRaceId = '';
// The race channel opens with the first raceStart, so relays and events sent while the track loads are kept.
let early: { raceId: string; channel: Channel; buffer: EarlyFrameBuffer } | null = null;

/** The game server URL: `?server=ws://…` overrides; the Vite dev server talks to the Node server on its own port. */
export function serverUrl(): string {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q;
  if (import.meta.env.DEV) return `ws://${location.hostname}:${(import.meta.env['VITE_SERVER_PORT'] as string | undefined) ?? '8787'}/ws`;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

conn.onLobby = (m: S2CLobby) => {
  handleServer(m);
  switch (m.t) {
    case 'welcome': installSender((x) => { if (!conn.send(x)) { lobby.error.value = 'offline'; } }); break;
    case 'raceStart': onRaceStart(m); break;
    case 'raceEnd': active?.finish(m.result); break;
    case 'room': conn.loading = m.room.phase === 'loading'; break;
    default: break;
  }
  lobby.clockOffsetMs.value = conn.clockOffsetMs();
};

conn.onEvent = (e) => {
  if (e === 'reconnecting') lobby.conn.value = 'reconnecting';
  else if (e === 'closed') {
    lobby.conn.value = 'offline'; installSender(null);
    // another server version: say "reload" (errors.version_mismatch) instead of "offline"
    if (conn.versionMismatch) lobby.error.value = 'version';
  }
  else if (e === 'reconnected' || e === 'open') {
    lobby.conn.value = 'online';
    if (e === 'reconnected') {
      // the server re-attaches us and resends a keyframe and the event log: still loading → keep buffering them
      const ch = conn.raceChannel();
      if (ch && early) { early.channel.detach(); early.channel = ch; const buf = early.buffer; ch.onMessage = (b) => buf.push(b); }
      else if (ch && active) active.replaceTransport(ch);
      else ch?.detach();
    }
  }
};

setConnectImpl(async (name: string, loadout: Loadout): Promise<void> => {
  lobby.conn.value = 'connecting';
  lobby.error.value = null;
  try {
    await conn.connect(serverUrl(), name, loadout);
  } catch {
    lobby.conn.value = 'offline';
    lobby.error.value = conn.versionMismatch ? 'version' : 'offline';
    throw new Error(conn.versionMismatch ? 'version' : 'offline');
  }
});

function onRaceStart(m: Extract<S2CLobby, { t: 'raceStart' }>): void {
  const raceId = m.raceId ?? `${m.config.seed}`;
  lobby.queue.value = null;
  conn.loading = true;
  if (active && active.raceId === raceId) { active.setStartTick(m.startTick); return; }
  const p = pendingRace.value;
  if (p && p.raceId === raceId) { pendingRace.value = { ...p, startTick: m.startTick, serverTick: m.serverTick }; return; }
  if (raceId === lastRaceId && !p) return; // a resume re-sent the race we already finished
  lastRaceId = raceId;
  early?.channel.detach();
  const ch = conn.raceChannel();
  early = ch ? { raceId, channel: ch, buffer: new EarlyFrameBuffer() } : null;
  if (early) { const buf = early.buffer; ch!.onMessage = (b) => buf.push(b); }
  pendingRace.value = {
    raceId, config: m.config, startTick: m.startTick, serverTick: m.serverTick, yourSlot: m.yourSlot, receivedAt: performance.now(),
    ...(m.resumeToken ? { resumeToken: m.resumeToken } : {}),
  };
  navigate('loading', { track: m.config.trackId, mode: m.config.mode, online: '1' });
}

/** Session side: the race channel opened at raceStart and the frames it buffered (once). */
export function takeRaceChannel(raceId: string): { channel: Channel | null; buffered: Uint8Array[]; needKeyframe: boolean } | null {
  if (!early || early.raceId !== raceId || !early.channel.attached) return null;
  const e = early;
  early = null;
  return { channel: e.channel, buffered: e.buffer.frames, needKeyframe: e.buffer.needKeyframe };
}

/** Session side: take the pending race (once). */
export function takePendingRace(): OnlineRaceInfo | null {
  const p = pendingRace.value;
  pendingRace.value = null;
  return p;
}

export function registerActiveRace(r: ActiveOnlineRace | null): void { active = r; if (!r) conn.loading = false; }

/** The latest start tick for a race (a final raceStart may have arrived while the Session was loading). */
export function latestStartTick(raceId: string, fallback: Tick): Tick {
  const p = pendingRace.value;
  return p && p.raceId === raceId ? p.startTick : fallback;
}

// Dev/test hook (e2e drives the lobby before the real screens exist). Harmless in production builds.
(window as unknown as { __crNet?: unknown }).__crNet = { lobby, actions: lobbyActions, connect: (name: string, loadout: Loadout) => connect(name, loadout), conn, pendingRace, workerSelftest };
