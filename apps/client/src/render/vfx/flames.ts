// Boost flames (30-art-bible §10.1): one InstancedMesh for every exhaust of every kart (1 draw call).
// Kinds: normal (gauge), team, start, item (Turbo Token), pad, instant; plus a pilot flicker at speed and an
// afterburn tail when a boost ends. Two nested cones (core + outer) in one geometry; colours per instance.
import * as THREE from 'three/webgpu';
import { attribute, uv, time, float, vec3, mix, smoothstep, sin, clamp } from 'three/tsl';
import { Boost } from '@cr/sim';
import { MaterialLibrary } from '../materials/library.ts';
import { setEmissive, vnoise } from '../materials/tsl.ts';

type N = any;

/** Flame colours per boost kind (core → edge). Team colours are never customizable (§10.1). */
export const FLAME_COLORS: Record<number, [string, string, number, number]> = {
  // kind: [core, edge, length m, width]
  [Boost.NORMAL]: ['#FFD23F', '#FF5A36', 1.25, 1.0],
  [Boost.TEAM]: ['#2ACAFF', '#8A5CFF', 1.55, 1.15],
  [Boost.START]: ['#FFF3C4', '#FFC857', 1.0, 1.05],
  [Boost.ITEM]: ['#FFB08F', '#D97757', 1.35, 1.05],
  [Boost.INSTANT]: ['#F2FFFF', '#7DE2FC', 0.75, 0.9],
  [Boost.PAD]: ['#B8FFF0', '#3EE6C8', 1.15, 1.0],
};
const PILOT: [string, string] = ['#9fd3ff', '#ff8a4a'];

function flameGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [rb, rt, layer] of [[0.14, 0.02, 1], [0.08, 0.01, 0]] as const) {
    const g = new THREE.CylinderGeometry(rt, rb, 1, 12, 5, true);
    g.translate(0, 0.5, 0); g.rotateX(-Math.PI / 2);          // nozzle at z = 0, tip at z = −1; uv.y 0 → 1 along
    const n = g.attributes.position!.count;
    g.setAttribute('flameLayer', new THREE.BufferAttribute(new Float32Array(n).fill(layer), 1));
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  const out = new THREE.BufferGeometry();
  let total = 0; for (const p of parts) total += p.attributes.position!.count;
  for (const name of ['position', 'uv', 'flameLayer'] as const) {
    const size = parts[0]!.attributes[name]!.itemSize;
    const arr = new Float32Array(total * size);
    let o = 0; for (const p of parts) { arr.set(p.attributes[name]!.array as Float32Array, o); o += p.attributes[name]!.array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

function flameMaterial(): THREE.MeshBasicNodeMaterial {
  return MaterialLibrary.custom('flameInstanced', () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const core = attribute('iCore', 'vec3'), edge = attribute('iEdge', 'vec3'), heat = attribute('iHeat', 'float');
    const layer = attribute('flameLayer', 'float');
    const U = uv();
    const along = U.y;
    const flick = sin(time.mul(43).add(along.mul(14)).add(heat.mul(9))).mul(0.12).add(0.88);
    const n = vnoise(vec3(U.x.mul(4), along.mul(5).sub(time.mul(11)), heat.mul(3)));
    const c: N = mix(core, edge, smoothstep(0.05, 0.8, along).add(layer.mul(0.35)).clamp(0, 1));
    const body = float(1).sub(along).mul(smoothstep(0.0, 0.05, along).mul(0.6).add(0.4));
    const a = body.mul(n.mul(0.7).add(0.45)).mul(flick).mul(mix(float(1.25), float(0.7), layer)).clamp(0, 1);
    const col = c.mul(clamp(heat, 0, 2)).mul(2.4);
    m.colorNode = col;
    m.opacityNode = a;
    setEmissive(m, col.mul(1.4));
    return m;
  });
}

export interface FlameSlot { exhausts: THREE.Object3D[]; k: number; kind: number; after: number; custom: [THREE.Color, THREE.Color] | null }

export class FlameSystem {
  readonly mesh: THREE.InstancedMesh;
  private core: THREE.InstancedBufferAttribute; private edge: THREE.InstancedBufferAttribute; private heat: THREE.InstancedBufferAttribute;
  private colors = new Map<number, [THREE.Color, THREE.Color]>();
  private pilot: [THREE.Color, THREE.Color] = [new THREE.Color(PILOT[0]), new THREE.Color(PILOT[1])];
  private m4 = new THREE.Matrix4(); private s4 = new THREE.Matrix4(); private used = 0;

  constructor(max: number) {
    const g = flameGeometry();
    this.core = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.core.setUsage(THREE.DynamicDrawUsage);
    this.edge = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.edge.setUsage(THREE.DynamicDrawUsage);
    this.heat = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); this.heat.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iCore', this.core); g.setAttribute('iEdge', this.edge); g.setAttribute('iHeat', this.heat);
    this.mesh = new THREE.InstancedMesh(g, flameMaterial(), max);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 4; this.mesh.name = 'flames';
    for (const [k, v] of Object.entries(FLAME_COLORS)) this.colors.set(Number(k), [new THREE.Color(v[0]), new THREE.Color(v[1])]);
  }

  begin(): void { this.used = 0; }

  /**
   * Adds this kart's flames. `target` = boost kind (0 = none, pilot flicker at speed), `speed` in m/s.
   * Eases `slot.k` (flame scale) and keeps an afterburn tail for 0.35 s after the boost ends.
   */
  kart(slot: FlameSlot, kind: number, speed: number, dt: number, t: number): void {
    const def = FLAME_COLORS[kind];
    if (kind !== 0) { slot.kind = kind; slot.after = 0.35; }
    else if (slot.after > 0) slot.after -= dt;
    const active = kind !== 0;
    const len = def ? def[2] : 0;
    const target = active ? len : slot.after > 0 ? FLAME_COLORS[slot.kind]![2] * 0.35 * (slot.after / 0.35) : speed > 6 ? 0.16 : 0;
    const rate = active ? 16 : 7;
    slot.k += (target - slot.k) * Math.min(1, dt * rate);
    if (slot.k < 0.02) return;
    const cols = active || slot.after > 0 ? (slot.kind === Boost.NORMAL && slot.custom ? slot.custom : this.colors.get(slot.kind)!) : this.pilot;
    const width = (def ? def[3] : 0.8) * (0.9 + Math.min(0.3, slot.k * 0.15));
    for (let e = 0; e < slot.exhausts.length; e++) {
      const i = this.used;
      if (i >= this.mesh.instanceMatrix.count) return;
      const ex = slot.exhausts[e]!;
      ex.updateWorldMatrix(true, false);
      const wob = 1 + Math.sin(t * 57 + e * 2.1 + i) * 0.06 + Math.sin(t * 31 + i * 1.7) * 0.05;
      this.s4.makeScale(width * wob, width * wob, slot.k * wob);
      this.mesh.setMatrixAt(i, this.m4.multiplyMatrices(ex.matrixWorld, this.s4));
      const heat = active ? 1 : slot.after > 0 ? 0.6 : 0.45;
      cols[0].toArray(this.core.array, i * 3); cols[1].toArray(this.edge.array, i * 3);
      (this.heat.array as Float32Array)[i] = heat;
      this.used++;
    }
  }

  end(): void {
    this.mesh.count = this.used;
    if (this.used > 0) { this.mesh.instanceMatrix.needsUpdate = true; this.core.needsUpdate = true; this.edge.needsUpdate = true; this.heat.needsUpdate = true; }
  }

  dispose(): void { this.mesh.geometry.dispose(); }
}
