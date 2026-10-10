// Triangle soups used during the bake: every triangle owns its three vertices (pos, normal, s, d), so clipping and
// re-triangulation stay local. `weld()` turns a soup into indexed buffers at the end.

/** Per-vertex stride: x y z nx ny nz s d */
export const VS = 8;
/** The authored wall thickness is shared by visible top/outer faces and physical geometry. */
export const WALL_THICKNESS = 0.45;

export class TriSoup {
  v: number[] = [];       // 3 × VS floats per triangle
  surf: number[] = [];    // per triangle
  flg: number[] = [];
  path: number[] = [];
  role: number[] = [];
  get count(): number { return this.surf.length; }

  push(a: ArrayLike<number>, b: ArrayLike<number>, c: ArrayLike<number>, surf: number, flg: number, path: number, role: number): void {
    // drop degenerate triangles (area < 1e-8 m²)
    const e1x = b[0]! - a[0]!, e1y = b[1]! - a[1]!, e1z = b[2]! - a[2]!, e2x = c[0]! - a[0]!, e2y = c[1]! - a[1]!, e2z = c[2]! - a[2]!;
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
    if (cx * cx + cy * cy + cz * cz < 4e-16) return;
    for (let k = 0; k < VS; k++) this.v.push(a[k]!);
    for (let k = 0; k < VS; k++) this.v.push(b[k]!);
    for (let k = 0; k < VS; k++) this.v.push(c[k]!);
    this.surf.push(surf); this.flg.push(flg); this.path.push(path); this.role.push(role);
  }
  vert(t: number, k: number): number[] { const o = (t * 3 + k) * VS; return this.v.slice(o, o + VS); }
  /** Ground is one-sided. Tight row transitions can reverse tiny triangles; preserve the authored surface up. */
  orientGround(): number {
    let changed = 0;
    for (let t = 0; t < this.count; t++) {
      const o = t * 3 * VS, v = this.v;
      const ax = v[o + VS]! - v[o]!, ay = v[o + VS + 1]! - v[o + 1]!, az = v[o + VS + 2]! - v[o + 2]!;
      const bx = v[o + 2 * VS]! - v[o]!, by = v[o + 2 * VS + 1]! - v[o + 1]!, bz = v[o + 2 * VS + 2]! - v[o + 2]!;
      const nx = v[o + 3]! + v[o + VS + 3]! + v[o + 2 * VS + 3]!, ny = v[o + 4]! + v[o + VS + 4]! + v[o + 2 * VS + 4]!, nz = v[o + 5]! + v[o + VS + 5]! + v[o + 2 * VS + 5]!;
      if ((ay * bz - az * by) * nx + (az * bx - ax * bz) * ny + (ax * by - ay * bx) * nz >= 0) continue;
      for (let k = 0; k < VS; k++) { const value = v[o + VS + k]!; v[o + VS + k] = v[o + 2 * VS + k]!; v[o + 2 * VS + k] = value; }
      changed++;
    }
    return changed;
  }
  /** keeps triangles for which keep(t) is true; returns the removed soup */
  filter(keep: (t: number) => boolean): TriSoup {
    const kept = new TriSoup(), gone = new TriSoup();
    for (let t = 0; t < this.count; t++) {
      const dst = keep(t) ? kept : gone;
      for (let k = 0; k < 3 * VS; k++) dst.v.push(this.v[t * 3 * VS + k]!);
      dst.surf.push(this.surf[t]!); dst.flg.push(this.flg[t]!); dst.path.push(this.path[t]!); dst.role.push(this.role[t]!);
    }
    this.v = kept.v; this.surf = kept.surf; this.flg = kept.flg; this.path = kept.path; this.role = kept.role;
    return gone;
  }
  append(o: TriSoup): void {
    for (const x of o.v) this.v.push(x);
    this.surf.push(...o.surf); this.flg.push(...o.flg); this.path.push(...o.path); this.role.push(...o.role);
  }
}

/** A wall panel between two rows: bottom/top at each end (x,y,z) plus the along-path s and the outward direction. */
export interface WallQuad {
  path: number; side: -1 | 1; flg: number; kind: string;
  a0: [number, number, number]; a1: [number, number, number]; // row A: bottom, top
  b0: [number, number, number]; b1: [number, number, number]; // row B: bottom, top
  sa: number; sb: number;
  out: [number, number, number];  // outward (away from the road) unit vector, for render thickness
  render: boolean;
}

export interface Welded { pos: Float64Array; nrm: Float64Array; idx: Uint32Array; sd: Float64Array; triSurf: Uint8Array; triFlg: Uint8Array; triPath: Uint8Array; triRole: Uint8Array }

/** Welds identical vertices (bit-exact position + normal + s,d) into indexed buffers. Deterministic order. */
export function weld(soup: TriSoup, withSd = false): Welded {
  const map = new Map<string, number>();
  const pos: number[] = [], nrm: number[] = [], sd: number[] = [], idx: number[] = [];
  const V = soup.v;
  for (let t = 0; t < soup.count; t++) {
    for (let k = 0; k < 3; k++) {
      const o = (t * 3 + k) * VS;
      const key = withSd
        ? `${V[o]},${V[o + 1]},${V[o + 2]},${V[o + 3]},${V[o + 4]},${V[o + 5]},${V[o + 6]},${V[o + 7]}`
        : `${V[o]},${V[o + 1]},${V[o + 2]},${V[o + 3]},${V[o + 4]},${V[o + 5]}`;
      let i = map.get(key);
      if (i === undefined) {
        i = pos.length / 3; map.set(key, i);
        pos.push(V[o]!, V[o + 1]!, V[o + 2]!); nrm.push(V[o + 3]!, V[o + 4]!, V[o + 5]!); sd.push(V[o + 6]!, V[o + 7]!);
      }
      idx.push(i);
    }
  }
  return {
    pos: Float64Array.from(pos), nrm: Float64Array.from(nrm), idx: Uint32Array.from(idx), sd: Float64Array.from(sd),
    triSurf: Uint8Array.from(soup.surf), triFlg: Uint8Array.from(soup.flg), triPath: Uint8Array.from(soup.path), triRole: Uint8Array.from(soup.role),
  };
}
