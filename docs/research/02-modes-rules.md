# KartRider: Drift: game modes, race rules and meta flow (research for ClaudeRider)

## 0. Research notes and limitations

- **Fetching pages failed.** Every WebFetch target (namu.wiki and its mirrors namu.moe and thewiki.kr, fandom, wiki.gg, kartdrift.nexon.com, nexon.com, sea.nexon.com, guide.nexon.com, forums.kartrider.nexon.net, acmicpc.net, ko.wikipedia.org, gamezebo, github.io) returned `EGRESS_BLOCKED`. Everything below therefore comes from about 45 WebSearch result snippets in Korean and English. Each fact carries a tag:
  - **[S]** Sourced: a snippet states it directly.
  - **[D]** Derived: worked out from several sourced facts.
  - **[P]** Proposed: a design value for ClaudeRider, with reasoning.
- **The original game has shut down.** Global PC, console and mobile service ended in stages (August 2024, then 27 Feb 2025). The Korea and Taiwan PC service ended on **16 Oct 2025** [S: kmib, inven]. Some systems changed over the game's life: rooms returned in August 2024, and Ranked Mode replaced Grand Prix with the RISE update on 15 Feb 2024. This report notes which era a fact comes from.
- **IP rule for ClaudeRider.** Copy mechanics, never names. That covers "Lucci", "K-COIN", character names, track names, "Racing Pass" branding, item names and similar. Section 9 gives original names.

---

## 1. Mode catalogue (what KartRider: Drift had)

| Mode | Team formats | Win condition | Notes |
|---|---|---|---|
| **스피드전 (Speed)**, solo | 8 free-for-all | First to finish wins; everyone ranked by finish time | Boost gauge fills from drifting, auto-charge and crash gauge [S] |
| **Speed, team** | Duo (4 teams × 2) and Squad (2 × 4, red vs blue) [S] | Highest **sum of placement points**; on a tie, the team with the best-placed racer wins [S] | Shared team boost gauge. When it is full, every team member's boost becomes a longer blue "team booster". There is a brief unusable delay ("딜") during the switch [S] |
| **아이템전 (Item)**, solo | 8 FFA | First to finish wins [S] | Items come from item boxes; there is no drift gauge [S] |
| **Item, team** | Duo and Squad | **The team of the first finisher wins, even if all its teammates retired** [S] | Friendly fire off, except area hazards (water bomb and barricade) [S] |
| **무한부스터 (Infinite Boost)** | Solo and team | Same as Speed; team uses the points sum [S] | Gauge auto-fills without drifting, auto-charge continues during boost, and start boosts, instant boosts and drafting charge more [S]. Arrived in Mode Lab in Season 2 [S] |
| **크로스오버 (Crossover)** | Solo and Squad | Team: you or a teammate finishing 1st [S] | Items and speed gauge at the same time [S] |
| **플래그전 (Flag)** | Squad (4v4) and solo variant | Squad: first to 20 points, or most points at 3:00. A tie goes to overtime, where the first team to 10 wins [S] | 2 flags at start and 4 after 1:00; flag carriers are slower and drop the flag when hit. Solo: longest time holding the flag [S] |
| **UP&DOWN** (Mode Lab) | n/a | Jump-block climbing course | 6 tracks across 3 difficulties; no AI, so custom rooms only [S] |
| **타임어택 (Time Attack)** | Solo | Personal best | Individual boost only. Top 20 per leaderboard (global, platform, region), reset every **91 days**. Ghost races against local ghosts, top-20 rankers or nearby ranks [S]. Save-position and rewind for practice (Season 4) [S]. No replay saving [S] |
| **그랑프리 (Grand Prix)** (to Feb 2024) | 8 random players, separate Speed and Item ladders | GP points: usually up for 4th or better, down for 5th or worse [S] | B1 license required. **At least 10 GP races** to qualify for season rewards. Win-streak bonus below Grandmaster. Rankings updated daily [S] |
| **랭크 (Ranked)** (from RISE, 2024) | Solo and squad merged | Rank points (MP) by placement: points for 1st–3rd, sometimes 4th–5th in full lobbies. Win-streak bonus (1st–3rd) [S] | **13-week** seasons [S]. Speed tiers: Challenger, then Bronze, Silver, Gold, Platinum, Master, Grand Master, each III/II/I [S]. Item tiers: gloves Yellow, Green, Blue, Red, Black, Rainbow, each 5 steps [S]. Low tiers gain a lot and lose little [S]. MMR also picks track difficulty [S]. Season 1 was open only 18:00–01:00 daily [S] |
| **라이선스 (License)** | Solo | Missions scored 1–3 stars; ≥1 star on every mission clears the license [S] | B2 has 8 missions and unlocks difficulty-2 tracks. B1 has 14 missions and unlocks difficulty 3. L3 unlocks the rest. L1 and PRO were planned but never shipped [S]. Driving assists (auto, drift assist, auto instant-boost) are allowed only before B1 [S]. Stars ≥3 need B1; ≥5 need L3 [S] |
| **커스텀 (Custom rooms)** | Any | Per mode | See section 4 |
| **리그 (esports League)** | 4v4 | Set 1 Speed Squad, Set 2 Item Squad, Set 3 Ace match (1v1 speed tiebreaker) [S] | Sets were typically best of 5 [S] |

**Player count.** Races hold 8 racers [S]. Team races are 4v4 or four teams of 2 [S].

---

## 2. Race rules

### 2.1 Laps
- The standard track is **3 laps**. The first Drift-original Village track is described as "a 3-lap track, long in length and driving time" [S].
- Some tracks run fewer laps. On 3 Apr 2025 a San Francisco world track was cut **from 3 to 2 laps** [S]. Some beginner tracks have one lap fewer than the original [S]. "1 LAP" tracks exist, and there was a random pool of only 1-lap tracks [S].
- One WKC-theme original track was a **9-lap** oval [S].
- For scale, a reference 3-lap run on a textbook speed track takes about 1:34 to 1:42 [S: YouTube and namu snippet for a village track].
- **[D] Rule of thumb:** lap count is set per track so that a clean run lasts about 1:30 to 2:15. Short loops get 3 laps, long city or European-style tracks 2 laps (which matches the "1/2 LAP" HUD the user saw), point-to-point downhills 1 lap, and a tiny oval many laps.

### 2.2 Start sequence
- The countdown is **3, 2, 1, GO** [S].
- A start boost fires if you press accelerate at GO and keep holding it [S]. In Drift the timing window was widened and split into **3 strength tiers**. A perfect press makes "GO" glow blue and the character smile [S]. Pressing closer to GO gives a longer boost [S].

### 2.3 Finish, retire and DNF
- **When the first racer crosses the line, a 10-second countdown starts. Anyone who has not finished by then is retired (리타이어) and the game moves to the results screen** [S]. A dedicated BGM plays during the 10-second retire count [S].
- **A retired racer scores 0 team points.** Drift kept the original PC game's rule. KartRider Rush+ had instead scored retirees by their position when the timer ended [S].
- Finish times are shown to **1/1000 s**. Identical times to the thousandth count as a simultaneous finish [S].
- If a racer leaves the track boundary after the race is judged over, they respawn automatically [S].

### 2.4 Team speed points table
- Placement points are **1st 10, 2nd 8, 3rd 6, 4th 5, 5th 4, 6th 3, 7th 2, 8th 1, retire 0** [D, high confidence]. No snippet printed this table directly. The following checks all come out consistent with it:
  - The total is 39, which is odd, so a full 4v4 with no retirements cannot tie, and a win needs at least 20 points.
  - The official forum lists winning combinations **2-3-5-6** (21 vs 18), **1-4-5-6** (22 vs 17), **2-4-5-6** (20 vs 19) and **1-4-6-7** (20 vs 19). All four are wins under this table, and 2-4-5-6 and 1-4-6-7 are the narrowest possible wins [S: forums.kartrider.nexon.net #487].
  - The "원투" (one-two) rule says a team with 1st and 2nd wins even if its other two members retire and the opponents take 3-4-5-6 [S]. Under this table that is 18 vs 18, and the tie goes to the team holding 1st place [S]. So the table and the tie-break agree.
  - An alternative table such as 10-7-5-4-3-2-1-0 would make 2-4-5-6 a tie that 1-3-7-8 wins on tie-break, which contradicts the forum.
- The original game also had a "combo match" variant that gave bonus points to adjacent same-team finishes (1-2 +10, 2-3 +8, 3-4 +6, 4-5 +4, 5-6 +2) [S]. That is optional flavour.

### 2.5 Reset, respawn and wrong way
- When you drive the wrong way, a one-way sign appears with the prompt **"R 코스복귀"** (press R to return to the course) [S].
- **R reset** ignores collisions with other players only. Item hits still apply, and **your current boost is cancelled** [S].
- **A reset costs about 3 s or more**, which is why skilled players use a 180° spin ("Marseille turn") instead [S].
- Leaving the track respawns you automatically [S]. There is no separate time penalty for driving backwards. The cost is the lost time itself.

### 2.6 Chat during races
- Chat is shown only to racers who have finished, so messages never reach anyone still racing [S].
- Quick chat has 15 configurable slots [S].
- The character reacts to an item hit: pleased when an attack lands, frustrated when it misses [S].

---

## 3. Matchmaking flow (quick match, 2023–24)

1. **Queue.** Choose mode (Speed or Item, later Mode Lab), team type (Solo, Duo or Squad) and opponent setting [S]:
   - **AI**: bots as opponents, humans on your team.
   - **Racers + AI**: bots added only after several minutes of searching.
   - **Racers**: humans only.

   Solo AI queues start instantly. An AI Duo queue needs one other human, and an AI Squad queue needs three [S]. AI racers had gibberish names plus 2–3 digits and were widely felt to be too easy [S].
2. **Matching Stage.** You can chat, see the upcoming track and change character or kart [S]. **If fewer than 8 racers are present, there is a one-minute refill period. After that the room votes, and if more than half agree, AI racers fill the empty slots** [S]. Ranked track choice is driven by MMR [S].
3. **Race.** Intro, countdown, race, then the 10-second retire timer.
4. **Results.** Rewards arrive: Racer Points (RP) toward Racer Level, Lucci (soft currency), and challenge progress toward Racing Pass trophies [S]. A random in-race mid-race mini mission appeared for players at Racer Level 3 and above. Completing it gave bonus RP and Lucci, and the mascot congratulated you on the results screen [S]. There was also a "campfire time" event that added +50 Lucci and +10 RP per race [S].

## 4. Rooms and custom lobby (from the August 2024 "original room structure" update)

- Players create a room or join one from a list. Continuous play with the same group and host-chosen tracks fixed complaints about queue times [S].
- The **host picks the mode** (Item, Speed, Infinite Boost, Crossover, Flag and others) and **the track**: a specific track, all-random or speed-random [S].
- **Track Roulette** opens a **20-second pop-up** in which every player nominates a track. One nomination is picked at random [S].
- Each room gets a **6-digit entry key**, and the host can hide it [S].
- **Every player must press Ready. When the room is full and everyone is ready, the race starts automatically after 10 s** [S].
- The host can **close slots** [S] and **invite AI** into custom games [S]. Graphics settings are reachable in the lobby [S].

## 5. Progression and economy

- **Levels.** There is an account or Racer Level fed by RP from races [S], and a separate Racing Pass level [S]. Kart-body levelling unlocked at character level 15 [S]. Karts also gained proficiency, and gears upgraded their stats [S].
- **Racing Pass.**
  - Preseason had **40 levels**. Levels come from Trophies earned through challenges. After level 40, challenges pay the soft currency instead [S].
  - There is a free track and a premium track. Premium cost 500 K-COIN, or 1,000 for a package with +100 trophies that jumped you to level 18 [S]. Levels could be bought at 15 K-COIN per trophy [S].
  - Free players got **2–3 daily challenges** (reset 00:00 UTC) and **4 weekly challenges** (reset Thursday) [S]. Premium added **7 weekly premium challenges** (Wednesday 00:00 UTC) [S].
  - Example challenges: "Complete a race on a Pirate-theme track 1 time: 100 pts" and "Complete 10 Item/Speed races as character X: 200 pts" [S]. Trophy values scale with difficulty [S].
- **Currencies.** Lucci was the soft currency. It paid for kart upgrades [S] and was once charged for Time Attack ranking registration (later removed) [S]. K-COIN was the premium currency.
- **Monetization stance.** Cosmetic-only, no pay-to-win [S].

## 6. Garage, customization and social

- Karts:
  - **Livery**: a free colour palette plus materials (matte, chrome, pearl, metallic). Players could place decals on the body or **design their own** [S].
  - **Wheels, boost effect or colour, and licence plate** [S].
  - Custom boost colours made solo and team boosters visually indistinguishable, which was a readability problem [S].
- **Characters**: the old uniform system became **per-character costumes** [S].
- **Situational emotes**: you assign an emote to a situation, for example crying even after finishing [S].
- **Presets** switch a whole look at once [S].
- **Chat**: text chat, emojis, emotes and quick chat in the lobby and between matches, with a filter [S].

---

## 7. Implications for ClaudeRider

1. **The core loop is short and repeatable**: about 2 minutes of racing, 10 s of retire timer, about 10 s of results, then straight back into the room. Rooms with persistent groups were what brought the game back in 2024 [S]. Build around a room loop, not just a matchmaking queue.
2. **Scoring is the whole team-speed metagame.** The 10-8-6-5-4-3-2-1 table, 0 for retirement and the "best placement wins ties" rule create runner and sweeper roles [S]. Adopt it exactly as a mechanic; the table is not a trademark.
3. **Team item uses the first-finisher rule**, which is simple and dramatic.
4. **AI fill must be fast and fair.** Drift's slow AI fill and too-easy bots were major complaints [S].
5. **Retire timer and a tie-safe 1 ms timer** are needed for fairness in multiplayer.

---

## 8. Proposed ClaudeRider rules specification

### 8.1 Mode roadmap
| Release | Modes |
|---|---|
| **v1 (launch)** | Solo Speed; Team Speed 4v4; Solo Item; Team Item 4v4; Quick Race vs AI (offline, instant, 7 bots); Online Custom Room (the 4 modes above plus AI fill); Time Attack with local ghost |
| **v1.1** | Duo (four teams of 2) for Speed and Item; Infinite Boost (solo and team); License tutorial (3 tiers); Track Roulette vote |
| **v2** | Ranked (13-week seasons, two ladders); Crossover; Flag (4v4, 3:00, first to 20, overtime to 10); global Time Attack leaderboards; Season Pass (free only, no real money) |

### 8.2 Lap-count rule [P]
- Each track stores `refLapSec`, a clean expert lap at normal speed class, measured by an AI time trial.
- `laps = clamp(round(115 / refLapSec), 1, 5)`, giving a speed-mode race of about 1:40–2:15.
  - refLap 28–45 s gives 3 laps.
  - refLap 46–75 s gives 2 laps (European-city-style tracks).
  - refLap > 80 s, or point-to-point, gives 1 lap.
  - The special short oval (refLap about 22 s) is capped at 5 laps, as a nod to the 9-lap oval without copying it.
- `itemLaps = laps` by default. Drop to `laps − 1` (minimum 1) when `refLapSec > 42`. Item races run longer because of hits, and Drift itself cut an item track from 3 to 2 laps.
- **Suggested split across 20 tracks:** 12 × 3 laps, 5 × 2 laps, 2 × 1 lap (a downhill and a sky-dive track), 1 × 5-lap mini oval. Custom rooms may override laps from 1 to 5.

### 8.3 Pre-race and start [P]
- Loading, then a track flyover of **4.0 s** (skippable in solo), then a grid shot of **1.5 s**, then the countdown **3, 2, 1, GO** at 1.0 s per beat. Grid order is random in the first race of a room and follows the reverse of the previous results after that.
- **Start boost, 3 tiers**, measured as the throttle press time relative to GO:
  - **Perfect**: −60 to +40 ms. 1.2 s boost; GO glows cyan; the mascot smiles.
  - **Good**: −150 to +120 ms. 0.8 s boost.
  - **OK**: −250 to +200 ms. 0.4 s boost.
  - Earlier than −250 ms: no boost and no stall, to stay beginner-friendly. The boost ends if the throttle is released.

### 8.4 Finish, retire and DNF [P, based on S]
- **Retire timer:** 10.0 s after the first finisher [S]. A custom room can set 5, 10, 15 or 20 s. The HUD shows a large count from 10 to 0 with a dedicated music sting.
- **Hard cap** (for the case where nobody finishes, such as all AI stuck or a disconnect): `max(3 × laps × refLapSec, 240 s)`. When it expires, every racer is ranked by progress and marked as retired.
- A **retired racer** gets 0 team points [S]. Retirees are still ordered by track progress for display and XP, and are labelled "RETIRE".
- **Timing** is shown to 1 ms; identical milliseconds share a rank [S]. The server's authoritative tick decides the finish order.
- **Disconnect:** the kart becomes AI-controlled ("autopilot") for the rest of the race. It counts as retired for team points unless it finishes, in which case it scores normally in casual play and 0 in ranked.

### 8.5 Scoring and winners
- **Solo (Speed and Item):** rank by finish time; retirees follow, ordered by progress.
- **Team Speed and Team Infinite Boost:** points 10/8/6/5/4/3/2/1, retire 0. Highest sum wins. On a tie, the team with the single best-placed finisher wins. Duo uses the same table across 4 teams, with the same tie-break.
- **Team Item:** the team of the first finisher wins [S]. Other teams are ordered by their own best finisher.
- **Team boost (Team Speed only):** a shared gauge collects each teammate's gauge gains. When full, every member of the team gets one team boost, which lasts 1.5× a normal boost and has its own colour that cannot be customised, because readability matters [P].
- **Friendly fire (Team Item):** off for direct and homing items, on for placed area hazards [S].
- **Optional "Combo" rule (custom rooms only):** bonus points for adjacent same-team finishes: +10 for 1-2, +8 for 2-3, +6 for 3-4, +4 for 4-5, +2 for 5-6.

### 8.6 Reset, respawn and wrong way [P]
- **Auto-respawn** triggers when the kart is below `killY`, or off the drivable surface for more than 1.0 s, or out of bounds.
  - Sequence: fade out 0.4 s, place at the last valid checkpoint facing the track tangent at 40% of top speed, fade in 0.4 s. Total cost is about 1.6–2.0 s.
- **Manual reset (R):** allowed when speed has been under 3 m/s for 1.0 s or when "WRONG WAY" is showing. It uses the same placement, adds a 0.5 s stop, and costs about 2.5–3.0 s in total [S: roughly 3 s].
- **After either reset:**
  - Current boost and drift charge are cancelled [S]. The stored boost counter is kept.
  - The kart is **ghosted to other karts for 2.0 s** (translucent), but **items still hit** [S].
  - Held items are kept.
- **Wrong way:** shown when the angle between heading and track tangent exceeds 110° while speed is over 4 m/s for 1.2 s. A red "WRONG WAY" banner appears with a U-turn arrow and the key prompt "R: Back to course". There is no time penalty.
- **Lap validity:** a lap counts only if its ordered sector checkpoints (6–12 per track) were passed in order. Reversing across the line never gives or takes a lap, and progress is measured along a monotonic spline parameter.

### 8.7 Matchmaking and AI fill [P]
- **Offline vs AI:** instant start with 7 AI racers. The player chooses difficulty.
- **Online quick match** (queue per mode × team type):
  - 0–20 s: search for humans.
  - At 20 s, enter the Matching Stage whatever the count.
  - In the Matching Stage (15 s): see the track, change kart or character, use quick chat.
  - At the end of the Matching Stage, fill empty slots with AI automatically in casual play. Drift's vote-and-wait flow was a known pain point.
  - Ranked (v2) needs at least 4 humans. Rank points never come from AI placements; they are scored only against the humans in the race.
- **AI difficulty tiers**, with a per-bot skill jitter of ±5%:
  - Rookie: 88% of reference pace, 35% optimal-drift rate.
  - Racer: 94%, 60%.
  - Pro: 98%, 80%.
  - Legend: 101%, 92%.
  - Casual fill picks the tier nearest the lobby's average human skill.
  - Rubber-band speed is capped at ±4%. It never applies in the final 15% of the last lap.
- **AI identity:** named Claude-mascot variations (for example "Spark-07 Coral"), with an AI badge in the lobby and on results.
- **Team balancing:** humans are split as evenly as possible and AI fills the remainder. Squad slots alternate red and blue.

### 8.8 Custom room [P, based on S]
- 8 racer slots, with 2 spectator slots in v1.1. A **6-character code** (letters and digits, no 0/O/1/I) and a hidden-code option [S].
- **Host settings:**
  - Mode; team type; track (specific / random all / random speed / random item / Track Roulette, a 20 s vote [S]).
  - Laps override (Auto or 1–5); retire timer (5/10/15/20 s); item set (Standard / Attack-light / Chaos).
  - AI slots (0–7) with difficulty; open or closed slots [S]; kick; team assignment or shuffle.
- **Start rules:** once all non-host humans are ready, the host can press Start. **When the room is full and all players are ready, the race auto-starts after 10 s** [S]. At least 1 human is required.
- **Host migration** goes to the longest-present human.
- **After the race** everyone returns to the same room. Ready states reset, but team assignments stay.

### 8.9 Results screen [P]
- **Contents:**
  - WIN/LOSE banner (team modes) with the team point totals.
  - A table of the 8 racers: rank, mascot icon, name, kart, finish time `m:ss.mmm` or RETIRE, best lap, team points. The local player is highlighted.
  - A rewards panel with XP bar, level-up flash, coins, challenge progress ticks and new unlocks.
  - Emote auto-play: the win or lose emote each player assigned.
- **Buttons:** Ready / Rematch, Room, Leave. After **12 s** the screen returns to the room automatically.

### 8.10 Progression (v1 local save; server profile later) [P]
- **Racer Level** runs from 1 to 50 and levels only unlock cosmetics.
  - XP per race = 60 for finishing (15 if retired) + placement bonus + team win bonus (+40) + 5 per new personal-best lap.
  - Placement bonus by rank: [60, 45, 35, 28, 20, 14, 8, 4].
  - XP needed for the next level is `100 + 25 × (level − 1)`.
- **Coins ("Sparks"):** 0.5 × XP, spent on cosmetics only.
- **Daily challenges:** 3, reset at 00:00 local time. **Weekly challenges:** 5, reset Monday. Examples:
  - "Land 7 item attacks in Item mode."
  - "Drift a total of 3,000 m."
  - "Finish in the top 3 on any 2-lap track."
  - "Get 5 Perfect start boosts."
  - "Win a Team Speed race with a one-two."
  - "Beat your Time Attack ghost on 3 tracks."
- **Mid-race surprise challenge** (Racer Level 3 and above, 15% chance per race), for example "Pass 2 racers within 10 s" or "Chain 3 instant boosts". Reward +30 XP and +20 Sparks, celebrated on the results screen.
- **License (v1.1):** 3 tiers ("Cadet", "Racer", "Ace"; original names) with 8, 10 and 12 missions, each 1–3 stars. At least 1 star on every mission clears a tier. Tiers unlock track difficulty bands (2, 3, then 4–5). Driving assists are allowed only in the first tier.
- **Season Pass (v2):** 40 free levels at 10 trophies each, fed by challenges. Beyond level 40 the pass pays Sparks. No paid tier.

### 8.11 Garage and social [P]
- **Kart:**
  - Body (6–10 procedural bodies).
  - Paint: HSV palette plus material (matte, metallic, pearl, chrome).
  - Decals: 4 slots of procedural stickers with position, scale and rotation.
  - Wheels (8 procedural designs), boost flame colour (not applied to the team boost), licence plate (8 characters).
- **Character:** Claude-mascot variations as base characters, with outfits, a hat or accessory slot and colour variants.
- **Emotes by situation:** win, podium, lose, retire, landed an attack, got hit, idle in lobby.
- **Presets:** 3 slots.
- **Chat:** lobby text chat with a filter. In race: 8-slot quick chat plus emotes. Race chat is **shown only to racers who have finished** [S].

---

## 9. Naming map (avoid Nexon terms)

| Nexon term | ClaudeRider name |
|---|---|
| Speed/Item | Speed Race / Item Race ("스피드/아이템" are generic words and fine) |
| Lucci | Sparks |
| K-COIN | none (no premium currency) |
| Racing Pass | Season Road |
| Grand Prix/Ranked | Rank Circuit |
| License B2/B1/L3 | Cadet / Racer / Ace |
| 리타이어 | RETIRE (generic) |
| Glove tiers | Spark tiers (Ember → Nova) |

Also avoid every Nexon track, character and item name. A browser KartRider-style open-source project (github.com/majeongsu72-jpg/drift-rush) turned up in a search. Its code was not inspected.

## Key parameters

- **racers_per_race**: 8 [sourced] — fandom Speed/Item mode snippets; GP 8-player matching
- **team_formats**: Solo 8 FFA; Duo 4 teams x 2; Squad 2 teams x 4 (red/blue) [sourced] — fandom Speed mode; Steam/Nexon duo notes
- **retire_timer_after_first_finish_s**: 10 [sourced] — fandom Speed mode ('Race ends in 10 seconds after the 1st player crossed finish line'); namu 리타이어 page snippet
- **retire_team_points**: 0 (not position-at-timeout as in Rush+) [sourced] — namu 리타이어(카트라이더: 드리프트) snippet
- **team_speed_points_table**: 1st 10, 2nd 8, 3rd 6, 4th 5, 5th 4, 6th 3, 7th 2, 8th 1, retire 0 [proposed] — Derived with high confidence: matches the forum's winning combos (2-3-5-6, 1-4-5-6, 2-4-5-6, 1-4-6-7) and the one-two tie rule; no direct snippet showed the table
- **team_speed_tiebreak**: Team with best single placement (holder of highest rank) wins [sourced] — acmicpc 27522 snippet; namu 크레이지레이싱 게임 모드 snippet
- **team_item_win_rule**: Team of first finisher wins even if all teammates retire [sourced] — fandom Item mode snippet
- **team_item_friendly_fire**: Off, except area hazards (water bomb/barricade equivalents) [sourced] — fandom Item mode snippet
- **timing_precision**: 1 ms; equal to the ms = simultaneous finish [sourced] — search snippet on Drift finish record display
- **countdown**: 3-2-1-GO, 1.0 s per beat [sourced] — gamespew/touchtapplay start boost guides (beat length proposed)
- **start_boost_tiers**: 3 tiers: perfect -60..+40 ms =1.2 s; good -150..+120 ms =0.8 s; ok -250..+200 ms =0.4 s; early = none, no stall [proposed] — Drift had 3 timing-based strength tiers (namu snippet); windows and durations proposed
- **standard_lap_count**: 3 (long tracks 2, point-to-point 1, one 9-lap oval existed) [sourced] — en.namu Village track snippet; namu world track (SF 3 to 2 laps, 2025-04-03); 9-lap WKC oval snippet
- **lap_count_formula**: laps = clamp(round(115 / refLapSec), 1, 5); itemLaps = laps, minus 1 if refLapSec > 42 (min 1) [proposed] — Target 1:40-2:15 race, based on ~1:34-1:42 reference 3-lap times
- **track_lap_distribution_20**: 12 x 3 laps, 5 x 2 laps, 2 x 1 lap, 1 x 5-lap mini oval [proposed]
- **race_hard_cap_s**: max(3 x laps x refLapSec, 240) [proposed]
- **reset_cost_s**: ~2.5-3.0 manual (R); ~1.6-2.0 auto-respawn [proposed] — Drift R reset took about 3 s or more (namu 주행 기술 snippet)
- **post_reset_ghost_s**: 2.0 (kart collisions off, items still hit, boost cancelled) [proposed] — Drift R ignores player collisions only, items still hit, boost cut (namu snippet); duration proposed
- **wrong_way_trigger**: heading vs tangent >110 deg, speed >4 m/s, for 1.2 s; banner plus 'R: back to course'; no time penalty [proposed] — Drift showed a one-way sign plus 'R 코스복귀' (namu snippet)
- **room_autostart_s**: 10 (room full and all ready) [sourced] — gamevu 34785 snippet
- **room_code**: 6 characters (Drift used a 6-digit number key) [sourced] — gamevu 34785 snippet
- **track_roulette_vote_s**: 20 [sourced] — sea.nexon.com update 2486249 snippet
- **matching_stage_refill**: Drift: under 8 racers leads to 1 min refill, then majority vote to add AI. ClaudeRider: 20 s search plus 15 s matching stage, then auto AI fill (casual) [proposed] — Drift behavior sourced from Nexon update notes snippet; timings proposed
- **ai_difficulty_tiers**: Rookie 88% / Racer 94% / Pro 98% / Legend 101% of reference pace; rubber-band cap +/-4%, off in last 15% of final lap [proposed]
- **results_screen_timeout_s**: 12 [proposed]
- **ranked_season_length_weeks**: 13 [sourced] — namu 랭크 모드/등급전 snippet
- **ranked_speed_tiers**: Challenger, then Bronze, Silver, Gold, Platinum, Master, Grand Master (III/II/I each) [sourced] — namu 랭크 모드 snippet
- **ranked_item_tiers**: Gloves Yellow, Green, Blue, Red, Black, Rainbow, 5 steps each [sourced] — namu snippet
- **gp_min_races_for_reward**: 10 [sourced] — Nexon Season 1 Grand Prix notice snippet
- **license_structure**: B2 (8 missions) / B1 (14 missions) / L3; 1-3 stars per mission; at least 1 star on every mission clears [sourced] — gamezebo/fandom License snippets; gameple 204824
- **time_attack_leaderboard**: Top 20 per board; reset every 91 days; ghost vs top 20 or nearby ranks [sourced] — namu 드리프트 main page snippet
- **flag_mode**: 4v4, first to 20 or 3:00; flags 2 then 4 after 1:00; overtime first to 10 [sourced] — fandom Flag mode snippet
- **racing_pass**: 40 levels; 2-3 daily plus 4 weekly free challenges; 7 weekly premium challenges [sourced] — Nexon Preseason Racing Pass notice; wccftech; gamevu 26016
- **clauderider_xp_formula**: 60 finish (15 if retired) + placement [60,45,35,28,20,14,8,4] + 40 team win + 5 per new PB lap; next level needs 100 + 25 x (L-1); max level 50 [proposed]
- **clauderider_challenges**: 3 daily plus 5 weekly; mid-race surprise mission 15% chance (Lv 3+), +30 XP / +20 Sparks [proposed] — Modeled on Drift's in-race mascot pop-up mission for Racer Level 3+
- **in_race_chat_visibility**: Chat visible only to racers who have finished [sourced] — sea.nexon.com update 2486249 snippet
- **quick_chat_slots**: Drift 15; ClaudeRider 8 [proposed] — Drift 15 slots sourced
- **team_boost_duration_multiplier**: 1.5x normal boost; fixed non-customizable color [proposed] — Drift team boost lasts longer and turns blue (fandom/namu snippets); multiplier proposed

## Open questions

- Exact per-track lap counts for KartRider: Drift's track list (namu.wiki track pages and the official track encyclopedia were blocked by the egress proxy). The lap formula in the report is PROPOSED.
- The 10-8-6-5-4-3-2-1 team points table is derived, not quoted. It should be confirmed if namu.wiki '크레이지레이싱 카트라이더/게임 모드' or acmicpc 27522 becomes reachable.
- Exact start-boost timing windows and durations, respawn fade timings and team-boost duration were not found; all are PROPOSED.
- Exact RP/Lucci per placement, Racer Level cap and trophies per Racing Pass level were not found.
- Whether ClaudeRider's online casual queue should auto-fill with AI (proposed) or keep Drift's majority vote needs a product decision.
- ClaudeRider's own naming (Sparks, Season Road, license tiers) needs sign-off so that it avoids Nexon terms and also avoids overusing the Anthropic 'Claude' trademark in currency or menu names.

## Sources

- https://kartrider-drift.fandom.com/wiki/Speed_mode
- https://kartrider-drift.fandom.com/wiki/Item_mode
- https://en.namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8/%EA%B2%8C%EC%9E%84%20%EB%AA%A8%EB%93%9C
- https://forums.kartrider.nexon.net/discussion/487/positions-in-kartrider-in-team-speed-games
- https://namu.wiki/w/%EB%A6%AC%ED%83%80%EC%9D%B4%EC%96%B4(%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8)
- https://namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8
- https://namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8/%EC%9A%A9%EC%96%B4%EC%82%AC%EC%A0%84
- https://namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8/%EC%A3%BC%ED%96%89%20%EA%B8%B0%EC%88%A0
- https://namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8/%EB%9E%AD%ED%81%AC%20%EB%AA%A8%EB%93%9C
- https://namu.wiki/w/%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94:%20%EB%93%9C%EB%A6%AC%ED%94%84%ED%8A%B8/%ED%8A%B8%EB%9E%99/%EC%9B%94%EB%93%9C
- https://namu.wiki/w/%ED%81%AC%EB%A0%88%EC%9D%B4%EC%A7%80%EB%A0%88%EC%9D%B4%EC%8B%B1%20%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94/%EA%B2%8C%EC%9E%84%20%EB%AA%A8%EB%93%9C
- https://www.acmicpc.net/problem/27522
- https://en.namu.wiki/w/%ED%81%AC%EB%A0%88%EC%9D%B4%EC%A7%80%EB%A0%88%EC%9D%B4%EC%8B%B1%20%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94/%ED%8A%B8%EB%9E%99/%EB%B9%8C%EB%A6%AC%EC%A7%80
- https://zdnet.co.kr/view/?no=20231012162133
- https://www.gamevu.co.kr/news/articleView.html?idxno=34785
- https://sea.nexon.com/kartdrift/en/news/update/view?threadId=2486249
- https://www.nexon.com/kartdrift/en/news/update/view?threadId=2545595
- https://www.nexon.com/kartdrift/en/news/announcement/view?threadId=2524030
- https://www.nexon.com/kartdrift/en/news/update/view?threadId=2039549
- https://kartrider-drift.fandom.com/wiki/Grand_Prix
- https://kartrider-drift.fandom.com/wiki/Ranked_Queue
- https://www.xportsnews.com/article/2007416
- https://www.gameple.co.kr/news/articleView.html?idxno=204824
- https://kartrider.fandom.com/wiki/License
- https://www.gamezebo.com/walkthroughs/kartrider-drift-license/
- https://www.gamespew.com/2023/02/how-to-perform-a-start-boost-in-kartrider-drift/
- https://www.touchtapplay.com/how-to-do-a-start-boost-in-kartrider-drift-guide/
- https://kartrider-drift.fandom.com/wiki/Flag_mode
- https://kartrider-drift.fandom.com/wiki/Mode_Lab
- https://steamcommunity.com/app/1184140/discussions/0/3777993814852535738/
- https://www.nexon.com/kartdrift/en/news/update/view?threadId=1954323
- https://wccftech.com/how-to/kartrider-drift-how-to-level-up-fast/
- https://m.gamevu.co.kr/news/articleView.html?idxno=26016
- https://pressspacetojump.com/guide/kartrider-drift-all-of-the-preseason-racing-pass-rewards/
- https://www.gamepur.com/guides/how-to-customize-your-kart-and-character-in-kartrider-drift-beta
- https://wccftech.com/review/kartrider-drift-an-arcade-racing-game-worth-trying/
- https://www.nexon.com/kartdrift/en/news/announcement/view?threadId=2085680
- https://www.kmib.co.kr/article/view.asp?arcid=0028270641
- https://www.inven.co.kr/webzine/news/?news=306846
- https://www.youtube.com/watch?v=vrW13vXSSEA
- https://github.com/majeongsu72-jpg/drift-rush
