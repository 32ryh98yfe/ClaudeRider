// Captain Anchor (앵커 선장) — pirate: tricorn hat with gold trim, eyepatch over the right eye, red coat with gold
// buttons and hem, and a small sparkle-crested parrot riding the left arm.
import * as THREE from 'three/webgpu';
import type { CharacterDef, V3 } from '../../mascot/rig.ts';
import { rbox, box, cyl, ribbon, band, sph, cone, extrude, sparkle } from '../../mascot/shapes.ts';
import { sleeves } from '../parts.ts';
import { wave } from '../../mascot/emotes.ts';

const TRI: [number, number][] = [[0, 0.44], [0.58, -0.3], [-0.58, -0.3]]; // tricorn corners in plan (x, z)

const def: CharacterDef = {
  id: 'anchor',
  palette: { body: '#C96442', shade: '#A8533A', accent: '#B53333', detail: '#30302E', eye: '#141413' },
  eyeStyle: 'slot',
  eyes: { hide: 'R' },
  sparkle: { at: [0, 0.74, -0.02], color: 'gold' },
  tiltBias: -0.03,
  accessories: [
    // tricorn hat: domed crown, three flared walls that peak at the corners, gold trim along the rim
    (k) => {
      k.add((k.lod === 2 ? box(0.56, 0.26, 0.46) : rbox(0.56, 0.26, 0.46, 0.12, k.q(2, 1, 1))).translate(0, 0.47, -0.02), { color: 'detail', bone: 'head', surf: 'matte' });
      const outline = TRI.map(([x, z]) => [x, -z] as [number, number]);
      k.add(extrude(outline, 0.03, k.q(0.012, 0, 0)).rotateX(-Math.PI / 2).translate(0, 0.35, 0), { color: 'detail', bone: 'head', surf: 'matte' });
      const cz = (TRI[0]![1] + TRI[1]![1] + TRI[2]![1]) / 3;
      const n = k.q(8, 4, 2);
      for (let e = 0; e < 3; e++) {
        const A = TRI[e]!, B = TRI[(e + 1) % 3]!;
        const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2 - cz, ml = Math.hypot(mx, mz);
        const nx = mx / ml, nz = mz / ml;
        const S = new THREE.Vector3(nx * 0.55, 1, nz * 0.55).normalize();
        const wall: V3[] = [], trim: V3[] = [];
        let wMin = Infinity;
        const hAt = (t: number): number => 0.15 + 0.17 * Math.pow(1 - Math.sin(Math.PI * t), 1.4);
        for (let i = 0; i <= n; i++) {
          const t = i / n, bulge = Math.sin(Math.PI * t) * 0.06, h = hAt(t);
          const x = A[0] + (B[0] - A[0]) * t + nx * bulge - nx * 0.02, z = A[1] + (B[1] - A[1]) * t + nz * bulge - nz * 0.02;
          wall.push([x + S.x * h / 2, 0.36 + S.y * h / 2, z + S.z * h / 2]);
          trim.push([x + S.x * h, 0.36 + S.y * h, z + S.z * h]);
          wMin = Math.min(wMin, h);
        }
        k.add(ribbon(wall, 1, 0.035, k.lod === 2 ? 2 : n + 4, [S.x, S.y, S.z], 1, (t) => hAt(t)), { color: 'detail', bone: 'head', surf: 'matte' });
        if (k.lod === 0) k.add(ribbon(trim, 0.03, 0.03, 10, [nx, 0, nz]), { color: 'gold', bone: 'head', surf: 'gold' });
        void wMin;
      }
      if (k.lod === 0) for (const [x, z] of TRI) k.add(sph(0.034, 6, 4).translate(x * 1.08, 0.66, z * 1.08 + 0.01), { color: 'gold', bone: 'head', surf: 'gold' });
    },
    // eyepatch + strap
    (k) => {
      k.add((k.lod === 0 ? rbox(0.17, 0.2, 0.03, 0.05, 1) : box(0.17, 0.2, 0.03)).translate(-0.24, 0.08, 0.33), { color: 'detail', surf: 'matte' });
      if (k.lod === 0) k.add(ribbon([[-0.16, 0.16, 0.332], [0.06, 0.25, 0.334], [0.28, 0.31, 0.32], [0.44, 0.36, 0.16]], 0.03, 0.012, k.q(10, 4, 2), [0, 1, 0]), { color: 'detail', surf: 'matte' });
    },
    // red coat, gold hem and buttons, coat tails, sleeves with gold cuffs
    (k) => {
      k.add(band(1.07, 0.71, 0.21, 0.3, 0.05, k.q(4, 2, 1), k.q(0.012, 0, 0)).translate(0, -0.2, 0), { color: 'accent', surf: 'soft' });
      if (k.lod < 2) {
        k.add(band(1.08, 0.72, 0.215, 0.035, 0.055, k.q(4, 2, 1), 0).translate(0, -0.335, 0), { color: 'gold', surf: 'gold' });
        if (k.lod === 0) for (const s of [1, -1]) for (let i = 0; i < 3; i++) k.add(cyl(0.026, 0.026, 0.016, 8).rotateX(Math.PI / 2).translate(s * 0.1, -0.1 - i * 0.08, 0.36), { color: 'gold', surf: 'gold' });
        for (const s of [1, -1]) k.add(box(0.2, 0.24, 0.03).rotateX(0.28).translate(s * 0.13, -0.42, -0.37), { color: 'accent', surf: 'soft' });
      }
      sleeves(k, 'accent', 'gold');
    },
    // the sparkle-parrot on the left arm
    (k) => {
      if (k.lod === 2) return;
      k.bone('parrot', 'armL', [0.6, 0.04, 0.02]);
      k.motion('parrot', { sway: ['z', 0.08, 2.4], ch: [['p0', 'rz', 1]], jiggle: 1.2 });
      const P = { bone: 'parrot' as const };
      k.add((k.lod === 0 ? rbox(0.1, 0.13, 0.12, 0.045, 1) : box(0.1, 0.13, 0.12)).translate(0.6, 0.1, 0.02), { ...P, color: '#3FA34D', surf: 'vinyl' });
      k.add((k.lod === 0 ? rbox(0.09, 0.085, 0.09, 0.038, 1) : box(0.09, 0.085, 0.09)).translate(0.6, 0.2, 0.05), { ...P, color: '#3FA34D', surf: 'vinyl' });
      k.add(cone(0.024, 0.06, 6).rotateX(Math.PI / 2).translate(0.6, 0.19, 0.12), { ...P, color: '#F2C14E', surf: 'gloss' });
      k.add(box(0.05, 0.025, 0.13).rotateX(-0.5).translate(0.6, 0.06, -0.08), { ...P, color: '#E5484D', surf: 'vinyl' });
      for (const s of [1, -1]) {
        k.add(box(0.018, 0.085, 0.1).translate(0.6 + s * 0.058, 0.1, 0.01), { ...P, color: '#2F8A3E', surf: 'vinyl' });
        k.add(box(0.012, 0.02, 0.02).translate(0.6 + s * 0.046, 0.215, 0.08), { ...P, color: 'dark', surf: 'eye' });
      }
      if (k.lod === 0) k.add(sparkle(0.04, 1, 3).translate(0.6, 0.27, 0.04), { ...P, color: 'gold', surf: 'gold' });
      void THREE;
    },
  ],
  emotes: {
    // "Yo-ho!": hat tip + gold coin burst
    win: (b) => ({ ...b, keys: { ...b.keys, hl: [0, 0, 0.35, 0.14, 1.4, 0.14, 1.8, 0], hx: [0, 0, 0.35, -0.35, 1.4, -0.35, 1.8, 0], aRr: [0, 0, 0.3, 1.2, 1.4, 1.2, 1.9, 0], aRf: [0, 0, 0.3, 0.6, 1.4, 0.6, 1.9, 0], p0: wave(0.2, 2.0, 0.6, 8) }, fx: [[0.4, 'coins']] }),
    lose: (b) => ({ ...b, keys: { ...b.keys, hx: [0, 0, 0.5, 0.45, 1.8, 0.45, 2.2, 0], hl: [0, 0, 0.5, -0.1, 1.8, -0.1, 2.2, 0] } }),
    attackLanded: (b) => ({ ...b, keys: { ...b.keys, p0: wave(0.05, 1.4, 0.8, 10) } }),
    gotHit: (b) => ({ ...b, keys: { ...b.keys, p0: wave(0.0, 1.2, 1.0, 12) }, fx: [[0.05, 'feathers'], [0.1, 'stars']] }),
    lobby: (b) => ({ ...b, keys: { ...b.keys, aRf: [0, 0, 0.3, 1.1, 2.0, 1.1, 2.4, 0], aRr: [0, 0, 0.3, 0.4, 2.0, 0.4, 2.4, 0], ry: wave(0.3, 2.1, 0.35, 3) } }),
  },
};
export default def;
