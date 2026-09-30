# L2 → L3 (and L9): the single call site for bot item usage

**Lane:** L2 ITEMS · **For:**
- L3 AI: `packages/sim/src/ai/driver.ts`;
- L9 NET: `packages/room/src/RaceRoom.ts`, as a fallback.

**Status:** requested. L2 does not edit either file.

Bot item logic (14-ai-spec §6) lives in `packages/sim/src/ai/items/` and is exported from `ai/items/index.ts`. It runs after the driver has filled the `InputFrame`, and it only **adds** item intent:
- `Edge.USE_ITEM`, `Edge.SWAP`, `Edge.TAP_L` / `Edge.TAP_R` (mash-out);
- `aim` (target slot);
- `Held.LOOK_BACK` (rear Prompt Missile).

**One exception:** under Mirror Mode it flips `out.steer` once the bot has "noticed" the reversal. Skill 3 bots flip from the start (the mirror is telegraphed 30 ticks ahead in public state), skill 2 after half their reaction time, skill 1 after the full reaction time.

It reads only public world state and holds its own seeded PRNG, so it is deterministic given the world. It is safe with the 8-tick lookahead: after each USE or SWAP press it locks itself out for 12 ticks, so delayed inputs never double-fire.

Without this call, bots in `RaceRoom` never use items in item mode. Today the driver only presses USE when `boosters > 0`, which never happens in item mode.

## Requested diff (L3, `ai/driver.ts`)
```diff
+import { createItemBrain, decideItem, type ItemEnv } from './items/index.ts';
+import type { RaceConfig } from '../core/state.ts';

-export function createAiDriver(track: BakedTrack, content: ContentTables, slot: number, profile: AiProfile = AI_TIERS.pro, personality: Partial<AiProfile> = {}, seed = 1): AiDriver {
+export function createAiDriver(track: BakedTrack, content: ContentTables, slot: number, profile: AiProfile = AI_TIERS.pro, personality: Partial<AiProfile> & { itemHoarding?: number } = {}, seed = 1,
+  cfg?: Readonly<Pick<RaceConfig, 'teams' | 'rules' | 'laps'>>): AiDriver {
   const prof: AiProfile = { ...profile, ...personality };
+  const brain = createItemBrain(slot, prof, { itemHoarding: personality.itemHoarding, aggression: prof.aggression }, seed ^ 0x17e5);
+  const env: ItemEnv = { track, content, cfg: cfg ?? { teams: 'solo', laps: track.laps,
+    rules: { retireTicks: 600, friendlyFire: 'area', itemSet: 'standard', rubberBand: false, instantBoostInItem: true } } };
   …
     decide(w: Readonly<WorldState>, out: InputFrame): void {
       …existing body…
+      decideItem(brain, w, env, out);   // last statement: item intent on top of the driving frame
     },
```

`RaceRoom` (L9) then passes the config and the character's hoarding:
```diff
-      const pers = cm ? { aggression: cm.personality.aggression } : {};
-      return createAiDriver(o.track, o.content, i, tier, pers, (o.config.seed ^ (i * 7919)) >>> 0);
+      const pers = cm ? { aggression: cm.personality.aggression, itemHoarding: cm.personality.itemHoarding } : {};
+      return createAiDriver(o.track, o.content, i, tier, pers, (o.config.seed ^ (i * 7919)) >>> 0, o.config);
```

- The personality field `itemHoarding` is not part of `AiProfile`. Hence the widened `personality` type, which is additive to B8.
- **Alternative if L3 prefers not to change the signature:** `RaceRoom.tick()` calls `decideItem(brains[i], w, this.ctx, this.inputs[i])` right after `bot.decide(...)`. A `StepContext` satisfies `ItemEnv`.

`packages/sim/test/items-rig.ts` composes exactly this: driver, then `decideItem` with the race's `StepContext`. `items-races.test.ts` is the evidence (6 seeded races, 8/8 finishers each, full item and effect coverage).

## Related driver notes (L3 / L1)
1. **Stuck recovery during traps.**
   - Traps pin the kart's speed to 0 for up to 132 ticks, so `drive.lowSpeedTicks` grows during them.
   - The driver's "`lowSpeedTicks > 120` → reverse" then kicks in right after a long trap.
   - Suggest skipping stuck recovery while `status.cc !== 0` and for ~30 ticks after it.
2. **Redaction.** 14-ai-spec §6 wants perception noise: line noise ×2 while `status.modMask & (1 << 12)` (the `redaction` bit). The brain already adds +30 ticks to its own item reaction.
3. **Mirror Mode → wall → reversed nose.**
   - Under Mirror Mode, before it adapts, the driver drifts into the outer wall.
   - L1's glancing-hit response (15°–45°) then projects the nose onto the wall plane from the *heading*. With a big drift slip this can leave `f · v < 0` (observed −10 m/s on proving_ring).
   - The bot then drives the wrong way until the wrong-way respawn, which took ≈ 4.5 s.
   - See `L2-notes.md` §5 for the L1 suggestion.
   - The brain's mirror adaptation brought the worst stuck episode across 24 exploration races from 287 down to 134 ticks.
