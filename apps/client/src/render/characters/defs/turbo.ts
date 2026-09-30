// Turbo (터보) — racer: ivory full-face helmet with a dark visor band (eyes glow on the visor), twin blue racing
// stripes, a tall blue fin spoiler (the chase-camera silhouette) and a 7-segment "01" on both sides.
import type { CharacterDef, V3 } from '../../mascot/rig.ts';
import { rbox, box, ribbon, extrude } from '../../mascot/shapes.ts';
import { sevenSeg } from '../parts.ts';
import { wave } from '../../mascot/emotes.ts';

// the helmet's top profile (rounded box, r 0.26): y along z, for stripes that hug the shell
const HELMET = { w: 1.1, h: 0.58, d: 0.76, r: 0.26, y: 0.1 };
function topY(z: number): number {
  const top = HELMET.y + HELMET.h / 2, flat = HELMET.d / 2 - HELMET.r, a = Math.abs(z) - flat;
  return a <= 0 ? top : top - HELMET.r + Math.sqrt(Math.max(0, HELMET.r * HELMET.r - a * a));
}

const def: CharacterDef = {
  id: 'turbo',
  palette: { body: '#D97757', shade: '#BE684D', accent: '#6A9BCC', detail: '#FAF9F5', eye: '#2A2A28' },
  eyeStyle: 'visor',
  eyes: { z: 0.396, color: '#F6F1E7', glow: 1.3, scale: 0.92 },
  sparkle: { at: [0, 0.54, 0.16], size: 0.9 },
  tiltBias: 0.05,
  accessories: [
    (k) => {
      k.add(rbox(HELMET.w, HELMET.h, HELMET.d, HELMET.r, k.q(3, 2, 1)).translate(0, HELMET.y, 0), { color: 'detail', surf: 'gloss' });
      // visor band (eyes are drawn on it)
      k.add(rbox(0.9, 0.25, 0.1, 0.05, k.q(2, 1, 1)).translate(0, 0.07, 0.342), { color: 'eye', surf: { rough: 0.08, metal: 0.2, glow: 0, coat: 1 } });
      // fin spoiler along the crown, rising toward the back
      const fin = extrude([[0.06, 0.36], [-0.28, 0.66], [-0.44, 0.66], [-0.38, 0.3]], 0.05, k.q(0.012, 0, 0)).rotateY(-Math.PI / 2);
      k.add(fin, { color: 'accent', surf: 'gloss' });
      if (k.lod === 2) return;
      // twin racing stripes following the shell
      for (const x of [0.12, -0.12]) {
        const pts: V3[] = [];
        for (let i = 0; i <= 8; i++) { const z = 0.37 - (i / 8) * 0.74; pts.push([x, topY(z) + 0.006, z * 1.005]); }
        k.add(ribbon(pts, 0.08, 0.012, k.q(12, 6, 4), [1, 0, 0]), { color: 'accent', surf: 'gloss' });
      }
      // "01" in 7-segment boxes on each side
      if (k.lod === 0) for (const s of [1, -1]) {
        [0, 1].forEach((d, i) => {
          for (const g of sevenSeg(d, 0.13, 0.024)) {
            g.translate((i - 0.5) * 0.1, 0, 0).rotateY(s * Math.PI / 2).translate(s * 0.553, 0.15, -0.04);
            k.add(g, { color: '#141413', surf: 'gloss' });
          }
        });
      }
      // chin vents
      for (const x of [-0.18, 0, 0.18]) k.add(box(0.1, 0.03, 0.02).translate(x, -0.12, 0.381), { color: 'accent', surf: 'gloss' });
    },
  ],
  emotes: {
    // checkered-flag wave → big arm wave; podium: visor polish shimmy
    win: (b) => ({ ...b, keys: { ...b.keys, aRr: [0, 0, 0.2, 1.5, 2.0, 1.5, 2.4, 0], aRf: wave(0.2, 2.0, 0.6, 8), aLr: [0, 0, 2.4, 0], aLf: [0, 0, 2.4, 0] } }),
    lobby: (b) => ({ ...b, keys: { ...b.keys, aRf: [0, 0, 0.3, 1.3, ...wave(0.4, 2.0, 0.25, 6, 1.3).slice(2), 2.4, 0], aRr: [0, 0, 0.3, 0.6, 2.0, 0.6, 2.4, 0] } }),
    lose: (b) => ({ ...b, keys: { ...b.keys, ry: wave(0.4, 1.9, 0.3, 6) } }),
  },
};
export default def;
