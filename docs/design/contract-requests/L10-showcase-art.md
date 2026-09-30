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

## 3. Emotes
`Showcase.emote()` plays `win`. The garage's emote tab wants `emote(name: 'win' | 'podium' | 'lose' | 'attackLanded' | 'gotHit' | 'lobby')`.
Results would play `podium` for ranks 2 and 3 and `lose` or `retire` otherwise.

## 4. Portraits (`getPortrait(characterId, size)`)
L10's art loader (`apps/client/src/art/slots.ts`) exposes `registerRenderFallback(kind, fn)`. Register the studio
renders there:
```ts
import { registerRenderFallback } from '../art/loader.ts';
registerRenderFallback('portrait', async (slot) => getPortrait(slot.id.slice('portrait.'.length), slot.w));
registerRenderFallback('hero', …); registerRenderFallback('kart', …);
```
Until then, `ui/components/Portrait.tsx` draws an original SVG Clawd with each character's costume cue. Once a
portrait provider exists, the component should prefer it. That needs a small hook in Portrait (L10 will add it at C2
if you expose `getPortrait`).
