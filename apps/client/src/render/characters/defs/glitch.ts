// Glitch (글리치) — neon cyber: near-black gloss body outlined by emissive coral edge loops, a cyan holo visor (glass
// draw) with glowing eyes, chunky headphones whose cans sprout pulsing equalizer bars (the silhouette from behind).
import type { CharacterDef, V3 } from '../../mascot/rig.ts';
import { tube, cyl, torus, box, ribbon } from '../../mascot/shapes.ts';
import * as THREE from 'three/webgpu';
import { wave } from '../../mascot/emotes.ts';

const NEON = { rough: 0.35, metal: 0, glow: 3.2, coat: 0 };
// one face outline of the rounded body (r 0.18), traced on the 45° diagonal of the edges, pushed out 1.5%
function faceLoop(zs: number): V3[] {
  const p: V3[] = [[0.32, 0.287, 0.267], [0.43, 0.252, 0.25], [0.447, 0.16, 0.267], [0.447, -0.16, 0.267], [0.43, -0.252, 0.25], [0.32, -0.287, 0.267],
    [-0.32, -0.287, 0.267], [-0.43, -0.252, 0.25], [-0.447, -0.16, 0.267], [-0.447, 0.16, 0.267], [-0.43, 0.252, 0.25], [-0.32, 0.287, 0.267]];
  return p.map(([x, y, z]) => [x * 1.015, y * 1.015, z * zs * 1.015]);
}

const def: CharacterDef = {
  id: 'glitch',
  palette: { body: '#1C1B22', shade: '#121117', accent: '#FF7A50', detail: '#2EF2FF', eye: '#2EF2FF' },
  eyeStyle: 'visor',
  body: { surf: { rough: 0.26, metal: 0.1, glow: 0, coat: 1 } },
  eyes: { z: 0.392, glow: 2.4 },
  sparkle: { at: [0, 0.56, -0.02], size: 0.85, color: 'detail' },
  accessories: [
    // neon edge loops (front + back) and a top circuit stripe
    (k) => {
      for (const zs of [1, -1]) {
        const loop = faceLoop(zs);
        const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loop.map((p) => new THREE.Vector3(...p)), true, 'centripetal'), k.q(48, 24, 12), 0.013, k.q(4, 3, 3), true);
        k.add(g, { color: zs > 0 ? 'accent' : 'detail', surf: NEON });
      }
      if (k.lod < 2) {
        const pts: V3[] = [[0.2, 0.2, 0.33], [0.2, 0.3, 0.29], [0.2, 0.345, 0.12], [0.2, 0.345, -0.12], [0.2, 0.3, -0.29], [0.2, 0.2, -0.33]];
        k.add(ribbon(pts, 0.022, 0.008, k.q(12, 6, 4)), { color: 'detail', surf: NEON });
      }
    },
    // holo visor (glass, cyan glow)
    (k) => {
      const v = new THREE.CylinderGeometry(0.9, 0.9, 0.24, k.q(20, 10, 6), 1, true, -0.52, 1.04);
      v.translate(0, 0.07, 0.38 - 0.9);
      k.add(v, { color: 'detail', glass: true, surf: { rough: 0.05, metal: 0, glow: 0.9, coat: 1 } });
      if (k.lod < 2) k.add(box(0.86, 0.012, 0.012).translate(0, 0.195, 0.372), { color: 'detail', surf: NEON });
    },
    // headphones + equalizer bars on each can
    (k) => {
      for (const s of [1, -1]) {
        k.add(cyl(0.16, 0.16, 0.12, k.q(16, 10, 6)).rotateZ(Math.PI / 2).translate(s * 0.565, 0.12, 0), { color: '#2A2833', surf: 'gloss' });
        if (k.lod < 2) {
          k.add(torus(0.11, 0.018, k.q(4, 3, 3), k.q(14, 8, 6)).rotateY(Math.PI / 2).translate(s * 0.628, 0.12, 0), { color: 'detail', surf: NEON });
          k.add(cyl(0.12, 0.12, 0.02, k.q(12, 8, 5)).rotateZ(Math.PI / 2).translate(s * 0.63, 0.12, 0), { color: 'accent', surf: { ...NEON, glow: 1.2 } });
        }
        const heights = [0.12, 0.2, 0.15];
        heights.forEach((h, i) => {
          if (k.lod === 2 && i !== 1) return;
          const z = (i - 1) * 0.07, name = `eq${s > 0 ? 'L' : 'R'}${i}`;
          k.bone(name, 'body', [s * 0.565, 0.28, z]);
          k.motion(name, { pulse: ['y', 0.7, 7 + i * 2.3 + (s > 0 ? 0 : 1.1), i * 1.7 + (s > 0 ? 0 : 2)] });
          k.add(box(0.05, h, 0.05).translate(s * 0.565, 0.28 + h / 2, z), { color: 'accent', bone: name, surf: NEON });
        });
      }
      k.add(tube([[0.52, 0.22, 0], [0.44, 0.42, 0], [0, 0.49, 0], [-0.44, 0.42, 0], [-0.52, 0.22, 0]], 0.03, k.q(16, 8, 5), k.q(5, 4, 3)), { color: '#2A2833', surf: 'gloss' });
    },
  ],
  emotes: {
    win: () => ({ duration: 2.4, stepped: 10, keys: { ry: wave(0.1, 2.2, 0.45, 8), rz: wave(0.1, 2.2, 0.12, 8), y: wave(0.1, 2.2, 0.08, 16, 0.04), aLr: [0, 0, 0.2, 1.3, 2.1, 1.3, 2.4, 0], aRr: [0, 0, 0.2, 1.3, 2.1, 1.3, 2.4, 0], aLf: wave(0.2, 2.1, 0.5, 8), aRf: wave(0.2, 2.1, -0.5, 8) }, eyes: [[0, 'happy'], [2.2, 'open']], fx: [[0.2, 'glitch'], [1.2, 'glitch']] }),
    gotHit: (b) => ({ ...b, stepped: 12, fx: [[0.05, 'glitch']] }),
    podium: (b) => ({ ...b, keys: { ...b.keys, rz: wave(0.2, 2.0, 0.1, 8) } }),
    lobby: () => ({ duration: 2.4, keys: { rz: wave(0.1, 2.3, 0.08, 8), y: wave(0.1, 2.3, 0.03, 8, 0.02) } }),
  },
};
export default def;
