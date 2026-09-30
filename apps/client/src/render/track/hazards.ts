// Track hazards (L4-vis-v2 §8, 10-sim-spec §13.6): geysers, presses, level-crossing trains, traffic and swingers.
// The pose is the analytic BakedTrack.hazardPose(id, tick), a pure function of the tick. Each frame this module
// interpolates the pose between two ticks and draws the hazard in its frame (x = u × f, y = u, z = f).
//
// Visuals are unit-sized and scaled by the hazard size, so they match the sim's contact shapes exactly:
// - box: centred along f and across, standing on the origin along u;
// - cyl: standing on the origin (a swinger capsule is centred on it along the arm);
// - sphere: centred.
// A kit prop `visMeta.hazards[i].prop` replaces the default body. The telegraph (≥ 0.6 s) shows a pulsing ground ring,
// geyser wisps, a press shake and train lights.
import * as THREE from 'three/webgpu';
import type { BakedTrack, HazardPose } from '@cr/sim';
import type { ThemeKit } from '../themes/kit.ts';
import { MaterialLibrary } from '../materials/library.ts';
import { merge, paint, place, box, cyl, rbox, torus } from '../util/geo.ts';
import type { GpuParticles, SpawnOpts } from '../vfx/gpuParticles.ts';

export interface HazardVisMeta { id: number; kind: string; name: string; prop: string; size: [number, number, number]; shape: string; group?: number }

interface Haz {
  meta: HazardVisMeta; root: THREE.Group; body: THREE.Object3D; glow: THREE.Mesh | null; ring: THREE.Mesh;
  arm: THREE.Mesh | null; armLen: number; flat: boolean; capsule: boolean; wasActive: boolean; wasTele: boolean; lastPhase: number; hornT: number;
}

const STEAM: SpawnOpts = { shape: 5, additive: false, size0: 0.8, size1: 2.6, gravity: 2.5, drag: 1.2, alpha: 0.5 };
const WISP: SpawnOpts = { shape: 5, additive: false, size0: 0.3, size1: 1.0, gravity: 1.2, drag: 1.5, alpha: 0.35 };
const SPARK: SpawnOpts = { shape: 1, additive: true, size0: 0.06, size1: 0.02, gravity: -9, drag: 0.6, stretch: 0.04, emissive: 3 };

const CAR_COLORS = ['#D97757', '#6A9BCC', '#FAF9F5', '#7BD88F', '#FFC857'];

/** Default unit geometry per hazard kind: `lit` body, optional `glow` part (lamps, vents). */
function defaultParts(kind: string, id: number): { lit: THREE.BufferGeometry; glow: THREE.BufferGeometry | null } {
  switch (kind) {
    case 'geyser': return {
      // vent rim at ground level; the water column (glow) only shows while active
      lit: merge([paint(place(cyl(1.05, 1.2, 0.18, 14), 0, 0.09, 0), '#3b3530', 0.1, 3), paint(place(torus(0.9, 0.12, 6, 18), 0, 0.2, 0, Math.PI / 2, 0, 0), '#5a4f45')]),
      glow: paint(place(cyl(0.55, 0.85, 1, 12), 0, 0.5, 0), '#dff6ff'),
    };
    case 'press': return {
      lit: merge([
        paint(place(box(1, 0.8, 1), 0, 0.6, 0), '#6b6f78', 0.06, 5),
        paint(place(box(1.02, 0.2, 1.02), 0, 0.1, 0), '#FFC857'),
        paint(place(box(0.3, 3, 0.3), 0, 2.5, 0, 0, 0, 0, 0.4, 1, 0.4), '#4a4d55'),
      ]),
      glow: paint(place(box(1.04, 0.05, 1.04), 0, 0.02, 0), '#ff6a3a'),
    };
    case 'train': return {
      lit: merge([
        paint(place(rbox(1, 0.82, 0.96, 0.04, 2), 0, 0.53, 0), '#6A9BCC', 0.04, 9),
        paint(place(box(1.01, 0.12, 0.97), 0, 0.12, 0), '#30302E'),
        paint(place(box(1.02, 0.1, 0.98), 0, 0.72, 0), '#FAF9F5'),
      ]),
      glow: paint(place(box(0.9, 0.08, 0.99), 0, 0.62, 0), '#fff1b8'),
    };
    case 'traffic': return {
      lit: merge([
        paint(place(rbox(1, 0.45, 1, 0.08, 2), 0, 0.33, 0), CAR_COLORS[id % CAR_COLORS.length]!, 0.03, 4 + id),
        paint(place(rbox(0.8, 0.35, 0.5, 0.06, 2), 0, 0.72, -0.05), '#2b2d33'),
        paint(place(box(1.02, 0.14, 0.2), 0, 0.12, 0.35), '#30302E'), paint(place(box(1.02, 0.14, 0.2), 0, 0.12, -0.35), '#30302E'),
      ]),
      glow: merge([paint(place(box(0.2, 0.08, 0.02), -0.32, 0.4, 0.5), '#fff6d8'), paint(place(box(0.2, 0.08, 0.02), 0.32, 0.4, 0.5), '#fff6d8'), paint(place(box(0.2, 0.08, 0.02), -0.32, 0.4, -0.5), '#ff4a3a'), paint(place(box(0.2, 0.08, 0.02), 0.32, 0.4, -0.5), '#ff4a3a')]),
    };
    case 'swinger': return { lit: paint(place(torus(1.01, 0.08, 6, 20), 0, 0, 0, Math.PI / 2, 0, 0), '#D97757'), glow: null }; // bands; the capsule is per size
    default: return { lit: paint(place(box(1, 1, 1), 0, 0.5, 0), '#ff00ff'), glow: null };
  }
}

export class TrackHazards {
  readonly root = new THREE.Group();
  private list: Haz[] = [];
  private track: BakedTrack;
  private a: HazardPose = { x: 0, y: 0, z: 0, active: 0, telegraph: 0 };
  private b: HazardPose = { x: 0, y: 0, z: 0, active: 0, telegraph: 0 };
  private f = new THREE.Vector3(); private u = new THREE.Vector3(); private s = new THREE.Vector3(); private p = new THREE.Vector3();
  private m = new THREE.Matrix4();
  private t = 0;
  /** Audio cue hook: (sfx id, world position). RaceRenderer forwards it to the spatial mixer. */
  onCue: ((id: string, at: THREE.Vector3) => void) | null = null;

  constructor(metas: readonly HazardVisMeta[], track: BakedTrack, kit: ThemeKit) {
    this.track = track;
    this.root.name = 'hazards';
    const geoCache = new Map<string, { lit: THREE.BufferGeometry; glow: THREE.BufferGeometry | null }>();
    const ringGeo = new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2);
    const warned = new Set<string>();
    for (const meta of metas) {
      const def = track.hazards[meta.id];
      const root = new THREE.Group();
      root.matrixAutoUpdate = false;
      const kitProp = kit.props[meta.prop];
      const isDefault = meta.prop === `hazard_${meta.kind === 'traffic' ? 'car' : meta.kind}`;
      let body: THREE.Object3D, glow: THREE.Mesh | null = null;
      if (kitProp) {
        const built = kitProp.build(kit.data.palette);
        body = new THREE.Mesh(built.geometry, built.material);
      } else {
        if (!kitProp && !isDefault && import.meta.env.DEV && !warned.has(meta.prop)) { warned.add(meta.prop); console.warn(`[hazards] no prop ${meta.prop}; using the default ${meta.kind} look`); }
        const key = meta.kind === 'traffic' ? `traffic${meta.id % CAR_COLORS.length}` : meta.kind;
        let parts = geoCache.get(key);
        if (!parts) { parts = defaultParts(meta.kind, meta.id); geoCache.set(key, parts); }
        body = new THREE.Mesh(parts.lit, MaterialLibrary.vertexLit(0.55, 0.15));
        if (parts.glow) glow = new THREE.Mesh(parts.glow, meta.kind === 'geyser' ? MaterialLibrary.bubble('#bfeaff', true) : MaterialLibrary.emissiveVertex(3));
      }
      const capsule = meta.kind === 'swinger';
      const [s0, s1, s2] = meta.size;
      if (capsule && !kitProp) {
        // wrecking ball: the capsule itself is sized per hazard (scaling a unit capsule would squash its caps)
        const grp = new THREE.Group();
        const cap = new THREE.Mesh(paint(new THREE.CapsuleGeometry(s0, Math.max(0.01, s1), 4, 14), '#3a3a40', 0.05, 2), MaterialLibrary.vertexLit(0.55, 0.15));
        cap.castShadow = true;
        grp.add(cap);
        const bands = body as THREE.Mesh; bands.scale.set(s0, s0, s0); grp.add(bands);
        body = grp;
      }
      // unit → hazard size, in the hazard frame (x across, y up, z along f)
      if (meta.shape === 'box') body.scale.set(s1, s2, s0);
      else if (meta.shape === 'sphere') body.scale.setScalar(s0);
      else if (capsule) { if (kitProp) body.scale.set(s0, s1, s0); }
      else body.scale.set(s0, meta.kind === 'geyser' ? 1 : s1, s0);
      (body as THREE.Mesh).castShadow = meta.kind !== 'geyser';
      root.add(body);
      if (glow) {
        if (meta.kind === 'geyser') glow.scale.set(s0 * 0.9, s1, s0 * 0.9);
        else glow.scale.copy(body.scale);
        root.add(glow);
      }
      const ring = new THREE.Mesh(ringGeo, MaterialLibrary.ringDecal('#FFC857'));
      ring.userData['fxColor'] = new THREE.Color('#FFC857');
      const rr = meta.shape === 'box' ? Math.max(s0, s1) * 0.6 : s0 * 1.25;
      ring.scale.setScalar(rr); ring.position.y = 0.05; ring.visible = false;
      root.add(ring);
      // swinger arm: a rod from the bob to the pivot (+u for vertical swings: u is up at rest; −f for a flat sweep)
      const mo = def?.motion;
      const flat = mo?.plane === 'flat';
      let arm: THREE.Mesh | null = null, armLen = 0;
      if (capsule && mo) {
        armLen = mo.arm ?? 5;
        arm = new THREE.Mesh(cylUnit(), MaterialLibrary.vertexLit(0.4, 0.6));
        if (flat) { arm.rotation.x = Math.PI / 2; arm.position.z = -armLen / 2; arm.scale.set(0.12, armLen, 0.12); }
        else { arm.position.y = armLen / 2; arm.scale.set(0.12, armLen, 0.12); } // u points from the bob to the pivot
        root.add(arm);
      }
      this.root.add(root);
      this.list.push({ meta, root, body, glow, ring, arm, armLen, flat, capsule, wasActive: false, wasTele: false, lastPhase: -1, hornT: 2 + meta.id * 1.7 });
    }
  }

  get count(): number { return this.list.length; }

  /** Poses every hazard at `tick + alpha` and adds telegraph / active particles. */
  update(tick: number, alpha: number, dt: number, sparks: GpuParticles, smoke: GpuParticles): void {
    this.t += dt;
    const A = this.a, B = this.b, f = this.f, u = this.u, s = this.s, p = this.p;
    for (let i = 0; i < this.list.length; i++) {
      const h = this.list[i]!;
      this.track.hazardPose(h.meta.id, tick, A);
      this.track.hazardPose(h.meta.id, tick + 1, B);
      // interpolate unless the hazard wrapped (traffic lane restart, a train parking)
      const dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z;
      const k = dx * dx + dy * dy + dz * dz > 64 ? 0 : alpha;
      p.set(A.x + dx * k, A.y + dy * k, A.z + dz * k);
      f.set((A.fx ?? 0) + ((B.fx ?? 0) - (A.fx ?? 0)) * k, (A.fy ?? 0) + ((B.fy ?? 0) - (A.fy ?? 0)) * k, (A.fz ?? 1) + ((B.fz ?? 1) - (A.fz ?? 1)) * k);
      u.set((A.ux ?? 0) + ((B.ux ?? 0) - (A.ux ?? 0)) * k, (A.uy ?? 1) + ((B.uy ?? 1) - (A.uy ?? 1)) * k, (A.uz ?? 0) + ((B.uz ?? 0) - (A.uz ?? 0)) * k);
      if (f.lengthSq() < 1e-8) f.set(0, 0, 1);
      if (u.lengthSq() < 1e-8) u.set(0, 1, 0);
      u.normalize(); s.crossVectors(u, f).normalize(); f.crossVectors(s, u).normalize();
      const tele = A.telegraph === 1, active = A.active === 1;
      // press: shake while telegraphing
      if (tele && h.meta.kind === 'press') p.addScaledVector(s, Math.sin(this.t * 60) * 0.06);
      this.m.makeBasis(s, u, f).setPosition(p);
      h.root.matrix.copy(this.m);
      h.root.matrixWorldNeedsUpdate = true;
      // parked trains are far off the road: skip drawing them when not active or telegraphing
      h.root.visible = h.meta.kind !== 'train' || active || tele;
      h.ring.visible = tele && h.meta.kind !== 'traffic' && h.meta.kind !== 'train';
      if (h.ring.visible) {
        const beat = 0.5 + 0.5 * Math.sin(this.t * 14);
        (h.ring.userData['fxColor'] as THREE.Color).setRGB(1, 0.55 + 0.25 * beat, 0.2).multiplyScalar(0.7 + 0.8 * beat);
      }
      if (h.glow) {
        if (h.meta.kind === 'geyser') h.glow.visible = active;
        else if (h.meta.kind === 'train') h.glow.visible = !tele || Math.sin(this.t * 12) > 0; // lights blink on approach
      }
      if (h.meta.kind === 'geyser') {
        const r = h.meta.size[0], top = h.meta.size[1];
        if (active) {
          const n = smoke.rate(26, dt);
          for (let q = 0; q < n; q++) smoke.spawn(p.x + (Math.random() - 0.5) * r, p.y + top * (0.3 + Math.random() * 0.7), p.z + (Math.random() - 0.5) * r, (Math.random() - 0.5) * 2, 3 + Math.random() * 3, (Math.random() - 0.5) * 2, 1.1, 0.95, 0.97, 1, STEAM);
        } else if (tele) {
          const n = smoke.rate(8, dt);
          for (let q = 0; q < n; q++) smoke.spawn(p.x + (Math.random() - 0.5) * r, p.y + 0.3, p.z + (Math.random() - 0.5) * r, 0, 1.2, 0, 0.9, 0.92, 0.94, 0.96, WISP);
        }
      } else if (h.meta.kind === 'press' && active && !h.wasActive) {
        // the slam: sparks and grit along the plate edge
        const m = sparks.burst(22, 6);
        for (let q = 0; q < m; q++) sparks.spawn(p.x + s.x * (Math.random() - 0.5) * h.meta.size[1], p.y + 0.2, p.z + s.z * (Math.random() - 0.5) * h.meta.size[1], (Math.random() - 0.5) * 6, 2 + Math.random() * 3, (Math.random() - 0.5) * 6, 0.35, 1, 0.75, 0.4, SPARK);
      }
      this.cues(h, tele, active, A.phase ?? 0, dt, p);
      h.wasActive = active; h.wasTele = tele;
    }
  }

  /** Sound cues on state edges: telegraph pings, geyser roar, press slam, train horn, swinger whoosh, traffic horns. */
  private cues(h: Haz, tele: boolean, active: boolean, phase: number, dt: number, at: THREE.Vector3): void {
    const cue = this.onCue;
    if (!cue) { h.lastPhase = phase; return; }
    const k = h.meta.kind;
    if (tele && !h.wasTele) cue(k === 'train' ? 'haz.train' : 'haz.telegraph', at);
    if (active && !h.wasActive && (k === 'geyser' || k === 'press')) cue(k === 'geyser' ? 'haz.geyser' : 'haz.press', at);
    if (k === 'swinger' && h.lastPhase >= 0) {
      // fastest at phase 0 and 0.5 for a pendulum (once per turn for a flat sweeper)
      const wrapped = phase < h.lastPhase;
      if (wrapped || (!h.flat && h.lastPhase < 0.5 && phase >= 0.5)) cue('haz.swinger', at);
    }
    if (k === 'traffic') { h.hornT -= dt; if (h.hornT <= 0) { h.hornT = 6 + ((h.meta.id * 7919) % 50) / 10; cue('haz.traffic_horn', at); } }
    h.lastPhase = phase;
  }

  dispose(): void { this.root.removeFromParent(); }
}

let unitCyl: THREE.BufferGeometry | null = null;
/** Unit cylinder (radius 1, height 1, centred): scaled into rods and arms. */
function cylUnit(): THREE.BufferGeometry { return (unitCyl ??= paint(cyl(1, 1, 1, 8), '#8a8680')); }
