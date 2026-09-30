// Clay (클레이) — the classic Clawd: pure terracotta block, ivory racing scarf with two trailing verlet tails,
// and an oversized sparkle tuft so the silhouette reads from the chase camera.
import type { CharacterDef } from '../../mascot/rig.ts';
import { band, ribbon, rbox } from '../../mascot/shapes.ts';
import { hops } from '../../mascot/emotes.ts';

const def: CharacterDef = {
  id: 'clay',
  palette: { body: '#D87656', shade: '#BE684D', accent: '#FAF9F5', detail: '#D97757', eye: '#141413' },
  eyeStyle: 'slot',
  sparkle: { color: 'ivory', size: 1.35, at: [0, 0.5, 0] },
  accessories: [
    (k) => {
      // scarf wrap hugging the body's rounded corners, sitting low like a neckerchief
      k.add(band(1.06, 0.7, 0.21, 0.13, 0.05, k.q(4, 2, 1), k.q(0.014, 0.01, 0)).translate(0, -0.13, 0), { color: 'accent', surf: 'soft' });
      if (k.lod === 2) return;
      k.add(rbox(0.16, 0.13, 0.08, 0.04, k.q(2, 1, 1)).translate(-0.2, -0.1, -0.345), { color: 'accent', surf: 'soft' });
      // two tails trailing from the knot, one longer (verlet chains, 5 joints)
      const tails: Array<[string, number, number]> = [['tailA', -0.24, 1], ['tailB', -0.13, 0.78]];
      for (const [name, x, l] of tails) {
        const pts = [
          [x, -0.1, -0.36], [x - 0.05, -0.12, -0.36 - 0.17 * l], [x - 0.09, -0.16, -0.36 - 0.34 * l], [x - 0.12, -0.21, -0.36 - 0.5 * l], [x - 0.14, -0.27, -0.36 - 0.64 * l],
        ] as const;
        const ch = k.chain(name, 'body', pts, { stiffness: 0.5, wind: 1, flutter: 1.2 });
        k.add(ribbon(pts, 0.12, 0.028, k.q(12, 6, 3), [1, 0, 0], 0.8), { color: 'accent', surf: 'soft', skin: ch.skin });
      }
    },
  ],
  emotes: {
    // win: the tuft spins up like a propeller + a thumbs-up hop
    win: (b) => ({ ...b, keys: { ...b.keys, spin: [0, 0, 0.3, 26, 1.7, 26, 2.3, 0], ry: [0, 0, 2.4, 0], y: hops(0.1, 1.2, 0.22, 3) } }),
    lobby: (b) => b,
  },
};
export default def;
