/* eslint-disable no-restricted-globals -- .vis is render data (Float32Array vertex buffers), never sim state. */
// .vis render container (docs/design/11-track-spec.md §11, B6). Pure data code so the client can decode it without
// importing trackc. v1 (M1) readers use `slots[].chunks` only; v2 adds a chunk table, junction gores, portals, rails,
// hazard visuals and per-path minimaps (docs/design/contract-requests/L4-vis-v2.md). Every v2 field is optional.
import { CVIS_MAGIC, CVIS_VERSION } from './format.ts';
import { readContainer } from './container.ts';

export interface VisSlot {
  name: string;          // unique slot name, `material` or `material:variant`
  material: string;      // M1 material key: road | kerb | shoulder | wall | underside | terrain | startline | boostpad
  variant?: string;      // v2: specialised look (surface id, wall type, kill_lava, rail, portal …); fall back to `material`
  chunks: { i0: number; n: number; bbox: number[]; chunk?: number }[];
  lod1?: { i0: number; n: number; chunk: number }[];   // v2: ranges into `s{j}.idx1` (≤ 40% of the LOD0 triangles)
}
export interface VisChunk {
  id: number; path: number; s0: number; s1: number; kind: 'track' | 'terrain' | 'area' | 'misc'; bbox: number[];
  groups: { slot: number; i0: number; n: number }[]; tris: number;
}
export interface VisPose { x: number; y: number; z: number; fx: number; fy: number; fz: number }
export interface VisMeta {
  id: string; themeId: string; name: string;
  slots: VisSlot[];
  props: { kind: string; n: number }[];            // `p{j}.xf`: Float32 stride 6 (x, y, z, yaw, scale, variant)
  bounds: number[];
  line: { x: number; y: number; z: number; fx: number; fy: number; fz: number; w: number };
  theme: Record<string, string>;
  lapLength: number;
  // ---- v2
  visVersion?: number;
  chunks?: VisChunk[];
  junctions?: { kind: string; gore: VisPose | null }[];
  minimapPaths?: { id: string; kind: string; array: string }[];
  materials?: string[];
  portals?: { id: string; kind: 'entry' | 'exit'; x: number; y: number; z: number; fx: number; fy: number; fz: number; w: number; h: number }[];
  hazards?: { id: number; kind: string; name: string; prop: string; size: [number, number, number]; shape: string; group?: number }[];
  killPlanes?: { id: string; y: number; surf: string; aabb: [number, number, number, number] }[];
  /** PVS: `pvs` Uint8 array, one bitset of `pvsBytes` bytes per main-line sample every `pvsStep` metres */
  pvsStep?: number; pvsBytes?: number;
}

export interface TrackVis {
  meta: VisMeta;
  slot(j: number): { pos: Float32Array; nrm: Float32Array; uv: Float32Array; col: Float32Array; idx: Uint32Array; idx1: Uint32Array | null };
  props(j: number): Float32Array;
  minimap: Float32Array;
  minimapOf(pathId: string): Float32Array | null;
  /** chunk ids visible from main-line progress s (all chunks when the file has no PVS) */
  visibleChunks(s: number, out: number[]): number;
}

export function decodeVis(buf: ArrayBuffer): TrackVis {
  const c = readContainer(buf, CVIS_MAGIC, CVIS_VERSION);
  const meta = c.meta as VisMeta;
  const A = c.arrays;
  const pvs = (A.get('pvs') as Uint8Array | undefined) ?? null;
  return {
    meta,
    slot: (j) => ({
      pos: A.get(`s${j}.pos`) as Float32Array, nrm: A.get(`s${j}.nrm`) as Float32Array, uv: A.get(`s${j}.uv`) as Float32Array,
      col: A.get(`s${j}.col`) as Float32Array, idx: A.get(`s${j}.idx`) as Uint32Array, idx1: (A.get(`s${j}.idx1`) as Uint32Array | undefined) ?? null,
    }),
    props: (j) => A.get(`p${j}.xf`) as Float32Array,
    minimap: (A.get('minimap') as Float32Array | undefined) ?? new Float32Array(0),
    minimapOf: (id) => (A.get(`minimap.${id}`) as Float32Array | undefined) ?? null,
    visibleChunks(s, out) {
      const chunks = meta.chunks ?? [];
      if (!pvs || !meta.pvsStep || !meta.pvsBytes) { for (let i = 0; i < chunks.length; i++) out[i] = chunks[i]!.id; return chunks.length; }
      const n = pvs.length / meta.pvsBytes;
      let k = Math.floor(s / meta.pvsStep);
      if (k < 0) k = 0; if (k >= n) k = n - 1;
      let m = 0;
      const o = k * meta.pvsBytes;
      for (let b = 0; b < meta.pvsBytes; b++) {
        const byte = pvs[o + b]!;
        if (!byte) continue;
        for (let bit = 0; bit < 8; bit++) if (byte & (1 << bit)) out[m++] = b * 8 + bit;
      }
      return m;
    },
  };
}
