// Per-theme light rig (30-art-bible §2, §4): sky by kind, PMREM reflections from that sky, sun/moon key light whose
// shadow frustum follows the player (texel-snapped, biased ahead of the camera), hemisphere fill, fog, exposure,
// optional water plane, and the shared look uniforms (rim boost, wind, wetness).
import * as THREE from 'three/webgpu';
import type { ThemeKit } from '../themes/kit.ts';
import type { TierSettings } from '../quality.ts';
import { MaterialLibrary } from '../materials/library.ts';
import { resolveEnvLook, type EnvLook } from './look.ts';
import { buildSky } from './sky.ts';

export interface Environment {
  look: EnvLook;
  sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; sky: THREE.Object3D;
  /** Keeps the sky centred and the shadow frustum on the player. `ahead` biases the frustum toward the view. */
  follow(target: THREE.Vector3, ahead?: THREE.Vector3): void;
  dispose(): void;
}

export async function buildEnvironment(renderer: THREE.WebGPURenderer, scene: THREE.Scene, kit: ThemeKit, ts: TierSettings | number, trackTheme: Record<string, string> = {}): Promise<Environment> {
  const shadowSize = typeof ts === 'number' ? ts : ts.shadowSize;
  const shadowFar = typeof ts === 'number' ? 120 : ts.shadowFar;
  const L = resolveEnvLook(kit, trackTheme);
  const sky = buildSky(L);
  scene.add(sky.object);
  scene.background = new THREE.Color(L.sky.top);

  // environment reflections from the sky itself (procedural "HDRI"), regenerated per race only
  const envScene = new THREE.Scene();
  envScene.add(sky.object.clone());
  const hemiEnv = new THREE.HemisphereLight(L.hemi.sky, L.hemi.ground, 0.4);
  envScene.add(hemiEnv);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(envScene, 0.03, 1, 5000);
  scene.environment = envRT.texture;
  scene.environmentIntensity = L.envIntensity;
  pmrem.dispose();

  const keyDir = sky.moonDir ?? L.sunDir;
  const sun = new THREE.DirectionalLight(L.sun.color, L.sun.intensity);
  sun.name = 'sun';
  sun.castShadow = shadowSize > 0 && L.sun.shadows;
  const half = shadowFar * 0.5;
  if (sun.castShadow) {
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    const c = sun.shadow.camera;
    c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 1; c.far = 500;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
    sun.shadow.intensity = L.kind === 'overcast' ? 0.45 : 0.85;
  }
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(L.hemi.sky, L.hemi.ground, L.hemi.intensity);
  scene.add(hemi);
  scene.fog = new THREE.Fog(L.fog.color, L.fog.near, L.fog.far);

  let water: THREE.Mesh | null = null;
  if (L.water) {
    const w = L.water;
    water = new THREE.Mesh(new THREE.PlaneGeometry(w.size ?? 3000, w.size ?? 3000, 1, 1).rotateX(-Math.PI / 2), MaterialLibrary.water({ shallow: w.shallow, deep: w.deep, foam: w.foam ?? '#ffffff' }));
    water.position.y = w.level;
    water.receiveShadow = true;
    water.name = 'water';
    scene.add(water);
  }

  const prevExposure = renderer.toneMappingExposure;
  renderer.toneMappingExposure = L.exposure;
  const U = MaterialLibrary.uniforms;
  U.rimBoost.value = L.rimBoost; U.wind.value = L.wind; U.wet.value = L.wet;

  // shadow texel snapping: moving the frustum in whole texels stops shadow edges from crawling
  const texel = shadowSize > 0 ? (half * 2) / shadowSize : 1;
  const lightRot = new THREE.Matrix4().lookAt(new THREE.Vector3(), keyDir.clone().negate(), new THREE.Vector3(0, 1, 0));
  const lightRotInv = lightRot.clone().invert();
  const tmp = new THREE.Vector3(), centre = new THREE.Vector3();

  return {
    look: L, sun, hemi, sky: sky.object,
    follow(target: THREE.Vector3, ahead?: THREE.Vector3): void {
      centre.copy(target);
      if (ahead) centre.addScaledVector(ahead, half * 0.45);
      if (shadowSize > 0) {
        tmp.copy(centre).applyMatrix4(lightRotInv);
        tmp.x = Math.round(tmp.x / texel) * texel; tmp.y = Math.round(tmp.y / texel) * texel;
        centre.copy(tmp).applyMatrix4(lightRot);
      }
      sun.target.position.copy(centre);
      sun.position.copy(centre).addScaledVector(keyDir, 200);
      sky.object.position.set(target.x, target.y, target.z);
      if (water) { water.position.x = target.x; water.position.z = target.z; }
    },
    dispose(): void {
      envRT.dispose();
      renderer.toneMappingExposure = prevExposure;
      U.rimBoost.value = 1; U.wind.value = 1; U.wet.value = 0;
      scene.remove(sky.object, sun, sun.target, hemi);
      if (water) { scene.remove(water); water.geometry.dispose(); }
      scene.environment = null; scene.fog = null;
      if (sky.object instanceof THREE.Mesh) sky.object.geometry.dispose();
    },
  };
}
