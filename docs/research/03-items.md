# Item Mode (아이템전) research: KartRider: Drift and classic KartRider, plus a proposed ClaudeRider item set

## 0. Method and how reliable the sources are

- **What I could reach.** The network proxy blocked direct page fetches from namu.wiki (including the en. mirror and thewiki.kr), kartdrift.nexon.com, guide.nexon.com, Inven/gamevu/dcinside, Fandom, Steam, Reddit and Wikipedia. I did not bypass the blocks. For those sites I only have the text that web-search results summarised.
- **Primary data.** The most useful sources were GitHub files I could read in full:
  1. **kart.cafe** (`whotookzakum/kart.cafe`). This is a community database for KartRider: Drift (KRD). It contains the **KRD item-mode drop-rate tables** for solo, duo and squad, plus the rank-bucket definitions.
  2. **KartDocs** (`Plush777/KartDocs`). A Korean community guide with one page per KRD item and per character skill.
  3. **KartRider-Launcher-KR** (`SEUNGJU-PARK-KR`). A private-server emulator for classic KartRider. It embeds the **classic item probability weight XML** for individual and team modes, and its own code for mapping a racer to a rank band.
  4. **enha mirror** (`forkwikiman/enha`). An old snapshot of the classic KartRider item wiki. It has approximate durations (for example shield ≈2 s).
  5. **P5136_Rust** (`ILoveKartrider`). Classic server port: a catalogue of 54 items and the rank-band structure.
  6. An SDK class dump of the KRD client (`Evestir/Nothing`). I used only the list of item actor class names, as a check on which items exist.
- **What was not found.** None of the reachable sources gave exact KRD durations in seconds, projectile speeds or box respawn times. Wherever the report gives such a number it is marked **PROPOSED** and explained. Classic-KartRider numbers are marked "classic ≈".

---

## 1. KartRider: Drift item mode: core rules (sourced)

| Topic | Finding | Source |
|---|---|---|
| Players | 8 racers. Solo, duo and squad (team) variants. | kart.cafe rankDefs (players: 8; solo/duo/squad) |
| Item slots | **Maximum 2.** Left Alt chooses which item is used first; by default the left item is used first. Picking up a box while holding 2 items gives nothing, so players use (dump) an unwanted item just before a box. | namu/gamevu search snippets; KartDocs (로두마니: "아이템 슬롯이 최대 2개") |
| Swap limit | One English guide summary says the use-order swap works only **5 times per race**. Not verified. | GameSpew/HighGround search snippet |
| Discard | There is no explicit discard. You empty a slot by using the item. An aimed missile or magnet that fails to lock is **consumed** ("조준 실패 시 아이템 소멸"). | KartDocs missile/magnet pages |
| Item boxes ("큐브") | Boxes are placed in **rows** across the track. Since 2024-12-05 (OVERDRIVE) two special kinds exist. **확정 큐브** ("confirmed" cubes) always give one known item, for example missile, banana, barricade or water-fly cubes. **2중 큐브** (double cubes) give two items. A later patch cut the number of both on every track, and neither appears in the **first or last row** of cubes. | KartDocs (mos/ethen/derek/toto pages); kartdrift.nexon.com patch snippet |
| Distribution | Rubber-banded by rank bucket: **1st / 2nd–3rd / 4th–6th / 7th–8th**. The leader gets defensive and trap items; the back of the pack gets speed and catch-up items (full tables in §3). The patch history includes "attack item probability slightly reduced, shield probability increased" and, in July 2024, "shield probability for high-ranked solo players nerfed". | kart.cafe; KartDocs derek page; patch snippet |
| Trap escape | Water bomb and water fly traps: mashing **left/right alternately** gets you out faster. An **escape boost (순간 부스터)** is applied automatically when you get out. The UI shows how many key presses are still needed and whether a quick escape triggered. A trap is weaker if the victim is on a rail or boost pad, because they re-accelerate straight away. | namu snippet (patch notes); KartDocs waterfly |
| Attack feedback | When an attack lands, your character plays a **happy** animation; when it fails or is blocked, a **frustrated** one. The client has an `ItemFeed` actor (a kill-feed-style attack log). | namu snippet; SDK class list |
| Character/kart skills | Item mode also has active or passive skills on roughly 15–27 s cooldowns. They lived on characters, moved to kart bodies in Dec 2024, and moved **back to characters on 2025-04-24**, when a skill practice area was also added. Examples: Dao jump **17 s**; Bazzi rolling water balloon **18 s** (first use 9 s; the balloon rolls up to 5 s); 지피시장 "Money Shield" **15 s** (first 7.5 s, ~0.1 s parry window, and a successful parry shortens the next cooldown); 로두마니 steals nearby boxes, **27 s**; Rave passive heart shield blocks banana/siren-type hits for **3 s, up to 4 times**; Derek levels up after **5 s above 100 km/h**, max LV3 ≈300 km/h, and resets on a hit, a wall, holding 2 items, or dropping below 50 km/h; Toto turns missiles into bombard shells **78%** of the time. | KartDocs character pages; gamemeca/byline snippets |
| Balloons (wearable) | A higher balloon grade means fewer mash presses to escape water, shorter thunderbolt and UFO effects, and missile hits softened (a slip instead of launch; newer balloons give a heavy slowdown instead). | KartDocs balloon/missile/toto |

**Item actor classes in the KRD client** (SDK dump): Booster, TeamBooster, Banana, BigBanana, Barricade, Mine, Waterbomb, Icebomb, Waterfly, Rocket, RocketFirstRank, Thunderbolt, Ufo, Magnet, Siren, Shield, Angel, Emp, Cloud, Lock, Snowstorm, Bush. Cloud, Lock, Snowstorm and Bush appear only in special or event contexts; they have a 0% drop rate in the standard tables.

---

## 2. KRD item catalogue

A shield or angel blocks everything **except UFO and magnet**. UFO can be blocked **only** by EMP. Magnet can be cleared by EMP since the 2023-06-08 patch.

| KR / EN | Type | Targeting / behaviour | Effect | Counterplay and notes |
|---|---|---|---|---|
| 부스터 Booster | Speed | Self | Large speed increase for a short time. **Shorter than the speed-mode booster.** Tuning upgrades don't apply. | Mostly given to low ranks. Good for shortcuts that need speed. |
| 팀 부스터 Team Booster | Speed | Self (team modes) | Booster variant | Class exists in client |
| 자석 Magnet | Speed | **Aimed** at one racer (like the missile). Missing the lock wastes it. | You are pulled quickly toward the target for a short time | Shield/angel **cannot** block it. **EMP** releases it on yourself or teammates, but not a magnet fired by a teammate. Combo "짜부" = magnet + booster; magnet + siren just before the finish. |
| 사이렌 Siren | Speed/attack | Self, contact | Booster-level speed for a while. Racers you bump get the **banana slip** effect. | Shield/angel block it. In team play, bumping a teammate hurts **both** of you. Special or kart-body only; the 강화 사이렌 variant accelerates harder. |
| 미사일 Missile | Attack | **Aim at one racer** with Ctrl. The reticle turns red when locked. It can fire **through walls** ("벽미") and **backwards** at a racer behind you ("빽미"). | Target is knocked out of control briefly (airborne). A balloon turns this into a slip. | Shield/angel. The target sees and hears the warning and can time a shield. |
| 1등 미사일 First-place Missile | Attack | **Automatically hits 1st place** as soon as it's used. It has its own distinct launch sound. | Same as missile | Fails and is consumed if **you are 1st** or **the leader is a teammate**. 0% in the standard tables (confirmed cubes only). |
| 물폭탄 Water Bomb | Attack | Thrown a **fixed distance ahead**, and it **always lands on the track centre**. | Everyone inside the radius is trapped in water and can't steer | Dodge by driving along the side of a wide track, or shield it. "센실" = raising a shield early for a bomb in the centre; "칼물" = judging the distance to drop it right on someone. The bomb is coloured by team and **hits teammates too**. |
| 다발 물폭탄 Bunch Water Bomb | Attack | 3–5 small bombs spread over a wider area | Same trap | Kart-body variant |
| 물파리 Water Fly | Attack | Flies to the **racer directly ahead of you in rank** ("바로 앞 순위 상대"). Fast. | Trap, **shorter than the water bomb** | Shield/angel, timed from the incoming sound and visual. Slang: 일파 (at 1st), 이파 (at 2nd). |
| 책 Book | Attack | Replaces the water fly on one kart body. Pulls an airborne target down to the ground. | Bind that **can't be mashed out** and ignores balloons | Shield/angel |
| 폭격폭탄 Bombard | Attack | Creates a bombing zone ahead; racers inside take a missile hit | Missile effect | Kart-body variant of the missile |
| 벼락 Thunderbolt | Attack | **Every opponent ahead of you** | Electrocuted, can't move briefly | Shield/angel; balloons shorten it. Only 7th–8th get it. |
| 우주선 UFO | Attack | Summoned over **1st place**. Doesn't fire if a teammate is 1st. | Leader is slowed (tractor beam). **Several UFOs stack.** | **Only EMP** blocks it, and one EMP clears all UFOs. Best used before shortcuts or hills. |
| 바나나 Banana | Trap | Dropped **behind**. **Only 1st place gets it** (2nd–3rd get 10%). | Whoever drives over it slips and loses control briefly | Shield/angel. Hits teammates too. "인빠" = a banana on the inside line of a corner. |
| 대왕 바나나 Giant Banana | Trap | Larger banana | Same slip | Shield/angel |
| 바리케이드 Barricade | Trap | Places **3 blocks in a line in front of the 1st-place racer** (only 1 on narrow paths or shortcuts) | Hitting one disrupts driving; the block then disappears. **No slowdown if placed on a rail.** | Shield/angel. **Placed even when the leader is a teammate.** |
| 지뢰 Mine | Trap | **3 mines behind you, in a line** | Launches the victim into the air **even with a balloon** | Shield/angel. Special mode or kart-body only. |
| 실드 Shield | Defence | Self | Blocks **one** attack within a time window; blocks item and skill attacks | Doesn't stop UFO or magnet |
| 천사 Angel | Defence (team) | **You and all teammates** | Blocks **one** attack each for a time window (since the 2023-06-08 patch; it used to be timed invulnerability) | Doesn't stop UFO or magnet. Team call-out "천!" asks a teammate to use it. |
| 전자파 EMP | Defence | Self (solo) or self plus team | Removes all UFOs, and releases magnet effects on yourself or teammates | Mostly given to 1st |
| 스캐너 Scanner | Utility (team) | Your whole team | Shows the opposing team's held items on the standings board for a while | Team modes only; **can't be blocked** |
| 구름 / 자물쇠 / 얼음폭탄 Cloud / Slot Lock / Ice Bomb | Event | — | Vision block / slot lock / longer trap | 0% in the standard tables |

---

## 3. KRD drop rates by rank bucket (kart.cafe dataset, circa 2023–24, before the Dec 2024 confirmed cubes)

Buckets for 8 players: **Top = 1st, High = 2nd–3rd, Mid = 4th–6th, Low = 7th–8th.** Numbers are percentages and each bucket sums to 100.

**Solo**
- **1st:** Shield 55, Banana 25, EMP 15, Booster 5
- **2nd–3rd:** Shield 20, Missile 20, Water Fly 15, Booster 10, Banana 10, Water Bomb 10, UFO 5, Magnet 5, Barricade 5
- **4th–6th:** Booster 30, Missile 20, Water Bomb 15, Magnet 15, Water Fly 10, UFO 5, Barricade 5
- **7th–8th:** Booster 55, Magnet 25, UFO 5, Water Bomb 5, Thunderbolt 5, Barricade 5

**Duo**
- **1st:** same as solo
- **2nd–3rd:** Missile 20, Shield 20, Booster 15, Water Fly 15, Banana 10, Water Bomb 10, UFO 5, Magnet 5
- **4th–6th:** Booster 30, Missile 15, Water Fly 15, Water Bomb 10, Magnet 10, EMP 5, UFO 5, Angel 5, Barricade 5
- **7th–8th:** Booster 50, Magnet 25, UFO 5, Water Bomb 5, Thunderbolt 5, Angel 5, Barricade 5

**Squad**
- **1st:** same as solo
- **2nd–3rd:** Missile 20, Booster 15, Shield 15, Water Fly 15, Banana 10, Water Bomb 10, UFO 5, Magnet 5, Angel 5
- **4th–6th:** same as duo
- **7th–8th:** Booster 45, Magnet 20, UFO 10, EMP 5, Water Bomb 5, Thunderbolt 5, Angel 5, Barricade 5

What the tables show:
- 1st place gets **no forward attacks** at all: 80% is defence or rear traps.
- 7th–8th get **75–80% speed items** (booster plus magnet).
- 2nd–3rd are the **attack bucket** (missile, water fly).
- Team modes move shield weight toward angel and EMP.

### Classic KartRider weights (emulator XML, for extra ideas)

Classic uses the same four bands (`toprank/highrank/midrank/lowrank`). Weights are summed per band and an item is picked by weighted random choice.

**Individual**

| Item | Top | High | Mid | Low |
|---|---|---|---|---|
| Banana | 25 | 0 | 0 | 0 |
| Dark cloud 먹구름 | 20 | 0 | 0 | 0 |
| Shield | 40 | 25 | 0 | 0 |
| EMP | 15 | 0 | 0 | 0 |
| Devil 대마왕 | 0 | 2 | 2 | 2 |
| Guided missile | 0 | 0 | 5 | 3 |
| UFO | 0 | 0 | 5 | 6 |
| Barricade | 0 | 0 | 5 | 5 |
| Missile | 0 | 23 | 20 | 0 |
| Water bomb | 0 | 20 | 11 | 0 |
| Water fly | 0 | 25 | 10 | 0 |
| Lightning 번개 | 0 | 0 | 3 | 1 |
| Booster | 0 | 0 | 24 | 51 |
| Magnet | 0 | 5 | 15 | 32 |

**Team** adds Scope/Scanner (Top 12), Item Lock (Mid 3 / Low 2), Angel (High 2 / Mid 5 / Low 2) and Time Bomb (High 3 / Mid 5). It moves weight from bombs and missiles to booster (Low 55).

Other classic rules:
- A racer **more than a full lap behind the racer ahead gets only boosters**.
- The emulator's fallback banding for 8 players: index 0 = Top, 1–2 = High, 3–5 = Mid, 6–7 = Low. This matches KRD's 1 / 2–3 / 4–6 / 7–8.
- The emulator can also band by gap to the leader: <300 = High, 300–500 = Mid, ≥500 = Low (its own units).

---

## 4. Classic KartRider items and approximate numbers (enha mirror)

- **Durations:** booster ≈3 s, magnet ≈4 s, siren ≈5 s, shield ≈2 s (one hit), angel ≈4 s (timed invulnerability, blocked even the devil), golden/protect shield ≈4 s, UFO ≈5 s at about **−50% speed** (stacks), devil (reverses left/right for everyone except the user) ≈3 s, Doctor R (reverses left/right and up/down) ≈5 s, dark cloud ≈5 s (the minimap is unaffected, and a sound tells you when you've passed it), ghost (invisible) ≈8 s.
- **Lifetimes on the track:** banana, mine and water mine each last **30 s**. Mines come in **3s**, water mines in **2s**. Toxic water bomb locks your slots for ≈3 s after you escape. Ice bomb ≈5 s. Rocket pod = 5 missiles at once.
- **Other items:** item changer (re-roll, about 5 uses) and slot changer (rotate slots with Alt).
- **Items classic had and KRD lacks:** reversed controls (devil), vision block (cloud/ink), guided missile, slot lock, time bomb, invisibility.

---

## 5. Design takeaways for ClaudeRider

1. Keep the **2-slot inventory** and the **"use it to dump it" economy**. That is where most of the skill in managing items comes from.
2. Keep the **four-bucket rubber band** as a data table, and add a **distance override** borrowed from classic.
3. Keep the **two defence exceptions**. The anti-leader slow can't be shielded, and the pull-toward-target item can't be shielded; one dedicated counter item handles both. This gives 1st place a real reason to hold something other than a shield.
4. **Homing attacks always hit unless blocked.** Counterplay comes from warning cues plus timing the shield, not from steering away. **Area attacks** (bomb, traps) can be dodged by where you drive.
5. Traps can be **mashed out of** and end with an **escape boost**. This keeps the frustration of being hit low.
6. **Friendly fire exists** in KRD team modes for bombs, bananas, siren and barricade. ClaudeRider should expose this as a toggle and default it **off** in casual play.

---

## 6. Proposed ClaudeRider item set (18 items: 15 core, 3 team-only). All names are original. All parameters are PROPOSED.

Assumptions: 1 world unit = 1 m. The base kart top speed is `Vmax` (the tuning reference is ≈40 m/s). "Hit" means the effect was applied and not absorbed by a shield. Every item uses the same defence rule: **Context Shield / Alignment Halo block everything except Throttle Drone and Attention Tether; only Interrupt Pulse clears those two.**

| # | ID / name | KRD role it replaces | Visual / audio theme |
|---|---|---|---|
| 1 | `turbo_token` **Turbo Token** | Booster | A glowing coral token sucked into the exhaust; rising saw tone with a noise whoosh |
| 2 | `attention_tether` **Attention Tether** | Magnet | Beam of "attention heads" (lines of dots) locking onto the target; FM warble |
| 3 | `overclock_aura` **Overclock Aura** | Siren | Kart glows with a spinning spark halo and red/blue "overclock" strobes; two-tone synth siren |
| 4 | `prompt_missile` **Prompt Missile** | Missile | Capsule with Claude-spark fins and a text ribbon trail (`>_`); lock beeps |
| 5 | `top1_missile` **Top-1 Missile** | First-place Missile | Gold version with a "#1" glyph; distinct fanfare launch |
| 6 | `token_bomb` **Token Bomb** | Water Bomb | Lobbed sphere that bursts into a bubble full of floating token glyphs; falling whistle, then a pop |
| 7 | `bug_report` **Bug Report** | Water Fly | A cute flying "bug" that wraps its target in a bubble; buzzing that gets louder |
| 8 | `broadcast_bolt` **Broadcast Bolt** | Thunderbolt | Sky flash and a bolt onto every racer ahead; noise crack plus sub boom |
| 9 | `throttle_drone` **Throttle Drone (429)** | UFO | Hovering hex drone showing "429" with a tractor-beam cone; 90 Hz saw hum with a 6 Hz wobble |
| 10 | `firewall` **Firewall** | Barricade | Brick-shader blocks with flame noise, dropped in front of the leader |
| 11 | `glitch_puddle` **Glitch Puddle** | Banana | Pixel-noise decal with an RGB-split shader; bit-crushed squelch |
| 12 | `redaction_cloud` **Redaction Cloud** | Classic dark cloud | Ink-black particle cloud; victims' screens covered in ████ bars; low-pass whoosh |
| 13 | `mirror_mode` **Mirror Mode** | Classic devil | Mirrored-arrow glyph over each victim; descending arpeggio |
| 14 | `context_shield` **Context Shield** | Shield | Fresnel bubble with a scrolling token-window texture; bell-like FM chime, glass pop when it absorbs a hit |
| 15 | `interrupt_pulse` **Interrupt Pulse (Ctrl+C)** | EMP | Expanding ring with a "^C" glyph; bandpass noise sweep |
| 16 | `alignment_halo` **Alignment Halo** (team) | Angel | Gold torus halo over every teammate; choir-like pad |
| 17 | `interpretability_lens` **Interpretability Lens** (team) | Scanner | Magnifier UI over the standings that reveals enemy slots; soft scan blip |
| 18 | `mutex_lock` **Mutex Lock** (team) | Classic item lock | Padlock icon over enemy slots; heavy clunk |

### Parameters (PROPOSED)

1. **Turbo Token**
   - 2.0 s of boost: speed cap ×1.30 Vmax, acceleration +60%.
   - Using a second one while boosting adds 2.0 s, capped at 3.0 s remaining.
   - Why: classic booster ≈3 s and KRD's item-mode booster is shorter than speed mode's, so 2 s.

2. **Attention Tether**
   - Aim cone ±18°, range 25–150 m, lock time 0.35 s. No lock means the item is wasted (KRD rule).
   - Pull lasts 2.2 s at max(target speed ×1.25, 1.2 Vmax).
   - Ends when you are within 4 m behind the target, then gives a 0.6 s slingshot at ×1.25.
   - Breaks if you're blocked by a wall for more than 0.3 s, or if either side uses Interrupt Pulse.
   - Shields don't block it. Why: classic magnet ≈4 s; shorter here because the slingshot adds reward.

3. **Overclock Aura**
   - 3.0 s of boost at ×1.30.
   - Contact radius 2.2 m. The victim gets Spin 1.0 s at ×0.45 speed. The user is immune to spins during it.
   - In team mode, hitting a teammate spins **both** of you (KRD rule) when friendly fire is on.

4. **Prompt Missile**
   - Lock cone ±20°, range 10–180 m, lock time 0.5 s (reticle goes yellow, then red).
   - Holding look-back lets you lock onto a racer behind you.
   - Projectile speed max(1.6 Vmax, target speed + 20 m/s). Lifetime 8 s. Passes through walls.
   - Hit: **Airborne 1.1 s**, land at ×0.25 speed, recover to normal over 1.0 s.
   - Target warning: a HUD arrow plus beeps from ETA 2.0 s, with the beep interval shrinking from 400 to 80 ms.

5. **Top-1 Missile**
   - No aim needed; homes on the leader at 1.9 Vmax. Hit is the same as the Prompt Missile.
   - Fizzles, and is consumed, if you're 1st or the leader is a teammate.

6. **Token Bomb**
   - Lobbed for 0.7 s. Lands 32 m ahead of the thrower, **projected onto the centreline** (KRD rule). On a 14–18 m wide track, the edges are safe.
   - Blast radius 6.5 m (horizontal), vertical tolerance 3 m, so a jumping kart above 3 m is unaffected.
   - **Trap 2.2 s.** Each alternating left/right press takes off 0.12 s, down to a minimum of 0.8 s.
   - Escape boost 0.5 s at ×1.15.
   - Hits the thrower too. Friendly fire follows the team toggle.

7. **Bug Report**
   - Homes on the **opponent directly ahead in rank**, skipping teammates, at 2.0 Vmax. Lifetime 6 s.
   - **Trap 1.4 s**, −0.1 s per mash press, minimum 0.6 s. Same escape boost.
   - Why: KRD's water fly is shorter than the water bomb.

8. **Broadcast Bolt**
   - After a 0.35 s warning (sky flicker, which is the chance to shield), every opponent ahead of you is stunned for 0.9 s (×0.5 speed, no steering), then slowed to ×0.8 for 0.8 s.
   - 7th–8th only.

9. **Throttle Drone**
   - Targets the leader, unless the leader is a teammate (then it fizzles). Takes 1.2 s to arrive.
   - Effect: **speed cap ×0.60 Vmax for 3.5 s** and drift-gauge charging ×0.5.
   - Each extra drone adds 1.5 s and lowers the cap by a further 0.08, up to 3 drones (floor ×0.44).
   - Only Interrupt Pulse removes it. Why: classic UFO ≈5 s at −50%; shorter here because it stacks.

10. **Firewall**
    - 3 blocks (2.4×1.6×1.2 m, 3 m apart sideways) placed 45 m ahead of the leader on the leader's racing line. Only 1 block where the track is narrower than 8 m.
    - Lifetime 15 s. A collision gives speed ×0.35 plus a bounce, and the block shatters.
    - No slowdown on rails or boost pads (KRD rule). A shield absorbs it.
    - Team mode: aimed at the highest-ranked **opponent** (a deliberate change from KRD). A KRD-faithful toggle is available.

11. **Glitch Puddle**
    - Dropped behind by default; holding "up" throws it 18 m forward.
    - Trigger radius 1.3 m. Effect: Spin 1.0 s at ×0.45 speed.
    - Lasts **30 s** (classic banana), with at most 5 per owner (the oldest disappears).

12. **Redaction Cloud**
    - Dropped behind: a 10 m radius volume that lasts 10 s.
    - Anyone passing through gets the overlay for 3.0 s: fully opaque for 2.0 s, then fading.
    - The minimap stays visible (classic rule). AI racers get more perception noise instead.
    - 1st only.

13. **Mirror Mode**
    - After a 0.5 s warning glyph, every opponent ahead of you has **reversed steering for 2.5 s**.
    - A shield blocks it (one consistent rule; classic's devil couldn't be blocked).

14. **Context Shield**
    - A 3.0 s window that absorbs **1 hit**, followed by 0.3 s of grace.
    - Blocks every attack except Throttle Drone and Tether. Why: classic ≈2 s was tuned for older netcode; 3 s allows for ~100 ms online latency.

15. **Interrupt Pulse**
    - Instant. Removes every Throttle Drone on you (solo) or your whole team, including drones still flying in.
    - Breaks any tether pulling you or a teammate that was fired by an opponent (KRD: not a teammate's).
    - Gives 1.5 s of immunity to new drones.

16. **Alignment Halo** (team)
    - Every teammate gets a 1-hit shield for 3.5 s (KRD Drift: team-wide, one hit).

17. **Interpretability Lens** (team)
    - Shows the opposing team's slots on the standings board for 10 s. Can't be blocked.

18. **Mutex Lock** (team)
    - Opponents can't use items for 2.5 s (they can still pick them up). Halo or shield blocks it.

**General status rules:**
- Hard crowd-control effects (Airborne, Trap, Stun, Spin) **refresh rather than stack**: new remaining = max(current, incoming).
- After recovering from a hard effect, a racer gets **0.6 s** of immunity to hard effects, to stop chain-locking.
- Throttle Drone is the only effect that stacks.
- While Airborne above 3 m, you can't be hit by puddles, bombs or Firewall.

---

## 7. ClaudeRider probability tables (PROPOSED weights, each bucket sums to 100)

### Solo

**1st:**
- context_shield 48
- glitch_puddle 22
- interrupt_pulse 13
- redaction_cloud 12
- turbo_token 5

**2nd–3rd:**
- prompt_missile 20
- context_shield 18
- bug_report 15
- token_bomb 10
- turbo_token 10
- glitch_puddle 8
- throttle_drone 5
- attention_tether 5
- firewall 4
- interrupt_pulse 3
- mirror_mode 2

**4th–6th:**
- turbo_token 26
- prompt_missile 18
- token_bomb 14
- attention_tether 14
- bug_report 10
- throttle_drone 5
- firewall 5
- top1_missile 3
- mirror_mode 3
- overclock_aura 2

**7th–8th:**
- turbo_token 45
- attention_tether 22
- overclock_aura 8
- broadcast_bolt 6
- throttle_drone 6
- top1_missile 5
- token_bomb 4
- firewall 4

### Team (duo and squad)

**1st:**
- context_shield 40
- glitch_puddle 20
- interrupt_pulse 13
- interpretability_lens 12
- redaction_cloud 10
- turbo_token 5

**2nd–3rd:**
- prompt_missile 20
- context_shield 15
- bug_report 15
- turbo_token 12
- token_bomb 8
- glitch_puddle 8
- alignment_halo 5
- throttle_drone 5
- attention_tether 5
- interrupt_pulse 3
- mutex_lock 2
- mirror_mode 2

**4th–6th:**
- turbo_token 26
- prompt_missile 15
- attention_tether 12
- bug_report 12
- token_bomb 10
- throttle_drone 5
- alignment_halo 5
- interrupt_pulse 5
- firewall 4
- top1_missile 2
- mutex_lock 2
- mirror_mode 2

**7th–8th:**
- turbo_token 42
- attention_tether 20
- throttle_drone 8
- overclock_aura 7
- broadcast_bolt 5
- alignment_halo 5
- interrupt_pulse 5
- top1_missile 4
- firewall 4

### Choosing the bucket (server-side)

- Rank 1 is Top.
- Otherwise compute p = (rank − 1) / (N − 1). p ≤ 0.30 is High, p ≤ 0.72 is Mid, anything higher is Low. With N = 8 this gives exactly 1 / 2–3 / 4–6 / 7–8.
- **Distance overrides:**
  - More than 350 m behind the leader: shift down one bucket (at most to Mid).
  - More than 600 m behind: Low.
  - More than 1 lap behind the racer ahead: turbo_token only (classic rule).
- **Validity rerolls** (up to 3, then fall back to turbo_token):
  - top1_missile or throttle_drone when the leader is you or a teammate.
  - A team-only item in solo mode.
- **Optional anti-dogpile rule:** if the leader has taken 3 or more hits in the last 6 s, halve the weights of items that target the leader.

---

## 8. Item box ("Prompt Cube") layout (PROPOSED unless noted)

- **Rows** of 4–6 cubes across the track, about 3 m apart; one row per ~300 m, so 3–5 rows per lap. The first row sits at least 150 m after the start line.
- **Collection:** pickup radius 1.8 m. Each cube **respawns 2.5 s** after it's taken.
- **Roulette:** 0.5 s, during which you can't use the new item.
- **Full slots:** the cube still breaks but you get no item (KRD behaviour).
- **Special cubes** (KRD, Dec 2024):
  - A **Fixed cube** shows its item icon and always gives that item, at most one per row.
  - A **Double cube** is gold and gives 2 items.
  - Neither kind appears in the first or last row of a lap (sourced rule). Roughly one double cube per two rows.

---

## 9. Implementation notes (TypeScript, Three.js, Node WebSocket)

**Authority**
- The server decides progress along the track, ranks, cube validity, item rolls, projectile timing, hit resolution and status effects.
- Clients only send inputs and requests: `useItem{slot, aimTargetId?, clientTick}`, `swapSlots`.
- Pickups are checked on the server: the kart must be within 3 m of an active cube. The P5136 port's "trust client rank" mode is fine for LAN play but shouldn't be used online.

**Tick rates and messages**
- Server simulates at 30 Hz and sends snapshots at 20 Hz. Clients render at 60 fps or more, 100 ms behind (interpolated).
- Server events: `itemGranted`, `itemFired{id, type, owner, target, startTick, seed}`, `effectApplied{racer, type, startTick, endTick, source}`, `blocked{racer, by}`, `feed{attacker, victim, item, result}`.
- Durations are stored in server ticks. Clients render effects from the start and end ticks.

**Homing with breadcrumbs** (so homing attacks never miss unless blocked)
- The server records each kart's position 20 times a second and keeps the last 5 s.
- A homing projectile travels along its target's recorded path at its own speed. It therefore follows shortcuts and jumps and ignores walls.
- A hit is resolved on the server when the projectile's distance along the path ≥ the target's distance − 2 m.
- In the last 0.25 s, clients switch to a direct 3D chase of the target's rendered position so it looks right.
- The server works out the arrival time up front, so incoming warnings start exactly 2.0 s before impact.

**Aim validation**
- For Prompt Missile and Tether, the server checks the aim cone and range against target positions rewound by min(RTT/2, 120 ms).
- If that check fails, the item is consumed and the client gets a "no lock" result (KRD behaviour).

**Area effects** (bomb, puddle, Firewall, cloud)
- Stored as server-owned entities, bucketed into 20 m sections of the track so each kart only checks nearby ones.
- Bomb: the detonation point is fixed when it's thrown; the check uses **server-time** positions, so the victim gets the benefit of the doubt. Horizontal radius 6.5 m, |dy| ≤ 3 m.
- The local player's client predicts its own trap hits for instant feel. The server confirms or reverts them, for example if a shield absorbed the hit.

**Status effects**
- A central state machine per racer: Boost, Airborne, Trapped, Spin, Stun, Slowed (stacking drones), Blinded, Reversed, Tethered, Shielded, Haloed, SlotLocked, plus a post-effect immunity timer.
- Every item is expressed as data (JSON with durations and multipliers) so balance can be patched without code changes.

**Offline play and AI**
- The same simulation runs locally for single-player against AI, using a seeded random generator (mulberry32) per race.
- AI rules of thumb:
  - Shield when an incoming warning is under 0.4 s + reaction delay.
  - Fire missiles as soon as they lock.
  - Hold a puddle until a pursuer is within 15 m behind.
  - Use Turbo on straights or shortcuts.
  - Pulse as soon as a drone arrives.
  - Mash out of traps at 6–12 presses per second depending on difficulty.
  - Reaction delay 150–450 ms by difficulty.
- The AI's rank bucket uses the same table as players.

**Attack statistics**
- Per racer: attacks landed, attacks blocked by opponents, blocks made, hits taken, traps escaped quickly.
- Shown in the kill feed and on the results screen. The character cheers when an attack lands and sulks when it's blocked (as in KRD).

**Procedural assets**
- Visuals: shader materials (fresnel bubble, RGB-split glitch decal, brick-flame firewall, additive beam cones), canvas textures for glyphs ("429", "^C", token symbols, #1), ribbon trails, and full-screen overlay passes for Redaction and Mirror.
- Audio: Web Audio patches built from oscillators, noise, filters and envelopes, one per item as listed in the §6 table. Warning beeps are panned toward where the threat is coming from.

**Character skills (optional)**
- To match KRD's skill layer, each Claude variant gets one skill on a 15–27 s cooldown, for example a "Spark Hop" jump at 17 s or a "Parry Prompt" 0.15 s perfect-block window at 15 s.
- Rule: at most one hard-effect skill per variant.

## Key parameters

- **krd.item_slots**: 2 (Left Alt picks which is used first; default left) [sourced] — namu.wiki/gamevu search snippets; KartDocs lodumani.mdx
- **krd.slot_swap_limit**: 5 swaps per race (unverified) [sourced] — GameSpew/HighGroundGaming search-result summary
- **krd.aim_fail_consumes_item**: true for missile and magnet [sourced] — KartDocs missile.mdx, magnet.mdx
- **krd.rank_buckets_8p**: Top=1, High=2-3, Mid=4-6, Low=7-8 [sourced] — kart.cafe rankDefs.json
- **krd.drop.solo.top**: {Shield:55,Banana:25,EMP:15,Booster:5} [sourced] — kart.cafe solo.json
- **krd.drop.solo.high**: {Shield:20,Missile:20,WaterFly:15,Booster:10,Banana:10,WaterBomb:10,UFO:5,Magnet:5,Barricade:5} [sourced] — kart.cafe solo.json
- **krd.drop.solo.mid**: {Booster:30,Missile:20,WaterBomb:15,Magnet:15,WaterFly:10,UFO:5,Barricade:5} [sourced] — kart.cafe solo.json
- **krd.drop.solo.low**: {Booster:55,Magnet:25,UFO:5,WaterBomb:5,Thunderbolt:5,Barricade:5} [sourced] — kart.cafe solo.json
- **krd.drop.duo**: top same as solo; high {Missile:20,Shield:20,Booster:15,WaterFly:15,Banana:10,WaterBomb:10,UFO:5,Magnet:5}; mid {Booster:30,Missile:15,WaterFly:15,WaterBomb:10,Magnet:10,EMP:5,UFO:5,Angel:5,Barricade:5}; low {Booster:50,Magnet:25,UFO:5,WaterBomb:5,Thunderbolt:5,Angel:5,Barricade:5} [sourced] — kart.cafe duo.json
- **krd.drop.squad**: top same as solo; high {Missile:20,Booster:15,Shield:15,WaterFly:15,Banana:10,WaterBomb:10,UFO:5,Magnet:5,Angel:5}; mid same as duo; low {Booster:45,Magnet:20,UFO:10,EMP:5,WaterBomb:5,Thunderbolt:5,Angel:5,Barricade:5} [sourced] — kart.cafe squad.json
- **krd.zero_rate_items**: Mine, Cloud, RocketFirstRank, SlotLock, Siren, IceBomb (special cubes/kart bodies/events only) [sourced] — kart.cafe drop tables; SDK class list (Evestir/Nothing)
- **krd.defense_rule**: Shield/Angel block 1 hit of everything except UFO and Magnet; only EMP blocks UFO; EMP clears magnet (since 2023-06-08) but not a teammate's [sourced] — KartDocs shield/angel/electromagnetic/magnet/spaceship
- **krd.angel_change**: 2023-06-08: Angel unified to 1-hit block (team-wide) [sourced] — KartDocs angel.mdx
- **krd.barricade**: 3 blocks in a line in front of 1st (1 on narrow/shortcut); vanish on hit; no slow on rails; placed even if leader is teammate [sourced] — KartDocs baricade.mdx
- **krd.water_bomb**: thrown fixed distance ahead, always lands at track centre; radius trap; hits teammates; team-coloured [sourced] — KartDocs waterbomb.mdx
- **krd.water_fly**: targets opponent directly ahead in rank; trap shorter than water bomb [sourced] — KartDocs waterfly.mdx
- **krd.first_missile**: auto-hits 1st; fails if user is 1st or leader is teammate; distinct launch SFX [sourced] — KartDocs 1stmissile.mdx
- **krd.ufo**: summoned on 1st (not if teammate leads); slows; stacks; only EMP blocks; one EMP clears all [sourced] — KartDocs spaceship.mdx
- **krd.thunderbolt**: strikes all opponents ahead; brief immobilize; low ranks only (7-8th 5%) [sourced] — KartDocs thunderbolt.mdx; kart.cafe
- **krd.mine**: 3 mines behind in a line; launch airborne ignoring balloon [sourced] — KartDocs landmine.mdx
- **krd.bunch_water_bomb**: 3-5 small bombs over wider area [sourced] — KartDocs bunchwaterbomb.mdx
- **krd.trap_escape**: alternate L/R mashing; automatic escape boost; UI shows remaining presses [sourced] — namu.wiki patch-note search snippet
- **krd.special_cubes**: Confirmed cube + double cube since 2024-12-05; later reduced; never in first/last cube row [sourced] — KartDocs character pages; kartdrift.nexon.com patch snippet
- **krd.skill_cooldowns**: Dao jump 17s; Bazzi 18s (first 9s, ball rolls up to 5s); ZP Mayor 15s (first 7.5s, ~0.1s parry); Lodumani 27s; Rave 3s shield x4; Toto 78% missile->bombard [sourced] — KartDocs character pages
- **krd.skills_restored**: 2025-04-24 item-mode revamp: skills back on characters; skill practice area [sourced] — gamemeca/byline search snippets
- **classic.drop.individual**: Top{Banana25,Cloud20,Shield40,EMP15}; High{Devil2,Missile23,WaterBomb20,WaterFly25,Shield25,Magnet5}; Mid{Devil2,GuidedMissile5,UFO5,Barricade5,Missile20,WaterBomb11,WaterFly10,Lightning3,Booster24,Magnet15}; Low{Devil2,GuidedMissile3,UFO6,Barricade5,Lightning1,Booster51,Magnet32} [sourced] — SEUNGJU-PARK-KR/KartRider-Launcher-KR GameSlotPacket.cs
- **classic.drop.team_extras**: Scope Top12; ItemLock Mid3/Low2; Angel High2/Mid5/Low2; TimeBomb High3/Mid5; Booster Low55 [sourced] — KartRider-Launcher-KR GameSlotPacket.cs
- **classic.lap_behind_rule**: more than 1 lap behind the racer ahead => booster only [sourced] — enha mirror 아이템.md
- **classic.durations**: booster~3s, magnet~4s, siren~5s, shield~2s(1 hit), angel~4s, UFO~5s at ~-50% speed, devil~3s, DoctorR~5s, cloud~5s, ghost~8s, toxic slot-lock~3s, ice bomb~5s [sourced] — enha mirror 아이템.md
- **classic.ground_lifetimes**: banana/mine/water-mine 30s; mines x3; water mines x2 [sourced] — enha mirror 아이템.md
- **cr.bucket_fn**: rank1=Top; p=(rank-1)/(N-1); p<=0.30 High; p<=0.72 Mid; else Low [proposed] — matches KRD 1/2-3/4-6/7-8 for N=8
- **cr.distance_override**: >350m behind leader: -1 bucket (to Mid max); >600m: Low; >1 lap behind racer ahead: turbo_token only [proposed] — classic lap rule + emulator 300/500 bands
- **cr.drop.solo**: Top{context_shield48,glitch_puddle22,interrupt_pulse13,redaction_cloud12,turbo_token5}; High{prompt_missile20,context_shield18,bug_report15,token_bomb10,turbo_token10,glitch_puddle8,throttle_drone5,attention_tether5,firewall4,interrupt_pulse3,mirror_mode2}; Mid{turbo_token26,prompt_missile18,token_bomb14,attention_tether14,bug_report10,throttle_drone5,firewall5,top1_missile3,mirror_mode3,overclock_aura2}; Low{turbo_token45,attention_tether22,overclock_aura8,broadcast_bolt6,throttle_drone6,top1_missile5,token_bomb4,firewall4} [proposed] — derived from KRD solo table + classic cloud/devil
- **cr.drop.team**: Top{context_shield40,glitch_puddle20,interrupt_pulse13,interpretability_lens12,redaction_cloud10,turbo_token5}; High{prompt_missile20,context_shield15,bug_report15,turbo_token12,token_bomb8,glitch_puddle8,alignment_halo5,throttle_drone5,attention_tether5,interrupt_pulse3,mutex_lock2,mirror_mode2}; Mid{turbo_token26,prompt_missile15,attention_tether12,bug_report12,token_bomb10,throttle_drone5,alignment_halo5,interrupt_pulse5,firewall4,top1_missile2,mutex_lock2,mirror_mode2}; Low{turbo_token42,attention_tether20,throttle_drone8,overclock_aura7,broadcast_bolt5,alignment_halo5,interrupt_pulse5,top1_missile4,firewall4} [proposed] — derived from KRD duo/squad + classic team table
- **cr.slots**: 2; use front slot; swap order key; no discard (dump by using); full slots => box breaks, no item [proposed] — KRD rules
- **cr.cube_layout**: rows of 4-6 cubes, 3m spacing, row every ~300m (3-5 rows/lap), first row >=150m after start; pickup radius 1.8m; respawn 2.5s; roulette 0.5s [proposed] — game-design estimate
- **cr.special_cubes**: Fixed cube max 1/row; Double cube ~1 per 2 rows; neither in first/last row of lap [proposed] — mirrors KRD Dec-2024 rule
- **cr.turbo_token**: 2.0s, speed cap x1.30 Vmax, accel +60%, stacking extends to max 3.0s [proposed] — classic booster ~3s; KRD item booster shorter
- **cr.attention_tether**: cone ±18°, range 25-150m, lock 0.35s; pull 2.2s at max(target v x1.25, 1.2Vmax); release at 4m -> 0.6s slingshot x1.25; unblockable by shield; cleared by interrupt_pulse [proposed] — classic magnet ~4s
- **cr.overclock_aura**: 3.0s at x1.30; contact radius 2.2m -> victim Spin 1.0s x0.45; team contact spins both (toggle) [proposed] — classic siren ~5s
- **cr.prompt_missile**: cone ±20°, range 10-180m, lock 0.5s; speed max(1.6Vmax, target+20m/s); lifetime 8s; passes walls; hit Airborne 1.1s, land x0.25, 1.0s recovery; warning from ETA 2.0s [proposed] — KRD aimed missile behaviour
- **cr.top1_missile**: auto-target leader, 1.9Vmax, same hit; fizzles if user is 1st or leader teammate [proposed] — KRD 1st missile rule
- **cr.token_bomb**: lob 0.7s, lands 32m ahead on centreline; radius 6.5m, |dy|<=3m; trap 2.2s, -0.12s per alternating press, floor 0.8s; escape boost 0.5s x1.15; self-hit possible [proposed] — KRD centre-landing water bomb
- **cr.bug_report**: homes on opponent directly ahead in rank at 2.0Vmax, lifetime 6s; trap 1.4s, -0.1s/press, floor 0.6s [proposed] — KRD water fly shorter than bomb
- **cr.broadcast_bolt**: 0.35s telegraph; all opponents ahead: Stun 0.9s (x0.5, no steer) then Slow x0.8 for 0.8s [proposed] — KRD thunderbolt
- **cr.throttle_drone**: targets leader (fizzles if teammate); arrive 1.2s; speed cap x0.60 for 3.5s, drift charge x0.5; +1.5s and -0.08 cap per extra, max 3 stacks (floor x0.44); only interrupt_pulse clears [proposed] — classic UFO ~5s at -50%
- **cr.firewall**: 3 blocks 2.4x1.6x1.2m, 3m lateral spacing, 45m ahead of leader (1 block if width<8m); lifetime 15s; hit speed x0.35 + bounce; no slow on rails/boost pads [proposed] — KRD barricade
- **cr.glitch_puddle**: drop behind or toss 18m forward; trigger radius 1.3m; Spin 1.0s x0.45; lifetime 30s; max 5 per owner [proposed] — classic banana 30s
- **cr.redaction_cloud**: volume r=10m, 10s; overlay 3.0s (opaque 2.0s then fade); minimap unaffected; 1st only [proposed] — classic dark cloud ~5s
- **cr.mirror_mode**: 0.5s telegraph; opponents ahead steering reversed 2.5s; shield-blockable [proposed] — classic devil ~3s
- **cr.context_shield**: 3.0s window, absorbs 1 hit, +0.3s grace; blocks all except throttle_drone and attention_tether [proposed] — KRD shield rule; classic ~2s +latency
- **cr.interrupt_pulse**: instant; clears all drones (incl. in-flight) on self/team, breaks opponent tethers, 1.5s drone immunity [proposed] — KRD EMP
- **cr.alignment_halo**: team-only; all teammates 1-hit shield 3.5s [proposed] — KRD angel (1 hit, team)
- **cr.interpretability_lens**: team-only; reveal enemy slots on standings 10s; unblockable [proposed] — KRD scanner
- **cr.mutex_lock**: team-only; enemies cannot use items 2.5s; halo/shield blockable [proposed] — classic item lock
- **cr.status_rules**: hard CC refresh not stack (max(remaining,new)); 0.6s hard-CC immunity after recovery; only throttle_drone stacks; airborne >3m immune to ground traps/bombs [proposed] — anti-chain-stun design
- **cr.net**: server-authoritative, 30Hz sim, 20Hz snapshots, 100ms interpolation; aim validation rewind min(RTT/2,120ms); area hits use server-time positions; breadcrumb trail 20Hz x 5s for homing [proposed] — implementation design
- **cr.ai_item_use**: shield when incoming ETA < 0.4s + reaction; reaction 150-450ms by difficulty; mash 6-12 presses/s [proposed] — implementation design

## Open questions

- Exact KRD durations in seconds (shield window, trap length, UFO slow amount and length, booster length in item mode) were not found; the official patch notes and namu.wiki were blocked by the proxy.
- KRD cube respawn time, cubes per row and rows per track are unknown; the proposed values need playtesting.
- Is the reported limit of 5 slot-order swaps per race real? It came only from a search summary.
- The KRD team item-mode win condition was not confirmed here (classic: the team of the first finisher wins).
- KRD scanner drop rate: it isn't in the kart.cafe tables, which may predate it.
- The kart.cafe tables are from about 2023–24. Rates after the Dec 2024 OVERDRIVE patch (confirmed/double cubes) and the Apr 2025 revamp may differ.
- Product decision: should ClaudeRider keep KRD friendly fire (bomb, puddle, aura, Firewall on a teammate leader) by default, or default to team-safe with a KRD-faithful toggle?
- Vmax and the km/h display scale need to line up with the physics/handling research so the multipliers above turn into real speeds.

## Sources

- https://raw.githubusercontent.com/whotookzakum/kart.cafe/main/src/lib/data/itemModeDropRates/solo.json
- https://raw.githubusercontent.com/whotookzakum/kart.cafe/main/src/lib/data/itemModeDropRates/duo.json
- https://raw.githubusercontent.com/whotookzakum/kart.cafe/main/src/lib/data/itemModeDropRates/squad.json
- https://raw.githubusercontent.com/whotookzakum/kart.cafe/main/src/lib/data/itemModeDropRates/rankDefs.json
- https://raw.githubusercontent.com/whotookzakum/kart.cafe/main/src/lib/components/misc/ItemDropTable.svelte
- https://github.com/whotookzakum/kart.cafe
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/data/sidebar/learn/data.js
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/attack/banana.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/attack/bigbanana.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/attack/baricade.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/attack/waterbomb.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/attack/waterfly.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/attack/missile.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/attack/1stmissile.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/attack/thunderbolt.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/attack/spaceship.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/attack/siren.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/attack/landmine.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/defence/electromagnetic.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/defence/shield.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/defence/angel.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/defence/scanner.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/acceleration/magnet.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/acceleration/booster.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/special/sirenplus.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/special/bunchwaterbomb.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/special/book.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/special/bombard.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/wear/balloon.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/character/dao.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/character/bazzi.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/character/lodumani.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/character/derek.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/character/toto.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/character/mayorzipi.mdx
- https://raw.githubusercontent.com/Plush777/KartDocs/main/src/markdown/docs/learn/item/character/rave.mdx
- https://raw.githubusercontent.com/SEUNGJU-PARK-KR/KartRider-Launcher-KR/main/KartRider.Data/Room/GameSlotPacket.cs
- https://raw.githubusercontent.com/forkwikiman/enha/master/mirror/%ED%81%AC%EB%A0%88%EC%9D%B4%EC%A7%80%EB%A0%88%EC%9D%B4%EC%8B%B1%20%EC%B9%B4%ED%8A%B8%EB%9D%BC%EC%9D%B4%EB%8D%94/%EC%95%84%EC%9D%B4%ED%85%9C.md
- https://raw.githubusercontent.com/ILoveKartrider/P5136_Rust/main/crates/p5136-server/src/item_probability.rs
- https://raw.githubusercontent.com/ILoveKartrider/P5136_Rust/main/crates/p5136-core/src/item_gameplay_catalog.rs
- https://raw.githubusercontent.com/ILoveKartrider/P5136_Rust/main/ITEM_GAMEPLAY_COVERAGE.md
- https://github.com/Evestir/Nothing (Dump/Offsets item class names via GitHub code search)
- https://namu.wiki/w/카트라이더:%20드리프트/아이템 (search-result snippets only; direct fetch blocked)
- https://www.gamevu.co.kr/news/articleView.html?idxno=26166 (search snippets only)
- https://kartdrift.nexon.com/kartdrift/ko/news/update/view?threadId=2499132 (search snippets only)
- https://www.gamemeca.com/view.php?gid=1760756 (search snippets only)
- https://byline.network/2025/04/24-431/ (search snippets only)
- https://steamcommunity.com/sharedfiles/filedetails/?id=2922289220 (search snippets only)
- https://commonsensegamer.com/kartrider-drift-list-of-all-items-and-the-best-to-get/ (search snippets only)
- https://www.gamespew.com/2023/02/how-to-use-items-in-kartrider-drift/ (search snippets only)
