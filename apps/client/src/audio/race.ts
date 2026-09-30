// Race audio hooks called by game/Session (lane L11 owns everything behind these three functions).
import type { ModeId } from '@cr/content';
import { Phase, type InputFrame, type SimEvent, type WorldState } from '@cr/sim';
import { Audio } from './engine.ts';

export function raceAudioStart(mode: ModeId): void {
  Audio.startEngine();
  Audio.playLoop(mode === 'item' ? 128 : 136, 57, 'race');
}

export function raceAudioStop(): void {
  Audio.stopEngine();
  Audio.stopLoop();
}

/** Once per rendered frame, after the sim steps. */
export function raceAudioFrame(w: Readonly<WorldState>, me: number, inp: Readonly<InputFrame>): void {
  const k = w.karts[me]!;
  const sp = Math.hypot(k.body.vx, k.body.vy, k.body.vz);
  const u = k.body.vx * k.body.fx + k.body.vy * k.body.fy + k.body.vz * k.body.fz;
  const slip = k.drive.drift && sp > 5 ? Math.abs(1 - Math.abs(u) / sp) * 2 : 0;
  Audio.updateEngine(Math.min(1, sp / 44), w.phase < Phase.RACING ? (inp.throttle > 0 ? 0.6 : 0) : inp.throttle / 15, k.drive.boostTicks > 0 || k.drive.startTicks > 0, slip);
}

/** Every cosmetic sim event (already de-duplicated by the caller). */
export function raceAudioEvent(e: SimEvent, me: number): void {
  switch (e.t) {
    case 'countdown': Audio.sfx(e.n === 0 ? 'go' : 'countdown'); break;
    case 'boostStart': if (e.kart === me) Audio.sfx('boost'); break;
    case 'instantBoost': if (e.kart === me) Audio.sfx('instant'); break;
    case 'startBoost': if (e.kart === me && e.tier === 'perfect') Audio.sfx('perfectStart'); break;
    case 'gaugeFull': if (e.kart === me) Audio.sfx('gauge'); break;
    case 'wall': if (e.kart === me && e.severity > 0) Audio.sfx('wall'); break;
    case 'bump': if (e.a === me || e.b === me) Audio.sfx('bump'); break;
    case 'lap': if (e.kart === me) Audio.sfx('lap'); break;
    case 'finalLap': if (e.kart === me) Audio.sfx('finalLap'); break;
    case 'finish': if (e.kart === me) Audio.sfx('finish'); break;
    case 'wrongWay': if (e.kart === me && e.on) Audio.sfx('wrongWay'); break;
    default: break;
  }
}
