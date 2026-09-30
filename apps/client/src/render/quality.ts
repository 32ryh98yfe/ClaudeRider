// Quality tiers (docs/design/40-perf-budgets.md).
export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';
export interface TierSettings { dprCap: number; shadowSize: number; bloom: boolean; fxaa: boolean; particles: number; drawBudget: number }

/** Dev overrides: ?bloom=0|1 &shadows=<size> &fxaa=0|1 &dpr=<cap>. */
export function tierSettings(t: QualityTier): TierSettings {
  const base = baseSettings(t);
  const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search);
  if (!q) return base;
  const num = (k: string): number | null => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : null);
  const b = num('bloom'), sh = num('shadows'), fx = num('fxaa'), dpr = num('dpr');
  return { ...base, ...(b !== null && { bloom: b !== 0 }), ...(sh !== null && { shadowSize: sh }), ...(fx !== null && { fxaa: fx !== 0 }), ...(dpr !== null && { dprCap: dpr }) };
}

function baseSettings(t: QualityTier): TierSettings {
  switch (t) {
    case 'low': return { dprCap: 1.0, shadowSize: 0, bloom: false, fxaa: true, particles: 0.3, drawBudget: 150 };
    case 'medium': return { dprCap: 1.25, shadowSize: 1024, bloom: true, fxaa: true, particles: 0.6, drawBudget: 250 };
    case 'high': return { dprCap: 1.5, shadowSize: 2048, bloom: true, fxaa: true, particles: 1, drawBudget: 400 };
    case 'ultra': return { dprCap: 2, shadowSize: 2048, bloom: true, fxaa: true, particles: 1.5, drawBudget: 600 };
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
