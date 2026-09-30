// Status visuals per kart (30-art-bible §10.3), keyed by EFFECT_IDS names: shield bubble, halo, trap bubbles
// with orbiting token glyphs and mash arrows, spin stars, stun arcs, post-stun grey puffs, throttle beam, mirror
// arrows, slot padlock, pulse-guard ring, overclock spark halo, tether beam, slingshot streak, airborne trail.
// Meshes are created lazily per kart on first use and share library materials (bubble, emissiveVertex, vertexLit).
import * as THREE from 'three/webgpu';
import { EFFECT_IDS } from '@cr/content';
import { MaterialLibrary } from '../materials/library.ts';
import { halo as haloGeo, padlock, mirrorArrows, token as tokenGeo, star as starGeo, beam as beamGeo } from './items/geo.ts';
import type { GpuParticles, SpawnOpts } from './gpuParticles.ts';
import type { KartPose } from './driving.ts';

/** Active status flags for one kart this frame. */
export interface StatusFlags {
  shield: boolean; halo: boolean; trapBomb: boolean; trapBug: boolean; spin: boolean; stun: boolean; slow: boolean;
  throttle: number; mirror: boolean; lock: boolean; pulse: boolean; overclock: boolean; airborne: boolean;
  tetherFrom: number; slingshot: boolean; escape: boolean; lens: boolean;
  /** Ticks until the nearest committed-but-unresolved hit lands on this kart (0 = none): drives the warning ring. */
  incoming: number;
}
export function clearFlags(f: StatusFlags): void {
  f.shield = f.halo = f.trapBomb = f.trapBug = f.spin = f.stun = f.slow = f.mirror = f.lock = f.pulse = f.overclock = f.airborne = f.slingshot = f.escape = f.lens = false;
  f.throttle = 0; f.tetherFrom = -1; f.incoming = 0;
}
export function newFlags(): StatusFlags { const f = {} as StatusFlags; clearFlags(f); return f; }

/** Applies one active effect (by wire code) to the flags. */
export function applyEffect(f: StatusFlags, code: number, source: number): void {
  switch (EFFECT_IDS[code - 1]) {
    case 'shield': f.shield = true; break;
    case 'halo': f.halo = true; break;
    case 'trap_bomb': f.trapBomb = true; break;
    case 'trap_bug': f.trapBug = true; break;
    case 'spin': f.spin = true; break;
    case 'stun': f.stun = true; break;
    case 'post_stun_slow': f.slow = true; break;
    case 'throttle': f.throttle++; break;
    case 'mirror': f.mirror = true; break;
    case 'slot_lock': f.lock = true; break;
    case 'pulse_guard': f.pulse = true; break;
    case 'overclock': f.overclock = true; break;
    case 'airborne': f.airborne = true; break;
    case 'tether_pull': f.tetherFrom = source; break;
    case 'slingshot': f.slingshot = true; break;
    case 'escape_boost': f.escape = true; break;
    case 'lens_reveal': f.lens = true; break;
    default: break;
  }
}

const COL = { warn: new THREE.Color('#E5484D'), shield: new THREE.Color('#7DE2FC'), bomb: new THREE.Color('#FFC857'), bug: new THREE.Color('#7BD88F'), beam: new THREE.Color('#ff5a5a'), pulse: new THREE.Color('#A6FFCB') };
const ARC: SpawnOpts = { shape: 1, additive: true, size0: 0.05, size1: 0.02, gravity: 0, drag: 6, stretch: 0.06, emissive: 3.2 };
const GREY: SpawnOpts = { shape: 5, additive: false, size0: 0.3, size1: 1.2, gravity: 0.6, drag: 2, alpha: 0.4 };
const SPARKLE: SpawnOpts = { shape: 2, additive: true, size0: 0.22, size1: 0.06, gravity: 0, drag: 4, emissive: 2.4, spin: 5 };
const DOT: SpawnOpts = { shape: 0, additive: true, size0: 0.28, size1: 0.12, gravity: 0, drag: 1, emissive: 2.2 };
const TRAIL: SpawnOpts = { shape: 5, additive: false, size0: 0.4, size1: 1.4, gravity: 0.3, drag: 2, alpha: 0.35 };
const STREAK: SpawnOpts = { shape: 1, additive: true, size0: 0.08, size1: 0.03, gravity: 0, drag: 0.5, stretch: 0.05, emissive: 2.6 };

const TRAPS = ['trapBomb', 'trapBug'] as const;
let geoCache: Record<string, THREE.BufferGeometry> | null = null;
function geos(): Record<string, THREE.BufferGeometry> {
  if (geoCache) return geoCache;
  const lock = padlock();
  geoCache = {
    bubble: new THREE.IcosahedronGeometry(1, 3), halo: haloGeo(), lockLit: lock.lit!, lockGlow: lock.glow!, mirror: mirrorArrows(), token: tokenGeo(), star: starGeo(), beam: beamGeo(),
    ring: new THREE.TorusGeometry(1.4, 0.03, 6, 40).rotateX(Math.PI / 2),
  };
  return geoCache;
}

export class StatusRig {
  readonly root = new THREE.Group();
  private parts = new Map<string, THREE.Object3D>();
  private t = 0;

  constructor() { this.root.name = 'status'; }

  private part(key: string): THREE.Object3D {
    let p = this.parts.get(key);
    if (p) return p;
    const g = geos();
    const bubble = (c: THREE.Color, r: number): THREE.Mesh => { const m = new THREE.Mesh(g.bubble!, MaterialLibrary.bubble('#7DE2FC', true)); m.userData['fxColor'] = c; m.scale.setScalar(r); m.position.y = 0.7; return m; };
    const glow = (geo: THREE.BufferGeometry): THREE.Mesh => new THREE.Mesh(geo, MaterialLibrary.emissiveVertex(3));
    switch (key) {
      case 'shield': p = bubble(COL.shield, 1.45); break;
      case 'trapBomb': case 'trapBug': {
        const grp = new THREE.Group();
        grp.add(bubble(key === 'trapBomb' ? COL.bomb : COL.bug, 1.6));
        for (let i = 0; i < 5; i++) { const tk = glow(g.token!); tk.name = 'orb'; grp.add(tk); }
        const arrows = glow(g.mirror!); arrows.name = 'arrows'; arrows.position.y = 2.6; arrows.scale.setScalar(1.3); grp.add(arrows);
        p = grp; break;
      }
      case 'halo': p = glow(g.halo!); p.position.y = 1.55; break;
      case 'lock': { const grp = new THREE.Group(); grp.add(new THREE.Mesh(g.lockLit!, MaterialLibrary.vertexLit(0.5, 0.2)), glow(g.lockGlow!)); grp.position.y = 1.9; p = grp; break; }
      case 'mirror': p = glow(g.mirror!); p.position.y = 2.0; break;
      case 'stars': { const grp = new THREE.Group(); for (let i = 0; i < 4; i++) grp.add(glow(g.star!)); grp.position.y = 1.35; p = grp; break; }
      case 'beam': { const m = new THREE.Mesh(g.beam!, MaterialLibrary.bubble('#7DE2FC', true)); m.userData['fxColor'] = COL.beam.clone(); m.scale.set(1.6, 7, 1.6); m.position.y = 7.5; p = m; break; }
      case 'pulse': { const m = new THREE.Mesh(g.ring!, MaterialLibrary.bubble('#7DE2FC', false)); m.userData['fxColor'] = COL.pulse; m.position.y = 0.3; p = m; break; }
      case 'warn': { const m = new THREE.Mesh(g.ring!, MaterialLibrary.bubble('#7DE2FC', false)); m.userData['fxColor'] = COL.warn.clone(); m.position.y = 0.12; p = m; break; }
      default: p = new THREE.Group();
    }
    p.visible = false;
    this.root.add(p);
    this.parts.set(key, p);
    return p;
  }

  /** Builds every part once (hidden) so their shaders compile behind the loading screen. */
  prewarm(): void { for (const k of ['shield', 'trapBomb', 'trapBug', 'halo', 'lock', 'mirror', 'stars', 'beam', 'pulse', 'warn']) this.part(k); }

  private show(key: string, on: boolean): THREE.Object3D | null {
    if (!on) { const p = this.parts.get(key); if (p) p.visible = false; return null; }
    const p = this.part(key); p.visible = true; return p;
  }

  /** Updates meshes and continuous particles for this kart. */
  update(f: StatusFlags, pose: KartPose, dt: number, sparks: GpuParticles, smoke: GpuParticles, tetherPos: THREE.Vector3 | null): void {
    this.t += dt;
    const t = this.t;
    const sh = this.show('shield', f.shield);
    if (sh) { sh.rotation.y = t * 0.8; sh.scale.setScalar(1.45 + Math.sin(t * 6) * 0.03); }
    for (let q = 0; q < TRAPS.length; q++) {
      const key = TRAPS[q]!;
      const g = this.show(key, key === 'trapBomb' ? f.trapBomb : f.trapBug);
      if (!g) continue;
      let k = 0;
      for (let ci = 0; ci < g.children.length; ci++) {
        const c = g.children[ci]!;
        if (c.name === 'orb') { const a = t * 1.6 + k * 1.2566; c.position.set(Math.cos(a) * 1.1, 0.7 + Math.sin(t * 2 + k) * 0.35, Math.sin(a) * 1.1); c.rotation.y = t * 3 + k; k++; }
        else if (c.name === 'arrows') { c.rotation.y = 0; c.scale.setScalar(1.2 + Math.abs(Math.sin(t * 8)) * 0.25); }
        else c.rotation.y = t * 0.5;
      }
    }
    const h = this.show('halo', f.halo); if (h) { h.rotation.y = t * 1.5; h.position.y = 1.55 + Math.sin(t * 3) * 0.05; }
    const l = this.show('lock', f.lock); if (l) { l.rotation.y = Math.sin(t * 2) * 0.4; l.position.y = 1.9 + Math.sin(t * 4) * 0.06; }
    const m = this.show('mirror', f.mirror); if (m) { m.rotation.y = Math.PI * Math.floor(t * 2) % (Math.PI * 2); }
    const st = this.show('stars', f.spin || f.stun);
    if (st) { for (let k = 0; k < st.children.length; k++) { const c = st.children[k]!; const a = t * 6 + k * 1.5708; c.position.set(Math.cos(a) * 0.55, Math.sin(t * 9 + k) * 0.08, Math.sin(a) * 0.55); c.rotation.set(t * 4, t * 3, 0); } }
    const b = this.show('beam', f.throttle > 0);
    if (b) { (b.userData['fxColor'] as THREE.Color).copy(COL.beam).multiplyScalar(0.6 + 0.4 * Math.min(3, f.throttle)); b.rotation.y = t; }
    const pr = this.show('pulse', f.pulse); if (pr) { pr.scale.setScalar(1 + Math.sin(t * 5) * 0.06); pr.rotation.y = t; }
    // incoming hit (missile lock, bolt, bomb in flight): a red ground ring that tightens and pulses faster near impact
    const wr = this.show('warn', f.incoming > 0);
    if (wr) {
      const near = 1 - Math.min(1, f.incoming / 90);
      const beat = 0.5 + 0.5 * Math.sin(t * (6 + 18 * near));
      wr.scale.setScalar(1.25 - 0.25 * near + beat * 0.08);
      (wr.userData['fxColor'] as THREE.Color).copy(COL.warn).multiplyScalar(0.6 + 0.9 * beat);
    }
    // continuous particles
    const x = pose.pos.x, y = pose.pos.y, z = pose.pos.z;
    if (f.stun) {
      const n = sparks.rate(40, dt);
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.283; sparks.spawn(x + Math.cos(a) * 0.7, y + 0.4 + Math.random(), z + Math.sin(a) * 0.7, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, 0.08, 0.62, 0.9, 1, ARC); }
    }
    if (f.slow) {
      const n = smoke.rate(8, dt);
      for (let i = 0; i < n; i++) smoke.spawn(x - pose.fwd.x * 1.1, y + 0.45, z - pose.fwd.z * 1.1, -pose.fwd.x, 0.6, -pose.fwd.z, 0.9, 0.55, 0.55, 0.57, GREY);
    }
    if (f.overclock) {
      const n = sparks.rate(50, dt);
      for (let i = 0; i < n; i++) { const a = t * 7 + i * 2.1; const red = (Math.floor(t * 8) + i) % 2 === 0; sparks.spawn(x + Math.cos(a) * 1.2, y + 0.6 + Math.sin(t * 5 + i) * 0.3, z + Math.sin(a) * 1.2, -Math.sin(a) * 3, 0, Math.cos(a) * 3, 0.2, red ? 1 : 0.16, red ? 0.3 : 0.79, red ? 0.43 : 1, SPARKLE); }
    }
    if (f.airborne) {
      const n = smoke.rate(20, dt);
      for (let i = 0; i < n; i++) smoke.spawn(x, y + 0.5, z, 0, 0, 0, 0.8, 0.9, 0.9, 0.92, TRAIL);
    }
    if (f.slingshot) {
      const n = sparks.rate(40, dt);
      for (let i = 0; i < n; i++) sparks.spawn(x + (Math.random() - 0.5), y + 0.5 + Math.random() * 0.6, z + (Math.random() - 0.5), -pose.fwd.x * 10, 0, -pose.fwd.z * 10, 0.25, 0.71, 0.49, 1, STREAK);
    }
    if (tetherPos) {
      // dotted beam between the tethered kart and its source; dots drift toward the source (the pull)
      const n = sparks.rate(60, dt);
      for (let i = 0; i < n; i++) {
        const u = Math.random();
        const px = x + (tetherPos.x - x) * u, py = y + 1 + (tetherPos.y - y) * u, pz = z + (tetherPos.z - z) * u;
        sparks.spawn(px, py, pz, (tetherPos.x - x) * 0.4, 0, (tetherPos.z - z) * 0.4, 0.2, 0.71, 0.49, 1, DOT);
      }
    }
  }

  dispose(): void { this.root.removeFromParent(); }
}

/** Releases the shared status geometry (once per app, not per race). */
export function disposeStatusGeometry(): void { if (geoCache) { for (const g of Object.values(geoCache)) g.dispose(); geoCache = null; } }
