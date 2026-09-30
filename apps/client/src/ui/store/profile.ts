// Reactive mirror of the save for components (re-render on save.update), plus the Quick Race setup.
import { signal } from '@preact/signals';
import type { AiTier, ModeId, TeamFormat, TrackId } from '@cr/content';
import { save, type SaveV1 } from '../../meta/save.ts';
import { ensureRotation } from '../../meta/challenges.ts';

export const saveState = signal<Readonly<SaveV1>>(save.get());
save.subscribe((s) => { saveState.value = s; });

/** Rolls challenge rotations over (call on lobby entry and when the reset timer passes). */
export function refreshRotation(): void {
  const probe = structuredClone(save.get());
  if (ensureRotation(probe)) save.update((s) => { ensureRotation(s); });
}

export interface RaceSetup { mode: ModeId; track: TrackId | 'random'; tier: AiTier; laps: number | 'auto' }
export function raceSetup(): RaceSetup {
  const l = save.get().profile.lastRace;
  const tier = (['rookie', 'racer', 'pro', 'legend'] as const).find((x) => x === l?.tier) ?? 'racer';
  return { mode: l?.mode === 'item' ? 'item' : 'speed', track: (l?.track ?? 'meadow_loop') as TrackId | 'random', tier, laps: l?.laps ?? 'auto' };
}
/** Offline team format for the next race (session-only; the save's lastRace has no team field). */
export const raceTeams = signal<TeamFormat>('solo');
/** Extra `navigate('loading')` params for the chosen team format. */
export function teamParams(): Record<string, string> { return raceTeams.value === 'solo' ? {} : { teams: raceTeams.value }; }

export function setRaceSetup(p: Partial<RaceSetup>): void {
  save.update((s) => { s.profile.lastRace = { ...raceSetup(), ...p }; });
}
