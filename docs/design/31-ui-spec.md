# 31 — UI spec

Owner: L10 UI+META (`apps/client/src/ui/**`, `i18n/*`, `meta/**`, `input/**`); HUD model is frozen (`ui/store/*.ts`, B11).
Sources: `07-ui-art-character.md` Part 1 (KRD HUD teardown, measured on a 3840×2160 reference), `01-driving-mechanics.md` §1 (controls, browser pitfalls), `02-modes-rules.md` §8, ADR-008, ADR-011 (disclaimer, fonts), B11.
Status keys: **[S]** sourced (measured or documented) · **[P]** proposed. UI animation times are real-time milliseconds; sim-driven cues quote ticks.

---

## 1. Principles
- Preact + `@preact/signals`; the HUD is a DOM/CSS overlay above the canvas, animated with `transform` and `opacity` only.
- `hud` signals are written only by `game/HudPresenter` at 20–30 Hz (text ≤ 20 Hz, speed readout 30 Hz) [S practice].
- Two sizes carry meaning at a glance: rank (≈ 11.6% H) and speed (≈ 6% H); everything else ≤ 2.2% H [S]. Numbers use tabular figures so digits never jitter.
- Every string goes through `t('ns.key')`; Korean is the default locale, English the second. `josa()` handles Korean particles for names ("{name}이/가").
- Every screen works at 1280×720, 1920×1080 and 2560×1080 (screenshot sheets, E).

---

## 2. Screens and flows

### 2.1 Screen list (`Screen` in B11)
| Screen | Purpose | Key elements |
|---|---|---|
| `title` | first gesture, audio unlock | key art (`keyart.title`), wordmark (`logo.wordmark`), "아무 키나 누르세요 / Press any key", disclaimer footer (§11.1) |
| `lobby` | hub | 3D turntable showcase (character + kart on a studio cyclorama); mode card toggle 스피드전 / 아이템전; big CTA 빠른 매칭; buttons 빠른 레이스 (vs AI), 타임어택, 커스텀 룸, 차고, 설정; profile chip (level, XP bar, Sparks); daily/weekly challenge panel; tip line |
| `modeSelect` | pick mode × format and online/offline | cards (`card.speed`, `card.item`, `card.timeAttack`, `card.custom`) with Focus/UnFocus states; format toggle 개인전 / 팀전 2인 / 팀전 4인; difficulty tier (vs AI) |
| `queue` | quick match | search timer (20 s) with humans `{n}/8`, cancel; matching stage (15 s): track thumb + name + stars, loadout quick change, quick chat, team colours |
| `room` | custom room | 8 slot cards (character portrait, name, ready tick, ping pill, team colour, host crown, AI badge), host controls (open/close/bot/kick, team assign), settings panel (§7.2 of `13-modes-rules.md`), code chip (copy, hide), chat, ready/start button, auto-start countdown |
| `garage` | loadout | tabs 캐릭터 / 카트 / 도색 / 팔레트 / 감정표현; turntable; kart stat bars; lock labels (레벨 {n}); Sparks purchases |
| `loading` | track load and `compileAsync` | loading art (`loading.<trackId>`), track name KR/EN, difficulty stars, laps, tip, 8 player cards, progress bar |
| `race` | HUD (§4) | — |
| `results` | results (§6 of `13-modes-rules.md`) | banner, table, rewards panel, podium emotes, buttons, 12 s timer |
| `settings` | settings (§9) | tabs |
| `timeAttack` | track select for Time Attack | track grid with PB lap/race, ghost toggle, Pro-ghost toggle (P1), start |
Pause is an overlay on `race` (Esc): 계속 / Resume, 재시작 / Restart (offline and Time Attack), 설정 / Settings, 레이스 나가기 / Leave race.

### 2.2 Flows
```
title ──any key──▶ lobby
lobby ──빠른 매칭──▶ queue(search 20 s ▸ stage 15 s) ──▶ loading ──▶ race ──▶ results(12 s) ──▶ queue | lobby
lobby ──커스텀 룸──▶ room ──start──▶ [track roulette 20 s] ──▶ loading ──▶ race ──▶ results ──▶ room
lobby ──빠른 레이스──▶ modeSelect ──▶ loading ──▶ race ──▶ results ──▶ race again | lobby
lobby ──타임어택──▶ timeAttack ──▶ loading ──▶ race ──▶ results (splits, PB) ──▶ timeAttack
lobby ⇄ garage;  any screen ⇄ settings;  race ──Esc──▶ pause overlay
```
- Back: `Esc` / gamepad `B` goes up one level (never out of a race without the pause menu).
- Deep links: `?screen=garage`, `?track=<id>&autopilot=1` (debug flags, B).

---

## 3. Design tokens (`ui/styles/tokens.css`, frozen)
| Token | Value | Use |
|---|---|---|
| `--cr-ivory` | `#FAF9F5` | menu surface |
| `--cr-parchment` | `#F5F4ED` | menu surface alt |
| `--cr-cream` | `#F0EEE6` | borders |
| `--cr-sand` | `#E8E6DC` | dividers |
| `--cr-dark` | `#141413` | text |
| `--cr-dark-surface` | `#30302E` | dark mode surface |
| `--cr-charcoal` | `#4D4C48` | secondary text on light |
| `--cr-olive` | `#5E5D59` | tertiary text |
| `--cr-stone` | `#87867F` | disabled |
| `--cr-gray` | `#B0AEA5` | inactive icons |
| `--cr-terracotta` | `#C96442` | primary CTA |
| `--cr-coral` | `#D97757` | CTA hover, local-player accent |
| `--cr-coral-2` | `#F2A65A` | local row gradient end |
| `--cr-blue` / `--cr-green` | `#6A9BCC` / `#788C5D` | accents |
| `--cr-error` | `#B53333` | errors |
| `--cr-hud-fg` | `#FFFFFF` | HUD text |
| `--cr-hud-shadow` | `0 2px 6px rgba(20,20,19,.55)` | HUD text shadow |
| `--cr-hud-panel` | `rgba(20,20,19,.42)` + `backdrop-filter: blur(6px)` | HUD panels |
| `--cr-rank-up` / `--cr-rank-down` | `#7BD88F` / `#FF6B5A` | rank flash |
| `--cr-danger` | `#E5484D` | warnings |
| `--cr-gauge-a` → `--cr-gauge-b` | `#FFD23F` → `#FF5A36` | drift gauge |
| `--cr-team-gauge-a` → `--cr-team-gauge-b` | `#2ACAFF` → `#8A5CFF` | team gauge |
| `--cr-cb-gauge-a` → `--cr-cb-gauge-b` | `#FFE14D` → `#2F6BFF` | colour-blind gauge (yellow → blue) [P] |
| `--cr-team-red/blue/green/yellow` | `#E5484D` / `#2ACAFF` / `#7BD88F` / `#FFD23F` | team plates |
| `--cr-ring` | `0 0 0 1px #D1CFC5` | card rings |
| `--cr-radius-s/m/l` | 12 / 16 / 24 px | radii |
| `--cr-font-ui` | `"Pretendard Variable", Pretendard, "Noto Sans KR", system-ui, sans-serif` | UI |
| `--cr-font-num` | `"Barlow Condensed", "Pretendard Variable", sans-serif` (800/900 italic, `font-variant-numeric: tabular-nums`) | HUD numerals |
| `--cr-font-banner-ko` | `"Black Han Sans", "Pretendard Variable", sans-serif` | Korean banners |
Dark menus (optional theme): surfaces `#30302E` / `#141413`, text `#FAF9F5`.

---

## 4. HUD (race screen)
Positions are percentages of the viewport (x of width W, y of height H) for 16:9. On wider aspect ratios the HUD anchors to a centred 16:9 safe box [P]. `HUD scale` (80–120%) scales each element about its anchor.

### 4.1 Layout
| Element | Anchor | Position / size | Content and behaviour | Source |
|---|---|---|---|---|
| Rank | top-left | x 7.8–12.3%, y 8.9–20.4%; digit height **11.6% H** | big white rank digit, Barlow Condensed Black Italic, soft dark shadow, no panel; "/N" suffix at 45% of the digit height and 70% opacity | [S] |
| Standings | top-left | x 7.9%, width 19.4% W; 8 rows × 3.5% H starting at y 22%, 2 px gaps | rank number, character icon, name, ping pill (bots show the AI badge), held-booster icons (speed mode) or item icons (Lens) at the right; local row filled with the coral gradient `#D97757 → #F2A65A`, others `--cr-hud-panel`; disconnected rows grey with ✕; FLIP reorder | [S] layout, [P] colours |
| Lap block | top-right | x 79.5–92% | big current-lap digit (7% H) with "FINAL" tag on the last lap, "/{laps} LAP"; below: LAP / TIME / BEST rows, `mm:ss.cc`, rows every 3.2% H, text 2% H | [S] |
| Split delta (Time Attack) | top-right | under BEST, 2% H | ±`s.cc` vs PB at each key gate, green/red | [P] |
| Progress rail | right edge | x 86%, y 36–58% | thin vertical rail with rival dots and the player's coral arrow (1-D minimap) | [S] |
| Speedometer | bottom-right | centre (86% W, 80% H), outer radius 11.6% H | segmented 270° arc open at the bottom, white with a `#CD2F00` high end; number 6% H + "KM/H" (or "MPH"); "DRAFT" label below lights during draft | [S] |
| Item / booster slots | bottom-centre | centred at x 50%, y 77–85% H; slot 1 ≈ 8% H square, slot 2 ≈ 5.6% H | icons; empty slots show the key hint (Ctrl/Space); roulette spin in the rolling slot; lock overlay during `slot_lock`; "AUTO" badge when an assist is on | [S] |
| Drift gauge | bottom-centre | under the slots, 15.8% W wide, 1.6% H tall | gradient `--cr-gauge-a → b`, scrolling noise, glow; pops a booster icon into a slot when full | [S] |
| Team gauge | bottom-centre | under the drift gauge, 15.8% W, 1.2% H | gradient `--cr-team-gauge-a → b` (team speed) | [S] |
| Swap chip | bottom-centre | under the gauges | key chip "Alt ⟳" (or "E ⟳", gamepad "B ⟳") | [S] |
| Minimap | bottom-left | x 3–17% W, y 62–92% H | per-track SDF line (smoothstep 0.66/0.72), dots for karts, item boxes in item mode; off by default in speed mode (the progress rail replaces it) | [S] SDF, [P] placement |
| Countdown | centre | digit height 22% H | 3 · 2 · 1 on each 60-tick beat, then GO with an additive expanding ring; GO glows blue (`#2ACAFF`) and the mascot smiles on a PERFECT start | [S] |
| Start-boost result | centre-low | y 62%, 3% H | "퍼펙트 스타트! / PERFECT START" (or GREAT/GOOD, or "부정 출발" for a false start) for 1.2 s | [P] |
| Banners | centre | y 30%, height 8% H | 마지막 랩! / FINAL LAP, 랩 2/3, 역전!, 피니시!, 리타이어 on a −12° skewed panel: slide in 180 ms, hold 1.2 s, wipe out 250 ms; Korean in Black Han Sans | [S] motion |
| Retire countdown | top-centre | y 12%, digit 9% H | big 10 → 0 count after the first finish with "리타이어까지" label | [S] |
| Wrong way | centre | y 32%, roundel 12% H | no-entry roundel (terracotta disc `#CC6650`, white bar, white ring, red outer ring) pulsing at 2 Hz + "역주행! R: 코스 복귀" | [S] icon |
| Item feed | right | x 70–92%, y 30–46% | up to 4 lines, 4 s each: "{attacker}의 {item} → {victim} · 명중" with a slanted-cut border; the local player's lines highlighted | [S] |
| Incoming warning | screen edge | edge arrow toward the threat + central "!" ring above the slots with the ETA sweep | from ETA ≤ 120 ticks; beeps (interval 24 → 5 ticks) | [S] + gap-4 |
| Alert vignette | full screen | corner vignette red (danger) / blue (team info), fades in from the side of the threat | [S] |
| Mash prompt | centre | above the slots, y 68% | ◀ ▶ arrows alternating with "연타!" and the remaining taps; "빠른 탈출!" on a floor escape | [S] |
| Instant-boost hint | bottom-centre | left of slot 1, 2.5% H | "순간 부스터!" tag while the window is open (Settings → Gameplay hint on) | [S] |
| Toasts | top-centre | y 6%, max 2 | challenge progress, mid-race mission, network notices; slide 200 ms, hold 3 s | [P] |
| Net indicator | top-right | x 93–97%, y 3% | ping bars (good/normal/bad) and "늦은 신호" icon on late signals | [S] icons |
| Rear-view tag | top-centre | y 3% | "후방 / REAR" while X is held | [P] |
| Redaction overlay | full screen | — | ████ bars, opaque 120 ticks then fade 60; minimap stays visible | `12-items-spec.md` |
| Mirror overlay | full screen edge | — | mirrored arrows at the screen edges while steering is reversed | `12-items-spec.md` |
| Post-finish chat | bottom-left | x 3–30%, y 70–92% | only after the local player finished [S] | [S] |

### 4.2 World-space name tags [S]
- Above every rival kart: small dark square rank badge + bold white name; team modes use the team-coloured plate (blue, green, red, yellow).
- The player's own kart shows only a small coral rank badge (KRD "SoloMe" is a navy pentagon; ours is coral to keep the brand).
- Rendered as sprites from a canvas atlas (≤ 8 tags); canvases are drawn after `document.fonts.ready`.

### 4.3 HUD by mode
| Element | Speed | Item | Team | Time Attack |
|---|---|---|---|---|
| Slots show | boosters (team boosters blue) | items + roulette | per mode | boosters |
| Drift gauge | yes | no | per mode | yes |
| Team gauge | — | — | speed/infinite | — |
| Item feed, incoming warning, mash | — | yes | item | — |
| Standings | yes | yes | yes (team totals row) | ghost row |
| Minimap | off (rail) | on | per mode | off |
| Split delta | — | — | — | yes |

---

## 5. Motion specs
| Event | Animation |
|---|---|
| Rank change | digit punch scale 1.35 → 1.0 in 160 ms `easeOutBack`, flash `--cr-rank-up` (up) or `--cr-rank-down` (down) [S proposal] |
| Standings reorder | FLIP, 220 ms |
| Gauge full | new booster icon pops into the slot: overshoot 1.2 in 180 ms + "ding" |
| Roulette | 8–12 icon steps over 30 ticks (0.5 s), decelerating; lands with a bounce 120 ms |
| Countdown digits | scale 1.4 → 1.0 and fade in 200 ms per beat; GO ring expands 0 → 60% H in 400 ms, additive |
| Banners | skewed panel slides in 180 ms, holds 1.2 s, wipes out 250 ms |
| Lap time popup | lap time + delta vs best under the lap block for 3 s |
| Screen transitions | 240 ms fade + 16 px slide |
| Buttons | hover 120 ms scale 1.03; press 80 ms scale 0.97 |
| Results | rows stagger 60 ms; XP bar fill 900 ms ease-out; level-up flash 400 ms + jingle |
| Boost | HUD edges get speed streaks; speedometer high segment glows |
| Reduced motion | no scale punches or streaks; fades only (≤ 150 ms) |

---

## 6. Typography
| Role | Font | Weight | Size |
|---|---|---|---|
| Menu body | Pretendard Variable | 400 / 600 | 16 px at 1080p (clamp 14–20 px by viewport) |
| Menu headings | Pretendard Variable | 800 | 24 / 32 / 48 px |
| Buttons | Pretendard Variable | 700 | 18–24 px |
| HUD numerals (rank, laps, timers, speed) | Barlow Condensed | 800–900 italic, tabular | rank 11.6% H, speed 6% H, timers 2% H |
| HUD labels | Pretendard Variable | 700 | 1.6–2.2% H |
| Korean banners | Black Han Sans | 400 | 8% H banners, 4% H callouts |
| English banners | Barlow Condensed | 900 italic | same sizes |
- Fonts are OFL and self-hosted (pretendard npm, @fontsource); Korean glyphs load as unicode-range subsets; first-screen fonts ≤ 400 KB (E). Never use the Nexon "Kartrider" font or Anthropic's proprietary faces [S].
- Canvas textures (name tags, signs, liveries) wait for `document.fonts.load('800 64px "Barlow Condensed"')` and `document.fonts.ready` (spike S5).

---

## 7. Input

### 7.1 Keyboard defaults (`KeyboardEvent.code`, layout-independent)
| Action | Primary | Alternate | Sim input |
|---|---|---|---|
| Accelerate | `ArrowUp` | `KeyW` | throttle 15 |
| Brake / reverse | `ArrowDown` | `KeyS` | brake 15 |
| Steer left | `ArrowLeft` | `KeyA` | steer −127 (also `TAP_L` edge on press) |
| Steer right | `ArrowRight` | `KeyD` | steer +127 (also `TAP_R` edge on press) |
| Drift | `ShiftLeft` / `ShiftRight` | `KeyC` | `Held.DRIFT` |
| Item / booster | `ControlLeft` / `ControlRight` | `Space` | `Edge.USE_ITEM` (and `Held.ITEM` while held when auto-fire is on) |
| Swap items | `AltLeft` | `KeyE` | `Edge.SWAP` |
| Reset (back to course) | `KeyR` | — | `Edge.RESPAWN` |
| Rear view (hold) | `KeyX` | — | `Held.LOOK_BACK` (also rear missile aim) |
| Pause | `Escape` | — | UI |
| Music on/off | `F7` | — | UI |
| SFX on/off | `F8` | — | UI |
| Emotes | `Digit1` … `Digit4` | — | `Edge.EMOTE` + `emote` id [P] |
| Full standings | `Tab` (hold) | — | UI [P] |
| Chat (after finishing) | `Enter` | — | UI |
| Quick restart (Time Attack) | `Backspace` | — | UI [P] |
| Fullscreen | `F11` | — | UI |
| Debug overlay (dev builds) | `F3` | — | UI |
Rebinding: every action, two bindings each, conflict detection (a key already bound elsewhere is highlighted and must be confirmed to move), "reset to defaults".

### 7.2 Gamepad (Gamepad API standard mapping) [S partial, P]
| Action | Button / axis |
|---|---|
| Accelerate (analog) | `buttons[7]` RT → throttle 0–15 |
| Brake / reverse (analog) | `buttons[6]` LT → brake 0–15 |
| Steer | `axes[0]` left stick (deadzone 0.15, response curve x^1.3); D-pad left/right as digital steer |
| Drift | `buttons[2]` X or `buttons[5]` RB |
| Item / booster | `buttons[0]` A |
| Swap | `buttons[1]` B |
| Rear view | `buttons[4]` LB |
| Reset | `buttons[3]` Y |
| Pause | `buttons[9]` Start |
| Standings / TA restart | `buttons[8]` Back/Select |
| Emote | D-pad up (wheel of 4) |
| Mash taps | left-stick flicks past ±0.6 and D-pad left/right produce `TAP_L`/`TAP_R` edges |
The UI switches its key hints to gamepad glyphs when the last input came from a pad [S KRD].

### 7.3 Latching and sampling
- Keys and pads are sampled every sim tick; one-shot edges (use, swap, taps, respawn, emote) are latched between ticks so a tap shorter than a tick is never lost [gap-4].
- Throttle and brake are digital (15) on keys and analog on pads.

### 7.4 Browser pitfalls and handling [S 01 §1.3, P details]
| Pitfall | Handling |
|---|---|
| `Ctrl+W/T/N` cannot be blocked in a normal tab | `navigator.keyboard.lock()` in fullscreen on Chromium; **Space** is an equal default for item/boost; first-run tip recommends Space or fullscreen |
| `Alt` keyup opens the menu bar (Windows) | `preventDefault()` on both keydown and keyup of Alt; **E** as the alternate swap |
| Windows Sticky Keys after 5 Shift presses | **C** as the alternate drift key; first-run tip explains how to disable Sticky Keys |
| Layout independence | bind by `KeyboardEvent.code`, not `key`; WASD alternates |
| Korean IME | bindings use `code`; the IME is only active in text inputs (chat, names); `compositionstart` in inputs suspends game keys |
| Stuck keys on blur | on `blur`/`visibilitychange`, release every key and pad input (neutral input); offline races pause; online races keep the kart on the missing-input rule |
| `F7`/`F8`/`F11`/`Tab`/`Backspace`/`Space` browser defaults | `preventDefault()` while the race or a game screen has focus (not in text fields) |
| Audio autoplay | the title screen's "press any key" unlocks audio (`AudioApi.unlock()`, `Tone.start()` lazily) |
| Gamepads need a button press to appear | "패드 버튼을 눌러 연결 / Press a pad button" hint in Settings → Controls |
| Key ghosting on cheap keyboards (arrows + Shift + Ctrl) | WASD + C + Space layout preset in Settings |
| Context menu / text selection on the canvas | disabled on the game surface |
| Fullscreen differences (Safari) | fullscreen button; Keyboard Lock only where available |

---

## 8. Accessibility
| Feature | Setting |
|---|---|
| HUD scale | 80–120% in 5% steps |
| Colour-blind gauge palette | yellow → blue gauge; team colours add patterns (stripes/dots) on plates |
| Reduced motion | no FOV kick, camera shake, blur, CA, HUD punches (fades only) |
| High-contrast HUD | solid panels instead of translucent, thicker outlines |
| Audio-cue visuals | every warning sound has a visual (incoming arrow, telegraph decal, mash prompt) |
| Remapping | every action, keyboard and pad |
| Assists | 부스터 자동 사용 (auto-fire boosters), 순간 부스터 힌트 (instant-boost hint), racing line (Time Attack); an "AUTO" badge shows when an automation assist is on [S KRD] |
| Language | 한국어 / English, switchable at any time |

---

## 9. Settings (`SettingsV1`)
| Tab | Setting | Values (default) |
|---|---|---|
| 그래픽 Graphics | Quality preset | Auto / Low / Medium / High / Ultra (P2) (**Auto**: picked from the adapter and the first 3 s of frame times) |
| | Renderer backend | Auto / WebGPU / WebGL2 (**Auto**, persisted per user agent; ADR-002) |
| | Render scale | 50–100% (tier default) |
| | FPS cap | 30 / 60 / 120 / Unlimited (**60**) |
| | Shadows, particles, bloom, motion blur | per tier, overridable |
| 오디오 Audio | Master, Music, SFX, Engine, UI, Voice | 0–100 (80, 60, 80, 70, 70, 70) |
| | Mute when unfocused | on |
| 조작 Controls | Keyboard bindings, gamepad bindings | defaults §7 |
| | Stick deadzone | 0.05–0.30 (0.15) |
| | Layout preset | Arrows + Shift/Ctrl/Alt · WASD + C/Space/E |
| 게임 Gameplay | 부스터 자동 사용 (auto-fire) | off |
| | 순간 부스터 힌트 | on |
| | Camera distance | Near / Normal / Far (Normal) |
| | Camera shake | on |
| | Speed unit | km/h / mph |
| | Racing line (Time Attack) | off |
| HUD | Scale | 80–120% (100) |
| | Minimap in speed mode | off |
| | Name tags | on |
| | Item feed | on |
| 접근성 Accessibility | Colour-blind gauges, reduced motion, high-contrast HUD | off |
| 언어 Language | 한국어 / English | 한국어 |
| 데이터 Data | Export save, import save, reset progress | — |
| 정보 About | credits, OFL font licences, disclaimer (§11.1), version, renderer backend | — |

---

## 10. Loading screen tips (namespace `common`, rotating)
10 tips: drift basics, instant boost timing, start boost timing, wall grinding, draft, respawn (R), shield timing, mash-out, shortcuts, 부스터 자동 사용 option (keys `common.tip.1` … `common.tip.10`).

---

## 11. Legal text

### 11.1 Disclaimer (ADR-011; title screen footer and Settings → About)
- ko: "비공식 비상업 팬 프로젝트입니다. Anthropic 및 Nexon과 제휴·후원 관계가 없습니다."
- en: "Unofficial non-commercial fan project; not affiliated with or endorsed by Anthropic or Nexon."

---

## 12. String table (key parity ko/en is enforced by a test)

### 12.1 `common`
| Key | ko | en |
|---|---|---|
| `common.ok` | 확인 | OK |
| `common.cancel` | 취소 | Cancel |
| `common.back` | 뒤로 | Back |
| `common.close` | 닫기 | Close |
| `common.confirm` | 확정 | Confirm |
| `common.yes` | 예 | Yes |
| `common.no` | 아니요 | No |
| `common.loading` | 불러오는 중… | Loading… |
| `common.pressAnyKey` | 아무 키나 누르세요 | Press any key |
| `common.disclaimer` | 비공식 비상업 팬 프로젝트입니다. Anthropic 및 Nexon과 제휴·후원 관계가 없습니다. | Unofficial non-commercial fan project; not affiliated with or endorsed by Anthropic or Nexon. |
| `common.mode.speed` | 스피드전 | Speed Race |
| `common.mode.item` | 아이템전 | Item Race |
| `common.mode.infinite` | 무한부스터 | Infinite Boost |
| `common.mode.timeAttack` | 타임어택 | Time Attack |
| `common.format.solo` | 개인전 | Solo |
| `common.format.duo` | 팀전 2인 | Duo |
| `common.format.squad` | 팀전 4인 | Squad |
| `common.tier.rookie` | 루키 | Rookie |
| `common.tier.racer` | 레이서 | Racer |
| `common.tier.pro` | 프로 | Pro |
| `common.tier.legend` | 레전드 | Legend |
| `common.difficulty` | 난이도 | Difficulty |
| `common.laps` | {n}바퀴 | {n} laps |
| `common.level` | Lv.{n} | Lv.{n} |
| `common.sparks` | 스파크 | Sparks |
| `common.ai` | AI | AI |
| `common.tip.1` | 코너 직전에 드리프트를 짧게 끊고 반대 방향키로 빠져나오면 속도 손실이 적습니다. | Tap drift just before a corner and counter-steer out early to keep your speed. |
| `common.tip.2` | 드리프트가 끝난 직후 가속 키를 뗐다가 다시 누르면 순간 부스터가 발동합니다. | Release and re-press the throttle right after a drift for an instant boost. |
| `common.tip.3` | GO 신호와 동시에, 혹은 아주 살짝 뒤에 가속 키를 누르면 퍼펙트 스타트! | Press the throttle right at GO, or just after, for a Perfect start. |

### 12.2 `hud`
| Key | ko | en |
|---|---|---|
| `hud.lap` | 랩 | LAP |
| `hud.time` | 시간 | TIME |
| `hud.best` | 베스트 | BEST |
| `hud.final` | 마지막 | FINAL |
| `hud.lapOf` | {lap}/{laps} 랩 | {lap}/{laps} LAP |
| `hud.finalLap` | 마지막 랩! | FINAL LAP! |
| `hud.go` | GO! | GO! |
| `hud.finish` | 피니시! | FINISH! |
| `hud.retire` | 리타이어 | RETIRE |
| `hud.retireIn` | 리타이어까지 | Retire in |
| `hud.wrongWay` | 역주행! R: 코스 복귀 | WRONG WAY! R: back to course |
| `hud.kmh` | KM/H | KM/H |
| `hud.mph` | MPH | MPH |
| `hud.draft` | 드래프트 | DRAFT |
| `hud.instantBoost` | 순간 부스터! | Instant boost! |
| `hud.start.perfect` | 퍼펙트 스타트! | PERFECT START! |
| `hud.start.great` | 그레이트 스타트! | GREAT START! |
| `hud.start.good` | 굿 스타트! | GOOD START! |
| `hud.start.false` | 부정 출발 | FALSE START |
| `hud.boosterReady` | 부스터 준비! | Booster ready! |
| `hud.teamBooster` | 팀 부스터! | TEAM BOOSTER! |
| `hud.rankUp` | 순위 상승 | Position up |
| `hud.overtake` | 역전! | Overtake! |
| `hud.mash` | 연타! | MASH! |
| `hud.mashLeft` | {n}번 남음 | {n} to go |
| `hud.fastEscape` | 빠른 탈출! | Quick escape! |
| `hud.incoming` | 공격 접근! | INCOMING! |
| `hud.shieldUp` | 실드! | SHIELD! |
| `hud.blocked` | 방어 | BLOCKED |
| `hud.hit` | 명중 | HIT |
| `hud.immune` | 면역 | IMMUNE |
| `hud.miss` | 빗나감 | MISS |
| `hud.lateSignal` | 늦은 신호 (+{ms}ms) | Late signal (+{ms} ms) |
| `hud.noLock` | 조준 실패 | No lock |
| `hud.feed` | {attacker}의 {item} → {victim} | {attacker}'s {item} → {victim} |
| `hud.split` | 구간 {delta} | Split {delta} |
| `hud.newBest` | 신기록! | New best! |
| `hud.rear` | 후방 | REAR |
| `hud.auto` | AUTO | AUTO |
| `hud.mission` | 미션! {text} | Mission! {text} |
| `hud.missionClear` | 미션 성공! | Mission complete! |
| `hud.respawn` | 코스 복귀 중… | Returning to course… |
| `hud.disconnected` | 연결 끊김 | Disconnected |
| `hud.reconnecting` | 재연결 중… | Reconnecting… |

### 12.3 `lobby`
| Key | ko | en |
|---|---|---|
| `lobby.quickMatch` | 빠른 매칭 | Quick Match |
| `lobby.quickRace` | 빠른 레이스 | Quick Race |
| `lobby.timeAttack` | 타임어택 | Time Attack |
| `lobby.customRoom` | 커스텀 룸 | Custom Room |
| `lobby.garage` | 차고 | Garage |
| `lobby.settings` | 설정 | Settings |
| `lobby.daily` | 일일 도전 | Daily challenges |
| `lobby.weekly` | 주간 도전 | Weekly challenges |
| `lobby.resetsIn` | {time} 후 초기화 | Resets in {time} |
| `lobby.searching` | 레이서 찾는 중… {n}/8 | Searching for racers… {n}/8 |
| `lobby.matchingStage` | 매칭 완료! 곧 출발합니다 | Match found! Starting soon |
| `lobby.cancelSearch` | 매칭 취소 | Cancel |
| `lobby.aiFill` | 빈 자리는 AI가 채웁니다 | Empty slots will be filled by AI |
| `lobby.vsAi` | AI와 대결 | Race vs AI |
| `lobby.selectTier` | AI 난이도 | AI difficulty |
| `lobby.selectTrack` | 트랙 선택 | Choose a track |
| `lobby.randomTrack` | 랜덤 트랙 | Random track |
| `lobby.start` | 출발 | Start |
| `lobby.levelUp` | 레벨 업! | Level up! |

### 12.4 `room`
| Key | ko | en |
|---|---|---|
| `room.create` | 방 만들기 | Create room |
| `room.join` | 코드로 참가 | Join with code |
| `room.code` | 방 코드 | Room code |
| `room.copyCode` | 코드 복사 | Copy code |
| `room.hideCode` | 코드 숨기기 | Hide code |
| `room.ready` | 레디 | Ready |
| `room.notReady` | 레디 취소 | Unready |
| `room.start` | 게임 시작 | Start race |
| `room.autoStart` | {s}초 후 자동 시작 | Auto-start in {s} s |
| `room.host` | 방장 | Host |
| `room.kick` | 강퇴 | Kick |
| `room.openSlot` | 슬롯 열기 | Open slot |
| `room.closeSlot` | 슬롯 닫기 | Close slot |
| `room.addBot` | AI 추가 | Add AI |
| `room.team.red` | 레드 팀 | Red team |
| `room.team.blue` | 블루 팀 | Blue team |
| `room.team.green` | 그린 팀 | Green team |
| `room.team.yellow` | 옐로 팀 | Yellow team |
| `room.settings.track` | 트랙 | Track |
| `room.settings.roulette` | 트랙 룰렛 | Track Roulette |
| `room.settings.laps` | 바퀴 수 | Laps |
| `room.settings.lapsAuto` | 자동 | Auto |
| `room.settings.retire` | 리타이어 타이머 | Retire timer |
| `room.settings.itemSet` | 아이템 구성 | Item set |
| `room.settings.itemSet.standard` | 기본 | Standard |
| `room.settings.itemSet.light` | 공격 약하게 | Attack-light |
| `room.settings.itemSet.chaos` | 대혼란 | Chaos |
| `room.settings.friendlyFire` | 팀 공격 | Friendly fire |
| `room.settings.rubberBand` | AI 보정 | AI catch-up |
| `room.rouletteVote` | 달리고 싶은 트랙을 골라 주세요 ({s}초) | Nominate a track ({s} s) |
| `room.chatPlaceholder` | 메시지를 입력하세요 | Type a message |

### 12.5 `garage`
| Key | ko | en |
|---|---|---|
| `garage.character` | 캐릭터 | Character |
| `garage.kart` | 카트 | Kart |
| `garage.livery` | 도색 | Livery |
| `garage.palette` | 팔레트 | Palette |
| `garage.emotes` | 감정표현 | Emotes |
| `garage.equip` | 장착 | Equip |
| `garage.equipped` | 장착 중 | Equipped |
| `garage.locked` | 레벨 {n}에 해금 | Unlocks at Lv.{n} |
| `garage.buy` | {price} 스파크로 구매 | Buy for {price} Sparks |
| `garage.notEnough` | 스파크가 부족합니다 | Not enough Sparks |
| `garage.archetype.speed` | 속도형 | Speed |
| `garage.archetype.balance` | 밸런스형 | Balance |
| `garage.archetype.drift` | 드리프트형 | Drift |
| `garage.stat.topSpeed` | 최고 속도 | Top speed |
| `garage.stat.accel` | 가속 | Acceleration |
| `garage.stat.drift` | 드리프트 | Drift |
| `garage.stat.gauge` | 게이지 충전 | Gauge charge |
| `garage.stat.weight` | 무게 | Weight |
| `garage.plate` | 번호판 | Plate |
| `garage.flame` | 부스터 불꽃 | Boost flame |

### 12.6 `results`
| Key | ko | en |
|---|---|---|
| `results.title` | 결과 | Results |
| `results.win` | 승리! | WIN! |
| `results.lose` | 패배 | LOSE |
| `results.rank` | {rank}위 | {rank} |
| `results.time` | 기록 | Time |
| `results.bestLap` | 베스트 랩 | Best lap |
| `results.points` | 팀 점수 | Team points |
| `results.retired` | 리타이어 | RETIRE |
| `results.xp` | 경험치 +{n} | +{n} XP |
| `results.sparks` | 스파크 +{n} | +{n} Sparks |
| `results.levelUp` | 레벨 {n} 달성! | Reached Lv.{n}! |
| `results.unlocked` | 새로 해금: {name} | Unlocked: {name} |
| `results.challenge` | 도전 과제 진행 | Challenge progress |
| `results.personalBest` | 개인 최고 기록! | Personal best! |
| `results.again` | 다시 하기 | Race again |
| `results.toRoom` | 방으로 | Back to room |
| `results.toLobby` | 로비로 | Lobby |
| `results.leave` | 나가기 | Leave |
| `results.autoReturn` | {s}초 후 이동합니다 | Continuing in {s} s |
| `results.attacks` | 공격 {landed} / 방어 {blocked} | Attacks {landed} / Blocks {blocked} |

### 12.7 `settings`
| Key | ko | en |
|---|---|---|
| `settings.graphics` | 그래픽 | Graphics |
| `settings.quality` | 품질 | Quality |
| `settings.quality.auto` | 자동 | Auto |
| `settings.quality.low` | 낮음 | Low |
| `settings.quality.medium` | 중간 | Medium |
| `settings.quality.high` | 높음 | High |
| `settings.quality.ultra` | 최고 | Ultra |
| `settings.backend` | 렌더러 | Renderer |
| `settings.fpsCap` | 프레임 제한 | Frame cap |
| `settings.audio` | 오디오 | Audio |
| `settings.volume.master` | 전체 음량 | Master |
| `settings.volume.music` | 배경음악 | Music |
| `settings.volume.sfx` | 효과음 | Sound effects |
| `settings.volume.engine` | 엔진 소리 | Engine |
| `settings.volume.ui` | 인터페이스 | Interface |
| `settings.controls` | 조작 | Controls |
| `settings.rebind` | 키 변경 | Rebind |
| `settings.pressKey` | 새 키를 누르세요 | Press a new key |
| `settings.conflict` | {key}는 이미 '{action}'에 쓰이고 있습니다 | {key} is already used for "{action}" |
| `settings.resetDefaults` | 기본값으로 | Reset to defaults |
| `settings.gamepadHint` | 패드 버튼을 눌러 연결하세요 | Press a pad button to connect |
| `settings.autoBoost` | 부스터 자동 사용 | Auto-fire boosters |
| `settings.instantHint` | 순간 부스터 힌트 | Instant-boost hint |
| `settings.hudScale` | HUD 크기 | HUD scale |
| `settings.colorBlind` | 색각 보정 게이지 | Colour-blind gauges |
| `settings.reducedMotion` | 화면 효과 줄이기 | Reduced motion |
| `settings.language` | 언어 | Language |
| `settings.exportSave` | 저장 내보내기 | Export save |
| `settings.importSave` | 저장 가져오기 | Import save |
| `settings.about` | 정보 | About |

### 12.8 `errors`
| Key | ko | en |
|---|---|---|
| `errors.version_mismatch` | 게임 버전이 다릅니다. 새로고침해 주세요. | Version mismatch. Please reload. |
| `errors.server_full` | 서버가 가득 찼습니다. 잠시 후 다시 시도해 주세요. | The server is full. Try again soon. |
| `errors.room_full` | 방이 가득 찼습니다. | The room is full. |
| `errors.room_not_found` | 방을 찾을 수 없습니다. | Room not found. |
| `errors.bad_code` | 방 코드가 올바르지 않습니다. | That room code is not valid. |
| `errors.not_host` | 방장만 할 수 있습니다. | Only the host can do that. |
| `errors.not_ready` | 모든 레이서가 레디해야 합니다. | Everyone must be ready. |
| `errors.in_race` | 레이스가 진행 중입니다. | A race is in progress. |
| `errors.rate_limited` | 요청이 너무 많습니다. | Too many requests. |
| `errors.name_invalid` | 사용할 수 없는 이름입니다. | That name can't be used. |
| `errors.chat_filtered` | 메시지가 필터링되었습니다. | Message filtered. |
| `errors.kicked` | 방에서 강퇴되었습니다. | You were removed from the room. |
| `errors.track_hash_mismatch` | 트랙 데이터가 다릅니다. 새로고침해 주세요. | Track data mismatch. Please reload. |
| `errors.resume_expired` | 재접속 시간이 지났습니다. | The reconnect window has expired. |
| `errors.slow_consumer` | 연결이 너무 느립니다. | Your connection is too slow. |
| `errors.connection_lost` | 서버와 연결이 끊겼습니다. | Connection to the server was lost. |
| `errors.webgl_unavailable` | 이 브라우저에서 3D 그래픽을 사용할 수 없습니다. | 3D graphics are not available in this browser. |
| `errors.save_corrupt` | 저장 데이터를 읽을 수 없습니다. | The save data could not be read. |
| `errors.ghost_outdated` | 고스트가 이전 버전이라 삭제되었습니다. | Your ghost was from an older version and was removed. |
| `errors.audio_blocked` | 소리를 켜려면 화면을 클릭하세요. | Click to enable sound. |

Other namespaces (owned by other lanes): `items` (`12-items-spec.md` §10), `tracks.<id>` and `themes.<id>` (world lanes; names from `11-track-spec.md` §12), `chars`, `karts` (L8; names in `30-art-bible.md` §8–§9), `net`.

Key count in this document: 29 `common` + 44 `hud` + 19 `lobby` + 31 `room` + 20 `garage` + 20 `results` + 30 `settings` + 20 `errors` = **213 keys**. Tips `common.tip.4` … `common.tip.10` follow the list in §10 and are written by L10.
