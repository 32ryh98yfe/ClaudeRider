# 01 — Architecture Decision Records & Canonical Constants

This file is the **single source of truth**.
- Where a research report (`docs/research/*`) disagrees with this file, this file wins.
- All durations are **integer ticks at 60 Hz** (1 tick = 16.667 ms), with seconds shown in parentheses.
- Units are metres, m/s and m/s². The world is right-handed with +Y up.

Status keys: **[S]** sourced from research · **[V]** validated by the headless gap-2 simulation · **[P]** proposed design value.

---

## ADR-001 Stack
- **Workspace and language:**
  - pnpm workspace; TypeScript 6.0.3 with `erasableSyntaxOnly`, so there are no `enum`s, namespaces or parameter properties.
  - Node 22.22 runs the server, tools and trackc as `.ts` directly (type stripping). Packages export `./src/index.ts`, so there is no build step.
- **Client:** Vite 8.3.1 with @preact/preset-vite. UI in Preact 10.29.8 plus @preact/signals 2.11.2.
- **Rendering:** three **0.186.1**, pinned exactly.
  - `WebGPURenderer` from `three/webgpu`, TSL node materials, and the `THREE.RenderPipeline` post chain.
  - The WebGL2 backend is the tested path.
- **Audio:** Tone 15.1.22 for music, loaded lazily after the first user gesture. Web Audio for engines and SFX.
- **Network:** ws 8.22.0 for the WebSocket server.
- **Fonts** (all OFL): Pretendard Variable (UI, KR/EN), Barlow Condensed (HUD numerals), Black Han Sans (KR banners).
- **Tests:** vitest 5.0.2. **@playwright/test 1.56.1**, the only version matching the installed chromium-1194. Never run `playwright install` locally.

## ADR-002 Renderer backend and fallback
Spike results from M0 (see `tools/spike/`):
- **S1 PASS.** `WebGPURenderer({forceWebGL:true})` in headless Chromium 141 with `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` rendered all of this correctly:
  - TSL `colorNode`
  - `MeshPhysicalNodeMaterial` with clearcoat
  - shadows
  - MRT with bloom on emissive
  - FXAA through `RenderPipeline`
  - At 960×540 it ran at about 200 ms per frame (software rasterizer), which is fine for tests.
- **S2 FAIL.** With Chromium 141's experimental SwiftShader WebGPU adapter, three r186's WebGPU backend throws `The provided value is not of type 'GPUTextureComponentSwizzle'` on the **first render**, not in `init()`.
- **Decision.** Keep WebGPURenderer and TSL. The renderer factory `render/engine/createRenderer.ts` must:
  1. honour `?renderer=webgl2|webgpu|auto` and the persisted setting;
  2. in `auto` mode, init WebGPU, run a **trial render** (a 1×1 pass through a `RenderPipeline` inside try/catch, plus `device.lost` and uncaptured-error listeners), and on any failure dispose it and recreate with `forceWebGL:true`;
  3. persist the backend that worked in localStorage (`cr.renderer.backend`), keyed by `navigator.userAgent`;
  4. report the backend in the debug overlay and in `window.__cr.backend`.
- **CI and e2e** always use `?renderer=webgl2` with the SwiftShader flags.

## ADR-003 Determinism contract (sim)
1. `step()` is pure and mutates `WorldState` in place. It never uses `Math.random`, `Date` or `performance`, and it has no DOM or three.js dependency.
2. **Allowed arithmetic in `packages/sim/src/**` except `ai/**`:** `+ − * /`, comparisons, bit operations, and `Math.sqrt/abs/min/max/floor/ceil/round/trunc/sign/fround/imul`. The `**` operator and all transcendental functions are banned; lint enforces this.
   - Use the polynomial small-angle rotation and the rational decay `1/(1+x+x²/2+x³/6)` from the prototype.
3. Every timer is an integer tick count. `quantizeWorld()` is the **last** operation of every tick:
   - position and velocity on a 1/4096 grid;
   - direction vectors on 1/32768, renormalized at the start of the next tick;
   - gauge on 1/65536.
4. Iteration order is fixed: karts by slot; effects, projectiles and hazards by id. Every sort has an explicit tie-break.
5. Randomness comes from an integer PRNG (mulberry32 via `Math.imul`) seeded from `RaceConfig.seed`. **Item rolls are the exception**: they use the authority's secret HalfSipHash-2-4 key, which predictors never see.
6. Track data comes from baked `.ctrk` bytes, so the sim never evaluates trig on track data.
7. AI (`sim/src/ai/**`) may use trig. It runs only on the authority (the server, or the offline Worker). It produces `InputFrame`s, which are relayed like human inputs.

## ADR-004 Simulation constants (Balance archetype)
Source: the gap-2 canonical model **[V]**, calibrated against classic KartRider **[S]** where marked.

### Speed scale
| Name | Value | Note |
|---|---|---|
| V_GRIP | 34.0 m/s | grip top speed; displays 183.6 km/h [S KRD 183.33] |
| V_BOOST | 44.4 m/s | boost cap; displays 239.8 km/h [S KRD 239.54] |
| KMH_PER_MPS | 5.4 | display = v·3.6·1.5 |
| V_REF | 34.0 | every item speed multiplier is relative to this |

### Longitudinal
| Name | Value |
|---|---|
| A0 | 18 m/s², a = A0·(1−(u/V)²) below cap [V: 0→100 km/h display 1.17 s; 0→97% 3.95 s] |
| overspeed decay | a = −0.9·(u − V) s⁻¹ above cap |
| coast | −2.5 m/s² |
| brake | −24 m/s² (grip), −14 m/s² (drifting) |
| reverse max | 10 m/s |

### Boosts
| Boost | Duration | Law |
|---|---|---|
| Gauge booster (speed mode) | **180 ticks (3.0 s)** [S classic 2900–3000 ms] | a = min(25, 4·(V_BOOST − u)), never below the base-acceleration law |
| Chain | a new booster can fire when < 15 ticks remain | adds 180 ticks; does not stack speed |
| Team booster | **270 ticks (4.5 s)** [S 1.5× normal] | target V_BOOST·1.02 |
| Item Turbo Token | 180 ticks [S ItemBoosterTime 3000] | same law as the gauge booster |
| Start boost, speed mode | PERFECT **90** (1.5 s) [S 1500 ms] / GREAT 60 / GOOD 36 | a ≤ 30 m/s² toward V_BOOST |
| Start boost, item mode | ×0.67 → 60 / 40 / 24 | same law |
| False start | 18 ticks of wheelspin at 30% acceleration | — |
| Instant boost (순간 부스터) | **window 30 ticks (0.5 s)** [S] after a *full* drift (≥ 15 ticks, peak slip ≥ 8°); triggered by a throttle press edge; effect 30 ticks | a ≥ 9 m/s², capped at 1.05·V_GRIP (35.7 m/s); ignored while boosting |
| Draft | charge **120 ticks** [S draftTick 2000 ms] in the cone, then active **90 ticks** | vT = 1.05·V_GRIP (35.7), A0 × 1.1. Cone: 4–22 m behind, lateral < 2.2 m, both karts > 20 m/s. The meter drains at 2× its fill rate outside the cone. |

Start-boost windows are measured in ticks from the first throttle press to the GO tick:
- PERFECT: [0, +6]
- GREAT: [−6, −1] ∪ [+7, +12]
- GOOD: [−12, −7] ∪ [+13, +21]
- FALSE: earlier than −12
- Later than +21: no boost.
- Releasing the throttle cancels a start boost. Otherwise, releasing the accelerator does **not** cancel boosts; KRD removed the classic behaviour.

### Steering and drift
| Name | Value |
|---|---|
| Grip yaw target | r* = steer·1.55·v/(v+4)/(1+(v/33.5)²) rad/s; lag K = 12 s⁻¹ → full-steer radius 39.5 m at 30 m/s, 49.8 m at 34 m/s |
| Grip lateral damping | k = 18 s⁻¹, η = 0.10 (share of scrubbed lateral speed returned to forward) |
| Drift entry | drift held and \|steer\| ≥ 0.3 and u ≥ 10 m/s and lockout expired (6 ticks); kick +1.2 rad/s yaw, +4° heading, v×0.99 |
| Double drift | new drift press while drifting after ≥ 9 ticks: +0.8 rad/s, +3°, ×0.99 |
| Drift yaw target | r* = dir·(0.6/(1+t/0.6) + 1.2·s_in + 0.7·held); lag K = 6 s⁻¹; s_in = steer·dir |
| Drift lateral damping | neutral 5.5, full-in 3.0, full-counter 9.0 (lerp outside \|s_in\| < 0.3); ×0.85 while drift held; η = 0.80 |
| Slip cap | 55° |
| Drift drag | dv = −0.8·v·sin²β·dt; drift acceleration capped at 5 m/s² |
| Drift exit | sinβ < sin 6° after ≥ 7 ticks, or u < 5 m/s. Releasing Shift does **not** end a drift [S]. |
| Gauge | dG/dt = 0.70·√min(sinβ/0.5, 1)·(v/V_GRIP)/(1 + T_f/1.5). The fatigue timer T_f rises 1/s while drifting and falls 1/s otherwise. No gain while in wall contact, airborne or below 10 m/s. G ≥ 1 → +1 booster (2 slots); with full slots G is held at 1. |

Validated corner envelope **[V]**:
- Optimal 90° drift: 4–7% drop and 0.31–0.42 gauge per corner, so about 2.4–3.2 corners per booster.
- Clumsy drift: −41 km/h.

### Walls (e = 0.15)
| Impact angle θ | Response |
|---|---|
| < 15° (grind, 벽 비비기) | remove into-wall velocity; 10 m/s² friction while touching; nose projected parallel; drift kept |
| 15°–45° | tangent speed × lerp(0.95 → 0.70); drift cancelled; fractional gauge ×0.5; instant boost cancelled |
| > 45° | tangent ×0.40; stun **15 ticks** (no throttle, yaw ×0.3); booster cancelled; nose realigned along the wall |

- Stored boosters are never lost.
- Crash camera shake above 9 m/s wall-normal speed; "big crash" above 18 m/s.

### Air, landing, gravity
- **Gravity G = 28 m/s²**, fixed. Jump validation V11 is computed at this value.
- In the air:
  - no steering (yaw damping 3 s⁻¹) and no gauge;
  - the drift state is frozen;
  - pitch eases toward the velocity direction.
- Landing: when vertical impact speed exceeds 6 m/s, v_f × (1 − min(0.12, 0.01·(v_imp − 6))).
- Coyote time: 6 ticks.

### Kart contacts
- Spheres with r = 0.85 m, centred 0.6 m above the contact point.
- Mass = the kart weight stat (0.85–1.2), ×1.5 while boosting.
- Restitution 0.3. Impulse along the contact normal, capped at Δv 6 m/s per contact.
- The rear kart transfers 10% of its closing speed to the front kart.
- Ghosted karts are skipped. Contacts are evaluated after each half-step.

### Respawn and wrong way
- **Triggers:**
  - below `killY`, or in a kill zone;
  - no ground for > 72 ticks outside declared jump spans;
  - off-graph for > 180 ticks;
  - wrong way for > 240 ticks;
  - manual R.
- **Manual R** is allowed when speed has been < 3 m/s for 60 ticks, or while the wrong-way banner shows. Cooldown 180 ticks.
- **Sequence:**
  1. Fade out for 24 ticks.
  2. Place the kart on the last valid main-line sample: centreline, facing the tangent, speed 0.
  3. Control returns after 30 ticks.
  4. Ghost for **120 ticks**: kart–kart collisions off, but **items still hit**.
  - The active boost and the drift are cancelled. Stored boosters, gauge and items are kept.
  - Total cost is about 2.5–3 s [S "reset costs ≈3 s"].
- **Wrong-way banner:** the heading makes an angle > 110° with the track tangent (dot < −0.342) while speed > 4 m/s, for 72 ticks. The banner reads "역주행! R: 코스 복귀".

### Kart archetypes (±2% lap-time spread required)
| Stat | Speed | Balance | Drift |
|---|---|---|---|
| V_GRIP | 34.4 | 34.0 | 33.6 |
| V_BOOST | 45.0 | 44.4 | 43.8 |
| A0 | 16.5 | 18 | 19.5 |
| T_BOOST (ticks) | 186 | 180 | 174 |
| g0 (gauge) | 0.64 | 0.70 | 0.77 |
| k_in / k_neutral | 2.8 / 5.2 | 3.0 / 5.5 | 3.3 / 5.9 |
| Y_G | 1.50 | 1.55 | 1.60 |
| C_β | 0.85 | 0.80 | 0.75 |
| weight | 1.10 | 1.00 | 0.92 |

Kart bodies:
- pebble (balance), clay_comet (balance), arrowhead (speed), tugboat (balance, weight 1.2), glacier_sled (drift), neon_blade (speed), jet_kettle (drift), crown_cruiser (speed).
- Minor per-body variation of at most ±1% on top of the archetype.

## ADR-005 Tick order (identical on authority and predictor)
1. Latch inputs. Derive drift and throttle edges from `prevHeld` and `prevThrottle`.
2. Apply effects whose start tick is now, in effectId order.
3. Kart dynamics: integrated **once**.
4. Move and collide in **2 half-displacements**: ground ray, wall sphere, then kart contacts after each half.
5. Projectiles and hazards: commits, landings, contacts.
6. Item boxes and roulette.
7. Progress, laps, rank and rules.
8. Timers.
9. `quantizeWorld()`.
10. Emit events. Snapshots go out on even ticks.

## ADR-006 Track pipeline
- **Authoring.** Tracks are written in the gap-3 turtle DSL at `tracks/<themeId>/<trackId>.ctd`. A `CLOSE` solver computes the free straights for exact closure.
- **Baking.** `packages/trackc` bakes each track into:
  - `<id>.ctrk`: physics and semantics, loaded by client and server;
  - `<id>.vis`: render chunks, props, terrain and minimap, loaded by the client only;
  - `<id>.meta.json`
  - Output goes to `apps/client/public/tracks/` (gitignored). `tracks/golden.json` holds the content hashes.
- **Collision.** Our own **TriHash**: a sparse uniform 3D grid with 4 m cells, CSR lists and zero-allocation queries.
  - Ground: a ray along −up (origin +1.0 m, far 2.0 m).
  - Walls: a sphere query with r = 0.85.
  - The surface id is a per-triangle `u8`.
  - three-mesh-bvh is **not** used in the sim; it is used only for AO baking in trackc and camera occlusion on the client.
- **Spline graph.** Samples every 1 m per path. It provides progress, laps, rank, wrong-way, respawn, AI tables, item routes, gravity mode and the up hint. Branch paths map affinely onto main-line `s` (sMain), and race distance D = lap·L + sMain.
- **Frames** are computed by us:
  - worldUp frames where |T·Y| ≤ 0.9;
  - double-reflection RMF (Wang et al. 2008) for loops and corkscrews;
  - bank applied last.
  - three's `computeFrenetFrames` and the Catmull-Rom `tension` parameter are not used.
- **Road widths:**
  - D1 15–18 m, D2 14–16, D3 12–15, D4 12–14, D5 11–12. Tracks built for item mode get +2 m.
  - Minimum 11 m in any corner; shortcuts 7–9 m.
  - Validator **V19** checks drift demand: each speed track needs at least `N(D)` corners where the Pro ghost's drift beats grip by ≥ 0.1 s. N = 3/4/5/7/9 for D1–D5.
- **Laps and race length.**
  - laps = clamp(round(115/refLapSec), 1, 5). The speed-mode reference race lasts 100–130 s.
  - The roster uses 12 × 3-lap, 6 × 2-lap and 2 × 1-lap tracks. The off-roster **Proving Ring** is 5 laps of about 700 m.
- **Validators V1–V18** follow gap-3 §5. V19 is drift demand; **V20** is the render budget (draws, materials, triangles per vis chunk, by tier).
- **Checkpoints:**
  - ordinary gates every 30 m (20–25 m where cutting is possible);
  - at least 6 key gates on main-line stretches, outside branch, rail and warp spans;
  - anti-cut: accept a new s only within Δs ≤ v·dt + 10 m.

## ADR-007 Netcode
- **Rates.** One clock at 60 Hz. Snapshots at 30 Hz, on even ticks, and lossless (quantized state). The client sends one `InputFrame` per tick; the codec allows up to 4 per message after a stall.
- **Client run-ahead.** Lead ℓ = ⌈(RTT/2)/dt⌉ + 2 + ⌈2σ_jitter/dt⌉.
  - The client keeps slack near 2 ticks by running at 59 or 61 ticks per second.
  - It hard-resyncs when the error exceeds 15 ticks.
- **Late inputs.**
  - A late input applies from the tick it arrives, with its edges at that tick. The server never rewinds.
  - Inputs more than 45 ticks ahead are dropped.
  - When an input is missing, the last analog values are held; after 6 ticks, steering decays by ×0.85 per tick. Clients use the same rule.
- **Full-world prediction.**
  - The server relays every input straight away. Clients restore **all** karts from each snapshot and replay them.
  - Remote karts are drawn through a critically damped spring (120 ms). Errors of 4 m or more snap.
- **Items: Scheduled Conditional Effects** with a fixed lead of **21 ticks**.
  - Projectile and hazard ids are hash(type, owner, useTick, slot).
  - Item boxes are **personal**: a box breaks per racer and respawns for that racer 150–180 ticks later, derived from the box id.
  - Roulette lasts 30 ticks. The roll is `HalfSipHash-2-4(secret128, raceId, kart, boxId, tick)` on the authority only. The roulette keeps spinning (up to +30 ticks) until `ITEM_GRANTED` arrives.
- **Bots** run on the authority and decide at tick t the input for **t+8**. They make decisions at 20 Hz and steer every tick.
- **Transport and reliability.**
  - One WebSocket carrying binary DataView frames `u8 type | payload`, laid out per gap-4 §9.
  - EVENTS are ordered, acked, and backed by a 10 s resume log.
  - When `bufferedAmount` exceeds 32 KB, the server skips SNAPSHOT and RELAY, but never EVENTS.
- **Reconnect.** The window is 60 s; an AI takes over the kart after 180 ticks.
- **Deferred to v2:** the shield late-input rescue re-simulation (v1 refunds and shows a "late signal" instead), adaptive lead, dual-timeline aim validation, WebTransport.
- **Aim validation** runs at the use tick T, with a +5° cone margin and a 200 ms anti-spoof clamp.

## ADR-008 Modes and rules
- **Modes:**
  - Solo Speed and Solo Item.
  - Team Speed and Team Item, in **Duo** (4×2) and **Squad** (2×4) formats.
  - Infinite Boost (P2).
  - Time Attack with a local ghost.
  - Quick Race vs AI (offline).
  - Online Quick Match and Custom Room.
- **Start sequence:** intro flyover 240 ticks (skippable offline), grid shot 90 ticks, then countdown 3, 2, 1, GO at 60 ticks per beat.
- **Retire timer:** 600 ticks (10 s) after the first finisher [S].
  - Hard cap: max(3·laps·refLapSec, 240 s).
  - Retired racers are ordered by progress and score 0 team points.
- **Team points:** 10/8/6/5/4/3/2/1, retire 0 [S-derived]. A tie goes to the team with the best single placement.
- **Team item:** the team of the first finisher wins [S]. Friendly fire is off, except area hazards (`token_bomb`, `firewall`, `glitch_puddle`); a room toggle changes this.
- **Team booster:** the team gauge size = 2 × team size × 1 gauge. It is fed by every teammate's drift gauge gains. When it fills, every teammate gets 1 team booster (270 ticks, blue, colour not customizable).
- **Infinite Boost:** gauge auto-fill at 0.45/s, which continues during boost. Start, instant and draft charges are doubled. Holding the item key auto-fires.
- **Finish timing:** the server tick plus the sub-tick crossing fraction, shown to 1 ms. An identical millisecond means a shared rank.
- **Quick Match flow:**
  1. 20 s searching for humans.
  2. A 15 s matching stage (track reveal, loadout, quick chat).
  3. Fill empty slots with AI; casual play fills without a vote.
- **Custom Room:**
  - Codes are 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`; the host can hide the code.
  - The host sets mode, format, track (a fixed track, random, or a 20 s **Track Roulette** vote), laps (Auto or 1–5), retire timer (5/10/15/20 s), item set (standard/light/chaos), AI slots with tier, and friendly fire.
  - When the room is full and everyone is ready, it auto-starts after 10 s. The host can start as soon as every non-host player is ready.
  - Host migration goes to the human who has been in the room longest.
- **Results screen:** 12 s, then back to the room.

## ADR-009 AI
- **Tiers:**

  | Tier | Pace target vs Legend ghost | vMul |
  |---|---|---|
  | Rookie | 88% | 0.93 |
  | Racer | 94% | 0.97 |
  | Pro | 98% | 1.00 |
  | Legend | ≥ 99.5% | 1.00 |

  - **vMul ≤ 1.0 always.** The rest of the pace gap comes from execution: drift optimality, instant-boost rate, line noise and mistakes.
- **Rubber-band:** `race/rubberband.ts capMul()`, a deterministic cap of ±4% keyed to distance from the reference human.
  - Off on Legend, in ranked play, and in the last 15% of the final lap.
- **Driver algorithm:** based on gap-2's validated AI.
  - Pure pursuit with lookahead L = 6 + 0.35v.
  - Speed from a yaw budget.
  - Drift trigger: heading change over the next 40 m > 25° AND curvature > 0.9 × grip capability AND distance within the lead distance.
  - Drift control by heading pursuit.
  - Uses baked AI tables (line offset, vLim, κ, turnAhead40, drift zones).
- **Tier table:** line noise σ 1.2/0.7/0.35/0.1 m; instant-boost success 0.15/0.45/0.8/0.95; item reaction 60–120/30–60/15–30/6–15 ticks; false-start probability 0.08/0.04/0.01/0.

## ADR-010 Items
- The 18-item ClaudeRider set and its drop tables follow `docs/research/03-items.md` §6–7, with speeds converted to V_REF 34 (gap-2 §2):
  - Turbo Token = booster (44.4 m/s, 180 ticks). Tether pull at 1.2·V_REF.
  - Prompt Missile speed = max(1.9·V_REF, target + 20). Top-1 Missile 1.9·V_REF.
  - Throttle Drone caps speed at 0.6·V_REF.
- **Tick timings (gap-4):**

  | Item | Timing |
  |---|---|
  | Missile | airborne **66** ticks (kinematic: visual lift, horizontal speed eased to ×0.25, then 60-tick recovery); warning beeps from ETA 120 |
  | Token Bomb | lob 36 ticks, lands 32 m ahead on the centreline; logic radius 6.25 m (visual 6.5), \|dy\| ≤ 3 m; trap 132 ticks |
  | Bug Report | trap 84 ticks |
  | Mash-out | −7 ticks per alternating tap, at least 3 ticks between credits, at most 12 credits; floor 48 ticks; escape boost 30 ticks |
  | Broadcast Bolt | telegraph 21 ticks; stun 54 ticks, then slow ×0.8 for 48 ticks |
  | Throttle Drone | 210 ticks per stack, ≤ 3 stacks; each extra stack lowers the cap by a further 0.08 |
  | Firewall | 45 m ahead of the leader; arms after 24 ticks; lasts 900 ticks |
  | Glitch Puddle | arms after 18 ticks; lasts 1800 ticks; spin 60 ticks |
  | Tether | 132 ticks |
  | Context Shield | 180 ticks, absorbs 1 hit, then 18 ticks of grace |
  | Alignment Halo | 210 ticks |
  | Mutex Lock | 150 ticks |
  | Mirror Mode | telegraph 30 ticks; reversal 150 ticks |
  | Redaction Cloud | volume r 10 m for 600 ticks; overlay 180 ticks |

- **Status rules:**
  - Hard CC (airborne, trap, spin, stun) refreshes instead of stacking; after it ends, 36 ticks of hard-CC immunity.
  - Throttle Drone is the only effect that stacks.
  - A kart airborne more than 3 m up is immune to ground traps.
- **Defence rules:**
  - Shield and Halo block everything except Throttle Drone and Attention Tether.
  - Interrupt Pulse clears drones (including ones in flight) and opponent tethers, then gives 90 ticks of drone immunity.
- **Homing projectiles** travel along the spline in (path, s, u, h) coordinates at their own speed, passing through walls. Terminal guidance starts at ETA ≤ 21 ticks and fixes the impact tick. There are no breadcrumb histories.
- **Rank buckets:**
  - Rank 1 → top. Otherwise p = (rank−1)/(N−1): p ≤ 0.30 → high, ≤ 0.72 → mid, else low.
  - Distance overrides: > 350 m behind the leader → shift down one bucket (at most to mid); > 600 m → low; more than a lap behind the racer ahead → turbo only.
  - Up to 3 validity rerolls, then turbo.
- **Slots and boxes:**
  - 2 slots; the front slot is used first; Alt/E swaps. There is no discard; you dump an item by using it.
  - With both slots full, a box still breaks and gives nothing.
  - Boxes come in rows of 4–6 at 3 m spacing, about L/250 rows per lap; pickup radius 1.8 m.

## ADR-011 Characters, karts, art
- **Clawd base rig:**
  - Rounded voxel body at the 12×8 cell ratio (1.0 × 0.68 × 0.64 m; RoundedBox r 0.18).
  - 2×2 arm stubs and 4 stubby legs.
  - Eye slots (0.09 × 0.20 m) as swappable decals. **No mouth**: expressions come from the eye decals.
  - Palette: body #D87656, shade #BE684D, eyes #141413, ivory #F9F8F4.
  - A small original **parametric sparkle** floats 0.12 m above the head: 10 rays, radii 0.85–1.05, inner 0.3, ±7° jitter, seeded. It tints to the team colour in team modes. **The exact Claude logo path is never used.**
- **Roster (12):** Clay (classic), Pixel (true voxel), Turbo (racer helmet), Captain Anchor (pirate), Rune (wizard), Nova (astronaut), Kage (ninja), Chef Bisque, Frost (ice crystal), Glitch (neon cyber), Bolt (copper robot), Duke (royal). See `30-art-bible.md`.
- **Karts (8):** Pebble, Clay Comet, Arrowhead, Tugboat, Glacier Sled, Neon Blade, Jet Kettle, Crown Cruiser. Canvas-generated livery.
- **Budgets:**
  - A kart plus driver ≤ 12k triangles at LOD0, 4k beyond 25 m, 1.2k beyond 70 m.
  - A mascot uses ≤ 3 draw calls via the partId palette.
- **Look:** stylized PBR world (MeshStandardNodeMaterial with vertex AO) and vinyl-toy mascots (MeshPhysicalNodeMaterial: clearcoat 0.6, roughness 0.42, TSL Fresnel rim #FFD9C7).
  - Tone mapping: `NeutralToneMapping`, followed by a CDL grade (slope 1.05, saturation 1.1).
- **Disclaimer.** Title screen and Settings → About: "비공식 비상업 팬 프로젝트입니다. Anthropic 및 Nexon과 제휴·후원 관계가 없습니다. / Unofficial non-commercial fan project; not affiliated with or endorsed by Anthropic or Nexon."
- **IP.** No Nexon names, tracks, characters, items, fonts, audio or icons.

## ADR-012 Contradiction resolutions (docs/research/12-contradictions.md)
| # | Topic | Resolution |
|---|---|---|
| 1 | Tick rate | 60 Hz sim; 2 half-step collision moves; 30 Hz snapshots; 1 input frame per tick |
| 2 | Speed scale | V_GRIP 34 / V_BOOST 44.4 / display ×5.4. Every item speed is relative to V_REF 34. The 356 km/h in the HUD reference image is a mock value. |
| 3 | Instant boost | window 30 ticks (sourced 0.5 s); gap-2 effect (+9 m/s², 30 ticks, cap 1.05·V_GRIP) |
| 4 | Start boost | gap-2 tick tiers PERFECT 90 / GREAT 60 / GOOD 36 / FALSE 18 wheelspin (item ×0.67) |
| 5 | Booster and team booster | 180 / 270 ticks (classic ratio 1.5×); item turbo 180 |
| 6 | Team gauge | a shared gauge fed by all teammates' drift gains, size 2·teamSize; each member gets one team booster |
| 7 | Grip and drift constants | gap-2 validated set (ADR-004); gravity 28; collider r 0.85 |
| 8 | Road collision | baked mesh plus TriHash (ADR-006); the spline is semantic only |
| 9 | Frames | own worldUp frames plus double-reflection RMF; no `computeFrenetFrames`, no `tension` |
| 10 | Wall response | gap-2 bands (ADR-004) |
| 11 | Respawn | ADR-004 respawn section |
| 12 | Wrong way | > 110° for 72 ticks at > 4 m/s; auto-respawn after 240 ticks |
| 13 | Item boxes | personal boxes, 150–180-tick respawn, rows ≈ L/250 per lap, first row ≥ 60 m after the line |
| 14 | Friendly fire | off except area hazards (room toggle); team item: first finisher wins |
| 15 | Laps | clamp(round(115/refLapSec)) with a 12×3 / 6×2 / 2×1 split; Proving Ring off-roster |
| 16 | Tracks vs physics | corner limits come from the validated envelope; R_L rules and V19 |
| 17 | AI tiers | names Rookie/Racer/Pro/Legend; vMul ≤ 1; rubber-band as a deterministic sim function |
| 18 | Lobby | 6-character codes; 20 s search + 15 s stage; results 12 s; reconnect 60 s with AI takeover |
| 19 | Rendering | WebGPURenderer + TSL; no `onBeforeCompile` (rim light via TSL); DPR caps 1.0/1.25/1.5/native; chromatic aberration in TSL units, tuned visually |
| 20 | Codex pipeline | ADR-013 |

## ADR-013 Codex art pipeline
The user's ChatGPT/Codex runs on their own PC, which this cloud session cannot reach. So:
1. **Procedural baseline.** Every 2D slot (portrait, hero, kart, thumbnail, loading, key art, card, icon, logo, UI) has a procedural fallback. Most are rendered from the 3D scene into a canvas.
2. **Prompt pack.** `art/codex/manifest.json` lists about 110 slots: id, size, prompt file and reference image. `art/codex/prompts/<slot>.md` holds the prompts; `art/codex/style-guide.md` the house style. `pnpm art:refs` renders procedural reference images with Playwright into `art/codex/refs/`.
3. **Drop-in.** Any `apps/client/public/art/overrides/<slotId>.(webp|png|jpg)` wins over the fallback.
   - It is indexed dynamically by the Vite dev plugin and the Node server at `/art/overrides/index.json`.
   - Static builds snapshot that index at build time.

## ADR-014 Parallel development rules
See the repo-root `CLAUDE.md`.
- Frozen contract files are listed in `contracts.lock`.
- One file per registry entry.
- Every id is pre-assigned in `packages/content/src/ids.ts`.
- Only the orchestrator edits `package.json` and `pnpm-lock.yaml`.
- Lanes run vitest with `--maxWorkers=1`.
