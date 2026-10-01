// LOCAL L8 kart materials — FOR L11 TO PROMOTE into render/materials (MaterialLibrary.kartPaint / a decal material).
// Two materials serve every kart and every livery in the scene:
//   kartPaint   — opaque skinned body: candy paint (clearcoat 1.0 / 0.1) with the livery pattern evaluated in TSL from
//                 the bind-pose position, so a livery change only rewrites vertex attributes (no new material);
//                 rubber, chrome, brass and neon come from the per-vertex `surf` attribute.
//   kartOverlay — transparent skinned overlay: race numbers, stickers and crests from a canvas atlas, glass and
//                 emissive underglow.
import * as THREE from 'three/webgpu';
import {
  attribute, vertexColor, float, vec3, pow, max, dot, mix, smoothstep, step, fract, floor, abs, mod, sin, texture, uv, clamp,
  normalView, positionViewDirection, positionGeometry, mx_noise_float, select, length, min, output, vec4,
} from 'three/tsl';
import { registerLocalMaterial } from '../mascot/materials.ts';

/** Livery patterns (Livery.pattern). i18n names live under karts.pattern.<id>. */
export const LIVERY_PATTERNS = ['solid', 'stripes', 'chevrons', 'checker', 'split', 'camo', 'circuit', 'filigree', 'panels', 'aurora', 'flames', 'dots'] as const;
export type LiveryPattern = typeof LIVERY_PATTERNS[number];

/**
 * Candy-paint kart material. Attributes: color (base / primary), pcol (pattern colour / secondary), surf (rough, metal,
 * glow, clearcoat), pat (0 = unpainted; else pattern id + 1 + param/2 where param is the kart's split height).
 */
export function kartPaint(): THREE.MeshPhysicalNodeMaterial {
  return registerLocalMaterial('kartPaint', () => {
    const m = new THREE.MeshPhysicalNodeMaterial({ clearcoatRoughness: 0.1 });
    const P = positionGeometry;
    const s = attribute('surf', 'vec4');
    const pat = attribute('pat', 'float');
    const pc = attribute('pcol', 'vec3');
    const base = vertexColor().rgb;
    const pid = floor(pat).sub(1);
    const param = fract(pat).mul(2);
    const ax = abs(P.x);
    const stripes = step(abs(ax.sub(0.11)), 0.045);
    const chev = step(0.6, fract(P.z.add(ax.mul(0.9)).mul(2.2)));
    const checker = mod(floor(P.x.mul(6)).add(floor(P.y.mul(6))).add(floor(P.z.mul(6))), 2);
    const split = step(P.y, param);
    const camo = step(0.12, mx_noise_float(floor(P.mul(6)).mul(0.41).add(0.3)));
    const gx = abs(fract(P.z.mul(4)).sub(0.5)), gy = abs(fract(P.x.mul(4).add(0.5)).sub(0.5));
    const gate = step(0.0, mx_noise_float(floor(P.mul(4)).mul(0.77)));
    const pads = step(length(fract(P.mul(4)).sub(0.5)), 0.13);
    const circuit = clamp(step(gx, 0.045).mul(gate).add(step(gy, 0.04).mul(gate.oneMinus())).add(pads), 0, 1);
    // ornamental scrollwork: thin isolines of two interfering waves (reads as gold filigree, not stripes)
    const fw = sin(P.z.mul(9).add(sin(P.x.mul(7).add(P.y.mul(5))).mul(1.6))).add(sin(P.x.mul(9).add(P.y.mul(4)).add(sin(P.z.mul(6)).mul(1.6))));
    const filigree = step(abs(fract(fw.mul(1.4)).sub(0.5)), 0.06);
    const pz = fract(P.z.mul(3.2)), py = fract(P.y.mul(3.2).add(0.2));
    const seam = step(0.93, max(pz, py));
    const rivet = step(length(vec3(pz.sub(0.08), py.sub(0.08), 0)), 0.04);
    const panels = clamp(seam.add(rivet), 0, 1);
    const aurora = smoothstep(0.1, 0.9, P.y.mul(1.6).add(sin(P.z.mul(3.4).add(P.x.mul(2))).mul(0.18)).add(0.1));
    const fl = mx_noise_float(vec3(P.x.mul(3), P.y.mul(3), P.z.mul(1.2))).mul(0.35);
    const flames = step(P.z.mul(-1).add(0.35).add(fl), abs(P.x).mul(0.8).add(P.y.mul(0.3)).mul(-1).add(0.9)).mul(step(-0.35, P.z));
    const dots = step(length(fract(P.mul(5)).sub(0.5)), 0.2);
    type F = ReturnType<typeof select<'float'>>;
    const pick = (i: number, a: F | ReturnType<typeof float>, rest: F | ReturnType<typeof float>): F => select<'float'>(pid.equal(i), a as F, rest as F);
    const mask0 = pick(1, stripes, pick(2, chev, pick(3, checker, pick(4, split, pick(5, camo, pick(6, circuit, pick(7, filigree, pick(8, panels, pick(9, aurora, pick(10, flames, pick(11, dots, float(0))))))))))));
    const painted = step(0.5, pat);
    const mask = mask0.mul(painted);
    m.colorNode = mix(base, pc, mask);
    m.roughnessNode = s.x;
    m.metalnessNode = s.y;
    m.clearcoatNode = s.w;
    const fres = pow(float(1).sub(max(dot(normalView, positionViewDirection), 0)), 3.0);
    m.emissiveNode = mix(base, pc, mask).mul(s.z).add(vec3(1, 0.96, 0.92).mul(fres.mul(0.1).mul(s.w)));
    void min;
    return m;
  });
}

// ---------------- overlay atlas ----------------
/** 8 × 4 cells of 128 px. Digits 0–9 are cells 0–9. */
export const KART_CELLS = {
  sparkle: 10, roundel: 11, crest: 12, crown: 13, gauge: 14, arrow: 15,
  glow: 16, white: 17, checker: 18, star: 19, bolt: 20, snow: 21, ring: 22, flameIcon: 23, plate: 24, vent: 25, headlight: 26, shadow: 27,
} as const;
export type KartCell = keyof typeof KART_CELLS | number;
export const KART_ATLAS = { cols: 8, rows: 4, cell: 128 } as const;

let atlas: THREE.Texture | null = null;
/** Canvas atlas (white shapes on transparent; colour comes from the vertex colour). Regenerated once fonts are ready. */
export function kartAtlas(): THREE.Texture {
  if (atlas) return atlas;
  if (typeof document === 'undefined') {
    atlas = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    atlas.needsUpdate = true;
    return atlas;
  }
  const { cols, rows, cell: C } = KART_ATLAS;
  const cv = document.createElement('canvas');
  cv.width = cols * C; cv.height = rows * C;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = (): void => {
    const g = cv.getContext('2d')!;
    g.clearRect(0, 0, cv.width, cv.height);
    const at = (i: number): [number, number] => [(i % cols) * C + C / 2, Math.floor(i / cols) * C + C / 2];
    g.fillStyle = '#fff'; g.strokeStyle = '#fff';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let d = 0; d <= 9; d++) {
      const [x, y] = at(d);
      g.font = '900 italic 118px "Barlow Condensed", "Arial Narrow", sans-serif';
      g.fillText(String(d), x + 2, y + 6);
    }
    const star = (x: number, y: number, R: number, r: number, n: number, rot = -Math.PI / 2): void => {
      g.beginPath();
      for (let k = 0; k < n * 2; k++) { const a = rot + (k * Math.PI) / n, rr = k % 2 ? r : R; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.closePath(); g.fill();
    };
    { // sparkle sticker: 10 rays, original shape (not the Claude logo)
      const [x, y] = at(KART_CELLS.sparkle); let s = 7;
      const rnd = (): number => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + (rnd() - 0.5) * 0.24, R = 58 * (0.85 + rnd() * 0.2);
        const a0 = a - (Math.PI / 10) * 0.55, a1 = a + (Math.PI / 10) * 0.55;
        g.lineTo(x + Math.cos(a0) * 17, y + Math.sin(a0) * 17); g.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R); g.lineTo(x + Math.cos(a1) * 17, y + Math.sin(a1) * 17);
      }
      g.closePath(); g.fill();
    }
    { const [x, y] = at(KART_CELLS.roundel); g.beginPath(); g.arc(x, y, 58, 0, Math.PI * 2); g.fill(); }
    { // crest: shield with a chevron cut
      const [x, y] = at(KART_CELLS.crest);
      g.beginPath(); g.moveTo(x - 46, y - 52); g.lineTo(x + 46, y - 52); g.lineTo(x + 46, y + 4); g.quadraticCurveTo(x + 40, y + 42, x, y + 58); g.quadraticCurveTo(x - 40, y + 42, x - 46, y + 4); g.closePath(); g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.moveTo(x - 30, y - 10); g.lineTo(x, y + 18); g.lineTo(x + 30, y - 10); g.lineWidth = 12; g.stroke();
      g.globalCompositeOperation = 'source-over';
    }
    { const [x, y] = at(KART_CELLS.crown); g.beginPath(); g.moveTo(x - 52, y + 36); g.lineTo(x - 56, y - 30); g.lineTo(x - 26, y); g.lineTo(x, y - 44); g.lineTo(x + 26, y); g.lineTo(x + 56, y - 30); g.lineTo(x + 52, y + 36); g.closePath(); g.fill(); }
    { // gauge dial
      const [x, y] = at(KART_CELLS.gauge); g.lineWidth = 9; g.beginPath(); g.arc(x, y, 50, 0, Math.PI * 2); g.stroke();
      for (let k = 0; k < 9; k++) { const a = Math.PI * 0.75 + (k / 8) * Math.PI * 1.5; g.lineWidth = 5; g.beginPath(); g.moveTo(x + Math.cos(a) * 32, y + Math.sin(a) * 32); g.lineTo(x + Math.cos(a) * 42, y + Math.sin(a) * 42); g.stroke(); }
      g.lineWidth = 8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 26, y - 22); g.stroke();
    }
    { const [x, y] = at(KART_CELLS.arrow); g.beginPath(); g.moveTo(x - 50, y + 30); g.lineTo(x, y - 30); g.lineTo(x + 50, y + 30); g.lineTo(x + 30, y + 30); g.lineTo(x, y - 2); g.lineTo(x - 30, y + 30); g.closePath(); g.fill(); }
    { const [x, y] = at(KART_CELLS.glow); const gr = g.createRadialGradient(x, y, 0, x, y, 62); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - 64, y - 64, 128, 128); g.fillStyle = '#fff'; }
    { const [x, y] = at(KART_CELLS.white); g.fillRect(x - 60, y - 60, 120, 120); }
    { const [x, y] = at(KART_CELLS.checker); for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) if ((a + b) % 2 === 0) g.fillRect(x - 60 + a * 20, y - 60 + b * 20, 20, 20); }
    { const [x, y] = at(KART_CELLS.star); star(x, y, 58, 24, 5); }
    { const [x, y] = at(KART_CELLS.bolt); g.beginPath(); g.moveTo(x + 12, y - 60); g.lineTo(x - 30, y + 8); g.lineTo(x - 2, y + 8); g.lineTo(x - 14, y + 60); g.lineTo(x + 32, y - 10); g.lineTo(x + 4, y - 10); g.closePath(); g.fill(); }
    { const [x, y] = at(KART_CELLS.snow); g.lineWidth = 9; g.lineCap = 'round'; for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 54, y + Math.sin(a) * 54); g.stroke(); const bx = x + Math.cos(a) * 32, by = y + Math.sin(a) * 32; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a + s * 0.8) * 16, by + Math.sin(a + s * 0.8) * 16); g.stroke(); } } }
    { const [x, y] = at(KART_CELLS.ring); g.lineWidth = 14; g.beginPath(); g.arc(x, y, 48, 0, Math.PI * 2); g.stroke(); }
    { const [x, y] = at(KART_CELLS.flameIcon); g.beginPath(); g.moveTo(x, y - 60); g.bezierCurveTo(x + 50, y - 10, x + 44, y + 50, x, y + 58); g.bezierCurveTo(x - 44, y + 50, x - 50, y - 10, x, y - 60); g.fill(); }
    { const [x, y] = at(KART_CELLS.plate); g.beginPath(); g.roundRect(x - 60, y - 40, 120, 80, 14); g.fill(); }
    { const [x, y] = at(KART_CELLS.vent); for (let k = 0; k < 5; k++) { g.beginPath(); g.roundRect(x - 56, y - 50 + k * 22, 112, 12, 6); g.fill(); } }
    { const [x, y] = at(KART_CELLS.headlight); const gr = g.createRadialGradient(x, y, 0, x, y, 60); gr.addColorStop(0, '#fff'); gr.addColorStop(0.55, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.62, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 62, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; }
    // contact shadow: a flat dark core out to ~60 % of the radius (the kart footprint), then a soft rim
    { const [x, y] = at(KART_CELLS.shadow); const gr = g.createRadialGradient(x, y, 0, x, y, 62); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.58, 'rgba(255,255,255,0.92)'); gr.addColorStop(0.8, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - 64, y - 64, 128, 128); g.fillStyle = '#fff'; }
    tex.needsUpdate = true;
  };
  draw();
  // numbers use Barlow Condensed; redraw once webfonts are ready so the first kart never keeps a fallback face
  document.fonts?.ready.then(draw).catch(() => undefined);
  atlas = tex;
  return tex;
}

/** UV rectangle [u0, v0, u1, v1] of an atlas cell. */
export function cellUv(c: KartCell): [number, number, number, number] {
  const i = typeof c === 'number' ? c : KART_CELLS[c];
  const { cols, rows } = KART_ATLAS;
  const col = i % cols, row = Math.floor(i / cols);
  return [col / cols, 1 - (row + 1) / rows, (col + 1) / cols, 1 - row / rows];
}

/** Transparent overlay (decals, glass, underglow). surf.x = opacity scale, surf.z = glow. */
export function kartOverlay(): THREE.MeshStandardNodeMaterial {
  return registerLocalMaterial('kartOverlay', () => {
    const m = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 0.25, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide });
    const t = texture(kartAtlas(), uv());
    const s = attribute('surf', 'vec4');
    const c = vertexColor().rgb.mul(t.rgb);
    m.colorNode = c;
    m.opacityNode = t.a.mul(s.x);
    m.roughnessNode = s.y;
    m.emissiveNode = c.mul(s.z);
    // surf.w = 1: the contact shadow, unlit black (see rigs.ts buildKartOverlay)
    m.outputNode = mix(output, vec4(0, 0, 0, output.a), step(0.5, s.w));
    return m;
  });
}
