// Seeded randomness for bots (14-ai §1: AI code may use trig, never Math.random).
// mulberry32 in a class so the state lives in an object field: no closure, no per-call allocation.

export class AiRng {
  private a: number;
  constructor(seed: number) { this.a = seed >>> 0; }

  /** Uniform [0, 1). */
  next(): number {
    this.a = (this.a + 0x6d2b79f5) | 0;
    let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [lo, hi] (inclusive). */
  int(lo: number, hi: number): number { return lo + Math.floor(this.next() * (hi - lo + 1)); }

  /** Uniform real in [lo, hi). */
  range(lo: number, hi: number): number { return lo + (hi - lo) * this.next(); }

  /** Standard normal (Box–Muller, one value per call). */
  gauss(): number {
    const u = this.next(), v = this.next();
    return Math.sqrt(-2 * Math.log(u > 1e-12 ? u : 1e-12)) * Math.cos(2 * Math.PI * v);
  }
}

/** Integer mix of a few values into a uint32 seed (FNV-1a over 32-bit words + avalanche). */
export function mixSeed(a: number, b = 0, c = 0, d = 0): number {
  let h = 0x811c9dc5 | 0;
  h = Math.imul(h ^ (a | 0), 0x01000193);
  h = Math.imul(h ^ (b | 0), 0x01000193);
  h = Math.imul(h ^ (c | 0), 0x01000193);
  h = Math.imul(h ^ (d | 0), 0x01000193);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

/** Stateless uniform [0, 1) from integers (per-corner, per-lap rolls that must not depend on call order). */
export function hashUnit(a: number, b = 0, c = 0, d = 0): number { return mixSeed(a, b, c, d) / 4294967296; }
