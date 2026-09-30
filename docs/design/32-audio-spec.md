# 32 — Audio spec

Owner: L11 FX+AUDIO (`apps/client/src/audio/**`: `api.ts` frozen, `mixer`, `engine-synth`, `sfx/<id>.ts`, `music/{director.ts, songs/<id>.ts}`).
Sources: `07-ui-art-character.md` Part 3, `05-tech-rendering.md` §12, ADR-001 (Tone 15.1.22 lazy, Web Audio for engines/SFX), B11 (`AudioApi`, `SfxDef`, `SongDef`), `04-maps-tracks.md` §3 (per-track music), `11-track-spec.md` §12 (song variants).
Status keys: **[S]** sourced · **[P]** proposed. Audio times are real time (seconds/ms); sim-driven cues quote ticks.

---

## 1. Principles
- Everything is synthesized: no sample packs, no voice acting, no Nexon audio [ADR-011]. Web Audio nodes for engines and SFX (optionally ZzFX-style one-shots, MIT), Tone.js only for music, loaded lazily after the first user gesture (the title screen's "press any key" calls `AudioApi.unlock()` and `Tone.start()`) [S].
- One-shot sounds are driven by `SimEvent`s after the `EventDeduper` (rollback never replays a sound); continuous sounds (engines, screech, boost roar) read kart state every frame.
- Tests run on `OfflineAudioContext`: no NaN, no denormals, peak below −1 dBFS (E).

## 2. Buses and mix (`BusName`)
| Bus | Default level | Content | Processing |
|---|---|---|---|
| `master` | 0 dB (slider 80%) | everything | compressor (threshold −18 dB, ratio 3:1, attack 10 ms, release 150 ms) → limiter at **−1 dBFS** [S] |
| `sfx` | 0 dB reference | kart physics, items, race cues, hazards, ambience | per-voice HRTF panners for spatial sounds |
| `engine` | −6 dB | engine voices | lowpass per voice, Doppler emulation |
| `music` | **−14 dB relative to SFX** [S] | songs, jingles | duck −4 dB under banners and voice barks [S]; −3 dB while the local kart boosts [S 05]; high-pass whoosh 300 ms on boost start [S] |
| `ui` | −10 dB | menu and HUD sounds | none (non-spatial) |
| `voice` | −3 dB | vocoded synth barks ("GO!", "Final lap!") | ducks music −4 dB |
- Sliders (Settings → Audio) map 0–100 to −∞…+6 dB on a perceptual curve (`gain = (v/100)²·2`).
- Mute when unfocused (default on). F7 toggles music, F8 toggles SFX [S KRD family].
- Voice budget: 32 concurrent voices; priority UI > local kart > items targeting the local kart > others by distance; each `SfxDef.maxVoices` caps its own polyphony.

## 3. Engine synth (`audio/engine-synth.ts`) [S 05/07, P constants]
### 3.1 Voice graph (player profile)
```
saw(f0) ─┐
saw(f0·2^(7/1200)) (7-cent detune) ─┤
square(2·f0) × 0.3 ─┤→ tanh WaveShaper (drive 1.5) → lowpass(600 + 3000·throttle Hz, Q 1) → gain → [panner] → engine bus
sine(f0/2) × 0.4 ─┤
bandpass noise @ 4·f0 (Q 2) × (0.1 + 0.2·throttle) ─┘   (rasp)
boost: + "jet roar" layer (band-passed noise 800–3000 Hz, gain 0.3·boost) and pitch ×1.15
```
- Fundamental: `f0 = 55 + 180·rpm01` Hz (toy range 55–235 Hz) [S 07].
- Fake gears (4) [S 05]: speed thresholds 0–10, 10–20, 20–30, 30–38, 38+ m/s; within a gear `rpm01 = 0.3 + 0.7·(u − lo)/(hi − lo)`; a gear change drops rpm by 30% with a 60 ms "shift" dip in gain; idle `rpm01 = 0.1` below 1 m/s; reversing uses gear 1.
- Smoothing: every parameter via `setTargetAtTime`, τ 0.03–0.05 s [S].
- Throttle-off: lowpass falls to 600 Hz, rasp to 0.1, adds a 2 Hz "burble" AM (depth 0.15).
- Drift: pitch +3% and a slight AM (6 Hz) while `drift = 1`.
### 3.2 Pool
| Profile | Count | Graph | Spatial |
|---|---|---|---|
| `player` | 1 | full graph above | stereo, no panner |
| `near` | 2 (nearest rivals) | saw + square + lowpass | HRTF panner, refDistance 5, rolloff 1.5, maxDistance 150 [S 05] |
| `far` | up to 5 | single saw through lowpass, gain by distance | equal-power stereo pan only; culled beyond 150 m |
- Doppler (Web Audio has none): frequency × `c / (c − v_radial)`, c = 343 m/s, clamped to ±10% [S].
- Cheaper fallback (Low tier) [S 05]: 3 loops (idle/mid/high) pre-rendered in an `OfflineAudioContext` at startup, cross-faded with `playbackRate = rpm/refRpm`.

### 3.3 Drift screech and sparks
- Screech: noise → band-pass centred at `1200 + 1800·slip01` Hz (Q 3), gain `slip01 · min(1, v/30)`, AM 6–9 Hz depth 0.3 [S 05]; `slip01 = min(1, sinβ/0.5)`.
- Spark crackle: random noise bursts (2–4 ms) at 20–60 per second by spark tier, high-passed 3 kHz.

## 4. SFX catalogue (`audio/sfx/<id>.ts`, one `SfxDef` per file)
Recipes use: `osc(type, f)`, `noise(color)`, `env(a, d, s, r)` (seconds), `bp/lp/hp(f, Q)`, `sweep(f0 → f1, t)`, `fm(carrier, ratio, index)`. "3D" = spatial (HRTF panner at the event position).

### 4.1 Kart and physics
| id | Bus | Voices | 3D | Trigger | Recipe |
|---|---|---|---|---|---|
| `kart.engine` | engine | pool | yes | continuous | §3 |
| `kart.drift_screech` | sfx | 8 | yes | continuous while drifting | §3.3 |
| `kart.spark_crackle` | sfx | 8 | yes | continuous (spark tier) | §3.3 |
| `kart.drift_start` | sfx | 4 | yes | `driftStart` | pink noise → bp 2 kHz Q 4, env(0.005, 0.12, 0, 0.05) + sweep 1.6 → 2.4 kHz |
| `kart.double_drift` | sfx | 4 | yes | `doubleDrift` | drift_start + airy whoosh (noise hp 3 kHz, 0.2 s) |
| `kart.wall_grind` | sfx | 4 | yes | wall severity 0 (continuous) | brown noise lp 900 Hz + metallic partials fm(420, 2.7, 3), gain by tangent speed |
| `kart.wall_hit_soft` | sfx | 4 | yes | wall severity 1 | lowpass noise burst 0.12 s + sine 90 Hz thump env(0.001, 0.15) [S] |
| `kart.wall_hit_hard` | sfx | 4 | yes | wall severity 2 | soft hit ×1.5 + crunch (noise bp 600 Hz 0.25 s) + 55 Hz sub |
| `kart.bump` | sfx | 4 | yes | `bump` | sine 120 → 80 Hz 0.1 s + rubber squeak (square 900 Hz, vibrato 30 Hz, 0.06 s); gain by impulse |
| `kart.jump_takeoff` | sfx | 4 | yes | `air` | noise hp sweep 500 → 2 kHz, 0.25 s |
| `kart.land_soft` | sfx | 4 | yes | `land`, impact ≤ 6 m/s | sine 100 Hz 0.08 s + noise tick |
| `kart.land_hard` | sfx | 4 | yes | `land`, impact > 6 m/s | sine 70 Hz 0.18 s + suspension spring (triangle 300 Hz vibrato 12 Hz, 0.2 s) |
| `kart.brake_squeal` | sfx | 4 | yes | brake at > 20 m/s | square 2.2 kHz bp Q 8, vibrato 5 Hz, gain by speed |
| `kart.wheelspin` | sfx | 8 | yes | false start (18 ticks) | screech at slip 1 for 0.3 s + engine rev flare |
| `kart.offroad` | sfx | 8 | yes | continuous on grass/dirt | brown noise lp 400 Hz, AM by speed/8 Hz |
| `kart.surface.gravel` | sfx | 8 | yes | continuous on gravel | noise bursts (crunch grains 40/s) bp 1.5 kHz |
| `kart.surface.sand` | sfx | 8 | yes | continuous on sand | pink noise lp 1.2 kHz, soft hiss |
| `kart.surface.snow` | sfx | 8 | yes | continuous on snow/ice | noise bp 3 kHz Q 1 + creak partials on ice |
| `kart.surface.wood` | sfx | 8 | yes | continuous on wood | plank knocks (sine 180 Hz ticks at speed/1.5 m) |
| `kart.surface.metal` | sfx | 8 | yes | continuous on metal | ringing fm(300, 3.5, 2) ticks |
| `kart.surface.wet` | sfx | 8 | yes | continuous on wet | spray (noise hp 2 kHz) gain by speed |
| `kart.rail_lock` | sfx | 4 | yes | rail capture | metallic clack fm(600, 1.4, 5) 0.1 s + rising hum |
| `kart.rail_loop` | sfx | 4 | yes | while railed | saw 110 Hz + fm whine rising with speed |
| `kart.rail_exit` | sfx | 4 | yes | rail exit | clack + whoosh |
| `kart.warp_enter` | sfx | 4 | yes | warp entry | sweep 200 → 2000 Hz fm + reverse cymbal (noise env reversed) 0.8 s |
| `kart.warp_exit` | sfx | 4 | yes | warp exit | sweep 2000 → 400 Hz + sparkle chimes |
| `kart.respawn_out` | sfx | 2 | yes | `respawn{out}` | descending glass arpeggio (sine 1320/990/660) 0.4 s |
| `kart.respawn_in` | sfx | 2 | yes | `respawn{in}` | ascending arpeggio 660/990/1320 + soft pop |

### 4.2 Boosts
| id | Bus | Voices | 3D | Trigger | Recipe |
|---|---|---|---|---|---|
| `boost.ignite` | sfx | 4 | yes | `boostStart{normal}` | noise sweep bp 200 → 4 kHz over 0.3 s + 60 Hz sine thump [S] |
| `boost.loop` | sfx | 8 | yes | while boosting | jet roar: noise bp 800–3000 Hz, gain 0.3, slow AM 3 Hz |
| `boost.team_ignite` | sfx | 4 | yes | `boostStart{team}` | ignite + major-third chorus shimmer (sine 880/1109 Hz, 0.4 s) |
| `boost.start` | sfx | 1 | no | `startBoost{perfect/great/good}` | chime (perfect: 1320 + 1760 Hz; great: 1175; good: 988) + ignite |
| `boost.instant` | sfx | 2 | no (local) / yes | `instantBoost` | bright two-note chime 1568 → 2093 Hz, 60 ms each [S] |
| `boost.pad` | sfx | 4 | yes | pad boost | zap (square 1200 → 300 Hz, 0.08 s) + whoosh |
| `boost.draft_charge` | sfx | 1 | no | local `draftCharge > 0` | wind: noise lp 500 → 2000 Hz with charge |
| `boost.draft_on` | sfx | 1 | no | `draft{on}` | whoosh ring (noise bp sweep 400 → 4000 Hz, 0.3 s) |
| `boost.gauge_full` | ui | 1 | no | `gaugeFull` (local) | "ding" 1760 Hz sine, env(0.002, 0.4) [S] |
| `boost.stored` | ui | 1 | no | booster pops into a slot | pop: sine 600 → 900 Hz 0.05 s [S] |
| `boost.team_gauge_full` | ui | 1 | no | `teamGaugeFull` | two-tone ding 1320 + 1760 Hz |
| `boost.end` | sfx | 4 | yes | `boostEnd` | soft exhale: noise lp 800 Hz fade 0.3 s |

### 4.3 Race flow
| id | Bus | Voices | Trigger | Recipe |
|---|---|---|---|---|
| `race.countdown_beep` | ui | 1 | `countdown{3,2,1}` | 440 Hz sine + triangle, 120 ms [S] |
| `race.countdown_go` | ui | 1 | `countdown{0}` | 880 Hz + A-major triad stab, 300 ms [S] |
| `race.lap` | ui | 1 | `lap` | two-note chime 988 → 1319 Hz |
| `race.best_lap` | ui | 1 | `lap{best}` | lap chime + sparkle arpeggio |
| `race.final_lap` | ui | 1 | `finalLap` | fanfare stinger (square brass triad, 0.8 s) [S] |
| `race.finish` | ui | 1 | local `finish` | fanfare; 1st: longer major cadence |
| `race.wrong_way` | ui | 1 | `wrongWay{on}` | buzz: square 180 Hz pulsed at 2 Hz while shown [S] |
| `race.retire_tick` | ui | 1 | every 60 ticks during the retire timer | woodblock tick (sine 1200 Hz 20 ms); last 3 s higher 1600 Hz |
| `race.retire` | ui | 1 | local `retire` | descending "wah" (saw lp sweep 1200 → 300 Hz) |
| `race.rank_up` | ui | 1 | local `rank` up | blip 660 → 990 Hz |
| `race.rank_down` | ui | 1 | local `rank` down | blip 660 → 440 Hz |
| `race.overtake` | sfx | 2 | local pass | short whoosh pan L→R |

### 4.4 Items (keys from `12-items-spec.md` §10)
| id | Bus | 3D | Recipe |
|---|---|---|---|
| `item.box_break` | sfx | yes | glass shatter (noise hp 4 kHz bursts ×6) + sparkle chime |
| `item.roulette_tick` | ui | no | click (square 2 kHz, 4 ms), 8–12 ticks decelerating [S] |
| `item.roulette_land` | ui | no | pop + short chime |
| `item.turbo_token.use` | sfx | yes | rising saw 200 → 800 Hz + noise whoosh [S 03] |
| `item.attention_tether.use` | sfx | yes | FM warble fm(440, 1.01, 8), vibrato 7 Hz, 0.6 s [S 03] |
| `item.attention_tether.hit` | sfx | yes | clunk (sine 150 Hz + noise tick) on attach |
| `item.overclock_aura.use` | sfx | yes | two-tone synth siren loop 650/900 Hz alternating 0.3 s [S 03] |
| `item.overclock_aura.hit` | sfx | yes | zap + spin whirl |
| `item.prompt_missile.use` | sfx | yes | launch: noise burst + saw sweep 300 → 1200 Hz |
| `item.prompt_missile.hit` | sfx | yes | explosion: noise lp 1 kHz 0.5 s + 50 Hz sub |
| `item.top1_missile.use` | sfx | yes | distinct fanfare launch (brass triad + launch) [S] |
| `item.token_bomb.use` | sfx | yes | falling whistle sine 2000 → 600 Hz over the 36-tick lob [S 03] |
| `item.token_bomb.hit` | sfx | yes | pop + bubble loop (sine bursts 300–900 Hz random) |
| `item.bug_report.use` | sfx | yes | buzzing: saw 180 Hz AM 40 Hz, gain rises with proximity [S 03] |
| `item.bug_report.hit` | sfx | yes | bubble wrap pop |
| `item.broadcast_bolt.use` | sfx | yes (victims) | noise crack (0.05 s, hp 2 kHz) + sub boom 40 Hz 0.6 s [S 03] |
| `item.throttle_drone.use` | sfx | yes | rotor spin-up |
| `item.throttle_drone.loop` | sfx | yes | 90 Hz saw with 6 Hz wobble while stacked [S 03] |
| `item.firewall.use` | sfx | yes | blocks thud ×3 + flame crackle |
| `item.firewall.hit` | sfx | yes | brick smash (noise bp 800 Hz bursts) |
| `item.glitch_puddle.use` | sfx | yes | plop |
| `item.glitch_puddle.hit` | sfx | yes | bit-crushed squelch (8-bit crusher on noise + saw) [S 03] |
| `item.redaction_cloud.use` | sfx | yes | low-pass whoosh (noise lp 300 Hz swell) [S 03] |
| `item.redaction_cloud.hit` | ui | no | muffled "thump" + music low-pass 1.5 s |
| `item.mirror_mode.use` | sfx | yes | descending arpeggio (sine 1320/1047/880/659) [S 03] |
| `item.mirror_mode.hit` | ui | no | reversed chime |
| `item.context_shield.use` | sfx | yes | bell-like FM chime fm(880, 3.5, 4) [S 03] |
| `item.context_shield.hit` | sfx | yes | glass pop (noise hp 5 kHz 0.05 s + 2.6 kHz ping) [S 03] |
| `item.interrupt_pulse.use` | sfx | yes | band-pass noise sweep 300 → 5000 Hz, 0.4 s [S 03] |
| `item.alignment_halo.use` | sfx | yes | choir-like pad (3 detuned saws, formant bp 700/1200 Hz) 1 s [S 03] |
| `item.interpretability_lens.use` | ui | no | soft scan blip (sine 1500 Hz sweeping 0.5 s) [S 03] |
| `item.mutex_lock.use` | sfx | yes | heavy clunk (sine 70 Hz + metal fm) [S 03] |
| `item.trap_loop` | sfx | yes | bubble wobble loop while trapped |
| `item.mash_tap` | ui | no | tiny pop per credited tap (pitch rises with credits) |
| `item.escape_pop` | sfx | yes | bubble burst + instant-boost chime |
| `item.spin` | sfx | yes | spin-out whirl (saw vibrato sweep 800 → 200 Hz) |
| `item.stun_zap` | sfx | yes | electric buzz (square 60 Hz + noise crackle) 0.9 s |

### 4.5 UI, network, voice, ambience, hazards
| id | Bus | Recipe |
|---|---|---|
| `ui.hover` | ui | 2 ms click (sine 3 kHz) [S] |
| `ui.confirm` | ui | two-note up 660 → 990 Hz |
| `ui.back` | ui | two-note down 660 → 495 Hz |
| `ui.error` | ui | low buzz 150 Hz 0.15 s |
| `ui.toggle` | ui | tick 1.5 kHz |
| `ui.slider_tick` | ui | tick 2 kHz, 3 ms |
| `ui.ready` | ui | chime 880 Hz |
| `ui.room_countdown` | ui | soft tick per second of the room auto-start |
| `ui.reward_open` | ui | sparkle arpeggio up [S] |
| `ui.level_up` | ui | level-up jingle trigger (§6) |
| `ui.purchase` | ui | coin-like FM ping [S] |
| `ui.toast` | ui | soft pop |
| `ui.mission` | ui | 3-note motif |
| `ui.chat` | ui | bubble blip |
| `ui.lock_beep` | ui | missile lock-on beep 1.2 kHz, 40 ms; faster when locked |
| `ui.incoming_beep` | ui | warning beep 1.8 kHz, interval 24 → 5 ticks with ETA, panned toward the threat [S 03] |
| `net.late_signal` | ui | glitchy descending blip (bit-crushed) |
| `net.reconnect` | ui | two-tone "connected" |
| `voice.go` | voice | vocoded "GO!" (saw carrier through 8-band formant filter bank, pitch 220 Hz) [S no TTS] |
| `voice.final_lap` | voice | vocoded "Final lap!" |
| `voice.finish` | voice | vocoded "Finish!" |
| `voice.perfect` | voice | vocoded "Perfect!" |
| `voice.nice` | voice | vocoded "Nice!" (attack landed) |
| `amb.clayhill_village` … `amb.orbital_nexus` | sfx | per-theme ambience loops (birds + bells, desert wind, glacier wind + crystal tinkles, forest birds + water, mine drips + rumble, crickets + owls, waves + gulls, rain + traffic, crowd, orbital hum), −12 dB |
| `haz.telegraph` | sfx 3D | warning ping 1 kHz ×3 during the telegraph |
| `haz.geyser` | sfx 3D | pressure hiss → roar |
| `haz.press` | sfx 3D | hydraulic whoosh + slam |
| `haz.train` | sfx 3D | horn (two detuned squares 300/370 Hz) + rumble |
| `haz.traffic_horn` | sfx 3D | car horn (square 420 Hz) |
| `haz.swinger` | sfx 3D | whoosh synced to the pendulum |
Catalogue size: 28 kart + 12 boost + 12 race + 37 item + 18 UI/net + 5 voice + 10 ambience + 6 hazards = **128 ids** (≥ 60 required).

## 5. Music (Tone.js `SongDef`, `audio/music/songs/<id>.ts`)
Every song is 4 stems (drums, bass, harmony, lead) plus optional layers, sequenced procedurally in 16–32-bar loops, so tempo and layers can change live [S 07]. Each theme song has two **arrangements**: variant `a` for the theme's first track and `b` for the second (`EnvDef.song`), with its own tempo and lead instrument.

| Song id | Scene | Variant a (track) | Variant b (track) | Key | Instrumentation (Tone) | Structure |
|---|---|---|---|---|---|---|
| `lobby` | lobby, garage, results | chill lo-fi / city-pop, **92 BPM** [S] | — | D major | Rhodes (`FMSynth` ratio 1, index 2), vinyl noise, side-chained pad, brushed kit (`MembraneSynth`/`NoiseSynth`), round bass (`MonoSynth` sine+tri), FM bell lead | 4-bar intro, A 16, B 16, 32-bar loop |
| `clayhill` | Clayhill Village | marimba + ukulele pop, **120 BPM** (meadow_loop) | accordion + strings waltz-pop, **132 BPM** (belltower_piazza) | F major / B♭ major | marimba (`FMSynth` short decay), ukulele (`PluckSynth`), accordion (square `PolySynth` + vibrato), strings (saw pad + chorus), slap bass | intro 4, verse 16, chorus 16, bridge 8 |
| `sunstone` | Sunstone Desert | oud-flavoured synth, **110 BPM** (sunstone_bazaar) | driving percussion surf-rock, **140 BPM** (sandglass_canyon) | D Phrygian dominant | oud (`PluckSynth` + slide), darbuka (`MembraneSynth`), surf guitar (saw + spring-like reverb), low drone | intro 4, A 16, B 16, break 8 |
| `frostbyte` | Frostbyte Glacier | glockenspiel electro, **124 BPM** (snowglobe_halfpipe) | epic synth-orchestral, **150 BPM** (aurora_summit) | E major / E minor | glass FM bells (ratio 3.5), chiptune pulses, sub bass, orchestral saw strings, timpani (`MembraneSynth`) | intro 4, A 16, B 16, climax 8 |
| `canopy` | Canopy Forest | acoustic folk-pop with pizzicato, **118 BPM** (fernwood_hollow) | taiko + flute, **138 BPM** (cascade_slalom) | G major / D dorian | pizzicato strings (`PluckSynth`), acoustic guitar pluck, flute (sine + breath noise), taiko (`MembraneSynth` pitch-decay) | intro 4, A 16, B 16, bridge 8 |
| `ember` | Ember Mine | industrial funk, **128 BPM** (geode_rail_quarry) | heavy synth-rock, **160 BPM** (magma_switchback) | A minor / E minor | `MetalSynth` percussion, clav (`FMSynth`), distorted saw bass, power-chord saws | intro 4, A 16, B 16, breakdown 8 |
| `lantern` | Lantern Hollow | swing-spooky big band, **126 BPM** (pumpkin_lane) | harpsichord drum-and-bass, **150 BPM half-time** (manor_catacombs) | C minor / D minor | square "brass" section, walking bass, theremin-like sine lead with vibrato, harpsichord (`PluckSynth` bright), breakbeat | intro 4, A 16, B 16, turnaround 8 |
| `coral` | Coral Cove | steel-drum pop, **122 BPM** (coral_cove_docks) | sea-shanty electro in 6/8, **136 BPM** (kraken_lighthouse) | C major / A minor | steel drum (`FMSynth` ratio 1.5), marimba bass, accordion-like square pads, clap/stomp | intro 4, A 16, B 16, chant 8 |
| `neon` | Neon Harbor | synthwave, **118 BPM** (rainline_blvd) | future-funk, **142 BPM** (skyway_interchange) | F♯ minor / B♭ minor | saw `PolySynth` + chorus, gated-reverb snare, arpeggiated bass, slap-funk bass, vocoder chords | intro 4, A 16, B 16, bridge 8 |
| `spark` | Spark Circuit | stadium EDM, **128 BPM** (spark_grand_circuit, proving_ring) | anthemic rock-EDM, **134 BPM** (sunset_arena_rally) | A major / D major | four-on-the-floor kit, supersaw leads, crowd-chant pad, rock kit fills | intro 4, build 8, drop 16, break 8 |
| `orbital` | Orbital Nexus | glitch-house, **124 BPM** (token_foundry) | cinematic trance with supersaw, **145 BPM** (orbital_express) | G minor / C minor | stuttered chords (bit-crush), sub bass, supersaw (7 detuned saws), pads, arpeggios | intro 4, A 16, build 8, drop 16 |
- Songs start on the intro flyover at intensity 0.3 (pads and bass), duck to −8 dB during the countdown, and go to full band at GO.
- `setIntensity(x)` (0–1): 0 pads only · 0.3 + bass · 0.6 + drums · 0.8 + harmony · 1.0 + lead. Race default 0.8; 1.0 while the local kart is in a battle (another kart within 15 m) or on the final lap.

## 6. Jingles and stingers
| id | Length | Content |
|---|---|---|
| `jingle.countdown` | 3 beats + GO | tied to the countdown SFX; song downbeat on GO |
| `jingle.final_lap` | 2 bars | brass stinger on top of the song, then the song continues at +6% tempo |
| `jingle.finish_win` | 4 bars | major fanfare (1st–3rd) |
| `jingle.finish_lose` | 2 bars | gentle resolution (4th–8th, retire) |
| `jingle.retire_count` | 10 s loop | ticking percussion + suspended chord under the retire countdown [S KRD dedicated BGM] |
| `jingle.level_up` | 4 bars | rising arpeggio + chime [S 07] |
| `jingle.title` | 2 bars | title sting after "press any key" |
| `jingle.results_win` / `jingle.results_lose` | 4 / 2 bars | results screen entry [S 07] |
All jingles are in the key of the current song where possible (transposed at build time).

## 7. Adaptive rules (`music/director.ts`, `AudioApi.music.setState`)
| State / trigger | Rule |
|---|---|
| `lobby` | `lobby` song, intensity 0.8 |
| Loading | fade the lobby song out over 1.5 s |
| Intro flyover and grid | track song at intensity 0.3 |
| Countdown | music −8 dB; countdown SFX on top |
| GO (`race`) | full band on the next downbeat |
| Battle | intensity 1.0 while any kart is within 15 m (hysteresis 3 s) |
| Boost | 300 ms high-pass whoosh on the music bus and −3 dB while boosting [S] |
| Banners, voice barks | duck −4 dB for the banner hold [S] |
| `finalLap` | `Transport.bpm.rampTo(bpm·1.06, 2)`, add a 16th-note hi-hat stem, open the master filter sweep [S] |
| Retire timer | crossfade to `jingle.retire_count` over 1 bar |
| `finish` (local) | cut to the win/lose jingle **on the next bar** [S] |
| `results` | results jingle, then the lobby song fades in |
| Pause | music −12 dB, engines muted |
| Tab hidden | mute (if "mute when unfocused") |

## 8. Tests
| Test | Pass |
|---|---|
| Every `SfxDef` rendered in an `OfflineAudioContext` | no NaN, no Infinity, peak < −1 dBFS after the master chain |
| Every `SongDef` renders 8 bars at both variants | stems start/stop cleanly; `setIntensity` changes gain without clicks (max step ≤ 0.1 per 10 ms) |
| Engine synth | f0 within 55–235 Hz for rpm01 ∈ [0, 1]; gear shifts at the thresholds |
| Dedupe | a rollback re-simulation does not re-trigger one-shot SFX |
| Unlock | no `AudioContext` is created before the first gesture |
