// Item VFX runtime: render proxies for world.projectiles / world.hazards (pooled per item code, interpolated
// between sim states), status rigs per kart from world.effects + KartStatus, and one-shot bursts for item
// events (use, impact, hazard removal, effect results incl. shield absorbs and "late signal").
import * as THREE from 'three/webgpu';
import { EFFECT_IDS, ITEM_IDS, type ContentTables } from '@cr/content';
import { EFlag, tetherTarget } from '@cr/sim/items/public.ts';
import type { SimEvent, WorldState } from '@cr/sim';
import type { GpuParticles, SpawnOpts } from './gpuParticles.ts';
import type { KartPose } from './driving.ts';
import { itemVfx } from './items/registry.ts';
import type { HazardView, ItemFxCtx, ProjectileView, ProxyInstance } from './items/api.ts';
import { StatusRig, newFlags, clearFlags, applyEffect, type StatusFlags } from './status.ts';

interface Live { id: number; inst: ProxyInstance; code: number; hazard: boolean; frame: number; x: number; y: number; z: number }

const STAR: SpawnOpts = { shape: 2, additive: true, size0: 0.35, size1: 0.1, gravity: -2, drag: 2, emissive: 2.2, spin: 3 };
const PUFF: SpawnOpts = { shape: 5, additive: false, size0: 0.5, size1: 2.2, gravity: 0.4, drag: 2.2, alpha: 0.45 };
const FLASH: SpawnOpts = { shape: 0, additive: true, size0: 1, size1: 2.5, gravity: 0, drag: 2, emissive: 2.6 };
const RING: SpawnOpts = { shape: 3, additive: true, size0: 0.8, size1: 8, gravity: 0, drag: 0.5, emissive: 2 };
const BOLT: SpawnOpts = { shape: 1, additive: true, size0: 0.35, size1: 0.2, gravity: 0, drag: 0, stretch: 0.012, emissive: 4 };

export interface ItemFxHooks { shake(amp: number): void; flash(k: number): void; flicker(sec: number): void; hit(k: number): void }

export class ItemFx {
  readonly root = new THREE.Group();
  private live = new Map<number, Live>();          // projectile id (hazards: −1 − id) → proxy
  private list: Live[] = [];
  private frame = 0;
  private pools = new Map<number, ProxyInstance[]>(); // key = code (+1000 for hazards)
  private rigs: StatusRig[] = [];
  private flags: StatusFlags[] = [];
  private pv: ProjectileView = { id: 0, code: 0, owner: 0, target: 0, phase: 0, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1, spawn: 0, impact: 0, tick: 0 };
  private hv: HazardView = { id: 0, code: 0, owner: 0, x: 0, y: 0, z: 0, radius: 1, arm: 0, expire: 0, tick: 0, armed: true, ox: 0, oy: 0, oz: 0, ax: 1, az: 0, px: 0, py: 0, pz: 0 };
  private v = new THREE.Vector3(); private tether = new THREE.Vector3();
  private col = new THREE.Color();
  private ctx: ItemFxCtx;
  private content: ContentTables | null;
  private kartRoots: THREE.Object3D[];
  private tetherCode = EFFECT_IDS.indexOf('tether_pull') + 1;

  constructor(sparks: GpuParticles, smoke: GpuParticles, kartRoots: THREE.Object3D[], content: ContentTables | null, local: number, hooks: ItemFxHooks) {
    this.root.name = 'itemFx';
    this.content = content; this.kartRoots = kartRoots;
    const col = this.col;
    this.ctx = {
      sparks, smoke, local,
      stars: (at, n, c, sp) => { col.set(c); const m = sparks.burst(n, 3); for (let i = 0; i < m; i++) { const a = Math.random() * 6.283; sparks.spawn(at.x, at.y + 0.8, at.z, Math.cos(a) * 3 * sp, 1 + Math.random() * 3 * sp, Math.sin(a) * 3 * sp, 0.55, col.r, col.g, col.b, STAR); } },
      puff: (at, n, c, sp) => { col.set(c); const m = smoke.burst(n, 2); for (let i = 0; i < m; i++) smoke.spawn(at.x, at.y + 0.4, at.z, (Math.random() - 0.5) * 3 * sp, 0.5 + Math.random(), (Math.random() - 0.5) * 3 * sp, 1.1, col.r, col.g, col.b, PUFF); },
      flash: (at, c, size) => { col.set(c); sparks.spawn(at.x, at.y + 0.8, at.z, 0, 0, 0, 0.16, col.r, col.g, col.b, { ...FLASH, size0: size * 0.5, size1: size }); },
      ring: (at, c, size, life) => { col.set(c); sparks.spawn(at.x, at.y + 0.4, at.z, 0, 0, 0, life, col.r, col.g, col.b, { ...RING, size1: size }); },
      shake: (a) => hooks.shake(a), postFlash: (k) => hooks.flash(k), flicker: (s) => hooks.flicker(s),
    };
    for (let i = 0; i < kartRoots.length; i++) { const r = new StatusRig(); kartRoots[i]!.add(r.root); this.rigs.push(r); this.flags.push(newFlags()); }
    this.hooks = hooks;
  }
  private hooks: ItemFxHooks;

  private acquire(code: number, hazard: boolean): ProxyInstance | null {
    const key = code + (hazard ? 1000 : 0);
    const pool = this.pools.get(key);
    if (pool && pool.length) { const p = pool.pop()!; p.root.visible = true; return p; }
    const def = itemVfx(code, this.content);
    const make = hazard ? def.hazard : def.projectile;
    if (!make) return null;
    const inst = make();
    this.root.add(inst.root);
    return inst;
  }
  /** Builds one hidden proxy per item (projectile and hazard forms) so their shaders compile during loading. */
  prewarm(): void {
    this.rigs[0]?.prewarm();
    for (let code = 1; code <= ITEM_IDS.length; code++) {
      for (let h = 0; h < 2; h++) {
        const inst = this.acquire(code, h === 1);
        if (!inst) continue;
        inst.root.visible = false;
        const key = code + h * 1000;
        let pool = this.pools.get(key); if (!pool) { pool = []; this.pools.set(key, pool); }
        pool.push(inst);
      }
    }
  }
  private release(index: number): void {
    const l = this.list[index]!;
    l.inst.root.visible = false;
    const key = l.code + (l.hazard ? 1000 : 0);
    let pool = this.pools.get(key); if (!pool) { pool = []; this.pools.set(key, pool); }
    pool.push(l.inst);
    this.live.delete(l.id);
    this.list[index] = this.list[this.list.length - 1]!; this.list.pop();
  }

  update(prev: Readonly<WorldState>, curr: Readonly<WorldState>, alpha: number, poses: readonly KartPose[], dt: number, t: number): void {
    const frame = ++this.frame;
    // ---- projectiles (interpolated by id)
    const P = curr.projectiles;
    for (let i = 0; i < P.length; i++) {
      const c = P[i]!;
      let a = c;
      for (let j = 0; j < prev.projectiles.length; j++) if (prev.projectiles[j]!.id === c.id) { a = prev.projectiles[j]!; break; }
      const v = this.pv;
      v.id = c.id; v.code = c.code; v.owner = c.owner; v.target = c.target; v.phase = c.phase; v.spawn = c.spawn; v.impact = c.impact; v.tick = curr.tick;
      v.x = a.px + (c.px - a.px) * alpha; v.y = a.py + (c.py - a.py) * alpha; v.z = a.pz + (c.pz - a.pz) * alpha;
      let dx = c.px - a.px, dy = c.py - a.py, dz = c.pz - a.pz;
      let len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const own = poses[c.owner];
      if (len < 1e-4 && own) { dx = own.fwd.x; dy = own.fwd.y; dz = own.fwd.z; len = 1; }
      v.dx = len > 1e-4 ? dx / len : 0; v.dy = len > 1e-4 ? dy / len : 0; v.dz = len > 1e-4 ? dz / len : 1;
      let l = this.live.get(c.id);
      if (!l) { const inst = this.acquire(c.code, false); if (!inst) continue; l = { id: c.id, inst, code: c.code, hazard: false, frame, x: v.x, y: v.y, z: v.z }; this.live.set(c.id, l); this.list.push(l); }
      l.frame = frame; l.x = v.x; l.y = v.y; l.z = v.z;
      l.inst.update(v, dt, t);
      itemVfx(c.code, this.content).trail?.(this.ctx, v, dt);
    }
    // ---- hazards
    const H = curr.hazards;
    for (let i = 0; i < H.length; i++) {
      const h = H[i]!;
      const id = -1 - h.id; // keep hazard ids apart from projectile ids
      const v = this.hv;
      v.id = h.id; v.code = h.code; v.owner = h.owner; v.x = h.px; v.y = h.py; v.z = h.pz; v.radius = h.radius; v.arm = h.arm; v.expire = h.expire; v.tick = curr.tick; v.armed = curr.tick >= h.arm;
      v.px = h.px; v.py = h.py; v.pz = h.pz;
      const own = poses[h.owner];
      if (own) { v.ox = own.pos.x; v.oy = own.pos.y; v.oz = own.pos.z; } else { v.ox = h.px; v.oy = h.py; v.oz = h.pz; }
      // across-road direction: a sibling from the same drop (same owner, code and arm tick), else ⟂ owner heading
      let ax = 0, az = 0;
      for (let j = 0; j < H.length; j++) {
        const o = H[j]!;
        if (o.id === h.id || o.code !== h.code || o.owner !== h.owner || o.arm !== h.arm) continue;
        ax = o.px - h.px; az = o.pz - h.pz; if (ax < 0 || (ax === 0 && az < 0)) { ax = -ax; az = -az; }
        break;
      }
      if (ax === 0 && az === 0 && own) { ax = own.fwd.z; az = -own.fwd.x; }
      const al = Math.sqrt(ax * ax + az * az);
      if (al > 1e-6) { v.ax = ax / al; v.az = az / al; } else { v.ax = 1; v.az = 0; }
      let l = this.live.get(id);
      if (!l) {
        const inst = this.acquire(h.code, true);
        l = { id, inst: inst ?? { root: new THREE.Object3D(), update() { /* particles only */ } }, code: h.code, hazard: true, frame, x: h.px, y: h.py, z: h.pz };
        if (!inst) this.root.add(l.inst.root);
        this.live.set(id, l); this.list.push(l);
      }
      l.frame = frame;
      l.inst.update(v, dt, t);
      itemVfx(h.code, this.content).hazardFx?.(this.ctx, v, dt);
    }
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i]!.frame !== frame) this.release(i);
    // ---- status rigs from active effects (plus the kart's own shield/halo timers)
    for (let s = 0; s < this.flags.length; s++) {
      const f = this.flags[s]!; clearFlags(f);
      const k = curr.karts[s];
      if (!k || !k.active) continue;
      if (k.status.shieldUntil > curr.tick) f.shield = true;
      if (k.status.haloUntil > curr.tick) f.halo = true;
      if (k.status.cc) applyEffect(f, k.status.cc, -1);
    }
    const E = curr.effects;
    for (let i = 0; i < E.length; i++) {
      const e = E[i]!;
      const f = this.flags[e.victim];
      if (!f || (e.flags & EFlag.DEAD)) continue;
      if (e.start > curr.tick) {
        // committed but not yet resolved (projectile or bolt in flight): telegraph on the victim
        if (!(e.flags & EFlag.RESOLVED)) { const left = e.start - curr.tick; f.incoming = f.incoming > 0 ? Math.min(f.incoming, left) : left; }
        continue;
      }
      if (e.end <= curr.tick) continue;
      applyEffect(f, e.code, e.code === this.tetherCode ? tetherTarget(e) : e.source);
    }
    for (let s = 0; s < this.rigs.length; s++) {
      const p = poses[s], f = this.flags[s]!;
      if (!p || !p.visible) { this.rigs[s]!.root.visible = false; continue; }
      this.rigs[s]!.root.visible = true;
      let tp: THREE.Vector3 | null = null;
      if (f.tetherFrom >= 0 && poses[f.tetherFrom]) tp = this.tether.copy(poses[f.tetherFrom]!.pos);
      this.rigs[s]!.update(f, p, dt, this.ctx.sparks, this.ctx.smoke, tp);
    }
  }

  event(e: SimEvent, pose: (slot: number) => KartPose | null): void {
    const fx = this.ctx;
    switch (e.t) {
      case 'itemUse': itemVfx(e.item, this.content).use?.(fx, pose(e.kart)); break;
      case 'itemFizzle': { const p = pose(e.kart); if (p) fx.puff(p.pos, 4, '#8a8680', 0.6); break; }
      case 'projImpact': case 'hazardRemove': {
        const id = e.t === 'projImpact' ? e.obj : -1 - e.obj;
        const l = this.live.get(id);
        if (l) itemVfx(e.item, this.content).impact?.(fx, this.v.set(l.x, l.y, l.z));
        break;
      }
      case 'effect': {
        const p = pose(e.victim); if (!p) break;
        const name = EFFECT_IDS[e.effect - 1];
        const local = e.victim === fx.local;
        if (e.result === 'shielded') { fx.stars(p.pos, 14, '#7DE2FC', 1.6); fx.flash(p.pos, '#DFF8FF', 2.6); if (local) this.hooks.flash(0.5); break; }
        if (e.result === 'hit_late_input') { fx.stars(p.pos, 18, '#7DE2FC', 2.2); fx.ring(p.pos, '#E5484D', 4, 0.35); break; }
        if (e.result !== 'hit') { if (e.result === 'immune' || e.result === 'immune_grace') fx.ring(p.pos, '#FAF9F5', 3, 0.3); break; }
        if (name === 'stun') {
          // lightning column from the sky onto the victim
          for (let i = 0; i < 6; i++) fx.sparks.spawn(p.pos.x + (Math.random() - 0.5) * 0.4, p.pos.y + 6 + i * 2, p.pos.z + (Math.random() - 0.5) * 0.4, 0, -60, 0, 0.12, 0.75, 0.9, 1, BOLT);
          fx.flash(p.pos, '#bfe6ff', 4);
        } else if (name === 'spin' || name === 'airborne') { fx.stars(p.pos, 12, '#FFD23F', 1.6); fx.flash(p.pos, '#ffb36a', 2.5); }
        else if (name === 'trap_bomb' || name === 'trap_bug') fx.flash(p.pos, name === 'trap_bomb' ? '#FFC857' : '#7BD88F', 3);
        else if (name === 'firewall_hit') fx.puff(p.pos, 8, '#c9553a', 2);
        if (local && (name === 'stun' || name === 'spin' || name === 'airborne' || name === 'trap_bomb' || name === 'trap_bug' || name === 'firewall_hit')) { this.hooks.hit(0.8); this.hooks.shake(0.12); }
        break;
      }
      case 'effectEnd': {
        const name = EFFECT_IDS[e.effect - 1];
        const p = pose(e.victim); if (!p) break;
        if (name === 'trap_bomb' || name === 'trap_bug') { fx.stars(p.pos, 12, '#FAF9F5', 1.8); fx.puff(p.pos, 6, '#bff4ff', 1.2); }
        break;
      }
      case 'mash': { const p = pose(e.kart); if (p) fx.stars(p.pos, 2, '#FAF9F5', 0.8); break; }
      case 'escape': {
        // mash-out finished: a fast escape gets the gold burst that matches the "fast escape" callout
        const p = pose(e.kart); if (!p) break;
        if (e.fast) { fx.ring(p.pos, '#FFD23F', 7, 0.4); fx.stars(p.pos, 20, '#FFD23F', 2.4); fx.flash(p.pos, '#fff1b8', 3); }
        else fx.stars(p.pos, 8, '#FAF9F5', 1.4);
        break;
      }
      default: break;
    }
  }

  dispose(): void {
    for (const l of this.list) l.inst.dispose?.();
    for (const r of this.rigs) r.dispose();
    this.root.removeFromParent();
  }
}
