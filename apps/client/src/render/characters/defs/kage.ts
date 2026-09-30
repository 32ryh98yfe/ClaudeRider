// Kage (카게) — ninja: charcoal hood (with two pointed hood tips) and full lower mask leave only an orange eye slit;
// a plain grey forehead plate with an engraved sparkle; long charcoal scarf tails streaming from the back knot.
import type { CharacterDef } from '../../mascot/rig.ts';
import { rbox, band, cone, sph, sparkle } from '../../mascot/shapes.ts';
import { tails } from '../parts.ts';
import { wave } from '../../mascot/emotes.ts';

const def: CharacterDef = {
  id: 'kage',
  palette: { body: '#D97757', shade: '#BE684D', accent: '#1F1E1D', detail: '#B0AEA5', eye: '#141413' },
  eyeStyle: 'slot',
  eyes: { scale: 0.8, y: 0.06 },
  sparkle: { at: [0, 0.78, 0.04], size: 0.85, color: 'detail' },
  tiltBias: 0.06,
  accessories: [
    (k) => {
      // hood over the crown, mask over the lower face: only the eye slit shows the orange body
      k.add(rbox(1.08, 0.3, 0.72, 0.15, k.q(4, 2, 1)).translate(0, 0.305, 0), { color: 'accent', surf: 'soft' });
      k.add(band(1.07, 0.71, 0.21, 0.33, 0.05, k.q(4, 2, 1), k.q(0.012, 0, 0)).translate(0, -0.19, 0), { color: 'accent', surf: 'soft' });
      // hood tips (reads from the chase camera as two sharp points)
      for (const s of [1, -1]) k.add(cone(0.11, 0.3, k.q(4, 4, 3)).rotateY(Math.PI / 4).rotateZ(-s * 0.32).rotateX(-0.22).translate(s * 0.3, 0.55, -0.1), { color: 'accent', surf: 'soft' });
      if (k.lod === 2) return;
      // forehead plate + engraved sparkle
      k.add(rbox(0.34, 0.1, 0.03, 0.02, k.q(2, 1, 1)).translate(0, 0.33, 0.36), { color: 'detail', surf: { rough: 0.32, metal: 0.7, glow: 0, coat: 0.4 } });
      if (k.lod === 0) k.add(sparkle(0.036, 1, 11).translate(0, 0.33, 0.378), { color: '#6E6C68', surf: 'metal' });
      // back knot + long scarf tails
      k.add(sph(0.06, k.q(10, 6, 4), k.q(8, 5, 3)).scale(1.3, 1, 0.8).translate(0, 0.3, -0.37), { color: 'accent', surf: 'soft' });
      tails(k, 'kageTail', [0, 0.3, -0.38], [0.05, -0.12, -1], 0.95, 0.11, 'accent', { spread: 0.13, droop: 0.22, thick: 0.024 });
    },
  ],
  emotes: {
    // smoke-puff vanish and reappear
    win: (b) => ({ duration: 2.4, keys: { s: [0, 0, 0.3, 0, 0.45, -1, 1.2, -1, 1.4, 0.1, 1.55, 0], y: [0, 0, 1.2, 0.3, 1.5, 0, 2.4, 0], ry: [0, 0, 1.2, 0, 1.6, Math.PI * 2, 2.4, Math.PI * 2] }, eyes: [[0, 'open'], [1.4, 'happy'], [2.2, 'open']], fx: [[0.35, 'smoke'], [1.25, 'smoke']] }),
    podium: (b) => ({ ...b, keys: { ...b.keys, ry: [0, 0, 0.3, 0, 1.2, Math.PI * 4, 2.2, Math.PI * 4] } }),
    attackLanded: () => ({ duration: 1.5, keys: { rx: [0, 0, 0.3, 0.5, 0.9, 0.5, 1.5, 0], aLf: [0, 0, 0.3, 1.2, 0.9, 1.2, 1.5, 0], aRf: [0, 0, 0.3, 1.2, 0.9, 1.2, 1.5, 0] }, eyes: [[0, 'blink'], [1.1, 'open']] }),
    gotHit: (b) => ({ ...b, fx: [[0.05, 'smoke']] }),
    lobby: () => ({ duration: 2.4, keys: { y: wave(0.2, 2.2, 0.03, 3, 0.05), aLf: [0, 0, 0.4, 1.2, 2.0, 1.2, 2.4, 0], aRf: [0, 0, 0.4, 1.2, 2.0, 1.2, 2.4, 0], aLr: [0, 0, 0.4, -0.3, 2.0, -0.3, 2.4, 0], aRr: [0, 0, 0.4, -0.3, 2.0, -0.3, 2.4, 0] }, eyes: [[0, 'open'], [0.4, 'blink'], [2.1, 'open']] }),
  },
};
export default def;
