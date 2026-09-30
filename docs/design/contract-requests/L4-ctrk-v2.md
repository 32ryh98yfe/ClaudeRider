# L4 contract request: `.ctrk` v2 (additive)

Lane: L4 TRACKC. Files: `packages/sim/src/track/format.ts` (FROZEN, additive edit; lock updated with
`node tools/check-frozen.mjs --update`), `packages/sim/src/track/BakedTrack.ts` (review-frozen interface, additive).
New file: `packages/sim/src/track/vis-format.ts` (see `L4-vis-v2.md`).

## What and why

| Change | Why | Who consumes it |
|---|---|---|
| `CTRK_VERSION` 1 → 2. v1 files still load (`readContainer` accepts ≤ 2). | Marks the float-storage and multi-path changes below. | everyone loading tracks |
| Float arrays (`p{k}.smp`, `p{k}.ai`, `p{k}.grav`, `g.pos`, `g.nrm`, `w.pos`) are stored as **f32**; `loadCtrk` widens them to f64 **once at load** (`Float64Array.from`). | `.ctrk ≤ 1.5 MB` (§10.2) for 3.8 km tracks with several paths. f32 → f64 is exact, so every engine reads identical numbers (ADR-003 still holds; no f32 state). | BakedTrack only (the layout constants `SMP`, `AIS` are unchanged) |
| `SFLAG.RAIL / WARP / BLEND / AREA` (bits 12–15). | Anti-cut / respawn / AI need to know rail spans, warp spans, junction blends and plaza guides. | L1 (anti-cut), L3 (AI) |
| `TFLAG.GORE / SLOPE` (bits 5–6). | Gore cushions (soft), halfpipe slope triangles (> 10° from the path up). | L1 (wall response), L11 (VFX) |
| `CtrkPathMeta.links[]` (`{at, to, toS, kind}`), `hostFrom/hostTo`, `branchKind`, `lineS`. | Graph-local locate follows successors/predecessors across junctions (gap-3 §2.3). `lineS` fixes `toMainS(0, s)` on p2p tracks. | BakedTrack.locate, L3 branch choice |
| `map` is in **sMain units**; branch `SMAIN` samples are stored **unwrapped** (they may exceed L when a branch crosses the line); the runtime wraps. | Linear interpolation between samples must stay monotonic. | BakedTrack |
| `ZoneBaked.aabb / gravMode / gravScale / camera`; kill planes appear as `kind:'kill'` zones with `belowY` (+ optional `aabb`). | `KILL lava belowY=… aabb=(…)`, `ZONE gravity`, `ZONE camera`. | L1 (kill, gravity), client camera |
| `JumpBaked.rampS / lipDeg / gapLen / drop / lipH / landW`. | Jump approach speeds (L3) and VFX. | L3, L11 |
| `HazardMotion` + `HazardDefBaked.motion / group / name / h`. | F5 analytic hazards; `hazardPose` evaluates the motion from `(tick + offset) mod period` only. | L1 (contacts), L11 (render) |
| `CtrkMeta.version / gates / junctions / signature / fallbacksTaken`. | Ordinary gates every 30 m (§8.1), junction gores (renderer, AI), bake report. | L3, L10, L11 |
| Per-path arrays `p{k}.grav` (f32, optional) and `p{k}.rok` (u8 respawn-ok). | Per-span low-gravity scales; respawn slots (§8.6). | BakedTrack |
| Per-path array `p{k}.rto` (i32, optional): respawn target sample per sample (−1 = in place). `rok` is 0 over every jump's run-up/ramp/gap and within 8 m (+ reach) of fixed hazards. | Jump-aware respawn (L4-respawn-jumps.md). | BakedTrack, L1 respawn.ts |
| `HazardMotion.plane` gains `'flat'` (horizontal sweep at pivot height). | F5 rotating sweepers. | BakedTrack, L11 |

### BakedTrack interface (all additions optional, so mocks stay valid)
- `HazardPose` gains optional `fx fy fz` (shape forward/long axis), `ux uy uz` (shape up / cylinder / arm axis), `phase ∈ [0,1)`.
- `respawnOk?(path, i)`, `respawnLoc?(loc, out)`, `zonesAt?(path, s, u, out, max)`, `flagsAt?(path, s)`.
- Behaviour changes (implementation only):
  - `locate` follows `links` near junctions with a 1 m² bias for switching paths (hysteresis through the overlapping junction surface); `railIn` links are not followed (rails are entered by capture). When the ±20/+40 window fails it retries ±90 before reporting failure.
  - `respawnPose`/`respawnLoc` read `p{k}.rto` when present (jump gaps respawn on the landing side, run-ups before a 2× standing-start run-up, never across the finish or forwards over a key gate); older bakes walk back ≤ 15 samples to the nearest respawn-ok sample. **L1 (required since the jump fix):** copy `respawnLoc(lastValid)` into both `race.loc` and `lastValid` after placing the kart, because the progress anti-cut rejects a placement > 10 m from `race.loc` (exact diff in `L4-respawn-jumps.md`).
  - `locate` widens its stacked-deck height window over jumps: h ∈ [−30, 30] on gap samples (JUMP|NO_GROUND) and h ≤ 20 on ramp/landing samples, so progress follows a kart through the flight.
  - `hazardPose` telegraph windows wrap over phase 0 (a hazard active from phase 0 is telegraphed at the end of the previous period).
  - `gravityAt` reads per-sample `p{k}.grav` when present.
  - `toMainS(0, s)` subtracts `lineS` on p2p tracks (was identity).

## Exact diff (`format.ts`)

```diff
@@ -1,24 +1,34 @@
 // FROZEN (contracts.lock). .ctrk physics/semantics format (see docs/design/11-track-spec.md).
+// v2 (L4, additive — docs/design/contract-requests/L4-ctrk-v2.md): float arrays may be stored as f32 (the loader widens
+// them to f64 once), multi-path links, junctions, gates, hazard motion, extra SFLAG/TFLAG bits. v1 files still load.
-export const CTRK_VERSION = 1;
+export const CTRK_VERSION = 2;
-/** Per-sample stride in `p{k}.smp` (Float64). */
+/** Per-sample stride in `p{k}.smp` (Float64 after load). */
-/** Per-sample stride in `p{k}.ai` (Float64). */
+/** Per-sample stride in `p{k}.ai` (Float64 after load). */
   SURF_MASK: 0x1f, RMF: 1 << 5, GRAV_SHIFT: 6, GRAV_MASK: 3 << 6, JUMP: 1 << 8, NO_ITEM: 1 << 9, NO_GROUND: 1 << 10, KILL: 1 << 11,
+  RAIL: 1 << 12, WARP: 1 << 13, BLEND: 1 << 14, AREA: 1 << 15,
-export const TFLAG = { SOFT: 1, INVISIBLE: 2, KILL: 4, LEDGE: 8, PROP: 16 } as const;
+export const TFLAG = { SOFT: 1, INVISIBLE: 2, KILL: 4, LEDGE: 8, PROP: 16, GORE: 32, SLOPE: 64 } as const;
+export interface PathLink { at: number; to: number; toS: number; kind: 'split' | 'merge' | 'railIn' | 'railOut' }
 export interface CtrkPathMeta {
+  links?: PathLink[]; hostFrom?: number; hostTo?: number; branchKind?: 'shortcut' | 'risk' | 'alt'; lineS?: number;
 export interface ZoneBaked {
+  aabb?: [number, number, number, number]; gravMode?: GravMode; gravScale?: number; camera?: string;
 export interface RailBaked {
+  hostFrom?: number; hostTo?: number; length?: number;
 export interface JumpBaked {
+  rampS?: number; lipDeg?: number; gapLen?: number; drop?: number; lipH?: number; landW?: number;
+export interface HazardMotion {
+  type: 'static' | 'piston' | 'pendulum' | 'rotate' | 'lane' | 'cross';
+  rise?: number; rampTicks?: number; pivotH?: number; arm?: number; ampDeg?: number; plane?: 'across' | 'along';
+  speed?: number; s0?: number; s1?: number; halfSpan?: number;
+}
 export interface HazardDefBaked {
+  motion?: HazardMotion; group?: number; name?: string; h?: number;
+export interface JunctionBaked { branch: number; host: number; kind: 'split' | 'merge'; hostS: number; gore?: PoseBaked }
 export interface CtrkMeta {
+  version?: number; gates?: { s: number; w: number }[]; junctions?: JunctionBaked[]; signature?: string[]; fallbacksTaken?: string[];
```

(`git diff m1 -- packages/sim/src/track/format.ts` shows the full formatting.)

## Optional follow-up for the orchestrator
- Add `export * from './track/vis-format.ts'` to `packages/sim/src/index.ts` (L4 does not own it). Until then the client can
  `import { decodeVis } from '@cr/sim/track/vis-format.ts'` (the package exports `./*`).
