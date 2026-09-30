// FROZEN (contracts.lock). Local save (localStorage JSON; ghosts later in IndexedDB).
import type { CharacterId, KartBodyId, ModeId, TrackId } from '@cr/content';

export interface Livery { primary: string; secondary: string; pattern: number; number: number }
export interface SettingsV1 {
  quality: 'auto' | 'low' | 'medium' | 'high' | 'ultra';
  renderer: 'auto' | 'webgpu' | 'webgl2';
  volume: { master: number; music: number; sfx: number; engine: number; ui: number };
  hudScale: number; reducedMotion: boolean; units: 'kmh' | 'mph';
  keys: Record<string, string[]>;
  autoBoost: boolean; driftAssist: boolean; cameraShake: boolean;
}
export interface ChallengeState { id: string; progress: number; done: boolean; claimed: boolean }
export interface SaveV1 {
  v: 1;
  profile: { name: string; characterId: CharacterId; kartBodyId: KartBodyId; livery: Livery };
  settings: SettingsV1;
  progress: { level: number; xp: number; sparks: number; unlocks: string[]; stats: Record<string, number> };
  challenges: { daily: ChallengeState[]; weekly: ChallengeState[]; dailyReset: string; weeklyReset: string };
  records: Partial<Record<TrackId, { bestLapTicks?: number; bestRaceTicks?: Partial<Record<ModeId, number>> }>>;
}

const KEY = 'cr.save.v1';
export const DEFAULT_KEYS: Record<string, string[]> = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], accel: ['ArrowUp', 'KeyW'], brake: ['ArrowDown', 'KeyS'],
  drift: ['ShiftLeft', 'ShiftRight', 'KeyC'], item: ['ControlLeft', 'ControlRight', 'Space'], swap: ['AltLeft', 'KeyE'],
  reset: ['KeyR'], look: ['KeyX'], pause: ['Escape'],
};

function defaults(): SaveV1 {
  return {
    v: 1,
    profile: { name: '클로드', characterId: 'clay', kartBodyId: 'pebble', livery: { primary: '#d97757', secondary: '#faf9f5', pattern: 0, number: 7 } },
    settings: {
      quality: 'auto', renderer: 'auto', volume: { master: 0.8, music: 0.55, sfx: 0.8, engine: 0.7, ui: 0.7 }, hudScale: 1, reducedMotion: false,
      units: 'kmh', keys: DEFAULT_KEYS, autoBoost: false, driftAssist: false, cameraShake: true,
    },
    progress: { level: 1, xp: 0, sparks: 0, unlocks: [], stats: {} },
    challenges: { daily: [], weekly: [], dailyReset: '', weeklyReset: '' },
    records: {},
  };
}

let current: SaveV1 = (() => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw) as SaveV1; if (s && s.v === 1) return { ...defaults(), ...s, settings: { ...defaults().settings, ...s.settings } }; }
  } catch { /* ignore corrupt / private mode */ }
  return defaults();
})();
const listeners = new Set<(s: Readonly<SaveV1>) => void>();

export const save = {
  get(): Readonly<SaveV1> { return current; },
  update(fn: (s: SaveV1) => void): void {
    const next = structuredClone(current); fn(next); current = next;
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* quota / private */ }
    for (const l of listeners) l(current);
  },
  subscribe(fn: (s: Readonly<SaveV1>) => void): () => void { listeners.add(fn); return () => listeners.delete(fn); },
  exportJson(): string { return JSON.stringify(current); },
  importJson(s: string): void { const v = JSON.parse(s) as SaveV1; if (v.v !== 1) throw new Error('unsupported save'); current = v; save.update(() => undefined); },
};
