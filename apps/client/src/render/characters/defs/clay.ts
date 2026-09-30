// Clay (클레이) — classic Clawd: terracotta block, ivory racing scarf, sparkle tuft.
import type { CharacterDef } from '../../mascot/rig.ts';
import { merge, paint, place, rbox, box } from '../../util/geo.ts';

const def: CharacterDef = {
  id: 'clay',
  palette: { body: '#D87656', shade: '#BE684D', accent: '#FAF9F5', detail: '#141413', eye: '#141413' },
  eyeStyle: 'slot',
  sparkle: '#FAF9F5',
  accessories: [
    (p) => ({
      anchor: 'body',
      geometry: merge([
        paint(place(rbox(1.04, 0.1, 0.68, 0.04, 2), 0, 0.12, 0), p.accent),
        paint(place(box(0.14, 0.06, 0.5), -0.3, 0.1, -0.52, -0.5, 0.25, 0), p.accent),
        paint(place(box(0.12, 0.05, 0.42), -0.18, 0.06, -0.62, -0.7, -0.2, 0), p.accent),
      ]),
    }),
  ],
};
export default def;
