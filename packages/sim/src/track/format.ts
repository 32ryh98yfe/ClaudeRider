// FROZEN (contracts.lock). .ctrk physics/semantics format (see docs/design/11-track-spec.md).
import type { TrackId } from '@cr/content';

export const CTRK_MAGIC = 0x4b525443; // 'CTRK'
export const CTRK_VERSION = 1;
export const CVIS_MAGIC = 0x53495643; // 'CVIS'
export const CVIS_VERSION = 1;

/** Per-sample stride in `p{k}.smp` (Float64). */
export const SMP = { PX: 0, PY: 1, PZ: 2, TX: 3, TY: 4, TZ: 5, RX: 6, RY: 7, RZ: 8, UX: 9, UY: 10, UZ: 11, S: 12, WL: 13, WR: 14, SMAIN: 15, STRIDE: 16 } as const;
/** Per-sample stride in `p{k}.ai` (Float64). */
export const AIS = { LINE_U: 0, VLIM: 1, KAPPA: 2, TURN40: 3, ZONE: 4, WIDTH: 5, STRIDE: 6 } as const;
/** Bits of `p{k}.flg` (Uint16). */
export const SFLAG = {
  SURF_MASK: 0x1f, RMF: 1 << 5, GRAV_SHIFT: 6, GRAV_MASK: 3 << 6, JUMP: 1 << 8, NO_ITEM: 1 << 9, NO_GROUND: 1 << 10, KILL: 1 << 11,
} as const;
/** Bits of per-triangle `g.flg` / `w.flg` (Uint8). */
export const TFLAG = { SOFT: 1, INVISIBLE: 2, KILL: 4, LEDGE: 8, PROP: 16 } as const;

export type GravMode = 0 | 1 | 2; // world, track (-up), low (scaled world)

export interface CtrkPathMeta {
  id: string;
  kind: 'main' | 'branch' | 'rail' | 'connector';
  closed: boolean;
  length: number;           // arc length (m)
  n: number;                // number of samples (closed paths store n = segments + 1, last == first)
  ds: number;               // nominal sample spacing (m)
  map?: { host: number; fromS: number; toS: number }; // progress mapping onto host (main) path
  aiMinSkill: number;       // 0..1; bots below skip this path
  gravityScale?: number;    // for GRAV low
}

export interface PoseBaked { x: number; y: number; z: number; fx: number; fy: number; fz: number }
export interface BoxBaked { id: number; x: number; y: number; z: number; path: number; s: number; u: number }
export interface PadBaked { path: number; s0: number; s1: number; u0: number; u1: number; kind: 'boost' | 'jump' }
export interface ZoneBaked { kind: 'conveyor' | 'surface' | 'kill' | 'noItem' | 'camera' | 'gravity'; path: number; s0: number; s1: number; u0: number; u1: number; speedMul?: number; surf?: number; belowY?: number }
export interface RailBaked { id: string; path: number; host: number; fromS: number; toS: number; captureDMax: number; captureHeadingDeg: number; vMin: number; speedMin: number; speedMax: number; accel: number; gaugePerSec: number }
export interface WarpBaked { id: string; path: number; s: number; u0: number; u1: number; hMax: number; exitPath: number; exitS: number; exitU: number; transitTicks: number; keepSpeed: boolean }
export interface JumpBaked { path: number; lipS: number; landS0: number; landS1: number; vMin: number; vMax: number }
export interface HazardDefBaked {
  id: number; kind: 'geyser' | 'press' | 'train' | 'traffic' | 'swinger';
  path: number; s: number; u: number; shape: 'cyl' | 'box' | 'sphere'; size: [number, number, number];
  periodTicks: number; activeFrom: number; activeTo: number; telegraphTicks: number; offsetTicks: number;
  effect: 'spin' | 'launch' | 'squash' | 'block';
  lanes?: { u: number; speed: number; count: number; spacing: number }[];
}

export interface CtrkMeta {
  id: TrackId;
  name: string;
  themeId: string;
  hash: string;
  difficulty: number;
  lapLength: number;
  laps: number;
  topology: 'circuit' | 'p2p';
  killY: number;
  bounds: [number, number, number, number, number, number];
  paths: CtrkPathMeta[];
  grid: PoseBaked[];        // 8 start slots, slot 0 = pole
  boxes: BoxBaked[];
  pads: PadBaked[];
  zones: ZoneBaked[];
  rails: RailBaked[];
  warps: WarpBaked[];
  jumps: JumpBaked[];
  hazards: HazardDefBaked[];
  keyGates: number[];       // main-line s of key gates (sorted, excluding 0)
  refLapTicks: number;      // Pro ghost lap (speed mode), 0 if unknown
  hashCells: { cs: number; cy: number };
}
