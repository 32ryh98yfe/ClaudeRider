// Deterministic math helpers (ADR-003): only + - * / sqrt abs min max floor round.
export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Rational approximation of exp(-k·dt) (≤0.175% rel. error for k ≤ 30/s at 60 Hz). */
export function decayF(k: number, dt: number): number {
  const x = k * dt;
  return 1 / (1 + x * (1 + x * (0.5 + x / 6)));
}

/** Polynomial sin/cos for small angles |a| ≤ 0.2 rad (5th/4th order Taylor). */
export function smallSin(a: number): number { const a2 = a * a; return a * (1 - (a2 / 6) * (1 - a2 / 20)); }
export function smallCos(a: number): number { const a2 = a * a; return 1 - (a2 / 2) * (1 - a2 / 12); }

/** Sine / cosine of an arbitrary angle via range reduction + repeated small-angle steps (deterministic). */
export function detSinCos(a: number, out: { s: number; c: number }): void {
  const TAU = 6.283185307179586;
  let x = a - TAU * Math.floor(a / TAU + 0.5); // [-pi, pi]
  let n = 1;
  while (x > 0.2 || x < -0.2) { x *= 0.5; n *= 2; }
  let s = smallSin(x), c = smallCos(x);
  while (n > 1) { const s2 = 2 * s * c; c = c * c - s * s; s = s2; n *= 0.5; }
  const l = Math.sqrt(s * s + c * c);
  out.s = s / l; out.c = c / l;
}

export interface V3 { x: number; y: number; z: number }
export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const dot3 = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): number => ax * bx + ay * by + az * bz;
export const len3 = (x: number, y: number, z: number): number => Math.sqrt(x * x + y * y + z * z);

/** Sine of a small angle given as a literal constant table (avoid Math.sin in sim). */
export const SIN = {
  d3: 0.05233595624294383, d4: 0.0697564737441253, d6: 0.10452846326765347, d8: 0.13917310096006544,
  d15: 0.25881904510252074, d18: 0.3090169943749474, d20: 0.3420201433256687, d35: 0.573576436351046,
  d37: 0.6018150231520483, d45: 0.7071067811865476, d55: 0.8191520442889918,
} as const;
export const COS110 = -0.3420201433256687;
