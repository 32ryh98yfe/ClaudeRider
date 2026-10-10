// Ordered raw input transitions consumed at fixed physics boundaries. Render frequency never changes the stream.
import { appendDriftRequest, driftRequestCount, Edge, type InputFrame } from '@cr/sim';
import { actionPressEdge, InputActionFilter, type DriveActions } from './actionFilter.ts';

export interface InputTransition { at: number; seq: number; actions: DriveActions; presses: readonly string[]; emote: number }
export interface InputTrace { kind: 'raw' | 'tick'; at: number; seq: number; presses?: readonly string[]; actions?: DriveActions; input?: InputFrame }
const neutral = (): DriveActions => ({ up: false, down: false, left: false, right: false, drift: false, boost: false });

export class InputTimeline {
  private readonly filter = new InputActionFilter();
  private events: InputTransition[] = [];
  private head = 0;
  private sequence = 0;
  private appliedSequence = 0;
  private at = 0;
  private lastEventAt = 0;
  private raw: DriveActions = neutral();
  private winner = 0;
  private drift: number[] = [];
  private driftHead = 0;
  trace: ((entry: InputTrace) => void) | undefined;

  reset(now = 0): void {
    this.events.length = 0; this.head = 0; this.drift.length = 0; this.driftHead = 0;
    this.at = now; this.lastEventAt = now; this.raw = neutral(); this.winner = 0; this.appliedSequence = this.sequence; this.filter.reset(now);
  }

  /** `presses` contains non-repeat physical key downs, in browser delivery order. */
  enqueue(actions: Readonly<DriveActions>, at: number, presses: readonly string[] = [], emote = 0): void {
    const event: InputTransition = { at: Math.max(this.lastEventAt, at), seq: ++this.sequence, actions: { ...actions }, presses: [...presses], emote };
    this.lastEventAt = event.at;
    this.events.push(event);
    this.trace?.({ kind: 'raw', at: event.at, seq: event.seq, presses: event.presses, actions: { ...event.actions } });
  }

  /** A transition exactly on the boundary belongs to the next tick. Late arrivals are applied at the next available tick. */
  sample(until: number, out: InputFrame, autoBoost = false): void {
    let edges = 0, emote = 0, throttleTap = false, brakeTap = false;
    while (this.head < this.events.length && this.events[this.head]!.at < until - 1e-7) {
      const e = this.events[this.head++]!;
      this.appliedSequence = e.seq;
      this.filter.advance(this.raw, Math.max(this.at, e.at));
      this.raw = e.actions;
      for (const press of e.presses) {
        edges |= actionPressEdge(press);
        if (press === 'left') this.winner = -1;
        if (press === 'right') this.winner = 1;
      }
      if (!this.raw.left && !this.raw.right) this.winner = 0;
      else if (!this.raw.left) this.winner = 1;
      else if (!this.raw.right) this.winner = -1;
      this.raw.digitalSteer = this.winner;
      for (const press of e.presses) {
        if (press === 'drift') this.drift.push(this.winner || Math.sign(this.raw.analogSteer ?? 0));
        if (press === 'up' || press === 'accel') throttleTap = true;
        if (press === 'down' || press === 'brake') brakeTap = true;
      }
      emote = e.emote || emote;
    }
    this.filter.sample(this.raw, until, edges, out, autoBoost, emote);
    if (throttleTap) out.throttle = 15;
    if (brakeTap) out.brake = 15;
    out.driftRequests = 0;
    while (this.driftHead < this.drift.length && driftRequestCount(out.driftRequests) < 4) {
      out.driftRequests = appendDriftRequest(out.driftRequests, this.drift[this.driftHead++]!);
    }
    if (out.driftRequests) out.edges |= Edge.DRIFT;
    this.at = Math.max(this.at, until);
    if (this.head === this.events.length) { this.events.length = 0; this.head = 0; }
    if (this.driftHead === this.drift.length) { this.drift.length = 0; this.driftHead = 0; }
    this.trace?.({ kind: 'tick', at: until, seq: this.appliedSequence, input: { ...out } });
  }
}
