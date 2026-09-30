// Quality tiers (docs/design/40-perf-budgets.md §1, 30-art-bible.md §6).
// Every render system reads its knobs from here so a tier change is one table edit.
export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';
export type AaMode = 'none' | 'fxaa' | 'smaa' | 'msaa';

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
  engineVoices: number;        // detailed engine voices (player + near)
  drawBudget: number; triBudget: number; materialBudget: number;
}

/** Dev overrides: ?bloom=0|1|2(mips)|3(taps) &shadows=<size> &fxaa=0|1 &dpr=<cap> &aa=fxaa|smaa|msaa|none &ssao=0|1 &dynres=0|1 &blur=<taps>. */
export function tierSettings(t: QualityTier): TierSettings {
  const base = baseSettings(t);
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
  return out;
}

function baseSettings(t: QualityTier): TierSettings {
  switch (t) {
    case 'low': return {
      dprCap: 1.0, dynResMin: 0.7, shadowSize: 0, shadowFar: 80, bloom: true, bloomStrength: 0.8, bloomRadius: 0.4, bloomMode: 'taps', fxaa: true, aa: 'fxaa',
      blurTaps: 16, motionBlur: false, speedLines: false, chroma: 0, ssao: false, lut: false, particles: 0.25, foliage: 0.4, far: 600,
      lod: [20, 55], propFar: 160, triplanar: false, engineVoices: 2, drawBudget: 150, triBudget: 600_000, materialBudget: 40,
    };
    case 'medium': return {
      dprCap: 1.25, dynResMin: 1, shadowSize: 1024, shadowFar: 120, bloom: true, bloomStrength: 1.0, bloomRadius: 0.5, bloomMode: 'mips', fxaa: true, aa: 'smaa',
      blurTaps: 32, motionBlur: false, speedLines: true, chroma: 0.2, ssao: false, lut: true, particles: 0.6, foliage: 0.7, far: 800,
      lod: [25, 70], propFar: 260, triplanar: false, engineVoices: 3, drawBudget: 250, triBudget: 1_200_000, materialBudget: 40,
    };
    case 'high': return {
      dprCap: 1.5, dynResMin: 1, shadowSize: 2048, shadowFar: 200, bloom: true, bloomStrength: 1.0, bloomRadius: 0.5, bloomMode: 'mips', fxaa: false, aa: 'msaa',
      blurTaps: 32, motionBlur: false, speedLines: true, chroma: 0.3, ssao: true, lut: true, particles: 1, foliage: 1, far: 800,
      lod: [25, 70], propFar: 400, triplanar: true, engineVoices: 3, drawBudget: 400, triBudget: 2_000_000, materialBudget: 40,
    };
    case 'ultra': return {
      dprCap: 2, dynResMin: 1, shadowSize: 2048, shadowFar: 200, bloom: true, bloomStrength: 1.0, bloomRadius: 0.5, bloomMode: 'mips', fxaa: false, aa: 'msaa',
      blurTaps: 32, motionBlur: false, speedLines: true, chroma: 0.4, ssao: true, lut: true, particles: 1.5, foliage: 1, far: 1000,
      lod: [35, 90], propFar: 600, triplanar: true, engineVoices: 3, drawBudget: 600, triBudget: 3_000_000, materialBudget: 40,
    };
  }
}

export function pickTier(setting: string, backend: 'webgpu' | 'webgl2'): QualityTier {
  const q = new URLSearchParams(location.search).get('quality');
  if (q === 'low' || q === 'medium' || q === 'high' || q === 'ultra') return q;
  if (setting === 'low' || setting === 'medium' || setting === 'high' || setting === 'ultra') return setting;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
  if (backend === 'webgpu' && mem >= 8) return 'high';
  return mem >= 4 ? 'medium' : 'low';
}

/** Accessibility: reduced motion (settings) or the OS preference. */
export function prefersReducedMotion(setting: boolean): boolean {
  if (setting) return true;
  try { return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
