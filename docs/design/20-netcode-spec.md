# 20 — Netcode spec

Owner: L9 NET (`packages/{net,room}/**`, `apps/server/**`, `apps/client/src/net/**`).
Sources: ADR-007 (binding), ADR-008 (lobby), gap-4 (§2–§10, adapted), `06-physics-ai-netcode.md` §5, B3/B9 in `02-contracts.md`.
Status keys: **[S]** sourced · **[P]** proposed. Ticks at 60 Hz (1 tick = 16.667 ms). All binary values little-endian.

---

## 1. Model (ADR-007)
| Aspect | Decision |
|---|---|
| Authority | `RaceRoom` (identical in the Node server and the offline Worker) simulates everything from inputs. Clients send inputs only. |
| Clock | One 60 Hz clock for the sim, inputs, item timers and event ticks. |
| Client prediction | **Full-world prediction**: the client restores **all** karts from each snapshot and replays them to its predicted tick with relayed inputs. |
| Snapshots | 30 Hz on even ticks, **lossless** w.r.t. the `quantizeWorld()` grid; delta-encoded against the previous snapshot sent on the same connection (§3.3). |
| Inputs | 1 `InputFrame` per tick per message (codec allows up to 4 after a stall). |
| Remote karts | drawn from the predicted state through a critically damped spring (120 ms); errors ≥ 4 m snap. |
| Items | Scheduled Conditional Effects with a fixed lead of **21 ticks**; deterministic object ids `hash(type, owner, useTick, slot)`; personal boxes; 30-tick roulette rolled with the authority's secret HalfSipHash-2-4 key. |
| Bots | on the authority; decide at t the input for t + 8; relayed like human inputs. |
| Transport | one WebSocket, binary DataView frames `u8 type | payload`; lobby messages as JSON inside a binary frame. `perMessageDeflate` off; `setNoDelay()` on. |
| Reliability | EVENTS ordered, acked, 10 s resume log; SNAPSHOT and INPUT_RELAY skipped under backpressure (> 32 KB buffered), EVENTS never. |
| Reconnect | 60 s window; AI takes over after 180 ticks. |
| Deferred to v2 | shield late-input rescue re-simulation (v1 refunds + "late signal"), adaptive SCE lead, dual-timeline aim validation, WebTransport datagrams. |

---

## 2. Timeline model (gap-4 §2.1)
- **Client lead** ℓ = ⌈(RTT/2)/dt⌉ + 2 + ⌈2σ_jitter/dt⌉ ticks. The client simulates predicted tick `P ≈ serverTick + ℓ`.
- **Slack control**: every snapshot carries `inputSlack` = EMA (α = 0.1) of `inputTick − serverTick` at arrival for this client. The client runs **61 ticks/s** when slack < 1.5, **59 ticks/s** when slack > 2.5, otherwise 60; it hard-resyncs (jumps P, drops prediction history, requests a keyframe) when |P − (serverTickEstimate + ℓ)| > 15 ticks.
- **What each observer sees at server tick X**: own kart X + ℓ; remote karts (predicted) X + ℓ; spectator/replay view X − 6. A server message sent at tick H reaches a client's predicted timeline at H + ⌈RTT/dt⌉ + slack.
- **Clock sync**: PING every 2 s (every 250 ms while loading); keep 8 samples; discard samples more than 1σ from the median RTT; estimate `serverTick(clientMs) = pong.serverTick + pong.tickPhase/65536 + (clientMs − t1 + rtt/2)/DT_ms`, averaged over the kept samples (timesync method [S]).

---

## 3. Binary protocol (gap-4 §9 adapted to ADR-007)

### 3.1 `InputFrame` (6 bytes)
| Byte | Type | Field |
|---|---|---|
| 0 | i8 | `steer` −127…127 (+ = right) |
| 1 | u8 | `pedals`: throttle in bits 0–3 (0–15), brake in bits 4–7 (0–15) |
| 2 | u8 | `held`: bit0 DRIFT, bit1 ITEM (speed-mode auto-fire / hold), bit2 LOOK_BACK; bits 3–7 must be 0 |
| 3 | u8 | `edges` (latched since the last frame): bit0 USE_ITEM, bit1 SWAP, bit2 TAP_L, bit3 TAP_R, bit4 RESPAWN, bit5 EMOTE; bits 6–7 must be 0 |
| 4 | u8 | `aim`: target slot 0–7, 255 = none |
| 5 | u8 | `emote` 0–15 in bits 0–3; bits 4–7 reserved (0) |
Edges are latched on the client between ticks, so a tap shorter than a tick is never lost; the sim derives drift and throttle edges itself from `prevHeld`/`prevThrottle` (B1).

### 3.2 Client → server
| Id | Name | Layout | Size (incl. type) |
|---|---|---|---|
| 0x01 | `C2S_INPUT` | u32 firstTick, u16 ackEventSeq, u8 n (1–4), n × InputFrame | 14 B for n = 1 |
| 0x02 | `C2S_PING` | u16 pingId, u32 clientMs (wraps) | 7 B |
| 0x03 | `C2S_RESUME` | u32 token[4] (128-bit race resume token), u32 lastSnapTick, u16 lastEventSeq | 23 B [P: 128-bit instead of gap-4's u64] |
| 0x10 | `C2S_LOBBY_JSON` | UTF-8 JSON (`C2SLobby`, §5), ≤ 4 KB | variable |
- Inputs are sent every tick. After a stall the client may pack the last 4 unsent frames into one message (n ≤ 4).

### 3.3 Server → client
| Id | Name | Layout |
|---|---|---|
| 0x81 | `S2C_SNAPSHOT` | header (§3.4) + world block (§3.5) |
| 0x82 | `S2C_EVENTS` | u16 firstSeq, u8 n, n × {u8 evType, u32 tick, u8 len, payload[len]} (§3.6) |
| 0x83 | `S2C_INPUT_RELAY` | u32 baseTick, u8 n, n × {u8 slot, u8 dTick, InputFrame} (8 B per entry) |
| 0x84 | `S2C_PONG` | u16 pingId, u32 clientMsEcho, u32 serverTick, u16 tickPhase (0–65535 = fraction of the current tick elapsed) |
| 0x90 | `S2C_LOBBY_JSON` | UTF-8 JSON (`S2CLobby`, §5) |
- **Flush order per server tick**: EVENTS(t) → SNAPSHOT(t) (even ticks) → RELAY(t). An ack for input tick ≥ T with no `use`/`reject` for T means the use did not happen (Colyseus settling argument [S]); clients add 2 ticks of grace.
- **Relay**: once per server tick, one message with every input the server received since the last relay (other slots only, bots included: bot inputs for t + 8 are relayed at t). `dTick = tick − baseTick` (0–255).

### 3.4 Snapshot header
| Type | Field |
|---|---|
| u32 | `tick` (even) |
| u32 | `ackInputTick`: newest input tick of this client applied by the server |
| i8 | `inputSlack` (ticks, EMA, rounded) |
| u8 | `netFlags`: bit0 keyframe, bit1 your last input was late, bit2 resync (drop predictions) |
| u16 | `eventSeqHead`: seq of the newest event already sent |
| u32 | `baseTick`: tick of the snapshot this delta is based on (0 for a keyframe) |

### 3.5 World block (lossless) [P]
All world values are integers on their quantization grid (`10-sim-spec.md` §15): positions and velocities as `round(x·4096)`, directions `round(x·32768)`, yaw rate `round(x·4096)`, gauges `round(x·65536)`, slip `round(x·32768)`, fraction `round(x·65536)`; everything else is already an integer. Integers are written as **zigzag LEB128 varints** (`zz(v) = (v << 1) ^ (v >> 31)` on 53-bit-safe numbers, 7 bits per byte).

**Keyframe** (`netFlags.bit0 = 1`): every field below in the listed order, as varints.
**Delta**: for each kart, a u16 group mask; for every set bit, each field of that group as a zigzag varint of `(value − baseValue)`. Globals and arrays carry a u8 change mask first.

| Block | Fields (in order) | Group bit |
|---|---|---|
| Globals | phase, goTick, firstFinishTick, endTick, seq | mask bit0 |
| Per kart (8 slots; empty slots are a single 0 byte in keyframes) | identity: slot, team, spec | keyframe only |
| | pose: px, py, pz | 0 |
| | vel: vx, vy, vz | 1 |
| | dir: fx, fy, fz, nx, ny, nz | 2 |
| | ground: yawRate, grounded, coyote, airTicks, surf, wallContact, ghostTicks | 3 |
| | drift: drift, driftDir, driftTicks, driftPeak, reDriftLock, fatigueTicks | 4 |
| | boost: gauge, boosters, teamBoosters, boostTicks, boostKind, startTicks, wheelspinTicks, instWindow, instTicks, stunTicks | 5 |
| | draft/prev: draftCharge, draftTicks, prevHeld, prevThrottle | 6 |
| | items: slot0, slot1, rouletteSlot, rouletteEnd, rouletteBox, lastUseTick, aimLockTicks, aimTarget | 7 |
| | status: cc, ccStart, ccEnd, immuneUntil, shieldUntil, shieldGraceUntil, haloUntil, mashCredits, lastTapDir, lastTapTick, modMask | 8 |
| | loc: path, i, s, u, h, sMain, valid | 9 |
| | lastValid: path, i, s, u, h, sMain, valid | 10 |
| | race: lap, keyMask, raceDist, lapStartTick, bestLapTicks, finishTick, finishFrac, rank, wrongWayTicks, offGraphTicks, respawnPhase, respawnUntil, manualCooldownUntil, retired | 11 |
| Teams | u8 n × {gauge, granted} | mask bit1 |
| Effects | u8 n × {u32 id, u8 code, u8 victim, u8 source, start, end, param (zigzag), u8 flags, u8 result} | mask bit2 (full list when changed) |
| Projectiles | u8 n × {u32 id, u8 code, u8 owner, u8 target, u8 phase, path, s, u, h, px, py, pz, spawn, commit, impact} | mask bit3 (full list; ≤ 16 entries) |
| Hazards | u8 n × {u32 id, u8 code, u8 owner, u8 team, px, py, pz, radius, arm, expire, u8 flags} | mask bit4 (full list when changed) |
| Box respawn | u16 n × {u16 index, value} for entries ≠ 0 | mask bit5 (full list when changed) |
- Object ids are full 32-bit on the wire (a 16-bit id would collide with ≈ 30% probability over 200 objects per race).
- The delta base is the **previous snapshot sent on this connection**. Because the WebSocket is reliable and ordered, the server knows the client holds exactly that base; snapshots skipped under backpressure are never sent, so they are never a base.
- **Keyframe policy**: the first snapshot after attach/resume, every 30th snapshot (1 s), after `RESYNC_FULL`, and whenever the delta would be larger than a keyframe.
- **Decisions are not in snapshots**; they arrive as EVENTS and live in the client's decision log (B3), merged into `world.decisions` after each restore.
- Typical sizes: delta ≈ 40–50 B per moving kart → ≈ 400 B per snapshot for 8 karts; keyframe ≈ 1.1–1.4 KB.

### 3.6 Event types (EVENTS payloads; `tick` is in the event header)
| evType | Name | Decision (B3) | Payload |
|---|---|---|---|
| 0x01 | `ITEM_GRANTED` | `grant` | u8 slot, u8 item, u16 boxId |
| 0x02 | `ITEM_USED` | `use` | u8 slot, u8 item, u32 obj, u8 target |
| 0x03 | `ITEM_USE_REJECTED` | `reject` | u8 slot, u8 item, u8 reason, u8 refund |
| 0x04 | `PROJ_SPAWN` | — | reserved (projectiles are spawned deterministically from `use` and carried in snapshots) |
| 0x05 | `PROJ_COMMIT` | `commit` | u32 obj, u8 victim, u32 eff, u32 impact |
| 0x06 | `EFFECT_SCHEDULE` | `effect` | u32 eff, u8 code, u8 victim, u8 source, u32 start, u16 dur, u8 flags |
| 0x07 | `EFFECT_RESULT` | `result` | u32 eff, u8 victim, u8 result (0 hit, 1 shielded, 2 immune, 3 immune_grace, 4 miss, 5 hit_late_input, 6 reserved v2 revoked_late_shield) |
| 0x08 | `HAZARD_SPAWN` | `hazard` | u32 obj, u8 code, u8 owner, u32 arm, u16 life, i32 x, i32 y, i32 z (POS grid) |
| 0x09 | `HAZARD_REMOVE` | `hazardRemove` | u32 obj |
| 0x0A | `BOX_STATE` | — | reserved (personal boxes need no box events) |
| 0x0B | `MASH_RESULT` | — | u8 slot, u32 endTick, u8 credited (spectator/feed information) |
| 0x0C | `TIME_ADJUST` | — | i8 ticks (server hint to shift the client lead) |
| 0x0D | `PLAYER_RTT` | — | u8 slot, u16 ms (for the ping pills) |
| 0x0E | `RESYNC_FULL` | — | — (the next snapshot is a keyframe; drop predictions) |
Reject reasons: 1 no item, 2 in CC, 3 slot locked, 4 cooldown (< 6 ticks), 5 invalid target, 6 late during CC (refund = 1), 7 before GO, 8 in respawn/warp.

### 3.7 Keyed roll (ADR-003 §5, ADR-007)
- HalfSipHash-2-4, 64-bit key halves from the room's 128-bit secret (`Uint32Array(4)`, `crypto.getRandomValues` at room creation, never sent), 32-bit output.
- Message words: `[raceIdLo, raceIdHi, slot, boxId, pickupTick, reroll]`.
- Synchronous and identical in Node and the Worker (WebCrypto HMAC is async and cannot run inside `step()`).

---

## 4. Server rooms and FSMs

### 4.1 Room lifecycle (`apps/server/src/lobby/rooms.ts` + `room/RaceRoom.ts`)
| State | Enters on | Duration | Leaves to |
|---|---|---|---|
| `LOBBY` (custom) | create | until start | `ROULETTE` or `LOADING` |
| `SEARCH` (quick) | first queued player | 20 s or 8 humans | `STAGE` |
| `STAGE` (quick) | search end | 15 s | `LOADING` (AI fill, no vote) |
| `ROULETTE` | host start with Track Roulette | 20 s | `LOADING` |
| `LOADING` | track chosen | until all `loaded{trackHash}` or 15 s | `RACE` (late loaders start AI-driven) |
| `RACE` | `raceStart{config, startTick}` | sim phases PRE → DONE | `RESULTS` |
| `RESULTS` | `raceEnd{result}` | 12 s | `LOBBY` (custom) / close (quick) |
- `startTick` = server tick at send + 60 ticks of loading slack [P]; tick 0 of the race world happens at `startTick`.
- Room-full auto-start: 10 s countdown in `LOBBY` when 8 slots are occupied and everyone is ready (ADR-008).
- Host migration: the human with the earliest join time.

### 4.2 `RaceRoom` inner loop (one call to `tick()` per 16.667 ms)
1. Collect inputs for tick N per slot: buffered frame for N, else the missing-input rule (§6.2); bots' frames decided at N − 8.
2. `step(world, inputs, ctx{role: 'authority'})`.
3. Append decisions (`emit`) to the event log with increasing `seq`.
4. Flush EVENTS, SNAPSHOT (even N), RELAY to each peer, honouring backpressure (§9).
5. Bot `decide()` at N for N + 8 (20 Hz decisions, every tick steering).
The server loop uses a drift-compensated timer (`performance.now()`-based setTimeout/setImmediate) and catches up at most 5 ticks.

---

## 5. Lobby JSON (B9)
### 5.1 Messages
**C2S**: `hello{v, name, loadout, resume?}`, `quick{mode, teams}`, `quickCancel`, `create{settings}`, `join{code}`, `leave`, `ready{ready}`, `loadout{loadout}`, `settings{settings}` (host), `slot{slot, action: open|close|bot|kick, tier?}` (host), `team{slot, team}` (host), `start` (host), `vote{trackId}` (roulette), `chat{text}`, `loaded{trackHash}`.
**S2C**: `welcome{session, serverVersion, simVersion}`, `queue{phase: search|stage, endsAt, humans, trackId?}`, `room{room}`, `roulette{endsAt, votes}`, `raceStart{config, startTick, serverTick, yourSlot}`, `raceEnd{result}`, `chat{from, text}`, `error{code}`.

### 5.2 Shapes [P]
```ts
interface Loadout { characterId: CharacterId; kartBodyId: KartBodyId; livery: Livery; palette?: string; emotes?: Partial<Record<EmoteSlot, number>> }
interface Livery { base: string /* hex */; accent: string; pattern: string /* livery id */; number: number /* 0–99 */; plate: string /* ≤ 8 chars */; flame: string /* flame colour id */ }
interface RoomSettings { mode: ModeId; teams: TeamFormat; track: TrackId | 'random' | 'randomSpeed' | 'randomItem' | 'roulette';
  laps: 'auto' | 1 | 2 | 3 | 4 | 5; retireSec: 5 | 10 | 15 | 20; itemSet: 'standard' | 'light' | 'chaos';
  friendlyFire: 'off' | 'area' | 'all'; rubberBand: boolean; instantBoostInItem: boolean; hideCode: boolean }
interface RoomView { code: string | null /* null when hidden and you are not host */; hostId: string; settings: RoomSettings;
  slots: { slot: number; state: 'open' | 'closed' | 'human' | 'bot'; name?: string; peerId?: string; ready?: boolean; team: number;
           loadout?: Loadout; tier?: AiTier; ping?: number }[];
  phase: 'lobby' | 'roulette' | 'loading' | 'race' | 'results'; autoStartAt?: number }
```
`RaceResult` is defined in `13-modes-rules.md` §9. `RaceConfig` is B3 (it carries `seed`, never the secret).

### 5.3 Error codes
`version_mismatch`, `server_full`, `room_full`, `room_not_found`, `bad_code`, `not_host`, `not_ready`, `in_race`, `rate_limited`, `name_invalid`, `chat_filtered`, `kicked`, `track_hash_mismatch`, `resume_expired`, `slow_consumer`.

### 5.4 Codes
6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 symbols → 30 bits); generated with `crypto.getRandomValues`, retried on collision; case-insensitive input (O→0 and I→1 are never valid, so typos fail fast).

---

## 6. Inputs on the server (ADR-007)

### 6.1 Late inputs
- Frame for tick T arriving when the next server tick is N:
  - `T ≥ N`: buffered (ring of 128 per slot).
  - `T < N` (late): analog values take over from N; **edges are applied at N**; the frame's effective tick is N ("server never rewinds" [S STK]).
  - `T > N + 45`: dropped, and the client is flagged for resync.
- **Anti-spoof clamp** (ADR-007, 200 ms = 12 ticks): a stamped tick that differs from the latency estimate by more than 12 ticks is replaced by the estimate (matters for the shield window start and aim validation).

### 6.2 Missing inputs (same rule on server and clients)
Hold the last analog values (steer, throttle, brake, held); after 6 ticks without a new frame, steering decays by ×0.85 per tick; no edges are synthesized.

---

## 7. Client prediction and rollback (`net/client/*`)

### 7.1 State kept
- `authWorld`: the last decoded snapshot (keyframe or delta applied).
- `predWorld` at tick P, `prevWorld` at P − 1 (render interpolation `alpha`).
- Own input ring (128 frames), remote input table per slot (relayed frames by tick), decision log (events by seq).

### 7.2 Procedure on each snapshot at tick N
1. Decode into `authWorld` (delta vs the previous decoded snapshot).
2. `copyWorld(predWorld, authWorld)` — **all karts** are restored.
3. Set `predWorld.decisions` to the client decision log (all decisions with tick > N stay pending and apply when their tick is simulated).
4. Re-simulate ticks N + 1 … P with `role: 'predictor'`: own frames from the ring; remote frames from the relay table if known, else the missing-input rule (§6.2).
5. Compute each kart's render-pose error (old predicted pose − new) and add it to that kart's smoothing offset (§7.4).
6. One-shot events from the re-simulation go through the `EventDeduper` (keys kept 2 s), so sounds and VFX never repeat.
- A relayed input that contradicts what was predicted for an already-simulated tick triggers the same procedure from `authWorld` on the next frame.
- A decision that lands in the past (`applyDecision` returns a tick) triggers the same procedure.
- Cost bound: 8 karts × (P − N) ticks ≈ 8 × 14 at 200 ms RTT; target p99 ≤ 1.5 ms per frame (E). At `step` ≤ 6 µs per kart-tick that is ≤ 0.7 ms.

### 7.3 Local frame loop
Fixed-step accumulator at the adjusted rate (59/60/61 Hz, §2), at most 5 steps per frame, `alpha = acc/dt` for interpolation; inputs are sampled every tick from the input system and sent immediately.

### 7.4 Smoothing (`visualOffset`)
- Critically damped spring per kart on the position offset, time constant 120 ms for remote karts and 80 ms for the local kart [P]; heading offset eased the same way.
- Offsets ≥ 4 m snap to zero (respawn, warp, resync).
- Projectiles aimed at the local kart are drawn on the local predicted timeline; the local kart's own projectile starts on its timeline and blends to the target's over 15 ticks (identical when all karts are predicted).

---

## 8. Scheduled Conditional Effects (gap-4 §3, fixed lead)
| Rule | Content |
|---|---|
| R1 | A hard or soft effect is a record `{effectId, victim, type, start S, dur, param, source, blockable}`; applying it is pure, deterministic, idempotent by id. |
| R2 | Authority-only choices (rolls, target choice, commit tick, results) sit behind `ctx.role === 'authority'` and go out through `emit`; everything else is shared. |
| R3 | **Lead fixed at 21 ticks** in v1 (adaptive `clamp(⌈RTT_max/dt⌉ + 5, 21, 36)` is v2). 21 ticks cover victims with RTT ≤ ~250 ms plus jitter. Mirror Mode uses its 30-tick telegraph as the lead. |
| R4 | The victim's condition (shield, grace, immunity, unblockable) is checked at S on the victim's own timeline, from the victim's own inputs → zero correction when its inputs are on time. |
| R5 | Hard CC refreshes (never stacks, never shortens); immunity lasts until end + 36 ticks. |
| R6 | Client: `S > lastSimTick` → insert into the schedule, no rollback; otherwise insert and reconcile from the latest snapshot at or before S. Snapshots list pending and active effects; merge by id. |
| R7 | Projectile and hazard ids are deterministic (`hash32(type, owner, useTick, slot/index)`), so the shooter's predicted object and the server's match without a handshake. |
| R8 | Tick order is ADR-005 on both sides (`10-sim-spec.md` §5). |
Per-item timelines are in `12-items-spec.md` §7.

**v1 late shield**: a shield edge stamped before S that reaches the authority after S is applied at arrival, where the use is refused (hard CC) → `ITEM_USE_REJECTED{reason 6, refund 1}`; the client shows "늦은 신호 / late signal (+N ms)".

---

## 9. Backpressure and flow control
- Per client: if `ws.bufferedAmount > 32 KB`, skip SNAPSHOT and RELAY for that client; resume below 16 KB (hysteresis) [P]. EVENTS are never skipped.
- If `bufferedAmount > 256 KB` for 5 s, close with `slow_consumer` (the client resumes, §10) [P].
- Snapshots repeat the consequences of events (effects, projectiles, slots), so any client heals within one snapshot.

---

## 10. Reconnect and resume (ADR-007)
| Step | Rule |
|---|---|
| Drop detected | socket close or 180 ticks without inputs |
| AI takeover | after 180 ticks (3 s): Racer-profile driver with the player's personality (`14-ai-spec.md` §10) |
| Window | 60 s; after that the slot stays AI-driven until the race ends |
| Re-attach | lobby `hello{…, resume}` with the session token → the server re-attaches the peer to its room and slot |
| Resume | binary `C2S_RESUME{token, lastSnapTick, lastEventSeq}`: if the 10 s event log still covers `lastEventSeq`, the server replays events after it and sends a keyframe; else `RESYNC_FULL` + keyframe |
| Control | returns at the first tick whose input arrives after resume; the AI detaches |
| Target | state restored within 1 s of reconnecting after a 2 s drop (E) |
- Event log: 10 s per room; each client's pointer is trimmed at its `ackEventSeq`.

---

## 11. Validation and anti-cheat (gap-4 §6, 06 §5.7)
| Check | Rule |
|---|---|
| Frame sanitizing | `sanitizeInput` (clamp steer to ±127, pedals 0–15, mask held/edges); reserved bits set → message dropped, strike counted |
| Tick window | frames outside `[N − 30, N + 45]` are dropped (edges of a frame older than N − 30 are still applied at N so item uses and taps are never lost) |
| Rate | token bucket 70 messages/s (burst 10), ≤ 4 frames per message; > 3 violations per second → `rate_limited` disconnect |
| Item use | ≤ once per 6 ticks; valid only inside `step()` (item held, not in CC, not slot-locked) |
| Mash | ≥ 3 ticks between credits, ≤ 12 credits (sim) |
| Aim | validated at the use tick T with a +5° cone margin and +10 m range margin; anti-spoof clamp 12 ticks |
| Claims | clients never claim pickups, hits, laps or finishes; everything is simulated |
| Lobby | name 1–16 chars, filtered; chat ≤ 200 chars, 1 per second; JSON ≤ 4 KB; host-only commands checked; `simVersion` must match; `loaded.trackHash` must equal the room's |
| Lag-switch heuristic | bursty late inputs (p95 lateness > 12 ticks with a stable RTT) are logged; v2 uses it to disable the shield rescue |
- Known, accepted leak: full-world snapshots include every kart's item slots (the Interpretability Lens is a UI permission).

---

## 12. Bandwidth budget (per client, 8-kart race)
| Stream | Rate | Payload | Estimate |
|---|---|---|---|
| Snapshots (deltas) | 30/s | ≈ 400 B | 12.0 KB/s |
| Keyframes | 1/s | ≈ 1.3 KB | 1.3 KB/s |
| Input relay | 60/s | 6 + 8 × ≈ 7 B | 3.7 KB/s |
| Events | bursts | ≈ 1 KB/s average | 1.0 KB/s |
| Pong / misc | 0.5/s | tiny | < 0.1 KB/s |
| WS + TCP/IP overhead | ≈ 90 msgs/s × ≈ 46 B | | 4.1 KB/s |
| **Down total** | | | **≈ 22 KB/s ≤ 24 KB/s (E)** |
| Inputs up | 60/s | 14 B + ≈ 46 B overhead | **≈ 3.6 KB/s ≤ 5 KB/s (E)** |
Server egress ≈ 180 KB/s per 8-player room.

---

## 13. SimLink test harness (`packages/net/src/simlink/*`, gap-4 §10)

### 13.1 Model
Virtual-time event queue with a seeded mulberry32 PRNG. Per link: one-way base latency, shifted-lognormal jitter, spikes, TCP loss modelled as a head-of-line stall of `RTO = max(200 ms, srtt + 4·rttvar)`, bandwidth cap, clock skew (ppm), client frame rate (60 or 144 Hz with frame jitter), GC-pause injection. The server loop and N client loops run in one process; the offline Worker `RaceRoom` runs in the same harness for parity.

### 13.2 Matrix
- Full (`NET_MATRIX=full`, nightly/M5): RTT {0, 50, 100, 200, 300} ms × jitter {0, 10, 30, 60} ms × loss {0, 0.5, 2}% × 20 seeds.
- Smoke (`NET_MATRIX=smoke`, CI) [P]: RTT {0, 100, 200} × jitter {0, 10} × loss {0, 0.5}% × 3 seeds.

### 13.3 Scenarios
S1 missile vs shield offset sweep (Δ = −40 … +5 ticks) · S2 bomb rim sweep (5.5–7.5 m) · S3 puddle follower gap (2–20 m) · S4 bolt against 7 victims · S5 box pickups (personal) · S6 mash patterns 6–20 Hz · S7 side-by-side bumps with random steering · S8 7 bots + 1 human · S9 2 s disconnect then resume · S10 lag-switch cheater.

### 13.4 Metrics and pass thresholds (E overrides gap-4 where stricter or different)
| Metric | Pass |
|---|---|
| M1 predicted BLOCK became HIT (shield up before S) | 0 with jitter ≤ slack and no loss; ≤ 0.2% at 100 ± 10 ms with 0.5% loss; ≤ 1% at 200 ± 30 ms with 2% loss |
| M2 ghost hit (predicted HIT, final BLOCK/MISS) | ≤ 0.2% / ≤ 1% (same conditions) |
| M3 schedule arrived after S at the victim | 0 up to 200 ms without loss; ≤ 1% at 200 ms with 2% loss |
| M4 local correction, no items | p99 ≤ 0.05 m at 100 ms |
| M4 local correction caused by items | p99 ≤ 0.5 m at 100 ms; ≤ 1.5 m at 200 ms; snaps ≤ 1 per 10 min |
| M5 remote-kart error | p95 ≤ 0.3 m at 100 ms |
| M6 bump yes/no agreement | ≥ 97% at 100 ms; ≥ 92% at 200 ms |
| M7 mash escape tick | identical across RTT; shift ≤ injected lateness |
| M8 roulette result known before it lands | ≥ 99.9% up to 300 ms |
| M9 determinism | server and client `hashWorld` equal at 0 latency over a 5-min race; Node and Worker equal |
| M10 bandwidth | ≤ 24 KB/s down, ≤ 5 KB/s up |
| M11 client rollback cost | p99 ≤ 1.5 ms per frame at 200 ms RTT |
| M12 fairness symmetry | shooter success independent of which side has the higher RTT, within ±5 percentage points |
| Resume | state restored ≤ 1 s after a 2 s drop |

### 13.5 Other net tests
Protocol round-trip property tests for every codec (random worlds → encode → decode → equal; delta chains of 1000 snapshots equal keyframes); lobby FSM tests (timers, host migration, codes); 50-room bot load test (tick p99 ≤ 4 ms).
