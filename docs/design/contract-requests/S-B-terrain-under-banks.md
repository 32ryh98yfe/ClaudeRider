# S-B: terrain and shoulders poke through the low side of banked roads

**Priority:** high for readability (karts look half-buried). Render-only: the measured .ctrk md5s don't change.

## What

On banked corners the baked terrain (and on some tracks the shoulder strip) near the road follows the centreline
height instead of the banked surface. So on the low (inside) side, terrain vertices lie *inside the road band* and
above the road. A kart on the inside line then looks sunk into sand or snow (review item: Sunstone Bazaar well-plaza
sweeper, `C R40 120 L bank=8 w=20 shoulder=3`).

Measured from the baked `.vis`: every terrain or shoulder vertex within ±1 m along and |u| ≤ w/2 across a road
sample, compared with the banked road height `y + ry·u`. Scratch script:
`scratchpad/lanes/B/visinfo.ts <theme>/<id> s0 s1`.

| Track | Vertices above the road band | Worst |
|---|---|---|
| sunstone_bazaar (whole lap) | 152 | +1.01 m, terrain at s 927, u −9.8 (well plaza, bank 8) |
| sunstone_bazaar s 860–1000 | 39 (terrain at \|u\| 3–9 m, shoulder:sand at \|u\| 9 m) | +1.01 m |
| sandglass_canyon (whole lap) | 139 | +0.66 m, terrain at s 1197, u +6.5 (U-turn, bank −9) |

THEME `hills=` does not change the near-road terrain (tested `hills=0` on Bazaar: same 39 vertices; the .ctrk md5 is
also unchanged). So a theme lane can't fix it.

## Proposed fix (packages/trackc/src/terrain.ts)

Where the terrain blends toward the road (the near-track reference height, `yRef`), use the banked road-edge height
on the matching side, `s.y + s.ry * u_edge`, instead of `s.y`. Also clamp terrain within the road band, plus a small
margin, to at most `road height − 0.15 m`. The shoulder strip should follow the bank's plane on the low side (or
drop with it). That clamp alone already hides the bug:

```diff
-      const h = blend(yRef, hillHeight, t);
+      // never above the banked road surface inside the road band (+0.5 m margin): the low side of a bank otherwise
+      // shows terrain through the road
+      const yRoad = s.y + s.ry * clampU(u, s.w / 2);
+      const h0 = blend(yRef, hillHeight, t);
+      const h = Math.abs(u) <= s.w / 2 + 0.5 ? Math.min(h0, yRoad - 0.15) : h0;
```

(Names are illustrative; lane S-B did not open trackc for edits.) Re-baking changes every banked track's .vis. Physics
and AI are not affected; no .ctrk change is expected, but please confirm with the golden md5s.
