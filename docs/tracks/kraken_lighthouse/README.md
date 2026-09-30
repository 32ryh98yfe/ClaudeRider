# Kraken Lighthouse / 크라켄 등대 — `tracks/coral_cove/kraken_lighthouse.ctd`
D3, 3 × 1400 m, w 14. Signature `helix, hazard:swinger, hazard:geyser`: all built, no fallbacks.
- No baked terrain: the sea plus `cliff` rock props under every raised edge, and the lighthouse landmark at the helix
  centre.
- Lap: harbour straight → harbour corner → cliffside climb → R30 cliff S → **HELIX R36 360° +11 m** (stacked, turning
  number 2) → open cliff edge (`wallL=none:0:ledgeKill`) → cliff-edge S → headland → cannon-fort straight with three
  staggered cannonball **geysers** (launch, 1 s telegraph) → R16 fort corner → rampart S → cove descent → tide-pool
  corner → sea cave with two out-of-phase kraken-tentacle **swingers** → grotto S → cave exit → harbour return → quay
  → breakwater.
- Legend ghost 40.0 s (table 40.0 s, −0.1%). Bench: speed/pro 8/8, item/racer 8/8, 0 respawns, ≤ 0.25 hard hits per
  bot-lap (two seeds).
- Not shipped: the `waterfall_cave` shortcut. A first version split mid-wiggle (rejoin error 8.6°) and caused respawn
  loops, so it was removed. Follow-up: split it at the end of the cove-descent S.
- Hazards are invisible until L11's hazard renderer lands (`hazard_cannonball`, `hazard_tentacle` kit models are
  ready). Sunset lighting waits on `L12-track-env.md`.
- Screenshots: `shot-1.png` (helix approach), `shot-2.png` (the helix from above).
