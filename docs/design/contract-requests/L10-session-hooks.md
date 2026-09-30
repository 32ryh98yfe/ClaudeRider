# L10 → owner of `apps/client/src/game/Session.ts` (orchestrator / L1 for ghosts / L9 for online)

The L10 race screen (`ui/screens/race/RaceScreen.tsx`) already calls these hooks **optionally**. It feature-detects them,
so nothing breaks before they land. Each item lists what is needed, why, and a suggested diff.

## 1. Offline pause: `setPaused(p: boolean)` (31-ui-spec §2.1 pause overlay, §7.4 "offline races pause")
Esc opens the pause menu, and so does window blur during an offline race. The menu works today, but the sim keeps
running under it.
```ts
// Session
private paused = false;
setPaused(p: boolean): void { this.paused = p; this.last = performance.now(); }
// in frame(): after computing dt
if (this.paused) { this.renderer.render(); return; }
```
The race screen calls `(session as { setPaused?(p: boolean): void }).setPaused?.(true|false)`.

## 2. Time Attack: `SessionOptions.solo?: boolean` (13-modes-rules §4: 1 kart, no bots, no rubber-band, no retire timer)
The Time Attack screen starts `mode: 'timeAttack'` with `solo: true`. The sim already treats `timeAttack` as speed
rules. Session still builds 7 bots, though.
```ts
export interface SessionOptions { /* … */ solo?: boolean; teams?: TeamFormat }
// load(): when opts.solo, every slot except localSlot is { kind: 'empty', team: 0, name: '', characterId: 'clay', kartBodyId: 'pebble', vMul: 1 }
// and rules.rubberBand = false, rules.retireTicks = 1e9 (the hard cap still applies)
```

## 3. Ghost record / replay (13-modes-rules §4; L1 owns `sim/race/ghost.ts`)
- Record: push `packInput(input)` for the local slot every tick. Expose `ghostLog(): { config: RaceConfig; inputs: number[] }`.
- Replay: `SessionOptions.ghost?: GhostData` (type in `meta/ghost.ts`). Re-simulate a second world with the same inputs and
  render it as a translucent kart with no collisions.
- L10 already persists ghosts in IndexedDB (`meta/ghost.ts`: `saveGhost`, `loadGhost`). It validates `simVersion` and
  `trackHash` and drops outdated ghosts with the `errors.ghost_outdated` toast. It keeps the ghost toggle in the save
  (`settings.ghost`).

## 4. Team races with bots (P1): `SessionOptions.teams?: TeamFormat`
Mode select shows Duo and Squad disabled until this exists.

## 5. Online sessions (L9)
`ui/screens/race/sessionFactory.ts` exposes `setSessionFactory(fn)`. An online session implements the `Session` surface
(`load`, `start`, `stop`, `onEnd`, `world()`, `config`, `slotNames`, `renderer`). It should also expose
`online = true`, so the pause menu hides "restart" and does not freeze the race. To route `raceStart`, call
`navigate('loading', { online: '1', track, mode, … })`. The factory receives those params.

## 6. Settings consumers (for L11 render/camera and Stage)
L10 saves these in `SettingsV1` (see `L10-save.md`). They need readers:
- `renderScale`, `fpsCap`, `shadows | bloom | particles` (`'tier' | 'off' | 'on'`), and `motionBlur`: read by Stage and the
  post chain.
- `cameraDistance`, `cameraShake` and `reducedMotion` (no FOV kick, shake, blur or CA): read by `render/camera`.
- `nameTags`, `units` and `instantHint`: already applied by the HUD.
