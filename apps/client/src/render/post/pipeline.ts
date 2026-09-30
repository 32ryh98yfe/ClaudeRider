// Post chain (ADR-011): scene pass (MRT output+emissive) → bloom on emissive → boost radial blur → tone map → grade → FXAA → vignette.
import * as THREE from 'three/webgpu';
import { pass, mrt, output, emissive, uniform, vec4, screenUV, renderOutput, vec3, dot, mix, float } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';

export interface Post { pipeline: THREE.RenderPipeline; boost: { value: number }; render(): void; setScene(scene: THREE.Scene, camera: THREE.Camera): void; dispose(): void }

export function createPost(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, opts: { bloom: boolean; fxaa: boolean }): Post {
  const pipeline = new THREE.RenderPipeline(renderer);
  const boost = uniform(0);
  const build = (s: THREE.Scene, c: THREE.Camera): void => {
    const scenePass = pass(s, c);
    scenePass.setMRT(mrt({ output, emissive }));
    const beauty = scenePass.getTextureNode('output');
    const col = opts.bloom ? beauty.add(bloom(scenePass.getTextureNode('emissive'), 0.9, 0.45, 0.0)) : beauty;
    const toned = renderOutput(col);
    // grade: gentle saturation boost
    const luma = dot(toned.rgb, vec3(0.2126, 0.7152, 0.0722));
    const graded = mix(vec3(luma), toned.rgb, float(1.1));
    // vignette, stronger while boosting
    const d = screenUV.distance(0.5);
    const vig = d.remap(0.45, 0.95).clamp().mul(boost.mul(0.35).add(0.22)).oneMinus();
    const out = vec4(graded.mul(vig), toned.a);
    pipeline.outputColorTransform = false;
    pipeline.outputNode = opts.fxaa ? fxaa(out) : out;
    pipeline.needsUpdate = true;
  };
  build(scene, camera);
  return {
    pipeline, boost,
    render(): void { pipeline.render(); },
    setScene(s: THREE.Scene, c: THREE.Camera): void { build(s, c); },
    dispose(): void { pipeline.dispose(); },
  };
}
