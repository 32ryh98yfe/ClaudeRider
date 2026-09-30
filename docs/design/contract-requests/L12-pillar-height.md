# L12 → L4: give `pillar` the exact deck clearance (optional refinement)

**Status.** TrackView (L11) now stretches pillars in Y by `(1 + variant)`, where variant is the 6 m height class. Both L12
kits build a 2.7 m base, the tallest height that is safe for every class (class v covers decks from 6v m for v ≥ 1, and
4–6 m for v = 0). As a result, pillars end 0.3–3.3 m under the deck.

**Ask (small).** In `trackc/src/props.ts`, place the pillar with the exact clearance in `scale`:
`add('pillar', s.x, g, s.z, yaw, 1, (s.y - g - 0.6) / 2.7 - 1)`. TrackView then keeps `(1 + variant)` working
unchanged, and it becomes exact once `variant` is allowed to be fractional. Alternatively, add a new optional field; any
exact height works for the kits.
