// FROZEN (contracts.lock). Local save (localStorage JSON; ghosts later in IndexedDB).
// L10 additive grant (docs/design/contract-requests/L10-save.md): new optional fields only, filled by migrateSave().
import { CHARACTER_IDS, KART_BODY_IDS, type CharacterId, type KartBodyId, type ModeId, type TrackId } from '@cr/content';

export interface Livery { primary: string; secondary: string; pattern: number; number: number; /** L10: boost flame colour id */ flame?: string; /** L10: plate text */ plate?: string }
export interface SettingsV1 {
  quality: 'auto' | 'low' | 'medium' | 'high' | 'ultra';
  renderer: 'auto' | 'webgpu' | 'webgl2';
  volume: { master: number; music: number; sfx: number; engine: number; ui: number; /** L10 */ voice?: number };
  hudScale: number; reducedMotion: boolean; units: 'kmh' | 'mph';
  keys: Record<string, string[]>;
  autoBoost: boolean; driftAssist: boolean; cameraShake: boolean;
  // ---- L10 additive (optional; migrateSave fills defaults) ----
  renderScale?: number;                       // 0.5..1
  fpsCap?: 30 | 60 | 120 | 0;                 // 0 = unlimited
  shadows?: 'tier' | 'off' | 'on';
  particles?: 'tier' | 'low' | 'high';
  bloom?: 'tier' | 'off' | 'on';
  motionBlur?: boolean;
  // ---- U additive (contract-requests/U-settings-postfx.md): cinematic post toggles, 'tier' = the tier default ----
  velocityBlur?: 'tier' | 'off' | 'on';
  dof?: 'tier' | 'off' | 'on';
  muteUnfocused?: boolean;
  pad?: Record<string, number[]>;             // gamepad bindings: action → standard-mapping button indices
  deadzone?: number;                          // 0.05..0.30
  instantHint?: boolean;
  cameraDistance?: 'near' | 'normal' | 'far';
  racingLine?: boolean;
  minimapInSpeed?: boolean;
  raceMap?: 'track' | 'progress';           // version-10 migration: old false meant the legacy default, not map geometry
  nameTags?: boolean;
  itemFeed?: boolean;
  colorBlind?: boolean;
  highContrast?: boolean;
  textScale?: number;                         // 0.9..1.3
  ghost?: boolean;                            // Time Attack: race your PB ghost
  proGhost?: boolean;                         // Time Attack: bake-time Pro ghost (P1)
  firstRunTipSeen?: boolean;
}
export interface ChallengeState { id: string; progress: number; done: boolean; claimed: boolean }
export interface TrackRecord {
  bestLapTicks?: number; bestRaceTicks?: Partial<Record<ModeId, number>>;
  /** L10 */ ghostKey?: string;
  /** L10: ticks from GO to each key gate on the PB race (split deltas) */ splits?: number[];
  /** L10: completed Time Attack runs */ runs?: number;
}
export interface SaveV1 {
  v: 1;
  profile: {
    name: string; characterId: CharacterId; kartBodyId: KartBodyId; livery: Livery;
    /** L10 */ palette?: string; /** L10 */ title?: string; /** L10: challenge rotation seed */ seed?: number;
    /** L10: last Quick Race setup */ lastRace?: { mode: ModeId; track: TrackId | 'random'; tier: string; laps: number | 'auto' };
  };
  settings: SettingsV1;
  progress: {
    level: number; xp: number; sparks: number; unlocks: string[]; stats: Record<string, number>;
    /** L10: last 10 finishing positions normalised to 0..1 (Quick Match skill estimate) */ recent?: number[];
    /** L10: unlock ids the player has not looked at yet (NEW badges) */ fresh?: string[];
  };
  challenges: { daily: ChallengeState[]; weekly: ChallengeState[]; dailyReset: string; weeklyReset: string };
  records: Partial<Record<TrackId, TrackRecord>>;
}

const KEY = 'cr.save.v1';
export const DEFAULT_KEYS: Record<string, string[]> = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], accel: ['ArrowUp', 'KeyW'], brake: ['ArrowDown', 'KeyS'],
  drift: ['ShiftLeft', 'ShiftRight', 'KeyC'], item: ['ControlLeft', 'ControlRight', 'Space'], swap: ['AltLeft', 'KeyE'],
  reset: ['KeyR'], look: ['KeyX'], pause: ['Escape'],
};
/** L10: UI actions added after M1 (31-ui-spec §7.1); merged into saves that lack them. */
export const DEFAULT_KEYS_EXTRA: Record<string, string[]> = {
  emote1: ['Digit1'], emote2: ['Digit2'], emote3: ['Digit3'], emote4: ['Digit4'],
  standings: ['Tab'], restart: ['Backspace'], music: ['F7'], sfx: ['F8'], fullscreen: ['F11'],
};
/** L10: gamepad defaults (standard mapping button indices, 31-ui-spec §7.2). */
export const DEFAULT_PAD: Record<string, number[]> = {
  accel: [7], brake: [6], drift: [2, 5], item: [0], swap: [1], look: [4], reset: [3], pause: [9], standings: [8], left: [14], right: [15], emote1: [12],
};

function defaults(): SaveV1 {
  return {
    v: 1,
    profile: { name: '클로드', characterId: 'clay', kartBodyId: 'pebble', livery: { primary: '#d97757', secondary: '#faf9f5', pattern: 0, number: 7 } },
    settings: {
      quality: 'auto', renderer: 'auto', volume: { master: 0.8, music: 0.55, sfx: 0.8, engine: 0.7, ui: 0.7, voice: 0.7 }, hudScale: 1, reducedMotion: false,
      units: 'kmh', keys: { ...DEFAULT_KEYS, ...DEFAULT_KEYS_EXTRA }, autoBoost: false, driftAssist: false, cameraShake: true,
      renderScale: 1, fpsCap: 60, shadows: 'tier', particles: 'tier', bloom: 'tier', motionBlur: false, velocityBlur: 'tier', dof: 'tier', muteUnfocused: true,
      pad: { ...DEFAULT_PAD }, deadzone: 0.15, instantHint: true, cameraDistance: 'normal', racingLine: false,
      minimapInSpeed: true, raceMap: 'track', nameTags: true, itemFeed: true, colorBlind: false, highContrast: false, textScale: 1, ghost: true, proGhost: false,
      firstRunTipSeen: false,
    },
    progress: { level: 1, xp: 0, sparks: 0, unlocks: [], stats: {}, recent: [], fresh: [] },
    challenges: { daily: [], weekly: [], dailyReset: '', weeklyReset: '' },
    records: {},
  };
}

// ------------------------------------------------------------------ migration (L10)
type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown, d: number, lo = -Infinity, hi = Infinity): number => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
const str = (x: unknown, d: string): string => (typeof x === 'string' ? x : d);
const bool = (x: unknown, d: boolean): boolean => (typeof x === 'boolean' ? x : d);
const oneOf = <T extends string | number>(x: unknown, opts: readonly T[], d: T): T => (opts.includes(x as T) ? (x as T) : d);
const strArr = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);

/** Upgrades any older or partial save (M1 dev saves, v0 without `v`, hand-edited imports) to a complete SaveV1. Throws on unusable input. */
export function migrateSave(raw: unknown): SaveV1 {
  if (!isObj(raw)) throw new Error('save_corrupt');
  const ver = raw['v'] === undefined ? 0 : raw['v'];
  if (ver !== 0 && ver !== 1) throw new Error('save_version');
  const d = defaults();
  const p = isObj(raw['profile']) ? raw['profile'] : {};
  const lv = isObj(p['livery']) ? p['livery'] : {};
  const s = isObj(raw['settings']) ? raw['settings'] : {};
  const vol = isObj(s['volume']) ? s['volume'] : {};
  const pr = isObj(raw['progress']) ? raw['progress'] : {};
  const ch = isObj(raw['challenges']) ? raw['challenges'] : {};
  const ds = d.settings;
  const keysIn = isObj(s['keys']) ? s['keys'] : {};
  const keys: Record<string, string[]> = { ...ds.keys };
  for (const [a, codes] of Object.entries(keysIn)) { const c = strArr(codes).slice(0, 3); if (a in keys || c.length) keys[a] = c; }
  const padIn = isObj(s['pad']) ? s['pad'] : {};
  const pad: Record<string, number[]> = { ...ds.pad };
  for (const [a, b] of Object.entries(padIn)) if (Array.isArray(b)) pad[a] = b.filter((x): x is number => Number.isInteger(x) && x >= 0 && x < 32).slice(0, 2);
  const cstate = (x: unknown): ChallengeState[] => (Array.isArray(x) ? x.filter(isObj).map((c) => ({ id: str(c['id'], ''), progress: num(c['progress'], 0, 0), done: bool(c['done'], false), claimed: bool(c['claimed'], false) })).filter((c) => c.id) : []);
  const stats: Record<string, number> = {};
  if (isObj(pr['stats'])) for (const [k, v] of Object.entries(pr['stats'])) if (typeof v === 'number' && Number.isFinite(v)) stats[k] = v;
  const records: SaveV1['records'] = {};
  if (isObj(raw['records'])) {
    for (const [tid, r] of Object.entries(raw['records'])) {
      if (!isObj(r)) continue;
      const rec: TrackRecord = {};
      if (typeof r['bestLapTicks'] === 'number' && r['bestLapTicks'] > 0) rec.bestLapTicks = r['bestLapTicks'];
      if (isObj(r['bestRaceTicks'])) { const b: Partial<Record<ModeId, number>> = {}; for (const [m, v] of Object.entries(r['bestRaceTicks'])) if (typeof v === 'number' && v > 0) b[m as ModeId] = v; rec.bestRaceTicks = b; }
      if (typeof r['ghostKey'] === 'string') rec.ghostKey = r['ghostKey'];
      if (Array.isArray(r['splits'])) rec.splits = r['splits'].filter((x): x is number => typeof x === 'number');
      if (typeof r['runs'] === 'number') rec.runs = r['runs'];
      records[tid as TrackId] = rec;
    }
  }
  const lr = isObj(p['lastRace']) ? p['lastRace'] : null;
  const out: SaveV1 = {
    v: 1,
    profile: {
      name: str(p['name'], d.profile.name).slice(0, 16) || d.profile.name,
      characterId: oneOf(p['characterId'], CHARACTER_IDS as readonly CharacterId[], 'clay'),
      kartBodyId: oneOf(p['kartBodyId'], KART_BODY_IDS as readonly KartBodyId[], 'pebble'),
      livery: {
        primary: str(lv['primary'], d.profile.livery.primary), secondary: str(lv['secondary'], d.profile.livery.secondary),
        pattern: num(lv['pattern'], 0, 0, 15), number: num(lv['number'], 7, 0, 99),
        ...(typeof lv['flame'] === 'string' ? { flame: lv['flame'] } : {}), ...(typeof lv['plate'] === 'string' ? { plate: lv['plate'].slice(0, 8) } : {}),
      },
      ...(typeof p['palette'] === 'string' ? { palette: p['palette'] } : {}),
      ...(typeof p['title'] === 'string' ? { title: p['title'] } : {}),
      seed: num(p['seed'], Math.floor(Math.random() * 0x7fffffff), 0),
      ...(lr ? { lastRace: { mode: str(lr['mode'], 'speed') as ModeId, track: str(lr['track'], 'random') as TrackId | 'random', tier: str(lr['tier'], 'racer'), laps: typeof lr['laps'] === 'number' ? lr['laps'] : 'auto' } } : {}),
    },
    settings: {
      quality: oneOf(s['quality'], ['auto', 'low', 'medium', 'high', 'ultra'] as const, ds.quality),
      renderer: oneOf(s['renderer'], ['auto', 'webgpu', 'webgl2'] as const, ds.renderer),
      volume: {
        master: num(vol['master'], ds.volume.master, 0, 1), music: num(vol['music'], ds.volume.music, 0, 1), sfx: num(vol['sfx'], ds.volume.sfx, 0, 1),
        engine: num(vol['engine'], ds.volume.engine, 0, 1), ui: num(vol['ui'], ds.volume.ui, 0, 1), voice: num(vol['voice'], ds.volume.voice ?? 0.7, 0, 1),
      },
      hudScale: num(s['hudScale'], 1, 0.8, 1.2), reducedMotion: bool(s['reducedMotion'], false), units: oneOf(s['units'], ['kmh', 'mph'] as const, 'kmh'),
      keys, autoBoost: bool(s['autoBoost'], false), driftAssist: bool(s['driftAssist'], false), cameraShake: bool(s['cameraShake'], true),
      renderScale: num(s['renderScale'], 1, 0.5, 1), fpsCap: oneOf(s['fpsCap'], [30, 60, 120, 0] as const, 60),
      shadows: oneOf(s['shadows'], ['tier', 'off', 'on'] as const, 'tier'), particles: oneOf(s['particles'], ['tier', 'low', 'high'] as const, 'tier'),
      bloom: oneOf(s['bloom'], ['tier', 'off', 'on'] as const, 'tier'), motionBlur: bool(s['motionBlur'], false),
      velocityBlur: oneOf(s['velocityBlur'], ['tier', 'off', 'on'] as const, 'tier'), dof: oneOf(s['dof'], ['tier', 'off', 'on'] as const, 'tier'),
      muteUnfocused: bool(s['muteUnfocused'], true),
      pad, deadzone: num(s['deadzone'], 0.15, 0.05, 0.3), instantHint: bool(s['instantHint'], true),
      cameraDistance: oneOf(s['cameraDistance'], ['near', 'normal', 'far'] as const, 'normal'), racingLine: bool(s['racingLine'], false),
      minimapInSpeed: true, raceMap: oneOf(s['raceMap'], ['track', 'progress'] as const, 'track'), nameTags: bool(s['nameTags'], true), itemFeed: bool(s['itemFeed'], true),
      colorBlind: bool(s['colorBlind'], false), highContrast: bool(s['highContrast'], false), textScale: num(s['textScale'], 1, 0.9, 1.3),
      ghost: bool(s['ghost'], true), proGhost: bool(s['proGhost'], false), firstRunTipSeen: bool(s['firstRunTipSeen'], false),
    },
    progress: {
      level: Math.round(num(pr['level'], 1, 1, 50)), xp: num(pr['xp'], 0, 0), sparks: Math.floor(num(pr['sparks'], 0, 0)),
      unlocks: [...new Set(strArr(pr['unlocks']))], stats,
      recent: Array.isArray(pr['recent']) ? pr['recent'].filter((x): x is number => typeof x === 'number').slice(-10) : [],
      fresh: strArr(pr['fresh']),
    },
    challenges: { daily: cstate(ch['daily']), weekly: cstate(ch['weekly']), dailyReset: str(ch['dailyReset'], ''), weeklyReset: str(ch['weeklyReset'], '') },
    records,
  };
  return out;
}

let current: SaveV1 = (() => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrateSave(JSON.parse(raw));
  } catch { /* ignore corrupt / private mode */ }
  return migrateSave(defaults());
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
  exportJson(): string { return JSON.stringify(current, null, 1); },
  /** Throws Error('save_corrupt' | 'save_version') and leaves the current save untouched on bad input. */
  importJson(s: string): void {
    let parsed: unknown;
    try { parsed = JSON.parse(s); } catch { throw new Error('save_corrupt'); }
    const v = migrateSave(parsed); save.update((d) => { Object.assign(d, v); });
  },
  /** L10: factory defaults for everything (Settings → Data → reset progress keeps settings). */
  reset(keepSettings = true): void {
    const fresh = migrateSave(defaults()); const settings = current.settings;
    save.update((d) => { Object.assign(d, fresh); if (keepSettings) d.settings = structuredClone(settings); });
  },
};
