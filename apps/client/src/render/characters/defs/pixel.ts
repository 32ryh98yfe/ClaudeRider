// Pixel (픽셀) — true voxel Clawd: real cubes on the 12×8×6 grid, flat shading, 8-bit shade steps, stepped 12 fps
// motion. Silhouette: a grey game cartridge plugged into its back and an 8-bit pixel sparkle on a stalk.
import type { CharacterDef } from '../../mascot/rig.ts';
import { box, voxels } from '../../mascot/shapes.ts';
import { hops, wave } from '../../mascot/emotes.ts';

const C = 1 / 12;

const def: CharacterDef = {
  id: 'pixel',
  palette: { body: '#D87656', shade: '#BE684D', accent: '#8B8B8B', detail: '#F9F8F4', eye: '#141413' },
  eyeStyle: 'slot',
  body: { voxel: true },
  eyes: { z: 0.254, dx: 0.25, scale: 0.96 },
  sparkle: { hidden: true },
  stepped: 12,
  accessories: [
    (k) => {
      // cartridge plugged into the back: grey shell, ivory label, grip ridges; sticks up above the head
      k.add(box(0.5, 0.36, 0.1).translate(0, 0.3, -0.3), { color: 'accent', surf: 'plastic' });
      if (k.lod < 2) {
        k.add(box(0.36, 0.2, 0.01).translate(0, 0.31, -0.354), { color: 'detail', surf: 'matte' });
        k.add(box(0.26, 0.05, 0.012).translate(0, 0.36, -0.36), { color: '#D97757', surf: 'matte' });
        for (let i = 0; i < 4; i++) k.add(box(0.44, 0.012, 0.012).translate(0, 0.45 - i * 0.025, -0.356), { color: '#6E6E6E', surf: 'plastic' });
      }
      // 8-bit sparkle on a two-voxel stalk (bone spins in 90° steps via the stepped clock)
      k.bone('pix', 'head', [0, 0.52, 0]);
      k.motion('pix', { spin: ['y', 1.6] });
      k.add(box(C * 0.6, C * 1.6, C * 0.6).translate(0, 0.43, 0), { color: 'accent', surf: 'voxel' });
      const P = 0.045;
      const cells: Array<[number, number, number]> = k.lod === 2
        ? [[0, 0, 1]]
        : [[0, 0, 1], [1, 0, 0.92], [-1, 0, 0.92], [0, 1, 0.92], [0, -1, 0.92], [2, 0, 0.84], [-2, 0, 0.84], [0, 2, 0.84], [0, -2, 0.84], [1, 1, 0.7], [-1, 1, 0.7], [1, -1, 0.7], [-1, -1, 0.7]];
      for (const [x, y, s] of cells) {
        const v = voxels(1, 1, 1, P, () => true, (_x, _y, _z, f) => (f === 2 ? 1.05 : f === 3 ? 0.8 : 1) * s);
        v.geo.translate(x * P, 0.56 + y * P, 0);
        k.add(v.geo, { color: 'detail', bone: 'pix', surf: { rough: 0.5, metal: 0, glow: 0.35, coat: 0.2 }, shade: v.shades });
      }
    },
  ],
  emotes: {
    win: (b) => ({ ...b, keys: { ...b.keys, ry: [0, 0, 2.4, 0], y: hops(0.1, 2.0, 0.2, 4) }, fx: [[0.2, 'squares'], [1.0, 'squares']] }),
    podium: (b) => ({ ...b, keys: { ...b.keys, rz: wave(0.1, 2.0, 0.12, 8), y: hops(0.1, 2.0, 0.04, 8) } }),
    lose: (b) => ({ ...b, fx: [[0.5, 'squares']] }),
    lobby: (b) => ({ ...b, keys: { ...b.keys, rz: wave(0.4, 2.0, 0.08, 6) } }),
  },
};
export default def;
