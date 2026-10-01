// Model builder shared by mascots and karts: merges many coloured parts into ONE indexed, skinned BufferGeometry.
// Why one geometry: the art bible caps a mascot at 3 draw calls and a kart at 2, yet both need independently animated
// parts (arms, hats, scarves, wheels, suspension). Rigid skinning (weight 1 to a bone) gives one draw per material while
// every part still moves on its own bone.
//
// Per-vertex attributes written:
//   position, normal, uv (optional), color (vec3, the palette colour)
//   surf  (vec4: roughness, metalness, glow, clearcoat) — lets ONE shared material cover vinyl, copper, rubber, chrome, neon
//   skinIndex / skinWeight
//   partId (uint8, the palette slot; CPU-side recolouring for palette skins, team tint and liveries)
//   plus any extra float attributes declared by the caller (karts: pcol, pat).
import * as THREE from 'three/webgpu';

export interface Surface { rough: number; metal: number; glow: number; coat: number }

/** Named surfaces. Values follow the art bible (§2): vinyl clearcoat 0.6 / roughness 0.42, candy paint clearcoat 1.0. */
export const SURF = {
  vinyl: { rough: 0.42, metal: 0, glow: 0, coat: 0.6 },
  matte: { rough: 0.78, metal: 0, glow: 0, coat: 0 },
  soft: { rough: 0.9, metal: 0, glow: 0, coat: 0 },          // cloth, fur, felt
  gloss: { rough: 0.22, metal: 0, glow: 0, coat: 1 },
  voxel: { rough: 0.62, metal: 0, glow: 0, coat: 0.15 },
  metal: { rough: 0.3, metal: 0.9, glow: 0, coat: 0.3 },    // copper, brass
  gold: { rough: 0.24, metal: 1, glow: 0, coat: 0.5 },
  chrome: { rough: 0.24, metal: 0.85, glow: 0, coat: 0 },
  rubber: { rough: 0.92, metal: 0, glow: 0, coat: 0 },
  paint: { rough: 0.4, metal: 0.08, glow: 0, coat: 0.7 },
  plastic: { rough: 0.5, metal: 0, glow: 0, coat: 0.2 },
  glow: { rough: 0.4, metal: 0, glow: 2.2, coat: 0 },
  neon: { rough: 0.35, metal: 0, glow: 4.5, coat: 0 },
  eye: { rough: 0.2, metal: 0, glow: 0, coat: 1 },
} as const satisfies Record<string, Surface>;
export type SurfName = keyof typeof SURF;

/** Skin binding for a part: a rigid bone, or a per-vertex function (ribbons, capes, floppy hats). */
export type SkinFn = (x: number, y: number, z: number, out: SkinOut) => void;
export interface SkinOut { i0: number; i1: number; i2: number; i3: number; w0: number; w1: number; w2: number; w3: number }

export interface PartOpts {
  color: THREE.ColorRepresentation;
  slot?: number;                 // partId (palette slot); 255 = fixed colour
  bone?: number;                 // rigid bone index
  skin?: SkinFn;                 // blended skinning (overrides bone)
  surf?: SurfName | Partial<Surface>;
  extra?: Record<string, ArrayLike<number>>; // per-part constant values for declared extra attributes
  shade?: ArrayLike<number>;     // per-vertex brightness multiplier (voxel shade steps, painted AO)
}

export const FIXED_SLOT = 255;

interface Chunk { geo: THREE.BufferGeometry; o: PartOpts }

const _col = new THREE.Color();
const _skin: SkinOut = { i0: 0, i1: 0, i2: 0, i3: 0, w0: 1, w1: 0, w2: 0, w3: 0 };

export class ModelBuilder {
  private chunks: Chunk[] = [];
  private extras: Record<string, number>;
  private keepUv: boolean;
  /** Triangle count of what has been added so far. */
  tris = 0;

  constructor(opts: { uv?: boolean; extras?: Record<string, number> } = {}) {
    this.extras = opts.extras ?? {};
    this.keepUv = opts.uv ?? false;
  }

  get empty(): boolean { return this.chunks.length === 0; }

  add(geo: THREE.BufferGeometry, o: PartOpts): this {
    const n = geo.index ? geo.index.count : geo.attributes.position!.count;
    this.tris += n / 3;
    this.chunks.push({ geo, o });
    return this;
  }

  /** Merge every part. Returns null when nothing was added. */
  build(): THREE.BufferGeometry | null {
    if (!this.chunks.length) return null;
    let nv = 0, ni = 0;
    for (const c of this.chunks) { nv += c.geo.attributes.position!.count; ni += c.geo.index ? c.geo.index.count : c.geo.attributes.position!.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), surf = new Float32Array(nv * 4);
    const uvs = this.keepUv ? new Float32Array(nv * 2) : null;
    const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), part = new Uint8Array(nv), shadeA = new Float32Array(nv).fill(1);
    const ex: Record<string, Float32Array> = {};
    for (const [k, size] of Object.entries(this.extras)) ex[k] = new Float32Array(nv * size);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let v = 0, i = 0;
    for (const { geo, o } of this.chunks) {
      const P = geo.attributes.position!, N = geo.attributes.normal, U = geo.attributes.uv;
      if (!N) geo.computeVertexNormals();
      const NN = geo.attributes.normal!;
      _col.set(o.color);
      const s = typeof o.surf === 'string' ? SURF[o.surf] : { ...SURF.vinyl, ...(o.surf ?? {}) };
      const slot = o.slot ?? FIXED_SLOT;
      const cnt = P.count;
      for (let k = 0; k < cnt; k++) {
        const x = P.getX(k), y = P.getY(k), z = P.getZ(k);
        pos[(v + k) * 3] = x; pos[(v + k) * 3 + 1] = y; pos[(v + k) * 3 + 2] = z;
        nor[(v + k) * 3] = NN.getX(k); nor[(v + k) * 3 + 1] = NN.getY(k); nor[(v + k) * 3 + 2] = NN.getZ(k);
        const f = o.shade ? o.shade[k] ?? 1 : 1;
        shadeA[v + k] = f;
        col[(v + k) * 3] = _col.r * f; col[(v + k) * 3 + 1] = _col.g * f; col[(v + k) * 3 + 2] = _col.b * f;
        surf[(v + k) * 4] = s.rough; surf[(v + k) * 4 + 1] = s.metal; surf[(v + k) * 4 + 2] = s.glow; surf[(v + k) * 4 + 3] = s.coat;
        if (uvs) { uvs[(v + k) * 2] = U ? U.getX(k) : 0; uvs[(v + k) * 2 + 1] = U ? U.getY(k) : 0; }
        part[v + k] = slot;
        if (o.skin) {
          _skin.i0 = _skin.i1 = _skin.i2 = _skin.i3 = 0; _skin.w0 = 1; _skin.w1 = _skin.w2 = _skin.w3 = 0;
          o.skin(x, y, z, _skin);
          const ws = _skin.w0 + _skin.w1 + _skin.w2 + _skin.w3 || 1;
          si[(v + k) * 4] = _skin.i0; si[(v + k) * 4 + 1] = _skin.i1; si[(v + k) * 4 + 2] = _skin.i2; si[(v + k) * 4 + 3] = _skin.i3;
          sw[(v + k) * 4] = _skin.w0 / ws; sw[(v + k) * 4 + 1] = _skin.w1 / ws; sw[(v + k) * 4 + 2] = _skin.w2 / ws; sw[(v + k) * 4 + 3] = _skin.w3 / ws;
        } else {
          si[(v + k) * 4] = o.bone ?? 0; sw[(v + k) * 4] = 1;
        }
        for (const [name, size] of Object.entries(this.extras)) {
          const src = o.extra?.[name];
          for (let c = 0; c < size; c++) ex[name]![(v + k) * size + c] = src ? src[c] ?? 0 : 0;
        }
      }
      if (geo.index) { const I = geo.index; for (let k = 0; k < I.count; k++) idx[i++] = I.getX(k) + v; }
      else for (let k = 0; k < cnt; k++) idx[i++] = k + v;
      v += cnt;
      geo.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (uvs) g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('surf', new THREE.BufferAttribute(surf, 4));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    for (const [name, size] of Object.entries(this.extras)) g.setAttribute(name, new THREE.BufferAttribute(ex[name]!, size));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    // partId stays CPU-side (userData) so it costs no vertex-fetch bandwidth; recolouring reads it.
    g.userData.partId = part;
    g.userData.baseColor = col.slice();
    g.userData.shade = shadeA;
    g.computeBoundingSphere();
    g.computeBoundingBox();
    this.chunks = [];
    return g;
  }
}

/** Rewrite the colour of every vertex in `slot` (no allocation beyond the colour parse). */
export function recolorSlot(g: THREE.BufferGeometry, slot: number, c: THREE.Color | null): void {
  const part = g.userData.partId as Uint8Array | undefined;
  const base = g.userData.baseColor as Float32Array | undefined;
  const shade = g.userData.shade as Float32Array | undefined;
  const col = g.attributes.color as THREE.BufferAttribute | undefined;
  if (!part || !base || !col) return;
  const a = col.array as Float32Array;
  for (let k = 0; k < part.length; k++) {
    if (part[k] !== slot) continue;
    if (c) { const f = shade ? shade[k]! : 1; a[k * 3] = c.r * f; a[k * 3 + 1] = c.g * f; a[k * 3 + 2] = c.b * f; }
    else { a[k * 3] = base[k * 3]!; a[k * 3 + 1] = base[k * 3 + 1]!; a[k * 3 + 2] = base[k * 3 + 2]!; }
  }
  col.needsUpdate = true;
}

/** Rewrite one extra attribute for every vertex in `slot`. */
export function rewriteSlotAttr(g: THREE.BufferGeometry, slot: number, name: string, values: ArrayLike<number>): void {
  const part = g.userData.partId as Uint8Array | undefined;
  const attr = g.attributes[name] as THREE.BufferAttribute | undefined;
  if (!part || !attr) return;
  const a = attr.array as Float32Array, size = attr.itemSize;
  for (let k = 0; k < part.length; k++) {
    if (part[k] !== slot) continue;
    for (let c = 0; c < size; c++) a[k * size + c] = values[c] ?? 0;
  }
  attr.needsUpdate = true;
}

export function triCount(g: THREE.BufferGeometry | null | undefined): number {
  if (!g) return 0;
  return (g.index ? g.index.count : g.attributes.position!.count) / 3;
}

// ---------- transform helpers (build time only) ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
/** Translate / rotate (XYZ euler, radians) / scale a geometry in place. */
export function xf(g: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.BufferGeometry {
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  g.applyMatrix4(_m);
  return g;
}

/** Mirror a geometry across X (fixes winding so faces stay front-facing). */
export function mirrorX(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.applyMatrix4(_m.makeScale(-1, 1, 1));
  const idx = g.index;
  if (idx) { for (let k = 0; k < idx.count; k += 3) { const a = idx.getX(k + 1); idx.setX(k + 1, idx.getX(k + 2)); idx.setX(k + 2, a); } }
  else {
    const P = g.attributes.position!, N = g.attributes.normal, U = g.attributes.uv;
    for (let k = 0; k < P.count; k += 3) for (const A of [P, N, U]) {
      if (!A) continue;
      for (let c = 0; c < A.itemSize; c++) { const t = A.getComponent(k + 1, c); A.setComponent(k + 1, c, A.getComponent(k + 2, c)); A.setComponent(k + 2, c, t); }
    }
  }
  return g;
}
