// Reference lap: a lone Legend bot drives the baked track; its best clean lap becomes meta.refLapTicks
// (used by the lap-count formula, Time Attack medals and AI pace checks).
import { loadContent } from '@cr/content';
import { createWorld, makeContext, step, createAiDriver, AI_TIERS, makeInput, NULL_SINK, Phase, type BakedTrack, type RaceConfig } from '@cr/sim';

export interface GhostResult { lapTicks: number; laps: number[]; note: string }

export function ghostLap(track: BakedTrack, laps = 3): GhostResult {
  const content = loadContent();
  const cfg: RaceConfig = {
    simVersion: 1, mode: 'speed', teams: 'solo', trackId: track.id, trackHash: track.hash, laps,
    slots: [{ kind: 'bot', team: 0, name: 'ghost', characterId: 'clay', kartBodyId: 'pebble', ai: 'legend', vMul: AI_TIERS.legend.vMul }],
    seed: 7, rules: { retireTicks: 600, friendlyFire: 'area', itemSet: 'standard', rubberBand: false, instantBoostInItem: true }, introTicks: 0, countdownTicks: 180,
  };
  const w = createWorld(cfg, track, content);
  const ctx = makeContext({ track, cfg, content, role: 'authority', events: NULL_SINK });
  const driver = createAiDriver(track, content, 0, AI_TIERS.legend, {}, 11);
  const inputs = [makeInput()];
  const k = w.karts[0]!;
  const lapTicks: number[] = [];
  let lastLap = k.race.lap, respawns = 0;
  const maxTicks = 60 * 60 * 6;
  while (w.phase !== Phase.DONE && w.tick < maxTicks) {
    driver.decide(w, inputs[0]!);
    step(w, inputs, ctx);
    if (k.race.lap !== lastLap) {
      // a lap with a respawn in it is not a reference lap
      if (k.race.lastLapTicks > 0 && k.stats.respawns === respawns) lapTicks.push(k.race.lastLapTicks);
      respawns = k.stats.respawns;
      lastLap = k.race.lap;
    }
    if (k.race.finishTick >= 0) break;
  }
  // the first lap includes the standing start; prefer flying laps when we have them
  const flying = lapTicks.length > 1 ? lapTicks.slice(1) : lapTicks;
  const best = flying.length ? Math.min(...flying) : 0;
  const note = best > 0 ? `${lapTicks.length} laps, respawns ${k.stats.respawns}` : 'ghost did not complete a lap';
  return { lapTicks: best, laps: lapTicks, note };
}
