// Scheduled Conditional Effects (ADR-007, 12-items-spec §6, 20-netcode-spec §8).
// An effect is a record {id, code, victim, source, start S, end} created at schedule time; at S (phase 2, or at once
// for contact hits) the victim's own state decides the result: shield → halo → grace → hard-CC immunity → pulse guard.
// Hard CC refreshes (never stacks, never shortens) and drives KartStatus.cc; only `throttle` stacks (≤ 3 pairs).
// The list stays sorted by id; removals are deferred (DEAD flag) and compacted, so iteration never skips an entry.
import type { EffectDef } from '@cr/content';
import { Boost, type EffectInstance, type KartState, type WorldState } from '../core/state.ts';
import { V_REF } from '../core/units.ts';
import { neutralMods, type KartMods, type StepContext } from '../api.ts';
import { paramsFor } from '../kart/params.ts';
import { evKey } from '../kart/evkey.ts';
import { EFFECT_BEHAVIORS } from '../generated/effect-behaviors.gen.ts';
import type { EffectBehavior } from './behavior.ts';
import { EF, EFlag, Kin, RESULT_NAME, Res, effectDef, warnOnce } from './codes.ts';
import { authorityOf } from './decisions.ts';
import { inRace } from './team.ts';
import { mix4 } from './ids.ts';

const BEHAVIORS = EFFECT_BEHAVIORS as Readonly<Record<string, EffectBehavior | undefined>>;
export function effectBehavior(def: Readonly<EffectDef> | undefined): EffectBehavior | undefined {
  if (!def?.behavior) return undefined;
  const b = BEHAVIORS[def.behavior];
  if (!b) warnOnce('eb:' + def.behavior, `missing effect behaviour '${def.behavior}' (${def.id})`);
  return b;
}

/** Post-absorb grace and the hard-CC immunity fallback (ADR-010). */
export const SHIELD_GRACE = 18;

// ------------------------------------------------------------------ pool + list maintenance
const POOL: EffectInstance[] = [];
const newInstance = (): EffectInstance => POOL.pop() ?? { id: 0, code: 0, victim: 0, source: 0, start: 0, end: 0, param: 0, flags: 0, result: 0 };

/** Deterministic effect id (R7): derived from the originating object / parent effect, so every peer agrees. */
export const effectId = (seed: number, code: number, victim: number, start: number): number => mix4(seed ^ 0x45ff0000, code, victim, start) || 1;

export function findEffect(w: Readonly<WorldState>, id: number): EffectInstance | undefined {
  for (const e of w.effects) if (e.id === id) return e;
  return undefined;
}

/** Marks an effect for removal (compacted at the end of the phase that killed it). */
export function kill(e: EffectInstance): void { e.flags |= EFlag.DEAD; }

/** Removes DEAD entries in place (order preserved) and returns them to the pool. */
export function compactEffects(w: WorldState): void {
  const L = w.effects;
  let j = 0;
  for (let i = 0; i < L.length; i++) {
    const e = L[i]!;
    if (e.flags & EFlag.DEAD) POOL.push(e);
    else L[j++] = e;
  }
  L.length = j;
}

/**
 * Schedules an effect instance (idempotent by id). `flags` carries BLOCKABLE / HAZARD. Returns the instance, or null if
 * one with the same id exists (re-simulation after a rollback) or the effect is unknown.
 */
export function scheduleEffect(w: WorldState, ctx: StepContext, code: number, victim: number, source: number, start: number, dur: number, param: number, flags: number, seed: number): EffectInstance | null {
  const def = effectDef(ctx.content, code);
  if (!def) { warnOnce('ef:' + code, `missing effect definition code ${code}`); return null; }
  const id = effectId(seed, code, victim, start);
  if (findEffect(w, id)) return null;
  const e = newInstance();
  e.id = id; e.code = code; e.victim = victim; e.source = source; e.start = start; e.end = start + (dur > 0 ? dur : def.durTicks);
  e.param = param | 0; e.flags = flags & (EFlag.BLOCKABLE | EFlag.HAZARD); e.result = 0;
  const L = w.effects;
  L.push(e);
  for (let i = L.length - 1; i > 0 && L[i - 1]!.id > id; i--) { L[i] = L[i - 1]!; L[i - 1] = e; }
  return e;
}

/** Is an effect of `code` active on `victim` at `tick` (resolved hit, start ≤ tick < end, not ended)? */
export function activeEffect(w: Readonly<WorldState>, victim: number, code: number, tick: number): EffectInstance | undefined {
  for (const e of w.effects) {
    if (e.victim !== victim || e.code !== code || (e.flags & (EFlag.RESOLVED | EFlag.DEAD | EFlag.ENDED)) !== EFlag.RESOLVED) continue;
    if (e.start <= tick && tick < e.end) return e;
  }
  return undefined;
}

function driverOf(w: Readonly<WorldState>, victim: number): EffectInstance | undefined {
  for (const e of w.effects) if (e.victim === victim && (e.flags & (EFlag.DRIVER | EFlag.DEAD)) === EFlag.DRIVER) return e;
  return undefined;
}

/** Hard-CC impact speed stored in the driving instance (1/4096 m/s units, integer for the snapshot codec). */
export function ccImpactSpeed(w: Readonly<WorldState>, k: Readonly<KartState>): number {
  const d = driverOf(w, k.slot);
  return d ? d.param / 4096 : 0;
}

/** Tangential (ground-plane) speed of a kart. */
export function planarSpeed(k: Readonly<KartState>): number {
  const b = k.body;
  const vn = b.vx * b.nx + b.vy * b.ny + b.vz * b.nz;
  const x = b.vx - vn * b.nx, y = b.vy - vn * b.ny, z = b.vz - vn * b.nz;
  return Math.sqrt(x * x + y * y + z * z);
}

// ------------------------------------------------------------------ resolution at S
/**
 * Resolves `e` (its start tick is now) on the victim's timeline (12-items-spec §6.2). Returns the result code, or −1 for a
 * miss (victim gone). Non-hits are removed at once; hits are applied (hard CC, stacking, behaviours).
 */
export function resolveEffect(w: WorldState, ctx: StepContext, e: EffectInstance): number {
  const k = w.karts[e.victim];
  const def = effectDef(ctx.content, e.code);
  e.flags |= EFlag.RESOLVED;
  if (!def || !k || !inRace(k)) {
    kill(e);
    report(w, ctx, e, -1);
    return -1;
  }
  const S = e.start, st = k.status;
  let res: number = Res.HIT;
  if ((e.flags & EFlag.BLOCKABLE) !== 0 && (e.flags & EFlag.HAZARD) === 0) {
    if (st.shieldUntil > S) { res = Res.SHIELDED; st.shieldUntil = 0; st.shieldGraceUntil = S + SHIELD_GRACE; endVisual(w, ctx, k, EF.shield); }
    else if (st.haloUntil > S) { res = Res.SHIELDED; st.haloUntil = 0; st.shieldGraceUntil = S + SHIELD_GRACE; endVisual(w, ctx, k, EF.halo); }
    else if (st.shieldGraceUntil > S) res = Res.GRACE;
  }
  if (res === Res.HIT && def.class === 'hardCC' && st.immuneUntil > S) res = Res.IMMUNE;
  if (res === Res.HIT && e.code === EF.throttle && activeEffect(w, k.slot, EF.pulse_guard, S)) res = Res.IMMUNE;
  if (res === Res.HIT && e.code === EF.spin && activeEffect(w, k.slot, EF.overclock, S)) res = Res.IMMUNE;
  e.result = res as 0 | 1 | 2 | 3;
  report(w, ctx, e, res);
  if (res !== Res.HIT) { kill(e); return res; }
  apply(w, ctx, e, def, k);
  return res;
}

function report(w: WorldState, ctx: StepContext, e: EffectInstance, res: number): void {
  const name = res < 0 ? 'miss' : RESULT_NAME[res]!;
  ctx.events.push({ t: 'effect', victim: e.victim, effect: e.code, source: e.source, result: name, tick: w.tick, key: evKey(w.tick, 80, e.victim, e.code | (e.source << 8)) });
  if (e.source === e.victim) return; // self buffs: cosmetic event only
  // item stats count kart attacks only; track hazards (source 255) still get the event and the result decision
  const src = e.source < w.karts.length ? w.karts[e.source] : undefined;
  const v = w.karts[e.victim];
  if (src && v) {
    if (res === Res.HIT) { src.stats.attacksLanded++; v.stats.hitsTaken++; }
    if (res === Res.SHIELDED) v.stats.attacksBlocked++;
  }
  const auth = authorityOf(w, ctx);
  if (auth) auth.emit({ k: 'result', tick: w.tick, eff: e.id, victim: e.victim, result: name });
}

function endVisual(w: WorldState, ctx: StepContext, k: KartState, code: number): void {
  ctx.events.push({ t: 'effectEnd', victim: k.slot, effect: code, tick: w.tick, key: evKey(w.tick, 81, k.slot, code) });
}

function apply(w: WorldState, ctx: StepContext, e: EffectInstance, def: Readonly<EffectDef>, k: KartState): void {
  const beh = effectBehavior(def);
  if (def.class === 'hardCC') { applyHardCC(w, ctx, e, k); beh?.onStart?.(w, e, ctx); return; }
  beh?.onStart?.(w, e, ctx);
  if (beh?.instant) { kill(e); return; }
  if (def.stacking === 'refresh' || def.stacking === 'extend') {
    for (const o of w.effects) {
      if (o === e || o.victim !== e.victim || o.code !== e.code || (o.flags & (EFlag.RESOLVED | EFlag.DEAD | EFlag.ENDED)) !== EFlag.RESOLVED) continue;
      if (o.end <= e.start) continue;
      // refresh: never stacks, never shortens — the running instance keeps its id and takes the later end
      if (e.end > o.end) o.end = e.end;
      kill(e);
      return;
    }
  } else if (def.stacking === 'stackDuration3') {
    // ≤ 3 concurrent (start, end) pairs; a 4th replaces the oldest
    for (;;) {
      let n = 0, oldest: EffectInstance | null = null;
      for (const o of w.effects) {
        if (o === e || o.victim !== e.victim || o.code !== e.code || (o.flags & (EFlag.RESOLVED | EFlag.DEAD | EFlag.ENDED)) !== EFlag.RESOLVED || o.end <= e.start) continue;
        n++;
        if (!oldest || o.start < oldest.start || (o.start === oldest.start && o.id < oldest.id)) oldest = o;
      }
      if (n < 3 || !oldest) break;
      kill(oldest);
    }
  }
}

function applyHardCC(w: WorldState, ctx: StepContext, e: EffectInstance, k: KartState): void {
  const st = k.status, d = k.drive, S = e.start;
  if (st.cc !== 0 && S < st.ccEnd) {
    if (e.end <= st.ccEnd) { kill(e); return; }        // absorbed: the running CC already lasts longer
    const old = driverOf(w, k.slot);
    if (old) kill(old);
  }
  e.flags |= EFlag.DRIVER;
  e.param = Math.round(planarSpeed(k) * 4096);
  st.cc = e.code; st.ccStart = S; st.ccEnd = e.end;
  st.mashCredits = 0; st.lastTapDir = 0; st.lastTapTick = 0;
  // hard CC cancels the active boost and the drift; stored boosters and items are kept (§6.3)
  if (d.boostTicks > 0) ctx.events.push({ t: 'boostEnd', kart: k.slot, kind: d.boostKind, tick: w.tick, key: evKey(w.tick, 91, k.slot, 1) });
  d.boostTicks = 0; d.boostKind = Boost.NONE; d.startTicks = 0; d.instTicks = 0; d.instWindow = 0;
  d.drift = 0; d.driftTicks = 0; d.driftPeak = 0; d.driftDir = 1;
  // a hard CC breaks the kart's own tether pull (no slingshot)
  for (const o of w.effects) if (o.victim === k.slot && o.code === EF.tether_pull && (o.flags & EFlag.RESOLVED) !== 0) o.flags |= EFlag.ENDED;
}

// ------------------------------------------------------------------ phase 2: effects starting now
export function startEffectsNow(w: WorldState, ctx: StepContext): void {
  const L = w.effects, tick = w.tick;
  let dirty = false;
  for (let i = 0; i < L.length; i++) {
    const e = L[i]!;
    if (e.start !== tick || (e.flags & (EFlag.RESOLVED | EFlag.DEAD)) !== 0) continue;
    resolveEffect(w, ctx, e);
    dirty = true;
  }
  if (dirty) compactEffects(w);
}

// ------------------------------------------------------------------ phase 2: modifiers
const CAP = new Float64Array(8), ACC = new Float64Array(8), GAUGE = new Float64Array(8), VT = new Float64Array(8);
const THR = new Int32Array(8), MASK = new Int32Array(8), FLAGS = new Int32Array(8);
const F_INVERT = 1, F_NOITEMS = 2, F_TETHER = 4;

/** Aggregates active effects into ctx.scratch.mods (after the bot vMul / rubber-band multipliers already set). */
export function applyEffectMods(w: WorldState, ctx: StepContext): void {
  const tick = w.tick, K = w.karts, n = K.length;
  for (let i = 0; i < n; i++) { CAP[i] = 99; ACC[i] = 1; GAUGE[i] = 1; VT[i] = 0; THR[i] = 0; MASK[i] = 0; FLAGS[i] = 0; }
  let step = 0.08, base = 0.6;
  for (const e of w.effects) {
    if ((e.flags & (EFlag.RESOLVED | EFlag.DEAD | EFlag.ENDED | EFlag.DRIVER)) !== EFlag.RESOLVED || e.start > tick || tick >= e.end) continue;
    const def = effectDef(ctx.content, e.code);
    const v = e.victim;
    if (!def || v >= n) continue;
    MASK[v]! |= 1 << (e.code - 1);
    const m = def.mods;
    if (m.vCapStep !== undefined) { THR[v]!++; step = m.vCapStep; base = m.vCapMul ?? 1; }
    else if (m.vCapMul !== undefined && m.vCapMul < CAP[v]!) CAP[v] = m.vCapMul;
    if (m.accelMul !== undefined) ACC[v]! *= m.accelMul;
    if (m.gaugeMul !== undefined && m.gaugeMul < GAUGE[v]!) GAUGE[v] = m.gaugeMul;
    if (m.steerInvert) FLAGS[v]! |= F_INVERT;
    if (m.noItems) FLAGS[v]! |= F_NOITEMS;
    if (m.kinematic === 'tether') FLAGS[v]! |= F_TETHER;
    let vt = m.vTarget ?? 0;
    if (m.vTargetKartBoost && K[v]!.active) vt = paramsFor(ctx.content.karts.byCode[K[v]!.spec]!).vBoost;
    if (vt > VT[v]!) VT[v] = vt;
  }
  for (let i = 0; i < n; i++) {
    const k = K[i]!;
    const m: KartMods = ctx.scratch.mods[i] ?? neutralMods({} as KartMods);
    if (!k.active) { k.status.modMask = 0; continue; }
    const st = k.status;
    let mask = MASK[i]!;
    if (st.cc !== 0 && tick >= st.ccStart && tick < st.ccEnd) {
      const def = effectDef(ctx.content, st.cc);
      mask |= 1 << (st.cc - 1);
      m.noControl = true; m.noItems = true;
      const dm = def?.mods;
      if (dm?.vCapMul !== undefined && dm.vCapMul < CAP[i]!) CAP[i] = dm.vCapMul;
      m.kinematic = dm?.kinematic === 'airborne' ? Kin.AIRBORNE : dm?.kinematic === 'trap' ? Kin.TRAP : dm?.kinematic === 'spin' ? Kin.SPIN : Kin.NONE;
    } else if ((FLAGS[i]! & F_TETHER) !== 0) {
      // the tether replaces steering and throttle (kinematic pursuit after dynamics)
      m.noControl = true; m.kinematic = Kin.TETHER;
    }
    if (st.shieldUntil > tick) mask |= 1 << (EF.shield - 1);
    if (st.haloUntil > tick) mask |= 1 << (EF.halo - 1);
    st.modMask = mask;
    if ((FLAGS[i]! & F_INVERT) !== 0) m.steerInvert = true;
    if ((FLAGS[i]! & F_NOITEMS) !== 0) m.noItems = true;
    m.accelMul *= ACC[i]!;
    m.gaugeMul *= GAUGE[i]!;
    const nThr = THR[i]!;
    if (nThr > 0) { const c = base - step * (nThr - 1); if (c < CAP[i]!) CAP[i] = c; }
    const P = paramsFor(ctx.content.karts.byCode[k.spec]!);
    const d = k.drive;
    const boosting = d.boostTicks > 1 || d.startTicks > 1;
    if (VT[i]! > 0) m.vTarget = boosting && P.vBoost > VT[i]! ? P.vBoost : VT[i]!;
    if (CAP[i]! < 99) {
      // effect caps are absolute (vT ← min(vT, cap·V_REF), 10-sim-spec §7.3): fold into the multiplicative vCapMul
      const est = m.vTarget > 0 || boosting ? (m.vTarget > 0 ? m.vTarget : P.vBoost) : P.vGrip;
      const f = (CAP[i]! * V_REF) / est;
      if (f < 1) m.vCapMul *= f;
    }
  }
}

// ------------------------------------------------------------------ phase 8: endings
function scheduleOnEnd(w: WorldState, ctx: StepContext, def: Readonly<EffectDef>, victim: number, at: number, seed: number): void {
  if (!def.onEnd) return;
  for (const a of def.onEnd) {
    const code = EF[a.effect];
    const ne = scheduleEffect(w, ctx, code, victim, victim, at + (a.leadTicks ?? 0), a.durTicks ?? 0, a.param ?? 0, 0, seed);
    if (ne && ne.start <= w.tick) resolveEffect(w, ctx, ne);
  }
}

/** Ends hard CC whose ccEnd has come, and effects whose end has come or that were ended early. */
export function endEffects(w: WorldState, ctx: StepContext): void {
  const next = w.tick + 1;
  for (const k of w.karts) {
    if (!k.active) continue;
    const st = k.status;
    if (st.cc === 0 || st.ccEnd > next) continue;
    const def = effectDef(ctx.content, st.cc);
    const drv = driverOf(w, k.slot);
    const seed = drv ? drv.id : mix4(st.cc, k.slot, st.ccStart, st.ccEnd);
    const end = st.ccEnd;
    st.immuneUntil = end + (def?.immunityAfterTicks ?? 36);
    if (drv) kill(drv);
    ctx.events.push({ t: 'effectEnd', victim: k.slot, effect: st.cc, tick: w.tick, key: evKey(w.tick, 81, k.slot, st.cc) });
    if (def?.mash) {
      const fast = end - st.ccStart <= def.mash.floorTicks;
      ctx.events.push({ t: 'escape', kart: k.slot, effect: st.cc, fast, credits: st.mashCredits, tick: w.tick, key: evKey(w.tick, 92, k.slot) });
    }
    const code = st.cc;
    st.cc = 0; st.ccStart = 0; st.ccEnd = 0; st.mashCredits = 0; st.lastTapDir = 0; st.lastTapTick = 0;
    if (def) scheduleOnEnd(w, ctx, def, k.slot, end, seed ^ code);
  }
  const L = w.effects;
  for (let i = 0; i < L.length; i++) {
    const e = L[i]!;
    if ((e.flags & (EFlag.RESOLVED | EFlag.DEAD | EFlag.DRIVER)) !== EFlag.RESOLVED) continue;
    const early = (e.flags & EFlag.ENDED) !== 0;
    if (!early && e.end > next) continue;
    const def = effectDef(ctx.content, e.code);
    kill(e);
    ctx.events.push({ t: 'effectEnd', victim: e.victim, effect: e.code, tick: w.tick, key: evKey(w.tick, 81, e.victim, e.code) });
    if (!def) continue;
    const beh = effectBehavior(def);
    const run = beh?.onEnd ? beh.onEnd(w, e, ctx) !== false : true;
    if (run) scheduleOnEnd(w, ctx, def, e.victim, early ? next : e.end, e.id);
  }
  // pending effects whose victim left the race never resolve into anything
  compactEffects(w);
}
