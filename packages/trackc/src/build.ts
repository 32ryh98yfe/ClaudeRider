// Track build pipeline: DSL → paths (turtle + CLOSE, frames) → content → collision/render meshes (junction and area
// clipping) → TriHash → .ctrk + .vis (+ report, SVG preview). Deterministic: the same source gives the same bytes.
import { createNoise2D } from 'simplex-noise';
import {
  CTRK_MAGIC, CTRK_VERSION, CVIS_MAGIC, CVIS_VERSION, SFLAG, SMP, buildTriHash, writeContainer, loadCtrk, toArrayBuffer,
  type CtrkMeta, type CtrkPathMeta, type BakedTrack, type TypedArray, type PathLink, type GroundHit, type Contact,
} from '@cr/sim';
import type { TrackId } from '@cr/content';
import { parse, type TrackAst } from './dsl.ts';
import { buildModel, sampleAt, type PathModel, type Sample, type TrackModel } from './paths.ts';
import { resolveContent, zoneFlags, inS, type Content } from './content.ts';
import { DEFAULT_MESH, buildRibbon, wallTriangles, type MeshOptions } from './mesh.ts';
import { TriSoup, weld, type WallQuad } from './soup.ts';
import { clipJunctions, findJunctions, type Junction } from './clip.ts';
import { RenderBuilder, groundToRender, startLineToRender, undersideToRender, wallsToRender, type RenderSlot, type ChunkInfo } from './render.ts';
import { buildTerrainField, terrainToRender, type TerrainField } from './terrain.ts';
import { GroundIndex, exclusions, placeProps, type PropSet } from './props.ts';
import { bakeAi } from './aibake.ts';
import { validate, type Finding } from './validate.ts';
import { previewSvg } from './preview.ts';

export const COMPILER_VERSION = 'trackc/2.0';

export interface VisSlotMeta { name: string; material: string; variant: string; chunks: { i0: number; n: number; bbox: number[]; chunk: number }[] }
export interface VisMeta {
  id: string; themeId: string; name: string;
  slots: VisSlotMeta[];
  props: { kind: string; n: number }[];
  bounds: number[];
  line: { x: number; y: number; z: number; fx: number; fy: number; fz: number; w: number };
  theme: Record<string, string>;
  lapLength: number;
  // v2 (additive; docs/design/contract-requests/L4-vis-v2.md)
  visVersion?: number;
  chunks?: (ChunkInfo & { groups: { slot: number; i0: number; n: number }[]; tris: number })[];
  junctions?: { kind: string; gore: { x: number; y: number; z: number; fx: number; fy: number; fz: number } | null }[];
  minimapPaths?: { id: string; kind: string; array: string }[];
  materials?: string[];
}

export interface BuildOptions { refLapTicks?: number; seed?: number; strict?: boolean; mesh?: Partial<MeshOptions>; terrain?: boolean; props?: boolean }

export interface BuildResult {
  id: string;
  ctrk: Uint8Array;
  vis: Uint8Array;
  meta: CtrkMeta;
  visMeta: VisMeta;
  findings: Finding[];
  stats: Record<string, number>;
  previewSvg: string;
  track: BakedTrack;
  model: TrackModel;
  content: Content;
  junctions: Junction[];
  slots: RenderSlot[];
  /** @deprecated M1 name: the main path's geometry summary */
  geometry: { closed: boolean; length: number; samples: Sample[]; closure: TrackModel['closure']; prims: PathModel['prims'] };
  timings: Record<string, number>;
}

const fnv = (bytes: Uint8Array): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]!; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
};
export function hashStr(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------------------------------------ key gates
function forbiddenSpans(m: TrackModel, js: Junction[]): [number, number][] {
  const out: [number, number][] = [];
  const L = m.paths[0]!.length;
  for (const p of m.paths) if (p.map && p.map.host === 0) { const a = p.hostFrom; let b = p.hostTo; if (m.closed && b < a) b += L; out.push([a - 3, b + 3]); }
  for (const j of js) if (j.host === 0) out.push([j.hostS0, j.hostS1]);
  for (const s of m.paths[0]!.samples) if (s.warp) out.push([s.s - 1, s.s + 1]);
  return out;
}
export function inSpans(m: TrackModel, s: number, spans: [number, number][]): boolean {
  return spans.some(([a, b]) => inS(m, 0, s, a, b));
}
function autoKeys(m: TrackModel, js: Junction[]): number[] {
  const L = m.lapLength, spans = forbiddenSpans(m, js);
  const base = m.closed ? 0 : m.lineS;
  const out: number[] = [];
  const n = Math.max(7, Math.round(L / 200));
  for (let k = 1; k <= n; k++) {
    const want = (k * L) / (n + 1);
    let s = -1;
    for (let d = 0; d < L / (2 * (n + 1)); d += 2) {
      if (!inSpans(m, base + want + d, spans)) { s = want + d; break; }
      if (!inSpans(m, base + want - d, spans)) { s = want - d; break; }
    }
    if (s > 5 && s < L - 5) out.push(Math.round(s * 1000) / 1000);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ binary
function pathArrays(p: PathModel, k: number, m: TrackModel): [string, TypedArray][] {
  const S = p.samples, n = S.length;
  const smp = new Float32Array(n * SMP.STRIDE);
  const flg = new Uint16Array(n);
  let anyGrav = false;
  S.forEach((s, i) => {
    const o = i * SMP.STRIDE;
    smp[o + SMP.PX] = s.x; smp[o + SMP.PY] = s.y; smp[o + SMP.PZ] = s.z;
    smp[o + SMP.TX] = s.tx; smp[o + SMP.TY] = s.ty; smp[o + SMP.TZ] = s.tz;
    smp[o + SMP.RX] = s.rx; smp[o + SMP.RY] = s.ry; smp[o + SMP.RZ] = s.rz;
    smp[o + SMP.UX] = s.ux; smp[o + SMP.UY] = s.uy; smp[o + SMP.UZ] = s.uz;
    smp[o + SMP.S] = s.s; smp[o + SMP.WL] = s.w / 2 + s.shL; smp[o + SMP.WR] = s.w / 2 + s.shR;
    smp[o + SMP.SMAIN] = s.sMain;
    flg[i] = s.flags;
    if (s.grav !== 1) anyGrav = true;
  });
  const ai = bakeAi(S, p.closed, p.length / (n - 1));
  const out: [string, TypedArray][] = [[`p${k}.smp`, smp], [`p${k}.flg`, flg], [`p${k}.ai`, Float32Array.from(ai)]];
  if (anyGrav) out.push([`p${k}.grav`, Float32Array.from(S.map((s) => s.grav))]);
  void m;
  return out;
}

function pathMeta(m: TrackModel, p: PathModel): CtrkPathMeta {
  const links: PathLink[] = [];
  if (p.kind === 'main') {
    for (const q of m.paths) {
      if (!q.map || q.map.host !== p.index) continue;
      if (q.kind === 'branch') { links.push({ at: q.hostFrom, to: q.index, toS: 0, kind: 'split' }, { at: q.hostTo, to: q.index, toS: q.length, kind: 'merge' }); }
      if (q.kind === 'rail') links.push({ at: q.hostFrom, to: q.index, toS: 0, kind: 'railIn' });
    }
  } else if (p.map) {
    if (p.kind === 'branch') links.push({ at: 0, to: p.map.host, toS: p.hostFrom, kind: 'split' }, { at: p.length, to: p.map.host, toS: p.hostTo, kind: 'merge' });
    if (p.kind === 'rail') links.push({ at: p.length, to: p.map.host, toS: p.hostTo, kind: 'railOut' });
  }
  const meta: CtrkPathMeta = {
    id: p.id, kind: p.kind, closed: p.closed, length: p.length, n: p.samples.length, ds: p.length / (p.samples.length - 1),
    aiMinSkill: p.aiMinSkill, links,
  };
  if (p.map) { meta.map = { ...p.map }; meta.hostFrom = p.hostFrom; meta.hostTo = p.hostTo; }
  if (p.branchKind) meta.branchKind = p.branchKind;
  if (p.kind === 'main' && !p.closed) meta.lineS = m.lineS;
  const g = p.samples.find((s) => s.gravMode === 2);
  if (g) meta.gravityScale = g.grav;
  return meta;
}

function f32(a: ArrayLike<number>): TypedArray {
  return Float32Array.from(a);
}

function respawnTable(m: TrackModel, track: BakedTrack, p: PathModel): Uint8Array {
  const out = new Uint8Array(p.samples.length);
  const hit: GroundHit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, surf: 0, tri: 0, flags: 0 };
  const cs: Contact[] = Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, depth: 0, flags: 0, tri: 0 }));
  p.samples.forEach((s, i) => {
    if (s.flags & (SFLAG.NO_GROUND | SFLAG.KILL | SFLAG.WARP | SFLAG.RAIL)) return;
    if (!track.groundRay(s.x + s.ux, s.y + s.uy, s.z + s.uz, -s.ux, -s.uy, -s.uz, 2, hit)) return;
    if (hit.flags & 4) return;
    const r = Math.max(0.9, Math.min(3, s.w / 2 - 0.5));
    if (track.sphereWalls(hit.x + s.ux * 0.6, hit.y + s.uy * 0.6, hit.z + s.uz * 0.6, r, cs, 4) > 0) return;
    out[i] = 1;
  });
  void m;
  return out;
}

// ------------------------------------------------------------------------------------------------ build
export function buildTrack(src: string, file: string, opts: BuildOptions = {}): BuildResult {
  const T: Record<string, number> = {};
  let t0 = Date.now();
  const tick = (k: string): void => { const t = Date.now(); T[k] = t - t0; t0 = t; };
  const ast: TrackAst = parse(src, file);
  const m = buildModel(ast);
  const c = resolveContent(m);
  zoneFlags(m, c);
  tick('model');
  const mo: MeshOptions = { ...DEFAULT_MESH, ...opts.mesh };

  // ---- meshes
  const ground = new TriSoup(), kerbs = new TriSoup();
  let walls: WallQuad[] = [];
  const rows = new Map<number, number[]>();
  for (const p of m.paths) { const r = buildRibbon(m, c, p, ground, walls, kerbs, mo); rows.set(p.index, r.rows); }
  const junctions = findJunctions(m);
  const jr = clipJunctions(m, junctions, ground, walls, kerbs);
  walls = jr.walls;
  for (const j of junctions) {
    const h = m.paths[j.host]!, b = m.paths[j.branch]!;
    for (const s of h.samples) if (inS(m, h.index, s.s, j.hostS0, j.hostS1)) s.flags |= SFLAG.BLEND;
    for (const s of b.samples) if (s.s >= j.branchS0 && s.s <= j.branchS1) s.flags |= SFLAG.BLEND;
  }
  const wallSoup = new TriSoup();
  wallTriangles(walls, wallSoup);
  tick('mesh');

  const gW = weld(ground), wW = weld(wallSoup);
  const gPos = gW.pos, gIdx = gW.idx;
  const wPos = wW.pos.length ? wW.pos : Float64Array.from([0, -1e4, 0, 1, -1e4, 0, 0, -1e4, 1]);
  const wIdx = wW.idx.length ? wW.idx : Uint32Array.from([0, 1, 2]);
  const wFlg = wW.idx.length ? wW.triFlg : new Uint8Array(1);
  // hash over the f32-rounded positions the loader will see, so queries match the stored bytes exactly
  const gPos32 = Float64Array.from(f32(gPos) as ArrayLike<number>), wPos32 = Float64Array.from(f32(wPos) as ArrayLike<number>);
  const gh = buildTriHash(gPos32, gIdx), wh = buildTriHash(wPos32, wIdx);
  tick('hash');

  // ---- bounds, key gates, meta
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of m.paths) for (const s of p.samples) {
    if (s.x < minX) minX = s.x; if (s.x > maxX) maxX = s.x; if (s.y < minY) minY = s.y; if (s.y > maxY) maxY = s.y; if (s.z < minZ) minZ = s.z; if (s.z > maxZ) maxZ = s.z;
  }
  const keyGates = (c.keysDeclared ? c.keyGates.map((s) => (m.closed ? s : s - m.lineS)).filter((s) => s > 5 && s < m.lapLength - 5).sort((a, b) => a - b) : autoKeys(m, junctions));
  const main = m.paths[0]!;
  const gates: { s: number; w: number }[] = [];
  for (let s = 15; s < m.lapLength; s += 30) { const q = sampleAt(main, m.closed ? s : s + m.lineS); gates.push({ s, w: q.w + 2 }); }
  let killY = c.killY ?? minY - 12;
  for (const kp of c.killPlanes) killY = Math.min(killY, kp.y - 20);
  const meta: CtrkMeta = {
    id: ast.id as TrackId,
    name: m.name,
    themeId: m.theme,
    hash: '',
    difficulty: m.difficulty,
    lapLength: m.lapLength,
    laps: m.laps,
    topology: m.closed ? 'circuit' : 'p2p',
    killY,
    bounds: [minX, minY, minZ, maxX, maxY, maxZ],
    paths: m.paths.map((p) => pathMeta(m, p)),
    grid: c.grid,
    boxes: c.boxes.map((b) => ({ id: b.id, x: b.x, y: b.y, z: b.z, path: b.path, s: b.s, u: b.u })),
    pads: c.pads.map((p) => ({ path: p.path, s0: p.s0, s1: p.s1, u0: p.d0, u1: p.d1, kind: p.kind })),
    zones: c.zones.map((z) => {
      const o: CtrkMeta['zones'][number] = { kind: z.kind, path: z.path, s0: z.s0, s1: z.s1, u0: z.full ? -1e3 : z.d0, u1: z.full ? 1e3 : z.d1 };
      if (z.speedMul !== undefined) o.speedMul = z.speedMul;
      if (z.surf !== undefined) o.surf = z.surf;
      if (z.belowY !== undefined) o.belowY = z.belowY;
      if (z.gravMode !== undefined) { o.gravMode = z.gravMode; o.gravScale = z.gravScale; }
      if (z.camera !== undefined) o.camera = z.camera;
      return o;
    }).concat(c.killPlanes.map((k) => ({ kind: 'kill' as const, path: 0, s0: 0, s1: 0, u0: -1e3, u1: 1e3, belowY: k.y, ...(k.aabb ? { aabb: k.aabb } : {}) }))),
    rails: [], warps: [],
    jumps: c.jumps.map((j) => ({ path: j.path, lipS: j.lipS, landS0: j.landS0, landS1: j.landS1, vMin: j.vMin, vMax: j.vMax, rampS: j.s0, lipDeg: j.lipDeg, gapLen: j.gapLen, drop: j.drop, lipH: j.lipH, landW: j.landW })),
    hazards: [],
    keyGates,
    refLapTicks: opts.refLapTicks ?? 0,
    hashCells: { cs: gh.cs, cy: gh.cy },
    version: CTRK_VERSION,
    gates,
    junctions: junctions.map((j) => ({ branch: j.branch, host: j.host, kind: j.kind, hostS: j.kind === 'split' ? m.paths[j.branch]!.hostFrom : m.paths[j.branch]!.hostTo, ...(j.gore ? { gore: { x: j.gore.x, y: j.gore.y, z: j.gore.z, fx: j.gore.fx, fy: j.gore.fy, fz: j.gore.fz } } : {}) })),
    signature: c.signature,
    fallbacksTaken: [],
  };
  const arrays: [string, TypedArray][] = [];
  m.paths.forEach((p, k) => arrays.push(...pathArrays(p, k, m)));
  arrays.push(
    ['g.pos', f32(gPos)], ['g.nrm', f32(gW.nrm)], ['g.idx', gIdx], ['g.surf', gW.triSurf], ['g.flg', gW.triFlg],
    ['g.hd', Float64Array.from([gh.ox, gh.oy, gh.oz, gh.nx, gh.ny, gh.nz])], ['g.hk', gh.keys], ['g.hs', gh.starts], ['g.ht', gh.tris],
    ['w.pos', f32(wPos)], ['w.idx', wIdx], ['w.flg', wFlg],
    ['w.hd', Float64Array.from([wh.ox, wh.oy, wh.oz, wh.nx, wh.ny, wh.nz])], ['w.hk', wh.keys], ['w.hs', wh.starts], ['w.ht', wh.tris],
  );
  // pass 1 → load → respawn tables → final bytes (the hash covers everything but itself)
  const pass1 = loadCtrk(toArrayBuffer(writeContainer(CTRK_MAGIC, CTRK_VERSION, meta, arrays)));
  m.paths.forEach((p, k) => arrays.push([`p${k}.rok`, respawnTable(m, pass1, p)]));
  const pre = writeContainer(CTRK_MAGIC, CTRK_VERSION, meta, arrays);
  meta.hash = fnv(pre);
  const ctrk = writeContainer(CTRK_MAGIC, CTRK_VERSION, meta, arrays);
  const track = loadCtrk(toArrayBuffer(ctrk));
  tick('ctrk');

  // ---- render (.vis)
  const seed = opts.seed ?? hashStr(ast.id);
  const noise = createNoise2D(mulberry(seed));
  const amp = Number(c.theme.hills ?? 6);
  const nf = (x: number, z: number): number => noise(x / 180, z / 180) * 0.7 + noise(x / 60, z / 60) * 0.3;
  const wantTerrain = opts.terrain !== false && c.theme.terrain !== 'none';
  const tf: TerrainField | null = wantTerrain ? buildTerrainField(m, c, meta.bounds, nf, amp) : null;
  const ao = (): number => 1;
  const rb = new RenderBuilder();
  groundToRender(rb, m, c, ground, kerbs, ao);
  wallsToRender(rb, walls, ao);
  for (const p of m.paths) undersideToRender(rb, m, p, rows.get(p.index)!, (x, y, z) => (tf ? y - tf.height(x, z) : 0.6));
  startLineToRender(rb, m);
  if (tf) terrainToRender(rb, tf, nf, ao);
  const slots = rb.finalise();
  tick('render');
  const gi = new GroundIndex(ground);
  const props: PropSet[] = opts.props === false ? [] : placeProps(m, c, seed, gi, tf, exclusions(m, c, junctions, []), junctions);
  tick('props');

  const lineSample = sampleAt(main, m.lineS);
  const chunkGroups = rb.chunks.map((ch) => ({ ...ch, groups: [] as { slot: number; i0: number; n: number }[], tris: 0 }));
  slots.forEach((sl, si) => { for (const cr of sl.chunks) { const g = chunkGroups[cr.chunk]!; g.groups.push({ slot: si, i0: cr.i0, n: cr.n }); g.tris += cr.n / 3; } });
  const visMeta: VisMeta = {
    id: ast.id, themeId: m.theme, name: m.name,
    slots: slots.map((s) => ({ name: s.name, material: s.material, variant: s.variant, chunks: s.chunks.map((ch) => ({ i0: ch.i0, n: ch.n, bbox: ch.bbox, chunk: ch.chunk })) })),
    props: props.map((p) => ({ kind: p.kind, n: p.xf.length / 6 })),
    bounds: meta.bounds,
    line: { x: lineSample.x, y: lineSample.y, z: lineSample.z, fx: lineSample.tx, fy: lineSample.ty, fz: lineSample.tz, w: lineSample.w },
    theme: c.theme,
    lapLength: m.lapLength,
    visVersion: 2,
    chunks: chunkGroups.filter((g) => g.groups.length),
    junctions: junctions.map((j) => ({ kind: j.kind, gore: j.gore })),
    minimapPaths: m.paths.filter((p) => p.kind !== 'main').map((p) => ({ id: p.id, kind: p.kind, array: `minimap.${p.id}` })),
    materials: [...new Set(slots.map((s) => s.material))],
  };
  const visArrays: [string, TypedArray][] = [];
  slots.forEach((s, j) => {
    visArrays.push([`s${j}.pos`, f32(s.pos)], [`s${j}.nrm`, f32(s.nrm)], [`s${j}.uv`, f32(s.uv)], [`s${j}.col`, f32(s.col)], [`s${j}.idx`, Uint32Array.from(s.idx)]);
  });
  props.forEach((p, j) => visArrays.push([`p${j}.xf`, f32(p.xf)]));
  const mm: number[] = [];
  for (let i = 0; i < main.samples.length; i += 4) mm.push(main.samples[i]!.x, main.samples[i]!.z);
  visArrays.push(['minimap', f32(mm)]);
  for (const p of m.paths) if (p.kind !== 'main') {
    const q: number[] = [];
    for (let i = 0; i < p.samples.length; i += 4) q.push(p.samples[i]!.x, p.samples[i]!.z);
    const l = p.samples[p.samples.length - 1]!; q.push(l.x, l.z);
    visArrays.push([`minimap.${p.id}`, f32(q)]);
  }
  const vis = writeContainer(CVIS_MAGIC, CVIS_VERSION, visMeta, visArrays);
  tick('vis');

  const stats: Record<string, number> = {
    length: main.length, lapLength: m.lapLength, samples: main.samples.length, paths: m.paths.length, groundTris: gIdx.length / 3, wallTris: wIdx.length / 3,
    boxes: c.boxes.length, ctrkBytes: ctrk.length, visBytes: vis.length, renderTris: slots.reduce((a, s) => a + s.idx.length / 3, 0),
    props: props.reduce((a, p) => a + p.xf.length / 6, 0), minR: minRadius(m, 0), minW: Math.min(...main.samples.map((s) => s.w)),
    slots: slots.length, chunks: visMeta.chunks!.length, clippedTris: jr.touched,
  };
  const result: BuildResult = {
    id: ast.id, ctrk, vis, meta, visMeta, findings: [], stats, previewSvg: '', track, model: m, content: c, junctions, slots,
    geometry: { closed: m.closed, length: main.length, samples: main.samples, closure: m.closure, prims: main.prims }, timings: T,
  };
  result.findings = validate(result, { strict: opts.strict ?? ast.signature.length > 0 });
  tick('validate');
  result.previewSvg = previewSvg(result);
  tick('preview');
  return result;
}

export function minRadius(m: TrackModel, path: number): number {
  let r = Infinity;
  for (const p of m.paths[path]!.prims) {
    if (p.kind === 'arc') r = Math.min(r, 1 / Math.abs(p.k0));
    if (p.kind === 'clothoid') r = Math.min(r, 1 / Math.max(Math.abs(p.k0), Math.abs(p.k1)));
  }
  return r;
}
