import type { AiTier, ItemId } from '../ids.ts';
import type { EffectApply } from './effect.ts';

export type TargetRule =
  | 'self' | 'aim' | 'leader' | 'nextAheadOpponent' | 'allAheadOpponents' | 'team' | 'opponentsAll'
  | 'dropBehind' | 'lobAhead' | 'aheadOfLeader';

export interface ItemDef {
  id: ItemId;
  code: number;
  teamOnly: boolean;
  category: 'speed' | 'attack' | 'trap' | 'defense' | 'utility';
  target: TargetRule;
  aim?: { coneDeg: number; rangeMin: number; rangeMax: number; lockTicks: number; allowRear: boolean };
  projectile?: { speedMulVref: number; plusTargetSpeed: number; lifeTicks: number; passWalls: boolean; route: 'spline' | 'direct' };
  lob?: { flightTicks: number; aheadM: number; radius: number; dy: number; centerline: boolean };
  drop?: { behindM: number; throwForwardM?: number; lifeTicks: number; armTicks: number; radius: number; maxPerOwner: number };
  applies: EffectApply[];
  blockedBy: ReadonlyArray<'shield' | 'halo'>;
  clearedBy?: ReadonlyArray<'pulse'>;
  friendlyFire: 'never' | 'area';
  validity?: 'notIfLeaderSelfOrTeam';
  behavior?: string;      // key of sim/src/items/behaviors/<key>.ts
  ai: { use: 'straight' | 'targetAhead60' | 'pursuerBehind15' | 'incomingThreat' | 'rank3plus' | 'onDrone' | 'always'; minTier?: AiTier };
  presentation: { iconKey: string; vfxKey: string; sfxUse: string; sfxHit?: string; nameKey: string; descKey: string };
}
