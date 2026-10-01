# M5-TRACK: V10 / V11 follow the M5 speeds (doc sync request)

`packages/trackc/src/validate.ts` now does the following:
- **V10** marches `V10_CLEAR = 2 × V_BOOST` = 90.22 m ahead of each boost pad; it was 88.8 m.
- **V11** sweeps landings over `[vmin, max(vmax, V11_REACH = 52)]`. This covers drag at 48.1 m/s and tap boost at 50.59 m/s on Balance, about 51.5 m/s on neon_blade (doc 15 §1–§2).
- **V11** adds an airtime check: the flight must last fewer than `V11_AIR_TICKS = 66` ticks, which is 6 below the 72-tick no-ground respawn. It is checked at the top speed, and at vmin for a downward lip.
- `.ctd` `vmax` keeps its meaning as the AI lip window.

No roster pad fails 90.2 m. The tightest is skyway_interchange main@20, which hits a wall at 93 m. Only the roster magma_switchback jump failed the 52 m/s sweep, and its `.ctd` was fixed.

The text below is outside the M5-TRACK lane. Please update it at merge:

**`docs/design/11-track-spec.md` §8.3**
```diff
-- Not within 15 m of an apex with R < 30 m; not in landing zones; no wall ahead within 2 s × v (≈ 90 m at 44.4 m/s).
+- Not within 15 m of an apex with R < 30 m; not in landing zones; no wall ahead within 2 s × V_BOOST (90.2 m at 45.11 m/s).
```

**`docs/design/11-track-spec.md` §8.4**
```diff
-- For every speed v in [vMin, vMax], the landing point at G = 28 m/s² must fall in [gapEnd + 2 m, landEnd − 5 m].
+- For every speed v in [vMin, max(vMax, 52)], the landing point at G = 28 m/s² must fall in [gapEnd + 2 m, landEnd − 5 m]. vMax is the AI lip window; 52 m/s is the M5 drag / tap-boost reach (doc 15).
+- Airtime < 66 ticks at the top speed (at vMin for a downward lip): the no-ground respawn fires at 72.
```

**`docs/design/11a-dsl-cookbook.md`, under "Boost pads"**
```diff
-2–4 per lap (V10 warns otherwise), ≥ 15 m from the apex of an R < 30 corner, not in landing zones, and ≥ 89 m of clear
-road straight ahead (2 s at 44.4 m/s) — put them early on long straights.
+2–4 per lap (V10 warns otherwise), ≥ 15 m from the apex of an R < 30 corner, not in landing zones, and ≥ 90.2 m of clear
+road straight ahead (2 s at 45.11 m/s) — put them early on long straights.
```

**`docs/design/11a-dsl-cookbook.md`, under "Jump with a real gap"**
```diff
-- **V11** checks every speed in [vmin, vmax] (G = 28 m/s²): the landing point must fall in
+- **V11** checks every speed in [vmin, max(vmax, 52)] (G = 28 m/s²; 52 m/s is the M5 tap-boost reach): the landing point must fall in
   `[gap + 2, gap + land − 5]` past the lip; landing ≥ 40 m, straight, ±10% grade. Tune `vmin` to the slowest
-  realistic approach (after the preceding corner) and lengthen `land` for fast approaches.
-  Worked numbers: lip 8°, lipH 0.70, drop 2 → 12.2 m at 22 m/s, 33 m at 46 m/s.
+  realistic approach (after the preceding corner) and lengthen `land` for fast approaches. Airtime must stay under 66 ticks.
+  Worked numbers: lip 8°, lipH 0.70, drop 2 → 12.2 m at 22 m/s, 33 m at 46 m/s, 39.6 m at 52 m/s.
```

**`docs/design/11a-dsl-cookbook.md`, the troubleshooting table**
```diff
-| V11 `at N m/s the kart lands … past the lip` | Shorten the gap, raise `lip`, add `drop`, lengthen `land`, or narrow [vmin, vmax]. |
+| V11 `at N m/s the kart lands … past the lip` | Shorten the gap, raise `lip`, add `drop`, lengthen `land`, or narrow [vmin, vmax]. Above vmax (the message says so) only the geometry helps: lengthen `land`, or shorten / lower the ramp. |
+| V11 `… ticks of air` | Less `drop` or a lower lip angle. |
```
