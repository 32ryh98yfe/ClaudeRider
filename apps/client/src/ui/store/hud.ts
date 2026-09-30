// FROZEN (contracts.lock). HUD model — written only by game/HudPresenter at 20–30 Hz, read by HUD components.
import { signal, type Signal } from '@preact/signals';

export interface Standing { slot: number; rank: number; name: string; me: boolean; bot: boolean; team: number; boosters: number; finished: boolean; retired: boolean; gapMs: number }
export interface Toast { id: number; text: string; kind: 'info' | 'good' | 'bad' | 'challenge'; until: number }
export interface FeedEntry { id: number; text: string; until: number }

export interface HudSignals {
  visible: Signal<boolean>;
  rank: Signal<number>; total: Signal<number>; lap: Signal<number>; laps: Signal<number>;
  lapMs: Signal<number>; raceMs: Signal<number>; bestMs: Signal<number>;
  kmh: Signal<number>; boosting: Signal<boolean>; gauge: Signal<number>; teamGauge: Signal<number>; teamMode: Signal<boolean>;
  slots: Signal<[number, number]>; boosters: Signal<number>; teamBoosters: Signal<number>; itemMode: Signal<boolean>;
  draft: Signal<number>; wrongWay: Signal<boolean>; finalLap: Signal<boolean>; countdown: Signal<number | null>;
  retireLeft: Signal<number | null>; standings: Signal<Standing[]>; toasts: Signal<Toast[]>; feed: Signal<FeedEntry[]>;
  incoming: Signal<{ dir: number; etaTicks: number } | null>; mash: Signal<number | null>; finished: Signal<boolean>; auto: Signal<boolean>;
  minimap: Signal<{ x: number; z: number; me: boolean; rank: number }[]>;
}

export const hud: HudSignals = {
  visible: signal(false),
  rank: signal(1), total: signal(8), lap: signal(1), laps: signal(3),
  lapMs: signal(0), raceMs: signal(0), bestMs: signal(0),
  kmh: signal(0), boosting: signal(false), gauge: signal(0), teamGauge: signal(0), teamMode: signal(false),
  slots: signal([0, 0]), boosters: signal(0), teamBoosters: signal(0), itemMode: signal(false),
  draft: signal(0), wrongWay: signal(false), finalLap: signal(false), countdown: signal(null),
  retireLeft: signal(null), standings: signal([]), toasts: signal([]), feed: signal([]),
  incoming: signal(null), mash: signal(null), finished: signal(false), auto: signal(false),
  minimap: signal([]),
};
