// Nova (노바) — astronaut: Clawd's head in a glass fishbowl helmet (Fresnel glass, third draw), ivory suit with sky-blue
// trim, life-support backpack with twin tanks, and a springy antenna carrying the sparkle.
import * as THREE from 'three/webgpu';
import type { CharacterDef } from '../../mascot/rig.ts';
import { rbox, box, band, cyl, torus, sph } from '../../mascot/shapes.ts';
import { sleeves } from '../parts.ts';
import { wave } from '../../mascot/emotes.ts';

const DOME = { r: 0.7, sy: 0.78, sz: 0.76, y: -0.03 };

const def: CharacterDef = {
  id: 'nova',
  palette: { body: '#D97757', shade: '#BE684D', accent: '#F5F4ED', detail: '#6A9BCC', eye: '#141413' },
  eyeStyle: 'slot',
  sparkle: { bone: 'antenna', at: [0.18, 0.82, -0.12], size: 0.95, color: 'ivory' },
  accessories: [
    (k) => {
      // glass bubble helmet
      const d = new THREE.SphereGeometry(DOME.r, k.q(24, 14, 8), k.q(10, 6, 3), 0, Math.PI * 2, 0, Math.PI / 2);
      d.scale(1, DOME.sy, DOME.sz).translate(0, DOME.y, 0);
      k.add(d, { color: '#DDF1FF', glass: true, surf: { rough: 0.04, metal: 0, glow: 0.05, coat: 1 } });
      k.add(torus(DOME.r, 0.042, k.q(6, 4, 3), k.q(28, 14, 8)).rotateX(Math.PI / 2).scale(1, 1, DOME.sz).translate(0, DOME.y, 0), { color: 'detail', surf: 'gloss' });
      // suit
      k.add(band(1.08, 0.72, 0.22, 0.3, 0.06, k.q(4, 2, 1), k.q(0.012, 0, 0)).translate(0, -0.2, 0), { color: 'accent', surf: 'soft' });
      sleeves(k, 'accent', 'detail');
      // backpack + tanks
      k.add((k.lod === 2 ? box(0.62, 0.44, 0.18) : rbox(0.62, 0.44, 0.18, 0.06, 1)).translate(0, -0.1, -0.42), { color: 'accent', surf: 'plastic' });
      for (const s of [1, -1]) k.add(cyl(0.075, 0.075, 0.4, k.q(10, 6, 4)).translate(s * 0.17, -0.1, -0.55), { color: 'detail', surf: 'gloss' });
      if (k.lod === 2) return;
      // chest panel with three buttons
      k.add(box(0.32, 0.12, 0.025).translate(0, -0.2, 0.37), { color: '#30302E', surf: 'gloss' });
      (['#E5484D', '#FFD23F', '#6A9BCC'] as const).forEach((c, i) => k.add(cyl(0.022, 0.022, 0.02, 8).rotateX(Math.PI / 2).translate(-0.09 + i * 0.09, -0.2, 0.385), { color: c, surf: { rough: 0.3, metal: 0, glow: 0.8, coat: 1 } }));
      k.add(box(0.3, 0.06, 0.02).translate(0, 0.08, -0.515), { color: 'detail', surf: 'gloss' });
      // antenna on the dome (springy, jiggles on bumps)
      k.bone('antenna', 'body', [0.18, 0.48, -0.12]);
      k.motion('antenna', { jiggle: 2.2 });
      k.add(cyl(0.012, 0.014, 0.28, k.q(6, 4, 3)).translate(0.18, 0.62, -0.12), { color: 'chrome', bone: 'antenna', surf: 'chrome' });
      k.add(sph(0.022, 8, 6).translate(0.18, 0.485, -0.12), { color: 'chrome', bone: 'antenna', surf: 'chrome' });
    },
  ],
  emotes: {
    // zero-g spin + a ringed-planet particle
    win: (b) => ({ ...b, keys: { ...b.keys, y: [0, 0, 0.5, 0.3, 1.8, 0.3, 2.4, 0], rx: [0, 0, 0.4, 0, 1.6, Math.PI * 2, 2.4, Math.PI * 2], aLr: [0, 0, 0.4, 1.0, 1.8, 1.0, 2.4, 0], aRr: [0, 0, 0.4, 1.0, 1.8, 1.0, 2.4, 0] }, fx: [[0.4, 'planet']] }),
    podium: (b) => ({ ...b, keys: { ...b.keys, aRr: [0, 0, 0.3, 1.1, 1.8, 1.1, 2.2, 0], aRf: [0, 0, 0.3, 1.25, 1.8, 1.25, 2.2, 0], aLr: [0, 0, 2.2, 0], aLf: [0, 0, 2.2, 0] } }),
    lobby: (b) => ({ ...b, keys: { y: wave(0.1, 2.3, 0.07, 3, 0.05), rz: wave(0.1, 2.3, 0.06, 3) } }),
  },
};
export default def;
