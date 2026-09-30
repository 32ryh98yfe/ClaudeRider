# L3 request: one bot identity scheme (names, characters, karts) for server, client and HUD

Owner: L3 (AI). Affects: `apps/server/src/lobby/server.ts` (L10), `apps/client/src/game/Session.ts` and the results
and name-tag UI (L9), and the `@cr/sim` index (orchestrator).

## Why

14-ai §9 specifies a bot identity of the form `{prefix}-{NN} {colour}`. The name is a pure function of the room seed.
It travels in English on the wire, and each viewer renders it in their own locale, Korean first. `packages/sim/src/ai/identity.ts`
implements this:

- `fillBotSlots(content, slots, { roomSeed, tier })` gives unique names. It picks a character not used by another bot,
  and not by a human while the roster allows. It picks the character's preferred kart archetype (long drift style →
  drift or balance body; chain → balance or speed), plus the tier and `vMul`.
- `localizeBotName(name, 'ko' | 'en')` translates bot names and passes human names through unchanged.

`packages/sim/test/ai-behaviour.test.ts` covers both. Today the lobby and the offline Session each build their own
`BOT_NAMES` strings, with random kart bodies and English-only names.

## Proposed changes

1. `packages/sim/src/index.ts`: export the identity helpers. This is additive.
   ```diff
    export { createAiDriver } from './ai/driver.ts';
    export { AI_EXECUTION } from './ai/profiles.ts';
   +export { fillBotSlots, localizeBotName, formatBotName, parseBotName, botNameParts, type BotLocale } from './ai/identity.ts';
   +export { TakeoverController, TAKEOVER_AFTER_TICKS } from './ai/takeover.ts';
   +export { InputDelayLine } from './ai/lookahead.ts';
   ```
2. `apps/server/src/lobby/server.ts` `buildConfig`: build the slots as today, marking bot slots `kind: 'bot'` with the
   chosen tier. Then fill them in one pass:
   ```diff
   -      return { kind: 'bot', team: x.team, name: `${BOT_NAMES[(rb[i]! + i) % BOT_NAMES.length]}-${10 + (rb[i + 8]! % 90)}`, characterId, kartBodyId, ai: tier, vMul: AI_TIERS[tier].vMul };
   +      return { kind: 'bot', team: x.team, name: '', characterId, kartBodyId, ai: tier, vMul: AI_TIERS[tier].vMul };
        });
   +    const filled = fillBotSlots(this.content, slots, { roomSeed: seedA, tier: slots.map((s) => s.ai ?? st.botTier) });
   ```
   Here `seedA` is the room seed that goes into `RaceConfig.seed`, and `filled` replaces `slots` in the returned config.
3. `apps/client/src/game/Session.ts` (offline races): do the same with `fillBotSlots(content, slots, { roomSeed: seed, tier: this.opts.tier })`.
4. Name tags, the results screen and the minimap legend: render `localizeBotName(slot.name, locale)`.

RaceRoom already passes `{ character, role, lookaheadTicks }` and the race config to `createAiDriver` (the L2 cfg
call site), so nothing is needed there.
