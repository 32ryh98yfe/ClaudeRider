// Quality tiers (docs/design/40-perf-budgets.md §1, 30-art-bible.md §6, 33-ultra-graphics.md).
// Every render system reads its knobs from here so a tier change is one table edit.
// Low and Medium keep their passes (CI renders Low on SwiftShader); High adds the cheaper versions of the
// cinematic features and Ultra runs every feature at full quality (the user asked for no performance limits).
export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';
export type AaMode = 'none' | 'fxaa' | 'smaa' | 'msaa' | 'traa';
export type Backend = 'webgpu' | 'webgl2';

/** Cascaded sun shadows (three's CSMShadowNode). `lambda` blends uniform (0) and logarithmic (1) splits. */
export interface CsmSettings { cascades: number; mapSize: number; maxFar: number; lambda: number; fade: boolean; margin: number }
/** Half-resolution froxel-free raymarch that corrects the analytic fog with shadowed in-scatter and noise density. */
export interface VolumetricSettings { steps: number; scale: number; maxDist: number }
/** Geometry clipmap: `levels` nested rings of `n`×`n` quads, finest quad `spacing` m (each level doubles it). */
export interface ClipmapSettings { levels: number; n: number; spacing: number }
/** GPU-placed grass: `near` blades within `nearR` m, `far` tufts out to `farR` m. */
export interface GrassSettings { near: number; nearR: number; far: number; farR: number }
/** Reconstruction-filter motion blur (McGuire 2012): gather `samples`, tile size in CSS px, shutter in seconds. */
export interface VelocityBlurSettings { samples: number; tilePx: number; shutter: number }

export interface TierSettings {
  dprCap: number;
  /** Dynamic-resolution floor for the scene pass (1 = disabled). */
  dynResMin: number;
  shadowSize: number;          // 0 = no sun shadows
  shadowFar: number;           // half-extent of the sun shadow frustum (m)
  bloom: boolean; bloomStrength: number; bloomRadius: number;
  /** 'mips' = BloomNode (5-mip chain, +12 passes); 'taps' = 12-tap glow inside the composite pass (Low). */
  bloomMode: 'mips' | 'taps';
  fxaa: boolean;               // kept for older call sites: true when aa is fxaa or smaa
  aa: AaMode;
  blurTaps: number;            // boost radial blur taps (0 = off)
  motionBlur: boolean;         // velocity motion blur instead of radial (High+)
  speedLines: boolean;
  chroma: number;              // max chromatic aberration while boosting (TSL units)
  ssao: boolean;               // light GTAO (half res)
  lut: boolean;                // extra split-tone grade stage
  particles: number;           // particle budget multiplier
  foliage: number;             // scatter density multiplier
  far: number;                 // camera far plane (m)
  lod: [number, number];       // kart LOD1 / LOD2 switch distances (m)
  propFar: number;             // small props are hidden beyond this distance (m)
  triplanar: boolean;          // terrain triplanar detail
  liteEnv: boolean;            // gradient day sky instead of SkyMesh, no PMREM (Low: fewer / smaller shaders)
  engineVoices: number;        // detailed engine voices (player + near)
  drawBudget: number; triBudget: number; materialBudget: number;
  // ---- cinematic features (33-ultra-graphics.md); Low/Medium leave them off ----
  /** Load the per-frame systems in render/systems/*.system.ts (terrain clipmap, grass, forest, weather). */
  systems: boolean;
  shadowTech: 'none' | 'single' | 'csm';
  csm: CsmSettings | null;
  /** 'pcss' needs raw depth reads from the compare texture, which only the WebGPU backend allows (gated in tierSettings). */
  shadowFilter: 'pcf' | 'pcss';
  pcfRadius: number;
  contactShadows: boolean;
  /** 'post' multiplies GTAO into the image (High); 'prepass' feeds it to indirect light only (Ultra). */
  aoMode: 'off' | 'post' | 'prepass';
  /** Opaque normal/velocity/depth prepass (Ultra: AO, contact shadows, TRAA, motion blur, DoF read it). */
  prepass: boolean;
  sharpen: number;
  velocityBlur: VelocityBlurSettings | null;
  /** 'showcase' = lobby/garage only; 'cinematic' = also intro, grid, finish and results (never while racing). */
  dof: 'off' | 'showcase' | 'cinematic';
  /** 0 = selective bloom of the emissive MRT only; > 0 = luminance threshold on the exposed HDR image. */
  bloomThreshold: number;
  sky: 'gradient' | 'preetham' | 'atmosphere';
  fog: 'linear' | 'aerial';
  volumetric: VolumetricSettings | null;
  /** 'hybrid' keeps the baked mesh and draws the clipmap only outside it. */
  terrain: 'baked' | 'hybrid' | 'clipmap';
  clipmap: ClipmapSettings | null;
  grass: GrassSettings | null;
  forest: number;              // far-field instanced trees
  weather: number;             // ambient weather particles
  matProfile: 'lq' | 'hq' | 'uq';
  ocean: boolean;              // clipmap ocean instead of the flat water plane
}

/** Cinematic fields for Low and Medium: everything off, so their passes stay exactly as before. */
const NO_CINEMA = {
  systems: false, shadowTech: 'single', csm: null, shadowFilter: 'pcf', pcfRadius: 1, contactShadows: false, aoMode: 'off', prepass: false, sharpen: 0,
  velocityBlur: null, dof: 'off', bloomThreshold: 0, sky: 'preetham', fog: 'linear', volumetric: null, terrain: 'baked', clipmap: null, grass: null,
  forest: 0, weather: 0, ocean: false,
} as const satisfies Partial<TierSettings>;

let activeBackend: Backend = 'webgl2';
/** The Stage records the backend it got, so tier settings can gate WebGPU-only features. */
export function setActiveBackend(b: Backend): void { activeBackend = b; }
export function getActiveBackend(): Backend { return activeBackend; }

/**
 * Dev overrides: ?bloom=0|1|2(mips)|3(taps) &shadows=<size> &fxaa=0|1 &dpr=<cap> &aa=fxaa|smaa|msaa|traa|none &ssao=0|1
 * &dynres=0|1 &blur=<taps>; cinematic: &csm=0|<cascades> &grass=<multiplier> &clip=0|1 &vol=0|1 &traa=0|1 &mb=0|1 &dof=0|1
 * &gfx=smoke (tiny counts and maps with every code path kept, for software-GL checks).
 */
export function tierSettings(t: QualityTier, backend: Backend = activeBackend): TierSettings {
  const base = gate(baseSettings(t), backend);
  const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search);
  if (!q) return base;
  const num = (k: string): number | null => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : null);
  const out: TierSettings = { ...base };
  const b = num('bloom'), sh = num('shadows'), fx = num('fxaa'), dpr = num('dpr'), ao = num('ssao'), dyn = num('dynres'), blur = num('blur');
  if (b !== null) { out.bloom = b !== 0; if (b === 2) out.bloomMode = 'mips'; if (b === 3) out.bloomMode = 'taps'; }
  if (sh !== null) out.shadowSize = sh;
  if (fx !== null) { out.fxaa = fx !== 0; out.aa = fx !== 0 ? (out.aa === 'none' ? 'fxaa' : out.aa) : 'none'; }
  const aa = q.get('aa');
  if (aa === 'fxaa' || aa === 'smaa' || aa === 'msaa' || aa === 'none') { out.aa = aa; out.fxaa = aa === 'fxaa' || aa === 'smaa'; }
  if (dpr !== null) out.dprCap = dpr;
  if (ao !== null) out.ssao = ao !== 0;
  if (dyn !== null) out.dynResMin = dyn !== 0 ? Math.min(out.dynResMin, 0.7) : 1;
  if (blur !== null) out.blurTaps = Math.max(0, Math.round(blur));
  const csm = num('csm'), grass = num('grass'), clip = num('clip'), vol = num('vol'), traa = num('traa'), mb = num('mb'), dof = num('dof');
  if (csm !== null) {
    if (csm <= 0) { out.shadowTech = out.shadowSize > 0 ? 'single' : 'none'; out.csm = null; }
    else { out.shadowTech = 'csm'; out.csm = { ...(out.csm ?? CSM_HIGH), cascades: Math.min(4, Math.max(1, Math.round(csm))) }; }
  }
  if (grass !== null) out.grass = grass <= 0 ? null : scaleGrass(out.grass ?? GRASS_HIGH, grass);
  if (clip !== null) { out.terrain = clip ? (out.terrain === 'baked' ? 'hybrid' : out.terrain) : 'baked'; out.clipmap = clip ? out.clipmap ?? CLIP_HIGH : null; out.systems = out.systems || !!clip; }
  if (vol !== null) out.volumetric = vol ? out.volumetric ?? VOL_ULTRA : null;
  if (traa !== null) { out.aa = traa ? 'traa' : out.aa === 'traa' ? 'msaa' : out.aa; out.fxaa = out.aa === 'fxaa' || out.aa === 'smaa'; }
  if (mb !== null) out.velocityBlur = mb ? out.velocityBlur ?? MB_ULTRA : null;
  if (dof !== null) out.dof = dof ? 'cinematic' : 'off';
  if (q.get('gfx') === 'smoke') smoke(out);
  return gate(out, backend);
}

/**
 * Backend gates.
 * - PCSS reads raw depth from the shadow map, which WebGL2 forbids on a compare texture.
 * - WebGPU: GTAONode gathers from the scene depth, and WGSL has no textureGather for multisampled depth, so the High
 *   chain (MSAA + post GTAO) fails pipeline validation and loses the device. SMAA keeps edges smooth there instead.
 */
function gate(ts: TierSettings, backend: Backend): TierSettings {
  let out = ts;
  if (out.shadowFilter === 'pcss' && backend !== 'webgpu') out = { ...out, shadowFilter: 'pcf', pcfRadius: Math.max(out.pcfRadius, 2) };
  if (backend === 'webgpu' && out.aa === 'msaa' && out.ssao && out.aoMode !== 'prepass') out = { ...out, aa: 'smaa', fxaa: true };
  return out;
}

/** ?gfx=smoke: every cinematic path stays on, with counts and map sizes small enough for SwiftShader. */
function smoke(ts: TierSettings): void {
  if (ts.csm) ts.csm = { ...ts.csm, cascades: Math.min(2, ts.csm.cascades), mapSize: 512 };
  if (ts.shadowSize > 0) ts.shadowSize = Math.min(ts.shadowSize, 512);
  if (ts.volumetric) ts.volumetric = { ...ts.volumetric, steps: 8 };
  if (ts.clipmap) ts.clipmap = { ...ts.clipmap, levels: Math.min(4, ts.clipmap.levels), n: 31 };
  if (ts.grass) ts.grass = scaleGrass(ts.grass, 0.01);
  ts.forest = Math.min(ts.forest, 200); ts.weather = Math.min(ts.weather, 1000);
  if (ts.velocityBlur) ts.velocityBlur = { ...ts.velocityBlur, samples: 4 };
  ts.particles = Math.min(ts.particles, 0.25);
}

function scaleGrass(g: GrassSettings, k: number): GrassSettings {
  return { ...g, near: Math.max(64, Math.round(g.near * k)), far: Math.max(16, Math.round(g.far * k)) };
}

const CSM_HIGH: CsmSettings = { cascades: 3, mapSize: 2048, maxFar: 300, lambda: 0.7, fade: true, margin: 300 };
const CSM_ULTRA: CsmSettings = { cascades: 4, mapSize: 4096, maxFar: 600, lambda: 0.8, fade: true, margin: 400 };
const VOL_ULTRA: VolumetricSettings = { steps: 64, scale: 0.5, maxDist: 200 };
const CLIP_HIGH: ClipmapSettings = { levels: 5, n: 127, spacing: 2 };
const CLIP_ULTRA: ClipmapSettings = { levels: 7, n: 255, spacing: 1 };
const GRASS_HIGH: GrassSettings = { near: 150_000, nearR: 45, far: 0, farR: 45 };
const GRASS_ULTRA: GrassSettings = { near: 400_000, nearR: 70, far: 100_000, farR: 250 };
const MB_ULTRA: VelocityBlurSettings = { samples: 16, tilePx: 16, shutter: 1 / 120 };

function baseSettings(t: QualityTier): TierSettings {
  switch (t) {
    case 'low': return {
      dprCap: 1.0, dynResMin: 0.7, shadowSize: 0, shadowFar: 80, bloom: true, bloomStrength: 0.8, bloomRadius: 0.4, bloomMode: 'taps', fxaa: true, aa: 'fxaa',
      blurTaps: 16, motionBlur: false, speedLines: false, chroma: 0, ssao: false, lut: false, particles: 0.25, foliage: 0.4, far: 600,
      lod: [20, 55], propFar: 160, triplanar: false, liteEnv: true, engineVoices: 2, drawBudget: 150, triBudget: 600_000, materialBudget: 40,
      ...NO_CINEMA, shadowTech: 'none', sky: 'gradient', matProfile: 'lq',
    };
    case 'medium': return {
      dprCap: 1.25, dynResMin: 1, shadowSize: 1024, shadowFar: 120, bloom: true, bloomStrength: 1.0, bloomRadius: 0.5, bloomMode: 'mips', fxaa: true, aa: 'smaa',
      blurTaps: 32, motionBlur: false, speedLines: true, chroma: 0.2, ssao: false, lut: true, particles: 0.6, foliage: 0.7, far: 800,
      lod: [25, 70], propFar: 260, triplanar: false, liteEnv: false, engineVoices: 3, drawBudget: 250, triBudget: 1_200_000, materialBudget: 40,
      ...NO_CINEMA, matProfile: 'hq',
    };
    case 'high': return {
      dprCap: 1.5, dynResMin: 1, shadowSize: 2048, shadowFar: 200, bloom: true, bloomStrength: 0.4, bloomRadius: 0.55, bloomMode: 'mips', fxaa: false, aa: 'msaa',
      blurTaps: 32, motionBlur: false, speedLines: true, chroma: 0.3, ssao: true, lut: true, particles: 1, foliage: 1, far: 1500,
      lod: [25, 70], propFar: 400, triplanar: true, liteEnv: false, engineVoices: 3, drawBudget: 500, triBudget: 6_000_000, materialBudget: 40,
      systems: true, shadowTech: 'csm', csm: CSM_HIGH, shadowFilter: 'pcf', pcfRadius: 2, contactShadows: false, aoMode: 'post', prepass: false, sharpen: 0,
      velocityBlur: null, dof: 'showcase', bloomThreshold: 0.8, sky: 'preetham', fog: 'aerial', volumetric: null, terrain: 'hybrid', clipmap: CLIP_HIGH,
      grass: GRASS_HIGH, forest: 10_000, weather: 30_000, matProfile: 'hq', ocean: false,
    };
    case 'ultra': return {
      dprCap: 2, dynResMin: 1, shadowSize: 4096, shadowFar: 200, bloom: true, bloomStrength: 0.4, bloomRadius: 0.55, bloomMode: 'mips', fxaa: false, aa: 'traa',
      blurTaps: 32, motionBlur: true, speedLines: true, chroma: 0.25, ssao: true, lut: true, particles: 1.5, foliage: 1, far: 10_000,
      lod: [35, 90], propFar: 600, triplanar: true, liteEnv: false, engineVoices: 3, drawBudget: 800, triBudget: 30_000_000, materialBudget: 40,
      systems: true, shadowTech: 'csm', csm: CSM_ULTRA, shadowFilter: 'pcss', pcfRadius: 2, contactShadows: true, aoMode: 'prepass', prepass: true, sharpen: 0.2,
      velocityBlur: MB_ULTRA, dof: 'cinematic', bloomThreshold: 0.8, sky: 'atmosphere', fog: 'aerial', volumetric: VOL_ULTRA, terrain: 'clipmap', clipmap: CLIP_ULTRA,
      grass: GRASS_ULTRA, forest: 30_000, weather: 100_000, matProfile: 'uq', ocean: true,
    };
  }
}

/** Player overrides from Settings → Graphics (31-ui-spec §9; SettingsV1 L10 fields). */
export interface UserRenderPrefs {
  renderScale?: number; fpsCap?: number;
  shadows?: 'tier' | 'off' | 'on'; particles?: 'tier' | 'low' | 'high'; bloom?: 'tier' | 'off' | 'on'; motionBlur?: boolean;
  /** Camera/object motion blur (Ultra) and cinematic depth of field; 'tier' keeps the tier default. */
  velocityBlur?: 'tier' | 'off' | 'on'; dof?: 'tier' | 'off' | 'on';
}

/**
 * Tier settings with the player's overrides applied. `shadows`/`bloom`/`particles` fall back to the tier on 'tier';
 * `motionBlur` toggles the boost radial blur (speed lines and the FOV kick stay). Dev query flags still apply first.
 */
export function withUserPrefs(ts: TierSettings, p: UserRenderPrefs): TierSettings {
  const out: TierSettings = { ...ts };
  if (p.shadows === 'off') { out.shadowSize = 0; out.shadowTech = 'none'; out.csm = null; out.contactShadows = false; }
  else if (p.shadows === 'on' && out.shadowSize === 0) { out.shadowSize = 1024; out.shadowTech = 'single'; }
  if (p.bloom === 'off') out.bloom = false;
  else if (p.bloom === 'on') out.bloom = true;
  if (p.particles === 'low') out.particles = Math.max(0.15, ts.particles * 0.5);
  else if (p.particles === 'high') out.particles = Math.max(1, ts.particles);
  if (p.motionBlur === false) out.blurTaps = 0;
  else if (p.motionBlur === true) out.blurTaps = Math.max(16, ts.blurTaps);
  if (p.velocityBlur === 'off') out.velocityBlur = null;
  else if (p.velocityBlur === 'on' && !out.velocityBlur) out.velocityBlur = out.prepass ? MB_ULTRA : null; // needs the velocity prepass
  if (p.dof === 'off') out.dof = 'off';
  else if (p.dof === 'on' && out.dof !== 'cinematic') out.dof = out.prepass ? 'cinematic' : 'showcase';
  return out;
}

/** Device pixel ratio for the canvas: the tier cap times the player's render scale (0.5–1). */
export function pixelRatioFor(ts: TierSettings, p: UserRenderPrefs): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const scale = Math.min(1, Math.max(0.5, p.renderScale ?? 1));
  return Math.min(dpr, ts.dprCap) * scale;
}

/** Frame limiter for rAF loops: true when a frame should render at `now` under `cap` fps (0 = unlimited). */
export class FrameCap {
  private last = -1e9;
  cap = 0;
  ready(now: number): boolean {
    if (this.cap <= 0) return true;
    const step = 1000 / this.cap;
    if (now - this.last < step - 2) return false;      // 2 ms slack: a 60 cap on a 60 Hz display never drops frames
    this.last = now - Math.min(step, Math.max(0, now - this.last - step)); // keep cadence without drifting
    return true;
  }
}

/** Facts about the device that `pickTier` uses on 'auto' (filled from navigator / the WebGPU adapter by the Stage). */
export interface DeviceHints { mobile?: boolean; fallbackAdapter?: boolean; deviceMemory?: number }

const AUTO_KEY = 'cr.render.autoTier';
let lastPickAuto = false;
/** True when the current tier came from 'auto' (only then may a slow first race downgrade it). */
export function tierWasAuto(): boolean { return lastPickAuto; }

/**
 * Explicit choices (query, Settings) always win. On 'auto', Ultra needs WebGPU on a non-mobile, non-fallback adapter with
 * deviceMemory ≥ 8 (unknown counts as 8); a remembered downgrade (see `noteAutoFrameTime`) turns that into High.
 */
export function pickTier(setting: string, backend: Backend, hints: DeviceHints = deviceHints()): QualityTier {
  lastPickAuto = false;
  const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('quality');
  if (q === 'low' || q === 'medium' || q === 'high' || q === 'ultra') return q;
  if (setting === 'low' || setting === 'medium' || setting === 'high' || setting === 'ultra') return setting;
  lastPickAuto = true;
  const mem = hints.deviceMemory ?? 8;
  if (backend === 'webgpu' && mem >= 8 && !hints.mobile && !hints.fallbackAdapter) return autoDowngraded() ? 'high' : 'ultra';
  if (backend === 'webgpu' && mem >= 8) return 'high';
  return mem >= 4 ? 'medium' : 'low';
}

export function deviceHints(): DeviceHints {
  if (typeof navigator === 'undefined') return {};
  const nav = navigator as unknown as { deviceMemory?: number; userAgentData?: { mobile?: boolean }; maxTouchPoints?: number; userAgent: string };
  const ua = nav.userAgent ?? '';
  const iPad = /Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1;
  const mobile = nav.userAgentData?.mobile ?? (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || iPad);
  return { mobile, deviceMemory: nav.deviceMemory };
}

function autoDowngraded(): boolean {
  try {
    const v = JSON.parse(localStorage.getItem(AUTO_KEY) ?? 'null') as { ua: string; tier: QualityTier } | null;
    return !!v && v.ua === navigator.userAgent && v.tier === 'high';
  } catch { return false; }
}

/** After the first race on auto-Ultra: a p95 frame time above 33 ms remembers High for this browser (once). */
export function noteAutoFrameTime(tier: QualityTier, p95Ms: number): void {
  if (!lastPickAuto || tier !== 'ultra' || !(p95Ms > 33)) return;
  try { localStorage.setItem(AUTO_KEY, JSON.stringify({ ua: navigator.userAgent, tier: 'high' })); } catch { /* storage blocked */ }
}

/** Accessibility: reduced motion (settings) or the OS preference. */
export function prefersReducedMotion(setting: boolean): boolean {
  if (setting) return true;
  try { return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
