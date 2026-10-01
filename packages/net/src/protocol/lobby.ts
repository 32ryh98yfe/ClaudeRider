// Lobby JSON messages (02-contracts B9, 20-netcode-spec §5). Carried inside C2S/S2C LOBBY_JSON frames.
// Shared contract between lane L9 (server + client transport) and lane L10 (screens): extend additively only.
import type { AiTier, CharacterId, KartBodyId, ModeId, TeamFormat, TrackId } from '@cr/content';
import type { RaceConfig, Tick } from '@cr/sim';

// 2 (M5): the snapshot layout gained the driving-technique fields (SIM_VERSION 2); a v1 client is refused at hello
// (`error: version`) instead of failing to decode every race snapshot.
export const LOBBY_PROTOCOL_VERSION = 2;

export interface LiveryWire { primary: string; secondary: string; pattern: number; number: number }
export interface Loadout { characterId: CharacterId; kartBodyId: KartBodyId; livery: LiveryWire }

export interface RoomSettings {
  mode: ModeId;
  teams: TeamFormat;
  /** 'roulette' = 20 s vote/roulette (ADR-008); otherwise a fixed track. */
  track: TrackId | 'roulette';
  laps: number | 'default';
  fillBots: boolean;
  botTier: AiTier;
  isPrivate: boolean;
  maxHumans: number;          // 2–8
  // --- additive (L9): the remaining host settings of 13-modes-rules §7.2; server defaults apply when absent
  retireSec?: 5 | 10 | 15 | 20;
  itemSet?: 'standard' | 'light' | 'chaos';
  friendlyFire?: 'off' | 'area' | 'all';
  rubberBand?: boolean;
  instantBoostInItem?: boolean;
}

export type SlotState = 'open' | 'closed' | 'human' | 'bot';
export interface RoomSlotView {
  slot: number;
  state: SlotState;
  team: number;
  name?: string;
  loadout?: Loadout;
  ready?: boolean;
  host?: boolean;
  tier?: AiTier;
  pingMs?: number;
  you?: boolean;
}

export interface RoomView {
  code: string;               // 6 chars, alphabet without 0/O/1/I
  settings: RoomSettings;
  slots: RoomSlotView[];      // always 8
  phase: 'waiting' | 'countdown' | 'roulette' | 'loading' | 'racing' | 'results';
  /** Server time (ms) when an auto-start / roulette / results phase ends. */
  endsAt?: number;
  hostSession: string;
  // --- additive (L9)
  /** The track being loaded/raced (after a roulette or a random pick). */
  trackId?: TrackId;
  kind?: 'custom' | 'quick';
}

export interface RaceResultWire {
  trackId: string; mode: string; winnerTeam: number; endTick: number;
  rows: { slot: number; rank: number; name: string; team: number; finished: boolean; raceTicks: number; bestLapTicks: number; kind: 'human' | 'bot' | 'empty'; points: number }[];
}

export type C2SLobby =
  | { t: 'hello'; v: number; name: string; loadout: Loadout; resume?: string }
  | { t: 'quick'; mode: ModeId; teams: TeamFormat }
  | { t: 'quickCancel' }
  | { t: 'create'; settings: RoomSettings }
  | { t: 'join'; code: string }
  | { t: 'leave' }
  | { t: 'ready'; ready: boolean }
  | { t: 'loadout'; loadout: Loadout }
  | { t: 'settings'; settings: Partial<RoomSettings> }
  | { t: 'slot'; slot: number; action: 'open' | 'close' | 'bot' | 'kick'; tier?: AiTier }
  | { t: 'team'; slot: number; team: number }
  | { t: 'start' }
  | { t: 'vote'; trackId: TrackId }
  | { t: 'chat'; text: string }
  | { t: 'loaded'; trackHash: string };

export type S2CLobby =
  | { t: 'welcome'; session: string; serverVersion: number; simVersion: number;
      /** additive (L9): secret token for `hello.resume` (session is the public id shown in room views). */
      resume?: string; serverMs?: number; tickEpochMs?: number }
  | { t: 'queue'; phase: 'search' | 'stage'; endsAt: number; humans: number; trackId?: TrackId }
  | { t: 'room'; room: RoomView }
  | { t: 'roulette'; endsAt: number; votes: Partial<Record<TrackId, number>> }
  | { t: 'raceStart'; config: RaceConfig; startTick: Tick; serverTick: Tick; yourSlot: number;
      /** additive (L9): a second raceStart with the same raceId moves startTick once everyone has loaded. */
      raceId?: string; resumeToken?: string; provisional?: boolean }
  | { t: 'raceEnd'; result: RaceResultWire }
  | { t: 'chat'; from: string; text: string }
  | { t: 'error'; code: LobbyErrorCode };

export type LobbyErrorCode =
  | 'offline' | 'version' | 'full' | 'notFound' | 'notHost' | 'badCode' | 'inRace' | 'rateLimited' | 'kicked' | 'timeout' | 'internal'
  // additive (L9)
  | 'notReady' | 'nameInvalid' | 'chatFiltered' | 'resumeExpired' | 'slowConsumer' | 'trackHashMismatch' | 'badMessage' | 'serverFull';

export function defaultRoomSettings(): RoomSettings {
  return { mode: 'item', teams: 'solo', track: 'roulette', laps: 'default', fillBots: true, botTier: 'racer', isPrivate: true, maxHumans: 8 };
}
