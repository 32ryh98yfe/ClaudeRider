# ClaudeRider: Track and Map Design Research

## 0. How this was researched, and how far to trust it

The egress proxy blocked direct page fetches from namu.wiki, thewiki.kr, fandom, the Nexon sites (kartdrift / sea.nexon), Pocket Gamer, Gamezebo, ZDNet, Wikipedia, Reddit, threejs.org and several other domains. The web-search quota also ran out partway through the session. The facts below come from three kinds of source:
- **Search-result snippets** from the namu.wiki difficulty and theme pages, the fandom wiki, Pocket Gamer and GamingOnPhone.
- **Documents on GitHub that could be fetched in full:**
  - Plush777/KartDocs, a Korean KartRider: Drift technique wiki
  - overjoy1008/OrangeCarrrrrPhysics, a KartRider recreation project that measured the geometry of 15 classic tracks from the 2004 demo data
  - DaeHee99/Kart_License, record-time tiers from KartRider Rush+
  - D3vle0/kart-track-quiz, a list of 519 classic tracks
  - the forkwikiman/enha wiki mirror
  - the three.js source code
- **General game-design reasoning.** Anything that is not sourced is labelled **PROPOSED**. Where the namu.wiki revisions disagree, the report says so.

---

## 1. How tracks work in KartRider: Drift

### 1.1 Themes and when they arrived
- **Preseason launch themes:** Forest (포레스트), Desert (사막), Village (빌리지), Ice (아이스), Mine (광산) and World (월드).
- **Added in later updates:** Factory (팩토리), WKC (World Kart Championship), Cemetery (공동묘지), Moonhill City (문힐시티), Nortueil (노르테유) and Pirate (해적).
- **Overdrive patch:** Kauzi (카우지), the first theme original to Drift.

Drift's **World** theme folds together the classic World, China and Beach themes, which is why Xi'an Terracotta (시안/서안 병마용) is listed under World. Season 2 ("World Kart Championship") started on 11 May 2023 with WKC Korea Circuit and WKC Brazil Circuit. The Season 3 mid-season update added Forest "Misty Falls" and WKC "Mexico Touring Rally", and Nexon promised new tracks monthly after that. One Pocket Gamer snapshot counted 30 tracks at that point.

The classic PC game had many more themes. The enha mirror counts 20 or more, and the quiz dataset lists 519 tracks across 40+ themes, including China, Mansion (대저택), Brodi (브로디), Golden Civilization, Nemo, Fairy Tale, Nymph, Mechanic, 1920, Jurassic, Camelot, Olympus, Abyss and Beach. I found no evidence that **Mansion or Brodi** exist in Drift. They are classic themes.

### 1.2 Difficulty scale
- Drift grades every track **1 to 5** (난이도 1–5).
- A licence gates time-attack access. For example, difficulty-3 tracks need the "B1" licence.
- Tracks are tagged for speed mode, item mode or both (공용 = shared).

### 1.3 Known Drift tracks by theme

| Theme | Track (Korean name, rough English) | Diff. | What is notable (sourced snippet, or "technique doc" = KartDocs) |
|---|---|---|---|
| Village | 운하 (Canal) | 1 | Shared-mode starter. Used to practise cutting drifts |
| Village | 산들바람 공원 (Breeze Park) | 1 | Starter |
| Village | 시계탑 (Clock Tower) | 2 | The classic version has a reverse-direction branch |
| Village | 시청 광장 (City Hall Plaza) | 2 | |
| Village | 러시아워 (Rush Hour) | 2 | The start line sits very close to the first corners |
| Village | 고가의 질주 (Elevated Highway) | 2 | Commuter highway full of **moving traffic cars** that block the road. The most contested record track. No hard corners, so it is the reference for fundamentals. Classic data: **2 laps** |
| Village | 손가락 (Finger) | 3 | Finger-shaped layout. A **2-gate short shortcut**. Almost flat. Classic data: 3 laps, 564×671-unit footprint |
| Village | 붐힐 터널 (Boomhill Tunnel) | 5 | Classic data: **1 lap**. The straight ratio is only about 12% |
| Desert | 베거이 시장 (Market) | – | Peaceful market and village, oasis, camels |
| Desert | 스핑크스 수수께끼 (Sphinx Riddle) | 2 | Stone coffins, **sand waterfalls**, elaborate traps |
| Desert | 피라미드 탐험 (Pyramid Exploration) | 3 | Runs inside a giant pyramid. Practice track for **jump-drift timing**. Classic data: 3 laps |
| Desert | 오래된 송수관 (Old Aqueduct) | 4 | Pyramids, oasis and sand flats. Sudden **sharp curves** punish sightseeing |
| Desert | 빙글빙글 공사장 (Spiral Construction Site) | 5 | Market, then village, then a **spiral climb** up a construction site. "Contains almost every corner type." Classic data: 2 laps |
| Desert | 잊혀진 고대의 기록, 울렁울렁 | – | Listed; no details found |
| Ice | 투명동굴 (Crystal Cave) | 1 | |
| Ice | 하프파이프 (Halfpipe) | 1–2 | The namu.wiki revisions disagree on the grade |
| Ice | 360 타워 (360 Tower) | 2–3 | Tower or loop gimmick. The revisions disagree on the grade |
| Ice | 익스트림 경기장 (Extreme Arena) | 4 | Complex curves, then entry into a stadium |
| Ice | 설산 다운힐 (Snow Mountain Downhill) | 5 | Classic data: 2 laps. Bounding box 1,939×2,193 units with **784 units of vertical range** |
| Forest | 통나무 (Log) | 1 | The classic version has **470 decoration meshes but only 48 collision meshes** |
| Forest | 골짜기 (Valley) | 1 | |
| Forest | 버섯동굴, 기암괴석, 폭포속으로, 행복한 팬더 마을 (Mushroom Cave, Strange Rocks, Into the Waterfall, Panda Village) | 2 | |
| Forest | 아슬아슬 점프 (Risky Jump) | 3 | Gap jumps |
| Forest | 지그재그 (Zigzag) | – | **Continuous left-right slalom rhythm**. Hard, but builds fundamentals |
| Mine | 보석 채굴장 (Gem Quarry) | 3 | Crosses a gem mine on **high rails**, with falls possible |
| Mine | 뽀글뽀글 용암동굴 (Bubbling Lava Cave) | 3 | Repeated climbs and drops. One slip puts you in the **lava** |
| Mine | 아슬아슬 궤도전차 (Risky Tramway) | 3 | Starts high, descends continuously, then is back in the highlands. It was the **first Drift track with warp and rail gimmicks**. Since the Season 3 patch, **rails charge the boost gauge** |
| Mine | 골드러쉬 (Gold Rush) | 3 | Winding and narrow, so speed control matters. Many downhills give a strong sense of speed |
| Mine | 3개의 지름길 (Three Shortcuts) | – | Many U-turns, and the shortcuts are essential. Double-drift practice |
| Mine | 꼬불꼬불 다운힐 (Winding Downhill) | 5 | The late section is compound S and ㄹ-shaped turns |
| World | 런던 나이트 (London Night) | 2 | **Headlights stay on for the whole race** (night lighting) |
| World | 이스탄불 노을 광장 (Istanbul Sunset Plaza) | 2 | Drift original. Domes at sunset |
| World | 강남 스트리트 (Gangnam Street) | 2 | Wide boulevards plus tight alleys. Signs and ads are a visual feature |
| World | 뉴욕 대질주 (New York Dash) | 4 | Landmarks reinterpreted in Drift style |
| World | 서안/시안 병마용 (Xi'an Terracotta) | 4 | Narrow roads and edges. You can fall between the terracotta statues |
| World | 리우 다운힐 (Rio Downhill) | – | **Parachute start** from the sky |
| World | 마이애미 드라이브, 서울 남산, LA 부스트우드, 두바이 다운타운, 신베이 투어 (Miami, Seoul Namsan, LA, Dubai, New Taipei) | – | Wide, flowing roads. Used to practise long drifts ("끌기") |
| WKC | Korea, Brazil, Mexico Touring Rally, Japan, Canada, Shanghai and Singapore circuits | – | Wide circuits. Korea Circuit is recommended for practising cuts and long drifts |
| Cemetery | 유령습격 (Ghost Raid) | 1 | |
| Cemetery | 공포의 외길, 어둠의 박쥐성, 비밀의 제단 (Path of Terror, Dark Bat Castle, Secret Altar) | 2 | |
| Moonhill City | 도시의 두 얼굴, 조심조심 기찻길, 기차역 질주 (Two Faces of the City, Careful Railway, Station Dash) | 2 | Modern city; railway crossings |
| Factory | 미완성 5구역 (Unfinished Zone 5) | 5 | |
| Nortueil | 익스프레스 (Express) | 5 | Leaked before launch. Classic data: 1 lap, 530 units of vertical range, **one boost pad every ~230 units**, one-way sections |
| Nortueil | 전투 비행장 (Battle Airfield) | – | |
| Pirate | 숨겨진 보물 (Hidden Treasure) | 5 | |
| Pirate | 로비 절벽의 전투, 가파른 감시탑, 상어섬의 비밀 (Cliff Battle, Steep Watchtower, Shark Island) | – | Tight technical turns that need double drifts |
| Kauzi | 추방자들의 마을, 디스트릭트 13, 오염된 황무지, 폐기물 처리장 (Exiles' Village, District 13, Contaminated Wasteland, Waste Treatment Plant) | – | Drift-original dystopian wasteland theme |

**Beginner practice set** recommended by KartDocs: Elevated Highway, Mine Three Shortcuts, WKC Korea Circuit, Mine Gold Rush, Desert Pyramid Exploration, Desert Spiral Construction Site, World Miami Drive and Forest Zigzag. This is a good model for which kinds of track teach which skill.

### 1.4 Measured geometry from the classic data (OrangeCarrrrrPhysics)
These figures are in classic KartRider units, with Z up. Roughly 1 unit ≈ 1 m, going by lap times.
- **Laps:** item-oriented tracks (IDs ending `_I`) have 3 laps. Speed tracks (`_R`) have 1–2 laps. Examples: Snow Mountain Downhill 2, Boomhill Tunnel 1, Nortueil Express 1.
- **Item-track lap length:** 1,285 units (Finger) to 1,702 units (Clock Tower).
- **Road width:** the standard is **40 units**, with a normal range of 32–56. The narrowest "extreme passage" is **12 units**, which the analysis gives as 6.7× the kart width of 1.8. A shortcut under furniture was designed at 14 units, and a veranda passage at 20.
- **Corner radius classes**, from 515 samples:
  - R < 30 is a drift corner, and a track has 3–10 of them.
  - R 40–80 is the main corner type, about half of each track.
  - R > 150 is effectively straight.
- **Straight ratio is the main difficulty dial.** About **25%** is standard for a speed track. About **12%** reads as difficulty 4–5 (Boomhill Tunnel).
- **Checkpoint gate spacing:**
  - 30–45 units in normal sections
  - **20–25** where you need to stop corner-cutting (Spiral Construction Site: 20.2)
  - **60–90** through jumps and boosts (Nortueil: 88.9)
  - a shortcut spans 2–7 gates
- **Wall-ride slope limit:** a design target of 48°, against a drivable limit of **49.5°**.
- **Triangle budget:** collision is about **25%** of triangles, decoration about 75%.
- **Mesh and texture budget:** a track uses 150–400 meshes, 3.3k–4.6k collision triangles and 50–60 textures.
- **Shared pad objects:** booster zones are a **green pad with a green gate**. Jump zones are a **red pad with a pink gate**. These come from a shared common archive, so they look identical on every theme.
- **Rendering in the 2004 demo:** CPU toon shading using a 128×32 ramp texture, where the bright band covers more than 60% of the ramp for a "flat texture" look. Screen-space outlines are about 1.4 px wide.

Rush+ tier times (Kart_License) give a good race-length target. Elite whole-race times run **~0:55–2:05** for most tracks, with long outliers of 2:36–2:58 (China Dragon Sanctuary, Pirate Lodumani). Elevated Highway is about 1:28 at elite and about 1:37 at bronze. The spread between top and bottom tiers is about 7–10%.

### 1.5 Recurring gimmicks
- Moving traffic (Elevated Highway)
- Parachute or sky-drop start (Rio)
- Rails that lock the kart and charge boost, plus warp gates (Mine Tramway)
- Spiral climbs (Construction Site)
- Halfpipes and 360° towers
- Big downhills with a lift or warp back up
- Lava, sand-waterfall and fall-off hazards
- Narrow mandatory passages (classic Mansion basement)
- Reverse-direction branches (Clock Tower)
- Short shortcuts of 2 gates (Finger) or long ones of up to 7 gates
- Jump zones and booster zones with standard colours
- Whole-race night headlights (London)
- Slalom sequences (Zigzag)

### 1.6 Visual identity by theme
This is a general description; it is not quoted from any source.

| Theme | Palette | Landmarks and props | Sky and lighting |
|---|---|---|---|
| Village | Red-orange roofs, cream walls, green hills, blue sky | Cartoon European hill town: clock tower, canals, bridges, highway overpasses, windmills, plaza | Clear midday |
| World | Per-city | City landmarks (Eiffel-like tower, domes, skyscrapers, Christ statue). Plazas with **stone arches, clock tower, domed buildings, flag markers, chevron boards on barriers** (matches reference screenshot 1) | Varies by city: sunset for Istanbul, night for London |
| Desert | Sand gold, sandstone, turquoise oasis | Pyramids, sphinx, obelisks, market awnings, aqueducts, scaffolding | Hot late afternoon, heat haze |
| Ice | White, pale cyan, deep blue | Glaciers, translucent crystal caves, penguins, halfpipes, snowy peaks, arena | Bright and overcast, strong bloom |
| Forest | Leaf greens, bark browns, red mushrooms | Giant trees, logs, mushroom caves, waterfalls, karst rock pillars, pandas | Morning light shafts, mist |
| Mine | Basalt dark, lava orange, crystal cyan and violet | Mine-cart rails, trestles, lava pools, gems, lanterns | Underground, lava used as the key light |
| Cemetery | Indigo, purple, pumpkin orange, wisp green | Gravestones, bat castles, altars, ghosts | Night with a big moon |
| Pirate | Sea teal, wood, white sails | Ships, cannons, cliffs, watchtowers, shark island | Tropical noon or sunset |
| Moonhill City | Asphalt, neon | Modern city, trains, subway, rain | Night or dusk |
| Nortueil | White metal, glass blue | Sci-fi sky city, express rails, space station, airfield | Clean high-key |
| WKC | Tarmac, red and white kerbs, sponsor boards | Pro circuits, grandstands, pit buildings | Daylight. The **lobby is a futuristic stadium city at sunset** (screenshot 2) |
| Kauzi | Rust, toxic green | Wasteland, scrap towns, waste plants | Hazy dystopian |

---

## 2. Design rules for ClaudeRider

1. **Ship two track "genres".** "Item-style" tracks are short (0.9–1.4 km), 3 laps, wide, with open sections for item fights. "Speed-style" tracks are 1.6–2.4 km, 2 laps, and technical. Add a few "journey" tracks of 3.5–4 km run as 1 lap. This mirrors the classic `_I` and `_R` split.
2. **Race length target:** 1:25–2:10 for 8 players at our speed scale. Assume an average speed of 38 m/s (PROPOSED), with a separate display multiplier for the speedometer.
3. **Difficulty dials** (PROPOSED, derived from the ratios in §1.4 and scaled to a 16 m standard road):

| Diff | Straight ratio | Min width | Drift corners per lap | Tightest centreline R | Hazard density | Shortcut risk |
|---|---|---|---|---|---|---|
| 1 | ≥ 40% | 14 m | 2–3 | 30 m | none or static | none, or a free wide one |
| 2 | 32–40% | 12 m | 3–5 | 22 m | 1–2 telegraphed | low (2 gates) |
| 3 | 25–32% | 10 m | 5–7 | 16 m | 2–4 | medium (gap or off-road) |
| 4 | 15–25% | 8 m | 7–9 | 12 m | 4–6, some moving | high (narrow, fall-off) |
| 5 | ≤ 15% | 6 m | 9–12 | 9 m | 6+, timed | very high, big payoff |

4. **Scale conversion.** Keep the classic ratios and convert them to our 16 m standard road: widths × 0.4 and corner radii × 0.4. So a classic drift corner under R30 becomes under 12 m on the centreline. Physics can re-tune this.
5. **One track teaches one lesson**, the way KartDocs uses its practice tracks: cutting, long drift, double drift, jump drift, boost cancel, and so on.
6. **Readability.** Use the same pad colours on every theme: boost is green or teal with scrolling chevrons, and jump is coral with a pink gate. Put chevron boards on the outside of every corner below R 25 m. Use arches as checkpoint visuals.

---

## 3. Twenty original ClaudeRider tracks (10 themes × 2)

Notation used in the layouts:

| Code | Meaning |
|---|---|
| S | straight (length) |
| C | corner (radius / angle) |
| HP | hairpin |
| SS | S-curve |
| J | jump |
| T | tunnel |
| ↑ / ↓ | elevation up / down |
| SC | shortcut |
| BP | boost pad |
| IB | item-box row |

Lengths are per lap. Every track is playable in both modes; ★ marks the mode it is built for.

### Theme A: Clayhill Village
Claude's hometown: a terracotta hill town with a European feel.
- **Palette:** terracotta #D97757, cream #F4EFE6, sage #8FB573, sky #9FD3F5, slate #5A6B7B.
- **Look:** Spark-mascot weathervanes, clay chimneys, bunting.

**A1. Meadow Loop** (diff 1, 3 laps, ~1,050 m, item★ / tutorial)
- **Layout:** long S 180 m with 2 BP, then wide C R40 90°, windmill S 120 m, gentle SS, stone bridge over a creek (slight ↑ then ↓), C R35 180° around the village green, back to the start.
- **Gimmick:** tutorial prompts on signboards: drift, then boost.
- **Hazards:** none. Soft hay-bale barriers.
- **Item rows:** 3 IB per lap.
- **Props:** windmill, sheep, market stalls, flower boxes.
- **Lighting:** 10 am sun, soft blue sky.
- **Music:** bright marimba and ukulele pop, 120 BPM, major key.

**A2. Belltower Piazza** (diff 2, 3 laps, ~1,350 m, both modes)
This is the reference-screenshot track.
- **Layout:**
  1. Arcade S under 3 **stone arches**
  2. C R25 90° into the cathedral square
  3. 270° lap around the **clock tower** plaza
  4. Domed basilica street SS
  5. Short SC through the arcade colonnade (2 gates, 8 m wide, saves ~0.6 s)
  6. Stepped plaza ↓ with a small J
  7. Riverside S back to the start
- **Gimmick:** the tower's bell rings on each lap and its hands show the race timer.
- **Hazards:** pigeons that scatter (cosmetic), café tables at the SC entrance.
- **Props:** domes built from hemisphere-plus-drum primitives, pennant flags with a wind shader, chevron boards, a fountain.
- **Lighting:** golden late afternoon.
- **Music:** accordion-and-strings waltz-pop, 132 BPM.

### Theme B: Sunstone Desert
- **Palette:** sand #E8C27A, sandstone #C98B4E, oasis #3FB8AF, haze sky #F6D7A7 fading to #7EC8E3.
- **Look:** glyph-carved "token" monoliths.

**B1. Sunstone Bazaar** (diff 1, 3 laps, ~1,200 m, item★)
- **Layout:** awning-lined market S, C R35 around the oasis pond, palm SS, a wide dune J with a generous landing, then the caravan road back.
- **Gimmick:** a free wide dune shortcut that teaches off-road slowdown (sand multiplier 0.85).
- **Hazards:** a rolling pot cart that crosses slowly.
- **Props:** camel statues, rugs, lanterns, palms.
- **Lighting:** 4 pm heat haze.
- **Music:** oud-flavoured synth, 110 BPM.

**B2. Sandglass Canyon** (diff 4, 2 laps, ~2,100 m, speed★)
- **Layout:**
  1. Descent into a slot canyon (↓ 25 m)
  2. 5-corner technical S chain R12–18 under **sand waterfalls** (visibility and slowdown if you clip them)
  3. Rope-bridge SS
  4. Obelisk hairpin HP R10
  5. Long ↑ switchback ramp of 3 × 180° to the rim
  6. Rim S with 2 BP
  7. Big J across the canyon mouth
- **Shortcut:** a narrow ledge (6 m, no barrier, fall-off) that skips the switchbacks. Saves ~1.5 s.
- **Hazards:** sandfalls, ledges.
- **Lighting:** harsh noon at the rim, warm bounce light in the canyon.
- **Music:** driving percussion, 140 BPM.

### Theme C: Frostbyte Glacier
- **Palette:** ice #BEE9F7, snow #F7FBFF, deep #2F6FA6, aurora #6CF2C2 / #B57CFF.

**C1. Snowglobe Halfpipe** (diff 2, 3 laps, ~1,300 m, item★)
- **Layout:** penguin-village S, a **halfpipe section** 120 m long with the road banked up to 60° on both walls (players pick a line), crystal-cave T (translucent shader), C R25 turns, ice-rink hairpin with grip 0.75.
- **Gimmick:** wall height changes the exit speed.
- **Hazards:** sliding penguin sleds, icy patches.
- **Lighting:** bright overcast with strong bloom.
- **Music:** glockenspiel electro, 124 BPM.

**C2. Aurora Summit Descent** (diff 5, 2 laps, ~2,400 m, speed★)
- **Layout:**
  1. Start at the summit
  2. Steep ↓ of 180 m total drop through 9 drift corners
  3. Ski-jump J with ~1.4 s of air
  4. Ice-shelf SS with no rails (fall-off)
  5. Avalanche gully T
  6. At the bottom, a **gondola rail** locks the kart for 6 s, charges boost, and returns it to the summit (the Drift rail idea, made original)
- **Hazards:** snowball rollers timed on a 4 s cycle, cornice edges.
- **Lighting:** night with a dancing aurora and headlights forced on.
- **Music:** epic synth-orchestral, 150 BPM.

### Theme D: Canopy Forest
- **Palette:** leaf #4E9F3D, moss #9BC53D, bark #6B4226, mushroom #E4572E, mist #DCEFE3.

**D1. Fernwood Hollow** (diff 1, 3 laps, ~1,150 m, item★)
- **Layout:** trail S through giant trunks, hollow-log T, wide C R35 around a pond, a gentle mushroom-bounce J that auto-lands.
- **Hazards:** none.
- **Props:** fireflies, ferns (instanced), mushrooms.
- **Lighting:** morning with god-rays.
- **Music:** acoustic folk-pop, 118 BPM.

**D2. Cascade Slalom** (diff 4, 2 laps, ~1,900 m, speed★)
- **Layout:** a **6–8-corner left-right slalom** at 40 m spacing between rock pillars (the Zigzag rhythm), then behind-the-waterfall T, then a canopy boardwalk 20 m up with narrow 9 m SS.
- **Shortcut:** a vine-bridge gap J that saves 1.2 s.
- **Hazards:** swinging log pendulums (period 3 s), spray that briefly obscures the view.
- **Lighting:** misty, dappled.
- **Music:** taiko plus flute, 138 BPM.

### Theme E: Ember Mine
- **Palette:** basalt #2B2320, lava #FF6A2B, glow #FFC857, crystal #7FDBFF / #C77DFF.

**E1. Geode Rail Quarry** (diff 3, 3 laps, ~1,500 m, both modes)
- **Layout:** crystal-cavern S, a **trestle over a pit** with R20 corners, mine-cart rail boost rail (3 s lock), then a spiral ↓ 2 × 360° into the geode chamber, then a lift ramp ↑.
- **Shortcut:** a cart tunnel (7 m wide) that is safe when the carts are timed right.
- **Hazards:** mine carts crossing on a schedule (telegraphed with a bell 1 s ahead), crystal pillars.
- **Lighting:** cool crystal glow plus amber lanterns.
- **Music:** industrial funk, 128 BPM.

**E2. Magma Switchback** (diff 5, 2 laps, ~2,000 m, speed★)
- **Layout:** repeated ↑↓ humps over a lava lake, then 4 hairpins HP R9–11 in a switchback climb, then a narrow 6 m basalt causeway SS, then a **lava geyser** gauntlet, then a long drop-J back to the start.
- **Hazards:** timed geysers (2.5 s cycle, 0.8 s warning glow), fall into lava (respawn plus 2 s penalty).
- **Lighting:** lava as the key light, red fog.
- **Music:** heavy synth-rock, 160 BPM.

### Theme F: Lantern Hollow
Spooky-cute: a festival-of-lanterns graveyard village.
- **Palette:** indigo #1E1B3A, purple #6B4FA0, pumpkin #FF9F1C, wisp #5FFBF1, moon #FFF3C4.

**F1. Pumpkin Lane Parade** (diff 2, 3 laps, ~1,250 m, item★)
- **Layout:** lantern-lit lane S, pumpkin-patch C R25, graveyard SS between tombstones, wooden-bridge J over a creek.
- **Gimmick:** friendly ghosts drift across the road (cosmetic; they pass through karts).
- **Props:** jack-o-lanterns, gates, crooked trees.
- **Lighting:** moonlit night, warm point lights.
- **Music:** swing-spooky big band, 126 BPM.

**F2. Whispering Manor Catacombs** (diff 4, 2 laps, ~1,800 m, both modes)
- **Layout:**
  1. Manor ballroom at a giant scale (you drive across the table)
  2. **Mandatory narrow corridor**, 8 m wide
  3. Spiral staircase ↓
  4. Catacomb T with a 90° grid and double-drift corners
  5. Bat-cave chamber
  6. Portal **warp gate** back to the manor garden
- **Shortcut:** a rotating bookcase door, open 2 s out of every 4.
- **Hazards:** swinging chandeliers, trapdoors that open on a timer.
- **Lighting:** candle-lit interior, blue exterior.
- **Music:** harpsichord drum-and-bass, 150 BPM.

### Theme G: Coral Cove
Tropical buccaneer bay.
- **Palette:** sea #1FB5C9, lagoon #7FE3D6, sand #F6E3B4, wood #8B5A2B, sails #F2F2F2 / #D94F4F.

**G1. Coral Cove Docks** (diff 2, 3 laps, ~1,300 m, item★)
- **Layout:** beach S, pier boardwalk SS, **ship-deck crossing** (drive onto a moored galleon and off a gangplank J), market C, palm loop.
- **Hazards:** rolling barrels on the pier.
- **Lighting:** bright noon, caustics on the sand.
- **Music:** steel-drum pop, 122 BPM.

**G2. Kraken Lighthouse Run** (diff 3, 2 laps, ~1,700 m, speed★)
- **Layout:** cliffside climb ↑ with R18 corners, lighthouse spiral (1.5 turns ↑), cliff-edge SS, **cannon fort** straight, cove descent ↓ into a sea-cave T.
- **Shortcut:** a waterfall cave.
- **Hazards:** cannonballs with target circles shown 1 s ahead; the tide floods one lane every 8 s, slowing it by 30%.
- **Lighting:** sunset.
- **Music:** sea-shanty electro, 136 BPM.

### Theme H: Neon Harbor City
- **Palette:** asphalt #1C1F26, magenta #FF3EA5, cyan #3EE6FF, sodium #FFB347.

**H1. Rainline Boulevard** (diff 3, 2 laps, ~1,800 m, speed★)
- **Layout:** a 6-lane boulevard S with **ambient traffic** (spline-follower cars in two lanes, 12–16 vehicles, speed 18 m/s), a neon arcade SS, a harbour-crane C, an elevated ramp ↑ onto an overpass, a ↓ spiral exit.
- **Shortcut:** an alley 7 m wide.
- **Gimmick:** wet asphalt with reflections, splashes from puddles.
- **Lighting:** rainy night, headlights on for the whole race.
- **Music:** synthwave, 118 BPM.

**H2. Skyway Interchange** (diff 4, 2 laps, ~2,200 m, speed★)
- **Layout:** stacked **cloverleaf interchange** loops (3 levels, ±18 m), a subway T with a train that passes every 10 s on a parallel track (a shortcut through the platform when the gap is clear), a rooftop jump J, and a tunnel S with light strobes.
- **Hazards:** traffic, trains, construction barriers.
- **Lighting:** dusk into night.
- **Music:** future-funk, 142 BPM.

### Theme I: Spark Circuit
A professional racing league with a futuristic stadium; this ties the tracks to the lobby.
- **Palette:** tarmac #3A3D42, kerbs #E63946 / #FFFFFF, grass #5BAA4A, sunset gradient #FF8C42 → #6A4C93.

**I1. Spark Grand Circuit** (diff 1, 3 laps, ~1,600 m, speed★ / tutorial for racing lines)
- **Layout:** a pit straight of 350 m with 2 BP, a wide C R40, an esses SS, a hairpin HP R16 with a huge run-off, and a sweeping back straight.
- **Gimmick:** optional racing-line overlay; kerbs you can ride.
- **Props:** grandstands (instanced crowd cards), a drone camera, sponsor boards with original brand names.
- **Lighting:** clear day.
- **Music:** stadium EDM, 128 BPM.

**I2. Sunset Arena Rally** (diff 3, 2 laps, ~1,900 m, both modes)
- **Layout:** a stadium bowl lap, exit through a gate onto **mixed tarmac and gravel** (grip 0.85), rally jumps J×2, a wooded SS, a crossover bridge (the track crosses itself; needs z-separation of 8 m or more), and a return through the stadium tunnel.
- **Hazards:** dust clouds, off-camber corners (−5° bank).
- **Lighting:** sunset matching the lobby.
- **Music:** anthemic rock-EDM, 134 BPM.

### Theme J: Orbital Nexus
A sci-fi sky and data city in Claude's colour language.
- **Palette:** white #EEF3F8, glass #7DE2FC, Claude orange #D97757, deep space #0B1026, hologram #A6FFCB.

**J1. Token Foundry** (diff 3, 3 laps, ~1,450 m, item★)
- **Layout:** assembly-hall S with **conveyor belts** (+/−15% speed zones), a press gauntlet (hydraulic presses cycling 2 s down and 2 s up, warning light), a server-rack canyon SS, a coolant-pipe T, and an elevator platform ↑.
- **Gimmick:** glowing "token" cubes stream along the belts (particles).
- **Lighting:** clean studio light with orange accents.
- **Music:** glitch-house, 124 BPM.

**J2. Orbital Express Ring** (diff 5, 1 lap, ~4,000 m, speed★ journey)
- **Layout:**
  1. Launch-tube start with a boost
  2. Sky-rail S with **dense boost pads** (one every ~200 m)
  3. A **360° vertical loop** (needs parallel-transport frames)
  4. A zero-g section (reduced gravity, long J)
  5. Glass-tube SS
  6. Space-station docking ring (a banked 540° helix ↓)
  7. Warp gate
  8. A finale down the cityscape
- **Shortcut:** a gap jump between rails.
- **Hazards:** falling off the edge into the void, laser gates on a timer.
- **Lighting:** starfield with a planet rim light.
- **Music:** cinematic trance, 145 BPM.

---

## 4. Defining tracks as data (PROPOSED)

```ts
type Vec3 = [number, number, number];
interface CtrlPt { p: Vec3; w?: number; bank?: number; wallL?: WallType; wallR?: WallType;
  surface?: 'asphalt'|'sand'|'ice'|'gravel'|'wood'|'metal'; tag?: string }
interface TrackDef {
  id: string; name: string; theme: ThemeId; difficulty: 1|2|3|4|5;
  laps: number; modes: ('speed'|'item')[]; seed: number;
  centerline: { points: CtrlPt[]; closed: boolean; tension?: number; sampleSpacing?: number };
  frameMode?: 'worldUp'|'parallelTransport';          // loops/halfpipes → parallelTransport
  startGrid: { s: number; cols: 2; rows: 4; dx: number; dz: number };
  checkpoints?: { spacing: number; extra?: number[] };  // auto-generated when omitted
  itemRows: { s: number; count: number; margin?: number }[];
  boostPads: { s: number; d: number; len: number; width: number }[];   // d = lateral offset
  jumps: { s: number; lip: number; length: number }[];
  branches: { id: string; fromS: number; toS: number; points: CtrlPt[]; kind: 'shortcut'|'alt'; aiMinSkill: number }[];
  rails?: { fromS: number; toS: number; path: Vec3[]; lockSec: number; chargesBoost: boolean }[];
  warps?: { atS: number; toS: number }[];
  hazards: { type: 'traffic'|'pendulum'|'geyser'|'press'|'cannon'|'roller'|'train'; s: number; params: Record<string, number> }[];
  props: { kind: string; mode: 'along'|'scatter'|'landmark'; s?: number; d?: number; density?: number; side?: 'L'|'R'|'both' }[];
  env: { sky: SkyPreset; sunDir: Vec3; fog: [string, number, number]; palette: string[]; music: string; headlights?: boolean };
}
```

Authoring rules:
- Enter control points every 20–60 m. Bank and width are interpolated between them with smoothstep.
- Build the centreline with `THREE.CatmullRomCurve3(points, closed, 'centripetal', 0.5)`. These are the three.js defaults; centripetal avoids cusps and self-intersections.
- Resample with `getSpacedPoints(N)` at N = lapLength / 1.5 m. It is arc-length based through `getUtoTmapping`.
- Raise `arcLengthDivisions` from the default 200 to about lapLength/1 m so spacing is accurate on 2–4 km tracks.
- Store the result as a cache of `s`: cumulative distance, position, tangent, normal, binormal, width and bank.

---

## 5. Procedural generation pipeline (PROPOSED)

1. **Frames.** For ordinary tracks, set right = normalize(T × worldUp) and up = right × T, then roll by bank around T. This avoids the twist that Frenet frames produce on flat S-curves. For loops, halfpipes and helices, use `curve.computeFrenetFrames(segments, closed)`. It parallel-transports the normal and, when `closed`, spreads the end-to-start twist evenly across segments. Then apply the authored roll on top.
2. **Road ribbon.** At each sample, emit the vertices of this cross-section:

   `[offroad 6m | kerb 1.2m | road w | kerb | offroad]`

   - UV u runs across the width, and v = s / 8 m.
   - Kerb stripes are drawn in the shader with `step(0.5, fract(v*2))`.
   - Lane lines and scrolling boost chevrons are also drawn in the shader.
   - Bake ambient occlusion into vertex colours near the walls.
   - Split the mesh into 64 m chunks for frustum culling.
   - Merge each chunk into one BufferGeometry per material.
3. **Barriers.** Extrude a 2D profile (stone wall, fence, tyre stack, glass, or none) along the edge polylines. Place chevron boards every 6–8 m on the outside of any stretch where curvature |κ| > 1/25 m⁻¹, facing −T, with the arrow set by the sign of κ. Where there is no barrier (ledges), add a kill plane and use a respawn instead.
4. **Collision and height.** Do not use mesh collision for the road.
   - Keep each kart's track parameter `s`, and search locally around the previous `s` using a 16 m uniform-grid spatial hash.
   - Compute the lateral offset `d`.
   - The ground height is center.y + d·sin(bank), taken along the frame's up vector for loops.
   - If |d| exceeds w/2 − halfKart, apply a wall response, with a reflection plus a 15–30% speed loss.
   - Reserve Rapier or raycasts for ramps, props and karts only.
   - Keep the classic budget of about 25% colliders.
5. **Checkpoints and progress.** Place gates every 35 m automatically, every 20–25 m at corners that are tempting to cut, and every 60–90 m through jump and boost areas.
   - Progress = lap·L + s. A lap only counts if gates are passed in order.
   - Branches map their own parameter linearly onto the main-line s range [fromS, toS], so race positions stay continuous through shortcuts.
   - Wrong-way warning: velocity·T < 0 for more than 1.5 s.
   - Respawn: after a fall, or 3 s off-course, snap to the last valid s at 0.3·w from the centre, with 1 s of ghosting.
6. **Item rows.** Place 3–4 rows per lap, never within 25 m of a corner apex. Put them after corner exits or on straights, 150–300 m apart. Each row has 4–6 boxes spread evenly across (w − 2·margin), with a respawn time of 3 s. Hide them in speed mode.
7. **Boost and jump pads.** Keep the colours standard. Place pads at corner exits and before jumps: 2–4 per lap, or one every ~200 m on boost-heavy tracks (the classic Nortueil figure is one per ~230 units). Leave a straight, wide landing zone of 40 m or more after every jump.
8. **Hazards.** Every hazard is a deterministic function of race time, `phase = (t + offset) mod period`, so multiplayer clients agree without syncing hazard state. Telegraph each hazard 0.8–1.0 s ahead with light, sound and a decal. Traffic vehicles are spline followers on lane offsets.
9. **Rails and warps.** A rail locks the kart to a path for `lockSec`, applies a camera sweep, and charges the boost gauge (Drift behaviour). A warp teleports the kart from s_a to s_b while keeping its speed, with a fade and a whoosh sound.
10. **Props.** Use a seeded PRNG, mulberry32(seed), for identical scatter on every client. Use InstancedMesh for foliage and crowds. Build landmarks from a primitive kit:
    - domes: hemisphere plus cylinder drum
    - arches: an extruded arc profile
    - clock tower: box stack plus a canvas clock face
    - flags: a plane with vertex-shader wind

    Aim for 150–400 draw-merged meshes, following the classic scale.
11. **AI and minimap.**
    - **Racing line:** iteratively smooth the lateral offsets to minimise curvature, within w/2 − 1.5 m.
    - **Speed profile:** v = √(a_lat/κ), followed by forward and backward acceleration passes.
    - **Branches:** each branch carries `aiMinSkill`.
    - **Minimap:** the XZ projection of the samples, drawn to a canvas.
12. **Validation script** (run in CI):
    - self-intersection check (allowed only with 8 m or more of z-separation)
    - minimum radius and width against the difficulty table
    - grade ≤ 12% normally and ≤ 25% on ramps
    - lap-time estimate from the speed profile, targeting 28–45 s per lap
    - gate spacing, and item rows kept away from apexes

**Trademark hygiene.** Do not use Nexon names anywhere in the game: no Boomhill, Nortueil, Lodumani, WKC, Kauzi, Beguy, Dao or Bazzi, and none of the Korean or English track titles. Generic words such as "desert", "halfpipe" and "downhill" are fine. The classic layouts above are there to calibrate difficulty, not to be copied.

## Key parameters

- **drift_difficulty_scale**: 1-5 stars; difficulty-3 time attack requires B1 license [sourced] — namu.wiki 카트라이더: 드리프트/트랙/난이도 1-5 (search snippets)
- **drift_launch_themes**: Forest, Desert, Village, Ice, Mine, World (preseason); later Factory, WKC, Cemetery, Moonhill City, Nortueil, Pirate; Kauzi original (Overdrive) [sourced] — namu.wiki 카트라이더: 드리프트/트랙 (snippet)
- **drift_track_count_snapshot**: 30 tracks (Pocket Gamer snapshot) [sourced] — pocketgamer.com tracks-ranked (snippet)
- **classic_laps_item_tracks**: 3 laps [sourced] — OrangeCarrrrrPhysics KartDemoData.cs (_I tracks)
- **classic_laps_speed_tracks**: 1-2 laps (고가의 질주 2, 설산 다운힐 2, 붐힐터널 1, 노르테유 익스프레스 1) [sourced] — OrangeCarrrrrPhysics KartDemoData.cs
- **classic_item_lap_length**: 1285-1702 units (~m) [sourced] — OrangeCarrrrrPhysics TRACK_DESIGN_LIVINGROOM.md
- **classic_road_width**: standard 40 units, normal 32-56, extreme min 12, shortcut 14, narrow passage 20 [sourced] — OrangeCarrrrrPhysics TRACK_DESIGN_LIVINGROOM.md
- **classic_corner_radius_classes**: R<30 drift corner (3-10/track); R40-80 main (~50% of track); R>150 straight [sourced] — OrangeCarrrrrPhysics TRACK_DESIGN_LIVINGROOM.md
- **straight_ratio_difficulty**: ~25% standard speed track; ~12% = hardest (붐힐터널) [sourced] — OrangeCarrrrrPhysics TRACK_DESIGN_LIVINGROOM.md
- **checkpoint_gate_spacing**: 30-45 normal; 20-25 anti-cut; 60-90 jump/boost; shortcut = 2-7 gates [sourced] — OrangeCarrrrrPhysics TRACK_DESIGN_LIVINGROOM.md
- **boost_pad_density_boost_heavy**: 1 pad per ~230 units (노르테유 익스프레스) [sourced] — OrangeCarrrrrPhysics TRACK_DESIGN_LIVINGROOM.md
- **drivable_wall_slope_limit**: 49.5 deg (design at 48 deg) [sourced] — OrangeCarrrrrPhysics TRACK_DESIGN_LIVINGROOM.md
- **collision_vs_decor_ratio**: ~25% collision triangles / 75% decor; Forest Log 470 meshes vs 48 collision [sourced] — OrangeCarrrrrPhysics TRACK_DESIGN_LIVINGROOM.md
- **track_asset_budget**: 150-400 meshes, 3.3k-4.6k collision tris, 50-60 textures [sourced] — OrangeCarrrrrPhysics TRACK_DESIGN_LIVINGROOM.md
- **pad_color_convention**: Boost zone = green pad + green gate; Jump zone = red pad + pink gate (shared across themes) [sourced] — OrangeCarrrrrPhysics TC_GAMES_ASSETS.md
- **toon_ramp**: 128x32 ramp, bright band >60%; outlines ~1.4 px [sourced] — OrangeCarrrrrPhysics ORIGINAL_SHADING.md
- **race_duration_reference**: Elite total race ~0:55-2:05 typical, outliers 2:36-2:58; tier spread ~7-10% [sourced] — DaeHee99/Kart_License converted-map-data.ts (KartRider Rush+)
- **mine_rail_gimmick**: Rails lock kart and charge boost gauge (since Season 3); warp gates [sourced] — namu.wiki 광산 / 난이도 3 (snippets)
- **catmullrom_defaults**: curveType 'centripetal', tension 0.5, closed false; arcLengthDivisions default 200 [sourced] — three.js CatmullRomCurve3.js / Curve.js
- **clauderider_standard_road_width**: 16 m (range 12-22 m); min 6 m (diff 5); shortcuts 6-8 m [proposed]
- **clauderider_corner_radius_by_difficulty**: tightest centreline R: D1 30 m, D2 22, D3 16, D4 12, D5 9 [proposed]
- **clauderider_avg_speed_for_layout**: 38 m/s average (display multiplier separate) [proposed]
- **clauderider_lap_time_target**: 28-45 s per lap; race 1:25-2:10 [proposed]
- **clauderider_lap_lengths**: item-style 0.9-1.4 km x3; speed-style 1.6-2.4 km x2; journey 3.5-4 km x1 [proposed]
- **centerline_sample_spacing**: 1.5 m (arcLengthDivisions = lapLength/1 m) [proposed]
- **auto_checkpoint_spacing**: 35 m default; 20-25 m anti-cut; 60-90 m jumps [proposed]
- **item_rows**: 3-4 rows/lap, 4-6 boxes/row, >=25 m from apex, 150-300 m apart, respawn 3 s [proposed]
- **boost_pads_per_lap**: 2-4 standard; 1 per ~200 m on boost-heavy tracks [proposed]
- **jump_landing_zone**: >=40 m straight, full width [proposed]
- **hazard_telegraph**: 0.8-1.0 s warning; deterministic phase = (t+offset) mod period [proposed]
- **wrong_way_timer**: 1.5 s [proposed]
- **respawn_rule**: fall or >3 s off-course -> last valid s, 1 s ghost, +~2 s time loss [proposed]
- **chevron_board_rule**: outside of corners with |curvature| > 1/25 m^-1, every 6-8 m [proposed]
- **grade_limits**: <=12% normal, <=25% ramps [proposed]
- **road_chunk_size**: 64 m chunks for culling; spatial hash cell 16 m [proposed]
- **grip_multipliers**: ice 0.75, sand/gravel 0.85, off-road speed x0.85 [proposed]
- **track_roster**: 20 tracks / 10 themes; difficulty mix D1x4, D2x4, D3x5, D4x4, D5x3 [proposed]

## Open questions

- Exact current KartRider: Drift track count and per-track lap counts could not be verified: namu.wiki, fandom and the Nexon sites were blocked. Lap counts here come from classic 2004 demo data.
- Grades for Ice Halfpipe (1 or 2) and 360 Tower (2 or 3) differ between namu.wiki revisions.
- Whether Mansion (대저택), Brodi (브로디) and China exist as separate themes in Drift is unconfirmed. China appears to be folded into World in Drift.
- Unit scale of the classic data: a 1.8-unit kart width against a 40-unit standard road implies about 22 kart-widths, which seems wide. The physics/kart-size agent should confirm our 16 m road against the final kart dimensions.
- The finish countdown after first place (commonly cited as about 10 s in classic KartRider) and the item-box respawn time were not verified; 3 s respawn is proposed.
- Final speed scale (average 38 m/s proposed) must be reconciled with the physics research so the lap-length targets hold.
- Identity of the reference screenshot track: likely a World-theme plaza (Istanbul Sunset Plaza has domes; Clock Tower is a Village track); this could not be confirmed visually.

## Sources

- https://namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8/%ED%8A%B8%EB%9E%99 (search snippets only; direct fetch blocked)
- https://namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8/%ED%8A%B8%EB%9E%99/%EB%82%9C%EC%9D%B4%EB%8F%84%201 (snippet)
- https://namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8/%ED%8A%B8%EB%9E%99/%EB%82%9C%EC%9D%B4%EB%8F%84%202 (snippet)
- https://namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8/%ED%8A%B8%EB%9E%99/%EB%82%9C%EC%9D%B4%EB%8F%84%203 (snippet)
- https://namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8/%ED%8A%B8%EB%9E%99/%EB%82%9C%EC%9D%B4%EB%8F%84%204 (snippet)
- https://namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8/%ED%8A%B8%EB%9E%99/%EB%82%9C%EC%9D%B4%EB%8F%84%205 (snippet)
- https://namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8/%ED%8A%B8%EB%9E%99/%EC%82%AC%EB%A7%89 (snippet)
- https://namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8/%ED%8A%B8%EB%9E%99/%EA%B4%91%EC%82%B0 (snippet)
- https://namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8/%ED%8A%B8%EB%9E%99/%EC%9B%94%EB%93%9C (snippet)
- https://namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8/%ED%8A%B8%EB%9E%99/%EB%B9%8C%EB%A6%AC%EC%A7%80 (snippet)
- https://kartrider-drift.fandom.com/wiki/Tracks (snippet)
- https://kartrider-drift.fandom.com/wiki/Season_2 (snippet)
- https://www.pocketgamer.com/kartrider-drift/tracks-ranked/ (snippet)
- https://gamingonphone.com/news/kartrider-drift-season-3-mid-season-update-brings-new-tracks-balance-changes-and-more/ (snippet)
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/faq/speed/what_is_the_best_map_for_beginners_to_practice_on.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/speed/tech/shortcut.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/speed/tech/combo.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/speed/tech/double.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/speed/tech/spinturn.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/speed/tech/long.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/speed/tech/optimize.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/speed/tech/cutting.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/attack/banana.mdx
- https://github.com/Plush777/KartDocs
- https://raw.githubusercontent.com/overjoy1008/OrangeCarrrrrPhysics/main/docs/TRACK_DESIGN_LIVINGROOM.md
- https://raw.githubusercontent.com/overjoy1008/OrangeCarrrrrPhysics/main/docs/TC_GAMES_ASSETS.md
- https://raw.githubusercontent.com/overjoy1008/OrangeCarrrrrPhysics/main/docs/ORIGINAL_SHADING.md
- https://raw.githubusercontent.com/overjoy1008/OrangeCarrrrrPhysics/main/Assets/_Project/Scripts/Core/Data/KartDemoData.cs
- https://raw.githubusercontent.com/DaeHee99/Kart_License/main/src/lib/converted-map-data.ts
- https://github.com/DaeHee99/Kart_License
- https://raw.githubusercontent.com/D3vle0/kart-track-quiz/main/public/track.json
- https://github.com/davidhcefx/Tracks-in-KartRider-Rush-Story-Mode
- https://raw.githubusercontent.com/forkwikiman/enha/master/mirror/%ED%81%AC%EB%A0%88%EC%9D%B4%EC%A7%80%EB%A0%88%EC%9D%B4%EC%8B%B1%20%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94.md
- https://raw.githubusercontent.com/mrdoob/three.js/dev/src/extras/core/Curve.js
- https://raw.githubusercontent.com/mrdoob/three.js/dev/src/extras/curves/CatmullRomCurve3.js
- https://github.com/topics/kart-racing
- https://github.com/whotookzakum/kartrider-drift-files
