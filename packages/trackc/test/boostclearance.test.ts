import { describe, expect, it } from 'vitest';
import { buildFixture, flatProfile, newMesh, sweep, turtle } from '../../sim/test/fixtures/builder.ts';
import { probeBoostClearance } from '../src/boostclearance.ts';
import type { Sample } from '../src/geometry.ts';

function risingRoad(barrier: boolean) {
  const frames = turtle([{ len: 400 }], {
    y: (s) => Math.max(0, Math.min(8, (s - 120) * 0.1)),
    slope: (s) => s >= 120 && s <= 200 ? 0.1 : 0,
  });
  const ground = newMesh(), walls = newMesh();
  sweep(ground, frames, () => flatProfile(-12, 12, 6), { every: 1 });
  // Solid road underside. A fixed tangent ray at its old height hits this as the road rises;
  // the real kart stays on top, with its body clear of the underside.
  sweep(walls, frames.map((f) => ({ ...f, y: f.y - 0.6 })), () => flatProfile(-12, 12, 6), { every: 1 });
  if (barrier) {
    const base = walls.pos.length / 3;
    walls.pos.push(145, 0, -12, 145, 8, -12, 145, 0, 12, 145, 8, 12);
    for (let i = 0; i < 4; i++) walls.nrm.push(-1, 0, 0);
    walls.idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    walls.surf.push(0, 0); walls.flg.push(0, 0);
  }
  const fixture = buildFixture({ id: 'boost_clearance_rise', paths: [{ kind: 'main', closed: false, frames, wL: 12, wR: 12 }], ground, walls, lineAt: 0 });
  return { track: fixture.track, start: frames[100]! as Sample };
}

describe('V10 physical boost exit clearance', () => {
  it('follows a rising road instead of probing through its solid underside', () => {
    const { track, start } = risingRoad(false), hazards = track.hazards;
    const result = probeBoostClearance(track, start, 0);
    expect(result.blocked).toBe(false); expect(result.tick).toBe(120);
    expect(result.distance).toBeGreaterThan(55); expect(track.hazards).toBe(hazards);
  });

  it('still rejects a real wall after following the rising road', () => {
    const { track, start } = risingRoad(true);
    const result = probeBoostClearance(track, start, 0);
    expect(result.blocked).toBe(true); expect(result.reason).toBe('wall');
    expect(result.tick).toBeLessThan(120); expect(result.distance).toBeGreaterThan(35);
  });
});
