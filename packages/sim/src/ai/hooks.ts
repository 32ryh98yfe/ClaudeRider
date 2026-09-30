// Extension points of the AI driver: driver options passed through the B8 `personality` argument, and the
// item-policy hook that lane L2 (sim/src/ai/items/**) implements. The driver never imports L2 code.
import type { CharacterId, ModeId } from '@cr/content';
import type { InputFrame } from '../core/input.ts';
import type { WorldState } from '../core/state.ts';
import type { BakedTrack } from '../track/BakedTrack.ts';
import type { AiProfile } from './api.ts';
import type { AiPersonality, EffectiveProfile } from './profiles.ts';

/** What the driver is doing this tick (item policies read it; bots never read secret/authority state). */
export interface AiItemView {
  readonly w: Readonly<WorldState>;
  readonly track: BakedTrack;
  readonly slot: number;
  readonly profile: Readonly<EffectiveProfile>;
  /** Tick on which the frame being written will be applied (w.tick + 1 + lookahead). */
  readonly applyTick: number;
  /** True on this bot's 20 Hz decision ticks (every 3 ticks, staggered by slot, 14-ai §1). */
  readonly highRate: boolean;
  /** Path s and lateral offset (m, + = right) predicted for applyTick. */
  readonly s: number;
  readonly u: number;
  /** Heading change over the next 40 m (rad, signed) and metres of straight road ahead. */
  readonly turnAhead40: number;
  readonly straightAhead: number;
  /** The driver is recovering (reversing / resetting) or cruising after the finish: items should stay idle. */
  readonly busy: boolean;
}

/**
 * Item decisions (L2, 14-ai §6). Called once per tick AFTER the driver wrote steering/throttle/drift into `out`.
 * The policy may OR `Edge.USE_ITEM` / `Edge.SWAP` into `out.edges`, set `out.aim`, and set `Held.ITEM` /
 * `Held.LOOK_BACK`; it must not touch steer/throttle/brake/DRIFT. `laneWish` (m, + = right, NaN = none)
 * lets it ask the avoidance planner for a lateral target (e.g. an item box row or a trap to dodge).
 */
export interface AiItemPolicy {
  decideItem(view: Readonly<AiItemView>, out: InputFrame): void;
  /** Optional lateral preference for the next lane evaluation (read every lane re-plan). */
  laneWish?(view: Readonly<AiItemView>): number;
}

/** Factory L2 exports (e.g. `createItemPolicy`) so rooms can hand one policy instance to each bot. */
export type AiItemPolicyFactory = (slot: number, profile: Readonly<EffectiveProfile>, seed: number) => AiItemPolicy;

export type AiRole = 'racer' | 'takeover' | 'cruise' | 'ghost';

/** Optional extras accepted in the `personality` argument of `createAiDriver` (all additive to B8). */
export interface AiDriverExtras {
  /** Character personality (id or object, 14-ai §8). Without it the tier profile is used unchanged. */
  character?: CharacterId | AiPersonality;
  /** Ticks between `decide(w)` and the tick its frame is applied (RaceRoom botLookahead; 0 = next tick). */
  lookaheadTicks?: number;
  /** Item policy hook (L2). */
  itemPolicy?: AiItemPolicy | AiItemPolicyFactory;
  /** racer (default), takeover (a disconnected human), cruise (finished kart), ghost (noise-free reference). */
  role?: AiRole;
  /** Disable the seeded ±5% skill jitter (reference runs, A/B tests). */
  noJitter?: boolean;
  /** Force the start press offset in ticks from GO (reference runs; overrides the tier's start roll). */
  startOffsetTicks?: number;
  /** Game mode, when the room knows it (item mode: the lane planner steers toward boxes while a slot is free). */
  mode?: ModeId;
}

export type AiDriverArgs = Partial<AiProfile> & AiDriverExtras;
