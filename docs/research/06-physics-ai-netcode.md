# ClaudeRider: kart physics, AI racers and multiplayer netcode (research and recommended architecture)

> **Research constraints (please read).** WebSearch had no budget left when this agent started (200/200 used earlier in the session), so every finding here comes from direct WebFetch/GitHub reads. The egress proxy blocked namu.wiki, kartdrift.nexon.com, inven.co.kr, reddit, fandom, wikipedia, MDN, caniuse, rapier.rs, gafferongames, gabrielgambetta, fly.io, render.com, railway.com, tc39.es and YouTube. GitHub, raw.githubusercontent.com and registry.npmjs.org were reachable. As a result, the KartRider: Drift (KRD) specific numbers could not be verified here and are marked **PROPOSED**. Library versions, Colyseus behavior, SuperTuxKart AI tables and WebTransport support **were** verified from primary sources (repos, npm registry, MDN browser-compat-data).

---

## 1. Executive recommendation

| Layer | Recommendation | Why |
|---|---|---|
| Kart physics | **Custom arcade "sphere-proxy + track-frame" kart controller in pure TypeScript**, with no rigid-body engine for karts | Drift feel needs direct control of yaw and lateral grip. Pure TS runs the same in browser, Web Worker, Node server and vitest. Reconciliation replays one kart for a few ticks, which is cheap; a WASM world snapshot would be heavy. |
| Collision queries | **three-mesh-bvh** (0.9.15, peer `three >= 0.159`) over a low-poly collision mesh, plus **analytic spline projection** for progress, lateral offset, AI, respawn and wrong-way detection | BVH handles ramps, bridges, loops and props. The spline gives O(1) track-space data. |
| Physics engine | None for karts. Optional **Rapier** (`@dimforge/rapier3d-compat` 0.21.0) only for client-side cosmetic debris | Rapier is robust, but its raycast-vehicle tire model resists KartRider-style drifting, and prediction would need whole-world snapshots |
| Loop | 60 Hz fixed step, max 5 steps per frame, render interpolation with `alpha = acc/dt`, 2 collision sub-steps (120 Hz effective) | Matches the Colyseus default of 16.6 ms and SuperTuxKart's 120 fps physics |
| Netcode model | **Server-authoritative simulation from inputs + client prediction and reconciliation for the local kart + snapshot interpolation for remote karts** | The same approach as SuperTuxKart's RewindManager. It gives fair kart-kart bumps and item hits, basic anti-cheat, and lets bots run on the server. |
| Transport | `ws` 8.22.0 with a custom binary protocol (DataView), behind a `Transport` interface (WebSocket, in-process loopback, BroadcastChannel, later WebRTC/WebTransport) | The authoritative Room must also run in the browser for solo, split-screen, tests and P2P host mode. The Colyseus server is Node-only. |
| Alternative | **Colyseus 0.18** (`colyseus` 0.18.8, `@colyseus/sdk` 0.18.4), which now ships built-in prediction, reconciliation, lag compensation and experimental WebTransport | A strong option if you want built-in matchmaking and reconnection. See §5.3. |
| Rates | Sim 60 Hz. Inputs sampled every tick and sent every 2 ticks (30 pkt/s) with the last 4 inputs repeated. Snapshots at 30 Hz. Remote interpolation delay about 100 ms. | Bandwidth is about 10 KB/s down and about 1.5 KB/s up per client |
| Tests | vitest (5.0.2) headless: determinism hashes, 8-bot races on all 20 tracks, netcode under simulated latency and loss | See §7 |

---

## 2. Kart physics architecture

### 2.1 Options compared

| Model | How it works | KartRider-drift fit | Net / prediction fit | Verdict |
|---|---|---|---|---|
| **Sphere collider ("Mario Kart style")** | A rolling sphere carries the physics; the visual kart follows it and turns independently. In mixandjam's Unity MarioKart-Drift the sphere is pushed with `AddForce(forward*currentSpeed, Acceleration)`, with `acceleration=30`, `steering=80`, `gravity=10`, drift tiers at driftPower >50/>100/>150, and boost `DOVirtual.Float(currentSpeed*3 → currentSpeed, 0.3s*driftMode)`. Kenney's Godot Starter-Kit-Racing does the same: `vehicle_model.position = sphere.position - (0,0.65,0)`, a raycast for ground, `lerp(linear_speed, target, delta*6)`, braking at `delta*8`. | Excellent. Heading is decoupled from velocity, so drift is simply "rotate heading faster than velocity". | Excellent if the sphere integrator is our own code | **Chosen core** (implemented ourselves, not on a physics engine) |
| **Raycast suspension** (Rapier `DynamicRayCastVehicleController`, cannon-es `RaycastVehicle`, SergeyMakeev ArcadeCarPhysics) | 4 ray springs with dampers, lateral tire friction, anti-roll, downforce, in-air stabilization | Good for car feel. Drift has to be faked by lowering `frictionSlip` or `sideFrictionStiffness`, which is hard to tune for repeatable, long KR-style drifts. | Needs a physics world and snapshot/restore to replay | Rejected for karts |
| **Track-space / spline projection** | State is (s, d, h) along a spline, like F-Zero or HexGL | Very stable and cheap, but constrained. Jumps, bridges and wide plazas are awkward. | Trivial | Use as an **auxiliary** frame, not the only model |
| **Full engine: Rapier** 0.21.0 | WASM. Development moved into `dimforge/rapier` (`typescript/` directory) and `rapier.js` was archived on 2026-07-12. Deterministic flavors exist (`@dimforge/rapier3d-deterministic-compat` 0.21.0). Vehicle controller since 0.12. | Same issue as raycast suspension | Colyseus documents Rapier prediction through `predict.sim` with adopt/pose, but the build must be identical on client and server | Optional, cosmetic props only |
| **cannon-es** 0.20.0 | Pure JS, maintained by pmndrs | Weak (slower, less robust trimesh) | Pure JS helps determinism | No |
| **Jolt** (`jolt-physics` 1.1.0) | WASM port with a WheeledVehicleController (examples: vehicle_wheeled/motorcycle/tank) and a `CROSS_PLATFORM_DETERMINISTIC` build flag. The npm package unpacks to about 44 MB across flavors, and memory management is manual. | Overkill for karts | Heavy | No |

**Recommendation:** a custom kinematic kart that behaves like a sphere, a "yaw-decoupled sphere". Mario Kart Wii also uses custom collision (the KCL triangle format) rather than a generic rigid-body solver; this is well known in the modding community but was not re-verified here because tockdom is blocked. The sim should be a pure function `step(world, inputs[], dt)` in `packages/shared`, with no DOM or three.js scene dependencies. three-mesh-bvh works with plain `BufferGeometry` in Node.

### 2.2 Kart state and step (all values PROPOSED unless noted)

```ts
interface KartState {           // everything needed for exact replay
  pos: Vec3; vel: Vec3; yaw: number; yawRate: number; up: Vec3;
  grounded: boolean; airTime: number;
  drift: 0|1|-1; driftTime: number; gripRamp: number;   // 0..1 re-grip after drift
  gauge: number; boosters: number; boostT: number; instantWindowT: number;
  stunT: number; ghostT: number; itemSlots: [u8,u8];
  s: number; d: number; segHint: number; lap: number; nextCheckpoint: number;
  lastSafe: {s: number; d: number}; offroadT: number; stuckT: number;
}
```

Per tick (dt = 1/60 s):

1. **Ground probe**: a BVH raycast along `-up` of length `r + snap`, where `snap = 0.25 + |v·up|·dt`. `grounded = hit && surfaceNormal·worldUp > 0.5`, the same threshold Kenney uses. Blend `up` toward the hit normal. The hit triangle's material id identifies road, off-road, boost pad or jump pad.
2. **Yaw**. Grip: `yawRate = steer·maxYaw·speedCurve(v)`. Drift: `yawRate = dir·(driftYawBase + steer·dir·driftYawRange)`, so steering widens or tightens the drift but cannot flip it. This mirrors mixandjam's remap of input to 0..2 relative to drift direction.
3. **Longitudinal**: accelerate along heading toward `vTarget = vMax·(1 + boostMul)`, using an ease rather than a hard clamp, like Kenney's `lerp(v, target, dt·6)`.
4. **Lateral grip (the core of the drift feel)**: split velocity into forward and lateral components and damp the lateral part by `v_lat *= exp(-grip·dt)`. `grip` is 14 s⁻¹ when gripping, 2.2 s⁻¹ when drifting, and ramps back over 0.18 s after release. The slip angle β = angle(heading, velocity) drives the smoke, sparks and gauge.
5. **Gauge**: `gauge += chargeRate·|sinβ|·(v/vMax)·dt` while drifting (plus a small trickle while driving). When it passes 1.0 the kart gains a booster; the cap is 2. A KartRider Rush+ clone on GitHub also uses `normalBoostMaxCount = 2`, which is consistent with the series.
6. **Instant boost**: on drift release, open a window W = 0.30 s. An accelerate rising edge inside the window, after a drift of at least 0.25 s, gives +15% vMax for 0.4 s. This is PROPOSED from the series' "순간 부스터" concept and should be tuned in playtests.
7. **Integrate and collide**: two sub-steps of `pos += vel·dt/2`. Walls use a sphere shapecast, `bvh.shapecast` with `closestPointToPoint`, which is the same push-out pattern as three-mesh-bvh's characterMovement example (`depth = radius - distance`, 5 sub-steps there). Kart-kart collision is sphere-sphere (below).
8. **Track frame**: project onto the spline near `segHint` to update s, d, off-road, checkpoint order and lap.

Kart stats worth parameterizing come from the kart stat names shown by kart.cafe (the KRD database): **Boost Acceleration, Drift Acceleration, Boost Duration, Boost Charge, Long-Slide Drift Sustain, Gauge Protection, Starting Boost, Draft (slipstream) Acceleration, Auto Long-Slide Drift**. Mapping ClaudeRider kart classes onto an original set of stats along these axes captures the "feel" without copying data.

### 2.3 Collisions

- **Walls**: remove the normal component with restitution e = 0.25 and keep the tangent at ×0.92 for a "wall scrape". If the impact angle exceeds 50°, add an extra speed loss of 35% and a 0.25 s steering dampen. At boosted 40 m/s the kart moves 0.67 m per 1/60 s tick, and with a radius of about 0.8 m plus 2 sub-steps it cannot tunnel through walls modeled as thick collision boxes. SuperTuxKart runs physics at 120 fps (`stk_config.xml physics fps="120"`).
- **Kart-kart bumping**: sphere-sphere with `n = normalize(pj-pi)` and `pen = ri+rj-|pj-pi|`. Separate by inverse mass. If `vrel·n < 0`, apply `J = -(1+e)·vrel·n/(1/mi+1/mj)` with e = 0.4, and add a minimum shove of 1.5 m/s for tactile "몸싸움" (body contact) feel. A boosting kart gets mass ×1.5. Ghost karts (after respawn or in the start grid) skip this. All of it is PROPOSED.
- **Server authority**: bumps are resolved on the server. Clients predict against remote karts extrapolated to the present (§5.5) and smooth the corrections.

### 2.4 Ground detection: BVH vs analytic spline

Use both:
- **Spline track frame (analytic)**. Precompute samples every 1 m with center, tangent, right, up (including banking), half-width and cumulative s. A uniform 16 m grid hash handles global lookup, and each kart searches a ±20-sample window around `segHint`. Projecting onto the segment gives (s, d, h). This drives progress and ranking, lap and checkpoints, wrong-way detection, AI, minimap and respawn. The windowed search also resolves overpasses and bridges without jumping to the other level.
- **three-mesh-bvh collision mesh**: a low-poly road ribbon, walls, ramps and props with per-triangle material ids. Its README cites 500 rays against an 80k-poly model at 60 fps. We need about 8 karts × 60 Hz × (1 ray + 1 shapecast) × 2 sub-steps, roughly 2k queries/s, which is negligible. Build the BVH once at track load; it can be serialized (`MeshBVH.serialize`) or built off-thread with `GenerateMeshBVHWorker`. The server builds the same procedural mesh from the same seed.

### 2.5 Air, jumps, respawn

- **Airborne** when there is no ground within the snap distance. Gravity is 28 m/s² (PROPOSED, arcade at about 2.9 g; the three-mesh-bvh demo uses -30). Air yaw control is 30%, pitch eases toward the velocity direction, horizontal velocity is preserved and drift state can be held. **Landing** with normal·up > 0.7 projects velocity onto the surface with ≤ 5% loss. Jump pads apply v_up = 12 m/s.
- **Respawn**: store `lastSafe {s, d}` every 0.5 s while grounded on road. Triggers are y < killY, off-road for more than 3 s, stuck (v < 2 m/s for 5 s), wrong way for more than 4 s, or the manual return key (the series has an "R" return). The sequence is a 0.5 s fade, placement at `spline(s_lastSafe - 5 m)` with d clamped to ±(w-1.5) and heading along the tangent, then 1.5 s ghosting. All PROPOSED.

### 2.6 Fixed timestep with interpolation

```ts
const DT = 1/60; let acc = 0, last = performance.now();
function frame(now: number) {
  acc += Math.min((now - last) / 1000, 0.25); last = now;       // clamp hitches
  let n = 0;
  while (acc >= DT && n < 5) { prev.copy(curr); client.tick(DT); acc -= DT; n++; }
  if (n === 5) acc = 0;                                         // avoid spiral of death
  renderer.draw(lerpState(prev, curr, acc / DT));               // interpolate visuals only
  requestAnimationFrame(frame);
}
```

On the server, use a drift-compensated loop based on `performance.now()` with setTimeout/setImmediate, catching up at most 5 ticks.

### 2.7 Determinism

Full lockstep is not required, because reconciliation corrects small drift. Near-determinism still keeps corrections invisible:
- One shared `step`, the same `dt`, a seeded PRNG (mulberry32 with a per-race seed), fixed iteration order by kart id, no `Math.random` or `Date.now` in the sim, and no side effects in `step`. These match the Colyseus 0.18 "determinism contract", which says divergence shows up as "constant small corrections (rubber-banding) even on a LAN" and advises asserting bit-identical output when the same inputs are run twice.
- Basic IEEE arithmetic (+, −, ×, ÷, sqrt) is the same across engines. Transcendental functions (`Math.sin`, `cos`, `atan2`, `exp`, `pow`) may differ in the last bit between V8 (Chrome/Node), JSC (Safari) and SpiderMonkey. Node and Chrome share V8. This is general knowledge; the spec page could not be fetched. Mitigations: use polynomial sin/cos in the sim, or accept tiny corrections.
- **Quantize in the sim**: on snapshot ticks the server rounds authoritative kart state to wire precision (pos to 1/1024 m in int32, vel to 1/256 m/s, yaw to 2⁻¹⁶ turn) *before* continuing. The client then restores exactly the server's state and replays inputs, and the error stays close to zero.

---

## 3. AI racers

### 3.1 Racing line

1. Sample the centerline every 1.5 m. The line is a lateral offset `α_i ∈ [-(w_i - m), +(w_i - m)]` with margin m = 1.2 m.
2. **Minimum-curvature line by iterative relaxation (elastic band)**: repeat 300–500 times: move each point toward the midpoint of its neighbors (a Laplacian step), then clamp to the corridor. This takes under 50 ms at load. TUMFTM's `global_racetrajectory_optimization` notes that a min-curvature line is "quite near to a minimum time line in corners", and our relaxation is a cheap stand-in for their QP.
3. **Curvature**: Menger curvature over 3 points, κ = 4·Area/(|a||b||c|).
4. **Speed profile** (the TUMFTM-style forward/backward pass): `v_i = min(vTop, sqrt(aLat/|κ_i|))`. Forward: `v_{i+1} ≤ sqrt(v_i² + 2·aAcc·Δs)`. Backward: `v_i ≤ sqrt(v_{i+1}² + 2·aBrake·Δs)`. Compute two profiles: `aLat_grip` (e.g. 18 m/s²) and `aLat_drift` (26 m/s², arcade). Mark the sections where the grip profile forces a drop of more than 10% as **drift zones**, and record entry index, apex and exit.
5. Store alternative lines (inside and outside, ±40% of width) for overtaking.

### 3.2 Steering controllers

- **Pure pursuit** on the chosen line: `L = Lmin + k·v`. PythonRobotics defaults are `k = 0.1`, `Lfc = 2.0 m` for real cars; for karts, PROPOSED `Lmin = 6 m`, `k = 0.35 s`, giving L ≈ 16.5 m at 30 m/s. Steering: `δ = atan2(2·WB·sinα, L)` mapped to steer ∈ [-1, 1].
- **Stanley** (`δ = θe + atan2(k·e, v)`, k = 0.5 in PythonRobotics) is better at low-speed precision. Use it for recovery and pit-in-like tight spots.
- **In drift**, heading ≠ velocity, so run a PD on the error between the *velocity direction* and the target direction. Steer then modulates the drift yaw range. Add rate limits: SuperTuxKart uses `time-full-steer = 0.1 s` from center to full lock.

### 3.3 Drift, instant-boost and booster usage

- Start a drift when the upcoming heading change over the next 40 m exceeds 25°, v > 60% of vMax, and the kart is inside a drift zone entry (±3 m jitter per bot).
- Release when the velocity direction is within 8° of the line tangent at the lookahead, or at the zone exit.
- Instant boost: success probability and timing jitter by difficulty (table below).
- Gauge boosters: use on low-curvature stretches (Σ|Δψ| < 10° over the next 60 m), right after being hit, or on the final straight. Hard and Pro keep one booster in reserve for defense after hits.
- Slipstream: KRD has a "Draft Acceleration" stat. When a kart is 5–20 m ahead within ±1.5 m laterally on a straight, follow it and then pull out. SuperTuxKart enables `use-slipstream` only on hard and best.

### 3.4 Avoidance and overtaking

Every 6 ticks, evaluate 5 lateral lane candidates. Cost = w1·|offset − racingLine| + w2·Σ(1/TTC to karts in a 30 m forward cone) + w3·hazard (traps) − w4·wanted pickup (item box, boost pad) + w5·change penalty. Lateral change is limited to 3 m/s. SuperTuxKart's AI similarly picks a non-crashing aim point (`findNonCrashingPoint`), evaluates items within about 30 m, and steers to avoid bad items (`bad-item-closeness = 6`). Aggressive personalities can drop the bump penalty and steer *into* rivals.

### 3.5 Item heuristics (item mode)

A generic, original item taxonomy:
- Homing attack: fire when the target is within 60 m and ranked ahead.
- Straight projectile: fire when a kart is inside a ±8° cone within 40 m.
- Dropped trap: drop when a kart is behind within 15 m, or just before narrow corners.
- Shield: hold it and trigger when a projectile enters `shieldIncomingRadius` (SuperTuxKart uses 10/8/6 m for medium/hard/best).
- Speed item: use on straights.
- Global or leader attack: use when the kart is 3rd or lower.

Every decision is delayed by a per-difficulty reaction time. SuperTuxKart's `item-skill` scale is: 0 = never, 1 = random time, 2+ = tactics.

### 3.6 Rubber-banding (catch-up)

SuperTuxKart implements it as **speed caps keyed by distance to the player** (negative means behind, positive means ahead), interpolated between the first and last AI:
- easy: `first-speed-cap "-100:1.0 -50:0.9 0:0.85 100:0.65"`, `last "-150:0.92 -50:0.75 50:0.6"`
- medium: `first "20:1.0 60:0.9 100:0.85"`, `last "-50:0.94 0:0.85 100:0.75"`
- hard: `first "50:1.0 150:0.9"`, `last "0:0.96 80:0.8"`
- best: `"0:1.0"`, so no rubber band.

ClaudeRider (PROPOSED): cap bots that are ahead of the reference human (the best human in solo, the median human in multiplayer), and give bots that are behind the reference a mild boost of up to ×1.04 in easy and normal only. Item odds weighted by rank handle the rest. **Pro and ranked modes disable rubber-banding.**

### 3.7 Difficulty table (PROPOSED; STK-verified values marked "STK")

| Param | Easy | Normal | Hard | Pro |
|---|---|---|---|---|
| vMax multiplier | 0.88 | 0.94 | 0.98 | 1.00 |
| Line noise σ (lateral) | 1.2 m | 0.7 m | 0.35 m | 0.1 m |
| Drift usage | only drift zones > 60° | most zones | all | all + optimal entry |
| Instant-boost success / jitter | 0.15 / ±120 ms | 0.45 / ±70 ms | 0.8 / ±40 ms | 0.95 / ±20 ms |
| Item reaction delay | 1.0–2.0 s | 0.5–1.0 s | 0.25–0.5 s | 0.1–0.25 s |
| False start prob (STK) | 0.08 | 0.04 | 0.01 | 0.0 |
| Start delay (STK) | 0.3–0.5 s | 0.25–0.4 s | 0.15–0.28 s | 0.15–0.2 s |
| Slipstream (STK) | off | off | on | on |
| Mistake rate (wall taps per lap) | 1.5 | 0.7 | 0.25 | 0.05 |
| Rubber band | strong | medium | light | none |

### 3.8 Personality variance

Each bot seeds traits from the race PRNG: aggression (bumping, attack-item eagerness), line bias (inside or outside), risk (late braking, shortcuts), consistency (noise σ multiplier 0.7–1.3), drift style (long-slide vs short chains), and item hoarding. Map traits to the Claude-mascot variants so each character has a recognizable driving style. Bots emit exactly the same `Input {steer:int8, buttons:u8}` as humans. That lets the same code drive a disconnected player's kart (AI takeover) and lets the AI run on the server. Stuck recovery: v < 2 m/s for 2 s → reverse and counter-steer for 0.8 s → respawn after 5 s.

---

## 4. What existing web and indie kart racers do

- **SuperTuxKart** (open source, online since 0.10): server-authoritative with client prediction and full rollback. Its `RewindManager` keeps "states... confirmed (received by the network server)" and "events (any change in the kart controls...)" which "will always be kept (in order to allow replaying)". The rewind loop is undoState/undoEvent → rewindToState(t_min) → re-simulate to t_current. `GameProtocol` messages: `GP_CONTROLLER_ACTION, GP_STATE, GP_ITEM_UPDATE, GP_ITEM_CONFIRMATION, GP_ADJUST_TIME`. The last one is the server asking a client to adjust its clock to reduce rollbacks. Actions are packed into 64-bit tuples.
- **KartRush** (three.js + cannon-es + socket.io, LAN party): the server "owns the physics world, runs a fixed 60 Hz timestep, and broadcasts state", and phones send only inputs.
- **NotBlox** (three.js + Rapier on the server + uWebSockets.js): a 20 Hz tick with interpolation and *no* prediction, and its README admits it "may feel laggy if you're far from the server". This is the lesson: a racer **needs** local prediction.
- **Mario Kart 8 / KRD**: widely reported to use owner-authoritative P2P (MK8) and dedicated servers with cross-play (KRD). Neither could be verified because the sources were blocked.

---

## 5. Multiplayer netcode

### 5.1 Transport options (verified versions)

| Option | Status | Fit |
|---|---|---|
| **`ws`** 8.22.0 | Standard Node WebSocket. Disable `perMessageDeflate`; use binary frames with `binaryType='arraybuffer'`. | **v1 choice** |
| **uWebSockets.js** v20.71.0 | Not on npm (`npm i uNetworking/uWebSockets.js#v20.x`). Native addon; Node support moves between releases (v20.67 added Node 26 and dropped 20 and 25). Claims 13× faster than Fastify. | Unnecessary for 8-player rooms; deployment friction |
| **Colyseus** 0.18.8 (core 0.18.18, sdk 0.18.4) | Rooms, matchmaking (`joinOrCreate`, `filterBy`, `sortBy({clients:-1})`), `allowReconnection(client, s)`, `seatReservationTimeout 15 s`, `patchRate 50 ms`, sim 16.6 ms, Schema limited to 63 fields. The **new 0.18 netcode** provides `setFixedTimestep`, `defineInput` (bufferMaxSize 32, `sanitize` clamps), `room.input()`, `Predict.get(room,{mode:"lerp",delay:100})`, `predict.reconciler({step, smoothMs:65})`, `attachAll` (lerp/extrapolate/damped/reckon), `defineEvent` (grace 10 ticks, TTL max(2×rtt, 600 ms)), `allowRewindState({maxRewindMs:500})` and a `snap` threshold for teleports. | Strong alternative |
| **geckos.io** 3.1.0 (node-datachannel 0.32.1, Node ≥ 18) | WebRTC unreliable channels. Needs UDP ports 1025–65535, and "Not intended for developers new to multiplayer games". | Hard on PaaS hosts that lack UDP; skip for v1 |
| **WebTransport** | MDN BCD: Chrome 97, Firefox 114, **Safari 26.4**; datagrams supported; standard track. Server side: `@colyseus/h3-transport` ("hasn't been battle tested"), `@fails-components/webtransport`, needs HTTP/3 and certificates. Colyseus unreliable input uses `historySize: 4` redundancy. | v2 upgrade path for UDP-like input and snapshots |
| **WebRTC P2P** (PeerJS; Trystero with serverless signaling over Nostr, BitTorrent or MQTT) | No game server, but NAT/TURN issues and no host migration built in | Optional "friends" mode, v2 |

### 5.2 Authority model

**Server-authoritative from inputs (recommended)**
- Clients send only `{seq, steer:int8, buttons:u8}`. Buttons: accel, brake, drift, item, boost, return, rear-view.
- The server consumes exactly **one input per kart per tick**, which makes speed hacks impossible. It keeps a buffer of 2 ticks target and 16 maximum. When an input is missing it **holds** the last one, the Colyseus "hold" idle policy. Values are sanitized by clamping.
- Items are fully server-authoritative: inventory, spawn, flight and hit. Clients play optimistic effects, similar to Colyseus `defineEvent` onPredict/onReject.
- Static traps and homing items need no lag compensation, because the victim's server-side kart matches the victim's own prediction. Straight projectiles are simulated on the server without rewind, which favors the victim and keeps it simple.

**Client-authoritative with validation** is kept only as the fallback for P2P mode. Each owner simulates its own kart and the host validates: speed ≤ vMax·(1+maxBoost)·1.1, per-tick displacement, monotonic spline progress, and checkpoint order.

### 5.3 Why custom `ws` over Colyseus for v1

The authoritative `RaceRoom` class must run in four places: the Node server, a browser Worker (solo vs AI with zero latency), vitest, and a P2P host. A dependency-free `RaceRoom` written against a `Transport` interface covers all four. Colyseus Room code is tied to its Node server. If the team prefers built-ins, run `RaceRoom` *inside* a Colyseus Room: use `setFixedTimestep(60)` and binary `sendBytes` messages, and ignore Schema for kart state.

### 5.4 Protocol (little-endian DataView; `u8` type id first)

C→S:
- `0x01 HELLO {proto u16, token[16]?, name, charId u8, kartId u8}`
- `0x02 QUICK_MATCH {mode u8}` / `0x03 JOIN_CODE {code}` / `0x04 READY {u8}`
- `0x10 INPUT {firstSeq u32, n u8, [steer i8, buttons u8]×n}`: sent every 2 ticks with the last 4 inputs (n = 4), about 13 B
- `0x11 PING {t0 f64}`, `0x12 EMOTE {id u8}`, `0x13 LEAVE`

S→C:
- `0x81 WELCOME {playerId u8, token[16], serverTick u32, simHz u8, snapHz u8}`
- `0x82 LOBBY {code, mode, trackId, players[{id, name, char, kart, ready, bot}]}`
- `0x83 RACE_INIT {trackId u8, seed u32, mode u8, laps u8, grid[], startTick u32}`
- `0x84 SNAPSHOT {tick u32, ackSeq u32, own: FullKart(~48 B), n u8, others: CompactKart[n], items[m]}` at 30 Hz
- `0x85 EVENTS {tick u32, [type u8, a u8, b u8, c u16]…}`: pickup, fire, hit, lap, finish, place-change
- `0x86 PONG {t0 f64, ts f64}`, `0x87 TIME_ADJUST {slack i8}`, `0x88 RESULTS`, `0x89 ERROR`

CompactKart (~26 B): id u8, pos 3×i32 (1/1024 m), yaw u16, pitch i8, roll i8, vel 3×i16 (1/128 m/s, needed for Hermite curves), flags u16 (drift L/R, boost, air, stun, ghost, shield). FullKart adds all hidden sim fields: timers, gauge, boosters, drift time, grip ramp, items, lap, checkpoint, segHint.

**Bandwidth**: snapshot ≈ 10 + 48 + 7×26 + items (≤ 16×10) ≈ 250–400 B. At 30 Hz that is 7.5–12 KB/s, or about 10 KB/s down with TCP/WS overhead. Upstream is about 30 × (13 + 46) ≈ 1.8 KB/s. Server egress is about 80 KB/s per 8-player room, about 290 MB per room-hour, or about 14 MB per 3-minute race. msgpackr 2.1.0 is fine for lobby and control messages; a JSON-vs-binary benchmark from typed-array-buffer-schema shows 241 B → 56 B (−77%).

### 5.5 Client prediction and remote smoothing

- **Local kart**: predict each tick and store `(seq, input, stateAfter)` in a ring of 128. On a snapshot, restore `own` from FullKart, drop inputs ≤ ackSeq and replay the rest (about 6–15 ticks at 100–250 ms RTT). Render with an error offset that decays exponentially over 80–120 ms (Colyseus default `smoothMs 65`). If the error exceeds 4 m, snap (the respawn case, Colyseus `snap`).
- **Tick alignment**: the client runs ahead of the server by RTT/2 plus 1–2 ticks. The server reports input slack in `TIME_ADJUST`, the same idea as SuperTuxKart's `GP_ADJUST_TIME`, and the client scales its tick rate by ±2% to keep slack at about 2.
- **Remote karts**: Hermite interpolation of (pos, vel) at `renderTime = serverNow − 100 ms`, which is the Colyseus default delay and about 3 server frames like geckos snapshot-interpolation. Yaw uses shortest-arc. When packets are late, extrapolate up to 250 ms, then hold. Phase 2: for karts within 30 m, **sim-extrapolate to present time** using their last input, the "reckon" mode. This keeps side-by-side racing and bumps consistent with the predicted local kart; otherwise remote karts appear v × 0.1 s ≈ 3 m behind.
- On TCP, a lost segment stalls the stream for about 1 RTT. The 100 ms buffer plus extrapolation hides most of it, and WebTransport datagrams remove it in v2.

### 5.6 Race start and time sync

- Send a PING every 2 s (every 250 ms during loading). `offset = ts + rtt/2 − t1`. Keep 8 samples and use timesync's method (5+ samples, discard those more than 1σ from the median, average the rest).
- The server fixes `startTick = now + 3 s·60 + loadingSlack`. Clients render the 3-2-1-GO countdown from the synced clock. Inputs before `startTick` are recorded but ignored for motion. A start boost is granted if accel is pressed within [−0.3, +0.1] s of GO (PROPOSED); a false start before −0.3 s gives a 0.5 s wheelspin (SuperTuxKart uses `startup penalty = 1 s`).
- Finish order is decided by the server tick of the finish-line crossing plus the sub-tick fraction. After the first finisher, a 10 s countdown runs for the rest (PROPOSED; the series is known for this but it was not verified).

### 5.7 Lobby, matchmaking, reconnect

- **Room FSM**: LOBBY → LOADING (all READY or 15 s) → COUNTDOWN → RACING → FINISH (10 s) → RESULTS (8 s) → LOBBY.
- **Quick match**: join the fullest open room of the chosen mode (the `sortBy({clients:-1})` pattern). The race starts when 8 humans join or after a 12 s wait (PROPOSED), with empty slots **filled by bots** whose difficulty matches the room's average skill.
- **Private rooms**: 5-character Crockford-base32 codes.
- **Reconnect**: a 128-bit session token. A dropped kart is driven by the AI for up to 30 s. On reconnect, send a full keyframe snapshot and hand control back. Colyseus equivalent: `onDrop` + `allowReconnection`.
- **Anti-cheat basics**: only inputs are trusted; clamp values; enforce one input per tick with a buffer cap; rate-limit messages at ≤ 60/s per type; validate lap checkpoints in order; items only from server-side inventory; times computed from server ticks; filter names and emotes.

### 5.8 Hosting and zero-server fallbacks

- **v1**: static client on a CDN (Pages or Netlify) and one Node process (`ws`) on a small VM or PaaS near Korea. Fly.io, Render and Railway all advertise WebSockets, but their pricing pages and UDP policies could not be fetched here. Avoid free tiers that spin down on idle, because they cause cold starts.
- **Capacity**: estimated at 0.1–0.3 ms per tick per room at 60 Hz, which puts 30–60 rooms on a vCPU (PROPOSED; to be confirmed with the load test).
- **Zero-server modes**:
  1. **Solo**: `RaceRoom` in a Worker with a LoopbackTransport.
  2. **Split-screen**: 2–4 local players in one Room with multiple viewports.
  3. **BroadcastChannel**: multi-tab on one machine (dev and LAN demos).
  4. **P2P host**: the host browser runs `RaceRoom` over WebRTC. On host loss, the lowest remaining peer id becomes host and restores from the last snapshot. This is v2.

---

## 6. Monorepo layout

```
packages/shared/   sim/ (kart, collide, track-frame, items, ai, prng, quant), protocol/ (ids, encode/decode), room/ (RaceRoom FSM, Transport iface), tracks/ (20 procedural defs)
apps/client/       Vite + three 0.186.1 + three-mesh-bvh; render, input, audio, prediction, interpolation
apps/server/       Node + ws; lobby/matchmaker; hosts RaceRoom instances
```

---

## 7. Testing strategy (vitest 5.x, headless)

1. **Determinism**: same seed and input log run twice give an identical FNV-1a hash over the state; also compare Node against a Worker build in CI.
2. **Golden replays**: recorded input logs with per-100-tick hashes flag unintended feel changes.
3. **Physics invariants** per track:
   - 10k random drop tests never fall through the road.
   - Boosted wall hits never tunnel.
   - 0 → vMax within a target time.
   - Gauge fills in N drifts.
4. **AI**: 8 bots × 20 tracks × 3 laps, run as fast as possible. Assert everyone finishes, nobody is stuck longer than 5 s, lap-time bands hold per difficulty, and the rubber-band spread stays in range.
5. **Netcode**: an in-memory transport with 50/100/250 ms RTT, ±20 ms jitter and 2% loss/spikes. Assert median prediction error < 5 cm, p99 < 50 cm, and that reconnect restores within 1 s.
6. **Protocol**: encode/decode round-trip property tests.
7. **Load**: 50 rooms of bots in one process; tick p99 < 4 ms.


## Key parameters

- **sim_tick_rate_hz**: 60 (dt=1/60 s), 2 collision sub-steps (120 Hz effective) [proposed] — Colyseus room default 16.6ms; STK physics fps=120 (stk_config.xml)
- **max_substeps_per_frame**: 5; frame dt clamp 0.25 s [proposed]
- **snapshot_rate_hz**: 30 (Colyseus default patchRate is 50 ms = 20 Hz) [proposed] — https://raw.githubusercontent.com/colyseus/docs/master/pages/room.mdx
- **input_send**: sample every tick; send every 2 ticks with last 4 inputs redundant [proposed] — Colyseus unreliable input historySize: 4 (recipes.mdx)
- **server_input_buffer**: target 2 ticks, cap 16; hold-last on missing; one input consumed per kart per tick [proposed] — Colyseus defineInput bufferMaxSize default 32, idle policy hold (server-input.mdx)
- **remote_interpolation_delay_ms**: 100 (Hermite pos+vel), extrapolate max 250 ms [sourced] — Colyseus Predict.get delay default 100; geckos snapshot-interpolation default 3 server frames
- **reconcile_error_smoothing_ms**: 80-120 (Colyseus default smoothMs 65); snap if error > 4 m [proposed] — https://raw.githubusercontent.com/colyseus/docs/master/pages/netcode/client-prediction.mdx
- **bandwidth_down_per_client**: ~10 KB/s (snapshot 250-400 B @30 Hz) [proposed]
- **bandwidth_up_per_client**: ~1.8 KB/s [proposed]
- **server_egress_per_room**: ~80 KB/s, ~290 MB/room-hour, ~14 MB per 3-min race [proposed]
- **compact_kart_record_bytes**: 26 (id u8, pos 3xi32 @1/1024 m, yaw u16, pitch i8, roll i8, vel 3xi16 @1/128 m/s, flags u16) [proposed]
- **full_own_kart_record_bytes**: ~48 [proposed]
- **time_sync**: PING every 2 s (250 ms while loading), 8 samples, discard >1 sigma from median, average [sourced] — https://github.com/enmasseio/timesync
- **countdown**: 3 s + GO at server startTick; start boost window [-0.3,+0.1] s; false start 0.5 s wheelspin [proposed] — STK startup penalty=1 s
- **finish_countdown_after_first**: 10 s [proposed]
- **quick_match_wait**: 12 s then fill empty slots with bots; max 8 karts [proposed]
- **reconnect_window**: 30 s with AI takeover of the kart [proposed] — Colyseus allowReconnection(client, seconds)
- **seat_reservation_timeout**: 15 s (Colyseus default) [sourced] — room.mdx
- **colyseus_version**: colyseus 0.18.8, @colyseus/core 0.18.18, @colyseus/sdk 0.18.4; Schema max 63 fields [sourced] — registry.npmjs.org, github.com/colyseus/colyseus/releases, state.mdx
- **ws_version**: 8.22.0 (perMessageDeflate off, binary frames) [sourced] — https://registry.npmjs.org/ws/latest
- **uwebsockets_version**: v20.71.0 (GitHub install only, native) [sourced] — https://github.com/uNetworking/uWebSockets.js/releases
- **geckos_version**: @geckos.io/server 3.1.0 (node-datachannel 0.32.1, Node>=18, UDP 1025-65535) [sourced] — registry.npmjs.org/@geckos.io/server; github.com/geckosio/geckos.io
- **webtransport_support**: Chrome 97, Firefox 114, Safari 26.4 (datagrams supported) [sourced] — mdn/browser-compat-data api/WebTransport.json
- **three_version**: 0.186.1 [sourced] — registry.npmjs.org/three/latest
- **three_mesh_bvh_version**: 0.9.15 (peer three >=0.159.0) [sourced] — registry.npmjs.org/three-mesh-bvh/latest
- **rapier_version**: @dimforge/rapier3d-compat 0.21.0; deterministic-compat 0.21.0; rapier.js repo archived 2026-07-12 (merged into dimforge/rapier/typescript) [sourced] — registry.npmjs.org; github.com/dimforge/rapier.js
- **cannon_es_version**: 0.20.0 [sourced] — registry.npmjs.org/cannon-es/latest
- **jolt_version**: jolt-physics 1.1.0 (~44 MB unpacked multi-flavor) [sourced] — registry.npmjs.org/jolt-physics
- **vitest_version**: 5.0.2 [sourced] — registry.npmjs.org/vitest/latest
- **msgpackr_version**: 2.1.0 (lobby/control messages only) [sourced] — registry.npmjs.org/msgpackr/latest
- **kart_collider_radius**: 0.8 m sphere [proposed]
- **grip_lateral_damping**: grip 14 1/s, drift 2.2 1/s, re-grip ramp 0.18 s [proposed]
- **instant_boost**: window 0.30 s after drift >=0.25 s; +15% vMax for 0.4 s [proposed]
- **booster_slots_speed_mode**: 2 [proposed] — KartRider Rush+ clone CKB_Boost.cs normalBoostMaxCount = 2 (hint only)
- **gravity_air**: 28 m/s^2; air yaw control 30%; jump pad v_up 12 m/s; landing normal.up > 0.7 [proposed] — three-mesh-bvh characterMovement uses gravity -30
- **ground_normal_threshold**: normal.up > 0.5 counts as ground [sourced] — KenneyNL Starter-Kit-Racing vehicle.gd
- **wall_response**: restitution 0.25, tangent keep 0.92; >50 deg impact extra 35% loss + 0.25 s steer dampen [proposed]
- **kart_kart_collision**: sphere-sphere impulse e=0.4, min shove 1.5 m/s, boosting mass x1.5, ghosts skip [proposed]
- **respawn**: lastSafe every 0.5 s; triggers y<killY, offroad>3 s, stuck 5 s, wrong-way>4 s, manual key; place at s-5 m; 0.5 s fade; 1.5 s ghost [proposed]
- **quantization**: pos 1/1024 m (i32), vel 1/128-1/256 m/s, yaw 2^-16 turn; server quantizes state on snapshot ticks [proposed]
- **track_sampling**: spline samples every 1 m (physics/progress), 1.5 m (AI line); grid hash 16 m; hint window +-20 samples [proposed]
- **racing_line_relaxation**: 300-500 Laplacian iterations, corridor margin 1.2 m [proposed] — approximation of TUMFTM min-curvature
- **ai_speed_profile**: aLat_grip 18 m/s^2, aLat_drift 26 m/s^2, forward/backward pass with aAcc/aBrake [proposed] — TUMFTM forward-backward ggv method
- **ai_pure_pursuit**: L = 6 m + 0.35 s * v; delta = atan2(2*WB*sin(alpha), L) [proposed] — PythonRobotics pure_pursuit.py (k=0.1, Lfc=2.0 for real cars)
- **ai_stanley_gain**: k=0.5 [sourced] — PythonRobotics stanley_control.py
- **ai_time_full_steer**: 0.1 s [sourced] — STK stk_config.xml ai section
- **ai_drift_trigger**: heading change >25 deg over next 40 m, v>60% vMax, in drift zone; release when vel-dir error <8 deg [proposed]
- **ai_false_start_prob**: easy 0.08 / normal 0.04 / hard 0.01 / pro 0.0 [sourced] — STK stk_config.xml
- **ai_start_delay**: easy 0.3-0.5 s / normal 0.25-0.4 / hard 0.15-0.28 / pro 0.15-0.2 [sourced] — STK stk_config.xml
- **ai_shield_incoming_radius**: normal 10 m / hard 8 m / pro 6 m [sourced] — STK stk_config.xml
- **ai_rubberband_speed_caps**: STK easy first '-100:1.0 -50:0.9 0:0.85 100:0.65' last '-150:0.92 -50:0.75 50:0.6'; medium first '20:1.0 60:0.9 100:0.85' last '-50:0.94 0:0.85 100:0.75'; hard first '50:1.0 150:0.9' last '0:0.96 80:0.8'; best 0:1.0 [sourced] — https://raw.githubusercontent.com/supertuxkart/stk-code/master/data/stk_config.xml
- **ai_difficulty_vmax_mult**: easy 0.88 / normal 0.94 / hard 0.98 / pro 1.00 [proposed]
- **ai_line_noise_sigma**: 1.2 / 0.7 / 0.35 / 0.1 m [proposed]
- **ai_instant_boost_success**: 0.15 / 0.45 / 0.8 / 0.95 with jitter +-120/70/40/20 ms [proposed]
- **ai_item_reaction_delay**: 1.0-2.0 / 0.5-1.0 / 0.25-0.5 / 0.1-0.25 s [proposed]
- **ai_lane_replan**: every 6 ticks, 5 lateral candidates, lateral rate <=3 m/s, 30 m forward cone [proposed]
- **ai_stuck_recovery**: v<2 m/s for 2 s -> reverse 0.8 s; respawn after 5 s [proposed]
- **server_capacity_estimate**: 0.1-0.3 ms per room-tick at 60 Hz -> 30-60 rooms per vCPU (verify by load test) [proposed]
- **kart_stat_axes**: Boost Accel, Drift Accel, Boost Duration, Boost Charge, Long-Slide Drift Sustain, Gauge Protection, Starting Boost, Draft Accel, Auto Long-Slide Drift [sourced] — kart.cafe stats page (whotookzakum/kart.cafe)

## Open questions

- WebSearch had no budget left for this session (200/200 used), and the egress proxy blocked namu.wiki, kartdrift.nexon.com, inven.co.kr, reddit, fandom and YouTube. So KRD-specific timings (instant-boost window, booster duration, gauge charge rate, finish countdown, respawn behavior, kart-kart collision strength) are unverified and marked PROPOSED. Another agent with access, or raising CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION, could confirm them.
- Hosting prices and UDP/QUIC support on Fly.io, Render and Railway, and the nearest regions to Korea, could not be fetched (domains blocked). Check them before choosing a host or planning WebTransport v2.
- Use raw ws with a custom protocol (recommended, so the Room also runs in a Worker, tests and P2P host) or build on Colyseus 0.18 with its new built-in prediction and reconciliation, which is less than a release cycle old?
- Remote kart display: plain 100 ms interpolation (simpler) or sim-based extrapolation to present time for nearby karts (better side-by-side bumping, more corrections)? Suggest deciding after a latency playtest.
- Is a P2P host mode (WebRTC, host migration) in scope for v1, or only dedicated server + solo + local split-screen/BroadcastChannel?
- Should the sim use polynomial sin/cos for cross-engine (Safari/Firefox vs V8) bit-determinism, or accept tiny reconciliation corrections?
- Item-mode item list (original designs) is needed to finalize item-authority rules (straight shots vs homing vs traps) and AI item heuristics.

## Sources

- https://github.com/colyseus/colyseus/releases
- https://raw.githubusercontent.com/colyseus/colyseus/master/README.md
- https://registry.npmjs.org/colyseus/latest
- https://registry.npmjs.org/@colyseus/sdk/latest
- https://github.com/colyseus/docs/tree/master/pages
- https://raw.githubusercontent.com/colyseus/docs/master/pages/state.mdx
- https://raw.githubusercontent.com/colyseus/docs/master/pages/room.mdx
- https://raw.githubusercontent.com/colyseus/docs/master/pages/netcode.mdx
- https://raw.githubusercontent.com/colyseus/docs/master/pages/netcode/client-prediction.mdx
- https://raw.githubusercontent.com/colyseus/docs/master/pages/netcode/determinism.mdx
- https://raw.githubusercontent.com/colyseus/docs/master/pages/netcode/server-input.mdx
- https://raw.githubusercontent.com/colyseus/docs/master/pages/netcode/lag-compensation.mdx
- https://raw.githubusercontent.com/colyseus/docs/master/pages/netcode/recipes.mdx
- https://raw.githubusercontent.com/colyseus/docs/master/pages/matchmaker.mdx
- https://raw.githubusercontent.com/colyseus/docs/master/pages/server/transport/webtransport.mdx
- https://raw.githubusercontent.com/colyseus/docs/master/pages/deployment.mdx
- https://github.com/dimforge/rapier.js
- https://github.com/dimforge/rapier.js/blob/master/CHANGELOG.md
- https://registry.npmjs.org/@dimforge/rapier3d-compat/latest
- https://registry.npmjs.org/@dimforge/rapier3d-deterministic-compat/latest
- https://raw.githubusercontent.com/isaac-mason/sketches/main/sketches/rapier/dynamic-raycast-vehicle-controller/src/use-vehicle-controller.ts
- https://github.com/gkjohnson/three-mesh-bvh
- https://raw.githubusercontent.com/gkjohnson/three-mesh-bvh/master/README.md
- https://raw.githubusercontent.com/gkjohnson/three-mesh-bvh/master/example/characterMovement.js
- https://registry.npmjs.org/three-mesh-bvh/latest
- https://registry.npmjs.org/three/latest
- https://github.com/pmndrs/cannon-es
- https://registry.npmjs.org/cannon-es/latest
- https://github.com/jrouwe/JoltPhysics.js
- https://github.com/jrouwe/JoltPhysics.js/tree/main/Examples
- https://registry.npmjs.org/jolt-physics/latest
- https://github.com/geckosio/geckos.io
- https://registry.npmjs.org/@geckos.io/server/latest
- https://github.com/geckosio/snapshot-interpolation
- https://github.com/geckosio/typed-array-buffer-schema
- https://github.com/uNetworking/uWebSockets.js
- https://github.com/uNetworking/uWebSockets.js/releases
- https://registry.npmjs.org/ws/latest
- https://registry.npmjs.org/msgpackr/latest
- https://registry.npmjs.org/vitest/latest
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/WebTransport.json
- https://raw.githubusercontent.com/mixandjam/MarioKart-Drift/master/Assets/KartController.cs
- https://raw.githubusercontent.com/KenneyNL/Starter-Kit-Racing/main/scripts/vehicle.gd
- https://github.com/SergeyMakeev/ArcadeCarPhysics
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/data/stk_config.xml
- https://github.com/SuperTuxKart/stk-code/blob/master/src/karts/controller/skidding_ai.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/network/rewind_manager.hpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/network/protocols/game_protocol.hpp
- https://github.com/TUMFTM/global_racetrajectory_optimization
- https://raw.githubusercontent.com/AtsushiSakai/PythonRobotics/master/PathTracking/pure_pursuit/pure_pursuit.py
- https://raw.githubusercontent.com/AtsushiSakai/PythonRobotics/master/PathTracking/stanley_control/stanley_control.py
- https://github.com/iErcann/NotBlox
- https://github.com/mo-ri-ch/KartRush
- https://github.com/enmasseio/timesync
- https://github.com/peers/peerjs
- https://github.com/dmotz/trystero
- https://raw.githubusercontent.com/whotookzakum/kart.cafe/main/src/routes/stats/+page.svelte
- https://raw.githubusercontent.com/diesuki4/Clone-KartRider_Rush_Plus/main/Assets/02.Scripts/CKB/CKB_PlayerDrive.cs
- https://raw.githubusercontent.com/diesuki4/Clone-KartRider_Rush_Plus/main/Assets/02.Scripts/CKB/CKB_Boost.cs
- https://github.com/brunosimon/folio-2025
