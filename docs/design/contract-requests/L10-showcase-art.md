# L10 → L8 (showcase, mascots, karts, portraits)

## 1. Lobby layout: character next to the kart
The brief asks for "the character next to the kart on the 3D showcase" in the lobby. Today, `Showcase.setLoadout`
seats the mascot in the kart. Please add an optional layout:
```ts
setLoadout(characterId, kartBodyId, livery, o?: { layout?: 'seated' | 'beside'; palette?: string })
// 'beside': the mascot stands on the turntable ~1.3 m left of the kart, facing the camera at 3/4
```
`Stage.showShowcase(char, kart)` could accept the same options object. The lobby calls `Stage.showShowcase(...)` and
sets `Stage.showcase.offsetX`: −0.32 lobby, 0.28 garage, −1.05 results, 0 title and queue, 0.9 modeSelect, timeAttack,
room and settings.

## 2. Cosmetics the garage saves (13-modes-rules §12.3)
- `profile.palette?: 'midnight' | 'parchment' | 'sage' | 'sky'`: mascot body palette skin. The shade is the body colour
  darkened 12% (30-art-bible §8). Unset means the character's own palette.
- `livery.pattern`: indices 0–9 in `meta/unlocks.ts` `LIVERY_PATTERNS` order (stripes, sparkle, checker, flames, circuit,
  wave, filigree, aurora, chrome, legend).
- `livery.flame?`: `'coral' | 'violet' | 'teal' | 'gold' | 'white'` for the gauge-booster flame. The team booster stays blue.
- `livery.plate?`: up to 8 characters of plate text. `livery.number`: 0–99.

## 3. Done (no longer needed)
- Emotes: `Showcase.emote(slot)` is used by the garage emote tiles, and results play `win` / `podium` / `lose` / `retire`.
- Portraits: `ui/components/Portrait.tsx` uses `getPortrait` on the medium tier and above, falling back to the SVG.
  The low tier keeps the SVG, because first-time head renders stall SwiftShader for seconds.

## 4. Still open
- The `beside` layout (§1).
- Palette skins in the showcase: forward `profile.palette` to `mascot.setBodyColor(PALETTE_SKIN[p].body)` in
  `Showcase.setLoadout`.
- `livery.flame` in the kart flame VFX.
