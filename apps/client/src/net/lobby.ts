// Client lobby store (contract between lane L9 = implementation and lane L10 = screens).
// L10 binds UI to these signals/actions; L9 replaces the stub transport behind them. Keep the exported API stable.
import { signal, type Signal } from '@preact/signals';
import type { C2SLobby, S2CLobby, RoomView, Loadout, RoomSettings, LobbyErrorCode, RaceResultWire } from '@cr/net';
import type { ModeId, TeamFormat, TrackId } from '@cr/content';

export type ConnState = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline';

export interface LobbyStore {
  conn: Signal<ConnState>;
  session: Signal<string | null>;
  /** Quick Match queue state (null when not queued). */
  queue: Signal<{ phase: 'search' | 'stage'; endsAt: number; humans: number; trackId?: TrackId } | null>;
  room: Signal<RoomView | null>;
  roulette: Signal<{ endsAt: number; votes: Partial<Record<TrackId, number>> } | null>;
  chat: Signal<{ from: string; text: string; at: number }[]>;
  error: Signal<LobbyErrorCode | null>;
  lastResult: Signal<RaceResultWire | null>;
  /** Server clock offset (serverMs − Date.now()), for countdown displays. */
  clockOffsetMs: Signal<number>;
}

export const lobby: LobbyStore = {
  conn: signal<ConnState>('idle'),
  session: signal<string | null>(null),
  queue: signal(null),
  room: signal<RoomView | null>(null),
  roulette: signal(null),
  chat: signal([]),
  error: signal<LobbyErrorCode | null>(null),
  lastResult: signal<RaceResultWire | null>(null),
  clockOffsetMs: signal(0),
};

type Sender = (m: C2SLobby) => void;
let sender: Sender | null = null;
/** L9: install the live transport sender (and call `handleServer` for every S2C lobby message). */
export function installSender(s: Sender | null): void { sender = s; }

function send(m: C2SLobby): void {
  if (!sender) { lobby.error.value = 'offline'; lobby.conn.value = 'offline'; return; }
  sender(m);
}

/** Opens the connection (L9 implements; the stub reports offline). */
export let connect: (name: string, loadout: Loadout) => Promise<void> = async () => { lobby.conn.value = 'offline'; lobby.error.value = 'offline'; };
export function setConnectImpl(fn: typeof connect): void { connect = fn; }

export const lobbyActions = {
  quick: (mode: ModeId, teams: TeamFormat): void => send({ t: 'quick', mode, teams }),
  cancelQuick: (): void => send({ t: 'quickCancel' }),
  create: (settings: RoomSettings): void => send({ t: 'create', settings }),
  join: (code: string): void => send({ t: 'join', code: code.toUpperCase() }),
  leave: (): void => send({ t: 'leave' }),
  ready: (ready: boolean): void => send({ t: 'ready', ready }),
  loadout: (loadout: Loadout): void => send({ t: 'loadout', loadout }),
  settings: (settings: Partial<RoomSettings>): void => send({ t: 'settings', settings }),
  slot: (slot: number, action: 'open' | 'close' | 'bot' | 'kick'): void => send({ t: 'slot', slot, action }),
  team: (slot: number, team: number): void => send({ t: 'team', slot, team }),
  start: (): void => send({ t: 'start' }),
  vote: (trackId: TrackId): void => send({ t: 'vote', trackId }),
  chat: (text: string): void => send({ t: 'chat', text: text.slice(0, 120) }),
};

/** Applies one server lobby message to the store (L9's transport calls this). raceStart is routed by L9 to the race session. */
export function handleServer(m: S2CLobby): void {
  switch (m.t) {
    case 'welcome': lobby.session.value = m.session; lobby.conn.value = 'online'; lobby.error.value = null; break;
    case 'queue': lobby.queue.value = { phase: m.phase, endsAt: m.endsAt, humans: m.humans, ...(m.trackId ? { trackId: m.trackId } : {}) }; break;
    case 'room': lobby.room.value = m.room; lobby.queue.value = null; break;
    case 'roulette': lobby.roulette.value = { endsAt: m.endsAt, votes: m.votes }; break;
    case 'raceEnd': lobby.lastResult.value = m.result; break;
    case 'chat': lobby.chat.value = [...lobby.chat.value.slice(-49), { from: m.from, text: m.text, at: Date.now() }]; break;
    case 'error': lobby.error.value = m.code; break;
    case 'raceStart': break;
  }
}
