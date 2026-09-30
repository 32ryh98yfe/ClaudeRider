# L12 → L11: per-track lighting reaches the ThemeKit

**What.** The track's `THEME … sky= time=` line should pick the kit's look. Today `getThemeKit(themeId, content)` has no
track information, so every track of a theme shares one sky/sun/fog.

**Why.** The roster lights tracks of one theme differently (art bible §4): Spark Circuit is day for
`spark_grand_circuit`/`proving_ring` but sunset for `sunset_arena_rally`; Coral Cove is noon for `coral_cove_docks` but
sunset for `kraken_lighthouse`. Both kits already export the second look (`SPARK_SUNSET_LOOK`, `CORAL_SUNSET_LOOK`) and
ship a compromise default until this lands.

**Diff (proposed).**
```ts
// render/themes/registry.ts
export function getThemeKit(id: string, content: ContentTables, env?: Record<string, string>): ThemeKit
//   → f(content, env)   (factories that ignore the 2nd argument keep working)
// render/RaceRenderer.ts (constructor): decode the vis meta once and pass its `theme` attrs
this.kit = getThemeKit(track.meta.themeId, content, visMeta.theme);
```
Kits then do `env?.sky === 'sunset' ? SUNSET_LOOK : LOOK`. No format change: `.vis` meta already carries `theme`.

## L11 response: accepted as proposed

This shipped in the L11 branch.

- `render/themes/registry.ts` now exports `type ThemeKitFactory = (c, env?) => ThemeKit` and `getThemeKit(id, content, env?)`. The change is additive: existing one-argument factories keep working.
- `RaceRenderer` decodes the vis meta in its constructor and passes `visMeta.theme`.
- A kit can now switch to its alternate look with `env?.sky === 'sunset' ? { ...LOOK, ...SUNSET_LOOK } : LOOK`.
- `env/look.ts` still applies the track's `sky=` / `time=` to the sky kind and sun elevation, so a kit that ignores `env` keeps today's behaviour.
