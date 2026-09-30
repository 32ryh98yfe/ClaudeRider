// Track build pipeline: DSL → geometry → collision/render/AI → .ctrk + .vis (+ report, SVG preview).
import { createNoise2D } from 'simplex-noise';
import {
  AIS, CTRK_MAGIC, CTRK_VERSION, CVIS_MAGIC, CVIS_VERSION, SFLAG, SMP, buildTriHash, writeContainer, loadCtrk, toArrayBuffer,
  type CtrkMeta, type BakedTrack, type TypedArray,
} from '@cr/sim';
import { SURFACE_IDS, type TrackId } from '@cr/content';
import { parse, type TrackAst } from './dsl.ts';
import { buildGeometry, computeFrames, type Geometry, type Sample } from './geometry.ts';
import { buildCollision, buildRender, buildTerrain, type PadRegion, type RenderSlot } from './mesh.ts';
import { bakeAi } from './aibake.ts';
import { placeProps } from './props.ts';
import { validate, type Finding } from './validate.ts';

export interface VisMeta {
  id: string; themeId: string; name: string;
  slots: { name: string; material: string; chunks: { i0: number; n: number; bbox: number[] }[] }[];
  props: { kind: string; n: number }[];
  bounds: number[];
  line: { x: number; y: number; z: number; fx: number; fy: number; fz: number; w: number };
  theme: Record<string, string>;
  lapLength: number;
}

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
  geometry: Geometry;
}

function rotateClosed(g: Geometry, lineAt: number): number {
  const S = g.samples;
  const nSeg = S.length - 1;
  const step = g.length / nSeg;
  const j = ((Math.round(lineAt / step) % nSeg) + nSeg) % nSeg;
  if (j === 0) return 0;
  const body = S.slice(0, nSeg);
  const rot = body.slice(j).concat(body.slice(0, j));
  rot.forEach((s, k) => { s.s = k * step; });
  const last = { ...rot[0]!, s: g.length };
  g.samples = [...rot, last];
  computeFrames(g.samples, true);
  return j * step;
}

const fnv = (bytes: Uint8Array): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]!; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
};

export function buildTrack(src: string, file: string, opts: { refLapTicks?: number; seed?: number } = {}): BuildResult {
  const ast: TrackAst = parse(src, file);
  const g = buildGeometry(ast);
  const closed = g.closed;
  const L = g.length;
  // --- progress coordinates: circuits are rotated so the finish line sits at s = 0 (sMain == s on the main path)
  const shift = closed ? rotateClosed(g, ast.lineAt) : 0;
  const lineS = closed ? 0 : ast.lineAt;
  const lapLength = closed ? L : L - ast.lineAt - Number(ast.header.finishBefore ?? 20);
  const toMain = (dslS: number): number => (closed ? ((((dslS - shift) % L) + L) % L) : dslS - ast.lineAt);
  const sMainOfPathS = (s: number): number => (closed ? s : s - ast.lineAt);
  const S = g.samples;
  const n = S.length;

  // --- sample arrays
  const smp = new Float64Array(n * SMP.STRIDE);
  const flg = new Uint16Array(n);
  const jumps = ast.jumps.map((j) => ({ s0: toMain(j.s0), s1: toMain(j.s1) }));
  S.forEach((s, i) => {
    const o = i * SMP.STRIDE;
    smp[o + SMP.PX] = s.x; smp[o + SMP.PY] = s.y; smp[o + SMP.PZ] = s.z;
    smp[o + SMP.TX] = s.tx; smp[o + SMP.TY] = s.ty; smp[o + SMP.TZ] = s.tz;
    smp[o + SMP.RX] = s.rx; smp[o + SMP.RY] = s.ry; smp[o + SMP.RZ] = s.rz;
    smp[o + SMP.UX] = s.ux; smp[o + SMP.UY] = s.uy; smp[o + SMP.UZ] = s.uz;
    smp[o + SMP.S] = s.s; smp[o + SMP.WL] = s.w / 2 + s.shoulder; smp[o + SMP.WR] = s.w / 2 + s.shoulder;
    smp[o + SMP.SMAIN] = sMainOfPathS(s.s);
    let f = s.surf & SFLAG.SURF_MASK;
    const sm = sMainOfPathS(s.s);
    if (jumps.some((j) => sm >= j.s0 && sm <= j.s1)) f |= SFLAG.JUMP;
    if (s.noItem) f |= SFLAG.NO_ITEM;
    flg[i] = f;
  });

  // --- pads, boxes, grid, key gates
  const pads: PadRegion[] = ast.pads.map((p) => ({ s0: toMain(p.s), s1: toMain(p.s) + p.len, u0: p.d - p.w / 2, u1: p.d + p.w / 2, kind: 'boost' as const }));
  const sampleAtMain = (sm: number): Sample => {
    const s = closed ? sm : sm + ast.lineAt;
    const i = Math.max(0, Math.min(n - 1, Math.round(s / (L / (n - 1)))));
    return S[i]!;
  };
  let boxId = 0;
  const boxes = ast.items.flatMap((row) => {
    const sm = toMain(row.s);
    const smpl = sampleAtMain(sm);
    const span = row.span ?? Math.max(4, smpl.w - 3);
    const out = [];
    for (let j = 0; j < row.n; j++) {
      const u = row.n === 1 ? 0 : -span / 2 + (j * span) / (row.n - 1);
      out.push({ id: boxId++, x: smpl.x + smpl.rx * u + smpl.ux * 0.9, y: smpl.y + smpl.ry * u + smpl.uy * 0.9, z: smpl.z + smpl.rz * u + smpl.uz * 0.9, path: 0, s: closed ? sm : sm + ast.lineAt, u });
    }
    return out;
  });
  const grid = [];
  const gd = ast.grid;
  for (let k = 0; k < 8; k++) {
    const row = Math.floor(k / gd.cols), col = k % gd.cols;
    const back = 8 + row * gd.pitch + (col % 2) * gd.stagger;
    const pathS = closed ? L - back : lineS - back;
    const i = Math.max(0, Math.min(n - 1, Math.round(pathS / (L / (n - 1)))));
    const smpl = S[i]!;
    const u = gd.cols === 1 ? 0 : (col === 0 ? -gd.d : gd.d);
    grid.push({ x: smpl.x + smpl.rx * u, y: smpl.y + smpl.ry * u, z: smpl.z + smpl.rz * u, fx: smpl.tx, fy: smpl.ty, fz: smpl.tz });
  }
  let keyGates = ast.keys.map(toMain).filter((s) => s > 5 && s < lapLength - 5).sort((a, b) => a - b);
  if (keyGates.length < 6) keyGates = Array.from({ length: 7 }, (_, k) => ((k + 1) * lapLength) / 8);

  // --- collision
  const col = buildCollision(g, pads, sMainOfPathS);
  const gPos = Float64Array.from(col.ground.pos), gIdx = Uint32Array.from(col.ground.idx);
  const wPos = Float64Array.from(col.walls.pos.length ? col.walls.pos : [0, -1e4, 0, 1, -1e4, 0, 0, -1e4, 1]), wIdx = Uint32Array.from(col.walls.idx.length ? col.walls.idx : [0, 1, 2]);
  const gh = buildTriHash(gPos, gIdx), wh = buildTriHash(wPos, wIdx);
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of S) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }

  // --- AI tables
  const ai = bakeAi(S, closed, L / (n - 1));

  const laps = ast.header.laps && ast.header.laps !== 'auto' ? Number(ast.header.laps) : 3;
  const meta: CtrkMeta = {
    id: ast.id as TrackId,
    name: ast.header.name ?? ast.id,
    themeId: ast.header.theme ?? 'spark_circuit',
    hash: '',
    difficulty: Number(ast.header.diff ?? 1),
    lapLength,
    laps,
    topology: closed ? 'circuit' : 'p2p',
    killY: ast.killY ?? minY - 12,
    bounds: [minX, minY, minZ, maxX, maxY, maxZ],
    paths: [{ id: 'main', kind: 'main', closed, length: L, n, ds: L / (n - 1), aiMinSkill: 0 }],
    grid,
    boxes,
    pads: pads.map((p) => ({ path: 0, s0: p.s0, s1: p.s1, u0: p.u0, u1: p.u1, kind: p.kind })),
    zones: [], rails: [], warps: [],
    jumps: jumps.map((j) => ({ path: 0, lipS: closed ? j.s0 : j.s0 + ast.lineAt, landS0: closed ? j.s1 : j.s1 + ast.lineAt, landS1: (closed ? j.s1 : j.s1 + ast.lineAt) + 30, vMin: 20, vMax: 46 })),
    hazards: [],
    keyGates,
    refLapTicks: opts.refLapTicks ?? 0,
    hashCells: { cs: gh.cs, cy: gh.cy },
  };
  const arrays: [string, TypedArray][] = [
    ['p0.smp', smp], ['p0.flg', flg], ['p0.ai', ai],
    ['g.pos', gPos], ['g.nrm', Float64Array.from(col.ground.nrm)], ['g.idx', gIdx], ['g.surf', Uint8Array.from(col.ground.surf)], ['g.flg', Uint8Array.from(col.ground.flg)],
    ['g.hd', Float64Array.from([gh.ox, gh.oy, gh.oz, gh.nx, gh.ny, gh.nz])], ['g.hk', gh.keys], ['g.hs', gh.starts], ['g.ht', gh.tris],
    ['w.pos', wPos], ['w.idx', wIdx], ['w.flg', new Uint8Array(wIdx.length / 3)],
    ['w.hd', Float64Array.from([wh.ox, wh.oy, wh.oz, wh.nx, wh.ny, wh.nz])], ['w.hk', wh.keys], ['w.hs', wh.starts], ['w.ht', wh.tris],
  ];
  const pre = writeContainer(CTRK_MAGIC, CTRK_VERSION, meta, arrays);
  meta.hash = fnv(pre);
  const ctrk = writeContainer(CTRK_MAGIC, CTRK_VERSION, meta, arrays);
  const track = loadCtrk(toArrayBuffer(ctrk));

  // --- render (.vis)
  const seed = opts.seed ?? hashStr(ast.id);
  const slots: RenderSlot[] = buildRender(g, pads, sMainOfPathS, lineS, seed);
  const noise = createNoise2D(mulberry(seed));
  const amp = Number(ast.theme.hills ?? 6);
  const nf = (x: number, z: number): number => noise(x / 180, z / 180) * 0.7 + noise(x / 60, z / 60) * 0.3;
  if (ast.theme.terrain !== 'none') slots.push(buildTerrain(g, meta.bounds, nf, amp));
  const props = placeProps(g, ast, seed, lineS);
  const lineSmp = S[0]!;
  const lineSample = closed ? lineSmp : S[Math.max(0, Math.min(n - 1, Math.round(lineS / (L / (n - 1)))))]!;
  const visMeta: VisMeta = {
    id: ast.id, themeId: meta.themeId, name: meta.name,
    slots: slots.map((s) => ({ name: s.name, material: s.material, chunks: s.chunks.map((c) => ({ i0: c.i0, n: c.n, bbox: c.bbox })) })),
    props: props.map((p) => ({ kind: p.kind, n: p.xf.length / 6 })),
    bounds: meta.bounds,
    line: { x: lineSample.x, y: lineSample.y, z: lineSample.z, fx: lineSample.tx, fy: lineSample.ty, fz: lineSample.tz, w: lineSample.w },
    theme: ast.theme,
    lapLength,
  };
  const visArrays: [string, TypedArray][] = [];
  slots.forEach((s, j) => {
    visArrays.push([`s${j}.pos`, Float32Array.from(s.pos)], [`s${j}.nrm`, Float32Array.from(s.nrm)], [`s${j}.uv`, Float32Array.from(s.uv)], [`s${j}.col`, Float32Array.from(s.col)], [`s${j}.idx`, Uint32Array.from(s.idx)]);
  });
  props.forEach((p, j) => visArrays.push([`p${j}.xf`, Float32Array.from(p.xf)]));
  const mm: number[] = [];
  for (let i = 0; i < n; i += 4) mm.push(S[i]!.x, S[i]!.z);
  visArrays.push(['minimap', Float32Array.from(mm)]);
  const vis = writeContainer(CVIS_MAGIC, CVIS_VERSION, visMeta, visArrays);

  const findings = validate(ast, g, meta, track);
  const stats = {
    length: L, lapLength, samples: n, groundTris: gIdx.length / 3, wallTris: wIdx.length / 3, boxes: boxes.length,
    ctrkBytes: ctrk.length, visBytes: vis.length, renderTris: slots.reduce((a, s) => a + s.idx.length / 3, 0),
    props: props.reduce((a, p) => a + p.xf.length / 6, 0), minR: minRadius(g), minW: Math.min(...S.map((s) => s.w)),
  };
  return { id: ast.id, ctrk, vis, meta, visMeta, findings, stats, previewSvg: previewSvg(g, meta, boxes), track, geometry: g };
}

function minRadius(g: Geometry): number {
  let m = Infinity;
  for (const p of g.prims) if (p.curv !== 0) m = Math.min(m, 1 / Math.abs(p.curv));
  return m;
}

function hashStr(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function previewSvg(g: Geometry, meta: CtrkMeta, boxes: { x: number; z: number }[]): string {
  const [x0, , z0, x1, , z1] = meta.bounds;
  const pad = 40, W = x1 - x0 + 2 * pad, H = z1 - z0 + 2 * pad;
  const pts = g.samples.filter((_, i) => i % 3 === 0).map((s) => `${(s.x - x0 + pad).toFixed(1)},${(s.z - z0 + pad).toFixed(1)}`).join(' ');
  const surfColor = (id: number): string => (SURFACE_IDS[id - 1] === 'sand' ? '#d8b56a' : SURFACE_IDS[id - 1] === 'grass' ? '#6a9a4a' : '#666');
  const w = g.samples[0]!.w;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" width="${Math.min(1200, W).toFixed(0)}">
<rect width="100%" height="100%" fill="#1d2b1f"/>
<polyline points="${pts}" fill="none" stroke="${surfColor(g.samples[0]!.surf)}" stroke-width="${w}" stroke-linejoin="round"/>
<polyline points="${pts}" fill="none" stroke="#eee" stroke-width="0.6" stroke-dasharray="4 4"/>
${boxes.map((b) => `<circle cx="${(b.x - x0 + pad).toFixed(1)}" cy="${(b.z - z0 + pad).toFixed(1)}" r="1.4" fill="#f5c542"/>`).join('')}
${meta.grid.map((p) => `<circle cx="${(p.x - x0 + pad).toFixed(1)}" cy="${(p.z - z0 + pad).toFixed(1)}" r="1.2" fill="#d97757"/>`).join('')}
<text x="10" y="24" fill="#fff" font-size="18" font-family="sans-serif">${meta.id} · ${meta.lapLength.toFixed(0)} m · D${meta.difficulty}</text>
</svg>`;
}

export { AIS };
