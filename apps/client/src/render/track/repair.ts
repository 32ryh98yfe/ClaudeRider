// Load-time repair of baked .vis data (render only; the sim never reads these arrays).

/**
 * Repairs non-finite terrain vertices in place (trackc wrote NaN heights ≥ 60 m from the track; see
 * docs/design/contract-requests/L11-terrain-nan.md). The terrain is a regular grid, so a NaN height takes the mean
 * of its finite grid neighbours (a few passes fill wider holes), and normals are rebuilt from the repaired
 * heightfield. Returns how many vertices were fixed; 0 once the compiler is fixed.
 */
export function repairTerrain(pos: Float32Array, nrm: Float32Array): number {
  let bad = 0, minY = Infinity;
  for (let v = 0; v < pos.length; v += 3) {
    if (!Number.isFinite(pos[v + 1]!) || !Number.isFinite(nrm[v]! + nrm[v + 1]! + nrm[v + 2]!)) bad++;
    else minY = Math.min(minY, pos[v + 1]!);
  }
  if (bad === 0) return 0;
  // grid step: smallest positive spacing between distinct x coordinates
  const xs = new Set<number>();
  for (let v = 0; v < pos.length; v += 3) xs.add(Math.round(pos[v]! * 10));
  const sx = [...xs].sort((a, b) => a - b);
  let step = Infinity;
  for (let i = 1; i < sx.length; i++) { const d = sx[i]! - sx[i - 1]!; if (d > 5 && d < step) step = d; }
  if (!Number.isFinite(step)) step = 80;
  const H = new Map<number, number>(), holes: [number, number][] = [];
  for (let v = 0; v < pos.length; v += 3) {
    const x = Math.round(pos[v]! * 10), z = Math.round(pos[v + 2]! * 10), y = pos[v + 1]!;
    if (Number.isFinite(y)) H.set(x * 1e7 + z, y);
    else if (!H.has(x * 1e7 + z)) holes.push([x, z]);
  }
  const at = (x: number, z: number): number | undefined => H.get(x * 1e7 + z);
  for (let pass = 0; pass < 8 && holes.length; pass++) {
    const filled: [number, number, number][] = [];
    for (let i = holes.length - 1; i >= 0; i--) {
      const [x, z] = holes[i]!;
      if (at(x, z) !== undefined) { holes.splice(i, 1); continue; }
      let sum = 0, n = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const y = at(x + dx * step, z + dz * step);
        if (y !== undefined) { sum += y; n++; }
      }
      if (n) { filled.push([x, z, sum / n]); holes.splice(i, 1); }
    }
    for (const [x, z, y] of filled) H.set(x * 1e7 + z, y);
  }
  for (const [x, z] of holes) H.set(x * 1e7 + z, Number.isFinite(minY) ? minY : 0);
  const c = step / 10;
  for (let v = 0; v < pos.length; v += 3) {
    const x = Math.round(pos[v]! * 10), z = Math.round(pos[v + 2]! * 10);
    const y = at(x, z)!;
    pos[v + 1] = y;
    const hx0 = at(x - step, z) ?? y, hx1 = at(x + step, z) ?? y, hz0 = at(x, z - step) ?? y, hz1 = at(x, z + step) ?? y;
    const nx = hx0 - hx1, ny = 2 * c, nz = hz0 - hz1, l = Math.hypot(nx, ny, nz);
    nrm[v] = nx / l; nrm[v + 1] = ny / l; nrm[v + 2] = nz / l;
  }
  return bad;
}

