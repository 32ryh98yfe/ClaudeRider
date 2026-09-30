// Path model: primitives → 1 m samples with smoothed attributes and frames; branches and rails as extra paths.
// Main-line s is rotated on circuits so the finish line sits at s = 0 (sMain == s); p2p keeps DSL s with
// sMain = s − lineAt. Branch / rail samples carry sMain = fromS + (toS − fromS)·s / L (ADR-006 affine map).
import { SURFACE_IDS, type SurfaceId } from '@cr/content';
import { TrackDslError, num, type Attrs, type Stmt, type TrackAst } from './dsl.ts';
import { computeFrames } from './frames.ts';
import { BUILTIN_PROFILES, parseProfile, type ProfileDef } from './profiles.ts';
import { DEG, baseAttrs, evalPrim, initialGuesses, parseSurf, parseWall, rawY, runTurtle, type Prim, type SegAttr, type TurtleStart, type WallDef } from './turtle.ts';

export const SURF = (id: SurfaceId): number => SURFACE_IDS.indexOf(id) + 1;

export interface Sample {
  s: number;            // path-local baked s
  dsl: number;          // DSL s (main: before rotation; others: == s)
  x: number; y: number; z: number;
  tx: number; ty: number; tz: number; rx: number; ry: number; rz: number; ux: number; uy: number; uz: number;
  w: number; bank: number; shL: number; shR: number;
  surf: number; shSurfL: number; shSurfR: number;     // surface codes (SURFACE_IDS index + 1)
  wallL: WallDef; wallR: WallDef;
  prof: string; profT: number; crown: number;
  curv: number;          // signed plan curvature (+ left), 1/m
  prim: number; pl: number; // primitive index and offset into it
  frameReq: 0 | 1 | 2; rmf: boolean; tanSide?: -1 | 0 | 1;
  reachL?: number; reachR?: number; // lateral locate reach override (plazas)
  gravMode: 0 | 1 | 2; grav: number;
  jumpPart: 0 | 1 | 2 | 3; // none, ramp, gap (no ground), landing
  area: string | null; kill: string | null; warp: string | null; noItem: boolean; tag: string | null;
  sMain: number;
  flags: number;         // SFLAG bits, filled by content.ts
}

export type PathKind = 'main' | 'branch' | 'rail' | 'connector';
export interface PathModel {
  id: string; index: number; kind: PathKind; closed: boolean;
  prims: Prim[]; length: number; step: number; samples: Sample[];
  /** progress mapping onto the host, in sMain units (main-line baked s) */
  map: { host: number; fromS: number; toS: number } | null;
  /** host path-local baked s of the attachment points */
  hostFrom: number; hostTo: number;
  aiMinSkill: number;
  branchKind: 'shortcut' | 'risk' | 'alt' | null;
  labels: Map<string, number>;   // path-local DSL s
  gore: WallDef | null;
  residual: { dx: number; dz: number; dy: number; dpsi: number } | null;
  turn: number;
  line: number;
  rail?: RailModel;
  /** baked s + dslShift = DSL s (the main circuit is rotated so the line is at 0) */
  dslShift?: number;
}

export interface RailModel {
  id: string; host: number; hostFrom: number; hostTo: number; // host baked s
  offsets: { s: number; d: number; h: number }[];              // host baked s
  capture: { dMax: number; headingMaxDeg: number; vMin: number };
  speed: { min: number; accel: number; max: number }; gaugePerSec: number;
}

export interface TrackModel {
  ast: TrackAst; file: string; id: string;
  closed: boolean; laps: number; difficulty: number; theme: string; name: string;
  defaults: Attrs; blend: number;
  profiles: Map<string, ProfileDef>;
  paths: PathModel[];
  lineAt: number;       // DSL s of the line
  shift: number;        // closed: rotation applied to the main path (≈ lineAt)
  lineS: number;        // baked main s of the finish line (0 on circuits)
  lapLength: number;
  finishBefore: number;
  closure: { dx: number; dz: number; dy: number; dpsi: number };
  solved: Record<string, number>;
  /** DSL main s → baked main s */
  toMain(dsl: number): number;
  /** resolves an sRef (number or @label±n) on a path to that path's baked s */
  sRef(ref: string | undefined, path: number, line: number, def?: number): number;
  warnings: { line: number; msg: string }[];
}

const MAX_STEP = 1;

// ------------------------------------------------------------------------------------------------ smoothing
type Key = 'y' | 'w' | 'bank' | 'shL' | 'shR' | 'profT';

/** Triangular-kernel smoothing. Pinned samples keep their raw value; neighbours across a pinned boundary are
 *  replaced by the odd reflection about that boundary so linear raw profiles stay exact at the boundary. */
function smooth(S: Sample[], key: Key, window: number, closed: boolean, step: number, pinned?: Uint8Array, pinEnds = false): void {
  const half = Math.max(1, Math.round(window / 2 / step));
  const n = closed ? S.length - 1 : S.length;
  const src = new Float64Array(n);
  for (let i = 0; i < n; i++) src[i] = S[i]![key];
  const isPin = (j: number): boolean => (pinned ? pinned[j] === 1 : false) || (!closed && pinEnds && (j === 0 || j === n - 1));
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (isPin(i)) { out[i] = src[i]!; continue; }
    let acc = 0, wsum = 0;
    for (let k = -half; k <= half; k++) {
      const dir = k < 0 ? -1 : 1, ak = Math.abs(k);
      // walk from i toward i + k; stop at the first pinned sample (reflect) or the open end (truncate)
      let hit = -1, q = 1, outside = false;
      for (; q <= ak; q++) {
        let jj = i + dir * q;
        if (closed) jj = ((jj % n) + n) % n;
        else if (jj < 0 || jj >= n) { outside = true; break; }
        if (isPin(jj)) { hit = jj; break; }
      }
      if (outside) continue;
      let v: number;
      if (hit < 0) { let j = i + k; if (closed) j = ((j % n) + n) % n; v = src[j]!; }
      else {
        // odd reflection about the pinned sample: v(P + e) = 2 v(P) − v(P − e)
        const e = ak - q;
        let mirror = hit - dir * e;
        if (closed) mirror = ((mirror % n) + n) % n; else mirror = Math.max(0, Math.min(n - 1, mirror));
        v = 2 * src[hit]! - src[mirror]!;
      }
      const wt = half + 1 - ak;
      acc += v * wt; wsum += wt;
    }
    out[i] = wsum > 0 ? acc / wsum : src[i]!;
  }
  for (let i = 0; i < n; i++) S[i]![key] = out[i]!;
  if (closed) S[S.length - 1]![key] = S[0]![key];
}

// ------------------------------------------------------------------------------------------------ sampling
function primAt(prims: Prim[], s: number): number {
  let lo = 0, hi = prims.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (prims[mid]!.s0 <= s) lo = mid; else hi = mid - 1; }
  return lo;
}

function profileWidth(profiles: Map<string, ProfileDef>, id: string, w: number): number {
  const p = profiles.get(id);
  return p && p.kind !== 'flat' ? p.width : w;
}

function samplePrims(prims: Prim[], length: number, closed: boolean, profiles: Map<string, ProfileDef>): Sample[] {
  const n = Math.max(2, Math.round(length / MAX_STEP));
  const step = length / n;
  const S: Sample[] = [];
  const pt = { x: 0, z: 0, psi: 0, y: 0 };
  for (let k = 0; k <= n; k++) {
    const s = k === n ? length : k * step;
    const pi = Math.min(primAt(prims, s), prims.length - 1);
    const p = prims[pi]!;
    const pl = Math.min(Math.max(s - p.s0, 0), p.len);
    evalPrim(p, pl, pt);
    const a: SegAttr = p.attr;
    let w = profileWidth(profiles, a.prof, a.w);
    let jumpPart: Sample['jumpPart'] = 0;
    if (p.kind === 'jump') {
      const j = p.jump!;
      jumpPart = pl < j.rampLen ? 1 : pl < j.rampLen + j.gapLen ? 2 : 3;
      if (jumpPart === 3) w = Math.max(w, j.landW);
    }
    const curv = p.kind === 'clothoid' ? p.k0 + ((p.k1 - p.k0) * pl) / p.len : p.k0;
    S.push({
      s, dsl: s, x: pt.x, y: pt.y, z: pt.z, tx: 1, ty: 0, tz: 0, rx: 0, ry: 0, rz: 1, ux: 0, uy: 1, uz: 0,
      w, bank: p.kind === 'loop' ? 0 : a.bank, shL: a.shL, shR: a.shR,
      surf: SURF(a.surf), shSurfL: SURF(a.shSurfL), shSurfR: SURF(a.shSurfR), wallL: a.wallL, wallR: a.wallR,
      prof: a.prof, profT: a.prof !== 'flat' && profiles.get(a.prof)?.kind !== 'flat' ? 1 : 0, crown: profiles.get(a.prof)?.crown || a.crown,
      curv, prim: pi, pl, frameReq: a.frame === 'rmf' ? 2 : a.frame === 'worldUp' ? 1 : 0, rmf: false,
      gravMode: a.gravity ? (a.gravity.mode === 'world' ? 0 : a.gravity.mode === 'track' ? 1 : 2) : 0, grav: a.gravity ? a.gravity.scale : 1,
      jumpPart, area: a.area, kill: a.kill, warp: a.warp, noItem: a.noItem, tag: a.tag, sMain: s, flags: 0,
    });
  }
  if (closed) { const f = S[0]!, l = S[S.length - 1]!; l.x = f.x; l.z = f.z; }
  return S;
}

/** Smooths continuous attributes, keeps jumps and loops exact, then builds frames. */
function finishSamples(S: Sample[], prims: Prim[], closed: boolean, blend: number, step: number, profiles: Map<string, ProfileDef>, pinEnds: boolean): void {
  const n = closed ? S.length - 1 : S.length;
  const pinY = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const k = prims[S[i]!.prim]!.kind; if (k === 'jump' || k === 'loop') pinY[i] = 1; }
  smooth(S, 'y', blend * 1.5, closed, step, pinY, pinEnds);
  smooth(S, 'w', blend, closed, step, pinY, false);
  smooth(S, 'bank', blend, closed, step, undefined, pinEnds);
  smooth(S, 'shL', blend, closed, step);
  smooth(S, 'shR', blend, closed, step);
  // profile blend: keep the id of the nearest non-flat profile inside the blend window so fades keep their shape
  const rawProf = S.map((s) => s.prof);
  smooth(S, 'profT', blend, closed, step);
  const half = Math.max(1, Math.round(blend / step));
  for (let i = 0; i < S.length; i++) {
    const s = S[i]!;
    if (s.profT <= 1e-6) { s.profT = 0; continue; }
    if (profiles.get(rawProf[i]!)?.kind !== 'flat') continue;
    for (let k = 1; k <= half; k++) {
      const a = rawProf[closed ? (i + k) % n : Math.min(S.length - 1, i + k)]!, b = rawProf[closed ? ((i - k) % n + n) % n : Math.max(0, i - k)]!;
      if (profiles.get(a)?.kind !== 'flat') { s.prof = a; break; }
      if (profiles.get(b)?.kind !== 'flat') { s.prof = b; break; }
    }
  }
  // one-sided tangents where a jump changes part (ramp → gap → landing) so lips and landings keep their own slope
  for (let i = 0; i < S.length; i++) {
    const cur = S[i]!.jumpPart;
    if (!cur) continue;
    const nx = S[i + 1]?.jumpPart ?? cur, pv = S[i - 1]?.jumpPart ?? cur;
    if (nx !== cur) S[i]!.tanSide = -1;
    else if (pv !== cur) S[i]!.tanSide = 1;
  }
  computeFrames(S, closed);
}

// ------------------------------------------------------------------------------------------------ model
function header(ast: TrackAst): { closed: boolean; laps: number; diff: number; theme: string; name: string } {
  const h = ast.header;
  const topo = h.topo ?? 'circuit';
  if (topo !== 'circuit' && topo !== 'p2p') throw new TrackDslError({ file: ast.file, line: 1, col: 1, msg: `topo=${topo} (circuit | p2p)` });
  return { closed: topo === 'circuit', laps: h.laps && h.laps !== 'auto' ? num(h.laps, 3) : 3, diff: Math.max(1, Math.min(5, num(h.diff, 1))), theme: h.theme ?? 'spark_circuit', name: h.name ?? ast.id };
}

/** Linear interpolation of a path's samples at baked s (positions/frames/continuous attributes). */
export function sampleAt(p: PathModel, s: number): Sample {
  const S = p.samples, n = S.length;
  const ss = p.closed ? ((s % p.length) + p.length) % p.length : Math.max(0, Math.min(p.length, s));
  let i = Math.floor(ss / p.step);
  if (i >= n - 1) i = n - 2;
  if (i < 0) i = 0;
  const a = S[i]!, b = S[i + 1]!;
  const t = b.s > a.s ? Math.max(0, Math.min(1, (ss - a.s) / (b.s - a.s))) : 0;
  const L = (x: number, y: number): number => x + (y - x) * t;
  const out: Sample = { ...(t < 0.5 ? a : b) };
  out.s = ss; out.dsl = L(a.dsl, b.dsl);
  out.x = L(a.x, b.x); out.y = L(a.y, b.y); out.z = L(a.z, b.z);
  const nv = (x: number, y: number, z: number): [number, number, number] => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
  [out.tx, out.ty, out.tz] = nv(L(a.tx, b.tx), L(a.ty, b.ty), L(a.tz, b.tz));
  [out.rx, out.ry, out.rz] = nv(L(a.rx, b.rx), L(a.ry, b.ry), L(a.rz, b.rz));
  [out.ux, out.uy, out.uz] = nv(L(a.ux, b.ux), L(a.uy, b.uy), L(a.uz, b.uz));
  out.w = L(a.w, b.w); out.bank = L(a.bank, b.bank); out.shL = L(a.shL, b.shL); out.shR = L(a.shR, b.shR);
  out.profT = L(a.profT, b.profT); out.sMain = L(a.sMain, b.sMain); out.curv = L(a.curv, b.curv); out.grav = L(a.grav, b.grav);
  if (p.prims.length && (p.prims[a.prim]?.kind === 'jump' || p.prims[b.prim]?.kind === 'jump')) exactJump(p, out);
  return out;
}

/** Inside a J primitive: exact ramp/gap/landing height and slope (the ramp lip and the landing edge are sharp). */
function exactJump(p: PathModel, out: Sample): void {
  let dsl = out.s + (p.dslShift ?? 0);
  if (p.closed) dsl = ((dsl % p.length) + p.length) % p.length;
  const pi = primAt(p.prims, dsl);
  const pr = p.prims[pi]!;
  if (pr.kind !== 'jump') return;
  const j = pr.jump!;
  const pl = Math.min(Math.max(dsl - pr.s0, 0), pr.len);
  const pt = evalPrim(pr, pl, { x: 0, z: 0, psi: 0, y: 0 });
  // y is pinned to the raw profile in J spans, so the analytic value matches the stored samples
  out.x = pt.x; out.z = pt.z; out.y = pt.y;
  // rows exactly at the lip / landing edge belong to the ramp / landing (tolerance covers the rotation shift's rounding)
  const slope = pl <= j.rampLen + 1e-4 ? (2 * j.lipH * Math.min(pl, j.rampLen)) / (j.rampLen * j.rampLen) : pl < j.rampLen + j.gapLen - 1e-4 ? (-j.drop - j.lipH) / Math.max(1e-6, j.gapLen) : 0;
  if (pl <= j.rampLen + 1e-4) out.y = pr.y0 + j.lipH * Math.min(1, pl / j.rampLen) ** 2;
  else if (pl >= j.rampLen + j.gapLen - 1e-4) out.y = pr.y0 - j.drop;
  const c = Math.cos(pr.psi0 * DEG), sn = Math.sin(pr.psi0 * DEG);
  const tl = Math.hypot(1, slope);
  const tx = c / tl, ty = slope / tl, tz = -sn / tl;
  let rx = -tz, rz = tx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  const ux = -rz * ty, uy = rz * tx - rx * tz, uz = rx * ty;
  const b = (out.bank * Math.PI) / 180, cb = Math.cos(b), sb = Math.sin(b);
  out.tx = tx; out.ty = ty; out.tz = tz;
  out.rx = rx * cb + ux * sb; out.ry = uy * sb; out.rz = rz * cb + uz * sb;
  out.ux = ux * cb - rx * sb; out.uy = uy * cb; out.uz = uz * cb - rz * sb;
  out.prim = pi; out.pl = pl;
  out.jumpPart = pl < j.rampLen ? 1 : pl < j.rampLen + j.gapLen ? 2 : 3;
}

/** sampleAt, with the discrete attributes (walls, surfaces, jump part, warp…) taken from the exact primitive at s
 *  instead of the nearest 1 m sample — used for anything decided per row pair (walls, gaps, surfaces). */
export function exactAt(m: { shift: number }, p: PathModel, s: number): Sample {
  const out = sampleAt(p, s);
  if (!p.prims.length) return out;
  let dsl = out.s;
  if (p.index === 0 && p.closed) dsl = (((out.s + m.shift) % p.length) + p.length) % p.length;
  const pi = primAt(p.prims, dsl);
  const pr = p.prims[pi]!;
  const pl = Math.min(Math.max(dsl - pr.s0, 0), pr.len);
  const a = pr.attr;
  out.prim = pi; out.pl = pl; out.dsl = dsl;
  out.surf = SURF(a.surf); out.shSurfL = SURF(a.shSurfL); out.shSurfR = SURF(a.shSurfR);
  out.wallL = a.wallL; out.wallR = a.wallR; out.area = a.area; out.kill = out.kill ?? a.kill; out.warp = a.warp; out.noItem = a.noItem; out.tag = a.tag;
  out.jumpPart = 0;
  if (pr.kind === 'jump') { const j = pr.jump!; out.jumpPart = pl < j.rampLen ? 1 : pl < j.rampLen + j.gapLen ? 2 : 3; }
  return out;
}

function dslPose(main: PathModel, dsl: number): TurtleStart & { s: Sample } {
  // main samples are still in DSL order when branches are built
  const s = sampleAt(main, dsl);
  return { x: s.x, y: s.y, z: s.z, psi: Math.atan2(-s.tz, s.tx) / DEG, s };
}

export function buildModel(ast: TrackAst): TrackModel {
  const file = ast.file;
  const hd = header(ast);
  const warnings: { line: number; msg: string }[] = [];
  const top = ast.stmts;
  const defaults: Attrs = {};
  for (const st of top) if (st.cmd === 'DEFAULTS') Object.assign(defaults, st.attrs);
  const blend = num(defaults.blend, 15);
  const profiles = new Map<string, ProfileDef>(Object.entries(BUILTIN_PROFILES));
  for (const st of top) if (st.cmd === 'PROFILE') { const p = parseProfile(st, file); profiles.set(p.id, p); }
  for (const st of top) if (st.attrs.prof && !profiles.has(st.attrs.prof)) throw new TrackDslError({ file, line: st.line, col: 1, msg: `unknown profile ${st.attrs.prof} (define it with PROFILE ${st.attrs.prof} …)` });

  const startSt = top.find((s) => s.cmd === 'START');
  const pos = (startSt?.attrs.pos ?? '(0,0,0)').replace(/[()]/g, '').split(',').map(Number);
  const start: TurtleStart = { x: pos[0] ?? 0, y: pos[1] ?? 0, z: pos[2] ?? 0, psi: num(startSt?.attrs.hdg, 0) };
  const closeSt = top.find((s) => s.cmd === 'CLOSE');
  const close = closeSt ? { solve: (closeSt.attrs.solve ?? '').replace(/[[\]\s]/g, '').split(',').filter(Boolean), length: num(closeSt.attrs.length, 0), closed: hd.closed } : undefined;
  const base = baseAttrs(defaults, file);

  // ---- main
  const mainT = runTurtle({ ast, stmts: top, start, base, close, initial: initialGuesses(top) });
  if (!mainT.prims.length) throw new TrackDslError({ file, line: 1, col: 1, msg: 'the track has no segments' });
  const L = mainT.length;
  const mainSamples = samplePrims(mainT.prims, L, hd.closed, profiles);
  const n = mainSamples.length - 1;
  const step = L / n;
  const main: PathModel = {
    id: 'main', index: 0, kind: 'main', closed: hd.closed, prims: mainT.prims, length: L, step, samples: mainSamples,
    map: null, hostFrom: 0, hostTo: L, aiMinSkill: 0, branchKind: null, labels: mainT.labels, gore: null, residual: null, turn: mainT.turn, line: 1,
  };
  finishSamples(mainSamples, mainT.prims, hd.closed, blend, step, profiles, false);

  const closure = { dx: 0, dz: 0, dy: 0, dpsi: 0 };
  if (hd.closed) {
    closure.dx = mainT.end.x - start.x; closure.dz = mainT.end.z - start.z; closure.dy = mainT.end.y - start.y;
    let dp = (((mainT.end.psi - start.psi) % 360) + 360) % 360; if (dp > 180) dp -= 360; closure.dpsi = dp;
  }

  // ---- line position
  const lineSt = top.find((s) => s.cmd === 'LINE');
  const labelOf = (name: string, path: PathModel | null, line: number): number => {
    const v = path?.labels.get(name) ?? main.labels.get(name);
    if (v === undefined) throw new TrackDslError({ file, line, col: 1, msg: `unknown label @${name}` });
    return v;
  };
  const dslRef = (ref: string, path: PathModel | null, line: number): number => {
    const m = /^@([A-Za-z_][A-Za-z0-9_]*)([+-][\d.]+)?$/.exec(ref.trim());
    if (m) return labelOf(m[1]!, path, line) + (m[2] ? Number(m[2]) : 0);
    const v = Number(ref.replace(/^\+/, ''));
    if (!Number.isFinite(v)) throw new TrackDslError({ file, line, col: 1, msg: `bad s reference ${ref} (number or @label±offset)` });
    return v;
  };
  const lineAt = lineSt ? dslRef(lineSt.attrs.at ?? '0', null, lineSt.line) : 0;
  const shift = hd.closed ? (((Math.round(lineAt / step) % n) + n) % n) * step : 0;
  const toMain = (dsl: number): number => (hd.closed ? ((((dsl - shift) % L) + L) % L) : dsl);
  const sMainOfMain = (bakedS: number): number => (hd.closed ? bakedS : bakedS - lineAt);
  const finishBefore = num(ast.header.finishBefore, 20);
  const lapLength = hd.closed ? L : L - lineAt - finishBefore;

  const paths: PathModel[] = [main];
  // ---- branches (built on main samples in DSL order)
  for (const st of top) {
    if (st.cmd !== 'BRANCH') continue;
    const id = st.args[0] ?? '';
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) throw new TrackDslError({ file, line: st.line, col: 1, msg: 'BRANCH needs an id' });
    if (!st.block) throw new TrackDslError({ file, line: st.line, col: 1, msg: `BRANCH ${id} needs a { … } block of segments` });
    const host = st.attrs.host ?? 'main';
    if (host !== 'main') throw new TrackDslError({ file, line: st.line, col: 1, msg: `BRANCH ${id}: only host=main is supported` });
    const fromD = dslRef(st.attrs.from ?? '', null, st.line), toD = dslRef(st.attrs.to ?? '', null, st.line);
    const a = dslPose(main, fromD), b = dslPose(main, toD);
    const bAttrs = baseAttrs({ ...defaults, ...st.attrs }, file, st.line);
    // branches start without shoulders unless they declare them; the host's surface is the natural default
    if (st.attrs.shoulders === undefined && st.attrs.shoulder === undefined) { bAttrs.shL = bAttrs.shR = 0; }
    const t = runTurtle({
      ast, stmts: st.block, start: { x: a.x, y: a.y, z: a.z, psi: a.psi }, base: bAttrs,
      close: { solve: st.block.filter((s) => s.cmd === 'S' && s.args[0]?.startsWith('?')).map((s) => s.args[0]!.split('=')[0]!).filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 2), length: 0, target: { x: b.x, y: b.y, z: b.z, psi: b.psi }, closed: false },
      initial: initialGuesses(st.block),
    });
    const Lb = t.length;
    const S = samplePrims(t.prims, Lb, false, profiles);
    // residual: pull the end onto the host at `to` with a smoothstep displacement field (exact at both ends)
    const ex = b.x - t.end.x, ez = b.z - t.end.z, ey = b.y - t.end.y;
    let dpsi = (((b.psi - t.end.psi) % 360) + 360) % 360; if (dpsi > 180) dpsi -= 360;
    for (const smp of S) { const f = smp.s / Lb, w = f * f * (3 - 2 * f); smp.x += ex * w; smp.z += ez * w; smp.y += ey * w; }
    if (Math.hypot(ex, ez) > 2) warnings.push({ line: st.line, msg: `BRANCH ${id}: end misses the host by ${Math.hypot(ex, ez).toFixed(2)} m (blended); add free straights ?x/?y to solve it exactly` });
    // bank pinned to the host's at both ends so the junction surfaces meet
    S[0]!.bank = a.s.bank; S[S.length - 1]!.bank = b.s.bank;
    const stepB = Lb / (S.length - 1);
    finishSamples(S, t.prims, false, blend, stepB, profiles, true);
    const fromS = sMainOfMain(toMain(fromD)), toS0 = sMainOfMain(toMain(toD));
    const kind = (st.attrs.kind ?? 'shortcut') as PathModel['branchKind'];
    if (kind !== 'shortcut' && kind !== 'risk' && kind !== 'alt') throw new TrackDslError({ file, line: st.line, col: 1, msg: `BRANCH kind=${String(kind)} (shortcut | risk | alt)` });
    const pm: PathModel = {
      id, index: paths.length, kind: 'branch', closed: false, prims: t.prims, length: Lb, step: stepB, samples: S,
      map: { host: 0, fromS, toS: toS0 }, hostFrom: toMain(fromD), hostTo: toMain(toD),
      aiMinSkill: num(st.attrs.aiMin ?? st.attrs.aiMinSkill, 0.2), branchKind: kind, labels: t.labels,
      gore: st.attrs.gore === 'none' ? null : parseWall(st.attrs.gore, { type: 'barrier', h: 1, soft: true, ledgeKill: false }, file, st.line),
      residual: { dx: ex, dz: ez, dy: ey, dpsi }, turn: t.turn, line: st.line,
    };
    // apply the segment-level kill= of the BRANCH line to the whole branch
    if (st.attrs.kill) for (const smp of S) smp.kill = smp.kill ?? st.attrs.kill;
    paths.push(pm);
  }

  // ---- rails (offset curves along a host span)
  for (const st of top) {
    if (st.cmd !== 'RAIL') continue;
    paths.push(buildRail(st, paths, main, dslRef, toMain, sMainOfMain, file));
  }

  // ---- rotate the main path so the line is at s = 0 (circuits)
  if (hd.closed && shift > 0) {
    const j = Math.round(shift / step);
    const body = mainSamples.slice(0, n);
    const rot = body.slice(j).concat(body.slice(0, j));
    rot.forEach((s, k) => { s.s = k * step; });
    const last = { ...rot[0]!, s: L };
    main.samples = [...rot, last];
  }
  main.dslShift = hd.closed ? shift : 0;
  for (const s of main.samples) s.sMain = sMainOfMain(s.s);
  for (const p of paths) {
    if (p.kind === 'main' || !p.map) continue;
    let to = p.map.toS;
    if (hd.closed && to < p.map.fromS) to += L;
    // stored unwrapped (may exceed L when a branch crosses the line) so interpolation stays monotonic; the runtime wraps
    for (const s of p.samples) s.sMain = p.map.fromS + ((to - p.map.fromS) * s.s) / p.length;
  }

  const model: TrackModel = {
    ast, file, id: ast.id, closed: hd.closed, laps: hd.laps, difficulty: hd.diff, theme: hd.theme, name: hd.name,
    defaults, blend, profiles, paths, lineAt, shift, lineS: hd.closed ? 0 : lineAt, lapLength, finishBefore, closure, solved: mainT.solved,
    toMain,
    sRef(ref, path, line, def) {
      if (ref === undefined || ref === '') {
        if (def === undefined) throw new TrackDslError({ file, line, col: 1, msg: 'missing s reference' });
        return def;
      }
      const pm = paths[path]!;
      const d = dslRef(ref, pm, line);
      return path === 0 ? toMain(d) : d;
    },
    warnings,
  };
  return model;
}

function buildRail(st: Stmt, paths: PathModel[], main: PathModel, dslRef: (r: string, p: PathModel | null, line: number) => number,
  toMain: (d: number) => number, sMainOfMain: (s: number) => number, file: string): PathModel {
  const id = st.args[0] ?? '';
  const a = st.attrs;
  const fail = (msg: string): never => { throw new TrackDslError({ file, line: st.line, col: 1, msg }); };
  if (!id) fail('RAIL needs an id');
  const hostId = a.host ?? 'main';
  const host = paths.find((p) => p.id === hostId) ?? fail(`RAIL ${id}: unknown host ${hostId}`);
  if (host.kind === 'rail') fail('a RAIL cannot be hosted on another rail');
  const fromD = dslRef(a.from ?? '', host === main ? null : host, st.line), toD = dslRef(a.to ?? '', host === main ? null : host, st.line);
  if (!(toD > fromD)) fail(`RAIL ${id}: to must be after from`);
  const h = num(a.h, 1.0);
  // offsets: d=[s:d,…] (absolute host DSL s, or relative to from when all keys are < from); optional s:d:h triples
  const ref = (v: string): number => dslRef(v, host === main ? null : host, st.line);
  const keys = (a.d ?? '').replace(/^\[|\]$/g, '').split(',').filter(Boolean).map((p) => { const q = p.split(':'); return { s: ref(q[0]!), d: Number(q[1] ?? 0), h: q[2] !== undefined ? Number(q[2]) : h }; });
  if (keys.some((k) => !Number.isFinite(k.s) || !Number.isFinite(k.d) || !Number.isFinite(k.h))) fail(`RAIL ${id}: bad d=[s:d[:h],…] table`);
  if (!keys.length) keys.push({ s: fromD, d: 0, h }, { s: toD, d: 0, h });
  if (keys.every((k) => k.s < fromD - 1e-6) || keys[0]!.s === 0) for (const k of keys) k.s += fromD;
  keys.sort((p, q) => p.s - q.s);
  const offAt = (s: number): { d: number; h: number } => {
    if (s <= keys[0]!.s) return { d: keys[0]!.d, h: keys[0]!.h };
    for (let i = 0; i + 1 < keys.length; i++) {
      const k0 = keys[i]!, k1 = keys[i + 1]!;
      if (s <= k1.s) { const t = (s - k0.s) / Math.max(1e-6, k1.s - k0.s), w = t * t * (3 - 2 * t); return { d: k0.d + (k1.d - k0.d) * w, h: k0.h + (k1.h - k0.h) * w }; }
    }
    const kl = keys[keys.length - 1]!; return { d: kl.d, h: kl.h };
  };
  // fine polyline along the host, then resample by rail arc length at ~1 m
  const pts: { x: number; y: number; z: number; ux: number; uy: number; uz: number; hs: number }[] = [];
  const N = Math.max(8, Math.ceil((toD - fromD) / 0.25));
  for (let i = 0; i <= N; i++) {
    const ds = fromD + ((toD - fromD) * i) / N;
    const hs = host === main ? ds : ds; // main samples are still in DSL order here
    const smp = sampleAt(host, hs);
    const o = offAt(ds);
    pts.push({ x: smp.x + smp.rx * o.d + smp.ux * o.h, y: smp.y + smp.ry * o.d + smp.uy * o.h, z: smp.z + smp.rz * o.d + smp.uz * o.h, ux: smp.ux, uy: smp.uy, uz: smp.uz, hs: ds });
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y, pts[i]!.z - pts[i - 1]!.z));
  const Lr = cum[cum.length - 1]!;
  const nr = Math.max(2, Math.round(Lr));
  const S: Sample[] = [];
  let j = 0;
  const hs0 = sampleAt(host, fromD);
  for (let k = 0; k <= nr; k++) {
    const s = (k / nr) * Lr;
    while (j < pts.length - 2 && cum[j + 1]! < s) j++;
    const t = (s - cum[j]!) / Math.max(1e-9, cum[j + 1]! - cum[j]!);
    const p0 = pts[j]!, p1 = pts[j + 1]!;
    const L1 = (x: number, y: number): number => x + (y - x) * t;
    S.push({
      ...hs0, s, dsl: s, x: L1(p0.x, p1.x), y: L1(p0.y, p1.y), z: L1(p0.z, p1.z), ux: L1(p0.ux, p1.ux), uy: L1(p0.uy, p1.uy), uz: L1(p0.uz, p1.uz),
      w: 3, bank: 0, shL: 0, shR: 0, wallL: { type: 'none', h: 0, soft: false, ledgeKill: false }, wallR: { type: 'none', h: 0, soft: false, ledgeKill: false },
      prof: 'flat', profT: 0, crown: 0, curv: 0, prim: 0, pl: L1(p0.hs, p1.hs), frameReq: 1, jumpPart: 0, area: null, kill: null, warp: null, noItem: true, tag: null, sMain: 0, flags: 0,
      surf: SURF('rail'),
    });
  }
  // frames: tangent from positions, up from the host (re-orthogonalised), R = T × U
  for (let i = 0; i < S.length; i++) {
    const a0 = S[Math.max(0, i - 1)]!, b0 = S[Math.min(S.length - 1, i + 1)]!;
    let tx = b0.x - a0.x, ty = b0.y - a0.y, tz = b0.z - a0.z; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    const s0 = S[i]!;
    const du = s0.ux * tx + s0.uy * ty + s0.uz * tz;
    let ux = s0.ux - du * tx, uy = s0.uy - du * ty, uz = s0.uz - du * tz; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    s0.tx = tx; s0.ty = ty; s0.tz = tz; s0.ux = ux; s0.uy = uy; s0.uz = uz;
    s0.rx = ty * uz - tz * uy; s0.ry = tz * ux - tx * uz; s0.rz = tx * uy - ty * ux;
  }
  const cap = namedTupleSafe(a.capture), spd = namedTupleSafe(a.speed);
  const gauge = num((a.gauge ?? '0.30').replace(/\/s$/, ''), 0.3);
  const hostFrom = host === main ? toMain(fromD) : fromD, hostTo = host === main ? toMain(toD) : toD;
  const fromS = host === main ? sMainOfMain(hostFrom) : fromD, toS = host === main ? sMainOfMain(hostTo) : toD;
  const rail: RailModel = {
    id, host: host.index, hostFrom, hostTo, offsets: keys.map((k) => ({ s: host === main ? toMain(k.s) : k.s, d: k.d, h: k.h })),
    capture: { dMax: cap.dMax ?? 2.0, headingMaxDeg: cap.hdg ?? cap.heading ?? 25, vMin: cap.vMin ?? 15 },
    speed: { min: spd.min ?? 38, accel: spd.accel ?? 3, max: spd.max ?? 42 }, gaugePerSec: gauge,
  };
  return {
    id, index: paths.length, kind: 'rail', closed: false, prims: [], length: Lr, step: Lr / nr, samples: S,
    map: { host: host.index, fromS, toS }, hostFrom, hostTo, aiMinSkill: num(a.aiMin, 0.5), branchKind: null,
    labels: new Map(), gore: null, residual: null, turn: 0, line: st.line, rail,
  };
}

function namedTupleSafe(v: string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v) return out;
  for (const part of v.replace(/^\(|\)$/g, '').split(',')) {
    const m = /^\s*([A-Za-z]+)\s*[= ]\s*([-+]?[\d.]+)\s*$/.exec(part);
    if (m) out[m[1]!] = Number(m[2]);
  }
  return out;
}

export { rawY, parseSurf };
