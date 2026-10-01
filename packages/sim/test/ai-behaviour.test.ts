// AI behaviour (14-ai §5, §9, §10): a full field races without pile-ups or ramming, stuck and wrong-way karts
// recover, the takeover controller drives a silent human slot and hands it back, branch choice follows the tier's
// risk (aiMinSkill), bot identities are unique and localised, and bot races are reproducible.
import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS, type CharacterId } from '@cr/content';
import { AI_TIERS, createAiDriver, Edge, makeInput, type SlotConfig } from '@cr/sim';
import { EF, EFlag } from '../src/items/codes.ts';
import { activeEffect, scheduleEffect } from '../src/items/effects.ts';
import { createItemBrain, decideItem } from '../src/ai/items/index.ts';
import { scenario } from './items-rig.ts';
import { runRace } from '../src/ai/balance.ts';
import { InputDelayLine } from '../src/ai/lookahead.ts';
import { TakeoverController, TAKEOVER_AFTER_TICKS } from '../src/ai/takeover.ts';
import { fillBotSlots, formatBotName, localizeBotName, parseBotName, botNameParts } from '../src/ai/identity.ts';
import { bakedTrack, getContent } from './rig.ts';
import { racingRig, place } from './util.ts';

const MEADOW = 'clayhill_village/meadow_loop';
const FIELD: readonly CharacterId[] = ['clay', 'pixel', 'turbo', 'anchor', 'rune', 'nova', 'kage', 'bisque'];

describe('AI field racing', () => {
  it('8 Pro bots on meadow_loop: all finish, no start pile-up, no ramming, nobody stuck', () => {
    const r = runRace({ track: bakedTrack(MEADOW), content: getContent(), seed: 1, lookahead: 8, laps: 1, bots: FIELD.map((c) => ({ tier: 'pro' as const, character: c })) });
    const stuck = Math.max(...r.karts.map((k) => k.maxStuckTicks));
    console.log(`field: bumps ${r.bumps} (hard ${r.hardBumps}, start ${r.startHardBumps}), max stuck ${stuck} ticks, overtaking lanes ${r.karts.reduce((a, k) => a + k.ai.overtakeLanes, 0)}, draft follows ${r.karts.reduce((a, k) => a + k.ai.draftFollows, 0)}`);
    expect(r.karts.every((k) => k.finished)).toBe(true);
    expect(r.karts.reduce((a, k) => a + k.respawns, 0)).toBe(0);
    expect(stuck).toBeLessThanOrEqual(300);
    // a hard bump closes at ≥ 2 m/s; the start is a clean launch, and racing contact stays rare
    expect(r.startHardBumps).toBeLessThanOrEqual(6);
    expect(r.hardBumps / r.karts.length).toBeLessThanOrEqual(3);
    // bots do use lanes to pass and follow in the draft
    expect(r.karts.reduce((a, k) => a + k.ai.overtakeLanes, 0)).toBeGreaterThan(0);
  });

  it('bot races are reproducible (same seed, same lookahead)', () => {
    const run = (): string => {
      const r = runRace({ track: bakedTrack(MEADOW), content: getContent(), seed: 7, lookahead: 8, laps: 1, bots: FIELD.slice(0, 4).map((c, i) => ({ tier: (['rookie', 'racer', 'pro', 'legend'] as const)[i]!, character: c })) });
      return r.karts.map((k) => `${k.raceTicks}/${k.drifts}/${k.instantBoosts}/${k.bumps}`).join(' ');
    };
    expect(run()).toBe(run());
  });
});

describe('AI recovery', () => {
  const recover = (label: string, p: Parameters<typeof place>[2], wallGap?: number): void => {
    const track = bakedTrack(MEADOW), content = getContent();
    const rig = racingRig(track, { laps: 3 });
    const fw = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
    track.frameAt(0, p.s, fw);
    // wallGap: centre that far inside the right wall, nose into it
    const k = place(rig, 0, wallGap === undefined ? p : { ...p, u: fw.wR - wallGap });
    const d = createAiDriver(track, content, 0, AI_TIERS.pro, { lookaheadTicks: 8 }, 11);
    const line = new InputDelayLine(8), dec = makeInput();
    // progress integrated along the main line (placing a kart mid-lap leaves raceDist's lap bookkeeping behind)
    const L = track.lapLength;
    let prev = k.race.loc.sMain, progress = 0;
    rig.run(8 * 60, (w, inp) => {
      d.decide(w, dec); line.push(dec, inp[0]!);
      let ds = k.race.loc.sMain - prev; prev = k.race.loc.sMain;
      if (ds < -L / 2) ds += L; else if (ds > L / 2) ds -= L;
      progress += ds;
    });
    const f = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
    track.frameAt(k.race.loc.path, k.race.loc.s, f);
    const align = k.body.fx * f.tx + k.body.fy * f.ty + k.body.fz * f.tz;
    console.log(`${label}: progress ${progress.toFixed(0)} m in 8 s, heading·tangent ${align.toFixed(2)}, recoveries ${d.stats.recoveries}, resets ${d.stats.resets}`);
    expect(progress, `${label} progress`).toBeGreaterThan(40);
    expect(k.stats.respawns, `${label} respawns`).toBe(0);
    expect(align, `${label} heading`).toBeGreaterThan(0.7);
  };
  it('a kart facing the wrong way turns around and races on', () => recover('wrong way', { s: 300, yawDeg: 180 }));
  it('a kart stopped nose-first at the right edge gets going again', () => recover('nose to the edge', { s: 300, yawDeg: -85 }, 1.1));
});

describe('takeover', () => {
  it('drives a silent human slot after 3 s and hands it back on the next input', () => {
    const track = bakedTrack(MEADOW), content = getContent();
    const rig = racingRig(track, { laps: 3 });
    const slots: SlotConfig[] = rig.cfg.slots;
    const tc = new TakeoverController(track, content, slots, 5, 8);
    const human = makeInput(), line = new InputDelayLine(8), dec = makeInput();
    let t = 0;
    const step = (sendHuman: boolean): void => rig.tick((w, inp) => {
      if (sendHuman) { tc.noteInput(0, w.tick); human.throttle = 15; human.steer = 0; Object.assign(inp[0]!, human); return; }
      if (tc.drive(w, 0, dec)) line.push(dec, inp[0]!); else Object.assign(inp[0]!, human);
    });
    for (; t < 60; t++) step(true);
    for (let i = 0; i < TAKEOVER_AFTER_TICKS - 5; i++) step(false);
    expect(tc.isDriving(0)).toBe(false);
    const d0 = rig.w.karts[0]!.race.raceDist;
    for (let i = 0; i < 10 * 60; i++) step(false);
    expect(tc.isDriving(0)).toBe(true);
    expect(tc.takeovers[0]).toBe(1);
    // the Racer takeover keeps the kart racing (≈ 10 s of track, no respawn)
    expect(rig.w.karts[0]!.race.raceDist - d0).toBeGreaterThan(150);
    expect(rig.w.karts[0]!.stats.respawns).toBe(0);
    step(true);
    expect(tc.isDriving(0)).toBe(false);
  });
});

describe('branch choice by skill (F1 fixture, shortcut aiMin 0.3)', () => {
  it('Pro and Legend take the shortcut, Rookie keeps to the main road', () => {
    const track = bakedTrack('_test/f1_branch'), content = getContent();
    const taken = (tier: 'rookie' | 'pro' | 'legend'): number => {
      const r = runRace({ track, content, seed: 3, lookahead: 8, bots: [{ tier }] });
      expect(r.karts[0]!.finished, `${tier} finished`).toBe(true);
      return r.karts[0]!.ai.forksTaken;
    };
    const rookie = taken('rookie'), pro = taken('pro'), legend = taken('legend');
    console.log(`shortcut laps: rookie ${rookie}, pro ${pro}, legend ${legend}`);
    expect(rookie).toBe(0);
    expect(pro).toBeGreaterThanOrEqual(2);
    expect(legend).toBeGreaterThanOrEqual(2);
  });
});

describe('Mirror Mode and the tap keys (15-driving-techniques §3)', () => {
  it('the item brain flips the steer and swaps the driver\'s TAP_L / TAP_R edges together', () => {
    const sc = scenario({ count: 2 });
    sc.until(() => sc.w.tick >= sc.w.goTick + 120);
    scheduleEffect(sc.w, sc.ctx, EF.mirror, 0, 1, sc.w.tick + 1, 0, 0, EFlag.BLOCKABLE, 77);
    sc.until(() => activeEffect(sc.w, 0, EF.mirror, sc.w.tick) !== undefined, 200);
    expect(activeEffect(sc.w, 0, EF.mirror, sc.w.tick)).toBeDefined();
    // itemSkill 3 (Pro) counter-steers from the first mirrored tick
    const brain = createItemBrain(0, AI_TIERS.pro, {}, 5);
    const env = { track: sc.track, content: sc.ctx.content, cfg: sc.cfg };
    const out = makeInput();
    out.steer = 60; out.edges = Edge.TAP_L;
    decideItem(brain, sc.w, env, out);
    expect(out.steer).toBe(-60);
    expect(out.edges & (Edge.TAP_L | Edge.TAP_R)).toBe(Edge.TAP_R);
    out.steer = -40; out.edges = Edge.TAP_R;
    decideItem(brain, sc.w, env, out);
    expect(out.steer).toBe(40);
    expect(out.edges & (Edge.TAP_L | Edge.TAP_R)).toBe(Edge.TAP_L);
  });
});

describe('bot identities', () => {
  const content = getContent();
  const slots = (n: number): SlotConfig[] => Array.from({ length: n }, (_, i) => ({
    kind: i === 0 ? 'human' : 'bot', team: 0, name: i === 0 ? '달리는사람' : '', characterId: i === 0 ? 'clay' : 'clay', kartBodyId: 'pebble', vMul: 1,
  } as SlotConfig));

  it('fills bot slots with unique names and characters, humans untouched, deterministic in the room seed', () => {
    const a = fillBotSlots(content, slots(8), { roomSeed: 42, tier: 'racer' });
    const b = fillBotSlots(content, slots(8), { roomSeed: 42, tier: 'racer' });
    expect(a).toEqual(b);
    expect(a[0]!.name).toBe('달리는사람');
    const bots = a.slice(1);
    expect(new Set(bots.map((s) => s.name)).size).toBe(7);
    expect(new Set(bots.map((s) => s.characterId)).size).toBe(7);
    // the human's character goes to a bot only when the roster runs out
    expect(bots.some((s) => s.characterId === 'clay')).toBe(false);
    for (const s of bots) {
      expect(CHARACTER_IDS).toContain(s.characterId);
      expect(s.ai).toBe('racer');
      expect(s.vMul).toBe(AI_TIERS.racer.vMul);
      expect(parseBotName(s.name)).not.toBeNull();
    }
    expect(fillBotSlots(content, slots(8), { roomSeed: 43, tier: 'racer' }).map((s) => s.name)).not.toEqual(a.map((s) => s.name));
  });

  it('names travel in English and render Korean first', () => {
    const n = botNameParts(7, 3);
    const en = formatBotName(n), ko = formatBotName(n, 'ko');
    expect(en).toMatch(/^[A-Za-z]+-\d{2} [A-Za-z]+$/);
    expect(ko).not.toBe(en);
    expect(localizeBotName(en, 'ko')).toBe(ko);
    expect(localizeBotName(en, 'en')).toBe(en);
    expect(parseBotName(en)).toEqual(n);
    // human names pass through untouched
    expect(localizeBotName('Spark-7 Coral', 'ko')).toBe('Spark-7 Coral');
    expect(localizeBotName('달리는사람', 'en')).toBe('달리는사람');
  });
});
