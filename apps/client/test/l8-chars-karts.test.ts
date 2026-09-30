// L8: every character and kart builds headless, stays inside the art-bible budgets (§7, §9, 40-perf-budgets §2.3),
// exposes its anchors, falls back to a placeholder for unknown ids, and animates without throwing.
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { CHARACTER_IDS, KART_BODY_IDS } from '@cr/content';
import { buildMascot, RIG } from '../src/render/mascot/rig.ts';
import { EMOTE_SLOTS } from '../src/render/mascot/emotes.ts';
import { allCharacters, getCharacter, hasCharacter } from '../src/render/characters/registry.ts';
import { allKartBodies, getKartBody, hasKartBody } from '../src/render/karts/registry.ts';
import { localMaterialCount } from '../src/render/mascot/materials.ts';

const MASCOT = { tris: [4000, 1500, 400], draws: 3 };
const KART = { tris: [8000, 2500, 800], draws: 2 };
const POSE = { steer: 0.4, lean: 0.2, speed01: 0.8, drifting: true, boosting: true, airborne: false, hit: 0 as const };
const LOG = process.env.L8_LOG === '1';

describe('L8 characters', () => {
  it('all 12 characters are registered', () => {
    for (const id of CHARACTER_IDS) expect(hasCharacter(id), id).toBe(true);
    expect(allCharacters().map((c) => c.id)).toEqual([...CHARACTER_IDS]);
  });

  it.each([...CHARACTER_IDS])('%s: budgets, anchors, poses and emotes', (id) => {
    const m = buildMascot(getCharacter(id));
    const st = m.stats();
    if (LOG) console.log(`[mascot] ${id.padEnd(8)} tris ${st.tris.join('/')} draws ${st.draws.join('/')}`);
    for (let l = 0; l < 3; l++) {
      expect(st.tris[l], `${id} LOD${l} tris`).toBeLessThanOrEqual(MASCOT.tris[l]!);
      expect(st.draws[l], `${id} LOD${l} draws`).toBeLessThanOrEqual(MASCOT.draws);
    }
    expect(st.draws[2]).toBeLessThanOrEqual(2);
    for (const a of ['head_top', 'back', 'hand_L', 'hand_R', 'face_front'] as const) expect(m.anchors[a]).toBeInstanceOf(THREE.Object3D);
    m.root.updateMatrixWorld(true);
    for (let i = 0; i < 20; i++) m.setPose(POSE, 1 / 60);
    for (const e of EMOTE_SLOTS) { m.playEmote(e); for (let i = 0; i < 30; i++) m.setPose({ ...POSE, hit: 1 }, 0.1); }
    for (const e of ['open', 'blink', 'happy', 'dizzy', 'star', 'angry'] as const) m.setEyes(e);
    m.setTeamTint(new THREE.Color('#2ACAFF')); m.setTeamTint(null);
    m.setBodyColor('#30302E'); m.setBodyColor(null);
    m.setLod(1); m.setLod(2); m.setAutoLod(true);
    // no NaNs leak into the skeleton
    m.root.traverse((o) => { expect(Number.isFinite(o.position.x + o.position.y + o.position.z + o.quaternion.w), `${id} ${o.name}`).toBe(true); });
    m.dispose();
  });

  it('unknown ids render a placeholder instead of crashing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const def = getCharacter('nope' as never);
    expect(def.id).toBe('placeholder');
    buildMascot(def).dispose();
    warn.mockRestore();
  });

  it('seat scale follows the art bible', () => { expect(RIG.seatScale).toBe(0.62); });
});

describe('L8 karts', () => {
  it('all 8 karts are registered', () => {
    for (const id of KART_BODY_IDS) expect(hasKartBody(id), id).toBe(true);
    expect(allKartBodies().map((k) => k.id)).toEqual([...KART_BODY_IDS]);
  });

  it.each([...KART_BODY_IDS])('%s: budgets, anchors, update and livery', (id) => {
    const def = getKartBody(id);
    const k = def.build(def.livery);
    const st = k.stats();
    if (LOG) console.log(`[kart]   ${id.padEnd(13)} tris ${st.tris.join('/')} draws ${st.draws.join('/')}`);
    for (let l = 0; l < 3; l++) {
      expect(st.tris[l], `${id} LOD${l} tris`).toBeLessThanOrEqual(KART.tris[l]!);
      expect(st.draws[l], `${id} LOD${l} draws`).toBeLessThanOrEqual(KART.draws);
    }
    expect(k.wheels).toHaveLength(4);
    expect(k.exhausts.length).toBeGreaterThan(0);
    expect(k.seat.parent).toBeTruthy();
    // eyes of the seated driver sit 0.55–0.8 m above the road (art bible §9)
    k.root.updateMatrixWorld(true);
    const eye = k.seat.localToWorld(new THREE.Vector3(0, RIG.eye.y * RIG.seatScale, 0));
    expect(eye.y, `${id} eye height`).toBeGreaterThanOrEqual(0.55);
    expect(eye.y, `${id} eye height`).toBeLessThanOrEqual(0.8);
    for (let i = 0; i < 60; i++) k.update({ steer: Math.sin(i * 0.1), wheelSpin: 120, boost: i > 30 ? 1 : 0, drift: i > 20, speed: 30, airborne: i > 50 }, 1 / 60);
    k.setLivery({ primary: '#123456', secondary: '#abcdef', pattern: 5, number: 42 });
    k.setLod(2); k.setAutoLod(true);
    k.root.traverse((o) => { expect(Number.isFinite(o.position.x + o.position.y + o.position.z + o.quaternion.w), `${id} ${o.name}`).toBe(true); });
    k.dispose();
  });

  it('all mascots and karts share a handful of materials', () => {
    // vinyl, eyes, glass, kartPaint, kartOverlay
    expect(localMaterialCount()).toBeLessThanOrEqual(5);
  });
});
