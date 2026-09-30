// Shared accessory helpers for character definitions (build time only).
import * as THREE from 'three/webgpu';
import type { AccessoryKit, V3 } from '../mascot/rig.ts';
import type { SkinFn, SkinOut } from '../mascot/builder.ts';
import { box, rbox, ribbon } from '../mascot/shapes.ts';

/**
 * Bend a geometry that stands along +Y (from y0) so its tip curls toward `dir` (e.g. [0, 0, -1] = backward):
 * the bend angle ramps from 0 at `from` to `angle` at `to` (both heights relative to y0). Returns the bent centre-line
 * points (for a verlet chain that follows the same curve).
 */
export function bendUp(g: THREE.BufferGeometry, y0: number, from: number, to: number, angle: number, dir: V3 = [0, 0, -1], samples = 5): V3[] {
  const D = new THREE.Vector3(dir[0], 0, dir[2]).normalize();
  const axis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), D).normalize(); // rotation axis
  const steps = 64, H = to + 0.5;
  // integrate the centre line
  const cs: THREE.Vector3[] = [], qs: THREE.Quaternion[] = [];
  const c = new THREE.Vector3(0, y0, 0), q = new THREE.Quaternion();
  const theta = (h: number): number => { const t = THREE.MathUtils.clamp((h - from) / Math.max(1e-6, to - from), 0, 1); return angle * t * t * (3 - 2 * t); };
  for (let i = 0; i <= steps; i++) {
    const h = (i / steps) * H;
    cs.push(c.clone()); qs.push(q.clone());
    const dh = H / steps;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    c.addScaledVector(up, dh);
    q.setFromAxisAngle(axis, theta(h + dh));
  }
  const P = g.attributes.position!;
  const v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    const h = P.getY(i) - y0;
    const k = Math.min(steps, Math.max(0, Math.round((h / H) * steps)));
    v.set(P.getX(i), 0, P.getZ(i)).applyQuaternion(qs[k]!).add(cs[k]!);
    if (h < 0) v.y += h; // below the base: untouched offset
    P.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const pts: V3[] = [];
  for (let s = 0; s <= samples; s++) { const k = Math.round((s / samples) * Math.min(steps, Math.round((to / H) * steps))); const p = cs[k]!; pts.push([p.x, p.y, p.z]); }
  return pts;
}

/** 7-segment digit boxes in the XY plane (centred), for helmet numbers and LED readouts without textures. */
export function sevenSeg(d: number, h: number, t: number): THREE.BufferGeometry[] {
  const S = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f][d] ?? 0;
  const w = h * 0.55, out: THREE.BufferGeometry[] = [];
  const seg = (on: number, x: number, y: number, horiz: boolean): void => { if (S & on) out.push(box(horiz ? w - t : t, horiz ? t : h / 2 - t, t * 0.6).translate(x, y, 0)); };
  seg(1, 0, h / 2, true); seg(2, w / 2, h / 4, false); seg(4, w / 2, -h / 4, false); seg(8, 0, -h / 2, true);
  seg(16, -w / 2, -h / 4, false); seg(32, -w / 2, h / 4, false); seg(64, 0, 0, true);
  return out;
}

/** Two verlet scarf/ribbon tails from a knot at `from`, flowing along `dir` (rig space). */
export function tails(k: AccessoryKit, name: string, from: V3, dir: V3, len: number, width: number, color: Parameters<AccessoryKit['add']>[1]['color'], o: { spread?: number; droop?: number; count?: number; thick?: number } = {}): void {
  const n = o.count ?? 2, spread = o.spread ?? 0.1, droop = o.droop ?? 0.35;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * spread, l = len * (1 - i * 0.18);
    const pts: V3[] = [];
    for (let j = 0; j < 5; j++) {
      const t = j / 4;
      pts.push([from[0] + off + dir[0] * l * t + off * t * 0.6, from[1] + dir[1] * l * t - droop * l * t * t, from[2] + dir[2] * l * t]);
    }
    const ch = k.chain(`${name}${i}`, 'body', pts, { stiffness: 0.45, wind: 1, flutter: 1.3 });
    k.add(ribbon(pts, width, o.thick ?? 0.026, k.q(12, 6, 3), [1, 0, 0], 0.75), { color, surf: 'soft', skin: ch.skin });
  }
}

/** Arm sleeve (a slightly larger stub over the arm) with an optional cuff colour. */
export function sleeves(k: AccessoryKit, color: Parameters<AccessoryKit['add']>[1]['color'], cuff?: Parameters<AccessoryKit['add']>[1]['color']): void {
  for (const s of [1, -1]) {
    const bone = s > 0 ? 'armL' : 'armR';
    k.add((k.lod === 2 ? box(0.16, 0.23, 0.29) : rbox(0.16, 0.23, 0.29, 0.07, 1)).translate(s * 0.55, -0.08, 0), { color, bone, surf: 'soft' });
    if (cuff && k.lod < 2) k.add(box(0.05, 0.235, 0.295).translate(s * 0.645, -0.08, 0), { color: cuff, bone, surf: 'soft' });
  }
}

/** Blend two chain skins across X (capes driven by a left and a right chain): wB = 0 → a, 1 → b. */
export function blendSkins(a: SkinFn, b: SkinFn, x0: number, x1: number): SkinFn {
  const A: SkinOut = { i0: 0, i1: 0, i2: 0, i3: 0, w0: 1, w1: 0, w2: 0, w3: 0 }, B: SkinOut = { ...A };
  return (x, y, z, out) => {
    a(x, y, z, A); b(x, y, z, B);
    const t = THREE.MathUtils.smoothstep(x, x0, x1);
    out.i0 = A.i0; out.i1 = A.i1; out.i2 = B.i0; out.i3 = B.i1;
    out.w0 = A.w0 * (1 - t); out.w1 = A.w1 * (1 - t); out.w2 = B.w0 * t; out.w3 = B.w1 * t;
  };
}
