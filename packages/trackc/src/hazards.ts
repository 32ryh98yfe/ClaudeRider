// HAZ statements → analytic track hazards (F5). A hazard's pose and activity are pure functions of
// (tick + offset) mod period (sim spec §13.6), so the bake only fixes the parameters; BakedTrack.hazardPose
// evaluates them and the client renders the `prop` named in the .vis hazard record.
//
//   HAZ <kind> [name] at=<sRef> d=<m> [path=<id>] <shape> period=<s> on=<a>-<b> tele=<s> offset=<s>
//       [effect=spin|launch|squash|block] [h=<m>] [prop=<kit key>] [motion=…] [motion attrs] [lanes=[…]]
//
// Shapes (sizes in the hazard frame: f = pose forward, u = pose up):
//   r=<m> [hgt=<m>]            cylinder          size = [radius, height, 0]
//   box=(<along>,<across>,<up>)                  size = [along, across, up]
//   sphere=<m>                                   size = [r, r, r]
//   capsule=(<r>,<len>)        cylinder along u  size = [r, len, 0]
// Motions (defaults by kind): geyser static · press piston · train cross · traffic lane · swinger pendulum.
//   piston   rise=<m> ramp=<s>                   up by `rise` outside the active phase, eased over `ramp`
//   pendulum arm=<m> pivot=<m> amp=<deg> plane=across|along|flat
//   rotate   arm=<m> pivot=<m> plane=across|along|flat   one turn per period
//   cross    span=<m>                            crosses the road (−span → +span) during the active window
//   lane     speed=<m/s> to=<sRef>               runs at → to along the path, wrapping; always active
// Traffic expands `lanes=[(d D, speed V, count N, spacing S), …]` into one lane hazard per vehicle; the
// vehicles of one HAZ line share a `group` (V12 checks the group once and the safe lane across all of them).
import type { HazardDefBaked, HazardMotion } from '@cr/sim';
import { TrackDslError, namedTuple, num, topList, tuple, type Stmt } from './dsl.ts';
import { sampleAt, type TrackModel } from './paths.ts';

export type HazardKind = HazardDefBaked['kind'];
export const HAZARD_KINDS: readonly HazardKind[] = ['geyser', 'press', 'train', 'traffic', 'swinger'];

const TPS = 60;
const ticks = (sec: number): number => Math.round(sec * TPS);

const DEFAULT_EFFECT: Record<HazardKind, HazardDefBaked['effect']> = { geyser: 'launch', press: 'squash', train: 'spin', traffic: 'spin', swinger: 'spin' };
const DEFAULT_MOTION: Record<HazardKind, HazardMotion['type']> = { geyser: 'static', press: 'piston', train: 'cross', traffic: 'lane', swinger: 'pendulum' };
const DEFAULT_PROP: Record<HazardKind, string> = { geyser: 'hazard_geyser', press: 'hazard_press', train: 'hazard_train', traffic: 'hazard_car', swinger: 'hazard_swinger' };

export interface HazardLine { hazards: HazardDefBaked[]; props: string[]; line: number }

/** Parses one HAZ statement; `id0` is the id of its first hazard (and the group id of expanded vehicles). */
export function parseHazard(st: Stmt, m: TrackModel, pathOf: (id: string | undefined) => number, id0: number, file: string): HazardLine {
  const a = st.attrs, ln = st.line;
  const fail = (msg: string): never => { throw new TrackDslError({ file, line: ln, col: 1, msg }); };
  const kind = st.args[0] as HazardKind;
  if (!HAZARD_KINDS.includes(kind)) fail(`HAZ ${kind ?? ''}: kind is ${HAZARD_KINDS.join(' | ')}`);
  const name = st.args[1] ?? `${kind}${id0}`;
  const path = pathOf(a.path);
  const p = m.paths[path]!;
  const s = m.sRef(a.at, path, ln);
  const u = num(a.d, 0);

  // ---- timing (seconds in the DSL, ticks after the bake)
  const periodTicks = ticks(num(a.period, 4));
  const on = /^\s*([-+]?[\d.]+)\s*-\s*([-+]?[\d.]+)\s*$/.exec(a.on ?? '');
  const activeFrom = on ? ticks(Number(on[1])) : 0, activeTo = on ? ticks(Number(on[2])) : periodTicks;
  const telegraphTicks = ticks(num(a.tele, 0)), offsetTicks = ticks(num(a.offset, 0));
  if (activeTo < activeFrom) fail(`HAZ ${name}: on=${a.on} ends before it starts`);

  // ---- shape
  let shape: HazardDefBaked['shape'] = 'cyl', size: [number, number, number];
  if (a.box !== undefined) {
    const b = tuple(a.box);
    if (b.length !== 3) fail(`HAZ ${name}: box=(along,across,up)`);
    shape = 'box'; size = [b[0]!, b[1]!, b[2]!];
  } else if (a.sphere !== undefined) { const r = num(a.sphere, 1); shape = 'sphere'; size = [r, r, r]; }
  else if (a.capsule !== undefined) { const c = tuple(a.capsule); size = [c[0] ?? 0.9, c[1] ?? 2.5, 0]; }
  else if (a.r !== undefined) size = [num(a.r, 3), num(a.hgt, kind === 'geyser' ? 6 : 2), 0];
  else if (kind === 'press') { shape = 'box'; size = [5, 5, 3]; }
  else if (kind === 'train') { shape = 'box'; size = [24, 3.4, 4]; }
  else if (kind === 'traffic') { shape = 'box'; size = [4.4, 2, 1.8]; }
  else if (kind === 'swinger') size = [0.9, 2.5, 0];
  else size = [3, 6, 0];
  if (size.some((x) => !(x >= 0))) fail(`HAZ ${name}: negative size`);

  const effect = (a.effect ?? DEFAULT_EFFECT[kind]) as HazardDefBaked['effect'];
  if (!['spin', 'launch', 'squash', 'block'].includes(effect)) fail(`HAZ ${name}: effect=${effect} (spin | launch | squash | block)`);
  const contact = (a.contact ?? (kind === 'geyser' && effect !== 'block' ? 'trigger' : 'solid')) as 'solid' | 'trigger';
  if (contact !== 'solid' && contact !== 'trigger') fail(`HAZ ${name}: contact=${contact} (solid | trigger)`);
  const mtype = (a.motion ?? DEFAULT_MOTION[kind]) as HazardMotion['type'];
  if (!['static', 'piston', 'pendulum', 'rotate', 'lane', 'cross'].includes(mtype)) fail(`HAZ ${name}: motion=${mtype}`);
  const plane = (a.plane ?? 'across') as NonNullable<HazardMotion['plane']>;
  if (!['across', 'along', 'flat'].includes(plane)) fail(`HAZ ${name}: plane=${plane} (across | along | flat)`);

  const base = (): HazardDefBaked => ({
    id: 0, kind, path, s, u, shape, size: [size[0], size[1], size[2]], periodTicks, activeFrom, activeTo, telegraphTicks, offsetTicks, effect, contact,
    name, h: num(a.h, 0),
  });
  const prop = a.prop ?? DEFAULT_PROP[kind];
  const out: HazardDefBaked[] = [];

  /** lane motion: the period is the lap time of the lane, so the phase wrap and the position wrap coincide */
  const laneTo = (speed: number): { s0: number; s1: number; P: number } => {
    const want = a.to !== undefined ? m.sRef(a.to, path, ln) : s + 200;
    let span = want - s;
    if (span <= 0 && p.closed) span += p.length;
    if (!(span > 1)) fail(`HAZ ${name}: lane to= must lie ahead of at=`);
    const v = Math.abs(speed);
    if (!(v > 0.5)) fail(`HAZ ${name}: lane speed must be ≥ 0.5 m/s`);
    const P = Math.max(1, Math.round((span / v) * TPS));
    return { s0: s, s1: s + (P * v) / TPS, P };
  };

  if (kind === 'traffic' || mtype === 'lane') {
    const lanes = a.lanes !== undefined
      ? topList(a.lanes.replace(/^\[|\]$/g, '')).map((e) => namedTuple(e))
      : [{ d: u, speed: num(a.speed, 12), count: num(a.count, 1), spacing: num(a.spacing, 40) }];
    if (lanes.length === 0) fail(`HAZ ${name}: lanes=[(d D, speed V, count N, spacing S), …]`);
    for (const l of lanes) {
      const speed = l.speed ?? 12, count = Math.max(1, Math.round(l.count ?? 1)), spacing = l.spacing ?? 40;
      const { s0, s1, P } = laneTo(speed);
      for (let k = 0; k < count; k++) {
        const h = base();
        h.u = l.d ?? u; h.periodTicks = P; h.activeFrom = 0; h.activeTo = P; h.telegraphTicks = 0;
        // vehicle k runs `k·spacing` metres behind vehicle 0
        h.offsetTicks = (((offsetTicks - Math.round((k * spacing * TPS) / Math.abs(speed))) % P) + P) % P;
        h.motion = { type: 'lane', speed, s0, s1 };
        out.push(h);
      }
    }
  } else {
    const h = base();
    const mo: HazardMotion = { type: mtype };
    if (mtype === 'piston') { mo.rise = num(a.rise, 4); mo.rampTicks = ticks(num(a.ramp, 0.2)); }
    if (mtype === 'pendulum' || mtype === 'rotate') {
      mo.arm = num(a.arm, 6); mo.pivotH = num(a.pivot, mo.arm + 1.5); mo.plane = plane;
      if (mtype === 'pendulum') mo.ampDeg = num(a.amp, 60);
    }
    if (mtype === 'cross') mo.halfSpan = num(a.span, sampleAt(p, s).w / 2 + 14);
    if (mtype !== 'static') h.motion = mo;
    out.push(h);
  }
  out.forEach((h, k) => { h.id = id0 + k; if (out.length > 1 || kind === 'traffic') h.group = id0; });
  return { hazards: out, props: out.map(() => prop), line: ln };
}
