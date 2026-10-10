// Compiler output precision, independent of host architecture. ARM64/x64 libm results can differ in their last
// double bits. Selected coordinate metadata and UVs use 1e-9 precision; near-zero normals and AI angles collapse to zero. Positions retain float32 precision.
// These policies apply at serialization/welding boundaries, never to simulation state or design calculations.
const META_SCALE = 1_000_000_000;
const FLOAT_ZERO = 1e-10;

export function canonicalNumber(value: number): number {
  // Preserve exact integer ids, counters and non-finites (assertFinite must still reject the latter).
  if (!Number.isFinite(value) || Number.isInteger(value)) return value === 0 ? 0 : value;
  const rounded = Math.round(value * META_SCALE) / META_SCALE;
  return rounded === 0 ? 0 : rounded;
}

export function canonicalF32(value: number): number {
  return Math.abs(value) < FLOAT_ZERO ? 0 : Math.fround(value);
}

/** Copy selected JSON coordinate metadata. Do not apply to route lengths, ds, key gates or timing tables. */
export function canonicalMetadata<T>(value: T): T {
  if (typeof value === 'number') return canonicalNumber(value) as T;
  if (Array.isArray(value)) return value.map((part: unknown) => canonicalMetadata(part)) as T;
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, part]) => [key, canonicalMetadata(part)])) as T;
  return value;
}
