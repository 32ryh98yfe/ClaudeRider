// Kart construction kit. Every kart is ONE skinned paint mesh (chassis, wheels, handlebar, pipes, all liveried parts)
// plus ONE skinned overlay mesh (numbers, stickers, glass, underglow) sharing a small skeleton:
//   root ─┬─ chassis (visual suspension: bob, roll, pitch) ─┬─ steer (handlebar, rotates about its column)
//         │                                                  ├─ seat anchor, exhaust anchors, flare bones, custom bones
//         ├─ knuckle FL/FR (steer yaw) ── wheel FL/FR (spin)
//         └─ wheel RL/RR (spin)
// Frame: +Z forward, +Y up, +X left; ground at y = 0.
import * as THREE from 'three/webgpu';
import { ModelBuilder, FIXED_SLOT, recolorSlot, rewriteSlotAttr, triCount, type Surface, type SurfName } from '../mascot/builder.ts';
import { lathe, cyl, tube, rbox, box, torus, type V3 } from '../mascot/shapes.ts';
import { RIG } from '../mascot/rig.ts';
import { kartPaint, kartOverlay, cellUv, type KartCell } from './materials.ts';
import type { KartArchetype, KartBodyDef, KartModel, KartUpdate, Livery } from './types.ts';

export type { V3 };
export const KB = { root: 0, chassis: 1, knFL: 2, knFR: 3, wFL: 4, wFR: 5, wRL: 6, wRR: 7, steer: 8 } as const;
export type KBoneRef = keyof typeof KB | (string & {}) | number;

/** Livery slots (partId): primary / secondary are solid, paint gets the livery pattern, number/detail are contrast. */
export const KSLOT = { primary: 0, secondary: 1, paint: 2, number: 3 } as const;
const FIXED = {
  trim: '#2B2B2E', dark: '#1D1C1F', metal: '#9A9CA4', chrome: '#C8CDD5', rubber: '#2B2B31', seat: '#3A3A40', ivory: '#FAF9F5',
  brass: '#C9A14A', gold: '#E9B949', copper: '#B87333', glass: '#BFE6FF', red: '#E5484D', amber: '#FFB347', white: '#FFFFFF',
} as const;
export type KColor = 'primary' | 'secondary' | 'paint' | 'number' | keyof typeof FIXED | `#${string}`;

export interface KPartOpts { bone?: KBoneRef; color: KColor; surf?: SurfName | Partial<Surface> }
export interface OverlayOpts { bone?: KBoneRef; color: KColor; cell: KartCell; opacity?: number; glow?: number; /** unlit black (contact shadow) */ shadow?: boolean }
export type Facing = 'x+' | 'x-' | 'y+' | 'y-' | 'z+' | 'z-';
export interface WheelOpts { r: number; w: number; style?: 'kart' | 'balloon' | 'slick' | 'spoke' | 'pod' | 'neon' | 'brass' | 'gold'; rim?: KColor; hubCell?: KartCell | null; tyre?: KColor }
export interface KartMotion {
  spin?: readonly ['x' | 'y' | 'z', number];
  /** Scale pulse while boosting: [axis or 's', amount]. */
  boost?: readonly ['x' | 'y' | 'z' | 's', number];
  /** Hidden (scale 0) until boosting, then grows to 1 (flares, thruster cores). */
  flare?: boolean;
  sway?: readonly ['x' | 'y' | 'z', number, number];
}

export interface KartKit {
  readonly lod: 0 | 1 | 2;
  readonly livery: Livery;
  readonly dims: KartShape['dims'];
  q(a: number, b: number, c: number): number;
  /** LOD-aware rounded box: 2 arc segments at LOD0 (3 for hero panels), 1 at LOD1, a plain box at LOD2. */
  rb(w: number, h: number, d: number, r: number, hero?: boolean): THREE.BufferGeometry;
  /** LOD-aware tube; returns null at LOD2 for thin tubes (radius < 0.03), which are invisible past 70 m. */
  tb(pts: ReadonlyArray<V3>, radius: number, keepFar?: boolean): THREE.BufferGeometry | null;
  add(geo: THREE.BufferGeometry | null, o: KPartOpts): void;
  /** Overlay geometry with 0..1 uvs, remapped into an atlas cell. */
  overlay(geo: THREE.BufferGeometry, o: OverlayOpts): void;
  /** A flat decal quad facing `facing`, w × h, centred at `at`. `rot` spins it in its plane. */
  decal(at: V3, facing: Facing, w: number, h: number, o: OverlayOpts & { rot?: number }): void;
  /** The race number (two digits when ≥ 10) as decals. */
  number(at: V3, facing: Facing, h: number, o: { color: KColor; bone?: KBoneRef; glow?: number }): void;
  bone(name: string, parent: KBoneRef, at: V3): number;
  motion(bone: KBoneRef, m: KartMotion): void;
  /** Wheel i (0 FL, 1 FR, 2 RL, 3 RR) centred at `at` (x sign gives the side). */
  wheel(i: 0 | 1 | 2 | 3, at: V3, o: WheelOpts): void;
  /** Swept-back handlebar placed from the seat so Clawd's arm stubs hold the grips below the eyes. */
  handlebar(o?: { color?: KColor; grip?: KColor; style?: 'bar' | 'yoke' | 'tiller'; dashZ?: number; dashY?: number }): void;
  /** Exhaust pipe opening at `at` pointing −Z (flames attach here). */
  exhaust(at: V3, o?: { r?: number; len?: number; style?: 'pipe' | 'stack' | 'thruster' | 'none'; color?: KColor; tilt?: number }): void;
}

export interface KartShape {
  id: string;
  archetype: KartArchetype;
  dims: { length: number; width: number; height: number; wheelR: number };
  livery: Livery;
  /** Mascot body centre (the rig is seated at scale 0.62). Eyes end up ≈ seat.y + 0.04 above the road. */
  seat: V3;
  build(k: KartKit): void;
  /** Optional per-frame hook for kart-specific animation (reads the smoothed state). */
  animate?: (bones: Record<string, THREE.Bone>, s: KartAnimState, dt: number) => void;
}
export interface KartAnimState { t: number; speed01: number; steer: number; drift: number; boost: number; air: number; spin: number }

const IDENTITY = new THREE.Matrix4();
const damp = (a: number, b: number, k: number, dt: number): number => a + (b - a) * (1 - Math.exp(-k * dt));
const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);

function patternValue(l: Livery, splitY: number): number {
  const pid = Math.max(0, Math.min(11, Math.round(l.pattern)));
  if (pid === 0) return 0;
  return pid + 1 + clamp(splitY / 2, 0, 0.99);
}

/** Build a KartBodyDef from a declarative shape. */
export function defineKart(shape: KartShape): KartBodyDef {
  return { id: shape.id, archetype: shape.archetype, dims: shape.dims, livery: shape.livery, build: (l) => buildKart(shape, l) };
}

function buildKart(shape: KartShape, livery0: Livery): KartModel {
  let livery = { ...livery0 };
  const root = new THREE.Group();
  root.name = `kart:${shape.id}`;
  const bones: THREE.Bone[] = [];
  const restWorld: THREE.Vector3[] = [];
  const byName = new Map<string, number>();
  const mkBone = (name: string, parent: number, at: V3): number => {
    const have = byName.get(name);
    if (have !== undefined) return have;
    const b = new THREE.Bone(); b.name = name;
    const w = new THREE.Vector3(at[0], at[1], at[2]);
    if (parent >= 0) { b.position.copy(w).sub(restWorld[parent]!); bones[parent]!.add(b); } else { b.position.copy(w); root.add(b); }
    bones.push(b); restWorld.push(w); byName.set(name, bones.length - 1);
    return bones.length - 1;
  };
  const D = shape.dims;
  mkBone('root', -1, [0, 0, 0]);
  mkBone('chassis', KB.root, [0, D.wheelR, 0]);
  // wheel bones get their real positions when the shape declares wheels (placeholders here keep indices fixed)
  mkBone('knFL', KB.root, [D.width / 2 - 0.1, D.wheelR, D.length * 0.32]);
  mkBone('knFR', KB.root, [-(D.width / 2 - 0.1), D.wheelR, D.length * 0.32]);
  mkBone('wFL', KB.knFL, [D.width / 2 - 0.1, D.wheelR, D.length * 0.32]);
  mkBone('wFR', KB.knFR, [-(D.width / 2 - 0.1), D.wheelR, D.length * 0.32]);
  mkBone('wRL', KB.root, [D.width / 2 - 0.1, D.wheelR, -D.length * 0.32]);
  mkBone('wRR', KB.root, [-(D.width / 2 - 0.1), D.wheelR, -D.length * 0.32]);
  const S = shape.seat;
  const colTop: V3 = [0, S[1] - 0.14, S[2] + 0.33];
  mkBone('steer', KB.chassis, colTop);
  mkBone('shadow', KB.root, [0, 0, 0]);
  const resolve = (r: KBoneRef | undefined): number => {
    if (r === undefined) return KB.chassis;
    if (typeof r === 'number') return r;
    if (r in KB) return KB[r as keyof typeof KB];
    const i = byName.get(r);
    if (i === undefined) { if (import.meta.env?.DEV) console.warn(`[kart] ${shape.id}: unknown bone ${r}`); return KB.chassis; }
    return i;
  };
  const splitY = D.height * 0.5;
  const colorOf = (c: KColor, l: Livery): { col: THREE.Color; slot: number; paint: boolean } => {
    if (c === 'primary') return { col: new THREE.Color(l.primary), slot: KSLOT.primary, paint: false };
    if (c === 'secondary') return { col: new THREE.Color(l.secondary), slot: KSLOT.secondary, paint: false };
    if (c === 'paint') return { col: new THREE.Color(l.primary), slot: KSLOT.paint, paint: true };
    if (c === 'number') return { col: new THREE.Color(l.secondary), slot: KSLOT.number, paint: false };
    if (c in FIXED) return { col: new THREE.Color(FIXED[c as keyof typeof FIXED]), slot: FIXED_SLOT, paint: false };
    return { col: new THREE.Color(c), slot: FIXED_SLOT, paint: false };
  };

  const motions: Array<{ bone: THREE.Bone; m: KartMotion; rest: THREE.Vector3; a: number }> = [];
  const motionSet = new Set<number>();
  const exhaustAnchors: THREE.Object3D[] = [];
  const wheelR = [D.wheelR, D.wheelR, D.wheelR, D.wheelR];
  const paintGeo: (THREE.BufferGeometry | null)[] = [], overGeo: (THREE.BufferGeometry | null)[] = [];
  const numberQuads: Array<{ lod: number; start: number; count: number }> = [];

  for (const lod of [0, 1, 2] as const) {
    const pb = new ModelBuilder({ extras: { pcol: 3, pat: 1 } });
    const ob = new ModelBuilder({ uv: true });
    const pcol = new THREE.Color(livery.secondary);
    const patV = patternValue(livery, splitY);
    let exCount = 0;
    const kit: KartKit = {
      lod, livery, dims: D,
      q: (a, b, c) => (lod === 0 ? a : lod === 1 ? b : c),
      rb: (w, h, d, r, hero) => (lod === 2 ? box(w, h, d) : rbox(w, h, d, r, lod === 0 ? (hero ? 3 : 2) : 1)),
      tb(pts, radius, keepFar) {
        if (lod === 2 && radius < 0.03 && !keepFar) return null;
        let len = 0;
        for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1], pts[i]![2] - pts[i - 1]![2]);
        const per = lod === 0 ? 12 : lod === 1 ? 5 : 3;
        return tube(pts, radius, Math.max(3, Math.round(len * per)), lod === 0 ? 6 : lod === 1 ? 4 : 3);
      },
      add(geo, o) {
        if (!geo) return;
        const { col, slot, paint } = colorOf(o.color, livery);
        pb.add(geo, { color: col, slot, bone: resolve(o.bone), surf: o.surf ?? (paint || slot <= KSLOT.secondary ? 'paint' : 'plastic'), extra: { pcol: [pcol.r, pcol.g, pcol.b], pat: [paint ? patV : 0] } });
      },
      overlay(geo, o) {
        if (lod === 2) { geo.dispose(); return; }
        const [u0, v0, u1, v1] = cellUv(o.cell);
        const U = geo.attributes.uv!;
        // inset half a texel so mips never bleed the neighbouring cell
        const e = 1 / 2048;
        for (let i = 0; i < U.count; i++) U.setXY(i, u0 + e + (u1 - u0 - 2 * e) * U.getX(i), v0 + e + (v1 - v0 - 2 * e) * U.getY(i));
        const { col, slot } = colorOf(o.color, livery);
        ob.add(geo, { color: col, slot, bone: resolve(o.bone), surf: { rough: o.opacity ?? 1, metal: 0.3, glow: o.glow ?? 0, coat: o.shadow ? 1 : 0 } });
      },
      decal(at, facing, w, h, o) {
        const g = new THREE.PlaneGeometry(w, h);
        if (o.rot) g.rotateZ(o.rot);
        switch (facing) {
          case 'x+': g.rotateY(Math.PI / 2); break;
          case 'x-': g.rotateY(-Math.PI / 2); break;
          case 'y+': g.rotateX(-Math.PI / 2); break;
          case 'y-': g.rotateX(Math.PI / 2); break;
          case 'z-': g.rotateY(Math.PI); break;
          default: break;
        }
        g.translate(at[0], at[1], at[2]);
        kit.overlay(g, o);
      },
      number(at, facing, h, o) {
        if (lod === 2) return;
        const n = Math.max(0, Math.min(99, Math.round(livery.number)));
        const digits = n >= 10 ? [Math.floor(n / 10), n % 10] : [n];
        const w = h * 0.62;
        // lay digits along the facing plane's horizontal axis
        const horiz: V3 = facing === 'x+' ? [0, 0, -1] : facing === 'x-' ? [0, 0, 1] : facing === 'z-' ? [-1, 0, 0] : [1, 0, 0];
        const start = ob.tris;
        digits.forEach((d, i) => {
          const off = (i - (digits.length - 1) / 2) * w * 0.86;
          kit.decal([at[0] + horiz[0] * off, at[1] + horiz[1] * off, at[2] + horiz[2] * off], facing, w, h, { color: o.color, cell: d, bone: o.bone, glow: o.glow });
        });
        numberQuads.push({ lod, start, count: ob.tris - start });
      },
      bone: (name, parent, at) => mkBone(name, resolve(parent), at),
      motion(b, m) {
        const bi = resolve(b);
        if (motionSet.has(bi)) return;
        motionSet.add(bi);
        motions.push({ bone: bones[bi]!, m, rest: bones[bi]!.position.clone(), a: 0 });
      },
      wheel(i, at, o) {
        const names = ['FL', 'FR', 'RL', 'RR'] as const;
        const wb = KB[`w${names[i]}` as 'wFL'];
        if (lod === 0) {
          wheelR[i] = o.r;
          // move the knuckle + wheel bones to the declared hub
          if (i < 2) { const kn = i === 0 ? KB.knFL : KB.knFR; bones[kn]!.position.set(at[0], at[1], at[2]); restWorld[kn]!.set(at[0], at[1], at[2]); bones[wb]!.position.set(0, 0, 0); restWorld[wb]!.set(at[0], at[1], at[2]); }
          else { bones[wb]!.position.set(at[0], at[1], at[2]); restWorld[wb]!.set(at[0], at[1], at[2]); }
        }
        const side = Math.sign(at[0]) || 1;
        for (const g of wheelGeometry(o, lod)) { orientWheel(g.geo, side); g.geo.translate(at[0], at[1], at[2]); kit.add(g.geo, { color: g.color ?? (o.tyre ?? 'rubber'), bone: wb, surf: g.surf }); }
        // a small dark pad where each tyre meets the road (the big contact shadow alone reads as a blob under the kart)
        if (lod < 2) kit.decal([at[0], 0.034, at[2]], 'y+', o.w * 1.9, o.r * 2.1, { color: '#14151c', cell: 'shadow', opacity: 0.55, bone: 'shadow', shadow: true });
        if (o.hubCell !== null && lod === 0) kit.decal([at[0] + side * (o.w / 2 + 0.004), at[1], at[2]], side > 0 ? 'x+' : 'x-', o.r * 0.9, o.r * 0.9, { color: o.style === 'neon' ? 'secondary' : 'ivory', cell: o.hubCell ?? 'sparkle', bone: wb, glow: o.style === 'neon' ? 2.5 : 0 });
      },
      handlebar(o = {}) {
        const sc = RIG.seatScale;
        const grip = (sx: number): V3 => [S[0] + sx * 0.62 * sc, S[1] - 0.1 * sc, S[2] + 0.16 * sc];
        const gl = grip(1), gr = grip(-1);
        const top = colTop;
        const style = o.style ?? 'bar';
        const barR = style === 'tiller' ? 0.02 : 0.018;
        const pts: V3[] = style === 'yoke'
          ? [[gl[0], gl[1], gl[2]], [gl[0] * 0.8, top[1] + 0.02, top[2] - 0.03], [0, top[1], top[2]], [gr[0] * 0.8, top[1] + 0.02, top[2] - 0.03], [gr[0], gr[1], gr[2]]]
          : [[gl[0], gl[1], gl[2]], [gl[0] * 0.92, gl[1] - 0.02, gl[2] + 0.1], [gl[0] * 0.55, top[1] + 0.005, top[2] - 0.01], [0, top[1], top[2]], [gr[0] * 0.55, top[1] + 0.005, top[2] - 0.01], [gr[0] * 0.92, gr[1] - 0.02, gr[2] + 0.1], [gr[0], gr[1], gr[2]]];
        kit.add(kit.tb(pts, barR, true), { color: o.color ?? 'chrome', bone: 'steer', surf: 'chrome' });
        if (lod < 2) for (const g of [gl, gr]) {
          const c = cyl(0.03, 0.03, 0.1, kit.q(10, 6, 4)); c.rotateZ(Math.PI / 2); c.translate(g[0], g[1], g[2]);
          kit.add(c, { color: o.grip ?? 'rubber', bone: 'steer', surf: 'rubber' });
        }
        // hub + column down into the dash
        const hub = cyl(0.045, 0.05, 0.05, kit.q(12, 8, 4)); hub.rotateX(-0.9); hub.translate(top[0], top[1], top[2]);
        kit.add(hub, { color: o.grip ?? 'trim', bone: 'steer', surf: 'plastic' });
        const dz = o.dashZ ?? top[2] + 0.2, dy = o.dashY ?? top[1] - 0.16;
        kit.add(kit.tb([[0, top[1] - 0.01, top[2]], [0, (top[1] + dy) / 2, (top[2] + dz) / 2], [0, dy, dz]], 0.02), { color: 'trim', surf: 'metal' });
      },
      exhaust(at, o = {}) {
        const r = o.r ?? 0.045, len = o.len ?? 0.18, style = o.style ?? 'pipe';
        const idx = exCount++;
        const flare = `flare${idx}`;
        if (lod === 0) {
          const a = new THREE.Object3D(); a.name = `exhaust${idx}`;
          a.position.set(at[0], at[1], at[2]).sub(restWorld[KB.chassis]!);
          bones[KB.chassis]!.add(a);
          exhaustAnchors.push(a);
          mkBone(flare, KB.chassis, at);
          kit.motion(flare, { flare: true });
        }
        if (style === 'none') return;
        const seg = kit.q(14, 8, 5);
        if (style === 'stack') {
          const g = cyl(r, r * 0.8, len, seg, true); g.translate(at[0], at[1] - len / 2, at[2]);
          kit.add(g, { color: o.color ?? 'chrome', surf: 'chrome' });
          if (lod < 2) { const lip = torus(r, r * 0.22, 6, seg); lip.rotateX(Math.PI / 2); lip.translate(at[0], at[1], at[2]); kit.add(lip, { color: o.color ?? 'chrome', surf: 'chrome' }); }
        } else {
          const g = cyl(r, r * 0.9, len, seg, true); g.rotateX(Math.PI / 2); g.translate(at[0], at[1], at[2] + len / 2);
          kit.add(g, { color: o.color ?? 'chrome', surf: style === 'thruster' ? 'metal' : 'chrome' });
          if (lod < 2) {
            const lip = torus(r, r * 0.2, 6, seg); lip.translate(at[0], at[1], at[2]); kit.add(lip, { color: o.color ?? 'chrome', surf: 'chrome' });
            const inner = cyl(r * 0.8, r * 0.8, 0.01, seg); inner.rotateX(Math.PI / 2); inner.translate(at[0], at[1], at[2] + 0.03); kit.add(inner, { color: 'dark', surf: 'matte' });
          }
        }
        // boost flare: an emissive disc at the mouth that only appears while boosting
        if (lod < 2) {
          const f = cyl(r * 0.78, r * 0.78, 0.012, seg);
          if (style === 'stack') f.translate(at[0], at[1] - 0.02, at[2]); else { f.rotateX(Math.PI / 2); f.translate(at[0], at[1], at[2] + 0.015); }
          kit.add(f, { color: style === 'thruster' ? '#7FF6FF' : '#FFB35A', bone: flare, surf: 'neon' });
        }
      },
    };
    shape.build(kit);
    // contact shadow: a soft dark ellipse on the road under the chassis. The sun shadow of a 1.5 m kart is a few
    // texels wide and drifts with the sun angle; this keeps every kart planted at any distance (LOD0/1) and shrinks
    // while airborne (the `shadow` bone, see update).
    kit.decal([0, 0.03, -0.02], 'y+', D.width * 1.3, D.length * 1.22, { color: '#1A1C28', cell: 'shadow', opacity: 0.62, bone: 'shadow', shadow: true });
    paintGeo[lod] = pb.build();
    overGeo[lod] = ob.build();
  }

  // ---------- meshes ----------
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const lodObj = new THREE.LOD(); lodObj.name = 'kartLod';
  const levels: THREE.Group[] = [];
  const draws: [number, number, number] = [0, 0, 0];
  for (const l of [0, 1, 2] as const) {
    const level = new THREE.Group(); level.name = `lod${l}`;
    const add = (g: THREE.BufferGeometry | null, m: THREE.Material, shadow: boolean): void => {
      if (!g) return;
      const mesh = new THREE.SkinnedMesh(g, m);
      mesh.bind(skeleton, IDENTITY);
      mesh.castShadow = shadow; mesh.receiveShadow = shadow;
      const bs = g.boundingSphere!.clone(); bs.radius += 0.25; mesh.boundingSphere = bs;
      level.add(mesh);
      draws[l]++;
    };
    add(paintGeo[l]!, kartPaint(), true);
    add(overGeo[l]!, kartOverlay(), false);
    levels.push(level);
  }
  lodObj.addLevel(levels[0]!, 0, 0);
  lodObj.addLevel(levels[1]!, 25, 0.1);
  lodObj.addLevel(levels[2]!, 70, 0.1);
  root.add(lodObj);

  const seat = new THREE.Object3D(); seat.name = 'seat';
  seat.position.set(S[0], S[1], S[2]).sub(restWorld[KB.chassis]!);
  bones[KB.chassis]!.add(seat);
  const B = (n: keyof typeof KB): THREE.Bone => bones[KB[n]]!;
  const wheels = [B('wFL'), B('wFR'), B('wRL'), B('wRR')];
  const steering = B('steer');
  const named: Record<string, THREE.Bone> = {};
  for (const [n, i] of byName) named[n] = bones[i]!;

  // steering column axis (in the chassis frame): from the hub down toward the dash
  const colAxis = new THREE.Vector3(0, 0.62, -0.78).normalize();
  const chassis = B('chassis'), chassisRest = chassis.position.clone();
  const shadowBone = bones[byName.get('shadow')!]!;
  const knRest = [B('knFL').position.clone(), B('knFR').position.clone()];
  const st: KartAnimState = { t: 0, speed01: 0, steer: 0, drift: 0, boost: 0, air: 0, spin: 0 };
  let y = 0, vy = 0, roll = 0, vroll = 0, pitch = 0, vpitch = 0, lastBoost = 0, kick = 0;
  const spins = [0, 0, 0, 0];

  const model: KartModel = {
    root, wheels, steering, seat, exhausts: exhaustAnchors, id: shape.id,
    update(s: KartUpdate, dtIn: number): void {
      const dt = clamp(dtIn, 0, 0.1);
      st.t += dt;
      st.speed01 = damp(st.speed01, clamp(s.speed / 40, 0, 1), 5, dt);
      st.steer = damp(st.steer, clamp(s.steer, -1, 1), 12, dt);
      st.drift = damp(st.drift, s.drift ? 1 : 0, 8, dt);
      const boosting = s.boost > 0 ? 1 : 0;
      st.boost = damp(st.boost, boosting, boosting ? 14 : 5, dt);
      st.air = damp(st.air, s.airborne ? 1 : 0, 10, dt);
      if (boosting && !lastBoost) kick = 1;
      lastBoost = boosting;
      kick = Math.max(0, kick - dt * 3);
      // wheels: spin scaled per radius; front knuckles steer ±25°, counter-steer in drifts
      for (let i = 0; i < 4; i++) { spins[i]! += s.wheelSpin * (0.22 / wheelR[i]!) * dt; wheels[i]!.rotation.x = spins[i]!; }
      st.spin = spins[2]!;
      const yaw = -st.steer * 0.44 * (1 - st.drift) + st.steer * 0.32 * st.drift;
      for (let i = 0; i < 2; i++) {
        const kn = i === 0 ? B('knFL') : B('knFR');
        kn.rotation.y = yaw;
        kn.position.y = knRest[i]!.y - st.air * 0.03;
      }
      // visual suspension (critically damped springs; travel ≈ 0.04 m)
      const bump = (Math.sin(st.t * 17.3) * 0.006 + Math.sin(st.t * 29.1 + 1.3) * 0.003) * st.speed01;
      const ty = -0.012 * st.speed01 + bump + st.air * 0.02 - kick * 0.015;
      const troll = (-st.steer * 0.035) * (1 - st.drift) - st.steer * 0.07 * st.drift;
      const tpitch = -0.045 * st.boost - kick * 0.05 + st.air * 0.03;
      // substep at ≤ 1/60 s: explicit springs diverge when C·dt > 2 (a 2–10 fps frame would explode them)
      const K = 260, C = 2 * Math.sqrt(K) * 0.8;
      const n = Math.max(1, Math.ceil(dt * 60)), h = dt / n;
      for (let i = 0; i < n; i++) {
        vy += (K * (ty - y) - C * vy) * h; y += vy * h;
        vroll += (K * (troll - roll) - C * vroll) * h; roll += vroll * h;
        vpitch += (K * (tpitch - pitch) - C * vpitch) * h; pitch += vpitch * h;
      }
      // the contact shadow fades out as the kart leaves the ground (the real sun shadow takes over in the air)
      shadowBone.scale.setScalar(Math.max(0.001, 1 - 0.85 * st.air));
      chassis.position.set(chassisRest.x, chassisRest.y + clamp(y, -0.04, 0.04), chassisRest.z);
      chassis.rotation.set(pitch, 0, roll);
      steering.quaternion.setFromAxisAngle(colAxis, -st.steer * 0.55);
      for (const mo of motions) {
        const b = mo.bone, m = mo.m;
        b.position.copy(mo.rest); b.rotation.set(0, 0, 0); b.scale.set(1, 1, 1);
        if (m.flare) { const f = st.boost > 0.02 ? st.boost * (1 + 0.18 * Math.sin(st.t * 38)) + kick * 0.4 : 0.001; b.scale.setScalar(f); }
        if (m.spin) { mo.a += m.spin[1] * dt * (1 + st.boost); b.rotation[m.spin[0]] = mo.a; }
        if (m.sway) b.rotation[m.sway[0]] = Math.sin(st.t * m.sway[2]) * m.sway[1] * (0.3 + st.speed01);
        if (m.boost) { const k = 1 + m.boost[1] * (st.boost * (0.8 + 0.2 * Math.sin(st.t * 30)) + kick * 0.5); if (m.boost[0] === 's') b.scale.setScalar(k); else b.scale[m.boost[0]] = k; }
      }
      shape.animate?.(named, st, dt);
    },
    setLivery(l: Livery): void {
      livery = { ...l };
      const p = new THREE.Color(l.primary), s2 = new THREE.Color(l.secondary);
      const patV = patternValue(l, splitY);
      for (const g of paintGeo) {
        if (!g) continue;
        recolorSlot(g, KSLOT.primary, p); recolorSlot(g, KSLOT.paint, p); recolorSlot(g, KSLOT.secondary, s2); recolorSlot(g, KSLOT.number, s2);
        for (const slot of [KSLOT.primary, KSLOT.secondary, KSLOT.paint, KSLOT.number]) rewriteSlotAttr(g, slot, 'pcol', [s2.r, s2.g, s2.b]);
        rewriteSlotAttr(g, KSLOT.paint, 'pat', [patV]);
      }
      for (const g of overGeo) if (g) { recolorSlot(g, KSLOT.primary, p); recolorSlot(g, KSLOT.secondary, s2); recolorSlot(g, KSLOT.number, s2); }
      if (Math.round(l.number) !== Math.round(livery0.number)) { /* digits are baked per build; a number change needs a rebuild (garage only) */ }
    },
    setLod(l: 0 | 1 | 2): void { lodObj.autoUpdate = false; levels.forEach((g, i) => { g.visible = i === l; }); },
    setAutoLod(on: boolean, d1?: number, d2?: number): void {
      lodObj.autoUpdate = on;
      if (d1 !== undefined) lodObj.levels[1]!.distance = d1;
      if (d2 !== undefined) lodObj.levels[2]!.distance = d2;
    },
    stats() {
      return { tris: [0, 1, 2].map((l) => triCount(paintGeo[l]) + triCount(overGeo[l])) as [number, number, number], draws: [...draws] };
    },
    dispose(): void {
      for (const g of [...paintGeo, ...overGeo]) g?.dispose();
      skeleton.dispose();
      root.removeFromParent();
    },
  };
  void numberQuads;
  return model;
}

/**
 * Extruded side profile: `outline` is [z, y] (kart space), extruded symmetrically across X by `width`.
 * Bevelled at LOD0 only (the bevel catches the rim light; at distance it is sub-pixel).
 */
export function sideProfile(k: KartKit, outline: ReadonlyArray<readonly [number, number]>, width: number, bevel = 0.02): THREE.BufferGeometry {
  const b = k.lod === 0 ? bevel : 0;
  const sh = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, width - b * 2), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: k.q(6, 3, 2) });
  g.translate(0, 0, -(width - b * 2) / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

/** Top-view plan outline [x, z] extruded vertically from y0 to y1 (wings, plates, trays). */
export function planPlate(k: KartKit, outline: ReadonlyArray<readonly [number, number]>, y0: number, y1: number, bevel = 0.01): THREE.BufferGeometry {
  const b = k.lod === 0 ? Math.min(bevel, (y1 - y0) / 3) : 0;
  const sh = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, y1 - y0 - b * 2), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: k.q(6, 3, 2) });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + b, 0);
  return g;
}

// ---------- wheels ----------
interface WheelPart { geo: THREE.BufferGeometry; color?: KColor; surf: SurfName }
/** Tyre + rim around the Y axis (oriented later so the axle is X). */
function wheelGeometry(o: WheelOpts, lod: 0 | 1 | 2): WheelPart[] {
  const r = o.r, w = o.w, style = o.style ?? 'kart';
  const parts: WheelPart[] = [];
  const h = w / 2;
  // far away a wheel is a closed rubber puck (48 triangles)
  if (lod === 2) { parts.push({ geo: lathe([[0, -h], [r * 0.96, -h], [r, 0], [r * 0.96, h], [0, h]], 6), color: o.tyre ?? 'rubber', surf: 'rubber' }); return parts; }
  const seg = lod === 0 ? 20 : 12;
  const bal = style === 'balloon' ? 0.42 : style === 'slick' ? 0.12 : 0.26; // shoulder roundness
  const ri = r * (style === 'balloon' ? 0.52 : style === 'pod' ? 0.7 : 0.62);
  const prof: Array<[number, number]> = lod === 1
    ? [[ri, -h], [r - r * bal * 0.4, -h], [r, -h * (1 - bal)], [r, h * (1 - bal)], [r - r * bal * 0.4, h], [ri, h]]
    : [[ri, -h], [r - r * bal * 0.5, -h], [r - r * bal * 0.12, -h * 0.82], [r, -h * (1 - bal)], [r, h * (1 - bal)], [r - r * bal * 0.12, h * 0.82], [r - r * bal * 0.5, h], [ri, h]];
  parts.push({ geo: lathe(prof, seg), color: o.tyre ?? 'rubber', surf: 'rubber' });
  if (lod === 0 && style !== 'pod' && style !== 'slick') {
    // tread blocks: a ring of shallow lugs
    const n = 12;
    for (let i = 0; i < n; i++) {
      const b = new THREE.BoxGeometry(r * 0.2, w * 0.7, r * 0.1);
      b.translate(0, 0, r - r * 0.02); b.rotateY((i / n) * Math.PI * 2);
      parts.push({ geo: b, color: o.tyre ?? 'rubber', surf: 'rubber' });
    }
  }
  const rimCol: KColor = o.rim ?? 'secondary';
  const rimSurf: SurfName = style === 'brass' ? 'metal' : style === 'gold' ? 'gold' : style === 'neon' ? 'neon' : 'paint';
  const rimR = ri * 1.02;
  parts.push({ geo: cyl(rimR, rimR, w * 0.86, seg), color: rimCol, surf: rimSurf });
  if (lod === 0) {
    parts.push({ geo: cyl(ri * 0.45, ri * 0.45, w * 0.96, 10), color: style === 'neon' ? 'dark' : 'chrome', surf: style === 'neon' ? 'matte' : 'chrome' });
    if (style === 'spoke' || style === 'brass' || style === 'gold') {
      for (let i = 0; i < 6; i++) { const sp = new THREE.BoxGeometry(ri * 1.7, w * 0.9, ri * 0.14); sp.rotateY((i / 6) * Math.PI); parts.push({ geo: sp, color: style === 'spoke' ? 'chrome' : rimCol, surf: style === 'spoke' ? 'chrome' : rimSurf }); }
    }
  }
  if (style === 'neon') parts.push({ geo: torus(ri * 0.82, ri * 0.08, 4, seg).rotateX(Math.PI / 2), color: 'secondary', surf: 'neon' });
  return parts;
}
function orientWheel(g: THREE.BufferGeometry, side: number): void {
  g.rotateZ(Math.PI / 2);
  if (side < 0) g.rotateY(Math.PI);
}
