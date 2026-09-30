// Content statements → baked placement data on paths (items, pads, zones, kill planes, key gates, grid, hazards,
// warps), per-sample SFLAG bits, and the (path, s, d) → surface lookup used by the mesher.
import { SURFACE_IDS, type SurfaceId } from '@cr/content';
import { SFLAG } from '@cr/sim';
import { TrackDslError, num, topList, tuple, type Stmt } from './dsl.ts';
import { SURF, sampleAt, type Sample, type TrackModel } from './paths.ts';
import { parseSurf } from './turtle.ts';
import type { ProfileDef } from './profiles.ts';


export interface PadDef { path: number; s0: number; s1: number; d0: number; d1: number; kind: 'boost' | 'jump'; line: number }
export type ZoneKind = 'conveyor' | 'surface' | 'kill' | 'noItem' | 'camera' | 'gravity';
export interface ZoneDef {
  id: number; kind: ZoneKind; path: number; s0: number; s1: number; d0: number; d1: number; full: boolean;
  speedMul?: number; surf?: number; belowY?: number; gravMode?: 0 | 1 | 2; gravScale?: number; camera?: string; line: number;
}
export interface KillPlane { id: string; y: number; aabb: [number, number, number, number] | null; surf: 'lava' | 'water' | 'void'; line: number }
export interface BoxDef { id: number; path: number; s: number; u: number; row: number; x: number; y: number; z: number }
export interface ItemRow { path: number; s: number; n: number; span: number; line: number }
export interface GridSlot { x: number; y: number; z: number; fx: number; fy: number; fz: number }
export interface PropCmd { kind: string; attrs: Record<string, string>; line: number; mode: 'along' | 'landmark' }
export interface JumpDef { path: number; s0: number; lipS: number; landS0: number; landS1: number; rampLen: number; lipDeg: number; gapLen: number; drop: number; lipH: number; landLen: number; landW: number; vMin: number; vMax: number; floor: 'kill' | 'none'; line: number; legacy: boolean }

export interface Content {
  pads: PadDef[]; zones: ZoneDef[]; killPlanes: KillPlane[]; items: ItemRow[]; boxes: BoxDef[];
  keyGates: number[]; keysDeclared: boolean; grid: GridSlot[]; props: PropCmd[]; theme: Record<string, string>;
  jumps: JumpDef[]; killY: number | null;
  signature: string[]; fallbacks: { feature: string; substitute: string; when: string }[];
}

const pathIndex = (m: TrackModel, id: string | undefined, line: number): number => {
  if (!id || id === 'main') return 0;
  const p = m.paths.find((q) => q.id === id);
  if (!p) throw new TrackDslError({ file: m.file, line, col: 1, msg: `unknown path ${id}` });
  return p.index;
};

/** Point on the road surface at lateral offset d (profile-aware), plus the local surface normal. */
export function surfacePoint(m: TrackModel, smp: Sample, d: number, lift = 0): { x: number; y: number; z: number } {
  const h = profileHeight(m.profiles.get(smp.prof), smp, d) + lift;
  return { x: smp.x + smp.rx * d + smp.ux * h, y: smp.y + smp.ry * d + smp.uy * h, z: smp.z + smp.rz * d + smp.uz * h };
}

export function profileHeight(p: ProfileDef | undefined, smp: Sample, d: number): number {
  if (p && p.kind !== 'flat' && smp.profT > 0 && p.pts.length) {
    const P = p.pts, W = smp.w, wP = p.width;
    const f = wP > 0 ? W / wP : 1; // profile scaled to the current (blending) width
    const dd = d / f;
    if (dd <= P[0]!.d) return P[0]!.h * smp.profT;
    for (let i = 1; i < P.length; i++) if (dd <= P[i]!.d) { const t = (dd - P[i - 1]!.d) / Math.max(1e-9, P[i]!.d - P[i - 1]!.d); return (P[i - 1]!.h + (P[i]!.h - P[i - 1]!.h) * t) * smp.profT; }
    return P[P.length - 1]!.h * smp.profT;
  }
  const c = smp.crown;
  if (c && smp.w > 0) { const x = (2 * d) / smp.w; return Math.abs(x) <= 1 ? c * (1 - x * x) : 0; }
  return 0;
}

export function resolveContent(m: TrackModel): Content {
  const ast = m.ast, file = m.file;
  const main = m.paths[0]!;
  const c: Content = {
    pads: [], zones: [], killPlanes: [], items: [], boxes: [], keyGates: [], keysDeclared: false, grid: [], props: [], theme: {},
    jumps: [], killY: null, signature: [...ast.signature], fallbacks: [...ast.fallbacks],
  };
  const fail = (line: number, msg: string): never => { throw new TrackDslError({ file, line, col: 1, msg }); };

  // ---- jumps from J primitives (per path)
  for (const p of m.paths) {
    for (const pr of p.prims) {
      if (pr.kind !== 'jump') continue;
      const j = pr.jump!;
      const s0 = p.index === 0 ? m.toMain(pr.s0) : pr.s0;
      c.jumps.push({
        path: p.index, s0, lipS: s0 + j.rampLen, landS0: s0 + j.rampLen + j.gapLen, landS1: s0 + pr.len, rampLen: j.rampLen, lipDeg: j.lipDeg,
        gapLen: j.gapLen, drop: j.drop, lipH: j.lipH, landLen: j.landLen, landW: j.landW, vMin: j.vMin, vMax: j.vMax, floor: j.floor, line: pr.line, legacy: false,
      });
    }
  }

  let zoneId = 0;
  for (const st of ast.stmts) {
    const a = st.attrs, ln = st.line;
    switch (st.cmd) {
      case 'ITEMS': {
        const path = pathIndex(m, a.path, ln);
        const defN = num(a.n, 5);
        for (const e of topList(a.at)) {
          const mm = /^([^(]+)(?:\((.*)\))?$/.exec(e);
          if (!mm) fail(ln, `bad ITEMS entry ${e}`);
          const sub: Record<string, string> = {};
          for (const kv of (mm![2] ?? '').split(',')) { const i = kv.indexOf('='); if (i > 0) sub[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); }
          const s = m.sRef(mm![1]!.trim(), path, ln);
          const smp = sampleAt(m.paths[path]!, s);
          const span = sub.span !== undefined ? num(sub.span, 0) : a.span !== undefined ? num(a.span, 0) : Math.max(4, smp.w - 3);
          c.items.push({ path, s, n: Math.max(1, Math.round(num(sub.n, defN))), span, line: ln });
        }
        break;
      }
      case 'PAD': {
        const path = pathIndex(m, a.path, ln);
        const kind = (a.kind ?? 'boost') as 'boost' | 'jump';
        if (kind !== 'boost' && kind !== 'jump') fail(ln, `PAD kind=${kind} (boost | jump)`);
        const d = num(a.d, 0), len = num(a.len, 6), w = num(a.w, 4);
        for (const e of topList(a.at)) { const s = m.sRef(e, path, ln); c.pads.push({ path, s0: s, s1: s + len, d0: d - w / 2, d1: d + w / 2, kind, line: ln }); }
        break;
      }
      case 'ZONE': {
        const kind = st.args[0] as ZoneKind;
        if (!['conveyor', 'surface', 'kill', 'noItem', 'camera', 'gravity'].includes(kind)) fail(ln, `ZONE ${kind ?? ''}: kind is conveyor | surface | kill | noItem | camera | gravity`);
        const path = pathIndex(m, a.path, ln);
        const p = m.paths[path]!;
        const s0 = m.sRef(a.from, path, ln, 0), s1 = m.sRef(a.to, path, ln, p.length);
        const dr = tuple(a.d);
        const full = dr.length < 2;
        const z: ZoneDef = { id: zoneId++, kind, path, s0, s1: s1 < s0 && p.closed ? s1 + p.length : s1, d0: full ? -1e3 : Math.min(dr[0]!, dr[1]!), d1: full ? 1e3 : Math.max(dr[0]!, dr[1]!), full, line: ln };
        if (kind === 'conveyor') { z.speedMul = num(a.mul, 1.15); z.surf = SURF(z.speedMul >= 1 ? 'conveyor_fwd' : 'conveyor_back'); }
        if (kind === 'surface') z.surf = SURF(parseSurf(a.surf, 'asphalt', file, ln));
        if (kind === 'kill') { z.belowY = a.belowY !== undefined ? num(a.belowY, 0) : undefined; if (a.surf) z.surf = SURF(parseSurf(a.surf, 'lava', file, ln)); }
        if (kind === 'gravity') {
          const mode = a.mode ?? 'low';
          z.gravMode = mode === 'world' ? 0 : mode === 'track' ? 1 : 2;
          z.gravScale = num(a.scale, mode === 'low' ? 0.4 : 1);
        }
        if (kind === 'camera') z.camera = a.hint ?? a.mode ?? 'default';
        c.zones.push(z);
        break;
      }
      case 'KILL': {
        const id = st.args[0] ?? `kill${c.killPlanes.length}`;
        if (a.belowY === undefined) fail(ln, 'KILL needs belowY=<y> [aabb=(x0,z0 .. x1,z1)]');
        const bb = tuple(a.aabb);
        const surf = (a.surf ?? (id.includes('lava') ? 'lava' : id.includes('water') ? 'water' : 'void')) as KillPlane['surf'];
        c.killPlanes.push({ id, y: num(a.belowY, 0), aabb: bb.length >= 4 ? [Math.min(bb[0]!, bb[2]!), Math.min(bb[1]!, bb[3]!), Math.max(bb[0]!, bb[2]!), Math.max(bb[1]!, bb[3]!)] : null, surf, line: ln });
        break;
      }
      case 'KILLY': c.killY = Number(st.args[0]); break;
      case 'KEYS': {
        c.keysDeclared = true;
        for (const e of topList(st.args.join(','))) c.keyGates.push(m.sRef(e, 0, ln));
        break;
      }
      case 'JUMPS': {
        // M1 legacy: JUMPS <s0>-<s1>,… marks airborne spans without geometry
        for (const r of topList(st.args.join(','))) {
          const [x, y] = r.split('-').map((v) => m.sRef(v, 0, ln));
          c.jumps.push({ path: 0, s0: x!, lipS: x!, landS0: y!, landS1: y! + 30, rampLen: 0, lipDeg: 0, gapLen: y! - x!, drop: 0, lipH: 0, landLen: 30, landW: 0, vMin: 20, vMax: 46, floor: 'none', line: ln, legacy: true });
        }
        break;
      }
      case 'PROPS': c.props.push({ kind: a.kind ?? 'tree', attrs: a, line: ln, mode: 'along' }); break;
      case 'PROP': c.props.push({ kind: a.kind ?? 'landmark', attrs: a, line: ln, mode: 'landmark' }); break;
      case 'THEME': {
        Object.assign(c.theme, a);
        if (st.args[0]) c.theme.themeId = st.args[0];
        break;
      }
      default: break;
    }
  }

  // ---- item boxes
  let boxId = 0;
  c.items.forEach((row, ri) => {
    const p = m.paths[row.path]!;
    const smp = sampleAt(p, row.s);
    for (let j = 0; j < row.n; j++) {
      const u = row.n === 1 ? 0 : -row.span / 2 + (j * row.span) / (row.n - 1);
      const q = surfacePoint(m, smp, u, 0.9);
      c.boxes.push({ id: boxId++, path: row.path, s: row.s, u, row: ri, x: q.x, y: q.y, z: q.z });
    }
  });

  // ---- grid: 8 slots behind the line, rows of `cols`, first row 8 m behind
  const gSt = ast.stmts.find((s) => s.cmd === 'GRID');
  const gd = { rows: num(gSt?.attrs.rows, 4), cols: num(gSt?.attrs.cols, 2), pitch: num(gSt?.attrs.pitch, 6), stagger: num(gSt?.attrs.stagger, 3), d: num(gSt?.attrs.d ?? gSt?.attrs.dAbs, 4) };
  for (let k = 0; k < 8; k++) {
    const row = Math.floor(k / gd.cols), col = k % gd.cols;
    const back = 8 + row * gd.pitch + (col % 2) * gd.stagger;
    const s = m.closed ? main.length - back : m.lineS - back;
    const smp = sampleAt(main, s);
    const u = gd.cols === 1 ? 0 : col === 0 ? -gd.d : gd.d;
    const q = surfacePoint(m, smp, u, 0);
    c.grid.push({ x: q.x, y: q.y, z: q.z, fx: smp.tx, fy: smp.ty, fz: smp.tz });
  }
  if (c.theme.themeId && !c.theme.theme) c.theme.theme = c.theme.themeId;
  return c;
}

// ------------------------------------------------------------------------------------------------ surfaces and flags
/** Surface code at (path, s, d). Priority: pads > zones > segment sub-ranges > profile points > shoulders > road. */
export function surfAt(m: TrackModel, c: Content, path: number, smp: Sample, d: number): number {
  for (const p of c.pads) if (p.path === path && inS(m, path, smp.s, p.s0, p.s1) && d >= p.d0 && d <= p.d1) return SURF(p.kind === 'boost' ? 'boost_pad' : 'jump_pad');
  for (const z of c.zones) {
    if (z.surf === undefined || z.path !== path) continue;
    if (inS(m, path, smp.s, z.s0, z.s1) && d >= z.d0 && d <= z.d1 && (z.kind !== 'kill' || z.belowY === undefined)) return z.surf;
  }
  const pm = m.paths[path]!;
  const pr = pm.prims[smp.prim];
  if (pr) for (const sub of pr.attr.surfSub) if (smp.pl >= sub.from && smp.pl <= sub.from + sub.len && Math.abs(d) <= smp.w / 2 + 1e-6) return SURF(sub.surf);
  const prof = m.profiles.get(smp.prof);
  if (prof && prof.kind === 'custom' && smp.profT > 0.5 && Math.abs(d) <= smp.w / 2) {
    const f = prof.width > 0 ? smp.w / prof.width : 1;
    let best = prof.pts[0]!;
    for (const q of prof.pts) if (Math.abs(q.d * f - d) < Math.abs(best.d * f - d)) best = q;
    if (best.surf) return SURF(best.surf);
  }
  if (d < -smp.w / 2 - 1e-6) return smp.shSurfL;
  if (d > smp.w / 2 + 1e-6) return smp.shSurfR;
  return smp.surf;
}

export function inS(m: TrackModel, path: number, s: number, s0: number, s1: number): boolean {
  const p = m.paths[path]!;
  if (!p.closed) return s >= s0 - 1e-6 && s <= s1 + 1e-6;
  const L = p.length;
  const a = ((s0 % L) + L) % L, span = s1 - s0;
  let x = ((s - a) % L + L) % L;
  if (x > L - 1e-6) x = 0;
  return x <= span + 1e-6;
}

export function zoneFlags(m: TrackModel, c: Content): void {
  for (const p of m.paths) {
    for (const smp of p.samples) {
      let f = surfAt(m, c, p.index, smp, 0) & SFLAG.SURF_MASK;
      if (smp.rmf) f |= SFLAG.RMF;
      let gm = smp.gravMode as number;
      for (const z of c.zones) if (z.kind === 'gravity' && z.path === p.index && inS(m, p.index, smp.s, z.s0, z.s1)) { gm = z.gravMode!; smp.grav = z.gravScale!; }
      smp.gravMode = gm as 0 | 1 | 2;
      f |= (gm << SFLAG.GRAV_SHIFT) & SFLAG.GRAV_MASK;
      if (smp.jumpPart) f |= SFLAG.JUMP;
      if (smp.jumpPart === 2 || smp.warp || p.kind === 'rail') f |= SFLAG.NO_GROUND;
      if (smp.noItem) f |= SFLAG.NO_ITEM;
      for (const z of c.zones) if (z.path === p.index && inS(m, p.index, smp.s, z.s0, z.s1)) {
        if (z.kind === 'noItem') f |= SFLAG.NO_ITEM;
        if (z.kind === 'kill' && z.full) f |= SFLAG.KILL;
      }
      for (const j of c.jumps) if (j.path === p.index && inS(m, p.index, smp.s, j.s0, j.landS1)) f |= SFLAG.JUMP;
      if (smp.warp) f |= SFLAG.WARP;
      if (smp.area) f |= SFLAG.AREA;
      smp.flags = f;
    }
  }
  // rail spans and junction blends on the host
  for (const p of m.paths) {
    if (!p.map) continue;
    const host = m.paths[p.map.host]!;
    if (p.kind === 'rail') for (const smp of host.samples) if (inS(m, host.index, smp.s, p.hostFrom, p.hostTo)) smp.flags |= SFLAG.RAIL;
  }
}

export { SURFACE_IDS, type SurfaceId, type Stmt };
