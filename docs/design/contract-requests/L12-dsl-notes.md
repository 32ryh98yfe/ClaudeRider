# L12 → L4: three DSL papercuts found while authoring

1. **`wallR=none::ledgeKill` (cookbook §6) is rejected.** The error is "bad wall spec … (type:height[:soft][:ledgeKill])".
   `none:0:ledgeKill` works. Either accept the empty height or fix the cookbook example.
2. **PROPS ranges that wrap past the line are not wrapped.** For example, `from=@quay_corner to=@harbour_corner` on a
   circuit gives `s1 += L` in `props.ts`, but `sampleAt(P, s)` clamps `s > L` to the end. Rows collapse onto the last
   sample and are dropped. Suggested fix: wrap `s` modulo the length for closed paths.
3. **Junction exclusion covers the whole branch span on the host.** A branch that runs alongside its host (pit lane,
   net-shed alley) loses every host-side PROPS row for its full length. Suggested fix: limit the `junction` exclusion
   to the split and merge blend windows (±blend), not `hostS0…hostS1`.
