// Rune (룬) — wizard: a tall indigo cone hat whose tip flops backward (verlet chain), a wide soft brim with an ivory
// band, ivory star patches, and a wooden staff topped by the character's sparkle.
import type { CharacterDef } from '../../mascot/rig.ts';
import { lathe, star, cyl, torus } from '../../mascot/shapes.ts';
import { bendUp } from '../parts.ts';
import { wave } from '../../mascot/emotes.ts';

const Y0 = 0.37;           // cone base height
const CONE: Array<[number, number]> = [[0.34, 0], [0.31, 0.08], [0.25, 0.22], [0.18, 0.36], [0.12, 0.5], [0.07, 0.63], [0.03, 0.74], [0.0, 0.8]];
const BEND = { from: 0.34, to: 0.8, angle: 1.55 };
function coneR(h: number): number {
  for (let i = 1; i < CONE.length; i++) { const [r1, y1] = CONE[i]!, [r0, y0] = CONE[i - 1]!; if (h <= y1) return r0 + ((r1 - r0) * (h - y0)) / (y1 - y0); }
  return 0;
}

const def: CharacterDef = {
  id: 'rune',
  palette: { body: '#E08A6D', shade: '#C4745A', accent: '#3B3F8F', detail: '#F0EEE6', eye: '#141413' },
  eyeStyle: 'slot',
  sparkle: { bone: 'armR', at: [-0.745, 0.72, 0.1], size: 1.15, color: 'detail' },
  tiltBias: -0.03,
  accessories: [
    (k) => {
      // brim
      k.add(lathe([[0.28, 0.0], [0.5, -0.012], [0.63, -0.004], [0.66, 0.012], [0.6, 0.03], [0.4, 0.035], [0.28, 0.045]], k.q(28, 14, 8)).translate(0, 0.345, 0), { color: 'accent', bone: 'head', surf: 'soft' });
      // cone, bent back at the tip; its centre line drives a verlet chain so the tip bounces
      const cone = lathe(CONE, k.q(22, 12, 6)).translate(0, Y0, 0);
      const pts = bendUp(cone, Y0, BEND.from, BEND.to, BEND.angle, [0, 0, -1], 4);
      const ch = k.chain('hat', 'head', pts, { stiffness: 0.75, wind: 0.35, gravity: 0.6, flutter: 0.4 });
      k.add(cone, { color: 'accent', surf: 'soft', skin: ch.skin });
      if (k.lod === 2) return;
      k.add(torus(0.335, 0.03, k.q(6, 4, 3), k.q(24, 12, 8)).rotateX(Math.PI / 2).translate(0, Y0 + 0.02, 0), { color: 'detail', bone: 'head', surf: 'soft' });
      // star patches that ride the cone (bent with the same deformer)
      const stars: Array<[number, number, number]> = k.lod === 0 ? [[0.14, 0.3, 0.05], [0.3, -0.5, 0.04], [0.45, 0.6, 0.035], [0.2, 2.6, 0.045], [0.4, -2.4, 0.035]] : [[0.14, 0.3, 0.05], [0.3, -0.5, 0.04]];
      for (const [h, phi, r] of stars) {
        const s = star(r, 0.45, 0.012);
        const rad = coneR(h) + 0.006;
        s.rotateX(-0.35).rotateY(phi).translate(Math.sin(phi) * rad, Y0 + h, Math.cos(phi) * rad);
        bendUp(s, Y0, BEND.from, BEND.to, BEND.angle, [0, 0, -1]);
        k.add(s, { color: 'detail', surf: { rough: 0.4, metal: 0, glow: 0.35, coat: 0.3 }, skin: ch.skin });
      }
    },
    // staff in the right hand
    (k) => {
      k.add(cyl(0.028, 0.034, 1.1, k.q(10, 6, 4)).translate(-0.745, 0.08, 0.1), { color: '#8A5A3B', bone: 'armR', surf: 'matte' });
      if (k.lod < 2) {
        k.add(torus(0.075, 0.02, k.q(6, 4, 3), k.q(16, 8, 6), Math.PI * 1.6).rotateZ(-0.3).translate(-0.745, 0.7, 0.1), { color: '#8A5A3B', bone: 'armR', surf: 'matte' });
        k.add(torus(0.036, 0.012, 5, 10).rotateX(Math.PI / 2).translate(-0.745, 0.6, 0.1), { color: 'gold', bone: 'armR', surf: 'gold' });
      }
    },
  ],
  emotes: {
    // wand twirl + sparkle firework
    win: (b) => ({ ...b, keys: { ...b.keys, aRr: [0, 0, 0.25, 1.4, 1.9, 1.4, 2.4, 0], aRf: wave(0.25, 1.9, 0.7, 8), ry: [0, 0, 2.4, 0] }, fx: [[0.5, 'firework'], [1.2, 'firework']] }),
    podium: (b) => ({ ...b, keys: { ...b.keys, aRr: [0, 0, 0.3, 1.5, 1.9, 1.5, 2.2, 0], aLr: [0, 0, 2.2, 0] }, fx: [[0.5, 'stars']] }),
    lose: (b) => ({ ...b, keys: { ...b.keys, hx: [0, 0, 0.5, 0.35, 1.8, 0.35, 2.2, 0] } }),
    gotHit: (b) => ({ ...b, keys: { ...b.keys, hy: [0, 0, 0.9, Math.PI * 2, 1.6, Math.PI * 2] } }),
    lobby: (b) => ({ ...b, keys: { ...b.keys, y: wave(0.2, 2.2, 0.05, 4, 0.03) }, fx: [[0.4, 'stars']] }),
  },
};
export default def;
