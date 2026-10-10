import { expect, it } from 'vitest';
import type { BakedTrack } from '@cr/sim';
import { jumpKit } from './fixtures/kits.ts';
import { place, racingRig } from './util.ts';

it('a declared jump cannot renew its no-ground grace forever', () => {
  const fixture = jumpKit(), track = Object.create(fixture.track) as BakedTrack;
  // A zero-gravity unsupported kart isolates the grace timer from an earlier kill-plane recovery.
  track.gravityAt = (_loc, out) => { out.x = 0; out.y = 0; out.z = 0; out.scale = 0; };
  const r = racingRig(track), k = place(r, 0, { s: fixture.lipS + 3, h: 20 });
  k.body.coyote = 0;
  r.run(350);
  expect(k.stats.respawns).toBe(0);
  r.run(60);
  expect(k.stats.respawns).toBe(1);
});
