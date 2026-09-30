import type { AiTier, CharacterId, ItemId, ModeId, RankBucket, SurfaceId, ThemeId, TrackId } from '../ids.ts';

export interface DropTable {
  format: 'solo' | 'team';
  buckets: Record<RankBucket, ReadonlyArray<readonly [ItemId, number]>>;
}

export interface SurfaceDef { id: SurfaceId; code: number; grip: number; vMul: number; dragMul: number; kill?: boolean; conveyor?: number }

export interface ThemeDataDef {
  id: ThemeId;
  code: number;
  nameKey: string;
  palette: readonly string[];              // hex colours, [0] = hero colour
  sky: 'day' | 'goldenHour' | 'sunset' | 'overcast' | 'night' | 'underground' | 'space' | 'aurora';
  sunDir: readonly [number, number, number];
  fog: { color: string; near: number; far: number };
  songId: string;                          // client audio/music/songs/<id>.ts
  headlights: boolean;
}

export interface TrackManifestEntry {
  id: TrackId;
  code: number;
  themeId: ThemeId;
  difficulty: 1 | 2 | 3 | 4 | 5;
  laps: number;
  modes: ReadonlyArray<'speed' | 'item'>;
  topology: 'circuit' | 'p2p';
  lapLengthM: number;
  refLapTicks: number;                     // Pro ghost lap in speed mode (0 = unknown yet)
  nameKey: string;
  onRoster: boolean;                       // false for proving_ring
}

export interface CharacterMeta {
  id: CharacterId;
  code: number;
  nameKey: string;
  unlockLevel: number;
  /** AI personality overrides (see sim/ai/api.ts AiProfile). */
  personality: { aggression: number; lineBias: number; risk: number; consistency: number; driftStyle: 'long' | 'chain'; itemHoarding: number };
}

export interface ChallengeDef {
  id: string;
  code: number;
  scope: 'daily' | 'weekly' | 'midRace';
  metric: string;                          // e.g. 'attacksLanded', 'driftMeters', 'perfectStarts'
  target: number;
  filter?: { mode?: ModeId; theme?: ThemeId; laps?: number; top?: number };
  reward: { xp: number; sparks: number };
  nameKey: string;
}

export interface ModeRules {
  retireTicks: number;
  teamPoints: readonly number[];           // index = rank-1
  introTicks: number;
  gridTicks: number;
  countdownBeatTicks: number;
  resultsSec: number;
  aiTiers: readonly AiTier[];
}
