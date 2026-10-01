# S-C: PROPS rows can place props inside or under another deck

**Lane:** S-C (theme lane C, neon_harbor + orbital_nexus stylized pass). **File:** `packages/trackc/src/props.ts` (read-only for the lane).

## What happens
`placeProps()` checks a row point against roads only near the **host sample's** height (`gi.heightAt(x, z, yRoad)`, ±5 m), then drops it onto the terrain (`groundY`). Where the row's point lies beside or under a **different** deck (an overpass that crosses the row's road, a helix, a stacked laser descent), two things go wrong:

1. The terrain there is tucked up under that other deck (terrain.ts: "tucks under the LOWEST deck that covers a point"), so the prop is placed at the terrain height just below the deck surface — **inside the deck**. Seen on Rainline Boulevard: a boulevard-side row at offset 34 m landed at y = 5.5 under the overpass ramp (deck 5.6), 3 m from its centreline.
2. Tall props whose origin is fine still reach up **through** a deck above them (the check is origin-only and height-blind). Seen on Orbital Express (warp approach under the station sweeper) and Rainline (blocks beside the bridge).

The lane worked around both with an offline clearance pass (every tower/far structure is a `PROP` placed ≥ 24–26 m from all road surfaces at any height) and by splitting `PROPS` rows around self-crossings. A compiler-side guard would make plain rows safe.

## Request (two small, additive changes)
1. **Drop row points that have a deck above them within 9 m** (catches case 1 and the common part of case 2):

```diff
@@ placeProps — PROPS rows, after the elevated-deck branch
-        add(cmd.kind, x, y, z, yawOf(smp.tx, smp.tz) + (side < 0 ? Math.PI : 0), (sc0 ?? 0.85) + pr() * ((sc1 ?? 1.15) - (sc0 ?? 0.85)), Math.floor(pr() * 4));
+        // another deck over this ground point (an overpass, a helix turn): the prop would stand inside or under it
+        if (gi.heightAt(x, z, y + 4.6, 4.4) !== null) { DROPS.underDeck++; continue; }
+        add(cmd.kind, x, y, z, yawOf(smp.tx, smp.tz) + (side < 0 ? Math.PI : 0), (sc0 ?? 0.85) + pr() * ((sc1 ?? 1.15) - (sc0 ?? 0.85)), Math.floor(pr() * 4));
```
   plus `underDeck: 0` in `DROPS` (reset with the others) and the stat in the bake report. Deck-edge props (y = the deck surface) are unaffected: their own deck is 4.6 m below the hint, outside the ±4.4 window.

2. **Optional `clear=<m>` on PROPS rows**: drop a point when any road surface sample lies within `clear` metres in plan at a height overlapping `[y − 1, y + 40]`. Rows of big props (blocks, towers, halls) would set `clear` to their footprint radius; existing rows (no attribute) behave as today.

Both are render-only (props live in the `.vis`); `.ctrk` bytes do not change. Existing tracks may lose a few instances that today stand inside decks.
