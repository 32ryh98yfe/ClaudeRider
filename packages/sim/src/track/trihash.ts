// FROZEN (contracts.lock). Deterministic sparse uniform grid over triangles (ADR-006 "TriHash").
// Build is used by trackc at bake time; queries run in the sim (allocation-free).

export interface TriHashData {
  ox: number; oy: number; oz: number;   // grid origin
  cs: number; cy: number;               // cell size XZ, cell size Y
  nx: number; ny: number; nz: number;   // grid dims
  keys: Float64Array;                   // sorted occupied cell keys
  starts: Uint32Array;                  // CSR offsets, length keys.length + 1
  tris: Uint32Array;                    // triangle ids
}

export function cellKey(h: TriHashData, ix: number, iy: number, iz: number): number {
  return ix + h.nx * (iy + h.ny * iz);
}

/** Build a hash over triangles given flat positions (xyz per vertex) and indices (3 per tri). */
export function buildTriHash(pos: Float64Array, idx: Uint32Array, cs = 4, cy = 8): TriHashData {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i]!, y = pos[i + 1]!, z = pos[i + 2]!;
    if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
  }
  if (!isFinite(minX)) { minX = minY = minZ = 0; maxX = maxY = maxZ = 1; }
  const ox = Math.floor(minX - 2), oy = Math.floor(minY - 2), oz = Math.floor(minZ - 2);
  const nx = Math.floor((maxX + 2 - ox) / cs) + 2, ny = Math.floor((maxY + 2 - oy) / cy) + 2, nz = Math.floor((maxZ + 2 - oz) / cs) + 2;
  const h: TriHashData = { ox, oy, oz, cs, cy, nx, ny, nz, keys: new Float64Array(0), starts: new Uint32Array(1), tris: new Uint32Array(0) };
  const map = new Map<number, number[]>();
  const nt = idx.length / 3;
  for (let t = 0; t < nt; t++) {
    const a = idx[t * 3]! * 3, b = idx[t * 3 + 1]! * 3, c = idx[t * 3 + 2]! * 3;
    const x0 = Math.min(pos[a]!, pos[b]!, pos[c]!), x1 = Math.max(pos[a]!, pos[b]!, pos[c]!);
    const y0 = Math.min(pos[a + 1]!, pos[b + 1]!, pos[c + 1]!), y1 = Math.max(pos[a + 1]!, pos[b + 1]!, pos[c + 1]!);
    const z0 = Math.min(pos[a + 2]!, pos[b + 2]!, pos[c + 2]!), z1 = Math.max(pos[a + 2]!, pos[b + 2]!, pos[c + 2]!);
    const ix0 = Math.floor((x0 - ox) / cs), ix1 = Math.floor((x1 - ox) / cs);
    const iy0 = Math.floor((y0 - oy) / cy), iy1 = Math.floor((y1 - oy) / cy);
    const iz0 = Math.floor((z0 - oz) / cs), iz1 = Math.floor((z1 - oz) / cs);
    for (let iz = iz0; iz <= iz1; iz++) for (let iy = iy0; iy <= iy1; iy++) for (let ix = ix0; ix <= ix1; ix++) {
      const k = cellKey(h, ix, iy, iz);
      let l = map.get(k);
      if (!l) { l = []; map.set(k, l); }
      l.push(t);
    }
  }
  const keys = [...map.keys()].sort((p, q) => p - q);
  h.keys = Float64Array.from(keys);
  h.starts = new Uint32Array(keys.length + 1);
  let total = 0;
  for (let i = 0; i < keys.length; i++) { h.starts[i] = total; total += map.get(keys[i]!)!.length; }
  h.starts[keys.length] = total;
  h.tris = new Uint32Array(total);
  let o = 0;
  for (const k of keys) for (const t of map.get(k)!) h.tris[o++] = t;
  return h;
}

/** Binary search: index of key k in h.keys, or -1. */
export function findCell(h: TriHashData, k: number): number {
  const keys = h.keys;
  let lo = 0, hi = keys.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = keys[mid]!;
    if (v === k) return mid;
    if (v < k) lo = mid + 1; else hi = mid - 1;
  }
  return -1;
}
