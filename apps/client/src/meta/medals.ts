// Time Attack medals [P]: relative to the track's reference race (Pro ghost lap × laps). Gold ≤ 103 %, silver ≤ 108 %,
// bronze ≤ 115 %. When the bake has no Pro ghost yet, the reference is estimated from the lap length.
export type Medal = 'gold' | 'silver' | 'bronze';
export const MEDAL_FACTORS: Readonly<Record<Medal, number>> = { gold: 1.03, silver: 1.08, bronze: 1.15 };

export function medalTimes(refRaceTicks: number): Record<Medal, number> {
  return { gold: Math.round(refRaceTicks * MEDAL_FACTORS.gold), silver: Math.round(refRaceTicks * MEDAL_FACTORS.silver), bronze: Math.round(refRaceTicks * MEDAL_FACTORS.bronze) };
}

export function medalFor(raceTicks: number | null | undefined, refRaceTicks: number): Medal | null {
  if (!raceTicks || raceTicks <= 0 || refRaceTicks <= 0) return null;
  const m = medalTimes(refRaceTicks);
  return raceTicks <= m.gold ? 'gold' : raceTicks <= m.silver ? 'silver' : raceTicks <= m.bronze ? 'bronze' : null;
}

/** m:ss.mmm from ticks (60 Hz). */
export function fmtTicks(ticks: number | null | undefined): string {
  if (!ticks || ticks <= 0) return '--:--.---';
  const ms = (ticks * 1000) / 60;
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), x = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(x).padStart(3, '0')}`;
}
/** Signed delta "+1.234" / "−0.456" from ticks. */
export function fmtDelta(ticks: number): string {
  const s = Math.abs(ticks) / 60;
  return `${ticks < 0 ? '−' : '+'}${s.toFixed(3)}`;
}
