// Deterministic integer PRNG (mulberry32). State is a uint32 stored in the world.
export function rngNext(state: { seq: number }): number {
  let a = (state.seq + 0x6d2b79f5) | 0;
  state.seq = a >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  a = (t ^ (t >>> 14)) >>> 0;
  return a / 4294967296;
}
/** Stateless hash of integers → uint32 (for derived ids / seeds). */
export function hash32(...xs: number[]): number {
  let h = 0x811c9dc5 | 0;
  for (const x of xs) {
    let v = x | 0;
    for (let i = 0; i < 4; i++) { h ^= v & 0xff; h = Math.imul(h, 0x01000193); v >>>= 8; }
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
