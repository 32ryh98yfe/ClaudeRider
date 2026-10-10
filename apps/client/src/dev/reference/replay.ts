// Pure, tick-addressable reference input. Importable from Node benchmarks without a DOM.
import type { ReferenceClip, ReferenceKey } from '@cr/content/reference-driving.ts';
import { makeInput, copyInput, Phase, Gear, Boost, StartTier, KMH_PER_MPS, quantizeWorld, type InputFrame, type WorldState } from '@cr/sim';
import type { DriveActions } from '../../input/actionFilter.ts';
import { InputTimeline } from '../../input/timeline.ts';

const KEYS: readonly ReferenceKey[] = ['up', 'down', 'left', 'right', 'drift', 'boost'];

export class ReferenceReplay {
  readonly frames: readonly InputFrame[];
  readonly durationTicks: number;
  private readonly neutral = makeInput();

  constructor(clip: ReferenceClip) {
    this.durationTicks = (clip.sourceEndFrame - clip.sourceStartFrame) * 2;
    if (!Number.isInteger(this.durationTicks) || this.durationTicks <= 0 || !clip.keys.length || clip.keys[0]?.frame !== 0) throw new Error('Reference clip requires a nonempty interval and frame-zero keys');
    let prior = -1;
    for (const entry of clip.keys) {
      if (!Number.isInteger(entry.frame) || entry.frame < 0 || entry.frame <= prior || entry.frame * 2 >= this.durationTicks) throw new Error('Reference key frames must be strictly ordered inside the clip');
      prior = entry.frame;
    }
    const timeline = new InputTimeline();
    const raw: DriveActions = { up: false, down: false, left: false, right: false, drift: false, boost: false };
    const frames: InputFrame[] = [];
    let change = 0;
    for (let tick = 0; tick < this.durationTicks; tick++) {

      while (change < clip.keys.length && clip.keys[change]!.frame * 2 === tick) {
        const event = clip.keys[change++]!;
        const presses: string[] = [];
        for (const key of KEYS) {
          const held = event.keys.includes(key);
          if (held && !raw[key]) presses.push(key);
          raw[key] = held;
        }
        timeline.enqueue(raw, tick * 1000 / 60, presses);
      }
      const frame = makeInput();
      timeline.sample((tick + 1) * 1000 / 60, frame);
      frames.push(frame);
    }
    this.frames = frames;
  }

  /** worldTick is the state BEFORE this input is stepped. Calls may repeat or seek backwards. */
  frameAt(worldTick: number, out: InputFrame = makeInput()): InputFrame {
    const frame = this.frames[worldTick] ?? this.neutral;
    copyInput(out, frame);
    return out;
  }
}

export function compileReferenceClip(clip: ReferenceClip): ReferenceReplay { return new ReferenceReplay(clip); }

/** Seed once, before publishing the authority's initial keyframe. Never call during playback. */
export function initializeReferenceWorld(world: WorldState, clip: ReferenceClip, slot = 0): void {
  if (world.tick !== 0) throw new Error('Reference initialization is allowed only at tick zero');
  const kart = world.karts[slot];
  if (!kart?.active) throw new Error('Reference initialization requires an active kart');
  world.phase = Phase.RACING; world.goTick = 0;
  const b = kart.body, speed = clip.initialSpeedKmh / KMH_PER_MPS;
  b.vx = b.fx * speed; b.vy = b.fy * speed; b.vz = b.fz * speed;
  kart.drive.gear = speed > 0 ? Gear.D : Gear.STOP;
  kart.stats.startTier = StartTier.NONE;
  kart.drive.prevThrottle = clip.keys[0]?.keys.includes('up') ? 1 : 0;
  kart.drive.startTicks = clip.initialStartTicks ?? 0;
  kart.drive.boostTicks = clip.initialBoostTicks;
  kart.drive.boostKind = clip.initialBoostTicks > 0 ? Boost.NORMAL : kart.drive.startTicks > 0 ? Boost.START : Boost.NONE;
  kart.drive.boosters = clip.initialBoosters ?? 0;
  quantizeWorld(world);
}
