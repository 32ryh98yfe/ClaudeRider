
# ClaudeRider canonical arcade physics spec: validated by headless simulation

## 0. Environment constraints

- **Plan mode and read-only.** The session was in plan mode and the task was marked strictly read-only, so I could not create `sim.ts` in the scratchpad. The full simulator (756 lines of TypeScript) is stored in the only writable file, the plan file `/root/.claude/plans/nexon-kartrider-drift-atomic-quilt-agent-a181d8fa946423c79.md`, as the fenced block ` ```ts sim `. Every run was a read-only pipe into Node 22.22 (V8 12.4):
  `awk '/^```ts sim/{f=1;next} /^```$/{f=0} f' <planfile> | EXP=<a|d|e|b|bq|f|lap|circle|dss|start|arch|cpu|det|tr> [HW=6] [HZ=60] [OV='{json}'] node --input-type=module-typescript`
  To make it a real file later, save that block as `…/scratchpad/sim.ts` (and later as `shared/sim/step.ts`).
- **Web access was limited.** The WebSearch budget was already used up (200/200) before I started. The proxy blocks namu.wiki, kartdrift.nexon.com, inven, fandom, reddit, MDN, tc39.es and gafferongames.
- **What I could reach:** raw.githubusercontent.com and GitHub code search. Sources used:
  - KartDocs, a Korean KartRider: Drift (KRD) guide repo.
  - kart.cafe, a KRD database.
  - yanygm/Launcher_V2, whose KartSpec.cs and SpeedType.cs are already in the scratchpad.
  - Kinoko, a bit-accurate reimplementation of Mario Kart Wii physics.
  - The RLBot wiki (Rocket League values).
  - V8 and Node.js source code.
  - The ECMA-262 spec source.
- The KRD display speeds 183.33 and 239.54 km/h come from the dossier. I could not re-verify them.

## 1. Research facts used for design (sourced)

**KRD technique behaviour (KartDocs):**
- **Start boost:** press forward *slightly after* GO; the GO text turns blue for the better tier.
- **Instant boost:** press forward within a fixed time after a drift ends. Using it while a booster is running can slow you down. There is an optional on-screen "instant boost available" indicator.
- **Drift depth:** a deeper or longer drift loses more speed. The "optimised drift" is a minimal-angle tap followed by counter-steer.
- **Full drift and double drift:** full drift is the U-turn technique. Double drift is a second shift press mid-drift for hairpins.
- **Drag drift (끌기):** a shallow held drift that can exceed straight-line speed through the drift escape force.
- **Wall hits:** hitting a wall while drifting costs booster gauge (a tuning stat protects 10% per point). Booster auto-chaining removes the delay between boosters. Draft exists.

**KRD track list (kart.cafe, 49 tracks):** item tracks are difficulty 1–3 (7/7/3 tracks). Speed tracks are difficulty 2–5 (1/4/4/4). Item tracks should therefore be easier and wider.

**Classic KartRider KartSpec.cs:**
- NormalBoosterTime 2900–3000 ms, ItemBoosterTime 3000 ms, TeamBoosterTime 4350–4500 ms.
- StartBoosterTimeSpeed 1500 ms, StartBoosterTimeItem 1000 ms.
- SpeedSlotCapacity 2.

**Mario Kart Wii (Kinoko, a 60 Hz simulation):**
- Mini-turbo charge threshold 270 units, gained at 2 per frame (5 per frame with outward stick), i.e. 0.9–2.25 s.
- Start-boost frame table 0/10/20/30/45/70 at 60 fps (at most 1.17 s).
- Boost speed multipliers +20% (mini-turbo), +30% (mushroom), +40% (trick or zipper).
- While in wall contact, the speed cap is scaled by roughly (1 − sin θ) × 0.4–0.7.

**Rocket League (RLBot wiki):** a 90° turn takes about 0.775 s, i.e. about 2.0 rad/s arcade yaw. Boosted maximum is 2300 uu/s. Brake 35 m/s², coast 5.25 m/s².

**Determinism:**
- ECMA-262: Math.sin, cos, atan2, exp, pow and hypot are "implementation-approximated". Math.sqrt is exact ("Return 𝔽(the square root of ℝ(n))"). The spec only *recommends* fdlibm.
- V8 changed its trig implementation. In Node 22/24, V8 uses a port of fdlibm, with a glibc path behind the build flag `V8_USE_LIBM_TRIG_FUNCTIONS`. Current V8 main delegates sin, cos, atan2, exp and pow to LLVM libc.
- A Node server and a current Chrome client can therefore disagree in the last bit. Firefox and Safari use different libms again.

## 2. Canonical choices

### Tick rate: 60 Hz fixed, deterministic `step()`, no collision sub-steps

Measured on unoptimised TypeScript:
- `step()`, including the wall query, costs **0.98 µs per kart-tick**.
- AI decision costs **8.5–10.5 µs per kart-tick**. This is naive curvature scanning; caching it or running AI at 30 Hz cuts it by 5–10×.

Cost per room (8 karts, 7 of them AI), with a 50% CPU budget:

| Sim rate | Server CPU per room | Rooms per vCPU | Client full-world replay, 15-tick-equivalent RTT, 30 snapshots/s |
|---|---|---|---|
| 30 Hz | 2.45 ms/s | ≈204 | 0.9 ms/s |
| **60 Hz** | **4.9 ms/s** | **≈102** | **3.5 ms/s** |
| 120 Hz | 9.8 ms/s | ≈51 | 14 ms/s (30 ticks) |

Why 60 Hz:
- **120 Hz buys nothing and costs double.** The model is rate-robust. At 30/60/120 Hz, 0→97% speed takes 3.93/3.95/3.97 s, and the optimal time for a 90° corner at R 12 m is 3.37/3.38/3.38 s. So 120 Hz only halves server density and doubles replay cost.
- **30 Hz is too coarse.** The PERFECT start window would be 3 ticks and the instant-boost window 9 ticks. A boosted kart moves 1.48 m per tick, and a head-on closing speed of about 88 m/s means about 2.9 m per tick. That exceeds the 2.2 m kart contact diameter, so karts could pass through each other.

Networking:
- Inputs are sampled every tick. They are sent as 30 packets/s, each holding the 2 new ticks plus the 4 previous ones for redundancy.
- Snapshots go out at 30 Hz, with 100 ms interpolation.
- Client replay is 6–15 ticks. Full-world rollback is affordable.
- Walls use a corridor clamp, which cannot tunnel. Kart–kart contact uses a swept-circle test, which replaces the dossier's 2 sub-steps.

### Speed scale: all item multipliers are relative to V_REF

**V_REF = V_GRIP = 34.0 m/s** (displayed 183.6 km/h, where displayed km/h = 5.4·v). **V_BOOST = 44.4 m/s** (239.8 km/h).

The item report's "Vmax ≈ 40 m/s" base is removed. Its item effects convert as follows:

| Item effect | Dossier value | Canonical value |
|---|---|---|
| Turbo | ×1.30·40 = 52 m/s (above the speed-mode boost cap) | Same as a booster: 44.4 m/s for 3.0 s |
| Tether | 1.2·40 = 48 m/s | 1.2·V_REF = 40.8 m/s |
| Missile | 1.6·40 = 64 m/s | 1.9·V_REF = 64.6 m/s (absolute speed unchanged) |
| UFO slow | ×0.60 | 0.6·V_REF = 20.4 m/s |

Item mode uses the same kart constants with the gauge turned off.

## 3. Canonical model

The state holds heading as a unit vector. Velocity is kept in world coordinates and decomposed into forward speed u and lateral speed w. Per tick:

1. **Timers**, including the stun, which zeroes throttle and scales yaw ×0.3.
2. **Drift entry.** Conditions: shift held, |steer| ≥ 0.3, u ≥ 10 m/s, re-drift lockout 0.10 s. Effects: yaw +1.2 rad/s, heading +4°, velocity ×0.99.
   - **Double drift:** a new shift press after at least 0.15 s gives +0.8 rad/s, +3°, ×0.99.
3. **Yaw target.** Yaw approaches the target with a first-order lag of K = 12 s⁻¹ (grip) or 6 s⁻¹ (drift).
   - **Grip:** r* = steer·1.55·v/(v+4)/(1+(v/33.5)²). Full-steer radius: 9.8 m at 10 m/s, 21 m at 20, 29 m at 25, 39.5 m at 30, **49.8 m at 34**, 86 m at 44.4.
   - **Drift:** r* = dir·(0.6/(1+t/0.6) + 1.2·s_in + 0.7·shift), where s_in = steer·dir. The maximum is 2.5 rad/s at entry and about 2.0 sustained. Neutral steering fades out; full counter-steer gives −0.6 rad/s.
4. **Heading rotation** uses a 5th-order polynomial small-angle rotation, then renormalisation.
5. **Lateral damping** multiplies w by D(k). The fraction η of the speed that damping removes is restored along the heading, so damping can never add speed.
   - Grip: k = 18, η = 0.10.
   - Drift: k = 5.5 when |s_in| < 0.3. It interpolates to 3.0 at s_in = 1 and to 9.0 at s_in = −1. Holding shift multiplies k by 0.85. η = 0.80.
   - Slip is capped at 55°.
6. **Gauge (speed mode only):** dG/dt = 0.70·√min(sinβ/0.5, 1)·(v/V_G)/(1 + T_f/1.5).
   - T_f is a fatigue timer: +1 per second while drifting, −1 per second otherwise, so chopping one corner into several drifts gains nothing.
   - No gauge is gained during wall contact. G = 1 is one booster; there are 2 slots.
   - **Drift exit:** sinβ < sin 6° after at least 0.12 s, or u < 5 m/s.
7. **Instant boost.** The window is 0.30 s, opened when the drift lasted ≥ 0.25 s with peak slip ≥ 8°. A throttle press edge triggers it: 9 m/s² for 0.5 s, capped at 1.05·V_G (35.7 m/s). It is ignored while a booster is running.
8. **Longitudinal:**
   - Throttle: a = A0·(1 − (u/V)²) with A0 = 18.
   - Overspeed decays at 0.9 s⁻¹. Coasting −2.5 m/s². Brake −24 m/s² (−14 while drifting). Drift acceleration is capped at 5 m/s².
   - **Drift drag:** dv/dt = −0.8·v·sin²β.
   - **Booster:** a = min(25, 4·(V_B − u)) for 3.0 s. Boosters chain when less than 0.25 s remains.
   - **Start boost:** same law, capped at 30 m/s².
9. **Walls** (e = 0.15). Contact is detected once per contact; θ is the impact angle.
   - **θ < 15° (grind):** the into-wall velocity is removed, 10 m/s² friction applies, and the nose is projected parallel to the wall.
   - **15–45°:** tangential speed ×0.95→0.70. Any drift is cancelled with gauge ×0.5. Instant boost is cancelled.
   - **> 45°:** tangential speed ×0.40, 0.25 s stun, booster cancelled, nose re-aligned along the wall.
10. **Start boost.** It is decided by the integer tick of the first throttle press relative to GO:
    - PERFECT [0, +6] ticks (0 to +100 ms): 1.5 s.
    - GREAT [−6, −1] ∪ [7, 12]: 1.0 s.
    - GOOD [−12, −7] ∪ [13, 21]: 0.6 s.
    - FALSE (< −12 ticks, i.e. earlier than −200 ms): 0.3 s wheelspin at 30% acceleration.
    - Item-mode durations are ×0.67.
11. **Gravity 30 m/s²** (dossier C value; not simulated here, because this sim is 2D).

### Kart archetypes

Balance is the base; the columns give the stat range from Speed to Drift.

| Stat | Speed | Balance | Drift |
|---|---|---|---|
| V_GRIP (m/s) | 34.4 | 34.0 | 33.6 |
| V_BOOST (m/s) | 45.0 | 44.4 | 43.8 |
| A0 (m/s²) | 16.5 | 18 | 19.5 |
| T_BOOST (s) | 3.1 | 3.0 | 2.9 |
| g0 | 0.64 | 0.70 | 0.77 |
| k_in / k_neutral (s⁻¹) | 2.8 / 5.2 | 3.0 / 5.5 | 3.3 / 5.9 |
| Y_G (rad/s) | 1.50 | 1.55 | 1.60 |
| C_β | 0.85 | 0.80 | 0.75 |

On 6×2 km AI stages, these archetypes stay within about ±2% of each other:
- D1 (fast track): Speed 353.9 s, Balance 355.5 s, Drift 361.6 s.
- D3: all within 0.4%.
- D5 (twisty track): Drift is fastest, 402 s against 413 s for Speed.

## 4. Results

### (a) Acceleration
- 0→100 km/h displayed: **1.17 s**.
- 0→25 m/s: 1.78 s. 0→30: 2.62 s. 0→97% of grip max: **3.95 s**. 0→99%: 4.97 s.
- The dossier's A0·(1 − v/Vt) law took 6.6 s to reach 97%.

### (b) Corners, 12 m road, entry at 34 m/s (184 km/h)

- **OPT** is the best clean open-loop plan (about 1,150–3,500 plans searched), or the AI if faster. Drop = entry minus minimum speed.
- **CLUMSY** is shift held ≥ 0.5 s, full steer, late counter-steer, no instant boost.
- **GRIP** means braking to the given corner speed on the geometric racing line.
- Speeds are displayed km/h.

| Angle | Rc (m) | Racing-line R_L (m) | OPT min (drop) | OPT exit | OPT t (s) | Gauge | CLUMSY min (Δ) / exit (Δ) | CLUMSY t (s) | GRIP corner speed / t (s) | AI t (s) |
|---|---|---|---|---|---|---|---|---|---|---|
| 90 | 9 | 35.2 | 167 (−9.3%) | 189 | 3.28 | 0.31 | 142 (−41) / 155 (−28) | 3.55 | 146 / 3.92 | 3.88 |
| 90 | 12 | 38.2 | 170 (−7.4%) | 192 | 3.38 | 0.32 | 142 (−41) / 157 (−26) | 3.65 | 154 / 3.93 | 3.75 |
| 90 | 16 | 42.2 | 176 (−4.2%) | 193 | 3.57 | 0.37 | 142 (−41) / 161 (−23) | 3.88 | 165 / 3.95 | 3.68 |
| 90 | 22 | 48.2 | 175 (−4.7%) | 193 | 3.85 | 0.41 | 142 (−41) / 165 (−19) | 4.30 | 176 / 4.05 | 3.87 |
| 90 | 30 | 56.2 | 175 (−4.6%) | 194 | 4.23 | 0.42 | 142 (−41) / 169 (−14) | 4.77 | 184 (flat) / 4.32 | 4.23 |
| 180 | 9 | 13.5 | 91 (−50%) | 138 | 4.95 | 0.55 | 82 (−101) / 130 | 4.87 | 73 / 6.48 | 5.80 |
| 180 | 12 | 16.5 | 107 (−42%) | 152 | 4.77 | 0.54 | 102 (−82) / 139 | 4.95 | 89 / 6.35 | 5.67 |
| 180 | 16 | 20.5 | 122 (−34%) | 159 | 4.78 | 0.58 | 102 (−82) / 145 | 5.23 | 105 / 6.33 | 5.52 |
| 180 | 22 | 26.5 | 167 (−9%) | 181 | 5.03 | 0.71 | 143 (−40) / 161, 14 grazes | 5.88 | 127 / 6.40 | 5.50 |
| 180 | 30 | 34.5 | 172 (−6%) [AI] | 191 | 5.75 | 0.71 | 109 (−75) / 157, 28 grazes | 6.92 | 149 / 6.62 | 5.75 |

What the table shows:
- **Clumsy drift:** the drop is −41 km/h on every 90° corner, matching the ≈ −40 target.
- **Optimal drift on 90°:** the drop is 4.2–7.4%, meeting the < 8% target. The only miss is R 9 m at 9.3%.
- **Optimal exits beat entry** thanks to the instant boost, and the optimal drift is 0.1–0.64 s faster than grip.
- **Tightest U-turns:** on the 180° R 9 m turn the deep "full drift" is marginally fastest (4.87 s against 4.95 s). That matches KRD practice for U-turns.

**Other entry speeds:**
- At 25–30 m/s, the optimal 90° drift is lossless (minimum speed equals entry speed).
- At 40 m/s with a booster running, drifting keeps 215 km/h through every 90° corner (2.55–3.33 s). Grip must drop to 146–189 km/h (3.63–3.92 s).
- 180° corners at R ≤ 16 m still need a scrub to 68–105 km/h, even with a booster running.

**16 m road (dossier standard), 34 m/s entry:**
- Grip takes 90° corners at 173/181/184/184/184 km/h (R 9–30 m), within 0.03–0.10 s of the optimal drift. On 16 m roads, drifting a 90° corner only pays through the gauge.
- 180° corners: optimal drift 4.45–5.73 s against grip 6.08–6.43 s.

### (c) Gauge and boosters
- **Single optimal 90° corner:** 0.31–0.42 gauge, i.e. **2.4–3.2 corners per booster** (target 2–3 corners).
- **Single hairpin:** 0.42–0.71 gauge (1.4–2.4 per booster). Entering boosted gives 0.56–0.61.
- **On 2 km AI stages** (speed mode), the booster is active for 8% of the time on D1, 17% D2, 31% D3, 27% D4 and 19% D5.
- **The gauge fatigue timer was required.** Without it, drift chopping reached 51–56% boost time and a 39.5 m/s average (near-permanent boosting).

### (d) Speed–time curves (displayed km/h every 0.25 s)
- **Booster from 184:** 216, 231, 237, 239 at 1.0 s, a plateau at 240 until 3.0 s, then 229/220/212/207/202. The decay time constant is about 1.1 s.
- **Booster from 151:** 185, 217, 232 at 0.75 s.
- **Instant boost from 151:** 163, 175 at 0.5 s, 178, reaching 180 at 1.25 s. Without the instant boost: 158, 164, 168, reaching 180 at 2.25 s. Net gain is +11 km/h at 0.5 s.
- **Start boost**, as distance and time gain at 5 s against no boost:

| Press offset | Tier | Gain at 5 s |
|---|---|---|
| 0 to +100 ms | PERFECT | +35 m, about +1.0 s (162 km/h at 1.0 s, 227 at 1.5 s) |
| −50 ms | GREAT | +21 m, 0.6 s |
| −150 ms | GOOD | +12 m, 0.35 s |
| −400 ms | FALSE | −7 m, −0.2 s |
| +400 ms | late (no boost) | −13 m |

### (e) Wall hits at 30 m/s (162 km/h)

| Impact angle | Speed right after | Stun | Speed 1 s later |
|---|---|---|---|
| 10° (grind) | −3 km/h | none | 174 |
| 30° | −47 km/h (−29%) | none | 156 |
| 60° | 39 km/h | 0.25 s, booster cancelled | 98 |
| 90° | 24 km/h | 0.25 s | 87 |

### (f) AI

The AI combines:
- **Pure pursuit** with lookahead L = 6 + 0.35v.
- **Outside approach bias** of 0.6 × the usable half-width.
- **Drift trigger:** heading change over the next 40 m > 25°, AND centreline curvature (with width allowance 0.6·hw) > 0.9 × the grip capability at the current speed, AND distance to the corner ≤ 0.5·v·clamp(25/R, 0.3, 1).
- **Drift control:** heading pursuit toward the tangent 0.45·v ahead, corrected by predicted lateral position. It eases steering off to "bite" when slip exceeds 0.42 or the kart heads for the outer wall. It holds or re-presses shift (double drift) when far behind.
- **Speed profile** from a yaw budget: v = 1.7·(R + 0.6·hw), or 1.0·(…) when more than 126° of turning lies within the next 90 m.

Results:
- **Isolated corners (40 cases per width):** 40/40 clean on 11, 12, 13, 14 and 16 m roads for entry speeds of 25–40 m/s. On 10 m roads, 2/40 grazed. On 9 m roads, 14–18/40 grazed, even with conservative gains.
- **Pace:** on 12 m roads the AI is +0–0.6 s slower than optimal on 90° corners and +0–0.9 s on 180°.
- **Random stages:** zero hard hits (> 45°) and 0–1.2 glancing hits per km.

## 5. Validated corner envelope

These figures are *path* radii. The steady states come from a held-speed drift test and from a circular track 8 m wide. Braking distance is from 34 m/s at 24 m/s².

| v in m/s (km/h) | Grip R_min | Drift R_min, no net speed loss | Drift R_min, loss ≤ 8 m/s² | Deep drift (55° slip, −20 to −27 m/s²) | Braking from 34 m/s |
|---|---|---|---|---|---|
| 15 (81) | 14.7 m | 11 m | 9 m | 7 m | 19.4 m |
| 20 (108) | 21 | 14 | 12 | 10 | 15.8 |
| 25 (135) | 29 | 21 | 15 | 12 | 11.1 |
| 30 (162) | 39.5 | 26 | 18 | 15 | 5.3 |
| 34 (184) | 50 | ~47 (−1 m/s²) | 24 | 17 | 0 |
| 44.4 (boost) | 86 | – | – | – | – |

- **Circle test:** the AI sustained, on grip / on drift: R 9 m 8.6 / 16.2 m/s, R 12 m 11.9 / 17.2, R 16 m 14.3 / 21.9, R 22 m 18.3 / 28.3. Drifting gives +44–89% speed below R 22 m.
- **The dossier's "2.5 rad/s → 12 m at 30 m/s" is not achievable.** 2.5 rad/s is only a transient at entry. The true limit at 30 m/s is 15 m (with a heavy loss) or 18 m (≤ 8 m/s² loss).

**Centreline radius vs path radius.** Track corners are defined by centreline radius Rc, which is not the path radius. With margin m = 1.5 m:
- R_L = (Ro − Ri·cos(Δ/2))/(1 − cos(Δ/2)), where Ro = Rc + W/2 − m and Ri = Rc − W/2 + m.
- For Δ = 180°, R_L = Ro.

So a 9 m centreline 90° corner on a 12 m road has R_L = 35 m. The same radius as a 180° hairpin has R_L = 13.5 m.

## 6. Corrected track limits and lap lengths

**Speed mode (KRD speed tracks are difficulty 2–5):**

| Difficulty | Road width | Max corner angle | Min centreline radius |
|---|---|---|---|
| D1 | 14–16 m | 90° | 30 m |
| D2 | 13–15 m | 120° | 22 m, no hairpins |
| D3 | 12–14 m | 150° | 16 m (12 m allowed for 90°) |
| D4 | 11–13 m | 180° | 12 m hairpin, 9 m for 90° |
| D5 | 11–12 m | 180° | 9 m hairpin (R_L ≥ 13.5 m) |

**Item mode (KRD item tracks are difficulty 1–3):** width 14–18 m (room for 8-kart packs and dodging). Minimum centreline radius 22/16/12 m for D1/D2/D3. Hairpins only on D3, with width ≥ 14 m.

**Road width rules:**
- Minimum 11 m in any corner. This is AI-validated; 9–10 m only on straights under 60 m long.
- Maximum 18 m, because on 16 m or wider roads, 90° corners are nearly flat-out in grip.
- The generator must check R_L and the yaw demand v/R_L at the design speed, not the centreline radius.

**Flying-lap pace (AI, roughly a good player).** Speed mode also shows the booster-active share of time.

| Difficulty | Speed mode s/km | Booster active | Item mode s/km |
|---|---|---|---|
| D1 | 28.6 | 8% | 29.4 |
| D2 | 27.9 | 17% | 29.5 |
| D3 | 26.7 | 31% | 29.3 |
| D4 | 28.9 | 27% | 31.0 |
| D5 | 32.8 | 19% | 34.1 |

Speed-mode averages are 34.5–37.5 m/s on D1–D4 and 30.5 m/s on D5. The dossier's "38 m/s average" is only reached on D3.

**Lap lengths against the 28–45 s lap target:**
- **Speed mode:** 1.1–1.5 km × **3 laps** (0.9–1.35 km on D5), giving a race of about 1:35–2:10. The dossier's 1.6–2.4 km × 2 would give 45–79 s laps. If 2 laps are kept, use 1.6–2.2 km and accept 45–64 s laps.
- **Item mode:** add about 7% for item chaos (PROPOSED), giving about 31–37 s/km. Use 0.9–1.4 km on D1–D3 and 0.8–1.2 km on D4/D5, × 3 laps.
- **Journey:** 4 km × 1 gives about 1:50–2:10. OK as is.

## 7. Determinism

**What the physics uses.** `step()` and `wall()` use only + − × ÷, comparisons, and Math.sqrt (6 call sites, all exactly rounded under IEEE rules). They use no sin, cos, atan2, exp, pow, hypot or `**`.
- **Heading** is a unit vector, rotated by a polynomial small-angle rotation. Its maximum error is 1.2e-10 for |a| ≤ 0.1 rad; the worst case per tick is 0.055 rad.
- **Decay factors** use 1/(1 + x + x²/2 + x³/6). They differ from exp by at most 0.175% relative, which only shifts the tuning slightly.
- **Angle thresholds** such as sin 6°, 15°, 45° and 55° are literal constants.
- **Replay check:** replaying a recorded 60 s input log gives an identical state hash. A 1e-15 heading perturbation stays below 1e-12 m of position error after 60 s, because the dynamics damp it out.

**Risks:**
1. **Threshold flips.** Drift exit, the wall bands, the instant-boost tick and the gauge ≥ 1 check can turn a 1-ulp difference into a macroscopic one. Server reconciliation must stay in place.
2. **The AI and the track generator use trig.** The AI must only run on the authority (the server, or the local client in single-player). The generator must either bake vertex data once (at build time or on the server) or use the same polynomial trig with range reduction.
3. **General JavaScript hazards:**
   - No Float32 in the sim state.
   - Fixed iteration order: karts by slot, items by id.
   - Sorts need a comparator with an explicit tie-break.
   - Random numbers from an integer PRNG using Math.imul.
   - Fixed dt only.
   - JavaScript forbids fused multiply-add contraction, which helps.
4. **Cross-engine CI still needed.** Run the same input log in Node 22/24, Chrome, Firefox and Safari (for example with Playwright) and compare hashes.

## 8. Dossier values that change

1. **Tick:** 120 Hz or 30 Hz becomes **60 Hz**. The 2 collision sub-steps become swept tests.
2. **Grip yaw law:** R_min at 34 m/s goes from 30 m to **50 m**. The grip lateral limit is 21–23 m/s², not 38.
3. **Acceleration law:** now (1 − (v/V)²).
4. **Drift yaw constants:** 1.1/0.9/0.5 become **0.6 (fading)/1.2/0.7**.
5. **Drift damping:** 1.2/4.5/2.0 become **5.5 neutral, 3.0 full-in (×0.85 with shift), 9.0 counter**. η goes from 0.55 to 0.80, and η is redefined so damping cannot create speed. The alternative 14/2.2 is rejected.
6. **Drift loss:** 1.6 becomes **0.8·v·sin²β**.
7. **Gauge:** the new sqrt slip term, v/V term and fatigue timer replace the 0.72 linear law.
8. **Instant boost:** 0.30 s window, ≥ 0.25 s drift with ≥ 8° slip, +9 m/s² for 0.5 s up to 1.05·V. This replaces both the 0.50 s and 0.30 s specs.
9. **Start boost:** PERFECT 0 to +100 ms 1.5 s, GREAT 1.0 s, GOOD 0.6 s, false start 0.3 s wheelspin.
10. **Walls:** e = 0.15. Bands 0.95→0.70 for 15–45°; 0.40 plus stun for > 45°. Grind friction goes from 6 to 10 m/s². The nose is re-aligned. The e = 0.25 variant is rejected.
11. **Drift kick:** 1.1 becomes 1.2 rad/s, and the speed loss is ×0.99 instead of ×0.985.
12. **Item scale:** as in section 2; turbo 52 m/s becomes 44.4 m/s.
13. **Road:** 16 m standard becomes 12 m (speed) and 14 m (item), with 11 m minimum in corners. Track limits are defined through R_L. Lap lengths are revised as in section 6.
14. **AI:** the aLat 18/26 speed profile is replaced by a yaw budget of 1.7 rad/s (1.0 for hairpins). A grip-capability test and a lead distance are added to the drift trigger.
15. **Unchanged:** V_GRIP 34, V_BOOST 44.4, booster 3.0 s, 2 slots, 55° slip cap, 6° drift-exit threshold, gravity 30 (not validated here).


## Key parameters

- **TICK_HZ**: 60 (dt=1/60 s); inputs sampled per tick, sent 30 pkt/s (2 new + 4 redundant ticks); snapshots 30 Hz; interp 100 ms; replay 6-15 ticks [proposed] — sim EXP=cpu: step 0.98 us/kart-tick; 60Hz room 4.9 ms CPU/s (~102 rooms/vCPU @50%); 120Hz ~51; rate-robust results 30/60/120 Hz
- **DISPLAY_KMH_PER_MS**: 5.4 (=3.6*1.5) [proposed] — dossier
- **V_REF=V_GRIP**: 34.0 m/s (183.6 km/h disp); archetypes Speed 34.4 / Balance 34.0 / Drift 33.6 [sourced] — dossier: KRD grip max 183.33 km/h (namu.wiki, not re-fetched: blocked)
- **V_BOOST**: 44.4 m/s (239.8 disp); 45.0/44.4/43.8 [sourced] — dossier: KRD 239.54 km/h
- **ACCEL**: a = A0*(1-(u/Vt)^2), A0 = 18 m/s^2 (16.5/18/19.5); 0-100 km/h disp 1.17 s; 0-97% 3.95 s [proposed] — sim EXP=a
- **OVERSPEED_DECAY**: 0.9 1/s [proposed] — dossier C, kept
- **COAST/BRAKE**: coast -2.5 m/s^2; brake -24 m/s^2 (grip), -14 m/s^2 (drift) [proposed] — design; RLBot braking 35, coast 5.25 for reference
- **BOOSTER**: T=3.0 s (3.1/3.0/2.9); a=min(25, 4*(44.4-u)); chain if remaining <0.25 s; 2 slots [sourced] — KartSpec.cs NormalBoosterTime 2900-3000 ms, SpeedSlotCapacity 2 (yanygm/Launcher_V2); accel law proposed
- **ITEM_BOOSTER / TEAM_BOOSTER**: item turbo = booster 44.4 m/s x 3.0 s; team booster 4.5 s [sourced] — KartSpec.cs ItemBoosterTime 3000, TeamBoosterTime 4350-4500
- **START_BOOST**: press tick vs GO @60Hz: PERFECT [0,+6] 1.5 s; GREAT [-6,-1]U[7,12] 1.0 s; GOOD [-12,-7]U[13,21] 0.6 s; FALSE (<-12) 0.3 s wheelspin (30% accel); item x0.67; a<=30 m/s^2 [proposed] — KartSpec StartBoosterTimeSpeed 1500 / Item 1000 ms; KartDocs 'press slightly after GO'; sim EXP=start: PERFECT +1.0 s @5 s
- **INSTANT_BOOST**: window 0.30 s after drift >=0.25 s with peak slip >=8 deg; throttle press edge; +9 m/s^2 for 0.5 s capped at 1.05*V_GRIP (35.7 m/s); ignored while boosting [proposed] — KartDocs (timed forward press after drift; worse during booster); sim EXP=d: +11 km/h at 0.5 s
- **GRIP_YAW**: r* = steer*1.55*v/(v+4)/(1+(v/33.5)^2) rad/s (Y_G 1.50/1.55/1.60); K_yaw 12 1/s; full-steer R: 9.8 m@10, 29@25, 39.5@30, 49.8@34, 86@44.4 [proposed] — sim EXP=genv/circle
- **GRIP_LATERAL**: k_lat 18 1/s, eta 0.10 (fraction of scrubbed speed retained) [proposed] — dossier C (18) kept; eta redefined
- **DRIFT_ENTRY**: shift held, |steer|>=0.3, u>=10 m/s, lockout 0.10 s; kick +1.2 rad/s, +4 deg heading, v*0.99 [proposed] — dossier C modified
- **DOUBLE_DRIFT**: shift re-press after >=0.15 s: +0.8 rad/s, +3 deg, v*0.99 [proposed] — KartDocs double drift (U-turns)
- **DRIFT_YAW_TARGET**: r* = dir*(0.6/(1+t/0.6) + 1.2*s_in + 0.7*shift); K_yaw 6 1/s; max ~2.5 at entry, ~2.0 sustained [proposed] — sim EXP=dss
- **DRIFT_LATERAL**: k_lat neutral 5.5 (5.2/5.5/5.9); full-in 3.0 (2.8/3.0/3.3); counter 9.0; x0.85 while shift held; eta 0.80 [proposed] — sim EXP=b (clumsy -41 km/h, optimal -4..-9%)
- **DRIFT_DRAG**: dv/dt = -0.8*v*sin^2(beta) (0.85/0.8/0.75); drift accel cap 5 m/s^2; beta max 55 deg [proposed] — sim EXP=b sweep of cBeta 0.5-1.6
- **DRIFT_EXIT**: sin(beta) < sin 6 deg after >=0.12 s, or u < 5 m/s [proposed] — dossier C kept
- **GAUGE**: dG/dt = 0.70*sqrt(min(sinB/0.5,1))*(v/V_G)/(1+T_f/1.5); T_f +1/s drifting, -1/s otherwise; no gain in wall contact; 1.0 = 1 booster; g0 0.64/0.70/0.77 [proposed] — sim: 2.4-3.2 optimal 90-deg corners per booster; stage boost time 8-31%
- **WALLS**: e=0.15; <15 deg grind (normal removed, 10 m/s^2, nose parallel); 15-45 deg tangent x0.95->0.70, drift cancel, gauge x0.5, instant cancel; >45 deg tangent x0.40 + 0.25 s stun + booster cancel + nose realigned [proposed] — sim EXP=e: 30 m/s hits lose 3/47/123/138 km/h at 10/30/60/90 deg; Kinoko wall factor ~(1-sin)*0.4-0.7 for reference
- **GRAVITY**: 30 m/s^2 [proposed] — dossier C; not validated (2D sim)
- **ITEM_SPEED_SCALE**: multipliers vs V_REF 34: tether 1.20 (40.8 m/s), missile 1.9 (64.6 m/s), UFO slow 0.60 (20.4 m/s); item mode = same kart, gauge off [proposed] — reconciliation of item report (Vmax 40) with speed scale
- **CORNER_ENVELOPE_GRIP**: R_min(v): 14.7 m@15, 21@20, 29@25, 39.5@30, 50@34, 86@44.4 [proposed] — sim EXP=genv + circle (AI sustained 8.6/11.9/14.3/18.3/22.6/27.7/33.3 m/s at R 9/12/16/22/30/40/60)
- **CORNER_ENVELOPE_DRIFT**: R_min(v) sustainable: 11 m@15, 14@20, 21@25, 26@30, ~47@34 (-1 m/s^2); loss<=8 m/s^2: 9/12/15/18/24 m; deep (55 deg, -20..-27 m/s^2): 7/10/12/15/17 m [proposed] — sim EXP=dss
- **RACING_LINE_RADIUS**: R_L=(Ro-Ri*cos(D/2))/(1-cos(D/2)), Ro=Rc+W/2-1.5, Ri=Rc-W/2+1.5; D>=180: R_L=Ro [proposed] — geometry; e.g. 90deg Rc9 W12 -> 35.2 m; 180deg Rc9 W12 -> 13.5 m
- **ROAD_WIDTH**: speed standard 12 m, item 14 m; min 11 m in corners (AI clean 40/40; 10 m 2/40, 9 m 14-18/40 grazes); max 18 m [proposed] — sim EXP=f widths 9-16 m
- **TRACK_LIMITS_SPEED**: D1 W14-16 D<=90 Rc>=30; D2 W13-15 D<=120 Rc>=22; D3 W12-14 D<=150 Rc>=16 (90-deg >=12); D4 W11-13 D<=180 hairpin Rc>=12 (90-deg >=9); D5 W11-12 hairpin Rc>=9 (R_L>=13.5) [proposed] — sim EXP=b/f; KRD speed tracks are difficulty 2-5 (kart.cafe)
- **TRACK_LIMITS_ITEM**: D1-D3 only; W14-18; Rc>=22/16/12; hairpins only D3 with W>=14 [proposed] — KRD item tracks difficulty 1-3 (kart.cafe tracks.json)
- **LAP_PACE**: flying-lap s/km speed: D1 28.6, D2 27.9, D3 26.7, D4 28.9, D5 32.8; item: 29.4, 29.5, 29.3, 31.0, 34.1 (+~7% item chaos proposed) [proposed] — sim EXP=lap (6 x 2 km random stages per profile)
- **LAP_LENGTH**: speed 1.1-1.5 km x 3 laps (D5 0.9-1.35); item 0.9-1.4 km (D1-D3), 0.8-1.2 km (D4-D5) x 3 laps; journey 4 km x 1 [proposed] — lap-time target 28-45 s/lap, race 1:25-2:10
- **AI**: pursuit L=6+0.35v; approach bias 0.6*usable hw to outside; drift trigger dPsi(40 m)>25 deg AND curvature/(1+0.6hw*curv) > 0.9*grip capability AND dist<=0.5*v*clamp(25/R,0.3,1); speed v=1.7*(R+0.6hw) (1.0 if >126 deg within 90 m), brake 0.8*aBrake; drift: heading pursuit t=0.45 s, bite when slip>0.42 or heading for outer wall, double drift if >0.8 rad behind [proposed] — sim EXP=f: 40/40 clean on W 11-16 m at 25-40 m/s
- **DETERMINISM**: step uses only + - * / sqrt, abs/min/max; heading as unit vector with 5th-order rotation + renormalise (err 1.2e-10); decay 1/(1+x+x^2/2+x^3/6) (<=0.175% vs exp); no Math.sin/cos/atan2/exp/pow/hypot/** [sourced] — ECMA-262 spec.html (implementation-approximated vs exact sqrt); V8 ieee754.cc (fdlibm -> glibc flag -> LLVM libc)

## Open questions

- KRD's real instant-boost window, booster duration and drift-gauge formula could not be verified: namu.wiki, kartdrift.nexon.com, inven, fandom and reddit are blocked by the egress proxy and the WebSearch budget was exhausted. The KRD values used are classic KartSpec.cs data plus the dossier's 183.33/239.54 km/h.
- The simulator is 2D. Gravity, jumps, ramps, kart-kart collisions, draft and items (missile homing, tether, UFO) are not simulated. The item multipliers are a scale reconciliation, not validated behaviour.
- The AI grazes walls on roads narrower than 11 m (14-18 of 40 cases at 9 m) and makes 0-1.2 glancing contacts per km on random S-bend stages. A precomputed racing line or per-corner offline drift plans would make it robust. AI decision cost (~10 us per kart-tick) needs caching or running at 30 Hz.
- Cross-engine bit-exactness (Chrome/Firefox/Safari against Node 22/24) is argued from the spec and the V8 source but was not executed. A Playwright hash-comparison CI job is recommended.
- Should speed mode be 3 laps of 1.1-1.5 km (meets the 28-45 s lap target) or 2 laps of 1.6-2.2 km (45-64 s laps)? This is a product decision.
- Start-boost PERFECT gives about +1.0 s over no boost at 5 s. This may be too decisive for 8-player races; lower the start-boost acceleration cap (aStartMax) or the 1.5 s duration if so.
- The optimal 90-degree drift at the tightest corner (Rc 9 m, 12 m road, 34 m/s) drops 9.3%, slightly above the <8% target. Either accept it for D5, or keep 90-degree corners at Rc >= 12 m.
- The sim source lives in the plan file (plan-mode restriction) and still has to be saved as scratchpad/sim.ts and ported into shared/sim/step.ts. The step() allocates small arrays/objects per call (rotH, query results); remove these for production.

## Sources

- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/basic/startbooster.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/basic/combobooster.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/basic/drift.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/basic/grip.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/speed/tech/optimize.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/speed/tech/short.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/speed/tech/long.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/speed/tech/full.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/speed/tech/double.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/speed/tech/cutting.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/speed/tech/draft.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/speed/tech/combocancel.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/tuning/speed.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/tuning/intro.mdx
- https://raw.githubusercontent.com/whotookzakum/kart.cafe/main/src/lib/data/tracks.json
- https://raw.githubusercontent.com/whotookzakum/kart.cafe/main/src/lib/data/karts.json
- https://github.com/yanygm/Launcher_V2 (KartRider.Data/KartSpec/KartSpec.cs, KartRider.Data/ExcData/SpeedType.cs; local copies in scratchpad)
- https://raw.githubusercontent.com/vabold/Kinoko/main/README.md
- https://raw.githubusercontent.com/vabold/Kinoko/main/source/game/kart/KartMove.cc
- https://raw.githubusercontent.com/vabold/Kinoko/main/source/game/kart/KartBoost.cc
- https://raw.githubusercontent.com/vabold/Kinoko/main/source/game/kart/KartState.cc
- https://raw.githubusercontent.com/vabold/Kinoko/main/source/game/kart/KartCollide.cc
- https://raw.githubusercontent.com/wiki/RLBot/RLBot/Useful-Game-Values.md
- https://raw.githubusercontent.com/v8/v8/main/src/base/ieee754.cc
- https://raw.githubusercontent.com/v8/v8/main/src/base/ieee754.h
- https://raw.githubusercontent.com/nodejs/node/v22.x/deps/v8/src/base/ieee754.cc
- https://raw.githubusercontent.com/nodejs/node/v22.x/deps/v8/src/base/ieee754.h
- https://raw.githubusercontent.com/nodejs/node/v24.x/deps/v8/src/base/ieee754.cc
- https://raw.githubusercontent.com/tc39/ecma262/main/spec.html
- GitHub code search: repositories 'kartrider drift', code '"DriftEscapeForce" "CornerDrawFactor"', code '"순간 부스터" 카트라이더'
