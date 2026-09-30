// Environment look resolution: ThemeKit.look (+ optional FX fields) → content ThemeDataDef → per-track THEME attrs.
// World lanes set any of the optional `ThemeLookFx` fields in their kit's look; everything has a sky-kind default,
// so a kit that only sets colours still gets a complete light rig. Documented in docs/art/fx/README.md.
import * as THREE from 'three/webgpu';
import type { ThemeDataDef } from '@cr/content';

export type SkyKind = ThemeDataDef['sky'];
export type AmbientKind = 'none' | 'snow' | 'fireflies' | 'dust' | 'rain' | 'embers' | 'leaves' | 'petals' | 'bubbles' | 'motes' | 'stars';

/** Optional look fields read by the FX lane (all optional; see docs/art/fx/README.md for defaults). */
export interface ThemeLookFx {
  /** Overrides content `sky` for this kit (the track's THEME sky still wins). */
  skyKind?: SkyKind;
  /** Local time 0–24 h; drives sun elevation on day-like skies when `sky.elevationDeg` is not set by the track. */
  hour?: number;
  /** Night/space sky details. */
  stars?: number;               // 0..1 density
  moon?: boolean;
  aurora?: boolean;
  planet?: { color: string; ring?: string; dir?: [number, number, number]; size?: number };
  horizon?: string;             // gradient-sky horizon colour
  clouds?: number;              // 0..1 cloud cover on gradient skies
  /** Post grade (CDL in display space after Neutral tone mapping). */
  grade?: { slope?: number; saturation?: number; tint?: string; offset?: number; power?: number; shadows?: string; highlights?: string };
  exposure?: number;
  bloom?: number;               // bloom strength override
  envIntensity?: number;        // PMREM reflection strength
  rimBoost?: number;            // mascot/kart Fresnel rim multiplier (readability at night)
  fog?: { color?: string; near?: number; far?: number };
  ambient?: AmbientKind;        // weather / air particles around the camera
  wind?: number;                // foliage sway multiplier
  wet?: number;                 // 0..1 wet roads (rain)
  headlights?: boolean;         // overrides content headlights
  water?: { level: number; shallow: string; deep: string; foam?: string; size?: number };
  shadowStrength?: number;      // 0..1, hemisphere-vs-sun balance for shadows (lower = softer)
}

export interface EnvLook {
  kind: SkyKind;
  sunDir: THREE.Vector3;
  sun: { color: string; intensity: number; shadows: boolean };
  hemi: { sky: string; ground: string; intensity: number };
  fog: { color: string; near: number; far: number };
  sky: { turbidity: number; rayleigh: number; mie: number; mieG: number; top: string; bottom: string; horizon: string; stars: number; moon: boolean; aurora: boolean; clouds: number; planet: ThemeLookFx['planet'] | null };
  exposure: number; envIntensity: number; rimBoost: number; bloom: number | null;
  headlights: boolean; ambient: AmbientKind; wind: number; wet: number;
  grade: { slope: number; saturation: number; tint: string; offset: number; power: number; shadows: string; highlights: string };
  water: ThemeLookFx['water'] | null;
}

/** Minimal view of the ThemeKit this module needs (kept structural so kit.ts stays the source of truth). */
export interface KitLike {
  id: string;
  data: ThemeDataDef;
  look: {
    sky: { turbidity: number; rayleigh: number; elevationDeg: number; azimuthDeg: number; exposure: number; night?: boolean; top?: string; bottom?: string };
    sun: { color: string; intensity: number };
    hemi: { sky: string; ground: string; intensity: number };
    fogColor?: string;
  } & ThemeLookFx;
  grade?: { slope: number; saturation: number };
}

const KIND_DEFAULTS: Record<SkyKind, Partial<EnvLook> & { elev: number; hemiK: number; sunK: number; sunColor: string; top: string; bottom: string; horizon: string }> = {
  day: { elev: 52, hemiK: 1, sunK: 1, sunColor: '#fff4e0', top: '#4d8fd8', bottom: '#cfe6ff', horizon: '#e8f3ff', exposure: 1, envIntensity: 0.55, rimBoost: 1 },
  goldenHour: { elev: 16, hemiK: 0.95, sunK: 1, sunColor: '#ffd29a', top: '#6a8fd0', bottom: '#ffd6a8', horizon: '#ffe2bc', exposure: 1.02, envIntensity: 0.55, rimBoost: 1.15 },
  sunset: { elev: 7, hemiK: 0.9, sunK: 0.9, sunColor: '#ffa066', top: '#4b3d7a', bottom: '#ff9a5a', horizon: '#ffb477', exposure: 1.05, envIntensity: 0.6, rimBoost: 1.3 },
  overcast: { elev: 45, hemiK: 1.5, sunK: 0.35, sunColor: '#eef2f7', top: '#9fb0c2', bottom: '#dfe6ee', horizon: '#eef2f6', exposure: 1.05, envIntensity: 0.7, rimBoost: 1.1 },
  night: { elev: 38, hemiK: 0.55, sunK: 0.28, sunColor: '#a8c0ff', top: '#070818', bottom: '#2a2450', horizon: '#3a3570', exposure: 1.15, envIntensity: 0.35, rimBoost: 1.9 },
  aurora: { elev: 42, hemiK: 0.55, sunK: 0.3, sunColor: '#b8d4ff', top: '#040a1c', bottom: '#12305a', horizon: '#1e4a6e', exposure: 1.15, envIntensity: 0.35, rimBoost: 1.9 },
  // a weak overhead key (work lamps) keeps road relief and kart shapes readable under the vault
  underground: { elev: 80, hemiK: 1.0, sunK: 0.3, sunColor: '#ffb070', top: '#0d0a09', bottom: '#2a1a14', horizon: '#3a2418', exposure: 1.2, envIntensity: 0.25, rimBoost: 1.7 },
  space: { elev: 35, hemiK: 0.45, sunK: 1.05, sunColor: '#ffffff', top: '#02030a', bottom: '#0b1026', horizon: '#18204a', exposure: 1.05, envIntensity: 0.4, rimBoost: 1.6 },
};

const AMBIENT_BY_THEME: Record<string, AmbientKind> = {
  frostbyte_glacier: 'snow', canopy_forest: 'leaves', lantern_hollow: 'fireflies', ember_mine: 'embers', sunstone_desert: 'dust',
  coral_cove: 'motes', neon_harbor: 'rain', orbital_nexus: 'stars', clayhill_village: 'petals', spark_circuit: 'motes',
};

const num = (s: string | undefined): number | undefined => (s !== undefined && s !== '' && Number.isFinite(Number(s)) ? Number(s) : undefined);
const SKY_KINDS: readonly SkyKind[] = ['day', 'goldenHour', 'sunset', 'overcast', 'night', 'underground', 'space', 'aurora'];

/** Sun elevation (deg) for a local hour on a clear day. */
export function elevationForHour(h: number): number { return Math.max(3, 62 * Math.sin((Math.PI * (h - 6)) / 12)); }

export function resolveEnvLook(kit: KitLike, trackTheme: Record<string, string> = {}): EnvLook {
  const L = kit.look, d = kit.data;
  const trackSky = trackTheme['sky'] as SkyKind | undefined;
  const kind: SkyKind = (trackSky && SKY_KINDS.includes(trackSky) ? trackSky : undefined) ?? L.skyKind ?? (L.sky.night ? 'night' : d.sky);
  const K = KIND_DEFAULTS[kind];
  // sun direction: track time → kit hour → kit elevation (kits authored for their theme default) → content sunDir
  const tTime = trackTheme['time'];
  const hour = tTime ? Number(tTime.split(':')[0]) + Number(tTime.split(':')[1] ?? 0) / 60 : undefined;
  const kitElevMatchesKind = !trackSky || trackSky === (L.skyKind ?? d.sky);
  let elev: number;
  if (hour !== undefined && Number.isFinite(hour)) elev = elevationForHour(hour);
  else if (L.hour !== undefined) elev = elevationForHour(L.hour);
  else if (kitElevMatchesKind && L.sky.elevationDeg !== undefined) elev = L.sky.elevationDeg;
  else elev = K.elev;
  if (kind === 'sunset') elev = Math.min(elev, 10);
  if (kind === 'goldenHour') elev = Math.min(elev, 22);
  const sd = d.sunDir;
  const az = L.sky.azimuthDeg !== undefined ? THREE.MathUtils.degToRad(L.sky.azimuthDeg) : Math.atan2(sd[0], sd[2]);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - THREE.MathUtils.degToRad(elev), az);
  const fogNear = num(trackTheme['fogNear']) ?? L.fog?.near ?? d.fog.near;
  const fogFar = num(trackTheme['fogFar']) ?? L.fog?.far ?? d.fog.far;
  const dayLike = kind === 'day' || kind === 'goldenHour' || kind === 'sunset';
  const headTrack = trackTheme['headlights'];
  const g = L.grade ?? {};
  const kg = kit.grade ?? { slope: 1.05, saturation: 1.1 };
  return {
    kind, sunDir,
    sun: { color: dayLike ? L.sun.color : K.sunColor, intensity: (dayLike ? L.sun.intensity : 2.6 * K.sunK), shadows: K.sunK > 0.2 },
    hemi: { sky: L.hemi.sky, ground: L.hemi.ground, intensity: L.hemi.intensity * (dayLike ? 1 : K.hemiK) },
    fog: { color: L.fog?.color ?? L.fogColor ?? d.fog.color, near: fogNear, far: fogFar },
    sky: {
      turbidity: L.sky.turbidity, rayleigh: L.sky.rayleigh, mie: kind === 'sunset' ? 0.006 : 0.004, mieG: 0.82,
      top: L.sky.top ?? K.top, bottom: L.sky.bottom ?? K.bottom, horizon: L.horizon ?? K.horizon,
      stars: L.stars ?? (kind === 'night' || kind === 'aurora' ? 0.8 : kind === 'space' ? 1 : 0),
      moon: L.moon ?? (kind === 'night' || kind === 'aurora'),
      aurora: L.aurora ?? kind === 'aurora',
      clouds: L.clouds ?? (kind === 'overcast' ? 0.85 : 0),
      planet: L.planet ?? (kind === 'space' ? { color: '#c9a27a', ring: '#e8d8c0', dir: [-0.5, 0.35, -0.8], size: 0.16 } : null),
    },
    exposure: L.exposure ?? (L.sky.exposure !== undefined && dayLike ? L.sky.exposure : K.exposure ?? 1),
    envIntensity: L.envIntensity ?? K.envIntensity ?? 0.55,
    rimBoost: L.rimBoost ?? K.rimBoost ?? 1,
    bloom: L.bloom ?? null,
    headlights: headTrack !== undefined ? headTrack === 'on' || headTrack === 'true' : L.headlights ?? d.headlights,
    ambient: (trackTheme['ambient'] as AmbientKind | undefined) ?? L.ambient ?? (trackTheme['weather'] === 'rain' ? 'rain' : AMBIENT_BY_THEME[kit.id] ?? 'none'),
    wind: L.wind ?? 1,
    wet: num(trackTheme['wet']) ?? L.wet ?? (trackTheme['weather'] === 'rain' ? 0.8 : 0),
    grade: {
      slope: g.slope ?? kg.slope, saturation: g.saturation ?? kg.saturation, tint: g.tint ?? '#ffffff', offset: g.offset ?? 0, power: g.power ?? 1,
      shadows: g.shadows ?? (kind === 'night' || kind === 'aurora' || kind === 'underground' ? '#dfe6ff' : '#eef2ff'),
      highlights: g.highlights ?? (kind === 'sunset' || kind === 'goldenHour' ? '#fff0de' : '#fff8f0'),
    },
    water: L.water ?? null,
  };
}
