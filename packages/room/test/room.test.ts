// RaceRoom (offline authority): a full race ends with a consistent result table.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent } from '@cr/content';
import { AI_TIERS, loadCtrk, toArrayBuffer, makeInput, Phase, type RaceConfig, type SlotConfig } from '@cr/sim';
import { buildTrack } from '@cr/trackc/build.ts';
import { RaceRoom, type RaceResult } from '../src/RaceRoom.ts';

const file = new URL('../../../tracks/spark_circuit/proving_ring.ctd', import.meta.url).pathname;
const track = loadCtrk(toArrayBuffer(buildTrack(readFileSync(file, 'utf8'), file).ctrk));
const content = loadContent();

function config(teams: 'solo' | 'squad'): RaceConfig {
  const chars = ['clay', 'pixel', 'turbo', 'anchor', 'rune', 'nova', 'kage', 'bisque'] as const;
  return {
    simVersion: 1, mode: 'speed', teams, trackId: track.id, trackHash: track.hash, laps: 1, seed: 9,
    slots: chars.map((c, i): SlotConfig => {
      const base: SlotConfig = { kind: i === 0 ? 'human' : 'bot', team: teams === 'solo' ? 0 : i % 2, name: c, characterId: c, kartBodyId: 'pebble', vMul: 1 };
      return i === 0 ? base : { ...base, ai: 'pro', vMul: AI_TIERS.pro.vMul };
    }),
    rules: { retireTicks: 600, friendlyFire: 'area', itemSet: 'standard', rubberBand: false, instantBoostInItem: true }, introTicks: 30, countdownTicks: 180,
  };
}

function runRoom(teams: 'solo' | 'squad'): RaceResult {
  const room = new RaceRoom({ config: config(teams), track, content });
  let result: RaceResult | null = null;
  room.onEnd((r) => { result = r; });
  const idle = makeInput();
  for (let t = 0; t < 60 * 90 && !result; t++) { room.setInput(0, idle); room.tick(); }
  expect(room.world.phase).toBe(Phase.DONE);
  return result!;
}

describe('RaceRoom', () => {
  it('solo: the idle human retires, 7 bots finish, ranks are 1..8', () => {
    const r = runRoom('solo');
    expect(r.rows.map((x) => x.rank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(r.rows.filter((x) => x.finished).length).toBe(7);
    const human = r.rows.find((x) => x.slot === 0)!;
    expect(human.finished).toBe(false);
    expect(human.rank).toBe(8);
    const finishedTimes = r.rows.filter((x) => x.finished).sort((a, b) => a.rank - b.rank).map((x) => x.raceTicks);
    expect([...finishedTimes].sort((a, b) => a - b)).toEqual(finishedTimes);
  });

  it('squad: team points follow 10/8/6/5/4/3/2/1 with retire = 0', () => {
    const r = runRoom('squad');
    const pts = [10, 8, 6, 5, 4, 3, 2, 1];
    for (const row of r.rows) expect(row.points).toBe(row.finished ? pts[row.rank - 1] : 0);
    const sum = (team: number): number => r.rows.filter((x) => x.team === team).reduce((a, x) => a + x.points, 0);
    if (sum(0) !== sum(1)) expect(r.winnerTeam).toBe(sum(0) > sum(1) ? 0 : 1);
    else expect([0, 1]).toContain(r.winnerTeam); // tie → team with the best single placement
  });
});
