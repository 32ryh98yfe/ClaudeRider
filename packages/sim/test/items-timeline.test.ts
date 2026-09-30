// Per-item tick-exact timelines (12-items-spec §2, §7): use, spawn, commit, start S, end, onEnd — on scripted karts
// driving the drag oval's 1 km straight (slots alternate lanes u = −4 / +4, 3.5 m apart along the track).
import { describe, expect, it } from 'vitest';
import { Edge, Phase, type Decision, type SimEvent } from '@cr/sim';
import { EF, IT } from '../src/items/codes.ts';
import { objectId } from '../src/items/ids.ts';
import { planarSpeed } from '../src/items/effects.ts';
import { scenario, type Scenario } from './items-rig.ts';

type D<K extends Decision['k']> = Extract<Decision, { k: K }>;
const dec = <K extends Decision['k']>(sc: Scenario, k: K): D<K>[] => sc.decisions.filter((d): d is D<K> => d.k === k);
// intersect (not Extract): some union members carry several tags, e.g. t: 'itemUse' | 'itemFizzle'
const evs = <T extends SimEvent['t']>(sc: Scenario, t: T): (SimEvent & { t: T })[] => sc.events.filter((e): e is SimEvent & { t: T } => e.t === t);
const hits = (sc: Scenario, victim: number, effect: number) => evs(sc, 'effect').filter((e) => e.victim === victim && e.effect === effect && e.result === 'hit');

/** Uses slot0 of `slot` on the next tick; returns the use tick T. */
function use(sc: Scenario, slot: number): number { sc.press(slot, Edge.USE_ITEM); sc.advance(1); return sc.w.tick; }

/** Two karts in the same lane (slots 0 and 2), the follower starting `lag` ticks later; runs until both cruise. */
function pair(lag = 40, extra: Partial<Parameters<typeof scenario>[0]> = {}): Scenario {
  const sc = scenario({ count: 3, starts: [0, 0, lag], ...extra });
  sc.startAt[1] = 1e9; // slot 1 parks on the grid (other lane), out of the way
  sc.until(() => sc.w.tick >= sc.w.goTick + 240);
  return sc;
}

describe('homing projectiles', () => {
  it('Prompt Missile: lock, spawn at T, commit when ETA ≤ 21, airborne at S = Tc + 21 for 66, escape boost, 36 immunity', () => {
    const sc = pair();
    sc.give(2, 'prompt_missile');
    sc.aim[2] = 0;
    sc.until(() => sc.w.karts[2]!.items.aimLockTicks >= 24, 60);
    const T = use(sc, 2);
    const u = dec(sc, 'use').at(-1)!;
    expect(u).toMatchObject({ tick: T, slot: 2, item: IT.prompt_missile, obj: objectId(IT.prompt_missile, 2, T, 0), target: 0 });
    expect(sc.w.projectiles).toHaveLength(1);
    expect(sc.w.projectiles[0]!.spawn).toBe(T);
    sc.until(() => dec(sc, 'commit').length > 0, 600);
    const c = dec(sc, 'commit')[0]!;
    expect(c.impact - c.tick).toBe(21);
    const p = sc.w.projectiles[0]!;
    expect(p.commit).toBe(c.tick);
    sc.until(() => sc.w.tick >= c.impact);
    expect(hits(sc, 0, EF.airborne).map((e) => e.tick)).toEqual([c.impact]);
    const st = sc.w.karts[0]!.status;
    expect([st.cc, st.ccStart, st.ccEnd]).toEqual([EF.airborne, c.impact, c.impact + 66]);
    expect(sc.w.projectiles).toHaveLength(0);
    // horizontal speed eased toward ×0.25 of the impact speed
    const u0 = planarSpeed(sc.w.karts[0]!);
    sc.until(() => sc.w.tick >= c.impact + 33);
    expect(planarSpeed(sc.w.karts[0]!) / u0).toBeCloseTo(0.625, 1);
    sc.until(() => sc.w.tick >= c.impact + 66);
    expect(sc.w.karts[0]!.status.cc).toBe(0);
    expect(sc.w.karts[0]!.status.immuneUntil).toBe(c.impact + 66 + 36);
    expect(hits(sc, 0, EF.escape_boost).map((e) => e.tick)).toEqual([c.impact + 66]);
    expect(sc.w.karts[0]!.drive.instTicks).toBe(60);
    expect(sc.w.karts[2]!.stats.attacksLanded).toBe(1);
  });

  it('an aimed item used without a lock is consumed and fizzles (조준 실패)', () => {
    const sc = pair();
    sc.give(2, 'prompt_missile', 'turbo_token');
    const T = use(sc, 2);
    expect(evs(sc, 'itemFizzle').map((e) => [e.tick, e.item])).toEqual([[T, IT.prompt_missile]]);
    expect(sc.w.projectiles).toHaveLength(0);
    expect([sc.w.karts[2]!.items.slot0, sc.w.karts[2]!.items.slot1]).toEqual([IT.turbo_token, 0]); // slot 2 moved up
  });

  it('Prompt Missile with look-back locks the kart behind and flies backwards', () => {
    const sc = pair();
    sc.give(0, 'prompt_missile');
    sc.aim[0] = 2; sc.lookBack[0] = true;
    sc.until(() => sc.w.karts[0]!.items.aimLockTicks >= 24, 60);
    const T = use(sc, 0);
    const p = sc.w.projectiles[0]!;
    expect(p.target).toBe(2);
    expect(p.s).toBeLessThan(sc.w.karts[0]!.race.raceDist);
    sc.until(() => hits(sc, 2, EF.airborne).length > 0, 300);
    expect(sc.w.tick - T).toBeLessThan(120);
  });

  it('Top-1 Missile homes on the leader; the leader using one fizzles', () => {
    const sc = pair();
    sc.give(0, 'top1_missile'); sc.give(2, 'top1_missile');
    const T0 = use(sc, 0);
    expect(evs(sc, 'itemFizzle').map((e) => e.tick)).toEqual([T0]);
    use(sc, 2);
    expect(sc.w.projectiles[0]!.target).toBe(0);
    sc.until(() => hits(sc, 0, EF.airborne).length > 0, 400);
    const c = dec(sc, 'commit')[0]!;
    expect(hits(sc, 0, EF.airborne)[0]!.tick).toBe(c.impact);
  });

  it('Bug Report targets the opponent directly ahead in rank: trap_bug 84 at S = Tc + 21', () => {
    const sc = scenario({ count: 3, starts: [0, 20, 45] });
    sc.until(() => sc.w.tick >= sc.w.goTick + 240);
    const ahead = sc.w.karts.find((k) => k.active && k.race.rank === sc.w.karts[2]!.race.rank - 1)!;
    sc.give(2, 'bug_report');
    use(sc, 2);
    expect(sc.w.projectiles[0]!.target).toBe(ahead.slot);
    sc.until(() => dec(sc, 'commit').length > 0, 300);
    const c = dec(sc, 'commit')[0]!;
    sc.until(() => sc.w.tick >= c.impact);
    expect(hits(sc, ahead.slot, EF.trap_bug).map((e) => e.tick)).toEqual([c.impact]);
    expect(sc.w.karts[ahead.slot]!.status.ccEnd).toBe(c.impact + 84);
  });

  it('Throttle Drone: fixed flight, commit at T + 51, throttle at T + 72 for 210 ticks, cap 0.6·V_REF', () => {
    const sc = pair();
    sc.give(2, 'throttle_drone');
    const T = use(sc, 2);
    sc.until(() => sc.w.tick >= T + 72);
    expect(dec(sc, 'commit')).toMatchObject([{ tick: T + 51, victim: 0, impact: T + 72 }]);
    expect(hits(sc, 0, EF.throttle).map((e) => e.tick)).toEqual([T + 72]);
    sc.advance(150);
    const v = planarSpeed(sc.w.karts[0]!);
    expect(v).toBeLessThan(0.6 * 34 + 1.5);
    sc.until(() => sc.w.tick >= T + 72 + 210);
    expect(evs(sc, 'effectEnd').filter((e) => e.victim === 0 && e.effect === EF.throttle).map((e) => e.tick)).toEqual([T + 72 + 209]);
  });
});

describe('scheduled effects with a telegraph', () => {
  it('Broadcast Bolt: every opponent ahead, stun at T + 21 for 54, then post_stun_slow 48', () => {
    const sc = scenario({ count: 3, starts: [0, 10, 40] });
    sc.until(() => sc.w.tick >= sc.w.goTick + 200);
    sc.give(2, 'broadcast_bolt');
    const T = use(sc, 2);
    const sched = dec(sc, 'effect').filter((d) => d.code === EF.stun);
    expect(sched.map((d) => [d.victim, d.start, d.dur]).sort()).toEqual([[0, T + 21, 54], [1, T + 21, 54]]);
    sc.until(() => sc.w.tick >= T + 21 + 54 + 48);
    for (const v of [0, 1]) {
      expect(hits(sc, v, EF.stun).map((e) => e.tick)).toEqual([T + 21]);
      expect(hits(sc, v, EF.post_stun_slow).map((e) => e.tick)).toEqual([T + 75]);
    }
    expect(hits(sc, 2, EF.stun)).toEqual([]);
  });

  it('Mirror Mode: telegraph 30, reversed steering for 150', () => {
    const sc = pair();
    sc.give(2, 'mirror_mode');
    const T = use(sc, 2);
    sc.until(() => sc.w.tick >= T + 30);
    expect(hits(sc, 0, EF.mirror).map((e) => e.tick)).toEqual([T + 30]);
    expect(sc.ctx.scratch.mods[0]!.steerInvert).toBe(true);
    sc.until(() => sc.w.tick >= T + 30 + 150);
    expect(sc.ctx.scratch.mods[0]!.steerInvert).toBe(false);
  });

  it('Mutex Lock (team): slot_lock on every opponent at T + 21; their use is refused and the item kept', () => {
    const sc = scenario({ count: 4, teams: 'duo', starts: [0, 0, 0, 0] }); // teams: 0,1 vs 2,3
    sc.until(() => sc.w.tick >= sc.w.goTick + 60);
    sc.give(0, 'mutex_lock'); sc.give(2, 'turbo_token');
    const T = use(sc, 0);
    expect(dec(sc, 'effect').filter((d) => d.code === EF.slot_lock).map((d) => [d.victim, d.start]).sort()).toEqual([[2, T + 21], [3, T + 21]]);
    sc.until(() => sc.w.tick >= T + 25);
    use(sc, 2);
    expect(dec(sc, 'reject').at(-1)).toMatchObject({ slot: 2, item: IT.turbo_token, reason: 3, refund: 1 });
    expect(sc.w.karts[2]!.items.slot0).toBe(IT.turbo_token);
    sc.until(() => sc.w.tick >= T + 21 + 150);
    use(sc, 2);
    expect(sc.w.karts[2]!.items.slot0).toBe(0);
  });
});

describe('lobs, drops and hazards', () => {
  it('Token Bomb: lands at T + 36 on the centreline 32 m ahead; traps karts within 6.25 m for 132', () => {
    const sc = scenario({ count: 3 });
    sc.startAt[1] = sc.startAt[2] = 1e9;             // the others wait on the grid
    sc.brakeAt[0] = sc.w.goTick + 150;               // the leader drives off and stops ≈ 90 m down the straight
    sc.until(() => sc.w.tick > sc.w.goTick + 150 && planarSpeed(sc.w.karts[0]!) < 0.1, 400);
    sc.startAt[2] = 0;                               // the follower comes up behind it
    const k0 = sc.w.karts[0]!, k2 = sc.w.karts[2]!;
    sc.until(() => k0.race.raceDist - k2.race.raceDist <= 32, 600); // the landing point is next to the stopped leader
    sc.give(2, 'token_bomb');
    const T = use(sc, 2);
    const h = sc.w.hazards[0]!;
    expect([h.arm, h.expire]).toEqual([T + 36, T + 36]);
    expect(h.radius).toBe(6.25);
    expect(Math.abs(h.pz)).toBeLessThan(0.01);      // centreline (z = 0 on the straight)
    expect(Math.hypot(k0.body.px - h.px, k0.body.pz - h.pz)).toBeLessThan(5);
    sc.until(() => sc.w.tick >= T + 36);
    expect(sc.w.hazards).toHaveLength(0);
    expect(hits(sc, 0, EF.trap_bomb).map((e) => e.tick)).toEqual([T + 36]);
    expect(k0.status.ccEnd).toBe(T + 36 + 132);
    expect(hits(sc, 2, EF.trap_bomb)).toEqual([]);   // ≈ 12 m short of the landing point
  });

  it('Glitch Puddle: arms at T + 18, spins the first kart over it (60) and is consumed', () => {
    const sc = pair(30);
    sc.give(0, 'glitch_puddle');
    const T = use(sc, 0);
    expect(sc.w.hazards[0]).toMatchObject({ arm: T + 18, expire: T + 1800, owner: 0 });
    expect(sc.w.hazards[0]!.radius).toBeCloseTo(1.3, 3);  // POS-grid quantized
    sc.until(() => hits(sc, 2, EF.spin).length > 0, 200);
    const t = hits(sc, 2, EF.spin)[0]!.tick;
    expect(t).toBeGreaterThanOrEqual(T + 18);
    expect(sc.w.karts[2]!.status.ccEnd).toBe(t + 60);
    expect(sc.w.hazards).toHaveLength(0);
    expect(dec(sc, 'hazardRemove').map((d) => d.tick)).toEqual([t]);
  });

  it('Glitch Puddle is harmless before it arms (a close follower drives over it within 18 ticks)', () => {
    const sc = pair(0);
    const gap = sc.w.karts[0]!.race.raceDist - sc.w.karts[2]!.race.raceDist;
    expect(gap).toBeLessThan(3 + 34 * 18 / 60 - 2);  // reaches the drop point before the arm tick
    sc.give(0, 'glitch_puddle');
    const T = use(sc, 0);
    const dropD = sc.w.karts[0]!.race.raceDist - 3;
    sc.until(() => sc.w.tick >= T + 40);
    expect(sc.w.karts[2]!.race.raceDist).toBeGreaterThan(dropD + 5);
    expect(hits(sc, 2, EF.spin)).toEqual([]);
    expect(sc.w.hazards).toHaveLength(1);            // still armed behind both karts
  });

  it('Redaction Cloud: 10 m sphere, redaction 180 once per kart', () => {
    const sc = pair(30);
    sc.give(0, 'redaction_cloud');
    const T = use(sc, 0);
    expect(sc.w.hazards[0]).toMatchObject({ arm: T + 18, expire: T + 600, radius: 10 });
    sc.until(() => sc.w.tick >= T + 200);
    const r = hits(sc, 2, EF.redaction);
    expect(r).toHaveLength(1);
    expect(r[0]!.tick).toBeGreaterThanOrEqual(T + 18);
    expect(hits(sc, 0, EF.redaction)).toEqual([]);
  });

  it('Firewall: 3 blocks 45 m ahead of the leader at u −3/0/+3, armed at T + 24; the leader hits one', () => {
    const sc = pair();
    const lead = sc.w.karts[0]!;
    sc.give(2, 'firewall');
    const T = use(sc, 2);
    expect(sc.w.hazards).toHaveLength(3);
    for (const h of sc.w.hazards) { expect([h.arm, h.expire]).toEqual([T + 24, T + 900]); expect(h.radius).toBeCloseTo(1.3, 3); }
    const zs = sc.w.hazards.map((h) => Math.round(h.pz)).sort((a, b) => a - b);
    expect(zs).toEqual([-3, 0, 3]);                  // lateral offsets (+z = right of the +x straight)
    const x = sc.w.hazards[0]!.px;
    expect(x - lead.body.px).toBeGreaterThan(40); expect(x - lead.body.px).toBeLessThan(50);
    const v0 = planarSpeed(lead);
    sc.until(() => hits(sc, 0, EF.firewall_hit).length > 0, 200);
    expect(hits(sc, 0, EF.firewall_hit)[0]!.tick).toBeGreaterThanOrEqual(T + 24);
    expect(sc.w.hazards).toHaveLength(2);            // the block shattered
    expect(planarSpeed(lead)).toBeLessThan(0.6 * v0);
  });
});

describe('self and team items', () => {
  it('Turbo Token: boost timer +180 (capped at 270 remaining), boostKind item', () => {
    const sc = pair();
    sc.give(0, 'turbo_token', 'turbo_token');
    use(sc, 0);
    expect(sc.w.karts[0]!.drive.boostTicks).toBe(181);
    expect(sc.w.karts[0]!.drive.boostKind).toBe(4);
    sc.advance(6);
    use(sc, 0);
    expect(sc.w.karts[0]!.drive.boostTicks).toBe(271);
  });

  it('Context Shield: window [T, T + 180), absorbs one missile, then 18 ticks of grace', () => {
    const sc = pair();
    sc.give(0, 'context_shield'); sc.give(2, 'prompt_missile');
    sc.aim[2] = 0;
    sc.until(() => sc.w.karts[2]!.items.aimLockTicks >= 24, 60);
    use(sc, 2);
    const T = use(sc, 0);
    expect(sc.w.karts[0]!.status.shieldUntil).toBe(T + 180);
    sc.until(() => dec(sc, 'result').length > 0, 300);
    const r = dec(sc, 'result')[0]!;
    expect(r).toMatchObject({ victim: 0, result: 'shielded' });
    expect(sc.w.karts[0]!.status.shieldUntil).toBe(0);
    expect(sc.w.karts[0]!.status.shieldGraceUntil).toBe(r.tick + 18);
    expect(sc.w.karts[0]!.status.cc).toBe(0);
    expect(sc.w.karts[0]!.stats.attacksBlocked).toBe(1);
  });

  it('the shield does not stop a Throttle Drone', () => {
    const sc = pair();
    sc.give(2, 'throttle_drone');
    const T = use(sc, 2);
    sc.give(0, 'context_shield');
    use(sc, 0);
    sc.until(() => sc.w.tick >= T + 72);
    expect(hits(sc, 0, EF.throttle)).toHaveLength(1);
    expect(sc.w.karts[0]!.status.shieldUntil).toBeGreaterThan(sc.w.tick); // unused
  });

  it('Interrupt Pulse clears a drone in flight and guards for 90 ticks', () => {
    const sc = pair();
    sc.give(2, 'throttle_drone', 'throttle_drone');
    const T = use(sc, 2);
    sc.advance(30);
    sc.give(0, 'interrupt_pulse');
    const P = use(sc, 0);
    expect(sc.w.projectiles).toHaveLength(0);
    expect(evs(sc, 'itemFizzle').filter((e) => e.item === IT.throttle_drone).map((e) => e.tick)).toEqual([P]);
    expect(hits(sc, 0, EF.pulse_guard).map((e) => e.tick)).toEqual([P]);
    sc.advance(6);
    const T2 = use(sc, 2);                           // a second drone lands inside the guard window?
    sc.until(() => sc.w.tick >= T2 + 72);
    const guarded = T2 + 72 < P + 90;
    expect(evs(sc, 'effect').filter((e) => e.victim === 0 && e.effect === EF.throttle).map((e) => e.result)).toEqual([guarded ? 'immune' : 'hit']);
    void T;
  });

  it('Interrupt Pulse from the target ends an opponent tether without a slingshot', () => {
    const sc = pair(60);
    sc.give(2, 'attention_tether');
    sc.aim[2] = 0;
    sc.until(() => sc.w.karts[2]!.items.aimLockTicks >= 17, 60);
    const T = use(sc, 2);
    sc.until(() => sc.w.tick >= T + 30);
    expect(hits(sc, 2, EF.tether_pull)).toHaveLength(1);
    sc.give(0, 'interrupt_pulse');
    const P = use(sc, 0);
    expect(evs(sc, 'effectEnd').filter((e) => e.victim === 2 && e.effect === EF.tether_pull).map((e) => e.tick)).toEqual([P]);
    sc.advance(40);
    expect(hits(sc, 2, EF.slingshot)).toEqual([]);
    expect(sc.ctx.scratch.mods[2]!.kinematic).toBe(0);
  });

  it('Interrupt Pulse removes active throttle stacks', () => {
    const sc = pair();
    sc.give(2, 'throttle_drone');
    const T = use(sc, 2);
    sc.until(() => sc.w.tick >= T + 80);
    expect(sc.w.karts[0]!.status.modMask & (1 << (EF.throttle - 1))).not.toBe(0);
    sc.give(0, 'interrupt_pulse');
    use(sc, 0);
    sc.advance(1);
    expect(sc.w.karts[0]!.status.modMask & (1 << (EF.throttle - 1))).toBe(0);
  });

  it('Alignment Halo (team): the user at T, the teammate at T + 21, 210 ticks each', () => {
    const sc = scenario({ count: 4, teams: 'duo' });
    sc.until(() => sc.w.tick >= sc.w.goTick + 60);
    sc.give(0, 'alignment_halo');
    const T = use(sc, 0);
    expect(sc.w.karts[0]!.status.haloUntil).toBe(T + 210);
    expect(dec(sc, 'effect').filter((d) => d.code === EF.halo).map((d) => [d.victim, d.start])).toEqual([[1, T + 21]]);
    sc.until(() => sc.w.tick >= T + 21);
    expect(sc.w.karts[1]!.status.haloUntil).toBe(T + 21 + 210);
    expect(sc.w.karts[2]!.status.haloUntil).toBe(0);
  });

  it('Interpretability Lens (team): lens_reveal 600 for the user and teammates at T', () => {
    const sc = scenario({ count: 8, teams: 'squad' });
    sc.until(() => sc.w.tick >= sc.w.goTick + 30);
    sc.give(0, 'interpretability_lens');
    const T = use(sc, 0);
    sc.advance(1);
    for (const k of sc.w.karts) {
      const on = (k.status.modMask & (1 << (EF.lens_reveal - 1))) !== 0;
      expect(on, `slot ${k.slot}`).toBe(k.team === 0);
    }
    expect(hits(sc, 0, EF.lens_reveal)[0]!.tick).toBe(T);
  });

  it('Overclock Aura: boost toward vBoost for 180 ticks and spins an opponent it touches', () => {
    const sc = pair(8);
    sc.give(2, 'overclock_aura');
    const T = use(sc, 2);
    expect(sc.ctx.scratch.mods[2]!.vTarget).toBe(0); // applied from the next tick's modifiers
    sc.advance(1);
    expect(sc.ctx.scratch.mods[2]!.vTarget).toBe(sc.ctx.content.karts.byCode[sc.w.karts[2]!.spec]!.vBoost); // the kart's own vBoost
    sc.until(() => hits(sc, 0, EF.spin).length > 0 || sc.w.tick > T + 180, 200);
    expect(hits(sc, 0, EF.spin)).toHaveLength(1);
    expect(hits(sc, 2, EF.spin)).toEqual([]);         // the user is immune to spin while overclocked
  });

  it('Attention Tether against a cruising target: a 132-tick pull toward 1.25·u_target, no slingshot', () => {
    const sc = pair(60);
    sc.give(2, 'attention_tether');
    sc.aim[2] = 0;
    sc.until(() => sc.w.karts[2]!.items.aimLockTicks >= 17, 60);
    const T = use(sc, 2);
    const gap0 = sc.w.karts[0]!.race.raceDist - sc.w.karts[2]!.race.raceDist;
    sc.until(() => sc.w.tick >= T + 21 + 132);
    expect(hits(sc, 2, EF.tether_pull).map((e) => e.tick)).toEqual([T + 21]);
    expect(evs(sc, 'effectEnd').filter((e) => e.victim === 2 && e.effect === EF.tether_pull).map((e) => e.tick)).toEqual([T + 21 + 131]);
    expect(hits(sc, 2, EF.slingshot)).toEqual([]);
    const gap1 = sc.w.karts[0]!.race.raceDist - sc.w.karts[2]!.race.raceDist;
    expect(gap0 - gap1).toBeGreaterThan(12);         // closed at ≈ 0.25·34 m/s for 2.2 s
  });

  it('Attention Tether: hook 21 ticks, pull, slingshot on reaching a slowing target', () => {
    const sc = pair(60);
    sc.give(2, 'attention_tether');
    sc.aim[2] = 0;
    sc.until(() => sc.w.karts[2]!.items.aimLockTicks >= 17, 60);
    const T = use(sc, 2);
    sc.brakeAt[0] = T;
    expect(dec(sc, 'effect').filter((d) => d.code === EF.tether_pull)).toMatchObject([{ victim: 2, start: T + 21, dur: 132 }]);
    sc.until(() => hits(sc, 2, EF.slingshot).length > 0 || sc.w.tick > T + 21 + 132, 200);
    expect(hits(sc, 2, EF.tether_pull).map((e) => e.tick)).toEqual([T + 21]);
    const s = hits(sc, 2, EF.slingshot);
    expect(s).toHaveLength(1);
    expect(s[0]!.tick).toBeLessThan(T + 21 + 132);
    sc.advance(2);
    expect(sc.ctx.scratch.mods[2]!.vTarget).toBeCloseTo(42.5, 5);
  });
});

describe('refusals', () => {
  it('item use is refused before GO, during hard CC and within 6 ticks of the last use', () => {
    const sc = pair();
    sc.give(0, 'turbo_token', 'turbo_token');
    use(sc, 0);
    use(sc, 0);
    expect(dec(sc, 'reject').at(-1)).toMatchObject({ slot: 0, reason: 4, refund: 1 });
    expect(sc.w.karts[0]!.items.slot0).toBe(IT.turbo_token);
    expect(sc.w.phase).toBe(Phase.RACING);
  });
});
