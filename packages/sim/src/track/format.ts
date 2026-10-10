// FROZEN (contracts.lock). .ctrk physics/semantics format (see docs/design/11-track-spec.md).
// v2 (L4, additive — docs/design/contract-requests/L4-ctrk-v2.md): float arrays may be stored as f32 (the loader widens
// them to f64 once), multi-path links, junctions, gates, hazard motion, extra SFLAG/TFLAG bits. v1 files still load.
import type { TrackId } from '@cr/content';

export const CTRK_MAGIC = 0x4b525443; // 'CTRK'
export const CTRK_VERSION = 3;
export const CVIS_MAGIC = 0x53495643; // 'CVIS'
export const CVIS_VERSION = 2;

/** Per-sample stride in `p{k}.smp` (Float64 after load). */
export const SMP = { PX: 0, PY: 1, PZ: 2, TX: 3, TY: 4, TZ: 5, RX: 6, RY: 7, RZ: 8, UX: 9, UY: 10, UZ: 11, S: 12, WL: 13, WR: 14, SMAIN: 15, STRIDE: 16 } as const;
/** Per-sample stride in `p{k}.ai` (Float64 after load). */
export const AIS = { LINE_U: 0, VLIM: 1, KAPPA: 2, TURN40: 3, ZONE: 4, WIDTH: 5, STRIDE: 6 } as const;
/** Bits of `p{k}.flg` (Uint16). */
export const SFLAG = {
  SURF_MASK: 0x1f, RMF: 1 << 5, GRAV_SHIFT: 6, GRAV_MASK: 3 << 6, JUMP: 1 << 8, NO_ITEM: 1 << 9, NO_GROUND: 1 << 10, KILL: 1 << 11,
  // v2
  RAIL: 1 << 12,   // host sample inside a rail span (anti-cut exempt)
  WARP: 1 << 13,   // inside a warp span (no geometry; anti-cut exempt)
  BLEND: 1 << 14,  // inside a junction blend window
  AREA: 1 << 15,   // guide sample of an AREA plaza
} as const;
/** Bits of per-triangle `g.flg` / `w.flg` (Uint8). */
export const TFLAG = { SOFT: 1, INVISIBLE: 2, KILL: 4, LEDGE: 8, PROP: 16, GORE: 32, SLOPE: 64, ORIENTED: 128 } as const;

export type GravMode = 0 | 1 | 2; // world, track (-up), low (scaled world)

/** v2: a place where a path continues onto another (branch split/merge, rail capture/exit). */
export interface PathLink { at: number; to: number; toS: number; kind: 'split' | 'merge' | 'railIn' | 'railOut' }

export interface CtrkPathMeta {
  id: string;
  kind: 'main' | 'branch' | 'rail' | 'connector';
  closed: boolean;
  length: number;           // arc length (m)
  n: number;                // number of samples (closed paths store n = segments + 1, last == first)
  ds: number;               // nominal sample spacing (m)
  map?: { host: number; fromS: number; toS: number }; // progress mapping onto host (main) path, in sMain units
  aiMinSkill: number;       // 0..1; bots below skip this path
  gravityScale?: number;    // for GRAV low (per-sample scales live in p{k}.grav in v2)
  // v2
  links?: PathLink[];
  hostFrom?: number; hostTo?: number;   // host path-local s of the attachment points
  branchKind?: 'shortcut' | 'risk' | 'alt';
  lineS?: number;                        // main p2p: path s of the start line (sMain = s − lineS)
}

export interface PoseBaked { x: number; y: number; z: number; fx: number; fy: number; fz: number }
export interface BoxBaked { id: number; x: number; y: number; z: number; path: number; s: number; u: number }
export interface PadBaked { path: number; s0: number; s1: number; u0: number; u1: number; kind: 'boost' | 'jump' }
export interface ZoneBaked {
  kind: 'conveyor' | 'surface' | 'kill' | 'noItem' | 'camera' | 'gravity'; path: number; s0: number; s1: number; u0: number; u1: number; speedMul?: number; surf?: number; belowY?: number;
  // v2
  aabb?: [number, number, number, number]; // x0, z0, x1, z1 (kill planes)
  gravMode?: GravMode; gravScale?: number; camera?: string;
}
export interface RailBaked {
  id: string; path: number; host: number; fromS: number; toS: number; captureDMax: number; captureHeadingDeg: number; vMin: number; speedMin: number; speedMax: number; accel: number; gaugePerSec: number;
  // v2
  hostFrom?: number; hostTo?: number; length?: number;
}
export interface WarpBaked { id: string; path: number; s: number; u0: number; u1: number; hMax: number; exitPath: number; exitS: number; exitU: number; transitTicks: number; keepSpeed: boolean }
export interface JumpBaked {
  path: number; lipS: number; landS0: number; landS1: number; vMin: number; vMax: number;
  // v2
  rampS?: number; lipDeg?: number; gapLen?: number; drop?: number; lipH?: number; landW?: number;
}

/** v2: analytic motion of a track hazard; the pose is a pure function of (tick + offset) mod period. */
export interface HazardMotion {
  type: 'static' | 'piston' | 'pendulum' | 'rotate' | 'lane' | 'cross';
  rise?: number; rampTicks?: number;                 // piston: raised by `rise` m outside the active phase, eased over rampTicks
  pivotH?: number; arm?: number; ampDeg?: number;    // pendulum / rotate: pivot height above the road, arm length, swing amplitude
  plane?: 'across' | 'along' | 'flat';               // swing plane: across/along the track (vertical) or flat (horizontal sweep)
  speed?: number; s0?: number; s1?: number;           // lane: travels s0 → s1 on the path at `speed` m/s (wraps)
  halfSpan?: number;                                   // cross: travels across the road from −halfSpan to +halfSpan
}
export interface HazardDefBaked {
  id: number; kind: 'geyser' | 'press' | 'train' | 'traffic' | 'swinger';
  path: number; s: number; u: number; shape: 'cyl' | 'box' | 'sphere'; size: [number, number, number];
  periodTicks: number; activeFrom: number; activeTo: number; telegraphTicks: number; offsetTicks: number;
  effect: 'spin' | 'launch' | 'squash' | 'block';
  /** v3: physical contact is independent from effect cooldown/immunity. */
  contact?: 'solid' | 'trigger';
  lanes?: { u: number; speed: number; count: number; spacing: number }[];
  // v2
  motion?: HazardMotion;
  group?: number;          // hazards expanded from one HAZ line (traffic vehicles) share a group
  name?: string;           // DSL id
  h?: number;              // base height above the road surface
}

/** v2: junction record (renderer: gore cushion / signage; AI: split choice). */
export interface JunctionBaked { branch: number; host: number; kind: 'split' | 'merge'; hostS: number; gore?: PoseBaked }

export interface PropContactSetBaked { kind: string; n: number; policy: 'solid' | 'cosmetic'; fingerprint: string }

export interface CtrkMeta {
  /** v3: final instance matrices and authored model contacts live in prop{n}.mat/.contacts/.support arrays. */
  propContacts?: { version: 2; sets: PropContactSetBaked[]; geometries: { prefix: string }[]; structuralFirst: number; structuralCount: number };
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
  // v2
  version?: number;
  gates?: { s: number; w: number }[];        // ordinary main-line gates every ≈ 30 m (sMain, gate width)
  junctions?: JunctionBaked[];
  signature?: string[];
  fallbacksTaken?: string[];
}
