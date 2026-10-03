// DOM-free driving input. Keyboard events and reference playback share this filter and edge map.
import { Edge, Held, type InputFrame } from '@cr/sim';

export interface DriveActions {
  up: boolean; down: boolean; left: boolean; right: boolean; drift: boolean; boost: boolean;
  look?: boolean; analogSteer?: number; analogThrottle?: number; analogBrake?: number;
}

export function actionPressEdge(action: string): number {
  switch (action) {
    case 'drift': return Edge.DRIFT;
    case 'boost': case 'item': return Edge.USE_ITEM;
    case 'swap': return Edge.SWAP;
    case 'reset': return Edge.RESPAWN;
    case 'left': return Edge.TAP_L;
    case 'right': return Edge.TAP_R;
    case 'emote1': case 'emote2': case 'emote3': case 'emote4': return Edge.EMOTE;
    default: return 0;
  }
}

export class InputActionFilter {
  private steer = 0;
  private at = 0;

  reset(now = 0): void { this.steer = 0; this.at = now; }

  /** Call before changing the held actions, then at each sample, including between rendered frames. */
  advance(actions: Readonly<DriveActions>, now: number): number {
    const elapsedMs = Math.max(0, now - this.at);
    this.at = Math.max(this.at, now);
    const target = Number(actions.right) - Number(actions.left);
    const analog = actions.analogSteer ?? 0;
    if (analog === 0) this.steer += (target - this.steer) * (1 - Math.pow(0.4, elapsedMs * 60 / 1000));
    else this.steer = analog;
    return this.steer;
  }

  sample(actions: Readonly<DriveActions>, now: number, edges: number, out: InputFrame, autoBoost = false, emote = 0): void {
    out.steer = Math.round(Math.max(-1, Math.min(1, this.advance(actions, now))) * 127);
    out.throttle = actions.up ? 15 : pedal(actions.analogThrottle ?? 0);
    out.brake = actions.down ? 15 : pedal(actions.analogBrake ?? 0);
    out.held = (actions.drift ? Held.DRIFT : 0) | (actions.look ? Held.LOOK_BACK : 0) | (autoBoost && actions.boost ? Held.ITEM : 0);
    out.edges = edges; out.aim = 255; out.emote = emote;
  }
}

function pedal(value: number): number { return value > 0.1 ? Math.min(15, Math.max(1, Math.round(value * 15))) : 0; }
