// Post chain per tier (30-art-bible §6, 40-perf-budgets §1):
//   scene pass (MRT: output + emissive [+ normal for GTAO]; MSAA on High)
//   → GTAO (High) → boost radial blur + chromatic aberration → + bloom (emissive MRT; Low uses an in-pass tap glow)
//   → renderOutput (Neutral tone map + sRGB) → grade (CDL + theme tint; split-tone "LUT" on Medium+)
//   → speed lines, instant-boost flash, hit vignette, fade → AA (FXAA / SMAA; none with MSAA).
// Every effect is driven by uniforms so the graph is built once per scene; nothing here allocates per frame.
import * as THREE from 'three/webgpu';
import {
  pass, mrt, output, emissive, uniform, vec2, vec3, vec4, float, uv, renderOutput, dot, mix, smoothstep, Fn, Loop, If, int,
  time, atan, fract, abs, sin, normalView, packNormalToRGB, unpackRGBToNormal, sample, clamp, max, mx_noise_float, cdl,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { compileInContext } from '../engine/warm.ts';
import type { TierSettings, Backend } from '../quality.ts';
import type { Environment } from '../env/environment.ts';
import type { PostFrameInput } from './stages.ts';

type N = any;

export interface GradeParams { slope: number; saturation: number; tint: THREE.ColorRepresentation; offset?: number; power?: number; shadows?: THREE.ColorRepresentation; highlights?: THREE.ColorRepresentation; bloom?: number }

export interface PostUniforms {
  boost: { value: number };      // 0..1 boost juice (blur, CA, vignette)
  speed: { value: number };      // 0..1 speed for speed lines
  flash: { value: number };      // 0..1 instant-boost / start-boost white-cyan flash
  hit: { value: number };        // 0..1 red hit vignette
  fade: { value: number };       // 0..1 fade to the fade colour (scene transitions)
  blur: { value: number };       // radial blur strength (set from boost × reduced motion)
  chroma: { value: number };     // chromatic aberration strength
  lines: { value: number };      // speed-line strength
  bloomStrength: { value: number };
}

export interface Post {
  pipeline: THREE.RenderPipeline;
  /** Legacy alias of `u.boost`. */
  boost: { value: number };
  u: PostUniforms;
  render(): void;
  setScene(scene: THREE.Scene, camera: THREE.Camera): void;
  setGrade(g: GradeParams): void;
  setResolutionScale(s: number): void;
  /** Per-frame camera/time inputs (DoF focus, TRAA/motion-blur history resets). No allocation. */
  frame(input: PostFrameInput): void;
  /**
   * Compiles the scene's programs in the scene pass's own context (its render target + MRT), so the programs
   * match what the first real frame links. A plain `renderer.compileAsync()` targets the canvas without MRT and
   * builds a second, unused set of programs (on SwiftShader each link costs 0.3–3 s).
   */
  warm(): Promise<void>;
  dispose(): void;
}

export interface PostOptions {
  ts: TierSettings; reducedMotion?: boolean; grade?: GradeParams;
  /** Race only: the light rig (CSM, aerial perspective) and the backend, for the Ultra chain's stages. */
  env?: Environment; backend?: Backend;
}

export function createPost(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, opts: PostOptions | { bloom: boolean; fxaa: boolean }): Post {
  const ts: Partial<TierSettings> = 'ts' in opts ? opts.ts : { bloom: opts.bloom, fxaa: opts.fxaa, aa: opts.fxaa ? 'fxaa' : 'none', blurTaps: 16 };
  const pipeline = new THREE.RenderPipeline(renderer);
  const ux: Record<keyof PostUniforms, N> = {
    boost: uniform(0), speed: uniform(0), flash: uniform(0), hit: uniform(0), fade: uniform(0),
    blur: uniform(0), chroma: uniform(0), lines: uniform(0), bloomStrength: uniform(ts.bloomStrength ?? 0.9),
  };
  const u = ux as PostUniforms;
  const slope: N = uniform(new THREE.Vector3(1.05, 1.05, 1.05)), offset: N = uniform(new THREE.Vector3(0, 0, 0)), power: N = uniform(new THREE.Vector3(1, 1, 1));
  const sat: N = uniform(1.1), tint: N = uniform(new THREE.Color('#ffffff'));
  const shadowTone: N = uniform(new THREE.Color('#e8f0ff')), highTone: N = uniform(new THREE.Color('#fff4e6'));
  const fadeColor: N = uniform(new THREE.Color('#141413'));
  const taps = Math.max(0, ts.blurTaps ?? 16);
  const aa = ts.aa ?? (ts.fxaa ? 'fxaa' : 'none');
  let scenePass: N = null;
  let bloomNode: N = null;

  const build = (s: THREE.Scene, c: THREE.Camera): void => {
    scenePass = pass(s, c, aa === 'msaa' ? { samples: 4 } : undefined);
    const outputs: Record<string, N> = { output, emissive: vec4(emissive, output.a) };
    // GTAO pairs this normal with the depth buffer, so only materials that write depth may write it. Smoke, sparks,
    // skids and other depth-less FX write rgba 0 under their own blending, which leaves the opaque surface's normal
    // in place; before, their camera-facing quads overwrote it and GTAO drew dark, hard-edged squares round every
    // drifting kart (and the desert dust motes)
    if (ts.ssao) outputs['normal'] = Fn((b: N) => (b.material && b.material.transparent && !b.material.depthWrite ? vec4(0) : vec4(packNormalToRGB(normalView), 1)))();
    const m = mrt(outputs);
    // emissive follows the material's blending so additive sparks add glow and soft smoke only dims it
    m.setBlendMode('emissive', new THREE.BlendMode(THREE.MaterialBlending));
    if (ts.ssao) m.setBlendMode('normal', new THREE.BlendMode(THREE.MaterialBlending));
    scenePass.setMRT(m);
    const beauty = scenePass.getTextureNode('output');
    const emis = scenePass.getTextureNode('emissive');
    let aoTex: N = null;
    if (ts.ssao) {
      const nrmTex = scenePass.getTextureNode('normal');
      const sceneNormal = sample((st: N) => unpackRGBToNormal(nrmTex.sample(st)));
      const aoPass = ao(scenePass.getTextureNode('depth'), sceneNormal, c);
      aoPass.resolutionScale = 0.5;
      aoPass.radius.value = 0.6; aoPass.thickness.value = 1.2; aoPass.distanceExponent.value = 1.5;
      aoTex = aoPass.getTextureNode();
    }
    // High+ thresholds the emissive buffer (ts.bloomThreshold): idle lamps and paint never halo in daylight, while
    // boost flames, sparks and item hits (emissive well above 1) still glow
    bloomNode = ts.bloom && (ts.bloomMode ?? 'mips') === 'mips' ? bloom(emis, ux.bloomStrength, ts.bloomRadius ?? 0.45, ts.bloomThreshold ?? 0) : null;

    const hdr = Fn(() => {
      const st = uv();
      const toC = vec2(0.5, 0.52).sub(st);
      // chromatic aberration: R pushed out, B pulled in (radial), only while boosting. Kept to ≈ 2 px at the frame
      // edge and none over the middle of the screen, where the player's kart and the road ahead sit: a strong
      // full-frame split doubled every outline and made the kart look translucent.
      const ca = ux.chroma.mul(0.0025).mul(smoothstep(0.22, 0.75, toC.length()));
      const dir = toC.normalize();
      const col = ((ts.chroma ?? 0) > 0
        ? vec3(beauty.sample(st.sub(dir.mul(ca))).r, beauty.sample(st).g, beauty.sample(st.add(dir.mul(ca))).b)
        : beauty.sample(st).rgb).toVar();
      if (taps > 0) {
        // boost radial blur toward the look-at point; the uniform guard skips the taps when not boosting
        If(ux.blur.greaterThan(0.002), () => {
          const acc = vec3(0).toVar();
          const w = float(1).toVar();
          const wsum = float(0).toVar();
          const stepV = toC.mul(ux.blur.mul(0.16).div(taps));
          Loop({ start: int(0), end: int(taps), type: 'int', condition: '<' }, ({ i }: { i: N }) => {
            const p = st.add(stepV.mul(float(i)));
            acc.addAssign(beauty.sample(p).rgb.mul(w));
            wsum.addAssign(w);
            w.mulAssign(0.93);
          });
          const k = smoothstep(0.12, 0.55, toC.length()).mul(clamp(ux.blur.mul(3), 0, 1));
          col.assign(mix(col, acc.div(wsum), k));
        });
      }
      if (aoTex) col.mulAssign(mix(float(1), aoTex.sample(st).r, 0.75));
      if (bloomNode) col.addAssign(bloomNode.rgb);
      else if (ts.bloom) col.addAssign(tapGlow(emis, st).mul(u.bloomStrength));
      return vec4(col, 1);
    });

    const graded = Fn(() => {
      const toned = renderOutput(hdr());
      let c: N = cdl(toned, slope, offset, power, sat).rgb.mul(tint);
      if (ts.lut) {
        // split-tone stand-in for a LUT: cool shadows, warm highlights, kept subtle so brand colours stay true
        const l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(c.mul(shadowTone), c.mul(highTone), smoothstep(0.15, 0.85, l));
      }
      const st = uv();
      const d = st.sub(vec2(0.5, 0.5));
      const r = d.length();
      if (ts.speedLines) {
        // screen-space speed lines: thin radial streaks that scroll outward, only near the edges
        const ang = atan(d.y, d.x);
        const cell = ang.mul(38);
        const lane = fract(cell);
        const seed = mx_noise_float(vec2(cell.floor(), 3.1)).mul(0.5).add(0.5);
        const streak = smoothstep(0.08, 0.0, abs(lane.sub(0.5))).mul(smoothstep(0.62, 0.9, seed));
        const flow = fract(r.mul(2.2).sub(time.mul(3.4)).add(seed.mul(7)));
        const lines = streak.mul(smoothstep(0.0, 0.25, flow).mul(smoothstep(1.0, 0.6, flow))).mul(smoothstep(0.28, 0.62, r));
        c = c.add(vec3(1, 0.98, 0.94).mul(lines.mul(ux.lines).mul(0.55)));
      }
      // instant/start boost flash: a white-cyan rim from the edges inward (never a wash over the kart in the centre)
      c = mix(c, vec3(0.85, 1.0, 1.0), ux.flash.mul(smoothstep(0.25, 0.85, r)).mul(0.3));
      // vignette (stronger in boost), red hit edges
      const vig = smoothstep(0.42, 0.92, r).mul(ux.boost.mul(0.32).add(0.24));
      c = c.mul(float(1).sub(vig));
      c = mix(c, vec3(0.9, 0.12, 0.1), smoothstep(0.35, 0.85, r).mul(ux.hit).mul(0.55));
      c = mix(c, vec3(fadeColor), ux.fade);
      return vec4(max(c, vec3(0)), 1);
    });

    pipeline.outputColorTransform = false;
    const out = graded();
    pipeline.outputNode = aa === 'fxaa' ? fxaa(out) : aa === 'smaa' ? smaa(out) : out;
    pipeline.needsUpdate = true;
  };
  build(scene, camera);

  const post: Post = {
    pipeline, boost: u.boost, u,
    render(): void { pipeline.render(); },
    setScene(s: THREE.Scene, c: THREE.Camera): void { build(s, c); },
    setGrade(g: GradeParams): void {
      slope.value.setScalar(g.slope);
      offset.value.setScalar(g.offset ?? 0);
      power.value.setScalar(g.power ?? 1);
      sat.value = g.saturation;
      tint.value.set(g.tint);
      shadowTone.value.set(g.shadows ?? '#eaf0ff');
      highTone.value.set(g.highlights ?? '#fff5e8');
      if (g.bloom !== undefined) u.bloomStrength.value = g.bloom;
    },
    setResolutionScale(s: number): void { scenePass?.setResolutionScale(s); },
    frame(): void { /* the High/Medium/Low chain has no temporal state */ },
    async warm(): Promise<void> {
      if (!scenePass) return;
      await compileInContext(renderer, scenePass.renderTarget, scenePass.getMRT(), () => renderer.compileAsync(scenePass.scene, scenePass.camera));
    },
    dispose(): void { pipeline.dispose(); bloomNode?.dispose?.(); },
  };
  if ('ts' in opts && opts.grade) post.setGrade(opts.grade);
  return post;
}

// Low tier: no bloom mip chain (12 extra passes); glow is a sparse 12-tap disc on the emissive MRT instead.
const GLOW_TAPS: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  for (let ring = 0; ring < 2; ring++) {
    const r = ring === 0 ? 0.006 : 0.016, w = ring === 0 ? 0.11 : 0.05;
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + ring * 0.52; out.push([Math.cos(a) * r, Math.sin(a) * r * 1.7, w]); }
  }
  return out;
})();

function tapGlow(emis: N, st: N): N {
  let acc: N = emis.sample(st).rgb.mul(0.25);
  for (const [x, y, w] of GLOW_TAPS) acc = acc.add(emis.sample(st.add(vec2(x, y))).rgb.mul(w));
  return acc;
}

export { sin };
