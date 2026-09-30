import type { RaceResult } from '@cr/room';
let last: { r: RaceResult; names: string[] } | null = null;
export const setLastResult = (r: RaceResult, names: string[]): void => { last = { r, names }; };
export const getLastResult = (): { r: RaceResult; names: string[] } | null => last;
