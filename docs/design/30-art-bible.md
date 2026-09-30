# 30 — Art bible

Owner: L8 CHARS+KARTS (mascots, karts, portraits), L11 FX+AUDIO (materials, post, camera, VFX), world lanes L5–L7 (theme kits), L10 (UI-in-world).
Sources: ADR-011 (rig, palette, budgets, look), ADR-012 #19 (renderer, DPR, CA), `07-ui-art-character.md` Part 2, `05-tech-rendering.md` §5–§11, `04-maps-tracks.md` §1.6 and §3 (theme palettes, props, lighting), `packages/content/src/themes/*.ts`.
Status keys: **[S]** sourced · **[P]** proposed. Render-side times are in seconds (frame-rate independent); sim-driven cues quote ticks.

---

## 1. Visual pillars
| Pillar | Rule |
|---|---|
| **Toy-bright** | Bright, saturated, toy-like world with soft skylight and soft shadows; heavy bloom only on emissive gameplay elements (flames, sparks, pads, boxes, neon). Not hard cel shading [S KRD look]. |
| **Vinyl mascots** | Characters are glossy vinyl toys: clearcoat, soft roughness, warm Fresnel rim. They must pop against every theme. |
| **One gameplay colour language** | Pads, boxes, warnings, team colours and boost flames look identical on every theme (§9). Themes may tint the world, never the gameplay colours. |
| **Readable at 240 km/h** | Mid-tone roads, silhouettes with rim light, chevrons before tight corners, nothing bright and busy within 2 m of the road edge. |
| **Original** | No Nexon shapes, logos or fonts; no exact Claude logo path. The parametric sparkle is the only brand nod on characters. |

## 2. Global look (ADR-011)
- World: `MeshStandardNodeMaterial` (through the `MaterialLibrary`), low-frequency albedo from gradients/noise, metalness 0–0.1, roughness 0.55–0.9, **vertex AO** baked at track compile (16 rays, 4 m).
- Mascots: `MeshPhysicalNodeMaterial` — clearcoat 0.6, clearcoatRoughness 0.25, roughness 0.42, sheen 0.2, TSL Fresnel rim `#FFD9C7` (power 2.5) added through `emissiveNode`. No `onBeforeCompile` (ADR-012 #19).
- Karts: `kartPaint` physical material, clearcoat 1.0, clearcoatRoughness 0.1 ("candy paint"), livery from a canvas texture.
- Tone mapping `NeutralToneMapping`, exposure 1.0, followed by a CDL grade (slope 1.05, saturation 1.1) plus the theme's grade (`ThemeKit.grade`). Neutral keeps brand colours true (Claude coral stays coral) [S].
- Environment: `SkyMesh` → PMREM (`environmentIntensity` 0.5) regenerated only when the time of day changes; `HemisphereLight` for sky/ground tint; `SunLight` (2 cascades).
- No planar reflections; no many dynamic point lights (emissive + bloom instead).

---

## 3. Palettes

### 3.1 Brand and UI (from `07` §2.1, sourced tokens)
| Token | Hex | Use |
|---|---|---|
| Clawd body | `#D87656` | default mascot body |
| Clawd shade | `#BE684D` | mascot shade/underside |
| Eyes / dark | `#141413` | eye decals, UI text |
| Ivory | `#F9F8F4` (mascot) / `#FAF9F5` (UI) | highlights, UI surfaces |
| Claude coral | `#D97757` | hero accent, drift-spark tier 2, local player |
| Terracotta | `#C96442` | primary CTA, Anchor/Duke bodies |
| Parchment | `#F5F4ED` | UI surfaces |
| Accent blue | `#6A9BCC` | Turbo stripes, Nova, Sky palette |
| Accent green | `#788C5D` | Bisque, Sage palette |
| Mid gray | `#B0AEA5` | Kage plate, secondary UI |

### 3.2 Themes (`04-maps-tracks.md` §3, `packages/content/src/themes/*.ts`)
| Theme | Hero | Secondary | Ground | Sky / air | Accent | Landmark language | Grade tint [P] |
|---|---|---|---|---|---|---|---|
| clayhill_village 클레이힐 마을 | terracotta `#D97757` | cream `#F4EFE6` | sage `#8FB573` | sky `#9FD3F5` | slate `#5A6B7B` | clay roofs, chimneys, bunting, Spark-mascot weathervanes, clock tower, windmill | warm `#FFF1E6` |
| sunstone_desert 선스톤 사막 | sand `#E8C27A` | sandstone `#C98B4E` | oasis `#3FB8AF` | haze `#F6D7A7` → `#7EC8E3` | — | glyph-carved "token" monoliths, awnings, obelisks | gold `#FFE9C2` |
| frostbyte_glacier 프로스트바이트 빙하 | ice `#BEE9F7` | snow `#F7FBFF` | deep `#2F6FA6` | aurora `#6CF2C2` | aurora `#B57CFF` | crystal pillars, snow globes, penguin village | cool `#E6F6FF` |
| canopy_forest 캐노피 숲 | leaf `#4E9F3D` | moss `#9BC53D` | bark `#6B4226` | mist `#DCEFE3` | mushroom `#E4572E` | giant trunks, mushrooms, karst pillars, waterfalls | green-gold `#F0FFE6` |
| ember_mine 엠버 광산 | basalt `#2B2320` | lava `#FF6A2B` | glow `#FFC857` | crystal `#7FDBFF` | crystal `#C77DFF` | rails, trestles, geodes, lanterns | ember `#FFD9C2` |
| lantern_hollow 랜턴 할로우 | indigo `#1E1B3A` | purple `#6B4FA0` | pumpkin `#FF9F1C` | moon `#FFF3C4` | wisp `#5FFBF1` | jack-o-lanterns, gravestones, manor, bats | violet `#E8E0FF` |
| coral_cove 코랄 코브 | sea `#1FB5C9` | lagoon `#7FE3D6` | sand `#F6E3B4` | sails `#F2F2F2` | sails red `#D94F4F`, wood `#8B5A2B` | galleon, cannons, lighthouse, palms | aqua `#E6FFFB` |
| neon_harbor 네온 하버 | asphalt `#1C1F26` | magenta `#FF3EA5` | cyan `#3EE6FF` | purple `#6A4C93` | sodium `#FFB347` | neon signs (original names), cranes, overpasses | magenta `#FFE6F4` |
| spark_circuit 스파크 서킷 | tarmac `#3A3D42` | kerb red `#E63946` | kerb white `#FFFFFF` | sunset `#FF8C42` → `#6A4C93` | grass `#5BAA4A` | grandstands, pit buildings, sponsor boards (original brands) | sunset `#FFE4D1` |
| orbital_nexus 오비탈 넥서스 | white `#EEF3F8` | glass `#7DE2FC` | deep space `#0B1026` | hologram `#A6FFCB` | Claude orange `#D97757` | sky rails, glass tubes, docking rings, holograms | clean `#F0F6FF` |
Rules: gameplay colours (§9) never come from a theme palette; the theme hero colour may appear on the road only as kerb or edge paint.

---

## 4. Lighting and time of day per track
Theme defaults (`sky`, `sunDir`, `fog`, `headlights`) come from `packages/content/src/themes/<id>.ts`; the track's `THEME` line overrides them.

| Track | Sky / time | Key light | Fog | Headlights | Notes |
|---|---|---|---|---|---|
| meadow_loop | day, 10:00 | sun high, soft blue sky | light blue haze, far 900 m | off | long soft shadows off; bright tutorial feel |
| belltower_piazza | goldenHour, 17:30 | low warm sun behind the tower | warm haze | off | tower casts a long shadow across the plaza |
| sunstone_bazaar | day, 16:00 | warm sun, heat haze | sand haze, far 1000 m | off | heat-shimmer sprites over sand (High) |
| sandglass_canyon | day, 12:00 | harsh noon at the rim; warm bounce light in the canyon (hemisphere ground tint `#E8A060`) | dust | off | sandfall particle sheets |
| snowglobe_halfpipe | overcast | bright diffuse, strong bloom | white, near 100 m | off | crystal cave uses emissive + transmission (High) |
| aurora_summit | aurora, 22:00 | moonlight + animated aurora ribbons | deep blue | **on** | headlight cones as emissive decals + one spot on the local kart (High) |
| fernwood_hollow | day, 08:00 | low morning sun, god-ray cards | mist | off | fireflies emissive |
| cascade_slalom | day, 09:30 | dappled sun through canopy (cookie on the sun, High) | dense mist | off | waterfall spray |
| geode_rail_quarry | underground | amber lanterns + cyan/violet geode emissive | smoky, far 420 m | **on** | no sun shadows; hemisphere only |
| magma_switchback | underground | lava as key light (warm hemisphere ground `#FF6A2B`) | red fog | **on** | heat shimmer over lava |
| pumpkin_lane | night | big moon + warm pumpkin point emissives | indigo | **on** | ghost sprites additive |
| manor_catacombs | night | candle-lit interiors, blue moonlit exterior | indigo | **on** | tunnel env intensity lerps down |
| coral_cove_docks | day, 12:30 | high noon, caustics decal on sand | aqua haze | off | water with depth-fade shore foam |
| kraken_lighthouse | sunset, 18:30 | low orange sun, lighthouse beam (emissive cone) | warm | off | |
| rainline_blvd | night, rain | sodium lamps + neon | dark blue | **on** | wet road: roughness 0.25, puddle decals, rain streak particles |
| skyway_interchange | sunset → night, 19:30 | dusk sky, city emissive windows | purple haze | **on** | strobe tunnel lights |
| spark_grand_circuit | day, 13:00 | clear sun | light | off | crowd cards |
| sunset_arena_rally | sunset, 18:00 | low sun matching the lobby | warm dust | off | dust clouds on gravel |
| token_foundry | studio (interior preset) | clean key + orange accent strips | none/light | off | token-cube particle streams |
| orbital_express | space | starfield, ringed planet rim light | deep space, far 1400 m | off | holograms additive |
| proving_ring | day | clear | light | off | tutorial signage |

Shadow distance per tier: Low 80 m (2×1024), Medium 120 m (2×1024), High 200 m (2×2048), `normalBias` 0.05 [S example].

---

## 5. Material rules (`render/materials`, the only shared TSL surface)
| Rule | Value |
|---|---|
| Unique materials per scene | ≤ 40 (BudgetTracker fails tests above); track static slots ≤ 24 (V20) |
| Variation | through vertex colour, `partId` palettes and uniforms — never new materials per prop |
| Road | albedo luminance 0.25–0.45 (mid-tone so karts pop); asphalt roughness 0.85 (wet 0.25); kerb stripes in shader `step(0.5, fract(v·2))`; lane lines and pad chevrons in shader; AO darkening near walls |
| Walls | per `WallSpec.type` (barrier, fence, rock, parapet, building, planter, pillar, curb, invisible): roughness 0.6–0.9; chevron boards are decals, not materials |
| Terrain | height-and-slope vertex colour + noise; triplanar only on High |
| Water | depth-fade (`viewportLinearDepth − linearDepth`) for shore foam; noise normals; PMREM reflections; no planar reflector |
| Foliage | instanced cards, wind in `positionNode` (`0.08 · heightMask` amplitude) |
| Emissive | `lib.emissive(color, intensity 2–8)` writes to the emissive MRT for selective bloom |
| Textures | ≤ 1024² per texture (terrain splat 2048² on High); canvas textures (signs, liveries, eye atlas) generated after `document.fonts.ready` |
| TSL | read `node_modules/three@0.186.1` sources before using any node API; no `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile` |

---

## 6. Post chain per quality tier (`render/post`, `THREE.RenderPipeline`)
Order: scene pass with MRT (output, emissive, velocity; normal+depth only with GTAO) → GTAO (High) → motion blur (velocity × boost) or radial blur (Low/Medium) → + bloom (emissive MRT) → speed lines → `renderOutput` (tone map + sRGB) → grade (CDL + theme grade; LUT on Medium+) → AA → vignette + chromatic aberration during boost.

| Stage | Low | Medium | High | Ultra (P2) |
|---|---|---|---|---|
| Pixel ratio cap | 1.0 (dynamic 0.7–1.0) | 1.25 | 1.5 | native |
| AA | FXAA | SMAA | MSAA 4× on the scene pass | TRAA (garage/photo only) |
| Bloom (emissive MRT, 5 mips, res 0.5) | strength 0.8, radius 0.4 | 1.0 / 0.5 | 1.0 / 0.5 | 1.0 / 0.5 |
| Boost blur | radial (count 16, weight 0.9, decay 0.95) | radial (count 32) | velocity motion blur (16 samples) | same |
| Speed lines | — | on | on | on |
| GTAO (half res) | — | — | on | on |
| Grade | CDL | CDL + LUT | CDL + LUT | CDL + LUT |
| Chromatic aberration (boost) | — | ≤ 0.2 (TSL units) | ≤ 0.3 | ≤ 0.4 |
| DoF | — | — | garage only | garage/photo |
- Chromatic aberration uses TSL `chromaticAberration(node, strength, center, 1.1)`; values are tuned visually (ADR-012 #19 notes the 0.4 vs 0.004 unit mismatch in the research).
- Reduced motion (accessibility): no motion/radial blur, no CA, no FOV kick.

---

## 7. The Clawd rig (ADR-011) — exact dimensions
Rig units are metres at **rig scale 1.0**. Seated in a kart the rig is scaled by **0.62** [P] so that one body width ≈ 0.55 × kart width (07 chibi proportion); lobby and garage use the same scale.

| Part | Geometry | Size (x × y × z, m) | Position (centre) | Notes |
|---|---|---|---|---|
| Body | `RoundedBoxGeometry` | 1.00 × 0.68 × 0.64, segments 4, radius 0.18 | origin | 12 × 8 cell ratio of Clawd's 12×8-cell silhouette |
| Arms (2) | RoundedBox r 0.06 | 0.20 × 0.20 × 0.26 | x ±0.58, y −0.08 | "2×2 arm stubs"; pivot at the inner face (x ±0.48); rotate for steering |
| Legs (4) | RoundedBox r 0.03 | 0.083 × 0.17 × 0.12 | x −0.375, −0.208, +0.208, +0.375 (body columns 1, 3, 8, 10); y −0.425 | centre gap of 4 cells; hidden in the cockpit when seated |
| Eye slots (2) | decal quads (eye atlas) | 0.09 × 0.20 | x ±0.24, y +0.07, z +0.321 | swappable canvas decals; **no mouth** |
| Sparkle | extruded parametric star | outer radius 0.10, depth 0.03, bevel 0.008 | y +0.46 (0.12 above the head top at +0.34) | 10 rays, radii 0.85–1.05 (normalized), inner 0.3, ±7° seeded jitter; spins 0.6 rad/s; tints to the team colour in team modes; **never the Claude logo path** |
| Anchors | `Object3D` | — | `head_top` (0, 0.34, 0), `back` (0, 0, −0.32), `hand_L/R` (±0.71, −0.08, 0), `face_front` (0, 0.07, 0.32) | accessories attach here |
- Palette (default): body `#D87656`, shade `#BE684D`, eyes `#141413`, ivory `#F9F8F4`.
- **Draws**: ≤ 3 per mascot (vinyl body+accessories merged with a `partId` attribute → 1 draw; eye decals → 1 draw; transparent/emissive accessory → 1 draw).
- **Triangles**: mascot ≤ 4k at LOD0 (kart + driver ≤ 12k), ≤ 1.5k at LOD1 (> 25 m), ≤ 400 at LOD2 (> 70 m, eyes baked into the texture).
- **Eye atlas** (512 × 256, 8 cells): `open`, `blink`, `happy` (^ ^), `dizzy` (spirals), `star`, `angry` (> <), `sleepy`, `wink`. Eye styles: `slot` (default negative-space slots), `led` (Bolt: LED screen), `visor` (Turbo, Glitch: a visor band replaces the slots, the atlas is shown on it).
- **Procedural animation**: bob `|sin(2.2t)| · 0.02 m` scaled by speed; roll `−steer · 8°`; lean ±12° into drifts; head (whole body) yaw toward the steer ±10°; squash 1.08/0.92 for 0.15 s on landing; blink `scale.y 0.15` for 0.12 s every 2–6 s (seeded); arms follow the steering wheel.
- **Emotes** (`EmoteSlot`): `idle`, `win`, `podium`, `lose`, `retire`, `attackLanded`, `gotHit`, `lobby`; 1.5–2.5 s each; every emote starts and ends in the idle pose ("idle is the universal hinge" [S]). Built as `AnimationClip`s from keyframe tracks in code.
- **Accessory readability**: the head accessory must be ≥ 0.3 body widths tall so the character reads from the chase camera (from behind).

---

## 8. Characters (12)
Palette columns follow `MascotPalette { body, shade, accent, detail, eye }`. Personalities match `14-ai-spec.md` §8.

| # | id | Name (KR) | body / shade | accent / detail | eye | eyeStyle | Silhouette and accessories | Personality |
|---|---|---|---|---|---|---|---|---|
| 1 | clay | Clay 클레이 (classic) | `#D87656` / `#BE684D` | `#FAF9F5` scarf / `#D97757` | `#141413` | slot | pure block; ivory racing scarf trailing (6-segment verlet ribbon); sparkle tuft | calm, helpful |
| 2 | pixel | Pixel 픽셀 (true voxel) | `#D87656` / `#BE684D` | `#8B8B8B` / `#F9F8F4` | `#141413` | slot | built from real cubes on a 12×8×6 voxel grid, flat shading, 8-bit shade steps | retro, cheeky |
| 3 | turbo | Turbo 터보 (racer) | `#D97757` / `#BE684D` | `#6A9BCC` stripes / `#FAF9F5` helmet | visor `#2A2A28` | visor | ivory full-face helmet dome, fin spoiler, "01" decal | competitive |
| 4 | anchor | Captain Anchor 앵커 선장 (pirate) | `#C96442` / `#A8533A` | coat `#B53333` / hat `#30302E` + gold `#E0B04B` | `#141413` | slot (one eye under a patch) | tricorn hat, eyepatch, small sparkle-parrot on the arm | boisterous |
| 5 | rune | Rune 룬 (wizard) | `#E08A6D` / `#C4745A` | hat `#3B3F8F` / stars `#F0EEE6` | `#141413` | slot | tall floppy cone hat with a bent tip; sparkle-topped staff | dreamy |
| 6 | nova | Nova 노바 (astronaut) | `#D97757` / `#BE684D` | suit `#F5F4ED` / `#6A9BCC` | `#141413` | slot | glass bubble helmet (transmission 0.9, IOR 1.5 on High; alpha glass 0.25 on Low/Medium), backpack, antenna | curious |
| 7 | kage | Kage 카게 (ninja) | `#D97757` / `#BE684D` | hood `#1F1E1D` / plate `#B0AEA5` | `#141413` | slot (eye slit) | hood and mask with an eye slit; long scarf tails (verlet ribbons) | stoic |
| 8 | bisque | Chef Bisque 비스크 셰프 | `#D97757` / `#BE684D` | toque `#FFFFFF` / neckerchief `#788C5D` | `#141413` | slot | tall toque, ladle | warm, fussy |
| 9 | frost | Frost 프로스트 (ice) | shell `#9FD3F2` / `#7BB8DE` | `#FFFFFF` crown / earmuffs `#E8F6FF` | `#0E2A47` | slot | translucent crystal shell (transmission 0.6, IOR 1.31 on High; sheen + Fresnel fake on Low/Medium), icicle crown, earmuffs | cool, shy |
| 10 | glitch | Glitch 글리치 (neon cyber) | `#1C1B22` / `#121117` | emissive `#FF7A50` / `#2EF2FF` | `#2EF2FF` | visor | emissive edge lines, holo visor, headphones | hyper |
| 11 | bolt | Bolt 볼트 (copper robot) | copper `#B87333` (metalness 0.9, roughness 0.3) / `#8C5626` | LED `#FFB347` / rivets `#5A5A5A` | LED `#FFB347` | led | rivets, bulb antenna, wind-up key on the back, LED screen eyes | literal-minded |
| 12 | duke | Duke 듀크 (royal) | `#C96442` / `#A8533A` | crown `#F2C14E` / ruby `#B53333` | `#141413` | slot | crown, ermine cape `#FAF9F5` (4×3 verlet cloth-lite), scepter | dignified, vain |

**Emotes per character** (win / podium / lose / attackLanded / gotHit / lobby):
| id | win | podium | lose | attackLanded | gotHit | lobby |
|---|---|---|---|---|---|---|
| clay | tuft spins + thumbs-up | "…" thought bubble, then thumbs-up | slow blink, slump | happy eyes, hop | dizzy eyes | wave |
| pixel | 8-bit hop with square particles + chiptune arpeggio | crab-walk shuffle | pixel "sweat" squares | star eyes | spiral eyes, pixel stars | crab-walk idle |
| turbo | checkered-flag wave | visor flip up, grin eyes | visor down, head shake | fist pump | visor cracks (decal) | visor polish |
| anchor | "Yo-ho!" hat tip + gold-coin burst | telescope peek | hat over eyes | parrot flaps | parrot squawks, feathers | telescope sweep |
| rune | wand twirl + sparkle firework | staff raised, stars orbit | hat droops | star eyes, sparkle | hat spins | floating stars idle |
| nova | zero-g spin with a ringed-planet particle | salute | helmet fogs up | thumbs-up, antenna blinks | antenna sparks | float bob |
| kage | smoke-puff vanish and reappear | shuriken spin | scarf droops | quick bow | smoke puff | meditate |
| bisque | chef's kiss, heart + steam particles | taste test with the ladle | toque deflates | ladle twirl | flour puff | stirring |
| frost | snowflake burst | frosty breath cloud | icicles droop | crystal sparkle | cracked-ice decal | breath puffs |
| glitch | RGB-split glitch shader + dance loop | headphone groove | static noise over the visor | visor "GG" | glitch jitter | dance loop |
| bolt | body spin + steam whistle | LED "1ST" | LED "…" + steam sputter | LED smile | rivets pop (visual) | wind-up key turns |
| duke | royal wave + confetti + trumpet fanfare | scepter raised | cape over face | regal nod | crown tilts | cape swish |
Retire (`retire`) for all: sits, sighs, eyes `sleepy`.

**Palette skins** (any character, garage): Midnight `#30302E`, Parchment `#F5F4ED`, Sage `#788C5D`, Sky `#6A9BCC`; shade = body darkened 12% in linear space.

---

## 9. Karts (8)
Shared build: rounded-box chassis, 4 wheels (lathe tyre + cylinder rim), steering wheel, `seat` anchor, exhaust anchors for flames, livery canvas texture (1024 × 512: base, accent, pattern, number, plate, sparkle stickers). Kart ≤ 8k triangles at LOD0 (≤ 12k with the driver), ≤ 2.5k at LOD1, ≤ 800 at LOD2.

| id | Name (KR) | Archetype | L × W × H (m) | Wheel r (m) | Silhouette | Parts | Exhausts | Livery ideas |
|---|---|---|---|---|---|---|---|---|
| pebble | Pebble 페블 | balance (starter) | 1.6 × 1.1 × 0.5 | 0.22 | open tube-frame go-kart | `TubeGeometry` roll hoop and bumpers, side pods, number plate | 1 | stripes, big side number |
| clay_comet | Clay Comet 클레이 코멧 | balance | 1.8 × 1.2 × 0.7 | 0.25 | bubble "pebble car" capsule | Lathe/sculpted capsule body, sparkle tail fin, bubble canopy frame | 2 | two-tone split, sparkle stickers |
| arrowhead | Arrowhead 애로헤드 | speed | 2.0 × 1.2 × 0.45 | 0.24 front / 0.28 rear | low open-wheel wedge | extruded side profile, front and rear wings, air intakes | 2 | racing chevrons, sponsor-style original marks |
| tugboat | Tugboat 터그보트 | balance (heavy, weight 1.2) | 1.7 × 1.3 × 0.8 | 0.32 | chunky retro buggy | balloon tyres, bull bar, roof lamp, spare wheel | 1 big stack | camo blocks, safety stripes |
| glacier_sled | Glacier Sled 글레이셔 슬레드 | drift | 1.9 × 1.15 × 0.55 | 0.20 (small hub pods) [P] | ski-front hover-kart | twin skis, emissive cyan thrusters, windscreen | 2 thrusters | ice crystals, aurora gradient |
| neon_blade | Neon Blade 네온 블레이드 | speed | 2.0 × 1.2 × 0.5 | 0.25 [P] | cyber hypercar | underglow (emissive decal quad + bloom, no point light), emissive rim wheels, fins | 2 | circuit traces, neon edge lines |
| jet_kettle | Jet Kettle 제트 케틀 | drift | 1.8 × 1.2 × 0.75 | 0.27 [P] | steampunk brass boiler | boiler drum, twin smokestacks that puff on boost, gauges, rivets | 2 stacks | brass filigree, copper panels |
| crown_cruiser | Crown Cruiser 크라운 크루저 | speed | 1.9 × 1.25 × 0.7 | 0.28 [P] | royal chariot-car | gold filigree decal texture, velvet seat, crown ornament | 2 | royal crests, velvet and gold |
- Wheels spin from `wheelSpin`; front wheels steer ±25° visually; suspension is a visual spring (0.04 m travel).
- Driver seat height puts the mascot's eyes 0.55–0.8 m above the road (scaled rig), so the chase camera always sees the head accessory.

---

## 10. VFX catalogue (`render/vfx`, stateless GPU particles)
Particles are CPU-spawned into ring buffers of instanced attributes (`p0, v0, spawnTime, seed, tier`) and animated in the vertex node (`p = p0 + v0·age + ½g·age²`); no compute (works on the WebGL2 backend). Counts scale with the tier's particle budget (25% / 60% / 100% / 150%).

### 10.1 Driving
| Effect | Trigger (sim state or event) | Look |
|---|---|---|
| Drift sparks | `drift = 1`, per rear wheel | additive stretched sparks, 40–80/s per wheel, life 0.25–0.45 s; tier by drift length: **white** (0–29 ticks), **coral `#D97757`** (30–59), **violet `#B57CFF`** (≥ 60 ticks or when the gauge completes a booster this drift) [original tiering]; written to the emissive MRT |
| Double-drift flare | `doubleDrift` | ring of sparks + brief tier jump |
| Tyre smoke | drift or hard braking | soft particles, life 0.8–1.5 s, size 0.3 → 2.0 m; tinted by surface (asphalt grey, sand tan `#E8C27A`, snow white, dirt brown, gravel grey-brown) |
| Skid marks | drift, brake > 0.5 at speed | ribbon ring buffer per rear wheel, 2 vertices per 0.25 m, ≈ 2000 segments, +1.5 cm offset, fade over 10 s; tinted by surface |
| Boost flame — normal | `boostKind = normal` | two cone meshes, scrolling noise UV, emissive 4–8: core `#FFD23F` → edge `#FF5A36`; custom flame colours apply to this kind only |
| Boost flame — team | `boostKind = team` | core `#2ACAFF` → edge `#8A5CFF`; **never customizable** |
| Boost flame — start | `startTicks > 0` | white-gold `#FFF3C4` burst ring at GO, then a short gold flame |
| Boost flame — item | `boostKind = item` (Turbo Token) | coral `#D97757` flame with orbiting token glyphs |
| Pad boost | `boostStart` on a `boost_pad` surface | teal-green `#3EE6C8` flame and chevron flash on the pad |
| Instant boost | `instantBoost` | 30-tick white-cyan puff from the exhausts + a bright two-note chime |
| Draft | `draftCharge > 0` | wind streak lines trailing the kart ahead; `draft{on}` adds a whoosh ring |
| Wall hit | `wall{severity}` | severity 0: grind sparks stream; 1: 20 sparks + dust; 2: 60 sparks + debris chips + shake |
| Bump | `bump` | star burst at the contact point, size by impulse |
| Air / land | `air`, `land` | landing dust ring (size by impact), squash |
| Respawn | `respawn{out/in}` | out: sparkle dissolve to white over 0.4 s; in: rebuild from sparkles; ghost: 50% opacity with dither while `ghostTicks > 0` |
| Countdown | `countdown` | GO: additive expanding ring [S `RaceCounterGo_CircleAdd`] |
| Finish | `finish` | confetti burst from the arch, gold for 1st |

### 10.2 Items (by `vfxKey`)
| vfxKey | Use | Flight / hazard | Hit |
|---|---|---|---|
| `item.turbo_token` | coral token sucked into the exhaust | — | item flame (above) |
| `item.attention_tether` | beam of "attention head" dots shoots forward | dotted beam line user ↔ target | tug pulse along the beam; slingshot violet streak |
| `item.overclock_aura` | spinning spark halo + red/blue strobes around the kart | — | star swirl on victims |
| `item.prompt_missile` | launch puff | capsule with spark fins, `>_` text-ribbon trail; red target arrow on the victim's HUD | explosion puff; victim spins upward with a trail |
| `item.top1_missile` | gold fanfare flash | gold capsule with "#1" glyph | gold burst |
| `item.token_bomb` | lob arc | sphere with a shadow decal marking the 6.5 m landing circle (red ring 0.5 s before landing) | bubble full of floating token glyphs around each victim |
| `item.bug_report` | buzzing bug launch | cute flying bug with wing blur | bug wraps the victim in a bubble |
| `item.broadcast_bolt` | sky flicker for 21 ticks | — | bolt onto every victim + electric arcs |
| `item.throttle_drone` | drone lift-off | hex drone showing "429" | tractor-beam cone over the leader while stacked (stack count as "429 ×2") |
| `item.firewall` | blocks drop in over 24 ticks | brick-shader blocks with flame noise | bricks shatter into debris |
| `item.glitch_puddle` | drop plop | pixel-noise decal with RGB split | pixel burst + spin swirl |
| `item.redaction_cloud` | ink puff | ink-black particle cloud (soft particles) | screen overlay of ████ bars on the victim (UI layer) |
| `item.mirror_mode` | mirrored-arrow glyph over each victim during the 30-tick telegraph | — | arrows flip; screen edge mirror shimmer (UI layer) |
| `item.context_shield` | Fresnel bubble with a scrolling token-window texture | — | glass pop; "late signal": bubble shatters with a network icon |
| `item.interrupt_pulse` | expanding ring with a "^C" glyph | — | drones fall and fizzle |
| `item.alignment_halo` | gold torus halo over every teammate | — | halo flashes on absorb |
| `item.interpretability_lens` | magnifier sweep over the standings | — | — |
| `item.mutex_lock` | padlock flies to each opponent | — | padlock over the victim's item slots |
| Item box | floating "Prompt Cube": ivory `#FAF9F5` cube with coral `#D97757` edges and a rotating "?" glyph, bloom | — | shatter into sparkles; personal respawn fade-in |

### 10.3 Status visuals
airborne (spin-up + trail), trap bubble (Fresnel sphere, token glyphs, mash arrows ◀ ▶ over the kart), spin (orbiting stars), stun (electric arcs), post-stun slow (grey exhaust puffs), throttle (drone beam), mirror (arrow glyph above), slot lock (padlock), shield (bubble), halo (torus), pulse guard (thin ring), firewall hit (brick debris), escape boost (bubble pop + cyan puff).

---

## 11. Readability rules
| Element | Rule |
|---|---|
| Boost pad | green/teal pad (`#1FB5A0` edge, `#3EE6C8` core) with scrolling chevrons and a green gate on every theme [S classic convention] |
| Jump pad / ramp | coral pad `#FF7A59` with a pink gate `#FF9EC7` [S] |
| Chevron boards | on the outside of every corner with R < 25 m (|κ| > 1/25 m⁻¹), every 6–8 m, facing oncoming karts, arrow pointing into the turn; high contrast (≥ 3:1 luminance vs background) |
| Painted road arrows | large white chevrons on the asphalt before hairpins and branch splits |
| Branch entrances | a readable arch or sign; risky branches with hazard striping |
| Item boxes | the only rotating ivory-and-coral cubes in the game; never re-coloured by themes |
| Hazard telegraph | red `#E5484D` pulse, ground decal ring at the active area, audio cue ≥ 36 ticks (0.6 s) before activation |
| Kill edges | visible void, lava or water with a glowing edge line; ledges without walls get a curb-coloured edge stripe |
| Team colours | red `#E5484D`, blue `#2ACAFF`, green `#7BD88F`, yellow `#FFD23F` (name plates, sparkle tint, results) |
| Local player | coral gradient name badge; other karts' names in white with a dark rank badge |
| Road tone | mid-tone albedo (luminance 0.25–0.45); props within 2 m of the road edge are low-saturation and non-emissive |
| Silhouettes | karts and mascots always get the Fresnel rim; minimum 3:1 luminance contrast against the road in every theme (checked on contact sheets) |
| Ghost karts | 50% opacity with a dither pattern, no shadow |

---

## 12. Camera (`render/camera`)
| Parameter | Value [P from 05/07] |
|---|---|
| Vertical FOV | 70° base; widens to 74° from 20 → 34 m/s; **boost kick to 80°**, eased with τ = 0.25 s; horizontal FOV clamped to ≤ 120° on ultrawide |
| Chase position | 5.2 m behind along the smoothed heading, 1.9 m up; look-at 1.2 m above the kart and 6 m ahead |
| Speed pull-back | +0.6 m distance while boosting; −0.3 m below 10 m/s |
| Smoothing | position spring ω = 8 s⁻¹, yaw spring ω = 6 s⁻¹, pitch follows the ground normal with ω = 4 s⁻¹ |
| Drift look | yaw offset toward the inside of the drift by 0.35 × slip angle (max 14°) and 0.8 m lateral swing to the outside |
| Air | +0.5 m height; pitch damped |
| Shake | wall-normal speed > 9 m/s: amplitude 0.08 m, 12 Hz, decay 0.3 s; > 18 m/s (big crash): 0.18 m; landing > 6 m/s: 0.05 m |
| Boost juice | FOV kick, radial/motion blur ramp over 0.15 s, speed lines, chromatic aberration (§6) |
| Rear view | hold X (P2): camera 2.2 m in front of the kart, 1.6 m up, looking back; HUD shows a small "REAR" tag |
| Occlusion | three-mesh-bvh shapecast r 0.3 against occluder layers; pull in to a minimum of 2.5 m; tunnels lower the height to 1.4 m |
| Intro flyover | 240 ticks (4.0 s) along the track spline at 12–20 m height, ending behind the grid |
| Grid shot | 90 ticks (1.5 s) slow orbit around the local kart |
| Finish | "FINISH" slam, 0.35 s of 0.4× render slow motion (the sim keeps its rate), then an orbit around the player: radius 6 m, height 2 m, 360° in 6 s |
| Spectator/replay | follows the leader or a chosen kart with the chase preset |
| Reduced motion | no FOV kick, no shake, no blur/CA |

---

## 13. Contact-sheet review checklist (M4 art pass)
For each track, `pnpm e2e:tracks` produces 8 shots (grid, T1, signature feature, mid-lap, a drift, a boost, an item fight, finish) at 1280 × 720 on Low and High:
1. Karts and mascots readable against the road in every shot (rim light, contrast).
2. Pads, boxes, chevrons and hazard telegraphs follow §11 exactly.
3. Theme palette matches §3.2; no gameplay colour in the scenery.
4. No z-fighting, floating props, visible seams or texture stretching.
5. Signature feature clearly visible from the chase camera.
6. Budgets met (`40-perf-budgets.md`).
Characters: lineup sheet at 3 angles (front, three-quarter, back from the chase camera) per character and per palette skin; karts: turntable sheet with 2 liveries each.
