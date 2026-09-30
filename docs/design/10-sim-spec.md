# 10 — Kart simulation spec

Owner: L1 SIM (dynamics, race rules), with L2 ITEMS (effects hooks) and L3 AI (inputs only).
Code: `packages/sim/src/{core,kart,race,track}/**`, `step.ts`. Contracts: B1–B5 in `02-contracts.md`.
Sources: ADR-003, ADR-004, ADR-005, ADR-006 (collision), ADR-008 (race flow); gap-2 report and `docs/research/sim-prototype.md` (the validated oracle, copied to `packages/sim/test/oracle/proto2d.ts`).

Status keys: **[S]** sourced · **[V]** validated by gap-2 · **[P]** proposed here. Durations are integer ticks at 60 Hz, seconds in parentheses. Speeds in m/s; displayed km/h = 5.4 × m/s.

---

## 1. Conventions

### 1.1 Frames and signs
- World: right-handed, +Y up, metres. North is −Z (gap-3 §7).
- Every kart carries an orthonormal frame, stored in `KartBody`:
  - `n` = kart up (the smoothed ground normal when grounded),
  - `f` = forward (unit, perpendicular to `n`),
  - `l = n × f` = **left** (derived each tick, not stored).
- **The sim uses the prototype's sign convention.** Positive yaw rate and positive internal steering turn the kart **left** (counter-clockwise seen from `+n`). The wire input is "+ = right", so the latch negates it: `σ = −steer / 127`.
- `driftDir` = +1 for a left drift, −1 for a right drift (the sign of σ at entry).
- Lateral speed `w = v·l` (positive = moving left). Slip sine toward the outside of the drift: `sb = −driftDir · w / |v|`.
- Mapping to the 2D oracle: proto2d (x, y) ↔ world (x, −z) with `n = +Y`. With this mapping the 3D step on a flat plane must reproduce proto2d (§14.7).
- Track frames (`FrameSample`) use `t` (tangent), `r` (right) and `u` (up); `TrackLoc.u` is the lateral offset along `r` (positive = right of centreline), `h` the height along `u`.

### 1.2 Arithmetic (ADR-003)
- Allowed in `sim/src/**` except `ai/**`: `+ − * /`, comparisons, bit ops, `Math.sqrt/abs/min/max/floor/ceil/round/trunc/sign/fround/imul`.
- Helpers in `sim/src/core/math.ts`:
  - `decayF(k, dt) = 1 / (1 + x(1 + x(0.5 + x/6)))`, x = k·dt: rational stand-in for e^(−k·dt), ≤ 0.175% relative error for k ≤ 30 s⁻¹ [V].
  - `smallSin(a) = a(1 − (a²/6)(1 − a²/20))`, `smallCos(a) = 1 − (a²/2)(1 − a²/12)`, valid for |a| ≤ 0.2 rad (the largest per-tick rotation is 0.07 rad, the drift kick).
  - `SIN.d3 … d55` literal constants; `COS110 = −0.3420201433256687`.
- `rotate(f, a)`: `f' = f·smallCos(a) + l·smallSin(a)`, then renormalize. This is exactly proto2d `rotH`.
- Constants below that are written as sines (sin 6°, sin 8°, sin 15°, sin 45°, sin 55°) are the literals from `SIN`.

### 1.3 Timer convention [P]
- Every countdown field (`boostTicks`, `instTicks`, `stunTicks`, …) is decremented by 1 in **phase 8** (floor 0). A countdown is **active** in a phase when it is > 0 as that phase reads it.
- A countdown that must stay active for **N kart-dynamics phases** is written as **N** when it is set in phases 1–3 (it covers the current tick) and **N + 1** when it is set in phases 4–7 (it covers the next N ticks). All constants in this document are the *effective* N; code adds the +1 where required and names the constant `*_TICKS`.
- Absolute-tick fields (`…Until`, `…End`, `rouletteEnd`, `respawnUntil`, `boxRespawn[]`) are compared as `tick < field`. Phase 8 **canonicalizes** every absolute-tick field whose value is ≤ the current tick to **0**, so a snapshot never carries history and `hashWorld` is identical on every peer (§15.2).

---

## 2. Global constants (ADR-004)

| Name | Value | Note |
|---|---|---|
| `TICK_HZ`, `DT` | 60, 1/60 s | ADR-001 units.ts |
| `V_REF` | 34.0 m/s | every item speed is relative to this |
| `V_GRIP` (Balance) | 34.0 m/s | 183.6 km/h shown [S 183.33] |
| `V_BOOST` (Balance) | 44.4 m/s | 239.8 km/h shown [S 239.54] |
| `KMH_PER_MPS` | 5.4 | display = v·3.6·1.5 |
| `G` | 28 m/s² | fixed; V11 jump validation uses it |
| `MAX_KARTS` | 8 | |
| Kart collider | sphere r = 0.85 m, centre 0.6 m above the contact point along `n` | walls and kart contacts |
| Ground ray | origin `p + 1.0·up`, direction `−up`, `maxT` 2.0 m | ADR-006 |
| Ground normal threshold | `n_hit · up > cos 65° = 0.4226` | gap-3 |
| Snap distance | 0.35 m below `p` while already grounded | gap-3 hover [P] |
| Coyote | 6 ticks (0.10 s) | ADR-004 |

---

## 3. Kart specs

### 3.1 Archetypes (ADR-004) [V]
| Stat | Speed | Balance | Drift |
|---|---|---|---|
| `vGrip` (m/s) | 34.4 | 34.0 | 33.6 |
| `vBoost` (m/s) | 45.0 | 44.4 | 43.8 |
| `a0` (m/s²) | 16.5 | 18 | 19.5 |
| `tBoostTicks` | 186 (3.1 s) | 180 (3.0 s) | 174 (2.9 s) |
| `g0` (gauge) | 0.64 | 0.70 | 0.77 |
| `kLatIn` / `kLatNeutral` (s⁻¹) | 2.8 / 5.2 | 3.0 / 5.5 | 3.3 / 5.9 |
| `yGrip` (rad/s) | 1.50 | 1.55 | 1.60 |
| `cBeta` | 0.85 | 0.80 | 0.75 |
| `weight` | 1.10 | 1.00 | 0.92 |

Shared by all archetypes: `kLatCounter` 9.0 s⁻¹, `kLatGrip` 18 s⁻¹, grip η 0.10, drift η 0.80, `kYawGrip` 12 s⁻¹, `kYawDrift` 6 s⁻¹.

### 3.2 Kart bodies (`packages/content/src/karts/*.ts`, current values)
| id | Archetype | vGrip | vBoost | a0 | tBoostTicks | g0 | kLatIn/kLatNeutral | yGrip | cBeta | weight | Unlock level |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pebble | balance | 34.0 | 44.4 | 18.0 | 180 | 0.70 | 3.0 / 5.5 | 1.55 | 0.80 | 1.00 | 1 |
| clay_comet | balance | 34.0 | 44.4 | 18.2 | 180 | 0.70 | 3.0 / 5.5 | 1.55 | 0.80 | 0.98 | 4 |
| arrowhead | speed | 34.4 | 45.0 | 16.5 | 186 | 0.64 | 2.8 / 5.2 | 1.50 | 0.85 | 1.10 | 8 |
| tugboat | balance | 34.0 | 44.4 | 17.8 | 180 | 0.70 | 3.0 / 5.5 | 1.55 | 0.80 | 1.20 | 12 |
| glacier_sled | drift | 33.6 | 43.8 | 19.5 | 174 | 0.77 | 3.3 / 5.9 | 1.60 | 0.75 | 0.92 | 16 |
| neon_blade | speed | 34.4 | 45.2 | 16.3 | 186 | 0.64 | 2.8 / 5.2 | 1.50 | 0.85 | 1.10 | 20 |
| jet_kettle | drift | 33.5 | 43.8 | 19.5 | 174 | 0.78 | 3.3 / 5.9 | 1.60 | 0.75 | 0.92 | 24 |
| crown_cruiser | speed | 34.4 | 45.0 | 16.5 | 186 | 0.64 | 2.8 / 5.2 | 1.52 | 0.85 | 1.15 | 30 |

- ADR-004 allows at most ±1% per-body variation on top of the archetype. A few current values exceed that slightly (clay_comet a0 +1.1%, tugboat a0 −1.1%, neon_blade a0 −1.2%, jet_kettle g0 +1.3%, crown_cruiser yGrip +1.3%). The binding gate is the archetype lap-spread test (≤ ±2%, §14.8); L1 must either confirm those values with the test or pull them inside ±1%.
- Derived per kart: `vInst = 1.05·vGrip`, `vDraft = 1.05·vGrip`, `vTeam = 1.02·vBoost`.
- Item mode uses the same specs with the gauge turned off (gap-2 §2).

---

## 4. State

`WorldState` and its parts are defined in B2. This section gives the meaning, unit and quantization grid of every field. "Grid" refers to §15.

### 4.1 `WorldState`
| Field | Type | Meaning |
|---|---|---|
| `tick` | int | Tick counter; 0 is race creation. Incremented at the start of `step()`. |
| `phase` | 0–4 | `PRE`, `COUNTDOWN`, `RACING`, `RETIRE_TIMER`, `DONE` (§12.7) |
| `goTick` | tick | `cfg.introTicks + cfg.countdownTicks` |
| `firstFinishTick` | tick | 0 until the first finish |
| `endTick` | tick | Retire deadline or hard-cap tick; 0 until known |
| `karts[8]` | `KartState` | By slot; empty slots have `spec = 0` and are skipped everywhere |
| `teams[]` | `TeamState` | `gauge` (grid GAUGE, 0…2·teamSize), `granted` (count) |
| `effects[]` | `EffectInstance` | Sorted by `id`; see `12-items-spec.md` |
| `projectiles[]`, `hazards[]` | | Item objects, sorted by `id` |
| `boxRespawn` | `Int32Array[nBoxes·8]` | Tick at which box b is available again for slot s (0 = available) |
| `seq` | uint32 | mulberry32 state (public randomness: bot mistakes, cosmetic-free sim rolls) |
| `decisions` | log | Authority decisions (B3); excluded from `hashWorld` |

### 4.2 `KartBody`
| Field | Unit | Grid | Meaning |
|---|---|---|---|
| `px, py, pz` | m | POS | Contact point (bottom centre of the kart) |
| `vx, vy, vz` | m/s | VEL | World velocity |
| `fx, fy, fz` | unit | DIR | Forward; renormalized and re-orthogonalized to `n` at the start of phase 3 |
| `nx, ny, nz` | unit | DIR | Kart up / contact normal |
| `yawRate` | rad/s | YAW | Angular velocity about `n` (+ = left) |
| `grounded` | 0/1 | | Ground found this tick (§5.2) |
| `coyote` | ticks | | 6 while grounded; counts down while not |
| `airTicks` | ticks | | Consecutive ticks with `grounded = 0` |
| `surf` | code | | Surface code of the last ground triangle (`SURFACE_IDS` index + 1) |
| `wallContact` | 0/1 | | Sphere touched a wall in the last half-step |
| `ghostTicks` | ticks | | Kart–kart contacts disabled while > 0 |

### 4.3 `KartDrive`
| Field | Unit | Grid | Meaning |
|---|---|---|---|
| `drift` | 0/1 | | Drifting |
| `driftDir` | −1/+1 | | +1 left, −1 right |
| `driftTicks` | ticks | | Ticks since entry (incremented in K11) |
| `driftPeak` | sine | SLIP | Peak outward slip sine of the current drift |
| `reDriftLock` | ticks | | Entry lockout after an exit (6) |
| `gauge` | 0…1 | GAUGE | Drift gauge |
| `fatigueTicks` | ticks | | T_f · 60; +1 per drifting tick, −1 per non-drifting tick, floor 0 |
| `boosters` | 0–2 | | Stored normal boosters |
| `teamBoosters` | 0–2 | | Stored team boosters; `boosters + teamBoosters ≤ 2` |
| `boostTicks` | ticks | | Remaining boost of kind `boostKind` (normal, team, item) |
| `boostKind` | 0–4 | | none, normal, team, start, item (B2). Start boosts use `startTicks`; kind 3 is reported for VFX while `startTicks > 0` and `boostTicks = 0` |
| `startTicks` | ticks | | Remaining start boost (§7.1). During `PRE`/`COUNTDOWN` it stores the start-press encoding (§7.1.3) |
| `wheelspinTicks` | ticks | | False-start wheelspin (acceleration ×0.3) |
| `instWindow` | ticks | | Instant-boost window remaining |
| `instTicks` | ticks | | Instant-boost (and escape-boost) effect remaining |
| `stunTicks` | ticks | | Wall stun remaining (not an item effect) |
| `draftCharge` | ticks | | Slipstream charge 0…120 |
| `draftTicks` | ticks | | Draft active remaining |
| `prevHeld`, `prevThrottle` | | | Last tick's `held` and `throttle`, for edges |

### 4.4 `KartItems`, `KartStatus`
Specified in `12-items-spec.md` §6. The sim reads `status.modMask` (a bitmask of active effect mods, rebuilt in phase 2 each tick) and `status.cc` (the active hard-CC effect code, 0 = none).

### 4.5 `KartRace`
| Field | Unit | Meaning |
|---|---|---|
| `loc` | `TrackLoc` | Current graph location (path, sample `i`, `s`, `u`, `h`, `sMain`, `valid`) |
| `lastValid` | `TrackLoc` | Last accepted **main-line** location (respawn anchor) |
| `lap` | int | Completed laps. Circuit: −1 on the grid (behind the line), 0 after crossing the start line, `laps` when finished. Point-to-point: 0 on the grid (sMain < 0), 1 at the finish |
| `keyMask` | bits | Key gates passed on this lap (bit k = key gate k) |
| `raceDist` | m | D = lap·L + sMain (ADR-006). Negative on the grid. Grid POS |
| `lapStartTick`, `bestLapTicks` | ticks | Lap timing |
| `finishTick`, `finishFrac` | tick, 0…1 | Finish crossing tick and sub-tick fraction (§12.6) |
| `rank` | 1–8 | Current rank |
| `wrongWayTicks`, `offGraphTicks` | ticks | Counters (§12.3, §12.4) |
| `respawnPhase` | 0/1/2 | 0 none, 1 fading out, 2 placed and frozen |
| `respawnUntil` | tick | End of the current respawn phase. **While `respawnPhase = 0` it holds the count of consecutive ticks below 3 m/s** (manual-R rule, §12.5) [P, see §16] |
| `manualCooldownUntil` | tick | Manual-R cooldown |
| `retired` | 0/1 | Set by the retire timer or the hard cap |

---

## 5. Tick order (ADR-005)

`step(w, inputs, ctx)` mutates `w` in place and runs these phases in this order, on authority and predictor alike. Karts are processed by slot; effects, projectiles and hazards by id.

| Phase | Work | Section |
|---|---|---|
| 0 | `w.tick += 1` | — |
| 1 | **Latch inputs** for every kart; derive drift and throttle edges from `prevHeld`/`prevThrottle`; apply input-modifying effects | §5.1 |
| 2 | **Effects starting now** (`start == tick`), in `effectId` order; rebuild `modMask`/`cc` | `12-items-spec.md` §6 |
| 3 | **Kart dynamics**, integrated once per kart (K0–K19) | §6–§9 |
| 4 | **Move and collide** in 2 half-displacements: for each half, every kart moves `v·DT/2`, then ground ray, then wall sphere; after all karts moved, kart–kart contacts | §10, §11 |
| 5 | **Projectiles and hazards**: commits, landings, contacts; track hazards | `12-items-spec.md`, §13.6 |
| 6 | **Items**: use edges (`onUse`), swap, box pickups, roulette | `12-items-spec.md` §4–§5 |
| 7 | **Progress, laps, rank and rules**: `locate`, anti-cut, gates, laps, finish, draft cones, wrong way, respawn triggers and sequencing, retire timer, hard cap, race end | §7.5, §12 |
| 8 | **Timers**: decrement countdowns, canonicalize expired absolute ticks, end effects (`onEnd`), coyote/air counters | §1.3 |
| 9 | `quantizeWorld()` — always the last mutation | §15 |
| 10 | **Emit events** (cosmetic; never read back). Snapshots are taken after even ticks. | §17 |

### 5.1 Phase 1 — input latch
For each kart with `spec ≠ 0`:

| Derived value | Rule |
|---|---|
| `σ` | `−steer / 127`, clamped to [−1, 1] |
| `thrIn` | `throttle > 0` |
| `τ` | `throttle / 15` (analog throttle scale on the base acceleration only) [P] |
| `brk` | `brake > 0` |
| `driftHeld`, `itemHeld`, `lookBack` | `held & DRIFT`, `held & ITEM`, `held & LOOK_BACK` |
| `thrEdge` | `thrIn && prevThrottle == 0` |
| `driftEdge` | `driftHeld && !(prevHeld & DRIFT)` |
| `useEdge`, `swapEdge`, `tapL`, `tapR`, `respawnEdge`, `emoteEdge` | from `edges` |

Input-modifying state, applied in this order:
1. `respawnPhase ≠ 0` or `phase < RACING`: σ = 0, thrIn is still recorded (start-boost tracking only), all motion inputs ignored.
2. Effect `noControl` (hard CC): σ = 0, `thrIn = 0`, `brk = 0`, `driftHeld = 0`, `useEdge = 0`. `tapL`/`tapR` stay (mash-out).
3. Effect `steerInvert` (Mirror Mode): σ = −σ.
4. Effect `steerMul`: σ ×= steerMul.
5. Wall stun (`stunTicks > 0`): `thr = 0` for acceleration; `thrIn` and `thrEdge` are still computed (proto2d: `thr = stunned ? 0 : thrIn`).

---

## 6. Drift and yaw (phase 3, part 1)

Per kart, in slot order. `vG, vB, a0, g0, kIn, kNeu, yG, cB` come from the kart spec. `control = grounded || coyote > 0`.

### 6.1 K0 — frame hygiene
- `n ← normalize(n)`; `f ← normalize(f − (f·n)·n)`; `l = n × f`.

### 6.2 K2 — drift entry and double drift [V]
**Entry** when all hold: `drift == 0`, `control`, `driftHeld`, `|σ| ≥ 0.3`, `u ≥ 10 m/s` (u = v·f), `reDriftLock == 0`, `stunTicks == 0`, no `noControl` effect. Then:
- `drift = 1`, `driftDir = sign(σ)`, `driftTicks = 0`, `driftPeak = 0`
- `yawRate += driftDir · 1.2` rad/s
- `f ← rotate(f, driftDir · 0.06981317007977318)` (4°)
- `v ← v · 0.99`
- emit `driftStart`

**Double drift** when `drift == 1`, `control`, `driftEdge` and `driftTicks ≥ 9` (0.15 s, checked before this tick's increment):
- `yawRate += driftDir · 0.8`; `f ← rotate(f, driftDir · 0.05235987755982988)` (3°); `v ← v · 0.99`; emit `doubleDrift`.

Releasing the drift key never ends a drift [S].

### 6.3 K4 — yaw target and lag [V]
`u ← v·f` (recomputed after K2).
- **Airborne** (`!control`): `yawRate ← yawRate · decayF(3)`; no target; skip to K5.
- **Grip** (`drift == 0`): `vv = max(u, 0)`, `q = vv / 33.5`,
  `r* = σ · yG · vv / (vv + 4) / (1 + q²)`.
  Reversing (`u < −0.5`): `r* = −σ · yG · 0.5 · (−u) / (−u + 4)`.
- **Drift**: `s_in = σ · driftDir`,
  `r* = driftDir · (0.6 / (1 + driftTicks / 36) + 1.2 · s_in + (driftHeld ? 0.7 : 0))`.
- Wall stun: `r* ← 0.3 · r*`.
- Lag: `yawRate ← yawRate + (r* − yawRate) · (1 − decayF(K))`, K = 12 (grip) or 6 (drift).

Full-steer grip radius `R = v / r*` [V]: 9.8 m at 10 m/s, 21 m at 20, 29 m at 25, 39.5 m at 30, **49.8 m at 34**, 86 m at 44.4.

### 6.4 K5 — heading rotation, air attitude
- Grounded or coyote: `f ← rotate(f, yawRate · DT)`; `l = n × f`.
- Airborne [P]: after the yaw rotation, `f ← normalize(f + (v̂ − f)·(1 − decayF(4)))` where `v̂ = v/|v|` if |v| > 1 m/s ("pitch eases toward the velocity direction", ADR-004); then `n ← normalize(upHint − (upHint·f)·f)`, `l = n × f`. `upHint` is defined in §10.1.

### 6.5 K6–K11 — decomposition, slope gravity, lateral damping, slip cap, gauge, exit
**K6.** `u = v·f`, `w = v·l`, `vn = v·n`, `vmag = √(u² + w²)`.

**K7 slope and gravity** [P]. `g = gravityAt(loc)` (world `−Y·28`; track `−U(s)·28`; low `−Y·28·scale`).
- Grounded or coyote: `g_t = g − (g·n)·n`; `u += (g_t·f)·DT`; `w += (g_t·l)·DT`. Banks and slopes therefore act as tangential acceleration; the normal part is taken by the ground.
- Airborne: `v += g·DT` in world space; K8–K11 and K15–K16 are skipped (drift frozen, no lateral damping, no thrust) and K17 writes `v` directly.
- On a flat plane with world gravity `g_t = 0`, so the flat-plane oracle is unchanged.

**K8 lateral damping** [V]. `vRef = √(u² + w²)` after K7.
| Mode | k (s⁻¹) | η |
|---|---|---|
| Grip | `18 · surf.grip` | 0.10 |
| Drift, `s_in ≥ 0.3` | `kNeu + (kIn − kNeu)·(s_in − 0.3)/0.7`, then `· surf.grip` | 0.80 |
| Drift, `−0.3 < s_in < 0.3` | `kNeu · surf.grip` | 0.80 |
| Drift, `s_in ≤ −0.3` | `kNeu + (9.0 − kNeu)·(−s_in − 0.3)/0.7`, then `· surf.grip` | 0.80 |
| Drift with `driftHeld` | multiply k by 0.85 | |

Then `w2 = w · decayF(k)`, `vRaw = √(u² + w2²)`; if `vRaw > 1e-6`: `F = (vRaw + η·(vRef − vRaw)) / vRaw`, `u ← u·F`, `w ← w2·F`; else `w ← w2`. Damping never adds speed; η is the share of the scrubbed speed returned along the heading. The `surf.grip` factor is [P]; on asphalt it is 1.

**K9 slip cap** (drift only) [V]. `v2 = √(u² + w²)`, `sm = sin55 · v2`; if `|w| > sm`: `w = sign(w)·sm`, `u = √(v2² − w²)`.

**K10 fatigue** [V]. Drifting: `fatigueTicks += 1`; otherwise `fatigueTicks = max(0, fatigueTicks − 1)`.

**K11 drift bookkeeping** (drift and `control`) [V].
1. `sb = v2 > 0.1 ? −driftDir · w / v2 : 0`; `driftTicks += 1`; `driftPeak = max(driftPeak, sb)`.
2. Gauge gain (§8) when the gauge is on, `grounded == 1`, `v2 ≥ 10`, `sb > 0` and `wallContact == 0`.
3. **Exit** when `(driftTicks ≥ 8 && sb < sin 6°) || u < 5 m/s`:
   - `drift = 0`; `reDriftLock = 6` (0.10 s); emit `driftEnd`;
   - if `driftTicks ≥ 15` (0.25 s, full drift) and `driftPeak ≥ sin 8°`: `instWindow = 30` (0.5 s).
   - `driftTicks ≥ 8` after the increment means "sinβ < sin 6° after ≥ 7 ticks" (ADR-004); it equals the prototype's `dT ≥ 0.12 s`.

### 6.6 Techniques that emerge (no special code)
| Technique | How it arises |
|---|---|
| 끌기 (drag drift) | Shallow held drift: η = 0.80 returns most scrubbed speed forward; `driftHeld` lowers k by 15% and adds 0.7 rad/s yaw. |
| 커팅 (cut) | Full counter-steer (`s_in ≤ −0.3`) raises k toward 9.0 and drives `sb` below sin 6°, ending the drift in a few ticks; an immediate opposite drift press starts a new drift the other way after the 6-tick lockout. |
| 최적화 드리프트 | Short tap (`driftHeld` for 3–10 ticks) plus early counter-steer: minimal `sb`, minimal drag `cBeta·sb²`. |
| Full drift in U-turns | Deep drift, `driftHeld`, double drift after ≥ 9 ticks. |

---

## 7. Longitudinal dynamics and boosts (phase 3, part 2)

### 7.1 Start boost [V][S]
#### 7.1.1 Tiers (ADR-004)
Offset `d = pressTick − goTick` of the **first throttle press edge after the COUNTDOWN phase begins** (presses during `PRE` are ignored [P]).

| Tier | Offset window (ticks) | Speed-mode boost | Item-mode boost (×0.67) | Event tier |
|---|---|---|---|---|
| PERFECT | [0, +6] | 90 (1.5 s) | 60 (1.0 s) | `perfect` |
| GREAT | [−6, −1] ∪ [+7, +12] | 60 (1.0 s) | 40 (0.67 s) | `great` |
| GOOD | [−12, −7] ∪ [+13, +21] | 36 (0.6 s) | 24 (0.4 s) | `good` |
| FALSE | < −12 | 0; 18 ticks of wheelspin at 30% acceleration | same | `false` |
| NONE | > +21, or no press | 0 | 0 | `none` |

#### 7.1.2 Rules
- For a press at or before GO, the boost starts on `goTick` (`startTicks` = tier duration at goTick, phase 3). For a press after GO it starts on the press tick. A FALSE start sets `wheelspinTicks = 18` at goTick.
- Start-boost law: boost law of §7.3 with `vT = vB` and acceleration cap **30 m/s²**.
- Releasing the throttle (`thrIn == 0`) while `startTicks > 0` cancels it (`startTicks = 0`). Releasing the throttle does **not** cancel any other boost (ADR-004).
- Gauge bonus: a PERFECT, GREAT or GOOD start adds +0.05 gauge in speed mode (§8.2).
- Emit `startBoost{tier}` at goTick for presses ≤ GO, else at the press tick; emit `none` at goTick + 22 for karts that never pressed.
- Validated gains at 5 s vs no press [V]: PERFECT +35 m (≈ +1.0 s), GREAT +21 m, GOOD +12 m, FALSE −7 m, late press at +400 ms −13 m.

#### 7.1.3 Encoding before GO [P]
`KartDrive` has no dedicated press field (§16). During `PRE`/`COUNTDOWN`, and until the tier is decided, `startTicks` holds `1000 + (pressTick − goTick)` once a press has happened (range 820–1000) and 0 before. At goTick the value is decoded and replaced by the boost duration (or 0). Presses after GO are decoded immediately.

### 7.2 Booster (gauge booster, speed mode) [V][S]
- **Fire request** (speed mode and Infinite Boost only): `useEdge`, or `itemHeld` (auto-fire: holding the key fires each booster as soon as one is available [S "부스터 자동 사용"]).
- **Fire condition**: `boosters + teamBoosters > 0` and `boostTicks < 15` (chain rule: a new booster may fire when fewer than 15 ticks remain). Firing is allowed on the ground and in the air.
- **Priority**: a team booster first, else a normal booster.
- **Effect**: normal → `boostTicks += tBoostTicks` (180 for Balance), `boostKind = normal`; team → `boostTicks += 270`, `boostKind = team`. Chaining adds duration and never stacks speed.
- Emit `boostStart{kind}`.

### 7.3 Target speed and acceleration law (K13–K16) [V]
**K12 instant-boost trigger.** If `instWindow > 0` and `thrEdge`: `instTicks = 30`, `instWindow = 0`, emit `instantBoost`, gauge bonus +0.03 (speed mode). The trigger is accepted while boosting, but its effect is ignored while any boost law is active (below).

**K13 booster fire** (§7.2).

**K14 target speed.** Evaluate in this order; the first active source sets `vT` and whether the **boost law** applies:

| # | Source | `vT` | Law | Accel cap |
|---|---|---|---|---|
| 1 | `boostTicks > 0`, kind team | `1.02 · vB` | boost | 25 |
| 2 | `boostTicks > 0`, kind normal or item (Turbo Token) | `vB` | boost | 25 |
| 3 | `startTicks > 0` | `vB` | boost | 30 |
| 4 | effect `overclock` | `vB` | boost | 25 |
| 5 | effect `slingshot` | 42.5 (1.25·V_REF) | boost | 25 |
| 6 | effect `tether_pull` | `max(40.8, min(1.25·u_target, V_BOOST))` (1.2·V_REF floor) | boost | 25 |
| 7 | otherwise | `vG`; `1.05·vG` and `a0 ×1.1` while `draftTicks > 0` | base | — |

Then, in order:
- Surface: `vT ← vT · surf.vMul · conveyor` (conveyor = 1.15 on `conveyor_fwd`, 0.85 on `conveyor_back`, else 1) [P for applying vMul to boosts].
- Effect caps: `vT ← min(vT, capMul · V_REF)` for each active `vCapMul` (Throttle Drone 0.60/0.52/0.44 by stacks, stun 0.5, post-stun slow 0.8).
- Bots: `vT ← vT · m_eff`, and `vInst ← vInst · m_eff`, where `m_eff = min(1.0, vMul · capMul(w, slot))` (ADR-009, `14-ai-spec.md` §7). Humans: `m_eff = 1`.
- `instOn = instTicks > 0 && !boostLaw && u < vInst`.

**K15 acceleration.** With `A0 = a0 · (draft ? 1.1 : 1) · accelMul` (effects):
```
if thr (thrIn and not wall-stunned):
    if u < vT:
        if boostLaw:
            a = min(cap, 4·(vT − u))
            a = max(a, a0·(1 − u/vG))            // never below the base law (prototype: linear floor)
        else:
            q = u / vT
            a = A0·τ·(1 − q²)
            if drift and a > 5: a = 5            // drift acceleration cap
        if instOn and a < 9: a = 9                // instant boost floor
    else:
        a = −0.9·(u − vT)                         // overspeed decay (탄력)
        if instOn: a = 9
    if wheelspinTicks > 0: a = 0.3·a
else:
    a = −2.5·surf.dragMul
    if u > vT: a −= 0.9·(u − vT)
if brk and u > 0: a = −(drift ? 14 : 24)
```
- `uN = u + a·DT`. If `(thr == 0 || brk) && u ≥ 0 && uN < 0`: `uN = 0`. `u ← uN`.
- **Reverse** [P]: if `brk && !thrIn && u ≤ 0.5`, the clamp above is skipped and `a = −8·(1 − (max(0, −u)/10)²)`, giving a reverse maximum of 10 m/s (ADR-004).
- **K16 drift drag** [V]: if `drift && sb > 0`: `F = max(0, 1 − cB·sb²·DT)`; `u ← u·F`; `w ← w·F`. Equivalent to `dv = −cB·v·sin²β·dt` (cB 0.8 for Balance).
- **K17 recompose**: `v = u·f + w·l + vn·n`.
- **K19**: `prevHeld = held`, `prevThrottle = throttle`.

### 7.4 Instant boost (순간 부스터) summary [V][S]
| Rule | Value |
|---|---|
| Window opens | Drift exit after a full drift: ≥ 15 ticks and peak slip ≥ 8° |
| Window | 30 ticks (0.5 s) [S] |
| Trigger | Throttle press edge (release and re-press) inside the window |
| Effect | 30 ticks: acceleration floor 9 m/s² toward `vInst = 1.05·vG` (35.7 m/s) |
| While boosting | Ignored (no effect, window consumed) |
| Cancelled by | Any 15°+ wall hit (window and effect) |
| Measured gain from 151 km/h | +11 km/h at 0.5 s [V] |
The item-mode **escape boost** (after a trap) uses exactly this law with its own 30 ticks (`12-items-spec.md` §6.4).

### 7.5 Draft (slipstream) [S][P conversion]
Evaluated in **phase 7** for every kart, using end-of-tick positions and velocities, so that slot order never matters.
- A kart i is **in the cone** of kart j (j ≠ i, not ghosted, same or different team) when all hold: `d = p_j − p_i`; `along = d·f_j ∈ [4, 22]` m; `|d·l_j| < 2.2` m; `|d·n_j| < 2.0` m [P]; `|v_i| > 20` and `|v_j| > 20` m/s.
- If i is in any cone and `draftTicks == 0`: `draftCharge += 1`; otherwise `draftCharge = max(0, draftCharge − 2)` (drains at 2× the fill rate). Charge is frozen while `draftTicks > 0`.
- When `draftCharge ≥ 120` (2.0 s [S draftTick 2000 ms]): `draftTicks = 90` (1.5 s, written 91 per §1.3), `draftCharge = 0`, emit `draft{on:true}`; emit `draft{on:false}` when it runs out.
- Effect (K14 row 7): `vT = 1.05·vG` (35.7 m/s) and `A0 ×1.1`. Gauge bonus +0.05/s while active (speed mode).
- In the target-speed law the classic "thrust ×1.1" alone would add nothing at top speed, which is why draft is a target-speed change (02-contracts §F.3).

### 7.6 Boost pads [P]
- A ground triangle with surface `boost_pad` grants a pad boost when the kart **enters** it (the previous `surf` was not `boost_pad`): `boostTicks = max(boostTicks, 45)` (0.75 s), `boostKind = normal` if it was none. It does not consume a booster. Emit `boostStart{kind:1}` (VFX uses the green pad colour when the source is a pad; the event carries `kind` only).
- Throttle Drone and Firewall still apply while on a pad; a Firewall block placed on a pad is ignored (KRD rule, `12-items-spec.md` §3.10).

---

## 8. Gauge and boosters

### 8.1 Drift gauge law (ADR-004) [V]
```
dG = g0 · √min(sb / 0.5, 1) · (v / vG) / (1 + fatigueTicks / 90) · DT · gaugeMul
```
- Only while drifting, `grounded == 1`, `v ≥ 10 m/s`, `sb > 0`, `wallContact == 0`. `gaugeMul` from effects (Throttle Drone 0.5).
- `gauge += dG`. If `gauge ≥ 1`: if `boosters + teamBoosters < 2`: `boosters += 1`, `gauge −= 1`, emit `gaugeFull`; else `gauge = 1` (held full).
- The fatigue timer is required: without it, drift chopping reached 51–56% boost time [V].
- Validated envelope [V]: optimal 90° corner 0.31–0.42 gauge (2.4–3.2 corners per booster); single hairpin 0.42–0.71.
- Item mode: gauge off (no gain, no boosters). Time Attack: speed-mode rules.

### 8.2 Bonus charges [S][P]
KRD also charges the gauge from start boosts and instant boosts (Nexon SEA notes [S]); values [P] from `01-driving-mechanics.md` §6.5:

| Source | Speed mode | Infinite Boost (×2, ADR-008) |
|---|---|---|
| Start boost PERFECT/GREAT/GOOD | +0.05 once | +0.10 |
| Instant boost trigger | +0.03 | +0.06 |
| Draft active | +0.05 per second (`+0.05·DT` per tick) | +0.10 per second |
| Infinite auto-fill | — | +0.45 per second, including while boosting |

Bonus charges also feed the team gauge (§8.3). The physics acceptance tests measure the drift term only (`gaugeDrift` counter).

### 8.3 Team gauge and team booster (ADR-008) [S][P]
- Team modes (Duo, Squad) in speed and Infinite Boost only. `TeamState.gauge` size = `2 · teamSize` (4 for Duo, 8 for Squad).
- Every teammate's gauge gain (`dG` and bonuses, before the individual cap) is also added to the team gauge.
- When `team.gauge ≥ 2·teamSize`: `team.gauge = 0`, `team.granted += 1`, emit `teamGaugeFull{team}`, and every teammate (retired and finished karts excluded) receives one team booster:
  - if `boosters + teamBoosters < 2`: `teamBoosters += 1`;
  - else if `boosters > 0`: one normal booster converts (`boosters −= 1`, `teamBoosters += 1`);
  - else (already 2 team boosters): nothing.
- Team booster: 270 ticks (4.5 s), `vT = 1.02·vB`, blue flame; colour not customizable. KRD's short conversion delay (딜) is not reproduced.

---

## 9. Modes that change the sim
| Mode flag | Effect in the sim |
|---|---|
| `mode = speed` | Gauge on, boxes absent, USE_ITEM fires boosters |
| `mode = item` | Gauge off, boosters never granted, boxes active, USE_ITEM uses the front item, start boosts ×0.67; instant boost after drifts only if `rules.instantBoostInItem` (default true) [P] |
| `mode = infinite` | Speed rules + gauge auto-fill 0.45/s (continues while boosting), doubled bonus charges |
| `mode = timeAttack` | Speed rules, one kart, no retire timer, no rubber-band; ghost is render-only |
| `teams ≠ solo` | Team gauge (speed/infinite), team scoring, friendly-fire rules (items) |
| `rules.rubberBand` | Enables `capMul` for bots (off in Time Attack and ranked) |

---

## 10. Ground, air and 3D motion (phase 4)

### 10.1 Up hint
`upHint = −ĝ`, where ĝ is the normalized `gravityAt(loc)` vector: +Y for world or low gravity, `U(s)` (track up) for track gravity (loops, zero-g tubes). Grounded karts use `n` for the ray; airborne karts use `upHint`.

### 10.2 Half-step move, ground and walls
For `half` in {0, 1}, for each kart in slot order (skip `respawnPhase = 2` karts, which are frozen):
1. `p += v · DT/2`.
2. **Ground ray**: `up = grounded ? n : upHint`; `groundRay(p + 1.0·up, −up, 2.0)`. Let `d = t − 1.0` (ground below `p` by d; negative = penetrating).
3. Accept the hit as ground when `n_hit · up > 0.4226` and one of:
   - `d ≤ 0` (penetrating: the kart is at or below the surface), or
   - the kart was grounded before this half-step, `d ≤ 0.35`, and `v·n_hit ≤ 2.0 m/s` (it is not leaving the surface).
4. **Accepted**:
   - Was airborne (`airTicks > 0`): landing. `v_imp = max(0, −v·n_hit)`; remove the normal part `v ← v − (v·n_hit)·n_hit`; if `v_imp > 6`: `v ← v·(1 − min(0.12, 0.01·(v_imp − 6)))` [ADR-004]; emit `land{impact}`; drift state resumes.
   - Continuing contact: re-project velocity onto the new tangent plane **preserving speed**: `v_t = v − (v·n_hit)·n_hit`, `v ← v_t · |v| / |v_t|` (if `|v_t| > 1e-6`).
   - `p = hit point`, `n = n_hit` (smooth interpolated normal from the baked vertex normals), `surf = hit.surf`, `grounded = 1`, `coyote = 6`.
   - Re-orthogonalize `f` to the new `n`.
5. **Not accepted**: `grounded = 0` (coyote counts down in phase 8). If this is the first ungrounded half-step, emit `air`.
6. **Walls** (§10.4) using the sphere centred `p + 0.6·n`.

After both karts' moves of a half-step, run **kart contacts** (§11) for that half.

Stacked decks never confuse the ray: the window is 1 m above and 1 m below `p` (maxT 2.0) against a validated ≥ 8 m deck separation (V2).

### 10.3 Air, jumps and kill rules [ADR-004]
| Rule | Value |
|---|---|
| Gravity | 28 m/s² along `gravityAt`; applied once per tick in K7 |
| In the air | No steering (yaw damped ×decayF(3) per tick), no thrust, no lateral damping, no gauge, drift frozen (no `driftTicks` increment, no exit test); boost timers keep running; boosters may fire |
| Attitude | `f` eases toward the velocity (K = 4 s⁻¹) [P]; roll follows `upHint` |
| Landing | Normal speed removed; above 6 m/s impact: `v ×(1 − min(0.12, 0.01·(v_imp − 6)))` |
| Coyote | 6 ticks after losing the ground the kart still counts as `control` for steering, drift entry and throttle (not for gauge gain) |
| Jump pad surface | On entering `jump_pad`: `v ← v + max(0, 9 − v·n)·n` (launch to at least 9 m/s along `n`) [P]; used for mushroom bounces and tutorial hops |
| Jump spans | Samples flagged `jumpSpan` exempt the "no ground > 72 ticks" respawn trigger and anti-cut |

### 10.4 Walls (ADR-004, gap-2) [V]
Query `sphereWalls(c, 0.85, contacts, 4)` with `c = p + 0.6·n`. Process contacts in order of decreasing depth.

For each contact with outward normal `n_c` and `depth`:
1. Push out: `p += n_c · depth`.
2. Wall normal in the kart's tangent plane: `n_w = normalize(n_c − (n_c·n)·n)` (skip the response if the length < 0.1; the contact is a floor or ceiling edge).
3. `vn = v·n_w`. If `vn ≥ 0` (not moving into the wall) set `wallContact = 1` and continue.
4. `sp = |v|`, `sinT = −vn / sp`, tangent part `t = v − vn·n_w`.
5. **New contact** (`wallContact == 0` before this half-step) **and** `sinT ≥ sin 15°`:
   - `F = sinT < sin 45° ? 0.95 + (0.70 − 0.95)·(sinT − sin15)/(sin45 − sin15) : 0.40` (the band is interpolated in sinθ, as validated).
   - `v = t·F − 0.15·vn·n_w` (restitution e = 0.15).
   - If drifting: `drift = 0`, `gauge ← gauge·0.5`, `reDriftLock = 6`, emit `driftEnd`.
   - `instTicks = 0`, `instWindow = 0` (instant boost cancelled).
   - If `sinT ≥ sin 45°` (hard hit): `stunTicks = 15` (written 16), `boostTicks = 0`, `boostKind = 0`, `startTicks = 0` [P for start], `yawRate = 0`; nose realigned along the wall: `tt = frameAt(loc).t` projected on the tangent plane; `sg = (f·tt ≥ −0.1) ? 1 : −1`; `f = normalize(sg·tt + 0.3·n_w)`; `v = f·|v|`.
   - Emit `wall{severity: sinT ≥ sin45 ? 2 : 1, x, y, z, speed: −vn}`.
6. **Grind** (`sinT < sin 15°`, or a continuing contact): `F = |t| > 0.01 ? max(0, 1 − 10·DT/|t|) : 0`; `v = t·F` (10 m/s² friction). A new grind contact emits `wall{severity:0}`. The drift is kept.
7. If `sinT < sin 45°` and `f·n_w < 0`: nose projected parallel to the wall `f = normalize(f − (f·n_w)·n_w)`, `yawRate = 0`.
8. `wallContact = 1`.

Additional rules:
- Stored boosters are never lost.
- Camera shake above 9 m/s wall-normal speed; "big crash" above 18 m/s (client reads `wall.speed`).
- Validated at 30 m/s [V]: 10° → −3 km/h, 30° → −47 km/h, 60° → 39 km/h after with a 15-tick stun and the booster cancelled, 90° → 24 km/h.
- Tunnelling: a half-step moves at most 44.4·DT/2 ≈ 0.37 m (0.38 m at 45.3 m/s team boost) against a 0.85 m sphere radius, so zero-thickness wall triangles cannot be crossed (R5).

---

## 11. Kart–kart contacts (ADR-004) [P constants from ADR]
Run after each half-step move, for every unordered pair (i < j) by slot, skipping empty slots, karts with `ghostTicks > 0`, `respawnPhase ≠ 0`, and finished karts after the finish (they ghost for the rest of the race) [P].
1. Centres `c = p + 0.6·n`. `d = c_j − c_i`, `dist = |d|`. Contact when `dist < 1.7`.
2. `nrm = d / dist` (if dist < 1e-6 use `f_i`); `pen = 1.7 − dist`.
3. Masses `m = weight · (boosting ? 1.5 : 1)`, where boosting = any boost law source active (§7.3 rows 1–6).
4. Positional separation: `p_i −= nrm·pen·m_j/(m_i+m_j)`, `p_j += nrm·pen·m_i/(m_i+m_j)`.
5. `vrel = (v_j − v_i)·nrm`. If `vrel < 0`:
   - `J = −(1 + 0.3)·vrel / (1/m_i + 1/m_j)`;
   - `Δv_i = −J/m_i · nrm`, `Δv_j = +J/m_j · nrm`, each clamped to 6 m/s magnitude;
   - **Rear-end transfer**: if `|nrm · f_front| > 0.7` where front is the kart ahead along `nrm`, the rear kart transfers 10% of its closing speed `c = −vrel`: `v_front += 0.1·c·f_front`, `v_rear −= 0.1·c·f_rear`;
   - emit `bump{a:i, b:j, impulse: J}`.
6. Drift state is not cancelled by bumps.
Contacts are symmetric (the result does not depend on which kart is i), soft (restitution 0.3, capped impulse) and lateral-dominant in practice.

---

## 12. Race rules (phase 7)

### 12.1 Locate and progress (ADR-006, gap-3 §2.3–§2.4)
- `track.locate(p, loc, out)`: graph-local plane-crossing search ±20 samples (1 m apart) from `loc`, following successors/predecessors across junctions. A candidate is accepted when −2 ≤ h ≤ 6 m and |u| ≤ half-width + 3 m.
- Fallback search (only on respawn placement, landing, warp exit or after > 60 ticks off-graph): the 16 m 2D grid with cost `0.1·u² + h² + (400 if graph jump > 60 m)`; a jump's `landingS` or a warp's `exit.s` seeds it.
- Branch paths map affinely: `sMain(u) = fromS + (toS − fromS)·u / L_path` (+L if the span crosses the line). `raceDist = lap·L + sMain`.

### 12.2 Anti-cut [ADR-006]
- A new location is **accepted** when its graph distance from the previous accepted location satisfies `Δs ≤ |v|·DT + 10 m`, or when the kart is inside a declared jump, warp or rail span.
- Accepted: `loc = new`, `offGraphTicks = 0`; if the path is main, `lastValid = loc`.
- Rejected, or `locate` fails: `loc.valid = 0`, `raceDist` frozen, `offGraphTicks += 1`.

### 12.3 Respawn triggers [ADR-004]
| Trigger | Condition |
|---|---|
| Kill | `p.y < killY` of the track, or inside a kill zone / `lava` surface |
| No ground | `airTicks > 72` (1.2 s) outside declared jump spans |
| Off graph | `offGraphTicks > 180` (3.0 s) |
| Wrong way | `wrongWayTicks > 240` (4.0 s) |
| Manual | `respawnEdge` when allowed (§12.5) |

### 12.4 Wrong way [ADR-004]
- Condition: `f · t_track < COS110` (angle > 110°, dot < −0.342) while `|v| > 4 m/s`, with `t_track = frameAt(loc).t`.
- Condition true: `wrongWayTicks += 1`; false: `wrongWayTicks = 0`.
- At 72 ticks (1.2 s): emit `wrongWay{on:true}`; the HUD shows "역주행! R: 코스 복귀". Emit `wrongWay{on:false}` when the counter resets.

### 12.5 Manual reset (R)
- Allowed when (`|v| < 3 m/s` for 60 consecutive ticks) or `wrongWayTicks ≥ 72`, and `tick ≥ manualCooldownUntil`.
- On acceptance: `manualCooldownUntil = tick + 180` (3.0 s) and start the sequence below.
- The slow-ticks counter is kept in `respawnUntil` while `respawnPhase = 0` (§4.5).

### 12.6 Respawn sequence [ADR-004]
| Step | Ticks | State |
|---|---|---|
| Trigger (tick t0) | — | `respawnPhase = 1`, `respawnUntil = t0 + 24`; inputs ignored; physics continues (the kart may keep falling); emit `respawn{phase:'out'}` |
| Place (t0 + 24) | 24 (0.4 s) | `respawnPose(lastValid)`: main-line centreline sample at `lastValid.sMain`, facing the tangent, `v = 0`, `yawRate = 0`; `respawnPhase = 2`, `respawnUntil = t0 + 54`; `ghostTicks = 120` (written 121); emit `respawn{phase:'in'}` |
| Frozen (t0+24 … t0+53) | 30 (0.5 s) | Kart does not move; items may still hit it |
| Control (t0 + 54) | — | `respawnPhase = 0`; slow counter reset |
| Ghost ends (t0 + 144) | 120 (2.0 s) from placement | Kart–kart contacts resume |

- Cancelled: active boost (`boostTicks`, `startTicks`, `instTicks`, `instWindow`), drift, draft. Kept: stored boosters, gauge, items.
- Items still hit a ghosted kart. Effects in progress continue.
- Total cost ≈ 2.5–3 s (54 ticks of lost control plus re-acceleration) [S "reset costs ≈ 3 s"].
- There is no time penalty of any kind (a lava fall costs only the respawn).

### 12.7 Laps, finish, rank
- **Gates**: ordinary gates every 30 m (20–25 m where cutting is possible) exist for anti-cut and AI; lap validity uses **key gates** only (≥ 6, main line, outside branch/rail/warp spans).
- **Key gates**: bit k of `keyMask` is set when `sMain` crosses key gate k moving forward with bits 0…k−1 set.
- **Lap** (circuit): `sMain` wraps from > L − 50 to < 50 with all key bits set (the grid start is exempt: `keyMask` starts full). Then `lap += 1`, `keyMask = 0`, lap timing: `lapTicks = tick − lapStartTick`, `bestLapTicks = min`, `lapStartTick = tick`; emit `lap{lap, lapTicks, best}`; `finalLap` event when `lap == laps − 1`.
- **Point-to-point** (`topology = p2p`): the kart finishes when `sMain ≥ L` on the main line with all key bits set; `lap` goes 0 → 1.
- **Finish fraction**: with `s0` the accepted sMain before the crossing tick t and `s1` after (unwrapped by +L), `α = (L − s0) / (s1 − s0)` ∈ (0, 1]. `finishTick = t`, `finishFrac = α` (grid 1/65536). Race time in ms = `round(((t − 1 − goTick) + α) · 1000 / 60)`. Equal milliseconds share a rank (ADR-008).
- **Rank** (every tick): finished karts by `(finishTick − 1 + finishFrac)` ascending; then unfinished by `raceDist` descending; ties by previous rank, then slot. Retired karts keep their progress order after all finishers. Emit `rank{from,to}` on change.

### 12.8 Race phases (ADR-008)
| Phase | Enters at | Content |
|---|---|---|
| `PRE` (0) | tick 0 | Intro flyover 240 ticks (4.0 s; skippable offline → 0) + grid shot 90 ticks (1.5 s). `RaceConfig.introTicks = modes.introTicks (240, or 0 when skipped) + modes.gridTicks (90)` = 330 or 90; `RaceConfig.countdownTicks = 3 · modes.countdownBeatTicks` = 180. Karts frozen on the grid. |
| `COUNTDOWN` (1) | `cfg.introTicks` | 3 beats of 60 ticks: emit `countdown{3}` at goTick−180, `{2}` at −120, `{1}` at −60. Start-press tracking (§7.1). |
| `RACING` (2) | `goTick = introTicks + 180` | Emit `countdown{0}` (GO). Racing. |
| `RETIRE_TIMER` (3) | first finish | `firstFinishTick = tick`, `endTick = tick + cfg.rules.retireTicks` (600 = 10 s default; 300/600/900/1200 in rooms); emit `retireTimer{endsTick}` |
| `DONE` (4) | all karts finished or retired, or `tick ≥ endTick` | Unfinished karts: `retired = 1`, emit `retire` each; emit `raceEnd` |

- **Hard cap**: `endTick` is also set at goTick to `goTick + ceil(max(3·laps·refLapSec(mode), 240) · 60)` while no one has finished. When it expires, every unfinished kart retires, ordered by progress. `refLapSec(mode)` = the track's speed ref lap (item ×1.12).
- Grid: rows of 2, pitch 6 m, stagger 3 m, lateral ±4 m, first row 8 m behind the line (gap-3 GRID). Order: random from the seed in the first race of a room, then reverse of the previous results.
- After the finish a kart is driven by a built-in cruise controller (AI driver with Rookie noise, no items) and ghosted; it is ignored by draft cones.

---

## 13. Surfaces, zones and track features

### 13.1 Surface table (`packages/content/src/surfaces.ts`, ADR-006)
| Surface | grip (×k_lat) | vMul (×vT) | dragMul (×coast) | Special |
|---|---|---|---|---|
| asphalt, stone | 1.00 | 1.00 | 1.0 | |
| cobble | 0.98 | 1.00 | 1.0 | |
| dirt | 0.92 | 0.97 | 1.2 | |
| sand | 0.85 | 0.92 | 1.6 | |
| gravel | 0.85 | 0.94 | 1.4 | |
| ice | 0.75 | 1.00 | 0.8 | "drag −20%" |
| snow | 0.90 | 0.95 | 1.2 | |
| grass (off-road) | 0.80 | 0.60 | 2.2 | |
| wet | 0.92 | 1.00 | 1.0 | |
| wood | 0.98 | 1.00 | 1.0 | |
| metal | 0.97 | 1.00 | 1.0 | |
| basalt | 0.97 | 1.00 | 1.0 | |
| obsidian | 0.95 | 1.00 | 1.0 | |
| glass | 0.96 | 1.00 | 1.0 | |
| boost_pad | 1.00 | 1.00 | 1.0 | pad boost on entry (§7.6) |
| jump_pad | 1.00 | 1.00 | 1.0 | launch on entry (§10.3) |
| conveyor_fwd / conveyor_back | 1.00 | 1.00 | 1.0 | vT ×1.15 / ×0.85 |
| lava | — | — | — | kill (respawn) |
| rail | 1.00 | 1.00 | 1.0 | rail geometry marker (render/AI only) |

### 13.2 Zones (`ZONE`)
| Kind | Effect in the sim |
|---|---|
| `conveyor` | vT ×`speedMul` inside the (s, d) box (same as the conveyor surfaces) |
| `surface` | Overrides the surface code inside the box |
| `kill` | Respawn trigger (with `belowY` for lava/void planes) |
| `noItem` | Boxes and hazards may not be placed; item drops inside fizzle |
| `camera` | Client-only camera hint |
| `gravity` | Sets the gravity mode (world/track/low + scale) — normally carried in sample flags |

### 13.3 Rails [P from gap-3]
- Capture when all hold: `|d_rail| ≤ dMax` (2.0 m), heading within `headingMaxDeg` (25°) of the rail tangent, `|v| ≥ vMin` (15 m/s), grounded, not in hard CC.
- While locked: position follows the rail curve (host centreline + offset table); speed `u ← min(max, max(min, u) + accel·DT)` with `min 38, accel 3, max 42` m/s; no steering, no drift (a drift is ended on capture), no wall or ground queries; kart contacts still apply; gauge `+gaugePerSec·DT` (0.30/s, speed mode). Anti-cut is exempt inside the rail span.
- Exit at `toS`: velocity along the exit tangent at the rail speed; `grounded` re-evaluated by the next ray. V17 guarantees tangent error ≤ 5° and lock time 48–180 ticks (0.8–3 s).
- Firewall blocks and ground traps do not affect a railed kart (KRD rule).

### 13.4 Warps [P from gap-3]
- Entry trigger: the kart's loc is on `entry.path` at `entry.s` within `entry.d` and `h ≤ hMax`.
- Transit: `transitTicks = round(transitSec·60)`; the kart is hidden (render fade), ghosted, frozen at the entry, and immune to new effects (hazards and items retarget or wait, `12-items-spec.md` §4.2). Projectiles targeting it hold at their current s until exit.
- Exit: placed at `exit.path/exit.s` with lateral `exit.d`, facing the tangent; `keepSpeed` keeps `|v|`, else 30 m/s. Locate uses the fallback search seeded by `exit.s`.

### 13.5 Jumps
- A jump (`J`) is geometry: ramp, lip, gap and landing. The sim needs no special code beyond §10; the `jumpSpan` sample flag exempts air-time and anti-cut triggers.
- V11 validates every jump at G = 28 m/s² for all speeds in [vMin, vMax].

### 13.6 Track hazards (analytic) [P]
Phase 5. A hazard's state is a pure function of `(tick + offsetTicks) mod periodTicks` — no hazard state is stored for track hazards.
| Kind | Shape | Active phase | Contact effect (source = 255, track) |
|---|---|---|---|
| geyser | cylinder | `activeFrom ≤ φ < activeTo` | `airborne` 66 ticks (launch) |
| press | box | pressing down | `stun` 45 ticks with speed ×0.3 at contact (squash); outside the active phase the press is up and does not collide |
| train | moving box along its own lane | always | `spin` 60 ticks + 8 m/s push away from the train |
| traffic | moving boxes on lanes (`lanes[]`) | always | `spin` 60 ticks + 6 m/s push; lanes keep one safe lane (V12) |
| swinger | pendulum capsule | always (pose from phase) | `spin` 60 ticks |
- Track hazards obey the hard-CC refresh and 36-tick immunity rules; shields and halos do **not** block track hazards.
- Telegraph ≥ 36 ticks (0.6 s) before each active phase (V12): the client reads `hazardPose(...).telegraph`.

---

## 14. Physics acceptance tests (`pnpm test:physics`, lane L1)

All tests run the 3D `step()` headless on `tracks/_test/*.ctd` (flat plane, straight corridor, corner kits) with the Balance kart (pebble), unless noted. Tolerances follow `02-contracts.md` §E. The values are the gap-2 results [V].

### 14.1 Acceleration (flat, full throttle from rest)
| Target | gap-2 value | Pass |
|---|---|---|
| 0 → 100 km/h shown (18.52 m/s) | 1.17 s | 1.17 ± 0.05 s |
| 0 → 25 m/s | 1.78 s | ± 0.05 s |
| 0 → 30 m/s | 2.62 s | ± 0.08 s |
| 0 → 97% vGrip (33 m/s) | 3.95 s | 3.95 ± 0.10 s |
| 0 → 99% vGrip (33.66 m/s) | 4.97 s | ± 0.15 s |

### 14.2 Booster speed curve (shown km/h every 0.25 s, t = 0 … 5 s)
| Case | Values | Pass |
|---|---|---|
| Booster from 184 km/h (34 m/s) | 216, 231, 237, **239 at 1.0 s**, plateau 240 until 3.0 s, then 229, 220, 212, 207, 202 | ≥ 237 km/h at 1.0 s; plateau 239–240; decay τ ≈ 1.1 s ± 0.15 |
| Booster from 151 km/h (28 m/s) | 185, 217, 232 at 0.75 s | ± 3 km/h |
| 2 boosters chained (second at tick 172) | plateau continues to ≈ 6.0 s without a dip | no sample below 238 between 1.0 and 5.9 s |

### 14.3 Instant boost (from 151 km/h)
| Case | Values | Pass |
|---|---|---|
| With instant boost | 163, 175 at 0.5 s, 178, 180 at 1.25 s | |
| Without | 158, 164 at 0.5 s, 168, 180 at 2.25 s | |
| Gain at 0.5 s | **+11 km/h** | +11 ± 2 km/h |

### 14.4 Walls at 30 m/s (162 km/h), straight corridor 16 m wide
| Impact angle | Speed right after | Stun | Speed 1 s later | Pass |
|---|---|---|---|---|
| 10° (grind) | −3 km/h | none | 174 km/h | Δv −3 ± 2 km/h |
| 30° | −47 km/h (−29%) | none | 156 km/h | −47 ± 5 km/h |
| 60° | 39 km/h | 15 ticks, booster cancelled | 98 km/h | stun exactly 15 ticks; `boostTicks = 0` |
| 90° | 24 km/h | 15 ticks | 87 km/h | stun 15 ticks |

### 14.5 Start boost gains at 5 s vs no press
| Press offset | Tier | Gain at 5 s | Pass |
|---|---|---|---|
| 0 to +100 ms (0…+6 ticks) | PERFECT | +35 m (≈ +1.0 s; 162 km/h at 1.0 s, 227 at 1.5 s) | +35 ± 3 m |
| −50 ms (−3 ticks) | GREAT | +21 m (0.6 s) | ± 3 m |
| −150 ms (−9 ticks) | GOOD | +12 m (0.35 s) | ± 3 m |
| −400 ms (−24 ticks) | FALSE | −7 m (−0.2 s) | −7 ± 3 m |
| +400 ms (+24 ticks) | none | −13 m | ± 3 m |

### 14.6 Corner table (12 m road, entry 34 m/s = 184 km/h) [V]
OPT = best clean plan or the AI if faster; CLUMSY = drift held ≥ 0.5 s, full steer, late counter-steer, no instant boost; GRIP = braking to the given speed on the geometric line. Speeds shown in km/h; drop = entry − minimum.

| Angle | Rc (m) | R_L (m) | OPT min (drop) | OPT exit | OPT t (s) | Gauge | CLUMSY min (Δ) / exit (Δ) | CLUMSY t (s) | GRIP speed / t (s) | AI t (s) |
|---|---|---|---|---|---|---|---|---|---|---|
| 90 | 9 | 35.2 | 167 (−9.3%) | 189 | 3.28 | 0.31 | 142 (−41) / 155 (−28) | 3.55 | 146 / 3.92 | 3.88 |
| 90 | 12 | 38.2 | 170 (−7.4%) | 192 | 3.38 | 0.32 | 142 (−41) / 157 (−26) | 3.65 | 154 / 3.93 | 3.75 |
| 90 | 16 | 42.2 | 176 (−4.2%) | 193 | 3.57 | 0.37 | 142 (−41) / 161 (−23) | 3.88 | 165 / 3.95 | 3.68 |
| 180 | 9 | 13.5 | 91 (−50%) | 138 | 4.95 | 0.55 | 82 (−101) / 130 | 4.87 | 73 / 6.48 | 5.80 |
| 180 | 12 | 16.5 | 107 (−42%) | 152 | 4.77 | 0.54 | 102 (−82) / 139 | 4.95 | 89 / 6.35 | 5.67 |
| 180 | 16 | 20.5 | 122 (−34%) | 159 | 4.78 | 0.58 | 102 (−82) / 145 | 5.23 | 105 / 6.33 | 5.52 |

**Pass (E, M1+)**: 90° R12 corner on a 12 m road at 34 m/s driven by the AI: drop ≤ 8%, gauge 0.30–0.43 per corner (drift term), clumsy drop 35–45 km/h. The other rows are regression values with ± 0.10 s on times and ± 3 km/h on speeds.

Racing-line radius used in the table: `R_L = (Ro − Ri·cos(Δ/2)) / (1 − cos(Δ/2))`, `Ro = Rc + W/2 − 1.5`, `Ri = Rc − W/2 + 1.5`; for Δ ≥ 180°, `R_L = Ro`.

### 14.7 Flat-plane oracle
- 10 s scripted input logs (straight, slalom, drift chain, booster, instant boost, wall-free) run in the 3D sim on the flat test plane and in `test/oracle/proto2d.ts` patched test-side to use this spec's integer timers (§1.3) and quantization (§15).
- Pass: position error ≤ 1e-6 m at every tick (E).

### 14.8 3D and robustness suites (L1 done criteria)
| Suite | Pass |
|---|---|
| 10k random drop tests per `_test` track and roster track (random x, z, height 0.5–20 m, random velocity) | no fall-through; every drop lands on ground or triggers a kill respawn |
| Boosted wall tunnelling (45.3 m/s at 0–90° into every wall type) | never crosses a wall |
| Loop traversal (`_test/loop.ctd`, R 12 m, track gravity) | enters and exits at ≥ 30 m/s with no ground loss > 6 ticks |
| Halfpipe (`hp60`) | a kart at 30 m/s can hold a line at 55° wall angle for 2 s without respawn |
| Determinism with contacts | 8 karts with random inputs, 2 runs, Node vs Chromium: identical `hashWorld` every 100 ticks |
| Archetype spread | Speed/Balance/Drift AI laps on D1, D3, D5 test stages within ±2% |
| Kart contact symmetry | swapping slot numbers of two colliding karts gives mirrored results |

---

## 15. Quantization (ADR-003, B2)

### 15.1 Grids
| Quantity | Grid | Fields |
|---|---|---|
| POS | 1/4096 m | `p`, `TrackLoc.s/u/h/sMain`, `raceDist`, projectile `s/u/h/px/py/pz`, hazard `px/py/pz` |
| VEL | 1/4096 m/s | `v` |
| DIR | 1/32768 | `f`, `n` (renormalized at the start of the next tick, §6.1) |
| YAW | 1/4096 rad/s | `yawRate` |
| GAUGE | 1/65536 | `gauge`, `team.gauge` |
| SLIP | 1/32768 | `driftPeak` |
| FRAC | 1/65536 | `finishFrac` [P] |
Everything else in the world is already an integer. `q(x, g) = Math.round(x / g) · g`; with power-of-two grids this is exact.

### 15.2 Canonicalization (phase 8 and 9)
- Absolute-tick fields ≤ `tick` → 0 (§1.3).
- Ended effects are removed from `effects[]` after their `onEnd`; removed projectiles and hazards leave no tombstones.
- `boostKind = 0` whenever `boostTicks = 0`.
- `driftDir`, `driftTicks`, `driftPeak` reset to 1, 0, 0 when `drift = 0` [P].
- Result: two peers with the same inputs and decisions produce byte-identical snapshots and equal `hashWorld` (FNV-1a over the quantized integers, decisions excluded).

---

## 16. Open contract points
| Item | Current handling | Suggested contract request |
|---|---|---|
| Start-press tick | Encoded in `startTicks` during `PRE`/`COUNTDOWN` (§7.1.3) | Add `KartDrive.startPressTick: Tick` |
| Slow-ticks counter for manual R | Kept in `respawnUntil` while `respawnPhase = 0` (§12.5) | Add `KartRace.slowTicks: number` |
| Pad boost source for VFX | `boostKind = normal`; client infers "pad" from `surf` | Optional `BoostKind` 5 = pad |
| Kart spec ±1% | A few content values exceed ±1% (§3.2) | Confirm with the spread test or adjust in L1 |

---

## 17. Events (B4) emitted by this spec
`countdown`, `startBoost`, `driftStart`, `driftEnd`, `doubleDrift`, `instantBoost`, `gaugeFull`, `teamGaugeFull`, `boostStart`, `boostEnd`, `draft`, `wall`, `bump`, `air`, `land`, `lap`, `finalLap`, `finish`, `retireTimer`, `retire`, `wrongWay`, `respawn`, `rank`, `emote`, `raceEnd`. Each carries a dedupe `key = hash(tick, type, kart, seq)`; the client's `EventDeduper` keeps keys for 2 s so rollback never replays a sound or VFX twice.

---

## 18. Performance targets
- `step()` ≤ 6 µs per kart-tick (bench); gap-2 measured 0.98 µs for the 2D step including the wall query.
- No allocation per tick: all queries write into `StepScratch` objects; contact arrays are preallocated (4 per kart).
