# ClaudeRider Implementation Plan (Lead Architect)

I read all 7 research reports, the 4 gap reports and the 20 contradictions. I also ran the gap-2 prototype read-only: `EXP=det` gives an identical replay hash and the perturbation error stays bounded.

I checked the environment directly:
- `process.features.typescript === 'strip'`, and `enum` is rejected.
- `/opt/pw-browsers` holds `chromium-1194` (Chromium 141.0.7390.37).
- The npm versions you chose all exist: three 0.186.1, three-mesh-bvh 0.9.15, vite 8.3.1, vitest 5.0.2, TypeScript 6.0.3, typescript-eslint 8.71 (peer TypeScript <6.1), ws 8.22.0, preact 10.29.8, @preact/signals 2.11.2, tone 15.1.22, polygon-clipping 0.15.7.

## 0. Verdict summary

I endorse about 85% of your decisions. The binding changes are below; section F gives the reasoning.

| # | Change | Why (short) |
|---|---|---|
| 1 | **Pin `@playwright/test` to 1.56.1.** | It is the only line that maps to the installed chromium-1194. 1.57 needs revision 1200 and 1.63 needs a newer one. |
| 2 | **Physics collision uses our own deterministic `TriHash`** (a sparse 3D uniform grid) inside `packages/sim`. three-mesh-bvh is used only in `trackc` (AO bake) and on the client (camera occlusion). | Keeps sim and server free of three. Queries allocate nothing. We own the `.ctrk` format and every float operation. |
| 3 | **Driving dynamics integrate once per tick; movement and collision resolve in two half-displacements.** | Keeps gap-2's validated numbers unchanged and still gets the robustness of 2 sub-steps. |
| 4 | **Classic "×thrust" multipliers become target-speed changes.** Draft becomes `vT = 1.05·vGrip` plus `A0 ×1.1`. | In the gap-2 law `a = A0(1−(u/V)²)`, top speed is V whatever A0 is. As written, "thrust ×1.1" would give no draft speed at all. |
| 5 | **The roulette secret uses a synchronous keyed hash** (HalfSipHash-2-4) instead of HMAC. | `crypto.subtle` is async, so it cannot run inside a synchronous `step()` in the offline Worker. |
| 6 | **All timers are integer ticks, and `quantizeWorld()` is the last operation of every tick.** | Snapshots become lossless. A client restoring from a snapshot is bit-exact with the server. |
| 7 | **Homing projectiles travel along the spline in (s, u, h) coordinates, with terminal guidance that fixes the impact tick.** No breadcrumb history in the world. | Nothing extra to snapshot or roll back. The result is the same (homing never misses unless blocked). |
| 8 | **Send one input frame per tick** (the codec still allows up to 4). | Over TCP/WebSocket, redundant frames are pure overhead. Redundancy only helps on a future unreliable transport. |
| 9 | **AI speed multiplier is at most 1.00.** Legend gets its pace from perfect execution. Rubber-band is a deterministic sim-side cap. | No cheating AI. Clients predict bots exactly. |
| 10 | **Gravity 28 m/s²** (not "28–30"). **Missile "airborne" is a kinematic effect**, not real ballistics. **New validators V19 (drift demand) and V20 (render budget).** | V11 jump checks were validated at 28. The kinematic effect avoids landing edge cases. V19 stops wide roads removing the need to drift. |
| 11 | **`tsconfig` sets `erasableSyntaxOnly`**, so server, tools and scripts run as `.ts` directly under Node 22.22. | No build step for Node code. Use `as const` objects instead of `enum`. |
| 12 | **Keep WebGPURenderer + TSL, with guardrails:** a headless spike in M0, a single materials library, and automatic backend fallback that persists. | You asked for "latest web tech". The risk is controlled rather than avoided (section D). |

---

## A. Repository layout and dependency rules

```
/home/user/ClaudeRider
├─ package.json  pnpm-workspace.yaml  tsconfig.base.json  eslint.config.js  vitest.config.ts
├─ playwright.config.ts  .github/workflows/ci.yml  .gitignore  .nvmrc(22)  README.md  CLAUDE.md
├─ contracts.lock                 # sha256 of every FROZEN file; checked by tools/check-frozen.mjs
├─ docs/
│  ├─ research/                   # verbatim exports: 7 reports, 4 gap reports, contradictions, sim-prototype.md
│  ├─ design/                     # canonical spec (the only source of truth once M0 lands)
│  │  00-overview.md 01-decisions.md(ADR log) 02-contracts.md 10-sim-spec.md 11-track-spec.md
│  │  12-items-spec.md 13-modes-rules.md 14-ai-spec.md 20-netcode-spec.md 30-art-bible.md
│  │  31-ui-spec.md 32-audio-spec.md 40-perf-budgets.md 50-test-plan.md 60-codex-pipeline.md
│  │  contract-requests/          # lanes file change requests here
│  ├─ tracks/<trackId>.md         # per-track brief + validation report (owned by the world lane)
│  └─ lanes/<lane>.md             # lane progress log / handoff notes
├─ packages/
│  ├─ content/   src/ ids.ts* schema/*.ts* registry.ts* items/<id>.ts effects/<id>.ts karts/<id>.ts
│  │             droptables.ts characters/<id>.ts(meta) themes/<id>.ts(ThemeDataDef) tracks/manifest.ts
│  │             modes.ts challenges/<id>.ts generated/(gitignored)
│  ├─ sim/       src/ api.ts* core/{units,input,state,quant,hash,rng,math}.ts* step.ts*
│  │             track/{format*,BakedTrack,trihash,locate,samples}.ts kart/{dynamics,ground,walls,air,contacts,draft,boost}.ts
│  │             race/{progress,respawn,wrongway,finish,rules,rubberband,ghost}.ts
│  │             items/{runtime,boxes,roulette,projectiles,hazards,effects,sce}.ts items/behaviors/<key>.ts
│  │             ai/{api*,driver,profiles,avoid,items/*}.ts   (trig ALLOWED only under ai/)
│  │             test/oracle/proto2d.ts (gap-2 prototype, test-only)  generated/(gitignored)
│  ├─ trackc/    src/ dsl/{lexer,parser,ast}.ts turtle.ts close.ts spline.ts frames.ts profiles.ts
│  │             areas.ts junctions.ts walls.ts terrain.ts ao.ts props.ts collision.ts writer-ctrk.ts
│  │             writer-vis.ts validators/V01..V20.ts ai-bake/*.ts report/{svg,plots}.ts ghost.ts cli.ts schema.ts*
│  ├─ net/       src/ protocol/{ids*,bytes,codecs,snapshot,events,lobby*}.ts transport.ts* loopback.ts
│  │             client/{NetClient,clocksync,runahead,rollback,smoothing,dedupe}.ts simlink/*.ts
│  └─ room/      src/ RaceRoom.ts* host.ts inputbuf.ts relay.ts bots.ts reconnect.ts secret.ts
├─ apps/
│  ├─ client/    index.html vite.config.ts(plugins: art-overrides index, tracks static)
│  │             public/{tracks/(gitignored bake output), art/overrides/(README+.gitkeep), fonts/}
│  │             src/ main.tsx App.tsx boot/ game/{Session,FrameClock,Interp,Autopilot}.ts
│  │                  workers/authority.worker.ts net/{WorkerTransport,WsTransport,lobby}.ts
│  │                  render/{api.ts*, engine/, materials/, post/, camera/, track/, systems/,
│  │                          mascot/, characters/<id>.ts, karts/<id>.ts, showcase/,
│  │                          themes/<themeId>/{index.ts,props/*,hazards/*,ambient.ts}, vfx/{core,drift,boost,skid,items/<vfxKey>.ts}}
│  │                  audio/{api.ts*, mixer, engine-synth, sfx/<id>.ts, music/{director.ts, songs/<id>.ts}}
│  │                  ui/{store/*.ts*, hud/*, screens/<screen>/index.tsx, components/*, icons/*, styles/tokens.css*}
│  │                  input/{bindings*,keyboard,gamepad}.ts  meta/{save*,progression,challenges}.ts
│  │                  art/{loader*.ts, slots/<slotId>.ts, fallbacks/*}  i18n/{index.ts*, ko/<ns>.ts, en/<ns>.ts}
│  └─ server/    src/ main.ts http.ts(static+health+/art/overrides/index.json) config.ts
│                lobby/{sessions,matchmaker,rooms,codes,validate}.ts race/RoomHost.ts
├─ tracks/       <themeId>/<trackId>.ctd   _fixtures/(gap-3 Belltower & Magma verbatim)  _test/*.ctd  golden.json
├─ tools/        gen-registries.mjs check-frozen.mjs check-deps.mjs research-export.py
│                shots/{tracks,characters,karts,ui}.ts art/{codex-pack,refs}.ts bench/*.ts balance/*.ts size.mjs
├─ art/codex/    manifest.json style-guide.md prompts/<slot>.md refs/(generated)
└─ e2e/          boot.spec.ts solo-race.spec.ts online.spec.ts tracks.spec.ts perf.spec.ts determinism.spec.ts
```
`*` marks a FROZEN file after M1. Only the orchestrator changes these, through `contract-requests/`.

### Dependency rules

These are enforced three ways: ESLint `no-restricted-imports` configured per package, `tools/check-deps.mjs`, and tsconfig `lib`/`types`.

| Package | May import | Must NOT import | tsconfig lib |
|---|---|---|---|
| content | nothing | everything | ES2023, types [] |
| sim | content | three, three-mesh-bvh, DOM, `node:*`, net, room. Banned in `sim/src/**` except `ai/**`: `Math.sin/cos/tan/asin/acos/atan/atan2/exp/expm1/log*/pow/hypot/cbrt/sinh/cosh/tanh`. Banned everywhere in sim: `**`, `Math.random`, `Date`, `performance`, `Float32` state. | ES2023, types [] |
| trackc | sim, content, three (math/geometry), three-mesh-bvh (AO only), polygon-clipping, simplex-noise; `node:*` only in `cli.ts` | client, net, room | ES2023 + node types |
| net | sim, content | DOM, `node:*`, three | ES2023 |
| room | sim, net, content | DOM, `node:*`, three (must run in both Node and a Worker) | ES2023 |
| server | room, net, sim, content, ws, `node:*` | three, client, trackc | ES2023 + node |
| client | content, sim, net, room (worker only), three, three-mesh-bvh (`render/camera` only), preact, @preact/signals, tone (lazy) | trackc, server, `node:*` | ES2023 + DOM |
| tools, e2e | anything | — | — |

Math operations allowed inside step: `+ − * /`, comparisons, bit operations, `Math.sqrt/abs/min/max/floor/ceil/round/trunc/sign/fround/imul`. All of these are exact under ECMA-262.

---

## B. Interface contracts (FROZEN at the end of M1)

All code is TypeScript with `erasableSyntaxOnly` (no `enum`, no namespaces, no parameter properties). Units are metres, seconds and integer ticks. The world is right-handed with +Y up, the same as three.js.

### B1. Ids, units, input — `packages/content/src/ids.ts`, `packages/sim/src/core/{units,input}.ts`
```ts
// ids.ts — wire code = index + 1 (0 = none). APPEND ONLY, never reorder.
export const THEME_IDS = ['clayhill_village','sunstone_desert','frostbyte_glacier','canopy_forest','ember_mine',
  'lantern_hollow','coral_cove','neon_harbor','spark_circuit','orbital_nexus'] as const;
export const TRACK_IDS = ['meadow_loop','belltower_piazza','sunstone_bazaar','sandglass_canyon','snowglobe_halfpipe',
  'aurora_summit','fernwood_hollow','cascade_slalom','geode_rail_quarry','magma_switchback','pumpkin_lane',
  'manor_catacombs','coral_cove_docks','kraken_lighthouse','rainline_blvd','skyway_interchange',
  'spark_grand_circuit','sunset_arena_rally','token_foundry','orbital_express','proving_ring'] as const;
export const CHARACTER_IDS = ['clay','pixel','turbo','anchor','rune','nova','kage','bisque','frost','glitch','bolt','duke'] as const;
export const KART_BODY_IDS = ['pebble','clay_comet','arrowhead','tugboat','glacier_sled','neon_blade','jet_kettle','crown_cruiser'] as const;
export const ITEM_IDS = ['turbo_token','attention_tether','overclock_aura','prompt_missile','top1_missile','token_bomb',
  'bug_report','broadcast_bolt','throttle_drone','firewall','glitch_puddle','redaction_cloud','mirror_mode',
  'context_shield','interrupt_pulse','alignment_halo','interpretability_lens','mutex_lock'] as const;
export const EFFECT_IDS = ['airborne','trap_bomb','trap_bug','spin','stun','post_stun_slow','throttle','tether_pull',
  'slingshot','overclock','turbo','escape_boost','redaction','mirror','slot_lock','shield','halo','pulse_guard',
  'lens_reveal','firewall_hit'] as const;
export type TrackId = (typeof TRACK_IDS)[number];      // …same pattern for ThemeId, CharacterId, KartBodyId, ItemId, EffectId
export type RankBucket = 'top' | 'high' | 'mid' | 'low';
export type ModeId = 'speed' | 'item' | 'infinite' | 'timeAttack';
export type TeamFormat = 'solo' | 'duo' | 'squad';
export type AiTier = 'rookie' | 'racer' | 'pro' | 'legend';

// units.ts
export const TICK_HZ = 60, DT = 1 / 60, MAX_KARTS = 8, V_REF = 34.0, V_BOOST = 44.4, G = 28, KMH_PER_MPS = 5.4;
export type Tick = number;                                  // integer
export const ticks = (sec: number): number => Math.round(sec * TICK_HZ);   // config/bake time only

// input.ts — 6 bytes on the wire
export const Held = { DRIFT: 1, ITEM: 2, LOOK_BACK: 4 } as const;           // ITEM held = speed-mode auto-fire
export const Edge = { USE_ITEM: 1, SWAP: 2, TAP_L: 4, TAP_R: 8, RESPAWN: 16, EMOTE: 32, DRIFT: 64 } as const; // latched since last tick
export interface InputFrame { steer: number /*int −127..127, +right*/; throttle: number /*0..15*/; brake: number /*0..15*/;
  held: number; edges: number; aim: number /*slot 0..7, 255 none*/; emote: number /*0..15*/ }
export const NEUTRAL_INPUT: Readonly<InputFrame>;
export function packInput(f: InputFrame): number;            // ≤ 2^48, used in ring buffers / ghosts / hashing
export function unpackInput(p: number, out: InputFrame): InputFrame;
```
Throttle edges are derived inside `step()` from `prevThrottle`. Drift accepts a held transition or the latched `DRIFT` edge (SIM_VERSION 9), so a short Shift press/release between samples reaches the simulation once. One-shot actions arrive as latched `edges`.

### B2. World state and quantization — `packages/sim/src/core/{state,quant,hash}.ts`
```ts
export const Q = { POS: 1 / 4096, VEL: 1 / 4096, DIR: 1 / 32768, YAW: 1 / 4096, GAUGE: 1 / 65536, SLIP: 1 / 32768 } as const;
export type RacePhase = 0 | 1 | 2 | 3 | 4;   // PRE, COUNTDOWN, RACING, RETIRE_TIMER, DONE
export type BoostKind = 0 | 1 | 2 | 3 | 4;   // none, normal, team, start, item
export interface TrackLoc { path: number; i: number; s: number; u: number; h: number; sMain: number; valid: 0 | 1 }
export interface KartBody { px: number; py: number; pz: number; vx: number; vy: number; vz: number;
  fx: number; fy: number; fz: number;        // forward (unit, quantized, renormalized at start of next tick)
  nx: number; ny: number; nz: number;        // kart up / contact normal
  yawRate: number; grounded: 0 | 1; coyote: number; airTicks: number; surf: number; wallContact: 0 | 1; ghostTicks: number }
export interface KartDrive { drift: 0 | 1; driftDir: -1 | 1; driftTicks: number; driftPeak: number; reDriftLock: number;
  gauge: number; fatigueTicks: number; boosters: number; teamBoosters: number; boostTicks: number; boostKind: BoostKind;
  startTicks: number; wheelspinTicks: number; instWindow: number; instTicks: number; stunTicks: number;
  draftCharge: number; draftTicks: number; prevHeld: number; prevThrottle: number }
export interface KartItems { slot0: number; slot1: number; rouletteSlot: -1 | 0 | 1; rouletteEnd: Tick; rouletteBox: number;
  lastUseTick: Tick; aimLockTicks: number; aimTarget: number }
export interface KartStatus { cc: number; ccStart: Tick; ccEnd: Tick; immuneUntil: Tick; shieldUntil: Tick; shieldGraceUntil: Tick;
  haloUntil: Tick; mashCredits: number; lastTapDir: -1 | 0 | 1; lastTapTick: Tick; modMask: number }
export interface KartRace { loc: TrackLoc; lastValid: TrackLoc; lap: number; keyMask: number; raceDist: number;
  lapStartTick: Tick; bestLapTicks: number; finishTick: Tick; finishFrac: number; rank: number;
  wrongWayTicks: number; offGraphTicks: number; respawnPhase: 0 | 1 | 2; respawnUntil: Tick; manualCooldownUntil: Tick; retired: 0 | 1 }
export interface KartState { slot: number; team: number; spec: number /*kart code*/; body: KartBody; drive: KartDrive;
  items: KartItems; status: KartStatus; race: KartRace }
export interface TeamState { gauge: number; granted: number }
export interface EffectInstance { id: number; code: number; victim: number; source: number; start: Tick; end: Tick; param: number; flags: number; result: 0 | 1 | 2 | 3 }
export interface ProjectileState { id: number; code: number; owner: number; target: number; phase: number;
  path: number; s: number; u: number; h: number; px: number; py: number; pz: number; spawn: Tick; commit: Tick; impact: Tick }
export interface HazardState { id: number; code: number; owner: number; team: number; px: number; py: number; pz: number;
  radius: number; arm: Tick; expire: Tick; flags: number }
export interface WorldState { tick: Tick; phase: RacePhase; goTick: Tick; firstFinishTick: Tick; endTick: Tick;
  karts: KartState[]; teams: TeamState[]; effects: EffectInstance[]; projectiles: ProjectileState[]; hazards: HazardState[];
  boxRespawn: Int32Array /* [box*MAX_KARTS+slot] = tick available (personal boxes) */; seq: number; decisions: DecisionLog }
export function createWorld(cfg: RaceConfig, track: BakedTrack, content: ContentTables): WorldState;
export function copyWorld(dst: WorldState, src: Readonly<WorldState>): void;   // allocation-free after warmup
export function quantizeWorld(w: WorldState): void;                          // LAST op of step()
export function hashWorld(w: Readonly<WorldState>): number;                  // FNV-1a over quantized ints (decisions excluded)
```

### B3. Step, authority, decisions — `packages/sim/src/step.ts`, `api.ts`
```ts
export interface RaceConfig { simVersion: number; mode: ModeId; teams: TeamFormat; trackId: TrackId; trackHash: string; laps: number;
  slots: SlotConfig[] /* length 8 */; seed: number /* public; never used for item rolls */;
  rules: { retireTicks: number; friendlyFire: 'off' | 'area' | 'all'; itemSet: 'standard' | 'light' | 'chaos';
           rubberBand: boolean; instantBoostInItem: boolean }; introTicks: number; countdownTicks: number }
export interface SlotConfig { kind: 'human' | 'bot' | 'empty'; team: number; name: string; characterId: CharacterId;
  kartBodyId: KartBodyId; ai?: AiTier; vMul: number /* ≤ 1.0, bots only */ }
export interface StepContext { readonly track: BakedTrack; readonly cfg: RaceConfig; readonly content: ContentTables;
  readonly role: 'authority' | 'predictor'; readonly authority?: AuthorityHooks; readonly events: EventSink; readonly scratch: StepScratch }
export interface AuthorityHooks {
  rollItem(slot: number, boxId: number, tick: Tick, bucket: RankBucket): number;  // keyed HalfSipHash, secret key never leaves authority
  emit(d: Decision): void;                                                     // appended to world.decisions and broadcast
}
/** Order (gap-4 R8): inputs → effects starting now (by id) → kart dynamics (1×) → move+collide (2 half-steps) → kart contacts
 *  → projectiles/hazards → boxes/roulette → progress/laps/rules → timers → quantizeWorld → emit events. Mutates w in place. */
export function step(w: WorldState, inputs: ReadonlyArray<InputFrame>, ctx: StepContext): void;

export type EffectResult = 'hit' | 'shielded' | 'immune' | 'immune_grace' | 'miss' | 'hit_late_input';
export type Decision =
  | { k: 'grant'; tick: Tick; slot: number; item: number; boxId: number }
  | { k: 'use'; tick: Tick; slot: number; item: number; obj: number; target: number }
  | { k: 'reject'; tick: Tick; slot: number; item: number; reason: number; refund: 0 | 1 }
  | { k: 'commit'; tick: Tick; obj: number; victim: number; eff: number; impact: Tick }
  | { k: 'effect'; tick: Tick; eff: number; code: number; victim: number; source: number; start: Tick; dur: number; flags: number }
  | { k: 'result'; tick: Tick; eff: number; victim: number; result: EffectResult }
  | { k: 'hazard'; tick: Tick; obj: number; code: number; owner: number; arm: Tick; life: number; x: number; y: number; z: number }
  | { k: 'hazardRemove'; tick: Tick; obj: number };
/** Predictor side: insert a server decision. Returns the tick to roll back from if the decision lands in the past. */
export function applyDecision(w: WorldState, d: Decision): Tick | null;
```
Rule for all item code: every authority-only choice (roll, target, commit tick, result) sits inside `if (ctx.role === 'authority')` and goes out through `emit`. The predictor path reads the same choices back from `world.decisions`.

### B4. Sim events (cosmetic, never read back by the sim) — `packages/sim/src/core/events.ts`
```ts
export type SimEvent = { tick: Tick; key: number /* dedupe key = hash(tick,type,kart,seq) */ } & (
  | { t: 'countdown'; n: 3 | 2 | 1 | 0 } | { t: 'startBoost'; kart: number; tier: 'perfect' | 'great' | 'good' | 'false' | 'none' }
  | { t: 'driftStart' | 'driftEnd' | 'doubleDrift' | 'instantBoost' | 'gaugeFull' | 'finalLap' | 'retire'; kart: number }
  | { t: 'boostStart' | 'boostEnd'; kart: number; kind: BoostKind } | { t: 'teamGaugeFull'; team: number }
  | { t: 'draft'; kart: number; on: boolean } | { t: 'wall'; kart: number; severity: 0 | 1 | 2; x: number; y: number; z: number; speed: number }
  | { t: 'bump'; a: number; b: number; impulse: number } | { t: 'air' | 'land'; kart: number; impact: number }
  | { t: 'box'; kart: number; boxId: number } | { t: 'itemGranted'; kart: number; item: number }
  | { t: 'itemUse' | 'itemFizzle'; kart: number; item: number; obj: number }
  | { t: 'projSpawn' | 'projImpact'; obj: number; item: number } | { t: 'hazardSpawn' | 'hazardRemove'; obj: number; item: number }
  | { t: 'effect'; victim: number; effect: number; source: number; result: EffectResult } | { t: 'effectEnd'; victim: number; effect: number }
  | { t: 'mash'; kart: number; remaining: number } | { t: 'lap'; kart: number; lap: number; lapTicks: number; best: boolean }
  | { t: 'finish'; kart: number; rank: number; raceTicks: number; frac: number } | { t: 'retireTimer'; endsTick: Tick }
  | { t: 'wrongWay'; kart: number; on: boolean } | { t: 'respawn'; kart: number; phase: 'out' | 'in' }
  | { t: 'rank'; kart: number; from: number; to: number } | { t: 'emote'; kart: number; emote: number } | { t: 'raceEnd' });
export interface EventSink { push(e: SimEvent): void }
```
Continuous visuals (sparks, flames, engine sound) read kart state every frame. One-shot events pass through the client's `EventDeduper`, which remembers keys for 2 s, so rollback re-simulation does not duplicate sounds or VFX.

### B5. Baked track runtime — `packages/sim/src/track/{format,BakedTrack}.ts`
```ts
export const CTRK_MAGIC = 0x4b525443, CTRK_VERSION = 1;
export const Sec = { META: 1, SAMPLES: 2, PATHS: 3, GATES: 4, GRID: 5, BOXES: 6, PADS: 7, ZONES: 8, HAZARDS: 9, RAILS: 10,
  WARPS: 11, JUMPS: 12, TRI_GROUND: 13, TRI_WALL: 14, HASH_GROUND: 15, HASH_WALL: 16, RESPAWN: 17, AI: 18 } as const;
// header: u32 magic,u16 ver,u16 nSec,u32 flags, then nSec×{u16 id,u16 rsv,u32 off,u32 len}; sections 8-byte aligned, little-endian.
// samples: SoA at 1 m per path: p(f64×3) t/r/u(f32×3 each) s(f64) wL,wR,bank(f32) flags(u16: surf|frameMode|gravMode|jumpSpan|noItem) sMain(f64)
// tris: f32 xyz, f32 smooth normals, u32 index, u8 surf, u8 flags; hash: cell 4 m, open-addressing Int32 keys → CSR (offset,count) → u32 tri ids
export interface GroundHit { t: number; x: number; y: number; z: number; nx: number; ny: number; nz: number; surf: number; tri: number }
export interface Contact { x: number; y: number; z: number; nx: number; ny: number; nz: number; depth: number; flags: number }
export interface FrameSample { px: number; py: number; pz: number; tx: number; ty: number; tz: number; rx: number; ry: number; rz: number;
  ux: number; uy: number; uz: number; wL: number; wR: number; surf: number; flags: number }
export interface AiSample { lineU: number; vLim: number; kappa: number; turnAhead40: number; driftZone: 0 | 1 | 2 | 3 /* none/entry/apex/exit */ }
export interface BakedTrack {
  readonly id: TrackId; readonly hash: string; readonly lapLength: number; readonly laps: number; readonly topology: 'circuit' | 'p2p';
  readonly nPaths: number; readonly grid: ReadonlyArray<{ x: number; y: number; z: number; fx: number; fy: number; fz: number }>;
  readonly boxes: ReadonlyArray<{ id: number; x: number; y: number; z: number; path: number; s: number }>;
  readonly keyGates: Float64Array /* sMain */; readonly hazards: ReadonlyArray<HazardDefBaked>;
  readonly zones: ReadonlyArray<ZoneBaked>; readonly rails: ReadonlyArray<RailBaked>; readonly warps: ReadonlyArray<WarpBaked>;
  groundRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, out: GroundHit): boolean;
  sphereWalls(cx: number, cy: number, cz: number, r: number, out: Contact[], max: number): number;   // returns count
  locate(px: number, py: number, pz: number, prev: Readonly<TrackLoc>, out: TrackLoc): boolean;       // graph-local search (gap-3 §2.3)
  frameAt(path: number, s: number, out: FrameSample): void;                                           // arithmetic interpolation
  gravityAt(loc: Readonly<TrackLoc>, out: { x: number; y: number; z: number; scale: number }): void;
  aiAt(path: number, s: number, out: AiSample): void;
  respawnPose(loc: Readonly<TrackLoc>, out: { x: number; y: number; z: number; fx: number; fy: number; fz: number }): void;
  hazardPose(h: number, tick: Tick, out: { x: number; y: number; z: number; active: 0 | 1; telegraph: 0 | 1 }): void;
}
export function loadCtrk(buf: ArrayBuffer): BakedTrack;                                               // zero-copy typed-array views
```

### B6. Track compiler — `packages/trackc/src/{index,schema}.ts`
```ts
export type { TrackDefV1, PathDef, CtrlPtV1, WallSpec, ProfileDef, AreaDef, JunctionDef, RailDef, WarpDef, JumpDef,
  ZoneDef, HazardDef, ItemRowDef, BoostPadDef } from './schema.ts';   // verbatim gap-3 §4 + PropDef + EnvDef{themeId, terrain}
export interface DslError { file: string; line: number; col: number; msg: string }
export function parse(src: string, file: string): TrackAst;                         // throws DslError
export function toDef(ast: TrackAst, opts: { strict: boolean }): TrackDefV1;          // turtle + CLOSE solve (writes solved ?a..?c back)
export interface BuildResult { ctrk: Uint8Array; vis: Uint8Array; meta: TrackMetaJson; report: BakeReport; previewSvg: string; minimapSvg: string }
export function build(def: TrackDefV1, opts: { ao: boolean; props: boolean; seed: number }): BuildResult;
export interface Finding { rule: `V${number}`; severity: 'error' | 'warn'; path?: string; s?: number; msg: string }
export function validate(def: TrackDefV1, built: BuildResult, track: BakedTrack, ghost?: GhostResult): Finding[];   // V1..V20
export function ghostLap(track: BakedTrack, content: ContentTables, mode: ModeId, tier: AiTier): GhostResult;     // headless sim + AI
// CLI: pnpm trackc build <ids|all> [--validate] [--ghost] [--preview] [--jobs 4] [--out apps/client/public/tracks]
// TrackVis (vis.bin): { chunks: VisChunk[] (≈50 m, per material slot); props: {kind, transforms Float32Array(x,y,z,yaw,scale)}[];
//                       terrain: heightfield chunks; decals; minimap: {svgPath, layers}; bounds }
export function decodeVis(buf: ArrayBuffer): TrackVis;                                // lives in trackc/src/vis-format.ts, client imports this file only
```
Because the client cannot import trackc, `vis-format.ts` is moved to `packages/sim/src/track/vis-format.ts` (it is pure data code). The DSL grammar is gap-3 §9. The compiler adds `PROPS kind=… along=… side=… every=…` and `THEME` env lines.

### B7. Content schemas (data-driven items and effects) — `packages/content/src/schema/*.ts`
```ts
export interface KartSpec { id: KartBodyId; code: number; archetype: 'speed' | 'balance' | 'drift'; vGrip: number; vBoost: number;
  a0: number; tBoostTicks: number; g0: number; kLatIn: number; kLatNeutral: number; yGrip: number; cBeta: number; weight: number }
export type TargetRule = 'self' | 'aim' | 'leader' | 'nextAheadOpponent' | 'allAheadOpponents' | 'team' | 'opponentsAll'
  | 'dropBehind' | 'lobAhead' | 'aheadOfLeader';
export interface EffectApply { effect: EffectId; to: 'victim' | 'self' | 'team'; leadTicks?: number /* SCE lead, default 21 */; durTicks?: number; param?: number }
export interface ItemDef { id: ItemId; code: number; teamOnly: boolean; category: 'speed' | 'attack' | 'trap' | 'defense' | 'utility';
  target: TargetRule; aim?: { coneDeg: number; rangeMin: number; rangeMax: number; lockTicks: number; allowRear: boolean };
  projectile?: { speedMulVref: number; plusTargetSpeed: number; lifeTicks: number; passWalls: boolean; route: 'spline' | 'direct' };
  lob?: { flightTicks: number; aheadM: number; radius: number; dy: number; centerline: boolean };
  drop?: { behindM: number; throwForwardM?: number; lifeTicks: number; armTicks: number; radius: number; maxPerOwner: number };
  applies: EffectApply[]; blockedBy: ReadonlyArray<'shield' | 'halo'>; clearedBy?: ReadonlyArray<'pulse'>;
  friendlyFire: 'never' | 'area'; validity?: 'notIfLeaderSelfOrTeam'; behavior?: string /* sim/items/behaviors/<key>.ts */;
  ai: { use: 'straight' | 'targetAhead60' | 'pursuerBehind15' | 'incomingThreat' | 'rank3plus' | 'onDrone' | 'always'; minTier?: AiTier };
  presentation: { iconKey: string; vfxKey: string; sfxUse: string; sfxHit?: string; nameKey: string; descKey: string } }
export interface EffectDef { id: EffectId; code: number; class: 'hardCC' | 'softCC' | 'buff' | 'defense'; durTicks: number;
  stacking: 'refresh' | 'stackDuration3' | 'extend' | 'none'; immunityAfterTicks: number;
  mods: { vTarget?: number /* absolute m/s override, e.g. 44.4 */; vCapMul?: number; accelMul?: number; steerMul?: number;
          steerInvert?: boolean; noControl?: boolean; noItems?: boolean; gaugeMul?: number;
          kinematic?: 'airborne' | 'trap' | 'spin' | 'tether' | 'none'; overlay?: 'redaction' | 'mirror' | 'none' };
  mash?: { creditTicks: number; floorTicks: number; maxCredits: number; minGapTicks: number }; onEnd?: EffectApply[]; behavior?: string }
export interface DropTable { format: 'solo' | 'team'; buckets: Record<RankBucket, ReadonlyArray<readonly [ItemId, number]>> }
export interface ContentTables { items: Registry<ItemDef>; effects: Registry<EffectDef>; karts: Registry<KartSpec>;
  drop: { solo: DropTable; team: DropTable }; tracks: Registry<TrackManifestEntry>; themes: Registry<ThemeDataDef>;
  characters: Registry<CharacterMeta>; modes: ModeRules }
export interface Registry<T extends { id: string; code: number }> { byId: ReadonlyMap<string, T>; byCode: ReadonlyArray<T | undefined>; all: readonly T[] }
export function loadContent(): ContentTables;          // reads generated/*.gen.ts; validates ids/codes/sums at load
// sim/items/behavior.ts (FROZEN)
export interface ItemBehavior { onUse?(w: WorldState, user: number, def: ItemDef, ctx: StepContext): 'ok' | 'fizzle' | 'reject';
  tickProjectile?(w: WorldState, p: ProjectileState, ctx: StepContext): void; tickHazard?(w: WorldState, h: HazardState, ctx: StepContext): void }
export interface EffectBehavior { onStart?(w: WorldState, e: EffectInstance, ctx: StepContext): void;
  onTick?(w: WorldState, e: EffectInstance, k: KartState, ctx: StepContext): void; onEnd?(w: WorldState, e: EffectInstance, ctx: StepContext): void }
```

### B8. AI — `packages/sim/src/ai/api.ts`
```ts
export interface AiProfile { tier: AiTier; vMul: number /* ≤1 */; lineNoise: number; driftSkill: number; instBoostRate: number;
  instJitterTicks: number; reactionTicks: number; mistakeRate: number; startDelayTicks: readonly [number, number];
  falseStartProb: number; useDraft: boolean; aggression: number; shortcutRisk: number; itemSkill: 0 | 1 | 2 | 3; mashHz: number }
export const AI_TIERS: Readonly<Record<AiTier, AiProfile>>;
export interface AiDriver { readonly slot: number; decide(w: Readonly<WorldState>, out: InputFrame): void }   // called at t for input t+8
export function createAiDriver(track: BakedTrack, content: ContentTables, slot: number, profile: AiProfile,
  personality: Partial<AiProfile>, seed: number): AiDriver;
```
The rubber-band cap is `race/rubberband.ts: capMul(w, slot, cfg): number`, a pure deterministic function run on every peer.

### B9. Room, transport, protocol — `packages/room`, `packages/net`
```ts
// net/transport.ts
export interface Transport { readonly id: string; send(bytes: Uint8Array): void; onMessage: ((b: Uint8Array) => void) | null;
  onClose: ((reason: string) => void) | null; close(code?: number, reason?: string): void; bufferedAmount(): number }
export function loopbackPair(latencyMs?: number): [Transport, Transport];
// net/protocol/ids.ts — gap-4 §9 byte layouts are canonical
export const C2S = { INPUT: 0x01, PING: 0x02, RESUME: 0x03, LOBBY_JSON: 0x10 } as const;
export const S2C = { SNAPSHOT: 0x81, EVENTS: 0x82, INPUT_RELAY: 0x83, PONG: 0x84, LOBBY_JSON: 0x90 } as const;
export interface ByteWriter { u8(v: number): void; i8(v: number): void; u16(v: number): void; i16(v: number): void; i24(v: number): void;
  u32(v: number): void; i32(v: number): void; f64(v: number): void; bytes(b: Uint8Array): void; finish(): Uint8Array }
export interface Codec<T> { encode(w: ByteWriter, v: T): void; decode(r: ByteReader, into?: T): T }
export const InputMsg: Codec<{ firstTick: Tick; ackEventSeq: number; frames: InputFrame[] }>;
export const SnapshotMsg: Codec<{ meta: SnapshotMeta; world: WorldState }>;   // lossless w.r.t. quantizeWorld grid
export const EventsMsg: Codec<{ firstSeq: number; decisions: Decision[] }>;
export const RelayMsg: Codec<{ baseTick: Tick; entries: { slot: number; dTick: number; frame: InputFrame }[] }>;
export type C2SLobby = { t: 'hello'; v: number; name: string; loadout: Loadout; resume?: string } | { t: 'quick'; mode: ModeId; teams: TeamFormat }
  | { t: 'quickCancel' } | { t: 'create'; settings: RoomSettings } | { t: 'join'; code: string } | { t: 'leave' } | { t: 'ready'; ready: boolean }
  | { t: 'loadout'; loadout: Loadout } | { t: 'settings'; settings: Partial<RoomSettings> } | { t: 'slot'; slot: number; action: 'open' | 'close' | 'bot' | 'kick'; tier?: AiTier }
  | { t: 'team'; slot: number; team: number } | { t: 'start' } | { t: 'vote'; trackId: TrackId } | { t: 'chat'; text: string } | { t: 'loaded'; trackHash: string };
export type S2CLobby = { t: 'welcome'; session: string; serverVersion: number; simVersion: number }
  | { t: 'queue'; phase: 'search' | 'stage'; endsAt: number; humans: number; trackId?: TrackId } | { t: 'room'; room: RoomView }
  | { t: 'roulette'; endsAt: number; votes: Partial<Record<TrackId, number>> }
  | { t: 'raceStart'; config: RaceConfig; startTick: Tick; serverTick: Tick; yourSlot: number } | { t: 'raceEnd'; result: RaceResult }
  | { t: 'chat'; from: string; text: string } | { t: 'error'; code: string };
// room/RaceRoom.ts — identical in Node server and client Worker
export interface RoomClock { nowMs(): number }
export interface RaceRoomOptions { config: RaceConfig; track: BakedTrack; content: ContentTables; secret: Uint32Array /* 4 words */;
  clock: RoomClock; timing?: { leadTicks: number /* 21 */; snapshotEvery: number /* 2 */; botLookahead: number /* 8 */ } }
export interface PeerHandle { id: string; slot: number; transport: Transport; resumeToken: string }
export class RaceRoom { constructor(o: RaceRoomOptions); attach(p: PeerHandle): void; detach(peerId: string, reason: string): void;
  tick(): void /* exactly one sim tick */; onEnd(cb: (r: RaceResult) => void): void; readonly tickNo: Tick; readonly phase: RacePhase; debugWorld(): Readonly<WorldState> }
// net/client/NetClient.ts
export class NetClient { constructor(o: { transport: Transport; track: BakedTrack; content: ContentTables; cfg: RaceConfig; slot: number; nowMs: () => number });
  submit(frame: InputFrame): void; update(nowMs: number): number /* ticks advanced */;
  readonly world: Readonly<WorldState>; readonly prev: Readonly<WorldState>; readonly alpha: number;
  visualOffset(slot: number, out: { x: number; y: number; z: number }): void /* spring-smoothed error, snap ≥ 4 m */;
  drainEvents(out: SimEvent[]): void; readonly stats: NetStats }
```

### B10. Render registries — `apps/client/src/render/api.ts`
```ts
import type { WebGPURenderer, Scene, PerspectiveCamera, Object3D, BufferGeometry, Material, Color } from 'three/webgpu';
export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';
export interface FrameView { world: Readonly<WorldState>; prev: Readonly<WorldState>; alpha: number; localSlot: number; nowSec: number; dtSec: number }
export interface RenderContext { renderer: WebGPURenderer; scene: Scene; camera: PerspectiveCamera; tier: QualityTier;
  lib: MaterialLibrary; track: BakedTrack; vis: TrackVis; theme: ThemeKit; bus: EventBus<SimEvent>; budget: BudgetTracker }
export interface RenderSystem { id: string; init(ctx: RenderContext): void | Promise<void>; update(v: FrameView, ctx: RenderContext): void; dispose(): void }
export interface MaterialLibrary {           // the ONLY shared TSL surface; ≤ 40 unique materials per scene (BudgetTracker enforces)
  world(p: { color: Color; roughness: number; metalness?: number; noise?: NoiseSpec; vertexAO?: boolean }): Material;
  road(p: RoadParams): Material; wall(kind: WallSpec['type'], p: WallParams): Material; water(p: WaterParams): Material;
  vinyl(p: { palette: MascotPalette; rim: Color; clearcoat: number }): Material;      // partId palette via attribute
  kartPaint(p: { livery: Livery }): Material; emissive(p: { color: Color; intensity: number }): Material; get(key: string): Material | undefined }
export interface ThemeKit { id: ThemeId; data: ThemeDataDef; materials(lib: MaterialLibrary): Record<string, Material> /* keys = vis material slots */;
  buildEnvironment(ctx: RenderContext): Promise<Object3D>; props: Record<string, PropFactory>;
  hazards?: Record<string, (ctx: RenderContext, h: HazardDefBaked) => RenderSystem>; ambient?: (ctx: RenderContext) => RenderSystem;
  grade: { slope: number; saturation: number; tint: Color } }
export interface PropFactory { build(lib: MaterialLibrary, rand: () => number): { geometry: BufferGeometry; material: Material }; maxInstances: number }
export interface MascotPalette { body: Color; shade: Color; accent: Color; detail: Color; eye: Color }
export type EmoteSlot = 'idle' | 'win' | 'podium' | 'lose' | 'retire' | 'attackLanded' | 'gotHit' | 'lobby';
export interface CharacterDef { id: CharacterId; palette: MascotPalette; accessories: ReadonlyArray<(lib: MaterialLibrary) => AccessoryPart>;
  eyeStyle: 'slot' | 'led' | 'visor'; emotes: Partial<Record<EmoteSlot, EmoteBuilder>>; tiltBias?: number }
export interface MascotPose { steer: number; lean: number; speed01: number; drifting: boolean; boosting: boolean; airborne: boolean; hit: 0 | 1 | 2 }
export interface MascotInstance { root: Object3D; anchors: Record<'head_top' | 'back' | 'hand_L' | 'hand_R' | 'face_front', Object3D>;
  setPose(p: MascotPose, dt: number): void; playEmote(e: EmoteSlot): void; setEyes(expr: 'open' | 'blink' | 'happy' | 'dizzy' | 'star' | 'angry'): void;
  setTeamTint(c: Color | null): void; setLod(l: 0 | 1 | 2): void; dispose(): void }
export interface KartBodyDef { id: KartBodyId; dims: { length: number; width: number; height: number; wheelR: number }; build(lib: MaterialLibrary, livery: Livery): KartModel }
export interface KartModel { root: Object3D; wheels: [Object3D, Object3D, Object3D, Object3D]; steering: Object3D; seat: Object3D;
  exhausts: Object3D[]; setLivery(l: Livery): void; update(s: { steer: number; wheelSpin: number; boost: BoostKind; drift: boolean }, dt: number): void; setLod(l: 0 | 1 | 2): void; dispose(): void }
export interface VfxDef { key: string; create(ctx: RenderContext): { spawn(p: VfxSpawn): void; update(dt: number): void; dispose(): void } }
export function buildMascot(def: CharacterDef, lib: MaterialLibrary): MascotInstance;   // render/mascot/rig.ts
```
Registries use `import.meta.glob('./characters/*.ts', { eager: true })` and the same pattern for karts, themes, vfx, sfx, songs, screens and art slots. **A missing entry must resolve to a visible placeholder plus a dev warning, never a crash.** This is what lets the lanes work in parallel.

### B11. Audio, UI store, i18n, save, art — client
```ts
// audio/api.ts
export type BusName = 'master' | 'music' | 'sfx' | 'engine' | 'ui' | 'voice';
export interface AudioApi { unlock(): Promise<void>; setVolume(bus: BusName, v: number): void; sfx(id: string, o?: { pos?: Vec3; gain?: number; pitch?: number }): void;
  engines: { attach(slot: number, profile: 'player' | 'near' | 'far'): void; update(slot: number, p: { rpm01: number; throttle: number; boost: BoostKind; slip: number; pos: Vec3; vel: Vec3 }): void; detach(slot: number): void };
  music: { play(song: string, o?: { fadeSec?: number }): Promise<void>; setState(s: 'lobby' | 'race' | 'finalLap' | 'finish' | 'results'): void; stop(fadeSec?: number): void };
  setListener(pos: Vec3, fwd: Vec3, up: Vec3, vel: Vec3): void }
export interface SfxDef { id: string; bus: BusName; maxVoices: number; spatial: boolean; play(ac: AudioContext, dest: AudioNode, o: SfxOpts): void }
export interface SongDef { id: string; bpm: number; build(T: typeof import('tone'), out: import('tone').ToneAudioNode): { start(): void; stop(): void; setIntensity(x: number): void } }
// ui/store/*.ts (signals)
export type Screen = 'title' | 'lobby' | 'modeSelect' | 'queue' | 'room' | 'garage' | 'loading' | 'race' | 'results' | 'settings' | 'timeAttack';
export const route: Signal<{ screen: Screen; params?: Record<string, string> }>; export function navigate(s: Screen, params?: Record<string, string>): void;
export interface HudSignals { rank: Signal<number>; total: Signal<number>; lap: Signal<number>; laps: Signal<number>; lapMs: Signal<number>; raceMs: Signal<number>;
  bestMs: Signal<number>; kmh: Signal<number>; gauge: Signal<number>; teamGauge: Signal<number>; slots: Signal<[number, number]>; boosters: Signal<number>;
  draft: Signal<boolean>; wrongWay: Signal<boolean>; finalLap: Signal<boolean>; countdown: Signal<number | null>; retireLeft: Signal<number | null>;
  standings: Signal<Standing[]>; toasts: Signal<Toast[]>; feed: Signal<FeedEntry[]>; incoming: Signal<{ dir: number; etaTicks: number } | null>; mash: Signal<number | null> }
export const hud: HudSignals;   // written only by game/HudPresenter at 20–30 Hz
// i18n/index.ts
export type Locale = 'ko' | 'en'; export const locale: Signal<Locale>;
export function t(key: MsgKey, vars?: Record<string, string | number>): string;   // MsgKey generated from ko/*.ts
export function josa(word: string, pair: '이/가' | '을/를' | '은/는' | '와/과' | '으로/로'): string;
// meta/save.ts
export interface SaveV1 { v: 1; profile: { name: string; characterId: CharacterId; kartBodyId: KartBodyId; livery: Livery; palette?: string };
  settings: SettingsV1; progress: { level: number; xp: number; sparks: number; unlocks: string[]; stats: Record<string, number> };
  challenges: { daily: ChallengeState[]; weekly: ChallengeState[]; dailyReset: string; weeklyReset: string };
  records: Partial<Record<TrackId, { bestLapTicks?: number; bestRaceTicks?: Partial<Record<ModeId, number>>; ghostKey?: string }>> }
export const save: { get(): Readonly<SaveV1>; update(fn: (s: SaveV1) => void): void; exportJson(): string; importJson(s: string): void }  // localStorage; ghosts in IndexedDB
// art/loader.ts
export interface ArtSlotDef { id: string; kind: 'portrait' | 'hero' | 'kart' | 'thumb' | 'loading' | 'keyart' | 'card' | 'icon' | 'logo' | 'ui';
  w: number; h: number; promptId: string; fallback(): Promise<HTMLCanvasElement | ImageBitmap> }
export function getArt(id: string): Promise<HTMLCanvasElement | ImageBitmap>;   // uses /art/overrides/index.json (dynamic in dev + Node server, build snapshot for static) → fallback
```

### B12. Merge-conflict-free patterns (mandatory)
1. **One file per entry.** Each registry is populated by files in the lane's own directory: `export default defineItem({...})`, `defineCharacter`, `defineTheme`, `defineSfx`. **No lane ever edits an index file.**
2. **Registry discovery.**
   - Cross-runtime registries (content, sim behaviours, i18n keys) are built by `tools/gen-registries.mjs` into gitignored `generated/*.gen.ts`. The script runs in the `predev`, `pretest`, `pretypecheck` and `prebuild` hooks.
   - Client-only registries use `import.meta.glob`.
3. **Every id and wire code is pre-assigned in M1** (B1). Lanes never add ids; they fill in entries.
4. **All npm dependencies are pre-installed in M0** (list in C/M0). Only the orchestrator touches `package.json` or `pnpm-lock.yaml`.
5. **i18n namespaces per lane:** `hud, lobby, garage, room, settings, results, common, errors` (UI); `items` (ITEMS); `tracks.<id>`, `themes.<id>` (world lanes); `chars, karts` (CHARS); `net` (NET). A test enforces ko/en key parity.
6. **Frozen files** are listed in `contracts.lock` and checked by `pnpm check:frozen` in CI.
7. **CSS:** `ui/styles/tokens.css` is frozen. Each component keeps its own colocated `.css`.

---

## C. Milestones

### M0 — Scaffold and canonical docs (sequential, 1 lead agent)
1. **Workspace.**
   - Root configs from the layout above. `tsconfig.base.json` sets: `strict`, `noUncheckedIndexedAccess`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`, `rewriteRelativeImportExtensions`, `moduleResolution: "bundler"`, `target ES2023`.
   - Workspace packages export `./src/index.ts` directly, so there is no build step.
2. **Pre-install all dependencies, exact versions.**
   - Runtime: three@0.186.1, @types/three@0.186.0, three-mesh-bvh@0.9.15, preact@10.29.8, @preact/signals@2.11.2, tone@15.1.22, ws@8.22.0, @types/ws, polygon-clipping@0.15.7, simplex-noise@4.0.3, pretendard@1.3.9, @fontsource/barlow-condensed, @fontsource/black-han-sans.
   - Dev: vite@8.3.1, @preact/preset-vite@2.10.6 (+ @babel/core), vitest@5.0.2, typescript@6.0.3, eslint@10 + typescript-eslint@8.71, prettier, **@playwright/test@1.56.1**, zzfx@1.3.2 (optional, MIT).
3. **Research export.** `tools/research-export.py` (run once) writes the JSON reports to `docs/research/*.md`, the prototype to `docs/research/sim-prototype.md`, and a copy to `packages/sim/test/oracle/proto2d.ts` (test-only oracle).
4. **Canonical specs.** Write `docs/design/*` with the ADR log `01-decisions.md`. It must resolve all 20 contradictions, list your decisions, and carry the section F changes, with every constant given in ticks. It also includes the 20-track roster: gap-3 geometry and laps merged with the maps report's names, gimmicks, palettes and music.
5. **`CLAUDE.md` agent rules:**
   - lane ownership;
   - the frozen-file policy;
   - the determinism rules;
   - the lane test commands;
   - "read `node_modules/three/src` and `examples/jsm` for TSL, never guess APIs";
   - resource discipline (`VITEST_MAX_WORKERS=1` inside lanes).
6. **Spikes.** Results go into ADR-renderer.
   - **S1:** headless Chromium with WebGPURenderer (`forceWebGL`), TSL material, MRT, bloom and FXAA through `RenderPipeline`; screenshot shows non-black pixels. Flags: `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. Try both headless-shell and `channel:'chromium'`.
   - **S2:** WebGPU via `--enable-unsafe-webgpu --enable-features=Vulkan --use-vulkan=swiftshader --use-webgpu-adapter=swiftshader`.
   - **S3:** Node runs `apps/server/src/main.ts` natively.
   - **S4:** a Vite 8 module Worker builds.
   - **S5:** Korean font subsets load before canvas text is drawn.
7. **CI.** On GitHub Actions, `pnpm exec playwright install --with-deps chromium` is allowed; it is forbidden only locally.

**Done when:** `pnpm verify` passes on the skeleton, the spikes are recorded, and the first commit is on `claude/kartrider-drift-3d-web-9gdk1d`.

### M1 — Vertical slice (sequential core; 1 lead plus 1 helper on renderer/materials)
Build in this order. Each step is a commit.
1. **Contracts code (B1–B11)** as real files with stub implementations. Freeze them and write `contracts.lock`.
2. **trackc-min.**
   - Parse S/C/E/dy/bank/w/wall/CLOSE/GRID/KEYS/ITEMS/PAD/LINE.
   - Turtle, CLOSE solver, arc-length centripetal spline, worldUp frames, flat profile, barrier walls.
   - TriHash, `.ctrk` writer, vis writer (road, walls, basic terrain), gates and key gates.
   - Validators V1, V3, V4, V8, V13, V15.
   - Tracks: `proving_ring` (5×700 m) and `meadow_loop` (a basic version of the WORLD-A deliverable).
3. **sim.**
   - `loadCtrk`, ground ray, sphere walls, `locate`.
   - The 3D kart step: gap-2 dynamics in the tangent frame, slopes and banks, walls, start/instant/booster/gauge.
   - Laps, finish, retire timer, standings, basic respawn and wrong-way.
   - `quantizeWorld`, `hashWorld`.
4. **AI port.** Gap-2 driver on baked AI tables (`trackc/ai-bake` precomputes line, curvature, vLim, drift zones).
5. **room.** `RaceRoom` as the offline authority, a Worker host, and `WorkerTransport`. The client renders authoritative states with interpolation; prediction comes in M2 NET.
6. **client.**
   - Renderer factory with `?renderer=webgl2|webgpu|auto`.
   - Materials library v0; post (bloom + FXAA); Clayhill theme stub.
   - Clay mascot v0 and Pebble kart v0.
   - Chase camera; keyboard input using `KeyboardEvent.code`.
   - Preact HUD (rank, lap, times, speed, gauge, slots, countdown); title with disclaimer, then lobby ("빠른 레이스"), then results.
   - i18n ko/en; audio skeleton (engine synth, countdown beeps).
   - Debug flags `?autopilot=1&simRate=4&track=…`.
7. **Tests.**
   - Physics oracle (flat-plane 3D vs proto2d).
   - Determinism (2 runs; Node vs Chromium).
   - 8-bot races on both tracks.
   - e2e: boot, race with autopilot, results.

**Done when:** the full slice passes the E thresholds marked "M1", and the orchestrator tags it `m1`.

### M2 — Parallel fan-out (11 lanes, git worktrees off tag `m1`)

| Lane | Owns (write access) | Delivers | Done criteria and tests |
|---|---|---|---|
| **L1 SIM** | `sim/src/{kart,track,race}/**`, `content/src/karts/**`, `tracks/_test/**` | Air, jumps, landing; halfpipe ground to 60°; track gravity and low-g; rails; warps; conveyors and surface table; analytic hazards; kart–kart contacts (symmetric, soft, capped); draft; team gauge and team booster (upgrade in place); Infinite Boost; full respawn, wrong-way and anti-cut; ghost record/replay; rubber-band; stats for 8 archetypes | gap-2 tables within tolerances; 10k drop tests with no fall-through; boosted wall hits never tunnel; loop traversal; determinism including contacts; archetype lap spread ≤ ±2% |
| **L2 ITEMS** | `sim/src/items/**`, `content/src/{items,effects}/**`, `content/src/droptables.ts`, `sim/src/ai/items/**` | 18 ItemDefs and ~20 EffectDefs; behaviours; SCE with fixed lead 21; spline-route homing plus terminal guidance; lob/drop hazards; personal boxes (150–180-tick respawn from boxId); 30-tick roulette; buckets with distance overrides and rerolls; refresh-not-stack plus 36-tick immunity; shield/halo/pulse exceptions; friendly-fire toggle; mash-out; bot item heuristics | Per-item tick-exact unit tests; drop-table sums = 100; CC rules; authority vs predictor equivalence at zero latency; an item-mode bot suite uses all 18 items |
| **L3 AI** | `sim/src/ai/{driver,profiles,avoid}.ts`, `trackc/src/ai-bake/**`, `tools/balance/**` | 3D driver with branch/rail/jump/halfpipe/loop handling; 4 tiers; personalities per character; avoidance lanes; stuck recovery; 8-tick lookahead; `ghostLap` for V13; balance reports | ≤ 5 µs per kart-tick; bot suites per track (E); tier pace targets |
| **L4 TRACKC** | `packages/trackc/**` except ai-bake, `tracks/_fixtures/**` | Features in "feature ladder" order (below); plaza union; junction gore; terrain and AO bake (three-mesh-bvh); 50 m vis chunks; prop placement; minimap/preview SVG; V1–V20; parallel cached CLI; golden hashes; `pnpm track:preview` | gap-3 Belltower and Magma fixtures compile with closure < 0.01 m; each validator has a seeded-violation test; bake ≤ 20 s per track |
| **L5 WORLD-A** | `tracks/{clayhill_village,sunstone_desert,frostbyte_glacier}/**`, `render/themes/<same>/**`, `content/src/themes/<same>.ts`, `i18n/*/tracks.*`, `docs/tracks/<ids>.md` | Tracks 1–6 (Meadow Loop, Belltower Piazza, Sunstone Bazaar, Sandglass Canyon, Snowglobe Halfpipe, Aurora Summit) and 3 ThemeKits | Per track: validators pass, ghost within ±8%, signature feature present, both-mode bot suites pass, preview contact sheet self-reviewed (agent reads the PNGs) |
| **L6 WORLD-B** | Same pattern for ember_mine, neon_harbor, orbital_nexus | Tracks 9, 10, 15, 16, 19, 20 (Geode, Magma, Rainline, Skyway, Token Foundry, Orbital Express). These are the hardest features. | Same |
| **L7 WORLD-C** | Same pattern for canopy_forest, lantern_hollow, coral_cove, spark_circuit | Tracks 7, 8, 11, 12, 13, 14, 17, 18 (8 tracks, mostly mid-complexity) | Same |
| **L8 CHARS+KARTS** | `render/{mascot,characters,karts,showcase}/**`, `content/src/characters/**`, `art/fallbacks/portraits/**`, `art/codex/**` (M4) | Vinyl-voxel Clawd rig (12×8 body ratio, 2×2 arm stubs, 4 legs, eye slots, no mouth, #D87656/#BE684D/#141413); 12 CharacterDefs; eye decal atlas; procedural animation and emotes; 8 KartBodyDefs with livery canvas; 3 LODs; turntable; portrait renderer | ≤ 12k tris LOD0 per kart+driver; ≤ 3 draws per mascot; lineup sheets at 3 angles |
| **L9 NET** | `packages/{net,room}/**`, `apps/server/**`, `apps/client/src/net/**` | Codecs; WS server; lobby (20 s search + 15 s stage + AI fill; 6-char codes without 0/O/1/I; host settings; 20 s roulette; all-ready 10 s autostart; host migration); online RaceRoom (late-input rules, relay, 30 Hz snapshots, events with seq and resume, backpressure); NetClient (clock sync, 59/61 run-ahead, full-world rollback, springs, snap ≥ 4 m, dedupe); 60 s reconnect with AI takeover at 3 s; input validation; SimLink harness; load test | E net thresholds; protocol round-trip property tests; 50-room bot load test |
| **L10 UI+META** | `ui/**` (except `hud/model` frozen), `i18n/*/{ui namespaces}`, `meta/**`, `input/**`, `content/src/challenges/**` | Every screen and HUD element from the ui-art report; settings (tiers, rebinding with conflict detection, gamepad, buses, HUD scale, language, renderer backend, auto-boost); progression (levels 1–50, Sparks, unlocks); daily ×3 / weekly ×5 / mid-race challenges; Time Attack UI; save migrations; browser pitfalls (Keyboard Lock, Alt preventDefault, alternate keys Space/E/C) | UI screenshot sheets ko/en at 1280×720, 1920×1080, 2560×1080; key parity; save migration tests |
| **L11 FX+AUDIO** | `render/{materials,post,camera,vfx}/**`, `audio/**` | Material library v1 (owner after M1); post tiers; boost juice (FOV 70→80, radial blur, speed lines, CA); stateless GPU particles; drift-spark tiers; smoke; skid ribbons; 4 flame kinds; VFX for all 18 items; camera rig (chase, drift look, rear view, flyover, finish orbit); audio mixer; engine pool (3 detailed voices); 60+ SFX; 11 songs (lobby + 10 themes) plus jingles; adaptive final-lap/finish music | Draw/material budgets per tier; VFX sheet; audio unit tests on OfflineAudioContext (no NaN, peak below −1 dBFS) |

**Feature ladder.** TRACKC, SIM and AI deliver each step together; each step unblocks the listed tracks.

| Step | TRACKC | SIM | AI | Unblocks |
|---|---|---|---|---|
| F1 | WIGGLE/CHICANE/HAIRPIN/E, BRANCH + map, PAD, ZONE surf/conveyor, PROPS | surfaces, conveyors, pads, branch progress | branch choice by aiMinSkill | 1, 3, 7, 11, 13, 17 |
| F2 | J, KILL, open ledges, shoulders | air/landing/kill/respawn | jump approach speeds | 6, 8, 18 |
| F3 | halfpipe/custom profiles, AREA plaza, junction gore | ground ≤ 60°, plaza locate | guide-line following | 2, 5 |
| F4 | RAIL, WARP | capture/lock/exit, warp transit | rail intent | 4, 9, 12 |
| F5 | HAZ (geyser/press/train/traffic/swinger) | analytic hazards | hazard timing/avoidance | 14, 15, 19 |
| F6 | HELIX ≥ 360 stacked, CLOVERLEAF, LOOP + RMF, gravity modes | track gravity, low-g | loop / zero-g | 10, 16, 20 |

**Sequencing rules.**
- World lanes start with F1-only tracks: L5 → 1, 3; L6 → Rainline layout without traffic, Token Foundry without presses; L7 → 7, 11, 13, 17.
- The theme-kit art proceeds in parallel from day 1, because the M1 vis format and prop factories are frozen.
- Each track DSL must declare `@signature` features and `@fallback` substitutes, for example "LOOP → HELIX 360 if F6 slips".

**Partitions.**
- **Tracks and themes:** as in the table above. Vertical ownership means one lane owns a theme kit and both of its tracks.
- **Characters and karts:** all in L8, because they share the rig and chassis builder. If L8 is behind at C2, a freed agent takes characters 7–12 and karts 5–8, which are already separate files.
- **Items:** all 18 in L2 because the infrastructure is shared. Their visuals are in L11 (keyed by `vfxKey`), icons in L10 (`ui/icons/items/<id>.ts`), and SFX in L11 (`sfxUse`/`sfxHit` keys).
- **If you only have 10 agents:** L3 AI folds into L1 SIM for the M2 first half and spins out at C1.

**Worktree workflow.**
- Integration branch: `claude/kartrider-drift-3d-web-9gdk1d`. Only the orchestrator merges into it.
- Create lanes with `git worktree add /home/user/cr-wt/<lane> -b lane/<lane> m1`, then `pnpm install --frozen-lockfile --offline`.
- Three checkpoints: **C1** (F1–F3 plus core lane features), **C2** (content complete), **C3** (feature complete). At each, lanes rebase and run `pnpm verify:lane` (typecheck, lint, own tests, own track bakes). The orchestrator merges `--no-ff` in the order L4 → L1 → L3 → L2 → L11 → L8 → world lanes → L10 → L9, then runs the full `pnpm verify`.
- Contract changes go through `docs/design/contract-requests/`. They are batched and applied only at checkpoints.
- **CPU discipline:** 4 cores are shared by about 11 agents. Lanes run filtered vitest with one worker. Only the orchestrator runs e2e, full bakes and matrices.

### M3 — Integration (orchestrator plus 3–4 agents)
- Cross-feature suites:
  - online item race with 2 browsers;
  - team speed/item scoring online;
  - reconnect mid-race;
  - Time Attack ghost on every track;
  - loadout propagation from garage to race;
  - progression rewards after online and offline races;
  - HUD showing every item state.
- Content lock: all 20 tracks at V1–V20 green, all 12 characters and 8 karts registered, all items with VFX, SFX and icons.
- Balance pass: AI tiers vs ghost, rubber-band spread, item bucket sanity from simulated races, archetype ±2%.
- Bug bash: every agent plays three tracks in e2e autopilot plus a scripted human input log, and reviews the screenshots.

### M4 — Polish, performance, review (lanes re-purposed)
- **Perf:** per-track draw/material/triangle budgets; LODs; chunk culling; PVS for heavy tracks; dynamic resolution on Low; `compileAsync` warm-up; lazy chunks (Tone, garage, tracks); bundle budgets.
- **Art polish:** per-theme contact sheets reviewed against `30-art-bible.md`; character lineup; key-art reference renders.
- **Code review:** each package reviewed by a different lane's agent (`/code-review high`); determinism and security review of the server.
- **Localization:** Korean copy review (tone, josa), English copy, and HUD fitting in both languages.
- **Accessibility:** colour-blind gauge palette, HUD scale 80–120%, reduced motion (FOV kick and CA off).
- **Codex pack (L8):** `art/codex/manifest.json` with about 110 slots:
  - 12 portraits and 12 heroes;
  - 8 karts;
  - 20 thumbnails and 20 loading screens;
  - 10 theme key arts and 4 mode cards;
  - a title key art and an original wordmark;
  - 18 item icons;
  - UI textures.
  - Plus prompts, the style guide, `pnpm art:refs` (Playwright renders the procedural references), and bilingual README instructions for dropping files into `apps/client/public/art/overrides/`.

### M5 — Final verification and push
- Run `pnpm verify:full` (E) on a clean clone.
- README (run, controls, hosting, Codex pack), disclaimer check, `docs/design` synced with the code.
- Push to `claude/kartrider-drift-3d-web-9gdk1d`. Open a PR only if asked.

**Sequential vs parallel:** M0 and M1 are sequential. M2 runs 11 lanes in parallel, gated by the feature ladder. M3 is mostly sequential merging with parallel bug fixing. M4 is parallel review/polish lanes. M5 is sequential.

---

## D. Risk register

| # | Risk | L/I | Mitigation |
|---|---|---|---|
| R1 | WebGPURenderer's WebGL2 backend is slow or broken under SwiftShader; the WebGPU path is untested in CI | M/H | M0 spikes S1/S2 gate the project. CI runs every e2e on the WebGL2 backend, plus the WebGPU backend if S2 works. Runtime `auto` falls back to WebGL2 on init failure or device loss and persists the choice. Settings lets the user override. |
| R2 | TSL API unfamiliar to agents; hallucinated APIs | H/M | All TSL lives in `render/materials` (L11) plus theme-local helpers. `CLAUDE.md` requires reading `node_modules/three@0.186.1` source and r186 examples. A console-error-free render smoke runs per track. |
| R3 | WebGPU material init is 16–36× slower (issue #33821) | H/M | ≤ 40 unique materials per scene (BudgetTracker fails tests above that); partId palettes; `compileAsync` behind loading; material cache across races. |
| R4 | Cross-engine determinism | M/H | Arithmetic whitelist enforced by lint; integer-tick timers; quantize every tick; same `.ctrk` bytes everywhere; Node vs Chromium hash test; server stays authoritative with reconciliation, so a desync self-heals. |
| R5 | Mesh collision edge cases (seams, stacked decks, fast landings, loops) | M/H | Smooth baked normals and welded seams; V2 ≥ 8 m deck separation; ray window +1/−2 m; half-step moves (0.37 m at boost vs 0.85 m radius); randomized drop and wall-tunnel tests on `_test` tracks and every roster track. |
| R6 | Netcode complexity (rollback plus SCE plus lobby) | H/H | Offline uses the same RaceRoom through Loopback/Worker, so every solo race exercises it. SimLink matrix with M1–M12 metrics. Deferred for v1: shield-rescue re-sim, adaptive lead, dual-timeline aim, WebTransport. |
| R7 | Visual quality falls short of "AAA" with procedural art | H/H | Art bible; contact-sheet loop (agents read PNGs); M4 art pass per theme; Codex overrides for 2D art; strong post and lighting (PMREM sky, vertex AO, bloom); tight per-theme palettes. |
| R8 | LLM agents author poor tracks (weak spatial reasoning) | H/H | DSL with CLOSE solver, V1–V20, SVG plus elevation/curvature plots, flythrough screenshots, AI ghost timing, gap-3's two hand-authored tracks as templates, `@fallback` features. |
| R9 | Bundle size (three WebGPU build ~400–550 KB gzip; fonts; Tone) | M/M | Budgets in E; Tone lazy after the first gesture; unicode-range font subsets; track assets streamed per race. |
| R10 | AI too slow or bad on 3D features | M/H | Bake-time line/vLim/drift tables (~1–2 µs lookups); bots decide at 20 Hz and steer every tick; per-feature AI tests in the ladder. |
| R11 | Scope explosion | H/H | Priorities: **P0** Solo Speed/Item, Quick Race, Time Attack, online Quick Match and Custom Room, 20 tracks, 12 characters, 8 karts, 18 items. **P1** team modes, Duo. **P2** Infinite Boost, Lens, Mutex, rear-view mirror, Ultra tier, mid-race challenges. P2 is cut first. |
| R12 | Contract drift and merge conflicts across 11 worktrees | M/H | Frozen files and `contracts.lock`; one file per entry; ids pre-assigned; lockfile owned by the orchestrator; checkpoint merges. |
| R13 | CPU contention (4 cores) | H/M | Lane test filters; one vitest worker; heavy suites only on the orchestrator; bake cache keyed by DSL plus trackc hash. |
| R14 | Playwright/browser mismatch | H(if ignored)/H | Pin 1.56.1; never run `playwright install` locally; CI installs its own browser. |
| R15 | Headless render too slow for 20-track screenshots | M/M | 960×540 Low tier; smoke subset (3 tracks) in CI; the full sheet nightly or at M4. |
| R16 | Keyboard and browser pitfalls (Ctrl+W, Alt, Sticky Keys, ghosting) | M/M | Space/E/C alternates, Keyboard Lock in fullscreen, Alt preventDefault on keydown and keyup, WASD, first-run tips. |
| R17 | IP/trademark (Clawd, "Claude", KartRider likeness) | M/M | Original names, items and layouts; parametric sparkle instead of the logo; disclaimer on splash and settings; no monetization; no Nexon assets or fonts. |
| R18 | Audio autoplay and Tone.js staleness | L/M | Title screen "press any key" unlocks audio; Tone only schedules synths and is replaceable behind `SongDef`. |

---

## E. Verification plan

**Commands.** Everything is chained in `pnpm verify` unless noted.
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

**Acceptance thresholds.**

| Area | Metric | Pass |
|---|---|---|
| Physics (M1+) | 0→100 km/h display; 0→97% V_GRIP | 1.17 ± 0.05 s; 3.95 ± 0.10 s |
| | Booster from 184 km/h | ≥ 237 km/h at 1.0 s; plateau 239–240; decay τ ≈ 1.1 s ± 0.15 |
| | Instant boost vs none, from 151 km/h | +11 ± 2 km/h at 0.5 s |
| | Walls at 30 m/s (10°/30°/60°) | Δv −3 ± 2 km/h / −47 ± 5 km/h / stun 15 ticks with booster cancelled |
| | Start boost gain at 5 s (PERFECT / FALSE) | +35 ± 3 m / −7 ± 3 m |
| | 90° R12 corner on a 12 m road at 34 m/s (AI) | drop ≤ 8%; gauge 0.30–0.43 per corner; clumsy drop 35–45 km/h |
| | Flat-plane oracle vs proto2d, 10 s scripted | position error ≤ 1e-6 m |
| Determinism | same log twice; Node vs Chromium; with items and contacts | identical `hashWorld` at every 100th tick |
| Tracks | V1–V20 | 0 errors; closure < 0.05 m (< 0.01 target) |
| | laps; race ref (speed) | `laps == clamp(round(115/refLapSec),1,5)`; 100–130 s; ghost within ±8% of the table |
| | bake artefacts | ≤ 20 s per track; `.ctrk` ≤ 1.5 MB; vis ≤ 2 MB gzip |
| Races (headless, Pro tier ± jitter) | finishers | speed ≥ 7/8, item ≥ 6/8 before retire; no bot stuck > 5 s |
| | incidents | hard wall hits ≤ 0.3 per bot-lap; respawns ≤ 0.5 per bot-lap (tracks without kill zones: 0.1) |
| | coverage (item suite) | every item used ≥ 1×, every effect applied ≥ 1× |
| AI / balance | tier pace vs Legend ghost | Rookie 88 ± 2%, Racer 94 ± 2%, Pro 98 ± 1.5%, Legend ≥ 99.5%; archetypes within ±2% |
| Net (SimLink smoke; gap-4 M1–M12) | local correction without items at 100 ms | p99 ≤ 0.05 m |
| | remote-kart error at 100 ms | p95 ≤ 0.3 m |
| | predicted BLOCK became HIT | 0 without loss; ≤ 0.2% at 100 ± 10 ms with 0.5% loss |
| | roulette known before it lands (≤ 300 ms) | ≥ 99.9% |
| | bandwidth | ≤ 24 KB/s down, ≤ 5 KB/s up |
| | resume after 2 s drop | state restored ≤ 1 s |
| | rollback cost | p99 ≤ 1.5 ms per frame at 200 ms RTT |
| Perf (bench) | `step` | ≤ 6 µs per kart-tick |
| | AI | ≤ 5 µs per kart-tick |
| | room tick (8 karts, 7 bots, items) | p99 ≤ 0.5 ms |
| | load | 50 rooms: tick p99 ≤ 4 ms |
| Perf (e2e, Low, 960×540) | render counters | drawCalls ≤ 150 (Med 250, High 400); unique materials ≤ 40; triangles ≤ 0.6M (1.2M / 2M) |
| | JS update (non-render) | p95 ≤ 4 ms; render-submit tracked ±20% vs baseline |
| E2E | boot → lobby | ≤ 8 s |
| | errors | zero console errors (allowlist) |
| | solo race | autopilot finishes and results render |
| | online | 2 contexts join a 6-char room, race 1-lap Proving Ring, both see results |
| | screenshots | pixel variance above threshold on every track |
| Bundle | sizes | initial JS ≤ 1.0 MB gzip; CSS ≤ 60 KB; first-screen fonts ≤ 400 KB; Tone chunk lazy |
| i18n / save | parity and migration | ko/en key parity 100%; migration fixtures v1 load; no raw keys in screenshots |

---

## F. Challenges to your decisions

1. **Collision data structure (decision 3): keep the hybrid mesh + spline design, but do not use three-mesh-bvh inside the sim.**
   - A custom sparse 3D grid of 4 m cells (CSR lists, allocation-free ray and sphere queries, stored in `.ctrk`) is about 300 lines.
   - It keeps three out of `sim` and `server`.
   - It avoids three-mesh-bvh's index reordering, its callback-closure allocation per query, and version-coupled serialized BVHs.
   - Every float operation is then ours to audit.
   - three-mesh-bvh stays where it shines: AO baking in trackc and camera occlusion on the client.
2. **Sub-steps (decisions 2/3):** do not run the whole model twice per tick. Gap-2's constants were validated with one integration per 1/60 s; the decay factors and lags are dt-dependent. Integrate the dynamics once, then move the kart in two half-displacements with collision after each. Kart–kart contact is checked at both half-steps.
3. **Classic "×thrust" values (decision 2) are a latent bug.**
   - Under `A0(1−(u/V)²)` the terminal speed does not depend on A0, so draft ×1.1 as written does nothing at top speed.
   - Canonical conversion: v* ∝ √F on a drag-dominated curve.
   - Draft becomes vT 1.05·vGrip and A0 ×1.1, active 90 ticks after 120 ticks charging in the slipstream.
   - Boosters and Turbo use V_BOOST 44.4. Instant boost stays gap-2's +9 m/s² capped at 1.05·V_GRIP.
   - Your 0.5 s (30-tick) instant-boost window is fine. It only changes how often the boost succeeds, not its size; re-run the gap-2 lap tables once to confirm.
4. **HMAC roulette (decision 4):** WebCrypto HMAC is async and cannot run inside `step()` in the offline Worker. Use HalfSipHash-2-4 (32-bit, synchronous) keyed with a 128-bit per-room secret. It is effectively as unpredictable for a fan game and runs the same in Node and the Worker.
5. **Full-world prediction (decision 4): endorse it for v1.**
   - Once the world is a flat, copyable, quantized-every-tick state, rolling back everything is simpler than running two timelines (predicted local, interpolated remotes). Gap-4 shows interpolated remotes break bumps and draft by 5–8 m.
   - Cut for v1: shield-rescue micro re-sim (use "refund + late-signal" instead); adaptive lead (fixed at 21 ticks); dual-timeline aim validation (validate at tick T with a +5° cone margin and a 200 ms anti-spoof clamp); breadcrumb trails (spline-route homing).
   - Send one input frame per tick.
6. **Renderer (decision 1): keep WebGPURenderer.** WebGLRenderer + EffectComposer would be marginally lower risk, but you asked for current tech, TSL gives one shader language for both backends, and the r186 post nodes are built for it. Accept it only with R1–R3 in place: M0 spike gate, a single materials library, the material budget enforced in tests, and auto-fallback. If S1 fails in M0, switch to WebGLRenderer before M1; that is the last cheap moment to switch.
7. **Preact + signals: endorse.** Vanilla is not viable for about 10 screens built by several agents; React costs about 40 KB for nothing gained. Signals bound directly into JSX text avoid re-rendering the HUD.
8. **AI tiers (decision 5):** do not implement "Legend 101%" as a speed multiplier. Cap the bot `vMul` at 1.00; Legend reaches about 100% of the ghost through perfect execution (drift optimality, instant-boost rate, lines, draft). Rubber-band stays at ±4% but lives in sim as a deterministic function, so remote clients predict bots exactly. It is off on Legend and in the last 15% of the final lap.
9. **Road widths (decision 3): accept, plus V19 drift demand.** Gap-2 shows that on roads 16 m or wider, 90° corners are almost flat-out on grip. Every speed track must have at least N (D1: 3, D5: 9) corners where the Pro ghost's drift beats grip by ≥ 0.1 s. Widths are tuned by the ghost, not by feel.
10. **Timers and quantization:** make "integer-tick timers + `quantizeWorld()` as the final operation" a contract, not a guideline. The grids are 1/4096 m for position, 1/4096 m/s for velocity and 1/32768 for direction, and they are chosen so no decay stalls visibly. Snapshots are then lossless and rollback restores are bit-exact.
11. **Missile airborne:** model it as a kinematic effect (visual lift curve, horizontal speed eased to ×0.25 at landing, controls locked, immune to ground hazards above 3 m) rather than launching the body ballistically. This removes landing-on-wrong-deck and wall-ejection cases from the netcode.
12. **Gravity:** 28 m/s², fixed, because V11 jump validation used it. Only the tick table changes this value.
13. **Environment and tooling:**
    - Pin Playwright 1.56.1.
    - Use `erasableSyntaxOnly` so Node runs the server and tools as `.ts` (no enums).
    - Do not commit bake artefacts (tens of MB); commit `tracks/golden.json` hashes. `pnpm start` builds and serves the client and the WS server on one port.
    - The art-override index is served dynamically by the Vite plugin and the Node server, so images the user drops in are picked up without a rebuild. Static hosting falls back to a build-time snapshot.

### Critical Files for Implementation
All of these are to be created; the first two are read-only inputs.
- `/tmp/claude-0/-home-user-ClaudeRider/4ffacf22-1d12-5179-a0b7-d8a51c4bc20c/tasks/ws7066bj6.output` (research source of truth → `docs/research/`)
- `/root/.claude/plans/nexon-kartrider-drift-atomic-quilt-agent-a181d8fa946423c79.md` (gap-2 prototype → `packages/sim/test/oracle/proto2d.ts`)
- `/home/user/ClaudeRider/packages/sim/src/core/state.ts` and `/home/user/ClaudeRider/packages/sim/src/step.ts` (world, quantization, step and decision contracts)
- `/home/user/ClaudeRider/packages/sim/src/track/format.ts` and `/home/user/ClaudeRider/packages/sim/src/track/BakedTrack.ts` (`.ctrk` and runtime query contract shared by trackc, sim, server and client)
- `/home/user/ClaudeRider/docs/design/01-decisions.md` (ADR log resolving all 20 contradictions plus section F; every lane codes against it)
