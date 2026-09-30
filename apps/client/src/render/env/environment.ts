// Sky, sun (shadow-casting, follows the camera target), hemisphere fill, fog and PMREM environment reflections.
import * as THREE from 'three/webgpu';
import { color, mix, positionLocal, normalize, smoothstep, mx_noise_float, step } from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import type { ThemeKit } from '../themes/kit.ts';

export interface Environment { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; sky: THREE.Object3D; follow(target: THREE.Vector3): void; dispose(): void }

export async function buildEnvironment(renderer: THREE.WebGPURenderer, scene: THREE.Scene, kit: ThemeKit, shadowSize: number): Promise<Environment> {
  const L = kit.look, d = kit.data;
  const elev = THREE.MathUtils.degToRad(L.sky.elevationDeg), az = THREE.MathUtils.degToRad(L.sky.azimuthDeg);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elev, az);
  let sky: THREE.Object3D;
  if (L.sky.night || d.sky === 'night' || d.sky === 'space' || d.sky === 'underground') {
    const g = new THREE.SphereGeometry(4000, 32, 16);
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, fog: false });
    const h = normalize(positionLocal).y;
    const stars = step(0.985, mx_noise_float(normalize(positionLocal).mul(220)).mul(0.5).add(0.5)).mul(smoothstep(0.0, 0.3, h));
    m.colorNode = mix(color(L.sky.bottom ?? '#2a2450'), color(L.sky.top ?? '#070818'), smoothstep(-0.1, 0.6, h)).add(stars.mul(0.9));
    sky = new THREE.Mesh(g, m);
  } else {
    const s = new SkyMesh();
    s.scale.setScalar(4500);
    s.turbidity.value = L.sky.turbidity; s.rayleigh.value = L.sky.rayleigh;
    s.mieCoefficient.value = 0.004; s.mieDirectionalG.value = 0.82;
    s.sunPosition.value.copy(sunDir);
    sky = s;
  }
  scene.add(sky);
  // environment reflections from the sky (procedural "HDRI")
  const envScene = new THREE.Scene();
  const envSky = sky.clone();
  envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(envScene, 0.02, 1, 5000);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  const sun = new THREE.DirectionalLight(L.sun.color, L.sun.intensity);
  sun.castShadow = shadowSize > 0;
  if (shadowSize > 0) {
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    const c = sun.shadow.camera;
    c.left = -60; c.right = 60; c.top = 60; c.bottom = -60; c.near = 1; c.far = 400;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  }
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(L.hemi.sky, L.hemi.ground, L.hemi.intensity);
  scene.add(hemi);
  scene.fog = new THREE.Fog(L.fogColor ?? d.fog.color, d.fog.near, d.fog.far);
  if (!(sky instanceof SkyMesh)) scene.background = new THREE.Color(L.sky.top ?? '#070818');

  return {
    sun, hemi, sky,
    follow(target: THREE.Vector3): void {
      sun.position.copy(target).addScaledVector(sunDir, 180);
      sun.target.position.copy(target);
      sky.position.set(target.x, 0, target.z);
    },
    dispose(): void { envRT.dispose(); scene.remove(sky, sun, hemi); },
  };
}
