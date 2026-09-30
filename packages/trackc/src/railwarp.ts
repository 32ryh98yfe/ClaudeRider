// F4: rails (grind paths = host centreline + lateral/vertical offset table, captured by the sim) and warps (portal
// entry → exit teleports, optionally over a no-geometry `warp=` span). Bakes RailBaked/WarpBaked and render geometry.
import type { RailBaked, WarpBaked } from '@cr/sim';
import { TrackDslError, num, tuple } from './dsl.ts';
import { sampleAt, type TrackModel } from './paths.ts';
import { surfacePoint } from './content.ts';
import type { RenderBuilder } from './render.ts';
import type { TerrainField } from './terrain.ts';

export function railsMeta(m: TrackModel): RailBaked[] {
  return m.paths.filter((p) => p.kind === 'rail' && p.rail).map((p) => {
    const r = p.rail!;
    return {
      id: p.id, path: p.index, host: r.host, fromS: p.map!.fromS, toS: p.map!.toS,
      captureDMax: r.capture.dMax, captureHeadingDeg: r.capture.headingMaxDeg, vMin: r.capture.vMin,
      speedMin: r.speed.min, speedMax: r.speed.max, accel: r.speed.accel, gaugePerSec: r.gaugePerSec,
      hostFrom: r.hostFrom, hostTo: r.hostTo, length: p.length,
    };
  });
}

export interface WarpModel extends WarpBaked { entryPose: [number, number, number, number, number, number]; exitPose: [number, number, number, number, number, number]; span: boolean; line: number }

/** WARP <id> at=<s> to=<s> [path=] [toPath=] [d=[a,b]] [exitD=] [hMax=] transit=<sec> [keep]. A `warp=<id>` segment with no
 *  at/to makes a span warp: entry at the segment start, exit at its end (no geometry in between). */
export function resolveWarps(m: TrackModel): WarpModel[] {
  const out: WarpModel[] = [];
  for (const st of m.ast.stmts) {
    if (st.cmd !== 'WARP') continue;
    const a = st.attrs, ln = st.line;
    const id = st.args[0];
    const fail = (msg: string): never => { throw new TrackDslError({ file: m.file, line: ln, col: 1, msg }); };
    if (!id) fail('WARP needs an id');
    const pIdx = (pid: string | undefined): number => { if (!pid || pid === 'main') return 0; const p = m.paths.find((q) => q.id === pid); if (!p) fail(`unknown path ${pid}`); return p!.index; };
    const path = pIdx(a.path), exitPath = pIdx(a.toPath ?? a.path);
    let s: number, exitS: number, span = false;
    const spanSamples = m.paths[path]!.samples.filter((q) => q.warp === id);
    if (a.at === undefined && spanSamples.length) {
      s = Math.min(...spanSamples.map((q) => q.s)); exitS = Math.max(...spanSamples.map((q) => q.s)); span = true;
    } else {
      s = m.sRef(a.at, path, ln); exitS = m.sRef(a.to, exitPath, ln);
    }
    const d = tuple(a.d);
    const entry = sampleAt(m.paths[path]!, s), exit = sampleAt(m.paths[exitPath]!, exitS);
    const u0 = d.length >= 2 ? Math.min(d[0]!, d[1]!) : -entry.w / 2, u1 = d.length >= 2 ? Math.max(d[0]!, d[1]!) : entry.w / 2;
    const exitU = num(a.exitD, 0);
    const transit = num(a.transit, 0.8);
    if (!(transit > 0)) fail('WARP transit must be > 0 s');
    const ep = surfacePoint(m, entry, (u0 + u1) / 2), xp = surfacePoint(m, exit, exitU);
    out.push({
      id: id!, path, s, u0, u1, hMax: num(a.hMax, 4), exitPath, exitS, exitU, transitTicks: Math.max(1, Math.round(transit * 60)),
      keepSpeed: st.flags.includes('keep') || a.keep === '1' || a.keep === 'true',
      entryPose: [ep.x, ep.y, ep.z, entry.tx, entry.ty, entry.tz], exitPose: [xp.x, xp.y, xp.z, exit.tx, exit.ty, exit.tz], span, line: ln,
    });
  }
  // every warp= segment needs a WARP statement
  for (const p of m.paths) for (const q of p.prims) if (q.attr.warp && !out.some((w) => w.id === q.attr.warp)) throw new TrackDslError({ file: m.file, line: q.line, col: 1, msg: `warp=${q.attr.warp} has no WARP ${q.attr.warp} … statement` });
  return out;
}

/** Rail tube (8-sided, r 0.22 m) along the rail path plus posts every 6 m down to the ground / terrain. */
export function railsToRender(rb: RenderBuilder, m: TrackModel, tf: TerrainField | null): void {
  for (const p of m.paths) {
    if (p.kind !== 'rail') continue;
    const sl = rb.slot('wall', 'rail');
    const R = 0.22, n = 8;
    const ring = (s: number): number[][] => {
      const q = sampleAt(p, s);
      const out: number[][] = [];
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
        const nx = q.rx * c + q.ux * sn, ny = q.ry * c + q.uy * sn, nz = q.rz * c + q.uz * sn;
        out.push([q.x + nx * R, q.y + ny * R, q.z + nz * R, nx, ny, nz, k / n, s / 3, 1.1, 1.1, 1.1]);
      }
      return out;
    };
    for (let s = 0; s < p.length - 1e-6; s += 1) {
      const chunk = rb.chunkOf(p.index, s);
      const A = ring(s), B = ring(Math.min(p.length, s + 1));
      for (let k = 0; k < n; k++) { rb.tri(sl, chunk, A[k]!, B[k]!, A[k + 1]!); rb.tri(sl, chunk, A[k + 1]!, B[k]!, B[k + 1]!); }
    }
    for (let s = 3; s < p.length - 1; s += 6) {
      const q = sampleAt(p, s);
      const g = tf ? Math.min(tf.height(q.x, q.z), q.y - 1) : q.y - 1;
      const chunk = rb.chunkOf(p.index, s);
      const w = 0.12;
      const P = (dx: number, dz: number, y: number, nx: number, nz: number, v: number): number[] => [q.x + dx, y, q.z + dz, nx, 0, nz, 0, v, 0.8, 0.8, 0.8];
      for (const [dx, dz, nx, nz] of [[w, 0, 1, 0], [0, w, 0, 1], [-w, 0, -1, 0], [0, -w, 0, -1]] as const) {
        const ex = nz * w, ez = -nx * w; // edge half-extent perpendicular to the face normal
        const a0 = P(dx - ex, dz - ez, g, nx, nz, 0), a1 = P(dx + ex, dz + ez, g, nx, nz, 0), b0 = P(dx - ex, dz - ez, q.y - R, nx, nz, 1), b1 = P(dx + ex, dz + ez, q.y - R, nx, nz, 1);
        rb.triAuto(sl, chunk, a0, b0, a1); rb.triAuto(sl, chunk, a1, b0, b1);
      }
    }
  }
}

/** Portal frames (render only): an arch over the entry window and at the exit. */
export function portalsToRender(rb: RenderBuilder, m: TrackModel, warps: WarpModel[]): void {
  for (const w of warps) {
    for (const [kind, pose, width] of [['entry', w.entryPose, w.u1 - w.u0], ['exit', w.exitPose, 6]] as const) {
      const sl = rb.slot('wall', 'portal');
      const chunk = rb.chunkOf(5000 + warps.indexOf(w) * 2 + (kind === 'entry' ? 0 : 1), 0, 'misc');
      const [x, y, z, fx, , fz] = pose;
      const fl = Math.hypot(fx, fz) || 1, tx = fx / fl, tz = fz / fl;
      const rx = -tz, rz = tx; // right = T × Y
      const H = 5, half = width / 2 + 0.6, T = 0.5;
      const col = kind === 'entry' ? 1.6 : 1.2;
      const box = (cx: number, cz: number, y0: number, y1: number, hx: number, ht: number): void => {
        // axis-aligned in the portal frame: hx along right, ht along tangent
        const C = (sx: number, st: number, yy: number): number[] => [cx + rx * sx * hx + tx * st * ht, yy, cz + rz * sx * hx + tz * st * ht];
        const faces: [number[], number[], number[], number[], number[]][] = [
          [C(-1, -1, y0), C(1, -1, y0), C(-1, -1, y1), C(1, -1, y1), [-tx, 0, -tz]],
          [C(1, 1, y0), C(-1, 1, y0), C(1, 1, y1), C(-1, 1, y1), [tx, 0, tz]],
          [C(1, -1, y0), C(1, 1, y0), C(1, -1, y1), C(1, 1, y1), [rx, 0, rz]],
          [C(-1, 1, y0), C(-1, -1, y0), C(-1, 1, y1), C(-1, -1, y1), [-rx, 0, -rz]],
          [C(-1, -1, y1), C(1, -1, y1), C(-1, 1, y1), C(1, 1, y1), [0, 1, 0]],
        ];
        for (const [a, b, c, d, n] of faces) {
          const V = (p: number[], u: number, v: number): number[] => [p[0]!, p[1]!, p[2]!, n[0]!, n[1]!, n[2]!, u, v, col, col, col];
          rb.triAuto(sl, chunk, V(a, 0, 0), V(c, 0, 1), V(b, 1, 0));
          rb.triAuto(sl, chunk, V(b, 1, 0), V(c, 0, 1), V(d, 1, 1));
        }
      };
      box(x - rx * half, z - rz * half, y, y + H, T, T);
      box(x + rx * half, z + rz * half, y, y + H, T, T);
      box(x, z, y + H - 0.6, y + H + 0.2, half + T, T);
    }
  }
}
