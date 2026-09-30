// Track catalogue for pickers: the content manifest (names, difficulty, laps, modes) joined with the baked tracks the
// server actually ships (tracks/index.json). Unbaked roster tracks show as "coming soon".
import { signal } from '@preact/signals';
import { TRACK_IDS, loadContent, type ModeId, type ThemeId, type TrackId } from '@cr/content';

export interface TrackInfo { id: TrackId; themeId: ThemeId; difficulty: number; laps: number; modes: readonly ('speed' | 'item')[]; lapLength: number; refLapTicks: number; onRoster: boolean; baked: boolean }

interface IndexEntry { hash: string; lapLength: number; laps: number; refLapTicks: number; theme: string }
export const bakedIndex = signal<Record<string, IndexEntry> | null>(null);
let loading: Promise<void> | null = null;

export function loadTrackIndex(): Promise<void> {
  if (!loading) loading = fetch('tracks/index.json').then((r) => (r.ok ? r.json() : {})).then((j: Record<string, IndexEntry>) => { bakedIndex.value = j; }).catch(() => { bakedIndex.value = {}; });
  return loading;
}

export function trackInfos(): TrackInfo[] {
  const c = loadContent(), idx = bakedIndex.value ?? {};
  return TRACK_IDS.map((id) => {
    const m = c.tracks.byId.get(id);
    const b = idx[id];
    return {
      id, themeId: (m?.themeId ?? b?.theme ?? 'clayhill_village') as ThemeId, difficulty: m?.difficulty ?? 1, laps: b?.laps ?? m?.laps ?? 3,
      modes: m?.modes ?? ['speed', 'item'], lapLength: b?.lapLength ?? m?.lapLengthM ?? 1000, refLapTicks: b?.refLapTicks || m?.refLapTicks || 0,
      onRoster: m?.onRoster ?? id !== 'proving_ring', baked: !!b,
    };
  });
}
export function trackInfo(id: string): TrackInfo | undefined { return trackInfos().find((t) => t.id === id); }

/** Baked tracks usable for a mode, roster first, practice ring last. */
export function playableTracks(mode: ModeId): TrackInfo[] {
  const m = mode === 'item' ? 'item' : 'speed';
  return trackInfos().filter((t) => t.baked && t.modes.includes(m)).sort((a, b) => Number(b.onRoster) - Number(a.onRoster));
}
/** Resolves 'random' to a playable track (roster tracks preferred). */
export function resolveTrack(sel: TrackId | 'random', mode: ModeId): TrackId {
  const list = playableTracks(mode);
  const roster = list.filter((t) => t.onRoster);
  if (sel !== 'random' && list.some((t) => t.id === sel)) return sel;
  const pool = roster.length ? roster : list;
  if (!pool.length) return 'meadow_loop';
  return pool[Math.floor(Math.random() * pool.length)]!.id;
}

/** Reference lap for medals and estimates: baked Pro ghost lap, else an estimate from the lap length at ~30.5 m/s. */
export function refLapTicks(t: TrackInfo): number { return t.refLapTicks > 0 ? t.refLapTicks : Math.round((t.lapLength / 30.5) * 60); }
