# S-B: PROPS `every` is clamped to 1 m (doc 34 §6 quotes 0.8)

**Priority:** low. Lane S-B worked around it; nothing is blocked.

## What

`packages/trackc/src/props.ts` (`placeProps`, PROPS rows) reads the spacing as

```ts
const every = Math.max(1, num(a.every, 20)), offset = num(a.offset, 4), jitter = num(a.jitter, 0);
```

so any `every` below 1 m silently becomes 1 m. `docs/design/34-stylized-pass.md` §6 tells every theme lane to use
`grass_tuft every=0.8 …` (the Meadow Loop row), which really places tufts every 1 m. Lanes that tune density by
lowering `every` below 1 see no change and may think the bake is cached.

## Why it matters

Ground cover density is the main dial for "the map is too empty". Without sub-metre spacing, lanes have to add a
second staggered row (lane S-B uses `every=1 offset=0.3` plus `from=0.5 every=2 offset=2 jitter=14`).

## Options (pick one)

1. **Doc only** (no bake change). In `docs/design/34-stylized-pass.md` §6, change the first row of the table to:

   ```diff
   -| Fence-side ground cover | `grass_tuft every=0.8 offset=0.2 jitter=8 scale=1.0-1.8` · `flower_patch every=5 offset=0.8 jitter=9` |
   +| Fence-side ground cover | `grass_tuft every=1 offset=0.2 jitter=8 scale=1.0-1.8` (trackc clamps `every` to ≥ 1 m; add a staggered second row such as `from=0.5 every=2 offset=2 jitter=14` for more) · `flower_patch every=5 offset=0.8 jitter=9` |
   ```

2. **Allow 0.5 m** in trackc (changes every .vis that uses `every < 1`, never a .ctrk):

   ```diff
   -    const every = Math.max(1, num(a.every, 20)), offset = num(a.offset, 4), jitter = num(a.jitter, 0);
   +    const every = Math.max(0.5, num(a.every, 20)), offset = num(a.offset, 4), jitter = num(a.jitter, 0);
   ```

   Meadow Loop's `every=0.8` row would then place 25 % more tufts (about +900 instances, +17 KB gz in its .vis).

Lane S-B's rows use `every ≥ 1` everywhere, so either option leaves its tracks unchanged.
