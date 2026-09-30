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
  /** allowTeam: teammates are valid lock targets regardless of the friendly-fire rule (the tether harms nobody). */
  aim?: { coneDeg: number; rangeMin: number; rangeMax: number; lockTicks: number; allowRear: boolean; allowTeam?: boolean };
  projectile?: { speedMulVref: number; plusTargetSpeed: number; lifeTicks: number; passWalls: boolean; route: 'spline' | 'direct' };
  lob?: { flightTicks: number; aheadM: number; radius: number; dy: number; centerline: boolean };
  /** heightM: centre above the road (redaction cloud 2 m); omitted = settled on the ground. */
  drop?: { behindM: number; throwForwardM?: number; lifeTicks: number; armTicks: number; radius: number; maxPerOwner: number; heightM?: number; ownerImmuneTicks?: number };
  /** Firewall-style placement ahead of a target (additive to B7). */
  place?: { aheadM: number; offsets: readonly number[]; minWidthM: number; edgeM: number; blockHeightM: number };
  /** Self-centred contact aura (overclock): radius in metres between contact points. */
  contact?: { radius: number };
  applies: EffectApply[];
  blockedBy: ReadonlyArray<'shield' | 'halo'>;
  clearedBy?: ReadonlyArray<'pulse'>;
  friendlyFire: 'never' | 'area';
  validity?: 'notIfLeaderSelfOrTeam';
  behavior?: string;      // key of sim/src/items/behaviors/<key>.ts
  /** P2 items (R11) may be excluded from a build; the validity reroll then removes them from drops. */
  priority?: 'P0' | 'P2';
  ai: { use: 'straight' | 'targetAhead60' | 'pursuerBehind15' | 'incomingThreat' | 'rank3plus' | 'onDrone' | 'always'; minTier?: AiTier };
  presentation: { iconKey: string; vfxKey: string; sfxUse: string; sfxHit?: string; sfxLoop?: string; nameKey: string; descKey: string };
}
