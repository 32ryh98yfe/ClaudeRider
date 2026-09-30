// Chef Bisque (비스크 셰프) — a tall pleated white toque (jiggles, deflates when losing), sage neckerchief with a
// front flap, and a steel ladle held like a sceptre. The sparkle is pinned to the toque band as a badge.
import type { CharacterDef } from '../../mascot/rig.ts';
import { lathe, band, extrude, sph, cyl } from '../../mascot/shapes.ts';
import * as THREE from 'three/webgpu';
import { wave } from '../../mascot/emotes.ts';

function toque(seg: number): THREE.BufferGeometry {
  const g = lathe([[0.29, 0], [0.305, 0.02], [0.305, 0.15], [0.33, 0.17], [0.4, 0.23], [0.445, 0.32], [0.44, 0.41], [0.38, 0.5], [0.24, 0.56], [0.0, 0.58]], seg);
  // vertical pleats on the puff
  const P = g.attributes.position!;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    if (y < 0.16) continue;
    const phi = Math.atan2(x, z), k = 1 + 0.05 * Math.cos(phi * 9) * Math.min(1, (y - 0.16) / 0.08) * Math.min(1, (0.58 - y) / 0.1);
    P.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  return g;
}

const def: CharacterDef = {
  id: 'bisque',
  palette: { body: '#D97757', shade: '#BE684D', accent: '#FFFFFF', detail: '#788C5D', eye: '#141413' },
  eyeStyle: 'slot',
  sparkle: { bone: 'toque', at: [0.0, 0.43, 0.318], size: 0.62, color: 'detail', spin: 0 },
  accessories: [
    (k) => {
      k.bone('toque', 'head', [0, 0.34, 0]);
      k.motion('toque', { jiggle: 1.4, ch: [['p0', 'sy', 1]] });
      k.add(toque(k.q(36, 18, 8)).rotateZ(0.07).translate(0, 0.33, 0), { color: 'accent', bone: 'toque', surf: 'soft' });
    },
    (k) => {
      k.add(band(1.05, 0.69, 0.21, 0.085, 0.04, k.q(4, 2, 1), 0).translate(0, -0.12, 0), { color: 'detail', surf: 'soft' });
      if (k.lod < 2) {
        k.add(extrude([[-0.13, 0], [0.13, 0], [0.01, -0.2]], 0.02, k.q(0.008, 0, 0)).rotateZ(0.12).translate(0.15, -0.13, 0.352), { color: 'detail', surf: 'soft' });
        k.add(sph(0.045, k.q(10, 6, 4), k.q(8, 5, 3)).translate(0.15, -0.12, 0.36), { color: 'detail', surf: 'soft' });
      }
      // ladle
      k.add(cyl(0.018, 0.018, 0.74, k.q(8, 5, 3)).translate(-0.745, 0.06, 0.1), { color: 'chrome', bone: 'armR', surf: 'chrome' });
      if (k.lod < 2) {
        const bowl = new THREE.SphereGeometry(0.1, k.q(14, 8, 6), k.q(8, 5, 3), 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        bowl.rotateX(-Math.PI / 2 + 0.5).translate(-0.745, 0.47, 0.13);
        k.add(bowl, { color: 'chrome', bone: 'armR', surf: 'chrome' });
      }
    },
  ],
  emotes: {
    // chef's kiss → hearts + steam
    win: (b) => ({ ...b, keys: { ...b.keys, aLr: [0, 0, 0.2, 0.8, 0.6, 0.8, 0.8, 1.5, 1.9, 1.5, 2.4, 0], aLf: [0, 0, 0.2, 1.5, 0.6, 1.5, 0.8, 0.2, 2.4, 0], ry: [0, 0, 2.4, 0] }, fx: [[0.7, 'hearts'], [1.1, 'steam']] }),
    podium: (b) => ({ ...b, keys: { ...b.keys, aRf: [0, 0, 0.4, 1.4, 1.6, 1.4, 2.2, 0], aRr: [0, 0, 0.4, 0.5, 1.6, 0.5, 2.2, 0], rx: [0, 0, 0.6, 0.12, 1.6, 0.12, 2.2, 0] } }),
    lose: (b) => ({ ...b, keys: { ...b.keys, p0: [0, 0, 0.5, -0.45, 1.8, -0.45, 2.2, 0] } }),
    attackLanded: (b) => ({ ...b, keys: { ...b.keys, aRf: wave(0.1, 1.3, 0.9, 6) } }),
    gotHit: (b) => ({ ...b, fx: [[0.05, 'flour']] }),
    lobby: () => ({ duration: 2.4, keys: { aRf: [0, 0, 0.3, 0.9, ...wave(0.4, 2.0, 0.45, 6, 0.9).slice(2), 2.4, 0], aRr: [0, 0, 0.3, -0.3, 2.0, -0.3, 2.4, 0], ry: wave(0.3, 2.1, 0.12, 6) }, eyes: [[0, 'happy'], [2.2, 'open']] }),
  },
};
export default def;
