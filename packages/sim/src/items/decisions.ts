// Authority decisions (B3) and the predictor-side lookup of the few choices a predictor cannot make itself.
// Rule (20-netcode-spec §8 R2): the roll is authority-only (secret key). Everything else — targets, commits, results —
// is computed identically on both sides from inputs and state; the predictor prefers an authoritative commit when it
// already has one (it may have mispredicted a remote kart), and reads grants because it can never compute them.
import type { RankBucket } from '@cr/content';
import type { Decision, DecisionLog, RaceConfig, WorldState } from '../core/state.ts';
import type { AuthorityHooks, StepContext } from '../api.ts';
import type { Tick } from '../core/units.ts';
import { rollItem } from './roll.ts';

type Grant = Extract<Decision, { k: 'grant' }>;
type Commit = Extract<Decision, { k: 'commit' }>;

interface DecisionIndex { log: Decision[]; n: number; grants: Map<number, Grant>; commits: Map<number, Commit> }
const INDEX = new WeakMap<DecisionLog, DecisionIndex>();

const grantKey = (tick: Tick, slot: number): number => tick * 8 + slot;

/** Incrementally indexes the (append-only) decision log; rebuilt if the log was replaced or trimmed. */
function indexOf(w: Readonly<WorldState>): DecisionIndex {
  const log = w.decisions;
  let ix = INDEX.get(log);
  if (!ix || ix.log !== log.items || ix.n > log.items.length) {
    ix = { log: log.items, n: 0, grants: new Map(), commits: new Map() };
    INDEX.set(log, ix);
  }
  const items = log.items;
  while (ix.n < items.length) {
    const d = items[ix.n++]!;
    if (d.k === 'grant') ix.grants.set(grantKey(d.tick, d.slot), d);
    else if (d.k === 'commit') ix.commits.set(d.obj, d);
  }
  return ix;
}

/** The authority's grant for `slot` picking up a box at `tick` (predictor side), or undefined if not yet known. */
export function knownGrant(w: Readonly<WorldState>, tick: Tick, slot: number): Grant | undefined {
  return indexOf(w).grants.get(grantKey(tick, slot));
}

/** The authority's terminal commit of projectile `obj`, if already known. */
export function knownCommit(w: Readonly<WorldState>, obj: number): Commit | undefined {
  return indexOf(w).commits.get(obj);
}

/**
 * Hooks for an authority context built without a room (tests, tools, ghost laps): rolls use a fixed local key derived
 * from the public seed and decisions go straight into world.decisions. Real rooms always pass AuthorityHooks.
 */
const LOCAL = new WeakMap<RaceConfig, { hooks: AuthorityHooks; w: { cur: WorldState | null } }>();
function localHooks(w: WorldState, ctx: StepContext): AuthorityHooks {
  let e = LOCAL.get(ctx.cfg);
  if (!e) {
    const cfg = ctx.cfg, content = ctx.content;
    const secret = new Uint32Array([0x6c32a11e, cfg.seed >>> 0, 0x1ee7c0de, 0x0badf00d]);
    const holder: { cur: WorldState | null } = { cur: null };
    e = {
      w: holder,
      hooks: {
        rollItem: (slot: number, boxId: number, tick: Tick, bucket: RankBucket) => rollItem(content, cfg, secret, slot, boxId, tick, bucket),
        emit: (d: Decision) => { holder.cur?.decisions.items.push(d); },
      },
    };
    LOCAL.set(cfg, e);
  }
  e.w.cur = w;
  return e.hooks;
}

/** Authority hooks for this step (null on predictors). */
export function authorityOf(w: WorldState, ctx: StepContext): AuthorityHooks | null {
  if (ctx.role !== 'authority') return null;
  return ctx.authority ?? localHooks(w, ctx);
}

/** Emits a decision when running as the authority (no-op on predictors). */
export function emit(w: WorldState, ctx: StepContext, d: Decision): void {
  const a = authorityOf(w, ctx);
  if (a) a.emit(d);
}
