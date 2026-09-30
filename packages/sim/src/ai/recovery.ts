// Stuck and wrong-way recovery (14-ai §10): slow for 1.5 s → reverse with counter-steer for 0.8 s →
// drive out on full lock → no real progress after ~3.3 s → manual reset (R, allowed after 60 slow ticks).
// The spec's 240-tick reset point is pulled in to 200 so reset + respawn + relaunch stay inside 5 s.
// Pointed the wrong way at low speed → turn around on full lock; still wrong after 2 s → R.
// Keeps the acceptance bar "no bot stuck > 5 s" (E) without leaning on the sim's 4 s auto-respawn.

export const RecoveryMode = { NONE: 0, REVERSE: 1, DRIVE_OUT: 2, TURN_AROUND: 3, RESET: 4 } as const;

export interface RecoveryIn {
  /** Ticks since GO (recovery never fires in the launch). */
  sinceGo: number;
  /** Planar speed (m/s), forward speed along the nose (m/s). */
  v: number; vFwd: number;
  /** Signed angle from the nose to the pursuit target (rad, + = left) and from the nose to the track tangent. */
  aTarget: number; aTrack: number;
  /** The sim's own counters (manual-R eligibility). */
  lowSpeedTicks: number; wrongWayTicks: number;
  /** Kart can act: racing, not respawning, not in hard CC, grounded or coyote. */
  canAct: boolean;
  /** Ticks since the last respawn (a fresh respawn stands still for a while). */
  sinceRespawn: number;
  /** Race distance (m): an episode only ends after real forward progress. */
  raceDist: number;
}

export interface RecoveryOut { steer: number; thr: number; brk: number; reset: boolean }

const SLOW_V = 2, SLOW_TICKS = 90, REVERSE_TICKS = 48, DRIVE_OUT_TICKS = 60, RESET_AT = 200, PROGRESS_M = 12, WRONG_DEG = 110 * Math.PI / 180, TURN_LIMIT = 150;

export class Recovery {
  mode: number = RecoveryMode.NONE;
  private t = 0;          // ticks in the current mode
  private slow = 0;       // consecutive slow ticks
  private episode = 0;    // ticks since the stuck episode began (0 = none)
  private wrong = 0;      // consecutive ticks pointed the wrong way at low speed
  private startDist = 0;  // race distance when the episode began
  /** Episodes started / resets pressed (for tests and the balance report). */
  episodes = 0; resets = 0;

  reset(): void { this.mode = RecoveryMode.NONE; this.t = 0; this.slow = 0; this.episode = 0; this.wrong = 0; }

  /** Returns true when recovery overrides the driving controls this tick (writes `out`). */
  update(r: Readonly<RecoveryIn>, out: RecoveryOut): boolean {
    out.reset = false;
    if (!r.canAct || r.sinceGo < 90 || r.sinceRespawn < 40) { this.reset(); return false; }
    const slowNow = r.v < SLOW_V;
    this.slow = slowNow ? this.slow + 1 : 0;
    // wrong way: the nose points > 110° away from the track at low speed (after a spin or a bad bounce)
    const wrongNow = Math.abs(r.aTrack) > WRONG_DEG && r.v < 12;
    this.wrong = wrongNow ? this.wrong + 1 : 0;
    if (this.episode > 0) {
      this.episode++;
      if (r.raceDist > this.startDist + PROGRESS_M && this.mode === RecoveryMode.NONE) this.episode = 0;
    }

    switch (this.mode) {
      case RecoveryMode.NONE:
        if (this.slow >= SLOW_TICKS) { this.enter(RecoveryMode.REVERSE); this.begin(r, this.slow); }
        else if (this.wrong >= 12) { this.enter(RecoveryMode.TURN_AROUND); this.begin(r, this.wrong); }
        break;
      case RecoveryMode.REVERSE:
        if (this.t >= REVERSE_TICKS) this.enter(RecoveryMode.DRIVE_OUT);
        break;
      case RecoveryMode.DRIVE_OUT:
        if (this.t >= DRIVE_OUT_TICKS || (r.vFwd > 6 && Math.abs(r.aTarget) < 0.35)) this.finishIfFree(r);
        break;
      case RecoveryMode.TURN_AROUND:
        if (Math.abs(r.aTrack) < 0.6 && r.vFwd > 3) this.finishIfFree(r);
        else if (this.t >= TURN_LIMIT || r.wrongWayTicks >= 72) this.enter(RecoveryMode.RESET);
        else if (this.slow >= 40) this.enter(RecoveryMode.REVERSE);
        break;
      case RecoveryMode.RESET:
        break;
    }
    if (this.episode >= RESET_AT && this.mode !== RecoveryMode.RESET) this.enter(RecoveryMode.RESET);
    if (this.mode === RecoveryMode.NONE) return false;
    this.t++;

    const toTarget = r.aTarget > 0 ? 1 : -1;
    switch (this.mode) {
      case RecoveryMode.REVERSE:
        // reversing inverts the yaw response: steer away from the target to swing the nose toward it
        out.steer = -toTarget; out.thr = 0; out.brk = 1;
        return true;
      case RecoveryMode.DRIVE_OUT:
        out.steer = Math.abs(r.aTarget) > 0.08 ? toTarget : r.aTarget / 0.08; out.thr = 1; out.brk = 0;
        return true;
      case RecoveryMode.TURN_AROUND:
        out.steer = r.aTrack > 0 ? 1 : -1; out.thr = 1; out.brk = 0;
        return true;
      case RecoveryMode.RESET:
        // stand still until the sim accepts the manual reset (|v| < 3 m/s for 60 ticks), then press R
        out.steer = 0; out.thr = 0; out.brk = r.vFwd > 0.5 ? 1 : 0;
        if (r.lowSpeedTicks >= 60 || r.wrongWayTicks >= 72) { out.reset = true; this.resets++; this.reset(); }
        return true;
    }
    return false;
  }

  private enter(m: number): void { this.mode = m; this.t = 0; }
  private begin(r: Readonly<RecoveryIn>, already: number): void {
    if (this.episode === 0) { this.episode = already; this.startDist = r.raceDist; this.episodes++; }
  }
  private finishIfFree(r: Readonly<RecoveryIn>): void {
    this.mode = RecoveryMode.NONE; this.t = 0;
    if (r.v > SLOW_V) this.slow = 0;
  }
}
