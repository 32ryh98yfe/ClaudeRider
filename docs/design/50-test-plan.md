# 50 — Test plan

Owner: orchestrator (gates, e2e, matrices, full bakes); every lane owns its unit suites.
Sources: `02-contracts.md` §E (thresholds, binding), §C (milestone done criteria), the topic specs 10–40.
Rules: lanes run `pnpm vitest run --project <name> --maxWorkers=1` and `pnpm verify:lane`; only the orchestrator runs e2e, all-track bakes and net matrices (CPU discipline, R13). Never run `playwright install` locally; `@playwright/test` is pinned to 1.56.1 for chromium-1194 (ADR-001).

---

## 1. Commands (`pnpm verify` chains everything not marked nightly)
```
pnpm i --frozen-lockfile && pnpm gen && pnpm check:frozen && pnpm check:deps
pnpm typecheck                      # tsc -b, all packages
pnpm lint                           # eslint incl. determinism + boundary rules
pnpm test                           # vitest run (unit + integration, excludes @slow)      ≤ 3 min
pnpm test:physics                   # gap-2 target tables on tracks/_test
pnpm bake --all --validate --ghost  # 21 tracks, V1–V20, golden hash compare               ≤ 4 min (4 jobs)
pnpm test:races                     # RACE_SEEDS=1 CI / 3 nightly; 20 tracks × speed,item   ≤ 5 min
pnpm test:net                       # NET_MATRIX=smoke (CI) | full (nightly/M5)
pnpm bench                          # sim/AI/room/NetClient microbenchmarks
pnpm build && pnpm size             # vite build client + server typecheck; bundle budgets
pnpm e2e                            # Playwright 1.56.1 smoke (webServer: pnpm start:test on :8787)
pnpm e2e:tracks                     # 20-track screenshot contact sheet (nightly / M4 / M5)
pnpm verify:full                    # all of the above incl. nightly variants (M5 gate)
```
Lane gate: `pnpm verify:lane` = typecheck + lint + the lane's own vitest projects + the lane's own track bakes.

---

## 2. Acceptance thresholds (§E, binding)
| Area | Metric | Pass | Spec |
|---|---|---|---|
| Physics (M1+) | 0 → 100 km/h shown; 0 → 97% V_GRIP | 1.17 ± 0.05 s; 3.95 ± 0.10 s | `10-sim-spec.md` §14.1 |
| | Booster from 184 km/h | ≥ 237 km/h at 1.0 s; plateau 239–240; decay τ ≈ 1.1 s ± 0.15 | §14.2 |
| | Instant boost vs none, from 151 km/h | +11 ± 2 km/h at 0.5 s | §14.3 |
| | Walls at 30 m/s (10°/30°/60°) | Δv −3 ± 2 km/h / −47 ± 5 km/h / stun 15 ticks with booster cancelled | §14.4 |
| | Start boost gain at 5 s (PERFECT / FALSE) | +35 ± 3 m / −7 ± 3 m | §14.5 |
| | 90° R12 corner on a 12 m road at 34 m/s (AI) | drop ≤ 8%; gauge 0.30–0.43 per corner; clumsy drop 35–45 km/h | §14.6 |
| | Flat-plane oracle vs proto2d, 10 s scripted | position error ≤ 1e-6 m | §14.7 |
| Determinism | same log twice; Node vs Chromium; with items and contacts | identical `hashWorld` at every 100th tick | §15 |
| Tracks | V1–V20 | 0 errors; closure < 0.05 m (< 0.01 target) | `11-track-spec.md` §9 |
| | laps; race ref (speed) | `laps == clamp(round(115/refLapSec),1,5)`; 100–130 s; ghost within ±8% of the table | §12 |
| | bake artefacts | ≤ 20 s per track; `.ctrk` ≤ 1.5 MB; vis ≤ 2 MB gzip | §10–§11 |
| Races (headless, Pro tier ± jitter) | finishers | speed ≥ 7/8, item ≥ 6/8 before retire; no bot stuck > 5 s | `14-ai-spec.md` §12 |
| | incidents | hard wall hits ≤ 0.3 per bot-lap; respawns ≤ 0.5 per bot-lap (tracks without kill zones: 0.1) | |
| | coverage (item suite) | every item used ≥ 1×, every effect applied ≥ 1× | `12-items-spec.md` §11 |
| AI / balance | tier pace vs Legend ghost | Rookie 88 ± 2%, Racer 94 ± 2%, Pro 98 ± 1.5%, Legend ≥ 99.5%; archetypes within ±2% | `14-ai-spec.md` §2 |
| Net (SimLink smoke; M1–M12) | local correction without items at 100 ms | p99 ≤ 0.05 m | `20-netcode-spec.md` §13.4 |
| | remote-kart error at 100 ms | p95 ≤ 0.3 m | |
| | predicted BLOCK became HIT | 0 without loss; ≤ 0.2% at 100 ± 10 ms with 0.5% loss | |
| | roulette known before it lands (≤ 300 ms) | ≥ 99.9% | |
| | bandwidth | ≤ 24 KB/s down, ≤ 5 KB/s up | §12 |
| | resume after 2 s drop | state restored ≤ 1 s | §10 |
| | rollback cost | p99 ≤ 1.5 ms per frame at 200 ms RTT | §7.2 |
| Perf (bench) | `step` | ≤ 6 µs per kart-tick | `40-perf-budgets.md` §3.2 |
| | AI | ≤ 5 µs per kart-tick | |
| | room tick (8 karts, 7 bots, items) | p99 ≤ 0.5 ms | |
| | load | 50 rooms: tick p99 ≤ 4 ms | |
| Perf (e2e, Low, 960×540) | render counters | drawCalls ≤ 150 (Med 250, High 400); unique materials ≤ 40; triangles ≤ 0.6M (1.2M / 2M) | §1–§2 |
| | JS update (non-render) | p95 ≤ 4 ms; render-submit tracked ±20% vs baseline | §3.1 |
| E2E | boot → lobby | ≤ 8 s | §4 |
| | errors | zero console errors (allowlist) | |
| | solo race | autopilot finishes and results render | |
| | online | 2 contexts join a 6-char room, race 1-lap Proving Ring, both see results | |
| | screenshots | pixel variance above threshold on every track | |
| Bundle | sizes | initial JS ≤ 1.0 MB gzip; CSS ≤ 60 KB; first-screen fonts ≤ 400 KB; Tone chunk lazy | §5 |
| i18n / save | parity and migration | ko/en key parity 100%; migration fixtures v1 load; no raw keys in screenshots | `31-ui-spec.md` §12 |

---

## 3. Static gates
| Gate | Checks |
|---|---|
| `check:frozen` | sha256 of every file in `contracts.lock` unchanged unless the orchestrator updated the lock |
| `check:deps` | package import boundaries (ADR / §A table) |
| `lint` | `no-restricted-imports` per package; in `packages/sim/src/**` except `ai/**`: bans `Math.sin/cos/tan/asin/acos/atan/atan2/exp/expm1/log*/pow/hypot/cbrt/sinh/cosh/tanh`; everywhere in sim: `**`, `Math.random`, `Date`, `performance`, `Float32Array` state; three.js: bans `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile` |
| `typecheck` | strict, `noUncheckedIndexedAccess`, `erasableSyntaxOnly`, `verbatimModuleSyntax` |

---

## 4. Unit and integration suites (vitest projects)
| Project | Suite | Pass criteria |
|---|---|---|
| content | ids and codes | codes = index + 1; ids append-only (compared with the previous lock) |
| | registries | `loadContent()` succeeds; duplicate ids/codes throw |
| | drop tables | every bucket of solo/team (and the light/chaos variants) sums to 100 |
| | challenges, characters, karts, themes, tracks | schema-valid; kart specs within the archetype ±1% or flagged (`10-sim-spec.md` §3.2) |
| sim | math | `decayF` rel. error ≤ 0.175% for k ≤ 30; `smallSin/smallCos` error ≤ 1.2e-10 for \|a\| ≤ 0.1; `detSinCos` vs `Math.sin` ≤ 1e-9 |
| | quantization | `quantizeWorld` idempotent; snapshot encode/decode equals the quantized world bit-exactly |
| | input | `packInput`/`unpackInput` round-trip over all 2^48 field ranges (property test) |
| | dynamics | every K-step of `10-sim-spec.md` §6–§7 against hand-computed values |
| | walls, contacts, air | §10–§11 cases; contact symmetry |
| | race rules | laps, key gates, finish fraction, rank ties, retire timer, hard cap, respawn sequence ticks, wrong way, manual R |
| | items | per-item tick-exact timelines; CC rules; mash; buckets; rolls (authority only) |
| | rubber-band | `capMul` cases (§7 of the AI spec); off-switches |
| | ghosts | record → replay reproduces `hashWorld` |
| trackc | DSL | parse errors carry file/line/col; every grammar production |
| | CLOSE | Belltower and Magma fixtures close < 0.01 m; solved lengths written back |
| | frames | worldUp, RMF continuity through the loop fixture, bank last |
| | TriHash | ray and sphere queries equal a brute-force reference on 10k random queries; zero allocation |
| | validators | each V1–V20 has a seeded-violation test that fails and a clean case that passes |
| | formats | `.ctrk` writer → `loadCtrk` round trip; `.vis` → `decodeVis` round trip |
| net | codecs | random-world round trips; 1000-snapshot delta chains equal keyframes; malformed input rejected |
| | SimLink | smoke matrix (§6) |
| room | parity | offline Worker `RaceRoom` ≡ direct `step()` loop (hash every tick) |
| | FSM | load/race/results transitions, reconnect, AI takeover at 180 ticks |
| server | lobby | codes (alphabet, collisions), quick-match timers (20 s + 15 s), room start rules, host migration, rate limits, name/chat filters, `/health`, `/art/overrides/index.json` |
| client | i18n | ko/en key parity; `josa` cases; no missing `t()` keys in built screens |
| | save | v1 fixtures load; export/import round trip |
| | input | bindings, conflict detection, latching of short taps |
| | audio | OfflineAudioContext: no NaN, peak < −1 dBFS; engine f0 range; no context before a gesture |
| | budget | MaterialLibrary throws on material 41 in test builds; triangle counts per LOD |
| | art | every slot resolves to a fallback when no override exists; override index wins when present |
| tools | generators | `gen-registries` output stable; `check-frozen` detects edits |

---

## 5. Physics and determinism
| Suite | Data | Pass |
|---|---|---|
| `test:physics` | `tracks/_test/`: `flat.ctd` (plane), `corridor16.ctd` (walls), `corner_R{9,12,16}_{90,180}_w12.ctd`, `loop.ctd`, `halfpipe.ctd`, `stack.ctd` (8 m decks), `drops.ctd` | §2 physics rows; `10-sim-spec.md` §14.8 robustness rows |
| Oracle | `packages/sim/test/oracle/proto2d.ts` (test-side integer-timer + quantization patch) vs the 3D sim on `flat.ctd` | ≤ 1e-6 m every tick |
| Determinism (unit) | recorded input logs `packages/sim/test/logs/*.bin` with golden hashes every 100 ticks | identical hashes on two runs |
| Determinism (cross-engine) | `e2e/determinism.spec.ts`: the same logs in Chromium (page) and Node, with items and contacts | identical hashes at every 100th tick |
| Node vs Worker | offline `RaceRoom` in a Worker vs Node | identical hashes |

---

## 6. Net suites (`pnpm test:net`)
| Matrix | Content | When |
|---|---|---|
| smoke | RTT {0, 100, 200} ms × jitter {0, 10} ms × loss {0, 0.5}% × 3 seeds, scenarios S1–S10 | CI |
| full | RTT {0, 50, 100, 200, 300} × jitter {0, 10, 30, 60} × loss {0, 0.5, 2}% × 20 seeds | nightly / M5 |
Pass: M1–M12 (`20-netcode-spec.md` §13.4) plus resume ≤ 1 s; protocol property tests; 50-room load test.

---

## 7. Track, race and balance suites
| Suite | Command | Pass |
|---|---|---|
| Bake | `pnpm bake --all --validate --ghost` | V1–V20 0 errors; closure; laps rule; ghost ±8%; sizes; bake time; golden hash match (a hash change requires a reviewed `tracks/golden.json` update) |
| Races | `pnpm test:races` (RACE_SEEDS=1 CI, 3 nightly) | 20 tracks × {speed, item}: finishers, stuck, incidents, coverage (§2) |
| Per-feature AI | ladder tests per step (branch choice, jump approach, rail capture, halfpipe line, loop, hazard timing) | feature driven without incidents in 10 consecutive laps |
| Balance | `tools/balance/*` | tier pace, archetype ±2%, rubber-band spread (median gap 80–250 m), item bucket sanity from simulated races (the leader's share of attack items < 10%) |

---

## 8. E2E (Playwright 1.56.1)
Config: `playwright.config.ts` (workers 1, viewport 960×540, SwiftShader flags `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, webServer `node apps/server/src/main.ts --port 8787 --static apps/client/dist`), always `?renderer=webgl2` (ADR-002).
| Spec | Steps | Pass |
|---|---|---|
| `boot.spec.ts` | open `/`, wait for the title, press a key | lobby visible ≤ 8 s; zero console errors (allowlist); disclaimer text present; `window.__cr.backend` reported |
| `solo-race.spec.ts` | `?autopilot=1&simRate=4&track=proving_ring` | race finishes; results table renders with 8 rows |
| `online.spec.ts` | two browser contexts; A creates a room, B joins with the 6-char code; 1-lap Proving Ring | both reach results with the same finishing order |
| `tracks.spec.ts` (`e2e:tracks`) | each track, autopilot, 8 screenshots | pixel variance above threshold on every shot; contact sheet written to `shots/` |
| `perf.spec.ts` | Low tier, 3 tracks (all nightly), 300 frames after GO | render counters within §2; BudgetTracker snapshot attached |
| `determinism.spec.ts` | §5 cross-engine | identical hashes |
| UI sheets (M4) | every screen, ko and en, at 1280×720, 1920×1080, 2560×1080 | no raw `ns.key` strings in DOM text; no overflow (element bounds inside the viewport) |

---

## 9. Milestone gates (`02-contracts.md` §C)
| Milestone | Required suites |
|---|---|
| M0 | `pnpm verify` on the skeleton; spikes S1–S5 recorded |
| M1 | physics rows marked M1; oracle; determinism (2 runs, Node vs Chromium); 8-bot races on `proving_ring` and `meadow_loop`; e2e boot, autopilot race, results |
| M2 (per lane) | the lane's done criteria (`02-contracts.md` §C lane table) + `pnpm verify:lane`; world lanes: per-track validators, ghost ±8%, signature present or fallback recorded, both-mode bot suites, self-reviewed contact sheet |
| C1 / C2 / C3 | full `pnpm verify` after the ordered merge (L4 → L1 → L3 → L2 → L11 → L8 → world lanes → L10 → L9) |
| M3 | cross-feature suites: online item race with 2 browsers; team speed/item scoring online; reconnect mid-race; Time Attack ghost on every track; loadout propagation garage → race; progression rewards after online and offline races; HUD shows every item state; content lock (V1–V20 green on all 20 tracks, 12 characters, 8 karts, all items with VFX/SFX/icons) |
| M4 | perf budgets per track; art contact sheets reviewed against `30-art-bible.md` §13; Korean/English copy review; accessibility checks; Codex pack (`pnpm art:refs`) |
| M5 | `pnpm verify:full` on a clean clone |
