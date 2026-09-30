// Clawd vinyl-voxel rig v1 (ADR-011, art bible §7). Local frame: +Z forward (the kart's travel direction), +Y up,
// +X is the mascot's LEFT; units are metres at rig scale 1 (body 1.0 m wide). Origin = body centre.
//
// Draw calls: every level of detail is at most 3 skinned meshes sharing ONE skeleton —
//   vinyl (body + limbs + every opaque accessory, partId palette baked into vertex colours),
//   eyes (atlas decals), glass (bubble helmets, crystals; only when the character has any).
// All three materials are shared by every mascot in the scene (see materials.ts).
import * as THREE from 'three/webgpu';
import { ModelBuilder, SURF, FIXED_SLOT, recolorSlot, triCount, type SkinFn, type Surface, type SurfName } from './builder.ts';
import { rbox, box, sparkle, voxels, type V3 } from './shapes.ts';
import { mascotVinyl, mascotEyes, mascotGlass, EYE_CELLS, EYE_ATLAS, EYE_QUAD, type EyeCell } from './materials.ts';
import { BASE_EMOTES, compileEmote, ARM_CHANNELS, type EmoteSlot, type EmoteSpec, type EmoteBuilder, type CompiledEmote, type EyeExpr, type Channel } from './emotes.ts';

export type { EmoteSlot, EyeExpr, EmoteSpec, EmoteBuilder };
export type { V3 };

/** Exact rig dimensions (art bible §7). */
export const RIG = {
  body: { w: 1.0, h: 0.68, d: 0.64, r: 0.18 },
  arm: { w: 0.2, h: 0.2, d: 0.26, r: 0.06, x: 0.58, y: -0.08, pivotX: 0.48 },
  leg: { w: 0.083, h: 0.17, d: 0.12, r: 0.03, xs: [-0.375, -0.208, 0.208, 0.375], y: -0.425 },
  eye: { w: 0.09, h: 0.2, x: 0.24, y: 0.07, z: 0.321 },
  sparkle: { r: 0.1, y: 0.46 },
  anchors: { head_top: [0, 0.34, 0], back: [0, 0, -0.32], hand_L: [0.71, -0.08, 0], hand_R: [-0.71, -0.08, 0], face_front: [0, 0.07, 0.32] },
  /** Seated / lobby scale: one body width ≈ 0.55 × kart width. */
  seatScale: 0.62,
  headTop: 0.34,
} as const;

export interface MascotPalette { body: string; shade: string; accent: string; detail: string; eye: string }
/** partId palette slots. Fixed colours (named or hex) use FIXED_SLOT. */
export const SLOT = { body: 0, shade: 1, accent: 2, detail: 3, eye: 4, sparkle: 5 } as const;
const NAMED = { ivory: '#F9F8F4', dark: '#141413', white: '#FFFFFF', gold: '#E0B04B', black: '#1B1A19', chrome: '#D8D8DE', metal: '#8E8E96', brass: '#C9A14A' } as const;
export type ColorRef = keyof typeof SLOT | keyof typeof NAMED | `#${string}`;

export interface MascotPose { steer: number; lean: number; speed01: number; drifting: boolean; boosting: boolean; airborne: boolean; hit: 0 | 1 | 2 }
export type AnchorName = 'head_top' | 'back' | 'hand_L' | 'hand_R' | 'face_front';
export type BoneRef = 'root' | 'body' | 'head' | 'armL' | 'armR' | 'eyes' | 'sparkle' | (string & {}) | number;

export interface PartOptions { bone?: BoneRef; color: ColorRef; surf?: SurfName | Partial<Surface>; glass?: boolean; skin?: SkinFn; shade?: ArrayLike<number> }
export interface ChainOptions {
  /** Shape memory 0..1: how strongly the chain returns to its authored shape. */ stiffness?: number;
  damping?: number; gravity?: number;
  /** Air drag against the mascot's motion (streams scarves backward at speed). */ wind?: number;
  /** Idle flutter amplitude (rig m/s²). */ flutter?: number;
}
export interface Chain { name: string; bones: number[]; skin: SkinFn }
/** Procedural motion on a custom bone. Emote prop channels p0..p2 map onto bone rotation/position/scale. */
export interface BoneMotion {
  spin?: readonly ['x' | 'y' | 'z', number];
  sway?: readonly ['x' | 'y' | 'z', number, number, number?];
  /** Emote channel → target: rx/ry/rz (rad per unit), px/py/pz (m per unit), s/sy (scale per unit). */
  ch?: ReadonlyArray<readonly ['p0' | 'p1' | 'p2' | 'hl' | 'spin', 'rx' | 'ry' | 'rz' | 'px' | 'py' | 'pz' | 's' | 'sy', number]>;
  /** Secondary motion: rotation lag behind body movement (hats, antennae). */ jiggle?: number;
  /** Spin speed multiplier while boosting. */ boostSpin?: number;
  /** Scale oscillation: [axis ('y' or 's' for uniform), amplitude, frequency (rad/s), phase]; faster with speed. */
  pulse?: readonly ['y' | 's', number, number, number?];
}

export interface AccessoryKit {
  readonly lod: 0 | 1 | 2;
  readonly def: CharacterDef;
  /** Pick a value by LOD (segments, detail). */
  q(l0: number, l1: number, l2: number): number;
  add(geo: THREE.BufferGeometry, o: PartOptions): void;
  /** Create (or fetch on later LOD passes) a custom bone at a rig-space rest position. */
  bone(name: string, parent: BoneRef, at: V3): number;
  /** A verlet chain of bones through `pts` (rig space). Geometry skinned with `chain.skin` bends along it. */
  chain(name: string, parent: BoneRef, pts: ReadonlyArray<V3>, o?: ChainOptions): Chain;
  motion(bone: BoneRef, m: BoneMotion): void;
  color(c: ColorRef): THREE.Color;
}
export type Accessory = (k: AccessoryKit) => void;

export interface CharacterDef {
  id: string;
  palette: MascotPalette;
  eyeStyle: 'slot' | 'led' | 'visor';
  accessories: ReadonlyArray<Accessory>;
  emotes?: Partial<Record<EmoteSlot, EmoteBuilder>>;
  /** Resting pitch (rad, + leans forward): posture as personality. */
  tiltBias?: number;
  body?: { voxel?: boolean; surf?: SurfName | Partial<Surface>; legs?: boolean };
  eyes?: { z?: number; y?: number; dx?: number; scale?: number; glow?: number; color?: ColorRef; hide?: 'L' | 'R' };
  sparkle?: { color?: ColorRef; at?: V3; bone?: BoneRef; size?: number; hidden?: boolean; /** rad/s, default 0.6; 0 = pinned badge */ spin?: number };
  /** Quantize animation to this many fps (Pixel's 8-bit motion). */
  stepped?: number;
}

export interface MascotInstance {
  root: THREE.Group;
  anchors: Record<AnchorName, THREE.Object3D>;
  setPose(p: MascotPose, dt: number): void;
  playEmote(e: EmoteSlot): void;
  setEyes(expr: EyeExpr): void;
  setTeamTint(c: THREE.Color | null): void;
  setLod(l: 0 | 1 | 2): void;
  dispose(): void;
  // ---- additive extensions (v1) ----
  readonly id: string;
  /** Distance-based LOD switching (default on, 25 m / 70 m). */
  setAutoLod(on: boolean, d1?: number, d2?: number): void;
  /** Garage palette skin: body colour (shade derived, 12% darker) or null for the character default. */
  setBodyColor(hex: string | null): void;
  /** Currently playing emote, if any. */
  readonly emote: EmoteSlot | null;
  /** Emote FX cue hook (confetti, sparkle, stars, smoke…); `at` is the head_top anchor. */
  onFx: ((name: string, at: THREE.Object3D) => void) | null;
  /** 'drive' (hands on the handlebar, default) or 'stand' (arms relaxed; portraits, character select). */
  setStance(s: 'drive' | 'stand'): void;
  /** Per-LOD triangle and draw counts (contact sheets, budget tests). */
  stats(): { tris: [number, number, number]; draws: [number, number, number] };
}

// ------------------------------------------------------------------------------------------------------------
const BASE_BONES = ['root', 'body', 'head', 'armL', 'armR', 'eyes', 'sparkle'] as const;
const B_ROOT = 0, B_BODY = 1, B_HEAD = 2, B_ARML = 3, B_ARMR = 4, B_EYES = 5, B_SPARK = 6;
const IDENTITY = new THREE.Matrix4();

interface ChainSim {
  bones: THREE.Bone[]; parent: THREE.Bone; n: number;
  rest: Float32Array; p: Float32Array; pp: Float32Array; len: Float32Array; restDir: THREE.Vector3[];
  stiffness: number; damping: number; gravity: number; wind: number; flutter: number; phase: number;
}
interface Motion { bone: THREE.Bone; m: BoneMotion; rest: THREE.Vector3; jx: number; jz: number; jvx: number; jvz: number; spinA: number }

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const damp = (a: number, b: number, k: number, dt: number): number => a + (b - a) * (1 - Math.exp(-k * dt));
const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const wrapAngle = (a: number): number => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

const compiledCache = new Map<string, CompiledEmote>();
function emoteFor(def: CharacterDef, slot: EmoteSlot): CompiledEmote {
  const key = `${def.id}:${slot}`;
  let c = compiledCache.get(key);
  if (!c) {
    const base = BASE_EMOTES[slot];
    const b = def.emotes?.[slot];
    const spec: EmoteSpec = b ? b(base) : base;
    c = compileEmote(key, def.stepped && !spec.stepped ? { ...spec, stepped: def.stepped } : spec);
    compiledCache.set(key, c);
  }
  return c;
}

/** Build a mascot. The optional second argument (MaterialLibrary in the B10 contract) is accepted for compatibility. */
export function buildMascot(def: CharacterDef, _lib?: unknown): MascotInstance {
  const pal = def.palette;
  const root = new THREE.Group();
  root.name = `mascot:${def.id}`;

  // ---------- skeleton ----------
  const bones: THREE.Bone[] = [];
  const boneIndex = new Map<string, number>();
  const restWorld: THREE.Vector3[] = [];
  const mkBone = (name: string, parent: number, at: V3): number => {
    const existing = boneIndex.get(name);
    if (existing !== undefined) return existing;
    const b = new THREE.Bone(); b.name = name;
    const w = new THREE.Vector3(at[0], at[1], at[2]);
    if (parent >= 0) { b.position.copy(w).sub(restWorld[parent]!); bones[parent]!.add(b); } else { b.position.copy(w); root.add(b); }
    bones.push(b); restWorld.push(w);
    boneIndex.set(name, bones.length - 1);
    return bones.length - 1;
  };
  mkBone('root', -1, [0, 0, 0]);
  mkBone('body', B_ROOT, [0, -0.3, 0]);
  mkBone('head', B_BODY, [0, RIG.headTop, 0]);
  mkBone('armL', B_BODY, [RIG.arm.pivotX, RIG.arm.y, 0]);
  mkBone('armR', B_BODY, [-RIG.arm.pivotX, RIG.arm.y, 0]);
  const eyeZ = def.eyes?.z ?? RIG.eye.z + 0.004, eyeY = def.eyes?.y ?? RIG.eye.y;
  mkBone('eyes', B_BODY, [0, eyeY, eyeZ]);
  const spAt = def.sparkle?.at ?? [0, RIG.sparkle.y, 0];
  const resolveBone = (r: BoneRef | undefined): number => {
    if (r === undefined) return B_BODY;
    if (typeof r === 'number') return r;
    const i = boneIndex.get(r);
    if (i === undefined) { if (import.meta.env?.DEV) console.warn(`[mascot] ${def.id}: unknown bone ${r}`); return B_BODY; }
    return i;
  };

  const colorOf = (c: ColorRef): { col: THREE.Color; slot: number } => {
    if (c in SLOT) {
      const slot = SLOT[c as keyof typeof SLOT];
      const hex = c === 'sparkle' ? '#F9F8F4' : pal[c as keyof MascotPalette];
      return { col: new THREE.Color(hex), slot };
    }
    if (c in NAMED) return { col: new THREE.Color(NAMED[c as keyof typeof NAMED]), slot: FIXED_SLOT };
    return { col: new THREE.Color(c), slot: FIXED_SLOT };
  };

  const chains: ChainSim[] = [];
  const chainByName = new Map<string, Chain>();
  const motions: Motion[] = [];
  const motionByBone = new Set<number>();

  // ---------- geometry per LOD ----------
  const vinylGeo: (THREE.BufferGeometry | null)[] = [], glassGeo: (THREE.BufferGeometry | null)[] = [];
  const bodySurf: SurfName | Partial<Surface> = def.body?.surf ?? (def.body?.voxel ? 'voxel' : 'vinyl');
  // darken toward the underside: "shade = body darkened 12%" as a soft vertex gradient (reads as baked AO)
  const underShade = (g: THREE.BufferGeometry, y0: number, y1: number, amt = 0.14): Float32Array => {
    const P = g.attributes.position!; const s = new Float32Array(P.count);
    for (let i = 0; i < P.count; i++) { const t = clamp((y0 - P.getY(i)) / (y0 - y1), 0, 1); s[i] = 1 - amt * t * t * (3 - 2 * t); }
    return s;
  };

  for (const lod of [0, 1, 2] as const) {
    const vinyl = new ModelBuilder();
    const glass = new ModelBuilder();
    const kit: AccessoryKit = {
      lod, def,
      q: (a, b, c) => (lod === 0 ? a : lod === 1 ? b : c),
      add(geo, o) {
        const { col, slot } = colorOf(o.color);
        (o.glass ? glass : vinyl).add(geo, { color: col, slot, bone: resolveBone(o.bone), skin: o.skin, surf: o.surf ?? 'vinyl', shade: o.shade });
      },
      bone: (name, parent, at) => mkBone(name, resolveBone(parent), at),
      chain(name, parent, pts, o = {}) {
        const have = chainByName.get(name);
        if (have) return have;
        const pi = resolveBone(parent);
        const idx: number[] = pts.map((p, i) => mkBone(`${name}${i}`, pi, p));
        const n = pts.length;
        const rest = new Float32Array(n * 3);
        const pb = restWorld[pi]!;
        pts.forEach((p, i) => { rest[i * 3] = p[0] - pb.x; rest[i * 3 + 1] = p[1] - pb.y; rest[i * 3 + 2] = p[2] - pb.z; });
        const len = new Float32Array(n), restDir: THREE.Vector3[] = [];
        for (let i = 0; i < n; i++) {
          const j = Math.min(n - 1, i + 1), k = j === i ? i - 1 : i;
          const d = new THREE.Vector3(rest[j * 3]! - rest[k * 3]!, rest[j * 3 + 1]! - rest[k * 3 + 1]!, rest[j * 3 + 2]! - rest[k * 3 + 2]!);
          if (i > 0) len[i] = Math.hypot(rest[i * 3]! - rest[(i - 1) * 3]!, rest[i * 3 + 1]! - rest[(i - 1) * 3 + 1]!, rest[i * 3 + 2]! - rest[(i - 1) * 3 + 2]!);
          restDir.push(d.normalize());
        }
        chains.push({
          bones: idx.map((i) => bones[i]!), parent: bones[pi]!, n, rest, p: rest.slice(), pp: rest.slice(), len, restDir,
          stiffness: o.stiffness ?? 0.35, damping: o.damping ?? 0.08, gravity: o.gravity ?? 1, wind: o.wind ?? 1, flutter: o.flutter ?? 1,
          phase: (hash(def.id + name) % 1000) / 159,
        });
        // skin: project the vertex onto the polyline, blend the two nearest joints
        const P = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
        const tmp = new THREE.Vector3(), seg = new THREE.Vector3();
        const skin: SkinFn = (x, y, z, out) => {
          let best = Infinity, bi = 0, bt = 0;
          for (let i = 0; i + 1 < P.length; i++) {
            seg.subVectors(P[i + 1]!, P[i]!); tmp.set(x, y, z).sub(P[i]!);
            const t = clamp(tmp.dot(seg) / Math.max(1e-6, seg.lengthSq()), 0, 1);
            const d = tmp.addScaledVector(seg, -t).lengthSq();
            if (d < best) { best = d; bi = i; bt = t; }
          }
          out.i0 = idx[bi]!; out.i1 = idx[bi + 1] ?? idx[bi]!; out.w0 = 1 - bt; out.w1 = bt;
        };
        const c: Chain = { name, bones: idx, skin };
        chainByName.set(name, c);
        return c;
      },
      motion(b, m) {
        const bi = resolveBone(b);
        if (motionByBone.has(bi)) return;
        motionByBone.add(bi);
        motions.push({ bone: bones[bi]!, m, rest: bones[bi]!.position.clone(), jx: 0, jz: 0, jvx: 0, jvz: 0, spinA: 0 });
      },
      color: (c) => colorOf(c).col,
    };

    // ---- body ----
    const B = RIG.body;
    if (def.body?.voxel) buildVoxelBody(kit, lod);
    else {
      // LOD1 is 25–70 m away (≈ 12 px tall): one arc segment reads exactly like the rounded block there
      const g = rbox(B.w, B.h, B.d, B.r, kit.q(3, 1, 1));
      kit.add(g, { color: 'body', surf: bodySurf, shade: underShade(g, 0.05, -0.34) });
      // arms: 2×2 stubs, pivot at the inner face
      for (const s of [1, -1]) {
        const a = lod > 0 ? box(RIG.arm.w, RIG.arm.h, RIG.arm.d) : rbox(RIG.arm.w, RIG.arm.h, RIG.arm.d, RIG.arm.r, 1);
        a.translate(s * RIG.arm.x, RIG.arm.y, 0);
        kit.add(a, { color: 'body', surf: bodySurf, bone: s > 0 ? 'armL' : 'armR' });
      }
      // legs: tiny and usually hidden in the cockpit, so plain boxes (12 tris each)
      if (lod < 2 && def.body?.legs !== false) {
        for (const lx of RIG.leg.xs) kit.add(box(RIG.leg.w, RIG.leg.h, RIG.leg.d).translate(lx, RIG.leg.y, 0), { color: 'shade', surf: bodySurf });
      }
    }
    // LOD2: eyes baked into the vinyl mesh (one draw at distance)
    if (lod === 2 && def.eyeStyle !== 'visor') {
      for (const s of [1, -1]) {
        if ((def.eyes?.hide === 'L' && s > 0) || (def.eyes?.hide === 'R' && s < 0)) continue;
        const e = new THREE.PlaneGeometry(RIG.eye.w * (def.eyes?.scale ?? 1), RIG.eye.h * (def.eyes?.scale ?? 1));
        e.translate(s * (def.eyes?.dx ?? RIG.eye.x), eyeY, eyeZ);
        kit.add(e, { color: def.eyes?.color ?? 'eye', surf: def.eyeStyle === 'led' ? 'glow' : 'eye', bone: 'eyes' });
      }
    }
    for (const acc of def.accessories) {
      try { acc(kit); } catch (e) { if (import.meta.env?.DEV) console.warn(`[mascot] ${def.id}: accessory failed`, e); }
    }
    // ---- the parametric sparkle (never the Claude logo); after accessories so it can ride their bones ----
    if (!def.sparkle?.hidden) {
      if (lod === 0) mkBone('sparkle', resolveBone(def.sparkle?.bone ?? 'head'), spAt);
      const g = sparkle((def.sparkle?.size ?? 1) * RIG.sparkle.r, lod === 0 ? 0 : 2, 7 + (hash(def.id) % 5));
      g.translate(spAt[0], spAt[1], spAt[2]);
      const sc = def.sparkle?.color ?? 'sparkle';
      const { col } = colorOf(sc);
      vinyl.add(g, { color: col, slot: SLOT.sparkle, bone: boneIndex.get('sparkle') ?? B_HEAD, surf: { ...SURF.gloss, glow: 0.25 } });
    }
    vinylGeo[lod] = vinyl.build();
    glassGeo[lod] = glass.build();
  }
  // sparkle bone may not exist when hidden
  const sparkBone = boneIndex.has('sparkle') ? bones[boneIndex.get('sparkle')!]! : null;

  // ---------- eyes (shared by LOD0 and LOD1) ----------
  const eyeCol = colorOf(def.eyes?.color ?? 'eye').col;
  const eyeGlow = def.eyes?.glow ?? (def.eyeStyle === 'led' ? 2.4 : def.eyeStyle === 'visor' ? 1.8 : 0);
  const eyeLed = def.eyeStyle === 'led' ? 1 : 0;
  const eb = new ModelBuilder({ uv: true, extras: { eyeFx: 2 } });
  const eyeSides: number[] = [];
  for (const s of [1, -1]) {
    if ((def.eyes?.hide === 'L' && s > 0) || (def.eyes?.hide === 'R' && s < 0)) continue;
    const sc = def.eyes?.scale ?? 1;
    const q = new THREE.PlaneGeometry(EYE_QUAD.w * sc, EYE_QUAD.h * sc);
    q.translate(s * (def.eyes?.dx ?? RIG.eye.x), eyeY, eyeZ);
    eb.add(q, { color: eyeCol, bone: B_EYES, surf: 'eye', extra: { eyeFx: [eyeGlow, eyeLed] } });
    eyeSides.push(s);
  }
  const eyeGeo = eb.build();
  const eyeUv = eyeGeo ? (eyeGeo.attributes.uv as THREE.BufferAttribute) : null;
  const setEyeCells = (cellL: EyeCell, cellR: EyeCell, mirrorR: boolean): void => {
    if (!eyeUv) return;
    const a = eyeUv.array as Float32Array;
    eyeSides.forEach((s, qi) => {
      const cell = EYE_CELLS[s > 0 ? cellL : cellR];
      const col = cell % EYE_ATLAS.cols, row = Math.floor(cell / EYE_ATLAS.cols);
      // PlaneGeometry vertex order: (0,1) (1,1) (0,0) (1,0) in uv
      for (let k = 0; k < 4; k++) {
        let u = k % 2; const v = k < 2 ? 1 : 0;
        if (s < 0 && mirrorR) u = 1 - u;
        a[(qi * 4 + k) * 2] = (col + u) / EYE_ATLAS.cols;
        a[(qi * 4 + k) * 2 + 1] = 1 - (row + 1 - v) / EYE_ATLAS.rows;
      }
    });
    eyeUv.needsUpdate = true;
  };

  // ---------- meshes + LOD ----------
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const lod = new THREE.LOD();
  lod.name = 'mascotLod';
  const levels: THREE.Group[] = [];
  const draws: [number, number, number] = [0, 0, 0];
  const mk = (g: THREE.BufferGeometry, m: THREE.Material, level: THREE.Group, shadow: boolean): THREE.SkinnedMesh => {
    const mesh = new THREE.SkinnedMesh(g, m);
    mesh.bind(skeleton, IDENTITY);
    mesh.castShadow = shadow;
    mesh.receiveShadow = false;
    // generous fixed bounds: the pose never leaves ~1.6 body widths around the origin
    const bs = g.boundingSphere!.clone(); bs.radius += 0.6; mesh.boundingSphere = bs;
    level.add(mesh);
    return mesh;
  };
  for (const l of [0, 1, 2] as const) {
    const level = new THREE.Group(); level.name = `lod${l}`;
    if (vinylGeo[l]) { mk(vinylGeo[l]!, mascotVinyl(), level, true); draws[l]++; }
    if (l < 2 && eyeGeo) { mk(eyeGeo, mascotEyes(), level, false); draws[l]++; }
    if (glassGeo[l]) { mk(glassGeo[l]!, mascotGlass(), level, false); draws[l]++; }
    levels.push(level);
  }
  lod.addLevel(levels[0]!, 0, 0);
  lod.addLevel(levels[1]!, 25, 0.1);
  lod.addLevel(levels[2]!, 70, 0.1);
  root.add(lod);

  // ---------- anchors ----------
  const anchor = (bi: number, at: V3, name: string): THREE.Object3D => {
    const o = new THREE.Object3D(); o.name = name;
    o.position.set(at[0], at[1], at[2]).sub(restWorld[bi]!);
    bones[bi]!.add(o);
    return o;
  };
  const A = RIG.anchors;
  const anchors: Record<AnchorName, THREE.Object3D> = {
    head_top: anchor(B_HEAD, A.head_top, 'head_top'), back: anchor(B_BODY, A.back, 'back'),
    hand_L: anchor(B_ARML, A.hand_L, 'hand_L'), hand_R: anchor(B_ARMR, A.hand_R, 'hand_R'), face_front: anchor(B_BODY, A.face_front, 'face_front'),
  };

  // ---------- animation state (all scalars; no per-frame allocation) ----------
  const rng0 = hash(def.id);
  let seed = rng0 || 1;
  const rnd = (): number => { seed = (Math.imul(seed, 48271) >>> 0) % 2147483647; return seed / 2147483647; };
  const body = bones[B_BODY]!, head = bones[B_HEAD]!, armL = bones[B_ARML]!, armR = bones[B_ARMR]!, eyes = bones[B_EYES]!;
  const bodyRest = body.position.clone(), headRest = head.position.clone(), eyesRest = eyes.position.clone();
  body.rotation.order = 'YXZ';
  armL.rotation.order = 'YZX'; armR.rotation.order = 'YZX';
  let t = 0, steerS = 0, leanS = 0, driftS = 0, boostS = 0, airS = 0, hitS = 0, speedS = 0;
  let wasAir = false, landT = 0, blinkT = 1.5 + rnd() * 3, blinkDur = 0;
  let manualExpr: EyeExpr = 'open', shownKey = '';
  let stand = 0, standTarget = 0;
  let emote: CompiledEmote | null = null, emoteSlot: EmoteSlot | null = null, emoteT = 0, eyeCursor = 0, fxCursor = 0, emoteExpr: EyeExpr | null = null;
  const ch: Record<Channel, number> = { y: 0, rx: 0, ry: 0, rz: 0, sq: 0, s: 0, hx: 0, hy: 0, hz: 0, hl: 0, spin: 0, p0: 0, p1: 0, p2: 0, aLr: 0, aLf: 0, aRr: 0, aRf: 0 };
  const chOn: Record<Channel, number> = { ...ch };
  let prevRx = 0, prevRz = 0;
  // world motion (for verlet wind / inertia)
  const lastW = new THREE.Vector3(), velW = new THREE.Vector3(), accW = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  let haveLast = false;

  const show = (expr: EyeExpr): void => {
    let L: EyeCell = expr, R: EyeCell = expr, mirror = false;
    if (expr === 'angry') mirror = true;
    if (expr === 'wink') { L = 'open'; R = 'wink'; }
    const key = `${L}|${R}`;
    if (key === shownKey) return;
    shownKey = key;
    setEyeCells(L, R, mirror);
  };
  show('open');

  /** One verlet step for one chain, forces already in the chain parent's frame (rig units). */
  const integrate = (c: ChainSim, dt: number, wx: number, wy: number, wz: number, gx: number, gy: number, gz: number): void => {
    const { p, pp, rest, len, n } = c;
    const fl = c.flutter * (0.6 + speedS * 2.4);
    const k = 1 - c.damping, dt2 = dt * dt;
    const mem = c.stiffness * Math.min(1, dt * 60) * 0.12;
    for (let i = 1; i < n; i++) {
      const o = i * 3;
      const vx = p[o]! - pp[o]!, vy = p[o + 1]! - pp[o + 1]!, vz = p[o + 2]! - pp[o + 2]!;
      const f = Math.sin(t * 9 + i * 1.3 + c.phase) * fl;
      pp[o] = p[o]!; pp[o + 1] = p[o + 1]!; pp[o + 2] = p[o + 2]!;
      p[o] = p[o]! + vx * k + (gx * c.gravity + wx * c.wind + f * 0.6) * dt2;
      p[o + 1] = p[o + 1]! + vy * k + (gy * c.gravity + wy * c.wind + f) * dt2;
      p[o + 2] = p[o + 2]! + vz * k + (gz * c.gravity + wz * c.wind) * dt2;
      // shape memory toward the authored rest pose (stronger toward the tip so tails keep their silhouette)
      const s = mem * (0.35 + (0.65 * i) / n);
      p[o] = p[o]! + (rest[o]! - p[o]!) * s; p[o + 1] = p[o + 1]! + (rest[o + 1]! - p[o + 1]!) * s; p[o + 2] = p[o + 2]! + (rest[o + 2]! - p[o + 2]!) * s;
    }
    for (let it = 0; it < 3; it++) {
      p[0] = rest[0]!; p[1] = rest[1]!; p[2] = rest[2]!;
      for (let i = 1; i < n; i++) {
        const o = i * 3, q = o - 3;
        const dx = p[o]! - p[q]!, dy = p[o + 1]! - p[q + 1]!, dz = p[o + 2]! - p[q + 2]!;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const corr = (d - len[i]!) / d;
        p[o] = p[o]! - dx * corr; p[o + 1] = p[o + 1]! - dy * corr; p[o + 2] = p[o + 2]! - dz * corr;
      }
    }
  };
  const writeChainBones = (c: ChainSim): void => {
    const { p, n } = c;
    for (let i = 0; i < n; i++) {
      const b = c.bones[i]!, o = i * 3;
      b.position.set(p[o]!, p[o + 1]!, p[o + 2]!);
      const j = i + 1 < n ? i + 1 : i, k = j === i ? i - 1 : i;
      tmpV.set(p[j * 3]! - p[k * 3]!, p[j * 3 + 1]! - p[k * 3 + 1]!, p[j * 3 + 2]! - p[k * 3 + 2]!).normalize();
      b.quaternion.setFromUnitVectors(c.restDir[i]!, tmpV);
    }
  };
  const sparkRest = sparkBone ? sparkBone.position.clone() : null;
  const sparkSpin = def.sparkle?.spin ?? 0.6;

  const inst: MascotInstance = {
    root, anchors, id: def.id, onFx: null,
    get emote() { return emoteSlot; },
    setPose(p: MascotPose, dtIn: number): void {
      const dt = clamp(dtIn, 0, 0.1);
      t += dt;
      const tq = def.stepped ? Math.floor(t * def.stepped) / def.stepped : t;
      steerS = damp(steerS, clamp(p.steer, -1, 1), 10, dt);
      leanS = damp(leanS, clamp(p.lean, -1, 1), 6, dt);
      driftS = damp(driftS, p.drifting ? 1 : 0, 6, dt);
      boostS = damp(boostS, p.boosting ? 1 : 0, 8, dt);
      airS = damp(airS, p.airborne ? 1 : 0, 10, dt);
      hitS = damp(hitS, p.hit, p.hit ? 12 : 3, dt);
      speedS = damp(speedS, clamp(p.speed01, 0, 1), 4, dt);
      if (wasAir && !p.airborne) landT = 0.15;
      wasAir = p.airborne;
      landT = Math.max(0, landT - dt);

      // ---- emote sampling ----
      for (const k in ch) { ch[k as Channel] = 0; chOn[k as Channel] = 0; }
      let w = 0;
      if (emote) {
        emoteT += dt;
        const spec = emote.spec;
        const et = spec.stepped ? Math.floor(emoteT * spec.stepped) / spec.stepped : emoteT;
        w = Math.min(1, et / 0.18) * Math.min(1, Math.max(0, (spec.duration - et) / 0.25));
        w = w * w * (3 - 2 * w);
        for (let i = 0; i < emote.channels.length; i++) {
          const c = emote.channels[i]!;
          let v = emote.interps[i]!.evaluate(Math.min(et, spec.duration))[0]!;
          if (c === 'rx' || c === 'ry' || c === 'rz' || c === 'hx' || c === 'hy' || c === 'hz') v = wrapAngle(v);
          ch[c] = v; chOn[c] = 1;
        }
        const ev = spec.eyes;
        while (ev && eyeCursor < ev.length && ev[eyeCursor]![0] <= et) { emoteExpr = ev[eyeCursor]![1]; eyeCursor++; }
        const fx = spec.fx;
        while (fx && fxCursor < fx.length && fx[fxCursor]![0] <= et) { inst.onFx?.(fx[fxCursor]![1], anchors.head_top); fxCursor++; }
        if (emoteT >= spec.duration) { emote = null; emoteSlot = null; emoteExpr = null; }
      }

      // ---- body ----
      const bob = Math.abs(Math.sin(2.2 * tq * (1 + speedS * 2.2))) * 0.032 * (0.25 + speedS) + Math.sin(tq * 41) * 0.004 * speedS;
      const breathe = Math.sin(tq * 1.9 + rng0) * 0.013;
      let sy = 1 + breathe, sxz = 1 - breathe * 0.5;
      if (landT > 0) { const k = Math.sin((landT / 0.15) * Math.PI); sy -= 0.08 * k; sxz += 0.08 * k; }
      sy += 0.04 * boostS - 0.05 * airS; sxz += -0.02 * boostS + 0.02 * airS;
      sy += ch.sq * w; sxz -= ch.sq * 0.5 * w;
      const hitWob = hitS > 0.01 ? hitS : 0;
      body.position.set(bodyRest.x, bodyRest.y + bob * (1 - w) + ch.y * w + airS * 0.03, bodyRest.z);
      const rx = (def.tiltBias ?? 0) - 0.1 * boostS + 0.1 * airS + hitWob * 0.12 * Math.sin(tq * 13) + ch.rx * w;
      const ry = (-steerS * 0.17 - driftS * steerS * 0.12) * (1 - w) + hitWob * 0.3 * Math.sin(tq * 11) + ch.ry * w;
      const rz = (steerS * 0.14 * (1 - driftS) - clamp(leanS * 0.5, -0.21, 0.21) * driftS) * (1 - w) + hitWob * 0.26 * Math.sin(tq * 17) + ch.rz * w;
      body.rotation.set(rx, ry, rz);
      const us = Math.max(0.001, 1 + ch.s * w);
      body.scale.set(sxz * us, sy * us, sxz * us);

      // ---- arms: hands on the handlebar, following the steering (or relaxed when standing) ----
      stand = damp(stand, standTarget, 6, dt);
      const dv = 1 - stand, sway = Math.sin(tq * 1.9 + rng0) * 0.04 * stand;
      let rL = (-0.12 + steerS * 0.28) * dv - 0.42 * stand + sway + airS * 0.75 + hitWob * 0.5 * Math.sin(tq * 14);
      let rR = (-0.12 - steerS * 0.28) * dv - 0.42 * stand + sway + airS * 0.75 + hitWob * 0.5 * Math.sin(tq * 14 + 2);
      let fL = (0.5 + steerS * 0.18 - boostS * 0.18) * dv + 0.08 * stand + airS * 0.2;
      let fR = (0.5 - steerS * 0.18 - boostS * 0.18) * dv + 0.08 * stand + airS * 0.2;
      if (chOn.aLr) rL += (ch.aLr - rL) * w;
      if (chOn.aRr) rR += (ch.aRr - rR) * w;
      if (chOn.aLf) fL += (ch.aLf - fL) * w;
      if (chOn.aRf) fR += (ch.aRf - fR) * w;
      armL.rotation.set(0, -fL, rL);
      armR.rotation.set(0, fR, -rR);

      // ---- head accessory: jiggle from body motion + emote ----
      const dRx = rx - prevRx, dRz = rz - prevRz; prevRx = rx; prevRz = rz;
      head.position.set(headRest.x, headRest.y + ch.hl * w, headRest.z);
      head.rotation.set(-dRx * 2.5 + ch.hx * w, ch.hy * w, -dRz * 2.5 + ch.hz * w);

      // ---- eyes: expression, blink, look into the turn ----
      eyes.position.set(eyesRest.x - steerS * 0.02 * (1 - w), eyesRest.y, eyesRest.z);
      let expr: EyeExpr = emoteExpr ?? (manualExpr !== 'open' ? manualExpr : p.hit ? 'dizzy' : boostS > 0.5 ? 'angry' : 'open');
      blinkT -= dt;
      if (blinkT < 0) { blinkDur = 0.12; blinkT = 2 + rnd() * 4; }
      let eyeSy = 1;
      if (blinkDur > 0) { blinkDur -= dt; if (expr === 'open' || expr === 'angry' || expr === 'star') eyeSy = 0.15; }
      if (expr === 'blink') { expr = 'open'; eyeSy = 0.15; }
      show(expr);
      eyes.scale.set(1, eyeSy, 1);

      // ---- sparkle: slow spin (0.6 rad/s), faster with speed ----
      if (sparkBone && sparkRest && sparkSpin > 0) { sparkBone.rotation.y += dt * (sparkSpin + speedS * 3 + ch.spin * w); sparkBone.position.y = sparkRest.y + Math.sin(tq * 1.7) * 0.012; }

      // ---- custom bone motions ----
      for (const mo of motions) {
        const b = mo.bone, m = mo.m;
        b.position.copy(mo.rest);
        b.rotation.set(0, 0, 0);
        b.scale.set(1, 1, 1);
        if (m.spin) { mo.spinA += dt * m.spin[1] * (1 + (m.boostSpin ?? 0) * boostS); b.rotation[m.spin[0]] = mo.spinA; }
        if (m.sway) b.rotation[m.sway[0]] += Math.sin(tq * m.sway[2] + (m.sway[3] ?? 0)) * m.sway[1];
        if (m.pulse) {
          const k = 1 + m.pulse[1] * (0.5 + 0.5 * Math.sin(tq * m.pulse[2] * (1 + speedS + boostS) + (m.pulse[3] ?? 0)));
          if (m.pulse[0] === 's') b.scale.setScalar(k); else b.scale.y = k;
        }
        if (m.jiggle) {
          // damped spring on two axes, kicked by body rotation changes
          mo.jvx += (-mo.jx * 90 - mo.jvx * 9) * dt - dRx * m.jiggle * 40;
          mo.jvz += (-mo.jz * 90 - mo.jvz * 9) * dt - dRz * m.jiggle * 40;
          mo.jx += mo.jvx * dt; mo.jz += mo.jvz * dt;
          b.rotation.x += clamp(mo.jx, -0.5, 0.5); b.rotation.z += clamp(mo.jz, -0.5, 0.5);
        }
        if (m.ch) for (const [src, dst, gain] of m.ch) {
          const v = ch[src] * w * gain;
          if (!v) continue;
          if (dst === 'rx') b.rotation.x += v; else if (dst === 'ry') b.rotation.y += v; else if (dst === 'rz') b.rotation.z += v;
          else if (dst === 'px') b.position.x += v; else if (dst === 'py') b.position.y += v; else if (dst === 'pz') b.position.z += v;
          else if (dst === 's') b.scale.multiplyScalar(Math.max(0.001, 1 + v)); else if (dst === 'sy') b.scale.y *= Math.max(0.001, 1 + v);
        }
      }

      // ---- verlet chains: gravity + air drag + inertia, expressed in each chain parent's frame ----
      if (chains.length && dt > 0) {
        const mw = root.matrixWorld.elements;
        const scale = Math.max(1e-3, Math.hypot(mw[0]!, mw[1]!, mw[2]!));
        tmpV.set(mw[12]!, mw[13]!, mw[14]!);
        if (haveLast) {
          tmpV2.subVectors(tmpV, lastW).divideScalar(dt * scale);
          if (tmpV2.lengthSq() > 400 * 400) tmpV2.set(0, 0, 0); // teleport (respawn)
          accW.subVectors(tmpV2, velW).divideScalar(dt).clampLength(0, 150);
          velW.lerp(tmpV2, 0.5);
        }
        lastW.copy(tmpV); haveLast = true;
        const sub = dt > 1 / 45 ? 2 : 1, h = dt / sub;
        for (const c of chains) {
          c.parent.getWorldQuaternion(tmpQ).invert();
          tmpV.copy(velW).multiplyScalar(-1.1).addScaledVector(accW, -0.25).applyQuaternion(tmpQ);
          tmpV2.set(0, -16, 0).applyQuaternion(tmpQ);
          for (let s = 0; s < sub; s++) integrate(c, h, tmpV.x, tmpV.y, tmpV.z, tmpV2.x, tmpV2.y, tmpV2.z);
          writeChainBones(c);
        }
      }
    },
    playEmote(e: EmoteSlot): void {
      emote = emoteFor(def, e); emoteSlot = e; emoteT = 0; eyeCursor = 0; fxCursor = 0; emoteExpr = null;
    },
    setEyes(e: EyeExpr): void { manualExpr = e; },
    setStance(st: 'drive' | 'stand'): void { standTarget = st === 'stand' ? 1 : 0; if (t === 0) stand = standTarget; },
    setTeamTint(c: THREE.Color | null): void {
      for (const g of vinylGeo) if (g) recolorSlot(g, SLOT.sparkle, c);
    },
    setLod(l: 0 | 1 | 2): void {
      lod.autoUpdate = false;
      levels.forEach((g, i) => { g.visible = i === l; });
    },
    setAutoLod(on: boolean, d1?: number, d2?: number): void {
      lod.autoUpdate = on;
      if (d1 !== undefined) lod.levels[1]!.distance = d1;
      if (d2 !== undefined) lod.levels[2]!.distance = d2;
    },
    setBodyColor(hex: string | null): void {
      const c = hex ? new THREE.Color(hex) : null;
      const s = c ? c.clone().multiplyScalar(0.88) : null;
      for (const g of vinylGeo) if (g) { recolorSlot(g, SLOT.body, c); recolorSlot(g, SLOT.shade, s); }
    },
    stats() {
      return { tris: [triCount(vinylGeo[0]) + triCount(eyeGeo) + triCount(glassGeo[0]), triCount(vinylGeo[1]) + triCount(eyeGeo) + triCount(glassGeo[1]), triCount(vinylGeo[2]) + triCount(glassGeo[2])], draws: [...draws] };
    },
    dispose(): void {
      for (const g of [...vinylGeo, ...glassGeo, eyeGeo]) g?.dispose();
      skeleton.dispose();
      root.removeFromParent();
    },
  };

  return inst;
}

/** Pixel: a true voxel body on the 12×8×6 grid (cells 1/12 m), chamfered corners, 8-bit shade steps. */
function buildVoxelBody(k: AccessoryKit, lod: 0 | 1 | 2): void {
  const c = 1 / 12;
  if (lod === 2) {
    k.add(box(1, 8 * c, 6 * c), { color: 'body', surf: 'voxel' });
    for (const s of [1, -1]) k.add(box(2 * c, 2 * c, 3 * c).translate(s * 7 * c, RIG.arm.y, 0), { color: 'body', surf: 'voxel', bone: s > 0 ? 'armL' : 'armR' });
    return;
  }
  const corner = (x: number, y: number, z: number): boolean => {
    const ex = x === 0 || x === 11, ey = y === 7, ez = z === 0 || z === 5;
    return (ex && ez) || (ex && ey) || (ey && ez && lod === 0 && (x < 1 || x > 10));
  };
  const shade = (x: number, y: number, z: number, face: number): number => {
    const row = y >= 6 ? 1.07 : y <= 1 ? 0.86 : 1;
    const dither = (x + y + z) % 2 === 0 ? 1 : 0.965;
    const f = face === 2 ? 1.04 : face === 3 ? 0.8 : 1;
    return row * dither * f;
  };
  const { geo, shades } = voxels(12, 8, 6, c, (x, y, z) => !corner(x, y, z), shade);
  k.add(geo, { color: 'body', surf: 'voxel', shade: shades });
  for (const s of [1, -1]) {
    const a = voxels(2, 2, 3, c, () => true, (_x, y, _z, f) => (f === 2 ? 1.05 : y === 0 ? 0.9 : 1));
    a.geo.translate(s * 7 * c, RIG.arm.y, 0);
    k.add(a.geo, { color: 'body', surf: 'voxel', bone: s > 0 ? 'armL' : 'armR', shade: a.shades });
  }
  if (lod === 0) for (const cx of [1, 3, 8, 10]) {
    const l = voxels(1, 2, 1, c, () => true);
    l.geo.translate((cx - 5.5) * c, -4 * c - c, 0);
    k.add(l.geo, { color: 'shade', surf: 'voxel' });
  }
}
