// L2 content: 18 items + 20 effects are registered with consistent keys; drop tables (solo/team × standard/light/chaos)
// sum to 100 per bucket and the derived variants equal 12-items-spec §8.3.
import { describe, expect, it } from 'vitest';
import { EFFECT_IDS, ITEM_IDS, deriveDropTable, loadContent, type DropTable, type ItemId, type RankBucket } from '@cr/content';
import { ITEM_BEHAVIORS } from '../src/generated/item-behaviors.gen.ts';
import { EFFECT_BEHAVIORS } from '../src/generated/effect-behaviors.gen.ts';
import { dropTableFor } from '../src/items/roll.ts';
import { raceConfig } from './items-rig.ts';
import { bakedTrack } from './rig.ts';

const c = loadContent();
const cat = (id: ItemId) => c.items.get(id).category;

describe('item and effect definitions', () => {
  it('registers all 18 items and 20 effects with codes = index + 1', () => {
    expect(c.items.all.map((d) => d.id)).toEqual([...ITEM_IDS]);
    expect(c.effects.all.map((d) => d.id)).toEqual([...EFFECT_IDS]);
    ITEM_IDS.forEach((id, i) => expect(c.items.get(id).code).toBe(i + 1));
    EFFECT_IDS.forEach((id, i) => expect(c.effects.get(id).code).toBe(i + 1));
  });

  it('every item has a behaviour, valid applies and the presentation key patterns (§10)', () => {
    for (const d of c.items.all) {
      expect(ITEM_BEHAVIORS, d.id).toHaveProperty(d.behavior ?? 'apply');
      expect(d.applies.length, d.id).toBeGreaterThan(0);
      for (const a of d.applies) expect(c.effects.byId.has(a.effect), `${d.id} → ${a.effect}`).toBe(true);
      const p = d.presentation;
      expect(p.iconKey).toBe(`items/${d.id}`);
      expect(p.vfxKey).toBe(`item.${d.id}`);
      expect(p.sfxUse).toBe(`item.${d.id}.use`);
      expect(p.nameKey).toBe(`items.${d.id}.name`);
      expect(p.descKey).toBe(`items.${d.id}.desc`);
      if (d.aim) expect(d.target).toBe('aim');
      if (d.projectile) expect(d.behavior).toBe('projectile');
    }
  });

  it('effect definitions follow the §3 table (classes, durations, stacking, immunity, onEnd chains)', () => {
    const e = (id: (typeof EFFECT_IDS)[number]) => c.effects.get(id);
    for (const id of ['airborne', 'trap_bomb', 'trap_bug', 'spin', 'stun'] as const) {
      expect(e(id).class).toBe('hardCC');
      expect(e(id).immunityAfterTicks).toBe(36);
      expect(e(id).stacking).toBe('refresh');
    }
    expect([e('airborne').durTicks, e('trap_bomb').durTicks, e('trap_bug').durTicks, e('spin').durTicks, e('stun').durTicks]).toEqual([66, 132, 84, 60, 54]);
    expect(e('airborne').onEnd).toEqual([{ effect: 'escape_boost', to: 'self', leadTicks: 0, durTicks: 60 }]);
    expect(e('stun').onEnd?.[0]?.effect).toBe('post_stun_slow');
    expect(e('throttle').stacking).toBe('stackDuration3');
    expect(e('turbo').stacking).toBe('extend');
    expect(e('trap_bomb').mash).toEqual({ creditTicks: 7, floorTicks: 48, maxCredits: 12, minGapTicks: 3 });
    for (const d of c.effects.all) {
      if (d.behavior) expect(EFFECT_BEHAVIORS, d.id).toHaveProperty(d.behavior);
      expect(d.presentation?.vfxKey).toBe(`effect.${d.id}`);
      expect(d.nameKey).toBe(`items.effect.${d.id}.name`);
    }
  });

  it('shield/halo block everything except the drone and the tether; pulse clears exactly those two', () => {
    for (const d of c.items.all) {
      const unblockable = d.id === 'throttle_drone' || d.id === 'attention_tether';
      const harmful = d.applies.some((a) => a.to === 'victim');
      if (harmful) expect([...d.blockedBy].sort(), d.id).toEqual(unblockable ? [] : ['halo', 'shield']);
      expect(d.clearedBy ?? [], d.id).toEqual(unblockable ? ['pulse'] : []);
    }
  });
});

// §8.3 listed values (short names → ids)
const N: Record<string, ItemId> = {
  turbo: 'turbo_token', tether: 'attention_tether', aura: 'overclock_aura', missile: 'prompt_missile', top1: 'top1_missile', bomb: 'token_bomb',
  bug: 'bug_report', bolt: 'broadcast_bolt', drone: 'throttle_drone', firewall: 'firewall', puddle: 'glitch_puddle', cloud: 'redaction_cloud',
  mirror: 'mirror_mode', shield: 'context_shield', pulse: 'interrupt_pulse', halo: 'alignment_halo', lens: 'interpretability_lens', mutex: 'mutex_lock',
};
const parse = (s: string): Record<string, number> => Object.fromEntries(s.split(',').map((x) => x.trim().split(' ')).map(([k, v]) => [N[k!]!, Number(v)]));
const SPEC: Record<string, Record<RankBucket, string>> = {
  'solo/light': {
    top: 'shield 58, puddle 13, pulse 16, cloud 7, turbo 6',
    high: 'missile 15, shield 26, bug 11, bomb 7, turbo 15, puddle 6, drone 4, tether 7, firewall 3, pulse 4, mirror 2',
    mid: 'turbo 37, missile 13, bomb 10, tether 20, bug 7, drone 3, firewall 3, top1 2, mirror 2, aura 3',
    low: 'turbo 52, tether 25, aura 9, bolt 4, drone 3, top1 3, bomb 2, firewall 2',
  },
  'solo/chaos': {
    top: 'shield 28, puddle 38, pulse 7, cloud 21, turbo 6',
    high: 'missile 25, shield 7, bug 19, bomb 12, turbo 8, puddle 10, drone 6, tether 4, firewall 5, pulse 1, mirror 3',
    mid: 'turbo 20, missile 21, bomb 16, tether 11, bug 12, drone 6, firewall 6, top1 3, mirror 3, aura 2',
    low: 'turbo 40, tether 20, aura 7, bolt 8, drone 8, top1 7, bomb 5, firewall 5',
  },
  'team/light': {
    top: 'shield 47, puddle 12, pulse 15, lens 14, cloud 6, turbo 6',
    high: 'missile 14, shield 21, bug 11, turbo 17, bomb 6, puddle 6, halo 7, drone 3, tether 7, pulse 4, mutex 3, mirror 1',
    // §8.3 lists turbo 34 / mutex 3 here, which breaks its own rule: six rows tie at remainder 2/3 for five increments
    // and "ties by ITEM_IDS order" gives turbo (index 0) the unit before mutex (17), as solo/light high confirms.
    mid: 'turbo 35, missile 10, tether 16, bug 8, bomb 7, drone 3, halo 7, pulse 7, firewall 3, top1 1, mutex 2, mirror 1',
    low: 'turbo 47, tether 22, drone 4, aura 8, bolt 3, halo 6, pulse 6, top1 2, firewall 2',
  },
  'team/chaos': {
    top: 'shield 23, puddle 34, pulse 7, lens 13, cloud 17, turbo 6',
    high: 'missile 26, shield 6, bug 19, turbo 10, bomb 10, puddle 10, halo 2, drone 7, tether 4, pulse 1, mutex 2, mirror 3',
    mid: 'turbo 22, missile 19, tether 10, bug 15, bomb 12, drone 6, halo 2, pulse 2, firewall 5, top1 3, mutex 2, mirror 2',
    low: 'turbo 40, tether 19, drone 11, aura 7, bolt 7, halo 2, pulse 2, top1 6, firewall 6',
  },
};
const asMap = (t: DropTable, b: RankBucket): Record<string, number> => Object.fromEntries(t.buckets[b].map(([id, n]) => [id, n]));

describe('drop tables', () => {
  it('every bucket of solo/team × standard/light/chaos sums to 100 and team-only items never drop in solo', () => {
    for (const base of [c.drop.solo, c.drop.team]) for (const set of ['standard', 'light', 'chaos'] as const) {
      const t = deriveDropTable(base, set, cat);
      for (const b of ['top', 'high', 'mid', 'low'] as const) {
        expect(t.buckets[b].reduce((a, r) => a + r[1], 0), `${base.format}/${set}/${b}`).toBe(100);
        if (base.format === 'solo') for (const [id] of t.buckets[b]) expect(c.items.get(id).teamOnly, id).toBe(false);
      }
    }
  });

  it('light/chaos variants equal the §8.3 tables (largest remainder, ties by ITEM_IDS order)', () => {
    for (const [key, buckets] of Object.entries(SPEC)) {
      const [format, set] = key.split('/') as ['solo' | 'team', 'light' | 'chaos'];
      const t = deriveDropTable(format === 'solo' ? c.drop.solo : c.drop.team, set, cat);
      for (const b of ['top', 'high', 'mid', 'low'] as const) expect(asMap(t, b), `${key}/${b}`).toEqual(parse(buckets[b]));
    }
  });

  it('the sim picks the table for the race format and item set', () => {
    const track = bakedTrack('spark_circuit/proving_ring');
    expect(dropTableFor(c, raceConfig(track, { teams: 'solo' }))).toBe(c.drop.solo);
    expect(dropTableFor(c, raceConfig(track, { teams: 'squad' }))).toBe(c.drop.team);
    const chaos = dropTableFor(c, raceConfig(track, { teams: 'solo', itemSet: 'chaos' }));
    expect(asMap(chaos, 'top')).toEqual(parse(SPEC['solo/chaos']!.top));
    expect(dropTableFor(c, raceConfig(track, { teams: 'solo', itemSet: 'chaos' }))).toBe(chaos); // memoized
  });
});
