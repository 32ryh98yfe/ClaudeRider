// L6 §8: a point-to-point track ends in a soft barrier, so a finished kart stops there instead of driving off the end
// of the road and respawning.
import { describe, expect, it } from 'vitest';
import { bakeSrc, contacts, frame, reload } from './helpers.ts';
import { place, simRig } from './simrig.ts';

const P2P = `TRACK sprint name="Sprint" theme=spark_circuit diff=2 laps=1 topo=p2p finishBefore=40
DEFAULTS w=14 surf=asphalt wall=barrier:1.0 blend=16
START pos=(0,0,0) hdg=0
S 200 @a
C R60 90 L
S 400
C R60 90 R
S 300
LINE start at=30
`;

describe('p2p end caps', () => {
  const r = bakeSrc(P2P);
  const t = reload(r);
  const L = r.model.paths[0]!.length;

  it('both ends of the main line carry a wall across the road', () => {
    const f = frame(), cs = contacts();
    for (const s of [0.5, L - 0.5]) {
      t.frameAt(0, s, f);
      for (const d of [-5, 0, 5]) expect(t.sphereWalls(f.px + f.rx * d, f.py + 0.8, f.pz + f.rz * d, 0.9, cs, 8), `s=${s} d=${d}`).toBeGreaterThan(0);
    }
  });

  it('a kart running past the finish stops at the cap without a respawn (sim)', () => {
    const rig = simRig(t, 1);
    place(rig, 0, L - 60, 0, 30);
    const k = rig.w.karts[0]!;
    rig.tick(60 * 5, (_w, inp) => { inp.throttle = 15; inp.steer = 0; });
    expect(k.stats.respawns).toBe(0);
    expect(k.race.loc.s).toBeLessThanOrEqual(L);
    expect(k.race.loc.s).toBeGreaterThan(L - 10);
  });
});
