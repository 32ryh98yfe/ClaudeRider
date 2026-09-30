// Race audio hooks called by game/Session (lane L11 owns everything behind these functions; signatures are
// the contract). One-shots come from de-duplicated SimEvents; continuous sound (engines, screech, surfaces,
// boost roar, loops) reads kart state every frame. RaceRenderer calls raceAudioPrepare() with the track info.
import { ITEM_IDS, EFFECT_IDS, SURFACE_BY_CODE, loadContent, type ModeId } from '@cr/content';
import { Attach, Boost, Phase, type InputFrame, type SimEvent, type WorldState } from '@cr/sim';
import { Audio } from './engine.ts';
import { RaceLoops } from './loops.ts';
import { Ambience } from './ambience.ts';
import { listenerDist, listenerPan } from './listener.ts';

export interface RaceAudioInfo { trackId: string; themeId: string; songId: string; ambient?: string; sky?: string }

let info: RaceAudioInfo | null = null;
let loops: RaceLoops | null = null;
let amb: Ambience | null = null;
let world: Readonly<WorldState> | null = null;
let local = 0;
let lastPhase = -1;
let assignT = 0; let grindLevel = 0; let lastAttach = 0; let lastRankSfx = 0;
let nextIncoming = 0; let lastRetireTick = -1; let started = false;
const positions: ({ x: number; y: number; z: number } | null)[] = [];
const posScratch = Array.from({ length: 8 }, () => ({ x: 0, y: 0, z: 0 }));
const vel = { x: 0, y: 0, z: 0 };
const eParams = { rpm01: 0, throttle: 0, boost: 0 as number, slip: 0, pos: { x: 0, y: 0, z: 0 }, vel };
const projPos = new Map<number, { x: number; y: number; z: number }>();

/** Song variant: `a` for the theme's first roster track, `b` for the second (32-audio-spec §5). */
function variantFor(trackId: string, themeId: string): 'a' | 'b' {
  const c = loadContent();
  const list = c.tracks.all.filter((t) => t.themeId === themeId && t.onRoster).sort((x, y) => x.code - y.code);
  return list.findIndex((t) => t.id === trackId) === 1 ? 'b' : 'a';
}

/** Called by the RaceRenderer during init (before raceAudioStart). */
export function raceAudioPrepare(i: RaceAudioInfo): void { info = i; }

export function raceAudioStart(mode: ModeId): void {
  void mode;
  const ac = Audio.ctx, mx = Audio.mixer, bank = Audio.noise;
  started = true; lastPhase = -1; world = null; grindLevel = 0; lastAttach = 0; lastRetireTick = -1; projPos.clear();
  if (!ac || !mx || !bank) return;
  Audio.ensurePool();
  loops = new RaceLoops(ac, mx.buses.sfx, bank);
  amb = info ? new Ambience(ac, mx.buses.sfx, bank, info.themeId) : null;
  if (info) void Audio.director?.intro(info.songId, variantFor(info.trackId, info.themeId));
}

export function raceAudioStop(): void {
  started = false;
  loops?.stop(); loops = null;
  amb?.stop(); amb = null;
  Audio.stopEngines();
  const d = Audio.director;
  if (d && (d.state === 'race' || d.state === 'finalLap')) d.stop(1.0);
  world = null;
}

const speedOf = (b: { vx: number; vy: number; vz: number }): number => Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);

/** Once per rendered frame, after the sim steps. */
export function raceAudioFrame(w: Readonly<WorldState>, me: number, inp: Readonly<InputFrame>): void {
  if (!started) return;
  world = w; local = me;
  const pool = Audio.pool, d = Audio.director, mx = Audio.mixer;
  if (!pool || !mx) return;
  const k = w.karts[me]!;
  const b = k.body, dr = k.drive;
  const sp = speedOf(b);
  const u = b.vx * b.fx + b.vy * b.fy + b.vz * b.fz;
  const sinSlip = sp > 3 ? Math.sqrt(Math.max(0, 1 - (u * u) / (sp * sp))) : 0;
  const slip01 = Math.min(1, sinSlip / 0.5);
  // ---- engines: player + nearest rivals (re-assigned 4×/s)
  if (!pool.has(me)) pool.attach(me, 'player');
  assignT += 1;
  if (assignT % 15 === 1) {
    positions.length = 0;
    for (let i = 0; i < w.karts.length; i++) {
      const kk = w.karts[i]!;
      if (!kk.active) { positions.push(null); continue; }
      const p = posScratch[i]!; p.x = kk.body.px; p.y = kk.body.py; p.z = kk.body.pz; positions.push(p);
    }
    pool.assign(me, positions, 3, Audio.hrtf ? 3 : 2);
  }
  const racing = w.phase >= Phase.RACING;
  for (let i = 0; i < w.karts.length; i++) {
    const kk = w.karts[i]!;
    if (!kk.active || !pool.has(i)) continue;
    const kb = kk.body, kd = kk.drive;
    const s = speedOf(kb);
    const thr = i === me ? (racing ? inp.throttle / 15 : inp.throttle > 0 ? 0.6 : 0) : kd.boostTicks > 0 ? 1 : 0.8;
    eParams.rpm01 = s / 44; eParams.throttle = thr; eParams.boost = kd.boostTicks > 0 || kd.startTicks > 0 ? Boost.NORMAL : 0;
    eParams.slip = kd.drift ? 0.3 : 0;
    eParams.pos.x = kb.px; eParams.pos.y = kb.py; eParams.pos.z = kb.pz; vel.x = kb.vx; vel.y = kb.vy; vel.z = kb.vz;
    Audio.engines.update(i, eParams as never);
  }
  // ---- player loops
  const L = loops;
  if (L) {
    const grounded = b.grounded === 1;
    const drifting = dr.drift === 1 && grounded;
    L.screech.set(drifting ? slip01 * Math.min(1, sp / 30) * 0.16 : 0, 1200 + 1800 * slip01);
    L.screech.setRate(6 + 3 * slip01);
    const tier = dr.driftTicks < 30 ? 0 : dr.driftTicks < 60 ? 1 : 2;
    L.crackle.set(drifting && sp > 8 ? 0.05 + 0.03 * tier : 0);
    L.crackle.setRate(20 + tier * 20);
    grindLevel *= 0.85;
    L.grind.set(grindLevel * 0.2);
    const surf = SURFACE_BY_CODE[b.surf]?.id ?? 'asphalt';
    const sv = grounded ? Math.min(1, sp / 25) : 0;
    L.offroad.set(surf === 'grass' || surf === 'dirt' ? sv * 0.2 : 0);
    L.gravel.set(surf === 'gravel' ? sv * 0.1 : 0); L.gravel.setRate(20 + sp * 1.2);
    L.sand.set(surf === 'sand' ? sv * 0.15 : 0);
    L.snow.set(surf === 'snow' || surf === 'ice' ? sv * 0.1 : 0);
    L.wet.set(surf === 'wet' ? sv * 0.14 : 0);
    L.wood.set(surf === 'wood' ? sv * 0.12 : 0); L.wood.setRate(Math.max(2, sp / 1.5));
    L.metal.set(surf === 'metal' ? sv * 0.06 : 0); L.metal.setRate(Math.max(2, sp / 2));
    L.draft.set(dr.draftCharge > 0 ? Math.min(1, dr.draftCharge / 90) * 0.14 : 0, 500 + 1500 * Math.min(1, dr.draftCharge / 90));
    const railed = b.attachKind === Attach.RAIL;
    L.rail.set(railed ? 0.06 : 0, 110 + sp * 3);
    const ccName = EFFECT_IDS[k.status.cc - 1];
    L.trap.set(ccName === 'trap_bomb' || ccName === 'trap_bug' ? 0.08 : 0);
    let throttled = 0;
    for (const e of w.effects) if (e.victim === me && EFFECT_IDS[e.code - 1] === 'throttle' && e.start <= w.tick && e.end > w.tick) throttled++;
    L.drone.set(throttled ? 0.05 + 0.02 * throttled : 0);
    // rail / warp transitions
    if (b.attachKind !== lastAttach) {
      const pos = { x: b.px, y: b.py, z: b.pz };
      if (b.attachKind === Attach.RAIL) Audio.sfx('kart.rail_lock', { pos });
      else if (b.attachKind === Attach.WARP) Audio.sfx('kart.warp_enter', { pos });
      else if (lastAttach === Attach.RAIL) Audio.sfx('kart.rail_exit', { pos });
      else if (lastAttach === Attach.WARP) Audio.sfx('kart.warp_exit', { pos });
      lastAttach = b.attachKind;
    }
  }
  amb?.tick();
  // ---- music: countdown duck, battle intensity, retire ticks
  if (d) {
    if (w.phase !== lastPhase) {
      if (w.phase === Phase.COUNTDOWN) d.countdown(3);
      if (w.phase === Phase.RACING && lastPhase >= 0 && lastPhase < Phase.RACING) d.go();
      lastPhase = w.phase;
    }
    if (racing && k.race.finishTick < 0) {
      let near = false;
      for (let i = 0; i < w.karts.length && !near; i++) {
        if (i === me || !w.karts[i]!.active) continue;
        const o = w.karts[i]!.body; const dx = o.px - b.px, dy = o.py - b.py, dz = o.pz - b.pz;
        if (dx * dx + dy * dy + dz * dz < 225) near = true;
      }
      d.battle(near);
    }
  }
  if (w.phase === Phase.RETIRE_TIMER && k.race.finishTick < 0 && w.firstFinishTick >= 0) {
    const ends = w.firstFinishTick + 600;
    const left = ends - w.tick;
    const sec = Math.floor(left / 60);
    if (sec !== lastRetireTick && left > 0) { lastRetireTick = sec; Audio.sfx('race.retire_tick', { k: sec < 3 ? 1 : 0 }); }
  }
  // ---- incoming projectile warning beeps (interval 24 → 5 ticks with ETA), panned toward the threat
  for (const p of w.projectiles) {
    let q = projPos.get(p.id); if (!q) { q = { x: 0, y: 0, z: 0 }; projPos.set(p.id, q); }
    q.x = p.px; q.y = p.py; q.z = p.pz;
  }
  if (projPos.size > 64) projPos.clear();
  let eta = Infinity, threat: { x: number; y: number; z: number } | null = null;
  for (const p of w.projectiles) if (p.target === me && p.impact > w.tick && p.impact - w.tick < eta) { eta = p.impact - w.tick; threat = projPos.get(p.id)!; }
  if (threat && eta <= 120 && w.tick >= nextIncoming) {
    Audio.sfx('ui.incoming_beep', { k: (listenerPan(threat) + 1) / 2 });
    nextIncoming = w.tick + Math.round(5 + 19 * Math.min(1, eta / 120));
  }
}

function kartPos(slot: number): { x: number; y: number; z: number } | undefined {
  const k = world?.karts[slot];
  return k ? { x: k.body.px, y: k.body.py, z: k.body.pz } : undefined;
}
/** Local kart sounds play non-spatially; other karts' sounds are spatial (and culled when far). */
function at(slot: number, id: string, o: { gain?: number; k?: number; pitch?: number } = {}): void {
  if (slot === local) Audio.sfx(id, o);
  else { const pos = kartPos(slot); if (pos && listenerDist(pos) < 120) Audio.sfx(id, { ...o, pos }); }
}
const itemName = (code: number): string => ITEM_IDS[code - 1] ?? 'unknown';
function itemKey(code: number, which: 'use' | 'hit'): string {
  const def = loadContent().items.byCode[code];
  const k = which === 'use' ? def?.presentation.sfxUse : def?.presentation.sfxHit;
  return k ?? `item.${itemName(code)}.${which}`;
}

/** Every cosmetic sim event (already de-duplicated by the caller). */
export function raceAudioEvent(e: SimEvent, me: number): void {
  local = me;
  const d = Audio.director, mx = Audio.mixer;
  switch (e.t) {
    case 'countdown':
      if (e.n === 0) { Audio.sfx('race.countdown_go'); Audio.sfx('voice.go', { delay: 0.05 }); d?.go(); }
      else Audio.sfx('race.countdown_beep');
      break;
    case 'startBoost':
      if (e.kart !== me) break;
      if (e.tier === 'false') Audio.sfx('kart.wheelspin');
      else if (e.tier !== 'none') { Audio.sfx('boost.start', { k: e.tier === 'perfect' ? 1 : e.tier === 'great' ? 0.5 : 0 }); if (e.tier === 'perfect') Audio.sfx('voice.perfect', { delay: 0.25 }); }
      break;
    case 'driftStart': at(e.kart, 'kart.drift_start'); break;
    case 'doubleDrift': at(e.kart, 'kart.double_drift'); break;
    case 'instantBoost': at(e.kart, 'boost.instant'); break;
    case 'gaugeFull': if (e.kart === me) Audio.sfx('boost.gauge_full'); break;
    case 'teamGaugeFull': Audio.sfx('boost.team_gauge_full'); break;
    case 'boostStart': {
      const id = e.kind === Boost.TEAM ? 'boost.team_ignite' : e.kind === Boost.PAD ? 'boost.pad' : e.kind === Boost.START || e.kind === Boost.INSTANT ? '' : 'boost.ignite';
      if (id) at(e.kart, id, { gain: e.kind === Boost.ITEM ? 0.7 : 1 });
      if (e.kart === me && mx) { mx.whoosh(); mx.duck('boost', -3, 3); }
      break;
    }
    case 'boostEnd': at(e.kart, 'boost.end'); if (e.kart === me) mx?.unduck('boost'); break;
    case 'draft': if (e.kart === me && e.on) Audio.sfx('boost.draft_on'); break;
    case 'wall': {
      if (e.severity === 0) { if (e.kart === me) grindLevel = Math.min(1, grindLevel + 0.5); else at(e.kart, 'kart.wall_grind', { k: Math.min(1, e.speed / 20) }); break; }
      const id = e.severity === 2 ? 'kart.wall_hit_hard' : 'kart.wall_hit_soft';
      if (e.kart === me) Audio.sfx(id, { gain: Math.min(1, 0.5 + e.speed / 30) }); else Audio.sfx(id, { pos: { x: e.x, y: e.y, z: e.z } });
      break;
    }
    case 'bump': if (e.a === me || e.b === me) Audio.sfx('kart.bump', { k: Math.min(1, e.impulse / 12) }); else at(e.a, 'kart.bump', { k: Math.min(1, e.impulse / 12) }); break;
    case 'air': at(e.kart, 'kart.jump_takeoff'); break;
    case 'land': if (e.impact > 2) at(e.kart, e.impact > 6 ? 'kart.land_hard' : 'kart.land_soft'); break;
    case 'box': if (e.kart === me) Audio.sfx('item.box_break'); break;
    case 'itemGranted': {
      if (e.kart !== me) break;
      // roulette: 10 decelerating clicks, then the landing pop
      let t = 0;
      for (let i = 0; i < 10; i++) { t += 0.03 + i * 0.012; Audio.sfx('item.roulette_tick', { delay: t }); }
      Audio.sfx('item.roulette_land', { delay: t + 0.08 });
      break;
    }
    case 'itemUse': at(e.kart, itemKey(e.item, 'use')); break;
    case 'itemFizzle': if (e.kart === me) Audio.sfx('ui.error'); break;
    case 'projImpact': { const p = projPos.get(e.obj); if (p) Audio.sfx(itemKey(e.item, 'hit'), { pos: p }); projPos.delete(e.obj); break; }
    case 'effect': {
      const name = EFFECT_IDS[e.effect - 1];
      if (e.result === 'shielded') { at(e.victim, 'item.context_shield.hit'); break; }
      if (e.result === 'hit_late_input') { if (e.victim === me) Audio.sfx('net.late_signal'); break; }
      if (e.result !== 'hit') break;
      const id = name === 'spin' ? 'item.spin' : name === 'stun' ? 'item.stun_zap' : name === 'trap_bomb' ? 'item.token_bomb.hit' : name === 'trap_bug' ? 'item.bug_report.hit'
        : name === 'firewall_hit' ? 'item.firewall.hit' : name === 'tether_pull' ? 'item.attention_tether.hit' : name === 'mirror' && e.victim === me ? 'item.mirror_mode.hit'
          : name === 'redaction' && e.victim === me ? 'item.redaction_cloud.hit' : name === 'overclock' && e.victim !== e.source ? 'item.overclock_aura.hit' : name === 'throttle' ? 'item.throttle_drone.hit' : '';
      if (id) at(e.victim, id);
      if (name === 'redaction' && e.victim === me) mx?.muffle(500, 1.5);
      if (e.source === me && e.victim !== me && (name === 'spin' || name === 'stun' || name === 'airborne' || name?.startsWith('trap'))) { Audio.sfx('voice.nice', { delay: 0.3 }); mx?.duck('voice', -4, 0.8); }
      break;
    }
    case 'effectEnd': { const name = EFFECT_IDS[e.effect - 1]; if ((name === 'trap_bomb' || name === 'trap_bug') && e.victim === me) Audio.sfx('item.escape_pop'); break; }
    case 'escape': if (e.kart === me && e.fast) Audio.sfx('item.escape_fast', { delay: 0.08 }); break;
    case 'mash': if (e.kart === me) Audio.sfx('item.mash_tap', { k: Math.max(0, Math.min(1, 1 - e.remaining / 132)) }); break;
    case 'lap': if (e.kart === me && e.lap > 0) Audio.sfx(e.best ? 'race.best_lap' : 'race.lap'); break;
    case 'finalLap': if (e.kart === me) { Audio.sfx('voice.final_lap', { delay: 0.1 }); mx?.duck('voice', -4, 1.2); d?.setState('finalLap'); } break;
    case 'finish': if (e.kart === me) { Audio.sfx('race.finish', { k: e.rank === 1 ? 1 : 0 }); Audio.sfx('voice.finish', { delay: 0.2 }); d?.setState('finish', { rank: e.rank }); } break;
    case 'retireTimer': { const k = world?.karts[me]; if (k && k.race.finishTick < 0) d?.retireCountdown(); break; }
    case 'retire': if (e.kart === me) Audio.sfx('race.retire'); break;
    case 'wrongWay': if (e.kart === me && e.on) Audio.sfx('race.wrong_way'); break;
    case 'respawn': at(e.kart, e.phase === 'out' ? 'kart.respawn_out' : 'kart.respawn_in'); break;
    case 'rank': {
      if (e.kart !== me || !Audio.ctx) break;
      const t = Audio.ctx.currentTime;
      if (t - lastRankSfx < 0.5) break;
      lastRankSfx = t;
      Audio.sfx(e.to < e.from ? 'race.rank_up' : 'race.rank_down');
      if (e.to < e.from) Audio.sfx('race.overtake');
      break;
    }
    case 'raceEnd': { const k = world?.karts[me]; d?.setState('results', { rank: k?.race.rank ?? 8 }); break; }
    default: break;
  }
}
