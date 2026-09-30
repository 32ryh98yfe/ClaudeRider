## ClaudeRider physics calibration: classic KartRider and KartRider: Drift constants

### 0. Summary

- **Main find.** The GitHub repo `Nezuko-Roblox/KartGame_Engine` contains `sources/paopao/`, a decompiled Unity mobile port of KartRider (跑跑卡丁车, "paopao"). Its physics loop is complete: forces, drag, drift, gauge, instant boost, wall response, item effects and AI. It reads the same `LevelParam`/`BodyParam` XML schema as the PC client. Its built-in defaults (F=2000, drag=0.74, escape=2500, gauge=4000, corner=0.2, booster times 3000/4500/4000) match the PC **Rookie** channel in `SpeedType.cs` exactly. That makes it a reliable guide to how the PC fields are used.
- **Drag law is confirmed algebraically.** `PhysicSpec.Load` (lines 100–107) solves `DragFactor·v² + AirFriction·v = ForwardAccelForce` for terminal speed, then rescales drag when mass changes. So the resistance is `F_res = −AirFriction·v − DragFactor·|v|·v`.
- **KartRider: Drift (KRD) uses the same model.** The KRD SDK dump (`Evestir/Nothing`) shows `UKartBodyParam` and `UKartChannelParam` with the same field names. Examples: `dragFactor`, `forwardAccelForce`, `driftEscapeForce`, `cornerDrawFactor`, `driftMaxGauge`, `transAccelFactor`, `normalBoosterTime`, `teamBoosterTime`, `startBoosterTimeSpeed`, `draftMulAccelFactor`, `draftTick`, `driftBoostMulAccelFactor`, `driftBoostTick`, `driftGaugePreservePercent`. Classic values are therefore the best prior for KRD.
- **One fully resolved real spec was found.** `yanygm/Launcher_GF_3229` `RiderSchool.cs` lines 14–86 writes the complete kart spec the client receives for the rider-school kart at standard speed. Every value equals the Launcher_V2 `SpeedType.Default()` value plus the `KartSpec.cs` delta (for example 0.75−0.083=0.667 and 2150+154=2304). This is the calibration anchor.
- **Web search was not available.** The WebSearch budget for this session was already used up (200/200), so Korean and English web sources such as namu.wiki, Inven and Reddit could not be queried. Every number below comes from code or data files fetched with `curl` from raw.githubusercontent.com, plus GitHub code search.

Labels used below: **[Classic-PC]** means the PC emulator packet or data. **[paopao]** means the classic mobile port's code. **[KRD]** means KartRider: Drift. **[DERIVED]** means computed here. **[PROPOSED]** means no source was found.

---

### 1. Where the numbers come from and how they combine

The final value sent to the client is `speedType (channel LevelParam) + kart BodyParam delta + tuning/pet/parts`. Sources: `StartGameData.cs` lines 125–272 (Launcher_V2), and paopao `PhysicSpec.Load` lines 37–99, which adds `bodyParam` onto `levelParam`.

The kart XML stores **deltas**. For example `NormalBoosterTime="-100"` becomes 3000−100 = 2900 ms. Sources: KartSpec.cs:108 (fallback 3000 plus value) and the P5136 catalog test fixture `NormalBoosterTime="-100"` (catalog.rs:2655).

The booster multipliers `TransAccelFactor` and `BoostAccelFactor` are stored as absolute values of about 1.5, stored in the kart XML, with a small speed-class delta added (kuronekowen/KartSpec Program.cs:83–84: −0.0045 plus 1.5 gives 1.4955).

Korean field meanings, from Launcher_GF_3229 `SpeedPatch.cs` lines 8–16:

| Field | Korean label | Meaning |
|---|---|---|
| DragFactor | 최고 속도 | top speed |
| ForwardAccelForce | 전진 가속도 | forward acceleration |
| DriftEscapeForce | 드리프트 탈출력 | drift escape force |
| CornerDrawFactor | 코너 가속 | corner acceleration |
| DriftMaxGauge | 게이지 충전량 | gauge charge amount |
| TransAccelFactor | 변신 부스터 가속력 | transform-booster acceleration |
| BoostAccelFactor | 부스터 가속력 | booster acceleration |
| StartForwardAccelForce* | 출발 부스터 가속 | start-boost acceleration |

KRD's kart.cafe labels `TransAccelFactor` as **"Boost Acceleration"** (stats/+page.svelte). So on modern karts, which have `UseTransformBooster = true`, the booster multiplier is `TransAccelFactor` (about 1.85). `BoostAccelFactor` (about 1.5) applies to non-transform karts. **Confidence: medium.** The PC client code was not available; this is inferred from the labels.

---

### 2. Constants table

Files: `KS` = Launcher_V2 `KartRider.Data/KartSpec/KartSpec.cs`; `ST` = Launcher_V2 `KartRider.Data/ExcData/SpeedType.cs`; `RS` = Launcher_GF_3229 `KartRider.Data/Rider/RiderSchool.cs`; `PS`/`GPK`/`RFW`/`AIC` = paopao `Kart/Physics/PhysicSpec.cs`, `Kart/GoPlayKart.cs`, `Misc/RigidbodyFPSWalker.cs`, `Kart/AI/AIController.cs`.

Units: u = game length unit. The paopao HUD shows speed as |v|×3.6 (GPK:782–785), so u/s is treated as m/s. The "resolved" column is the rider-school kart at standard speed.

#### 2a. Chassis and drive [Classic-PC]

| Field | Resolved (RS) | Per-class base (ST) | Kart delta (KS) | Unit | Confidence |
|---|---|---|---|---|---|
| Mass | 100 | 100 in all classes | 0 | kg-equivalent | High |
| AirFriction | 3 | 3 (CGS 2.7) | 0 | N per (u/s) | High |
| DragFactor | 0.667 (RS:28) | S0 0.70, S1 0.735, S2 0.7621, S3 0.79, Std 0.75, S8 0.74, Rookie 0.74, L3 0.763, L2 0.743 (CN) / 0.801 (KR), L1 0.772 (CN) / 0.794 (KR), Pro 0.81 (ST:61–535) | −0.083 (KS:449) | N per (u/s)² | High |
| ForwardAccelForce | 2304 (RS:29) | 1620 / 1950 / 2350 / 2900 / 2150 / Rookie 2000 / L3 2400 / L2 2500 or 2900 / L1 2700 or 2900 / Pro 3800 | +154 (KS:454) | N | High |
| BackwardAccelForce | 1825 | 1500–2850 | +100 | N | High |
| GripBrakeForce / SlipBrakeForce | 2070 / 1415 | 1500–3420 / 1200–2280 | 0 | N | High |
| MaxSteerAngle | 10 | 10 (CGS 12.5) | 0 | degrees | High |
| SteerConstraint | 24.61 (RS:34) | 20–23.4 | +2.36 (KS:479) | u/s decay constant | High |
| Front/RearGripFactor | 5 / 5 | 5 (CGS 10) | 0 | multiplier on 9.8·m | High |
| DriftTriggerFactor / DriftTriggerTime / DriftSlipFactor | 0.2 / 0.2 s / 0.2 | 0.2 | 0 | factor / s / factor | High |
| DriftEscapeForce | 4200 (RS:40) | 1850 / 2350 / 3300 / 3700 / 2600 / Rookie 2500 / Pro 4700 | +1600 (KS:509) | N | High |
| CornerDrawFactor | 0.254 | 0.13–0.20 | +0.074 | factor | High value, medium sign (§3) |
| DriftMaxGauge | 3860 (RS:44) | 5050 / 3970 / 4880 / 6000 / 4300 / Rookie 4000 / L3 5000 / Pro 8000 | −440 | gauge units | High |
| DriftLean / SteerLean | 0.06 / 0.01 | – | – | visual only | High |
| antiCollideBalance | 0.91 (RS:59) | – | 0.91 (KS:604) | collision multiplier, lower is better | Medium |
| KR retro modifier | – | drag −0.005, F −5, steer +0.05, escape +150, corner +0.005, trans +0.18 (ST:542–550) | – | – | High |

#### 2b. Boosts and timing [Classic-PC]

| Field | Value | Unit | Source | Confidence |
|---|---|---|---|---|
| NormalBoosterTime | **2900** (3000 when the XML value is missing) | ms | RS:45; KS:534, KS:108 | High |
| ItemBoosterTime | **3000** | ms | RS:46; KS:539 | High |
| TeamBoosterTime | **4350** (4500) = **1.5 × normal** | ms | RS:47; KS:544, KS:110 | High |
| AnimalBoosterTime (item-mode special booster) | 4000 | ms | RS:48 | High |
| SuperBoosterTime | 3500 | ms | RS:49 | High |
| TransAccelFactor (transform-kart booster multiplier) | **1.8495** (S0 1.634, S1 1.848, S2 1.851, S3 1.849) | × thrust | RS:50; KS:559; ST class deltas | Medium |
| BoostAccelFactor (non-transform booster multiplier) | **1.494** | × thrust | RS:51; KS:564 | High |
| BoostAccelFactorOnlyItem (item-mode booster) | 1.5 | × thrust | RS:58 | High |
| StartBoosterTimeSpeed | **1500** (1000 when missing); tuning adds +530 or +800 | ms | RS:53; KS:574, KS:116; TuneSpec.cs:37–56 | High |
| StartBoosterTimeItem | **1000** | ms | RS:52 | High |
| StartForwardAccelForceSpeed | 3745.588 = 1.7·F − 171.212 (about **1.63 × F**) | N | RS:55; StartGameData.cs:564–576 | High |
| StartForwardAccelForceItem | 2304 (= F, factor 0) | N | RS:54 | High |
| driftBoostMulAccelFactor (instant boost, 순간 부스터 / 瞬間加速器) | **1.4** | × thrust | RS:17; KS:394 | High |
| driftBoostTick (instant-boost duration) | **500** | ms | RS:18; KS:399 | High |
| draftMulAccelFactor (slipstream) | **1.1** | × thrust | RS:15; KS:384 | High |
| draftTick (time in slipstream before draft activates) | **2000** | ms | RS:16; KS:389 | High |
| chargeBoostBySpeed ("auto gauge charge speed") | 350 | gauge units per s (probably) | RS:19; KS:404 | Low |
| DriftGaguePreservePercent (gauge kept on collision) | **0.5** | fraction | RS:56; KS:589 | Medium |
| UseExtendedAfterBooster (allows instant boost in item mode) | false | bool | RS:57; KS:594 | Medium |
| dualBooster TickMin / TickMax / MulAccel / TransLowSpeed | 20 / 30 (or 40/60), 1.04, 100 km/h | ticks, ×, km/h | RS:61–64 | Medium |

#### 2c. Exceed ("instAccel") gauge and wall-charge gauge [Classic-PC, later-era system; not the drift gauge]

| Field | Value | Unit | Source |
|---|---|---|---|
| chargeInstAccelGaugeByBoost / ByGrip / ByWall | 0.02 / 0.06 / 0.15 (defaults when missing: 0.02 / 0.02 / 0.2) | fraction per event or second | RS:71–73; KS:664–674, 135–137 |
| instAccelFactor | 1.11 (1.25 when missing) | × thrust | RS:74; KS:679 |
| instAccelGaugeCooldownTime / Length / MinUsable | 3000 / 2500 / 750 (= 0.3 × Length) | ms | RS:75–77; KS:346–355 |
| instAccelGaugeMinVelBound / MinVelLoss | 0 / 50 | km/h | RS:78–79 |
| wallCollGaugeCooldownTime / MaxVelLoss / MinVelBound / MinVelLoss | 3000 / 200 / 200 / 50 | ms / km/h | RS:81–84; KS:711–726 |

The `wallCollGauge*` fields control *charging* the exceed gauge from wall hits at 200 km/h or more with a speed loss of 50–200 km/h. They are **not** a drift-gauge penalty. Confidence: medium.

#### 2d. paopao hard-coded constants [paopao]

- **Gravity** −49 u/s² (5g). On the ground it is applied ×0.8. Source: GPK:8, 140, 682.
- **Angular inertia** m/12. Source: GPK:506.
- **Booster thrust** ×1.5 for Start, Normal, Team and Animal boosts, and **×2.5 for BoostDrift** (the instant boost). Source: GPK:154–159.
- **Instant-boost window** `validTime` 0.5 s, and the instant boost lasts `useLeftTime` 0.5 s. Source: GPK:456–460, 605–611.
- **Releasing the accelerator cancels any non-zone booster.** Source: GPK:613–620.
- **No booster stacking.** Using a booster requires not already boosting and holding the accelerator. Source: RFW:234.
- **Start boost** fires if the accelerator is pressed within **±0.1 s of GO**, giving a 1000 ms BoostStart. Source: RFW:206–213. The AI start factor is 1.3× speed, then eases back over 3 s. Source: AIC:116–119, 787.
- **Crash thresholds** (wall-normal speed): small crash 15 u/s, big crash 30 u/s. Source: RFW:1056–1058.
- **Stuck detection**: wall 1 s, ground 1 s, obstacle 0.4 s. Source: GPK:936–982.

---

### 3. Recovered formulas (paopao `GoPlayKart.cs` and `PhysicSpec.cs`, consistent with the PC fields)

```
// per fixed step dt; m = Mass = 100
boostLeftMs -= dt*1000;  if (!accelHeld && !zoneBoost) boostLeftMs = 0            // GPK:64-71, 613-620
Fg = g*m*(onGround ? 0.8 : 1), g = 49                                              // GPK:140, 682
// Traction (GPK:143-176)
base = forceSlip ? DriftEscapeForce : ForwardAccelForce
mul  = BoostDrift ? kInst : (realBoost ? kBoost : 1)
F_trac = forwardOnGround * accel * mul * base
//   forceSlip = !drifting && |v_lat| > 1.2*|v_fwd| && |v| > 15                       // GPK:296-299
//   paopao: kBoost 1.5, kInst 2.5
//   PC: kBoost = TransAccelFactor (≈1.85, transform karts) or BoostAccelFactor (1.494);
//       kInst = driftBoostMulAccelFactor 1.4; item-mode kBoost = 1.5
// Brake (GPK:178-222): if dot(v̂, fwd) > 0.8: -GripBrakeForce·v̂, else -SlipBrakeForce·v̂;
//   reverse with BackwardAccelForce after 0.2 s at |v_fwd| < 0.5
// Steering (GPK:256-432)
δ = steerInput * MaxSteerAngle * exp(-|v_fwd| / SteerConstraint)
β = v_lat/|v|;  r = 0.5*ω_y/|v|
F_front = 9.8*m*FrontGrip*(δ*sgn(v_fwd) - β - r)
F_rear  = 9.8*m*RearGrip*(-β + r)
if drifting (slipMode | slipTime>0 | forceSlip): F_front,F_rear *= DriftSlipFactor (0.2)
if trigger phase (first DriftTriggerTime = 0.2 s after drift press; slipTime = 0.4 s):
    F_front = 0;  F_rear = -9.8*m*FrontGrip*steerInput*maxSteerRad*DriftTriggerFactor   // rear kick
F_long_corner = grip ? -|F_front+F_rear|*CornerDrawFactor : 0        // sign as decompiled, see note
torque_y = 0.5*F_front - 0.5*F_rear;   I = m/12
// Resistance (GPK:108-120)
F_res = -AirFriction*v - (onGround ? DragFactor*|v|*v : 0);   τ_res = -AirFriction*ω
v += (ΣF/m)*dt
// Terminal speed (PS:106)
v* = (-a + sqrt(a² + 4·d·F)) / (2d)
// Mass change (PS:100-107): forces *= m'/m;  d' = (F' - a·v*)/v*²   (keeps v* unchanged)
// Drift gauge (GPK:884-902, 421-428)
while drifting (after trigger), on ground, v_fwd >= 0:
    progress += 2*dt*v_lat²*k(t),  k = 3 (t<0.2 s), 1.5 (t<0.5 s), 1/(2t) afterwards
on drift end: gauge = min(DriftMaxGauge, gauge + progress)       // full gauge => booster item
// Instant boost (GPK:456-460, 605-611)
drift ends while not force-slipping, and drift began moving forward -> 0.5 s window
accel pressed in window while not boosting -> BoostDrift for 0.5 s (PC: 500 ms at ×1.4)
```

**How the other fields work**

- **DriftEscapeForce** *replaces* ForwardAccelForce whenever the kart is sliding mostly sideways (|v_lat| > 1.2·|v_fwd|). It is what pulls the kart out of a deep drift.
- **TransAccelFactor** is not lateral-to-forward momentum transfer. It is the booster thrust multiplier.
- **CornerDrawFactor** is a longitudinal force proportional to total lateral tire force, applied only while gripping (not drifting). The decompiled sign is **negative** (cornering drag). But every tuning buff *adds* to it (+0.0005, +0.0015, +0.074), which suggests the PC client applies it as a *forward* pull ("코너 가속"). The value is certain; the sign is open. My recommendation is a forward pull of about 0.2·|F_lat|.
- **Wall hit** (RFW:770–915):
  - Wall-normal velocity (components clamped to ±20 u/s) is bounced back with Δv = −1.2·v_n, i.e. a 0.2 restitution.
  - The tangential scrub is `min(1.2·|v_n|, 0.02·|v_t|)`.
  - The **pending** drift progress is cleared and the instant-boost eligibility is cancelled.
  - The banked gauge is **not** touched.
  - In kart-to-kart hits the other kart's velocity is weighted by 0.618.
  - PC adds DriftGaguePreservePercent 0.5. My reading (medium confidence) is that 50% of the pending charge survives a crash.
- **Draft**: after 2000 ms in another kart's slipstream, thrust ×1.1. The duration after leaving the slipstream was not found.

---

### 4. Derived terminal speeds per speed class [DERIVED from Classic-PC data]

Displayed km/h = u/s × 3.6. "+kart" means base plus the rider-school delta (F +154, drag −0.083). Boost columns use the +kart spec.

| Class | Grip base (km/h) | Grip +kart | Boost ×1.494 | Boost ×TransAccel | Instant ×1.4 | Draft ×1.1 | UFO (drag ×4) |
|---|---|---|---|---|---|---|---|
| S0 slow | 165.6 | 184.5 | 227.4 | 238.2 (×1.634) | 219.8 | 193.9 | 94.4 |
| S1 normal | 178.2 | 196.4 | 241.8 | 269.8 | 233.8 | 206.4 | 100.2 |
| S2 fast | 192.9 | 210.8 | 259.4 | 289.6 | 250.8 | 221.5 | 107.3 |
| S3 very fast | 211.4 | 229.1 | 281.7 | 314.2 | 272.4 | 240.6 | 116.4 |
| Standard (S7) | 185.7 | **203.6** (56.57 u/s) | 250.6 | **279.8** (77.7 u/s) | 242.4 | 214.0 | 103.8 |
| Rookie / paopao | **180.0** (exactly 50 u/s) | 198.1 | 243.9 | 272.6 | 235.8 | 208.1 | 101.0 |
| L3 / L2 / L1 (CN) | 195.0 / 201.7 / 206.0 | 212.8 / 220.3 / 224.0 | – | – | – | – | – |
| Pro | 240.0 | 258.2 | 317.2 | 354.1 | – | – | – |

**Standard-kart dynamics (simulated, mass 100)**

- 0→100 km/h in 1.34 s; 0→150 in 2.37 s; 90% of top speed in 3.71 s; 95% in 4.62 s.
- Coasting from top speed with no throttle: 144 km/h after 1 s, 89 km/h after 3 s.
- Booster (2.9 s at ×1.85) from top speed: peaks at 276 km/h, gains about 64 m, and takes 3.2 s to settle back within 5 km/h of grip speed.
- Instant boost at ×1.4 gains about 5.5 m. The paopao ×2.5 version gains about 20 m.
- UFO (drag ×4): terminal speed falls to 0.51× of normal and costs about 105 m over 6 s.
- Gauge: a 1 s drift with lateral speed 16–20 u/s charges 714–1116 units, so about **3.5–5.4 drifts** fill the 3860-unit gauge.

**Comparison with KRD** (183.33 km/h grip and 239.54 km/h boost, as given in the task; not re-checked here)

- The ratio is 1.3066. With the classic curve (air friction 3), that ratio needs an effective boost multiplier of **≈1.68**, whatever drag value is used.
- Classic ratios are 1.374 with TransAccel and 1.231 with BoostAccel, so KRD sits between the two.
- KRD's "Standard" grip speed of 183.33 km/h is very close to the classic standard base of 185.7 km/h. KRD looks like the classic standard channel with a milder booster.

---

### 5. Item-mode and race-flow parameters

[paopao] unless marked otherwise. Classic PC item XML was not found: item behaviour runs in the client, and emulator servers only relay item events (KartRider-P236 LegacyMultiplayerHandlers.cs:847–881 lists 30 item operation names).

- **Item box respawn: 3.0 s.** Source: ItemBox.cs:46.
- **Booster item**: uses NormalBoosterTime (3.0 s in paopao). AI uses a ×1.2 time-scale for 3 s. PC item mode uses ItemBoosterTime 3000 ms at ×1.5. Source: RFW:237; AIC:164.
- **Guard/shield: 3.0 s**, with a 1.0 s visual flash when it blocks something. It blocks banana, water bomb, water fly and missile. **UFO, Flip and Devil are applied before the guard check, so the guard does not block them.** Source: KartBasicController.cs:372–379; AIC:444–480.
- **UFO**: player `DragFactor ×4` for **3.0 s** (JobApplyUFO.cs:8, 16, 25, 27), which gives about 0.51× terminal speed with a soft ease-in. AI gets 0.5× speed for 3 s (AIC:457).
- **Water bomb**: lands at **200 u** ahead along the course (GoItemWaterBomb.cs:149).
  - On capture, velocity is zeroed and the kart gets no control until the bubble animation ends. The trap length is set by the animation and is not in code.
  - Mashing (shake count > 1) gives a **1.0 s start-boost on release**. It rewards the escape rather than shortening the trap. Source: RFW:418–426, 564–584.
- **Water fly and water missile**: same bubble. The missile approaches for 2.0 s (GoItemWaterMissile.cs:167), or 1–2 s against AI (line 175). Against AI it traps 50% of the time; otherwise the AI gets 0.75× speed for 3 s (AIC:483–502).
- **Banana**: the dropper is immune for **2.0 s** (GoItemBanana.cs:10, 140). A hit plays the rolling (spin) animation; AI speed eases to 0 over 1.2 s (AIC:521–523).
- **Devil (reversed steering)**: 1 s warning, then 6 s. **Flip**: applied at 1 s, removed at 7 s. AI gets 0.5× for 2.5 s. Source: KBC:441–454; RFW:516–534, 989–998.
- **AI item timing**: first use 0–3 s after pickup, each following item +1–3 s (AIC:547–551). The AI is a recorded-line replay whose time-scale is modulated; the AISpeedEnhancer eases toward 0.035 over 1.5 s and holds for 3 s.
- **Respawn** (AIC:565–581): warp at 0.5 s, control back at 1.0 s, invulnerable with a 100 ms blink until 3.0 s. The player's pending drift gauge is reset on warp (RFW:466).
- **Item odds by rank** (GameItemManager.cs:53–109, 6-kart table): 1st place gets banana 70% and guard 20%. Lower ranks get booster 20–50%, water fly/bomb 15–25%, and water missile 10–20%.
- **[KRD] solo drop rates** (kart.cafe `itemModeDropRates/solo.json`; buckets Top=1, High=2–3, Mid=4–6, Low=7–8):

| Item | Top | High | Mid | Low |
|---|---|---|---|---|
| Booster | 5 | 10 | 30 | 55 |
| Shield | 55 | 20 | 0 | 0 |
| Banana | 25 | 10 | 0 | 0 |
| EMP | 15 | 0 | 0 | 0 |
| Rocket | 0 | 20 | 20 | 0 |
| WaterFly | 0 | 15 | 10 | 0 |
| WaterBomb | 0 | 10 | 15 | 5 |
| Magnet | 0 | 5 | 15 | 25 |
| UFO | 0 | 5 | 5 | 5 |
| Barricade | 0 | 5 | 5 | 5 |
| Thunderbolt | 0 | 0 | 0 | 5 |

- **Not found anywhere**: magnet pull time and speed, barricade lifetime, missile airborne time in PC or KRD, and KRD booster durations. KRD's gear-to-value table (only gear levels are in `KtKartUpgradeCustomSetDef.json`) was also not found.

---

### 6. Replace proposal X with Y

The recommended way to keep ClaudeRider's KRD display targets is to **scale the classic model**. Set s = 34/56.567 = 0.601, then use F' = s·F, d' = d/s, and keep a and m unchanged. This preserves every classic time constant (0→90% in 3.7 s, booster decay, and so on).

1. **Grip 34 m/s, boost 44.4 m/s, display factor 1.5: keep the targets, replace the model.**
   - Use `F = 1385 N`, `DragFactor = 1.110`, `AirFriction = 3.0`, `Mass = 100`, which gives exactly 34.0 m/s.
   - Booster thrust ×**1.68** gives 44.46 m/s, or 240 km/h at ×5.4. This is DERIVED to match KRD.
   - For classic feel instead, use ×1.85, which gives 46.7 m/s and 252 km/h.
   - Implement the booster as a thrust multiplier, not a speed cap.
2. **Booster 2.4 s → 2.9 s** in speed mode and **3.0 s** in item mode (Classic-PC).
3. **Team booster 1.25× → 1.5×**, i.e. 4.35 s (Classic-PC, exact ratio 4350/2900).
4. **Instant boost: keep the 0.5 s window** (paopao `validTime`). **Change the effect from 0.6 s to 0.5 s of thrust ×1.4** (PC `driftBoostTick` / `driftBoostMulAccelFactor`), not a velocity add.
   - The window opens when the drift key is released and the kart is no longer force-slipping.
   - Require a fresh accelerator press (PROPOSED for PC; paopao auto-fires it because the accelerator is held).
5. **Start boost 0.8/1.2/1.6 s → 1.5 s** (speed) and **1.0 s** (item). Thrust is about 1.63×F, i.e. `1.7·F − 171`, or `1.63·1385 ≈ 2257 N` scaled.
   - Timing window **±0.10 s** around GO (paopao).
   - If tiers are wanted, use them only as PROPOSED lower tiers: ±0.2 s → 1.0 s, ±0.3 s → 0.5 s.
   - A tuned-kart ceiling of 2.3 s is possible (tuning adds +800 ms).
6. **Wall hit "lose (1−protection) of the gauge" →** keep the banked gauge. Cancel the pending drift progress, keeping `DriftGaugePreservePercent = 0.5` of it. Cancel instant-boost eligibility.
   - Velocity: bounce with Δv_n = −1.2·v_n and scrub up to `min(1.2|v_n|, 0.02|v_t|)`.
   - Crash animation above 9 m/s wall-normal speed, big crash above 18 m/s (scaled from 15/30 u/s).
7. **Item turbo 2.0 s → 3.0 s at ×1.5 thrust** (ItemBoosterTime / BoostAccelFactorOnlyItem).
8. **Trap 2.2 s: keep as PROPOSED** (no source found). But zero the velocity on capture, and replace mash-to-shorten with a mash reward of a 1.0 s boost on release (paopao).
9. **Shield 3.0 s: keep** (paopao guard 3 s). Consider letting UFO and reversed-steer items pass through it.
10. **UFO ×0.60 for 3.5 s → DragFactor ×4 for 3.0 s.** This gives an effective 0.51×, reached over about 1 s.

**Additions**

- Item box respawn 3.0 s.
- Banana self-immunity 2.0 s.
- Water bomb lands about 120 m ahead (200 u scaled).
- Draft: engage after 2.0 s in the slipstream, thrust ×1.1, lasting 1.5 s after leaving (PROPOSED).
- Releasing the accelerator cancels the booster; boosters do not stack.
- Gravity about −29.5 m/s² scaled (paopao −49 u/s²), ×0.8 on the ground.
- Steering `δ = input·10°·exp(−v_fwd/(24.6·s))`.
- Drift grip factor 0.2 and drift-trigger kick 0.2 s.
- Gauge charge `2·dt·v_lat²·k(t)` with gauge max 3860. Rescale for s: charge goes with v_lat², so multiply the max by s² ≈ 0.361, giving about 1395.
- Respawn 0.5/1.0/3.0 s.
- Stuck detection 1 s.

---

### 7. Caveats

- **Units.** paopao shows speed as ×3.6. That PC km/h equals u/s×3.6 is consistent (the km/h thresholds of 100 and 200 match computed speeds of about 204 km/h) but not proven.
- **KRD.** Only the field names, the gear stat list, the drop rates and the task-supplied 183/240 km/h are KRD-specific. Everything else is classic.
- **Not reached.** `OrangeCarrrrrPhysics` and the KRD client DataTables were not reached; code search for `kartrider-drift-files` only returned UI assets.

## Key parameters

- **physics.mass**: 100 [sourced] — Classic-PC: yanygm/Launcher_V2 SpeedType.cs:59 (all classes); RiderSchool.cs:26
- **physics.airFriction**: 3.0 N per (u/s), linear; also angular damping [sourced] — Classic-PC: SpeedType.cs:60; paopao GoPlayKart.cs:112-113
- **physics.dragFactor.standardKart**: 0.667 (standard channel 0.75 + kart delta -0.083) [sourced] — Classic-PC: RiderSchool.cs:28; KartSpec.cs:449; SpeedType.cs:437
- **physics.dragFactor.perClass**: S0 0.70, S1 0.735, S2 0.7621, S3 0.79, Std 0.75, S8 0.74, Rookie 0.74, L3 0.763, L2 0.743 (CN) / 0.801 (KR), L1 0.772 (CN) / 0.794 (KR), Pro 0.81; KR retro -0.005 [sourced] — Classic-PC: Launcher_V2 SpeedType.cs:61-535, 544
- **physics.forwardAccelForce.standardKart**: 2304 N (2150 + 154) [sourced] — Classic-PC: RiderSchool.cs:29; KartSpec.cs:454
- **physics.forwardAccelForce.perClass**: S0 1620, S1 1950, S2 2350, S3 2900, Std 2150, Rookie 2000, L3 2400, L2 2500 (CN) / 2900 (KR), L1 2700 (CN) / 2900 (KR), Pro 3800 N [sourced] — Classic-PC: SpeedType.cs
- **formula.resistance**: F_res = -AirFriction*v - DragFactor*|v|*v (drag only on ground) [sourced] — paopao GoPlayKart.cs:108-120; PhysicSpec.cs:106-107
- **formula.terminalSpeed**: v* = (-a + sqrt(a^2 + 4*d*F)) / (2*d) [sourced] — paopao PhysicSpec.cs:106
- **derived.gripTopSpeed.standardKart**: 56.57 u/s = 203.6 km/h (x3.6); base standard channel 185.7 km/h; Rookie 180.0 km/h [proposed] — DERIVED from RiderSchool.cs values plus the PhysicSpec formula
- **derived.boostTopSpeed.standardKart**: x1.8495 gives 279.8 km/h; x1.494 gives 250.6 km/h; x1.4 (instant boost) gives 242.4 km/h [proposed] — DERIVED
- **derived.KRD.effectiveBoostMultiplier**: 1.68 (reproduces the 239.54/183.33 = 1.3066 ratio on the classic curve) [proposed] — DERIVED from task-given KRD speeds
- **claudeRider.scaledModel**: s = 0.601; F' = 1385 N, DragFactor' = 1.110, AirFriction = 3, Mass = 100 -> 34.0 m/s; boost thrust x1.68 -> 44.46 m/s [proposed] — DERIVED (scale-invariant transform F' = sF, d' = d/s)
- **boost.normalBoosterTime**: 2900 ms (3000 when XML value missing) [sourced] — Classic-PC: RiderSchool.cs:45; KartSpec.cs:108, 534
- **boost.itemBoosterTime**: 3000 ms [sourced] — Classic-PC: RiderSchool.cs:46; KartSpec.cs:539
- **boost.teamBoosterTime**: 4350 ms (4500 when missing) = 1.5x normal [sourced] — Classic-PC: RiderSchool.cs:47; KartSpec.cs:110, 544
- **boost.animalBoosterTime / superBoosterTime**: 4000 ms / 3500 ms [sourced] — Classic-PC: RiderSchool.cs:48-49
- **boost.transAccelFactor**: 1.8495 (transform-booster thrust multiplier; S0 1.634) [sourced] — Classic-PC: RiderSchool.cs:50; SpeedPatch.cs:13 (변신 부스터 가속력); kart.cafe labels it 'Boost Acceleration'
- **boost.boostAccelFactor**: 1.494 (non-transform booster); item mode 1.5 (BoostAccelFactorOnlyItem) [sourced] — Classic-PC: RiderSchool.cs:51, 58; SpeedPatch.cs:14
- **boost.paopaoMultipliers**: normal/start/team x1.5 thrust; BoostDrift (instant) x2.5 [sourced] — paopao GoPlayKart.cs:154-159
- **boost.releaseAccelCancels**: true (non-zone boosts); no stacking [sourced] — paopao GoPlayKart.cs:613-620; RigidbodyFPSWalker.cs:234
- **instantBoost.effect**: 500 ms at x1.4 thrust (driftBoostTick / driftBoostMulAccelFactor) [sourced] — Classic-PC: RiderSchool.cs:17-18; KartSpec.cs:394-399
- **instantBoost.window**: 0.5 s after drift release (not force-slipping) [sourced] — paopao GoPlayKart.cs:456-460, 605-611
- **startBoost.speedMode**: 1500 ms; thrust = 1.7*F - 171.212 (= 3745.6 N, about 1.63x F); tuning +530/+800 ms [sourced] — Classic-PC: RiderSchool.cs:53, 55; StartGameData.cs:564-576; TuneSpec.cs:37-56
- **startBoost.itemMode**: 1000 ms; thrust = F [sourced] — Classic-PC: RiderSchool.cs:52, 54
- **startBoost.timingWindow**: +/-0.10 s around GO (paopao 1000 ms BoostStart) [sourced] — paopao RigidbodyFPSWalker.cs:206-213
- **draft**: activates after 2000 ms in slipstream; thrust x1.1; post-exit duration 1.5 s PROPOSED [sourced] — Classic-PC: RiderSchool.cs:15-16; KartSpec.cs:384-389
- **drift.escapeForce**: 4200 N standard kart (per class 1850-4700); replaces ForwardAccelForce when |v_lat| > 1.2|v_fwd| and |v| > 15 [sourced] — Classic-PC: RiderSchool.cs:40; paopao GoPlayKart.cs:159, 296-299
- **drift.slipFactor / trigger**: tire forces x0.2 while drifting; trigger phase 0.2 s rear kick, slipTime 0.4 s [sourced] — Classic-PC: SpeedType.cs; paopao GoPlayKart.cs:303-386
- **drift.maxGauge**: 3860 standard kart (per class 3970-8000; Std 4300; Rookie 4000) [sourced] — Classic-PC: RiderSchool.cs:44; SpeedType.cs
- **formula.gaugeCharge**: progress += 2*dt*v_lat^2*k(t), k = 3 (<0.2 s), 1.5 (<0.5 s), 1/(2t) afterwards; committed on drift end, capped at max [sourced] — paopao GoPlayKart.cs:884-902, 421-428
- **drift.gaugePreservePercent**: 0.5 (share of pending charge kept on crash; interpretation) [sourced] — Classic-PC: RiderSchool.cs:56; KartSpec.cs:589; KRD has driftGaugePreservePercent
- **steering**: delta = input*MaxSteer(10 deg)*exp(-|v_fwd|/SteerConstraint(24.61)); grip stiffness 9.8*m*5; inertia m/12 [sourced] — paopao GoPlayKart.cs:258-259, 382-418, 506; RiderSchool.cs:33-36
- **cornerDrawFactor**: 0.254 standard kart; longitudinal force = |F_lat|*factor in grip mode; sign uncertain (decompiled negative) [sourced] — Classic-PC: RiderSchool.cs:41; paopao GoPlayKart.cs:430
- **wall.response**: dv_n = -1.2*v_n (components clamped +/-20 u/s), tangential scrub min(1.2|v_n|, 0.02|v_t|); clears pending gauge and instant-boost eligibility; kart-kart other velocity x0.618 [sourced] — paopao RigidbodyFPSWalker.cs:802-841
- **wall.crashThresholds**: small 15 u/s, big 30 u/s (wall-normal) [sourced] — paopao RigidbodyFPSWalker.cs:1056-1058
- **gravity**: -49 u/s^2; x0.8 on ground [sourced] — paopao GoPlayKart.cs:8, 140, 682
- **item.boxRespawn**: 3.0 s [sourced] — paopao ItemBox.cs:46
- **item.guardShield**: 3.0 s; does not block UFO/Flip/Devil [sourced] — paopao KartBasicController.cs:379; AIController.cs:444-480
- **item.ufo**: DragFactor x4 for 3.0 s (terminal x0.51); AI x0.5 for 3 s [sourced] — paopao JobApplyUFO.cs:8-27; AIController.cs:457
- **item.waterBomb**: lands 200 u ahead; velocity zeroed, trap length set by animation (2.2 s PROPOSED); mash gives 1.0 s boost on release [sourced] — paopao GoItemWaterBomb.cs:149; RigidbodyFPSWalker.cs:418-426, 564-584
- **item.waterMissile**: flight 2.0 s (player) / 1-2 s (AI); AI 50% trap else x0.75 for 3 s [sourced] — paopao GoItemWaterMissile.cs:167, 175; AIController.cs:483-502
- **item.banana**: dropper immune 2.0 s; spin animation; AI speed eases to 0 over 1.2 s [sourced] — paopao GoItemBanana.cs:10, 140; AIController.cs:523
- **item.devil / flip**: devil 1 s warning + 6 s reversed steering; flip applied 1 s, removed at 7 s; AI x0.5 for 2.5 s [sourced] — paopao KartBasicController.cs:441-454; RigidbodyFPSWalker.cs:516-534, 989-998
- **item.magnet / barricade**: magnet pull 1.5 s at x1.3 thrust toward target; barricade 5 s lifetime [proposed] — no data found
- **respawn**: warp 0.5 s, control 1.0 s, invulnerable (100 ms blink) until 3.0 s; stuck detection 1 s [sourced] — paopao AIController.cs:565-581; GoPlayKart.cs:936-982
- **KRD.itemDropRates.solo**: Booster 5/10/30/55; Shield 55/20/0/0; Banana 25/10/0/0; EMP 15/0/0/0; Rocket 0/20/20/0; WaterFly 0/15/10/0; WaterBomb 0/10/15/5; Magnet 0/5/15/25; UFO 0/5/5/5; Barricade 0/5/5/5; Thunderbolt 0/0/0/5 (Top/High/Mid/Low = 1/2-3/4-6/7-8) [sourced] — KRD: whotookzakum/kart.cafe src/lib/data/itemModeDropRates/solo.json, rankDefs.json
- **exceedGauge (instAccel)**: charge 0.02 boost / 0.06 grip / 0.15 wall; x1.11 thrust; length 2500 ms, min usable 750 ms, cooldown 3000 ms [sourced] — Classic-PC: RiderSchool.cs:71-79; KartSpec.cs:664-704
- **wallCollGauge**: cooldown 3000 ms; minVelBound 200; vel loss 50-200 (km/h) -> charges exceed gauge (not a drift-gauge penalty) [sourced] — Classic-PC: RiderSchool.cs:81-84; KartSpec.cs:711-726

## Open questions

- PC speedometer conversion: paopao displays |v|x3.6; the PC client is assumed to do the same (the km/h thresholds of 100 and 200 are consistent with it) but this is unconfirmed.
- Booster multiplier selection rule: TransAccelFactor (~1.85) is inferred to apply to karts with UseTransformBooster=true and BoostAccelFactor (~1.5) to other karts, based on the Korean and Chinese labels and kart.cafe's 'Boost Acceleration' label. The PC client code was not available.
- CornerDrawFactor sign: the decompiled paopao code applies it as cornering drag, but every tuning buff increases it, so the PC client may apply it as a forward pull.
- Start boost: does StartForwardAccelForceSpeed (1.63x F) replace the booster multiplier or stack with it? A replacement fits paopao's 1.5x behaviour best.
- PC instant-boost input window: paopao uses 0.5 s with the accelerator held, which fires it automatically; PC appears to need a fresh accelerator press, but the exact window is unknown.
- Water-bomb trap duration, magnet pull time and speed, barricade lifetime, and missile airborne time for PC and KRD were not found (in paopao these are set by animations).
- KRD per-kart numeric values: kart.cafe only has gear levels; the gear-to-value DataTable was not located, and code search for kartrider-drift-files only returned UI assets.
- Semantics of chargeBoostBySpeed (350) and KRD autoChargeLowSpeed / bTransformAutoCharge (automatic gauge charging).
- How long the draft boost lasts after leaving the slipstream.
- The KRD reference speeds (183.33 and 239.54 km/h) came from earlier reports and could not be re-checked because the WebSearch budget was used up.

## Sources

- https://raw.githubusercontent.com/yanygm/Launcher_V2/HEAD/KartRider.Data/KartSpec/KartSpec.cs
- https://raw.githubusercontent.com/yanygm/Launcher_V2/HEAD/KartRider.Data/ExcData/SpeedType.cs
- https://raw.githubusercontent.com/yanygm/Launcher_V2/HEAD/KartRider.Data/KartSpec/StartGameData.cs
- https://raw.githubusercontent.com/yanygm/Launcher_V2/HEAD/KartRider.Data/KartSpec/FlyingPet.cs
- https://raw.githubusercontent.com/yanygm/Launcher_GF_3229/HEAD/KartRider.Data/Rider/RiderSchool.cs
- https://raw.githubusercontent.com/yanygm/Launcher_GF_3229/HEAD/KartRider.Data/ExcData/SpeedPatch.cs
- https://raw.githubusercontent.com/yanygm/Launcher_GF_3229/HEAD/KartRider.Data/KartSpec/Kart.cs
- https://raw.githubusercontent.com/yanygm/Launcher_GF_3229/HEAD/KartRider.Data/GameDataReset.cs
- https://raw.githubusercontent.com/MyPuppy/Launcher.kr_5136/HEAD/Launcher.kr_5136/KartRider.Data/ExcData/TuneSpec.cs
- https://raw.githubusercontent.com/kuronekowen/KartSpec/HEAD/Program.cs
- https://raw.githubusercontent.com/ILoveKartrider/P5136_Rust/HEAD/crates/p5136-core/src/kart_physics.rs
- https://raw.githubusercontent.com/ILoveKartrider/P5136_Rust/HEAD/crates/p5136-profile/src/catalog.rs
- https://raw.githubusercontent.com/ILoveKartrider/P5136_Rust/HEAD/PORTING_STATUS.md
- https://raw.githubusercontent.com/ILoveKartrider/KartRider-P236/HEAD/src/KartRider.P236.Server/Core/LegacyMultiplayerHandlers.cs
- https://raw.githubusercontent.com/Nezuko-Roblox/KartGame_Engine/HEAD/sources/paopao/Kart/Physics/PhysicSpec.cs
- https://raw.githubusercontent.com/Nezuko-Roblox/KartGame_Engine/HEAD/sources/paopao/Kart/GoPlayKart.cs
- https://raw.githubusercontent.com/Nezuko-Roblox/KartGame_Engine/HEAD/sources/paopao/Kart/GoKart.cs
- https://raw.githubusercontent.com/Nezuko-Roblox/KartGame_Engine/HEAD/sources/paopao/Misc/RigidbodyFPSWalker.cs
- https://raw.githubusercontent.com/Nezuko-Roblox/KartGame_Engine/HEAD/sources/paopao/Kart/AI/AIController.cs
- https://raw.githubusercontent.com/Nezuko-Roblox/KartGame_Engine/HEAD/sources/paopao/Kart/AI/AISpeedEnhancer.cs
- https://raw.githubusercontent.com/Nezuko-Roblox/KartGame_Engine/HEAD/sources/paopao/Kart/Controllers/KartBasicController.cs
- https://raw.githubusercontent.com/Nezuko-Roblox/KartGame_Engine/HEAD/sources/paopao/Game/JobApplyUFO.cs
- https://raw.githubusercontent.com/Nezuko-Roblox/KartGame_Engine/HEAD/sources/paopao/Game/Items/GameItemManager.cs
- https://raw.githubusercontent.com/Nezuko-Roblox/KartGame_Engine/HEAD/sources/paopao/Game/Items/GameItem.cs
- https://raw.githubusercontent.com/Nezuko-Roblox/KartGame_Engine/HEAD/sources/paopao/Items/ItemBox.cs
- https://raw.githubusercontent.com/Nezuko-Roblox/KartGame_Engine/HEAD/sources/paopao/Items/GameObjects/GoItemWaterBomb.cs
- https://raw.githubusercontent.com/Nezuko-Roblox/KartGame_Engine/HEAD/sources/paopao/Items/GameObjects/GoItemBanana.cs
- https://raw.githubusercontent.com/Nezuko-Roblox/KartGame_Engine/HEAD/sources/paopao/Items/GameObjects/GoItemWaterMissile.cs
- https://raw.githubusercontent.com/Nezuko-Roblox/KartGame_Engine/HEAD/sources/paopao/Items/ITEMS_DOCUMENTATION.md
- https://raw.githubusercontent.com/Nezuko-Roblox/KartGame_Engine/HEAD/sources/paopao/Boost/AdBoost.cs
- https://raw.githubusercontent.com/Nezuko-Roblox/KartGame_Engine/HEAD/sources/paopao/Kart/Physics/DriftGauge.cs
- https://raw.githubusercontent.com/Nezuko-Roblox/KartGame_Engine/HEAD/src/core/KartMove/PhysicSpec.lua
- https://raw.githubusercontent.com/Nezuko-Roblox/KartGame_Engine/HEAD/docs/%E5%AE%8C%E6%95%B4%E8%B5%9B%E8%BD%A6%E5%8F%82%E6%95%B0%E6%8A%80%E6%9C%AF%E6%96%87%E6%A1%A3.md
- https://raw.githubusercontent.com/Evestir/Nothing/HEAD/Dump/Offsets/UKartBodyParam_offsets.h
- https://raw.githubusercontent.com/Evestir/Nothing/HEAD/Dump/Offsets/UKartChannelParam_offsets.h
- https://raw.githubusercontent.com/Evestir/Nothing/HEAD/Dump/Offsets/UKartChannelParamList_offsets.h
- https://raw.githubusercontent.com/whotookzakum/kart.cafe/HEAD/src/routes/stats/%2Bpage.svelte
- https://raw.githubusercontent.com/whotookzakum/kart.cafe/HEAD/src/routes/stats/%2Bpage.server.js
- https://raw.githubusercontent.com/whotookzakum/kart.cafe/HEAD/src/routes/stats/KtKartUpgradeCustomSetDef.json
- https://raw.githubusercontent.com/whotookzakum/kart.cafe/HEAD/src/lib/data/itemModeDropRates/solo.json
- https://raw.githubusercontent.com/whotookzakum/kart.cafe/HEAD/src/lib/data/itemModeDropRates/rankDefs.json
- https://raw.githubusercontent.com/whotookzakum/kart.cafe/HEAD/src/lib/data/karts.json
- https://raw.githubusercontent.com/whotookzakum/kart.cafe/HEAD/README.md
- https://github.com/Nezuko-Roblox/KartGame_Engine
- https://github.com/yanygm/Launcher_V2
- https://github.com/Evestir/Nothing
- https://github.com/whotookzakum/kart.cafe
