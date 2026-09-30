// The last finished race for the results screen: authority result, slot loadouts, the local summary and rewards.
import type { RaceResult } from '@cr/room';
import type { RaceSummary } from '../../../meta/progression.ts';
import type { RewardReport } from '../../../meta/rewards.ts';

export interface SlotLook { characterId: string; kartBodyId: string }
export interface LastResult {
  r: RaceResult; names: string[];
  slots?: SlotLook[];
  summary?: RaceSummary; report?: RewardReport;
  /** params to restart the same race (again button) */
  again?: Record<string, string>;
  online?: boolean;
  /** the local player's slot (online races put you anywhere in the grid); default: the first human row */
  me?: number;
  teams?: string;
}
let last: LastResult | null = null;
export const setLastResult = (r: RaceResult, names: string[], extra: Omit<LastResult, 'r' | 'names'> = {}): void => { last = { r, names, ...extra }; };
export const getLastResult = (): LastResult | null => last;
/** The local player's slot in a result. */
export const mySlot = (l: LastResult): number => l.me ?? l.r.rows.find((x) => x.kind === 'human')?.slot ?? 0;
