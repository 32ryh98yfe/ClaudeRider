// AREA plazas (docs/design/11-track-spec.md §3 AreaDef, gap-3 §4 "plaza bake"): a flat drivable region (annulus
// sector or polygon) joined to the ribbons that enter it. The area wins over ribbons (their triangles and walls inside
// it are cut away), its boundary walls open where a ribbon joins, obstacles (a tower, pillars, boxes) are walls.
import { ShapeUtils, Vector2 } from 'three';
import { TrackDslError, num, pairList, tuple, type Stmt } from './dsl.ts';
import { SURF, sampleAt, type TrackModel } from './paths.ts';
import { parseSurf, parseWall, DEG, type WallDef } from './turtle.ts';
import { footprintPolys, inFootprint, subtractFromSoup, subtractFromWalls, pathRing, type Footprint, type Ring } from './clip.ts';
import { ROLE } from './mesh.ts';
import { TriSoup, VS, type WallQuad } from './soup.ts';
import { TFLAG } from '@cr/sim';

export interface Obstacle { kind: 'cyl' | 'box'; x: number; z: number; r: number; w: number; d: number; h: number; yaw: number }
export interface AreaModel {
  id: string; kind: 'annulus' | 'polygon'; y: number; surf: number; line: number;
  outer: Ring; holes: Ring[];
  center: [number, number] | null; rIn: number; rOut: number; from: number; sweep: number;
  wallIn: WallDef; wallOut: WallDef;
  obstacles: Obstacle[];
  guide: number; guideS0: number; guideS1: number;
}
export interface AreaReport { id: string; ok: boolean; guideInside: boolean; dy: number; tris: number }

const ang = (cx: number, cz: number, x: number, z: number): number => Math.atan2(-(z - cz), x - cx) / DEG; // heading-convention angle
const onCircle = (cx: number, cz: number, r: number, a: number): [number, number] => [cx + r * Math.cos(a * DEG), cz - r * Math.sin(a * DEG)];

function parseObstacle(v: string, file: string, line: number, at?: [number, number]): Obstacle {
  const m = /^(cyl|box)\((.*)\)$/.exec(v.trim());
  if (!m) throw new TrackDslError({ file, line, col: 1, msg: `bad obstacle ${v} (cyl(r=,h=[,x=,z=]) | box(w=,d=,h=[,x=,z=,yaw=]))` });
  const kv: Record<string, number> = {};
  for (const part of m[2]!.split(',')) { const i = part.indexOf('='); if (i > 0) kv[part.slice(0, i).trim()] = Number(part.slice(i + 1)); }
  return { kind: m[1] as 'cyl' | 'box', x: kv.x ?? at?.[0] ?? 0, z: kv.z ?? at?.[1] ?? 0, r: kv.r ?? 1, w: kv.w ?? 2, d: kv.d ?? 2, h: kv.h ?? 3, yaw: kv.yaw ?? 0 };
}

export function resolveAreas(m: TrackModel): AreaModel[] {
  const out: AreaModel[] = [];
  for (const st of m.ast.stmts) {
    if (st.cmd !== 'AREA') continue;
    out.push(resolveArea(m, st));
  }
  return out;
}

function resolveArea(m: TrackModel, st: Stmt): AreaModel {
  const file = m.file, ln = st.line, a = st.attrs;
  const id = st.args[0];
  const kind = st.args[1] === 'polygon' ? 'polygon' : 'annulus';
  const fail = (msg: string): never => { throw new TrackDslError({ file, line: ln, col: 1, msg }); };
  if (!id) fail('AREA needs an id');
  // guide span: the samples of the path whose segments carry area=<id>
  let guide = -1, g0 = Infinity, g1 = -Infinity;
  const gp = a.guide ? m.paths.find((p) => p.id === a.guide) : undefined;
  for (const p of gp ? [gp] : m.paths) {
    for (const s of p.samples) if (s.area === id) { guide = p.index; g0 = Math.min(g0, s.s); g1 = Math.max(g1, s.s); }
    if (guide >= 0) break;
  }
  const guidePrims = guide >= 0 ? m.paths[guide]!.prims.filter((q) => q.attr.area === id) : [];
  const area: AreaModel = {
    id: id!, kind, y: 0, surf: SURF(parseSurf(a.surf, 'stone', file, ln)), line: ln, outer: [], holes: [], center: null, rIn: 0, rOut: 0, from: 0, sweep: 0,
    wallIn: parseWall(a.wallIn ?? a.wall, { type: 'curb', h: 0.15, soft: false, ledgeKill: false }, file, ln),
    wallOut: parseWall(a.wallOut ?? a.wall, { type: 'barrier', h: 1, soft: false, ledgeKill: false }, file, ln),
    obstacles: [], guide: Math.max(0, guide), guideS0: g0, guideS1: g1,
  };
  if (kind === 'annulus') {
    area.rIn = num(a.rIn, 10); area.rOut = num(a.rOut, 40);
    if (!(area.rOut > area.rIn && area.rIn >= 0)) fail('AREA annulus needs rOut > rIn ≥ 0');
    const c = tuple(a.c);
    const arc = guidePrims.find((q) => q.kind === 'arc');
    if (c.length >= 2) {
      area.center = [c[0]!, c.length >= 3 ? c[2]! : c[1]!];
      area.y = c.length >= 3 ? c[1]! : guide >= 0 ? sampleAt(m.paths[guide]!, g0).y : 0;
    } else if (arc) {
      const sg = arc.k0 > 0 ? 1 : -1, r = 1 / Math.abs(arc.k0);
      area.center = [arc.x0 + sg * r * -Math.sin(arc.psi0 * DEG), arc.z0 + sg * r * -Math.cos(arc.psi0 * DEG)];
      area.y = sampleAt(m.paths[guide]!, (g0 + g1) / 2).y;
    } else fail(`AREA ${id}: give c=(x,y,z) or put area=${id} on a C guide arc`);
    const [cx, cz] = area.center!;
    if (a.from !== undefined) area.from = num(a.from, 0);
    else if (arc) area.from = ang(cx, cz, arc.x0, arc.z0);
    if (a.sweep !== undefined) area.sweep = num(a.sweep, 360);
    else if (guidePrims.length) area.sweep = guidePrims.reduce((acc, q) => acc + (q.kind === 'arc' ? (q.len * q.k0) / DEG : 0), 0);
    else area.sweep = 360;
    if (a.y !== undefined) area.y = num(a.y, area.y);
    const full = Math.abs(area.sweep) >= 359.9;
    // widen partial sectors by 4° each end so the entry/exit ribbons overlap the plaza instead of leaving slivers
    const pad = full ? 0 : 4 * Math.sign(area.sweep || 1);
    const a0 = area.from - pad, a1 = area.from + area.sweep + pad;
    const n = Math.max(24, Math.ceil(Math.abs(a1 - a0) / 2));
    if (full) {
      for (let k = 0; k <= n; k++) area.outer.push(onCircle(cx, cz, area.rOut, a0 + (360 * k) / n));
      const hole: Ring = [];
      if (area.rIn > 0) { for (let k = n; k >= 0; k--) hole.push(onCircle(cx, cz, area.rIn, a0 + (360 * k) / n)); area.holes.push(hole); }
    } else {
      for (let k = 0; k <= n; k++) area.outer.push(onCircle(cx, cz, area.rOut, a0 + ((a1 - a0) * k) / n));
      for (let k = n; k >= 0; k--) area.outer.push(onCircle(cx, cz, area.rIn, a0 + ((a1 - a0) * k) / n));
      area.outer.push(area.outer[0]!);
    }
    if (a.tower) area.obstacles.push(parseObstacle(a.tower, file, ln, [cx, cz]));
  } else {
    const pts = pairList(a.pts).map(([x, z]) => [Number(x), Number(z)] as [number, number]);
    if (pts.length < 3 || pts.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) fail('AREA polygon needs pts=[(x,z),(x,z),(x,z),…]');
    area.outer = [...pts, pts[0]!];
    if (a.hole) { const h = pairList(a.hole).map(([x, z]) => [Number(x), Number(z)] as [number, number]); area.holes.push([...h, h[0]!]); }
    area.y = a.y !== undefined ? num(a.y, 0) : guide >= 0 ? sampleAt(m.paths[guide]!, (g0 + g1) / 2).y : 0;
  }
  for (const [k, v] of Object.entries(a)) if (/^obst\d*$/.test(k)) for (const o of v.split(';')) area.obstacles.push(parseObstacle(o, file, ln));
  return area;
}

export function areaFootprint(a: AreaModel): Footprint { return footprintPolys([[a.outer, ...a.holes]]); }

type P3 = [number, number, number];
const up: P3 = [0, 1, 0];

/** Meshes every area, clips ribbons against it, and builds boundary / obstacle walls. */
export function buildAreas(m: TrackModel, areas: AreaModel[], ground: TriSoup, kerbs: TriSoup, walls: WallQuad[]): { walls: WallQuad[]; reports: AreaReport[] } {
  let W = walls;
  const reports: AreaReport[] = [];
  for (const a of areas) {
    const F = areaFootprint(a);
    const near = (y: number): boolean => Math.abs(y - a.y) < 2;
    const triY = (soup: TriSoup, t: number): number => (soup.v[t * 3 * VS + 1]! + soup.v[t * 3 * VS + VS + 1]! + soup.v[t * 3 * VS + 2 * VS + 1]!) / 3;
    const triS = (soup: TriSoup, t: number): number => (soup.v[t * 3 * VS + 6]! + soup.v[t * 3 * VS + VS + 6]! + soup.v[t * 3 * VS + 2 * VS + 6]!) / 3;
    // 0. the guide ribbon inside its own span is replaced by the plaza (surface, shoulders, walls, kerbs)
    const inSpan = (path: number, s: number): boolean => path === a.guide && s >= a.guideS0 && s <= a.guideS1;
    ground.filter((t) => !(ground.role[t] !== ROLE.KILL && inSpan(ground.path[t]!, triS(ground, t))));
    kerbs.filter((t) => !inSpan(kerbs.path[t]!, triS(kerbs, t)));
    W = W.filter((w) => !inSpan(w.path, (w.sa + w.sb) / 2));
    // 1. ribbons lose what lies inside the plaza
    subtractFromSoup(ground, (t) => ground.role[t] !== ROLE.AREA && ground.role[t] !== ROLE.KILL && near(triY(ground, t)), F);
    subtractFromSoup(kerbs, (t) => near(triY(kerbs, t)), F);
    W = subtractFromWalls(W, (w) => near(w.a0[1] + 0.6), F);
    // 2. the plaza surface
    const before = ground.count;
    if (a.kind === 'annulus') meshAnnulus(a, ground); else meshPolygon(a, ground);
    const tris = ground.count - before;
    // 3. boundary walls, opened where ribbons (outside the guide span) join
    const bw: WallQuad[] = [];
    const ringWalls = (ring: Ring, wd: WallDef, inward: boolean): void => {
      if (wd.type === 'none') return;
      for (let i = 0; i + 1 < ring.length; i++) {
        const [x0, z0] = ring[i]!, [x1, z1] = ring[i + 1]!;
        const ex = x1 - x0, ez = z1 - z0, el = Math.hypot(ex, ez) || 1;
        // outward normal: for the outer ring (CCW from above) it is (ez, −ex)/l in x/z; holes run the other way
        let ox = ez / el, oz = -ex / el;
        const mx = (x0 + x1) / 2 + ox * 0.3, mz = (z0 + z1) / 2 + oz * 0.3;
        if (inFootprint(mx, mz, F) !== inward) { ox = -ox; oz = -oz; }
        const h = Math.max(0.6, wd.h), solid = wd.type !== 'curb';
        bw.push({ path: a.guide, side: 1, flg: (wd.soft ? TFLAG.SOFT : 0) | (wd.type === 'invisible' ? TFLAG.INVISIBLE : 0), kind: solid ? wd.type : 'curb',
          a0: [x0, a.y - 0.6, z0], a1: [x0, a.y + (solid ? h : 0.15), z0], b0: [x1, a.y - 0.6, z1], b1: [x1, a.y + (solid ? h : 0.15), z1],
          sa: 0, sb: 0, out: [ox, 0, oz], render: wd.type !== 'invisible' });
      }
    };
    ringWalls(a.outer, a.wallOut, false);
    for (const h of a.holes) ringWalls(h, a.wallIn, false);
    // annulus sectors: the inner arc uses wallIn (it is part of the outer ring polygon)
    if (a.kind === 'annulus' && !a.holes.length && a.center) {
      const [cx, cz] = a.center;
      for (const w of bw) { const r = Math.hypot((w.a0[0] + w.b0[0]) / 2 - cx, (w.a0[2] + w.b0[2]) / 2 - cz); if (r < (a.rIn + a.rOut) / 2) { const wd = a.wallIn; w.kind = wd.type === 'curb' ? 'curb' : wd.type; w.a1[1] = w.b1[1] = a.y + (wd.type === 'curb' ? 0.15 : Math.max(0.6, wd.h)); w.flg = wd.soft ? TFLAG.SOFT : 0; } }
    }
    let AW = bw;
    for (const p of m.paths) {
      if (p.kind === 'rail') continue;
      // runs of samples near the plaza, excluding the guide span itself
      const bb = F.bbox, pad = 60;
      let run: number[] = [];
      const flush = (): void => {
        if (run.length >= 2) {
          const s0 = p.samples[run[0]!]!.s, s1 = p.samples[run[run.length - 1]!]!.s;
          AW = subtractFromWalls(AW, () => true, footprintPolys([[pathRing(m, p, s0, s1, 'full', 0.3)]]));
        }
        run = [];
      };
      p.samples.forEach((s, i) => {
        const inGuide = p.index === a.guide && s.area === a.id;
        const close = s.x > bb[0] - pad && s.x < bb[2] + pad && s.z > bb[1] - pad && s.z < bb[3] + pad && near(s.y);
        if (close && !inGuide) run.push(i); else flush();
      });
      flush();
    }
    // curbs are not collidable: they become 1 m kerb strips just inside the plaza edge
    for (const w of AW) {
      if (w.kind !== 'curb') continue;
      const ix = -w.out[0], iz = -w.out[2], y = a.y + 0.03;
      const A0 = [w.a0[0], y, w.a0[2], 0, 1, 0, 0, 0], B0 = [w.b0[0], y, w.b0[2], 0, 1, 0, 1, 0];
      const A1 = [w.a0[0] + ix, y, w.a0[2] + iz, 0, 1, 0, 0, 1], B1 = [w.b0[0] + ix, y, w.b0[2] + iz, 0, 1, 0, 1, 1];
      const ny = (B0[2]! - A0[2]!) * (A1[0]! - A0[0]!) - (B0[0]! - A0[0]!) * (A1[2]! - A0[2]!);
      if (ny > 0) { kerbs.push(A0, B0, A1, 0, 0, a.guide, ROLE.KERB); kerbs.push(B0, B1, A1, 0, 0, a.guide, ROLE.KERB); }
      else { kerbs.push(A0, A1, B0, 0, 0, a.guide, ROLE.KERB); kerbs.push(B0, A1, B1, 0, 0, a.guide, ROLE.KERB); }
    }
    W = W.concat(AW.filter((w) => w.kind !== 'curb'));
    // 4. obstacles
    for (const o of a.obstacles) W.push(...obstacleWalls(a, o));
    // V16 inputs
    let inside = true, dy = 0;
    if (a.guideS0 <= a.guideS1) {
      const gp = m.paths[a.guide]!;
      for (let s = a.guideS0 + 3; s <= a.guideS1 - 3; s += 2) {
        const q = sampleAt(gp, s);
        if (!inFootprint(q.x, q.z, F)) inside = false;
        dy = Math.max(dy, Math.abs(q.y - a.y));
      }
    }
    // locate must accept karts anywhere on the plaza: widen the guide samples' lateral reach to the plaza boundary
    if (a.guideS0 <= a.guideS1) {
      const gp = m.paths[a.guide]!;
      for (const smp of gp.samples) {
        if (smp.area !== a.id) continue;
        for (const side of [-1, 1] as const) {
          let reach = 0;
          for (let d = 0.5; d < 150; d += 0.5) { if (inFootprint(smp.x + smp.rx * side * d, smp.z + smp.rz * side * d, F)) reach = d; else if (d > reach + 3) break; }
          if (side < 0) smp.reachL = Math.max(smp.w / 2 + smp.shL, reach); else smp.reachR = Math.max(smp.w / 2 + smp.shR, reach);
        }
      }
    }
    reports.push({ id: a.id, ok: tris > 0, guideInside: inside, dy, tris });
  }
  return { walls: W, reports };
}

function pushFlat(ground: TriSoup, a: AreaModel, p: [number, number][], path: number): void {
  const [A, B, C] = p as [[number, number], [number, number], [number, number]];
  // CCW from above: plan normal y = e1z·e2x − e1x·e2z > 0
  const ny = (B[1] - A[1]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[1] - A[1]);
  if (Math.abs(ny) < 1e-9) return;
  const V = (q: [number, number]): number[] => [q[0], a.y, q[1], 0, 1, 0, 0, 0];
  if (ny > 0) ground.push(V(A), V(B), V(C), a.surf, 0, path, ROLE.AREA);
  else ground.push(V(A), V(C), V(B), a.surf, 0, path, ROLE.AREA);
}

function meshAnnulus(a: AreaModel, ground: TriSoup): void {
  const [cx, cz] = a.center!;
  const full = Math.abs(a.sweep) >= 359.9;
  const pad = full ? 0 : 4 * Math.sign(a.sweep || 1);
  const a0 = a.from - pad, a1 = a.from + a.sweep + pad;
  // a drivable inner edge (curb / none) must not open onto a hole: fill inward to the central obstacle's base
  const solidIn = a.wallIn.type !== 'curb' && a.wallIn.type !== 'none';
  if (!solidIn && a.rIn > 0) {
    const tower = a.obstacles.find((o) => o.kind === 'cyl' && Math.hypot(o.x - cx, o.z - cz) < 0.5);
    const rFill = tower ? Math.max(0, tower.r - 0.5) : 0;
    const na0 = Math.max(12, Math.ceil(Math.abs(a1 - a0) / 5));
    const Q = (r: number, j: number): [number, number] => onCircle(cx, cz, r, a0 + ((a1 - a0) * j) / na0);
    for (let j = 0; j < na0; j++) {
      if (rFill > 0) { pushFlat(ground, a, [Q(rFill, j), Q(a.rIn, j), Q(rFill, j + 1)], a.guide); pushFlat(ground, a, [Q(a.rIn, j), Q(a.rIn, j + 1), Q(rFill, j + 1)], a.guide); }
      else pushFlat(ground, a, [[cx, cz], Q(a.rIn, j), Q(a.rIn, j + 1)], a.guide);
    }
  }
  const nr = Math.max(2, Math.ceil((a.rOut - a.rIn) / 3));
  const na = Math.max(8, Math.ceil(Math.max(Math.abs(a1 - a0) / 2.5, (Math.abs(a1 - a0) * DEG * a.rOut) / 2.5)));
  const P = (i: number, j: number): [number, number] => onCircle(cx, cz, a.rIn + ((a.rOut - a.rIn) * i) / nr, a0 + ((a1 - a0) * j) / na);
  for (let j = 0; j < na; j++) for (let i = 0; i < nr; i++) {
    pushFlat(ground, a, [P(i, j), P(i + 1, j), P(i, j + 1)], a.guide);
    pushFlat(ground, a, [P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)], a.guide);
  }
}

function meshPolygon(a: AreaModel, ground: TriSoup): void {
  const toV = (r: Ring): Vector2[] => r.slice(0, r.length - 1).map(([x, z]) => new Vector2(x, z));
  const contour = toV(a.outer), holes = a.holes.map(toV);
  const all = [...contour, ...holes.flat()];
  const faces = ShapeUtils.triangulateShape(contour, holes);
  const split = (t: [number, number][], depth: number): void => {
    const [A, B, C] = t as [[number, number], [number, number], [number, number]];
    const l = [Math.hypot(B[0] - A[0], B[1] - A[1]), Math.hypot(C[0] - B[0], C[1] - B[1]), Math.hypot(A[0] - C[0], A[1] - C[1])];
    const k = l.indexOf(Math.max(...l));
    if (l[k]! <= 4 || depth > 8) { pushFlat(ground, a, t, a.guide); return; }
    const mid = (p: [number, number], q: [number, number]): [number, number] => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    if (k === 0) { const M = mid(A, B); split([A, M, C], depth + 1); split([M, B, C], depth + 1); }
    else if (k === 1) { const M = mid(B, C); split([A, B, M], depth + 1); split([A, M, C], depth + 1); }
    else { const M = mid(C, A); split([A, B, M], depth + 1); split([M, B, C], depth + 1); }
  };
  for (const f of faces) split([f[0]!, f[1]!, f[2]!].map((i) => [all[i]!.x, all[i]!.y] as [number, number]), 0);
}

function obstacleWalls(a: AreaModel, o: Obstacle): WallQuad[] {
  const out: WallQuad[] = [];
  const y0 = a.y - 0.6, y1 = a.y + o.h;
  const pts: [number, number][] = [];
  if (o.kind === 'cyl') { const n = Math.max(12, Math.ceil((2 * Math.PI * o.r) / 2)); for (let k = 0; k <= n; k++) { const t = (k / n) * Math.PI * 2; pts.push([o.x + Math.cos(t) * o.r, o.z + Math.sin(t) * o.r]); } }
  else {
    const c = Math.cos(o.yaw * DEG), s = Math.sin(o.yaw * DEG);
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]] as const) pts.push([o.x + (u * o.w * c) / 2 - (v * o.d * s) / 2, o.z + (u * o.w * s) / 2 + (v * o.d * c) / 2]);
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, z0] = pts[i]!, [x1, z1] = pts[i + 1]!;
    const mx = (x0 + x1) / 2 - o.x, mz = (z0 + z1) / 2 - o.z, ml = Math.hypot(mx, mz) || 1;
    out.push({ path: a.guide, side: 1, flg: 0, kind: 'building', a0: [x0, y0, z0], a1: [x0, y1, z0], b0: [x1, y0, z1], b1: [x1, y1, z1], sa: 0, sb: 0, out: [-mx / ml, 0, -mz / ml], render: true });
  }
  return out;
}

export { up as _up };
