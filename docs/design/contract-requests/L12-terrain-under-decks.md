# L12 → L4: terrain beside raised (non-bridge) roads

**What.** In `trackc/src/terrain.ts`, points inside a road's footprint take `min(target, natural)`. For a road raised
above the track's lowest point, `natural` (≈ baseY − 1.5) wins, so the terrain drops to the base level under the road,
and 3 m past the shoulder it jumps back up to the road height. That leaves a trench along every raised section.
Measured: a +6 m section had a 7.5 m trench at the road edge, and pillars were then placed in it.

**Why.** Cliff roads, climbing esses and approaches look like causeways over ditches. The walls hide most of it from the
chase camera, but it shows in flyovers and replays. I worked around it:
- the Spark GP esses are capped at +2 m;
- Coral Cove tracks use `terrain=none` with cliff and beach props.

**Diff (proposed).** Keep the trench only where something should be visible below (stacked lower deck, jump gap, open
kill ledge); otherwise tuck the terrain just under the road:
```ts
// terrain.ts, inside the grid loop
if (best < edge) y = drop || stackedBelow ? Math.min(target, natural) : target;
```
`stackedBelow` = another deck within the footprint more than 8 m lower (the `near` list already has them).
