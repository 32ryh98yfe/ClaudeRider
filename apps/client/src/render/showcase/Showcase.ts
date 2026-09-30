// Lobby / title 3D showcase: Clawd in a kart on a turntable, soft studio cyclorama, warm key light + rim.
import * as THREE from 'three/webgpu';
import { color, mix, positionWorld, smoothstep, pass, renderOutput, mrt, output, emissive } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { buildMascot, type MascotInstance } from '../mascot/rig.ts';
import { getCharacter } from '../characters/registry.ts';
import { getKartBody } from '../karts/registry.ts';
import type { KartModel, Livery } from '../karts/types.ts';

export class Showcase {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  private turntable = new THREE.Group();
  private mascot: MascotInstance | null = null;
  private kart: KartModel | null = null;
  private pipe: THREE.RenderPipeline;
  private t = 0;
  offsetX = 0.9;

  private renderer: THREE.WebGPURenderer;

  constructor(renderer: THREE.WebGPURenderer) {
    this.renderer = renderer;
    const s = this.scene;
    s.background = new THREE.Color('#1c1a17');
    // cyclorama
    const cyc = new THREE.Mesh(new THREE.SphereGeometry(40, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2 + 0.2), new THREE.MeshStandardNodeMaterial({ side: THREE.BackSide, roughness: 1 }));
    (cyc.material as THREE.MeshStandardNodeMaterial).colorNode = mix(color('#3a2a22'), color('#d97757'), smoothstep(-2, 18, positionWorld.y)).mul(0.55);
    s.add(cyc);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.05 }));
    (floor.material as THREE.MeshStandardNodeMaterial).colorNode = mix(color('#f0e2d2'), color('#5a3a2c'), smoothstep(2, 16, positionWorld.xz.length()));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    s.add(floor);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.2, 0.12, 64), new THREE.MeshPhysicalNodeMaterial({ color: '#faf9f5', roughness: 0.3, clearcoat: 1 }));
    disc.position.y = 0.06; disc.receiveShadow = true;
    this.turntable.add(disc);
    s.add(this.turntable);
    const key = new THREE.DirectionalLight('#ffe7cf', 3.2); key.position.set(4, 7, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4; key.shadow.camera.right = 4; key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
    const rim = new THREE.DirectionalLight('#9fd3f5', 2.2); rim.position.set(-5, 4, -6);
    s.add(key, rim, new THREE.HemisphereLight('#ffe9d8', '#4a3228', 1.1));
    this.camera.position.set(0, 2.2, 7.4);
    this.camera.lookAt(0, 0.7, 0);
    this.pipe = new THREE.RenderPipeline(renderer);
    const sp = pass(s, this.camera);
    sp.setMRT(mrt({ output, emissive }));
    this.pipe.outputColorTransform = false;
    this.pipe.outputNode = fxaa(renderOutput(sp.getTextureNode('output').add(bloom(sp.getTextureNode('emissive'), 0.6, 0.4, 0))));
  }

  setLoadout(characterId: string, kartBodyId: string, livery: Livery): void {
    if (this.kart) { this.turntable.remove(this.kart.root); this.kart.dispose(); }
    if (this.mascot) this.mascot.dispose();
    const kart = getKartBody(kartBodyId).build(livery);
    kart.root.position.y = 0.12;
    kart.root.scale.setScalar(1.35);
    const m = buildMascot(getCharacter(characterId));
    m.root.scale.setScalar(0.6);
    kart.seat.add(m.root);
    kart.root.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; } });
    this.turntable.add(kart.root);
    this.kart = kart; this.mascot = m;
    m.playEmote('lobby');
  }

  emote(): void { this.mascot?.playEmote('win'); }

  frame(dt: number): void {
    this.t += dt;
    this.turntable.rotation.y = -0.6 + Math.sin(this.t * 0.35) * 0.55;
    this.mascot?.setPose({ steer: Math.sin(this.t * 0.8) * 0.3, lean: 0, speed01: 0.05, drifting: false, boosting: false, airborne: false, hit: 0 }, dt);
    this.kart?.update({ steer: Math.sin(this.t * 0.8) * 0.3, wheelSpin: 0, boost: 0, drift: false, speed: 0 }, dt);
    const w = this.renderer.domElement.clientWidth, h = this.renderer.domElement.clientHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.setViewOffset(w, h, -w * 0.18 * this.offsetX, 0, w, h);
    this.camera.updateProjectionMatrix();
    this.pipe.render();
  }

  dispose(): void { this.pipe.dispose(); this.kart?.dispose(); this.mascot?.dispose(); this.scene.clear(); }
}
