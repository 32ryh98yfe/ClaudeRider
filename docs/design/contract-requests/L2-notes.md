# L2 ITEMS: state layout, authority/predictor split, [P] decisions, notes for other lanes

**Lane:** L2 ITEMS. Informational: the only frozen-file edit is `L2-events-escape.md`. The per-lane items below are requests or heads-ups.

## 1. State layout: no new fields
The runtime fits the existing B2 fields. `state.ts`, `world.ts`, `quant.ts` and `hash.ts` are unchanged, so snapshots and `hashWorld` already cover all item state.

### EffectInstance
| Field | Meaning |
|---|---|
| `id` | `mix4(seed ^ 0x45ff0000, code, victim, start)`; the seed is the originating object id or the parent effect id |
| `start` / `end` | Active while `start ≤ tick < end` |
| `result` | 0 hit, 1 shielded, 2 immune, 3 immune_grace. Non-hits are removed at resolution, so resolved entries are always hits |
| `flags` (u8) | 1 RESOLVED, 2 BLOCKABLE, 4 HAZARD (track source, never shielded), 8 PROXIMITY (tether slingshot), 16 ENDED (early end, removed in phase 8), 32 DRIVER (the hard CC currently driving `status.cc`), 64 DEAD (never visible after a phase) |

`param` is always an integer (zigzag on the wire):

| Effect | `param` |
|---|---|
| hard CC driver | impact planar speed × 4096 |
| `tether_pull` | target slot \| 16 \| wall-blocked ticks << 5 |
| `overclock` | bitmask of slots already spun by this aura |
| `firewall_hit` | packed bounce normal (2 × 12 bits) |

### ProjectileState
| Field | Meaning |
|---|---|
| `s` | **Race distance D** along the route (not a path arc length) |
| `path` | Path whose geometry draws the route (it follows the target onto branches that cover D) |
| `u`, `h` | Lateral and height offsets |
| `px/py/pz` | Drawn position (terminal blend included) |
| `phase` | 0 cruise, 1 terminal |
| `impact` | Preset to `spawn + 72` for the drone |

### HazardState
| Field | Meaning |
|---|---|
| `arm` | Armed from this tick. For the Token Bomb it is the landing tick, and `expire = arm` |
| `radius` | Contact radius |
| `flags` | Redaction Cloud: bit per slot already hit |
| `team` | Owner's team |

The Firewall is 3 separate hazards (index 0–2 in the id).

### KartStatus and KartItems
Used as specified. Phase 8 canonicalizes these to 0 once they are ≤ tick (10-sim-spec §1.3):
- `immuneUntil`, `shieldUntil`, `shieldGraceUntil`, `haloUntil`;
- `boxRespawn[]`;
- `rouletteEnd` / `rouletteBox` (to 0 / −1 once no roulette spins).

`modMask` holds bit `code − 1` for every active effect, including the hard CC and the shield/halo windows.

### Object ids
`objectId(code, owner, useTick, index) = mix4(…) || 1` (R7), allocation-free (no rest parameters).

## 2. Authority vs predictor (B3, 20-netcode-spec §8)
**Authority-only:**
- **The roll only.** `items/boxes.ts` asks `ctx.authority.rollItem` and emits `grant`.
- **The "more than a lap behind" override is not secret.** Every peer writes Turbo Token itself. The authority still emits the grant.

**Predictor reads back:**
- `grant` (it can never compute one);
- `commit` when already known. It prefers the authority's impact tick in case it mispredicted a remote kart. Otherwise it computes the same ETA rule.

**Shared:** everything else is computed identically from inputs and state (targets, contacts, results, mash, rerolls' validity). The authority emits these decisions for the feed and for late joiners:
- `use`, `reject`, `commit`, `effect` (only for leads > 0), `result`, `hazard`, `hazardRemove`.

**`applyDecision(w, d)`:** appends to `w.decisions` and returns:
- `null` for a future decision;
- `null` for a grant whose roulette is still spinning in the predicted world. It patches the slot in place, because the content only matters from P + 30.
- `d.tick` otherwise. The caller restores the snapshot before that tick and re-simulates.

**Predictor without the grant:** keeps the roulette spinning up to P + 60 with slot content 0, then gives up and waits for the next snapshot.

**Evidence** (`items-predictor.test.ts`):
- Zero-latency loopback: the hash is identical every tick for a full solo race (meadow_loop) and a squad race (proving_ring), with 0 rollbacks.
- Decisions delivered 6 ticks late plus snapshot-restore reconciliation: 0 mismatches over 1000+ checked ticks.

**Hook-less authority:** an authority `StepContext` without `authority` hooks (the M1 test rig, `ghostLap`, tools) falls back to a local key derived from the public seed, and emits into `w.decisions`. Real rooms always pass hooks, and the secret never enters the sim.

## 3. Roll hook encoding (for L9)
`AuthorityHooks.rollItem(slot, boxId, tick, bucket)` is frozen and has no reroll parameter. Validity rerolls 0–3 therefore travel in the **high 16 bits of `boxId`** (`boxId | reroll << 16`; box ids are u16). `items/roll.ts rollItem` decodes them.

- **`RaceRoom` already passes `boxId` straight through, so nothing needs to change.** Please keep it that way, or add an explicit reroll parameter later and tell L2.
- **Message words:** `[raceIdLo = cfg.seed, raceIdHi = FNV(trackHash|trackId), slot, boxId, P, reroll]`, as little-endian u32.
- **Key:** the 128-bit secret folds into HalfSipHash's 64-bit key as `k0 = s0 ^ s2`, `k1 = s1 ^ s3`.
- The implementation matches the reference HalfSipHash-2-4 test vectors.

**Wire sizes the codec must allow:**

| Field | Range |
|---|---|
| `effect.flags` | u8 (bits ≤ 64) |
| `effect.dur` | ≤ 600 |
| `hazard.life` | ≤ 1800 (u16) |
| `EffectInstance.param` | up to 2²⁴ |
| `use.obj` / `commit.obj` | full u32 |

Projectiles can exceed 16 concurrent only in extreme cases (8 karts × 2 slots). Please size the list codec for 32 to be safe.

## 4. Decisions and deviations marked [P]
1. **Team/light `mid` bucket** is turbo 35 / mutex 2, not the listed 34 / 3. Six rows tie at a remainder of 2/3 for five units. The stated rule "ties by ITEM_IDS order" gives turbo (index 0) the unit, and solo/light `high` confirms that rule. §8.3 should be corrected. All 15 other variant buckets match the spec exactly (`items-content.test.ts`).
2. **One box pickup per kart per tick.** Boxes touched while the kart's own roulette spins are *not* consumed. With full slots a box still breaks for nothing [S].
3. **Swap** is allowed at any time (also in CC) except while the roulette spins into slot 0. A swap while it spins into slot 1 moves the roulette to slot 0. **After a use, slot 1 moves up to slot 0.**
4. **Refused uses** (CC, slot lock, cooldown, respawn/warp, finished) emit `reject{refund: 1}` and consume nothing. An empty or spinning slot emits nothing.
5. **Effect caps are absolute** (`vT ← min(vT, cap·V_REF)`). They are folded into the multiplicative `KartMods.vCapMul` using the tick's vT estimate (the boost target when boosting, else vGrip). If L1 prefers an explicit absolute field, add `KartMods.vCap` (api.ts, additive) and L2 will switch.
6. **Kinematics:**
   - Hard-CC curves are applied after kart dynamics and before the move (in `useItems`).
   - Airborne keeps the kart grounded; the lift is visual (ADR), and `airborneLift()` is used for the > 3 m ground-trap immunity.
   - Traps pin the speed to 0 after 12 ticks.
   - Spin eases to ×0.45 over 20 ticks, then coasts.
7. **Tether:**
   - The target must also be **ahead in race distance** ("aim (ahead)"; a kart that has turned around cannot lock backwards).
   - The pull ends without a slingshot when the user respawns or takes a hard CC.
   - Proximity release: within ±4 m along the target's forward and ≤ 4 m laterally.
   - Heads-up: at the spec'd pull (1.25·u_target, floor 40.8 m/s) the closing speed on a cruising target is only ≈ 8.5 m/s, about 19 m in 2.2 s, but the minimum lock range is 25 m. The slingshot therefore happens only when the target slows (hit, corner, braking). Otherwise the tether is a 2.2 s speed buff. Tune `tether_pull` or the range if the KRD "magnet reaches" feel is wanted.
8. **Overclock** with friendly fire `all`: touching a teammate spins the teammate, ends the aura and spins the user (KRD rule).
9. **Firewall and Token Bomb** (area) also hit their owner. The bomb always lands on the main path.
10. **Drone** follows the spline route with an adaptive step, so it arrives exactly at T + 72 ("direct" = fixed flight time).
11. **Redaction Cloud** `maxPerOwner` is 2 (unspecified). The puddle's owner is immune for 120 ticks.
12. **Finished or retired karts** cannot use items or open boxes; effects on them resolve as `miss`.
13. **Contact hits have no lead:** puddle, cloud, firewall, aura and bomb landing resolve immediately in phase 5.

## 5. Notes for other lanes
- **L1 SIM:**
  - (a) The glancing wall response (15°–45°) turns the nose parallel to the wall by projecting the *heading*. With a large drift slip the nose can end up opposite to the velocity (observed `f·v = −10 m/s`, a drift into the outer wall on proving_ring). The kart then drives the wrong way until the wrong-way respawn, ≈ 4.5 s. Suggest choosing the tangent sign from the velocity, as the > 45° branch does with the track tangent.
  - (b) `lowSpeedTicks` counts during traps (the speed is pinned to 0), which affects manual-R eligibility and the L3 stuck logic.
- **L3 AI:** see `L2-ai-items-callsite.md` (call site, stuck recovery during CC, redaction noise).
- **L9 NET:** §3 above, and the fallback call site in `L2-ai-items-callsite.md`.
- **L10 / L11:** `L2-presentation-keys.md`.
- **Client helpers:** `@cr/sim/items/public.ts`, for example `projectileEta`, `airborneLift`, `lockNeed`, `IT`/`EF`, `activeEffect`, `tetherTarget`. Optional: re-export it from `packages/sim/src/index.ts` (not an L2 file).

## 6. Evidence
Tests: `pnpm vitest run --project sim --maxWorkers=1`. The item files are listed below.

| Test file | Tests | What it checks |
|---|---|---|
| `items-content` | 8 | Registries; key patterns; i18n keys; §3 effect table; drop sums; §8.3 variants |
| `items-timeline` | 25 | Every item's use, spawn, commit, S and end ticks |
| `items-status` | 13 | Refresh; 36 immunity; stacks and caps; shield/halo/grace/hazard; mash 76/61/48 and floor; late taps |
| `items-roll` | 13 | HalfSipHash vectors; weights; buckets and overrides; rerolls; secret determinism; predictor never rolls; personal boxes; roulette P + 30; full slots |
| `items-predictor` | 4 | See §2 |
| `items-races` | 7 | 6 seeded 8-bot races (solo/duo/squad, standard/light/chaos) all 8/8 finishers, worst stuck ≤ 105 ticks, no NaN or off-route projectiles; every item used and every effect applied |

A wider 24-race exploration (all tiers including rookie-only fields, friendly fire `all`) gave 8/8 finishers in every race, worst stuck 134 ticks, median 88.

Sim cost: the item modules account for ≈ 5% of `step()` time in an item race. The step is dominated by L1's `locate` and `groundRay`.
