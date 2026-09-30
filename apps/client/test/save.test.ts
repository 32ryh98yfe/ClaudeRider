// SaveV1 migration fixtures and export/import round-trip (13-modes-rules §13, E "migration fixtures v1 load").
import { describe, expect, it } from 'vitest';
import { migrateSave, save, DEFAULT_KEYS, DEFAULT_KEYS_EXTRA } from '../src/meta/save.ts';

/** A save written by the M1 client (SaveV1 exactly as frozen at m1). */
const M1_SAVE = {
  v: 1,
  profile: { name: '레이서', characterId: 'turbo', kartBodyId: 'arrowhead', livery: { primary: '#6a9bcc', secondary: '#faf9f5', pattern: 2, number: 11 } },
  settings: {
    quality: 'high', renderer: 'webgl2', volume: { master: 0.5, music: 0.3, sfx: 0.9, engine: 0.7, ui: 0.7 }, hudScale: 1.1, reducedMotion: true,
    units: 'mph', keys: DEFAULT_KEYS, autoBoost: true, driftAssist: false, cameraShake: false,
  },
  progress: { level: 7, xp: 1000, sparks: 420, unlocks: ['livery.checker'], stats: { races: 12, finishes: 11 } },
  challenges: { daily: [{ id: 'daily_finish_3', progress: 1, done: false, claimed: false }], weekly: [], dailyReset: '2026-09-29', weeklyReset: '2026-09-28' },
  records: { meadow_loop: { bestLapTicks: 1900, bestRaceTicks: { speed: 6000 } } },
};

/** A pre-v1 dev save (no `v`, partial settings, an unknown character, out-of-range values). */
const V0_SAVE = { profile: { name: 'old', characterId: 'dao', kartBodyId: 'pebble' }, settings: { hudScale: 3, keys: { drift: ['KeyQ'] } }, progress: { level: 99, sparks: -5 } };

describe('migrateSave', () => {
  it('loads an M1 v1 save unchanged and fills the new optional fields', () => {
    const s = migrateSave(structuredClone(M1_SAVE));
    expect(s.v).toBe(1);
    expect(s.profile).toMatchObject(M1_SAVE.profile);
    expect(s.settings).toMatchObject({ quality: 'high', renderer: 'webgl2', hudScale: 1.1, reducedMotion: true, units: 'mph', autoBoost: true, cameraShake: false });
    expect(s.settings.volume.voice).toBe(0.7);
    expect(s.settings.keys['emote1']).toEqual(DEFAULT_KEYS_EXTRA['emote1']);
    expect(s.settings.keys['drift']).toEqual(DEFAULT_KEYS['drift']);
    expect(s.settings.pad?.['item']).toEqual([0]);
    expect(s.progress).toMatchObject({ level: 7, xp: 1000, sparks: 420, unlocks: ['livery.checker'], stats: { races: 12, finishes: 11 } });
    expect(s.challenges.daily[0]).toEqual(M1_SAVE.challenges.daily[0]);
    expect(s.records.meadow_loop).toEqual({ bestLapTicks: 1900, bestRaceTicks: { speed: 6000 } });
    expect(typeof s.profile.seed).toBe('number');
  });
  it('upgrades a v0 save: defaults, clamps, unknown ids replaced, custom keys kept', () => {
    const s = migrateSave(structuredClone(V0_SAVE));
    expect(s.v).toBe(1);
    expect(s.profile.name).toBe('old');
    expect(s.profile.characterId).toBe('clay');
    expect(s.settings.hudScale).toBe(1.2);
    expect(s.settings.keys['drift']).toEqual(['KeyQ']);
    expect(s.settings.keys['accel']).toEqual(DEFAULT_KEYS['accel']);
    expect(s.progress.level).toBe(50);
    expect(s.progress.sparks).toBe(0);
  });
  it('rejects unusable input', () => {
    expect(() => migrateSave(null)).toThrow('save_corrupt');
    expect(() => migrateSave('nope')).toThrow('save_corrupt');
    expect(() => migrateSave({ v: 2 })).toThrow('save_version');
  });
  it('caps bindings (3 keys, 2 pad buttons) and ignores junk records', () => {
    const s = migrateSave({ v: 1, settings: { keys: { item: ['A', 'B', 'C', 'D'] }, pad: { item: [0, 1, 2, 99] } }, records: { meadow_loop: 'x', proving_ring: { bestLapTicks: -1 } } });
    expect(s.settings.keys['item']).toHaveLength(3);
    expect(s.settings.pad?.['item']).toEqual([0, 1]);
    expect(s.records.meadow_loop).toBeUndefined();
    expect(s.records.proving_ring).toEqual({});
  });
});

describe('export / import', () => {
  it('round-trips through JSON', () => {
    save.update((d) => { d.profile.name = 'RoundTrip'; d.progress.sparks = 777; d.settings.textScale = 1.2; });
    const json = save.exportJson();
    save.update((d) => { d.profile.name = 'changed'; d.progress.sparks = 1; });
    save.importJson(json);
    expect(save.get().profile.name).toBe('RoundTrip');
    expect(save.get().progress.sparks).toBe(777);
    expect(save.get().settings.textScale).toBe(1.2);
  });
  it('bad JSON throws and leaves the save untouched', () => {
    const before = save.exportJson();
    expect(() => save.importJson('{not json')).toThrow('save_corrupt');
    expect(() => save.importJson('{"v":3}')).toThrow('save_version');
    expect(save.exportJson()).toBe(before);
  });
  it('reset keeps settings and clears progress', () => {
    save.update((d) => { d.progress.sparks = 50; d.settings.hudScale = 0.9; });
    save.reset(true);
    expect(save.get().progress.sparks).toBe(0);
    expect(save.get().settings.hudScale).toBe(0.9);
  });
});
