// Deterministic object ids (ADR-007 R7): projectile / hazard / effect ids are hashes of (type, owner, useTick, index),
// so the shooter's predicted object and the authority's object match without a handshake. Allocation-free (no rest
// parameters), unlike core/rng.hash32.

/** FNV-1a over four 32-bit words + murmur3 finalizer → uint32. */
export function mix4(a: number, b: number, c: number, d: number): number {
  let h = 0x811c9dc5 | 0;
  h = word(h, a); h = word(h, b); h = word(h, c); h = word(h, d);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

function word(h: number, x: number): number {
  let v = x | 0;
  for (let i = 0; i < 4; i++) { h ^= v & 0xff; h = Math.imul(h, 0x01000193); v >>>= 8; }
  return h;
}

/** Object id of the `index`-th projectile/hazard created by `owner` using item `code` at `useTick` (never 0). */
export const objectId = (code: number, owner: number, useTick: number, index: number): number => mix4(code, owner, useTick, index) || 1;
