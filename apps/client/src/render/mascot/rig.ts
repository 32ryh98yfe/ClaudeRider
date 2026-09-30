// Clawd vinyl-voxel base rig (ADR-011): 12×8 body ratio, 2×2 arm stubs, 4 legs, eye slots, no mouth, sparkle tuft.
// Local frame: +Z forward (faces the kart's travel direction), +Y up, units = metres at scale 1 (body 1.0 m wide).
import * as THREE from 'three/webgpu';
import { MaterialLibrary } from '../materials/library.ts';
import { merge, paint, place, rbox, box, sparkleGeometry } from '../util/geo.ts';

export interface MascotPalette { body: string; shade: string; accent: string; detail: string; eye: string }
export type EyeExpr = 'open' | 'blink' | 'happy' | 'dizzy' | 'star' | 'angry';
export interface MascotPose { steer: number; lean: number; speed01: number; drifting: boolean; boosting: boolean; airborne: boolean; hit: 0 | 1 | 2 }
export type EmoteSlot = 'idle' | 'win' | 'podium' | 'lose' | 'retire' | 'attackLanded' | 'gotHit' | 'lobby';

export interface AccessoryBuild { geometry: THREE.BufferGeometry; anchor: 'head_top' | 'back' | 'hand_L' | 'hand_R' | 'face_front' | 'body'; animated?: 'spin' | 'sway' }
export interface CharacterDef {
  id: string;
  palette: MascotPalette;
  accessories: ReadonlyArray<(pal: MascotPalette) => AccessoryBuild>;
  eyeStyle: 'slot' | 'led' | 'visor';
  voxel?: boolean;         // Pixel: true voxel look (no rounding)
  sparkle?: string;        // sparkle colour ('' = none)
  rim?: string;
}

export interface MascotInstance {
  root: THREE.Group;
  anchors: Record<'head_top' | 'back' | 'hand_L' | 'hand_R' | 'face_front', THREE.Object3D>;
  setPose(p: MascotPose, dt: number): void;
  playEmote(e: EmoteSlot): void;
  setEyes(expr: EyeExpr): void;
  setTeamTint(c: THREE.Color | null): void;
  dispose(): void;
}

export function buildMascot(def: CharacterDef): MascotInstance {
  const pal = def.palette;
  const root = new THREE.Group();
  root.name = `mascot:${def.id}`;
  const bodyPivot = new THREE.Group(); // leans / bobs
  root.add(bodyPivot);
  const r = def.voxel ? 0.001 : 0.16;
  // body: main block + darker belly band + legs + arm stubs (all vertex coloured, one draw)
  const parts: THREE.BufferGeometry[] = [
    paint(place(rbox(1.0, 0.68, 0.64, r, def.voxel ? 1 : 4), 0, 0.34, 0), pal.body),
    paint(place(rbox(0.9, 0.08, 0.6, def.voxel ? 0.001 : 0.03, 2), 0, 0.02, 0), pal.shade),
  ];
  for (const lx of [-0.375, -0.125, 0.125, 0.375]) parts.push(paint(place(box(0.125, 0.18, 0.2), lx, -0.07, 0.02), pal.shade));
  const bodyMesh = new THREE.Mesh(merge(parts), MaterialLibrary.vinyl({ rim: def.rim ?? '#ffd9c7', roughness: def.voxel ? 0.6 : 0.42, clearcoat: def.voxel ? 0.2 : 0.6 }));
  bodyMesh.castShadow = true;
  bodyPivot.add(bodyMesh);
  const armL = new THREE.Mesh(paint(rbox(0.2, 0.2, 0.26, def.voxel ? 0.001 : 0.06, 2), pal.body), bodyMesh.material);
  const armR = armL.clone();
  armL.position.set(-0.6, 0.36, 0.05); armR.position.set(0.6, 0.36, 0.05);
  armL.castShadow = armR.castShadow = true;
  bodyPivot.add(armL, armR);
  // eyes: dark slots on the front face
  const eyeGeo = def.eyeStyle === 'visor' ? paint(rbox(0.62, 0.16, 0.04, 0.03, 2), pal.eye) : paint(rbox(0.09, 0.2, 0.03, 0.02, 2), pal.eye);
  const eyeMat = def.eyeStyle === 'led' ? MaterialLibrary.emissive(pal.eye, 2.2) : MaterialLibrary.vertexLit(0.25, 0);
  const eyes = new THREE.Group();
  if (def.eyeStyle === 'visor') { const v = new THREE.Mesh(eyeGeo, eyeMat); v.position.set(0, 0.44, 0.325); eyes.add(v); }
  else for (const ex of [-0.24, 0.24]) { const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(ex, 0.43, 0.322); eyes.add(e); }
  bodyPivot.add(eyes);
  // anchors
  const anchors = {
    head_top: new THREE.Object3D(), back: new THREE.Object3D(), hand_L: new THREE.Object3D(), hand_R: new THREE.Object3D(), face_front: new THREE.Object3D(),
  };
  anchors.head_top.position.set(0, 0.68, 0); anchors.back.position.set(0, 0.34, -0.32); anchors.face_front.position.set(0, 0.4, 0.33);
  anchors.hand_L.position.set(0, 0, 0.1); anchors.hand_R.position.set(0, 0, 0.1);
  bodyPivot.add(anchors.head_top, anchors.back, anchors.face_front);
  armL.add(anchors.hand_L); armR.add(anchors.hand_R);
  // sparkle tuft
  let sparkle: THREE.Mesh | null = null;
  if (def.sparkle !== '') {
    sparkle = new THREE.Mesh(paint(sparkleGeometry(0.2, 0.05, 11), def.sparkle ?? '#faf9f5'), MaterialLibrary.vinyl({ rim: '#ffffff', clearcoat: 1, roughness: 0.25 }));
    sparkle.position.set(0, 0.2, 0);
    anchors.head_top.add(sparkle);
  }
  const spinners: THREE.Object3D[] = [];
  for (const acc of def.accessories) {
    const a = acc(pal);
    const m = new THREE.Mesh(a.geometry, MaterialLibrary.vinyl({ rim: def.rim ?? '#ffd9c7' }));
    m.castShadow = true;
    const anchor = a.anchor === 'body' ? bodyPivot : anchors[a.anchor];
    anchor.add(m);
    if (a.animated === 'spin') spinners.push(m);
  }

  let t = 0, blinkT = 3 + Math.random() * 2, emote: EmoteSlot | null = null, emoteT = 0, expr: EyeExpr = 'open', squash = 0, wasAir = false;
  const inst: MascotInstance = {
    root, anchors,
    setPose(p: MascotPose, dt: number): void {
      t += dt;
      // blink
      blinkT -= dt;
      const blinking = blinkT < 0.12 && blinkT > 0;
      if (blinkT < 0) blinkT = 2.5 + Math.random() * 3;
      eyes.scale.y = expr === 'happy' ? 0.35 : blinking || expr === 'blink' ? 0.15 : 1;
      // bob + lean + steer
      const bob = Math.abs(Math.sin(t * (6 + p.speed01 * 10))) * 0.025 * (0.3 + p.speed01);
      if (wasAir && !p.airborne) squash = 1;
      wasAir = p.airborne;
      squash = Math.max(0, squash - dt * 5);
      const sq = 1 - 0.12 * Math.sin(squash * Math.PI);
      bodyPivot.position.y = bob + (p.airborne ? 0.04 : 0);
      bodyPivot.scale.set(1 + (1 - sq) * 0.6, sq, 1 + (1 - sq) * 0.6);
      const targetLean = -p.lean * 0.21 - p.steer * 0.08;
      bodyPivot.rotation.z += (targetLean - bodyPivot.rotation.z) * Math.min(1, dt * 10);
      bodyPivot.rotation.y += (-p.steer * 0.25 - bodyPivot.rotation.y) * Math.min(1, dt * 8);
      bodyPivot.rotation.x += ((p.boosting ? -0.12 : 0) - bodyPivot.rotation.x) * Math.min(1, dt * 6);
      armL.rotation.x = -0.9 + Math.sin(t * 2) * 0.03; armR.rotation.x = -0.9 + Math.sin(t * 2 + 1) * 0.03;
      armL.rotation.z = p.steer * 0.35; armR.rotation.z = p.steer * 0.35;
      if (p.hit) { bodyPivot.rotation.y += Math.sin(t * 30) * 0.2; }
      if (sparkle) sparkle.rotation.y += dt * (0.6 + p.speed01 * 4);
      for (const s of spinners) s.rotation.y += dt * 1.5;
      // emotes
      if (emote) {
        emoteT += dt;
        const k = emoteT;
        if (emote === 'win' || emote === 'podium' || emote === 'lobby') {
          bodyPivot.position.y += Math.abs(Math.sin(k * 7)) * 0.18;
          armL.rotation.x = -2.6 + Math.sin(k * 14) * 0.4; armR.rotation.x = -2.6 + Math.cos(k * 14) * 0.4;
          if (emote === 'win') bodyPivot.rotation.y = k * 6;
        } else if (emote === 'lose' || emote === 'retire') {
          bodyPivot.rotation.x = 0.35; armL.rotation.x = 0.2; armR.rotation.x = 0.2; eyes.scale.y = 0.4;
        } else if (emote === 'attackLanded') {
          armR.rotation.x = -2.8; bodyPivot.position.y += Math.abs(Math.sin(k * 10)) * 0.08;
        }
        if (emoteT > 2.2) { emote = null; bodyPivot.rotation.y = 0; }
      }
    },
    playEmote(e: EmoteSlot): void { emote = e; emoteT = 0; if (e === 'win' || e === 'podium' || e === 'attackLanded') expr = 'happy'; setTimeout(() => { expr = 'open'; }, 2000); },
    setEyes(e: EyeExpr): void { expr = e; },
    setTeamTint(c: THREE.Color | null): void { if (sparkle && c) (sparkle.material as THREE.MeshPhysicalNodeMaterial).emissive = c; },
    dispose(): void { root.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); },
  };
  return inst;
}
