// Driving VFX (30-art-bible §10.1): drift sparks by gauge tier, tyre smoke tinted by surface, skid marks, boost
// flames with afterburn, instant/start/pad boost bursts, double-drift flare, wall sparks, bump stars, landing dust,
// surface kicks (grass, dirt, sand, snow, wet spray), draft wind, respawn sparkles, GO ring, finish confetti,
// item-box shatter. Continuous effects read kart state every frame; one-shots come from de-duplicated SimEvents.
import * as THREE from 'three/webgpu';
import { SURFACE_BY_CODE } from '@cr/content';
import { Boost, type KartState, type SimEvent } from '@cr/sim';
import { GpuParticles, Shape, type SpawnOpts } from './gpuParticles.ts';
import { SkidMarks } from './skids.ts';
import { FlameSystem, type FlameSlot } from './flames.ts';

/** Interpolated kart pose shared with the renderer (all unit vectors). */
export interface KartPose { pos: THREE.Vector3; fwd: THREE.Vector3; up: THREE.Vector3; left: THREE.Vector3; speed: number; lat: number; visible: boolean }

const o = (shape: SpawnOpts['shape'], additive: boolean, size0: number, size1: number, gravity: number, drag: number, extra: Partial<SpawnOpts> = {}): SpawnOpts => ({ shape, additive, size0, size1, gravity, drag, ...extra });
const SPARK = o(Shape.SPARK, true, 0.05, 0.018, -9, 1.4, { stretch: 0.035, emissive: 2.6 });
const SPARK_BIG = o(Shape.SPARK, true, 0.07, 0.02, -12, 1.0, { stretch: 0.03, emissive: 3 });
const GLOW = o(Shape.SOFT, true, 0.45, 0.1, 0, 3, { emissive: 1.8 });
const FLASH = o(Shape.SOFT, true, 1.4, 3.2, 0, 2, { emissive: 2.4 });
const SMOKE = o(Shape.SMOKE, false, 0.35, 2.0, 0.7, 2.2, { alpha: 0.45 });
const DUST = o(Shape.SMOKE, false, 0.5, 2.4, 0.2, 2.6, { alpha: 0.5 });
const CHIP = o(Shape.SQUARE, false, 0.09, 0.05, -14, 0.6, { spin: 9, alpha: 1 });
const STAR = o(Shape.STAR, true, 0.35, 0.1, -2, 2, { emissive: 2.2, spin: 3 });
const RING = o(Shape.RING, true, 0.8, 9, 0, 0.5, { emissive: 2 });
const CONFETTI = o(Shape.SQUARE, false, 0.16, 0.12, -3.5, 1.2, { spin: 7, alpha: 1 });
const STREAK = o(Shape.SPARK, true, 0.03, 0.02, 0, 0.2, { stretch: 0.02, emissive: 0.4 });
const SNOW = o(Shape.SMOKE, false, 0.3, 1.6, 0.2, 2.6, { alpha: 0.6 });
const WET = o(Shape.SMOKE, false, 0.15, 0.9, -6, 2.2, { alpha: 0.35 });
const EMBER = o(Shape.SOFT, true, 0.12, 0.02, 1, 3, { emissive: 1.8 });
const LAND_DUST = o(Shape.SMOKE, false, 0.4, 2.0, 0.2, 2.6, { alpha: 0.45 });

const C = (h: string): THREE.Color => new THREE.Color(h);
const CONFETTI_GOLD = ['#FFD23F', '#FFC857', '#FAF9F5', '#D97757'].map(C);
const CONFETTI_MIX = ['#FAF9F5', '#6A9BCC', '#D97757', '#7BD88F', '#B57CFF'].map(C);
/** Mascot emote cues (rig `onFx`): palette and particle family per cue name. */
const EMOTE_FX: Record<string, { cols: THREE.Color[]; kind: 'glow' | 'chips' | 'puff' | 'snow' }> = {
  confetti: { cols: CONFETTI_MIX, kind: 'chips' }, coins: { cols: ['#FFC857', '#E8A93A', '#FFE29A'].map(C), kind: 'chips' },
  sparkle: { cols: ['#fff6e0', '#FFD23F'].map(C), kind: 'glow' }, stars: { cols: ['#FFD23F', '#fff1b8'].map(C), kind: 'glow' },
  hearts: { cols: ['#ff6f91', '#ff9eb5'].map(C), kind: 'glow' }, glitch: { cols: ['#6af0ff', '#ff4fd8', '#b57cff'].map(C), kind: 'glow' },
  smoke: { cols: ['#9a9590'].map(C), kind: 'puff' }, steam: { cols: ['#f4f4f2'].map(C), kind: 'puff' }, snow: { cols: ['#ffffff', '#dff0ff'].map(C), kind: 'snow' },
};
const EMOTE_DEFAULT = EMOTE_FX['sparkle']!;
/** Drift-spark tiers: white (0–29 ticks), coral #D97757 (30–59), violet #B57CFF (≥ 60 or gauge completed). */
export const SPARK_TIERS = [C('#fff6e0'), C('#ff8f5e'), C('#b57cff')];
const SPARK_GLOW = [C('#ffe9b8'), C('#d97757'), C('#9a5cff')];

interface SurfaceLook { smoke: THREE.Color; skid: THREE.Color; skidA: number; kick: 'none' | 'grass' | 'dirt' | 'sand' | 'snow' | 'wet' | 'gravel' | 'lava'; smokeA: number; smokeOpt: SpawnOpts; dustOpt: SpawnOpts }
const S = (smoke: string, skid: string, skidA: number, kick: SurfaceLook['kick'], smokeA = 0.42): SurfaceLook =>
  ({ smoke: C(smoke), skid: C(skid), skidA, kick, smokeA, smokeOpt: { ...SMOKE, alpha: smokeA }, dustOpt: { ...DUST, alpha: smokeA } });
const HARD = S('#d9d4cc', '#18181a', 0.5, 'none');
const SURF: Record<string, SurfaceLook> = {
  asphalt: HARD, stone: HARD, cobble: HARD, metal: S('#d8dce2', '#202226', 0.4, 'none'), wood: S('#d9cdbd', '#2a2018', 0.4, 'none'),
  glass: S('#e8f4ff', '#40505a', 0.25, 'none'), rail: HARD, basalt: S('#b8aaa0', '#141010', 0.5, 'none'), obsidian: HARD,
  boost_pad: HARD, jump_pad: HARD, conveyor_fwd: HARD, conveyor_back: HARD,
  dirt: S('#a88a68', '#4a3526', 0.45, 'dirt', 0.5), gravel: S('#b0a494', '#4a4238', 0.4, 'gravel', 0.45),
  sand: S('#E8C27A', '#a8823f', 0.35, 'sand', 0.55), grass: S('#b9c9a0', '#34502a', 0.35, 'grass', 0.3),
  snow: S('#f7fbff', '#b8cadc', 0.45, 'snow', 0.6), ice: S('#e8f6ff', '#ffffff', 0.22, 'snow', 0.35),
  wet: S('#dfefff', '#10141a', 0.15, 'wet', 0.35), lava: S('#ff9a5a', '#301008', 0.3, 'lava', 0.3),
};
function surfaceLook(code: number): SurfaceLook { const d = SURFACE_BY_CODE[code]; return (d && SURF[d.id]) || HARD; }

interface KartFx { flame: FlameSlot; tier: number; gaugeTierBoost: boolean; wasGrounded: boolean; air: number; surf: number }

export class DrivingFx {
  readonly sparks: GpuParticles;   // short-lived additive: sparks, glows, stars, rings
  readonly smoke: GpuParticles;    // longer-lived alpha: smoke, dust, chips, confetti
  readonly skids: SkidMarks;
  readonly flames: FlameSystem;
  private fx: KartFx[] = [];
  private t = 0;
  private v = new THREE.Vector3(); private w = new THREE.Vector3();
  budget: number;

  constructor(nKarts: number, budget: number) {
    this.budget = budget;
    this.sparks = new GpuParticles(4096 * budget, 'sparks');
    this.smoke = new GpuParticles(1536 * budget, 'smoke');
    this.sparks.budget = this.smoke.budget = Math.max(0.35, budget);
    this.skids = new SkidMarks(4000 * Math.max(0.25, budget));
    this.flames = new FlameSystem(nKarts * 3);
    for (let i = 0; i < nKarts; i++) this.fx.push({ flame: { exhausts: [], k: 0, kind: 0, after: 0, custom: null }, tier: 0, gaugeTierBoost: false, wasGrounded: true, air: 0, surf: 0 });
  }

  objects(): THREE.Object3D[] { return [this.skids.mesh, this.smoke.mesh, this.sparks.mesh, this.flames.mesh]; }

  setExhausts(i: number, ex: THREE.Object3D[], custom: [string, string] | null = null): void {
    const f = this.fx[i]!.flame;
    f.exhausts = ex;
    f.custom = custom ? [C(custom[0]), C(custom[1])] : null;
  }

  begin(dt: number): void { this.t += dt; this.flames.begin(); }

  /** Continuous per-kart effects. `near` = within skid/smoke detail range of the camera. */
  kart(i: number, p: KartPose, k: Readonly<KartState>, dt: number, near: boolean): void {
    const f = this.fx[i]!;
    const d = k.drive, b = k.body;
    const kind = d.boostTicks > 0 ? (d.boostKind || Boost.NORMAL) : d.startTicks > 0 ? Boost.START : d.instTicks > 0 ? Boost.INSTANT : 0;
    if (p.visible) this.flames.kart(f.flame, kind, p.speed, dt, this.t + i * 1.7);
    if (!p.visible) return;
    const grounded = b.grounded === 1;
    if (grounded) f.surf = b.surf;
    const surf = surfaceLook(b.surf);
    // rear contact points
    const rx = p.pos.x - p.fwd.x * 0.55, ry = p.pos.y + 0.05, rz = p.pos.z - p.fwd.z * 0.55;
    const drifting = d.drift === 1 && grounded && p.speed > 8;
    if (drifting) {
      const tier = d.driftTicks < 30 ? 0 : d.driftTicks < 60 && !f.gaugeTierBoost ? 1 : 2;
      f.tier = tier;
      const col = SPARK_TIERS[tier]!, glow = SPARK_GLOW[tier]!;
      const hard = surf.kick === 'none';
      const nSpark = hard ? this.sparks.rate(near ? 140 : 50, dt) : 0;
      for (let n = 0; n < nSpark; n++) {
        const side = n & 1 ? 0.55 : -0.55;
        const wx = rx + p.left.x * side, wz = rz + p.left.z * side;
        const up = 1.5 + Math.random() * 2.6, back = 3 + Math.random() * 3, lat = (Math.random() - 0.5) * 3 + side * 1.2;
        this.sparks.spawn(wx, ry, wz, -p.fwd.x * back + p.left.x * lat + p.up.x * up, p.up.y * up, -p.fwd.z * back + p.left.z * lat + p.up.z * up,
          0.25 + Math.random() * 0.2, col.r, col.g, col.b, SPARK);
      }
      if (hard && this.sparks.rate(near ? 30 : 10, dt) > 0) {
        for (const side of [-0.55, 0.55]) this.sparks.spawn(rx + p.left.x * side, ry + 0.03, rz + p.left.z * side, 0, 0, 0, 0.1, glow.r, glow.g, glow.b, GLOW);
      }
      if (near) {
        const nSmoke = this.smoke.rate(26, dt);
        for (let n = 0; n < nSmoke; n++) {
          const side = n & 1 ? 0.55 : -0.55;
          this.smoke.spawn(rx + p.left.x * side, ry + 0.12, rz + p.left.z * side, -p.fwd.x * 2 + (Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 0.4, -p.fwd.z * 2 + (Math.random() - 0.5) * 1.2,
            0.8 + Math.random() * 0.7, surf.smoke.r, surf.smoke.g, surf.smoke.b, surf.smokeOpt);
        }
        const a = surf.skidA * Math.min(1, p.speed / 15);
        for (let wh = 0; wh < 2; wh++) {
          const side = wh ? 0.55 : -0.55;
          this.skids.add(i * 4 + wh, rx + p.left.x * side, p.pos.y, rz + p.left.z * side, p.left.x, p.left.y, p.left.z, 0.2, a, surf.skid.r, surf.skid.g, surf.skid.b);
        }
      }
    } else {
      this.skids.lift(i * 4); this.skids.lift(i * 4 + 1);
      f.gaugeTierBoost = false;
    }
    // surface kicks when off the hard road at speed
    if (grounded && near && p.speed > 6 && surf.kick !== 'none') {
      const n = this.smoke.rate(surf.kick === 'wet' ? 30 : 16 * Math.min(1.6, p.speed / 20), dt);
      for (let q = 0; q < n; q++) {
        const side = q & 1 ? 0.55 : -0.55;
        const x = rx + p.left.x * side, z = rz + p.left.z * side;
        const vx = -p.fwd.x * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2, vz = -p.fwd.z * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2;
        switch (surf.kick) {
          case 'grass': this.smoke.spawn(x, ry + 0.1, z, vx, 2 + Math.random() * 2, vz, 0.6, 0.35 + Math.random() * 0.15, 0.55 + Math.random() * 0.2, 0.22, CHIP); break;
          case 'dirt': case 'gravel':
            this.smoke.spawn(x, ry + 0.1, z, vx * 0.6, 1.2, vz * 0.6, 0.9, surf.smoke.r, surf.smoke.g, surf.smoke.b, surf.dustOpt);
            if (q % 3 === 0) this.smoke.spawn(x, ry + 0.1, z, vx, 3, vz, 0.5, 0.35, 0.28, 0.2, CHIP);
            break;
          case 'sand': this.smoke.spawn(x, ry + 0.1, z, vx * 0.7, 1.4, vz * 0.7, 1.3, surf.smoke.r, surf.smoke.g, surf.smoke.b, surf.dustOpt); break;
          case 'snow': this.smoke.spawn(x, ry + 0.15, z, vx * 0.8, 1.8, vz * 0.8, 1.0, 0.97, 0.98, 1, SNOW); break;
          case 'wet': this.smoke.spawn(x, ry + 0.1, z, vx * 1.2, 1.6 + Math.random(), vz * 1.2, 0.45, 0.85, 0.92, 1, WET); break;
          case 'lava': this.sparks.spawn(x, ry + 0.1, z, vx * 0.3, 2 + Math.random() * 2, vz * 0.3, 0.7, 1, 0.45, 0.15, EMBER); break;
        }
      }
    }
    // draft: wind streaks sliding past the kart while charging
    if (d.draftCharge > 0 && near) {
      const n = this.sparks.rate(24, dt);
      for (let q = 0; q < n; q++) {
        const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * 0.8;
        this.w.copy(p.left).multiplyScalar(Math.cos(a) * r).addScaledVector(p.up, 0.6 + Math.sin(a) * r * 0.6);
        this.sparks.spawn(p.pos.x + this.w.x + p.fwd.x * 2.5, p.pos.y + this.w.y, p.pos.z + this.w.z + p.fwd.z * 2.5,
          -p.fwd.x * 14, 0, -p.fwd.z * 14, 0.28, 0.9, 0.97, 1, STREAK);
      }
    }
    // airborne trail marker for landing size
    f.air = grounded ? 0 : f.air + dt;
    f.wasGrounded = grounded;
  }

  /** One-shot bursts from sim events. `pose(i)` returns a kart pose (or null). */
  event(e: SimEvent, pose: (slot: number) => KartPose | null, local: number): void {
    switch (e.t) {
      case 'gaugeFull': { const f = this.fx[e.kart]; if (f) f.gaugeTierBoost = true; const p = pose(e.kart); if (p && e.kart === local) this.burstStars(p.pos, 10, SPARK_TIERS[2]!, 1.2); break; }
      case 'doubleDrift': {
        const p = pose(e.kart); if (!p) break;
        const col = SPARK_TIERS[Math.min(2, (this.fx[e.kart]?.tier ?? 0) + 1)]!;
        const n = this.sparks.burst(18, 6);
        for (let q = 0; q < n; q++) {
          const a = (q / n) * Math.PI * 2;
          this.v.copy(p.left).multiplyScalar(Math.cos(a) * 5).addScaledVector(p.fwd, Math.sin(a) * 5).addScaledVector(p.up, 1.5);
          this.sparks.spawn(p.pos.x, p.pos.y + 0.2, p.pos.z, this.v.x, this.v.y, this.v.z, 0.35, col.r, col.g, col.b, SPARK_BIG);
        }
        break;
      }
      case 'instantBoost': {
        const p = pose(e.kart); if (!p) break;
        this.exhaustPuff(p, 0.85, 1, 1, 10);
        break;
      }
      case 'startBoost': {
        if (e.tier === 'none' || e.tier === 'false') {
          const p = pose(e.kart); if (p && e.tier === 'false') this.smokeBurst(p.pos, 10, HARD.smoke, 1.2);
          break;
        }
        const p = pose(e.kart); if (!p) break;
        this.sparks.spawn(p.pos.x, p.pos.y + 0.3, p.pos.z, 0, 0, 0, 0.45, 1, 0.95, 0.77, { ...RING, size0: 0.6, size1: e.tier === 'perfect' ? 9 : 6 });
        this.burstStars(p.pos, e.tier === 'perfect' ? 16 : 8, C('#FFC857'), 1.6);
        this.exhaustPuff(p, 1, 0.95, 0.77, 8);
        break;
      }
      case 'boostStart': {
        const p = pose(e.kart); if (!p) break;
        if (e.kind === Boost.PAD) this.exhaustPuff(p, 0.24, 0.9, 0.78, 8);
        else if (e.kind === Boost.TEAM) this.burstStars(p.pos, 10, C('#2ACAFF'), 1.4);
        else if (e.kind === Boost.ITEM) this.burstStars(p.pos, 8, C('#D97757'), 1.2);
        else this.exhaustPuff(p, 1, 0.82, 0.25, 6);
        break;
      }
      case 'boostEnd': {
        const p = pose(e.kart); if (!p) break;
        const n = this.smoke.burst(5, 2);
        for (let q = 0; q < n; q++) this.smoke.spawn(p.pos.x - p.fwd.x * 1.1, p.pos.y + 0.4, p.pos.z - p.fwd.z * 1.1, -p.fwd.x * 2 + (Math.random() - 0.5), 0.8, -p.fwd.z * 2 + (Math.random() - 0.5), 0.9, 0.6, 0.6, 0.62, { ...SMOKE, alpha: 0.35 });
        break;
      }
      case 'wall': {
        const sev = e.severity;
        const n = this.sparks.burst(sev === 0 ? 3 : sev === 1 ? 20 : 60, sev === 0 ? 1 : 6);
        const p = pose(e.kart);
        for (let q = 0; q < n; q++) {
          const sp = (sev === 2 ? 9 : 6) * (0.4 + Math.random());
          const vx = (Math.random() - 0.5) * sp + (p ? p.fwd.x * e.speed * 0.25 : 0), vz = (Math.random() - 0.5) * sp + (p ? p.fwd.z * e.speed * 0.25 : 0);
          this.sparks.spawn(e.x, e.y + 0.4, e.z, vx, 2 + Math.random() * 4, vz, 0.3 + Math.random() * 0.25, 1, 0.8 + Math.random() * 0.2, 0.5, SPARK_BIG);
        }
        if (sev >= 1) {
          this.sparks.spawn(e.x, e.y + 0.5, e.z, 0, 0, 0, 0.12, 1, 0.85, 0.6, { ...FLASH, size0: sev === 2 ? 2.2 : 1.2, size1: sev === 2 ? 3.4 : 2 });
          this.smokeBurst(this.v.set(e.x, e.y, e.z), sev === 2 ? 8 : 4, HARD.smoke, 1.2);
        }
        if (sev === 2) { const m = this.smoke.burst(14, 5); for (let q = 0; q < m; q++) this.smoke.spawn(e.x, e.y + 0.5, e.z, (Math.random() - 0.5) * 8, 3 + Math.random() * 4, (Math.random() - 0.5) * 8, 1, 0.75, 0.73, 0.7, CHIP); }
        break;
      }
      case 'bump': {
        const a = pose(e.a), b = pose(e.b); if (!a || !b) break;
        this.v.copy(a.pos).add(b.pos).multiplyScalar(0.5);
        const k = Math.min(1, e.impulse / 12);
        this.burstStars(this.v, Math.round(4 + k * 8), C('#FFD23F'), 0.8 + k);
        this.sparks.spawn(this.v.x, this.v.y + 0.6, this.v.z, 0, 0, 0, 0.1, 1, 0.95, 0.8, { ...FLASH, size0: 0.8 + k, size1: 1.6 + k });
        break;
      }
      case 'land': {
        const p = pose(e.kart); if (!p || e.impact < 2) break;
        const k = Math.min(1, e.impact / 12);
        const surf = surfaceLook(this.fx[e.kart]?.surf ?? 0);
        const n = this.smoke.burst(8 + k * 14, 5);
        for (let q = 0; q < n; q++) {
          const a = (q / n) * Math.PI * 2 + Math.random() * 0.3;
          const sp = 2.5 + k * 3;
          this.v.copy(p.left).multiplyScalar(Math.cos(a) * sp).addScaledVector(p.fwd, Math.sin(a) * sp);
          this.smoke.spawn(p.pos.x, p.pos.y + 0.1, p.pos.z, this.v.x, 0.4, this.v.z, 0.7 + k * 0.5, surf.smoke.r, surf.smoke.g, surf.smoke.b, LAND_DUST);
        }
        break;
      }
      case 'respawn': {
        const p = pose(e.kart); if (!p) break;
        const n = this.sparks.burst(24, 8);
        for (let q = 0; q < n; q++) {
          const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 1.1, h = Math.random() * 1.4;
          const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
          if (e.phase === 'out') this.sparks.spawn(p.pos.x + ox, p.pos.y + h, p.pos.z + oz, ox * 0.6, 1.8 + Math.random() * 2, oz * 0.6, 0.6, 1, 1, 1, STAR);
          else this.sparks.spawn(p.pos.x + ox * 3, p.pos.y + h + 1.5, p.pos.z + oz * 3, -ox * 4, -2, -oz * 4, 0.45, 1, 0.95, 0.85, STAR);
        }
        break;
      }
      default: break;
    }
  }

  /** GO: additive expanding ring at the start line. */
  goRing(at: THREE.Vector3): void {
    this.sparks.spawn(at.x, at.y + 1.2, at.z, 0, 0, 0, 0.7, 1, 0.95, 0.8, { ...RING, size0: 2, size1: 36 });
    this.sparks.spawn(at.x, at.y + 1.2, at.z, 0, 0, 0, 0.25, 1, 0.9, 0.7, { ...FLASH, size0: 4, size1: 10 });
  }

  /** Finish confetti from the arch; gold-heavy for a 1st place. */
  confetti(at: THREE.Vector3, gold: boolean, width = 14): void {
    const cols = gold ? CONFETTI_GOLD : CONFETTI_MIX;
    const n = this.smoke.burst(90, 30);
    for (let q = 0; q < n; q++) {
      const c = cols[q % cols.length]!;
      const x = at.x + (Math.random() - 0.5) * width, z = at.z + (Math.random() - 0.5) * 3;
      this.smoke.spawn(x, at.y + 6 + Math.random(), z, (Math.random() - 0.5) * 5, 2 + Math.random() * 5, (Math.random() - 0.5) * 5, 2.4 + Math.random(), c.r, c.g, c.b, CONFETTI);
    }
  }

  /** Item-box shatter into coral/ivory sparkles and shards. */
  boxShatter(at: THREE.Vector3): void {
    const n = this.sparks.burst(14, 6);
    for (let q = 0; q < n; q++) {
      const c = q & 1 ? SPARK_TIERS[1]! : SPARK_TIERS[0]!;
      this.sparks.spawn(at.x, at.y, at.z, (Math.random() - 0.5) * 7, Math.random() * 5, (Math.random() - 0.5) * 7, 0.45, c.r, c.g, c.b, STAR);
    }
    const m = this.smoke.burst(8, 4);
    for (let q = 0; q < m; q++) this.smoke.spawn(at.x, at.y, at.z, (Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6, 0.8, 0.98, 0.97, 0.96, { ...CHIP, size0: 0.18, size1: 0.1 });
    this.sparks.spawn(at.x, at.y, at.z, 0, 0, 0, 0.14, 1, 0.8, 0.7, { ...FLASH, size0: 1.2, size1: 2.4 });
  }

  /** Emote cue from a mascot's `onFx` hook (anchor world position): a small burst above the head. */
  emoteFx(name: string, at: THREE.Vector3): void {
    const d = EMOTE_FX[name] ?? EMOTE_DEFAULT;
    const pool = d.kind === 'glow' ? this.sparks : this.smoke;
    const n = pool.burst(d.kind === 'glow' ? 14 : 12, 4);
    for (let q = 0; q < n; q++) {
      const c = d.cols[q % d.cols.length]!;
      const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 1.4;
      const vx = Math.cos(a) * r, vz = Math.sin(a) * r;
      if (d.kind === 'glow') pool.spawn(at.x, at.y + 0.2, at.z, vx, 1.5 + Math.random() * 2, vz, 0.7, c.r, c.g, c.b, STAR);
      else if (d.kind === 'chips') pool.spawn(at.x, at.y + 0.3, at.z, vx * 1.5, 2.5 + Math.random() * 2.5, vz * 1.5, 1.2, c.r, c.g, c.b, CONFETTI);
      else pool.spawn(at.x, at.y + 0.1, at.z, vx * 0.6, 0.6 + Math.random(), vz * 0.6, 1.3, c.r, c.g, c.b, d.kind === 'snow' ? SNOW : SMOKE);
    }
  }

  burstStars(at: THREE.Vector3, n: number, c: THREE.Color, sp: number): void {
    const m = this.sparks.burst(n, 3);
    for (let q = 0; q < m; q++) {
      const a = Math.random() * Math.PI * 2;
      this.sparks.spawn(at.x, at.y + 0.8, at.z, Math.cos(a) * 3 * sp, 1 + Math.random() * 3 * sp, Math.sin(a) * 3 * sp, 0.5, c.r, c.g, c.b, STAR);
    }
  }

  smokeBurst(at: THREE.Vector3, n: number, c: THREE.Color, sp: number): void {
    const m = this.smoke.burst(n, 2);
    for (let q = 0; q < m; q++) this.smoke.spawn(at.x, at.y + 0.3, at.z, (Math.random() - 0.5) * 3 * sp, 0.6 + Math.random(), (Math.random() - 0.5) * 3 * sp, 1.1, c.r, c.g, c.b, SMOKE);
  }

  private exhaustPuff(p: KartPose, r: number, g: number, b: number, n: number): void {
    const x = p.pos.x - p.fwd.x * 1.0, y = p.pos.y + 0.4, z = p.pos.z - p.fwd.z * 1.0;
    const m = this.sparks.burst(n, 3);
    for (let q = 0; q < m; q++) this.sparks.spawn(x, y, z, -p.fwd.x * (4 + Math.random() * 3) + (Math.random() - 0.5) * 2, (Math.random() - 0.3) * 2, -p.fwd.z * (4 + Math.random() * 3) + (Math.random() - 0.5) * 2, 0.3, r, g, b, { ...GLOW, size0: 0.6, size1: 0.15 });
    this.sparks.spawn(x, y, z, 0, 0, 0, 0.12, r, g, b, { ...FLASH, size0: 0.9, size1: 1.8 });
  }

  end(): void { this.flames.end(); this.sparks.flush(); this.smoke.flush(); this.skids.flush(); }

  dispose(): void { this.sparks.dispose(); this.smoke.dispose(); this.skids.dispose(); this.flames.dispose(); }
}
