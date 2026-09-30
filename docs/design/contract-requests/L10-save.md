# L10 → orchestrator: additive SaveV1 fields + migration (`apps/client/src/meta/save.ts`)

Lane L10 has an additive grant on `meta/save.ts`. This request records exactly what changed so the orchestrator can
review it at merge. `contracts.lock` was refreshed with `node tools/check-frozen.mjs --update`.

## Why
- Settings §9 of `31-ui-spec.md` needs more than M1's `SettingsV1` (render scale, FPS cap, per-effect overrides,
  gamepad bindings, deadzone, HUD toggles, accessibility, text scale, ghost toggles).
- Progression (`13-modes-rules.md` §10–§12) needs a challenge-rotation seed, the Quick Match skill estimate and NEW badges.
- Time Attack needs split times and run counts; the contract (B11) already names `records[track].ghostKey` and
  `profile.palette`, which the M1 file lacked.
- M1 loaded saves with a shallow merge and `importJson` accepted anything with `v === 1`. A corrupt or partial save
  could crash the UI.

## What changed (all additive; nothing was removed or renamed)
- `Livery`: optional `flame?`, `plate?`.
- `SettingsV1.volume.voice?`; optional `renderScale`, `fpsCap`, `shadows`, `particles`, `bloom`, `motionBlur`,
  `muteUnfocused`, `pad`, `deadzone`, `instantHint`, `cameraDistance`, `racingLine`, `minimapInSpeed`, `nameTags`,
  `itemFeed`, `colorBlind`, `highContrast`, `textScale`, `ghost`, `proGhost`, `firstRunTipSeen`.
- `profile`: optional `palette`, `title`, `seed`, `lastRace`.
- `progress`: optional `recent`, `fresh`.
- `records[track]`: new exported type `TrackRecord`, with optional `ghostKey`, `splits` and `runs`.
- New exports: `DEFAULT_KEYS_EXTRA` (UI actions from §7.1: emotes, standings, restart, F7/F8/F11), `DEFAULT_PAD`
  (§7.2 standard mapping), `migrateSave(raw)`.
- `DEFAULT_KEYS` is unchanged. Defaults now merge `DEFAULT_KEYS_EXTRA`.
- `save.importJson` validates through `migrateSave`. It throws `Error('save_corrupt' | 'save_version')` and leaves the
  current save untouched on bad input.
- New `save.reset(keepSettings = true)`.
- `save.exportJson` output is now indented for readability. It still parses as the same JSON.

## Migration
`migrateSave` accepts v1 saves and v0 saves (no `v`, M1 dev builds). It deep-merges defaults and clamps numbers.
It drops unknown character and kart ids, fills missing actions' keys, and caps bindings at 3 keys and 2 pad buttons.
Tests: `apps/client/test/save.test.ts` (v0 fixture, M1 v1 fixture, corrupt input, round-trip).

`SaveV1.v` stays `1`. Every new field is optional, so other lanes that read `save.get()` compile unchanged.
