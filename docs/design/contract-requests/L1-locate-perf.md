# L1 → L4: faster `BakedTrack.locate` (step budget, no per-tick allocation)

**File:** `packages/sim/src/track/BakedTrack.ts` (owned by L4). This request is additive and internal: no API change,
and the results match the ascending scan. L1 has not changed the file.

## Why

`tools/bench/step.ts` replays a recorded 8-kart meadow_loop race through `step()`, without AI. Profiling shows that
`locate()` → `searchWindow()` → `projectOn()` is the largest single cost of a kart-tick:

- Every kart-tick projects onto 61 segments (a window of −20 … +40), and more near links.
- `projectOn` returns its squared distance as a double from a call that is not inlined, so V8 boxes one heap number per
  segment. This is most of the remaining per-tick allocation measured by `tools/bench/alloc.ts`.

## Change

1. `projectOn` becomes `void`. It stores the squared distance in a `lastD2` field instead of returning it.
2. `searchWindow` scans outward from the centre (0, +1, −1, +2, …), so a good candidate is found within the first few
   segments.
3. It then skips any segment whose start point is farther away than `sqrt(best − bias) + segment length + 1e-6`.
   - Such a segment cannot contain a closer point (triangle inequality), so the pruning is exact.
   - The 1e-6 m slack means floating-point rounding can never prune a tie.
4. Ties keep the lowest `k` of the same window, which is what the ascending scan did. A candidate from an earlier
   window still wins a tie, because the comparison stays strict unless the current best came from this window.

## Diff (against the current file on the orchestrator branch)

```diff
@@ class BakedTrackImpl
   private tmpFrame: FrameSample = { … };
+  private lastD2 = 0;
   private cand: TrackLoc = { … };
@@
-  private projectOn(pd: PathData, pathIdx: number, i: number, px: number, py: number, pz: number, out: TrackLoc): number {
+  private projectOn(pd: PathData, pathIdx: number, i: number, px: number, py: number, pz: number, out: TrackLoc): void {
@@
     out.valid = lateralOk && heightOk ? 1 : 0;
-    return dx * dx + dy * dy + dz * dz;
+    // squared distance kept in a field, not returned: a double returned from a non-inlined call is boxed (one heap
+    // number per segment tested)
+    this.lastD2 = dx * dx + dy * dy + dz * dz;
   }
 
+  /**
+   * Scans segments center−back … center+fwd, outward from the centre so the best candidate is found early. A segment
+   * whose start lies farther than sqrt(best − bias) + its own length cannot hold a closer point, so its projection
+   * is skipped: exact pruning (a skipped segment is strictly worse). Ties keep the lowest k, as an ascending scan.
+   */
   private searchWindow(pathIdx: number, center: number, back: number, fwd: number, px: number, py: number, pz: number, best: { d: number }, out: TrackLoc, bias: number): void {
-    const pd = this.paths[pathIdx]!;
+    const pd = this.paths[pathIdx]!, S = pd.smp, st = SMP.STRIDE;
     const nSeg = pd.meta.n - 1;
-    for (let k = -back; k <= fwd; k++) {
+    let r = best.d < 1e29 && best.d > bias ? Math.sqrt(best.d - bias) : best.d < 1e29 ? 0 : 1e15;
+    let mine = false, bestK = 0;
+    const span = back > fwd ? back : fwd;
+    for (let j = 0; j <= 2 * span; j++) {
+      const k = (j & 1) === 1 ? (j + 1) >> 1 : -(j >> 1);
+      if (k < -back || k > fwd) continue;
       let i = center + k;
       if (pd.meta.closed) { i %= nSeg; if (i < 0) i += nSeg; }
       else if (i < 0 || i >= nSeg) continue;
-      const d = this.projectOn(pd, pathIdx, i, px, py, pz, this.cand) + bias;
-      if (this.cand.valid && d < best.d) { best.d = d; copyLoc(out, this.cand); }
+      const a = i * st, b = a + st;
+      const ax = px - S[a]!, ay = py - S[a + 1]!, az = pz - S[a + 2]!;
+      const ex = S[b]! - S[a]!, ey = S[b + 1]! - S[a + 1]!, ez = S[b + 2]! - S[a + 2]!;
+      const lim = r + Math.sqrt(ex * ex + ey * ey + ez * ez) + 1e-6; // slack: rounding never prunes a tie
+      if (ax * ax + ay * ay + az * az > lim * lim) continue;
+      this.projectOn(pd, pathIdx, i, px, py, pz, this.cand);
+      const d = this.lastD2 + bias;
+      if (this.cand.valid && (d < best.d || (mine && d === best.d && k < bestK))) {
+        best.d = d; mine = true; bestK = k; copyLoc(out, this.cand);
+        r = d > bias ? Math.sqrt(d - bias) : 0;
+      }
     }
   }
```

The ready-to-copy file is `BakedTrack.v2patched.ts` in L1's scratchpad; the diff above is the whole change.

## Evidence

The run is the meadow_loop speed race: 7247 ticks with 8 karts, replayed with `node tools/bench/step.ts meadow_loop speed 5`.
The machine was shared (load average around 15 on 4 cores), so CPU time is the figure to compare. The unpatched and
patched runs were interleaved.

| | step() CPU time per kart-tick | step() wall time (noisy) | allocation per tick (`tools/bench/alloc.ts`) | replay hash |
|---|---|---|---|---|
| current file | 5.50–5.78 µs | 5.56–9.72 µs | ≈ 15.5 KB (8.1 KB in `projectOn`) | a0ade045 |
| patched | 5.02–5.14 µs | 5.19–7.24 µs | ≈ 9.4 KB | a0ade045 (identical) |

- The step budget (≤ 6 µs per kart-tick, excluding AI) is met without the patch as well; the patch adds about 10% of
  headroom.
- The replay hash is unchanged, which shows the pruning selects the same locations.
- What still allocates is V8 boxing doubles passed to non-inlined calls through the frozen `BakedTrack` query API
  (`groundRay` and `sphereWalls` arguments, about 0.8–1.6 KB per tick each). Removing it would need a scratch-object
  query API, which is not requested here.
