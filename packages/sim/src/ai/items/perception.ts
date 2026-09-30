// What a bot may perceive about items (14-ai-spec §6): only public world state — projectiles, scheduled effects,
// hazards, positions. Never the secret key, other racers' pending rolls or authority-only state.
import type { ContentTables } from '@cr/content';
import type { KartState, RaceConfig, WorldState } from '../../core/state.ts';
import { DT } from '../../core/units.ts';
import type { BakedTrack } from '../../track/BakedTrack.ts';
import { EF, EFlag, itemDef } from '../../items/codes.ts';
import { projectileEta } from '../../items/projectiles.ts';
import { tetherTarget } from '../../items/effect-behaviors/tether.ts';
import { inRace, sameTeam, type CfgCtx } from '../../items/team.ts';

/** Everything a bot's item logic reads besides the world (a StepContext satisfies it). */
export interface ItemEnv extends CfgCtx {
  readonly track: BakedTrack;
  readonly content: ContentTables;
  readonly cfg: Readonly<Pick<RaceConfig, 'teams' | 'rules' | 'laps'>>;
}

/** Incoming warnings start at ETA ≤ 120 ticks (HUD and bots alike, gap-4 §8). */
export const PERCEIVE_ETA = 120;

/**
 * Smallest ETA (ticks) of a perceivable, shield-blockable threat to kart `k`: homing projectiles, telegraphed
 * effects (bolt, mirror, mutex), a Token Bomb landing within 8 m of where the kart will be, a puddle right ahead.
 * Returns 1e9 when nothing is perceived.
 */
export function blockableThreatEta(w: Readonly<WorldState>, env: ItemEnv, k: Readonly<KartState>): number {
  let best = 1e9;
  const tick = w.tick;
  for (const p of w.projectiles) {
    if (p.target !== k.slot) continue;
    const def = itemDef(env.content, p.code);
    if (!def || def.blockedBy.length === 0) continue;
    const eta = projectileEta(w, env, p);
    if (eta <= PERCEIVE_ETA && eta < best) best = eta;
  }
  for (const e of w.effects) {
    if (e.victim !== k.slot || e.source === k.slot || (e.flags & EFlag.RESOLVED) !== 0 || (e.flags & EFlag.BLOCKABLE) === 0) continue;
    const eta = e.start - tick;
    if (eta >= 0 && eta < best) best = eta;
  }
  const b = k.body;
  const bomb = env.content.items.byId.get('token_bomb')?.code ?? -1;
  const puddle = env.content.items.byId.get('glitch_puddle')?.code ?? -1;
  for (const h of w.hazards) {
    if (h.code === bomb) {
      const eta = h.arm - tick;
      if (eta < 0 || eta > PERCEIVE_ETA) continue;
      const x = b.px + b.vx * eta * DT - h.px, z = b.pz + b.vz * eta * DT - h.pz;
      if (x * x + z * z <= 64 && eta < best) best = eta;
    } else if (h.code === puddle && tick >= h.arm) {
      const dx = h.px - b.px, dz = h.pz - b.pz;
      const along = dx * b.fx + dz * b.fz;
      const lat2 = dx * dx + dz * dz - along * along;
      const v = Math.hypot(b.vx, b.vz);
      if (along > 0 && along < 25 && lat2 < 4 && v > 1) { const eta = along / (v * DT); if (eta < best) best = eta; }
    }
  }
  return best;
}

const mine = (w: Readonly<WorldState>, env: ItemEnv, k: Readonly<KartState>, slot: number): boolean => slot === k.slot || sameTeam(env, k, w.karts[slot]!);

/** Drone or tether pressure on `k` (or its teammates for drones): the Interrupt Pulse triggers. */
export function droneOrTetherThreat(w: Readonly<WorldState>, env: ItemEnv, k: Readonly<KartState>): boolean {
  const drone = env.content.items.byId.get('throttle_drone')?.code ?? -1;
  for (const p of w.projectiles) if (p.code === drone && mine(w, env, k, p.target)) return true;
  for (const e of w.effects) {
    if ((e.flags & EFlag.DEAD) !== 0) continue;
    if (e.code === EF.throttle && mine(w, env, k, e.victim)) return true;
    if (e.code === EF.tether_pull && tetherTarget(e) === k.slot && !sameTeam(env, k, w.karts[e.victim]!) && e.victim !== k.slot) return true;
  }
  return false;
}

/** Is any teammate (or `k`) facing a blockable threat? (Alignment Halo.) */
export function teamThreat(w: Readonly<WorldState>, env: ItemEnv, k: Readonly<KartState>): boolean {
  for (const o of w.karts) {
    if (!inRace(o) || (o.slot !== k.slot && !sameTeam(env, k, o))) continue;
    if (blockableThreatEta(w, env, o) <= PERCEIVE_ETA) return true;
  }
  return false;
}
