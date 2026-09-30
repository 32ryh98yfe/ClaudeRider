// Writes the HUD model (ui/store/hud.ts + ui/store/hudExtra.ts) from sim state: speed/gauges at ~30 Hz, text at 20 Hz;
// turns sim events into banners, toasts, the item feed and the race-stat collector (challenges, missions, splits).
import { batch } from '@preact/signals';
import { EFFECT_IDS, ITEM_IDS, idOf, loadContent } from '@cr/content';
import { KMH_PER_MPS, Phase, type BakedTrack, type RaceConfig, type SimEvent, type WorldState } from '@cr/sim';
import { hud, type Standing } from '../ui/store/hud.ts';
import { hudX, resetHudX, type FeedLine, type RailDot } from '../ui/store/hudExtra.ts';
import { banner } from '../ui/store/banner.ts';
import { t } from '../i18n/index.ts';
import { save } from '../meta/save.ts';
import { RaceStatsCollector, setCurrentRace, mission } from '../meta/raceStats.ts';
import { itemName } from '../ui/icons/itemIcons.ts';

export type ProjectFn = (slot: number, out: { x: number; y: number; visible: boolean; dist: number }) => void;
/** What the HUD reads from the race: the (predicted or authoritative) world and the baked track. A RaceRoom fits, and so does a NetClient view. */
export interface HudSource { readonly world: Readonly<WorldState>; readonly track: BakedTrack }
export interface NameTag { slot: number; x: number; y: number; visible: boolean; dist: number; name: string; rank: number; me: boolean; team: number }
export const nameTags: NameTag[] = [];
/** Per-slot look for HUD icons (standings, feed). */
export const slotInfo: { characterId: string; kartBodyId: string; name: string; bot: boolean; team: number }[] = [];

const eff = (id: (typeof EFFECT_IDS)[number]): number => EFFECT_IDS.indexOf(id) + 1;
const E = {
  airborne: eff('airborne'), trapBomb: eff('trap_bomb'), trapBug: eff('trap_bug'), spin: eff('spin'), stun: eff('stun'), throttle: eff('throttle'),
  tether: eff('tether_pull'), redaction: eff('redaction'), mirror: eff('mirror'), slotLock: eff('slot_lock'), firewall: eff('firewall_hit'),
};
/** Fallback effect → item mapping when the attacker's last use is unknown (feed icon). */
const EFFECT_ITEM: Record<number, string> = {
  [E.airborne]: 'prompt_missile', [E.trapBomb]: 'token_bomb', [E.trapBug]: 'bug_report', [E.spin]: 'glitch_puddle', [E.stun]: 'broadcast_bolt',
  [E.throttle]: 'throttle_drone', [E.tether]: 'attention_tether', [E.redaction]: 'redaction_cloud', [E.mirror]: 'mirror_mode', [E.slotLock]: 'mutex_lock', [E.firewall]: 'firewall',
};
const RESULT: Record<string, FeedLine['result']> = { hit: 'hit', shielded: 'blocked', immune: 'immune', immune_grace: 'immune', miss: 'miss', hit_late_input: 'late' };
const TICK_MS = 1000 / 60;
// EffectInstance.flags / ProjectileState.phase values from sim/items/codes.ts (not exported by @cr/sim)
const F_RESOLVED = 1, F_ENDED = 16, F_DEAD = 64, P_DEAD = 255;
const MPH_PER_KMH = 0.621371;

export class HudPresenter {
  private lastFast = 0;
  private lastSlow = 0;
  private toastId = 1;
  private feedId = 1;
  private lastUse = new Map<number, number>();
  private readonly stats: RaceStatsCollector;
  private missionShown = '';
  private prevRank = 0;
  private finishedMe = false;

  private room: HudSource; private me: number; private names: string[]; private cfg: RaceConfig; private project: ProjectFn;

  constructor(room: HudSource, me: number, names: string[], cfg: RaceConfig, project: ProjectFn) {
    this.room = room; this.me = me; this.names = names; this.cfg = cfg; this.project = project;
    const s = save.get();
    hud.visible.value = true;
    hud.laps.value = cfg.laps;
    hud.total.value = cfg.slots.filter((x) => x.kind !== 'empty').length;
    hud.itemMode.value = cfg.mode === 'item';
    hud.teamMode.value = cfg.teams !== 'solo';
    hud.finished.value = false;
    hud.finalLap.value = false;
    hud.countdown.value = null;
    hud.toasts.value = []; hud.feed.value = []; hud.incoming.value = null; hud.mash.value = null; hud.retireLeft.value = null;
    hud.auto.value = s.settings.autoBoost && cfg.mode !== 'item';
    hudX.timeAttack.value = cfg.mode === 'timeAttack';
    hudX.speedUnit.value = s.settings.units;
    resetHudX();
    nameTags.length = 0; slotInfo.length = 0;
    for (let i = 0; i < 8; i++) {
      const sc = cfg.slots[i];
      slotInfo.push({ characterId: sc?.characterId ?? 'clay', kartBodyId: sc?.kartBodyId ?? 'pebble', name: names[i] ?? '', bot: sc?.kind === 'bot', team: sc?.team ?? 0 });
      if (sc && sc.kind !== 'empty') nameTags.push({ slot: i, x: 0, y: 0, visible: false, dist: 0, name: names[i] ?? '', rank: i + 1, me: i === me, team: sc.team });
    }
    const tr = room.track;
    const kinds: string[] = [];
    for (let p = 0; p < tr.nPaths; p++) kinds.push(tr.path(p).kind);
    const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search);
    this.stats = new RaceStatsCollector({
      cfg, me, lapLength: tr.lapLength, keyGates: tr.keyGates, pathKinds: kinds, level: s.progress.level,
      pbSplits: cfg.mode === 'timeAttack' ? (s.records[cfg.trackId]?.splits ?? null) : null, forceMission: q?.get('mission') === '1',
    });
    setCurrentRace(this.stats);
  }

  private toast(text: string, kind: 'info' | 'good' | 'bad' | 'challenge' = 'info', ms = 1600): void {
    const now = performance.now();
    hud.toasts.value = [...hud.toasts.value.filter((x) => x.until >= now).slice(-1), { id: this.toastId++, text, kind, until: now + ms }];
  }

  update(nowMs: number, _alpha: number): void {
    const w = this.room.world, k = w.karts[this.me]!;
    if (nowMs - this.lastFast >= 33) {
      this.lastFast = nowMs;
      const sp = Math.hypot(k.body.vx, k.body.vy, k.body.vz);
      const kmh = sp * KMH_PER_MPS;
      hud.kmh.value = Math.round(hudX.speedUnit.value === 'mph' ? kmh * MPH_PER_KMH : kmh);
      hud.gauge.value = k.drive.gauge;
      // team gauge size = 2 × team size gauges (ADR-008)
      hud.teamGauge.value = this.cfg.teams !== 'solo' ? Math.min(1, (w.teams[k.team]?.gauge ?? 0) / (2 * (this.cfg.teams === 'duo' ? 2 : 4))) : 0;
      hud.draft.value = k.drive.draftTicks > 0 ? 1 : Math.min(0.99, k.drive.draftCharge / 120);
      hud.boosting.value = k.drive.boostTicks > 0 || k.drive.startTicks > 0 || k.drive.instTicks > 0;
      hudX.instantWindow.value = k.drive.instWindow > 0 && save.get().settings.instantHint !== false;
    }
    for (const n of nameTags) { this.project(n.slot, n); n.rank = w.karts[n.slot]!.race.rank; }
    if (nowMs - this.lastSlow < 50) return;
    this.lastSlow = nowMs;
    this.stats.onFrame(w);
    const goTick = w.goTick;
    batch(() => {
      hud.rank.value = k.race.rank;
      hud.lap.value = Math.max(1, Math.min(this.cfg.laps, k.race.lap + 1));
      const raceTicks = w.phase >= Phase.RACING ? (k.race.finishTick >= 0 ? k.race.finishTick - 1 + k.race.finishFrac - goTick : w.tick - goTick) : 0;
      hud.raceMs.value = Math.max(0, raceTicks) * TICK_MS;
      hud.lapMs.value = w.phase >= Phase.RACING && k.race.finishTick < 0 ? Math.max(0, w.tick - k.race.lapStartTick) * TICK_MS : hud.lapMs.value;
      hud.bestMs.value = k.race.bestLapTicks * TICK_MS;
      hud.boosters.value = k.drive.boosters;
      hud.teamBoosters.value = k.drive.teamBoosters;
      hud.slots.value = [k.items.slot0, k.items.slot1];
      hud.wrongWay.value = k.race.wrongWayTicks >= 72 && k.race.finishTick < 0;
      if (w.phase === Phase.COUNTDOWN || w.phase === Phase.PRE) {
        const left = goTick - w.tick;
        hud.countdown.value = left <= 180 && left > 0 ? Math.ceil(left / 60) : null;
      } else hud.countdown.value = w.tick - goTick < 45 ? 0 : null;
      hud.retireLeft.value = w.firstFinishTick >= 0 && k.race.finishTick < 0 && w.phase !== Phase.DONE ? Math.max(0, Math.ceil((w.firstFinishTick + this.cfg.rules.retireTicks - w.tick) / 60)) : null;
      const st: Standing[] = [];
      const rail: RailDot[] = [];
      const mm: { x: number; z: number; me: boolean; rank: number }[] = [];
      const total = Math.max(1, this.cfg.laps * this.room.track.lapLength);
      for (const x of w.karts) {
        if (!x.active) continue;
        st.push({ slot: x.slot, rank: x.race.rank, name: this.names[x.slot] ?? '', me: x.slot === this.me, bot: this.cfg.slots[x.slot]?.kind === 'bot', team: x.team,
          boosters: this.cfg.mode === 'item' ? (x.items.slot0 ? 1 : 0) + (x.items.slot1 ? 1 : 0) : x.drive.boosters, finished: x.race.finishTick >= 0, retired: x.race.retired === 1, gapMs: 0 });
        rail.push({ p: x.race.finishTick >= 0 ? 1 : Math.max(0, Math.min(1, x.race.raceDist / total)), me: x.slot === this.me, rank: x.race.rank, team: x.team });
        mm.push({ x: x.body.px, z: x.body.pz, me: x.slot === this.me, rank: x.race.rank });
      }
      st.sort((a, b) => a.rank - b.rank);
      hud.standings.value = st;
      hudX.rail.value = rail;
      hud.minimap.value = mm;
      hud.finished.value = k.race.finishTick >= 0;
      // statuses
      const tick = w.tick;
      let mirror = false, redaction = -1, lock = false;
      for (const e of w.effects) {
        if (e.victim !== this.me || tick < e.start || tick >= e.end || e.result !== 0) continue;
        if ((e.flags & F_RESOLVED) === 0 || (e.flags & (F_ENDED | F_DEAD)) !== 0) continue;
        if (e.code === E.mirror) mirror = true;
        else if (e.code === E.slotLock) lock = true;
        else if (e.code === E.redaction) redaction = e.start;
      }
      hudX.mirror.value = mirror;
      hudX.slotLock.value = lock;
      const rStart = redaction >= 0 ? performance.now() - (tick - redaction) * TICK_MS : null;
      if ((rStart === null) !== (hudX.redaction.value === null)) hudX.redaction.value = rStart;
      hudX.shield.value = k.status.shieldUntil > tick || k.status.haloUntil > tick;
      hudX.respawn.value = k.race.respawnPhase > 0;
      // mash prompt while a mash-out hard CC holds me (trap bubbles); remaining taps as the sim counts them
      const mash = k.status.cc && tick < k.status.ccEnd ? loadContent().effects.byCode[k.status.cc]?.mash : undefined;
      if (!mash) { if (hud.mash.value !== null) hud.mash.value = null; }
      else if (hud.mash.value === null) {
        const floor = k.status.ccStart + mash.floorTicks;
        hud.mash.value = Math.max(0, Math.min(mash.maxCredits - k.status.mashCredits, Math.ceil((k.status.ccEnd - Math.max(floor, tick + 1)) / mash.creditTicks)));
      }
      hudX.roulette.value = k.items.rouletteSlot >= 0 && k.items.rouletteEnd > tick ? { slot: k.items.rouletteSlot as 0 | 1, endsAt: performance.now() + (k.items.rouletteEnd - tick) * TICK_MS } : null;
      this.updateIncoming(w);
      // expiry
      const now = performance.now();
      if (hud.toasts.value.some((x) => x.until < now)) hud.toasts.value = hud.toasts.value.filter((x) => x.until >= now);
      if (hudX.feed.value.some((x) => x.until < now)) { hudX.feed.value = hudX.feed.value.filter((x) => x.until >= now); hud.feed.value = hud.feed.value.filter((x) => x.until >= now); }
      // mission toasts
      const m = mission.value;
      const key = m ? `${m.id}:${m.state}` : '';
      if (m && key !== this.missionShown) {
        this.missionShown = key;
        if (m.state === 'active') this.toast(t('hud.mission', { text: t(`challenges.${m.id}`) }), 'challenge', 4200);
        else if (m.state === 'done') this.toast(t('hud.missionClear'), 'good', 2600);
        else this.toast(t('hud.missionFail'), 'bad', 2000);
      }
    });
  }

  private updateIncoming(w: Readonly<WorldState>): void {
    const k = w.karts[this.me]!;
    let best: { dir: number; etaTicks: number } | null = null;
    const c = loadContent();
    for (const p of w.projectiles) {
      if (p.target !== this.me || p.phase === P_DEAD || p.owner === this.me) continue;
      const dx = p.px - k.body.px, dz = p.pz - k.body.pz;
      // committed projectiles know their impact tick; cruising ones: race-distance gap over the closing speed + 21 lead
      let eta: number;
      if (p.impact > w.tick) eta = p.impact - w.tick;
      else {
        const pd = c.items.byCode[p.code]?.projectile;
        const vk = Math.hypot(k.body.vx, k.body.vz);
        const vp = pd ? Math.max(pd.speedMulVref * 34, pd.plusTargetSpeed > 0 ? vk + pd.plusTargetSpeed : 0) : 65;
        const gap = Math.abs(k.race.raceDist - p.s);
        eta = Math.round((gap / Math.max(4, vp - vk)) * 60) + 21;
      }
      if (eta > 120) continue;
      // angle of the threat relative to the kart heading (0 = ahead, + = right)
      const fx = k.body.fx, fz = k.body.fz;
      const dir = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz);
      if (!best || eta < best.etaTicks) best = { dir: -dir, etaTicks: eta };
    }
    const cur = hud.incoming.value;
    if (!best) { if (cur) hud.incoming.value = null; hudX.alert.value = null; return; }
    hud.incoming.value = best;
    hudX.alert.value = best.dir;
  }

  onEvent(e: SimEvent): void {
    const me = this.me;
    this.stats.onEvent(e, this.room.world);
    switch (e.t) {
      case 'startBoost':
        if (e.kart === me && e.tier !== 'none') {
          hudX.startResult.value = { tier: e.tier, at: performance.now() };
          if (e.tier === 'perfect') { hudX.perfect.value = true; banner.show(t('hud.start.perfect'), 'good', 1400); }
        }
        break;
      case 'instantBoost': break; // the instant hint + boost glow carry this
      case 'gaugeFull': if (e.kart === me) hudX.gaugeFullAt.value = performance.now(); break;
      case 'teamGaugeFull': if (this.room.world.karts[me]!.team === e.team) banner.show(t('hud.teamBooster'), 'good', 1500); break;
      case 'finalLap': if (e.kart === me) { hud.finalLap.value = true; banner.show(t('hud.finalLap'), 'final', 1650); } break;
      case 'lap':
        if (e.kart !== me) break;
        {
          const prevBest = this.room.world.karts[me]!.race.bestLapTicks;
          hudX.lapPopup.value = { lapTicks: e.lapTicks, deltaTicks: e.lap > 1 && prevBest > 0 && !e.best ? e.lapTicks - prevBest : null, best: e.best && e.lap > 1, at: performance.now() };
          if (e.best && e.lap > 1) this.toast(t('hud.newBest'), 'good', 1800);
          const next = e.lap + 1;
          if (next < this.cfg.laps) hudX.lapBanner.value = { lap: next, laps: this.cfg.laps, at: performance.now() };
          if (next < this.cfg.laps) banner.show(t('hud.lapBanner', { lap: next, laps: this.cfg.laps }), 'info', 1400);
        }
        break;
      case 'finish':
        if (e.kart === me && !this.finishedMe) { this.finishedMe = true; hudX.finishAt.value = performance.now(); banner.show(t('hud.finish'), 'finish', 2600); }
        break;
      case 'rank':
        if (e.kart === me && e.from !== e.to) {
          hudX.rankFlash.value = { dir: e.to < e.from ? 1 : -1, at: performance.now() };
          if (e.to === 1 && e.from > 1 && this.room.world.phase >= Phase.RACING && this.prevRank !== 0) banner.show(t('hud.overtake'), 'good', 1200);
          this.prevRank = e.to;
        }
        break;
      case 'itemUse': this.lastUse.set(e.kart, e.item); break;
      case 'itemFizzle': if (e.kart === me) this.toast(t('hud.noLock'), 'bad', 1200); break;
      case 'mash': if (e.kart === me) hud.mash.value = e.remaining; break;
      case 'escape': if (e.kart === me) { hud.mash.value = null; if (e.fast) this.toast(t('hud.fastEscape'), 'good', 1400); } break;
      case 'effectEnd':
        if (e.victim === me && (e.effect === E.trapBomb || e.effect === E.trapBug)) { hud.mash.value = null; }
        break;
      case 'effect': this.feed(e); break;
      case 'retire': if (e.kart === me) banner.show(t('hud.retire'), 'bad', 2000); break;
      default: break;
    }
  }

  private feed(e: Extract<SimEvent, { t: 'effect' }>): void {
    const me = this.me;
    if (e.victim === me && e.result === 'hit') hudX.hitAt.value = performance.now();
    if (e.victim === me && e.result === 'shielded') this.toast(t('hud.blocked'), 'good', 1100);
    if (e.source === e.victim || e.source < 0 || e.source > 7) return;
    if (e.effect === E.tether) return; // self-applied pull
    const used = this.lastUse.get(e.source);
    const itemId = (used ? idOf(ITEM_IDS, used) : undefined) ?? EFFECT_ITEM[e.effect] ?? 'turbo_token';
    const now = performance.now();
    const line: FeedLine = { id: this.feedId++, attacker: this.names[e.source] ?? '?', victim: this.names[e.victim] ?? '?', itemId, result: RESULT[e.result] ?? 'hit', mine: e.source === me || e.victim === me, until: now + 4000 };
    // v1 late shield (20-netcode-spec §5): my defence reached the authority after the hit. Online only (net is null
    // offline); the lateness is estimated as one-way latency, and the pill clears after 3 s.
    const net = hudX.net.value;
    if (e.result === 'hit_late_input' && e.victim === me && net) {
      hudX.net.value = { ...net, late: Math.max(1, Math.round(net.pingMs / 2)) };
      setTimeout(() => { const n = hudX.net.value; if (n) hudX.net.value = { ...n, late: 0 }; }, 3000);
    }
    if (save.get().settings.itemFeed === false && !line.mine) return;
    hudX.feed.value = [...hudX.feed.value.filter((x) => x.until >= now).slice(-3), line];
    const text = t('hud.feed', { attacker: line.attacker, item: itemName(itemId), victim: line.victim });
    hud.feed.value = [...hud.feed.value.slice(-3), { id: line.id, text, until: line.until }];
  }

  /** The race-stat collector (read by the race screen at the end). */
  collector(): RaceStatsCollector { return this.stats; }

  hide(): void { hud.visible.value = false; nameTags.length = 0; }
}

/** mm:ss.mmm; `empty` for zero/unknown (BEST shows `--:--.---` until a lap exists). */
export function fmt(ms: number, empty = '00:00.000'): string {
  if (!(ms > 0)) return empty;
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), x = Math.floor(ms % 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(x).padStart(3, '0')}`;
}
