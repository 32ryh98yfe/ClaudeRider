// Lossless world block (20-netcode-spec §3.5). Every world value is written as an integer on its quantization grid
// (positions ×4096, directions ×32768, gauges ×65536, …) as zigzag LEB128 varints, so decode(encode(w)) is
// bit-identical to w (hashWorld-equal and deep-equal).
//
// Layout (keyframes and deltas share it):
//   u8 sectionMask  — bit0 globals, bit1 teams, bit2 effects, bit3 projectiles, bit4 hazards, bit5 boxRespawn, bit6 karts
//   [globals]       — varint fieldMask, zz(value − base) per set field
//   [karts]         — 8 × { varint groupMask; per set group: dense groups write every residual, sparse groups a varint
//                     fieldMask and only the non-zero residuals }
//   [arrays]        — when changed: varint n, n × { varint baseIndex+1 (0 = new element), varint fieldMask, residuals }
//   [boxRespawn]    — varint count, count × { varint gap, zz(value − base) }
//   varint nExc, nExc × { varint fieldId, u8 kind (0 = −0, 1 = f64 follows) }
// A residual is `value − prediction`. Predictions use only data the decoder already has: the base, and fields of the
// same snapshot decoded earlier — positions integrate the velocity over the snapshot interval, sMain follows s, raceDist
// follows sMain, the sample index follows s, and lastValid is predicted to equal loc. They change sizes, never values.
// A keyframe is a delta against a fixed reference world (fresh karts, empty lists, zeroed boxes) that both sides build
// identically, so there is no second code path and inactive slots cost one byte.
// Values off their grid (−0, NaN, ±∞, or a float in an integer field) travel in the exception list, which keeps the block
// lossless even if a field is used outside its declared grid.
import { MAX_KARTS, newKart, type EffectInstance, type HazardState, type KartState, type ProjectileState, type TeamState, type WorldState } from '@cr/sim';
import { ByteReader, ByteWriter, ProtocolError } from './bytes.ts';

const POS = 4096, VEL = 4096, DIR = 32768, YAW = 4096, GAUGE = 65536, SLIP = 32768;
const MAXI = 2 ** 51;

type Obj = Record<string, number>;
interface Group { name: string; dense: boolean; obj: (k: KartState) => Obj; keys: readonly string[]; scales: readonly number[]; off: number }

function grp(name: string, dense: boolean, obj: (k: KartState) => unknown, spec: ReadonlyArray<string | readonly [string, number]>): Group {
  return {
    name, dense, obj: obj as (k: KartState) => Obj, off: 0,
    keys: spec.map((s) => (typeof s === 'string' ? s : s[0])),
    scales: spec.map((s) => (typeof s === 'string' ? 1 : s[1])),
  };
}

// s precedes i so the sample index can be predicted from the arc length (1 m samples)
const LOC_KEYS = ['path', ['s', POS], 'i', ['u', POS], ['h', POS], ['sMain', POS], 'valid'] as const;

/** Kart field groups; bit index = position in this list. Every numeric field of KartState is listed exactly once. */
export const KART_GROUPS: readonly Group[] = [
  grp('vel', true, (k) => k.body, [['vx', VEL], ['vy', VEL], ['vz', VEL]]),
  grp('pose', true, (k) => k.body, [['px', POS], ['py', POS], ['pz', POS]]),
  grp('dir', false, (k) => k.body, [['fx', DIR], ['fy', DIR], ['fz', DIR], ['nx', DIR], ['ny', DIR], ['nz', DIR]]),
  grp('ground', false, (k) => k.body, [['yawRate', YAW], 'grounded', 'coyote', 'airTicks', 'surf', 'wallContact', 'ghostTicks']),
  grp('drift', false, (k) => k.drive, ['drift', 'driftDir', 'driftTicks', ['driftPeak', SLIP], 'reDriftLock', 'fatigueTicks']),
  grp('boost', false, (k) => k.drive, [['gauge', GAUGE], 'boosters', 'teamBoosters', 'boostTicks', 'boostKind', 'startTicks', 'wheelspinTicks', 'instWindow', 'instTicks', 'stunTicks']),
  grp('draft', false, (k) => k.drive, ['draftCharge', 'draftTicks', 'prevHeld', 'prevThrottle', 'lowSpeedTicks', 'startPressTick']),
  grp('items', false, (k) => k.items, ['slot0', 'slot1', 'rouletteSlot', 'rouletteEnd', 'rouletteBox', 'lastUseTick', 'aimLockTicks', 'aimTarget']),
  grp('status', false, (k) => k.status, ['cc', 'ccStart', 'ccEnd', 'immuneUntil', 'shieldUntil', 'shieldGraceUntil', 'haloUntil', 'mashCredits', 'lastTapDir', 'lastTapTick', 'modMask']),
  grp('loc', false, (k) => k.race.loc, LOC_KEYS),
  grp('lastValid', false, (k) => k.race.lastValid, LOC_KEYS),
  grp('race', false, (k) => k.race, ['lap', 'keyMask', ['raceDist', POS], 'lapStartTick', 'bestLapTicks', 'lastLapTicks', 'finishTick', ['finishFrac', GAUGE], 'rank',
    'wrongWayTicks', 'offGraphTicks', 'noGroundTicks', 'respawnPhase', 'respawnUntil', 'manualCooldownUntil', 'slowTicks', 'retired']),
  grp('identity', false, (k) => k, ['slot', 'team', 'spec', 'active']),
  grp('attach', false, (k) => k.body, ['attachKind', 'attachId', ['attachS', POS], 'attachT']),
  grp('stats', false, (k) => k.stats, ['drifts', 'instantBoosts', 'boostsUsed', 'startTier', 'wallHits', 'hardHits', 'attacksLanded', 'attacksBlocked', 'hitsTaken',
    'itemsUsed', 'respawns', ['driftMeters', 16], 'draftBursts']),
];
let kn = 0;
for (const g of KART_GROUPS) { g.off = kn; kn += g.keys.length; }
/** Fields per kart in the flat representation. */
export const KN = kn;
const NG = KART_GROUPS.length;

const fieldAt = (group: string, key: string): number => {
  const g = KART_GROUPS.find((x) => x.name === group)!;
  return g.off + g.keys.indexOf(key);
};

// ---- predictors (index = kart field)
const P_NONE = 0, P_DELTA_OF = 1, P_VALUE_OF = 2, P_VEL = 3, P_METRES_OF = 4;
const PK = new Int8Array(KN);
const PR = new Int16Array(KN);
const pred = (field: number, kind: number, ref: number): void => { PK[field] = kind; PR[field] = ref; };
for (const [p, v] of [['px', 'vx'], ['py', 'vy'], ['pz', 'vz']] as const) pred(fieldAt('pose', p), P_VEL, fieldAt('vel', v));
pred(fieldAt('loc', 'sMain'), P_DELTA_OF, fieldAt('loc', 's'));
pred(fieldAt('loc', 'i'), P_METRES_OF, fieldAt('loc', 's'));
for (const k of LOC_KEYS) { const key = typeof k === 'string' ? k : k[0]; pred(fieldAt('lastValid', key), P_VALUE_OF, fieldAt('loc', key)); }
pred(fieldAt('race', 'raceDist'), P_DELTA_OF, fieldAt('loc', 'sMain'));
for (let j = 0; j < KN; j++) if (PK[j] !== P_NONE && PR[j]! >= j) throw new Error('world codec: predictor must reference an earlier field');

/** Prediction of kart field `j` from base ints and the (already known) current ints of earlier fields. */
function predict(cur: Float64Array, cb: number, base: Float64Array, bb: number, j: number, dt: number): number {
  const b = base[bb + j]!;
  switch (PK[j]) {
    case P_DELTA_OF: { const r = PR[j]!; return b + (cur[cb + r]! - base[bb + r]!); }
    case P_VALUE_OF: return cur[cb + PR[j]!]!;
    case P_VEL: { const r = PR[j]!; return b + Math.round(((base[bb + r]! + cur[cb + r]!) * dt) / 120); }
    case P_METRES_OF: { const r = PR[j]!; return b + Math.round((cur[cb + r]! - base[bb + r]!) / 4096); }
    default: return b;
  }
}

const GLOBAL_KEYS = ['phase', 'goTick', 'firstFinishTick', 'endTick', 'seq', 'nextObjId'] as const;
const NGL = GLOBAL_KEYS.length;

interface ArrDef<T> { keys: readonly string[]; scales: readonly number[]; byId: boolean; make(): T; get(w: WorldState): T[] }
const arr = <T>(byId: boolean, spec: ReadonlyArray<string | readonly [string, number]>, make: () => T, get: (w: WorldState) => T[]): ArrDef<T> => ({
  keys: spec.map((s) => (typeof s === 'string' ? s : s[0])), scales: spec.map((s) => (typeof s === 'string' ? 1 : s[1])), byId, make, get,
});
const ARRAYS: readonly ArrDef<object>[] = [
  arr<TeamState>(false, [['gauge', GAUGE], 'granted'], () => ({ gauge: 0, granted: 0 }), (w) => w.teams),
  arr<EffectInstance>(true, ['id', 'code', 'victim', 'source', 'start', 'end', 'param', 'flags', 'result'],
    () => ({ id: 0, code: 0, victim: 0, source: 0, start: 0, end: 0, param: 0, flags: 0, result: 0 }), (w) => w.effects),
  arr<ProjectileState>(true, ['id', 'code', 'owner', 'target', 'phase', 'path', ['s', POS], ['u', POS], ['h', POS], ['px', POS], ['py', POS], ['pz', POS], 'spawn', 'commit', 'impact'],
    () => ({ id: 0, code: 0, owner: 0, target: 0, phase: 0, path: 0, s: 0, u: 0, h: 0, px: 0, py: 0, pz: 0, spawn: 0, commit: 0, impact: 0 }), (w) => w.projectiles),
  arr<HazardState>(true, ['id', 'code', 'owner', 'team', ['px', POS], ['py', POS], ['pz', POS], ['radius', POS], 'arm', 'expire', 'flags'],
    () => ({ id: 0, code: 0, owner: 0, team: 0, px: 0, py: 0, pz: 0, radius: 0, arm: 0, expire: 0, flags: 0 }), (w) => w.hazards),
];
const SEC = { GLOBALS: 1, TEAMS: 2, EFFECTS: 4, PROJ: 8, HAZ: 16, BOX: 32, KARTS: 64 } as const;
const ARR_BIT = [SEC.TEAMS, SEC.EFFECTS, SEC.PROJ, SEC.HAZ] as const;
const MAX_ARRAY = 4096;

// exception field ids
const EXC_KART = 16;
const EXC_ARR = 1048576;
const excArr = (a: number, idx: number, f: number): number => (a + 1) * EXC_ARR + idx * 32 + f;

// ---------------------------------------------------------------- flat representation

class FlatArray {
  n = 0;
  ints: number[] = [];
  raw: number[] = [];
  exc = 0;
}

/** A world flattened to grid integers (plus raw values, for exceptions). Deltas and equality work on this. */
export class FlatWorld {
  tick = 0;
  readonly g = new Float64Array(NGL);
  readonly gRaw = new Float64Array(NGL);
  gExc = 0;
  readonly k = new Float64Array(MAX_KARTS * KN);
  readonly kRaw = new Float64Array(MAX_KARTS * KN);
  readonly kExc = new Uint8Array(MAX_KARTS * NG);
  readonly arr: FlatArray[] = ARRAYS.map(() => new FlatArray());
  box: Int32Array = new Int32Array(0);
}

// One grid-integer conversion; `EXC` is set when the value is not exactly int/scale.
let EXC = false;
function toInt(x: number, s: number): number {
  const v = x * s;
  let i = Math.round(v);
  EXC = i !== v || (i === 0 && 1 / x < 0);
  if (!(i <= MAXI && i >= -MAXI)) { EXC = true; i = 0; }
  return i;
}

export function flattenWorld(w: Readonly<WorldState>, f: FlatWorld): FlatWorld {
  f.tick = w.tick;
  f.gExc = 0;
  const wg = w as unknown as Obj;
  for (let j = 0; j < NGL; j++) {
    const x = wg[GLOBAL_KEYS[j]!]!;
    f.gRaw[j] = x; f.g[j] = toInt(x, 1);
    if (EXC) f.gExc++;
  }
  for (let s = 0; s < MAX_KARTS; s++) {
    const k = w.karts[s]!;
    const base = s * KN;
    for (let gi = 0; gi < NG; gi++) {
      const G = KART_GROUPS[gi]!;
      const o = G.obj(k);
      const keys = G.keys, scales = G.scales;
      let e = 0;
      for (let j = 0; j < keys.length; j++) {
        const x = o[keys[j]!]!;
        const at = base + G.off + j;
        f.kRaw[at] = x; f.k[at] = toInt(x, scales[j]!);
        if (EXC) e++;
      }
      f.kExc[s * NG + gi] = e;
    }
  }
  for (let a = 0; a < ARRAYS.length; a++) {
    const def = ARRAYS[a]!, fa = f.arr[a]!;
    const list = def.get(w as WorldState) as unknown as Obj[];
    const nf = def.keys.length;
    fa.n = list.length; fa.exc = 0;
    fa.ints.length = list.length * nf; fa.raw.length = list.length * nf;
    for (let i = 0; i < list.length; i++) {
      const o = list[i]!;
      for (let j = 0; j < nf; j++) {
        const x = o[def.keys[j]!]!;
        fa.raw[i * nf + j] = x; fa.ints[i * nf + j] = toInt(x, def.scales[j]!);
        if (EXC) fa.exc++;
      }
    }
  }
  if (f.box.length !== w.boxRespawn.length) f.box = new Int32Array(w.boxRespawn.length);
  f.box.set(w.boxRespawn);
  return f;
}

/** FNV-1a over every flat integer and every exceptional raw value (covers all fields, unlike hashWorld). */
export function flatHash(f: FlatWorld): number {
  let h = 0x811c9dc5 | 0;
  const mix = (v: number): void => {
    let lo = v | 0; const hi = Math.floor(v / 4294967296) | 0;
    h ^= lo & 0xffff; h = Math.imul(h, 0x01000193); lo >>>= 16;
    h ^= lo; h = Math.imul(h, 0x01000193);
    h ^= hi & 0xfffff; h = Math.imul(h, 0x01000193);
  };
  const mixRaw = (x: number): void => {
    if (Number.isNaN(x)) mix(0x7ff80000);
    else if (Object.is(x, -0)) mix(0x80000000);
    else if (!Number.isFinite(x)) mix(x > 0 ? 0x7ff00000 : 0xfff00000);
    else { const i = Math.floor(x); mix(i); mix(Math.round((x - i) * 4294967296)); }
  };
  mix(f.tick);
  for (let j = 0; j < NGL; j++) mix(f.g[j]!);
  for (let j = 0; j < f.k.length; j++) mix(f.k[j]!);
  for (const fa of f.arr) { mix(fa.n); for (let j = 0; j < fa.ints.length; j++) mix(fa.ints[j]!); }
  for (let j = 0; j < f.box.length; j++) mix(f.box[j]!);
  if (f.gExc) for (let j = 0; j < NGL; j++) mixRaw(f.gRaw[j]!);
  for (let s = 0; s < MAX_KARTS; s++) for (let gi = 0; gi < NG; gi++) {
    if (!f.kExc[s * NG + gi]) continue;
    const G = KART_GROUPS[gi]!;
    for (let j = 0; j < G.keys.length; j++) mixRaw(f.kRaw[s * KN + G.off + j]!);
  }
  for (const fa of f.arr) if (fa.exc) for (const x of fa.raw) mixRaw(x);
  return h >>> 0;
}

/** True when two flats describe bit-identical worlds. */
export function flatEquals(a: FlatWorld, b: FlatWorld): boolean {
  if (a.tick !== b.tick) return false;
  for (let j = 0; j < NGL; j++) if (!Object.is(a.gRaw[j], b.gRaw[j])) return false;
  for (let j = 0; j < a.kRaw.length; j++) if (!Object.is(a.kRaw[j], b.kRaw[j])) return false;
  for (let i = 0; i < a.arr.length; i++) {
    const x = a.arr[i]!, y = b.arr[i]!;
    if (x.n !== y.n) return false;
    for (let j = 0; j < x.raw.length; j++) if (!Object.is(x.raw[j], y.raw[j])) return false;
  }
  if (a.box.length !== b.box.length) return false;
  for (let j = 0; j < a.box.length; j++) if (a.box[j] !== b.box[j]) return false;
  return true;
}

// ---------------------------------------------------------------- reference world (keyframe base)

/** The fixed keyframe base: fresh karts, empty lists, zero boxes. Identical on every peer for a given box count. */
export function referenceWorld(boxLen: number): WorldState {
  return {
    tick: 0, phase: 0, goTick: 0, firstFinishTick: -1, endTick: -1,
    karts: Array.from({ length: MAX_KARTS }, (_, i) => newKart(i)),
    teams: [], effects: [], projectiles: [], hazards: [],
    boxRespawn: new Int32Array(boxLen), seq: 0, nextObjId: 1, decisions: { items: [] },
  };
}

// ---------------------------------------------------------------- encode

const EXC_IDS: number[] = [];
const EXC_VALS: number[] = [];
const pushExc = (id: number, x: number): void => { EXC_IDS.push(id); EXC_VALS.push(x); };
function needsExc(x: number, s: number): boolean { toInt(x, s); return EXC; }

/** Optional byte accounting per section/group (a tuning aid; null in production). */
let STATS: Record<string, number> | null = null;
export function setWorldEncodeStats(s: Record<string, number> | null): void { STATS = s; }
const acc = (key: string, bytes: number): void => { if (STATS) STATS[key] = (STATS[key] ?? 0) + bytes; };

function groupChanged(cur: FlatWorld, base: FlatWorld, s: number, gi: number): boolean {
  const G = KART_GROUPS[gi]!;
  const a = s * KN + G.off, n = G.keys.length;
  for (let j = 0; j < n; j++) if (cur.k[a + j] !== base.k[a + j]) return true;
  if (cur.kExc[s * NG + gi] || base.kExc[s * NG + gi]) for (let j = 0; j < n; j++) if (!Object.is(cur.kRaw[a + j], base.kRaw[a + j])) return true;
  return false;
}

function arrayChanged(x: FlatArray, y: FlatArray): boolean {
  if (x.n !== y.n) return true;
  for (let j = 0; j < x.ints.length; j++) if (x.ints[j] !== y.ints[j]) return true;
  if (x.exc || y.exc) for (let j = 0; j < x.raw.length; j++) if (!Object.is(x.raw[j], y.raw[j])) return true;
  return false;
}

/** Index of the base element matching element `i` of `x` (same id, or same index for id-less lists), or -1. */
function matchBase(def: ArrDef<object>, x: FlatArray, i: number, y: FlatArray): number {
  const nf = def.keys.length;
  if (!def.byId) return i < y.n ? i : -1;
  const id = x.ints[i * nf]!;
  if (i < y.n && y.ints[i * nf] === id) return i;
  for (let b = 0; b < y.n; b++) if (y.ints[b * nf] === id) return b;
  return -1;
}

/**
 * Encodes `cur` as a delta against `base` (pass the reference flat for a keyframe).
 * `dt` = snapshot interval in ticks (0 for keyframes); it only feeds the position predictor.
 */
export function encodeWorld(w: ByteWriter, cur: FlatWorld, base: FlatWorld, dt = 0): void {
  EXC_IDS.length = 0; EXC_VALS.length = 0;
  const maskAt = w.pos;
  w.u8(0);
  let sec = 0;

  let gmask = 0;
  for (let j = 0; j < NGL; j++) if (cur.g[j] !== base.g[j] || ((cur.gExc || base.gExc) && !Object.is(cur.gRaw[j], base.gRaw[j]))) gmask |= 1 << j;
  if (gmask) {
    sec |= SEC.GLOBALS;
    const p0 = w.pos;
    w.varu(gmask);
    for (let j = 0; j < NGL; j++) {
      if (!(gmask & (1 << j))) continue;
      w.vari(cur.g[j]! - base.g[j]!);
      const x = cur.gRaw[j]!;
      if (cur.gExc && needsExc(x, 1)) pushExc(j, x);
    }
    acc('globals', w.pos - p0);
  }

  const kartsAt = w.pos;
  let anyKart = false;
  for (let s = 0; s < MAX_KARTS; s++) {
    let mask = 0;
    for (let gi = 0; gi < NG; gi++) if (groupChanged(cur, base, s, gi)) mask |= 1 << gi;
    const p0 = w.pos;
    w.varu(mask);
    acc('kartMask', w.pos - p0);
    if (!mask) continue;
    anyKart = true;
    const b0 = s * KN;
    for (let gi = 0; gi < NG; gi++) {
      if (!(mask & (1 << gi))) continue;
      const G = KART_GROUPS[gi]!;
      const a = G.off, n = G.keys.length;
      const p1 = w.pos;
      if (G.dense) {
        for (let j = 0; j < n; j++) w.vari(cur.k[b0 + a + j]! - predict(cur.k, b0, base.k, b0, a + j, dt));
      } else {
        let fmask = 0;
        for (let j = 0; j < n; j++) if (cur.k[b0 + a + j]! !== predict(cur.k, b0, base.k, b0, a + j, dt)) fmask |= 1 << j;
        w.varu(fmask);
        for (let j = 0; j < n; j++) if (fmask & (1 << j)) w.vari(cur.k[b0 + a + j]! - predict(cur.k, b0, base.k, b0, a + j, dt));
      }
      acc(G.name, w.pos - p1);
      // The decoder rewrites a field only when its grid integer changed and otherwise keeps the raw base value, so an
      // exception is needed exactly when that result would differ from the raw current value.
      if (cur.kExc[s * NG + gi] || base.kExc[s * NG + gi]) {
        for (let j = 0; j < n; j++) {
          const at = b0 + a + j, x = cur.kRaw[at]!;
          const need = cur.k[at] !== base.k[at] ? needsExc(x, G.scales[j]!) : !Object.is(x, base.kRaw[at]);
          if (need) pushExc(EXC_KART + at, x);
        }
      }
    }
  }
  if (anyKart) sec |= SEC.KARTS; else w.pos = kartsAt;

  for (let ai = 0; ai < ARRAYS.length; ai++) {
    const x = cur.arr[ai]!, y = base.arr[ai]!;
    if (!arrayChanged(x, y)) continue;
    sec |= ARR_BIT[ai]!;
    const p0 = w.pos;
    const def = ARRAYS[ai]!, nf = def.keys.length;
    if (x.n > MAX_ARRAY || nf > 31) throw new ProtocolError('world', 'array too large');
    w.varu(x.n);
    for (let i = 0; i < x.n; i++) {
      const bi = matchBase(def, x, i, y);
      w.varu(bi + 1);
      let fmask = 0;
      for (let f = 0; f < nf; f++) if (x.ints[i * nf + f]! !== (bi >= 0 ? y.ints[bi * nf + f]! : 0)) fmask |= 1 << f;
      w.varu(fmask);
      for (let f = 0; f < nf; f++) if (fmask & (1 << f)) w.vari(x.ints[i * nf + f]! - (bi >= 0 ? y.ints[bi * nf + f]! : 0));
      if (x.exc) for (let f = 0; f < nf; f++) { const v = x.raw[i * nf + f]!; if (needsExc(v, def.scales[f]!)) pushExc(excArr(ai, i, f), v); }
    }
    acc(`arr${ai}`, w.pos - p0);
  }

  if (cur.box.length !== base.box.length) throw new ProtocolError('world', 'box length');
  let nBox = 0;
  for (let j = 0; j < cur.box.length; j++) if (cur.box[j] !== base.box[j]) nBox++;
  if (nBox) {
    sec |= SEC.BOX;
    const p0 = w.pos;
    w.varu(nBox);
    let last = -1;
    for (let j = 0; j < cur.box.length; j++) {
      if (cur.box[j] === base.box[j]) continue;
      w.varu(j - last - 1); last = j;
      w.vari(cur.box[j]! - base.box[j]!);
    }
    acc('box', w.pos - p0);
  }

  const p0 = w.pos;
  w.varu(EXC_IDS.length);
  for (let i = 0; i < EXC_IDS.length; i++) {
    w.varu(EXC_IDS[i]!);
    const x = EXC_VALS[i]!;
    if (Object.is(x, -0)) w.u8(0); else { w.u8(1); w.f64(x); }
  }
  acc('exceptions', w.pos - p0);
  w.patchU8(maskAt, sec);
}

// ---------------------------------------------------------------- decode

const CUR = new Float64Array(KN);
const ZERO_ROW = new Float64Array(32);

/**
 * Decodes a world block into `target`, which must currently hold the base world described by `base`
 * (for a keyframe pass the reference world and its flat; `target` is reset to the reference first).
 * `target.decisions` is preserved. The caller re-flattens `target` afterwards.
 */
export function decodeWorld(r: ByteReader, target: WorldState, base: FlatWorld, keyframeRef: WorldState | null, dt = 0): void {
  if (keyframeRef) resetToReference(target, keyframeRef);
  const sec = r.u8();
  if (sec & 0x80) throw new ProtocolError('world', 'section mask');
  const tw = target as unknown as Obj;

  if (sec & SEC.GLOBALS) {
    const gmask = r.varu();
    if (gmask >= 1 << NGL) throw new ProtocolError('world', 'globals mask');
    for (let j = 0; j < NGL; j++) if (gmask & (1 << j)) tw[GLOBAL_KEYS[j]!] = base.g[j]! + r.vari();
  }

  if (sec & SEC.KARTS) {
    for (let s = 0; s < MAX_KARTS; s++) {
      const mask = r.varu();
      if (!mask) continue;
      if (mask >= 1 << NG) throw new ProtocolError('world', 'group mask');
      const k = target.karts[s]!;
      const b0 = s * KN;
      CUR.set(base.k.subarray(b0, b0 + KN));
      for (let gi = 0; gi < NG; gi++) {
        if (!(mask & (1 << gi))) continue;
        const G = KART_GROUPS[gi]!;
        const o = G.obj(k);
        const a = G.off, n = G.keys.length;
        const fmask = G.dense ? -1 : r.varu();
        if (!G.dense && fmask >= 2 ** n) throw new ProtocolError('world', 'field mask');
        for (let j = 0; j < n; j++) {
          const d = G.dense || fmask & (1 << j) ? r.vari() : 0;
          const v = predict(CUR, 0, base.k, b0, a + j, dt) + d;
          CUR[a + j] = v;
          // unchanged grid integers keep the raw base value (which may be −0 or off-grid); the exception list fixes the rest
          if (v !== base.k[b0 + a + j]) o[G.keys[j]!] = v / G.scales[j]!;
        }
      }
    }
  }

  for (let ai = 0; ai < ARRAYS.length; ai++) {
    if (!(sec & ARR_BIT[ai]!)) continue;
    const def = ARRAYS[ai]!, nf = def.keys.length;
    const n = r.varu();
    if (n > MAX_ARRAY) throw new ProtocolError('world', 'array length');
    const list = def.get(target) as unknown as Obj[];
    const y = base.arr[ai]!;
    const next: Obj[] = [];
    for (let i = 0; i < n; i++) {
      const bi = r.varu() - 1;
      if (bi >= y.n) throw new ProtocolError('world', 'array base index');
      const fmask = r.varu();
      if (fmask >= 2 ** nf) throw new ProtocolError('world', 'array field mask');
      const row = bi >= 0 ? y.ints : ZERO_ROW;
      const rb = bi >= 0 ? bi * nf : 0;
      const o = (list[i] ?? def.make()) as unknown as Obj;
      for (let f = 0; f < nf; f++) {
        const d = fmask & (1 << f) ? r.vari() : 0;
        o[def.keys[f]!] = (row[rb + f]! + d) / def.scales[f]!;
      }
      next.push(o);
    }
    // reuse element objects in place (no per-snapshot allocation once the lists have grown)
    for (let i = 0; i < n; i++) list[i] = next[i]!;
    list.length = n;
  }

  if (sec & SEC.BOX) {
    const nBox = r.varu();
    const box = target.boxRespawn;
    if (nBox > box.length) throw new ProtocolError('world', 'box count');
    let idx = -1;
    for (let c = 0; c < nBox; c++) {
      idx += 1 + r.varu();
      if (idx >= box.length) throw new ProtocolError('world', 'box index');
      box[idx] = base.box[idx]! + r.vari();
    }
  }

  const nExc = r.varu();
  if (nExc > 100000) throw new ProtocolError('world', 'exceptions');
  for (let i = 0; i < nExc; i++) {
    const id = r.varu();
    const kind = r.u8();
    if (kind > 1) throw new ProtocolError('world', 'exception kind');
    setById(target, id, kind === 0 ? -0 : r.f64());
  }
}

function setById(w: WorldState, id: number, x: number): void {
  if (id < NGL) { (w as unknown as Obj)[GLOBAL_KEYS[id]!] = x; return; }
  if (id >= EXC_KART && id < EXC_KART + MAX_KARTS * KN) {
    const rel = id - EXC_KART, s = Math.floor(rel / KN), fi = rel - s * KN;
    for (const G of KART_GROUPS) if (fi >= G.off && fi < G.off + G.keys.length) { G.obj(w.karts[s]!)[G.keys[fi - G.off]!] = x; return; }
  }
  const a = Math.floor(id / EXC_ARR) - 1;
  const def = ARRAYS[a];
  if (!def) throw new ProtocolError('world', `exception id ${id}`);
  const rel = id - (a + 1) * EXC_ARR, i = Math.floor(rel / 32), f = rel - i * 32;
  const o = (def.get(w) as unknown as Obj[])[i];
  if (!o || f >= def.keys.length) throw new ProtocolError('world', `exception id ${id}`);
  o[def.keys[f]!] = x;
}

function resetToReference(target: WorldState, ref: WorldState): void {
  const keep = target.decisions;
  target.tick = ref.tick; target.phase = ref.phase; target.goTick = ref.goTick; target.firstFinishTick = ref.firstFinishTick; target.endTick = ref.endTick;
  for (let s = 0; s < MAX_KARTS; s++) {
    const d = target.karts[s]!, src = ref.karts[s]!;
    d.slot = src.slot; d.team = src.team; d.spec = src.spec; d.active = src.active;
    Object.assign(d.body, src.body); Object.assign(d.drive, src.drive); Object.assign(d.items, src.items); Object.assign(d.status, src.status);
    const loc = d.race.loc, lv = d.race.lastValid;
    Object.assign(d.race, src.race); d.race.loc = loc; d.race.lastValid = lv;
    Object.assign(loc, src.race.loc); Object.assign(lv, src.race.lastValid);
    Object.assign(d.stats, src.stats);
  }
  target.teams.length = 0; target.effects.length = 0; target.projectiles.length = 0; target.hazards.length = 0;
  if (target.boxRespawn.length !== ref.boxRespawn.length) target.boxRespawn = new Int32Array(ref.boxRespawn.length);
  target.boxRespawn.fill(0);
  target.seq = ref.seq; target.nextObjId = ref.nextObjId;
  target.decisions = keep;
}
