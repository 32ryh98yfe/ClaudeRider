// TrackDefV1 (docs/design/11-track-spec.md §3, gap-3 §4 + PropDef + EnvDef): the compiler's resolved, JSON-friendly
// description of a track. trackc bakes from the exact turtle primitives; `ctrl` lists turtle points (every primitive
// boundary plus ≤ 12 m chords) for tools that want a control polygon.
import type { SurfaceId, ThemeId, TrackId } from '@cr/content';
import type { TrackAst } from './dsl.ts';
import { buildModel } from './paths.ts';
import { resolveContent } from './content.ts';
import { SURFACE_IDS } from '@cr/content';

export type WallSpec = { type: 'none' | 'curb' | 'barrier' | 'fence' | 'rock' | 'parapet' | 'building' | 'invisible' | 'planter' | 'pillar'; h: number; restitution?: number; soft?: boolean; ledgeKill?: boolean };
export interface CtrlPtV1 {
  p: [number, number, number]; w?: number; bank?: number; profile?: string; surf?: SurfaceId;
  shoulderL?: number; shoulderR?: number; shoulderSurf?: SurfaceId; wallL?: WallSpec; wallR?: WallSpec; tag?: string; blend?: number;
}
export interface PathDef {
  id: string; kind: 'main' | 'branch' | 'rail' | 'connector'; closed: boolean; curve: 'centripetal'; ctrl: CtrlPtV1[];
  frame?: { fromS: number; toS: number; mode: 'worldUp' | 'rmf' }[];
  gravity?: { fromS: number; toS: number; mode: 'world' | 'track' | 'low'; scale?: number }[];
  map?: { host: string; fromS: number; toS: number }; aiMinSkill?: number; width?: number; wallL?: WallSpec; wallR?: WallSpec;
}
export type ProfileDef =
  | { id: string; kind: 'flat'; crown?: number }
  | { id: string; kind: 'halfpipe'; floorHalf: number; filletR: number; wallDeg: number; wallH: number; lip?: number; sides: 'both' | 'L' | 'R' }
  | { id: string; kind: 'custom'; pts: [d: number, h: number, surf?: SurfaceId][] };
export interface AreaDef {
  id: string; kind: 'annulusSector' | 'polygon'; y: number; center?: [number, number]; rIn?: number; rOut?: number; fromDeg?: number; sweepDeg?: number;
  polygon?: [number, number][]; holes?: [number, number][][]; surf: SurfaceId; wallIn?: WallSpec; wallOut?: WallSpec; guide: string;
  obstacles?: { kind: 'cyl' | 'box'; at: [number, number]; r?: number; size?: [number, number, number] }[];
}
export interface JunctionDef { id: string; kind: 'split' | 'merge'; host: string; s: number; branch: string; side: 'L' | 'R'; blendLen: number; gore?: WallSpec }
export interface RailDef { id: string; host: string; fromS: number; toS: number; offset: { s: number; d: number; h: number }[]; capture: { dMax: number; headingMaxDeg: number; vMin: number }; speed: { min: number; accel: number; max: number }; gaugePerSec: number }
export interface WarpDef { id: string; entry: { path: string; s: number; d: [number, number]; hMax: number }; exit: { path: string; s: number; d: number }; transitSec: number; keepSpeed: boolean }
export interface JumpDef { s: number; rampLen: number; lipDeg: number; gapLen: number; drop: number; landLen: number; landW: number; vMin: number; vMax: number }
export interface ZoneDef { kind: 'conveyor' | 'surface' | 'kill' | 'noItem' | 'camera' | 'gravity'; path?: string; fromS?: number; toS?: number; d?: [number, number]; aabb?: [number, number, number, number, number, number]; speedMul?: number; surf?: SurfaceId; belowY?: number }
export interface HazardDef {
  id: string; kind: 'geyser' | 'press' | 'train' | 'traffic' | 'swinger'; path: string; s: number; d: number; shape: { type: 'cyl' | 'box' | 'sphere'; size: number[] };
  period: number; activeFrom: number; activeTo: number; telegraph: number; offset: number; effect: 'spin' | 'launch' | 'squash' | 'block';
  lanes?: { d: number; speed: number; count: number; spacing: number }[];
}
export interface ItemRowDef { s: number; n: number; span?: number; path?: string }
export interface BoostPadDef { s: number; d: number; len: number; width: number; path?: string }
export interface PropDef { kind: string; mode: 'along' | 'landmark' | 'scatter'; path?: string; side?: 'L' | 'R' | 'both'; every?: number; offset?: number; jitter?: number; scale?: [number, number]; fromS?: number; toS?: number; at?: [number, number, number]; yaw?: number; seed?: number }
export interface EnvDef { themeId: ThemeId; sky?: string; time?: string; sunDir?: [number, number, number]; fog?: { color: string; near: number; far: number }; headlights?: boolean; terrain: string; song: { id: string; variant: 'a' | 'b' } }
export interface TrackDefV1 {
  schema: 'clauderider.track/1'; id: TrackId; name: string; theme: ThemeId; difficulty: 1 | 2 | 3 | 4 | 5; laps: number; topology: 'circuit' | 'pointToPoint';
  startLineS: number; paths: PathDef[]; areas: AreaDef[]; junctions: JunctionDef[]; rails: RailDef[]; warps: WarpDef[]; jumps: JumpDef[];
  zones: ZoneDef[]; hazards: HazardDef[]; items: ItemRowDef[]; boostPads: BoostPadDef[];
  grid: { rows: number; cols: number; pitch: number; stagger: number; dAbs: number }; keyGates: number[];
  props: PropDef[]; env: EnvDef; profiles: ProfileDef[];
  targets: { refLapSec: { speed: number; item: number }; straightRatio: [number, number] };
  meta: { signature: string[]; fallbacks: { feature: string; substitute: string; when: `F${1 | 2 | 3 | 4 | 5 | 6}` }[]; taken: string[] };
  source: { dsl: string; compiler: string; seed: number };
}

/** turtle + CLOSE → TrackDefV1 (the solved free straights are part of the result's ctrl points). */
export function toDef(ast: TrackAst, opts: { strict: boolean } = { strict: false }): TrackDefV1 {
  const m = buildModel(ast);
  const c = resolveContent(m);
  const surf = (code: number): SurfaceId => (SURFACE_IDS[code - 1] ?? 'asphalt') as SurfaceId;
  const wall = (w: { type: WallSpec['type']; h: number; soft: boolean; ledgeKill: boolean }): WallSpec => ({ type: w.type, h: w.h, ...(w.soft ? { soft: true } : {}), ...(w.ledgeKill ? { ledgeKill: true } : {}) });
  const paths: PathDef[] = m.paths.map((p) => ({
    id: p.id, kind: p.kind, closed: p.closed, curve: 'centripetal',
    ctrl: p.samples.filter((_, i) => i % 10 === 0 || i === p.samples.length - 1).map((s) => ({
      p: [s.x, s.y, s.z], w: s.w, bank: s.bank, profile: s.prof, surf: surf(s.surf), shoulderL: s.shL, shoulderR: s.shR, shoulderSurf: surf(s.shSurfL), wallL: wall(s.wallL), wallR: wall(s.wallR), ...(s.tag ? { tag: s.tag } : {}),
    })),
    ...(p.map ? { map: { host: m.paths[p.map.host]!.id, fromS: p.map.fromS, toS: p.map.toS } } : {}),
    aiMinSkill: p.aiMinSkill,
  }));
  const g = ast.stmts.find((s) => s.cmd === 'GRID')?.attrs ?? {};
  return {
    schema: 'clauderider.track/1', id: ast.id as TrackId, name: m.name, theme: m.theme as ThemeId, difficulty: m.difficulty as 1 | 2 | 3 | 4 | 5, laps: m.laps,
    topology: m.closed ? 'circuit' : 'pointToPoint', startLineS: m.lineAt, paths, areas: [], junctions: [],
    rails: m.paths.filter((p) => p.rail).map((p) => ({ id: p.id, host: m.paths[p.rail!.host]!.id, fromS: p.rail!.hostFrom, toS: p.rail!.hostTo, offset: p.rail!.offsets, capture: p.rail!.capture, speed: p.rail!.speed, gaugePerSec: p.rail!.gaugePerSec })),
    warps: [], jumps: c.jumps.filter((j) => !j.legacy).map((j) => ({ s: j.s0, rampLen: j.rampLen, lipDeg: j.lipDeg, gapLen: j.gapLen, drop: j.drop, landLen: j.landLen, landW: j.landW, vMin: j.vMin, vMax: j.vMax })),
    zones: c.zones.map((z) => ({ kind: z.kind, path: m.paths[z.path]!.id, fromS: z.s0, toS: z.s1, ...(z.full ? {} : { d: [z.d0, z.d1] as [number, number] }), ...(z.speedMul !== undefined ? { speedMul: z.speedMul } : {}), ...(z.surf !== undefined ? { surf: surf(z.surf) } : {}), ...(z.belowY !== undefined ? { belowY: z.belowY } : {}) })),
    hazards: [], items: c.items.map((i) => ({ s: i.s, n: i.n, span: i.span, path: m.paths[i.path]!.id })),
    boostPads: c.pads.filter((p) => p.kind === 'boost').map((p) => ({ s: p.s0, d: (p.d0 + p.d1) / 2, len: p.s1 - p.s0, width: p.d1 - p.d0, path: m.paths[p.path]!.id })),
    grid: { rows: Number(g.rows ?? 4), cols: Number(g.cols ?? 2), pitch: Number(g.pitch ?? 6), stagger: Number(g.stagger ?? 3), dAbs: Number(g.d ?? 4) },
    keyGates: c.keyGates, props: c.props.map((p) => ({ kind: p.kind, mode: p.mode })),
    env: { themeId: m.theme as ThemeId, terrain: c.theme.terrain ?? 'default', song: { id: c.theme.song?.split(':')[0] ?? m.theme, variant: (c.theme.song?.split(':')[1] ?? 'a') as 'a' | 'b' }, ...(c.theme.sky ? { sky: c.theme.sky } : {}), ...(c.theme.time ? { time: c.theme.time } : {}) },
    profiles: [...m.profiles.values()].map((p) => (p.kind === 'flat' ? { id: p.id, kind: 'flat', crown: p.crown } : p.kind === 'halfpipe' ? { id: p.id, kind: 'halfpipe', floorHalf: Number(p.src.floorHalf), filletR: Number(p.src.filletR), wallDeg: Number(p.src.wallDeg), wallH: Number(p.src.wallH), lip: Number(p.src.lip), sides: p.src.sides as 'both' | 'L' | 'R' } : { id: p.id, kind: 'custom', pts: p.pts.map((q) => [q.d, q.h, ...(q.surf ? [q.surf] : [])] as [number, number, SurfaceId?]) })),
    targets: { refLapSec: { speed: m.lapLength / [0, 37, 36, 35, 34, 33][m.difficulty]!, item: (m.lapLength / [0, 37, 36, 35, 34, 33][m.difficulty]!) * 1.12 }, straightRatio: [0, 1] },
    meta: { signature: ast.signature, fallbacks: ast.fallbacks.map((f) => ({ feature: f.feature, substitute: f.substitute, when: f.when as `F${1 | 2 | 3 | 4 | 5 | 6}` })), taken: [] },
    source: { dsl: ast.file, compiler: 'trackc/2.0', seed: 0 },
    ...(opts.strict ? {} : {}),
  };
}
