// MaterialLibrary — the ONLY shared TSL surface (ADR-011, CLAUDE.md rule 6). ≤ 40 unique materials per scene.
// Every material is memoized by kind + parameters (+ the quality profile it specialises on), so props, karts
// and mascots that ask for the same look share one material. The BudgetTracker counts what a scene uses.
import * as THREE from 'three/webgpu';
import { uniform, Fn } from 'three/tsl';
import {
  buildRoad, buildKerb, buildWall, buildTerrain, buildWater, buildFoliage, buildPad, buildStartLine, buildWorld, buildKillPlane,
  type RoadParams, type RoadStyle, type WallStyle, type WaterParams, type MaterialProfile,
} from './world.ts';
import { buildVinyl, buildKartPaint, buildEmissive, buildEmissiveVertex, buildNeon, buildVertexLit, type VinylParams } from './character.ts';
import { buildFlame, buildFlameShared, buildBubble, buildRingDecal, buildGhost, type FlameUserData } from './fx.ts';
import { fxUniforms, setNoiseQuality } from './tsl.ts';
import { buildMascotVinyl, buildMascotGlass, buildMascotEyes, buildKartLivery, buildKartOverlay } from './rigs.ts';
import { registerLocalMaterial, localMaterials, eyeAtlas, EYE_ATLAS } from '../mascot/materials.ts';
import { kartAtlas } from '../karts/materials.ts';

export type { RoadParams, RoadStyle, WallStyle, WaterParams, FlameUserData, VinylParams };
export interface MascotPalette { body: THREE.Color; shade: THREE.Color; accent: THREE.Color; detail: THREE.Color; eye: THREE.Color }
export type MaterialTier = 'low' | 'medium' | 'high' | 'ultra';

const cache = new Map<string, THREE.Material>();
const keyOf = (kind: string, p: unknown): string => `${kind}:${JSON.stringify(p)}`;
let profile: MaterialProfile = { hq: true, triplanar: false };
let profileKey = 'hq';

function memo<T extends THREE.Material>(k: string, make: () => T): T {
  let m = cache.get(k) as T | undefined;
  if (!m) { m = make(); m.name = k; cache.set(k, m); }
  return m;
}
/** Materials whose node graph depends on the quality profile carry the profile in their key. */
const pk = (k: string): string => `${k}@${profileKey}`;

/** Selects the quality profile for materials created from now on (RaceRenderer calls this per race). */
function configure(tier: MaterialTier, opts: { triplanar?: boolean } = {}): void {
  profile = { hq: tier !== 'low', triplanar: opts.triplanar ?? (tier === 'high' || tier === 'ultra') };
  profileKey = `${profile.hq ? 'hq' : 'lq'}${profile.triplanar ? '+tri' : ''}`;
  setNoiseQuality(profile.hq);
  // Promoted L8 materials (L8-portraits.md §4): L8's getters (mascot/materials.ts, karts/materials.ts) memoise
  // through registerLocalMaterial, so seeding their keys hands every mascot and kart the library's tier-aware
  // build. The first configure() wins; the tier is fixed for the lifetime of the Stage's renderer.
  registerLocalMaterial('mascotVinyl', mascotVinyl);
  registerLocalMaterial('mascotGlass', mascotGlass);
  registerLocalMaterial('mascotEyes', mascotEyes);
  registerLocalMaterial('kartPaint', kartLivery);
  registerLocalMaterial('kartOverlay', kartOverlay);
}

/** Stylized world material (low-frequency noise albedo + vertex AO). */
function world(p: { color: string; color2?: string; roughness: number; metalness?: number; noiseScale?: number; vertexAO?: boolean }): THREE.MeshStandardNodeMaterial {
  return memo(keyOf('world', p), () => buildWorld(p));
}
function road(p: RoadParams): THREE.MeshStandardNodeMaterial { return memo(pk(keyOf('road', p)), () => buildRoad(p, profile)); }
function kerb(a = '#e84a3c', b = '#fafafa'): THREE.MeshStandardNodeMaterial { return memo(pk(keyOf('kerb', [a, b])), () => buildKerb(a, b, profile)); }
/** Walls by `WallSpec.type` (barrier, fence, rock, parapet, building, planter, pillar, curb) plus theme kinds (panel, stone, glass, neon, ice, hedge). */
function wall(kind: string, a: string, b: string, tint = 1): THREE.MeshStandardNodeMaterial {
  return memo(pk(keyOf('wall', [kind, a, b, tint])), () => buildWall(kind as WallStyle, a, b, profile, tint));
}
function terrain(a: string, b: string, c: string): THREE.MeshStandardNodeMaterial { return memo(pk(keyOf('terrain', [a, b, c])), () => buildTerrain(a, b, c, profile)); }
function water(p: WaterParams): THREE.MeshStandardNodeMaterial { return memo(pk(keyOf('water', p)), () => buildWater(p, profile)); }
/** Boost pads (teal) and jump pads (coral) share one material; the vis pad slot marks the kind in vertex colour r. */
function boostPad(kind: 'auto' | 'boost' | 'jump' = 'auto'): THREE.MeshStandardNodeMaterial { return memo(kind === 'auto' ? 'boostpad' : `boostpad:${kind}`, () => buildPad(kind)); }
/** F2 kill planes (`underside:kill_lava` / `underside:kill_void` slots). */
function killPlane(kind: 'lava' | 'void'): THREE.MeshStandardNodeMaterial { return memo(`kill:${kind}`, () => buildKillPlane(kind)); }
function startLine(): THREE.MeshStandardNodeMaterial { return memo('startline', buildStartLine); }
/** Vinyl-toy mascot material: vertex-coloured palette, clearcoat, Fresnel rim. */
function vinyl(p: VinylParams): THREE.MeshPhysicalNodeMaterial {
  return memo(pk(keyOf('vinyl', { ...p, tint: p.tint ? p.tint.getHexString() : null })), () => buildVinyl(p, profile.hq));
}
/**
 * Candy kart paint. Liveries live in vertex colours, so every kart shares one material (the colour argument is
 * accepted for compatibility). Pass `{ map }` for a livery canvas texture; those get one material per texture.
 */
function kartPaint(p?: string | { livery?: unknown; map?: THREE.Texture }): THREE.MeshPhysicalNodeMaterial {
  const map = typeof p === 'object' && p?.map ? p.map : null;
  return memo(pk(map ? `kartPaint:${map.uuid}` : 'kartPaint'), () => buildKartPaint(profile.hq, map));
}
/** Shared mascot body (vertex palette + `surf` attribute), eyes (atlas decal) and glass. */
function mascotVinyl(): THREE.MeshStandardNodeMaterial { return memo(pk('mascotVinyl'), () => buildMascotVinyl(profile.hq)); }
function mascotGlass(): THREE.MeshStandardNodeMaterial { return memo(pk('mascotGlass'), () => buildMascotGlass(profile.hq)); }
function mascotEyes(): THREE.MeshStandardNodeMaterial { return memo(pk('mascotEyes'), () => buildMascotEyes(eyeAtlas(), EYE_ATLAS, profile.hq)); }
/** Shared kart body with the 12 livery patterns (attributes `pcol`, `pat`, `surf`) and the transparent decal overlay. */
function kartLivery(): THREE.MeshStandardNodeMaterial { return memo(pk('kartLivery'), () => buildKartLivery(profile.hq)); }
function kartOverlay(): THREE.MeshStandardNodeMaterial { return memo(pk('kartOverlay'), () => buildKartOverlay(kartAtlas(), profile.hq)); }
function emissive(c: string, intensity: number): THREE.MeshBasicNodeMaterial { return memo(keyOf('emissive', [c, intensity]), () => buildEmissive(c, intensity)); }
function emissiveVertex(intensity = 3): THREE.MeshBasicNodeMaterial { return memo(keyOf('emissiveV', intensity), () => buildEmissiveVertex(intensity)); }
function neon(c: string, intensity = 4, flicker = 0): THREE.MeshBasicNodeMaterial { return memo(keyOf('neon', [c, intensity, flicker]), () => buildNeon(c, intensity, flicker)); }
/** Additive flame material (legacy two-colour form). */
function flame(c1: string, c2: string): THREE.MeshBasicNodeMaterial { return memo(keyOf('flame', [c1, c2]), () => buildFlame(c1, c2)); }
/** One additive flame for all karts; colours come from `mesh.userData` ({@link FlameUserData}). */
function flameShared(): THREE.MeshBasicNodeMaterial { return memo('flameShared', buildFlameShared); }
function foliage(a: string, b: string): THREE.MeshStandardNodeMaterial { return memo(keyOf('foliage', [a, b]), () => buildFoliage(a, b, false)); }
/** Vertex-coloured props with wind sway above ~1.5 m (trees, bushes, reeds). */
function foliageLit(): THREE.MeshStandardNodeMaterial { return memo('foliageLit', () => buildFoliage('#000', '#000', true)); }
function vertexLit(roughness = 0.7, metalness = 0): THREE.MeshStandardNodeMaterial { return memo(keyOf('vlit', [roughness, metalness]), () => buildVertexLit(roughness, metalness)); }
function bubble(c: string, bands = false): THREE.MeshBasicNodeMaterial { return memo(keyOf('bubble', [c, bands]), () => buildBubble(c, bands)); }
/** Time Attack ghost hologram (shared by every mesh of the ghost kart and mascot). */
function ghost(): THREE.MeshBasicNodeMaterial { return memo('ghost', buildGhost); }
function ringDecal(c: string): THREE.MeshBasicNodeMaterial { return memo(keyOf('ring', c), () => buildRingDecal(c)); }
/** Registry entry for systems that build their own node graph (particles, skids, sky): still counted and shared. */
function custom<T extends THREE.Material>(key: string, make: () => T): T { return memo(`custom:${key}`, make); }

export const boostUniform = uniform(0);
const counted = new Set<THREE.Material>();

export const MaterialLibrary = {
  configure, world, road, kerb, wall, terrain, water, boostPad, killPlane, startLine, vinyl, kartPaint, emissive, emissiveVertex, neon,
  flame, flameShared, foliage, foliageLit, vertexLit, bubble, ringDecal, custom,
  mascotVinyl, mascotGlass, mascotEyes, kartLivery, kartOverlay, ghost,
  /** Look uniforms shared by all library materials (rim boost, wind, wetness, pulse). */
  uniforms: fxUniforms,
  /** Library materials plus any still-local L8 ones (the promoted ones are the same objects, counted once). */
  count(): number {
    counted.clear();
    for (const m of cache.values()) counted.add(m);
    for (const m of localMaterials()) counted.add(m);
    return counted.size;
  },
  keys(): string[] { return [...cache.keys()]; },
  get(key: string): THREE.Material | undefined { return cache.get(key); },
  dispose(): void { for (const m of cache.values()) m.dispose(); cache.clear(); },
};
export type MaterialLibraryT = typeof MaterialLibrary;
export { Fn };
