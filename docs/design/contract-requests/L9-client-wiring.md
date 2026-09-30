# L9 → L10 (and orchestrator): wiring online races into the screens

**Lane:** L9 NET · **For:** L10 UI (`ui/screens/**`, `game/HudPresenter.ts`), orchestrator (`tools/dev.mjs`, `vite.config.ts`).
**Status:** requested. Everything below already works without these edits (see "Works today"); the edits make it explicit and complete the UX.

## Works today (no UI changes needed)
- `apps/client/src/net/online.ts` implements the `net/lobby.ts` store contract: `connect(name, loadout)`, `lobbyActions.*`, `handleServer`, the signals. Importing `game/Session.ts` installs it.
- On `raceStart` it stores the race (`pendingRace`), opens the race channel so nothing sent during loading is lost, and calls `navigate('loading', { track, mode, online: '1' })`.
- `RaceScreen` then runs `new Session(...)` as it does now. The constructor takes the pending online race, so the race screen, HUD and results work online unchanged.
- `raceEnd` fires `Session.onEnd(result)`, so `RaceScreen` records the result and navigates to `results`. The result is also in `lobby.lastResult`.
- Offline races run the authority in a module Worker (`workers/authority.worker.ts`), with a main-thread fallback. `?authority=main` forces the fallback; `?simRate` still works.
- `window.__crNet` is a dev/test hook that `e2e/net.spec.ts` uses to drive the lobby. It exposes `{ lobby, actions, connect, conn, pendingRace, workerSelftest }`.

## Requested edits

### 1. RaceScreen (L10): explicit online entry
Build online sessions explicitly instead of relying on the implicit pickup:
```ts
import { takePendingRace } from '../../../net/online.ts';
const race = params.online === '1' ? takePendingRace() : null;
const s = race ? Session.online(Stage.renderer!, Stage.tier, race, { autopilot: q.get('autopilot') === '1' })
               : new Session(Stage.renderer!, Stage.tier, { ...as today });
```
- The loading card can show `race.config.slots` (names and characters) while `s.load()` runs.
- `Session.isOnline` and `Session.authorityKind` (`'worker' | 'main' | 'server'`) are public.

### 2. Results → back to the room or queue (L10)
- Online, the server keeps the room in `results` for 12 s. After that, a custom room returns to `phase: 'waiting'` with ready states reset, and a quick room dissolves.
- Suggested behaviour: on the results screen, when `lobby.room.value?.phase === 'waiting'`, call `navigate('room')`.
- For Quick Match, offer "Search again", which calls `lobbyActions.quick(mode, teams)`.

### 3. Room and queue screens (L10): new optional fields
All additive, in `packages/net/src/protocol/lobby.ts`:
- `RoomView.trackId` is the chosen track during `loading`/`racing`, including after a roulette.
- `RoomView.kind` is `'custom' | 'quick'`.
- `RoomView.endsAt` is set during `countdown` (the 10 s auto-start), `roulette` and `results`. Show `endsAt - (Date.now() + lobby.clockOffsetMs.value)`.
- `RoomSettings` gains optional `retireSec`, `itemSet`, `friendlyFire`, `rubberBand` and `instantBoostInItem`. The server defaults them when absent.
- New `LobbyErrorCode` values: `notReady`, `nameInvalid`, `chatFiltered`, `resumeExpired`, `slowConsumer`, `trackHashMismatch`, `badMessage`, `serverFull`. Please add them to the `errors` i18n namespace in both ko and en.
- `welcome.session` is the **public** id; compare it with `RoomView.hostSession`. The secret resume token (`welcome.resume`) is kept in sessionStorage by the connection. Never show it.
- Chat is limited to 200 characters and 1 message per second on the server. `lobbyActions.chat` already cuts at 120 characters.

### 4. HudPresenter type (L10)
`HudPresenter` takes a `RaceRoom` but reads only `.world` and `.track`. `Session` currently passes `{ world, track } as unknown as RaceRoom`. Please type the parameter structurally:
```diff
-constructor(room: RaceRoom, me: number, ...)
+constructor(room: { readonly world: Readonly<WorldState>; readonly track: BakedTrack }, me: number, ...)
```
- Per-kart ping pills can read `session.net.stats.pingMs[slot]` (filled from PLAYER_RTT events). The server-side feed is not wired yet (see gaps).
- The local connection's RTT is `session.net.stats.rttMs`.

### 5. Dev server → game server (orchestrator)
- In production the client connects to `ws(s)://<page host>/ws`.
- Under `pnpm dev`, the Vite page runs on another port. The client reads `import.meta.env.VITE_SERVER_PORT` (default 8787), but `tools/dev.mjs` only passes `SERVER_PORT`.
- `?server=ws://host:port/ws` overrides the address.
- Either of these fixes it:
```diff
 // tools/dev.mjs
-{ stdio: 'inherit', env: { ...process.env, SERVER_PORT: serverPort } }
+{ stdio: 'inherit', env: { ...process.env, SERVER_PORT: serverPort, VITE_SERVER_PORT: serverPort } }
```
or a proxy in `apps/client/vite.config.ts`:
```diff
-  server: { port: 5173, strictPort: false, host: '127.0.0.1' },
+  server: { port: 5173, strictPort: false, host: '127.0.0.1', proxy: { '/ws': { target: `ws://127.0.0.1:${process.env.SERVER_PORT ?? 8787}`, ws: true } } },
```

## Known gaps on the L9 side
- PLAYER_RTT: `RaceRoom.noteRtt(slot, ms)` exists, but the server does not yet measure per-socket RTT and call it. The ping pills show 0.
- Spectators and the "hide code" setting are not implemented; `RoomView.code` is always sent.
