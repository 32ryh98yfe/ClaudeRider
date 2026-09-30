// Race session factory used by the race screen. Lane L9 registers an online factory here (NetClient-backed sessions
// implement the same surface as game/Session) instead of editing the screen: `setSessionFactory((r, t, o, p) => …)`.
import type * as THREE from 'three/webgpu';
import { Session, type SessionOptions } from '../../../game/Session.ts';
import type { QualityTier } from '../../../render/quality.ts';

export type SessionLike = Session;
export type SessionFactory = (renderer: THREE.WebGPURenderer, tier: QualityTier, opts: SessionOptions, params: Readonly<Record<string, string>>) => SessionLike;

let factory: SessionFactory = (renderer, tier, opts) => new Session(renderer, tier, opts);
export function setSessionFactory(f: SessionFactory): void { factory = f; }
export function createSession(renderer: THREE.WebGPURenderer, tier: QualityTier, opts: SessionOptions, params: Readonly<Record<string, string>>): SessionLike { return factory(renderer, tier, opts, params); }
