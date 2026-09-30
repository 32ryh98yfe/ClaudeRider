# KartRider: Drift — Driving Mechanics & Kart Handling (implementation research for "ClaudeRider")

## 0. Research caveats (read first)

- **How I researched it:** WebFetch was refused by the egress proxy for every domain I tried: namu.wiki and its mirrors, kartdrift.nexon.com, guide.nexon.com, forum.nexon.com, dcinside, fandom, steamcommunity, reddit, wikipedia and ldplayer. Everything below therefore comes from **search-engine result snippets** of those pages, across about 60 searches in Korean and English. Where a snippet gave a number, I record it with its source. Any value that could not be found is marked **PROPOSED**, with the design reasoning.
- **Service status:** KartRider: Drift's global, console and mobile service ended on 2025-02-27. The last KR/TW PC service ended on **2025-10-16**, and the developer (Nitro Studio) filed for bankruptcy on 2025-10-21 (Asiae / Wikipedia snippets). The game can no longer be checked live, so community wikis and patch notes are the only record.
- **Separating mechanics from IP:** we copy *mechanics and feel* only. Terms like "drift", "boost", "instant boost" and "draft" are generic. Kart, character and track names, UI art and the "RISE"/"A2" branding must not be reused.

---

## 1. Controls

### 1.1 PC keyboard (sourced unless marked)
| Action | KRD default | Source / note |
|---|---|---|
| Accelerate | ↑ | forum/guide snippets. Mobile uses auto-accelerate by default. |
| Brake / reverse | ↓ | same |
| Steer | ← / → | same |
| Drift | **Shift (left or right)**, pressed *with* a direction key | GameSpew, Nexon guide |
| Use item (item mode) / fire booster (speed mode) | **Ctrl** | Classic KartRider uses "arrow keys + Ctrl + Alt". KRD kept Ctrl. |
| Swap item order (2 item slots) | **Left Alt** | namu snippet: with 2 items held, "좌측 Alt 키로 먼저 사용할 아이템을 정할 수 있습니다" |
| Reset / respawn | **R** | namu snippet: after R you ignore *player* collisions, but active boosts (and item hits) are cut |
| BGM / SFX toggle | F7 / F8 | KartRider Rush+ guide. The same family convention; treat as optional. |
| Rebinding | Settings → Controls | official guide |
| Rear view, Esc | Not found in any snippet. Esc = pause menu is universal. | **PROPOSED:** X (hold) = rear view, Esc = pause |

**Speed-mode auto-fire option (sourced):** "스피드전 부스터 자동 사용" means that holding the booster key fires each booster as soon as one is available. Players nicknamed it "합법 노딜".

### 1.2 Controller (sourced partially)
- **Xbox layout:** RT accelerates and the left stick steers. Drift is **X or RB**. **A** uses an item.
- **PlayStation layout:** drift is Square or R1, and X uses an item.
- The game shows a "Button Guide" menu, and plugging in a pad switches the UI to gamepad mode.
- **PROPOSED Gamepad-API standard mapping for ClaudeRider:**
  - `buttons[7]` RT = accelerate (analog), `buttons[6]` LT = brake/reverse, `axes[0]` = steer (deadzone 0.15)
  - `buttons[2]` X or `buttons[5]` RB = drift
  - `buttons[0]` A = item/boost, `buttons[1]` B = swap items
  - `buttons[4]` LB = rear view, `buttons[3]` Y = reset, `buttons[9]` Start = pause

### 1.3 Browser-specific pitfalls (PROPOSED; important)
- **Ctrl+W / Ctrl+T / Ctrl+N** cannot be blocked with preventDefault in normal tabs, and players hold Ctrl while steering. Two fixes:
  - Use the Keyboard Lock API (`navigator.keyboard.lock()`) in fullscreen on Chromium.
  - Ship **Space** as an equal default for item/boost.
- **Alt keyup** opens the menu bar in Windows browsers, so call preventDefault on both keydown and keyup of Alt. Offer **E** as the alternate swap key.
- **Windows Sticky Keys** opens its dialog after five Shift presses, and tap-drifting will trigger it. Offer an alternate drift key (for example **C** or Space-as-drift) and show a first-run tip.
- Use `KeyboardEvent.code`, not `key`, so bindings stay layout-independent. Also accept WASD.

---

## 2. Drift (드리프트) — observed behaviour

### 2.1 Core rules (sourced)
1. **Entry:** press drift while steering into the corner. Sparks and skid marks show the drift.
   - A *light tap* gives a **short drift** (숏 드리프트): a small re-aim, or a way to top off the gauge.
   - *Holding* gives a **full drift**.
2. **Releasing Shift does not end the drift** (StrategyWiki, classic KR). You leave a drift by **counter-steering** with the opposite direction key.
   - The counter-key needs about **0.3–0.4 s** to finish ending a drift (Nexon community snippet).
   - The quicker "release drift + press counter" happens, the less speed you lose.
3. **Drift upkeep threshold:** the stat 드리프트 끌기 유지력 is officially described as "reduces the minimum angle needed to keep the drift going". So the game ends a drift once slip angle falls below a threshold angle.
   - A higher stat makes drifts last longer, but makes them harder to break.
4. **Speed cost:** a badly exited drift can lose about **40 km/h** (display units), per a dcinside analysis. Keeping "탄력" (momentum) is what separates skilled players.
   - A kart with about 5 km/h less cornering loss is worth about 1 point of drift-acceleration stat.
5. **Optimized drift** (최적화 드리프트) is called "the most core technique".
   - It is drifting so shallowly that the skid marks don't overlap: tap drift lightly, then counter immediately.
   - Almost every advanced technique builds on it.
6. **Boosted drift:** firing a boost just before a drift gives a *wider, longer, faster* drift that fills the gauge far more (naguide). This is why boost-then-drift chaining is the meta.

### 2.2 Technique glossary (sourced definitions → implementation hooks)
| Technique | What it is | Hook in our sim |
|---|---|---|
| 숏 드리프트 short drift | Tap drift: small heading change and a small gauge top-off | Drift lasting under the full-drift threshold. Gives no instant-boost window. |
| 끌기 / 톡톡이 drag drift | Enter with Shift, then tap direction and opposite direction about **0.5 s** apart, dragging the drift along at a shallow angle and gaining speed. "Tap tok" in EN wiki. | While drifting, slip angle stays just above the exit threshold. Lateral→forward momentum transfer is high. |
| 드리프트 자동 끌기 auto-drag | Originally a hero-grade tuning option, later a setting. Holding only forward during a drift turns it into a drag drift automatically. | Assist flag: the sim auto-pulses inward yaw. |
| 커팅 cutting (EN "Swift Cut", renamed "Slice Cut" in S2) | Right after a drift, drift the *opposite* way to snap the kart straight. Cuts drift deceleration and matters more at higher speed. | Exit path: counter-steer + drift tap cuts slip angle sharply. |
| 숏커팅 / 뉴커팅 | A very short cut, used to farm gauge | Same path, with small magnitude |
| 탄력 드리프트 / 반대키 탄력 | Throw a strong opposite drift mid-drift, for example in S-bends. Speed *rises* instead of dropping. | Direction reversal inside the drift state, with a momentum bonus |
| 더블 드리프트 (투드립) | A second drift press during or right after a drift. Also used after landing to keep momentum. | Re-entry allowed within 0.15 s of exit (PROPOSED) |
| 연타 드리프트 | Repeated short drifts. The fastest way to fill the gauge, because long drags give diminishing charge. At about 90% gauge, two drifts in one corner earn 2 boosters. | Charge rate decays with drift duration |
| 역드리프트 / 역드 | Drifting *against* the corner direction to block or hit a pursuer. Called a "terror" technique. | Emerges naturally from the physics |
| Straight-line tricks | Tiny zig-zag drifts on straights farm gauge. Steering micro-taps (5–7 per second) or wiggling left and right raises top speed by **1–2 km/h**. | PROPOSED: do **not** reward wiggling (it is an exploit); at most +0.5%. |

### 2.3 Instant boost (순간 부스터, "순부") — sourced
- Only available after a **full drift** plus counter-steer.
- When the kart straightens, the player has **0.5 s** to *release and re-press* accelerate (GameSpew, Steam, naguide; the KR community describes the same input).
- The UI shows a hint icon when it is available (official patch note). "Auto-Instant Boost" assists exist separately for item mode and speed mode.
- In item mode an instant boost is also possible when escaping a water trap or after being struck.
- The A2 engine era added a "순간 부스터 강화" tuning option. Almost every build maxed it at 10, which created the "순부 meta" (instant boost after every drift). A later patch toned down its acceleration gain.
- Per Nexon SEA notes, the boost gauge also charges when a start boost or instant boost is used.

### 2.4 Start boost (스타트/출발 부스터) — sourced
- The countdown goes 3-2-1-GO. Press accelerate as **GO** appears.
- KRD made the window more lenient than the PC original: pressing *just after* GO still works.
- The result has **3 acceleration tiers**. The perfect tier makes GO glow blue and the character smile.
- Community consensus is "later is better", meaning the best timing sits at or slightly after GO.
- The stat 출발 부스터 강화 increases start-boost duration and acceleration. It was buffed later.

---

## 3. Boost gauge, boosters, draft, team boost

### 3.1 Sourced facts
- The gauge fills from drifting. The 부스터 충전량 stat raises drift charge.
- Speed raises charge *indirectly*: namu says charge can't be raised directly, but raising speed and boost acceleration raises it.
- Long drags give diminishing charge.
- The gauge **does not fill in the air**.
- Mobile gives the two slots separate buttons, and item mode holds **2 items**.
- Speed mode shows boosters in the same two-slot HUD. Two boosters in one corner is a known play, which is consistent with a 2-booster cap.
- **Wall hit while drifting:** with 0 points in "wall-collision gauge protection" the whole gauge is lost. Each point keeps **10%**, and the max keeps everything. Starter karts come with 5 points in it.
- **Draft (드래프트):** follow close behind a kart (teammate or enemy) for a while. A wind effect and sound play, then there is a brief extra acceleration. It is easy to trigger and is what makes overtakes happen in KR racing.
  - It has a tuning stat, 드래프트 가속. A RISE-era change cut base draft acceleration, which a maxed stat restores.
  - English guides say "a few seconds" of following are needed.
- **Tow/catch-up (견인 가속):** triggers beyond a set distance behind 1st place and scales with distance. A 2025-04 physics patch gave it a wider left/right steering range.
- **Team speed:**
  - Teammates' drift charge also fills a **shared team gauge** by the same amount, and only drifting fills it.
  - Required amount = (single-booster requirement) × **2** × (team size).
  - When full, every teammate's red boosters turn into **blue team boosters**, which last longer.
  - Boosters can't be fired during the brief conversion delay ("딜"). Patches made that delay very short.
- **Infinite-boost mode** used the same system with a faster auto-charge that keeps charging while boosting, plus extra charge from start boosts, instant boosts and drafting.

### 3.2 Speeds (sourced, display units)
- **Base boost top speed: 239.54 km/h. Base grip top speed: 183.33 km/h**, a gap of about 56 km/h (dcinside "기어로 최고 속도 구하기", gear era).
- Measured top-speed gain per gear:
  - Acceleration gear: **+1.17 km/h**
  - Boost-speed gear: **+0.78 km/h**
  - Boost-duration gear: **+2.07 km/h** (a longer boost lets speed climb higher)
- Speed mode is boost-on most of the time, so boost top speed is the metric players compare.
- The ~163 km/h cruise the task mentions fits grip speed after drift losses.
- Boost *durations* in seconds were never found. The community says they are hidden client values, and only that the "base booster duration is very short".

---

## 4. Kart stats, types, grades (sourced)

**Per-kart capped stats.** Four stats have per-kart maximums between **4 and 8 levels**:
- 부스터 가속: boost top speed and boost acceleration
- 드리프트 가속: forward acceleration while drifting; also more control when breaking a drift
- 부스터 시간: boost duration; does *not* apply to start, instant, item-mode or team boosts
- 부스터 충전량: gauge charge from drifts

**Shared-cap tuning options** (same maximum on every kart, from the RISE update, 2024-02-15):
- 드리프트 끌기 유지력: lowers the minimum angle needed to keep a drift
- 벽 충돌 시 부스터 게이지 보호: 10% of the gauge kept per point
- 출발 부스터 강화
- 드래프트 가속
- 드리프트 자동 끌기 (on/off; later moved to Settings)
- The A2 era added 순간 부스터 강화

**Other rules:**
- RISE removed the Speed and Acceleration upgrade stats, and made cornering deceleration and similar physical values differ per kart body.
- **Types:** 속도형 (speed), 밸런스형 (balance), 드리프트형 (drift), classified by the gap between the boost-acceleration and drift-acceleration maximums.
- **Grades:** 일반 → 고급 → 희귀 → 영웅 → 전설, 5 in all. Higher grades get more gears.
- Proficiency adds up to 4 bonus gears.
- **A2 engine:** split speed karts (higher boost and drift acceleration) from item karts. Item karts have driving stats fixed at **66** and get item-mode skills.
  - A2 karts have a fixed grade and receive bonus gears only.
  - A2 improved start boost and instant boost.
- Most kart stats apply only in speed mode.

---

## 5. Collisions, air, respawn, assists (sourced)

- **Walls:** the main documented penalty is losing the gauge (above) plus the speed scrub. Keeping away from the wall matters because clipping it ends the drift.
- **Air:**
  - No steering and no gauge charge while airborne.
  - Missing the drift input in the air often ends in a wall or a fall.
  - Three landing styles: direction-only (fastest, but little gauge and a wide line), drift after landing, or drift held through landing (slowest, but most gauge).
  - The 2025-04 physics patch reduced landing deceleration and fixed the "sticky drift" drag.
  - The "Landing Spot" assist shows where the kart will touch down.
- **Respawn:** the kart respawns automatically after leaving the track. R resets manually; players become non-colliding and the boost is cancelled.
- **Assists** (official guides):
  - Auto-Steering keeps the kart centred when there is no input, and is disabled in Time Attack.
  - Auto-Accelerate
  - Drift Assist can be turned off after the B1 license.
  - Corner Guardrails and Edge Guardrails
  - **Auto-Instant Boost (Item mode):** fires on being struck or after drifting.
  - **Auto-Instant Boost (Speed mode):** fires after drifting.
  - Display guides: track guideline, recommended drift zones, instant-boost hint, item hint, landing spot.
- **The "Auto" HUD icon next to the item slots:** no snippet names it explicitly. The most likely meaning is the **Auto-Instant Boost assist indicator**, since it is mode-specific and tied to getting hit, which is exactly what the item HUD tracks. A second candidate is the speed-mode *booster auto-use* (hold-to-fire) toggle. Treat this as UNCONFIRMED.
  - Implement an "AUTO" badge that lights up whenever an automation assist is active: auto-instant-boost, auto-fire boost or auto-drag.

---

## 6. PROPOSED arcade physics model for ClaudeRider

Design goals:
- KR feel: a slidey but precise drift that ends only through counter-steer or angle decay.
- The gauge rewards speed × slip, with diminishing returns on long drifts.
- Tiny timing windows: instant boost and start boost.
- Momentum: overspeed decays slowly after a boost.
- Walls punish head-on hits but allow grinding along them.
- One pure deterministic `step(state, input)` shared by client and server.

### 6.1 Units, scale, rates
- 1 unit = 1 m. Kart about 1.8 m long, collision sphere radius 0.9 m. Road width 14–22 m; tight corners 15–25 m radius.
- **Display speed** = v · 3.6 · **K_DISPLAY (1.5)**. So grip max 34 m/s shows 183.6 km/h, boost max 44.4 m/s shows 239.8 km/h (matching the sourced 183/240), and cruise 30 m/s shows 162 km/h (the observed ~163).
- **Fixed step:** DT = 1/120 s on both client and server, with an accumulator and render interpolation using slerp for rotation (Gaffer "Fix Your Timestep").
  - Networking: inputs are sent at 60 Hz (2 ticks per packet) and the server sends snapshots at 30 Hz.
  - The client predicts its own kart and reconciles against the server.
- **Track collision in spline space (recommended for procedural tracks):**
  - Keep a cached arc-length parameter s. Each tick, search locally for the nearest centre-line point. That gives the lateral offset x, ground height, banked normal N, and tangent T.
  - Walls sit at |x| > halfWidth(s) − r.
  - Shortcuts and branches get their own splines. Decorative geometry does not collide, or uses three-mesh-bvh raycasts only where needed.

### 6.2 Per-tick update order
1. **Input latch.** Record edges (drift down, accel up→down, item down) using `event.timeStamp` mapped to tick index, and keep them buffered for 6 ticks (50 ms).
2. **Ground probe.** Compute s, x, height, N and surface type. Grounded = distance above ground < 0.35 m and vertical speed ≤ +2 m/s.
3. **Timers and state machine.** Countdown/start boost, drift entry/exit, instant-boost window, boost/draft/stun/ghost timers, respawn.
4. **Target speed V_t** = max of the active caps: grip (V_G), boost (V_B), instant boost, start boost, draft; multiplied by surface and catch-up factors.
5. **Longitudinal accel.**
   - Below the cap: a = A0·(1 − v_f/V_t).
   - Above the cap (after a boost): a = −C_OS·(v_f − V_t).
   - Also apply brake, coast drag and the drift-loss term (6.4).
6. **Yaw.** r ← r + (r* − r)·(1 − e^(−K·DT)), with r* from the grip or drift mode, then ψ += r·DT.
7. **Lateral grip.** In the kart frame (f, l): v_l′ = v_l·e^(−G·DT), then v_f += η·(|v_l| − |v_l′|) to transfer momentum.
8. **Gauge charge** (6.5).
9. **Integrate:** semi-implicit Euler, with velocity projected onto the ground plane plus slope gravity. The up vector slerps toward N at 12/s.
10. **Collisions.** Resolve walls first, then kart-kart with 2 iterations, then items.
11. **Air.** Gravity 30 m/s² (heavier than real for snappy jumps). No steering, no charge, drift frozen. Handle landing.
12. **Fall/OOB check** and respawn.
13. **Progress.** Checkpoints, laps, rank.
14. **Snapshot** the previous state for interpolation.

### 6.3 Grip mode
- **Yaw rate target:**
  - r* = steer · R0 · v/(v + V_HALF) · (1 − 0.35·v/V_B)
  - R0 = 1.8 rad/s, V_HALF = 6 m/s, K_YAW = 12 s⁻¹
  - At 30 m/s this gives about 1.15 rad/s (26 m radius), so tight corners *require* a drift.
- **Lateral grip:** G_GRIP = 18 s⁻¹, η = 0.1.
- **Engine:** A0 = 18 m/s², V_G = 34 m/s.
- **Drag and braking:** coast drag 0.25·v + 1.5 m/s²; brake 30 m/s²; reverse max 10 m/s.
- **Overspeed decay:** C_OS = 0.9 s⁻¹, so boost speed bleeds back to grip speed over about 2 s ("탄력").

### 6.4 Drift state machine (GRIP → DRIFT → EXIT → IB_WINDOW)

**ENTER when** the drift key edge (or drift held when steer is first pressed) occurs AND |steer| ≥ 0.3 AND v ≥ 10 m/s AND grounded.
- dir = sign(steer)
- Yaw kick: r += dir·1.1 rad/s, plus an instant heading nudge of dir·4°
- v_f *= 0.985
- Set t_drift = 0, peakβ = 0

**MAINTAIN:**
- Slip angle β = atan2(v_l, v_f), signed toward dir.
- Yaw target r* = dir·(R_D0 + R_D1·s_in + R_SH·shiftHeld):
  - R_D0 = 1.1 rad/s
  - R_D1 = 0.9, where s_in = +1 steering into the drift, 0 for none, −1 for counter-steer
  - R_SH = 0.5 while Shift is held (a deeper drift)
  - K_YAW_DRIFT = 5 s⁻¹
- Lateral grip G by input:
  - Neutral: G = 1.2 s⁻¹
  - Counter-steer: 4.5
  - Drag-tap pattern: 2.0
- Momentum transfer η_D = 0.55, scaled by the drift-acceleration stat to 0.45–0.65.
- Forward terms:
  - Drift acceleration a_DA = 5 m/s² along the heading
  - Drift loss a_L = C_DL·v·sin²β, with C_DL = 1.6 s⁻¹
  - Example: β = 25° at 30 m/s gives about −3.6 m/s² net, so a clumsy 1.5 s drift loses about 30–40 km/h displayed. This matches the sourced 40 km/h.
- Clamp |β| ≤ 55° by bleeding yaw.
- **Drag assist:** when |β| < β_exit + 4° and the player taps inward (or auto-drag is on with no steer input), apply r += dir·0.25 rad/s. At most one pulse per 0.25 s.

**EXIT when any of these happen:**
- (a) |β| < β_exit and t_drift > 0.12 s. β_exit = 6° base, down to 3° at max "drag upkeep" stat.
- (b) **Cut:** counter-steer plus a drift tap. β *= 0.4 instantly, heading moves toward velocity, v_f *= 0.99.
- (c) v < 6 m/s.
- (d) Wall impact.
- (e) **Reversal:** a strong opposite drift press. dir flips, and the kart gets a +2% v bonus if |β| was over 15°. This is the "탄력" reversal.
- Airborne does not exit: the drift freezes.

**Full vs short drift:** a drift is full when t_drift ≥ 0.35 s AND peakβ ≥ 10°. Only full drifts open the **instant-boost window** of 0.50 s (sourced).
- **Double drift:** allowed within 0.15 s after an exit.

### 6.5 Gauge
- dG/dt = K_CH · chargeStat · min(|sinβ|/sin30°, 1.25) · (v/V_G) · 1/(1 + t_drift/1.2)
- K_CH = 0.72 s⁻¹. A 1.0 s, 25° drift at 32 m/s gives about 0.42 of the gauge, so roughly 2–3 corners per booster, which fits "90% + two drifts = 2 boosters".
- Extra charge (proposed): drafting +0.05/s; instant boost +0.03 each; start boost +0.05.
- G ≥ 1 → G −= 1 and add a booster if slots < 2; otherwise G stays at 1.
- **Wall hit while drifting:** lose (1 − protection) of G, where protection defaults to 0.3. Stored boosters are never lost.

### 6.6 Boost family (PROPOSED numbers)
| Boost | Duration | Target cap | Accel |
|---|---|---|---|
| Gauge booster | 2.4 s base (2.1–2.8 by stat) | V_B = 44.4 m/s | 26 m/s² |
| Instant boost | 0.6 s | min(1.10·max(v, V_G), 0.95·V_B) | 30 m/s² |
| Start boost tier 1 / 2 / 3 | 0.8 / 1.2 / 1.6 s | 1.15 / 1.22 / 1.30 · V_G | 30 m/s² |
| Draft burst | 1.2 s | +10% of current cap (+3% if already boosting) | 20 m/s² |
| Team booster | 1.25× booster duration | V_B · 1.02 | 26 m/s² |

- **Firing during a boost** restarts the timer; speed does not stack.
- **Head-on wall hit** (θ > 45°) cancels the boost. A glancing hit keeps it.
- **Start-boost windows**, measured from the GO tick:
  - Tier 3: 0 to +0.12 s
  - Tier 2: −0.15 to 0 s, or +0.12 to +0.30 s
  - Tier 1: −0.40 to −0.15 s, or +0.30 to +0.50 s
  - Any other time: none
- **Draft trigger:**
  - Condition: 4–22 m behind a kart, within |x_local| < 2.2 m, and both karts faster than 20 m/s.
  - The meter fills in 1.0 s and drains at 2/s outside the cone.
  - Show wind streaks and a filtered-noise whoosh while it charges.
- **Team gauge:** size = 2 × team size. A burst converts every teammate's boosters after a 0.2 s delay.
- **Catch-up (tow):** beyond 150 m behind 1st, acceleration ×(1 + 0.1·min(1, (d − 150)/300)) and charge ×1.2. It applies to humans and AI alike, and is turned off in time trials.

### 6.7 Wall collision response
- Push out by the penetration depth along the wall normal n.
- Decompose velocity: v_n = v·n (negative means moving into the wall). Impact speed s = −v_n, and impact angle θ = asin(s/|v|).
- New normal speed v_n′ = e·s, with restitution e = 0.15.
- Tangential speed v_t′ = v_t·max(0, 1 − 0.35·s/|v_t|).
- **Severity bands:**
  - θ < 15° (벽 비비기, grinding): friction decel 6 m/s² while in contact, and the heading turns toward the tangent at 8/s.
  - 15°–45°: |v| *= lerp(0.92, 0.60).
  - Over 45°: |v| *= 0.40, 0.25 s stun (no throttle or steer), camera shake, and the boost cancels.
- Every wall hit ends the drift and applies the gauge rule from 6.5.
- **Kart-kart:** spheres with mass = weight stat (0.85–1.2), restitution 0.3, impulse along the contact normal. A front kart hit from behind gains a little speed. Ghosted karts are skipped.

### 6.8 Air and landing
- **Launch:** when a ramp or crest separates the kart, keep the velocity.
- **In the air:** yaw damping 3 s⁻¹, no steer or charge, drift frozen, pitch slerps to the velocity direction.
- **Landing penalty:** when vertical impact is over 6 m/s, v_f *= 1 − min(0.12, 0.01·(v_imp − 6)).
- **Landing Spot assist:** simulate the ballistic path 1.5 s ahead in 30 ms steps.

### 6.9 Respawn
- **Trigger:** y below killY, OR off-spline/no ground for more than 1.2 s, OR a manual R press (3 s cooldown).
- **Respawn:**
  - Fade out 0.4 s. Place the kart on the last passed checkpoint on the centre line, facing the tangent, at v = 0.
  - Ghost for 1.5 s (no kart collisions, sourced behaviour). The active boost is cancelled; stored boosters are kept.
  - Show the start-boost-style "go" prompt, with a 0.4 s instant-boost window on the first throttle press (PROPOSED; this lessens frustration).

### 6.10 Stats → constants mapping (PROPOSED, 1–10 scales)
| Stat | Range |
|---|---|
| Grip top speed | 32.5–35.5 m/s |
| Boost power | V_B 42.5–46 m/s; A_B 22–30 m/s² |
| Acceleration | A0 15–21 m/s² |
| Drift acceleration | η_D 0.45–0.65; a_DA 4–6 m/s² |
| Charge | ×0.9–1.15 |
| Boost duration | 2.1–2.8 s |
| Handling | R0 1.6–2.0 rad/s; R_D1 0.7–1.1 |
| Drag upkeep | β_exit 6°→3° |
| Wall protection | 0–100% |
| Weight | 0.85–1.2 |

- Offer three archetypes (Speed / Balance / Drift) mirroring KRD's classification.
- Keep every kart within ±2% on a reference lap to avoid pay-to-win.

---

## 7. Tuning targets and validation
- **Timing targets:**
  - A 90° corner at 30 m/s with an optimal drift loses under 8% speed.
  - A clumsy drift loses 20–25%.
  - Boost-chained drift laps average about 205–225 km/h displayed.
  - Pure grip laps average about 160–170 km/h.
- **Telemetry overlay** (dev key F3): β, r, v_f, v_l, G, active caps, instant-boost window bar, draft meter.
- **Replay determinism:** record inputs per tick and re-simulate them on the server and in CI to detect any divergence.


## Key parameters

- **PC controls (sourced core)**: Up=accelerate, Down=brake/reverse, Left/Right=steer, Shift(L or R)+direction=drift, Ctrl=use item / fire booster, Left Alt=swap item order, R=reset (ghost vs players, cancels boost); rebindable in Settings>Controls [sourced] — GameSpew how-to-drift; Nexon forum 조작키 guide; namu.wiki 카트라이더: 드리프트 snippets
- **Rear view / pause keys**: X (hold) = rear view, Esc = pause, Space = alt item/boost, C = alt drift, E = alt swap [proposed] — Not found; browser-safety reasoning (Ctrl+W, Alt menu, Sticky Keys)
- **Controller mapping**: RT accelerate, LT brake, L-stick steer, X or RB drift (Xbox) / Square or R1 (PS), A use item (Xbox) / X (PS); PROPOSED B swap, LB rear view, Y reset, Start pause [sourced] — GameSpew how-to-use-items / how-to-drift; arsnovo gamepad article
- **Instant boost window**: 0.50 s after a full drift + counter-steer; input = release and re-press accelerate [sourced] — GameSpew/Steam/naguide snippets
- **Counter-steer time to end drift**: ~0.3-0.4 s [sourced] — Nexon community (커팅 드리프트) snippet
- **Drag-drift (톡톡이) tap rhythm**: ~0.5 s between direction / opposite taps [sourced] — namu.wiki 카트라이더: 드리프트/주행 기술 snippet
- **Start boost**: Press accelerate at GO; lenient (just after GO still works); 3 tiers; perfect = blue GO + character smile; later is better [sourced] — namu.wiki snippet; GameSpew start-boost guide
- **Start boost windows (from GO tick)**: T3: 0..+0.12 s; T2: -0.15..0 or +0.12..+0.30 s; T1: -0.40..-0.15 or +0.30..+0.50 s; durations 0.8/1.2/1.6 s; caps 1.15/1.22/1.30 x V_grip [proposed] — Design reasoning from sourced 3-tier/lenient description
- **Boost top speed (display)**: 239.54 km/h base [sourced] — dcinside kartriderdrift 135828 (기어로 최고 속도 구하기)
- **Grip top speed (display)**: 183.33 km/h base [sourced] — dcinside kartriderdrift 135828 snippet
- **Top speed gain per gear**: accel gear +1.17 km/h, boost-speed gear +0.78 km/h, boost-duration gear +2.07 km/h [sourced] — dcinside kartriderdrift 135828 snippet
- **Poor drift exit speed loss**: ~40 km/h (display) [sourced] — dcinside kartriderdrift 185852 snippet
- **Wall-collision gauge protection**: 10% of gauge retained per point; 0 points = whole gauge lost on wall hit while drifting; starter karts have 5 points [sourced] — namu.wiki 카트바디 snippet; dcinside 78601 snippet
- **Team booster gauge requirement**: single-booster requirement x 2 x team size; filled only by drifting; converts red boosters to longer blue team boosters after a short delay [sourced] — namu.wiki 용어사전 / 카트라이더: 드리프트 snippets; fandom Speed mode
- **Item slots**: 2 (item mode); speed mode booster cap 2 [sourced] — GameSpew items; namu snippet (2 boosters in one corner). Speed-mode cap of 2 inferred
- **Kart per-body stats**: 부스터 가속, 드리프트 가속, 부스터 시간, 부스터 충전량 with per-kart max 4-8 levels; shared: 드리프트 끌기 유지력, 벽충돌 게이지 보호, 출발 부스터 강화, 드래프트 가속, 순간 부스터 강화 (A2) [sourced] — namu.wiki 카트바디 snippets; RISE news (thisisgame)
- **Kart grades / types**: 5 grades 일반/고급/희귀/영웅/전설; types speed/balance/drift; A2 item karts driving stats fixed at 66 [sourced] — kartdrift.nexon.com gameguide 2500051 snippet; namu snippets
- **Players per race**: 8 [sourced] — namu.wiki / Wikipedia snippets
- **Air rules**: no steering and no gauge charge in air; landing-spot assist exists [sourced] — namu.wiki 주행 기술 snippet; official Driver Assistance guide
- **Assist features**: Auto-Steering, Auto-Accelerate, Drift Assist (off after B1), Corner/Edge Guardrails, Auto-Instant Boost (Item: on hit or after drift; Speed: after drift), track guideline, drift zones, instant-boost hint, item hint, landing spot; speed-mode booster auto-fire when holding key [sourced] — forums.kartrider.nexon.net Game Guides part 4 & part 11 snippets; namu snippet (합법 노딜)
- **'Auto' HUD icon meaning**: Most likely Auto-Instant Boost assist indicator (alt: speed-mode boost auto-fire) [proposed] — Inference; not explicitly found
- **K_DISPLAY (display speed factor)**: 1.5 (km/h shown = m/s x 3.6 x 1.5) [proposed] — Chosen so 34 m/s shows 183.6 and 44.4 m/s shows 239.8 km/h
- **V_GRIP_MAX**: 34.0 m/s (32.5-35.5 by stat) [proposed] — Maps to sourced 183.33 km/h
- **V_BOOST_MAX**: 44.4 m/s (42.5-46 by stat) [proposed] — Maps to sourced 239.54 km/h
- **Fixed timestep**: DT = 1/120 s client & server; inputs 60 Hz; snapshots 30 Hz; render interpolation [proposed] — Gaffer on Games Fix Your Timestep
- **Engine accel**: a = A0 (1 - v/Vt), A0 = 18 m/s^2 (15-21); overspeed decay C_OS = 0.9 1/s [proposed] — Design reasoning
- **Grip yaw**: r* = steer*R0*v/(v+6)*(1-0.35 v/V_B), R0=1.8 rad/s, K_YAW=12 1/s, G_grip=18 1/s [proposed] — Design reasoning (tight corners require drift)
- **Drift entry**: |steer|>=0.3, v>=10 m/s, grounded; yaw kick 1.1 rad/s + 4 deg heading nudge; v*=0.985 [proposed] — Design reasoning
- **Drift yaw target**: r* = dir*(1.1 + 0.9*s_in + 0.5*shiftHeld) rad/s, K_YAW_DRIFT = 5 1/s, beta max 55 deg [proposed] — Design reasoning
- **Drift lateral grip**: neutral 1.2 1/s, counter-steer 4.5, drag-tap 2.0; momentum transfer eta 0.55 (0.45-0.65) [proposed] — Design reasoning
- **Drift speed loss**: a_loss = 1.6*v*sin^2(beta); drift accel a_DA = 5 m/s^2 (4-6) [proposed] — Tuned to reproduce sourced ~40 km/h loss for bad drifts
- **Drift exit angle**: beta_exit = 6 deg base -> 3 deg at max drag-upkeep stat; min drift time 0.12 s [proposed] — Based on sourced definition of 드리프트 끌기 유지력
- **Full drift threshold**: t_drift >= 0.35 s and peak beta >= 10 deg (only full drifts open instant-boost window) [proposed] — Sourced rule that instant boost needs a full drift
- **Gauge charge**: dG/dt = 0.72*charge*min(|sin b|/sin30,1.25)*(v/V_G)/(1+t_drift/1.2) [proposed] — Sourced: speed x slip based, diminishing on long drags
- **Booster duration**: 2.4 s base (2.1-2.8), accel 26 m/s^2, restart timer on re-fire, no stacking [proposed] — Not found (hidden values)
- **Instant boost effect**: 0.6 s, cap min(1.10*max(v,V_G), 0.95*V_B), accel 30 m/s^2, +0.03 gauge [proposed] — Design reasoning; SEA notes say instant boost charges gauge
- **Draft**: cone 4-22 m behind, |x|<2.2 m, both >20 m/s; fill 1.0 s; burst 1.2 s +10% cap; +0.05 gauge/s while drafting [proposed] — Sourced qualitative ('a few seconds', wind FX, brief accel)
- **Catch-up tow**: >150 m behind leader: accel x(1+0.1*min(1,(d-150)/300)), charge x1.2 [proposed] — Sourced existence of 견인 가속 (distance-based)
- **Wall response**: e=0.15, tangential mu=0.35; <15 deg grind 6 m/s^2 friction; 15-45 deg v*=0.92..0.60; >45 deg v*=0.40 + 0.25 s stun + boost cancel [proposed] — Design reasoning
- **Air/landing**: gravity 30 m/s^2; landing loss min(12%, 1%*(v_imp-6)) when vertical impact > 6 m/s [proposed] — Design reasoning; sourced 2025-04 landing-decel improvement
- **Respawn**: killY or >1.2 s off-track or R (3 s cooldown): 0.4 s fade, last checkpoint, 1.5 s ghost, cancel active boost, keep stored boosters [proposed] — Sourced R-behaviour (ghost, boost cut) + auto respawn

## Open questions

- Exact booster, instant-boost, start-boost and team-booster durations in seconds were never published (the community calls them hidden client values). The proposed values (2.4 s / 0.6 s / 0.8-1.6 s / 1.25x) need playtest tuning.
- The in-race 'Auto' icon next to the item slots was not named in any source I could reach. Most likely it is the Auto-Instant Boost assist indicator, but it could be the speed-mode booster auto-fire toggle.
- KRD's default rear-view key was not found. The proposal uses X (hold), keeping Ctrl/Alt/Shift free of browser conflicts.
- Whether speed mode hard-caps stored boosters at exactly 2 is inferred from the 2-slot HUD and the 'two boosters in one corner' play, not stated outright.
- Exact draft cone, charge time and bonus are unknown; sources only say 'a few seconds' of following and a brief acceleration.
- The numeric wall-collision speed penalty is undocumented; only the gauge-loss rule (10% kept per protection point) is sourced.
- Should ClaudeRider reproduce KR's quirk where micro-wiggling steering adds 1-2 km/h top speed? Recommendation: no, or at most +0.5%.
- Every direct page fetch was blocked by the egress proxy. If the harness can allow namu.wiki / kartdrift.nexon.com, reading the full 주행 기술 and 카트바디 pages would confirm the numbers taken from snippets.

## Sources

- https://namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8/%EC%A3%BC%ED%96%89%20%EA%B8%B0%EC%88%A0
- https://en.namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8/%EC%A3%BC%ED%96%89%20%EA%B8%B0%EC%88%A0
- https://namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8/%EC%B9%B4%ED%8A%B8%EB%B0%94%EB%94%94
- https://en.namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8/%EC%B9%B4%ED%8A%B8%EB%B0%94%EB%94%94
- https://namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8/%EC%9A%A9%EC%96%B4%EC%82%AC%EC%A0%84
- https://namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8
- https://namu.wiki/w/RISE(%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8)
- https://m.dcinside.com/board/kartriderdrift/135828
- https://m.dcinside.com/board/kartriderdrift/185852
- https://m.dcinside.com/board/kartriderdrift/78601
- https://gall.dcinside.com/mgallery/board/view/?id=kartriderdrift&no=212115
- https://forums.kartrider.nexon.net/discussion/960/game-guides-part-11-driver-assistance-features
- https://forums.kartrider.nexon.net/discussion/501/game-guides-4-gameplay-assistance-features
- https://www.gamespew.com/2023/02/how-to-perform-a-start-boost-in-kartrider-drift/
- https://www.gamespew.com/2023/02/how-to-drift-in-kartrider-drift/
- https://www.gamespew.com/2023/02/how-to-use-items-in-kartrider-drift/
- https://gamingonphone.com/guides/kartrider-drift-the-complete-drift-guide-and-tips/
- https://www.naguide.com/kartrider-drift-drifting-like-pro/
- https://commonsensegamer.com/kartrider-drift-complete-guide-to-drifting/
- https://steamcommunity.com/app/1194260/discussions/0/3200367934435913442/
- https://kartdrift.nexon.com/kartdrift/ko/news/update/view?threadId=2693477
- https://kartdrift.nexon.com/kartdrift/ko/news/update/view?threadId=2754748
- https://kartdrift.nexon.com/kartdrift/ko/guide/gameguide/view?threadId=2500051
- https://sea.nexon.com/kartdrift/en/guide/gameguide/view?threadId=2489996
- https://www.gameinsight.co.kr/news/articleView.html?idxno=25592
- https://www.thisisgame.com/webzine/nboard/263/?n=184733
- https://www.gamevu.co.kr/news/articleView.html?idxno=26166
- https://www.gamevu.co.kr/news/articleView.html?idxno=37319
- https://forum.nexon.com/kartrush/board_view?board=626&thread=89892
- http://www.arsnovo.co.kr/bbs/board.php?bo_table=03_02&wr_id=47
- https://kartrider-drift.fandom.com/wiki/Speed_mode
- https://kartrider-drift.fandom.com/wiki/Booster
- https://www.highgroundgaming.com/kartrider-drift-beginner-guide-tips-tricks/
- https://strategywiki.org/wiki/Crazyracing_Kartrider/Controls
- https://www.asiae.co.kr/en/article/2025061615185375845
- https://en.wikipedia.org/wiki/KartRider:_Drift
- https://www.youtube.com/watch?v=EuAPFfTXTsk
- https://gafferongames.com/post/fix_your_timestep/
