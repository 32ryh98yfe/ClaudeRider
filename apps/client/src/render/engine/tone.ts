// Display transform (ADR-015, 33-ultra-graphics §2). ACES filmic on every tier: rolled-off highlights and filmic
// contrast, as the graphics brief asks. The two constants keep the art bible's colours: a CPU fit
// (test/ultra-foundations.test.ts) of grade(ACES(e·x)) against the previous Neutral(x) over the brand, road, grass,
// sky and kerb swatches at 0.6–1.2× lighting gives mean ΔE_OKLab < 0.02 with e = 0.72 and a ×1.13 grade saturation.
// Dev A/B: `?tone=neutral` restores the previous transform (exposure and saturation factors become 1).
import * as THREE from 'three/webgpu';

const neutral = typeof location !== 'undefined' && new URLSearchParams(location.search).get('tone') === 'neutral';

export const TONE_MAPPING = neutral ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
/** Multiplies every theme exposure (ACES brightens mid-tones by 1/0.6 internally). */
export const ACES_EXPOSURE = neutral ? 1 : 0.72;
/** Multiplies every grade saturation (ACES desaturates mid-tones). */
export const ACES_SATURATION = neutral ? 1 : 1.13;
