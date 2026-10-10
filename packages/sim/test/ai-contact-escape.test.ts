import { describe, expect, it } from 'vitest';
import { Recovery, RecoveryMode, type RecoveryIn, type RecoveryOut } from '../src/ai/recovery.ts';

const input = (): RecoveryIn => ({ sinceGo: 300, v: 0.1, vFwd: 0.1, aTarget: 0.5, aTrack: 0.1,
  lowSpeedTicks: 60, wrongWayTicks: 0, canAct: true, sinceRespawn: 300, raceDist: 300, sinceCc: 1, sinceWall: 0 });
const output = (): RecoveryOut => ({ steer: 0, thr: 0, brk: 0, reset: false });

describe('AI escape from persistent solid contact after CC', () => {
  it('uses the post-CC immunity window immediately when already pinned', () => {
    const recovery = new Recovery(), out = output();
    expect(recovery.update(input(), out)).toBe(true);
    expect(recovery.mode).toBe(RecoveryMode.REVERSE);
    expect(out.thr).toBe(0); expect(out.brk).toBe(1); expect(out.steer).toBe(-1);
    expect(out.reset).toBe(false);
  });

  it('pauses and resumes an escape across another CC rather than restarting its wait', () => {
    const recovery = new Recovery(), out = output(), r = input();
    recovery.update(r, out);
    for (let t = 0; t < 60; t++) expect(recovery.update({ ...r, canAct: false, sinceCc: 0 }, out)).toBe(false);
    expect(recovery.mode).toBe(RecoveryMode.REVERSE);
    expect(recovery.update(r, out)).toBe(true); expect(recovery.mode).toBe(RecoveryMode.REVERSE);
    for (let t = 0; t < 54; t++) recovery.update(r, out);
    expect(recovery.mode).toBe(RecoveryMode.DRIVE_OUT); expect(out.thr).toBe(1); expect(out.brk).toBe(0);
  });

  it('keeps normal post-hit grace on clear road and never sends an escape while CC locks controls', () => {
    const recovery = new Recovery(), out = output();
    expect(recovery.update({ ...input(), sinceWall: 1000 }, out)).toBe(false);
    expect(recovery.mode).toBe(RecoveryMode.NONE);
    expect(recovery.update({ ...input(), canAct: false, sinceCc: 0 }, out)).toBe(false);
    expect(recovery.mode).toBe(RecoveryMode.NONE);
  });

  it('clears a delayed alignment after real forward progress, but not from rebound speed alone', () => {
    for (const progress of [0, 3]) {
      const recovery = new Recovery(), out = output(), r = { ...input(), sinceCc: 100 };
      recovery.update(r, out);
      for (let t = 0; t < 54; t++) recovery.update(r, out);
      // The wheel is released just before the nose meets the alignment threshold.
      Object.assign(r, { v: 7, vFwd: 7, aTarget: 0.1, aTrack: 0.62 });
      recovery.update(r, out); expect(recovery.mode).toBe(RecoveryMode.NONE);
      Object.assign(r, { aTrack: 0.3, raceDist: 300 + progress });
      let reset = false;
      for (let t = 0; t < 210; t++) { recovery.update(r, out); reset ||= recovery.mode === RecoveryMode.RESET || out.reset; }
      expect(reset, `real progress ${progress} m`).toBe(progress === 0);
    }
  });
});
