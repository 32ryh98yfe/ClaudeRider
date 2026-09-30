# L10 → L9 (lobby protocol, server art index, race routing)

The queue and room screens are bound to `apps/client/src/net/lobby.ts` and work against the offline stub.
With `?mock=queue|stage|room|roulette` they render with fixture data.

## 1. `RoomSettings` is missing host settings from 13-modes-rules §7.2 (additive request)
```ts
retireTicks?: 300 | 600 | 900 | 1200;   // retire timer
itemSet?: 'standard' | 'light' | 'chaos';
friendlyFire?: 'off' | 'area' | 'all';
rubberBand?: boolean;
instantBoostInItem?: boolean;
```
The room settings panel will show these rows once the fields exist. Today it shows mode, format, track or roulette,
laps, bot tier, fill bots and private.
`C2SLobby.slot` already accepts `tier`, but `lobbyActions.slot(slot, action)` cannot pass it. Please add an optional
`tier` parameter so "add AI" can choose one.

## 2. Race routing
On `raceStart`, call `navigate('loading', { online: '1', track, mode, tier })`. Then register an online session factory
with `setSessionFactory` (`ui/screens/race/sessionFactory.ts`).
On race end, the results screen reads `lobby.room.value` to choose between "back to room" and "search again". It
auto-returns after 12 s when online. Pass `online: true` via `setLastResult` (`ui/screens/results/lastResult.ts`) or set
`lobby.lastResult`.

## 3. HUD net indicator
`ui/store/hudExtra.ts` `hudX.net` = `{ pingMs, late }` (late = ms of the last late signal, 0 = none). The HUD draws
ping bars and "늦은 신호" at the top right. Set it to `null` offline.

## 4. Art override index (ADR-013)
Please serve `/art/overrides/index.json` from the Node server and a Vite dev plugin. When the folder is empty, return
`{}` rather than 404, because a 404 logs a console error that the e2e suite counts. Once that ships, set
`ART_INDEX_READY = true` in `apps/client/src/art/loader.ts`, or tell L10 to. Until then the loader requests the index
only with `?art=1`.
