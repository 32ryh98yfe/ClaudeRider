// Frost (프로스트) — ice: glossy pale-blue crystal shell (low-roughness vinyl with a cold glow; translucent crystal
// shards on the shoulders in the glass draw), an icicle crown with a tall front spike, fluffy earmuffs on a band that
// wraps behind the head, navy eyes.
import type { CharacterDef } from '../../mascot/rig.ts';
import { cone, torus, ico, tube, octa } from '../../mascot/shapes.ts';
import * as THREE from 'three/webgpu';

function fluff(r: number, detail: number, seed: number): THREE.BufferGeometry {
  const g = ico(r, detail);
  const P = g.attributes.position!;
  let s = seed;
  for (let i = 0; i < P.count; i++) {
    s = (s * 16807) % 2147483647;
    const k = 1 + ((s / 2147483647) - 0.5) * 0.16;
    P.setXYZ(i, P.getX(i) * k, P.getY(i) * k, P.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

const def: CharacterDef = {
  id: 'frost',
  palette: { body: '#9FD3F2', shade: '#7BB8DE', accent: '#FFFFFF', detail: '#E8F6FF', eye: '#0E2A47' },
  eyeStyle: 'slot',
  body: { surf: { rough: 0.14, metal: 0, glow: 0.07, coat: 1 } },
  sparkle: { at: [0, 0.8, 0.06], size: 0.9, color: '#E8F6FF' },
  accessories: [
    // icicle crown
    (k) => {
      k.add(torus(0.27, 0.035, k.q(6, 4, 3), k.q(24, 12, 8)).rotateX(Math.PI / 2).translate(0, 0.37, 0), { color: 'accent', bone: 'head', surf: { rough: 0.12, metal: 0, glow: 0.18, coat: 1 } });
      const spikes: Array<[number, number]> = k.lod === 2 ? [[0, 0.3]] : [[0, 0.32], [0.7, 0.2], [-0.7, 0.2], [1.5, 0.15], [-1.5, 0.15], [2.4, 0.18], [-2.4, 0.18], [Math.PI, 0.22]];
      for (const [a, h] of spikes) {
        k.add(cone(0.05 + h * 0.08, h, k.q(5, 4, 3)).translate(Math.sin(a) * 0.27, 0.37 + h / 2 + 0.02, Math.cos(a) * 0.27), { color: 'accent', bone: 'head', surf: { rough: 0.1, metal: 0, glow: 0.22, coat: 1 } });
      }
    },
    // earmuffs + back band
    (k) => {
      for (const s of [1, -1]) k.add(fluff(0.14, k.q(2, 1, 0), s > 0 ? 3 : 9).translate(s * 0.55, 0.15, 0), { color: 'detail', surf: 'soft' });
      if (k.lod < 2) k.add(tube([[0.52, 0.2, -0.06], [0.42, 0.27, -0.3], [0, 0.3, -0.4], [-0.42, 0.27, -0.3], [-0.52, 0.2, -0.06]], 0.028, k.q(20, 10, 5), k.q(6, 4, 3)), { color: '#BFE3F7', surf: 'gloss' });
    },
    // translucent crystal shards (glass draw)
    (k) => {
      if (k.lod === 2) return;
      const shards: Array<[number, number, number, number, number]> = [[0.34, 0.33, -0.2, 0.3, -0.3], [-0.26, 0.36, -0.24, -0.25, -0.35], [0.1, 0.36, -0.3, 0.1, -0.5]];
      for (const [x, y, z, rz, rx] of shards) k.add(octa(0.08).scale(0.55, 1.7, 0.55).rotateZ(rz).rotateX(rx).translate(x, y, z), { color: '#DFF4FF', glass: true, surf: { rough: 0.05, metal: 0, glow: 0.6, coat: 1 } });
    },
  ],
  emotes: {
    win: (b) => ({ ...b, fx: [[0.3, 'snow'], [1.0, 'snow']] }),
    podium: (b) => ({ ...b, fx: [[0.6, 'breath']] }),
    attackLanded: (b) => ({ ...b, fx: [[0.1, 'sparkle']] }),
    lobby: (b) => ({ ...b, fx: [[0.5, 'breath'], [1.5, 'breath']] }),
  },
};
export default def;
