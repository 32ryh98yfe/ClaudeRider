# 12 — Items and status effects spec

Owner: L2 ITEMS (`sim/src/items/**`, `content/src/{items,effects}/**`, `content/src/droptables.ts`, `sim/src/ai/items/**`). Visuals: L11 (by `vfxKey`), icons: L10 (`ui/icons/items/<id>.ts`), SFX: L11 (`sfxUse`/`sfxHit`).
Sources: ADR-007 (SCE, boxes, roulette), ADR-010 (timings, status rules, buckets), `03-items.md` §6–§9, gap-4 §3–§6, B1/B3/B7 in `02-contracts.md`.
Status keys: **[S]** sourced · **[V]** validated · **[P]** proposed. Ticks at 60 Hz; seconds in parentheses. All item speeds are relative to **V_REF = 34 m/s** (gap-2 §2).

---

## 1. Inventory rules (ADR-010)
| Rule | Value |
|---|---|
| Slots | 2. The **front** slot (`slot0`) is used first. |
| Use | `Edge.USE_ITEM` (Ctrl / Space / gamepad A). At most once per 6 ticks (`lastUseTick`). |
| Swap | `Edge.SWAP` (Alt / E / gamepad B) swaps `slot0` and `slot1`. No limit per race [P; the KRD "5 swaps" claim is unverified]. Not allowed while the roulette spins into `slot0`. |
| Discard | None. You dump an item by using it [S]. |
| Full slots | A box still breaks and gives nothing [S]. |
| Refused use | During hard CC, during `slot_lock`, during respawn phases 1–2, during warp transit, or before GO: the use edge is refused inside `step()` (no decision, no consumption). |
| Aim failure | An aimed item (Prompt Missile, Attention Tether) used without a lock is **consumed** and fizzles ("조준 실패", KRD rule [S]). |
| Speed mode | No items; USE_ITEM fires boosters (`10-sim-spec.md` §7.2). |

---

## 2. Item catalogue (18 items, ids per B1)

### 2.1 Summary
| # | id | KR / EN name | Category | Team only | Target rule | Delivery | Applies (ticks) | Blocked by | Cleared by | Friendly fire | AI use | Buckets (solo) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `turbo_token` | 터보 토큰 / Turbo Token | speed | no | self | instant | `turbo` 180 (3.0 s) | — | — | — | straight | all |
| 2 | `attention_tether` | 어텐션 테더 / Attention Tether | speed | no | aim (ahead) | hook 12 ticks | `tether_pull` 132 (2.2 s) → `slingshot` 36 | **unblockable** | pulse (target side) | may target teammates | targetAhead60 | high, mid, low |
| 3 | `overclock_aura` | 오버클럭 오라 / Overclock Aura | speed | no | self | instant; contact 2.2 m | `overclock` 180; victims `spin` 60 | shield, halo (victim) | — | never (spins both with `all`) | straight | mid, low |
| 4 | `prompt_missile` | 프롬프트 미사일 / Prompt Missile | attack | no | aim (ahead, or behind with look-back) | homing projectile | `airborne` 66 (1.1 s) → recovery `escape_boost` 60 | shield, halo | — | never | targetAhead60 | high, mid |
| 5 | `top1_missile` | 톱-1 미사일 / Top-1 Missile | attack | no | leader | homing projectile | `airborne` 66 → recovery 60 | shield, halo | — | never; fizzles if the leader is you or a teammate | rank3plus | mid, low |
| 6 | `token_bomb` | 토큰 폭탄 / Token Bomb | attack (area) | no | lob ahead | lob 36 ticks, lands 32 m ahead on the centreline | `trap_bomb` 132 (2.2 s), mash-out, `escape_boost` 30 | shield, halo | — | **area** (hits the thrower too) | targetAhead60 | high, mid, low |
| 7 | `bug_report` | 버그 리포트 / Bug Report | attack | no | next opponent ahead | homing projectile | `trap_bug` 84 (1.4 s), mash-out, `escape_boost` 30 | shield, halo | — | never (skips teammates) | always | high, mid |
| 8 | `broadcast_bolt` | 브로드캐스트 볼트 / Broadcast Bolt | attack | no | all opponents ahead | telegraph 21 ticks | `stun` 54 (0.9 s) → `post_stun_slow` 48 (0.8 s) | shield, halo | — | never | rank3plus | low |
| 9 | `throttle_drone` | 스로틀 드론 (429) / Throttle Drone | attack | no | leader | drone, fixed 72-tick flight | `throttle` 210 (3.5 s) per stack, ≤ 3 stacks | **unblockable** | pulse (incl. in flight) | never; fizzles if the leader is you or a teammate | rank3plus | high, mid, low |
| 10 | `firewall` | 파이어월 / Firewall | trap (area) | no | ahead of the leader | 3 blocks 45 m ahead, arm 24 | `firewall_hit` 24 (speed ×0.35 + bounce) | shield, halo | — | **area** | rank3plus | high, mid, low |
| 11 | `glitch_puddle` | 글리치 웅덩이 / Glitch Puddle | trap (area) | no | drop behind | hazard, arm 18, life 1800 | `spin` 60 (1.0 s) | shield, halo | — | **area** | pursuerBehind15 | top, high |
| 12 | `redaction_cloud` | 검열 구름 / Redaction Cloud | trap | no | drop behind | volume r 10 m, life 600 | `redaction` 180 (3.0 s) overlay | shield, halo | — | never | pursuerBehind15 | top |
| 13 | `mirror_mode` | 미러 모드 / Mirror Mode | attack | no | all opponents ahead | telegraph 30 ticks | `mirror` 150 (2.5 s) reversed steering | shield, halo | — | never | rank3plus | high, mid |
| 14 | `context_shield` | 컨텍스트 실드 / Context Shield | defense | no | self | instant | `shield` 180 (3.0 s), absorbs 1 hit, grace 18 | — | — | — | incomingThreat | top, high |
| 15 | `interrupt_pulse` | 인터럽트 펄스 / Interrupt Pulse | defense | no | self (solo) / team | instant | clears drones and opponent tethers; `pulse_guard` 90 (1.5 s) | — | — | — | onDrone | top, high |
| 16 | `alignment_halo` | 얼라인먼트 헤일로 / Alignment Halo | defense | **yes** | team | instant (teammates lead 21) | `halo` 210 (3.5 s), absorbs 1 hit each | — | — | — | incomingThreat | team: high, mid, low |
| 17 | `interpretability_lens` | 해석 렌즈 / Interpretability Lens | utility | **yes** | team | instant | `lens_reveal` 600 (10 s): opponents' slots shown | — | — | — | always | team: top |
| 18 | `mutex_lock` | 뮤텍스 락 / Mutex Lock | utility | **yes** | all opponents | lead 21 | `slot_lock` 150 (2.5 s): no item use | shield, halo | — | never | always | team: high, mid |

Priority: all 18 are P0 except Interpretability Lens and Mutex Lock (P2, R11). If a P2 item is not implemented, it is removed from the drop tables by the validity reroll (§8.4), never by editing the table weights.

### 2.2 Per-item parameters (ItemDef fields, B7)

#### 2.2.1 `turbo_token` — Turbo Token (KRD booster role)
- `target: 'self'`, `applies: [{ effect: 'turbo', to: 'self', leadTicks: 0 }]`.
- The `turbo` behaviour writes the kart's boost timer: `boostTicks = min(boostTicks + 180, 270)`, `boostKind = item` (same boost law as a gauge booster: `vT = vBoost`, `a = min(25, 4·(vT − u))`). Using a second Turbo while boosting adds 180 capped at 270 remaining [P, 03-items "cap 3.0 s" scaled to 4.5 s].
- Presentation: icon `items/turbo_token`, vfx `item.turbo_token` (coral token sucked into the exhaust + item flame), sfx use `item.turbo_token.use` (rising saw + noise whoosh).

#### 2.2.2 `attention_tether` — Attention Tether (KRD magnet role)
- `target: 'aim'`, `aim: { coneDeg: 18, rangeMin: 25, rangeMax: 150, lockTicks: 21, allowRear: false }`.
- Hook flight 12 ticks (visual line of "attention head" dots), then `tether_pull` on **self** for 132 ticks (2.2 s): `applies: [{ effect: 'tether_pull', to: 'self', leadTicks: 12 }]`.
- Pull (`10-sim-spec.md` §7.3 row 6): boost law toward `vT = max(40.8, min(1.25·u_target, 44.4))` (1.2·V_REF floor [ADR-010]); the user's steering is replaced by pursuit toward the target's current (path, s, u) (kinematic `tether`); throttle forced on; drift ended at start.
- Ends early, with a **slingshot** (`slingshot` 36 ticks at 42.5 m/s = 1.25·V_REF), when the user is within 4 m behind the target (along the target's forward). Ends without a slingshot when: blocked by a wall for > 18 ticks (0.3 s), the target warps, finishes or retires, or an Interrupt Pulse from the target or the target's team clears it.
- Unblockable by shield and halo (ADR-010). May target teammates [P, KRD magnet].
- No lock at use → consumed, fizzle.
- Presentation: vfx `item.attention_tether` (dotted attention beam), sfx `item.attention_tether.use` (FM warble), `.hit` (clunk on attach).

#### 2.2.3 `overclock_aura` — Overclock Aura (KRD siren role)
- `applies: [{ effect: 'overclock', to: 'self', leadTicks: 0 }]`: 180 ticks (3.0 s) of boost law toward `vBoost`; the user is immune to `spin` while it lasts.
- Contact (phase 5, each tick): any opponent whose contact point is within **2.2 m** of the user's gets `spin` 60 immediately (no lead; judged in the shared sim like a bump). Each victim at most once per aura.
- Team play: teammates are never spun unless `friendlyFire = 'all'`, in which case user and teammate are both spun (KRD rule).
- Blocked by the victim's shield/halo.
- Presentation: vfx `item.overclock_aura` (spinning spark halo + red/blue strobes), sfx use `item.overclock_aura.use` (two-tone synth siren loop), hit `item.overclock_aura.hit`.

#### 2.2.4 `prompt_missile` — Prompt Missile
- `aim: { coneDeg: 20, rangeMin: 10, rangeMax: 180, lockTicks: 30, allowRear: true }` (look-back held: lock a kart behind).
- `projectile: { speedMulVref: 1.9, plusTargetSpeed: 20, lifeTicks: 600, passWalls: true, route: 'spline' }` → speed `max(64.6, u_target + 20)` m/s. Life 600 ticks (10 s) [P: raised from 03-items' 8 s so a lock at 180 m always connects at the minimum 20 m/s closing speed].
- `applies: [{ effect: 'airborne', to: 'victim', leadTicks: 21 }]` via terminal commit (§4.2).
- Warning for the victim from ETA ≤ 120 ticks (2.0 s): HUD arrow + beeps (interval 24 → 5 ticks), computed from projectile state (cosmetic).
- Presentation: vfx `item.prompt_missile` (capsule with spark fins, `>_` text-ribbon trail), sfx use `item.prompt_missile.use`, lock beeps `ui.lock_beep`, hit `item.prompt_missile.hit`.

#### 2.2.5 `top1_missile` — Top-1 Missile
- `target: 'leader'`, `validity: 'notIfLeaderSelfOrTeam'` (fizzles and is consumed if you are 1st or the leader is a teammate [S]).
- `projectile: { speedMulVref: 1.9, plusTargetSpeed: 0, lifeTicks: 1800, passWalls: true, route: 'spline' }` → 64.6 m/s (ADR-010). Life 1800 ticks [P] so it always reaches the leader (a 44.4 m/s leader is closed at ≥ 20 m/s).
- Same hit as the Prompt Missile. Distinct fanfare launch sound `item.top1_missile.use`; gold vfx with a "#1" glyph.

#### 2.2.6 `token_bomb` — Token Bomb (KRD water-bomb role)
- `lob: { flightTicks: 36, aheadM: 32, radius: 6.25, dy: 3, centerline: true }`: lands at the **centreline** 32 m ahead of the thrower's main-line progress (`sMain + 32`, u = 0) [S KRD centre landing]. Logic radius 6.25 m, visual 6.5 m.
- At the landing tick L = T + 36, every kart (including the thrower) with horizontal distance ≤ 6.25 m in the landing point's tangent plane, `|dy| ≤ 3 m` and height above ground ≤ 3 m gets `trap_bomb` 132 (2.2 s). Judged on each victim's own timeline; the 36-tick flight is the lead.
- Friendly fire: area (teammates are hit unless `friendlyFire = 'off'`).
- On a 14–18 m road the edges (≥ 6.25 m from the centre) are safe [S].
- Presentation: vfx `item.token_bomb` (lobbed sphere → bubble of floating token glyphs), sfx use `item.token_bomb.use` (falling whistle), hit `item.token_bomb.hit` (pop + bubble loop).

#### 2.2.7 `bug_report` — Bug Report (KRD water-fly role)
- `target: 'nextAheadOpponent'` (the opponent directly ahead in rank; teammates skipped [S]).
- `projectile: { speedMulVref: 2.35, plusTargetSpeed: 0, lifeTicks: 600, passWalls: true, route: 'spline' }` → 79.9 m/s [P: absolute-speed conversion of 03-items' 2.0 × 40 m/s, the same rule gap-2 applied to the missile].
- `applies: [{ effect: 'trap_bug', to: 'victim', leadTicks: 21 }]`: 84 ticks (1.4 s), mash-out, escape boost 30.
- Presentation: vfx `item.bug_report` (cute flying bug, bubble wrap), sfx use `item.bug_report.use` (buzz that grows louder with proximity), hit `.hit`.

#### 2.2.8 `broadcast_bolt` — Broadcast Bolt (KRD thunderbolt role)
- `target: 'allAheadOpponents'` (by race distance at T). One scheduled effect per victim with **lead 21** = the telegraph (sky flicker: the chance to raise a shield).
- `applies: [{ effect: 'stun', to: 'victim', leadTicks: 21 }]`; `stun` 54 ticks (no control, cap ×0.5·V_REF) `onEnd` → `post_stun_slow` 48 ticks (cap ×0.8·V_REF).
- Low bucket only [S].
- Presentation: vfx `item.broadcast_bolt` (sky flash + bolt onto each victim), sfx use `item.broadcast_bolt.use` (noise crack + sub boom).

#### 2.2.9 `throttle_drone` — Throttle Drone "429" (KRD UFO role)
- `target: 'leader'`, `validity: 'notIfLeaderSelfOrTeam'`.
- `projectile: { speedMulVref: 0, plusTargetSpeed: 0, lifeTicks: 72, passWalls: true, route: 'direct' }`: fixed 72-tick flight (1.2 s); commit at T + 51, impact S = T + 72.
- `applies: [{ effect: 'throttle', to: 'victim', leadTicks: 21 }]`: 210 ticks (3.5 s) per stack; stacks are independent `(start, end)` pairs, ≤ 3 concurrent. Cap = `(0.60 − 0.08·(n − 1)) · V_REF` → 20.4 / 17.7 / 15.0 m/s for n = 1/2/3; gauge gain ×0.5 (only matters in modes with a gauge). A 4th stack replaces the oldest.
- **Not blocked** by shield or halo; cleared only by Interrupt Pulse (also while in flight) [S].
- Presentation: vfx `item.throttle_drone` (hex drone showing "429", tractor-beam cone), sfx use `item.throttle_drone.use`, loop `item.throttle_drone.loop` (90 Hz saw + 6 Hz wobble).

#### 2.2.10 `firewall` — Firewall (KRD barricade role)
- `target: 'aheadOfLeader'`: in solo, the leader; in team modes, the **highest-ranked opponent** [P deliberate change from KRD, 03-items §6]. Fizzles if the user is that kart.
- Placement at T + 0: 3 blocks (2.4 × 1.6 × 1.2 m) at the target's `sMain + 45 m` on the target's AI racing line (`lineU`), lateral offsets −3, 0, +3 m, clamped to half-width − 1.5 m; a single block where the path is narrower than 8 m (branches only). `drop: { behindM: 0, lifeTicks: 900, armTicks: 24, radius: 1.3, maxPerOwner: 3 }`, `behavior: 'firewall'`.
- A kart sphere touching an armed block gets `firewall_hit` (unless absorbed) and the block shatters (removed). No effect on a kart on a rail or a boost pad [S]; the block still shatters.
- Friendly fire: area.
- Presentation: vfx `item.firewall` (brick-shader blocks with flame noise, drop-in over 24 ticks), sfx use `item.firewall.use`, hit `item.firewall.hit`.

#### 2.2.11 `glitch_puddle` — Glitch Puddle (KRD banana role)
- `drop: { behindM: 3, throwForwardM: 18, lifeTicks: 1800, armTicks: 18, radius: 1.3, maxPerOwner: 5 }`. Dropped 3 m behind (one settle ray at spawn). Forward toss (hold brake while using: 18 m ahead) is P2.
- Trigger: kart contact point within 1.3 m (horizontal) of the puddle centre, height above ground ≤ 3 m → `spin` 60; the puddle is consumed. The owner is immune to their own puddle for 120 ticks after the drop [P, classic dropper immunity]. A 6th puddle removes the owner's oldest.
- Friendly fire: area.
- Presentation: vfx `item.glitch_puddle` (pixel-noise decal with RGB split), sfx use `.use`, hit `item.glitch_puddle.hit` (bit-crushed squelch).

#### 2.2.12 `redaction_cloud` — Redaction Cloud (classic dark cloud role)
- Dropped 3 m behind, centred 2 m above the road: sphere r 10 m, `lifeTicks 600` (10 s), `armTicks 18`.
- A kart entering it gets `redaction` 180 ticks (3.0 s: 120 opaque + 60 fade) once per cloud (per-slot bit in `hazard.flags`). The minimap stays visible [S classic]. Bots get perception noise instead (`14-ai-spec.md` §6).
- Top bucket only.
- Presentation: vfx `item.redaction_cloud` (ink-black particle cloud; screen overlay of ████ bars), sfx `.use` (low-pass whoosh), `.hit`.

#### 2.2.13 `mirror_mode` — Mirror Mode (classic devil role)
- `target: 'allAheadOpponents'`; telegraph **30 ticks** (mirrored-arrow glyph over each victim) = lead 30.
- `applies: [{ effect: 'mirror', to: 'victim', leadTicks: 30 }]`: 150 ticks (2.5 s) of reversed steering. Shield-blockable (one consistent rule).
- Presentation: vfx `item.mirror_mode`, sfx `.use` (descending arpeggio), `.hit`.

#### 2.2.14 `context_shield` — Context Shield
- `applies: [{ effect: 'shield', to: 'self', leadTicks: 0 }]`: window 180 ticks from the **stamped use tick**; absorbs 1 hit; then 18 ticks of grace (`immune_grace`).
- Blocks everything except Throttle Drone and Attention Tether. Does not block track hazards.
- Presentation: vfx `item.context_shield` (Fresnel bubble, scrolling token-window texture), sfx use `.use` (bell-like FM chime), absorb `item.context_shield.hit` (glass pop), late signal `net.late_signal`.

#### 2.2.15 `interrupt_pulse` — Interrupt Pulse "^C" (KRD EMP role)
- Instant at T. Solo: self; team modes: self and all teammates.
- Removes every `throttle` stack on them and every drone projectile targeting them; ends every **opponent** `tether_pull` whose target is one of them (no slingshot). A teammate's tether is not broken [S].
- Grants `pulse_guard` 90 ticks (1.5 s): new drones (hits) are refused (`immune`).
- Presentation: vfx `item.interrupt_pulse` (expanding ring with a "^C" glyph), sfx `.use` (band-pass noise sweep).

#### 2.2.16 `alignment_halo` — Alignment Halo (team; KRD angel role)
- `applies: [{ effect: 'halo', to: 'team', leadTicks: 21 }]`; the user's own halo starts at T (lead 0), teammates at T + 21 (fixed v1 lead; gap-4's adaptive `clamp(⌈RTT⌉ + 4, 6, 21)` is v2).
- 210 ticks (3.5 s), absorbs 1 hit per teammate, same exceptions as the shield.
- Presentation: vfx `item.alignment_halo` (gold torus halo over each teammate), sfx `.use` (choir-like pad).

#### 2.2.17 `interpretability_lens` — Interpretability Lens (team; KRD scanner role) — P2
- `applies: [{ effect: 'lens_reveal', to: 'team', leadTicks: 0 }]`: 600 ticks (10 s); the standings board shows the opposing team's held items. Unblockable.
- Note: full-world snapshots already contain every kart's slots, so the Lens is a UI permission, not a secret; this is acceptable for a fan game.
- Presentation: vfx `item.interpretability_lens` (magnifier sweep over the standings), sfx `.use` (soft scan blip).

#### 2.2.18 `mutex_lock` — Mutex Lock (team; classic item lock) — P2
- `target: 'opponentsAll'`, `applies: [{ effect: 'slot_lock', to: 'victim', leadTicks: 21 }]`: 150 ticks (2.5 s); victims cannot use items (they can still pick them up). Shield/halo-blockable.
- Presentation: vfx `item.mutex_lock` (padlock over enemy slots), sfx `.use` (heavy clunk).

---

## 3. Effects (20, ids per B1; EffectDef fields, B7)
| id | Class | durTicks | Stacking | Immunity after | Mods | Mash | onEnd | Behaviour |
|---|---|---|---|---|---|---|---|---|
| `airborne` | hardCC | 66 (1.1 s) | refresh | 36 | noControl, noItems, kinematic `airborne` | — | `escape_boost` 60 (recovery) | speed eased to ×0.25 of the speed at impact; visual lift peaking 4.0 m at tick 33; active boost and drift cancelled at start |
| `trap_bomb` | hardCC | 132 (2.2 s) | refresh | 36 | noControl, noItems, kinematic `trap` | credit 7, floor 48, max 12, gap 3 | `escape_boost` 30 | speed → 0 over 12 ticks; bubble floats 1 m (visual) |
| `trap_bug` | hardCC | 84 (1.4 s) | refresh | 36 | same as `trap_bomb` | same | `escape_boost` 30 | same |
| `spin` | hardCC | 60 (1.0 s) | refresh | 36 | noControl, noItems, kinematic `spin` | — | — | speed eased to ×0.45 over 20 ticks; velocity direction kept; the model spins 2 turns (render only) |
| `stun` | hardCC | 54 (0.9 s) | refresh | 36 | noControl, noItems, vCapMul 0.5 | — | `post_stun_slow` 48 | electric shock visual |
| `post_stun_slow` | softCC | 48 (0.8 s) | refresh | 0 | vCapMul 0.8 | — | — | — |
| `throttle` | softCC | 210 (3.5 s) per stack | stackDuration3 | 0 | vCapMul 0.60 (−0.08 per extra stack), gaugeMul 0.5 | — | — | counts active stacks (≤ 3) |
| `tether_pull` | buff (self) | 132 (2.2 s) | refresh | 0 | kinematic `tether` (steer override, throttle on) | — | `slingshot` 36 only when ended by proximity (≤ 4 m) | pursuit toward the target's (path, s, u); wall-block break after 18 ticks |
| `slingshot` | buff | 36 (0.6 s) | refresh | 0 | vTarget 42.5 (boost law) | — | — | — |
| `overclock` | buff | 180 (3.0 s) | refresh | 0 | vTarget = kart vBoost (boost law); immune to `spin` | — | — | 2.2 m contact spin (§2.2.3) |
| `turbo` | buff | 180 (3.0 s) | extend (cap 270 remaining) | 0 | vTarget = kart vBoost | — | — | writes `boostTicks`, `boostKind = item` |
| `escape_boost` | buff | 30 (0.5 s) | refresh | 0 | instant-boost law (floor 9 m/s² to 1.05·vGrip) | — | — | writes `instTicks = durTicks` |
| `redaction` | softCC | 180 (3.0 s) | refresh | 0 | overlay `redaction` (opaque 120, fade 60) | — | — | bots: perception noise |
| `mirror` | softCC | 150 (2.5 s) | refresh | 0 | steerInvert, overlay `mirror` | — | — | — |
| `slot_lock` | softCC | 150 (2.5 s) | refresh | 0 | noItems | — | — | — |
| `shield` | defense | 180 (3.0 s) | refresh | 0 | absorbs 1 hit | — | — | on absorb: ends, `shieldGraceUntil = S + 18` |
| `halo` | defense | 210 (3.5 s) | refresh | 0 | absorbs 1 hit | — | — | on absorb: ends, grace 18 |
| `pulse_guard` | defense | 90 (1.5 s) | refresh | 0 | refuses new `throttle` | — | — | — |
| `lens_reveal` | buff | 600 (10 s) | refresh | 0 | UI only | — | — | — |
| `firewall_hit` | softCC | 24 (0.4 s) | refresh | 0 | accelMul 0.5 | — | — | onStart: forward speed ×0.35, bounce 3 m/s along the block normal |

Kinematic curves use arithmetic only: `smoothstep(x) = x·x·(3 − 2x)` with `x = k / dur`.

---

## 4. Delivery mechanics

### 4.1 Aim and lock (Prompt Missile, Attention Tether)
- Each tick in phase 6, for the item in `slot0` that has `aim`:
  - The candidate is `input.aim` (the client's UI lock; bots set it too). It is valid if it is another racing kart (not finished, not in warp transit), within `[rangeMin, rangeMax + 10]` m, and inside the cone widened by the **+5° margin** (ADR-007) around `f` (or `−f` when look-back is held and `allowRear`).
  - Cone tests compare cosines with literal constants (cos 23° = 0.92050, cos 25° = 0.90631).
  - Same valid candidate as last tick → `aimLockTicks += 1`; otherwise `aimLockTicks = valid ? 1 : 0`, `aimTarget = candidate`.
- Locked when `aimLockTicks ≥ 0.8 · lockTicks` (≥ 80% dwell, gap-4) → reticle red.
- Use at T: locked → fire at `aimTarget`; not locked → consumed, `itemFizzle` (KRD).
- The client reticle goes yellow when a candidate appears and red at lock.

### 4.2 Homing projectiles (ADR-010)
- State `(path, s, u, h)` plus world `(px, py, pz)` for rendering (B2 `ProjectileState`). Ids are `hash32(type, owner, useTick, slot)` (ADR-007), 16-bit on the wire.
- Each tick (phase 5): advance `s` by `speed·DT` along the main-line progress toward the target; follow the target's branch when the target is on a branch ahead; `u`, `h` ease toward the target's `u`, `h`. Walls and jumps are ignored (spline route).
- **Terminal guidance**: when `ETA = (D_target − D_proj) / (speed − u_target) ≤ 21` ticks, the authority emits `commit{obj, victim, impact = tick + 21}` and the projectile blends from the spline route to the victim's own position with `smoothstep((t − Tc)/21)`, so the impact tick is exactly `S = Tc + 21`.
- At `S`, the SCE is evaluated on the victim's timeline (§6.2).
- A rear missile travels backwards along s; ETA uses the absolute closing speed.
- Target finishes, retires, or the projectile's life ends → removed (`itemFizzle` for the shooter's feed; no effect). Target in warp transit → the projectile holds its s until the exit, then continues.

### 4.3 Lobs and drops
| Kind | Spawn | Arm / landing | Contact test | Removal |
|---|---|---|---|---|
| Token Bomb | `HazardState` at the landing point (sMain + 32, u = 0) | landing at T + 36 | once at landing (§2.2.6) | at landing (visual bubble persists on the victims) |
| Glitch Puddle | 3 m behind, settled on ground | T + 18 | every tick while armed | on hit, at life end (1800), or owner overflow |
| Redaction Cloud | 3 m behind, 2 m up | T + 18 | every tick; once per kart | life end (600) |
| Firewall block ×3 | target sMain + 45 on `lineU` | T + 24 | kart sphere vs OBB each tick | on hit or life end (900) |
- Hazard ids: `hash32(type, owner, useTick, index)`; hazards live in `WorldState.hazards` sorted by id.
- A ground trap never hits a kart more than 3 m above the ground (physical air height plus the `airborne` visual lift) [ADR-010].
- Items dropped inside a `noItem` zone fizzle.

### 4.4 Area and team targeting
- "Ahead" and "behind" use race distance D. "Opponent" = different team (in solo, everyone else).
- `aheadOfLeader` in team modes resolves to the highest-ranked opponent (§2.2.10).

---

## 5. Item boxes and roulette (ADR-007, ADR-010)

### 5.1 Boxes
| Rule | Value |
|---|---|
| Layout | rows of 4–6 at 3 m spacing; ≈ L/250 ± 1 rows per lap; first row ≥ 60 m after the line (`11-track-spec.md` §8.2) |
| Pickup | kart contact point within 1.8 m of the box centre, not in respawn phases, not in warp transit |
| Personal | a box breaks **per racer**: `boxRespawn[box·8 + slot] = tick + 150 + (hash32(boxId) mod 31)` → 150–180 ticks (2.5–3.0 s), derived from the box id |
| Full slots | box breaks, no item, `box` event only |
| Speed mode / Time Attack | boxes absent (not rendered, no pickups) |

### 5.2 Roll (authority only)
- At pickup tick P, bucket `b = bucket(slot, P)` (§8.2).
- `h = HalfSipHash-2-4(secret128, [raceIdLo, raceIdHi, slot, boxId, P, reroll])` → uint32; `x = h mod 100`; walk the bucket's rows in table order summing weights; the first row whose running sum exceeds x wins.
- Validity rerolls (`reroll` = 1…3) then `turbo_token` (§8.4).
- `emit({ k: 'grant', tick: P, slot, item, boxId })`. The secret key never leaves the authority; predictors never see it.

### 5.3 Roulette
- Pickup at P: `rouletteSlot` = first empty slot, `rouletteEnd = P + 30` (0.5 s), `rouletteBox = boxId`.
- The item becomes usable at `max(P + 30, tick the grant is known)`. A predictor without the grant keeps the roulette spinning up to `P + 60`, and the UI keeps spinning beyond that until `ITEM_GRANTED` arrives (ADR-007).
- A grant that arrives after `P + 30` rolls the predictor back to P (the slot content matters from P + 30 on).
- Roulette visual: 8–12 icon ticks, decelerating, landing on the granted icon (`ui.roulette_tick` SFX).

---

## 6. Status rules (ADR-010, gap-4)

### 6.1 Classes
- **Hard CC**: `airborne`, `trap_bomb`, `trap_bug`, `spin`, `stun`. Stored in `KartStatus.cc/ccStart/ccEnd`.
- **Soft CC**: `post_stun_slow`, `throttle`, `redaction`, `mirror`, `slot_lock`, `firewall_hit`.
- **Buffs**: `tether_pull`, `slingshot`, `overclock`, `turbo`, `escape_boost`, `lens_reveal`.
- **Defense**: `shield`, `halo`, `pulse_guard`.

### 6.2 Resolution at the start tick S (phase 2, effectId order)
For each effect instance with `start == tick`, on the victim:
1. Unblockable (Throttle Drone, Attention Tether) skip step 2.
2. **Shield** active (`shieldUntil > S`) → `result = shielded`, shield consumed, `shieldGraceUntil = S + 18`. Else **halo** active → same with `haloUntil`. Else inside grace (`shieldGraceUntil > S`) → `immune_grace`.
3. Hard CC and `immuneUntil > S` → `immune`.
4. `throttle` and `pulse_guard` active → `immune`.
5. Otherwise `hit`: apply. Hard CC: if a hard CC is active, `ccEnd = max(ccEnd, S + dur)` and the effect with the later end drives the kinematics (refresh, never stack); else start it. At the end of a hard CC, `immuneUntil = ccEnd + 36`.
6. The authority emits `result{eff, victim, result}`; predictors compute the same result from the same state.

### 6.3 Other rules
- Only `throttle` stacks (≤ 3 concurrent pairs).
- Hard CC cancels the active boost (`boostTicks`, `startTicks`, `instTicks`) and the drift; stored boosters and items are kept.
- Items cannot be used during hard CC or `slot_lock` (refused inside `step()`).
- Track hazards use the same effects with source 255 and are never shielded.
- A kart more than 3 m above the ground is immune to ground traps.

### 6.4 Mash-out (traps) [ADR-010]
- `Edge.TAP_L` / `TAP_R` are latched between ticks. A tap is **credited** only if its direction is opposite to the last credited tap, at least 3 ticks have passed since the last credit (≤ 20 Hz), and fewer than 12 credits exist in this trap.
- Each credit removes 7 ticks from `ccEnd`; the trap can't end earlier than `ccStart + 48`.
- Escape times: 6 Hz tapping ≈ 76 ticks (1.27 s), 10 Hz ≈ 61 ticks (1.02 s), ≥ 14 Hz → 48 ticks (0.80 s) for the bomb; the bug trap reaches its 48-tick floor after 6 credits.
- On escape (natural or mashed): `escape_boost` 30 (instant-boost law). The HUD shows remaining taps (`hud.mash`), and "빠른 탈출!" when escape happens at the floor.
- A late tap frame is credited at its arrival tick, never lost.

### 6.5 Friendly fire (ADR-008, ADR-010)
`RaceConfig.rules.friendlyFire`:
| Value | Teammates are hit by |
|---|---|
| `off` | nothing |
| `area` (**default**, team item) | `token_bomb`, `firewall`, `glitch_puddle` |
| `all` | everything, including aura contact (spins both), aimed missiles and bolts |
The Token Bomb always hits its thrower; own puddles spare the owner for 120 ticks.

---

## 7. SCE timelines (ADR-007: fixed lead 21)
T = use tick (the tick stamped in the shooter's input). All ticks are server ticks; "victim timeline" means the victim's own predicted world.

| Item | T | Spawn / schedule | Commit | Start S | Result | Victim correction when inputs are on time |
|---|---|---|---|---|---|---|
| Prompt / Top-1 Missile | `use`, `projSpawn` | projectile flies on the spline | at ETA ≤ 21: `commit(Tc, lead 21)` | Tc + 21 | at S (`result`) | 0 |
| Bug Report | same | same | same | Tc + 21 | at S | 0 |
| Broadcast Bolt | `use` | `effect` per victim, lead 21 | — | T + 21 | at S | 0 (21 ticks covers RTT ≤ 250 ms) |
| Mirror Mode | `use` | `effect` per victim, lead 30 | — | T + 30 | at S | 0 |
| Mutex Lock | `use` | `effect` per victim, lead 21 | — | T + 21 | at S | 0 |
| Throttle Drone | `use`, `projSpawn` | fixed 72-tick flight | T + 51 | T + 72 | at S | 0 (late: 0.23 m per tick late) |
| Token Bomb | `use`, `hazard` (land T + 36) | lob | — | T + 36 (landing) | per victim at landing | 0 while the flight covers RTT |
| Glitch Puddle / Redaction Cloud | `use`, `hazard` (arm T + 18) | drop | — | contact after arm | per contact | 0 up to 200 ms RTT |
| Firewall | `use`, `hazard` ×3 (arm T + 24) | placed 45 m ahead of the target | — | contact after arm (≥ 61 ticks later in practice) | per contact | 0 |
| Attention Tether | `use` | self effect, lead 12 | — | T + 12 | — (unblockable) | 0 |
| Context Shield | `use` | self, lead 0 | — | T | — | 0; window starts at the **stamped** T |
| Alignment Halo | `use` | self lead 0, teammates lead 21 | — | T / T + 21 | — | 0 |
| Interrupt Pulse | `use` | clears at T | — | T | — | 0 |

Worked missile example at 100 ms RTT (gap-4 §4, re-based to lead 21): shooter stamps T = 1000 → server validates at 1000, `projSpawn` → at ETA ≤ 21 (server tick 1200) `commit(1200)` → the victim receives it ~8 ticks later, 13 ticks before S = 1221 → both sides evaluate shield/grace/immunity at 1221 → `result(1221)`.

**Late shield (v1)**: if the victim's shield edge (stamped before S) reaches the authority after S, the authority applies it at its arrival tick, where item use is refused (hard CC) → `reject{refund: 1}` and the shield stays in the slot; the client shows the bubble shattering with "늦은 신호 / late signal" (+N ms) in the feed. The bounded re-simulation rescue is deferred to v2 (ADR-007).

---

## 8. Drop tables and buckets

### 8.1 Standard tables (`packages/content/src/droptables.ts`, ADR-010; each bucket sums to 100)
**Solo**
| Item | Top (1st) | High (2nd–3rd) | Mid (4th–6th) | Low (7th–8th) |
|---|---|---|---|---|
| turbo_token | 5 | 10 | 26 | 45 |
| attention_tether | — | 5 | 14 | 22 |
| overclock_aura | — | — | 2 | 8 |
| prompt_missile | — | 20 | 18 | — |
| top1_missile | — | — | 3 | 5 |
| token_bomb | — | 10 | 14 | 4 |
| bug_report | — | 15 | 10 | — |
| broadcast_bolt | — | — | — | 6 |
| throttle_drone | — | 5 | 5 | 6 |
| firewall | — | 4 | 5 | 4 |
| glitch_puddle | 22 | 8 | — | — |
| redaction_cloud | 12 | — | — | — |
| mirror_mode | — | 2 | 3 | — |
| context_shield | 48 | 18 | — | — |
| interrupt_pulse | 13 | 3 | — | — |
| **Sum** | 100 | 100 | 100 | 100 |

**Team** (Duo and Squad)
| Item | Top | High | Mid | Low |
|---|---|---|---|---|
| turbo_token | 5 | 12 | 26 | 42 |
| attention_tether | — | 5 | 12 | 20 |
| overclock_aura | — | — | — | 7 |
| prompt_missile | — | 20 | 15 | — |
| top1_missile | — | — | 2 | 4 |
| token_bomb | — | 8 | 10 | — |
| bug_report | — | 15 | 12 | — |
| broadcast_bolt | — | — | — | 5 |
| throttle_drone | — | 5 | 5 | 8 |
| firewall | — | — | 4 | 4 |
| glitch_puddle | 20 | 8 | — | — |
| redaction_cloud | 10 | — | — | — |
| mirror_mode | — | 2 | 2 | — |
| context_shield | 40 | 15 | — | — |
| interrupt_pulse | 13 | 3 | 5 | 5 |
| alignment_halo | — | 5 | 5 | 5 |
| interpretability_lens | 12 | — | — | — |
| mutex_lock | — | 2 | 2 | — |
| **Sum** | 100 | 100 | 100 | 100 |

What the tables encode [S from KRD]: the leader gets no forward attacks (defence and rear traps); 7th–8th get 70–80% speed items; 2nd–3rd are the attack bucket; team tables move shield weight to halo and pulse.

### 8.2 Bucket function (ADR-010)
```
rank 1                         → top
p = (rank − 1) / (N − 1)        (N = racing karts in the race, bots included)
p ≤ 0.30 → high; p ≤ 0.72 → mid; else low        (N = 8: 1 / 2–3 / 4–6 / 7–8)
```
Distance overrides, applied in order at the pickup tick P:
1. More than one lap behind the racer directly ahead (`D_ahead − D_self > L`) → **turbo_token only** (no roll) [S classic].
2. More than 600 m behind the leader → low.
3. More than 350 m behind the leader → shift one bucket toward low, at most to mid (top → high, high → mid, mid stays).

### 8.3 Item-set variants (custom room `itemSet`) [P]
Computed from the standard tables by category multipliers, renormalized to 100 with largest-remainder rounding (ties by `ITEM_IDS` order). **light** = attack and trap ×0.5; **chaos** = attack and trap ×1.5, defense ×0.5. Categories: speed (turbo, tether, aura), attack (missiles, bomb, bug, bolt, drone, mirror), trap (firewall, puddle, cloud), defense (shield, pulse, halo), utility (lens, mutex).

Solo **light**: top shield 58, puddle 13, pulse 16, cloud 7, turbo 6 · high missile 15, shield 26, bug 11, bomb 7, turbo 15, puddle 6, drone 4, tether 7, firewall 3, pulse 4, mirror 2 · mid turbo 37, missile 13, bomb 10, tether 20, bug 7, drone 3, firewall 3, top1 2, mirror 2, aura 3 · low turbo 52, tether 25, aura 9, bolt 4, drone 3, top1 3, bomb 2, firewall 2.

Solo **chaos**: top shield 28, puddle 38, pulse 7, cloud 21, turbo 6 · high missile 25, shield 7, bug 19, bomb 12, turbo 8, puddle 10, drone 6, tether 4, firewall 5, pulse 1, mirror 3 · mid turbo 20, missile 21, bomb 16, tether 11, bug 12, drone 6, firewall 6, top1 3, mirror 3, aura 2 · low turbo 40, tether 20, aura 7, bolt 8, drone 8, top1 7, bomb 5, firewall 5.

Team **light**: top shield 47, puddle 12, pulse 15, lens 14, cloud 6, turbo 6 · high missile 14, shield 21, bug 11, turbo 17, bomb 6, puddle 6, halo 7, drone 3, tether 7, pulse 4, mutex 3, mirror 1 · mid turbo 34, missile 10, tether 16, bug 8, bomb 7, drone 3, halo 7, pulse 7, firewall 3, top1 1, mutex 3, mirror 1 · low turbo 47, tether 22, drone 4, aura 8, bolt 3, halo 6, pulse 6, top1 2, firewall 2.

Team **chaos**: top shield 23, puddle 34, pulse 7, lens 13, cloud 17, turbo 6 · high missile 26, shield 6, bug 19, turbo 10, bomb 10, puddle 10, halo 2, drone 7, tether 4, pulse 1, mutex 2, mirror 3 · mid turbo 22, missile 19, tether 10, bug 15, bomb 12, drone 6, halo 2, pulse 2, firewall 5, top1 3, mutex 2, mirror 2 · low turbo 40, tether 19, drone 11, aura 7, bolt 7, halo 2, pulse 2, top1 6, firewall 6.

### 8.4 Validity rerolls (ADR-010)
Up to 3 rerolls, then `turbo_token`, when the rolled item is:
- `top1_missile` or `throttle_drone` and the leader is the picker or a teammate;
- a team-only item in solo;
- a P2 item that is not implemented in the build;
- `firewall` when the picker is the target it would resolve to.

---

## 9. AI item usage (summary; full rules in `14-ai-spec.md` §6)
| `ai.use` | Items | Rule (after the tier's reaction delay) |
|---|---|---|
| `straight` | turbo_token, overclock_aura | next 60 m has Σ\|Δψ\| < 12°, not already boosting; aura also when an opponent is within 15 m ahead or beside |
| `targetAhead60` | prompt_missile, attention_tether, token_bomb | missile/tether: a lockable target in the cone (fire at lock); bomb: an opponent 20–45 m ahead within 6 m of the centreline |
| `pursuerBehind15` | glitch_puddle, redaction_cloud | an opponent within 15 m behind, or just before a narrow corner / branch entry |
| `incomingThreat` | context_shield, alignment_halo | an incoming projectile with ETA ≤ 24 + reaction ticks (perceived only after the warning starts at ETA 120), a bolt/mirror telegraph, a bomb landing within 8 m; halo also for a teammate's threat |
| `rank3plus` | top1_missile, broadcast_bolt, throttle_drone, firewall, mirror_mode | rank ≥ 3 (or ≥ 2 with a leader gap > 60 m) and valid |
| `onDrone` | interrupt_pulse | a drone stack on self/teammate, a drone in flight at self/teammate, or an opponent tether on self |
| `always` | bug_report, interpretability_lens, mutex_lock | as soon as valid |
Bots never read the secret key, other players' pending rolls, or authority-only state. `itemSkill` 0–3 scales timing quality; `itemHoarding` (personality) delays defensive items.

---

## 10. Presentation keys
| Key pattern | Owner | Example |
|---|---|---|
| `iconKey` = `items/<id>` | L10 `ui/icons/items/<id>.ts` (fallback) and Codex slot `icon.item.<id>` | `items/token_bomb` |
| `vfxKey` = `item.<id>` | L11 `render/vfx/items/<id>.ts` | `item.prompt_missile` |
| `sfxUse` = `item.<id>.use`, `sfxHit` = `item.<id>.hit` | L11 `audio/sfx/` | `item.context_shield.hit` |
| `nameKey` = `items.<id>.name`, `descKey` = `items.<id>.desc` | L2 i18n namespace `items` | `items.firewall.desc` |

Korean and English strings (namespace `items`):
| id | name.ko | name.en | desc.ko | desc.en |
|---|---|---|---|---|
| turbo_token | 터보 토큰 | Turbo Token | 3초 동안 부스터처럼 가속합니다. | Boost like a booster for 3 seconds. |
| attention_tether | 어텐션 테더 | Attention Tether | 조준한 상대에게 빠르게 끌려갑니다. 실드로 막을 수 없습니다. | Locks on and pulls you toward a rival. Shields can't stop it. |
| overclock_aura | 오버클럭 오라 | Overclock Aura | 3초간 부스터 속도로 달리며 부딪힌 상대를 회전시킵니다. | Boost for 3 s and spin out anyone you touch. |
| prompt_missile | 프롬프트 미사일 | Prompt Missile | 조준한 상대를 공중으로 날려 보냅니다. 벽을 통과합니다. | Launches the locked target into the air. Flies through walls. |
| top1_missile | 톱-1 미사일 | Top-1 Missile | 1등을 자동으로 추적해 날려 보냅니다. | Homes in on 1st place automatically. |
| token_bomb | 토큰 폭탄 | Token Bomb | 앞쪽 코스 중앙에 떨어져 주변 레이서를 가둡니다. | Lands mid-track ahead and traps everyone nearby. |
| bug_report | 버그 리포트 | Bug Report | 바로 앞 순위의 상대를 버블에 가둡니다. | Traps the rival directly ahead of you in a bubble. |
| broadcast_bolt | 브로드캐스트 볼트 | Broadcast Bolt | 앞선 모든 상대에게 번개를 내리칩니다. | Strikes every rival ahead of you. |
| throttle_drone | 스로틀 드론 | Throttle Drone | 1등의 속도를 제한합니다. 인터럽트 펄스로만 해제됩니다. | Caps the leader's speed. Only an Interrupt Pulse clears it. |
| firewall | 파이어월 | Firewall | 선두 앞에 불타는 벽돌을 세웁니다. | Drops burning blocks in front of the leader. |
| glitch_puddle | 글리치 웅덩이 | Glitch Puddle | 뒤에 남겨 밟은 상대를 회전시킵니다. | Leave it behind to spin out whoever drives over it. |
| redaction_cloud | 검열 구름 | Redaction Cloud | 지나가는 상대의 시야를 가립니다. | Blacks out the view of anyone who passes through. |
| mirror_mode | 미러 모드 | Mirror Mode | 앞선 상대들의 좌우 조작을 뒤집습니다. | Flips left and right for every rival ahead. |
| context_shield | 컨텍스트 실드 | Context Shield | 3초 동안 공격 한 번을 막습니다. | Blocks one attack within 3 seconds. |
| interrupt_pulse | 인터럽트 펄스 | Interrupt Pulse | 드론과 테더를 해제하고 잠시 드론을 막습니다. | Clears drones and tethers, then wards off drones briefly. |
| alignment_halo | 얼라인먼트 헤일로 | Alignment Halo | 팀 전원이 공격 한 번을 막습니다. | Every teammate blocks one attack. |
| interpretability_lens | 해석 렌즈 | Interpretability Lens | 상대 팀의 아이템을 10초간 보여 줍니다. | Reveals the rival team's items for 10 seconds. |
| mutex_lock | 뮤텍스 락 | Mutex Lock | 상대 팀이 잠시 아이템을 쓰지 못합니다. | Rivals can't use items for a moment. |

Item feed lines (namespace `hud`): `{attacker}의 {item} → {victim}` / "{attacker}'s {item} → {victim}", with suffixes 명중 HIT, 방어 BLOCKED, 면역 IMMUNE, 빗나감 MISS, 늦은 신호 LATE SIGNAL. The attacker's mascot cheers on a hit and sulks when blocked [S].

---

## 11. Tests (L2 done criteria)
| Suite | Pass |
|---|---|
| Per-item tick-exact unit tests | each item's spawn, arm, commit, impact and end ticks equal §2–§7 |
| Drop tables | every bucket of solo/team × standard/light/chaos sums to 100; `loadContent()` validates |
| Bucket function | N = 8 gives 1 / 2–3 / 4–6 / 7–8; each override case |
| Roll determinism | same secret + inputs → same grants; different secret → different grants; predictor never calls `rollItem` |
| CC rules | refresh never stacks and never shortens; 36-tick immunity; drone stacks ≤ 3; shield/halo exceptions; pulse clears in-flight drones |
| Mash-out | 6/10/14 Hz tap patterns give 76/61/48 ticks for the bomb; late taps shift by the lateness only |
| Authority vs predictor | zero-latency loopback: identical `hashWorld` every tick with items |
| Item-mode bot suite | 8 bots on every item-built track: every item used ≥ 1×, every effect applied ≥ 1× (E coverage) |
