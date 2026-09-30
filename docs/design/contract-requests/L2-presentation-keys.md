# L2 → L10 / L11: item and effect presentation keys, and the state they are driven by

**Lane:** L2 ITEMS · **For:**
- L10 UI (icons, HUD, feed, i18n);
- L11 FX+AUDIO (VFX by `vfxKey`, SFX by the sfx keys).

**Source of truth:** `packages/content/src/items/<id>.ts` and `packages/content/src/effects/<id>.ts`, field `presentation`. The tables below are generated from those files. `packages/sim/test/items-content.test.ts` enforces the key patterns and that every name and description key exists in both locales.

## Key patterns
| Key | Pattern | Owner |
|---|---|---|
| item `iconKey` | `items/<id>` | L10 `ui/icons/items/<id>.ts` (plus the Codex slot `icon.item.<id>`) |
| item `vfxKey` | `item.<id>` | L11 `render/vfx/items/<vfxKey>.ts` |
| item `sfxUse` / `sfxHit` / `sfxLoop` | `item.<id>.use` / `.hit` / `.loop` | L11 `audio/sfx/` |
| item `nameKey` / `descKey` | `items.<id>.name` / `items.<id>.desc` | L2 `i18n/{ko,en}/items.ts` |
| effect `iconKey` **(new)** | `effects/<id>` | L10: status icon in the HUD and standings |
| effect `vfxKey` **(new)** | `effect.<id>` | L11: continuous VFX while the effect is active |
| effect `sfxStart` / `sfxLoop` / `sfxEnd` **(new)** | existing audio ids (see the table) | L11 |
| effect `nameKey` / `descKey` | `items.effect.<id>.name` / `items.effect.<id>.desc` | L2 |
| item category | `items.category.<speed\|attack\|trap\|defense\|utility>` | L2 |
| item UI strings | `items.ui.{aimFail, locking, locked, lateSignal ({ms}), fastEscape, slotLocked, incoming, noTarget, teamOnly}` | L2 |

The **only new SFX id** that `32-audio-spec` does not list is `item.throttle_drone.hit`, played when a throttle stack lands. Every other key already exists in `32-audio-spec` §5.

## Items (18)
| code | id | KR / EN | category | iconKey | vfxKey | sfxUse | sfxHit | sfxLoop |
|---|---|---|---|---|---|---|---|---|
| 1 | `turbo_token` | 터보 토큰 / Turbo Token | speed | `items/turbo_token` | `item.turbo_token` | `item.turbo_token.use` | — | — |
| 2 | `attention_tether` | 어텐션 테더 / Attention Tether | speed | `items/attention_tether` | `item.attention_tether` | `item.attention_tether.use` | `item.attention_tether.hit` | — |
| 3 | `overclock_aura` | 오버클럭 오라 / Overclock Aura | speed | `items/overclock_aura` | `item.overclock_aura` | `item.overclock_aura.use` | `item.overclock_aura.hit` | `item.overclock_aura.use` |
| 4 | `prompt_missile` | 프롬프트 미사일 / Prompt Missile | attack | `items/prompt_missile` | `item.prompt_missile` | `item.prompt_missile.use` | `item.prompt_missile.hit` | — |
| 5 | `top1_missile` | 톱-1 미사일 / Top-1 Missile | attack | `items/top1_missile` | `item.top1_missile` | `item.top1_missile.use` | `item.prompt_missile.hit` | — |
| 6 | `token_bomb` | 토큰 폭탄 / Token Bomb | attack | `items/token_bomb` | `item.token_bomb` | `item.token_bomb.use` | `item.token_bomb.hit` | — |
| 7 | `bug_report` | 버그 리포트 / Bug Report | attack | `items/bug_report` | `item.bug_report` | `item.bug_report.use` | `item.bug_report.hit` | — |
| 8 | `broadcast_bolt` | 브로드캐스트 볼트 / Broadcast Bolt | attack | `items/broadcast_bolt` | `item.broadcast_bolt` | `item.broadcast_bolt.use` | — | — |
| 9 | `throttle_drone` | 스로틀 드론 / Throttle Drone | attack | `items/throttle_drone` | `item.throttle_drone` | `item.throttle_drone.use` | — | `item.throttle_drone.loop` |
| 10 | `firewall` | 파이어월 / Firewall | trap | `items/firewall` | `item.firewall` | `item.firewall.use` | `item.firewall.hit` | — |
| 11 | `glitch_puddle` | 글리치 웅덩이 / Glitch Puddle | trap | `items/glitch_puddle` | `item.glitch_puddle` | `item.glitch_puddle.use` | `item.glitch_puddle.hit` | — |
| 12 | `redaction_cloud` | 검열 구름 / Redaction Cloud | trap | `items/redaction_cloud` | `item.redaction_cloud` | `item.redaction_cloud.use` | `item.redaction_cloud.hit` | — |
| 13 | `mirror_mode` | 미러 모드 / Mirror Mode | attack | `items/mirror_mode` | `item.mirror_mode` | `item.mirror_mode.use` | `item.mirror_mode.hit` | — |
| 14 | `context_shield` | 컨텍스트 실드 / Context Shield | defense | `items/context_shield` | `item.context_shield` | `item.context_shield.use` | `item.context_shield.hit` | — |
| 15 | `interrupt_pulse` | 인터럽트 펄스 / Interrupt Pulse | defense | `items/interrupt_pulse` | `item.interrupt_pulse` | `item.interrupt_pulse.use` | — | — |
| 16 | `alignment_halo` | 얼라인먼트 헤일로 / Alignment Halo | defense | `items/alignment_halo` | `item.alignment_halo` | `item.alignment_halo.use` | — | — |
| 17 | `interpretability_lens` | 해석 렌즈 / Interpretability Lens | utility | `items/interpretability_lens` | `item.interpretability_lens` | `item.interpretability_lens.use` | — | — |
| 18 | `mutex_lock` | 뮤텍스 락 / Mutex Lock | utility | `items/mutex_lock` | `item.mutex_lock` | `item.mutex_lock.use` | — | — |

## Effects (20)
`modMask bit` means `KartStatus.modMask & (1 << bit)` is set while the effect is active. It is rebuilt every tick in phase 2 and also covers the hard CC in `status.cc` and the shield/halo windows.

| code | id | KR / EN | class | modMask bit | iconKey | vfxKey | sfxStart | sfxLoop | sfxEnd | overlay / kinematic |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `airborne` | 공중 부양 / Airborne | hardCC | 0 | `effects/airborne` | `effect.airborne` | `item.prompt_missile.hit` | — | — | kinematic airborne |
| 2 | `trap_bomb` | 토큰 버블 / Token Bubble | hardCC | 1 | `effects/trap_bomb` | `effect.trap_bomb` | `item.token_bomb.hit` | `item.trap_loop` | `item.escape_pop` | kinematic trap |
| 3 | `trap_bug` | 버그 버블 / Bug Bubble | hardCC | 2 | `effects/trap_bug` | `effect.trap_bug` | `item.bug_report.hit` | `item.trap_loop` | `item.escape_pop` | kinematic trap |
| 4 | `spin` | 스핀 / Spin-out | hardCC | 3 | `effects/spin` | `effect.spin` | `item.spin` | — | — | kinematic spin |
| 5 | `stun` | 감전 / Stunned | hardCC | 4 | `effects/stun` | `effect.stun` | `item.stun_zap` | — | — | — |
| 6 | `post_stun_slow` | 감속 / Slowed | softCC | 5 | `effects/post_stun_slow` | `effect.post_stun_slow` | — | — | — | — |
| 7 | `throttle` | 스로틀 429 / Throttled 429 | softCC | 6 | `effects/throttle` | `effect.throttle` | `item.throttle_drone.hit` | `item.throttle_drone.loop` | — | — |
| 8 | `tether_pull` | 테더 끌기 / Tether Pull | buff | 7 | `effects/tether_pull` | `effect.tether_pull` | `item.attention_tether.hit` | — | — | kinematic tether |
| 9 | `slingshot` | 슬링샷 / Slingshot | buff | 8 | `effects/slingshot` | `effect.slingshot` | — | — | — | — |
| 10 | `overclock` | 오버클럭 / Overclock | buff | 9 | `effects/overclock` | `effect.overclock` | `item.overclock_aura.use` | `item.overclock_aura.use` | — | — |
| 11 | `turbo` | 터보 / Turbo | buff | 10 | `effects/turbo` | `effect.turbo` | `item.turbo_token.use` | — | — | — |
| 12 | `escape_boost` | 탈출 부스트 / Escape Boost | buff | 11 | `effects/escape_boost` | `effect.escape_boost` | — | — | — | — |
| 13 | `redaction` | 검열됨 / Redacted | softCC | 12 | `effects/redaction` | `effect.redaction` | `item.redaction_cloud.hit` | — | — | overlay redaction |
| 14 | `mirror` | 미러 / Mirrored | softCC | 13 | `effects/mirror` | `effect.mirror` | `item.mirror_mode.hit` | — | — | overlay mirror |
| 15 | `slot_lock` | 슬롯 잠금 / Slot Locked | softCC | 14 | `effects/slot_lock` | `effect.slot_lock` | `item.mutex_lock.use` | — | — | — |
| 16 | `shield` | 실드 / Shield | defense | 15 | `effects/shield` | `effect.shield` | `item.context_shield.use` | — | `item.context_shield.hit` | — |
| 17 | `halo` | 헤일로 / Halo | defense | 16 | `effects/halo` | `effect.halo` | `item.alignment_halo.use` | — | `item.context_shield.hit` | — |
| 18 | `pulse_guard` | 펄스 가드 / Pulse Guard | defense | 17 | `effects/pulse_guard` | `effect.pulse_guard` | `item.interrupt_pulse.use` | — | — | — |
| 19 | `lens_reveal` | 렌즈 / Lens | buff | 18 | `effects/lens_reveal` | `effect.lens_reveal` | `item.interpretability_lens.use` | — | — | — |
| 20 | `firewall_hit` | 방화벽 충돌 / Firewall Hit | softCC | 19 | `effects/firewall_hit` | `effect.firewall_hit` | `item.firewall.hit` | — | — | — |

## What drives each visual (read-only sim state)
Import the helpers with `import { … } from '@cr/sim/items/public.ts'`. They are pure functions of public state, so they are safe in render code and on predictors.

| Visual / HUD element | Read from |
|---|---|
| Item slots | `kart.items.slot0/slot1` (item codes; 0 = empty). The front slot is used first; after a use, slot 1 moves up. |
| Roulette | `items.rouletteSlot` (−1 none, 0/1), `rouletteEnd` (lands at this tick), `rouletteBox`. On a predictor, the slot holds **0 until the grant arrives**, so keep spinning the UI (ADR-007). The `itemGranted` event marks the landing. |
| Aim reticle | `items.aimTarget` (255 none), `items.aimLockTicks`. Yellow while `aimLockTicks > 0`; red when it reaches `lockNeed(def.aim.lockTicks)` (17 for the tether, 24 for the missile). The client UI chooses `InputFrame.aim` (the candidate slot) each tick; the sim validates cone and range (+5° / +10 m). |
| Projectiles | `world.projectiles[]`: `code` (item), `px/py/pz` (the drawn position, including the terminal blend onto the victim), `phase` (0 cruise, 1 terminal), `target`, `spawn`, `commit`, `impact`. `s` is a **race distance**, not a path arc length. |
| Incoming warning (arrow, beeps) | `projectileEta(w, ctx, p)` for projectiles with `p.target === me`. Show it from ETA ≤ 120 ticks; the beep interval goes 24 → 5 ticks. |
| Hazards | `world.hazards[]`: `code` (item), `px/py/pz`, `radius`, `arm` (armed from this tick; for the Token Bomb it is the landing tick, and the lob starts at `arm − 36` from the owner), `expire`, `owner`, `flags` (Redaction Cloud: bit per slot already hit). Firewall blocks are 3 separate hazards (2.4 × 1.6 × 1.2 m visual), and drop in over the 24 arm ticks. |
| Telegraphs | Pending effects in `world.effects` with `start > tick` and no RESOLVED flag (`e.flags & 1 === 0`): bolt (21), mirror (30), mutex (21), a teammate's halo (21), the tether hook (12). `e.victim` shows where to draw. |
| Hard-CC animation | `status.cc` (effect code), `status.ccStart`, `status.ccEnd`. Airborne lift is `airborneLift(tick − ccStart, 66)` (peak 4 m at tick 33). The spin model turns 2 revolutions over the spin's 60 ticks. The trap bubble floats 1 m. |
| Mash prompt | `mash` event `{kart, remaining}`; `escape` event `{kart, effect, fast, credits}` (show "빠른 탈출!" when `fast`). |
| Shield / halo bubble | `status.shieldUntil`, `status.haloUntil` (> tick = up), `status.shieldGraceUntil`. An absorb emits `effect{result: 'shielded'}` and `effectEnd{effect: shield\|halo}`. |
| Tether beam | active `tether_pull` in `world.effects`; the target is `tetherTarget(e)` (param bits 0–3). |
| Item boost flame | `drive.boostKind === 4` (`Boost.ITEM`). |
| Status icons | `status.modMask` bits (table above). |

## One-shot events (B4; dedupe keys use types 80–92)
| Event | Fields |
|---|---|
| `itemUse`, `itemFizzle` | `kart`, `item`, `obj` |
| `projSpawn`, `projImpact` | `obj`, `item` |
| `hazardSpawn`, `hazardRemove` | `obj`, `item` |
| `effect` | `victim`, `effect`, `source`, `result` (`hit` / `shielded` / `immune` / `immune_grace` / `miss`) |
| `effectEnd` | `victim`, `effect` |
| `mash`, `escape` | as above |
| `box`, `itemGranted` | `box {kart, boxId}` (a personal box broke); `itemGranted {kart, item}` (the roulette landed) |
| `boostStart` | `{kind: 4}` (Turbo Token) |

- **Feed lines** ("{attacker}의 {item} → {victim} · 명중"): use the `effect` event's `source` / `victim` / `result` (source ≠ victim).
- **Late signal:** `reject` decisions (EVENTS 0x03, reason 6 or 2, refund 1) carry it.
