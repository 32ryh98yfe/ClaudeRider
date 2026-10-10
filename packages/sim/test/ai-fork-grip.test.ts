import { describe, expect, it } from 'vitest';
import { AI_TIERS, Edge, createAiDriver, makeInput, paramsFor } from '@cr/sim';
import { InputDelayLine } from '../src/ai/lookahead.ts';
import { planFor, gripTable } from '../src/ai/plan.ts';
import { IT } from '../src/items/codes.ts';
import { runRace, type BotSetup } from '../src/ai/balance.ts';
import { bakedTrack, getContent } from './rig.ts';
import { place, racingRig } from './util.ts';

function boostedFork(take: boolean) {
  const track = bakedTrack('_test/f1_branch'), content = getContent(), plan = planFor(track), fork = plan.forks[0]!;
  const rig = racingRig(track, { mode: 'item', slots: [{ kartBodyId: 'tugboat' }] });
  rig.run(180);
  const kart = place(rig, 0, { s: fork.at - 80, u: fork.side * 3.5, speed: 34 });
  kart.items.slot0 = IT.turbo_token;
  const driver = createAiDriver(track, content, 0, AI_TIERS.legend, {
    noJitter: true, lookaheadTicks: 8, lineNoise: 0, mistakeRate: 0, shortcutRisk: take ? 1 : 0,
  }, 41);
  const output = makeInput(), delay = new InputDelayLine(8);
  let tick = 0, hostBrakeTicks = 0, entrySpeed = 0, entryBoost = 0, passedEntry = false, passedHost = false;
  rig.run(600, (_world, inputs) => {
    driver.decide(rig.w, output);
    if (tick++ === 0) output.edges |= Edge.USE_ITEM;
    delay.push(output, inputs[0]!);
    const loc = kart.race.loc;
    if (loc.path === fork.path && loc.s > fork.at - 40 && loc.s < fork.at && inputs[0]!.brake > 0) hostBrakeTicks++;
    // The shared merge can locate a host kart on the far end of the branch; inspect only its entry arc.
    if (loc.path === fork.to && loc.s < plan.paths[fork.to]!.corners[0]!.s1 + 30) {
      if (entrySpeed === 0) { entrySpeed = Math.hypot(kart.body.vx, kart.body.vy, kart.body.vz); entryBoost = kart.drive.boostTicks; }
      if (loc.s > plan.paths[fork.to]!.corners[0]!.s1 + 25) passedEntry = true;
    }
    if (loc.path === fork.path && loc.s > fork.at + 20) passedHost = true;
  });
  const grip = gripTable(plan, paramsFor(content.karts.get('tugboat')))[fork.to]![0]!;
  return { stats: kart.stats, hostBrakeTicks, entrySpeed, entryBoost, passedEntry, passedHost, grip };
}

describe('grip budget at a selected fork', () => {
  it('brakes an active Turbo Token before the split and cleanly grips the entry corner', () => {
    const r = boostedFork(true);
    expect(r.stats.itemsUsed).toBe(1);
    expect(r.entryBoost).toBeGreaterThan(0);
    expect(r.hostBrakeTicks).toBeGreaterThan(0);
    // The real entry speed must fit the available grip steering, including the controller's small hysteresis.
    expect(r.entrySpeed).toBeGreaterThan(0);
    expect(r.entrySpeed).toBeLessThanOrEqual(r.grip + 1);
    expect(r.passedEntry).toBe(true);
    expect(r.stats.wallHits).toBe(0);
    expect(r.stats.respawns).toBe(0);
  });

  it('does not apply a branch speed budget when the bot stays on the host', () => {
    const r = boostedFork(false);
    expect(r.stats.itemsUsed).toBe(1);
    expect(r.entrySpeed).toBe(0);
    expect(r.hostBrakeTicks).toBe(0);
    expect(r.passedHost).toBe(true);
  });

  it('does not abandon a committed narrow fork two metres before its solid gore cushion', () => {
    const chars = ['clay', 'pixel', 'turbo', 'anchor', 'rune', 'nova', 'kage', 'bisque'] as const;
    const karts = ['pebble', 'clay_comet', 'arrowhead', 'tugboat', 'glacier_sled', 'neon_blade', 'jet_kettle', 'crown_cruiser'] as const;
    const bots: BotSetup[] = chars.map((character, i) => ({ tier: 'pro', character, kart: karts[i]! }));
    const r = runRace({ track: bakedTrack('ember_mine/magma_switchback'), content: getContent(), bots, seed: 7301, laps: 1, mode: 'item', itemCombat: true, lookahead: 8 });
    expect(r.karts.every((k) => k.finished)).toBe(true);
    const k = r.karts[6]!;
    expect(k.ai.forksTaken).toBeGreaterThan(0); expect(k.ai.recoveries).toBe(0);
    expect(k.hardHits).toBe(0); expect(k.respawns).toBe(0);
  });
});
