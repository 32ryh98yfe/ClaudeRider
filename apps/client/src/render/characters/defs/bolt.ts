// Bolt (볼트) — copper wind-up robot: metallic copper shell (metalness 0.9, roughness 0.3), a dark LED screen face with
// amber dot-matrix eyes, rivet rows, hex bolts, a spring antenna with a glowing bulb, and a wind-up key that turns
// faster while boosting.
import type { CharacterDef, V3 } from '../../mascot/rig.ts';
import { rbox, box, band, sph, cyl, tube } from '../../mascot/shapes.ts';
import { wave } from '../../mascot/emotes.ts';

const def: CharacterDef = {
  id: 'bolt',
  palette: { body: '#B87333', shade: '#8C5626', accent: '#FFB347', detail: '#5A5A5A', eye: '#FFB347' },
  eyeStyle: 'led',
  body: { surf: 'metal' },
  eyes: { z: 0.347, scale: 1.05 },
  sparkle: { at: [0, 0.82, 0], size: 0.85, color: '#FFE2B0' },
  accessories: [
    (k) => {
      // LED screen
      k.add((k.lod === 2 ? box(0.74, 0.32, 0.03) : rbox(0.74, 0.32, 0.03, 0.04, 1)).translate(0, 0.07, 0.328), { color: '#15131A', surf: { rough: 0.12, metal: 0, glow: 0, coat: 1 } });
      if (k.lod === 2) return;
      // rivets around the screen, a seam band, hex bolts on the sides
      for (let i = 0; i < 5; i++) for (const y of [0.26, -0.12]) k.add(sph(0.021, 6, 3).scale(1, 1, 0.6).translate(-0.36 + i * 0.18, y, 0.322), { color: 'detail', surf: 'metal' });
      k.add(band(1.015, 0.655, 0.19, 0.035, 0.02, k.q(4, 2, 1), 0).translate(0, -0.2, 0), { color: 'shade', surf: 'metal' });
      for (const s of [1, -1]) k.add(cyl(0.05, 0.05, 0.03, 6).rotateZ(Math.PI / 2).translate(s * 0.505, 0.18, 0), { color: 'detail', surf: 'metal' });
    },
    // spring antenna + glowing bulb
    (k) => {
      k.bone('bulb', 'head', [0, 0.34, 0]);
      k.motion('bulb', { jiggle: 2.6 });
      const coil: V3[] = [];
      for (let i = 0; i <= 32; i++) { const t = i / 32, a = t * Math.PI * 8; coil.push([Math.cos(a) * 0.035, 0.34 + t * 0.2, Math.sin(a) * 0.035]); }
      if (k.lod < 2) k.add(tube(coil, 0.009, k.q(64, 28, 8), k.q(4, 3, 3)), { color: 'chrome', bone: 'bulb', surf: 'chrome' });
      else k.add(cyl(0.02, 0.02, 0.2).translate(0, 0.44, 0), { color: 'chrome', bone: 'bulb', surf: 'chrome' });
      k.add(cyl(0.04, 0.034, 0.05, k.q(12, 8, 5)).translate(0, 0.565, 0), { color: 'chrome', bone: 'bulb', surf: 'chrome' });
      k.add(sph(0.07, k.q(14, 8, 5), k.q(10, 6, 4)).translate(0, 0.64, 0), { color: 'accent', bone: 'bulb', surf: { rough: 0.2, metal: 0, glow: 2.6, coat: 1 } });
    },
    // wind-up key
    (k) => {
      k.bone('key', 'body', [0, 0.0, -0.34]);
      k.motion('key', { spin: ['z', 2.2], boostSpin: 3 });
      k.add(cyl(0.028, 0.028, 0.14, k.q(10, 6, 4)).rotateX(Math.PI / 2).translate(0, 0, -0.39), { color: '#C9A14A', bone: 'key', surf: 'gold' });
      for (const s of [1, -1]) k.add((k.lod === 2 ? box(0.15, 0.13, 0.03) : rbox(0.15, 0.13, 0.03, 0.055, 1)).translate(s * 0.09, 0, -0.47), { color: '#C9A14A', bone: 'key', surf: 'gold' });
      if (k.lod < 2) k.add(sph(0.035, 8, 5).translate(0, 0, -0.47), { color: '#C9A14A', bone: 'key', surf: 'gold' });
    },
  ],
  emotes: {
    win: (b) => ({ ...b, keys: { ...b.keys, ry: [0, 0, 0.3, 0, 1.3, Math.PI * 4, 2.4, Math.PI * 4] }, fx: [[0.4, 'steam'], [1.2, 'steam']] }),
    podium: (b) => ({ ...b, eyes: [[0, 'star'], [2.0, 'open']] }),
    lose: (b) => ({ ...b, eyes: [[0, 'sleepy'], [2.0, 'open']], fx: [[0.6, 'steam']] }),
    attackLanded: (b) => ({ ...b, eyes: [[0, 'happy'], [1.4, 'open']] }),
    gotHit: (b) => ({ ...b, fx: [[0.05, 'bolts'], [0.1, 'stars']] }),
    lobby: (b) => ({ ...b, keys: { ...b.keys, rz: wave(0.2, 2.2, 0.06, 6) } }),
  },
};
export default def;
