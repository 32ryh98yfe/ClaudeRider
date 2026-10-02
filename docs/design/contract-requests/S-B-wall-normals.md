# S-B: smooth wall normals on curves (curved walls read as planks)

**Priority:** medium (visual only; changes .vis files, never a .ctrk).

## What

`packages/trackc/src/render.ts` `wallsToRender` gives every wall quad one flat normal (`w.out` / `-w.out` / `up`). On
curves each 1–2 m segment is shaded differently, so rock, stone and barrier walls on bends show vertical bands that
read as a wooden plank fence (clearly visible on the Sandglass Canyon T1 and slot-canyon walls, Sunstone Bazaar's
oasis corner and Aurora Summit's hairpins). Straight walls are unaffected.

## Why

Doc 34 asks for crisp, organised structures without noise; the banding is a frame-wide stripe pattern on every bend.
Theme kits cannot fix it in a material (the per-vertex normal is already flat in the .vis).

## Proposed diff (two passes: average `out` per shared wall end, then use it for the inner and outer faces)

```diff
 export function wallsToRender(rb: RenderBuilder, walls: WallQuad[], ao: (x: number, y: number, z: number) => number): void {
   const T = 0.45;
+  // smooth shading on curves: average the outward vector of the quads that share a bottom corner
+  const key = (p: readonly number[]): string => `${Math.round(p[0]! * 20)},${Math.round(p[1]! * 20)},${Math.round(p[2]! * 20)}`;
+  const acc = new Map<string, [number, number, number]>();
+  for (const w of walls) for (const p of [w.a0, w.b0]) {
+    const k = key(p), v = acc.get(k) ?? [0, 0, 0];
+    v[0] += w.out[0]; v[1] += w.out[1]; v[2] += w.out[2]; acc.set(k, v);
+  }
+  const outAt = (p: readonly number[], fb: readonly number[]): number[] => {
+    const v = acc.get(key(p)); const l = v ? Math.hypot(v[0], v[1], v[2]) : 0;
+    return l > 1e-6 ? [v![0] / l, v![1] / l, v![2] / l] : [fb[0]!, fb[1]!, fb[2]!];
+  };
   for (const w of walls) {
 …
-    const quad = (p00, p01, p10, p11, n, u0, u1): void => {
-      const q0 = V(p00, n, u0, va), q1 = V(p01, n, u1, va), q2 = V(p10, n, u0, vb), q3 = V(p11, n, u1, vb);
+    // nA / nB: per-end normals (row A, row B); the winding test still uses the quad normal n
+    const quad = (p00, p01, p10, p11, n, u0, u1, nA = n, nB = n): void => {
+      const q0 = V(p00, nA, u0, va), q1 = V(p01, nA, u1, va), q2 = V(p10, nB, u0, vb), q3 = V(p11, nB, u1, vb);
 …
-    quad(a0, a1, b0, b1, inN, 0, 0.33);
+    const oA = outAt(a0, o), oB = outAt(b0, o);
+    quad(a0, a1, b0, b1, inN, 0, 0.33, [-oA[0]!, -oA[1]!, -oA[2]!], [-oB[0]!, -oB[1]!, -oB[2]!]);
     quad(a1, A1o, b1, B1o, up, 0.33, 0.66);
-    quad(A1o, A0o, B1o, B0o, o, 0.66, 1);
+    quad(A1o, A0o, B1o, B0o, o, 0.66, 1, oA, oB);
   }
 }
```

Walls on the two sides of a road never share a corner, and wall ends (gaps, kind changes) keep their flat normal, so
hard corners stay crisp. Every track's .vis changes after a re-bake; no .ctrk, collision or validator result changes.
Lane S-B did not touch trackc; its walls simply keep the banding until this lands.
