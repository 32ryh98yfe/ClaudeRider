// Bake assertion: nothing non-finite may reach a .ctrk or .vis. A NaN vertex renders as a hole or a spike, and a NaN
// in collision data poisons the sim; JSON would even turn a NaN in the meta into a silent `null`. It is a compiler
// bug, never an authoring error, so the bake fails loudly with the first offending location.
import type { TypedArray } from '@cr/sim';

export class NonFiniteError extends Error {
  readonly where: string;
  constructor(where: string) {
    super(`non-finite value in ${where} (compiler bug: please report the track and this location)`);
    this.name = 'NonFiniteError';
    this.where = where;
  }
}

/** First non-finite number in a JSON-like value, as a dotted path, or null. */
export function findNonFiniteMeta(v: unknown, path = 'meta'): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? null : path;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const w = findNonFiniteMeta(v[i], `${path}[${i}]`); if (w) return w; } return null; }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) { const w = findNonFiniteMeta(x, `${path}.${k}`); if (w) return w; }
  }
  return null;
}

/** Throws NonFiniteError on the first NaN/±Infinity in the float arrays or the meta of a container about to be written. */
export function assertFinite(file: string, meta: unknown, arrays: readonly (readonly [string, TypedArray])[]): void {
  const m = findNonFiniteMeta(meta);
  if (m) throw new NonFiniteError(`${file} ${m}`);
  for (const [name, a] of arrays) {
    if (!(a instanceof Float32Array || a instanceof Float64Array)) continue;
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i]!)) throw new NonFiniteError(`${file} array ${name}[${i}] = ${a[i]}`);
  }
}
