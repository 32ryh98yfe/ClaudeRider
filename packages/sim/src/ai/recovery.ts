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
  /** Ticks since the last hard crowd-control effect ended (traps pin the speed to 0; not a stuck kart). */
  sinceCc: number;
  /** Ticks since the kart last touched a wall (a kart pinned nose-first on a wall is stuck at once). */
  sinceWall: number;
}

export interface RecoveryOut { steer: number; thr: number; brk: number; reset: boolean }

const POST_CC_REVERSE_TICKS = 30; // half-second retreat uses the limited immunity window without excessive backtracking
const SLOW_V = 2, SLOW_TICKS = 90, PIN_TICKS = 24, MAX_TRIES = 2, REVERSE_TICKS = 54, DRIVE_OUT_TICKS = 60, RESET_AT = 200, PROGRESS_M = 12, WRONG_DEG = 110 * Math.PI / 180, TURN_LIMIT = 150;

export class Recovery {
  mode: number = RecoveryMode.NONE;
  private t = 0;          // ticks in the current mode
  private slow = 0;       // consecutive slow ticks
  private episode = 0;    // ticks since the stuck episode began (0 = none)
  private wrong = 0;      // consecutive ticks pointed the wrong way at low speed
  private startDist = 0;  // race distance when the episode began
  private reverseTicks = REVERSE_TICKS;
  private tries = 0;      // reverse attempts in this episode
  /** Episodes started / resets pressed (for tests and the balance report). */
  episodes = 0; resets = 0;

  reset(): void { this.mode = RecoveryMode.NONE; this.t = 0; this.slow = 0; this.episode = 0; this.wrong = 0; this.tries = 0; this.reverseTicks = REVERSE_TICKS; }

  /** Returns true when recovery overrides the driving controls this tick (writes `out`). */
  update(r: Readonly<RecoveryIn>, out: RecoveryOut): boolean {
    out.reset = false;
    if (r.sinceGo < 90 || r.sinceRespawn < 40) { this.reset(); return false; }
    if (!r.canAct) {
      // Hard CC pauses an already committed escape; restarting the maneuver after each pendulum hit
      // used the entire immunity window waiting and left a low-speed kart permanently nose-first on it.
      if (r.sinceCc !== 0) this.reset();
      return false;
    }
    const pinnedAfterCc = r.v < SLOW_V && r.sinceWall < 10 && r.lowSpeedTicks >= PIN_TICKS;
    if (r.sinceCc < 30 && !pinnedAfterCc && this.mode === RecoveryMode.NONE) { this.reset(); return false; }
    const slowNow = r.v < SLOW_V;
    this.slow = slowNow ? Math.max(this.slow + 1, pinnedAfterCc ? PIN_TICKS : 0) : 0;
    // wrong way: the nose points > 110° away from the track (after a spin, a bad bounce or a mirrored drift)
    const wrongNow = Math.abs(r.aTrack) > WRONG_DEG;
    this.wrong = wrongNow ? this.wrong + 1 : 0;
    if (this.episode > 0) {
      this.episode++;
      // A drive-out may release the wheel just before alignment settles. Re-evaluate
      // recovery once it has made measurable forward progress; otherwise a live kart
      // already metres beyond a temporary blocker inherits the old reset deadline.
      const movingFree = r.raceDist > this.startDist + 2 && r.vFwd > 6 && Math.abs(r.aTrack) < 0.6;
      if (this.mode === RecoveryMode.NONE && (r.raceDist > this.startDist + PROGRESS_M || movingFree)) this.episode = 0;
    }

    switch (this.mode) {
      case RecoveryMode.NONE:
        // slow for 1.5 s, or 0.4 s while touching a wall (pinned nose-first: waiting only loses time); a second
        // attempt in the same episode goes straight to the manual reset
        if (this.slow >= SLOW_TICKS || (this.slow >= PIN_TICKS && r.sinceWall < 10)) {
          this.begin(r, this.slow);
          const next = ++this.tries >= MAX_TRIES ? RecoveryMode.RESET : RecoveryMode.REVERSE;
          this.enter(next);
          if (next === RecoveryMode.REVERSE && pinnedAfterCc && r.sinceCc < 30) this.reverseTicks = POST_CC_REVERSE_TICKS;
        }
        else if (this.wrong >= 12) { this.enter(RecoveryMode.TURN_AROUND); this.begin(r, this.wrong); }
        else if (r.wrongWayTicks >= 72) { this.enter(RecoveryMode.RESET); this.begin(r, r.wrongWayTicks); }
        break;
      case RecoveryMode.REVERSE:
        if (this.t >= this.reverseTicks) this.enter(RecoveryMode.DRIVE_OUT);
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
        // shed speed first (a fast wrong-way kart cannot turn on the spot), then full lock toward the track
        out.steer = r.aTrack > 0 ? 1 : -1;
        if (r.vFwd > 12) { out.thr = 0; out.brk = 1; } else { out.thr = 1; out.brk = 0; }
        return true;
      case RecoveryMode.RESET:
        // stand still until the sim accepts the manual reset (|v| < 3 m/s for 60 ticks), then press R
        out.steer = 0; out.thr = 0; out.brk = r.vFwd > 0.5 ? 1 : 0;
        if (r.lowSpeedTicks >= 60 || r.wrongWayTicks >= 72) { out.reset = true; this.resets++; this.reset(); }
        return true;
    }
    return false;
  }

  private enter(m: number): void { this.mode = m; this.t = 0; if (m === RecoveryMode.REVERSE) this.reverseTicks = REVERSE_TICKS; }
  private begin(r: Readonly<RecoveryIn>, already: number): void {
    if (this.episode === 0) { this.episode = already; this.startDist = r.raceDist; this.episodes++; this.tries = 0; }
  }
  private finishIfFree(r: Readonly<RecoveryIn>): void {
    this.mode = RecoveryMode.NONE; this.t = 0;
    if (r.v > SLOW_V) this.slow = 0;
    // pointed down the road and moving: recovered, even if turning round ate the progress the episode waits for
    if (r.vFwd > 6 && Math.abs(r.aTrack) < 0.6) this.episode = 0;
  }
}
