# L12 → L4: three DSL papercuts found while authoring

1. **`wallR=none::ledgeKill` (cookbook §6) is rejected.** The error is "bad wall spec … (type:height[:soft][:ledgeKill])".
   `none:0:ledgeKill` works. Either accept the empty height or fix the cookbook example.
2. **PROPS ranges that wrap past the line are not wrapped.** For example, `from=@quay_corner to=@harbour_corner` on a
   circuit gives `s1 += L` in `props.ts`, but `sampleAt(P, s)` clamps `s > L` to the end. Rows collapse onto the last
   sample and are dropped. Suggested fix: wrap `s` modulo the length for closed paths.
3. **The "no floating props" check drops props on the high side of banked corners.** `yRoad = smp.y + smp.ry·u`
   extends the banked road plane outward, so at an 8° bank any row more than about 19 m out is "3 m above the terrain"
   and gets dropped (a hairpin grandstand and its tyre wall vanished). Suggested fix: use the road-edge height
   (`smp.y + smp.ry·(w/2 + sh)`) instead of the height at `u`.
