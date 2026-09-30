# 60 — Codex art pipeline (ADR-013)

Owner: L8 CHARS+KARTS (M4 Codex pack: `art/codex/**`, `tools/art/{codex-pack,refs}.ts`), L10 (`apps/client/src/art/**`: loader, slots, fallbacks), L9 (server override index).
Sources: ADR-013 (binding), ADR-011 (IP rules), ADR-012 #20, `07-ui-art-character.md` §1.3 (key-art style) and §2.7 (IP guidance), B11 (`ArtSlotDef`, `getArt`).
Status keys: **[S]** sourced · **[P]** proposed.

---

## 1. Why this pipeline exists (ADR-013)
The user's ChatGPT/Codex image generation runs on their own PC, which the cloud session cannot reach. So:
1. **Procedural baseline.** Every 2D slot has a procedural fallback; most are rendered from the 3D scene into a canvas. The game ships complete without any generated image.
2. **Prompt pack.** `art/codex/manifest.json` lists the slots with id, size, prompt file and reference image; `art/codex/prompts/<slot>.md` holds the prompts; `art/codex/style-guide.md` the house style. `pnpm art:refs` renders procedural reference images with Playwright into `art/codex/refs/` (gitignored).
3. **Drop-in.** Any `apps/client/public/art/overrides/<slotId>.(webp|png|jpg)` wins over the fallback. It is indexed dynamically by the Vite dev plugin and by the Node server at `/art/overrides/index.json`; static builds snapshot the index at build time.

---

## 2. Files and commands
| Path / command | Content |
|---|---|
| `art/codex/manifest.json` | `{ version: 1, styleGuide: "style-guide.md", slots: SlotEntry[] }` (§3.2) |
| `art/codex/style-guide.md` | the house style text (§5), copied into every prompt |
| `art/codex/prompts/<slotId>.md` | front matter (`id`, `size`, `alpha`, `ref`) + English prompt + Korean prompt + negative prompt + notes |
| `art/codex/refs/<slotId>.png` | procedural reference render at the slot size (generated, gitignored) |
| `pnpm art:pack` (`tools/art/codex-pack.ts`) | regenerates `manifest.json` and the prompt files from `apps/client/src/art/slots/*.ts` + templates |
| `pnpm art:refs` (`tools/art/refs.ts`) | headless Chromium (Playwright 1.56.1, WebGL2 backend) renders every slot's fallback into `art/codex/refs/` |
| `pnpm art:check` [P] | lists missing, extra, wrong-size and wrong-aspect overrides |
| `apps/client/public/art/overrides/` | drop folder; only `README.md` (bilingual instructions) and `.gitkeep` are tracked (`.gitignore`) |
| `/art/overrides/index.json` | `{ "<slotId>": { "file": "<slotId>.webp", "w": 512, "h": 512, "mtime": 1727654400000 } }` |

---

## 3. Slots

### 3.1 Naming and sizes
- Slot id = `<kind>.<subject>` with ids from `packages/content/src/ids.ts`: `portrait.<characterId>`, `hero.<characterId>`, `kart.<kartBodyId>`, `thumb.<trackId>`, `loading.<trackId>`, `keyart.<themeId>`, `card.<mode>`, `keyart.title`, `logo.wordmark`, `icon.item.<itemId>`, `ui.<name>`.
- File name = `<slotId>.<ext>`; extension preference webp > png > jpg when several exist.
- `proving_ring` has no own thumb/loading slot; it uses `keyart.spark_circuit` and a procedural thumb.

| Kind | Count | Size (px) | Alpha | Used in |
|---|---|---|---|---|
| portrait | 12 | 512 × 512 | yes | room slots, standings icons, garage list, results |
| hero | 12 | 1024 × 1536 | yes | garage detail, results podium backdrop, loading player cards (cropped) |
| kart | 8 | 1024 × 640 | yes | garage kart list and detail |
| thumb | 20 | 640 × 360 | no | track pickers, room, matching stage, Time Attack |
| loading | 20 | 1920 × 1080 | no | loading screen |
| keyart (theme) | 10 | 1920 × 1080 | no | theme headers, lobby news tiles |
| card | 4 | 768 × 1024 | bleed | mode select |
| keyart.title | 1 | 2560 × 1440 | no | title screen |
| logo.wordmark | 1 | 2048 × 768 | yes | title, lobby header |
| icon.item | 18 | 256 × 256 | yes | HUD slots, item feed, results |
| ui | 4 | per slot | no | lobby, results and garage backgrounds, parchment tile |
| **Total** | **110** | | | |

### 3.2 Manifest entry
```ts
interface SlotEntry {
  id: string; kind: 'portrait' | 'hero' | 'kart' | 'thumb' | 'loading' | 'keyart' | 'card' | 'icon' | 'logo' | 'ui';
  w: number; h: number; alpha: boolean; format: 'webp';
  prompt: `prompts/${string}.md`; ref: `refs/${string}.png`;
  subject: { characterId?: CharacterId; kartBodyId?: KartBodyId; trackId?: TrackId; themeId?: ThemeId; itemId?: ItemId; mode?: string };
  palette: string[];        // hex colours the art must stay close to (character palette or theme palette)
  fallback: string;         // procedural renderer id in apps/client/src/art/fallbacks/
}
```

### 3.3 Full slot list
| # | Slot id | Kind | Size (px) | Alpha | Subject | Procedural fallback |
|---|---|---|---|---|---|---|
| 1 | `portrait.clay` | portrait | 512 × 512 | yes | Clay 클레이: head-and-shoulders, three-quarter view; classic Clawd with an ivory racing scarf | `render/showcase` studio render of the mascot |
| 2 | `portrait.pixel` | portrait | 512 × 512 | yes | Pixel 픽셀: head-and-shoulders, three-quarter view; true-voxel Clawd built from real cubes | `render/showcase` studio render of the mascot |
| 3 | `portrait.turbo` | portrait | 512 × 512 | yes | Turbo 터보: head-and-shoulders, three-quarter view; racer with an ivory helmet dome, blue stripes, "01" | `render/showcase` studio render of the mascot |
| 4 | `portrait.anchor` | portrait | 512 × 512 | yes | Captain Anchor 앵커 선장: head-and-shoulders, three-quarter view; pirate: tricorn hat, eyepatch, sparkle-parrot | `render/showcase` studio render of the mascot |
| 5 | `portrait.rune` | portrait | 512 × 512 | yes | Rune 룬: head-and-shoulders, three-quarter view; wizard: floppy navy cone hat, sparkle staff | `render/showcase` studio render of the mascot |
| 6 | `portrait.nova` | portrait | 512 × 512 | yes | Nova 노바: head-and-shoulders, three-quarter view; astronaut: glass bubble helmet, backpack | `render/showcase` studio render of the mascot |
| 7 | `portrait.kage` | portrait | 512 × 512 | yes | Kage 카게: head-and-shoulders, three-quarter view; ninja: dark hood, eye slit, scarf tails | `render/showcase` studio render of the mascot |
| 8 | `portrait.bisque` | portrait | 512 × 512 | yes | Chef Bisque 비스크 셰프: head-and-shoulders, three-quarter view; chef: tall toque, ladle, green neckerchief | `render/showcase` studio render of the mascot |
| 9 | `portrait.frost` | portrait | 512 × 512 | yes | Frost 프로스트: head-and-shoulders, three-quarter view; translucent ice-crystal shell, icicle crown | `render/showcase` studio render of the mascot |
| 10 | `portrait.glitch` | portrait | 512 × 512 | yes | Glitch 글리치: head-and-shoulders, three-quarter view; dark neon cyber body, holo visor, headphones | `render/showcase` studio render of the mascot |
| 11 | `portrait.bolt` | portrait | 512 × 512 | yes | Bolt 볼트: head-and-shoulders, three-quarter view; copper robot with LED eyes and a wind-up key | `render/showcase` studio render of the mascot |
| 12 | `portrait.duke` | portrait | 512 × 512 | yes | Duke 듀크: head-and-shoulders, three-quarter view; royal: crown, ermine cape, scepter | `render/showcase` studio render of the mascot |
| 13 | `hero.clay` | hero | 1024 × 1536 | yes | Clay 클레이 full body in their kart, dynamic pose; classic Clawd with an ivory racing scarf | showcase render (character + default kart), motion lines |
| 14 | `hero.pixel` | hero | 1024 × 1536 | yes | Pixel 픽셀 full body in their kart, dynamic pose; true-voxel Clawd built from real cubes | showcase render (character + default kart), motion lines |
| 15 | `hero.turbo` | hero | 1024 × 1536 | yes | Turbo 터보 full body in their kart, dynamic pose; racer with an ivory helmet dome, blue stripes, "01" | showcase render (character + default kart), motion lines |
| 16 | `hero.anchor` | hero | 1024 × 1536 | yes | Captain Anchor 앵커 선장 full body in their kart, dynamic pose; pirate: tricorn hat, eyepatch, sparkle-parrot | showcase render (character + default kart), motion lines |
| 17 | `hero.rune` | hero | 1024 × 1536 | yes | Rune 룬 full body in their kart, dynamic pose; wizard: floppy navy cone hat, sparkle staff | showcase render (character + default kart), motion lines |
| 18 | `hero.nova` | hero | 1024 × 1536 | yes | Nova 노바 full body in their kart, dynamic pose; astronaut: glass bubble helmet, backpack | showcase render (character + default kart), motion lines |
| 19 | `hero.kage` | hero | 1024 × 1536 | yes | Kage 카게 full body in their kart, dynamic pose; ninja: dark hood, eye slit, scarf tails | showcase render (character + default kart), motion lines |
| 20 | `hero.bisque` | hero | 1024 × 1536 | yes | Chef Bisque 비스크 셰프 full body in their kart, dynamic pose; chef: tall toque, ladle, green neckerchief | showcase render (character + default kart), motion lines |
| 21 | `hero.frost` | hero | 1024 × 1536 | yes | Frost 프로스트 full body in their kart, dynamic pose; translucent ice-crystal shell, icicle crown | showcase render (character + default kart), motion lines |
| 22 | `hero.glitch` | hero | 1024 × 1536 | yes | Glitch 글리치 full body in their kart, dynamic pose; dark neon cyber body, holo visor, headphones | showcase render (character + default kart), motion lines |
| 23 | `hero.bolt` | hero | 1024 × 1536 | yes | Bolt 볼트 full body in their kart, dynamic pose; copper robot with LED eyes and a wind-up key | showcase render (character + default kart), motion lines |
| 24 | `hero.duke` | hero | 1024 × 1536 | yes | Duke 듀크 full body in their kart, dynamic pose; royal: crown, ermine cape, scepter | showcase render (character + default kart), motion lines |
| 25 | `kart.pebble` | kart | 1024 × 640 | yes | Pebble 페블: open tube-frame go-kart, three-quarter front view, default livery | turntable render at 30° |
| 26 | `kart.clay_comet` | kart | 1024 × 640 | yes | Clay Comet 클레이 코멧: bubble capsule car with a sparkle tail fin, three-quarter front view, default livery | turntable render at 30° |
| 27 | `kart.arrowhead` | kart | 1024 × 640 | yes | Arrowhead 애로헤드: low open-wheel wedge with wings, three-quarter front view, default livery | turntable render at 30° |
| 28 | `kart.tugboat` | kart | 1024 × 640 | yes | Tugboat 터그보트: chunky retro buggy with balloon tyres, three-quarter front view, default livery | turntable render at 30° |
| 29 | `kart.glacier_sled` | kart | 1024 × 640 | yes | Glacier Sled 글레이셔 슬레드: ski-front hover kart with cyan thrusters, three-quarter front view, default livery | turntable render at 30° |
| 30 | `kart.neon_blade` | kart | 1024 × 640 | yes | Neon Blade 네온 블레이드: cyber hypercar with underglow, three-quarter front view, default livery | turntable render at 30° |
| 31 | `kart.jet_kettle` | kart | 1024 × 640 | yes | Jet Kettle 제트 케틀: steampunk brass boiler with twin smokestacks, three-quarter front view, default livery | turntable render at 30° |
| 32 | `kart.crown_cruiser` | kart | 1024 × 640 | yes | Crown Cruiser 크라운 크루저: royal chariot-car with gold filigree, three-quarter front view, default livery | turntable render at 30° |
| 33 | `thumb.meadow_loop` | thumb | 640 × 360 | no | Meadow Loop 초원 순환로: windmill, meadow, stone bridge, village green | track render from the signature-feature camera; before load: minimap SVG on the theme gradient |
| 34 | `thumb.belltower_piazza` | thumb | 640 × 360 | no | Belltower Piazza 종탑 광장: 270° piazza around a bell tower, stone arches | track render from the signature-feature camera; before load: minimap SVG on the theme gradient |
| 35 | `thumb.sunstone_bazaar` | thumb | 640 × 360 | no | Sunstone Bazaar 선스톤 바자르: awning market, oasis, dune jump | track render from the signature-feature camera; before load: minimap SVG on the theme gradient |
| 36 | `thumb.sandglass_canyon` | thumb | 640 × 360 | no | Sandglass Canyon 모래시계 협곡: slot canyon, sandfalls, hourglass portal | track render from the signature-feature camera; before load: minimap SVG on the theme gradient |
| 37 | `thumb.snowglobe_halfpipe` | thumb | 640 × 360 | no | Snowglobe Halfpipe 스노글로브 하프파이프: ice halfpipe, penguin village, crystal cave | track render from the signature-feature camera; before load: minimap SVG on the theme gradient |
| 38 | `thumb.aurora_summit` | thumb | 640 × 360 | no | Aurora Summit 오로라 정상 활강: night downhill under an aurora, ski jump | track render from the signature-feature camera; before load: minimap SVG on the theme gradient |
| 39 | `thumb.fernwood_hollow` | thumb | 640 × 360 | no | Fernwood Hollow 고사리숲 골짜기: giant trunks, log bridge, mushroom bounce | track render from the signature-feature camera; before load: minimap SVG on the theme gradient |
| 40 | `thumb.cascade_slalom` | thumb | 640 × 360 | no | Cascade Slalom 폭포 슬라럼: rock-pillar slalom, waterfall, canopy boardwalk | track render from the signature-feature camera; before load: minimap SVG on the theme gradient |
| 41 | `thumb.geode_rail_quarry` | thumb | 640 × 360 | no | Geode Rail Quarry 정동석 레일 채석장: crystal cavern, ore rails, trestle | track render from the signature-feature camera; before load: minimap SVG on the theme gradient |
| 42 | `thumb.magma_switchback` | thumb | 640 × 360 | no | Magma Switchback 마그마 굽잇길: 540° helix over a lava lake, geysers | track render from the signature-feature camera; before load: minimap SVG on the theme gradient |
| 43 | `thumb.pumpkin_lane` | thumb | 640 × 360 | no | Pumpkin Lane 호박 퍼레이드 길: lantern parade, pumpkin patch, graveyard | track render from the signature-feature camera; before load: minimap SVG on the theme gradient |
| 44 | `thumb.manor_catacombs` | thumb | 640 × 360 | no | Manor Catacombs 저택 지하묘지: giant ballroom, catacombs, portal warp | track render from the signature-feature camera; before load: minimap SVG on the theme gradient |
| 45 | `thumb.coral_cove_docks` | thumb | 640 × 360 | no | Coral Cove Docks 산호만 부두: pier boardwalk, moored galleon, beach | track render from the signature-feature camera; before load: minimap SVG on the theme gradient |
| 46 | `thumb.kraken_lighthouse` | thumb | 640 × 360 | no | Kraken Lighthouse 크라켄 등대: lighthouse helix, cannon fort, sunset | track render from the signature-feature camera; before load: minimap SVG on the theme gradient |
| 47 | `thumb.rainline_blvd` | thumb | 640 × 360 | no | Rainline Boulevard 레인라인 대로: rainy neon boulevard, traffic, overpass | track render from the signature-feature camera; before load: minimap SVG on the theme gradient |
| 48 | `thumb.skyway_interchange` | thumb | 640 × 360 | no | Skyway Interchange 스카이웨이 나들목: 3-level cloverleaf at dusk, subway | track render from the signature-feature camera; before load: minimap SVG on the theme gradient |
| 49 | `thumb.spark_grand_circuit` | thumb | 640 × 360 | no | Spark Grand Circuit 스파크 그랜드 서킷: pro circuit, grandstands, pit lane | track render from the signature-feature camera; before load: minimap SVG on the theme gradient |
| 50 | `thumb.sunset_arena_rally` | thumb | 640 × 360 | no | Sunset Arena Rally 선셋 아레나 랠리: stadium bowl at sunset, gravel jumps | track render from the signature-feature camera; before load: minimap SVG on the theme gradient |
| 51 | `thumb.token_foundry` | thumb | 640 × 360 | no | Token Foundry 토큰 주조소: assembly hall, conveyors, hydraulic presses | track render from the signature-feature camera; before load: minimap SVG on the theme gradient |
| 52 | `thumb.orbital_express` | thumb | 640 × 360 | no | Orbital Express 궤도 급행선: sky rails, vertical loop, starfield | track render from the signature-feature camera; before load: minimap SVG on the theme gradient |
| 53 | `loading.meadow_loop` | loading | 1920 × 1080 | no | Meadow Loop 초원 순환로: windmill, meadow, stone bridge, village green; racers mid-drift, room for the title bottom-left | poster: theme gradient + landmark silhouettes + minimap + title text |
| 54 | `loading.belltower_piazza` | loading | 1920 × 1080 | no | Belltower Piazza 종탑 광장: 270° piazza around a bell tower, stone arches; racers mid-drift, room for the title bottom-left | poster: theme gradient + landmark silhouettes + minimap + title text |
| 55 | `loading.sunstone_bazaar` | loading | 1920 × 1080 | no | Sunstone Bazaar 선스톤 바자르: awning market, oasis, dune jump; racers mid-drift, room for the title bottom-left | poster: theme gradient + landmark silhouettes + minimap + title text |
| 56 | `loading.sandglass_canyon` | loading | 1920 × 1080 | no | Sandglass Canyon 모래시계 협곡: slot canyon, sandfalls, hourglass portal; racers mid-drift, room for the title bottom-left | poster: theme gradient + landmark silhouettes + minimap + title text |
| 57 | `loading.snowglobe_halfpipe` | loading | 1920 × 1080 | no | Snowglobe Halfpipe 스노글로브 하프파이프: ice halfpipe, penguin village, crystal cave; racers mid-drift, room for the title bottom-left | poster: theme gradient + landmark silhouettes + minimap + title text |
| 58 | `loading.aurora_summit` | loading | 1920 × 1080 | no | Aurora Summit 오로라 정상 활강: night downhill under an aurora, ski jump; racers mid-drift, room for the title bottom-left | poster: theme gradient + landmark silhouettes + minimap + title text |
| 59 | `loading.fernwood_hollow` | loading | 1920 × 1080 | no | Fernwood Hollow 고사리숲 골짜기: giant trunks, log bridge, mushroom bounce; racers mid-drift, room for the title bottom-left | poster: theme gradient + landmark silhouettes + minimap + title text |
| 60 | `loading.cascade_slalom` | loading | 1920 × 1080 | no | Cascade Slalom 폭포 슬라럼: rock-pillar slalom, waterfall, canopy boardwalk; racers mid-drift, room for the title bottom-left | poster: theme gradient + landmark silhouettes + minimap + title text |
| 61 | `loading.geode_rail_quarry` | loading | 1920 × 1080 | no | Geode Rail Quarry 정동석 레일 채석장: crystal cavern, ore rails, trestle; racers mid-drift, room for the title bottom-left | poster: theme gradient + landmark silhouettes + minimap + title text |
| 62 | `loading.magma_switchback` | loading | 1920 × 1080 | no | Magma Switchback 마그마 굽잇길: 540° helix over a lava lake, geysers; racers mid-drift, room for the title bottom-left | poster: theme gradient + landmark silhouettes + minimap + title text |
| 63 | `loading.pumpkin_lane` | loading | 1920 × 1080 | no | Pumpkin Lane 호박 퍼레이드 길: lantern parade, pumpkin patch, graveyard; racers mid-drift, room for the title bottom-left | poster: theme gradient + landmark silhouettes + minimap + title text |
| 64 | `loading.manor_catacombs` | loading | 1920 × 1080 | no | Manor Catacombs 저택 지하묘지: giant ballroom, catacombs, portal warp; racers mid-drift, room for the title bottom-left | poster: theme gradient + landmark silhouettes + minimap + title text |
| 65 | `loading.coral_cove_docks` | loading | 1920 × 1080 | no | Coral Cove Docks 산호만 부두: pier boardwalk, moored galleon, beach; racers mid-drift, room for the title bottom-left | poster: theme gradient + landmark silhouettes + minimap + title text |
| 66 | `loading.kraken_lighthouse` | loading | 1920 × 1080 | no | Kraken Lighthouse 크라켄 등대: lighthouse helix, cannon fort, sunset; racers mid-drift, room for the title bottom-left | poster: theme gradient + landmark silhouettes + minimap + title text |
| 67 | `loading.rainline_blvd` | loading | 1920 × 1080 | no | Rainline Boulevard 레인라인 대로: rainy neon boulevard, traffic, overpass; racers mid-drift, room for the title bottom-left | poster: theme gradient + landmark silhouettes + minimap + title text |
| 68 | `loading.skyway_interchange` | loading | 1920 × 1080 | no | Skyway Interchange 스카이웨이 나들목: 3-level cloverleaf at dusk, subway; racers mid-drift, room for the title bottom-left | poster: theme gradient + landmark silhouettes + minimap + title text |
| 69 | `loading.spark_grand_circuit` | loading | 1920 × 1080 | no | Spark Grand Circuit 스파크 그랜드 서킷: pro circuit, grandstands, pit lane; racers mid-drift, room for the title bottom-left | poster: theme gradient + landmark silhouettes + minimap + title text |
| 70 | `loading.sunset_arena_rally` | loading | 1920 × 1080 | no | Sunset Arena Rally 선셋 아레나 랠리: stadium bowl at sunset, gravel jumps; racers mid-drift, room for the title bottom-left | poster: theme gradient + landmark silhouettes + minimap + title text |
| 71 | `loading.token_foundry` | loading | 1920 × 1080 | no | Token Foundry 토큰 주조소: assembly hall, conveyors, hydraulic presses; racers mid-drift, room for the title bottom-left | poster: theme gradient + landmark silhouettes + minimap + title text |
| 72 | `loading.orbital_express` | loading | 1920 × 1080 | no | Orbital Express 궤도 급행선: sky rails, vertical loop, starfield; racers mid-drift, room for the title bottom-left | poster: theme gradient + landmark silhouettes + minimap + title text |
| 73 | `keyart.clayhill_village` | keyart | 1920 × 1080 | no | Clayhill Village 클레이힐 마을 theme vignette with 3 racers | theme-kit vignette render or palette poster |
| 74 | `keyart.sunstone_desert` | keyart | 1920 × 1080 | no | Sunstone Desert 선스톤 사막 theme vignette with 3 racers | theme-kit vignette render or palette poster |
| 75 | `keyart.frostbyte_glacier` | keyart | 1920 × 1080 | no | Frostbyte Glacier 프로스트바이트 빙하 theme vignette with 3 racers | theme-kit vignette render or palette poster |
| 76 | `keyart.canopy_forest` | keyart | 1920 × 1080 | no | Canopy Forest 캐노피 숲 theme vignette with 3 racers | theme-kit vignette render or palette poster |
| 77 | `keyart.ember_mine` | keyart | 1920 × 1080 | no | Ember Mine 엠버 광산 theme vignette with 3 racers | theme-kit vignette render or palette poster |
| 78 | `keyart.lantern_hollow` | keyart | 1920 × 1080 | no | Lantern Hollow 랜턴 할로우 theme vignette with 3 racers | theme-kit vignette render or palette poster |
| 79 | `keyart.coral_cove` | keyart | 1920 × 1080 | no | Coral Cove 코랄 코브 theme vignette with 3 racers | theme-kit vignette render or palette poster |
| 80 | `keyart.neon_harbor` | keyart | 1920 × 1080 | no | Neon Harbor 네온 하버 theme vignette with 3 racers | theme-kit vignette render or palette poster |
| 81 | `keyart.spark_circuit` | keyart | 1920 × 1080 | no | Spark Circuit 스파크 서킷 theme vignette with 3 racers | theme-kit vignette render or palette poster |
| 82 | `keyart.orbital_nexus` | keyart | 1920 × 1080 | no | Orbital Nexus 오비탈 넥서스 theme vignette with 3 racers | theme-kit vignette render or palette poster |
| 83 | `card.speed` | card | 768 × 1024 | yes (bleed) | Speed Race 스피드전: racer and kart with heavy horizontal motion blur, boost flame; character + kart cut-out bleeding off the card edge | showcase render composited on white-to-transparent |
| 84 | `card.item` | card | 768 × 1024 | yes (bleed) | Item Race 아이템전: racer dodging a flying Prompt Missile, item cubes; character + kart cut-out bleeding off the card edge | showcase render composited on white-to-transparent |
| 85 | `card.timeAttack` | card | 768 × 1024 | yes (bleed) | Time Attack 타임어택: lone racer with a translucent ghost kart and a stopwatch motif; character + kart cut-out bleeding off the card edge | showcase render composited on white-to-transparent |
| 86 | `card.custom` | card | 768 × 1024 | yes (bleed) | Custom Room 커스텀 룸: four racers gathered at a starting grid, room-code tag; character + kart cut-out bleeding off the card edge | showcase render composited on white-to-transparent |
| 87 | `keyart.title` | keyart | 2560 × 1440 | no | Title key art: all 12 racers in a Dutch-angle chase through Clayhill Village toward a stadium city at sunset | lineup render + sky gradient |
| 88 | `logo.wordmark` | logo | 2048 × 768 | yes | Original wordmark for the public title with the parametric sparkle (never the Claude logo) | canvas typesetting: Barlow Condensed Black Italic + parametric sparkle |
| 89 | `icon.item.turbo_token` | icon | 256 × 256 | yes | Item icon for `turbo_token` (see `12-items-spec.md` §2.2) | vector canvas icon `ui/icons/items/{i}.ts` |
| 90 | `icon.item.attention_tether` | icon | 256 × 256 | yes | Item icon for `attention_tether` (see `12-items-spec.md` §2.2) | vector canvas icon `ui/icons/items/{i}.ts` |
| 91 | `icon.item.overclock_aura` | icon | 256 × 256 | yes | Item icon for `overclock_aura` (see `12-items-spec.md` §2.2) | vector canvas icon `ui/icons/items/{i}.ts` |
| 92 | `icon.item.prompt_missile` | icon | 256 × 256 | yes | Item icon for `prompt_missile` (see `12-items-spec.md` §2.2) | vector canvas icon `ui/icons/items/{i}.ts` |
| 93 | `icon.item.top1_missile` | icon | 256 × 256 | yes | Item icon for `top1_missile` (see `12-items-spec.md` §2.2) | vector canvas icon `ui/icons/items/{i}.ts` |
| 94 | `icon.item.token_bomb` | icon | 256 × 256 | yes | Item icon for `token_bomb` (see `12-items-spec.md` §2.2) | vector canvas icon `ui/icons/items/{i}.ts` |
| 95 | `icon.item.bug_report` | icon | 256 × 256 | yes | Item icon for `bug_report` (see `12-items-spec.md` §2.2) | vector canvas icon `ui/icons/items/{i}.ts` |
| 96 | `icon.item.broadcast_bolt` | icon | 256 × 256 | yes | Item icon for `broadcast_bolt` (see `12-items-spec.md` §2.2) | vector canvas icon `ui/icons/items/{i}.ts` |
| 97 | `icon.item.throttle_drone` | icon | 256 × 256 | yes | Item icon for `throttle_drone` (see `12-items-spec.md` §2.2) | vector canvas icon `ui/icons/items/{i}.ts` |
| 98 | `icon.item.firewall` | icon | 256 × 256 | yes | Item icon for `firewall` (see `12-items-spec.md` §2.2) | vector canvas icon `ui/icons/items/{i}.ts` |
| 99 | `icon.item.glitch_puddle` | icon | 256 × 256 | yes | Item icon for `glitch_puddle` (see `12-items-spec.md` §2.2) | vector canvas icon `ui/icons/items/{i}.ts` |
| 100 | `icon.item.redaction_cloud` | icon | 256 × 256 | yes | Item icon for `redaction_cloud` (see `12-items-spec.md` §2.2) | vector canvas icon `ui/icons/items/{i}.ts` |
| 101 | `icon.item.mirror_mode` | icon | 256 × 256 | yes | Item icon for `mirror_mode` (see `12-items-spec.md` §2.2) | vector canvas icon `ui/icons/items/{i}.ts` |
| 102 | `icon.item.context_shield` | icon | 256 × 256 | yes | Item icon for `context_shield` (see `12-items-spec.md` §2.2) | vector canvas icon `ui/icons/items/{i}.ts` |
| 103 | `icon.item.interrupt_pulse` | icon | 256 × 256 | yes | Item icon for `interrupt_pulse` (see `12-items-spec.md` §2.2) | vector canvas icon `ui/icons/items/{i}.ts` |
| 104 | `icon.item.alignment_halo` | icon | 256 × 256 | yes | Item icon for `alignment_halo` (see `12-items-spec.md` §2.2) | vector canvas icon `ui/icons/items/{i}.ts` |
| 105 | `icon.item.interpretability_lens` | icon | 256 × 256 | yes | Item icon for `interpretability_lens` (see `12-items-spec.md` §2.2) | vector canvas icon `ui/icons/items/{i}.ts` |
| 106 | `icon.item.mutex_lock` | icon | 256 × 256 | yes | Item icon for `mutex_lock` (see `12-items-spec.md` §2.2) | vector canvas icon `ui/icons/items/{i}.ts` |
| 107 | `ui.lobby_bg` | ui | 1920 × 1080 | no | soft studio cyclorama backdrop with warm parchment light behind the showcase | procedural gradient + noise |
| 108 | `ui.results_bg` | ui | 1920 × 1080 | no | podium stage with confetti, warm spotlight | procedural gradient + confetti particles |
| 109 | `ui.garage_backdrop` | ui | 2048 × 1024 | no | garage workshop wall with tools and paint swatches, soft focus | procedural panels + noise |
| 110 | `ui.pattern_parchment` | ui | 1024 × 1024 (tileable) | no | subtle parchment paper texture in #F5F4ED | procedural fbm noise tile |

---

## 4. How fallbacks and overrides resolve (`apps/client/src/art/loader.ts`)
1. `getArt(id)` looks up `/art/overrides/index.json` (fetched once per session in production; live in dev).
2. If an override exists: fetch → `createImageBitmap`. Check the aspect ratio against the slot (±2%); a mismatch logs a dev warning and the image is centre-cropped (never stretched). A wrong absolute size is accepted and scaled.
3. If there is no override, or it fails to load or decode: run the slot's `fallback()` (§4.1) into a canvas.
4. Results are cached as `ImageBitmap` per id; the Vite dev plugin emits an HMR event `art-overrides:update` when the folder changes, which invalidates the cache and re-renders visible slots (no rebuild needed).
5. Static builds (no Node server) use the index snapshot written at build time; adding files later requires a rebuild.

### 4.1 Procedural fallbacks (always shipped)
| Kind | Fallback renderer |
|---|---|
| portrait, hero | `render/showcase` offscreen: the mascot (and kart for heroes) on a soft cyclorama, 3-point studio light, rim light, transparent background; camera per kind |
| kart | turntable render at 30°, studio light, default livery |
| thumb | track `.vis` loaded in a worker-free offscreen renderer at the signature camera pose (from `.meta.json`); before a track is downloaded: minimap SVG on the theme gradient with the difficulty stars |
| loading | poster: theme gradient, landmark silhouettes from the theme kit, minimap, title text (Pretendard/Black Han Sans after `document.fonts.ready`) |
| keyart (theme) | theme-kit vignette render (3 mascots mid-drift) or the palette poster on Low |
| card | showcase render of a character + kart with a motion-blur card (speed) or a missile (item) on white-to-transparent |
| keyart.title | lineup render of all 12 characters on the sunset stadium backdrop |
| logo.wordmark | canvas typesetting of the public title in Barlow Condensed Black Italic with the parametric sparkle; the title text comes from `VITE_PUBLIC_TITLE` (default "ClaudeRider") [P] |
| icon.item | vector canvas icons from `ui/icons/items/<id>.ts` |
| ui | procedural gradients, noise and confetti |

---

## 5. Style guide (`art/codex/style-guide.md`, text)
> **House style — ClaudeRider.** Glossy vinyl-toy chibi kart racer. Bright, saturated, toy-like 3D world with soft skylight and soft shadows; heavy bloom only on glowing effects (boost flames, drift sparks, neon, item cubes). Warm terracotta `#D97757` / `#C96442` and cream `#FAF9F5` / parchment `#F5F4ED` as the signature palette, with the theme's accent colours. Characters are *Clawd* mascots: a rounded voxel-block creature with body proportions 1.0 wide : 0.68 tall : 0.64 deep, soft rounded edges, terracotta body `#D87656` with a darker shade `#BE684D`, two vertical black rectangular eye slots `#141413`, **no mouth**, two small stub arms, four tiny stub legs hidden in the kart, and a small original ten-ray sparkle floating just above the head. Clearcoat vinyl material with a warm peach rim light (`#FFD9C7`). Karts are chunky, rounded, toy-like, with emissive details. Key art uses a Dutch-angle wide-lens composition with foreground, midground and background layers and motion blur at the edges [S KRD key-art study].
>
> **Always:** original designs only; consistent character design across images; clean silhouettes readable at small sizes; transparent background when the slot says alpha.
>
> **Never:** text, letters, numbers or watermarks (unless the slot asks for them); KartRider or Nexon names, characters (for example Dao or Bazzi), karts, tracks, logos or fonts; the Claude or Anthropic logo, the exact Claude "spark" mark, or the Anthropic "A"; real brands or sponsor logos; photorealistic humans; gore; mouths on the Clawd characters.

Negative prompt (all slots): `text, watermark, logo, signature, letters, KartRider, Nexon, Dao, Bazzi, Anthropic logo, Claude logo, starburst logo, realistic human, photo, blurry, low quality, extra limbs, mouth, teeth`.

---

## 6. Example prompts (fully written)

### 6.1 `portrait.clay` (512 × 512, alpha)
**English.** Glossy vinyl-toy chibi mascot portrait, head-and-shoulders, three-quarter view facing slightly left. The character "Clay" is a rounded voxel-block creature (proportions 1.0 wide, 0.68 tall, 0.64 deep, soft rounded edges) with a terracotta body `#D87656`, darker shade `#BE684D` on the underside, two vertical black rectangular eye slots `#141413`, no mouth, small stub arms, and a small original ten-ray sparkle floating just above its head. It wears a long ivory `#FAF9F5` racing scarf trailing behind in the wind. Clearcoat vinyl material, warm peach rim light, soft studio lighting on a transparent background, crisp silhouette, calm and friendly expression through slightly curved eye slots. Centered, fills 80% of the frame. No text.
**한국어.** 광택 있는 비닐 토이 느낌의 치비 마스코트 초상화, 머리와 어깨가 보이는 약간 왼쪽을 향한 3/4 각도. 캐릭터 "클레이"는 둥근 모서리의 복셀 블록 생명체(가로 1.0, 세로 0.68, 깊이 0.64 비율)로, 몸 색은 테라코타 `#D87656`, 아랫면은 한 톤 어두운 `#BE684D`, 눈은 세로로 긴 검은 직사각형 슬롯 두 개 `#141413`이며 입은 없습니다. 작은 뭉툭한 팔이 있고, 머리 바로 위에 독창적인 10갈래 반짝이 장식이 떠 있습니다. 바람에 휘날리는 긴 아이보리색 `#FAF9F5` 레이싱 스카프를 두르고 있습니다. 클리어코트 비닐 재질, 따뜻한 복숭앗빛 림 라이트, 투명 배경의 부드러운 스튜디오 조명, 또렷한 실루엣, 살짝 휘어진 눈 슬롯으로 표현한 차분하고 친근한 표정. 화면 중앙, 프레임의 80%를 채움. 글자 없음.

### 6.2 `hero.glitch` (1024 × 1536, alpha)
**English.** Full-body hero render of the character "Glitch" driving the "Neon Blade" kart, dynamic low three-quarter angle, the kart leaning into a drift with violet and coral drift sparks streaming from the rear wheels. Glitch is a rounded voxel-block Clawd creature (1.0 : 0.68 : 0.64 proportions) with a dark body `#1C1B22`, glowing emissive edge lines in orange `#FF7A50` and cyan `#2EF2FF`, a holographic visor band in cyan instead of eye slots, chunky headphones, no mouth, and a small original ten-ray sparkle floating above the head. The Neon Blade is a low cyber hypercar with a cyan underglow and emissive rim wheels. Glossy vinyl and candy-paint materials, strong rim light, bloom on the neon, motion blur on the background edges only, transparent background. No text, no logos.
**한국어.** 캐릭터 "글리치"가 카트 "네온 블레이드"를 타고 있는 전신 히어로 렌더, 역동적인 낮은 3/4 앵글. 카트는 드리프트하며 기울어져 있고 뒷바퀴에서 보라색과 코랄색 드리프트 불꽃이 흩날립니다. 글리치는 둥근 복셀 블록 형태의 클로드 생명체(1.0 : 0.68 : 0.64 비율)로, 어두운 몸 `#1C1B22`에 주황 `#FF7A50`과 청록 `#2EF2FF`의 빛나는 테두리 라인이 있고, 눈 슬롯 대신 청록색 홀로그램 바이저 띠를 두르고, 두툼한 헤드폰을 썼으며, 입은 없고, 머리 위에 독창적인 10갈래 반짝이가 떠 있습니다. 네온 블레이드는 청록색 언더글로와 발광 림 휠을 가진 낮은 사이버 하이퍼카입니다. 광택 비닐과 캔디 페인트 재질, 강한 림 라이트, 네온에 블룸, 배경 가장자리에만 모션 블러, 투명 배경. 글자와 로고 없음.

### 6.3 `loading.belltower_piazza` (1920 × 1080)
**English.** Wide cinematic loading screen for the track "Belltower Piazza": a cartoon European hill-town piazza in golden late-afternoon light. A 38 m clock tower stands in the middle of a circular cobblestone plaza; three stone arches span the entry street; a domed basilica, pennant flags and a fountain frame the scene. Three Clawd kart racers (terracotta, blue-striped helmet, royal crown) drift around the tower in a tight pack, drift sparks and boost flames glowing. Terracotta roofs, cream walls `#F4EFE6`, sage hills `#8FB573`, sky `#9FD3F5`, long warm shadows. Dutch angle, wide lens, layered foreground (café tables, flower boxes), midground (racers), background (hills and the town). Leave the lower-left quarter calm for the title overlay. No text.
**한국어.** 트랙 "종탑 광장"의 와이드 시네마틱 로딩 화면: 늦은 오후의 황금빛 햇살이 비치는 만화풍 유럽 언덕 마을의 광장. 원형 자갈 광장 한가운데 38m 높이의 시계탑이 서 있고, 진입로 위로 돌 아치 세 개가 걸쳐 있으며, 돔 지붕의 대성당, 삼각 깃발, 분수가 장면을 감쌉니다. 클로드 카트 레이서 세 명(테라코타, 파란 줄무늬 헬멧, 왕관)이 탑을 돌며 촘촘하게 드리프트하고, 드리프트 불꽃과 부스터 불꽃이 빛납니다. 테라코타 지붕, 크림색 벽 `#F4EFE6`, 세이지색 언덕 `#8FB573`, 하늘색 `#9FD3F5`, 길고 따뜻한 그림자. 더치 앵글, 광각 렌즈, 전경(카페 테이블, 꽃상자)·중경(레이서)·배경(언덕과 마을)의 레이어 구성. 타이틀이 들어갈 왼쪽 아래 1/4은 차분하게 비워 둘 것. 글자 없음.

### 6.4 `keyart.title` (2560 × 1440)
**English.** Epic title key art for an original toy kart racer: all twelve Clawd mascot racers charge toward the viewer down a sunlit hill-town road that curves toward a futuristic stadium city at sunset, with a Dutch-angle wide-lens composition. In front, the classic terracotta Clawd with an ivory scarf leads in a pebble-shaped go-kart; behind it a pirate with a tricorn hat, a wizard with a floppy navy hat, an astronaut in a bubble helmet, a ninja in a dark hood, a chef with a tall toque, a translucent ice-crystal racer, a neon cyber racer with a visor, a copper robot, a royal racer with a crown, a racer in an ivory helmet, and a true-voxel racer. Every racer is a rounded voxel block with two vertical eye slots and no mouth, with a small ten-ray sparkle above the head. Boost flames, drift sparks, confetti and floating item cubes; warm terracotta and cream palette with a sunset gradient `#FF8C42` → `#6A4C93`. Glossy vinyl-toy rendering, strong rim light, depth of field on the far city, motion blur at the frame edges. Leave the upper-centre area clear for the wordmark. No text, no logos.
**한국어.** 독창적인 토이 카트 레이싱 게임의 웅장한 타이틀 키 아트: 열두 명의 클로드 마스코트 레이서 전원이 해 질 녘 미래형 스타디움 도시를 향해 휘어지는 햇살 가득한 언덕 마을 도로를 따라 화면 쪽으로 돌진합니다. 더치 앵글, 광각 구도. 맨 앞은 아이보리 스카프를 두른 클래식 테라코타 클로드가 조약돌 모양 고카트로 선두를 달리고, 그 뒤로 삼각모의 해적, 늘어진 남색 모자의 마법사, 버블 헬멧의 우주비행사, 어두운 두건의 닌자, 높은 셰프 모자의 요리사, 반투명 얼음 크리스털 레이서, 바이저를 쓴 네온 사이버 레이서, 구리 로봇, 왕관을 쓴 왕족 레이서, 아이보리 헬멧의 레이서, 진짜 복셀 레이서가 따라옵니다. 모든 레이서는 세로로 긴 눈 슬롯 두 개가 있고 입이 없는 둥근 복셀 블록이며, 머리 위에 작은 10갈래 반짝이가 떠 있습니다. 부스터 불꽃, 드리프트 불꽃, 색종이, 떠다니는 아이템 큐브. 따뜻한 테라코타와 크림 팔레트에 노을 그라데이션 `#FF8C42` → `#6A4C93`. 광택 비닐 토이 렌더링, 강한 림 라이트, 먼 도시에 피사계 심도, 프레임 가장자리 모션 블러. 워드마크를 위해 상단 중앙을 비워 둘 것. 글자와 로고 없음.

### 6.5 `icon.item.token_bomb` (256 × 256, alpha)
**English.** Game item icon, centred, bold and readable at 48 px: a glossy round "Token Bomb" — a translucent bubble sphere with floating glowing token glyphs (small rounded squares and dots) inside, a short cream-coloured fuse on top with a coral spark, soft outline, cheerful toy style. Colours: bubble cyan-white with coral `#D97757` accents and cream `#FAF9F5` highlights; slight drop shadow; transparent background; no text, no letters, no numbers.
**한국어.** 게임 아이템 아이콘, 중앙 배치, 48px에서도 또렷하게 읽히는 굵은 형태: 광택 있는 둥근 "토큰 폭탄" — 안쪽에 빛나는 토큰 문양(작은 둥근 사각형과 점)이 떠다니는 반투명 버블 구체, 위쪽에 코랄색 불꽃이 튀는 짧은 크림색 심지, 부드러운 외곽선, 명랑한 토이 스타일. 색상: 청록빛이 도는 흰 버블에 코랄 `#D97757` 포인트와 크림 `#FAF9F5` 하이라이트, 약한 그림자, 투명 배경. 글자·문자·숫자 없음.

---

## 7. How to drop files (bilingual README in the overrides folder)
**English**
1. Run `pnpm art:pack` and `pnpm art:refs` (renders the reference images into `art/codex/refs/`).
2. Open `art/codex/manifest.json`; pick a slot; open its prompt file `art/codex/prompts/<slotId>.md`.
3. In ChatGPT/Codex image generation, attach the reference image `art/codex/refs/<slotId>.png`, paste the style guide, the English (or Korean) prompt and the negative prompt.
4. Export at the slot size (or the same aspect ratio), as WebP (PNG if you need exact alpha), keeping transparency for alpha slots.
5. Save it as `apps/client/public/art/overrides/<slotId>.webp` (for example `portrait.clay.webp`).
6. `pnpm dev`: the image appears immediately (hot reload). `pnpm start` (Node server): reload the page. Static hosting: rebuild (`pnpm build`) so the index snapshot includes it.
7. Optional: `pnpm art:check` reports missing or mis-sized overrides.

**한국어**
1. `pnpm art:pack`과 `pnpm art:refs`를 실행합니다(참조 이미지가 `art/codex/refs/`에 생성됩니다).
2. `art/codex/manifest.json`에서 슬롯을 고르고, 해당 프롬프트 파일 `art/codex/prompts/<slotId>.md`를 엽니다.
3. ChatGPT/Codex 이미지 생성에 참조 이미지 `art/codex/refs/<slotId>.png`를 첨부하고, 스타일 가이드, 한국어(또는 영어) 프롬프트, 네거티브 프롬프트를 붙여 넣습니다.
4. 슬롯 크기(또는 같은 비율)로 WebP(정확한 투명도가 필요하면 PNG)로 내보내고, 알파 슬롯은 투명 배경을 유지합니다.
5. `apps/client/public/art/overrides/<slotId>.webp`로 저장합니다(예: `portrait.clay.webp`).
6. `pnpm dev`에서는 바로 반영됩니다(핫 리로드). `pnpm start`(Node 서버)는 페이지를 새로고침하면 됩니다. 정적 호스팅은 인덱스 스냅숏에 포함되도록 다시 빌드(`pnpm build`)합니다.
7. 선택: `pnpm art:check`로 빠졌거나 크기가 맞지 않는 파일을 확인합니다.

Overrides stay on the user's machine: the folder is gitignored except for its README and `.gitkeep`. Generated images must follow the IP rules of §5 (ADR-011); the disclaimer applies to them like everything else.

---

## 8. Tests
| Test | Pass |
|---|---|
| Manifest | exactly 110 slots; ids unique; every id resolves to content ids; sizes as §3.1 |
| Fallbacks | every slot's `fallback()` renders a non-empty canvas at its size under the WebGL2 backend (`pnpm art:refs` in CI smoke for 10 slots, all in M4) |
| Override index | dev plugin and Node server list files with `w`, `h`, `mtime`; static build snapshot matches the folder |
| Loader | override wins; broken file falls back; aspect mismatch crops and warns; cache invalidates on HMR |
