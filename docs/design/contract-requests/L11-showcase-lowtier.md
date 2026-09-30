# L11 → orchestrator / L8: skip the Showcase's PMREM environment on the Low tier (boot time)

**Status:** applied in the L11 branch as a small additive edit to an L8 file. It needs a review at merge.

## Why

On the Low tier (SwiftShader in CI), boot → lobby took 25.8–33 s. The e2e limit is 16 s.

`tools/shots/boottime.mjs` and `compileprof.mjs` attribute most of that time to `createStudio()`, which calls `PMREMGenerator.fromScene(RoomEnvironment)` in the `Showcase` constructor:

- It renders a 256² cube, then runs about 10 GGX blur passes, all on the CPU rasterizer.
- The first tiny post programs that link afterwards absorb that work: 3.5 s, 6.6 s and 2.6 s "links" for 2.7 KB shaders.
- Every lit showcase program also compiles the cube-UV sampling code.

Low-tier library materials already ignore the scene environment (`materials/rigs.ts`, `lowEnv`), so on Low the PMREM bought almost nothing.

## Change (exact diff)

```diff
--- a/apps/client/src/render/showcase/Showcase.ts
-  constructor(renderer: THREE.WebGPURenderer, opts: { reflections?: boolean } = {}) {
+  constructor(renderer: THREE.WebGPURenderer, opts: { reflections?: boolean; env?: boolean } = {}) {
 …
-    this.studio = createStudio(renderer, s, { shadowSize: 2048 });
+    this.studio = createStudio(renderer, s, { shadowSize: 2048, env: opts.env ?? true });
--- a/apps/client/src/game/Stage.ts   (L11)
-    if (!this.showcase) this.showcase = new Showcase(this.renderer);
+    if (!this.showcase) this.showcase = new Showcase(this.renderer, { env: this.tier !== 'low' });
```

Medium and above are unchanged.

## Also in L11 (Stage, owned)

- **Material reveal.** On Low, the first showcase frames show its materials one per frame (`MaterialReveal` in `render/engine/warm.ts`). Each frame then links only a few programs, so the title and lobby keep handling input.
- **Race safety.** `RaceRenderer.init` calls `finishReveals()` before building, so shared materials are never left hidden.

## Result

Measured with the built client on lane port 8811:

| | before | after |
|---|---|---|
| ready | 30 s | 4.9 s |
| title | 30 s | 6.7 s |
| lobby | 31.4 s | 9.3 s |
| blocking links before the lobby | 27.8 s | 5.7 s |
