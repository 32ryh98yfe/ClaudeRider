# ClaudeRider: rules for contributors and AI agents

ClaudeRider is an unofficial, non-commercial fan kart racer that recreates the feel of KartRider: Drift. Its racers are Clawd mascot variations.

**Read first:**
- `docs/design/01-decisions.md`, the ADRs and canonical constants. It is the source of truth.
- `docs/design/02-contracts.md`, the architecture, interface contracts, lanes and thresholds.
- Topic specs: `docs/design/10-*.md` through `60-*.md`.
- Raw research: `docs/research/`.

## Layout
- `packages/content` holds data only: ids, schemas, and one file per item, effect, kart, character, theme and challenge.
- `packages/sim` is the deterministic core: `step()`, the track runtime, karts, race rules, items and AI.
- `packages/trackc` compiles the track DSL (`tracks/**/*.ctd`) into `.ctrk` and `.vis` files. It runs in Node only.
- `packages/net` holds the binary protocol codecs, `NetClient` (prediction and rollback) and the SimLink test harness.
- `packages/room` holds `RaceRoom`, the authority. It runs both in the Node server and in the browser Worker.
- `apps/server` is the Node `ws` server: lobby, matchmaker, rooms and static files.
- `apps/client` is the Vite and Preact client, built on three r186 WebGPURenderer with TSL.

## Commands
Run commands from the repo root.
- `pnpm gen`: regenerate the registries. It runs automatically before other commands; run it yourself after adding a registry file.
- `pnpm typecheck` checks all projects. `node tools/typecheck.mjs sim` checks one project.
- `pnpm lint`
- `pnpm test` runs every test. In lanes, use `pnpm vitest run --project <name> --maxWorkers=1`.
- `pnpm bake`: compile every track and validate it (`node packages/trackc/src/cli.ts build <id> --validate --preview`).
- `pnpm dev`: the client on http://127.0.0.1:5173, plus the server on :8787.
- `pnpm build && pnpm e2e`: headless Chromium through Playwright 1.56.1.
  - **Never run `playwright install`.** The browser is preinstalled under `/opt/pw-browsers`.

## Hard rules
1. **Determinism (ADR-003).** Code in `packages/sim/src/**`, apart from `ai/`, must not use:
   - `Math.sin/cos/tan/atan2/exp/log/pow/hypot/random`
   - `**`
   - `Date` or `performance`
   - `Float32Array` for state

   Use the helpers in `sim/src/core/math.ts`. Timers are integer ticks. `quantizeWorld()` is the last operation of `step()`.
2. **Package boundaries.**
   - `sim` may import only `@cr/content`.
   - `net` and `room` must not import three, the DOM or `node:*`.
   - `client` must not import trackc or `node:*`.
   - ESLint and `pnpm check:deps` enforce these rules.
3. **Frozen contracts.** The files listed in `contracts.lock` may only be changed by the orchestrator.
   - To request a change, write `docs/design/contract-requests/<lane>-<topic>.md`.
   - `pnpm check:frozen` fails on any unapproved edit.
4. **One file per registry entry.** Add `packages/content/src/items/<id>.ts` with `export default defineItem({...})`. Never edit generated files or central index files.
   - Every id and wire code is already assigned in `packages/content/src/ids.ts`, which is append-only and orchestrator-owned.
5. **Dependencies.** Only the orchestrator edits `package.json` or `pnpm-lock.yaml`. Everything you need is already installed.
6. **three.js r186 and TSL.**
   - Import from `three/webgpu` and `three/tsl`.
   - Never use `ShaderMaterial`, `RawShaderMaterial` or `onBeforeCompile`.
   - **Read the source** in `node_modules/three/src` and `node_modules/three/examples/jsm` before you use an API; never guess signatures.
   - Every shared material goes through `apps/client/src/render/materials` (the MaterialLibrary). Keep to at most 40 unique materials per scene.
7. **Missing registry entries render placeholders and log a dev warning.** They never crash.
8. **i18n.** Every user-visible string goes through `t('ns.key')`. Korean is the default and English the second language. Add keys under your lane's namespace in both `ko` and `en`.
9. **IP hygiene.**
   - Use no Nexon names, tracks, characters, item names, fonts, sounds or icons.
   - Do not use the exact Claude/Anthropic logo; use the parametric sparkle.
   - Keep the disclaimer on the title screen and in Settings → About.
10. **Resources.** The machine has 4 CPUs shared by several agents.
    - Run filtered tests with `--maxWorkers=1`.
    - Leave the full e2e suite and all-track bakes to the orchestrator, unless your lane owns them.

## Style
- Use TypeScript strict with `erasableSyntaxOnly`: `as const` objects instead of enums, and no parameter properties.
- Relative imports use `.ts` extensions.
- Name things in plain English. Comments explain *why*.
- Code in hot paths (sim, render loops) does not allocate per frame or per tick: reuse scratch objects.

## Lanes (parallel agents in git worktrees)
- **Setup** (once per worktree, from its root): `pnpm install --offline && pnpm gen && pnpm bake`. The pnpm store is local, so this takes seconds.
- **Ports.** Never use the defaults (5173 / 8787) inside a lane; another agent may own them.
  - Pick your lane's ports: L1 = 5201/8801, L2 = 5202/8802, … L11 = 5211/8811.
  - Dev server: `DEV_PORT=52NN SERVER_PORT=88NN pnpm dev`, or `npx vite apps/client --port 52NN --strictPort`.
  - E2E: `E2E_PORT=88NN pnpm e2e` (after `pnpm build`).
- **Visual checks.** Render in headless Chromium with `?renderer=webgl2`:
  - `node tools/shots/shot.mjs "<url>" <out-prefix> 4000 key:Enter 4000 …`, then look at the PNGs.
  - SwiftShader is a CPU rasterizer and very slow (≈1–3 fps). Add `&quality=low&dpr=0.5` for flow tests; use `&autopilot=1&simRate=20&laps=1` to finish a race quickly.
  - Other dev query flags: `bloom=0|1`, `shadows=<size>`, `debug`.
- **Ownership.** Edit only the paths your lane owns (listed in your brief).
  - If you need a change elsewhere, write `docs/design/contract-requests/<lane>-<topic>.md`: what, why, and the exact diff.
  - Where your brief grants additive edits to a frozen file (new optional fields or sections only), make the edit, run `node tools/check-frozen.mjs --update`, and also write the request file. The orchestrator reviews it at merge.
- **Commits.** Commit to your worktree branch in small, coherent steps. Messages look like `L<n>: <what>`. Never push, rebase or merge other branches.
- **Done means** all of these pass:
  - `pnpm check:frozen`, `pnpm check:deps`, `pnpm typecheck` and `pnpm lint`;
  - your projects' tests;
  - `pnpm build`.

  End with a short report: what shipped, the test evidence, known gaps, and any contract requests.
