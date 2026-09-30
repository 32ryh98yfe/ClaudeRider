# 13 — Modes, rules and progression

Owner: L1 SIM (race rules in `sim/src/race/rules.ts`), L9 NET (lobby, rooms, matchmaker), L10 UI+META (screens, progression, challenges, save).
Sources: ADR-008 (modes and rules), ADR-009 (AI tiers), `02-modes-rules.md` §2–§9, `packages/content/src/{modes,characters,karts}` (current data).
Status keys: **[S]** sourced · **[P]** proposed. Ticks at 60 Hz; seconds in parentheses. Lobby timers are wall-clock seconds (they run outside the sim).

---

## 1. Mode catalogue (ADR-008)
| Mode | `ModeId` | Formats (`TeamFormat`) | Win condition | Priority |
|---|---|---|---|---|
| Speed Race 스피드전 | `speed` | solo, duo, squad | Solo: finish order. Team: highest points sum | P0 solo, P1 team |
| Item Race 아이템전 | `item` | solo, duo, squad | Solo: finish order. Team: **team of the first finisher** [S] | P0 solo, P1 team |
| Infinite Boost 무한부스터 | `infinite` | solo, duo, squad | Same as Speed | P2 |
| Time Attack 타임어택 | `timeAttack` | solo (1 kart) | Personal best | P0 |
| Quick Race vs AI (offline) | speed / item | solo (P1: team with bots) | as the mode | P0 |
| Online Quick Match | speed / item | solo, duo, squad | as the mode | P0 solo, P1 team |
| Online Custom Room | speed / item / infinite | solo, duo, squad | as the mode | P0 |
- 8 karts per race [S]. Duo = 4 teams × 2; Squad = 2 teams × 4 [S].
- Team colours: Squad red vs blue; Duo red, blue, green, yellow (name-plate colours, `31-ui-spec.md` §4.6).

---

## 2. Mode rules

### 2.1 Speed Race
- Drift gauge on, boosters stored in 2 slots, USE_ITEM fires a booster; holding the key auto-fires if "부스터 자동 사용" is enabled in Settings (sends `Held.ITEM`) [S].
- Start boosts full length (90/60/36 ticks). No item boxes.
- Team speed: team gauge and team booster (`10-sim-spec.md` §8.3).

### 2.2 Item Race
- Gauge off; item boxes active; 2 item slots (`12-items-spec.md`).
- Start boosts ×0.67 (60/40/24 ticks). Instant boost after drifts stays on (`rules.instantBoostInItem`, default true) [P]; the escape boost after traps is always on.
- Team item: first finisher's team wins; friendly fire default `area` (bomb, firewall, puddle hit teammates).

### 2.3 Team scoring (ADR-008)
| Rank | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | Retire |
|---|---|---|---|---|---|---|---|---|---|
| Points | 10 | 8 | 6 | 5 | 4 | 3 | 2 | 1 | 0 |
- Total 39 (odd), so a full Squad race without retirements cannot tie; a win needs ≥ 20 [S-derived].
- **Tie-break**: the team holding the single best placement wins [S]. Example: a one-two (원투) with both teammates retired is 18 vs 18 and wins.
- Duo uses the same table across 4 teams and the same tie-break.
- Team item: the first finisher's team wins even if all its teammates retire; other teams are ordered by their own best finisher.
- Optional "Combo" rule (custom rooms, P2): +10 for adjacent same-team 1-2, +8 for 2-3, +6 for 3-4, +4 for 4-5, +2 for 5-6.

### 2.4 Infinite Boost (P2)
- Speed rules plus: gauge auto-fill +0.45 per second (`+0.0075` per tick), which continues while boosting; start, instant and draft bonus charges doubled (`10-sim-spec.md` §8.2); holding the item key auto-fires.
- Team infinite: team points; team gauge on.

---

## 3. Race rules (ADR-008, `10-sim-spec.md` §12)
| Rule | Value |
|---|---|
| Start sequence | Intro flyover 240 ticks (4.0 s; skippable offline) → grid shot 90 ticks (1.5 s) → countdown 3·2·1·GO at 60 ticks per beat |
| Grid | 4 rows × 2, pitch 6 m, stagger 3 m, ±4 m; first race of a room: random order from the seed; later races: reverse of the previous results |
| Laps | `clamp(round(115/refLapSec), 1, 5)`; custom rooms may override 1–5. Item races use the same laps (race 121–136 s) [P: the 02-modes "item laps − 1" rule is not adopted because the gap-3 table already keeps item races ≤ 136 s] |
| Retire timer | 600 ticks (10 s) after the first finish [S]; rooms: 300 / 600 / 900 / 1200 ticks (5/10/15/20 s). A dedicated music sting and a big 10→0 count play |
| Retired racers | ordered by progress after all finishers; 0 team points; labelled "RETIRE" |
| Hard cap | `max(3·laps·refLapSec, 240 s)`; on expiry everyone unfinished retires, ordered by progress |
| Finish timing | server tick + sub-tick crossing fraction, shown to 1 ms (`m:ss.mmm`); identical ms share a rank [S] |
| Reset | R, rules in `10-sim-spec.md` §12.5; no time penalty; ≈ 2.5–3 s cost [S] |
| Wrong way | 역주행 banner after 72 ticks; auto-respawn after 240 ticks |
| Disconnect | AI takes over after 180 ticks (3 s); reconnect within 60 s returns control (ADR-007). An AI-driven kart that finishes scores normally (casual); one that doesn't retires |
| In-race chat | shown only to racers who have finished [S]; quick chat has 8 slots [P]; emotes allowed while racing (Edge.EMOTE) |

---

## 4. Time Attack (P0)
| Rule | Value |
|---|---|
| Rules | speed mode, 1 kart, no items, no bots, no rubber-band, no retire timer; hard cap applies |
| Laps | the track's `laps`; each lap timed; best lap and best race stored per track (`SaveV1.records`) |
| Ghost | the player's PB race, stored as an input log (`packInput` per tick + `RaceConfig` + `simVersion` + `trackHash`) in IndexedDB under `ghost:<trackId>` (`records[trackId].ghostKey`). Replay = re-simulate a second world with the same inputs (deterministic) and render it as a translucent kart; no collisions |
| Ghost validity | a ghost is dropped (with a toast) if `simVersion` or `trackHash` changed |
| Splits | at each key gate: delta vs PB (green −, red +) under the lap timer |
| Intro | skippable; quick restart with `Backspace` / gamepad `Back` (restart from the grid, 0.5 s fade) [P] |
| Reference ghost (P1) | the bake-time Pro ghost (`ghostLap`) can be shown as "Pro Ghost" |
| Rewards | 30 XP per completed run, +5 per new PB lap, +50 per new PB race [P] |

---

## 5. Quick Race vs AI (offline, P0)
- Starts instantly with 7 bots in the offline Worker authority (`RaceRoom` + `WorkerTransport`, zero latency).
- Player picks: mode (speed / item), track (fixed or random), bot tier (Rookie / Racer / Pro / Legend; default Racer), laps (Auto default). Team formats with bots are P1.
- Bot identities: names and characters per `14-ai-spec.md` §9; each bot uses its character's personality.
- Rubber-band on (ADR-009 rules; off for Legend).
- Rewards: full XP and Sparks (§10) — offline progression is intended.

---

## 6. Online Quick Match (ADR-008)
| Stage | Duration | What happens |
|---|---|---|
| Queue | — | Player chooses mode (speed / item) and format (solo; duo/squad P1). One queue per mode × format. |
| Search | 20 s | Humans in the same queue are grouped into one pending room (fullest first). The UI shows `{humans}/8`. Early exit when 8 humans are present. |
| Matching stage | 15 s | Track revealed; loadout (character, kart, livery) can change; quick chat; team colours shown. |
| AI fill | at stage end | Empty slots filled with AI, no vote (casual). Tier = nearest to the lobby's average human skill estimate [P below]. |
| Race | — | `raceStart` with `startTick`; loading ≤ 15 s (players not loaded by then start as AI-driven and take over when loaded) |
| Results | 12 s | then back to a fresh queue screen ("다시 찾기" / "Search again") |
- **Skill estimate** [P]: each client keeps a local rating = moving average of finishing position over the last 10 races (vs field size). Mapped to tiers: new players (Racer Level < 5) → Rookie; average rank ≥ 5.5 → Rookie; 3.5–5.5 → Racer; < 3.5 → Pro. Legend is never used in Quick Match.
- **Track choice** [P]: random from the roster; item queues prefer item★ and both-mode tracks at D1–D3 (80% of picks); the last 3 tracks of this lobby are excluded.
- **Team balancing**: humans split as evenly as possible, AI fills the rest; Squad alternates red/blue by join order; Duo keeps parties together, otherwise pairs by join order.

---

## 7. Custom Room (ADR-008)

### 7.1 Codes and slots
- 6-character code from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I) [S]; the host can hide the code (join by invite link only).
- 8 racer slots; each slot is open, closed, human or bot (with tier). Spectator slots are not in v1.

### 7.2 Host settings (`RoomSettings`)
| Setting | Values | Default |
|---|---|---|
| mode | speed, item, infinite (P2) | speed |
| format | solo, duo, squad | solo |
| track | a specific track · random (all) · random speed-built · random item-built · **Track Roulette** (20 s vote: everyone nominates, one nomination is drawn [S]) | random (all) |
| laps | Auto, 1–5 | Auto |
| retire timer | 5 / 10 / 15 / 20 s (300/600/900/1200 ticks) | 10 s |
| item set | standard / light / chaos (`12-items-spec.md` §8.3) | standard |
| AI slots | 0–7, each with tier rookie / racer / pro / legend | fill empty at start: off |
| friendly fire (team item) | off / area / all | area |
| rubber-band | on / off | on |
| instant boost in item mode | on / off | on |
| hide code | on / off | off |

### 7.3 Start rules [S]
- Every non-host human must press Ready (레디). Once they are all ready, the host may press Start.
- When the room is full (8 occupied slots, bots included) and everyone is ready, the race auto-starts after 10 s.
- At least 1 human is required.
- A 20 s Track Roulette, if chosen, runs between Start and loading.

### 7.4 Host and lifecycle
- Host migration goes to the human who has been in the room longest [ADR-008].
- The host can kick, open/close slots, add bots with a tier, assign teams or shuffle.
- After the race everyone returns to the same room; ready states reset; teams stay [S].
- Chat: lobby text chat with a profanity filter (`apps/server/src/lobby/validate.ts`), 200 characters max, 1 message per second per player.

---

## 8. Results screen (ADR-008: 12 s)
| Element | Content |
|---|---|
| Banner | Solo: "{rank}위!" / "{rank}th"; team: 승리 WIN / 패배 LOSE with team point totals |
| Table | 8 rows: rank, mascot icon, name (AI badge for bots), kart, finish time `m:ss.mmm` or RETIRE, best lap, team points (team modes), attacks landed / blocked (item mode); local row highlighted (coral gradient) |
| Rewards panel | XP bar with level-up flash, Sparks earned, challenge progress ticks, mid-race challenge result, new unlocks |
| Emotes | each racer's win/lose/retire emote plays on the podium (top 3 on the podium, others in a row) |
| Buttons | 레디 / Ready (online room), 방으로 / Room, 나가기 / Leave; offline: 다시 하기 / Race again, 로비 / Lobby |
| Timing | 12 s, then back to the room (online) or stays (offline) |
Results are computed from `RaceResult` (server) or the offline authority; the client never computes placements itself.

---

## 9. Race result record (`RaceResult`, JSON) [P]
```ts
interface RaceResult {
  raceId: string; trackId: TrackId; mode: ModeId; teams: TeamFormat; laps: number; seed: number;
  rows: { slot: number; name: string; bot: boolean; characterId: CharacterId; kartBodyId: KartBodyId; team: number;
          rank: number; finished: boolean; raceMs: number | null; bestLapMs: number | null; points: number;
          stats: { attacksLanded: number; attacksBlocked: number; hitsTaken: number; perfectStart: boolean;
                   instantBoosts: number; boostersUsed: number; driftMeters: number; wallHits: number; respawns: number } }[];
  teamTotals?: { team: number; points: number; won: boolean }[];
  endTick: number; firstFinishTick: number;
}
```

---

## 10. Progression (local save, `SaveV1.progress`) [P from 02-modes §8.10]

### 10.1 XP per race
```
xp = (finished ? 60 : 15)
   + placementBonus[rank]          // [60, 45, 35, 28, 20, 14, 8, 4] for ranks 1–8
   + (teamWon ? 40 : 0)
   + 5 × newPersonalBestLaps
   + challengeXp + midRaceXp
```
- Fields smaller than 8 racers use the first N bonus entries.
- Time Attack: 30 per completed run + 5 per new PB lap + 50 per new PB race.
- Quick Race vs AI and online races earn the same XP.

### 10.2 Levels 1–50
XP needed to go from level L to L + 1 = `100 + 25·(L − 1)`. Cumulative XP to reach level L = `100·(L − 1) + 12.5·(L − 1)·(L − 2)`.
| Level | XP to next | Cumulative | Level | XP to next | Cumulative |
|---|---|---|---|---|---|
| 1 | 100 | 0 | 26 | 725 | 10000 |
| 2 | 125 | 100 | 27 | 750 | 10725 |
| 3 | 150 | 225 | 28 | 775 | 11475 |
| 4 | 175 | 375 | 29 | 800 | 12250 |
| 5 | 200 | 550 | 30 | 825 | 13050 |
| 6 | 225 | 750 | 31 | 850 | 13875 |
| 7 | 250 | 975 | 32 | 875 | 14725 |
| 8 | 275 | 1225 | 33 | 900 | 15600 |
| 9 | 300 | 1500 | 34 | 925 | 16500 |
| 10 | 325 | 1800 | 35 | 950 | 17425 |
| 11 | 350 | 2125 | 36 | 975 | 18375 |
| 12 | 375 | 2475 | 37 | 1000 | 19350 |
| 13 | 400 | 2850 | 38 | 1025 | 20350 |
| 14 | 425 | 3250 | 39 | 1050 | 21375 |
| 15 | 450 | 3675 | 40 | 1075 | 22425 |
| 16 | 475 | 4125 | 41 | 1100 | 23500 |
| 17 | 500 | 4600 | 42 | 1125 | 24600 |
| 18 | 525 | 5100 | 43 | 1150 | 25725 |
| 19 | 550 | 5625 | 44 | 1175 | 26875 |
| 20 | 575 | 6175 | 45 | 1200 | 28050 |
| 21 | 600 | 6750 | 46 | 1225 | 29250 |
| 22 | 625 | 7350 | 47 | 1250 | 30475 |
| 23 | 650 | 7975 | 48 | 1275 | 31725 |
| 24 | 675 | 8625 | 49 | 1300 | 33000 |
| 25 | 700 | 9300 | 50 | — (max) | 34300 |
At level 50 XP keeps accumulating for stats; levels stop.

### 10.3 Sparks (스파크)
- The only currency; earned, never bought. `sparks += floor(0.5 × xp)` per race, plus challenge rewards, plus **50 per level-up** [P].
- Spent on cosmetics only (§12.3). No gameplay stats are for sale (cosmetic-only [S]).

### 10.4 Stats (`progress.stats`, used by challenges and the profile card)
`races`, `finishes`, `wins`, `podiums`, `driftMeters`, `perfectStarts`, `instantBoosts`, `boostersUsed`, `teamBoostersUsed`, `draftActivations`, `attacksLanded`, `attacksBlocked` (your shield absorbed), `hitsTaken`, `trapsEscapedFast`, `itemBoxes`, `teamWins`, `oneTwos`, `timeAttackPBs`, `ghostsBeaten`, `cleanLaps` (no 15°+ wall hit), `overtakes`, `shortcutsTaken`, `railsRidden`, `jumpsLanded`, `respawns`, `racesByTheme.<themeId>`, `racesByMode.<modeId>`.
All derive from local-kart `SimEvent`s (B4) in `meta/progression.ts`; online races use the same events (server-confirmed rank and finish).

---

## 11. Challenges (`packages/content/src/challenges/<id>.ts`, `ChallengeDef`)

### 11.1 Rotation
- **Daily**: 3 challenges, reset at 00:00 local time. **Weekly**: 5 challenges, reset Monday 00:00 local time.
- Selection: deterministic from `hash32(dateKey, profileSeed)` over the pool of each scope; no duplicates within a scope; at most 1 mode-filtered challenge the player cannot play offline (team) per rotation.
- Progress persists in `SaveV1.challenges`; a completed challenge pays once.

### 11.2 Challenge pool (24 definitions)
| id | Scope | Metric | Target | Filter | Reward XP / Sparks | ko | en |
|---|---|---|---|---|---|---|---|
| `daily_finish_3` | daily | finishes | 3 | — | 60 / 40 | 레이스 3회 완주하기 | Finish 3 races |
| `daily_drift_3000` | daily | driftMeters | 3000 | — | 60 / 40 | 드리프트로 3,000m 달리기 | Drift a total of 3,000 m |
| `daily_perfect_2` | daily | perfectStarts | 2 | — | 50 / 35 | 퍼펙트 스타트 2회 성공하기 | Land 2 Perfect start boosts |
| `daily_instant_10` | daily | instantBoosts | 10 | — | 50 / 35 | 순간 부스터 10회 사용하기 | Trigger 10 instant boosts |
| `daily_boosters_15` | daily | boostersUsed | 15 | mode speed | 50 / 35 | 스피드전에서 부스터 15개 사용하기 | Use 15 boosters in Speed races |
| `daily_attacks_5` | daily | attacksLanded | 5 | mode item | 60 / 40 | 아이템전에서 공격 5회 명중시키기 | Land 5 item attacks in Item races |
| `daily_boxes_20` | daily | itemBoxes | 20 | mode item | 40 / 30 | 아이템 박스 20개 열기 | Open 20 item boxes |
| `daily_podium_1` | daily | podiums | 1 | top 3 | 70 / 50 | 3위 안에 들기 | Finish in the top 3 |
| `daily_draft_5` | daily | draftActivations | 5 | — | 50 / 35 | 드래프트 5회 발동하기 | Trigger draft 5 times |
| `daily_clean_2` | daily | cleanLaps | 2 | — | 50 / 35 | 벽에 부딪히지 않고 2바퀴 돌기 | Complete 2 laps without a wall hit |
| `daily_theme_clay` | daily | racesByTheme | 2 | theme clayhill_village | 40 / 30 | 클레이힐 마을 트랙에서 2회 달리기 | Race twice on Clayhill Village tracks |
| `daily_shortcut_3` | daily | shortcutsTaken | 3 | — | 50 / 35 | 지름길 3회 통과하기 | Take 3 shortcuts |
| `weekly_finish_20` | weekly | finishes | 20 | — | 200 / 150 | 레이스 20회 완주하기 | Finish 20 races |
| `weekly_wins_5` | weekly | wins | 5 | — | 250 / 200 | 1위 5회 달성하기 | Win 5 races |
| `weekly_drift_25000` | weekly | driftMeters | 25000 | — | 200 / 150 | 드리프트로 25km 달리기 | Drift a total of 25 km |
| `weekly_attacks_30` | weekly | attacksLanded | 30 | mode item | 220 / 170 | 아이템전에서 공격 30회 명중시키기 | Land 30 item attacks |
| `weekly_blocks_10` | weekly | attacksBlocked | 10 | mode item | 200 / 150 | 실드나 헤일로로 공격 10회 막기 | Block 10 attacks with a shield or halo |
| `weekly_escape_8` | weekly | trapsEscapedFast | 8 | mode item | 180 / 140 | 함정에서 빠른 탈출 8회 하기 | Escape a trap at top speed 8 times |
| `weekly_2lap_top3` | weekly | podiums | 3 | laps 2, top 3 | 220 / 170 | 2바퀴 트랙에서 3위 안에 3회 들기 | Finish top 3 on 2-lap tracks 3 times |
| `weekly_ta_pb_3` | weekly | timeAttackPBs | 3 | mode timeAttack | 200 / 150 | 타임어택 신기록 3회 세우기 | Set 3 Time Attack personal bests |
| `weekly_ghost_3` | weekly | ghostsBeaten | 3 | mode timeAttack | 200 / 150 | 3개 트랙에서 내 고스트 이기기 | Beat your ghost on 3 tracks |
| `weekly_team_win_3` | weekly | teamWins | 3 | — | 250 / 200 | 팀전에서 3회 승리하기 | Win 3 team races |
| `weekly_onetwo_1` | weekly | oneTwos | 1 | mode speed | 250 / 200 | 팀 스피드전에서 원투 달성하기 | Win a Team Speed race with a one-two |
| `weekly_rails_10` | weekly | railsRidden | 10 | — | 180 / 140 | 레일 10회 타기 | Ride 10 rails |

### 11.3 Mid-race surprise challenge (P2)
- Racer Level ≥ 3; 15% chance per race (client-side RNG seeded by `raceId + slot`); offered as a toast when lap 1 begins ("미션!"); must be completed before the end of the current lap unless stated.
- Reward: +30 XP and +20 Sparks, celebrated on the results screen with the mascot's cheer [S KRD mascot pop-up].
| id | Metric in window | ko | en |
|---|---|---|---|
| `mid_pass_2_10s` | 2 overtakes within 600 ticks (10 s) | 10초 안에 2명 추월하기 | Pass 2 racers within 10 s |
| `mid_instant_chain_3` | 3 consecutive instant boosts (no drift without one in between) | 순간 부스터 3연속 성공하기 | Chain 3 instant boosts |
| `mid_clean_lap` | this lap with no 15°+ wall hit | 벽에 닿지 않고 이번 바퀴 돌기 | Clean lap: no wall hits |
| `mid_draft_2` | 2 draft activations | 드래프트 2회 발동하기 | Trigger draft twice |
| `mid_shortcut` | take a shortcut branch | 지름길 통과하기 | Take a shortcut |
| `mid_booster_chain` | fire a booster while < 15 ticks remain on another (speed) | 부스터 체인 성공하기 | Chain two boosters |
| `mid_hits_2` | land 2 attacks (item) | 공격 2회 명중시키기 | Land 2 attacks |
| `mid_block_1` | absorb an attack with a shield (item) | 실드로 공격 막기 | Block an attack with a shield |
| `mid_top3_lap_end` | be top 3 at the end of this lap | 이번 바퀴를 3위 안으로 마치기 | End this lap in the top 3 |
| `mid_no_reset` | finish the race without a respawn (whole race) | 코스 복귀 없이 완주하기 | Finish without a reset |

---

## 12. Unlocks

### 12.1 Characters (`packages/content/src/characters/*.ts`)
| Level | Character | KR |
|---|---|---|
| 1 | Clay (classic) | 클레이 |
| 1 | Pixel (true voxel) | 픽셀 |
| 3 | Turbo (racer helmet) | 터보 |
| 6 | Captain Anchor (pirate) | 앵커 선장 |
| 9 | Rune (wizard) | 룬 |
| 12 | Nova (astronaut) | 노바 |
| 15 | Kage (ninja) | 카게 |
| 18 | Chef Bisque | 비스크 셰프 |
| 21 | Frost (ice crystal) | 프로스트 |
| 25 | Glitch (neon cyber) | 글리치 |
| 30 | Bolt (copper robot) | 볼트 |
| 35 | Duke (royal) | 듀크 |
Characters are cosmetic; stats live on karts (KRD-style [S]).

### 12.2 Kart bodies (`packages/content/src/karts/*.ts`)
| Level | Kart | Archetype | KR |
|---|---|---|---|
| 1 | Pebble | balance | 페블 |
| 4 | Clay Comet | balance | 클레이 코멧 |
| 8 | Arrowhead | speed | 애로헤드 |
| 12 | Tugboat | balance (heavy) | 터그보트 |
| 16 | Glacier Sled | drift | 글레이셔 슬레드 |
| 20 | Neon Blade | speed | 네온 블레이드 |
| 24 | Jet Kettle | drift | 제트 케틀 |
| 30 | Crown Cruiser | speed | 크라운 크루저 |

### 12.3 Liveries, palettes, flames, plates [P]
| Level | Unlock | Sparks shop (after unlock) |
|---|---|---|
| 1 | Livery "Stripes", number decals, plate text | — |
| 2 | Livery "Sparkle Stickers" | — |
| 5 | Palette skin **Midnight** #30302E | 300 |
| 7 | Livery "Checker" | 500 |
| 10 | Palette skin **Parchment** #F5F4ED | 300 |
| 13 | Boost flame colour **Violet** | 800 |
| 14 | Palette skin **Sage** #788C5D | 300 |
| 17 | Livery "Flame Decals" | 700 |
| 19 | Palette skin **Sky** #6A9BCC | 300 |
| 22 | Livery "Circuit Traces" | 900 |
| 23 | Boost flame colour **Teal** | 800 |
| 27 | Livery "Wave" | 900 |
| 32 | Livery "Royal Filigree" | 1200 |
| 33 | Boost flame colour **Gold** | 1000 |
| 38 | Livery "Aurora Gradient" | 1200 |
| 40 | Emote pack 2 (per character alternate win emotes) | 1000 |
| 43 | Boost flame colour **White-hot** | 1200 |
| 45 | Livery "Gold Chrome" | 1500 |
| 50 | Livery "Legend" + title "전설의 라이더 / Legend Rider" | — |
- Unlock = available to buy with Sparks, except the free items at levels 1, 2 and 50.
- The team booster flame is always blue and never recoloured (readability [S]).
- Palette skins apply to any character (mascot palette swap).

---

## 13. Save and migration (`meta/save.ts`, `SaveV1`)
- `localStorage` key `cr.save.v1` (JSON); ghosts in IndexedDB `cr-ghosts`.
- Export/import as JSON in Settings → Data.
- Every future `SaveVn` ships a migration `vn−1 → vn` and a fixture test (E: migration fixtures v1 load).

---

## 14. Tests
| Suite | Pass |
|---|---|
| Team scoring | table, sum 39, tie-break by best placement, one-two rule, Duo 4 teams |
| Team item winner | first finisher's team wins with retired teammates |
| Retire and hard cap | 600-tick timer; room values 300–1200; hard-cap retire ordering |
| Finish ms | equal ms share a rank; ordering by tick + fraction |
| Room start rules | host start after all ready; full + all ready → 10 s autostart; ≥ 1 human; host migration by join time |
| Quick Match flow | 20 s search, 15 s stage, AI fill without vote; tier mapping |
| Progression | XP formula per rank; level table matches §10.2; Sparks; level-up bonus |
| Challenges | deterministic rotation per date; progress from event streams; pays once |
| Unlocks | level gates per content files; shop prices |
| Save | migration fixtures load; export/import round-trip |
