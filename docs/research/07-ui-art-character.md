# ClaudeRider: UI/UX, Art Direction, Audio Direction and Character Roster (research report)

> **Research constraints (read first).** This session had used up its WebSearch budget (200/200) before this agent started, and the egress proxy blocked most gaming sites: namu.wiki, inven.co.kr, kartdrift.nexon.com, kartrider.fandom.com, Steam, PCGamingWiki, Wikipedia, YouTube, threejs.org and tonejs.github.io. The research therefore relied on GitHub and raw.githubusercontent.com (allowed), anthropic.com (allowed), and first-hand inspection of **datamined KartRider: Drift UI assets** in the public repo `whotookzakum/kartrider-drift-files` (a dump of `Game/UI` + `Game/UI_Common/_Res`). That dump includes a real HUD reference screenshot (`InGame/02_HUD_solo_speed.png`, 3840x2160) and Unreal material parameter files with exact HUD colors and sizes. Values measured from that screenshot or read from the material files are labelled **SOURCED**. Values from design reasoning are labelled **PROPOSED**. Statements from memory that could not be checked are labelled **UNVERIFIED**.

---

## Part 1: KartRider: Drift UI/UX teardown

### 1.1 HUD component inventory (from datamined folder names)
`InGame/` contains one folder per HUD widget. Together they make a complete checklist for our HUD:
`Aim` (item targeting reticle), `Alert` (red and blue screen-edge warning vignettes), `Approach` (incoming-attack warning), `Assist`, `DriftGauge` (**SingleBoostGaugeBar** + **TeamBoostGaugeBar**), `ItemFeed` (kill-feed style log with a "CutEffect" slanted border), `ItemSlot` (lock, disable, **icon_itemchanger**, **icon_slotchanger**), `ItemTactical`, `KeyGuideAssist`, `License`, `Major` (results: `Atlas_UI_IngameResultMajor`, emblem left/center/right, clock icon, **IngameTier_arrow** for rank-point up/down), `Minimap` (SDF track line, bird-view material, 5 arrow variants, dots), `PlayMission` (challenge toasts), `RaceCounter` (countdown; `Mat_RaceCounterGo_CircleAdd` = additive expanding circle on "GO"), `Rank` (ping good/normal/bad icons, sound on/off, **icon_ai** for bot racers), `Replay`, `RiderName` (name-tag plates: SoloMe, SoloUser, TeamBlue/Green/Red/Yellow, center/bottom arrows), `SideMirror` (rear-view render-target material), `Tachometer`, `TimeAttack`, `WrongWay` (single icon).

### 1.2 In-race HUD layout (SOURCED, measured on 02_HUD_solo_speed.png; % of screen W/H)
- **Rank (top-left):** a very large white "4" (x 7.8–12.3%, y 8.9–20.4%, about **11.6% of screen height**) followed by a smaller "/7" at about 45% of the digit's height and about 70% opacity. The face is a heavy condensed sans with a slight italic, white with a soft dark drop shadow and no panel behind it.
- **Live standings (under the rank):** 8 rows, each **~3.5% H tall** with ~2 px gaps. The list starts at x 7.9% and is **~19.4% W wide**. Each row shows the rank number (bold condensed), a platform icon, and the name. To the left sit a voice-chat speaker icon and a small ping pill (red/green/yellow). **The local player's row is filled with saturated orange (≈#F6A21A)**. Other rows are translucent dark grey (≈rgba(40,40,40,.55)). Held-booster icons stack to the right of each row (1–3 shown). A disconnected racer's row turns grey with an "X".
- **Lap block (top-right, x ≈79.5–92%):** a big current-lap digit plus a small "FINAL" tag above "/3 LAP". Under it are three timer rows labelled **LAP / TIME / BEST**, with values in `mm:ss.cc` ("00:33.34"). Rows are spaced ~3.2% H and the text is ~2% H tall.
- **Race-progress rail (right edge, x ≈86%, y 36–58%):** a thin vertical bar. Rival dots and the player's red arrow move along it to show relative race progress. It works as a 1-D minimap in the solo speed HUD.
- **Speedometer (bottom-right, centre ≈(86% W, 80% H), outer radius ≈11.6% H):** a segmented white arc of about 270°, open at the bottom, with an orange-red section at the high end. The big number ("356") is ~6% H tall, with "KM/H" under it. A **"DRAFT"** label sits below and lights up during slipstream. The tachometer texture is channel-packed: cyan holds the arc segments and red holds the speed-streak and needle masks. Material values: main color white, **sub color linear (0.609, 0.028, 0) = #CD2F00**, edge softness 140, gauge range 0.662–0.825, needle rotation ±10.37.
- **Item/booster slots (bottom-centre):** **slot 1 is large (~8% H square)** and slot 2 is smaller (~5.6% H). An empty slot shows its key hint ("Ctrl"). Under the slots are **two gauge bars ~15.8% W wide**:
  - *SingleBoostGaugeBar*: 800x38 texture, gradient **#FFED04 → #FF2A4D** (left→right), outline 0.158, a scrolling noise pattern, and glow.
  - *TeamBoostGaugeBar*: 1000x28, **#2ACAFF → #B900FF**, pattern left color #FFF200, 50% black border.
  - Under the gauges is a key chip **"Alt ⟳ n"** (slot-swap).
  - This shows the PC defaults: **Ctrl = use item, Alt = swap slots** (SOURCED from the screenshot). Other default keys (arrows to steer, Shift to drift) are UNVERIFIED but widely known.
- **World-space name tags:** a small dark square rank badge plus the name in bold white ("4 KARTRIDER2") above each rival kart. The player's own kart shows only a small orange square badge with its rank. The "SoloMe" plate is a **navy (#0A0F6E-ish) pentagon/shield with a downward point**. Team plates come in blue, green, red and yellow.
- **Track dressing:** large white chevron arrows painted on the asphalt, "<<<" chevron boards at corners, and red-white curbs.
- **Wrong-way icon:** a no-entry roundel, a **terracotta-red disc (≈#CC6650) with a white bar, inside a white ring and an outer red ring**.
- **Alert:** a full-screen corner vignette in red (danger) or blue, with fine diagonal speed-streak texture. It fades in from the screen edge nearest the threat.
- **Minimap:** a per-track **SDF texture** rendered with smoothstep thresholds **min 0.66 / max 0.72**, which gives a crisp track line at any scale. There is also a "bird-view" material.

### 1.3 Menus and front-end (SOURCED from sprite names and key art; layout details PROPOSED)
- **Mode select cards:** GrandPrix, **Speed**, **Item**, CustomGame, License (driving tests), Replay (League/Mine/Shared), TimeAttack (Challenge-to-Ranker / Challenge-to-Record), Tutorial. Every card has *Focus* and *UnFocus* art. Sub-mode toggles are **Individual / Team 2P / Team 4P**, and a difficulty-star icon exists. Card art is a **cut-out 3D render of character + kart that bleeds off the card edge**: the Speed card uses heavy horizontal motion blur, and the Item card shows a flying missile. Renders sit on white fading to transparent.
- **Lobby:** a match button with a mode icon (`Lobby_MatchBtn_IconSpeed/IconItem`), a "game change" (mode switch) button, a party-state name tag, and challenge pictos (**Lucci** soft-currency icon, gift box, event star). The paid currency is K-Coin (UNVERIFIED name). Other front-end sections, from top-level folders: RacingPass (season pass), Garage (kart/character), Livery, StickerMarket, KartSkill, Upgrade, LootBox, Shop, Achievement, Challenge, BeginnerCare, Community, Emoticon, Studio, Observer, Option.
- **Key art style (img_keyart_OBT_garage.png):** a Dutch-angle wide-lens composition. It has a bright cyan sky, a caricatured landmark city (Liberty statue with a cartoon face, suspension bridge), and chibi 2.5–3 heads-tall characters. Materials are glossy vinyl-toy PBR with strong rim light. Karts carry neon underglow and emissive wheel rims. Items are characters too (a banana with glasses, a striped missile). The frame is layered foreground, midground and background, with motion blur on the edges.
- **Options sprites:** alert icons (red/yellow), play/record, customer-service QR. Settings categories are PROPOSED below.

### 1.4 What makes it feel premium (PROPOSED emulation spec)
1. **Typography hierarchy:** only two sizes carry meaning at a glance (rank ~11–12% H, speed ~6% H). Everything else is ≤2.2% H. All numbers use tabular figures, so digits don't jitter.
2. **Motion:** on a rank change, the digit punches (scale 1.35→1.0, 160 ms, easeOutBack) and flashes green (up) or red (down). Standings rows reorder with FLIP animation (220 ms). A full gauge pops a new booster icon into the slot (overshoot 1.2, 180 ms) with a "ding". On boost the camera FOV kicks +10° (ease 250 ms), radial speed lines appear, and chromatic aberration rises (≤0.004). Lap and final-lap banners slide in on a −12° skewed panel, hold 1.2 s, then wipe out.
3. **Countdown:** 3-2-1 at 1.0 s intervals with a low beep each, then "GO" with a high beep and an additive expanding ring (matches `RaceCounterGo_CircleAdd`).
4. **Finish:** a "FINISH" slam, 0.35 s of 0.4x slow-motion, an orbit camera on the player, then results. After the first finisher a retire countdown starts (10 s is PROPOSED, matching classic KartRider convention; UNVERIFIED for Drift).
5. **Wrong way:** shown after the kart's heading has been >110° off the track tangent for ≥1.2 s at >20 km/h. The icon pulses at 2 Hz with "역주행 / WRONG WAY" (PROPOSED).
6. **Performance:** render the HUD as a DOM/CSS overlay using transform and opacity only. Update text at ≤20 Hz and the speed number at 30 Hz. Render name tags as sprites from a canvas atlas, or with CSS2DRenderer (fine for ≤8 tags).

### 1.5 ClaudeRider HUD and menu spec (PROPOSED)
- **HUD tokens:**
  - `--hud-fg #FFFFFF`; text-shadow `0 2px 6px rgba(20,20,19,.55)`.
  - Panel `rgba(20,20,19,.42)` with `backdrop-filter: blur(6px)`.
  - **Me row:** gradient `#D97757 → #F2A65A` instead of KRD orange, which keeps brand identity.
  - Boost gauge `#FFD23F → #FF5A36`; team gauge `#2ACAFF → #8A5CFF`.
  - Rank up `#7BD88F`, rank down `#FF6B5A`, danger `#E5484D`.
- **Lobby/menus:** "warm parchment". Surfaces ivory `#FAF9F5` / parchment `#F5F4ED`, border cream `#F0EEE6`, text near-black `#141413`. Dark mode surfaces `#30302E` / `#141413`. Primary CTA terracotta `#C96442` with hover `#D97757`. Radii 12–24 px and ring shadows (`0 0 0 1px #D1CFC5`). The lobby shows a turntable 3D showcase of character + kart on a soft studio cyclorama.
- **Screens:**
  - Title
  - Lobby: showcase, mode card (스피드전 / 아이템전), 빠른 매칭, pass level, daily/weekly challenges, currencies
  - Mode select
  - Room: 8 slots, ready state, track vote, team colors
  - Garage: character, kart, color/palette, decals
  - Loading: track thumbnail, tip, player cards
  - Race
  - Results: 8-row table with time and gap; points ▲▼; rewards; winner pose
  - Settings
- **Original currency names** (avoid Lucci/K-Coin), e.g. "Sparks" (soft) and "Clay Tokens" (premium, earned only).
- **Settings (PROPOSED):**
  - **Graphics presets Low / Med / High / Ultra:**

    | Setting | Low | Med | High | Ultra |
    |---|---|---|---|---|
    | Render scale | 0.6 | 0.8 | 1.0 | 1.0 |
    | DPR cap | 1 | 1.5 | 2 | 2 |
    | Shadows | off | 1024 | 2048 | 2048 PCF-soft |
    | Particles | 25% | 60% | 100% | 150% |

    Bloom is on from Med. Motion blur and SSAO are Ultra only. FPS cap: 30/60/120/unlimited.
  - **Audio:** Master, BGM, SFX, Engine, UI and Voice sliders; mute when the tab loses focus.
  - **Controls:** full key rebinding with conflict detection, and Gamepad API support.
  - **HUD:** scale 80–120%, colour-blind safe gauge palette, km/h or mph, language ko/en.

### 1.6 Fonts (Korean-capable, all SOURCED licenses)

| Role | Font | License | Load |
|---|---|---|---|
| UI text (KR/EN) | **Pretendard Variable** (weights 45–920) | SIL OFL; commercial use and modification OK except selling the font alone | `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css`, or self-host via npm |
| Alt UI | **SUIT** (static + variable) | OFL-1.1 (Korean glyphs based on Source Han Sans) | `https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2/fonts/variable/woff2/SUIT-Variable.css` |
| Fallback | **Noto Sans KR** (variable `[wght]`) | OFL | Google Fonts / @fontsource-variable |
| KR display banners ("역주행!", "마지막 랩") | **Black Han Sans** (single weight) | OFL | Google Fonts |
| HUD numerals | **Barlow Condensed** ExtraBold/Black *Italic* (9 weights × roman/italic) | OFL | Google Fonts / @fontsource |
| Anthropic-flavoured Latin headings (optional) | Hanken Grotesk (Styrene B lookalike), Source Serif 4 (Tiempos lookalike), JetBrains Mono. Anthropic's own public brand skill uses **Poppins** (headings) + **Lora** (body) | OFL | Google Fonts |

- **Do not** use Nexon's free "Kartrider" font (on noonnu as `KartriderExtraBold`), even though its license allows it: it is the game's brand face.
- **Do not** scrape Anthropic Sans/Serif/Mono, Styrene or Tiempos; they are proprietary.
- **Canvas textures:** fonts must finish loading before anything is drawn into three.js canvas textures (name tags, banners). Call `await document.fonts.load('800 64px "Barlow Condensed"')` and `await document.fonts.ready`, or the fallback font gets baked into the texture. Use `font-variant-numeric: tabular-nums` for timers. Preload the HUD numeral woff2 (Latin subset, ~20–30 KB).

---

## Part 2: Claude visual identity and character roster

### 2.1 Brand colors (SOURCED)
- **Anthropic official brand skill (anthropics/skills):** Dark `#141413`, Light `#FAF9F5`, Mid Gray `#B0AEA5`, Light Gray `#E8E6DC`. Accents: **Orange `#D97757`**, Blue `#6A9BCC`, Green `#788C5D`.
- **simple-icons:** Claude hex `D97757`, Anthropic hex `191919`.
- **Extracted claude.ai design tokens:** Terracotta brand `#C96442`, Coral `#D97757`, Parchment `#F5F4ED`, Ivory `#FAF9F5`, Border Cream `#F0EEE6`, Warm Sand `#E8E6DC`, Dark Surface `#30302E`, Charcoal Warm `#4D4C48`, Olive Gray `#5E5D59`, Stone Gray `#87867F`, Error `#B53333`.
- **Community themes:** "Crail" `#C15F3C`, dark bg `#262624`, dark-mode link `#E8916F`.
- `#CC785C` from the brief could **not** be verified; use `#C96442` or `#D97757`.
- **Clawd's official palette** (Clawdmeter research of the official animation assets): body `#D87656`, shade `#BE684D`, gray `#8B8B8B`, ivory `#F9F8F4`, eyes `#141413`.

### 2.2 The Claude spark (SOURCED geometry, analysed from simple-icons `claude.svg`, 24x24 viewBox)
- The mark is a **single filled polygon of 158 vertices** with a hand-cut, slightly irregular look, made of **12 tapered rays**. It fills about 40% of its bounding box, and its centroid is at (12.42, 11.61).
- Ray tip angles in degrees (CCW from +x, y-up): **6, 49, 81, 118, 148, 180, 213, 235, 265, 300, 315, 343**. Spacing is uneven (15°–37°).
- Tip radii normalised to half-size: **0.95–1.08**; the ray at 118° (upper-left) is the longest.
- Rays meet at an irregular hub with **valley radii 0.2–0.4**. Ray angular width at 55% of its length is **13°–26°**. Rays narrow toward the tips and end in blunt, slightly rounded tips.
- **Three.js recipe:** build a `THREE.Shape` from alternating tip and valley points, using quadratic curves at the tips. Extrude with `depth 0.08, bevelEnabled, bevelThickness 0.02, bevelSize 0.015, bevelSegments 2`. Material: MeshStandard `#D97757`, roughness 0.5.
- **IP caution:** see 2.6. Build an **original parametric "sparkle"** for in-game use rather than the exact path: seeded, 10 rays, radii 0.85–1.05, inner 0.3, ±7° jitter.

### 2.3 Clawd, the Claude Code mascot (SOURCED)
- Clawd is Claude Code's pixel crab-like creature. Official animations include CrabWalking, Walking, Dancing, Jumping, Waving, Pointing and **RacingCar**, plus sailing, skateboard and soccer scenes (from Clawdmeter's study of the official assets). Official assets use a 55x37 art-pixel stage at 80–90 ms/frame. "Idle is the universal hinge": every animation starts and ends in the same idle pose.
- **Exact silhouette (Claude Code mark SVG, 24x24, fill #D97757, even-odd).** In 1.5-unit cells:
  - **Body**: 12x8 cells (x 3–21, y 5–17.1).
  - **Arms**: 2x2-cell stubs on each side, at the 4th–6th cell rows from the top (x 0–3 / 21–24, y 10.95–14.05).
  - **Legs**: four legs of 1x2 cells in two pairs, at body columns 1, 3, 8 and 10 (y 17.1–20), leaving a centre gap of 4 cells.
  - **Eyes**: negative-space 1x2-cell slots at columns 2 and 9, rows 2–3 (y 8.1–10.95).
  - No mouth.
- The terminal splash is ` ▐▛███▜▌ / ▝▜█████▛▘ /   ▘▘ ▝▝ `.
- **3D reference (git-city, Three.js):** legs 1u x 2u x 1.2u at x ±1.2u and ±3.2u; torso 8u x 5u x 5u; arms 1.8u x 1.6u x 2u at x ±4.9u; eyes 0.8u x 1.6u at x ±1.9u; body #D97757, dark #B85C3D. Bob `|sin(2.2t)|*0.25u`; blink `scale.y=0.15` for 0.12 s every 4 s.

### 2.4 ClaudeRider base mascot rig (PROPOSED)
- **Body:** RoundedBoxGeometry(1.0, 0.68, 0.64, segments 4, radius 0.18), which gives a soft "vinyl toy" version of Clawd's 12:8 block.
- **Eyes:** RoundedBox 0.09x0.20x0.03 at x ±0.24, y +0.07. Eye decals are swappable canvas textures for emotes (^ ^, > <, spirals, stars).
- **Arms:** nubs 0.2x0.2x0.26 at x ±0.58, rotating at the shoulder for steering.
- **Legs:** four stubby legs hidden in the cockpit.
- **Anchors:** `head_top` (y +0.36), `back`, `hand_L/R`, `face_front`.
- **Signature element:** a small original sparkle floating 0.12 above the head and rotating at 0.6 rad/s. It gives the character a readable back silhouette from the chase camera and tints to team color in team modes.
- **Material:** MeshPhysicalMaterial, roughness 0.42, clearcoat 0.6, clearcoatRoughness 0.25, sheen 0.2, plus a Fresnel rim term (onBeforeCompile, rim `#FFD9C7`, power 2.5). Palette swaps go through a uniform (bodyColor/shadeColor/accentColor).
- **Scale:** chibi proportion of about 1 body width = 0.55 × kart width. The accessory on the head must be ≥0.3 body-widths tall so it reads from behind.
- **Animation:** secondary motion includes squash (1.08/0.92) on landing and a lean of ±12° into drifts. Emotes run 1.5–2.5 s and play in the lobby and on the results podium.

### 2.5 Roster: 12 original variations (PROPOSED)

| # | Name (KR) | Palette (body / accent / detail) | Silhouette and accessories | Personality | Emote |
|---|---|---|---|---|---|
| 1 | **Clay (클레이)**, Classic | #D97757 / #FAF9F5 / eyes #141413 | Pure block, ivory racing scarf trailing (ribbon), sparkle tuft | Calm, helpful | "Think": tuft spins, "…" bubble, arm thumbs-up |
| 2 | **Pixel (픽셀)** | #D87656 / #BE684D / #141413 | Built from real cubes on a 12x8x6 voxel grid, flat shading, 8-bit shades | Retro, cheeky | Crab-walk shuffle, then an 8-bit hop with square particles and a chiptune arpeggio |
| 3 | **Turbo (터보)**, Racer | #D97757 / #6A9BCC stripes / visor #2A2A28 | Ivory full-face helmet dome, fin spoiler, "01" decal | Competitive | Visor flip, checkered-flag wave |
| 4 | **Captain Anchor (앵커 선장)**, Pirate | #C96442 / coat #B53333 / hat #30302E + gold #E0B04B | Tricorn hat, eyepatch, small sparkle-parrot on the arm | Boisterous | Telescope peek, "Yo-ho!" hat tip, gold-coin burst |
| 5 | **Rune (룬)**, Wizard | #E08A6D / #3B3F8F / stars #F0EEE6 | Tall floppy cone hat (bent tip), sparkle-topped staff | Dreamy | Wand twirl, then a sparkle firework |
| 6 | **Nova (노바)**, Astronaut | #D97757 / suit #F5F4ED / #6A9BCC | Glass bubble helmet (transmission 0.9, IOR 1.5), backpack, antenna | Curious | Zero-g spin with a ringed-planet particle |
| 7 | **Kage (카게)**, Ninja | #D97757 / hood #1F1E1D / plate #B0AEA5 | Hood and mask with eye slit, long scarf tails (verlet ribbon) | Stoic | Vanishes in a smoke puff, reappears, shuriken spin |
| 8 | **Chef Bisque (비스크 셰프)** | #D97757 / toque #FFFFFF / #788C5D neckerchief | Tall toque, ladle | Warm, fussy | Taste test, "chef's kiss", heart + steam particles |
| 9 | **Frost (프로스트)**, Ice | #9FD3F2 translucent shell / #FFFFFF / eyes #0E2A47 | Crystal shell (transmission 0.6, IOR 1.31), icicle crown, earmuffs | Cool, shy | Frosty breath cloud, snowflake burst |
| 10 | **Glitch (글리치)**, Neon/Cyber | #1C1B22 / emissive #FF7A50 + #2EF2FF | Emissive edge lines, holo visor, headphones | Hyper | RGB-split glitch shader, dance loop |
| 11 | **Bolt (볼트)**, Robot | copper #B87333 (metalness 0.9, roughness 0.3) / LED #FFB347 | Rivets, bulb antenna, wind-up key on the back, LED screen eyes | Literal-minded | 360° head spin, steam whistle |
| 12 | **Duke (듀크)**, Royal | #C96442 / crown #F2C14E + ruby #B53333 / ermine #FAF9F5 | Crown, ermine cape (cloth sim-lite), scepter | Dignified, vain | Royal wave, confetti, trumpet fanfare |

Cheap extra variety comes from **palette skins** that apply to any character: Midnight #30302E, Parchment #F5F4ED, Sage #788C5D, Sky #6A9BCC.

### 2.6 Kart body designs (8 original, procedural; PROPOSED; dimensions in m)
1. **Pebble** (starter): open tube-frame go-kart, TubeGeometry roll hoop and bumpers, 1.6x1.1x0.5, wheels r 0.22.
2. **Clay Comet**: bubble "pebble car" body. It is a LatheGeometry/sculpted rounded capsule with a sparkle tail fin, 1.8x1.2x0.7, r 0.25.
3. **Arrowhead**: low open-wheel wedge (ExtrudeGeometry side profile), front/rear wings, 2.0x1.2x0.45, r 0.24/0.28.
4. **Tugboat**: chunky retro buggy with balloon tires, bull bar and roof lamp, 1.7x1.3x0.8, r 0.32.
5. **Glacier Sled**: ski-front hover-kart with emissive cyan thrusters, 1.9x1.15x0.55.
6. **Neon Blade**: cyber hypercar with underglow (a PointLight is too expensive; use an emissive decal quad plus bloom) and emissive rim wheels, 2.0x1.2x0.5.
7. **Jet Kettle**: steampunk brass boiler with twin smokestacks that puff on boost, 1.8x1.2x0.75.
8. **Crown Cruiser**: royal chariot-car with a gold filigree decal texture and velvet seat, 1.9x1.25x0.7.

**Shared build notes:** rounded-box chassis, 4 wheels (lathe tire + cylinder rim), a steering wheel, a seat anchor, and exhaust anchors for boost flame. Livery is a canvas-generated texture (stripes, numbers, sparkle stickers).

### 2.7 IP and trademark guidance (not legal advice)
- **Anthropic (SOURCED):**
  - The trademark guidelines require **explicit prior approval** to use Anthropic marks.
  - They forbid **modifying logos (color, font, proportions)** and forbid implying sponsorship or affiliation.
  - The Claude Code legal page says you **may not use Claude/Anthropic names or logos in your own product name or logo**.
- **Actions for ClaudeRider:**
  1. The product name "ClaudeRider" itself carries trademark risk if the game is distributed publicly. Keep it as an internal codename and prepare a neutral public title (e.g., "Spark Rider" or "Clay Kart").
  2. Never use the exact spark path or the Anthropic "A" as the game logo. Use the original parametric sparkle.
  3. Show a footer/splash disclaimer: "Unofficial non-commercial fan project; not affiliated with or endorsed by Anthropic or Nexon."
  4. No monetisation or merch.
  5. Color palettes are fine; proprietary fonts are not.
- **Nexon (things to avoid copying):**
  - Names: KartRider, Dao/Bazzi/Dizni and other characters, track names, "Lucci", "K-Coin", "N2O" and its red and blue flame icon.
  - The Kartrider font.
  - Character designs: Dao's blue round head with ear pods, the yellow miner-helmet robot, the banana with glasses.
  - BGM, SFX, announcer voice, and exact item icons.
  - Exact track layouts.
- Generic mechanics and conventions are fine to emulate: drift charging a gauge, 2 item slots, 8 racers, rank/lap HUD placement, chevrons, a wrong-way roundel.
- If Codex/ChatGPT image generation is used for key art, loading screens or portraits, prompt with **our** character descriptions and "glossy vinyl-toy chibi kart racer, dutch angle, warm terracotta and cream palette". Never use Nexon or KartRider names or "Claude logo".

---

## Part 3: Audio direction

### 3.1 Tools (SOURCED)
- **Tone.js (MIT):** Transport (loopable, tempo changes on the fly), Loop, Sequence, Part, PolySynth, FM/AM/Noise synths and effect chains. `Tone.start()` must be called from a user gesture before audio plays.
- **ZzFX (MIT, <1 KB):** a 20-parameter `zzfx()` one-shot synth for SFX. **ZzFXM** is a tiny tracker-song player.
- **Recommended split:** Tone.js for music; raw Web Audio for engines (per-kart oscillators + PannerNode); ZzFX-style one-shots for UI and items.

### 3.2 BGM per theme (PROPOSED; all sequenced procedurally, which makes adaptive tempo possible)
Each track is 4 stems (drums, bass, harmony, lead) with 16–32-bar loops. Keys are chosen per track.

| Scene | Style and tempo |
|---|---|
| Lobby | Chill lo-fi/city-pop, 92 BPM, Rhodes (FMSynth), vinyl noise, side-chain pad |
| Clay Village | Bright pop-funk, 128, slap bass, clavinet |
| Desert Canyon | Surf-rock on a Phrygian-dominant scale, 140 |
| Ice Glacier | Chiptune + glass bells (FM), 150 |
| Pirate Harbor | Shanty in 6/8, accordion-like square pads, 132 |
| Neon City | Synthwave/DnB, 118 half-time or 172 |
| Mine/Factory | Industrial rock, 145, MetalSynth percussion |
| Forest/Garden | Folk-pop, 124, pizzicato |
| Space Station | Trance, 138, supersaw |
| Candy/Toy | Future bass, 150 |
| Castle | Orchestral hybrid, 140 |
| Beach | Tropical house, 120 |

- **Jingles:** results (win/lose), 4-bar level-up, countdown stinger.
- **Adaptive music:**
  - Final lap: `Transport.bpm.rampTo(bpm*1.06, 2)`, add a 16th-note hi-hat stem, open a +filter sweep.
  - Boost: 300 ms high-pass whoosh on the music bus.
  - Finish: cut to the jingle on the next bar.
- **Mix:** duck BGM −4 dB under banners and voice. BGM bus −14 dB relative to SFX. Master compressor + limiter at −1 dBFS.

### 3.3 SFX list (PROPOSED synthesis recipes)
- **Engine loop:** saw + square, 7-cent detune. f = 55 + 180·speedRatio (×1.15 on boost). Lowpass 600 + 3000·throttle Hz.
  - Full HRTF spatialisation for only the nearest 3 karts; AI karts get one oscillator.
- **Drift:** skid = band-passed noise at 1.2–3 kHz, gain from slip angle; spark crackle = random noise bursts.
- **Boost:**
  - Booster ignite = noise sweep 200→4 kHz plus a 60 Hz thump; booster loop = jet roar.
  - Instant or perfect-timing boost = bright two-note chime.
  - Gauge full = "ding" at 1760 Hz; booster added to slot = pop.
- **Items:** item box break + roulette ticks (8–12 ticks, decelerating); per-item use sounds; missile lock beeps (period 400→80 ms); hit/spin-out; shield up; water-bomb bubble; magnet hum; cloud/fog.
- **Physics:** wall bump thud (lowpass noise + 90 Hz sine); jump/land; draft whoosh.
- **Race flow:**
  - Countdown: 3x 440 Hz then 880 Hz "GO".
  - Lap chime; final-lap fanfare; finish fanfare; wrong-way buzz; retire tick.
- **UI:** hover tick (2 ms click), confirm, back, error, reward open, pass level-up, purchase.
- **Voice:** avoid TTS. Use short vocoded synth barks and text banners.


## Key parameters

- **hud.rank.digit_height**: 11.6% of screen height; '/N' suffix ~45% of digit height at ~70% opacity; top-left at x 7.8-12.3%, y 8.9-20.4% [sourced] — kartrider-drift-files InGame/02_HUD_solo_speed.png (measured)
- **hud.standings.row**: 8 rows, row height 3.5% H, gap ~2px, x start 7.9% W, width 19.4% W; me-row fill ~#F6A21A, others rgba(40,40,40,.55) [sourced] — 02_HUD_solo_speed.png (measured; colors approximate)
- **hud.lap_block**: top-right x~79.5-92% W; big lap digit + 'FINAL' tag + '/3 LAP'; timers LAP/TIME/BEST mm:ss.cc, row spacing 3.2% H, text 2% H [sourced] — 02_HUD_solo_speed.png
- **hud.speedometer**: center (86% W, 80% H), outer radius ~11.6% H, ~270deg segmented arc open at bottom, number ~6% H + 'KM/H', 'DRAFT' indicator below; main #FFFFFF, sub #CD2F00 [sourced] — Tachometer_A_02.props.txt + T_HUD_Taco_01.png + screenshot
- **hud.item_slots**: slot1 ~8% H square, slot2 ~5.6% H, key hints (Ctrl=use item, Alt=swap slots); centered at bottom y 77-85% H [sourced] — 02_HUD_solo_speed.png; ItemSlot/_Res icon_slotchanger.png
- **hud.single_boost_gauge**: texture 800x38, gradient #FFED04 -> #FF2A4D, outline 0.158, scrolling noise pattern, width ~15.8% W [sourced] — InGame/DriftGauge/_Res/SingleBoostGaugeBar.props.txt
- **hud.team_boost_gauge**: texture 1000x28, gradient #2ACAFF -> #B900FF, pattern-left #FFF200, border black 50% [sourced] — InGame/DriftGauge/_Res/TeamBoostGaugeBar.props.txt
- **hud.minimap_sdf_thresholds**: smoothstep min 0.66 / max 0.72 on per-track SDF texture; bird-view variant [sourced] — InGame/Minimap/_Res/MiniMap_SDF_MI.props.txt
- **hud.wrongway_icon**: no-entry roundel: disc ~#CC6650 + white bar + white ring + outer red ring [sourced] — InGame/WrongWay/icon_wrongway.png
- **hud.wrongway_trigger**: heading >110deg off track tangent for >=1.2s at >20 km/h; pulse 2 Hz [proposed] — design reasoning
- **hud.countdown**: 3-2-1 at 1.0s intervals, beeps 440Hz x3 then 880Hz GO, additive expanding ring on GO [proposed] — RaceCounter Mat_RaceCounterGo_CircleAdd (ring sourced); timings proposed
- **hud.rank_change_anim**: scale 1.35->1.0 in 160ms easeOutBack; flash up #7BD88F / down #FF6B5A; FLIP row reorder 220ms [proposed] — design reasoning
- **hud.boost_fov_kick**: +10deg FOV ease 250ms, chromatic aberration <=0.004, radial speed lines [proposed] — design reasoning
- **hud.update_rates**: DOM text <=20Hz, speed readout 30Hz, transforms/opacity only [proposed] — web performance practice
- **retire_countdown_after_first_finish**: 10 s [proposed] — classic KartRider convention (unverified for Drift)
- **modes.menu_set**: GrandPrix, Speed, Item, CustomGame, License, Replay(League/Mine/Shared), TimeAttack, Tutorial; sub-modes Individual/Team2P/Team4P [sourced] — ModeSelect/_Res/Sprites listing
- **brand.claude_orange**: #D97757 [sourced] — anthropics/skills brand-guidelines; simple-icons claude hex D97757
- **brand.terracotta**: #C96442 (brand), #C15F3C (Crail) [sourced] — claude.md design-token template; Claude-Code-Obsidian-Theme
- **brand.neutrals**: dark #141413, ivory #FAF9F5, parchment #F5F4ED, border cream #F0EEE6, warm sand #E8E6DC, dark surface #30302E, mid gray #B0AEA5 [sourced] — anthropics/skills brand-guidelines; claude.md design tokens
- **brand.accents**: blue #6A9BCC, green #788C5D, error #B53333 [sourced] — anthropics/skills brand-guidelines
- **clawd.palette**: body #D87656, shade #BE684D, gray #8B8B8B, ivory #F9F8F4, eyes #141413 [sourced] — Clawdmeter research/clawd-official/CLAUDE.md
- **clawd.pixel_geometry**: 1.5-unit cells: body 12x8, arms 2x2 each side (rows 4-6), 4 legs 1x2 at body cols 1,3,8,10, eye slots 1x2 at cols 2 and 9 rows 2-3, no mouth [sourced] — Merit-Systems/claudelines claude-code-mark.tsx SVG path
- **clawd.anim**: bob |sin(2.2t)|*0.25u; blink scale.y 0.15 for 0.12s every ~4s; official frames 80-90 ms [sourced] — git-city RivalryPieces.tsx; Clawdmeter research
- **spark.geometry**: 12 tapered rays at 6,49,81,118,148,180,213,235,265,300,315,343 deg; tip radius 0.95-1.08 (norm), valley 0.2-0.4, ray width 13-26deg, fill 40% of bbox [sourced] — analysis of simple-icons claude.svg path
- **spark.ingame_homage**: original seeded sparkle: 10 rays, radii 0.85-1.05, inner 0.3, +/-7deg jitter, extrude depth 0.08 bevel 0.02 [proposed] — IP-distance design reasoning
- **mascot.base_rig**: RoundedBox(1.0,0.68,0.64,seg4,r0.18); eyes 0.09x0.20 at x+/-0.24 y+0.07; arm nubs 0.2x0.2x0.26 at x+/-0.58; sparkle tuft 0.12 above head spinning 0.6 rad/s [proposed] — derived from Clawd proportions
- **mascot.material**: MeshPhysical roughness 0.42, clearcoat 0.6, clearcoatRoughness 0.25, sheen 0.2, fresnel rim #FFD9C7 power 2.5 [proposed] — art-direction reasoning (KRD vinyl-toy look)
- **roster.count**: 12 characters + 4 palette skins (Midnight #30302E, Parchment #F5F4ED, Sage #788C5D, Sky #6A9BCC) [proposed] — design
- **karts.count**: 8 bodies: Pebble, Clay Comet, Arrowhead, Tugboat, Glacier Sled, Neon Blade, Jet Kettle, Crown Cruiser (1.6-2.0m L, 1.1-1.3m W, wheel r 0.22-0.32) [proposed] — design
- **font.ui**: Pretendard Variable (OFL, wght 45-920) via jsDelivr v1.3.9 variable dynamic-subset CSS or self-host [sourced] — github.com/orioncactus/pretendard
- **font.ui_alt**: SUIT (OFL-1.1) https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2/fonts/variable/woff2/SUIT-Variable.css [sourced] — github.com/sun-typeface/SUIT
- **font.hud_numerals**: Barlow Condensed ExtraBold/Black Italic (OFL), tabular-nums [sourced] — github.com/google/fonts ofl/barlowcondensed
- **font.kr_display**: Black Han Sans (OFL, single weight); fallback Noto Sans KR variable (OFL) [sourced] — github.com/google/fonts ofl/blackhansans, ofl/notosanskr
- **font.anthropic_lookalikes**: Hanken Grotesk (Styrene B), Source Serif 4 (Tiempos), JetBrains Mono; Anthropic brand skill uses Poppins + Lora [sourced] — Claude-Code-Obsidian-Theme README; anthropics/skills brand-guidelines
- **graphics.presets**: Low/Med/High/Ultra: render scale 0.6/0.8/1.0/1.0, DPR cap 1/1.5/2/2, shadows off/1024/2048/2048, particles 25/60/100/150% [proposed] — design reasoning
- **audio.engine_synth**: saw+square 7-cent detune, f=55+180*speedRatio (x1.15 boost), lowpass 600+3000*throttle Hz, HRTF for nearest 3 karts [proposed] — design reasoning
- **audio.final_lap_adaptive**: Transport.bpm.rampTo(bpm*1.06, 2s) + 16th hi-hat stem + filter open [proposed] — design reasoning (Tone.js Transport supports live tempo changes)
- **audio.mix**: BGM bus -14 dB vs SFX, duck -4 dB under banners, master limiter -1 dBFS [proposed] — mixing practice
- **audio.libs**: Tone.js (MIT, Tone.start() on user gesture) for music; ZzFX (MIT, <1KB, 20 params) for SFX; ZzFXM optional [sourced] — github.com/Tonejs/Tone.js; github.com/KilledByAPixel/ZzFX
- **legal.anthropic**: trademarks need prior approval; no logo modification; no use of Claude/Anthropic names or logos in own product name/logo; add non-affiliation disclaimer [sourced] — anthropic.com/legal/trademark-guidelines; Claude Code legal-and-compliance doc

## Open questions

- Blocked sources: namu.wiki, Inven, kartdrift.nexon.com, fandom, Steam, YouTube and Reddit were blocked by egress, and the WebSearch budget was exhausted. So these KRD details are still UNVERIFIED: exact lobby layout, K-Coin currency name, pass structure, BGM composer/genres, default key map beyond Ctrl/Alt, and the retire-countdown length. Should a later agent with web access verify them?
- The HUD reference screenshot contains mock data ('8 FINAL /3 LAP', names 'Editable'). Is the big top-right number the current lap? Likely yes, but please confirm against live gameplay footage.
- The product name 'ClaudeRider' uses Anthropic's trademark. Keep it as an internal codename only, or also prepare a neutral public title (e.g. 'Spark Rider' / 'Clay Kart')?
- Should in-game art use the exact 12-ray Claude spark geometry (higher fidelity, higher trademark risk) or the proposed original 10-ray parametric sparkle homage?
- Should characters stay mouthless like Clawd (brand-faithful) or get small mouths for more expressive emotes?
- Is ChatGPT/Codex image generation actually available on the user's PC for key art, portraits and loading screens? If not, all 2D art must be procedural or rendered from the three.js models.
- Are characters purely cosmetic (as in KRD) with stats only on karts? This affects roster presentation in the garage.

## Sources

- https://raw.githubusercontent.com/whotookzakum/kartrider-drift-files/main/InGame/02_HUD_solo_speed.png
- https://github.com/whotookzakum/kartrider-drift-files
- https://github.com/whotookzakum/kartrider-drift-files/tree/main/InGame
- https://raw.githubusercontent.com/whotookzakum/kartrider-drift-files/main/InGame/DriftGauge/_Res/SingleBoostGaugeBar.props.txt
- https://raw.githubusercontent.com/whotookzakum/kartrider-drift-files/main/InGame/DriftGauge/_Res/TeamBoostGaugeBar.props.txt
- https://raw.githubusercontent.com/whotookzakum/kartrider-drift-files/main/InGame/Tachometer/_Res/Tachometer_A_02.props.txt
- https://raw.githubusercontent.com/whotookzakum/kartrider-drift-files/main/InGame/Tachometer/_Res/T_HUD_Taco_01.png
- https://raw.githubusercontent.com/whotookzakum/kartrider-drift-files/main/InGame/WrongWay/icon_wrongway.png
- https://raw.githubusercontent.com/whotookzakum/kartrider-drift-files/main/InGame/Alert/_Res/img_alert_red.png
- https://raw.githubusercontent.com/whotookzakum/kartrider-drift-files/main/InGame/Minimap/_Res/MiniMap_SDF_MI.props.txt
- https://raw.githubusercontent.com/whotookzakum/kartrider-drift-files/main/InGame/RiderName/_Res/Sprites/RidernameTag_SoloMe.png
- https://github.com/whotookzakum/kartrider-drift-files/tree/main/ModeSelect/_Res/Sprites
- https://raw.githubusercontent.com/whotookzakum/kartrider-drift-files/main/ModeSelect/_Res/Sprites/ModeSel_Item_Focus.png
- https://raw.githubusercontent.com/whotookzakum/kartrider-drift-files/main/ModeSelect/_Res/Sprites/ModeSel_Speed_Focus.png
- https://github.com/whotookzakum/kartrider-drift-files/tree/main/Lobby/_Res/Sprites
- https://raw.githubusercontent.com/whotookzakum/kartrider-drift-files/main/KeyArt/img_keyart_OBT_garage.png
- https://github.com/whotookzakum/kartrider-drift-files/tree/main/InGame/Major/_Res/Sprite
- https://github.com/whotookzakum/kartrider-drift-files/tree/main/InGame/ItemSlot/_Res
- https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/claude.svg
- https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/anthropic.svg
- https://raw.githubusercontent.com/simple-icons/simple-icons/develop/data/simple-icons.json
- https://github.com/anthropics/skills/blob/main/skills/brand-guidelines/SKILL.md
- https://raw.githubusercontent.com/moltis-org/moltis/main/crates/skills/src/assets/creative/popular-web-designs/templates/claude.md
- https://raw.githubusercontent.com/kleokl7/Claude-Code-Obsidian-Theme/main/README.md
- https://raw.githubusercontent.com/Merit-Systems/claudelines/main/src/components/claude-code-mark.tsx
- https://raw.githubusercontent.com/HermannBjorgvin/Clawdmeter/main/research/clawd-official/CLAUDE.md
- https://raw.githubusercontent.com/stevysmith/clawdgotchi/main/src/components/ClawdGotchi.tsx
- https://raw.githubusercontent.com/srizzon/git-city/main/src/components/league/identity/RivalryPieces.tsx
- https://raw.githubusercontent.com/00nateo/Clauq/main/clauq/tui.py
- https://github.com/yousifamanuel/clawd-mochi
- https://www.anthropic.com/legal/trademark-guidelines
- https://raw.githubusercontent.com/thevibeworks/claude-code-docs/main/content/en/docs/claude-code/legal-and-compliance.md
- https://github.com/orioncactus/pretendard
- https://github.com/sun-typeface/SUIT
- https://github.com/google/fonts/tree/main/ofl/notosanskr
- https://github.com/google/fonts/tree/main/ofl/blackhansans
- https://github.com/google/fonts/tree/main/ofl/barlowcondensed
- https://github.com/taedonn/fonts-archive
- https://github.com/Tonejs/Tone.js
- https://github.com/KilledByAPixel/ZzFX
- https://github.com/mrdoob/three.js/blob/dev/examples/jsm/geometries/RoundedBoxGeometry.js
