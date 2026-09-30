# L12 → L4 (or L11): tell the `pillar` prop how tall the deck is

**What.** Compiler-placed `pillar` props (every 15 m under decks > 4 m above the terrain) carry only a height class in
`variant` (0–3), and TrackView ignores `variant` for everything except chevrons. A kit cannot size one geometry to fit.

**Why.** Kits must stay under the lowest possible deck, so the Spark and Coral pillars are 3.4 m stubs. Under the
9–10 m decks of `sunset_arena_rally` they look unfinished.

**Diff (either).**
- L4 `trackc/src/props.ts` pillar placement: pass the clearance in `scale`, e.g.
  `add('pillar', s.x, g, s.z, yaw, (s.y - g - 0.6) / 6, 0)`. Kits then build a unit pillar 6 m tall.
- or L11 `TrackView`: for `pillar`, scale Y only by `(variant + 1) * 6 / H0`.
The first is simpler, and kits can adopt it without further coordination.
