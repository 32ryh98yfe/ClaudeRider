# S-D: promote the theme "glow" vertex material into the MaterialLibrary

**Owner:** materials (`apps/client/src/render/materials/library.ts`). The earlier L7 and L6 requests asked for the same thing (`vertexGlow`; see the comments on `hdr()` in `themes/canopy_forest/shapes.ts` and `glow()` in `themes/ember_mine/shapes.ts`).

## What and why
Several theme kits paint their light parts with HDR vertex colours (channels above 1): lamp paper, flames, lit windows, carved pumpkin faces, lava seams, ore glints. The plain `vertexLit` material treats these as brighter albedo only. At night a lantern was therefore as dark as its post, and none of it reached the emissive MRT, so it never bloomed.

S-D ships a theme-local version through `MaterialLibrary.custom` (`themes/lantern_hollow/glow.ts`, key `custom:vglow:<roughness>:<gain>`). Lantern Hollow, Ember Mine and Coral Cove use it:
```ts
const m = new THREE.MeshStandardNodeMaterial({ roughness, metalness: 0 });
const c = vertexColor().rgb;
m.colorNode = vec4(min(c, vec3(1)), 1);
m.emissiveNode = max(c.sub(vec3(1)), vec3(0)).mul(gain);
```
Geometry without HDR colours renders exactly like `vertexLit(roughness, 0)`.

## Proposed change
Add `MaterialLibrary.vertexGlow(roughness = 0.8, gain = 1.3)` with the body above, memoised as `vglow:<r>:<g>`. Then point `themes/lantern_hollow/glow.ts` at it, or delete the file and update its three importers. Other kits with HDR vertex colours could then adopt it: canopy_forest (fireflies, lanterns) and neon_harbor (windows).
