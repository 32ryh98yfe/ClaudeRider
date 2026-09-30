// Deterministic dedupe keys for cosmetic events (so rollback re-simulation does not duplicate SFX/VFX).
export function evKey(tick: number, type: number, a: number, b = 0): number {
  let h = Math.imul(tick | 0, 0x9e3779b1) ^ Math.imul(type + 1, 0x85ebca6b) ^ Math.imul(a + 7, 0xc2b2ae35) ^ Math.imul(b + 13, 0x27d4eb2f);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
}
