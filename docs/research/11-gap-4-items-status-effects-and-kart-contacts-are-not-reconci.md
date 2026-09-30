# ClaudeRider: netcode spec for items and status effects (v1)

**Scope.** This spec covers how server-decided items, status effects and kart contacts reach clients that predict locally. It uses the existing setup: 8 racers, an authoritative Node `ws` server, a shared deterministic `step()`, a 128-entry input ring, remote karts drawn with Hermite interpolation at serverNow − 100 ms, and a `RaceRoom` class that also runs in a Web Worker.

**How the research was done.** Web search was not available (the session's 200-search budget was already used). The egress proxy blocked GDC Vault, the Valve wiki, namu.wiki and kartdrift.nexon.com. All evidence below therefore comes from primary source code and docs read through raw.githubusercontent.com and GitHub code search, plus one CPU benchmark. That benchmark was the sibling physics agent's headless sim, run read-only: `step()` costs **983 ns per kart-tick** and an AI decision **9.9 µs**, in Node 22 in this container.

**Labels.** Values marked PROPOSED are design choices, not sourced facts. All tick counts are at 60 Hz: 1 tick = 16.67 ms.

---

## 0. Decisions at a glance

1. **One clock: 60 Hz** for the sim, inputs, item timers and event ticks.
   - `step()` may run 2 fixed collision sub-steps internally, which honours the 120 Hz physics request without touching the protocol.
   - **Snapshots are sent at 30 Hz** (every even tick).
   - Events are flushed at the end of the tick that produced them.
2. **Inputs carry the tick they are for, and the client runs ahead.** This is the model used by STK, Unity and Source; the server does not consume inputs in arrival order.
   - The client simulates tick P ≈ serverTick + ⌈RTT/2⌉ + 2 ticks of slack.
   - The server applies the input for tick T at tick T.
   - A late input is applied at the tick it arrives. The server never rewinds, except for one bounded case, the shield rescue (§5).
3. **Every hard effect is a Scheduled Conditional Effect (SCE).**
   - The server commits "effect E hits kart K at tick S = decision + lead, if K's own state at S allows it" (shield, immunity).
   - lead ≥ 21 ticks (350 ms). That covers victims with RTT ≤ ~250 ms plus 3 ticks of jitter margin. For laggier rooms the lead stretches to 36 ticks.
   - The victim checks the condition on its own predicted timeline with its own inputs. When its inputs are on time, the correction is **zero**.
4. **Area and static hazards are judged on the victim's timeline**, with no lag compensation. This covers the bomb landing, the puddle and the barrier ("Firewall"). Each gets an arming or flight lead, and victims predict the hit themselves.
5. **All remote karts are predicted to the present.** This follows STK: the server relays each client's inputs to the others, and each client replays the whole world. Interpolation stays for spectators and as a fallback.
6. **Bots run on the server** and go through the same input and item paths. Each bot's input is decided 8 ticks ahead, so clients can predict bots.
7. **One WebSocket carries three reliability classes:**
   - EVENTS: ordered, delivered once, acked, with a 10 s log for resume.
   - SNAPSHOT and INPUT_RELAY: latest wins, coalesced when the socket backs up.
   - Snapshots repeat the *consequences* of events (effects, projectiles, item slots). That repetition is the redundancy.

---

## 1. Evidence from reference implementations

| Source | What it does | What we take |
|---|---|---|
| **SuperTuxKart** `data/stk_config.xml`, `server_config.hpp` | Physics `fps="120"`. `state-frequency` defaults to **10** states/s. `max-ping` 300 ms, `jitter-tolerance` 100 ms. | A fixed tick plus a lower state rate is enough when remote inputs are relayed. |
| STK `server_lobby.cpp` (configPeersStartTime) | Race starts at networkTimer + 2500 ms. `m_server_delay = max_ping/2 + jitter_tolerance`, so the **server runs behind** and client inputs arrive before their tick. | The client-lead model. |
| STK `rewind_queue.cpp` mergeNetworkData | *"A server never rewinds… Server received an event in the past. Adjust this event to be executed 'now'."* Clients rewind to the latest state received in their past. | The late-input rule. |
| STK `game_protocol.cpp` | `GP_CONTROLLER_ACTION` carries u32 ticks, kart id, compressed action. The server immediately `sendPacketExcept(peer…)` the action to every other client. `GP_STATE` is sent unreliable. `GP_ITEM_CONFIRMATION` is sent unreliable (*"a future update will come through"*). | Input relay; latest-wins state. |
| STK `rewind_manager.cpp` | Restores the full state at t_min, then replays all events and `updateWorld(1)` up to now. `computeError()` then feeds visual smoothing. | Full-world replay. |
| STK `network_item_manager.cpp` | The server keeps item events (collect, drop, switch) and **re-sends them in every state until every client has confirmed that tick**. Clients predict collection. Unconfirmed predicted drops are deleted on restore. | Acks, and snapshots that carry the consequences of events. |
| STK `projectile_manager.cpp`, `flyable.cpp` | Projectile uid = (type, kartId, u32 fire tick). A client builds a missed projectile from that uid. A predicted flyable with no server state is removed in `computeError()`. | Deterministic projectile ids. |
| STK `explosion_animation.cpp`, `abstract_kart_animation.cpp`, `kart_rewinder.cpp` | The explosion is a pure function of `m_created_ticks`, the created transform and `direct_hit`. Even its random spin is derived from `created_ticks`. `create()` returns NULL if the kart `isShielded()` and calls `decreaseShieldTime()`, so the shield check happens **inside the sim at the hit tick**. On restore, a kart animation missing from the server state is deleted. Explosion: 1.5 s, radius 6 m, 7 s invulnerability. | Effects defined as (type, startTick, params); shield checked inside the sim. |
| STK `smooth_network_body.cpp` | Visual smoothing: min/max adjust 0.05 m / 4.0 m, min speed 0.3, max adjust time 2.0 s, threshold 4.0. Errors above 4 m snap. | Starting parameters for our smoothing. |
| STK `powerup.cpp` hitBonusBox | Item roll = f(itemId·31 + ticks/10 + position·23 + seed), mixed with an LCG. Ticks are divided by 10 so the client predicts correctly about 90% of the time. The server is final. | We make the seed secret instead (§6). |
| STK `rubber_band.cpp` | The plunger band applies equal and opposite forces to owner and target, and uses the target's predicted position. | The tether uses breadcrumbs instead (§4). |
| **Colyseus 0.18** `predictedEventChannel.ts`, docs | `defineEvent` with onPredict, onReject, confirm. A sim-born prediction **auto-rejects once the server's ack passes birth + graceTicks (default 10)**, which is safe because the confirm travels the same ordered socket as the acks. Predictions started from the UI expire after TTL = max(2×RTT, 600 ms). `allowRewindState({maxRewindMs: 500})`; rewind ≈ renderDelay + RTT + one tick. **"reckon" mode: rewinding a target that is drawn forward-extrapolated to its snapshot stamp double-compensates.** Default `patchRate` is 50 ms (20 Hz). Example setup: 30 Hz with `subSteps: 2`. Unreliable input with a redundancy ring is WebTransport-only. | Ack-anchored settling; the reckon rule for aim checks. |
| **Unity Netcode for Entities** docs and source | Default 60 Hz. For the snapshot rate, "half (or one third) is often good enough". `TargetCommandSlack` = 2 ticks. Each input packet carries 2 + 2 = 4 commands. Prediction switching around the local player uses `SwitchPredictionSmoothing` because timelines differ by about 2× ping. `AlwaysRollbackAllPredictedGhosts` fixes interactions between predicted objects. **Quantize at the end of the server tick**, or replays diverge. | Slack = 2; full rollback; quantization at end of tick. |
| **Source SDK 2013** `player_lagcompensation.cpp` | Rewind = latency + lerp, clamped to `sv_maxunlag` (1.0 s). If the tick the client claims differs from the latency-based estimate by more than 200 ms, the estimate is used. | Anti-spoof clamp for aim validation. |
| **Classic KartRider** (community emulator yanygm/Launcher_V2) | P2P UDP with relay fallback: `PcGameRequestRelay`, `PcGameRequestTcpRelay`, `ChClientP2pAddrPacket`, `PqUdpTimeSync`, and item packets such as `GoItemShield`, `GoItemUfo`, `GoItemMagnet`. The server just forwards opaque `GameSlotPacket`s. Each owner is authoritative for its own kart. | Owner-authority is the historical model; we reject it (§7). |
| SRB2Kart `doomdef.h`, `d_clisrv.h` | Deterministic lockstep: TICRATE 35, BACKUPTICS 32. | Contrast only. |
| Quantum Karts `KartHitReceiver.cs` | Deterministic rollback of every entity. `TakeHit` is ignored during HitCooldown or Immunity. Immunity is extended with `max`. | Refresh-not-stack, then immunity. |

---

## 2. Tick and snapshot rates (Task 1)

**Decision: 60 Hz tick and 30 Hz snapshots.**

| Candidate | Why it loses or wins |
|---|---|
| 30 Hz tick (items doc; Colyseus example) | Inputs are quantized to 33 ms, which is coarse for start-boost windows (sibling spec: PERFECT = 0–6 ticks at 60 Hz) and drift/instant-boost windows. At boost speed of 44.4 m/s a kart moves 1.48 m per tick, against a kart half-width of 0.8 m, so it can tunnel. |
| **60 Hz tick** | 0.74 m per tick. Measured 983 ns per kart-tick means **~107 rooms per vCPU** at 60 Hz including AI. A client full-world replay at 200 ms RTT is 14 ticks × 8 karts ≈ 0.11 ms desktop and ~0.5 ms on a phone (assumed 5× slower). Same default as Unity. |
| 120 Hz tick (driving doc; STK physics) | Doubles CPU (53 rooms/vCPU), replay cost (14.15 ms/s vs 3.54 ms/s) and input traffic, for little gain. Kept as 2 fixed collision sub-steps *inside* the 60 Hz tick if the driving model needs it. |
| 20 Hz snapshots | A 100 ms interpolation buffer holds only 2 intervals, so one late snapshot (TCP head-of-line blocking) forces extrapolation. Corrections are detected up to 50 ms later. |
| **30 Hz snapshots** | 3 intervals in 100 ms, one tolerated loss, ~370 B per snapshot. Breadcrumbs are aligned to snapshot ticks (below). |

- **Inputs** go up every tick (≈14 B per message; ~3.5 KB/s with TCP/IP overhead). `ws` sets `setNoDelay()`.
- **Breadcrumbs** change from the items doc's 20 Hz to **30 Hz on even ticks**, 5 s = 150 samples. The server's trail samples are then exactly the snapshot positions, which are quantized at the end of the tick.
- **AI** decides at 20 Hz; steering follows every tick.

### 2.1 Timeline model

- **Client lead.** ℓ = ⌈(RTT/2)/dt⌉ + SLACK(2) + ⌈2σ_jitter/dt⌉.
  - Every snapshot carries `inputSlack`, an EMA of (input tick − server tick at arrival).
  - The client runs 59 or 61 ticks per second to hold slack near 2. This is Unity's scaling approach; STK uses `m_ticks_adjustment`.
  - The client hard-resyncs if the error exceeds 15 ticks.
- **Arrival at the server.** If input tick T ≥ the next server tick N, it is buffered. If T < N, it is late:
  - analog values take over from N;
  - edges (item use, taps) are applied at N;
  - `effTick` = N.
  - If T > N + 45, the input is dropped and a resync is flagged.
- **Missing input.** The server holds the last analog value. After 6 ticks, steering decays by ×0.85 per tick (analogue of STK `steering-reduction`). No edges are applied.
- **Clients use the same rule** when extrapolating remote karts. So when a remote's input really is late at the server, the client's guess matches what the server does.
- **What each observer sees when the server is at tick X:**
  - its own kart: X + ℓ;
  - remote karts (predicted): also X + ℓ;
  - spectator view: X − 6.
  - A server message sent at tick H reaches a client's predicted timeline at **H + ⌈RTT/dt⌉ + SLACK**.

---

## 3. The core mechanism: Scheduled Conditional Effects

**Rules.**

- **R1.** A hard or soft effect is a record `{effectId, victim, type, startTick S, durTicks, param, source, blockable}`. Applying it is pure and deterministic inside `step()`, and idempotent (by effectId). This mirrors STK's `ExplosionAnimation(created_ticks, transform)`.
- **R2. Split authority.** Some decisions run only on the authority (server, or the worker when offline) behind `ctx.authority`: item rolls, target choice, the commit tick, provisional results and revocations. Everything else is shared by server and clients: kinematics, applying effects, contact between a kart and a static hazard, mash counting, shield and immunity timers.
- **R3. Lead.**
  - lead = clamp(⌈RTT_max/dt⌉ + SLACK + 3, **21**, **36**), where RTT_max is the largest smoothed RTT of any client in the room that predicts the victim.
  - With RTT ≤ ~250 ms, lead = 21, which also equals the bolt telegraph.
- **R4.** The victim's condition is checked at S on the victim's timeline. The condition covers: shield active and not used up, post-absorb grace, post-CC immunity, unblockable flag. Only the victim's own inputs feed it, so the victim predicts it exactly.
- **R5.** Hard crowd control (CC) refreshes instead of stacking: end = S + dur of the new effect. When it ends, immunity lasts until end + 36 ticks (0.6 s). This matches Quantum Karts' `TakeHit` guard.
- **R6. Client handling of events.**
  - If `S > lastSimTick`, insert the effect into the `scheduled` table. There is no rollback.
  - Otherwise, insert it and reconcile from the latest snapshot at or before S. This fallback is identical to STK's "event in the past → rewind".
  - Each snapshot lists pending and active effects. Merge them by id.
- **R7.** Projectile ids and hazard ids are deterministic: hash(type, owner, useTick, slot), as in STK. The shooter's predicted object and the server's object then match without a handshake.
- **R8. Order of work inside a tick** (same on server and client):
  1. inputs;
  2. effects whose start is this tick, in effectId order;
  3. kart integration and bumps;
  4. projectiles and hazards: commits, landings, contacts;
  5. item boxes;
  6. timers;
  7. **quantize**;
  8. emit events (then the snapshot, on even ticks).

**Correction magnitudes.** These assume the victim is at 34 m/s. The kinematic change per tick of lateness is PROPOSED.

| Effect | m per tick late | Baseline: applied late @50 / 100 / 200 ms (k = 5 / 8 / 14 ticks) | This spec, on time | This spec, p99 late j = 1 / 2 / 3 ticks |
|---|---|---|---|---|
| Missile airborne (50% carry + arc) | 0.30 | 1.5 / 2.4 / 4.1 m | **0** | 0.30 / 0.59 / 0.89 m |
| Trap (stop) | 0.50 | 2.5 / 4.0 / 7.0 m | **0** | 0.5 / 1.0 / 1.5 m |
| Spin (×0.4) | 0.33 | 1.7 / 2.7 / 4.7 m | **0** | 0.33 / 0.67 / 1.0 m |
| Stun (×0.5) | 0.28 | 1.4 / 2.3 / 4.0 m | **0** | 0.28 / 0.57 / 0.85 m |
| Drone slow (×0.6) | 0.23 | 1.1 / 1.8 / 3.2 m | **0** | 0.23 / 0.45 / 0.68 m |

"On time" means lead covers the victim's RTT plus jitter. The p99 column assumes ±10 / 20 / 40 ms jitter and 0.5–1% TCP loss (PROPOSED). Late corrections are smoothed; errors of 4 m or more snap.

---

## 4. Timelines for each item (Task 2)

**Missile.** Worked example at 100 ms RTT: one-way ≈ 3 ticks, client lead ≈ 5 ticks.

```
server tick:  995     998          1000             1003        1200(Tc)      1203     1221(S)   1224   1227
shooter:     stamps fire@1000 (its tick 1000 == server 995); predicts SPAWN id=h(MSL,owner,1000)
server:              input arrives (2 early) -> INPUT_RELAY
                                   validate@1000 -> ITEM_USED + PROJ_SPAWN(tick 1000)
shooter:                                           confirm (at its tick 1008)
server:                                                        ETA<=21 -> PROJ_COMMIT(tick 1200, lead 21)
victim:                                                                      receives at its tick 1208 (13 ticks before S)
both sides evaluate at S=1221: shield? grace? immune? -> EFFECT_RESULT(1221)
spectators (render X-6): commit arrives before tick 1200 is drawn; RESULT(1221) arrives at 1224, before 1221 is drawn at 1227
```

| Item | Decided (authority) | Lead gives S | Predicted by | Messages (tick fields) | Victim side | Correction @50/100/200 |
|---|---|---|---|---|---|---|
| **Homing missile** | Use tick T. Target lock is validated (§6); speed max(1.6 Vmax, target+20). The cruise phase follows the target's breadcrumbs and passes through walls. When ETA ≤ lead, **terminal guidance with fixed time-to-go**: pos(t) = mix(ballistic(t), victimPos(t), smoothstep((t−Tc)/lead)), so impact is exactly S. | Tc + lead | Shooter: spawn and cruise, as a Colyseus-style `defineEvent` that auto-rejects if ack ≥ T + 2 arrives with no ITEM_USED. Victim: the terminal path from its **own** positions, then the result at S. | ITEM_USED(T), PROJ_SPAWN(T, pose), PROJ_COMMIT(Tc, lead), EFFECT_RESULT(S). Projectile state is in every snapshot. | Airborne 66 ticks, then ×0.25 and 60 ticks recovery. Beeps from ETA 120 ticks (cosmetic, from missile state). | 0 / 0 / 0; late fallback per the table in §3 |
| **Leader missile** | Target = server rank 1 at T. If the shooter predicted a different leader, its missile smoothly retargets on SPAWN. | same | same | same | same | same |
| **Lobbed bomb** | Landing point = centreline s(T) + 32 m. Flight 36 ticks (PROPOSED). At L = T + 36: hit if distXZ ≤ **6.25 m logic radius** (6.5 m visual; a 0.25 m victim margin) and \|dy\| ≤ 3 m. | Flight time | **Each victim**, from its own state at L. Every kart can check this; nobody needs a lag-compensated view. | ITEM_USED(T), HAZARD_SPAWN(T, landTick), EFFECT_RESULT(L) per victim. | Trap 132 ticks, mash-out (below), then 30 ticks escape boost. | 0 while flight covers RTT (≤ 500 ms). Divergence only if the victim's own position was mispredicted (e.g. by a bump). |
| **Homing bug** | Target = the next kart ahead in race order at T. Path follows the track and breadcrumbs. Terminal commit as for the missile. | Tc + lead | Victim | PROJ_SPAWN, PROJ_COMMIT, RESULT | Trap 84 ticks with mash-out | same as missile |
| **Bolt** | At T the server takes the set of karts ahead by race progress. One EFFECT_SCHEDULE per victim. | T + 21 (= telegraph) | Victims | EFFECT_SCHEDULE(T, lead 21), RESULT(S) | Stun 54 ticks. Blockable: a shield raised during the telegraph counts. | 0 / 0 / 0 (21 ticks covers ≤ 250 ms) |
| **Leader drone** | Flies to the leader. Commit when ETA ≤ lead. Stacks are kept as an array of (start, end) (≤ 3). Only a pulse clears it. | Tc + lead | Leader | PROJ_SPAWN, PROJ_COMMIT, RESULT | ×0.60 speed for 210 ticks per stack | 0; late 0.23 m per tick |
| **Barrier blocks** | Placed at s_leader(T) + 45 m. **Arm = T + 24** (0.4 s drop-in). | T + 24; contact happens ≥ 61 ticks later | Leader: the bounce is static geometry | HAZARD_SPAWN(T, armLead 24), HAZARD_REMOVE | Bounce comes from the collision rules in `step()` | 0 (margin > 1 s) |
| **Dropped puddle** | Behind the dropper. **Arm = T + 18** (PROPOSED; 0.3 s). Lives 1800 ticks. | Arm tick | Each follower, from its own state | HAZARD_SPAWN(T, arm 18, life), HAZARD_REMOVE | Spin 60 ticks | 0 up to 200 ms (needs 14 ticks) |
| **Tether pull** (user pulled toward target; a buff) | Hook attaches at S = T + flight. The pull steers the user toward the target's **breadcrumb 24 ticks (0.4 s) behind its latest position**. Those samples are already server-confirmed on the user's client when RTT ≤ ~330 ms. Unblockable. | Hook flight | User | ITEM_USED, EFFECT_SCHEDULE(S), RESULT | User kinematics for 132 ticks; the target is unaffected | 0 up to 330 ms; beyond that the anchor is extrapolated (< 0.3 m) |
| **Shield** (self) | Stamped tick T_s. Window [T_s, T_s + 180). Absorbs 1 hit, then **18-tick post-absorb grace**. Late start is back-dated (§5). | none | User | ITEM_USED(T_s), RESULT(S) | Absorb is checked at S | 0 |
| **Team halo** | Teammates' start = T + clamp(⌈RTT_team⌉ + 4, 6, 21). The user's own halo starts at T. | as stated | User and teammates | EFFECT_SCHEDULE per mate | Same rules as the shield | 0 |
| **Slot lock** | Soft effect scheduled with lead 21. While it is active, `useItem` edges are refused inside `step()`. | T + 21 | Victims | EFFECT_SCHEDULE, RESULT | Deterministic rejection | 0 |

**Where projectiles are drawn.**
- A projectile aimed at *me* is drawn on my predicted timeline.
- My own projectile starts on my timeline and blends over 15 ticks to the timeline of the kart it targets.
- With all karts predicted (§7), these timelines coincide, apart from the spectator view.

**Mash-out, counted authoritatively.**
- `InputFrame.edges` carries `tapLeft` and `tapRight`. These are latched between ticks: a short tap is buffered, then consumed, following the Colyseus recipe for taps between steps.
- Inside `step()` a tap is credited only if:
  - it is in the direction opposite to the last credited tap;
  - at least 3 ticks have passed since the last credit (a 20 Hz cap);
  - fewer than 12 taps have been credited in this trap.
- Each credit removes 7 ticks (0.117 s ≈ the proposed −0.12 s). The trap cannot drop below 48 ticks.
- Server and victim run the same code on the same inputs, so the victim predicts its escape tick exactly.
- A late frame is credited at the tick it arrives, never lost. This shifts the escape by the lateness j.
- Resulting escape time: 6 Hz tapping → 1.27 s, 10 Hz → 1.02 s, 14 Hz or faster → 0.80 s (the floor).
- MASH_RESULT(endTick, credited) is sent for spectators.

---

## 5. Shield versus hit when latency is involved (Task 3)

Say the hit resolves at tick S on victim v, and a shield edge is stamped T_s ≤ S − 1.

1. **The shield input arrived before the server simulated S.** The hit is BLOCKED. The victim predicted BLOCK. No correction.
2. **v's inputs through S − 1 have not all arrived.** The server marks the hit **provisional**:
   - it applies the CC;
   - it saves v's FullKart at S − 1;
   - it holds the RESULT for at most R_v ticks.
   - **R_v = clamp(p95 input lateness of v over the last 10 s + 1, 0, 6).** R_v is 0 for clients flagged for lag-switch patterns: late bursts followed by batched inputs.
3. **The late shield edge arrives at A ≤ S + R_v**, stamped before S, and the shield was usable then. The server **revokes** the hit:
   - it restores v from S − 1;
   - it re-simulates v alone over S..A−1, treating other karts as fixed obstacles from server history. An airborne kart barely touches others, and at most 6 ticks are re-simulated;
   - it records an absorb at S plus the grace;
   - it sends RESULT(REVOKED_LATE_SHIELD).
   - This is the only exception to STK's "server never rewinds". It is justified because it is bounded, affects one kart and happens rarely.
4. **The edge arrives after S + R_v.** The HIT stands. The shield edge gets `ITEM_USE_REJECTED(LATE_DURING_CC, refund = 1)`, so the shield stays in its slot.
5. **Where the 3.0 s window starts.** The shield window always starts at the stamped T_s, even when the input arrived late. This matches the client's countdown and costs nothing kinematically.

**What the victim sees in case 4** (pressed in time on its screen, late on the server):
- A shield pop is followed within ~RTT by a reconcile into the airborne arc. The arc blends in over ≤ 150 ms.
- The bubble turns into a "shattered: late signal" effect, with a network icon and its own sound, and the shield icon returns to the slot.
- The kill feed reads "Blocked? — late signal (+N ms)".
- The point is that players blame the connection, not the rules.

**Shooter and spectators.**
- The "HIT!" banner fires only on RESULT. The impact flash can be predicted.
- For a **remote** victim whose relayed inputs through S − 1 have not arrived, the observer shows the flash but keeps the kart on the "no CC" branch for up to 12 ticks. When RESULT arrives, the observer applies it, time-compressing the start of the airborne arc into 0.2 s.

**Other cases.**
- Two hits within 18 ticks of an absorb: IMMUNE_GRACE.
- Within 36 ticks after a CC ends: IMMUNE.
- Tether: unblockable.
- An edge pressed at or after S: the local sim already refuses item use during CC, so both sides agree.

---

## 6. Item boxes, roulette and anti-cheat (Task 4)

**Contention (PROPOSED): personal boxes.**
- Each box has availability *per racer*. When a racer touches it, it breaks for that racer only and respawns for that racer after a deterministic 150–180 ticks (from boxId).
- A racer with both slots full still breaks the box and gains nothing.
- Pickup then depends only on the racer's own kart, so client prediction is exact and nobody can deny boxes to others.
- Alternative if boxes must be shared: the server grants every kart that touches the box within **6 ticks** of the first taker. That favours both, and a losing client's predicted roulette fizzles.

**Roulette.**
- The client predicts the pickup at tick P and starts the 30-tick roulette straight away.
- The server rolls `item = weighted(rankTable[rank@P], HMAC(secretSeed, raceId, kart, boxId, P))`. It sends ITEM_GRANTED(P, slot, item), which becomes usable at P + 30.
- With RTT + slack < 30 ticks (RTT ≲ 450 ms), the result is known before the roulette lands.
- If it is late, the roulette keeps spinning (up to +30 ticks) until it arrives.
- The seed is secret, unlike STK's seed which clients can reproduce. So a modified client cannot preview box contents.

**Anti-cheat.**
- Clients send only inputs, and the server simulates everything. Pickups and hits are never claimed by a client.
- Input checks:
  - clamp steer to −127..127 and pedals to 0..15;
  - reject set reserved bits;
  - tick must fall within [N − 30, N + 45];
  - token bucket of 70 messages/s and ≤ 4 frames per message;
  - `useItem` at most once per 6 ticks, and only valid inside `step()` (item held, not in CC, not slot-locked);
  - mash cap (§4).
- **Aim validation** (missile, tether):
  - The client sends `aimTarget`.
  - The server accepts if a cone test (±20° + 5°, range 10–190 m) passes, with ≥ 80% dwell coverage over 30 ticks, on **either** of two timelines:
    - (a) the target at tick T. With predicted remotes this is the "reckon" timeline, and rewinding it would double-compensate;
    - (b) the target at T − rw, where rw = clamp(interp + RTT_s + SLACK·dt, 0, 350 ms). This is the spectator/interpolated timeline.
  - This replaces the proposed min(RTT/2, 120 ms), which under-compensates interpolated views.
  - If the target fails, the server picks the best valid target, or rejects and refunds.
  - Source-style anti-spoof: the stamp is ignored if it differs from the latency estimate by more than 200 ms.

---

## 7. Kart-to-kart bumps (Task 5)

With remotes drawn at serverNow − 100 ms, a rival is shown **(100 ms + RTT/2 + slack) × 34 m/s behind where it really is: 5.4 m at 50 ms, 6.2 m at 100 ms and 7.9 m at 200 ms**. Bumping, drafting and passing against that ghost cannot match the server.

| Option | Artifacts | Verdict |
|---|---|---|
| (a) Collide against interpolated remotes | Phantom and missed bumps. Large, growing corrections because bump impulses change velocity. Slipstream mismatch. | No |
| (b) **Predict remotes to the local tick with relayed inputs** (STK) | Remote inputs are unknown only for the last ≈ RTT_local ticks, because the remote itself runs ahead. Lateral error ≈ ½·15·τ²: **0.05 / 0.13 / 0.41 m** at 50 / 100 / 200 ms. Remotes show small warps, smoothed with STK parameters. Occasional bump disagreement when overlap is smaller than the error. | **Recommended** |
| (c) Each owner is authoritative for its own contacts (classic KartRider P2P) | A says "bump" while B says "no bump". A hacked client can ignore rams. Does not fit an authoritative server. | No |

**How to implement (b).**
- The server relays every input immediately, with `effTick`, via INPUT_RELAY.
- The client restores **all** karts from FullKart and replays every kart. This matches Unity's `AlwaysRollbackAllPredictedGhosts`.
- Remote karts are drawn from the predicted state through a critically damped spring (120 ms). Errors of 4 m or more snap.
- Bumps are soft (PROPOSED): impulse capped, low restitution, lateral-dominant. This limits divergence.
- If a low-end device runs short of CPU: predict karts within 60 m or a 2 s gap and interpolate the rest, with Unity-style switch smoothing over 18 ticks.

---

## 8. AI bots online (Task 6)

- **Where they run.** Bots live on the server inside `RaceRoom`, with a seeded RNG per bot. The same class runs offline in the Worker with `authority = true`, so bots behave identically online and offline.
- **Input lookahead (PROPOSED).** A bot decides at tick t the input for **t + 8**, which reads as a ~133 ms reaction time. The server relays these inputs immediately. Clients with RTT ≤ 100 ms predict bots exactly; above that they hold the last input for the remaining ticks.
- **Items.** Bots set the same `useItem` and `aimTarget` bits and go through identical validation, scheduling and effects.
- **Shield reactions.** A bot "perceives" a threat only after the warning beeps start (ETA ≤ 120 ticks) plus a reaction delay: easy 36, normal 24, hard 15 ticks. Bots never read server secrets (other players' rolls, provisional state).
- **Cost.** 7 bots at 20 Hz decisions ≈ 1.4 ms of CPU per second per room.
- **Takeover.** A bot takes over a disconnected player's kart after 3 s.

---

## 9. Protocol additions (Task 7)

All values are little-endian. Each WS binary frame is `u8 type | payload`.

**Input frame (6 B):**

| Field | Size | Meaning |
|---|---|---|
| steer | i8 | Steering |
| pedals | u8 | throttle 4 bits \| brake 4 bits |
| held | u8 | drift, nitro, lookBack |
| edges | u8 | useItem, swap, tapL, tapR, respawn, emote |
| aimTarget | u8 | Target kart, 0xFF = none |
| rsv | u8 | Reserved |

**Client → server:**

| ID | Name | Layout | Size |
|---|---|---|---|
| 0x01 | C2S_INPUT | u32 firstTick, u16 ackEventSeq, u8 n(1..4), n × InputFrame | 14 B for n = 1 |
| 0x02 | C2S_PING | u16 pingId, u32 clientMs | 7 B |
| 0x03 | C2S_RESUME | u64 token, u32 lastSnapTick, u16 lastEventSeq | 15 B |

**Server → client:**

| ID | Name | Layout |
|---|---|---|
| 0x81 | S2C_SNAPSHOT (latest wins) | u32 tick, u32 ackInputTick, i8 inputSlack, u8 netFlags(late, rescueEligible), u16 eventSeqHead, u8 nKarts, nKarts × FullKart (~36 B, including item slots, CC type/end, immunity, shield), u8 nEff × {u16 id, u8 victim, u8 type, u32 start, u16 dur, u8 param} (11 B), u8 nProj × {u16 id, u8 type, u8 owner, u8 target, u8 phase, i24 x, i24 z, i16 y, u16 impactTick16} (16 B), u16 hazardHash. About 370 B at 30 Hz. |
| 0x82 | S2C_EVENTS (ordered, once) | u16 firstSeq, u8 n, n × {u8 evType, u32 tick, u8 len, payload}. See event list below. |
| 0x83 | S2C_INPUT_RELAY (latest wins) | u32 baseTick, u8 n × {u8 kart, u8 dTick, InputFrame} (8 B each) |
| 0x84 | S2C_PONG | u16 pingId, u32 clientMsEcho, u32 serverTick, u16 tickPhase |

Event types carried by S2C_EVENTS (`tick` is in the event header):

| evType | Name | Payload |
|---|---|---|
| 01 | ITEM_GRANTED | kart, slot, item, u16 boxId |
| 02 | ITEM_USED | kart, slot, item, u16 objId, target |
| 03 | ITEM_USE_REJECTED | kart, slot, reason, refund |
| 04 | PROJ_SPAWN | u16 id, type, owner, target, i24 x, i24 z, i16 y, u16 yaw |
| 05 | PROJ_COMMIT | u16 id, victim, u16 effId, u8 lead |
| 06 | EFFECT_SCHEDULE | u16 effId, victim, type, source, u8 lead, u16 dur, flags |
| 07 | EFFECT_RESULT | u16 effId, victim, result (HIT, SHIELDED, IMMUNE, IMMUNE_GRACE, REVOKED_LATE_SHIELD, HIT_LATE_INPUT, MISS), detail |
| 08 | HAZARD_SPAWN | u16 id, type, owner, u8 armLead, u16 life, pose, u8 radius(0.1 m) |
| 09 | HAZARD_REMOVE | — |
| 0A | BOX_STATE | — |
| 0B | MASH_RESULT | — |
| 0C | TIME_ADJUST | i8 |
| 0D | PLAYER_RTT | kart, u16 ms |
| 0E | RESYNC_FULL | — |

**Reliability and acks over TCP.**
- **Flush order.** Each tick is flushed EVENTS(t) → SNAPSHOT(t) → RELAY. An ack for input tick ≥ T with no ITEM_USED or REJECTED means the use did not happen. This is the Colyseus argument for settling on the ack; add 2 ticks of grace.
- **Acks.** The client acks `ackEventSeq` in every input message.
- **Server log.** The server keeps a 10 s log for each room and trims each client's pointer at its ack. This is STK's confirmation pruning.
- **Resume.** RESUME replays events after the ack, or falls back to RESYNC_FULL.
- **Backpressure.** If `ws.bufferedAmount` > 32 KB, the server skips SNAPSHOT and RELAY but never EVENTS.
- **Redundancy.** Snapshots carry every event's consequences, so any client heals within one snapshot.
- **WebTransport later.** Inputs move to unreliable datagrams with the last 4 frames repeated (Unity's 2 + 2), snapshots go unreliable, and EVENTS stay on a reliable stream.

**Bandwidth.** About 11 KB/s of snapshots, 3.4 KB/s of relay and ~1 KB/s of events per client downstream. Upstream is ~3.5 KB/s.

---

## 10. Vitest harness (Task 8)

- **`SimLink`.** A virtual-time event queue with a seeded mulberry32 PRNG. Settings:
  - one-way base latency;
  - shifted-lognormal jitter;
  - spikes;
  - TCP loss modelled as a head-of-line stall of RTO = max(200 ms, srtt + 4·rttvar);
  - bandwidth cap;
  - clock skew (ppm);
  - client frame rate (60 or 144 Hz with frame jitter);
  - GC-pause injection.
- The server loop and N client loops run in one process, including the worker `RaceRoom` for offline parity.
- **Scenario matrix:** RTT {0, 50, 100, 200, 300} × jitter {0, 10, 30, 60} × loss {0, 0.5, 2}% × 20 seeds.
- **Scenarios:**
  - S1: missile versus shield offset sweep, Δ from −40 to +5 ticks.
  - S2: bomb rim sweep, 5.5–7.5 m.
  - S3: puddle follower gap, 2–20 m.
  - S4: bolt against 7 victims.
  - S5: box contention, personal and shared variants.
  - S6: mash patterns at 6–20 Hz.
  - S7: side-by-side bumps with random steering.
  - S8: 7 bots plus 1 human.
  - S9: 2 s disconnect, then resume.
  - S10: lag-switch cheater.

**Pass/fail thresholds (PROPOSED):**

| Metric | Pass |
|---|---|
| M1 **hit-after-my-shield-was-up** rate: predicted BLOCK, final HIT, over shield-before-S encounters | 0 when jitter ≤ slack and no loss; ≤ 0.2% at 100 ± 10 ms with 0.5% loss; ≤ 1% at 200 ± 30 ms with 2% loss |
| M2 ghost-hit rate: predicted HIT, final BLOCK or MISS | ≤ 0.2% / 1% |
| M3 schedule arrived after S at the victim | 0 up to 200 ms with no loss; ≤ 1% at 200 ms with 2% loss |
| M4 local correction (m), no items | p99 ≤ 0.05 at 100 ms |
| M4 local correction (m), caused by items | p99 ≤ 0.5 at 100 ms; ≤ 1.5 at 200 ms; snaps ≤ 1 per 10 min |
| M5 remote-kart error | p95 ≤ 0.3 m at 100 ms |
| M6 bump yes/no agreement | ≥ 97% at 100 ms; ≥ 92% at 200 ms |
| M7 mash escape tick | Identical across RTT; shift ≤ j when lateness is injected |
| M8 roulette result known before it lands | ≥ 99.9% up to 300 ms |
| M9 determinism | Server and client hashes equal (FNV) at 0 latency over a 5-min race; Node and Worker hashes equal |
| M10 bandwidth | ≤ 20 KB/s down, ≤ 5 KB/s up |
| M11 client rollback cost | p99 ≤ 1 ms per frame at 200 ms |
| M12 fairness symmetry | Shooter success independent of which side has the higher RTT, within ±5 percentage points |

The full matrix runs behind `NET_MATRIX=full`. CI runs a 3-seed smoke subset.

## Key parameters

- **SIM_TICK_HZ**: 60 (dt 16.667 ms); optional 2 fixed collision sub-steps inside step() [proposed] — Resolves 120/60/30 conflict; measured 983 ns/kart-tick (sibling sim EXP=cpu); Unity default 60
- **SNAPSHOT_HZ**: 30 (every even tick) [proposed] — Unity 'half or one third'; STK 10 Hz with relay; Colyseus default 20 Hz
- **INPUT_SEND_HZ**: 60, 1 frame/msg (<=4 after stall) [proposed]
- **CLIENT_SLACK_TICKS**: 2 [sourced] — Unity ClientTickRate.TargetCommandSlack default 2
- **CLIENT_LEAD**: ceil(RTT/2/dt)+2+ceil(2*sigma_jitter/dt) ticks; rate-adjust 59/61 ticks/s; hard resync at >15 ticks error [proposed] — Unity NetworkTimeSystem; STK m_server_delay=max_ping/2+jitter_tolerance(100ms)
- **LATE_INPUT_RULE**: server never rewinds; late frame analog applied from arrival, edges at arrival tick (effTick=N); drop if T>N+45 [sourced] — STK rewind_queue.cpp mergeNetworkData
- **MISSING_INPUT_RULE**: hold last analog; after 6 ticks steer*0.85/tick; no edges; clients use same rule [proposed] — STK networking steering-reduction; Colyseus idle hold policy
- **SCE_LEAD_TICKS**: clamp(ceil(RTT_max/dt)+2+3, 21, 36); 21 covers RTT<=~250 ms [proposed]
- **SHIELD_WINDOW_TICKS**: 180 (3.0 s) from stamped tick [proposed] — items doc 3.0 s
- **SHIELD_POST_ABSORB_GRACE_TICKS**: 18 (0.3 s) [proposed] — items doc 0.3 s grace, reinterpreted
- **SHIELD_LATE_RESCUE_TICKS**: R_v=clamp(p95 lateness+1,0,6); 0 for lag-switch flagged [proposed]
- **HARD_CC_IMMUNITY_TICKS**: 36 (0.6 s) after CC end; CC refreshes not stacks [proposed] — items doc; Quantum Karts KartHitReceiver pattern
- **MISSILE**: airborne 66 ticks, then x0.25 with 60-tick recovery; warning from ETA 120 ticks; terminal fixed time-to-go = lead [proposed]
- **BOMB**: flight 36 ticks; visual radius 6.5 m, logic radius 6.25 m, |dy|<=3 m; trap 132 ticks [proposed]
- **MASH**: -7 ticks per credited alternating tap, floor 48, min 3 ticks between credits, cap 12 credits; escape boost 30 ticks [proposed] — items doc -0.12 s/press, floor 0.8 s
- **BUG_TRAP_TICKS**: 84 [proposed]
- **BOLT**: telegraph 21 ticks = lead; stun 54 ticks [proposed]
- **DRONE**: x0.60 for 210 ticks per stack, <=3 stacks as (start,end) array [proposed]
- **BARRIER_ARM_TICKS**: 24; spawned 45 m ahead of the leader [proposed]
- **PUDDLE**: arm 18 ticks, lifetime 1800, spin 60 [proposed]
- **TETHER**: 132 ticks; anchor = target breadcrumb 24 ticks behind; unblockable [proposed]
- **BREADCRUMB**: 30 Hz on even ticks (snapshot positions), 150 samples = 5 s [proposed] — replaces 20 Hz
- **ROULETTE_TICKS**: 30; server HMAC(secret, race, kart, box, tick) roll; spin extends <=+30 until ITEM_GRANTED [proposed]
- **BOX_MODEL**: per-racer availability, respawn 150-180 ticks; alternative shared with 6-tick co-grant [proposed]
- **AIM_VALIDATION**: accept at T (reckon) OR at T-clamp(interp+RTT+slack,0,350ms); cone +5 deg, range +10 m, >=80% dwell over 30 ticks; ignore stamp if >200 ms off [proposed] — Colyseus reckon mode; Source player_lagcompensation.cpp
- **REMOTE_KART_MODE**: predict all karts with relayed inputs; full-world replay; spring smoothing 120 ms; snap >=4 m [proposed] — STK sendPacketExcept + full rewind; Unity AlwaysRollbackAllPredictedGhosts
- **INTERP_OFFSET_IF_NOT_PREDICTED**: 5.4/6.2/7.9 m at 50/100/200 ms RTT (34 m/s) [proposed] — computed
- **REMOTE_PRED_LATERAL_ERR**: 0.05/0.13/0.41 m at 50/100/200 ms [proposed] — computed 0.5*15*tau^2
- **BOT_INPUT_LOOKAHEAD_TICKS**: 8; decisions 20 Hz; perceive threats at ETA<=120 + 36/24/15 ticks reaction [proposed]
- **STK_REFERENCE**: physics 120 fps; state-frequency 10; max-ping 300; jitter-tolerance 100 ms; smoothing 0.05/4.0 m, 2.0 s, threshold 4.0; explosion 1.5 s, r 6 m, invuln 7 s [sourced] — stk_config.xml, server_config.hpp, kart_characteristics.xml
- **COLYSEUS_REFERENCE**: graceTicks 10; TTL max(2*rtt,600ms); patchRate 50 ms; maxRewindMs 500 [sourced] — predictedEventChannel.ts, Room.ts, lag-compensation.mdx
- **SNAPSHOT_SIZE**: ~370 B (8x36 FullKart + effects + projectiles); ~11 KB/s [proposed]
- **BACKPRESSURE**: skip SNAPSHOT/RELAY if ws.bufferedAmount>32 KB; never skip EVENTS; 10 s event log for RESUME [proposed]
- **TEST_M1_HIT_AFTER_SHIELD**: 0 (lossless, jitter<=slack); <=0.2% @100+/-10ms 0.5% loss; <=1% @200+/-30ms 2% loss [proposed]
- **MEASURED_CPU**: step 983 ns/kart-tick; AI 9.9 us/decision; 60 Hz ~107 rooms/vCPU [sourced] — sibling plan sim.ts EXP=cpu run in this session (Node 22)

## Open questions

- How much horizontal speed a kart keeps while airborne after a missile hit (assumed 50%) sets the per-tick correction slope. The driving/physics spec should fix it.
- Drone stacking: is it multiplicative (0.6^n), capped at a floor, or duration-stacking? The netcode just stores an array of up to 3 (start, end) pairs; the gameplay team must decide the formula.
- Tether direction: this spec assumes the user is pulled toward the target (a buff, unblockable). If the target should be yanked back instead, use a scheduled hard effect on the target anchored to the user's breadcrumb 24 ticks behind.
- Personal vs shared item boxes: personal removes all contention and prediction error. Shared needs the 6-tick co-grant rule.
- A puddle that arms after 18 ticks cannot hit an immediate tailgater within about 0.3 s. Confirm this is acceptable, or accept rollbacks by arming after 9 ticks.
- KartRider: Drift's real netcode, item timings and server model could not be checked: namu.wiki and kartdrift.nexon.com were blocked and the web-search budget was used up. Classic KartRider evidence (P2P with relay, owner-authoritative) comes from a community emulator.
- The CPU figures come from Node 22 on the dev container. Replay cost on low-end mobile browsers should be measured before committing to predicting every kart.
- Whether the shield-rescue micro re-sim (≤6 ticks, victim only) is worth its complexity, compared with simply refunding the shield plus a 'late signal' indicator, should be decided from harness metric M1 at 200 ms.

## Sources

- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/network/rewind_manager.hpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/network/rewind_manager.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/network/rewind_queue.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/network/protocols/game_protocol.hpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/network/protocols/game_protocol.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/items/network_item_manager.hpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/items/network_item_manager.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/items/projectile_manager.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/items/flyable.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/karts/explosion_animation.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/karts/abstract_kart_animation.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/karts/kart_rewinder.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/network/smooth_network_body.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/network/network_timer_synchronizer.hpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/network/protocols/server_lobby.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/network/server_config.hpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/main_loop.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/items/powerup.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/items/powerup_manager.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/items/rubber_band.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/items/plunger.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/data/stk_config.xml
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/data/kart_characteristics.xml
- https://raw.githubusercontent.com/colyseus/colyseus/master/packages/sdk/src/predict/predictedEventChannel.ts
- https://github.com/colyseus/colyseus/blob/master/packages/core/src/Room.ts
- https://raw.githubusercontent.com/colyseus/docs/master/pages/netcode/client-prediction.mdx
- https://raw.githubusercontent.com/colyseus/docs/master/pages/netcode/lag-compensation.mdx
- https://raw.githubusercontent.com/colyseus/docs/master/pages/netcode/server-input.mdx
- https://raw.githubusercontent.com/colyseus/docs/master/pages/netcode/recipes.mdx
- https://raw.githubusercontent.com/needle-mirror/com.unity.netcode/master/Documentation~/prediction-switching.md
- https://raw.githubusercontent.com/needle-mirror/com.unity.netcode/master/Documentation~/time-synchronization.md
- https://raw.githubusercontent.com/needle-mirror/com.unity.netcode/master/Documentation~/prediction-details.md
- https://raw.githubusercontent.com/needle-mirror/com.unity.netcode/master/Runtime/ClientServerWorld/ClientServerTickRate.cs
- https://github.com/needle-mirror/com.unity.netcode/blob/master/Runtime/Command/CommandSendSystem.cs
- https://raw.githubusercontent.com/ValveSoftware/source-sdk-2013/master/src/game/server/player_lagcompensation.cpp
- https://raw.githubusercontent.com/STJr/Kart-Public/master/src/doomdef.h
- https://raw.githubusercontent.com/STJr/Kart-Public/master/src/d_clisrv.h
- https://raw.githubusercontent.com/STJr/Kart-Public/master/src/k_kart.c
- https://raw.githubusercontent.com/nickthelegend/Embedded-unity/main/quantum-karts-3.0.4/Assets/QuantumUser/Simulation/Karts/Kart/Damage/KartHitReceiver.cs
- https://raw.githubusercontent.com/iotron/photon-quantum-llm-notes/main/quantum%20karts/07-weapon-system.md
- https://raw.githubusercontent.com/hummusonrails/tideline-app/main/src/lib/race/net.ts
- https://raw.githubusercontent.com/yanygm/Launcher_V2/master/KartriderLibrary/PacketName/PacketNameValues.cs
- https://raw.githubusercontent.com/yanygm/Launcher_V2/master/KartRider.Data/Server/UdpServer.cs
- https://raw.githubusercontent.com/yanygm/Launcher_V2/master/KartRider.Data/Server/ClientSession.cs
- https://github.com/websockets/ws/blob/master/lib/websocket.js
- /root/.claude/plans/nexon-kartrider-drift-atomic-quilt-agent-a181d8fa946423c79.md (sibling sim.ts, run read-only with EXP=cpu)
