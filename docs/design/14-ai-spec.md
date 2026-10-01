# 14 — AI spec

Owner: L3 AI (`sim/src/ai/{driver,profiles,avoid}.ts`, `trackc/src/ai-bake/**`, `tools/balance/**`), L2 ITEMS (`sim/src/ai/items/**`), L1 SIM (`race/rubberband.ts`).
Sources: ADR-009, ADR-007 (bots on the authority, t+8), gap-2 §4(f) (validated AI), `06-physics-ai-netcode.md` §3, `packages/content/src/characters/*.ts` (personalities), B8.
Status keys: **[S]** sourced · **[V]** validated by gap-2 · **[P]** proposed. Ticks at 60 Hz.

---

## 1. Where the AI runs (ADR-003 §7, ADR-007)
- Only on the authority: the Node server's `RaceRoom`, or the offline Worker. Clients never run bot logic; they predict bots from relayed inputs like any remote kart.
- `sim/src/ai/**` may use trig and `Math.random`-free seeded RNG (`hash32`/mulberry32 from the bot's seed). It reads the world and writes `InputFrame`s; it never mutates the world.
- **Lookahead**: at tick t the driver decides the input for **t + 8** (≈ 133 ms, a human-like reaction). The room relays it at t, so clients with RTT ≤ 100 ms have bot inputs before they need them.
- **Rates**: high-level decisions (drift plans, lane choice, items, boosters, branch choice) at 20 Hz (every 3 ticks, staggered by slot); steering and throttle every tick.
- Pose prediction [P]: because the input applies 8 ticks later, pursuit uses the pose the bot's own pending frames lead to: `ai/predict.ts` replays them through a flat-ground 2D copy of `kartDynamics` with every `KartParams` constant, including the M5 techniques of `15-driving-techniques.md` §4 (tap edges, brake turn ×2, spin-out, cut, drag with η = 1 and the planar cap, no K16 while dragging, the post-boost bleed, STOP/R gears) and the bot's own booster requests. `test/predict.test.ts` holds it within 0.05 m of `step()` after 8 ticks on scripted technique frames (measured ≤ 2.2 mm).
- Bots emit exactly the same `InputFrame` bits as humans (steer, throttle, brake, held, edges, aim), so the same driver can take over a disconnected player (§10).

---

## 2. Tier profiles (`AI_TIERS`, B8 `AiProfile`)
| Field | Rookie | Racer | Pro | Legend | Source / meaning |
|---|---|---|---|---|---|
| Pace target vs Legend ghost | 88% | 94% | 98% | ≥ 99.5% | ADR-009 |
| `vMul` | 0.93 | 0.97 | 1.00 | 1.00 | ADR-009; **always ≤ 1.0** |
| `lineNoise` (σ, m) | 1.2 | 0.7 | 0.35 | 0.1 | ADR-009 |
| `driftSkill` | 0.35 | 0.60 | 0.80 | 0.98 | share of drift zones taken with the optimal plan [P from 02-modes 35/60/80/92%, Legend raised to reach the 99.5% target] |
| `instBoostRate` | 0.15 | 0.45 | 0.80 | 0.95 | ADR-009 |
| `instJitterTicks` | 7 | 4 | 2 | 1 | ±120/70/40/20 ms [06] |
| `reactionTicks` | 60 | 30 | 15 | 6 | item reaction window `[r, 2r]` → 60–120 / 30–60 / 15–30 / 6–12 ticks (ADR-009 ranges; Legend 6–12 ⊂ 6–15) |
| `mistakeRate` (per lap) | 1.5 | 0.7 | 0.25 | 0.05 | wall-tap-level mistakes [06] |
| `startDelayTicks` [min, max] | [6, 30] | [2, 18] | [0, 10] | [0, 6] | throttle-press offset after GO, uniform [P from STK delays] |
| `falseStartProb` | 0.08 | 0.04 | 0.01 | 0 | ADR-009 [S STK] |
| `useDraft` | false | false | true | true | [S STK slipstream on hard/best] |
| `aggression` | 0.2 | 0.4 | 0.6 | 0.7 | base, multiplied by personality (§8) |
| `shortcutRisk` | 0.2 | 0.45 | 0.75 | 0.95 | compared with a branch's `aiMinSkill` (§4.1) |
| `itemSkill` | 1 | 2 | 3 | 3 | 0 never, 1 random timing, 2 tactics, 3 tactics + prediction [S STK scale] |
| `mashHz` | 6 | 8 | 10 | 12 | trap mash rate [03-items] |
- **Legend ghost** = `ghostLap(track, content, mode, 'legend')` with noise off (σ 0, driftSkill 1, instBoostRate 1, no mistakes, no reaction delay). Pace% = ghostLapTime / botLapTime averaged over the race.
- **Pro ghost** (for `refLapSec`, V13, V19) = the same with the Pro profile and a fixed seed.
- Per-bot skill jitter ±5% on `driftSkill`, `instBoostRate` and `lineNoise`, seeded [02-modes §8.7].

---

## 3. Driver algorithm (gap-2 validated AI on baked tables) [V]

### 3.1 Baked tables (`AiSample`, `.ctrk` section AI)
Per path, per 1 m sample: `lineU` (racing-line lateral offset), `vLim` (speed limit from the yaw budget), `kappa` (line curvature), `turnAhead40` (heading change over the next 40 m, signed), `driftZone` (0 none, 1 entry, 2 apex, 3 exit). Plus halfpipe guide lines `(u, h)` and branch records. Built by `trackc/ai-bake` (§11).

### 3.2 Steering in grip: pure pursuit
- Lookahead `L = 6 + 0.35·v` m on the racing line (line point at `s + L`, lateral `lineU + noise + bias`).
- Approach bias: when a drift/brake corner lies within the lead distance, pursue a point offset to the **outside** by `0.6·(hw − 1.5)` (hw = half-width).
- Curvature `κ = 2·sin α / max(dist, 1)`; required yaw rate `r = κ·v`; steer = `gripSteer(r, v) = clamp(r / gripGain(v), −1, 1)` with `gripGain(v) = yG·v/(v + 4)/(1 + (v/33.5)²)`.
- Output `steer` in wire units = `−round(127·σ)` (the sim's σ is + left, §1.1 of `10-sim-spec.md`).

### 3.3 Speed control
- Target speed = `min(vLim(s … s + 90 m) with braking distance, vT)`: `vLim` from a yaw budget `v = 1.7·(R + 0.6·hw)`, or `1.0·(…)` when more than 126° of turning lies within the next 90 m (hairpins) [V]; braking assumed at `0.8·aBrake` (19.2 m/s²).
- `v > vLim + 0.5` → brake (throttle 0, brake 15); `v > vLim` → coast; else throttle 15.

### 3.4 Drift trigger [V]
Start a drift (hold drift, steer = corner direction) when all hold:
- `|turnAhead40| > 25°`;
- centreline curvature with width allowance `|κc| / (1 + 0.6·hw·|κc|) > 0.9·gripCap(v)`, `gripCap(v) = gripGain(v)/max(v, 1)`;
- distance to that corner `≤ 0.5·v·clamp(25/R, 0.3, 1)`;
- `v > 15 m/s`, `reDriftLock == 0`.
The tap lasts 6 ticks (0.1 s, `shTap`), steering ≥ 0.6 into the corner.

### 3.5 Drift control: heading pursuit [V]
While drifting (dir = drift direction):
- `eh` = signed angle from the nose to the track tangent `max(4, 0.45·v)` m ahead (+ = the track turns further than the nose).
- `outside = −dir·(u + u̇·0.25 s)/hw` (+ = heading for the outer wall).
- `e = eh + 0.6·outside`; `s_in = clamp(2.5·e, …, 0.8)`.
- **Bite**: if outward slip sine > 0.42, or `outside > 0.35` while `eh > 0`, limit `s_in ≤ 0.3` (more lateral grip).
- Exit: `e < −0.05` → counter-steer, throttle off while `s_in < −0.3`. Since M5 a full counter-steer (`s_in ≤ −0.7` for 2 ticks) is a **cut** (β → 0 at once, the drift ends; `15-driving-techniques.md` §4.5), so the counter-steer has two forms:
  - **trim** `s_in = −0.677` (86/127, just under the cut threshold): the old reversible counter-steer, used mid-corner, within 120 m of a branch split (the split approach keeps its line) and whenever a cut would point the velocity at the inside wall;
  - **cut** `s_in = −1`: the deliberate exit, only when the corner is done (≤ 0.5 rad left), the nose is at most 0.3 rad past the local tangent and 1.5 m are free on the inside; also the forced exits (jump lip < 30 m, warp gate < 30 m, S-bend within 15 m).
  - A long corner held in one drift (`holding`) counter-steers to −0.3, or to the trim when the drift is boosted (v > 1.1·vGrip).
- **Brakes in a drift** (M5): every brake press in a drift is a brake turn (heading ×2 for ticks 1–8) and 11 ticks spin out. The speed control brakes in a drift only while the nose lags the track (`eh > 0.2`), else it lifts; `commit()` turns any brake in a drift context (DRIFT held, the predicted drift, or drifting now) into pulses of ≤ 6 frames with ≥ 4 released frames, checks the predicted brake count at the apply tick (the sim counts brake ticks on the ground only), and never brakes a drift in the air. Races assert 0 spin-outs and ≤ 8 brake ticks in any drift.
- **Drift trigger sanity** (M5): no new drift into a corner the velocity already turns inside of (`−vU·dir > 0.2·|vS|`): a boosted kart re-drifting while it heads for the inside wall was the main source of wall hits.
- Hold drift while `eh > 0.4` and slip < 0.4 (keeps `s_in ≥ 0.6`); **double drift** (release then re-press) once when `driftTicks > 18` (0.3 s) and `eh > 0.8`.

### 3.6 Instant boost
- When `instWindow > 0`: with probability `instBoostRate` (rolled per drift) the bot releases the throttle for 1 tick and presses it at window tick `1 + U[0, 2·instJitterTicks]`; otherwise it keeps the throttle held (no edge, no boost).

### 3.7 Boosters (speed mode)
- Fire when `boosters > 0`, not drifting, `|turnAhead40| < 12°`, `boostTicks < 12`, and the previous tick did not fire. Pro/Legend keep one booster in reserve when a hit is likely (item modes do not apply; in speed mode: when a wall hit just happened, fire the reserve to recover).
- Chain on long straights: fire the second when `boostTicks < 15`.

### 3.8 Start
- `falseStartProb`: press at a uniform offset in [−20, −13] ticks (FALSE); otherwise press at `U[startDelayTicks]` after GO (PERFECT on [0, 6], GREAT to 12, GOOD to 21).

### 3.9 Execution quality (per drift zone, per lap, seeded)
| Roll r | Plan |
|---|---|
| r < driftSkill | optimal: §3.4–§3.6 as validated |
| r < driftSkill + 0.6·(1 − driftSkill) | sloppy: trigger 4–10 m late, hold drift 6–15 ticks longer, counter-steer late |
| otherwise | grip: brake to the grip speed on the line |
- Mistakes: each drift zone rolls `p = mistakeRate / zonesPerLap`; a mistake is a 0.3 s late brake or a 20-tick over-held drift (may tap the wall).
- Line noise: an Ornstein–Uhlenbeck lateral offset with σ = `lineNoise`, time constant 90 ticks, clamped to `hw − 1.5`.

- A corner of 2 rad or more (hairpin) is never gripped on purpose: the grip table's width allowance is optimistic over 120°+ of turning, so such corners roll a sloppy drift instead of the grip plan.

### 3.10 Draft (`useDraft`)
- On a straight (`|turnAhead40| < 10°` for 100 m), if a kart is 5–20 m ahead within ±1.5 m, follow its lateral offset; when `draftTicks > 0` (active), pull out 2.5 m to the side with fewer karts and pass.

### 3.11 Driving techniques (M5, `15-driving-techniques.md`)
The tiers adopt drag (끌기), tap boost (톡톡이) and the brake drift turn (고속턴) at their own rate (`AI_EXECUTION`, `profiles.ts`); every bot avoids spin-outs (§3.5).

| | rookie | racer | pro | legend |
|---|---|---|---|---|
| `dragRate` (share of eligible corners planned as a drag) | 0.03 | 0.25 | 0.75 | 0.95 |
| `tapRate` (share of planned drags that tap) | 0 | 0.05 | 0.3 | 0.9 |
| `brakeTurnRate` (share of hairpins with a deliberate brake turn) | 0 | 0.1 | 0.35 | 0.7 |
| `dragMinR` (m) | 60 | 50 | 40 | 35 |
| `dragLeadS` (booster fired into the corner from v·dragLeadS m) | 0 | 0.5 | 0.7 | 0.8 |
| `tapJitterTicks` (± on the 8-tick rhythm, clamped to 6–12) | 3 | 2 | 1 | 0 |

- **Eligible corners** (`Corner.dragSafe`, `plan.ts`): a drift corner with `minR ≥ dragMinR` and `turn ≤ 2.6` rad, no open ledge, halfpipe or loop span over it (−20/+30 m), no jump lip or warp gate within 60 m before / 40 m after, no branch split or merge within 80 m before / 40 m after, and no S-bend (an opposite drift corner starting within 25 m of the exit, or ending that close before the entry). The plan is rolled once per corner pass (keyed by the lap of the pass, so the booster look-ahead and the corner roll agree); the ghost takes every eligible plan.
- **Boosters for a drag** (`boostSkill ≥ 1`): fire into the corner when it is `5 < d < v·dragLeadS` m ahead; the last booster is kept for a planned drag corner up to 150 m ahead (unless a booster fired now still covers its entry). Holding boosters longer costs more than the drag gains (≈ 2.5 s per race on meadow_loop), so most drags are opportunistic: a boosted drift in an eligible corner.
- **Boost expiry** (Pro/Legend): a straight-line booster may wait up to 0.6 s so that it runs out inside a drift corner (a drift cancels the post-boost bleed).
- **Drag control** (drifting, boosting ≥ 20 more ticks, the planned corner, the kart not heading for either wall, more than 0.2 rad left):
  - build-up while the predicted β is below the 20° entry window: full in-steer with DRIFT kept held from the entry tap, only while the nose lags the track (`eh > 0.1`) and the yaw is below what the corner asks for + 1.2 rad/s; a released DRIFT is re-pressed (double drift) only when `eh > 0.35`;
  - drag: the wheel stays inside the neutral band (`|s_in| ≤ 0.28`); it sets the yaw target `(κ·v + 2·e − tapYaw/kYawDrift/gap − centred yaw)/y1` with damping on the yaw excess; DRIFT keeps its state (a re-press re-kicks) unless the yaw needs the other one; a drag whose yaw stays saturated high releases DRIFT;
  - taps on the corner key every `8 ± tapJitterTicks` ticks (clamped to 6–12), steer still 0, while the nose is not ahead of the track; Mirror Mode swaps the TAP bits together with the steer (`ai/items/decide.ts`);
  - abort when the nose is more than 0.12 rad ahead of / 0.35 rad behind the track, when the kart runs to either wall (`|outside| > 0.45`), or near the corner end, or while a kart runs alongside (the side-contact reflex of §5 would push the wheel; a drag holds its line at boost speed and rubbed an inside kart for up to 40 ticks); the normal exit (trim / cut) follows. vLim braking is skipped while dragging.
- **Brake turn**: on a rolled hairpin (turn ≥ 2 rad, minR ≤ 20 m) one 5-frame brake tap in the drift once the nose lags by more than 0.45 rad.
- Telemetry: `runRace()` counts drag entries, valid taps, cuts, spin-outs and brake turns per kart from the events, plus the longest brake run seen in a drift; `node tools/balance/tiers.ts --verbose` prints them per lap.

---

## 4. 3D features

### 4.1 Branches (shortcuts)
- At each junction record, a bot takes the branch if `shortcutRisk_eff · (0.8 + 0.4·rng) ≥ aiMinSkill` (rolled once per bot per junction per lap). `shortcutRisk_eff = shortcutRisk · (0.6 + 0.8·personality.risk)`, clamped to 1.
- Example (personality risk 0.4): Belltower alley (`aiMin 0.45`): Rookie never, Racer on ≈ 30% of laps, Pro and Legend always. Magma ledge (`0.75`): Racer never, Pro on ≈ 15% of laps, Legend on ≈ 85%.
- On a branch the bot follows the branch's own baked line; kill-risk branches add the item-free rule (no item use on them).

### 4.2 Jumps
- 60 m before a lip: no new drift; exit any drift by 30 m before the lip (counter-steer); align with the ramp tangent (steer to the ramp centre line).
- Target lip speed = `clamp(v, vMin + 2, vMax − 2)` of the `JumpDef`; brake if above.
- In the air: throttle held, steer neutral; on landing resume.

### 4.3 Rails
- Rail intent (rolled per rail per lap): Pro/Legend 1.0, Racer 0.6, Rookie 0.3 (× (0.5 + risk)).
- With intent, 40 m before `fromS` steer toward the rail's entry offset `d` and hold `v ≥ vMin + 3`, heading within 15° of the rail tangent; no drift during the approach.

### 4.4 Halfpipes
- Follow the baked guide line `(u(s), h(s))` (the ghost's fastest wall ride); line noise scaled ×0.5 on the walls.

### 4.5 Loops, zero-g, helices
- Loops and zero-g tubes: throttle held (no vLim or ledge braking inside the RMF span, M5), steer to `lineU` only (no drifts inside an RMF span).
- Helices: normal driving; the baked `vLim` already includes the constant curvature.

### 4.6 Warps
- Steer to the gate centre `d` 50 m before the entry; no drift.

### 4.7 Hazards
- For each hazard within the next 120 m: evaluate `hazardPose(h, tick + ETA)` at the bot's ETA (analytic phase). If the hazard will be active or telegraphing at arrival, either choose a lane outside its shape (lane cost +∞ for that lane) or slow to arrive after the active window when no lane is safe (presses, laser gates). A hazard that does not clear within the 5 s scan (a pendulum that is always active) is never waited for: crawling at 6 m/s behind it lost 5–10 s per pass on manor_catacombs; the lane choice alone handles it.
- Traffic/trains: treat vehicles as moving karts in the avoidance cone (§5).

---

## 5. Avoidance and overtaking [P from 06 §3.4]
- Every 6 ticks, evaluate 5 lateral candidates at `lineU + {−0.5, −0.25, 0, +0.25, +0.5}·(hw − 1.5)`.
- Cost = `1.0·|offset − lineU| + 3.0·Σ(1/TTC)` for karts in a 30 m forward cone `+ 50·hazard` (traps, active hazards, firewall blocks) `− 2.0·wanted` (item boxes when a slot is free, boost pads) `+ 0.5·|change from current|`.
- Aggressive bots (aggression ≥ 0.8) scale the kart TTC term by `(1 − aggression)` and may steer into a rival alongside (bump), never into a rival ahead at > 5 m/s closing speed.
- Lateral change rate ≤ 3 m/s.
- Side contact (M5): in grip (not in loops, on halfpipes or beside ledges), a kart within 4.5 m along and 3.2 m across that closes in laterally pushes the wheel away (≤ 0.6 of lock, more with the closing speed); bump personalities (aggression ≥ 0.8) are exempt. Lane re-plans alone are too slow for side-by-side contact at corner speeds. In a drift the same push acts on sIn: a rival on the outside (where the slide carries the kart) tightens the drift, one on the inside only eases it, never below sIn −0.3 (no cut); not while dragging or on the entry tap. With the wider window (4.5 m along, 3.2 m across; was 3.5 / 2.8) and no drag beside a rival (§3.11), the 8-Pro meadow field drops from 2.58 (M5 baseline) to 1.30 hard bumps per kart over seeds 1–10 (worst seed 4.5 → 2.0).
- Ghosted or finished karts are ignored.

---

## 6. Item heuristics (item mode; `sim/src/ai/items/<id>.ts`)
Common rules:
- A decision to use waits the tier reaction `U[reactionTicks, 2·reactionTicks]` after the trigger condition first becomes true; the condition must still hold.
- Threat perception: an incoming projectile is perceived only from ETA ≤ 120 ticks (when the warning starts) plus the reaction delay [gap-4 §8]; bots never read the secret key, other players' rolls or authority-only state.
- `itemSkill 1` uses items at a random time 60–240 ticks after pickup when valid; `2` applies the rules below; `3` also predicts (leads bombs, saves shields for known incoming threats, times puddles on corner entries).
- Personality `itemHoarding h`: defensive items are kept unless a threat appears; for attack items the bot may wait up to `120·h` ticks for a better target.
- Redaction overlay on a bot: perception noise (line noise ×2, reaction +30 ticks) for the effect's duration.

| Item | Use when | Notes |
|---|---|---|
| turbo_token | next 60 m has Σ\|Δψ\| < 12°, not boosting; or right after a hit; or on a shortcut entry | chain a second at `boostTicks < 15` on long straights |
| attention_tether | locked target in cone (25–150 m) and rank ≥ 2 | combine with turbo afterwards (KRD "짜부") |
| overclock_aura | on a straight with an opponent within 15 m ahead or beside; or in the last 300 m | never before a hairpin |
| prompt_missile | fire as soon as locked (target ahead within 180 m); with look-back: pursuer within 60 m behind if rank ≤ 2 | itemSkill 3 prefers the highest-ranked lockable opponent |
| top1_missile | valid (leader is not self/team) and rank ≥ 3, or rank 2 with a leader gap > 60 m | |
| token_bomb | an opponent 20–45 m ahead within 6 m of the centreline, or a pack of ≥ 2 within 30–40 m | never with a teammate within 8 m of the landing point (area friendly fire) |
| bug_report | valid target exists (opponent directly ahead) | |
| broadcast_bolt | rank ≥ 3 and at least 2 opponents ahead | |
| throttle_drone | valid and the leader is ≥ 40 m ahead, preferably before a straight or a shortcut | |
| firewall | valid and the target is ≥ 60 m ahead | |
| glitch_puddle | an opponent within 15 m behind; or just before a narrow corner / branch entry (inside line, "인빠") | |
| redaction_cloud | an opponent within 25 m behind | |
| mirror_mode | rank ≥ 3 and an opponent ahead is within 120 m of a corner | |
| context_shield | incoming threat: projectile perceived with ETA ≤ 24 + reaction, bolt/mirror telegraph started, bomb landing ≤ 8 m, puddle directly ahead in lane | Pro/Legend raise the shield 10–20 ticks before impact; Rookie often too early or too late |
| interrupt_pulse | a drone stack on self/teammate, a drone in flight at self/teammate, or an opponent tether on self | |
| alignment_halo | a teammate or self has a perceived threat | |
| interpretability_lens | as soon as valid (team) | cosmetic advantage only |
| mutex_lock | as soon as valid and ≥ 1 opponent holds an item | |
| Mash-out | alternating taps at `mashHz` (period `round(60/mashHz)` ticks) with ±1 tick jitter | |

---

## 7. Rubber-band (`race/rubberband.ts`, ADR-009)
Pure, deterministic, arithmetic-only; runs on every peer so clients predict bots exactly.
```
capMul(w, slot, cfg):
  if not cfg.rules.rubberBand or cfg.mode == 'timeAttack'       → 1
  if slot is not a bot, or its tier is 'legend'                   → 1
  if bot's D ≥ (laps − 0.15)·L                                     → 1   // final 15% of the final lap
  ref = reference human race distance:
        1 human        → that human's D
        ≥ 2 humans     → lower median of the humans' D
        finished human → laps·L + (tick − finishTick)·V_REF·DT
  if no human                                                      → 1
  d = D_bot − ref
  if d > 20:  return 1 − 0.04·min(1, (d − 20)/180)                 // ahead: down to −4% at 200 m
  if d < −30 and tier ∈ {rookie, racer}:
              return 1 + 0.04·min(1, (−d − 30)/220)                // behind: up to +4% at 250 m
  return 1
```
- Applied in the sim as `m_eff = min(1.0, vMul · capMul)` to every target speed of that bot (`10-sim-spec.md` §7.3). The `min(1.0, …)` keeps "no bot above 1.00" (ADR-009): the positive band only recovers a Rookie/Racer's `vMul` deficit.
- Off in ranked (not in v1), on Legend, in Time Attack, and when the room disables it.
- Balance check (M3): rubber-band spread — with a human-like scripted driver at Racer pace, the field's median gap to the reference stays within 80–250 m over a race.

---

## 8. Personalities (`packages/content/src/characters/*.ts`)
The profile passed to `createAiDriver(…, profile, personality, seed)` is the tier profile modified by the character's personality:

| Personality field | Effect |
|---|---|
| `aggression` a | `aggression = tier.aggression · (0.5 + a)` clamped to 1; attack-item reaction ×(1.2 − 0.4a); bump behaviour at ≥ 0.8 |
| `lineBias` b | on straights and before corners, hold `lineU + 0.3·b·(hw − 1.5)` (negative = inside) |
| `risk` r | `shortcutRisk_eff` (§4.1); `vLim ×(1 + 0.02·(r − 0.5))`; jump approach nearer vMax; rail intent ×(0.5 + r) |
| `consistency` c | `lineNoise / c`, `mistakeRate / c` |
| `driftStyle` | `long`: holds drifts, drag-drifts long corners, double drifts in hairpins; `chain`: short drifts, early cuts, more instant boosts (+0.05 `instBoostRate`, capped at the next tier's value) |
| `itemHoarding` h | §6 |

| id | Name (KR) | aggression | lineBias | risk | consistency | driftStyle | itemHoarding | Driving character |
|---|---|---|---|---|---|---|---|---|
| clay | Clay (클레이) | 0.4 | 0.0 | 0.4 | 1.0 | chain | 0.3 | Calm and helpful: textbook lines, chained short drifts |
| pixel | Pixel (픽셀) | 0.6 | −0.2 | 0.5 | 0.9 | chain | 0.2 | Retro and cheeky: hugs the inside, a little erratic |
| turbo | Turbo (터보) | 0.7 | 0.2 | 0.7 | 1.0 | long | 0.1 | Competitive: long drag drifts, fires items at once |
| anchor | Captain Anchor (앵커 선장) | 0.9 | 0.3 | 0.6 | 0.8 | long | 0.4 | Boisterous: wide lines, bumps rivals |
| rune | Rune (룬) | 0.3 | −0.3 | 0.5 | 0.9 | long | 0.6 | Dreamy: inside lines, hoards shields |
| nova | Nova (노바) | 0.4 | 0.0 | 0.3 | 1.1 | chain | 0.3 | Curious and careful: steady, rarely risks shortcuts |
| kage | Kage (카게) | 0.8 | −0.4 | 0.8 | 1.1 | chain | 0.2 | Stoic: tight inside lines, takes risky shortcuts |
| bisque | Chef Bisque (비스크 셰프) | 0.2 | 0.1 | 0.2 | 1.0 | long | 0.7 | Warm and fussy: defensive, keeps items for emergencies |
| frost | Frost (프로스트) | 0.3 | 0.4 | 0.4 | 1.2 | long | 0.4 | Cool and shy: smooth wide lines, very consistent |
| glitch | Glitch (글리치) | 0.9 | 0.0 | 0.9 | 0.7 | chain | 0.1 | Hyper: aggressive, erratic, reckless shortcuts |
| bolt | Bolt (볼트) | 0.5 | 0.2 | 0.3 | 1.3 | chain | 0.5 | Literal-minded: machine-precise lines |
| duke | Duke (듀크) | 0.6 | 0.1 | 0.5 | 1.0 | long | 0.8 | Dignified and vain: waits for the perfect moment to use items |

---

## 9. Bot identities and names [P]
- Chosen by the authority (room host) when it fills slots; written to `SlotConfig.name`, `characterId`, `kartBodyId`, `ai`, `vMul`.
- **Name** = `{prefix}-{NN} {colour}` from `hash32(roomSeed, slot, attempt)`:
  - prefixes (16): Spark 스파크, Byte 바이트, Token 토큰, Prompt 프롬프트, Echo 에코, Delta 델타, Vector 벡터, Tensor 텐서, Kernel 커널, Cache 캐시, Logit 로짓, Relay 릴레이, Quanta 퀀타, Syntax 신택스, Parser 파서, Module 모듈;
  - NN = 01–99;
  - colours (12): Coral 코랄, Ivory 아이보리, Sage 세이지, Sky 스카이, Clay 클레이, Amber 앰버, Slate 슬레이트, Teal 틸, Rose 로즈, Lime 라임, Plum 플럼, Sand 샌드.
  - Example: "Spark-07 Coral" / "스파크-07 코랄". The locale of the viewer picks the rendering; the wire carries the English form plus the indices.
  - Unique within a room: collisions re-roll with `attempt + 1`.
- **Character**: drawn without repeats among bots, avoiding characters already used by humans while possible.
- **Kart**: the character's preferred archetype (long drift style → drift or balance body; chain → balance or speed), any unlocked body (bots ignore unlocks).
- UI: an `icon_ai` badge next to bot names in standings, lobby and results [S KRD].

---

## 10. Takeover and stuck recovery
- **Disconnect takeover**: after 180 ticks (3 s) without inputs, the authority attaches an `AiDriver` to the human's slot with the Racer profile and the human's character personality; it hands control back on reconnect (ADR-007).
- **Finished karts**: a cruise controller (Rookie noise, no items) drives until `DONE`.
- **Stuck**: `v < 2 m/s` for 90 ticks → reverse with counter-steer for 54 ticks (M5: reverse engages 6 ticks after STOP) → still stuck at 200 ticks → press R (manual reset is allowed after 60 slow ticks). The slow test uses the smaller of the predicted and the real speed: the self-prediction has no walls, so a kart pinned against an obstacle (hard hit, stun, throttle, hard hit …) would otherwise predict itself moving off forever. This keeps "no bot stuck > 5 s" (E).

---

## 11. AI bake (`trackc/src/ai-bake/**`)
1. **Racing line**: sample the centreline every 1 m; lateral offset `α_i ∈ [−(w_i/2 − 1.2), +(w_i/2 − 1.2)]`; minimum-curvature relaxation (move each point toward its neighbours' midpoint, clamp to the corridor) for 300–500 iterations (< 50 ms per track) [06].
2. **Curvature** κ by Menger curvature over 3 points; **turnAhead40** by integrating heading change over the next 40 m.
3. **vLim** from the yaw budget (§3.3) with forward (A0 law) and backward (0.8·aBrake) passes.
4. **Drift zones**: mark entry/apex/exit where the §3.4 trigger fires for a Pro approach at the zone's entry speed.
5. **Guide lines** for halfpipes from a ghost search over wall heights; **branch records** (time saved, risk).
6. Output into `.ctrk` section 18 (AI). The ghost laps (Pro and Legend, speed and item) run on the baked track through the real `step()` and write `refLapTicks` into the manifest/meta.

---

## 12. Performance and acceptance targets (E)
| Metric | Pass |
|---|---|
| AI cost | ≤ 5 µs per kart-tick (bench), including 20 Hz decisions amortized |
| Tier pace vs Legend ghost | Rookie 88 ± 2%, Racer 94 ± 2%, Pro 98 ± 1.5%, Legend ≥ 99.5% |
| Archetype spread | Speed/Balance/Drift within ±2% (Pro AI) |
| Finishers (8 bots, Pro ± jitter) | speed ≥ 7/8, item ≥ 6/8 before retire |
| Stuck | no bot stuck > 5 s (300 ticks) |
| Incidents | hard wall hits ≤ 0.3 per bot-lap; respawns ≤ 0.5 per bot-lap (tracks without kill zones: ≤ 0.1) |
| Item coverage | every item used ≥ 1× and every effect applied ≥ 1× across the item suite |
| Isolated corners [V] | 40/40 clean on 11–16 m roads at 25–40 m/s entry (gap-2 EXP f), re-run on the 3D sim |
| Lookahead | identical results whether the bot runs on the server or in the Worker (hash) |
