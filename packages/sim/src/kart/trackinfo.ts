// Load-time facts about a baked track, cached per track object so hot paths skip empty feature loops.
import type { BakedTrack } from '../track/BakedTrack.ts';
import { detSinCos } from '../core/math.ts';

export interface TrackInfo {
  zones: boolean;
  rails: boolean;
  warps: boolean;
  /** cos(captureHeadingDeg) per rail (computed without Math.cos, ADR-003). */
  railCos: Float64Array;
}

const cache = new WeakMap<BakedTrack, TrackInfo>();
const SC = { s: 0, c: 0 };

export function trackInfo(t: BakedTrack): TrackInfo {
  let i = cache.get(t);
  if (!i) {
    const railCos = new Float64Array(t.rails.length);
    for (let r = 0; r < t.rails.length; r++) {
      detSinCos((t.rails[r]!.captureHeadingDeg * 3.141592653589793) / 180, SC);
      railCos[r] = SC.c;
    }
    i = { zones: t.zones.length > 0, rails: t.rails.length > 0, warps: t.warps.length > 0, railCos };
    cache.set(t, i);
  }
  return i;
}

export const hasZones = (t: BakedTrack): boolean => trackInfo(t).zones;
