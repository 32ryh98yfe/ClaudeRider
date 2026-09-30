// Turtle: segment statements → exact plan primitives (line, arc, clothoid, loop, jump) with resolved attributes,
// plus the CLOSE solver for free straights (?a, ?b, ?c). Coordinates: three.js world, x east, y up, north = −z.
// Heading ψ is in degrees CCW from +x: dir = (cos ψ, 0, −sin ψ); left normal nL = (−sin ψ, 0, −cos ψ).
import { SURFACE_IDS, type SurfaceId } from '@cr/content';
import { TrackDslError, num, type Attrs, type Stmt, type TrackAst } from './dsl.ts';

export const DEG = Math.PI / 180;

export const WALL_TYPES = ['none', 'curb', 'barrier', 'fence', 'rock', 'parapet', 'building', 'invisible', 'planter', 'pillar'] as const;
export type WallType = (typeof WALL_TYPES)[number];
/** Default heights (m) when a wall spec gives only the type. */
const WALL_H: Record<WallType, number> = { none: 0, curb: 0.15, barrier: 1.0, fence: 1.6, rock: 1.2, parapet: 1.0, building: 4, invisible: 3, planter: 0.8, pillar: 1.5 };

export interface WallDef { type: WallType; h: number; soft: boolean; ledgeKill: boolean }
export interface Gravity { mode: 'world' | 'track' | 'low'; scale: number }

/** Attributes of one segment after turtle-state resolution (persistent ones carried, one-shot ones reset). */
export interface SegAttr {
  // persistent
  w: number; surf: SurfaceId; wallL: WallDef; wallR: WallDef;
  shL: number; shR: number; shSurfL: SurfaceId; shSurfR: SurfaceId; crown: number;
  // one-shot (this segment only)
  dy: number; bank: number; prof: string; area: string | null; kill: string | null;
  frame: 'auto' | 'worldUp' | 'rmf'; gravity: Gravity | null; noItem: boolean; warp: string | null; tag: string | null;
  surfSub: { surf: SurfaceId; from: number; len: number }[];
}

export interface JumpSpec { rampLen: number; lipDeg: number; gapLen: number; drop: number; landLen: number; landW: number; vMin: number; vMax: number; floor: 'kill' | 'none'; lipH: number }
export interface LoopSpec { R: number; shift: number; ease: number; side: 1 | -1 }

export interface Prim {
  kind: 'line' | 'arc' | 'clothoid' | 'loop' | 'jump';
  x0: number; z0: number; psi0: number;  // start (plan), heading in degrees
  y0: number;                            // raw elevation at start
  len: number;
  k0: number; k1: number;                // signed plan curvature (+ = left) at start / end (1/m)
  dy: number;                            // raw elevation change over the primitive
  s0: number;                            // path-local start (DSL s for the main path)
  stmt: number; line: number; attr: SegAttr;
  jump?: JumpSpec; loop?: LoopSpec;
  /** clothoid / loop integration table: [l, x, z, y, psi(deg)] every `tStep` metres (relative to start). */
  table?: Float64Array; tStep?: number;
}

export interface TurtleStart { x: number; y: number; z: number; psi: number }
export interface TurtleResult {
  prims: Prim[]; length: number; end: TurtleStart; solved: Record<string, number>;
  labels: Map<string, number>;          // label → path-local s (start of the labelled statement)
  turn: number;                          // total plan heading change (deg)
}

// ------------------------------------------------------------------------------------------------ attributes
export function parseWall(spec: string | undefined, def: WallDef, file: string, line: number): WallDef {
  if (spec === undefined) return def;
  const parts = spec.split(':');
  const type = parts[0] as WallType;
  if (!(WALL_TYPES as readonly string[]).includes(type)) throw new TrackDslError({ file, line, col: 1, msg: `unknown wall type ${type} (one of ${WALL_TYPES.join(', ')})` });
  let h = WALL_H[type];
  let soft = type === 'planter', ledgeKill = false;
  for (const p of parts.slice(1)) {
    if (p === 'soft') soft = true;
    else if (p === 'ledgeKill') ledgeKill = true;
    else if (p !== '' && Number.isFinite(Number(p))) h = Number(p);
    else throw new TrackDslError({ file, line, col: 1, msg: `bad wall spec ${spec} (type:height[:soft][:ledgeKill])` });
  }
  return { type, h, soft, ledgeKill };
}

export function parseSurf(s: string | undefined, def: SurfaceId, file: string, line: number): SurfaceId {
  if (!s) return def;
  if (!(SURFACE_IDS as readonly string[]).includes(s)) throw new TrackDslError({ file, line, col: 1, msg: `unknown surface ${s} (SURFACE_IDS: ${SURFACE_IDS.join(', ')})` });
  return s as SurfaceId;
}

function parseGravity(v: string | undefined, file: string, line: number): Gravity | null {
  if (!v) return null;
  if (v === 'world') return { mode: 'world', scale: 1 };
  if (v === 'track') return { mode: 'track', scale: 1 };
  const m = /^low(?::([\d.]+))?$/.exec(v);
  if (m) return { mode: 'low', scale: m[1] ? Number(m[1]) : 0.4 };
  throw new TrackDslError({ file, line, col: 1, msg: `bad gravity=${v} (world | track | low:<scale>)` });
}

export function baseAttrs(defaults: Attrs, file: string, line = 1): SegAttr {
  const wall = defaults.wall;
  const base: SegAttr = {
    w: num(defaults.w, 16), surf: parseSurf(defaults.surf, 'asphalt', file, line),
    wallL: parseWall(defaults.wallL ?? wall, { type: 'barrier', h: 1, soft: false, ledgeKill: false }, file, line),
    wallR: parseWall(defaults.wallR ?? wall, { type: 'barrier', h: 1, soft: false, ledgeKill: false }, file, line),
    shL: 0, shR: 0, shSurfL: 'grass', shSurfR: 'grass', crown: num(defaults.crown, 0),
    dy: 0, bank: 0, prof: defaults.prof ?? 'flat', area: null, kill: null, frame: 'auto', gravity: null, noItem: false, warp: null, tag: null, surfSub: [],
  };
  applyPersistent(base, defaults, file, line);
  return base;
}

function applyShoulders(a: SegAttr, v: string, file: string, line: number, side: 'both' | 'L' | 'R'): void {
  const [w, s] = v.split(':');
  const width = Number(w);
  if (!Number.isFinite(width) || width < 0) throw new TrackDslError({ file, line, col: 1, msg: `bad shoulders=${v} (width[:surface])` });
  if (side !== 'R') { a.shL = width; if (s) a.shSurfL = parseSurf(s, a.shSurfL, file, line); }
  if (side !== 'L') { a.shR = width; if (s) a.shSurfR = parseSurf(s, a.shSurfR, file, line); }
}

function applyPersistent(a: SegAttr, at: Attrs, file: string, line: number): void {
  if (at.w !== undefined) a.w = num(at.w, a.w);
  if (at.surf !== undefined && !at.surf.includes('@')) a.surf = parseSurf(at.surf, a.surf, file, line);
  if (at.wall !== undefined) { a.wallL = parseWall(at.wall, a.wallL, file, line); a.wallR = parseWall(at.wall, a.wallR, file, line); }
  if (at.wallL !== undefined) a.wallL = parseWall(at.wallL, a.wallL, file, line);
  if (at.wallR !== undefined) a.wallR = parseWall(at.wallR, a.wallR, file, line);
  // shoulders: `shoulders=1.5:grass` (both), `shoulder=2` + `shoulderSurf=grass` (M1 form), per side L/R
  if (at.shoulders !== undefined) applyShoulders(a, at.shoulders, file, line, 'both');
  if (at.shoulder !== undefined) { a.shL = a.shR = num(at.shoulder, 0); }
  if (at.shoulderL !== undefined) applyShoulders(a, at.shoulderL, file, line, 'L');
  if (at.shoulderR !== undefined) applyShoulders(a, at.shoulderR, file, line, 'R');
  if (at.shoulderSurf !== undefined) { a.shSurfL = a.shSurfR = parseSurf(at.shoulderSurf, a.shSurfL, file, line); }
  if (at.crown !== undefined) a.crown = num(at.crown, 0);
}

/** Resolves a segment's attributes from the running turtle state (persistent) plus its own one-shot values. */
function segAttrs(cur: SegAttr, at: Attrs, file: string, line: number, turnSide: 'L' | 'R' | null): SegAttr {
  const next: SegAttr = { ...cur, surfSub: [] };
  applyPersistent(next, at, file, line);
  // persistent values become the new turtle state; one-shots below apply to this segment only
  Object.assign(cur, next, { surfSub: [] });
  next.dy = num(at.dy, 0);
  next.bank = num(at.bank, 0);
  next.prof = at.prof ?? next.prof;
  next.area = at.area ?? null;
  next.kill = at.kill ?? null;
  next.frame = at.frame === 'rmf' ? 'rmf' : at.frame === 'worldUp' ? 'worldUp' : 'auto';
  next.gravity = parseGravity(at.gravity, file, line);
  next.noItem = at.noitem === '1' || at.noItem === '1' || at.noItem === 'true';
  next.warp = at.warp ?? null;
  next.tag = at.tag ?? null;
  if (turnSide && (at.wallIn !== undefined || at.wallOut !== undefined)) {
    const inner = turnSide === 'L' ? 'wallL' : 'wallR', outer = turnSide === 'L' ? 'wallR' : 'wallL';
    if (at.wallIn !== undefined) next[inner] = parseWall(at.wallIn, next[inner], file, line);
    if (at.wallOut !== undefined) next[outer] = parseWall(at.wallOut, next[outer], file, line);
  }
  if (at.surf?.includes('@')) {
    // surf=gravel@20+30 → gravel from 20 m into the segment for 30 m (gap-3 alley)
    for (const part of at.surf.split(',')) {
      const m = /^([a-z_]+)@([\d.]+)\+([\d.]+)$/.exec(part);
      if (!m) throw new TrackDslError({ file, line, col: 1, msg: `bad surf=${at.surf} (surface@from+len)` });
      next.surfSub.push({ surf: parseSurf(m[1], next.surf, file, line), from: Number(m[2]), len: Number(m[3]) });
    }
  }
  return next;
}

// ------------------------------------------------------------------------------------------------ segment expansion
/** A primitive segment command after macro expansion. */
interface SegCmd {
  kind: 'S' | 'C' | 'E' | 'J' | 'LOOP';
  len?: number; v?: string;             // S: fixed length or free variable name
  r?: number; deg?: number; dir?: 'L' | 'R';
  k0?: number; k1?: number;             // E: signed curvatures
  jump?: Omit<JumpSpec, 'lipH'>; loop?: LoopSpec;
  attrs: Attrs; line: number; stmt: number;
}

const SEGMENT_CMDS = new Set(['S', 'C', 'E', 'J', 'LOOP', 'HELIX', 'WIGGLE', 'CHICANE', 'HAIRPIN', 'CLOVERLEAF', 'PLAZA']);
export const isSegment = (s: Stmt): boolean => SEGMENT_CMDS.has(s.cmd);

function radiusTok(t: string | undefined, file: string, line: number): number {
  const m = /^R([\d.]+)$/.exec(t ?? '');
  if (!m || !(Number(m[1]) > 0)) throw new TrackDslError({ file, line, col: 1, msg: `expected R<radius>, got ${t ?? 'nothing'}` });
  return Number(m[1]);
}
function dirTok(t: string | undefined, file: string, line: number): 'L' | 'R' {
  const d = (t ?? '').toUpperCase();
  if (d !== 'L' && d !== 'R') throw new TrackDslError({ file, line, col: 1, msg: `expected L or R, got ${t ?? 'nothing'}` });
  return d;
}

function expand(st: Stmt, idx: number, ast: TrackAst): SegCmd[] {
  const f = ast.file, ln = st.line, a = st.attrs;
  const fail = (msg: string): never => { throw new TrackDslError({ file: f, line: ln, col: 1, msg }); };
  switch (st.cmd) {
    case 'S': {
      const t = st.args[0] ?? fail('S needs a length');
      if (t.startsWith('?')) return [{ kind: 'S', v: t.split('=')[0]!, attrs: a, line: ln, stmt: idx }];
      const len = Number(t);
      if (!(len > 0)) fail(`bad straight length ${t}`);
      return [{ kind: 'S', len, attrs: a, line: ln, stmt: idx }];
    }
    case 'C': case 'HELIX': {
      const r = radiusTok(st.args[0], f, ln), deg = Number(st.args[1]), dir = dirTok(st.args[2], f, ln);
      if (!(deg > 0)) fail(`${st.cmd} needs a positive angle`);
      return [{ kind: 'C', r, deg, dir, attrs: a, line: ln, stmt: idx }];
    }
    case 'HAIRPIN': {
      const r = radiusTok(st.args[0], f, ln), dir = dirTok(st.args[1], f, ln);
      return [{ kind: 'C', r, deg: 180, dir, attrs: a, line: ln, stmt: idx }];
    }
    case 'WIGGLE': case 'CHICANE': {
      // WIGGLE R<r> a/b/a L|R → C a dir ; C b other ; C a dir (dy spread by angle, bank sign follows the turn side)
      const r = radiusTok(st.args[0], f, ln);
      const parts = (st.args[1] ?? '').split('/').map(Number);
      if (parts.length < 2 || parts.some((p) => !(p > 0))) fail(`${st.cmd} needs angles like 40/80/40`);
      const dir = dirTok(st.args[2], f, ln), other = dir === 'L' ? 'R' : 'L';
      const total = parts.reduce((x, y) => x + y, 0);
      const dy = num(a.dy, 0), bank = a.bank !== undefined ? num(a.bank, 0) : null;
      return parts.map((deg, i) => {
        const d = i % 2 === 0 ? dir : other;
        const at: Attrs = { ...a, dy: String((dy * deg) / total) };
        if (bank !== null) at.bank = String(d === dir ? bank : -bank);
        return { kind: 'C', r, deg, dir: d, attrs: at, line: ln, stmt: idx } as SegCmd;
      });
    }
    case 'E': {
      // E R<r0>-><r1> <deg> L|R  (R0 / Rinf = straight); clothoid easement with linear curvature
      const m = /^R([\d.]+|inf)->R?([\d.]+|inf)$/.exec(st.args[0] ?? '');
      if (!m) fail('E syntax: E R<r0>-><r1> <deg> L|R');
      const deg = Number(st.args[1]), dir = dirTok(st.args[2], f, ln);
      if (!(deg > 0)) fail('E needs a positive angle');
      const sg = dir === 'L' ? 1 : -1;
      const kOf = (v: string): number => (v === 'inf' || Number(v) === 0 ? 0 : sg / Number(v));
      const k0 = kOf(m![1]!), k1 = kOf(m![2]!);
      if (k0 === 0 && k1 === 0) fail('E needs at least one finite radius');
      return [{ kind: 'E', deg, dir, k0, k1, attrs: a, line: ln, stmt: idx }];
    }
    case 'J': {
      // J ramp=<len>@<deg> gap=<m> drop=<m> land=<m> [wland=<m>] vmin=<m/s> vmax=<m/s> [floor=kill|none]
      const rm = /^([\d.]+)@([-\d.]+)$/.exec(a.ramp ?? '');
      if (!rm) fail('J needs ramp=<len>@<deg>');
      const jump = {
        rampLen: Number(rm![1]), lipDeg: Number(rm![2]), gapLen: num(a.gap, 0), drop: num(a.drop, 0), landLen: num(a.land, 40),
        landW: num(a.wland, 0), vMin: num(a.vmin, 20), vMax: num(a.vmax, 46), floor: (a.floor === 'none' ? 'none' : 'kill') as 'kill' | 'none',
      };
      if (!(jump.rampLen > 0) || !(jump.gapLen >= 0) || !(jump.landLen > 0)) fail('J: ramp, gap and land must be positive');
      return [{ kind: 'J', len: jump.rampLen + jump.gapLen + jump.landLen, jump, attrs: a, line: ln, stmt: idx }];
    }
    case 'LOOP': {
      // LOOP R<r> shift=<m> ease=<m> [side=L|R]: vertical loop with a lateral shift (rmf frames, track gravity)
      const R = radiusTok(st.args[0], f, ln);
      const loop: LoopSpec = { R, shift: num(a.shift, 12), ease: num(a.ease, 15), side: (a.side ?? 'R').toUpperCase() === 'L' ? -1 : 1 };
      return [{ kind: 'LOOP', loop, attrs: { frame: 'rmf', gravity: 'track', ...a }, line: ln, stmt: idx }];
    }
    case 'CLOVERLEAF': {
      // CLOVERLEAF levels=0/9/18 R=35 [side=L] [link=41/33] [Rc=20]: a stack of 270° helix ramps joined by
      // "deck" legs (S link1 ; C Rc 90 other ; S link2), as in skyway_interchange.
      const levels = (a.levels ?? '').split('/').map(Number);
      if (levels.length < 2 || levels.some((x) => !Number.isFinite(x))) fail('CLOVERLEAF needs levels=a/b[/c…]');
      const R = num(a.R, 35), side = dirTok(a.side ?? 'L', f, ln), other = side === 'L' ? 'R' : 'L';
      const [l1, l2] = (a.link ?? '41/33').split('/').map(Number);
      const Rc = num(a.Rc, 20);
      const out: SegCmd[] = [];
      for (let i = 0; i + 1 < levels.length; i++) {
        if (i > 0) {
          out.push({ kind: 'S', len: l1 ?? 41, attrs: {}, line: ln, stmt: idx });
          out.push({ kind: 'C', r: Rc, deg: 90, dir: other, attrs: {}, line: ln, stmt: idx });
          out.push({ kind: 'S', len: l2 ?? 33, attrs: {}, line: ln, stmt: idx });
        }
        out.push({ kind: 'C', r: R, deg: 270, dir: side, attrs: { ...a, dy: String(levels[i + 1]! - levels[i]!) }, line: ln, stmt: idx });
      }
      return out;
    }
    case 'PLAZA': {
      // PLAZA <areaId> [L|R]: the guide arc of an annulus AREA (radius = mid-ring, width = ring width)
      const id = st.args[0] ?? fail('PLAZA needs an area id');
      const area = ast.stmts.find((s) => s.cmd === 'AREA' && s.args[0] === id) ?? fail(`PLAZA ${id}: no AREA ${id}`);
      const rIn = num(area.attrs.rIn, 10), rOut = num(area.attrs.rOut, 40), sweep = num(area.attrs.sweep, 180);
      const dir = dirTok(st.args[1] ?? 'L', f, ln);
      return [{ kind: 'C', r: (rIn + rOut) / 2, deg: sweep, dir, attrs: { w: String(rOut - rIn), ...a, area: id }, line: ln, stmt: idx }];
    }
  }
  return fail(`${st.cmd} is not a segment`);
}

// ------------------------------------------------------------------------------------------------ geometry of a primitive
export interface PlanPt { x: number; z: number; psi: number; y: number }

/** Evaluates a primitive at local arc length l ∈ [0, len]: plan position, heading (deg) and raw elevation. */
export function evalPrim(p: Prim, l: number, out: PlanPt): PlanPt {
  if (l < 0) l = 0; else if (l > p.len) l = p.len;
  if (p.kind === 'line' || p.kind === 'jump') {
    out.x = p.x0 + Math.cos(p.psi0 * DEG) * l; out.z = p.z0 - Math.sin(p.psi0 * DEG) * l; out.psi = p.psi0;
  } else if (p.kind === 'arc') {
    const sg = p.k0 > 0 ? 1 : -1, r = 1 / Math.abs(p.k0);
    const cx = p.x0 + sg * r * -Math.sin(p.psi0 * DEG), cz = p.z0 + sg * r * -Math.cos(p.psi0 * DEG);
    const psi = p.psi0 + (sg * l) / r / DEG;
    out.x = cx - sg * r * -Math.sin(psi * DEG); out.z = cz - sg * r * -Math.cos(psi * DEG); out.psi = psi;
  } else {
    const T = p.table!, st = p.tStep!, n = T.length / 5 - 1;
    const f = l / st; let i = Math.floor(f); if (i >= n) i = n - 1; const t = f - i;
    const a = i * 5, b = a + 5;
    out.x = T[a + 1]! + (T[b + 1]! - T[a + 1]!) * t; out.z = T[a + 2]! + (T[b + 2]! - T[a + 2]!) * t;
    out.psi = T[a + 4]! + (T[b + 4]! - T[a + 4]!) * t;
    if (p.kind === 'loop') { out.y = p.y0 + T[a + 3]! + (T[b + 3]! - T[a + 3]!) * t; return out; }
  }
  out.y = rawY(p, l);
  return out;
}

/** Raw (unsmoothed) elevation along a primitive. */
export function rawY(p: Prim, l: number): number {
  if (p.kind === 'jump') {
    const j = p.jump!;
    if (l <= j.rampLen) { const u = l / j.rampLen; return p.y0 + j.lipH * u * u; }
    if (l <= j.rampLen + j.gapLen) { const u = (l - j.rampLen) / Math.max(1e-6, j.gapLen); return p.y0 + j.lipH + (-j.drop - j.lipH) * u; }
    return p.y0 - j.drop;
  }
  return p.y0 + (p.len > 0 ? (p.dy * l) / p.len : 0);
}

function integrateClothoid(p: Prim): void {
  const n = Math.max(8, Math.ceil(p.len / 0.1));
  const h = p.len / n;
  const T = new Float64Array((n + 1) * 5);
  let x = 0, z = 0;
  const psiAt = (l: number): number => p.psi0 + (p.k0 * l + ((p.k1 - p.k0) * l * l) / (2 * p.len)) / DEG;
  for (let i = 0; i <= n; i++) {
    const l = i * h;
    T[i * 5] = l; T[i * 5 + 1] = p.x0 + x; T[i * 5 + 2] = p.z0 + z; T[i * 5 + 3] = 0; T[i * 5 + 4] = psiAt(l);
    // midpoint rule on the heading (2nd order)
    const pm = psiAt(l + h / 2) * DEG;
    x += Math.cos(pm) * h; z -= Math.sin(pm) * h;
  }
  p.table = T; p.tStep = h;
}

/** Loop: vertical-plane curvature ramps 0 → 1/R over `ease`, holds, ramps down; pitch totals 2π; lateral shift ∝ pitch. */
function integrateLoop(p: Prim): void {
  const L = p.loop!;
  const kMax = 1 / L.R;
  const len = 2 * Math.PI * L.R + L.ease;
  const n = Math.ceil(len / 0.05), h = len / n;
  const kAt = (l: number): number => (l < L.ease ? kMax * (l / L.ease) : l > len - L.ease ? kMax * ((len - l) / L.ease) : kMax);
  const T = new Float64Array((n + 1) * 5);
  let fwd = 0, up = 0, phi = 0;
  const dx = Math.cos(p.psi0 * DEG), dz = -Math.sin(p.psi0 * DEG);
  const rx = Math.sin(p.psi0 * DEG) * L.side, rz = Math.cos(p.psi0 * DEG) * L.side; // lateral shift direction
  for (let i = 0; i <= n; i++) {
    const l = i * h;
    const lat = (L.shift * phi) / (2 * Math.PI);
    T[i * 5] = l; T[i * 5 + 1] = p.x0 + dx * fwd + rx * lat; T[i * 5 + 2] = p.z0 + dz * fwd + rz * lat; T[i * 5 + 3] = up; T[i * 5 + 4] = p.psi0;
    const km = kAt(l + h / 2), phiM = phi + (km * h) / 2;
    fwd += Math.cos(phiM) * h; up += Math.sin(phiM) * h;
    phi += km * h;
  }
  p.len = len; p.table = T; p.tStep = h;
}

// ------------------------------------------------------------------------------------------------ turtle
export interface TurtleOptions {
  ast: TrackAst;
  stmts: Stmt[];                  // statements of this path (main: top level; branch: the block)
  start: TurtleStart;
  base: SegAttr;                  // attributes at the path start
  close?: { solve: string[]; length: number; target?: TurtleStart; closed: boolean };
  initial?: Record<string, number>; // initial guesses for free straights (?a=128.94)
}

export function runTurtle(o: TurtleOptions): TurtleResult {
  const { ast } = o;
  const cmds: SegCmd[] = [];
  const stmtFirstCmd = new Map<number, number>();
  o.stmts.forEach((st, i) => {
    if (!isSegment(st)) return;
    stmtFirstCmd.set(i, cmds.length);
    cmds.push(...expand(st, i, ast));
  });
  // attributes (turtle state) — resolved once, independent of free straight lengths
  const cur: SegAttr = { ...o.base, surfSub: [] };
  const attrs = cmds.map((c) => segAttrs(cur, c.attrs, ast.file, c.line, c.kind === 'C' || c.kind === 'E' ? (c.dir ?? null) : null));

  const vars = new Map<string, number>();
  for (const c of cmds) if (c.v && !vars.has(c.v)) vars.set(c.v, o.initial?.[c.v] ?? 0);
  const build = (): Prim[] => {
    const prims: Prim[] = [];
    let x = o.start.x, z = o.start.z, psi = o.start.psi, y = o.start.y, s0 = 0;
    cmds.forEach((c, i) => {
      const at = attrs[i]!;
      let p: Prim;
      const common = { x0: x, z0: z, psi0: psi, y0: y, s0, stmt: c.stmt, line: c.line, attr: at };
      if (c.kind === 'S') {
        const len = c.v ? vars.get(c.v)! : c.len!;
        p = { ...common, kind: 'line', len, k0: 0, k1: 0, dy: at.dy };
      } else if (c.kind === 'C') {
        const k = (c.dir === 'L' ? 1 : -1) / c.r!;
        p = { ...common, kind: 'arc', len: c.r! * c.deg! * DEG, k0: k, k1: k, dy: at.dy };
      } else if (c.kind === 'E') {
        const len = (2 * c.deg! * DEG) / (Math.abs(c.k0!) + Math.abs(c.k1!));
        p = { ...common, kind: 'clothoid', len, k0: c.k0!, k1: c.k1!, dy: at.dy };
        integrateClothoid(p);
      } else if (c.kind === 'J') {
        const j = c.jump!;
        const lipH = (j.rampLen * Math.tan(j.lipDeg * DEG)) / 2;
        p = { ...common, kind: 'jump', len: c.len!, k0: 0, k1: 0, dy: -j.drop, jump: { ...j, lipH, landW: j.landW || at.w } };
      } else {
        p = { ...common, kind: 'loop', len: 0, k0: 0, k1: 0, dy: 0, loop: c.loop! };
        integrateLoop(p);
      }
      prims.push(p);
      const e = evalPrim(p, p.len, { x: 0, z: 0, psi: 0, y: 0 });
      x = e.x; z = e.z; psi = e.psi; y = p.kind === 'loop' ? p.y0 + p.table![p.table!.length - 2]! : p.y0 + p.dy; s0 += p.len;
    });
    return prims;
  };

  const solved: Record<string, number> = {};
  const cl = o.close;
  if (cl && cl.solve.length) {
    const names = cl.solve.map((n) => n.split('=')[0]!);
    for (const n of names) if (!vars.has(n)) throw new TrackDslError({ file: ast.file, line: 1, col: 1, msg: `CLOSE solves ${n} but no straight uses it` });
    for (const n of names) vars.set(n, 0);
    const base = build();
    const endOf = (ps: Prim[]): PlanPt => { const p = ps[ps.length - 1]!; return evalPrim(p, p.len, { x: 0, z: 0, psi: 0, y: 0 }); };
    const e0 = endOf(base);
    const L0 = base.reduce((acc, p) => acc + p.len, 0);
    const cols = names.map((n) => {
      let dx = 0, dz = 0, dl = 0;
      cmds.forEach((c, i) => { if (c.v === n) { const p = base[i]!; dx += Math.cos(p.psi0 * DEG); dz -= Math.sin(p.psi0 * DEG); dl += 1; } });
      return [dx, dz, dl] as const;
    });
    const tgt = cl.target ?? o.start;
    const tx = cl.closed || cl.target ? tgt.x - e0.x : 0, tz = cl.closed || cl.target ? tgt.z - e0.z : 0, tl = cl.length - L0;
    let sol: number[];
    if (names.length === 1) {
      sol = cl.target ? [(tx * cols[0]![0] + tz * cols[0]![1]) / (cols[0]![0] ** 2 + cols[0]![1] ** 2)] : [tl / cols[0]![2]];
    } else if (names.length === 2) {
      sol = solveLinear([[cols[0]![0], cols[1]![0], tx], [cols[0]![1], cols[1]![1], tz]], ast.file);
    } else {
      sol = solveLinear([[cols[0]![0], cols[1]![0], cols[2]![0], tx], [cols[0]![1], cols[1]![1], cols[2]![1], tz], [cols[0]![2], cols[1]![2], cols[2]![2], tl]], ast.file);
    }
    names.forEach((n, i) => { vars.set(n, sol[i]!); solved[n] = sol[i]!; });
    for (const n of names) {
      if (!(vars.get(n)! > 0.5)) throw new TrackDslError({ file: ast.file, line: 1, col: 1, msg: `CLOSE produced a non-positive straight ${n} = ${vars.get(n)!.toFixed(2)} m; lengthen the fixed straights or change length=` });
    }
  }
  for (const [n, v] of vars) if (!(v > 0)) throw new TrackDslError({ file: ast.file, line: 1, col: 1, msg: `free straight ${n} is not solved by CLOSE` });
  const prims = build();
  const length = prims.reduce((acc, p) => acc + p.len, 0);
  const last = prims[prims.length - 1];
  const endPt = last ? evalPrim(last, last.len, { x: 0, z: 0, psi: 0, y: 0 }) : { x: o.start.x, z: o.start.z, psi: o.start.psi, y: o.start.y };
  const endY = last ? (last.kind === 'loop' ? last.y0 + last.table![last.table!.length - 2]! : last.y0 + last.dy) : o.start.y;

  // labels: the start of the first primitive emitted at or after the labelled statement
  const labels = new Map<string, number>();
  o.stmts.forEach((st, i) => {
    if (!st.labels.length) return;
    let s = length;
    for (let j = i; j < o.stmts.length; j++) {
      const k = stmtFirstCmd.get(j);
      if (k !== undefined) { s = prims[k]!.s0; break; }
    }
    for (const l of st.labels) labels.set(l, s);
  });
  for (const tl of ast.trailingLabels) if ((tl.block ?? ast.stmts) === o.stmts) for (const l of tl.labels) labels.set(l, length);
  const turn = prims.reduce((acc, p) => acc + (p.kind === 'arc' || p.kind === 'clothoid' ? ((p.k0 + p.k1) / 2) * p.len / DEG : 0), 0);
  return { prims, length, end: { x: endPt.x, z: endPt.z, psi: endPt.psi, y: endY }, solved, labels, turn };
}

function solveLinear(rows: number[][], file: string): number[] {
  const n = rows.length;
  const m = rows.map((r) => [...r]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    [m[c], m[piv]] = [m[piv]!, m[c]!];
    const d = m[c]![c]!;
    if (Math.abs(d) < 1e-9) throw new TrackDslError({ file, line: 1, col: 1, msg: 'CLOSE: singular system — the free straights are parallel; free straights with different headings' });
    for (let k = c; k <= n; k++) m[c]![k]! /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const fr = m[r]![c]!; for (let k = c; k <= n; k++) m[r]![k]! -= fr * m[c]![k]!; }
  }
  return m.map((r) => r[n]!);
}

/** Initial guesses written back by the solver in the source: `S ?a=128.94`. */
export function initialGuesses(stmts: Stmt[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const st of stmts) if (st.cmd === 'S' && st.args[0]?.startsWith('?')) {
    const [n, v] = st.args[0].split('=');
    if (v) { const x = parseFloat(v); if (Number.isFinite(x)) out[n!] = x; }
  }
  return out;
}
