// F2 geometry beyond the ribbons: jump landing faces and kill floors under gaps, kill strips beyond open ledges
// (`kill=<id>`, `wall=none::ledgeKill`), and KILL planes (collision strips near the track, render plane over the aabb).
import { TFLAG } from '@cr/sim';
import { SURF, exactAt, sampleAt, type PathModel, type TrackModel } from './paths.ts';
import { profileHeight, type Content, type KillPlane } from './content.ts';
import { ROLE } from './mesh.ts';
import { TriSoup, type WallQuad } from './soup.ts';
import type { RenderBuilder } from './render.ts';

const LAVA = SURF('lava');
const KILL_WIDTH = 28;     // how far beyond an open edge a falling kart is caught (m)
const LEDGE_DROP = 4;      // kill strip depth below an open ledge when no KILL plane is lower

type P3 = [number, number, number];
const V = (p: P3, n: P3, s: number, d: number): number[] => [p[0], p[1], p[2], n[0], n[1], n[2], s, d];

function edgePoint(m: TrackModel, p: PathModel, s: number, side: -1 | 1, extra = 0, lift = 0): P3 {
  const q = sampleAt(p, s);
  const d = side * (q.w / 2 + (side < 0 ? q.shL : q.shR) + extra);
  const h = profileHeight(m.profiles.get(q.prof), q, side * (q.w / 2 + (side < 0 ? q.shL : q.shR))) + lift;
  return [q.x + q.rx * d + q.ux * h, q.y + q.ry * d + q.uy * h, q.z + q.rz * d + q.uz * h];
}

/** Kill plane height for a kill id at a road height: the declared KILL plane if it is below the road, else road − LEDGE_DROP. */
function killY(c: Content, id: string | null, roadY: number): { y: number; plane: KillPlane | null } {
  const kp = id ? c.killPlanes.find((k) => k.id === id) : undefined;
  if (kp && kp.y < roadY - 1) return { y: kp.y, plane: kp };
  return { y: roadY - LEDGE_DROP, plane: kp ?? null };
}

export interface FeatureOut { kills: number; faces: number }

export function buildFeatures(m: TrackModel, c: Content, rows: Map<number, number[]>, ground: TriSoup, walls: WallQuad[]): FeatureOut {
  let kills = 0, faces = 0;
  const up: P3 = [0, 1, 0];
  // ---- jumps: landing front face (wall) and a kill floor under the gap
  for (const j of c.jumps) {
    if (j.legacy || j.gapLen <= 0) continue;
    const p = m.paths[j.path]!;
    const land = sampleAt(p, j.landS0), lip = sampleAt(p, j.lipS);
    const depth = 8;
    const L0 = edgePoint(m, p, j.landS0, -1), R0 = edgePoint(m, p, j.landS0, 1);
    const n: P3 = [-land.tx, -land.ty, -land.tz];
    walls.push({ path: p.index, side: 1, flg: 0, kind: 'cliff', a0: [L0[0], L0[1] - depth, L0[2]], a1: [L0[0], L0[1] - 0.02, L0[2]], b0: [R0[0], R0[1] - depth, R0[2]], b1: [R0[0], R0[1] - 0.02, R0[2]], sa: j.landS0, sb: j.landS0, out: [-n[0], -n[1], -n[2]], render: true });
    faces++;
    if (j.floor === 'kill') {
      const y = Math.min(lip.y, land.y) - 5;
      const s0 = j.lipS - 2, s1 = j.landS0 + 2;
      for (let s = s0; s < s1 - 1e-6; s += 4) {
        const a = sampleAt(p, s), b = sampleAt(p, Math.min(s1, s + 4));
        const W = Math.max(a.w, b.w) / 2 + 12;
        const P = (q: typeof a, d: number): P3 => [q.x + q.rx * d, y, q.z + q.rz * d];
        const a0 = P(a, -W), a1 = P(a, W), b0 = P(b, -W), b1 = P(b, W);
        ground.push(V(a0, up, a.s, -W), V(a1, up, a.s, W), V(b0, up, b.s, -W), LAVA, TFLAG.KILL, p.index, ROLE.KILL);
        ground.push(V(a1, up, a.s, W), V(b1, up, b.s, W), V(b0, up, b.s, -W), LAVA, TFLAG.KILL, p.index, ROLE.KILL);
        kills += 2;
      }
    }
  }
  // ---- open ledges with kill: strips beyond the open edge, below it
  for (const p of m.paths) {
    if (p.kind === 'rail') continue;
    const R = rows.get(p.index) ?? [];
    for (let r = 0; r + 1 < R.length; r++) {
      const sa = R[r]!, sb = R[r + 1]!;
      const mid = exactAt(m, p, (sa + sb) / 2);
      if (mid.jumpPart === 2 || mid.warp) continue;
      for (const side of [-1, 1] as const) {
        const wd = side < 0 ? mid.wallL : mid.wallR;
        const open = wd.type === 'none' || wd.type === 'curb';
        const id = mid.kill ?? (wd.ledgeKill ? 'ledge' : null);
        if (!open || !id) continue;
        const ea = edgePoint(m, p, sa, side), eb = edgePoint(m, p, sb, side);
        const k = killY(c, id, Math.min(ea[1], eb[1]));
        const fa = edgePoint(m, p, sa, side, KILL_WIDTH), fb = edgePoint(m, p, sb, side, KILL_WIDTH);
        const A0: P3 = [ea[0], k.y, ea[2]], A1: P3 = [fa[0], k.y, fa[2]], B0: P3 = [eb[0], k.y, eb[2]], B1: P3 = [fb[0], k.y, fb[2]];
        // keep CCW from above: left side runs outward to −d, right side to +d
        if (side < 0) { ground.push(V(A1, up, sa, -1), V(A0, up, sa, 0), V(B1, up, sb, -1), LAVA, TFLAG.KILL, p.index, ROLE.KILL); ground.push(V(A0, up, sa, 0), V(B0, up, sb, 0), V(B1, up, sb, -1), LAVA, TFLAG.KILL, p.index, ROLE.KILL); }
        else { ground.push(V(A0, up, sa, 0), V(A1, up, sa, 1), V(B0, up, sb, 0), LAVA, TFLAG.KILL, p.index, ROLE.KILL); ground.push(V(A1, up, sa, 1), V(B1, up, sb, 1), V(B0, up, sb, 0), LAVA, TFLAG.KILL, p.index, ROLE.KILL); }
        kills += 2;
      }
    }
  }
  // ---- KILL planes: collision strips under the spans a kart can actually fall from — open edges (no wall), jump
  // gaps, warps and kill spans, ±20 m — wherever the road stands > 2 m above the plane. Under fully walled road a
  // strip only fed the TriHash (≈ 600 KB on a 3.9 km track); a kart thrown over a wall there still dies at killY.
  const MARGIN = 20;
  for (const kp of c.killPlanes) {
    for (const p of m.paths) {
      if (p.kind === 'rail') continue;
      const step = 6;
      const open: number[] = [];
      for (const q of p.samples) if (q.wallL.type === 'none' || q.wallR.type === 'none' || q.jumpPart === 2 || q.warp || q.kill) open.push(q.s);
      if (!open.length) continue;
      const near = (s0: number, s1: number): boolean => {
        // binary search the sorted open samples for one within [s0 − MARGIN, s1 + MARGIN] (wrapping on circuits)
        const hit = (lo: number, hi: number): boolean => {
          let a = 0, b = open.length;
          while (a < b) { const mid = (a + b) >> 1; if (open[mid]! < lo) a = mid + 1; else b = mid; }
          return a < open.length && open[a]! <= hi;
        };
        if (hit(s0 - MARGIN, s1 + MARGIN)) return true;
        return p.closed && (hit(s0 - MARGIN + p.length, s1 + MARGIN + p.length) || hit(s0 - MARGIN - p.length, s1 + MARGIN - p.length));
      };
      for (let s = 0; s < p.length - 1e-6; s += step) {
        if (!near(s, s + step)) continue;
        const a = sampleAt(p, s), b = sampleAt(p, Math.min(p.length, s + step));
        if (a.y < kp.y + 2 || b.y < kp.y + 2) continue;
        const inBox = (x: number, z: number): boolean => !kp.aabb || (x >= kp.aabb[0] && x <= kp.aabb[2] && z >= kp.aabb[1] && z <= kp.aabb[3]);
        if (!inBox(a.x, a.z) && !inBox(b.x, b.z)) continue;
        const W = Math.max(a.w, b.w) / 2 + Math.max(a.shL, a.shR) + KILL_WIDTH;
        const P = (q: typeof a, d: number): P3 => [q.x + q.rx * d, kp.y, q.z + q.rz * d];
        const a0 = P(a, -W), a1 = P(a, W), b0 = P(b, -W), b1 = P(b, W);
        ground.push(V(a0, up, a.s, -W), V(a1, up, a.s, W), V(b0, up, b.s, -W), LAVA, TFLAG.KILL, p.index, ROLE.KILL);
        ground.push(V(a1, up, a.s, W), V(b1, up, b.s, W), V(b0, up, b.s, -W), LAVA, TFLAG.KILL, p.index, ROLE.KILL);
        kills += 2;
      }
    }
  }
  // ---- point-to-point end cap (appended last, so every other wall keeps its index): a soft barrier across the road at the end of the main line, so finished karts
  // stop at the end instead of driving off it and respawning (L6 §8). The start needs none: the grid stands ≥ 10 m in.
  if (!m.closed) {
    const p = m.paths[0]!;
    for (const [s, dir] of [[p.length, 1]] as const) {
      const q = sampleAt(p, s);
      const L0 = edgePoint(m, p, s, -1, 0.3), R0 = edgePoint(m, p, s, 1, 0.3);
      const out: P3 = [q.tx * dir, q.ty * dir, q.tz * dir];
      walls.push({
        path: p.index, side: 1, flg: TFLAG.SOFT, kind: 'barrier',
        a0: [L0[0] - q.ux * 0.5, L0[1] - q.uy * 0.5, L0[2] - q.uz * 0.5], a1: [L0[0] + q.ux * 1.6, L0[1] + q.uy * 1.6, L0[2] + q.uz * 1.6],
        b0: [R0[0] - q.ux * 0.5, R0[1] - q.uy * 0.5, R0[2] - q.uz * 0.5], b1: [R0[0] + q.ux * 1.6, R0[1] + q.uy * 1.6, R0[2] + q.uz * 1.6],
        sa: s, sb: s, out, render: true,
      });
      faces++;
    }
  }
  return { kills, faces };
}

/** Render planes for KILL (lava / water / void) over their aabb (or the track bounds + 120 m), 40 m tiles. */
export function killPlanesToRender(rb: RenderBuilder, c: Content, bounds: number[]): void {
  for (const kp of c.killPlanes) {
    const [x0, z0, x1, z1] = kp.aabb ?? [bounds[0]! - 120, bounds[2]! - 120, bounds[3]! + 120, bounds[5]! + 120];
    const sl = rb.slot('underside', `kill_${kp.surf}`);
    const chunk = rb.chunkOf(4000 + c.killPlanes.indexOf(kp), 0, 'misc');
    const T = 40;
    const nx = Math.max(1, Math.ceil((x1 - x0) / T)), nz = Math.max(1, Math.ceil((z1 - z0) / T));
    const col = kp.surf === 'lava' ? [2.2, 0.8, 0.3] : kp.surf === 'water' ? [0.5, 0.9, 1.3] : [0.15, 0.15, 0.2];
    const P = (ix: number, iz: number): number[] => { const x = x0 + ((x1 - x0) * ix) / nx, z = z0 + ((z1 - z0) * iz) / nz; return [x, kp.y, z, 0, 1, 0, x / 16, z / 16, col[0]!, col[1]!, col[2]!]; };
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      rb.tri(sl, chunk, P(ix, iz), P(ix, iz + 1), P(ix + 1, iz));
      rb.tri(sl, chunk, P(ix + 1, iz), P(ix, iz + 1), P(ix + 1, iz + 1));
    }
  }
}

/** Render-only faces at jump lips (ramp end) so the ramp reads as a solid kicker. */
export function jumpFacesToRender(rb: RenderBuilder, m: TrackModel, c: Content): void {
  for (const j of c.jumps) {
    if (j.legacy || j.gapLen <= 0) continue;
    const p = m.paths[j.path]!;
    const lip = sampleAt(p, j.lipS - 0.01);
    const sl = rb.slot('underside', 'underside');
    const chunk = rb.chunkOf(p.index, j.lipS);
    const L = edgePoint(m, p, j.lipS - 0.01, -1), R = edgePoint(m, p, j.lipS - 0.01, 1);
    const drop = j.lipH + 3;
    const n = [lip.tx, lip.ty, lip.tz];
    const Vr = (q: P3, u: number, v: number): number[] => [q[0], q[1], q[2], n[0]!, n[1]!, n[2]!, u, v, 0.5, 0.5, 0.5];
    const Ld: P3 = [L[0], L[1] - drop, L[2]], Rd: P3 = [R[0], R[1] - drop, R[2]];
    rb.tri(sl, chunk, Vr(L, 0, 0), Vr(Ld, 0, 1), Vr(R, 1, 0));
    rb.tri(sl, chunk, Vr(R, 1, 0), Vr(Ld, 0, 1), Vr(Rd, 1, 1));
  }
}
