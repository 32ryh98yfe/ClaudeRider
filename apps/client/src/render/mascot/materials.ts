// LOCAL L8 materials — FOR L11 TO PROMOTE into render/materials (MaterialLibrary).
// Kept here because the MaterialLibrary is owned by L11 (CLAUDE.md lanes). Budget: each of these is ONE material shared
// by every mascot in the scene (per-character variation lives in vertex attributes), so all 12 characters together cost
// 3 materials: vinyl (opaque, skinned), eyes (alpha-tested atlas) and glass (transparent). They count toward the
// ≤ 40-per-scene budget through `localMaterialCount()`.
import * as THREE from 'three/webgpu';
import {
  attribute, vertexColor, float, vec2, vec3, pow, max, dot, mix, smoothstep, fract, texture, uv, normalView, positionViewDirection, color,
} from 'three/tsl';

const cache = new Map<string, THREE.Material>();
function memo<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) { m = make(); m.name = `l8:${key}`; cache.set(key, m); }
  return m;
}
/** Every L8-local material created so far (mascots + karts). L11's BudgetTracker should add this to its count. */
export function localMaterialCount(): number { return cache.size; }
export function localMaterials(): IterableIterator<THREE.Material> { return cache.values(); }
export function registerLocalMaterial<T extends THREE.Material>(key: string, make: () => T): T { return memo(key, make); }

/**
 * Vinyl-toy mascot material (MeshPhysicalNodeMaterial): colour from the baked partId palette (vertex colour),
 * roughness/metalness/glow/clearcoat from the `surf` attribute, sheen 0.2, TSL Fresnel rim through emissiveNode.
 */
export function mascotVinyl(): THREE.MeshPhysicalNodeMaterial {
  return memo('mascotVinyl', () => {
    const m = new THREE.MeshPhysicalNodeMaterial({ clearcoatRoughness: 0.25, sheen: 0.2, sheenRoughness: 0.6 });
    m.sheenColor.set('#fff1e8');
    const s = attribute('surf', 'vec4');
    const base = vertexColor().rgb;
    m.colorNode = base;
    m.roughnessNode = s.x;
    m.metalnessNode = s.y;
    m.clearcoatNode = s.w;
    const fres = pow(float(1).sub(max(dot(normalView, positionViewDirection), 0)), 2.5);
    // metals keep a cooler, weaker rim so copper reads as metal rather than plastic
    const rim = color('#ffd9c7').mul(fres).mul(float(0.36).mul(float(1).sub(s.y.mul(0.55))));
    m.emissiveNode = base.mul(s.z).add(rim);
    return m;
  });
}

/** Transparent glass for bubble helmets, crystal shells and visors: Fresnel-weighted opacity (reads as a bubble). */
export function mascotGlass(): THREE.MeshPhysicalNodeMaterial {
  return memo('mascotGlass', () => {
    const m = new THREE.MeshPhysicalNodeMaterial({ transparent: true, depthWrite: false, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 });
    const s = attribute('surf', 'vec4');
    const base = vertexColor().rgb;
    const fres = pow(float(1).sub(max(dot(normalView, positionViewDirection), 0)), 2.0);
    m.colorNode = base;
    m.roughnessNode = s.x;
    m.opacityNode = mix(float(0.05), float(0.78), fres).add(s.z.mul(0.15)).clamp(0, 1);
    m.emissiveNode = base.mul(s.z).add(vec3(1, 1, 1).mul(fres.mul(0.22)));
    return m;
  });
}

// ---------------- eye atlas ----------------
/** Cell order in the 4×2 eye atlas (art bible §7: open, blink, happy, dizzy, star, angry, sleepy, wink). */
export const EYE_CELLS = { open: 0, blink: 1, happy: 2, dizzy: 3, star: 4, angry: 5, sleepy: 6, wink: 7 } as const;
export type EyeCell = keyof typeof EYE_CELLS;
export const EYE_ATLAS = { cols: 4, rows: 2, cellW: 192, cellH: 256 } as const;
/** Eye quad size in rig metres; the atlas cell aspect (3:4) matches it. The open slot inside is 0.09 × 0.20. */
export const EYE_QUAD = { w: 0.18, h: 0.24 } as const;

let atlasTex: THREE.Texture | null = null;

/**
 * 768×512 canvas atlas: red = eye shape, green = glint, on black (no premultiplied-alpha edge issues).
 * Headless / Node (no DOM): a 1×1 white texture keeps materials valid.
 */
export function eyeAtlas(): THREE.Texture {
  if (atlasTex) return atlasTex;
  if (typeof document === 'undefined') {
    atlasTex = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
    atlasTex.needsUpdate = true;
    return atlasTex;
  }
  const { cols, rows, cellW: W, cellH: H } = EYE_ATLAS;
  const cv = document.createElement('canvas');
  cv.width = cols * W; cv.height = rows * H;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
  g.globalCompositeOperation = 'lighter';
  const SHAPE = '#ff0000', GLINT = '#00ff00';
  const slotW = W * 0.5, slotH = H * (0.2 / 0.24);
  const cell = (i: number, draw: (cx: number, cy: number) => void): void => {
    const cx = (i % cols) * W + W / 2, cy = Math.floor(i / cols) * H + H / 2;
    g.save(); g.beginPath(); g.rect(cx - W / 2 + 4, cy - H / 2 + 4, W - 8, H - 8); g.clip(); draw(cx, cy); g.restore();
  };
  const rr = (x: number, y: number, w: number, h: number, r: number, c: string): void => { g.fillStyle = c; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
  const glint = (x: number, y: number, r: number): void => { g.fillStyle = GLINT; g.beginPath(); g.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2); g.fill(); };
  const stroke = (w: number): void => { g.strokeStyle = SHAPE; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); };
  // open: the Clawd slot, a crisp tall rectangle with soft corners and a small toy glint
  cell(0, (cx, cy) => { rr(cx - slotW / 2, cy - slotH / 2, slotW, slotH, 16, SHAPE); glint(cx - slotW * 0.2, cy - slotH * 0.3, 12); });
  // blink: closed lid
  cell(1, (cx, cy) => { rr(cx - slotW * 0.62, cy + slotH * 0.12, slotW * 1.24, 26, 13, SHAPE); });
  // happy: ^ arch
  cell(2, (cx, cy) => { g.beginPath(); g.moveTo(cx - 62, cy + 40); g.quadraticCurveTo(cx, cy - 90, cx + 62, cy + 40); stroke(30); });
  // dizzy: spiral
  cell(3, (cx, cy) => {
    g.beginPath();
    for (let k = 0; k <= 120; k++) { const t = k / 120, a = t * Math.PI * 5.2, r = 6 + t * 70; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 1.15; if (k) g.lineTo(x, y); else g.moveTo(x, y); }
    stroke(15);
  });
  // star
  cell(4, (cx, cy) => {
    g.fillStyle = SHAPE; g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 36 : 86; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    g.closePath(); g.fill(); glint(cx - 16, cy - 22, 10);
  });
  // angry / determined: the slot with its inner-top corner cut (drawn for the viewer-right eye; the other is mirrored)
  cell(5, (cx, cy) => {
    const x0 = cx - slotW / 2, x1 = cx + slotW / 2, yb = cy + slotH / 2 - 10, yt = cy - slotH / 2 + 30;
    g.fillStyle = SHAPE; g.beginPath(); g.moveTo(x0, yt + 62); g.lineTo(x1, yt); g.lineTo(x1, yb); g.lineTo(x0, yb); g.closePath(); g.fill();
  });
  // sleepy: heavy lid, lower half of the slot
  cell(6, (cx, cy) => { rr(cx - slotW / 2, cy + slotH * 0.08, slotW, slotH * 0.38, 14, SHAPE); rr(cx - slotW * 0.62, cy + slotH * 0.02, slotW * 1.24, 18, 9, SHAPE); });
  // wink: '>' chevron (used for one eye only)
  cell(7, (cx, cy) => { g.beginPath(); g.moveTo(cx - 44, cy - 58); g.lineTo(cx + 40, cy); g.lineTo(cx - 44, cy + 58); stroke(26); });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  atlasTex = tex;
  return tex;
}

/**
 * Eye decal material (alpha-tested, opaque pass so it composes correctly under glass helmets).
 * Attributes: color (eye colour), eyeFx (x = glow, y = LED dot-matrix flag). Shape and glint come from the atlas.
 */
export function mascotEyes(): THREE.MeshStandardNodeMaterial {
  return memo('mascotEyes', () => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.18, metalness: 0, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const t = texture(eyeAtlas(), uv());
    const fx = attribute('eyeFx', 'vec2');
    const shape = t.r, glint = t.g;
    // LED screens (Bolt): round dot matrix, 12 × 16 dots per cell
    const grid = fract(uv().mul(vec2(EYE_ATLAS.cols * 12, EYE_ATLAS.rows * 16))).sub(0.5);
    const dotM = smoothstep(0.5, 0.32, grid.length());
    const led = mix(float(1), dotM, fx.y);
    const base = vertexColor().rgb;
    const gl = glint.mul(float(1).sub(fx.y));
    m.colorNode = mix(base, vec3(1, 1, 1), gl);
    m.opacityNode = max(shape.mul(led), gl);
    m.emissiveNode = base.mul(fx.x).mul(shape).add(vec3(1, 1, 1).mul(gl.mul(0.35)));
    return m;
  });
}
