import { hashWorld, KMH_PER_MPS, type InputFrame, type SimEvent, type WorldState } from '@cr/sim';
import type { ReferenceClip } from '@cr/content/reference-driving.ts';

export interface ReferenceTick {
  tick: number; sourceFrame: number; speedKmh: number; forwardMps: number; lateralMps: number;
  /** Nose heading minus travel heading, matching the headless report and camera convention. */
  slipRadians: number; yawRate: number;
  drift: number; boostTicks: number; startTicks: number; boostKind: number; gauge: number; boosters: number; wallContact: number;
  position: number[]; velocity: number[]; forward: number[]; input: InputFrame; events: SimEvent[]; hash: number;
}
export interface ReferenceFrame {
  frame: number; tick: number; sourceFrame: number; dt: number; alpha: number; wallTimeMs: number; cameraProfile: string;
  cameraPosition: number[]; cameraQuaternion: number[]; fov: number; aspect: number;
}

/** Dev-only collector: allocation is intentional and bounded by the clip's duration. */
export class ReferenceTelemetry {
  readonly ticks: ReferenceTick[] = [];
  readonly frames: ReferenceFrame[] = [];
  readonly clip: ReferenceClip;
  fixture: { resource: string; hash: string } | null = null;
  readonly mode: 'deterministic-render-replay' | 'real-time-replay';
  constructor(clip: ReferenceClip, capture: boolean) { this.clip = clip; this.mode = capture ? 'deterministic-render-replay' : 'real-time-replay'; }

  recordTick(world: Readonly<WorldState>, input: InputFrame, events: readonly SimEvent[], slot = 0): void {
    if (world.tick > (this.clip.sourceEndFrame - this.clip.sourceStartFrame) * 2) return;
    const kart = world.karts[slot]!, b = kart.body, d = kart.drive;
    const lx = b.ny * b.fz - b.nz * b.fy, ly = b.nz * b.fx - b.nx * b.fz, lz = b.nx * b.fy - b.ny * b.fx;
    const forward = b.vx * b.fx + b.vy * b.fy + b.vz * b.fz, lateral = b.vx * lx + b.vy * ly + b.vz * lz;
    this.ticks.push({ tick: world.tick, sourceFrame: this.clip.sourceStartFrame + world.tick / 2,
      speedKmh: Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz) * KMH_PER_MPS,
      forwardMps: forward, lateralMps: lateral, slipRadians: Math.atan2(-lateral, forward), yawRate: b.yawRate,
      drift: d.drift, boostTicks: d.boostTicks, startTicks: d.startTicks, boostKind: d.boostKind, gauge: d.gauge, boosters: d.boosters, wallContact: b.wallContact,
      position: [b.px, b.py, b.pz], velocity: [b.vx, b.vy, b.vz], forward: [b.fx, b.fy, b.fz], input: { ...input }, events: events.map((e) => ({ ...e })), hash: hashWorld(world),
    });
  }
}
