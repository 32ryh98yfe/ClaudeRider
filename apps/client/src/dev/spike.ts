import * as THREE from 'three/webgpu';
import { pass, mrt, output, emissive, color, positionWorld, sin, time, renderOutput, mix, float } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';

declare global { interface Window { __spike?: { backend: string; frames: number; ok: boolean; err?: string } } }

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const forceWebGL = params.get('renderer') === 'webgl2';
  const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL });
  renderer.setSize(960, 540);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);
  await renderer.init();
  const backend = (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#9fd3f5');
  const camera = new THREE.PerspectiveCamera(60, 960 / 540, 0.1, 500);
  camera.position.set(4, 3, 6);
  camera.lookAt(0, 0.5, 0);

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.position.set(5, 10, 4);
  sun.castShadow = true;
  scene.add(sun, new THREE.HemisphereLight(0xcfe8ff, 0x8fb573, 1.0));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardNodeMaterial({ roughness: 0.9 }));
  (ground.material as THREE.MeshStandardNodeMaterial).colorNode = mix(color('#8fb573'), color('#5a7a44'), sin(positionWorld.x.mul(0.8)).mul(sin(positionWorld.z.mul(0.8))).mul(0.5).add(0.5));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const clawdMat = new THREE.MeshPhysicalNodeMaterial({ color: '#D87656', roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 1.0), clawdMat);
  body.position.y = 0.8;
  body.castShadow = true;
  scene.add(body);

  const glowMat = new THREE.MeshStandardNodeMaterial({ color: '#ffffff' });
  glowMat.emissiveNode = color('#ff7a50').mul(float(4).add(sin(time.mul(3))));
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), glowMat);
  orb.position.set(-1.6, 1.2, 0.5);
  scene.add(orb);

  const pipeline = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  scenePass.setMRT(mrt({ output, emissive }));
  const beauty = scenePass.getTextureNode('output');
  const glow = bloom(scenePass.getTextureNode('emissive'), 1.0, 0.5);
  pipeline.outputColorTransform = false;
  pipeline.outputNode = fxaa(renderOutput(beauty.add(glow)));

  let frames = 0;
  const t0 = performance.now();
  const loop = (): void => {
    body.rotation.y += 0.02;
    pipeline.render();
    frames++;
    if (frames < 30) requestAnimationFrame(loop);
    else window.__spike = { backend, frames, ok: true, err: String(performance.now() - t0) };
  };
  loop();
}
main().catch((e: unknown) => { window.__spike = { backend: '?', frames: 0, ok: false, err: String((e as Error)?.stack ?? e) }; });
