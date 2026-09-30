# L10 → L9 (lobby protocol, server art index, race routing)

The queue and room screens are bound to `apps/client/src/net/lobby.ts` (the real `net/online.ts` store after the L9
merge). With `?mock=queue|stage|room|roulette` they render with fixture data.

## 1. `RoomSettings` host settings (13-modes-rules §7.2): done by L9, wired by L10
L9 added `retireSec`, `itemSet`, `friendlyFire`, `rubberBand` and `instantBoostInItem`. The room settings panel now has a
"More rules" section with these rows, falling back to the server defaults when a field is absent (10 s, standard, area,
on, on). The item-only rows show only in Item mode, and friendly fire only in team formats.

**Still open:** `C2SLobby.slot` accepts `tier`, but `lobbyActions.slot(slot, action)` cannot pass it. Please add an
optional `tier` parameter so that "add AI" can choose one:
```diff
-  slot: (slot: number, action: 'open' | 'close' | 'bot' | 'kick'): void => send({ t: 'slot', slot, action }),
+  slot: (slot: number, action: 'open' | 'close' | 'bot' | 'kick', tier?: AiTier): void => send({ t: 'slot', slot, action, ...(tier ? { tier } : {}) }),
```

## 2. Race routing: done
- `raceStart` navigates to `loading` with `online: '1'`.
- `RaceScreen` takes the pending race (`takePendingRace`) and builds `Session.online(...)`. The loading card shows the
  server line-up at once and marks only `yourSlot` as "You".
- Results use the local slot (`LastResult.me`). A custom room follows the server: it navigates to `room` when the room
  returns to `waiting`, or when the 12 s timer runs out. A quick match offers "Search again", which leaves the dissolved
  room and re-queues with the same mode and format; on timeout it goes to the lobby.
- The loading, racing and results room phases disable Ready and Start and show "race in progress". The subtitle shows
  `RoomView.trackId` once the server has picked the track.

## 3. HUD net indicator: done on the client side
While an online Session runs, `RaceScreen` writes `hudX.net = { pingMs: stats.rttMs, late }` twice a second and clears
it when the race ends. HudPresenter sets `late` for 3 s when an effect on the local kart resolves as `hit_late_input`
(the v1 late shield). The lateness is estimated as RTT/2, because the event carries no arrival delay; an exact value would
need one on the event. Per-kart ping pills in the standings wait on PLAYER_RTT from the server (L9 gap).

## 4. Art override index (ADR-013): still open
Please serve `/art/overrides/index.json` from the Node server and a Vite dev plugin. When the folder is empty, return
`{}` rather than 404, because a 404 logs a console error that the e2e suite counts. Once that ships, set
`ART_INDEX_READY = true` in `apps/client/src/art/loader.ts`, or tell L10 to. Until then the loader requests the index
only with `?art=1`.
