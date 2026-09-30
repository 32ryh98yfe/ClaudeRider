// Track validators (docs/design/11-track-spec.md §V). M1 implements V1, V3, V4, V8, V13, V15; the rest arrive with lane L4.
import type { BakedTrack, CtrkMeta, GroundHit } from '@cr/sim';
import type { TrackAst } from './dsl.ts';
import type { Geometry } from './geometry.ts';

export interface Finding { rule: `V${number}`; severity: 'error' | 'warn'; s?: number; msg: string }

const MIN_R = [0, 30, 22, 16, 12, 9];
const MIN_W = [0, 15, 14, 12, 12, 11];

export function validate(ast: TrackAst, g: Geometry, meta: CtrkMeta, track: BakedTrack): Finding[] {
  const out: Finding[] = [];
  const D = Math.max(1, Math.min(5, meta.difficulty));
  // V1 closure
  if (g.closed) {
    const e = Math.hypot(g.closure.dx, g.closure.dz);
    if (e > 0.05) out.push({ rule: 'V1', severity: 'error', msg: `closure error ${e.toFixed(3)} m (limit 0.05)` });
    if (Math.abs(g.closure.dpsi) > 0.1) out.push({ rule: 'V1', severity: 'error', msg: `heading closure ${g.closure.dpsi.toFixed(2)}° (turns must sum to ±360°)` });
    if (Math.abs(g.closure.dy) > 0.05) out.push({ rule: 'V1', severity: 'error', msg: `elevation does not close (Σdy = ${g.closure.dy.toFixed(2)} m)` });
  }
  // V3 radius
  for (const p of g.prims) if (p.curv !== 0) {
    const r = 1 / Math.abs(p.curv);
    if (r < MIN_R[D]! - 1e-6) out.push({ rule: 'V3', severity: 'error', s: p.s0, msg: `radius ${r} m below D${D} minimum ${MIN_R[D]} m (segment ${p.seg + 1})` });
  }
  // V4 width
  for (const p of g.prims) {
    if (p.attr.w < MIN_W[D]! - 2 && p.curv !== 0) out.push({ rule: 'V4', severity: 'error', s: p.s0, msg: `corner width ${p.attr.w} m below ${MIN_W[D]! - 2} m` });
    if (p.attr.w < 11 && p.curv !== 0) out.push({ rule: 'V4', severity: 'error', s: p.s0, msg: `corner width ${p.attr.w} m below the 11 m minimum` });
  }
  // V8 key gates
  if (meta.keyGates.length < 6) out.push({ rule: 'V8', severity: 'error', msg: `only ${meta.keyGates.length} key gates (need ≥ 6)` });
  // V13 laps vs reference lap time
  if (meta.refLapTicks > 0) {
    const ref = meta.refLapTicks / 60;
    const want = Math.max(1, Math.min(5, Math.round(115 / ref)));
    if (want !== meta.laps) out.push({ rule: 'V13', severity: 'warn', msg: `laps=${meta.laps} but ref lap ${ref.toFixed(1)} s suggests ${want}` });
    const race = ref * meta.laps;
    if (race < 90 || race > 140) out.push({ rule: 'V13', severity: 'warn', msg: `reference race ${race.toFixed(0)} s outside 100–130 s` });
  }
  // V15 ground under every sample
  const hit: GroundHit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, surf: 0, tri: 0, flags: 0 };
  let missing = 0, firstMiss = -1;
  const jumpSpans = meta.jumps.map((j) => [j.lipS, j.landS0] as const);
  for (const s of g.samples) {
    if (jumpSpans.some(([a, b]) => s.s > a && s.s < b)) continue;
    if (!track.groundRay(s.x + s.ux, s.y + s.uy, s.z + s.uz, -s.ux, -s.uy, -s.uz, 2, hit)) { missing++; if (firstMiss < 0) firstMiss = s.s; }
  }
  if (missing) out.push({ rule: 'V15', severity: 'error', s: firstMiss, msg: `${missing} samples have no ground` });
  void ast;
  return out;
}
