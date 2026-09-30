// Writes the HUD model (ui/store/hud.ts) from sim state at 20–30 Hz; turns events into banners/toasts.
import { batch } from '@preact/signals';
import { KMH_PER_MPS, Phase, type RaceConfig, type SimEvent } from '@cr/sim';
import type { RaceRoom } from '@cr/room';
import { hud, type Standing } from '../ui/store/hud.ts';
import { banner } from '../ui/store/banner.ts';
import { t } from '../i18n/index.ts';

export type ProjectFn = (slot: number, out: { x: number; y: number; visible: boolean; dist: number }) => void;
export const nameTags: { slot: number; x: number; y: number; visible: boolean; dist: number; name: string; rank: number; me: boolean }[] = [];

export class HudPresenter {
  private lastSlow = 0;
  private toastId = 1;

  private room: RaceRoom; private me: number; private names: string[]; private cfg: RaceConfig; private project: ProjectFn;

  constructor(room: RaceRoom, me: number, names: string[], cfg: RaceConfig, project: ProjectFn) {
    this.room = room; this.me = me; this.names = names; this.cfg = cfg; this.project = project;
    hud.visible.value = true;
    hud.laps.value = cfg.laps;
    hud.total.value = cfg.slots.filter((s) => s.kind !== 'empty').length;
    hud.itemMode.value = cfg.mode === 'item';
    hud.teamMode.value = cfg.teams !== 'solo';
    hud.finished.value = false;
    hud.finalLap.value = false;
    hud.countdown.value = null;
    nameTags.length = 0;
    for (let i = 0; i < 8; i++) if (cfg.slots[i]?.kind !== 'empty') nameTags.push({ slot: i, x: 0, y: 0, visible: false, dist: 0, name: names[i] ?? '', rank: i + 1, me: i === me });
  }

  update(nowMs: number, _alpha: number): void {
    const w = this.room.world, k = w.karts[this.me]!;
    const sp = Math.hypot(k.body.vx, k.body.vy, k.body.vz);
    // fast signals (every frame, cheap)
    hud.kmh.value = Math.round(sp * KMH_PER_MPS);
    hud.gauge.value = k.drive.gauge;
    for (const n of nameTags) { this.project(n.slot, n); n.rank = w.karts[n.slot]!.race.rank; }
    if (nowMs - this.lastSlow < 50) return;
    this.lastSlow = nowMs;
    const goTick = w.goTick;
    batch(() => {
      hud.rank.value = k.race.rank;
      hud.lap.value = Math.max(1, Math.min(this.cfg.laps, k.race.lap + 1));
      const raceTicks = w.phase >= Phase.RACING ? (k.race.finishTick >= 0 ? k.race.finishTick - 1 + k.race.finishFrac - goTick : w.tick - goTick) : 0;
      hud.raceMs.value = Math.max(0, raceTicks) * (1000 / 60);
      hud.lapMs.value = w.phase >= Phase.RACING && k.race.finishTick < 0 ? Math.max(0, w.tick - k.race.lapStartTick) * (1000 / 60) : hud.lapMs.value;
      hud.bestMs.value = k.race.bestLapTicks * (1000 / 60);
      hud.boosters.value = k.drive.boosters;
      hud.teamBoosters.value = k.drive.teamBoosters;
      hud.boosting.value = k.drive.boostTicks > 0 || k.drive.startTicks > 0;
      hud.slots.value = [k.items.slot0, k.items.slot1];
      hud.draft.value = k.drive.draftTicks > 0 ? 1 : k.drive.draftCharge / 120;
      hud.wrongWay.value = k.race.wrongWayTicks >= 72;
      if (w.phase === Phase.COUNTDOWN || w.phase === Phase.PRE) {
        const left = goTick - w.tick;
        hud.countdown.value = left <= 180 ? Math.ceil(left / 60) : null;
      } else hud.countdown.value = w.tick - goTick < 45 ? 0 : null;
      hud.retireLeft.value = w.firstFinishTick >= 0 && k.race.finishTick < 0 && w.phase !== Phase.DONE ? Math.max(0, Math.ceil((w.firstFinishTick + this.cfg.rules.retireTicks - w.tick) / 60)) : null;
      const st: Standing[] = w.karts.filter((x) => x.active).map((x) => ({
        slot: x.slot, rank: x.race.rank, name: this.names[x.slot] ?? '', me: x.slot === this.me, bot: this.cfg.slots[x.slot]?.kind === 'bot', team: x.team,
        boosters: x.drive.boosters, finished: x.race.finishTick >= 0, retired: x.race.retired === 1, gapMs: 0,
      })).sort((a, b) => a.rank - b.rank);
      hud.standings.value = st;
      const mm = w.karts.filter((x) => x.active).map((x) => ({ x: x.body.px, z: x.body.pz, me: x.slot === this.me, rank: x.race.rank }));
      hud.minimap.value = mm;
      hud.finished.value = k.race.finishTick >= 0;
      const now = performance.now();
      if (hud.toasts.value.some((x) => x.until < now)) hud.toasts.value = hud.toasts.value.filter((x) => x.until >= now);
    });
  }

  onEvent(e: SimEvent): void {
    const me = this.me;
    const toast = (text: string, kind: 'info' | 'good' | 'bad' | 'challenge' = 'info', ms = 1400): void => {
      hud.toasts.value = [...hud.toasts.value.slice(-3), { id: this.toastId++, text, kind, until: performance.now() + ms }];
    };
    switch (e.t) {
      case 'startBoost':
        if (e.kart === me) {
          if (e.tier === 'perfect') { banner.show(t('hud.startPerfect'), 'good'); } else if (e.tier === 'great') toast(t('hud.startGreat'), 'good'); else if (e.tier === 'good') toast(t('hud.startGood')); else if (e.tier === 'false') toast(t('hud.startFalse'), 'bad');
        }
        break;
      case 'instantBoost': if (e.kart === me) toast(t('hud.instant'), 'good', 900); break;
      case 'teamGaugeFull': toast(t('hud.teamBoost'), 'good'); break;
      case 'finalLap': if (e.kart === me) { hud.finalLap.value = true; banner.show(t('hud.finalLap'), 'final'); } break;
      case 'finish': if (e.kart === me) banner.show(t('hud.finish'), 'finish', 2600); break;
      case 'lap': if (e.kart === me && e.best && e.lap > 1) toast(`BEST ${fmt(e.lapTicks * (1000 / 60))}`, 'good'); break;
      default: break;
    }
  }

  hide(): void { hud.visible.value = false; nameTags.length = 0; }
}

export function fmt(ms: number): string {
  if (!(ms > 0)) return '00:00.000';
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), x = Math.floor(ms % 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(x).padStart(3, '0')}`;
}
