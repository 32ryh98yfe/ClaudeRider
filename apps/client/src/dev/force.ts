// Dev-only visual forcing of driving-technique presentation (?force=drag,reverse) so the HUD chip, streak pips,
// gear badge and VFX can be reviewed in screenshots without performing the technique. Only the local kart's
// presentation changes; the sim never sees it. Production builds compile the query read out (DEV is false).
export interface DevForce {
  /** Show the local kart as dragging with a streak cycling 1 → 2 → 3 every 0.7 s. */
  drag: boolean;
  /** Show the local kart in reverse gear (R badge, reverse light). */
  reverse: boolean;
}

export const devForce: DevForce = { drag: false, reverse: false };

if (import.meta.env.DEV && typeof location !== 'undefined') {
  const f = (new URLSearchParams(location.search).get('force') ?? '').split(',');
  devForce.drag = f.includes('drag');
  devForce.reverse = f.includes('reverse');
}

/** Forced tap streak for the drag chip at `nowMs` (1..3). */
export const forcedStreak = (nowMs: number): number => 1 + (Math.floor(nowMs / 700) % 3);
