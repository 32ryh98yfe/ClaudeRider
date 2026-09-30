# 00 — ClaudeRider overview

**Status keys** (same as `01-decisions.md`): **[S]** sourced · **[V]** validated by the gap-2 headless sim · **[P]** proposed design value.
**Time:** every duration is an integer number of ticks at 60 Hz, with seconds in parentheses. 1 tick = 16.667 ms.
**Authority:** `01-decisions.md` (ADR-001 … ADR-014) wins over every other document, including this one. `02-contracts.md` owns the code contracts (B1–B12), milestones and thresholds.

---

## 1. Vision

ClaudeRider is an unofficial, non-commercial browser kart racer that recreates the *feel* of KartRider: Drift (KRD): short, tense 8-racer races on bright toy-like tracks, where a well-timed drift, an instant boost off the corner exit and a booster fired onto the straight decide the race. The racers are original Clawd mascot variations built from a rounded voxel block with eye slots and no mouth.

One sentence: **"KRD's drift, in a browser tab, with Clawd."**

| Question | Answer |
|---|---|
| Platform | Desktop browsers first (Chromium, Firefox, Safari 26). WebGPU with an automatic WebGL2 fallback (ADR-002). Keyboard and standard gamepad. |
| Session length | One race is 100–130 s in speed mode (ADR-006), plus 12 s of results (ADR-008). A room loop is about 2.5 min per race. |
| Players | 8 karts per race. Humans online; AI fills every empty slot. Fully playable offline against 7 bots. |
| Business model | None. No monetization, no premium currency, no ads (ADR-011, R17). |
| Legal | Disclaimer on the title screen and in Settings → About: "비공식 비상업 팬 프로젝트입니다. Anthropic 및 Nexon과 제휴·후원 관계가 없습니다. / Unofficial non-commercial fan project; not affiliated with or endorsed by Anthropic or Nexon." No Nexon names, tracks, characters, items, fonts, audio or icons. The exact Claude logo path is never used; an original parametric sparkle replaces it. |

---

## 2. Pillars

Every feature, tuning value and art decision is judged against these four pillars, in this order.

| # | Pillar | What it means | How we check it |
|---|---|---|---|
| 1 | **Feel** (손맛) | The drift is slidey but precise and ends only through counter-steer or angle decay. Tiny timing windows reward skill: start boost (7-tick PERFECT window), instant boost (30-tick window). Momentum is kept: overspeed after a boost bleeds off at 0.9 s⁻¹. Walls punish head-on hits and allow grinding. | The gap-2 physics tables reproduced by `pnpm test:physics` (`10-sim-spec.md` §14). The simulation is deterministic and runs at a fixed 60 Hz everywhere. |
| 2 | **Readability** | At 240 km/h a player understands the situation in one glance: rank, gauge, item slots, the incoming threat and the corner ahead. Standard pad colours on every theme, chevrons on every tight corner, one warning language for every attack. | HUD layout from the KRD teardown (`31-ui-spec.md`); readability rules in `30-art-bible.md` §9; screenshot contact sheets reviewed at 1280×720. |
| 3 | **Charm** | Vinyl-toy Clawd mascots with expressive eye decals, cheerful procedural music, bouncy UI motion, emotes on podiums, 10 themed worlds with their own palette and song. | Art bible per theme; character lineup sheets; audio unit tests; Korean copy review. |
| 4 | **Fairness** | Same physics for everyone. Karts differ by at most ±2% lap time. AI never gets a speed multiplier above 1.00. Items are server-decided with a secret key; hits are resolved on the victim's own timeline. | Archetype spread test; AI tier pace test; SimLink net matrix M1–M12 (`20-netcode-spec.md`). |

---

## 3. Feature list and priorities

Priorities follow risk R11 in `02-contracts.md`: **P0** ships in v1 and is never cut; **P1** ships in v1 if C2 is on time; **P2** is cut first.

### 3.1 Modes and meta

| Feature | Priority | Spec |
|---|---|---|
| Solo Speed (스피드전 개인전) | P0 | `13-modes-rules.md` §2 |
| Solo Item (아이템전 개인전) | P0 | `13-modes-rules.md` §2, `12-items-spec.md` |
| Quick Race vs AI (offline, instant, 7 bots) | P0 | `13-modes-rules.md` §5 |
| Time Attack with a local ghost | P0 | `13-modes-rules.md` §4 |
| Online Quick Match (20 s search + 15 s matching stage + AI fill) | P0 | `13-modes-rules.md` §6, `20-netcode-spec.md` §4 |
| Online Custom Room (6-character code, host settings, Track Roulette) | P0 | `13-modes-rules.md` §7 |
| Team Speed and Team Item, Squad (2×4) | P1 | `13-modes-rules.md` §1–§2 |
| Team formats Duo (4×2) | P1 | same |
| Team booster (shared team gauge) | P1 | `10-sim-spec.md` §8.3 |
| Infinite Boost (무한부스터) | P2 | `13-modes-rules.md` §2.4 |
| Progression: Racer Level 1–50, Sparks, unlocks | P0 | `13-modes-rules.md` §10 |
| Daily (3) and weekly (5) challenges | P1 | `13-modes-rules.md` §11 |
| Mid-race surprise challenge | P2 | `13-modes-rules.md` §11.3 |
| Tutorial on Proving Ring (off-roster 5×700 m oval) | P1 | `11-track-spec.md` §12.21 |

### 3.2 Content

| Content | Count | Priority | Spec |
|---|---|---|---|
| Tracks | 20 roster tracks in 10 themes, plus Proving Ring | P0 | `11-track-spec.md` §12 |
| Characters | 12 Clawd variations | P0 | `30-art-bible.md` §7–§8 |
| Kart bodies | 8 in 3 archetypes | P0 | `30-art-bible.md` §9, `10-sim-spec.md` §3 |
| Items | 15 core + 3 team-only | P0 (Lens, Mutex Lock: P2) | `12-items-spec.md` |
| Songs | 11 (lobby + 10 themes) plus jingles | P0 (adaptive layers P1) | `32-audio-spec.md` |
| SFX | ≥ 60 synthesized ids | P0 | `32-audio-spec.md` §4 |
| Codex art overrides | about 110 2D slots, all with procedural fallbacks | P1 | `60-codex-pipeline.md` |

### 3.3 Tech and presentation

| Feature | Priority | Spec |
|---|---|---|
| WebGPURenderer + TSL, auto fallback to WebGL2, persisted backend | P0 | ADR-002, `40-perf-budgets.md` |
| Quality tiers Low / Medium / High | P0 | `40-perf-budgets.md` §1 |
| Ultra tier (TRAA, DoF) | P2 | same |
| Full-world prediction, rollback, Scheduled Conditional Effects | P0 | `20-netcode-spec.md` |
| Reconnect within 60 s with AI takeover | P0 | `20-netcode-spec.md` §10 |
| Rear-view mirror (hold X) | P2 | `31-ui-spec.md` §7.1 |
| Korean (default) and English UI | P0 | `31-ui-spec.md` §12 |
| Key rebinding, gamepad, HUD scale 80–120%, colour-blind gauges, reduced motion | P0 (colour-blind, reduced motion: P1) | `31-ui-spec.md` §7–§9 |

### 3.4 Explicitly out of scope for v1
Ranked play, Flag mode, Crossover, License tests, global leaderboards, spectator slots, P2P host mode, WebTransport, split-screen, character skills, paid anything. Deferred netcode items from ADR-007: shield late-input rescue re-simulation (v1 refunds instead), adaptive SCE lead, dual-timeline aim validation.

---

## 4. The race loop at a glance

| Step | Ticks | Seconds | Notes |
|---|---|---|---|
| Loading (bake assets streamed, `compileAsync`) | — | ≤ 8 s target to lobby, track load separate | `40-perf-budgets.md` §6 |
| Intro flyover (`PRE`) | 240 | 4.0 | Skippable offline (ADR-008) |
| Grid shot (`PRE`) | 90 | 1.5 | Name tags, "3-2-1" not yet shown |
| Countdown 3 · 2 · 1 (`COUNTDOWN`) | 180 | 3.0 | 60 ticks per beat; start-boost window around GO |
| Racing (`RACING`) | ≈ 6000–7800 | 100–130 (speed) | Laps = clamp(round(115/refLapSec), 1, 5) |
| Retire timer (`RETIRE_TIMER`) | 600 | 10.0 | Starts at the first finish (ADR-008) |
| Results | 720 | 12.0 | Then back to the room |

---

## 5. Package map (short)

| Path | Role | May import |
|---|---|---|
| `packages/content` | Data only: ids (`ids.ts`, append-only), schemas, one file per item, effect, kart, character, theme, track manifest entry, challenge; drop tables; surfaces; mode rules | nothing |
| `packages/sim` | Deterministic core: `step()`, world state and quantization, `.ctrk` runtime (TriHash, `locate`), kart dynamics, race rules, items, rubber-band, AI (`ai/**` may use trig) | content |
| `packages/trackc` | Node-only track compiler: DSL → turtle → CLOSE solver → frames → meshes → TriHash → `.ctrk` / `.vis` / `.meta.json`; validators V1–V20; AI bake; ghost laps | sim, content, three (geometry), three-mesh-bvh (AO), polygon-clipping |
| `packages/net` | Binary protocol codecs, `NetClient` (clock sync, run-ahead, rollback, smoothing, dedupe), `SimLink` harness | sim, content |
| `packages/room` | `RaceRoom`, the authority. Same class in the Node server and the offline Worker | sim, net, content |
| `apps/server` | Node `ws` server: lobby, matchmaker, rooms, codes, static files, `/health`, `/art/overrides/index.json` | room, net, sim, content |
| `apps/client` | Vite + Preact + signals UI, three r186 WebGPURenderer/TSL renderer, Web Audio + Tone, input, meta/save, art loader | content, sim, net, room (Worker only), three, preact, tone |
| `tracks/<themeId>/<trackId>.ctd` | Track DSL sources; `tracks/golden.json` content hashes | — |
| `art/codex/` | Codex prompt pack (manifest, style guide, prompts, generated refs) | — |
| `tools/`, `e2e/` | Registries generator, frozen-file check, dep check, shots, bench, balance, Playwright specs | anything |

---

## 6. Design documents

| File | Topic |
|---|---|
| `01-decisions.md` | ADR log and canonical constants (source of truth) |
| `02-contracts.md` | Architecture, interface contracts B1–B12, milestones, lanes, risks, verification thresholds |
| `10-sim-spec.md` | Kart simulation, tick order, formulas, race flow, physics acceptance tests |
| `11-track-spec.md` | Track DSL, schema, `.ctrk`/`.vis`, validators, the 20-track roster |
| `12-items-spec.md` | 18 items, 20 effects, drop tables, boxes, status rules, SCE timelines |
| `13-modes-rules.md` | Modes, scoring, rooms, results, progression, challenges, unlocks |
| `14-ai-spec.md` | AI tiers, driver, avoidance, items, rubber-band, personalities |
| `20-netcode-spec.md` | Protocol bytes, lobby JSON, room FSM, prediction, rollback, SimLink matrix |
| `30-art-bible.md` | Visual pillars, palettes, lighting, materials, characters, karts, VFX, camera |
| `31-ui-spec.md` | Screens, HUD, tokens, typography, motion, input, settings, strings |
| `32-audio-spec.md` | Buses, engine synth, SFX list, music, adaptive rules |
| `40-perf-budgets.md` | Quality tiers, render/CPU/bundle budgets, BudgetTracker |
| `50-test-plan.md` | Test suites, commands, thresholds |
| `60-codex-pipeline.md` | Codex 2D art slots, prompts, drop-in overrides, fallbacks |

---

## 7. Glossary (KR terms)

These are the words players, designers and the UI use. Korean terms are generic racing words and safe to use; Nexon product names are not (see ADR-011).

| Korean | Romanization | English in UI | Plain-language explanation | Where specified |
|---|---|---|---|---|
| 스피드전 | seupideujeon | Speed Race | The mode without items. Drifting fills the boost gauge; a full gauge gives a booster you fire with the item key. | `13-modes-rules.md` §2.1 |
| 아이템전 | aitemjeon | Item Race | The mode with item boxes and no drift gauge. Two item slots. | `13-modes-rules.md` §2.2 |
| 개인전 / 팀전 | gaeinjeon / timjeon | Solo / Team | Every racer for themself, or teams of 2 (Duo) or 4 (Squad). | `13-modes-rules.md` §1 |
| 드리프트 | deuripeuteu | Drift | Press the drift key while steering at 10 m/s or more: the kart kicks sideways and slides. Releasing the key does **not** end it; counter-steering or losing slip angle does. | `10-sim-spec.md` §6 |
| 숏 드리프트 | syot deuripeuteu | Short drift | A light tap of the drift key: a small re-aim that tops off the gauge. Shorter than 15 ticks (0.25 s), so no instant boost follows. | `10-sim-spec.md` §6.5 |
| 풀 드리프트 | pul deuripeuteu | Full drift | A drift that lasts at least 15 ticks (0.25 s) with at least 8° peak slip. Only a full drift opens the instant-boost window. | `10-sim-spec.md` §6.5 |
| 최적화 드리프트 | choejeokhwa deuripeuteu | Optimized drift | The shallowest drift that still makes the corner: tap, then counter-steer early. Loses the least speed (4–7% on a 90° corner). | `10-sim-spec.md` §14.6 |
| 더블 드리프트 (투드립) | deobeul deuripeuteu | Double drift | A second drift press while already drifting (after ≥ 9 ticks). Adds yaw and heading for U-turns and hairpins. | `10-sim-spec.md` §6.2 |
| 끌기 (드리프트 끌기, 톡톡이) | kkeulgi | Drag drift | Holding a shallow drift along a long corner, tapping steer in and out, so the slide carries speed instead of scrubbing it. It works because drift lateral damping returns 80% of scrubbed speed forward. | `10-sim-spec.md` §6.6 |
| 커팅 | keoting | Cut | Right after a drift, a quick opposite drift tap that snaps the kart straight and ends the slide early, cutting drift drag. | `10-sim-spec.md` §6.6 |
| 순간 부스터 (순부) | sungan buseuteo | Instant boost | After a full drift ends, release and re-press the throttle within 30 ticks (0.5 s) for a 30-tick burst (≥ 9 m/s², up to 35.7 m/s). | `10-sim-spec.md` §7.4 |
| 부스터 | buseuteo | Booster | A 180-tick (3.0 s) boost to 44.4 m/s (240 km/h shown). Up to 2 stored. | `10-sim-spec.md` §7.2 |
| 게이지 | geiji | Gauge | The drift gauge. It fills from drifting (more slip and more speed fill faster, long drifts tire it) and turns into a booster when full. | `10-sim-spec.md` §8 |
| 팀 부스터 | tim buseuteo | Team booster | Team speed: all teammates' drift gains fill a shared gauge; when it is full every teammate gets a blue 270-tick (4.5 s) booster. | `10-sim-spec.md` §8.3 |
| 스타트 부스터 (출발 부스터) | seutateu buseuteo | Start boost | Pressing the throttle at GO. PERFECT is 0 to +6 ticks after GO and gives a 90-tick boost. Pressing earlier than −12 ticks is a false start (18 ticks of wheelspin). | `10-sim-spec.md` §7.1 |
| 드래프트 | deuraepeuteu | Draft | Slipstream. Stay 4–22 m behind another kart for 120 ticks (2.0 s) and you get 90 ticks (1.5 s) of extra pull to 35.7 m/s. | `10-sim-spec.md` §7.5 |
| 벽 비비기 | byeok bibigi | Wall grind | Touching a wall at less than 15°: you slide along it with light friction and keep your drift. | `10-sim-spec.md` §10.4 |
| 몸싸움 | momssaum | Bumping | Kart-to-kart contact: soft sphere impulses, heavier karts push harder, boosting karts count as 1.5× heavier. | `10-sim-spec.md` §11 |
| 탄력 | tallyeok | Momentum | Speed carried above grip top speed after a boost; it decays slowly (0.9 s⁻¹), so chaining boosts and drifts keeps you fast. | `10-sim-spec.md` §7.3 |
| 역주행 | yeokjuhaeng | Wrong way | Driving against the track direction (> 110° off the tangent) for 72 ticks shows "역주행! R: 코스 복귀". | `10-sim-spec.md` §12.4 |
| 코스 복귀 (리셋) | koseu bokgwi | Back to course / Reset | Press R to be placed back on the centreline. Costs about 2.5–3 s, keeps boosters and items, cancels the active boost. | `10-sim-spec.md` §12 |
| 리타이어 | ritaieo | Retire | Not finishing within 600 ticks (10 s) after the first racer finishes. A retired racer scores 0 team points. | `13-modes-rules.md` §3 |
| 원투 | wontu | One-two | In team speed, taking 1st and 2nd. It wins even if both teammates retire (18 vs 18, the tie goes to the team with 1st). | `13-modes-rules.md` §2.3 |
| 아이템 박스 (큐브) | aitem bakseu | Item box | A floating box that grants a random item after a 30-tick roulette. Boxes are personal: breaking one does not deny it to others. | `12-items-spec.md` §5 |
| 룰렛 | rullet | Roulette | The 30-tick (0.5 s) spin in the HUD slot before the new item is usable. | `12-items-spec.md` §5.3 |
| 실드 | sildeu | Shield | Context Shield: absorbs one hit within 180 ticks. Does not stop Throttle Drone or Attention Tether. | `12-items-spec.md` §2.2.14 |
| 탈출 (연타) | talchul (yeonta) | Mash out | Alternating left/right taps shorten a trap by 7 ticks each; escaping gives a 30-tick escape boost. | `12-items-spec.md` §6.4 |
| 무한부스터 | muhan buseuteo | Infinite Boost | A P2 mode: the gauge fills by itself (0.45 per second) even while boosting. | `13-modes-rules.md` §2.4 |
| 타임어택 | taim eotaek | Time Attack | Solo against the clock and your own ghost. | `13-modes-rules.md` §4 |
| 빠른 매칭 | ppareun maeching | Quick Match | Online queue: 20 s search, 15 s matching stage, then AI fills empty slots. | `13-modes-rules.md` §6 |
| 커스텀 룸 (방) | keoseutom rum | Custom Room | A room with a 6-character code whose host picks mode, track, laps and rules. | `13-modes-rules.md` §7 |
| 방장 | bangjang | Host | The room owner. Host migration goes to the human who joined earliest. | `13-modes-rules.md` §7.4 |
| 레디 | redi | Ready | Room ready state. A full room with everyone ready auto-starts after 10 s. | `13-modes-rules.md` §7.3 |
| 트랙 룰렛 | teuraek rullet | Track Roulette | A 20 s vote where every player nominates a track and one nomination is drawn. | `13-modes-rules.md` §7.2 |
| 스파크 | seupakeu | Sparks | ClaudeRider's only currency, earned by racing, spent on cosmetics. | `13-modes-rules.md` §10.3 |
| 라이더 레벨 | raideo rebel | Racer Level | Account level 1–50 from XP; levels unlock characters, karts and liveries. | `13-modes-rules.md` §10 |
| 난이도 | nanido | Difficulty | Track difficulty 1–5 (D1–D5), shown as stars. | `11-track-spec.md` §6 |
| 지름길 | jireumgil | Shortcut | A branch path mapped onto the main line's progress; narrower (7–9 m) and usually riskier. | `11-track-spec.md` §8.7 |
| 레일 | reil | Rail | A captured section where the kart locks to a guide at 38–42 m/s and fills its gauge. | `10-sim-spec.md` §13.3 |
| 워프 | wopeu | Warp | A gate that transports the kart to another point, keeping its speed. | `10-sim-spec.md` §13.4 |
| 하프파이프 | hapeupaipeu | Halfpipe | A U-shaped road section with walls up to 60° you can drive on. | `11-track-spec.md` §5.1, §12.5 |
