// Duke (듀크) — royal: a jauntily tilted gold crown with pearls and rubies over a velvet cap, an ermine collar and a
// wide ermine cape (two verlet chains, cloth-lite, red lining), and a ruby-orb sceptre. Chin up (dignified, vain).
import type { CharacterDef, V3 } from '../../mascot/rig.ts';
import { band, extrude, sph, octa, dome, ribbon, box, cyl, torus } from '../../mascot/shapes.ts';
import { blendSkins } from '../parts.ts';
import { wave } from '../../mascot/emotes.ts';
import type * as THREE from 'three/webgpu';

const TILT = 0.12;
const tilt = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.translate(0, -0.34, 0).rotateZ(TILT).translate(0, 0.34, 0);

const def: CharacterDef = {
  id: 'duke',
  palette: { body: '#C96442', shade: '#A8533A', accent: '#F2C14E', detail: '#B53333', eye: '#141413' },
  eyeStyle: 'slot',
  sparkle: { at: [0.06, 0.82, 0], size: 0.95, color: 'accent' },
  tiltBias: -0.06,
  accessories: [
    // crown
    (k) => {
      k.bone('crown', 'head', [0, 0.34, 0]);
      k.motion('crown', { jiggle: 1.1 });
      const C = { bone: 'crown' as const };
      k.add(tilt(band(0.64, 0.52, 0.2, 0.11, 0.035, k.q(4, 2, 1), k.q(0.01, 0, 0)).translate(0, 0.395, 0)), { ...C, color: 'accent', surf: 'gold' });
      k.add(tilt(dome(0.28, k.q(14, 8, 5), k.q(6, 4, 2)).scale(1, 0.75, 0.82).translate(0, 0.42, 0)), { ...C, color: 'detail', surf: 'soft' });
      const pts: Array<[number, number]> = k.lod === 2 ? [[0, 0.26], [0.29, 0], [-0.29, 0]] : [[0, 0.265], [0.27, 0.19], [-0.27, 0.19], [0.27, -0.19], [-0.27, -0.19], [0, -0.265]];
      for (const [x, z] of pts) {
        const p = extrude([[-0.075, 0], [0.075, 0], [0, 0.2]], 0.03, k.q(0.008, 0, 0)).rotateY(Math.atan2(x, z)).translate(x, 0.44, z);
        k.add(tilt(p), { ...C, color: 'accent', surf: 'gold' });
        if (k.lod === 0) k.add(tilt(sph(0.028, 6, 4).translate(x * 1.02, 0.645, z * 1.02)), { ...C, color: 'ivory', surf: 'gloss' });
      }
      if (k.lod < 2) for (const [x, z] of [[0, 0.268], [0.17, 0.235], [-0.17, 0.235]] as const) k.add(tilt(octa(0.034).translate(x, 0.395, z)), { ...C, color: 'detail', surf: { rough: 0.1, metal: 0, glow: 0.25, coat: 1 } });
    },
    // ermine collar + cape with red lining
    (k) => {
      k.add(band(1.1, 0.74, 0.23, 0.12, 0.07, k.q(4, 2, 1), k.q(0.02, 0, 0)).translate(0, -0.04, 0), { color: 'ivory', surf: 'soft' });
      if (k.lod === 0) for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2, x = Math.sin(a) * 0.56, z = Math.cos(a) * 0.38;
        k.add(box(0.022, 0.05, 0.022).translate(Math.max(-0.555, Math.min(0.555, x)), -0.04, Math.max(-0.375, Math.min(0.375, z))), { color: 'black', surf: 'soft' });
      }
      const L: V3[] = [[0.3, 0.02, -0.37], [0.35, -0.14, -0.42], [0.39, -0.3, -0.46], [0.43, -0.47, -0.5]];
      const R: V3[] = L.map(([x, y, z]) => [-x, y, z]);
      const cL = k.chain('capeL', 'body', L, { stiffness: 0.55, wind: 0.8, gravity: 1, flutter: 0.8 });
      const cR = k.chain('capeR', 'body', R, { stiffness: 0.55, wind: 0.8, gravity: 1, flutter: 0.8 });
      const skin = blendSkins(cR.skin, cL.skin, -0.18, 0.18);
      const mid: V3[] = [[0, 0.02, -0.37], [0, -0.14, -0.42], [0, -0.3, -0.46], [0, -0.47, -0.5]];
      k.add(ribbon(mid, 0.82, 0.03, k.q(10, 5, 3), [1, 0, 0], 1.25), { color: 'ivory', surf: 'soft', skin });
      if (k.lod < 2) {
        k.add(ribbon(mid.map(([x, y, z]) => [x, y, z + 0.018] as V3), 0.78, 0.012, k.q(8, 4, 3), [1, 0, 0], 1.25), { color: 'detail', surf: 'soft', skin });
        if (k.lod === 0) for (const [x, y] of [[0.2, -0.1], [-0.18, -0.16], [0.05, -0.28], [0.3, -0.36], [-0.32, -0.34], [-0.05, -0.42], [0.22, -0.46], [-0.24, -0.5]] as const) {
          const t = (0.02 - y) / 0.49, z = -0.37 - 0.13 * t - 0.022;
          k.add(box(0.03, 0.06, 0.012).translate(x * (1 + 0.25 * t), y, z), { color: 'black', surf: 'soft', skin });
        }
      }
    },
    // sceptre in the right hand
    (k) => {
      k.add(cyl(0.022, 0.022, 0.8, k.q(8, 5, 3)).translate(-0.745, 0.1, 0.1), { color: 'accent', bone: 'armR', surf: 'gold' });
      k.add(sph(0.07, k.q(14, 8, 5), k.q(10, 6, 4)).translate(-0.745, 0.54, 0.1), { color: 'detail', bone: 'armR', surf: { rough: 0.1, metal: 0, glow: 0.2, coat: 1 } });
      if (k.lod < 2) k.add(torus(0.072, 0.012, 5, 16).rotateX(Math.PI / 2).translate(-0.745, 0.54, 0.1), { color: 'accent', bone: 'armR', surf: 'gold' });
    },
  ],
  emotes: {
    // royal wave + confetti (+ trumpet fanfare in audio)
    win: (b) => ({ ...b, keys: { rx: [0, 0, 0.3, -0.12, 2.0, -0.12, 2.4, 0], aLr: [0, 0, 0.3, 1.2, 2.0, 1.2, 2.4, 0], aLf: wave(0.3, 2.0, 0.35, 5, 0.3), ry: wave(0.3, 2.1, 0.25, 3), y: [0, 0, 0.2, 0.05, 2.2, 0.05, 2.4, 0] }, fx: [[0.3, 'confetti']] }),
    podium: (b) => ({ ...b, keys: { ...b.keys, aRr: [0, 0, 0.35, 1.5, 1.9, 1.5, 2.2, 0], aLr: [0, 0, 2.2, 0] } }),
    lose: (b) => ({ ...b, keys: { ...b.keys, rx: [0, 0, 0.5, 0.45, 1.8, 0.45, 2.2, 0] } }),
    attackLanded: () => ({ duration: 1.6, keys: { rx: [0, 0, 0.4, 0.18, 0.9, 0.18, 1.6, 0] }, eyes: [[0, 'happy'], [1.3, 'open']] }),
    gotHit: (b) => ({ ...b, keys: { ...b.keys, hz: [0, 0, 0.1, 0.5, 1.2, 0.5, 1.6, 0] } }),
    lobby: (b) => ({ ...b, keys: { ...b.keys, ry: wave(0.2, 2.2, 0.35, 3) } }),
  },
};
export default def;
