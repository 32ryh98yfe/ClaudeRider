# M4 server security review: findings to fix

This is the adversarial review of `apps/server`, the net decoders and `packages/room` input handling, run on 2026-10-01. Each finding was reproduced unless it says otherwise. Repro scripts are in the orchestrator's scratchpad (`secreview/`). The common root cause is that **nothing is limited per IP**: `main.ts` never reads the remote address.

## High
1. **Race spam.** `server.ts` `hostStart`/`beginStart`/`enterLoading`/`tickRoom`.
   - Problem: create → start → loaded → disconnect, in a loop, leaves 8-kart races running with nobody connected. 200 races push the tick p99 to 138 ms.
   - Fix:
     - a global cap on races, `maxRaces` (50 by default), returning `serverFull`;
     - stop a race once no human has been connected for longer than `reconnectMs`;
     - at most 2 concurrent races per IP.
2. **A client that never reads.** `server.ts:136,140,145,146,676`, `net/wsTransport.ts`.
   - Problem: a PING flood from a socket that never reads lets RSS grow without limit. 80 MB sent became 1.74 GB, and it is not freed.
   - Fix:
     - in `wsTransport.send`, terminate the socket when `ws.bufferedAmount > 1 MiB`;
     - a per-transport token bucket in `onFrame`, applied before PING and before `decodeLobby`;
     - send `rateLimited` at most once per window.
3. **Session cap lockout.** `server.ts:197,631-645`, `main.ts`.
   - Problem: hello then disconnect, in a loop, fills the 5000-session cap in 2.4 s; idle connected sessions never expire.
   - Fix:
     - limits per IP on connections and sessions;
     - a WebSocket ping every 15 s, terminating after 2 missed pongs;
     - expire sessions that never joined a room about 10 s after they disconnect.

## Medium
4. **A static-file stream error crashes the process.** `http/static.ts:36`, `http/artIndex.ts:63`.
   - Problem: `createReadStream(...).pipe(res)` has no error handler, so EMFILE, ENOENT or EACCES kills the server.
   - Fix: `pipeline(createReadStream(f), res, (e) => { if (e) res.destroy(); })`.
5. **Frame floods stall the event loop.** `server.ts:129-146`.
   - Problem: `sessionOf` scans every session on each frame, and `JSON.parse` runs before `admit()`.
   - Fix: a `Map<Transport, Session>`, and the token bucket (item 2) before decoding.
6. **The hello timeout can be bypassed.** `server.ts:185,196`.
   - Problem: `pendingHello.delete` runs before name validation, so `nameInvalid` leaves an untracked socket open.
   - Fix: delete only after the session is bound, or close on `nameInvalid`.
7. **`join` mid-race leaks rooms.** `server.ts:313-323,619-629`.
   - Problem: a player can join another room while their race is loading or running, and empty rooms survive the results.
   - Fix: refuse `join` while racing or loading (`inRace`); `afterResults` closes rooms with no humans.
8. **Resume-hello amplification.** `server.ts:184-215`, `RaceRoom.ts:194-204`.
   - Problem: each resume broadcasts the room view to every member.
   - Fix: at most 1 resume per second per session; send the view only to the session that resumed unless its connected state changed.

## Low
9. **Bot tier check.** `server.ts:378`: `tier in AI_TIERS` accepts `constructor`, which crashes the room. Fix: `Object.hasOwn(AI_TIERS, tier)`.
10. **Name and chat filters.** `validate.ts:22` misses U+2066–2069, U+061C and invisible names (U+3164, U+FFA0, U+00AD, U+034F).
    - Fix: `/[\p{Cc}\p{Cf}͏ᅟᅠㅤﾠ]/gu`, and require at least one `\p{L}` or `\p{N}` character.
11. **Room code brute force** (not reproduced). Fix: limit failed joins per IP, for example 10 per minute.
12. **Race kicks don't last** (not reproduced). `RaceRoom.ts:282`, `race/host.ts:50`: a kicked peer resumes at once. Fix: `kickedUntil = now + 10 s` per human.

## Checked and fine
- Static and art path traversal.
- Aborted-download fd leaks.
- `maxPayload` 64 KB, with no compression.
- `decodeLobby` limits.
- The binary decoders, fuzzed with 180k frames.
- Lobby JSON fuzzing.
- Kart ownership is server-side.
- The input tick window and clamps.
- 128-bit tokens.
- The host and settings whitelists.
- Track ids are validated before any path is built.
- Chat rate.
- Race buffers and the slow-consumer kick.
- No ambient credentials, so no CSRF over the WebSocket.
