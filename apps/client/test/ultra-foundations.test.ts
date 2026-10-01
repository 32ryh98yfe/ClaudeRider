// Ultra graphics foundations (33-ultra-graphics): tier matrix + backend gates, auto tier pick, lazy systems registry,
// and the ACES display transform calibrated against the previous Neutral look.
import { describe, it, expect } from 'vitest';
import { tierSettings, withUserPrefs, pickTier, type QualityTier } from '../src/render/quality.ts';
import { loadSystems } from '../src/render/systems/registry.ts';
import type { FrameContext } from '../src/render/systems/types.ts';
import { ACES_EXPOSURE, ACES_SATURATION } from "../src/render/engine/tone.ts";

const TIERS: QualityTier[] = ['low', 'medium', 'high', 'ultra'];

describe('tier matrix', () => {
  it('Low and Medium keep every cinematic feature off (CI renders Low on SwiftShader)', () => {
    for (const t of ['low', 'medium'] as const) {
      const ts = tierSettings(t, 'webgl2');
      expect(ts.systems).toBe(false);
      expect(ts.csm).toBeNull();
      expect(ts.prepass).toBe(false);
      expect(ts.velocityBlur).toBeNull();
      expect(ts.volumetric).toBeNull();
      expect(ts.grass).toBeNull();
      expect(ts.terrain).toBe('baked');
      expect(ts.bloomThreshold).toBe(0);
      expect(ts.aa).not.toBe('traa');
    }
    expect(tierSettings('low', 'webgl2').shadowTech).toBe('none');
    expect(tierSettings('low', 'webgl2').matProfile).toBe('lq');
  });

  it('Ultra turns every feature on; High runs the cheaper versions', () => {
    const u = tierSettings('ultra', 'webgpu'), h = tierSettings('high', 'webgpu');
    expect(u.csm?.cascades).toBe(4);
    expect(h.csm?.cascades).toBe(3);
    expect(u.shadowFilter).toBe('pcss');
    expect(u.aa).not.toBe('none');
    expect(u.prepass).toBe(true);
    expect(u.aoMode).toBe('prepass');
    expect(u.velocityBlur).not.toBeNull();
    expect(u.dof).toBe('cinematic');
    expect(u.terrain).toBe('clipmap');
    expect((u.grass?.near ?? 0) + (u.grass?.far ?? 0)).toBe(500_000);
    expect(u.bloomThreshold).toBe(0.8);
    expect(u.bloomStrength).toBe(0.4);
    expect(h.bloomThreshold).toBe(0.8);
    expect(h.terrain).toBe('hybrid');
    expect(h.prepass).toBe(false);
  });

  it('PCSS falls back to PCF on WebGL2 (no raw depth reads from a compare texture there)', () => {
    const u = tierSettings('ultra', 'webgl2');
    expect(u.shadowFilter).toBe('pcf');
    expect(u.pcfRadius).toBeGreaterThanOrEqual(2);
  });

  it('WebGPU High swaps MSAA for SMAA (no textureGather on multisampled depth for GTAO)', () => {
    expect(tierSettings('high', 'webgpu').aa).toBe('smaa');
    expect(tierSettings('high', 'webgl2').aa).toBe('msaa');
  });

  it('player toggles: shadows off drops the cascades; velocity blur and DoF follow their settings', () => {
    const u = tierSettings('ultra', 'webgpu');
    const off = withUserPrefs(u, { shadows: 'off', velocityBlur: 'off', dof: 'off' });
    expect(off.csm).toBeNull(); expect(off.shadowTech).toBe('none'); expect(off.velocityBlur).toBeNull(); expect(off.dof).toBe('off');
    const tier = withUserPrefs(u, { velocityBlur: 'tier', dof: 'tier' });
    expect(tier.velocityBlur).toEqual(u.velocityBlur); expect(tier.dof).toBe('cinematic');
    // High has no velocity prepass, so 'on' cannot enable camera blur there
    expect(withUserPrefs(tierSettings('high', 'webgpu'), { velocityBlur: 'on' }).velocityBlur).toBeNull();
  });

  it('every tier has a budget and a material cap of 40', () => {
    for (const t of TIERS) { const ts = tierSettings(t, 'webgpu'); expect(ts.materialBudget).toBe(40); expect(ts.drawBudget).toBeGreaterThan(0); }
  });
});

describe('auto tier', () => {
  it('auto keeps High on desktop WebGPU while Ultra is opt-in', () => {
    expect(pickTier('auto', 'webgpu', { deviceMemory: 8 })).toBe('high');
    expect(pickTier('auto', 'webgpu', {})).toBe('high');
    expect(pickTier('auto', 'webgpu', { mobile: true, deviceMemory: 8 })).toBe('high');
    expect(pickTier('auto', 'webgpu', { fallbackAdapter: true })).toBe('high');
    expect(pickTier('auto', 'webgpu', { deviceMemory: 4 })).toBe('medium');
    expect(pickTier('auto', 'webgl2', { deviceMemory: 8 })).toBe('medium');
    expect(pickTier('auto', 'webgl2', { deviceMemory: 2 })).toBe('low');
  });
  it('an explicit choice always wins', () => {
    expect(pickTier('low', 'webgpu', {})).toBe('low');
    expect(pickTier('ultra', 'webgl2', { mobile: true })).toBe('ultra');
  });
});

describe('systems registry', () => {
  it('loads nothing when the tier has no systems (Low/Medium never fetch a system chunk)', async () => {
    const ctx = { ts: tierSettings('low', 'webgl2') } as unknown as FrameContext;
    expect(await loadSystems(ctx)).toEqual([]);
  });
});

// ---- display transform: CPU mirrors of three's ACESFilmic (ToneMappingFunctions.js) and Neutral tone mapping ----
const lin = (h: string): number[] => [1, 3, 5].map((i) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const enc = (c: number[]): number[] => c.map((x0) => { const x = Math.min(1, Math.max(0, x0)); return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; });
const mul = (m: number[], v: number[]): number[] => [m[0]! * v[0]! + m[1]! * v[1]! + m[2]! * v[2]!, m[3]! * v[0]! + m[4]! * v[1]! + m[5]! * v[2]!, m[6]! * v[0]! + m[7]! * v[1]! + m[8]! * v[2]!];
const IN = [0.59719, 0.35458, 0.04823, 0.076, 0.90834, 0.01566, 0.0284, 0.13383, 0.83777];
const OUT = [1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602];
const rrt = (v: number[]): number[] => v.map((x) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081));
const aces = (c: number[], e: number): number[] => mul(OUT, rrt(mul(IN, c.map((x) => (x * e) / 0.6)))).map((x) => Math.min(1, Math.max(0, x)));
const neutral = (c0: number[]): number[] => {
  let c = c0.slice();
  const x = Math.min(...c), off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c = c.map((v) => v - off);
  const peak = Math.max(...c), S = 0.76;
  if (peak < S) return c;
  const d = 1 - S, np = 1 - (d * d) / (peak + d - S);
  c = c.map((v) => (v * np) / peak);
  const g = 1 - 1 / (0.15 * (peak - np) + 1);
  return c.map((v) => v + (np - v) * g);
};
const oklab = (srgb: number[]): number[] => {
  const c = srgb.map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * c[0]! + 0.5363325363 * c[1]! + 0.0514459929 * c[2]!), m = Math.cbrt(0.2119034982 * c[0]! + 0.6806995451 * c[1]! + 0.1073969566 * c[2]!), s = Math.cbrt(0.0883024619 * c[0]! + 0.2817188376 * c[1]! + 0.6299787005 * c[2]!);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const dE = (a: number[], b: number[]): number => { const A = oklab(a), B = oklab(b); return Math.hypot(A[0]! - B[0]!, A[1]! - B[1]!, A[2]! - B[2]!); };
const sat = (c: number[], s: number): number[] => { const l = 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!; return c.map((v) => Math.max(0, l + (v - l) * s)); };

describe('ACES display transform', () => {
  it('keeps the brand orange and the road/grass/sky swatches close to the previous Neutral look at normal lighting', () => {
    const swatches = ['#D87656', '#D97757', '#474a52', '#5a5e67', '#76ad4f', '#4d8fd8', '#e84a3c'];
    let sum = 0, n = 0;
    for (const h of swatches) for (const k of [0.6, 0.9, 1.2]) {
      const c = lin(h).map((x) => x * k);
      const d = dE(enc(neutral(c)), sat(enc(aces(c, ACES_EXPOSURE)), ACES_SATURATION));
      expect(d).toBeLessThan(0.045);
      sum += d; n++;
    }
    expect(sum / n).toBeLessThan(0.02);
    // the brand orange itself within 0.03 at 0.6–1.2× lighting
    for (const k of [0.6, 0.9, 1.2]) { const c = lin('#D87656').map((x) => x * k); expect(dE(enc(neutral(c)), sat(enc(aces(c, ACES_EXPOSURE)), ACES_SATURATION))).toBeLessThan(0.03); }
  });
  it('rolls highlights off more softly than Neutral (the filmic shoulder the brief asks for)', () => {
    const hot = [4, 4, 4];
    expect(enc(aces(hot, ACES_EXPOSURE))[0]).toBeLessThan(1);
  });
});
