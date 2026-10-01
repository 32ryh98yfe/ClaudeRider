/* global GPUTexture, GPUDevice, GPUAdapter -- the init script runs in the page, where WebGPU defines these */
// WebGPU-on-SwiftShader shim for headless Chromium 141 (Playwright 1.56.1, chromium-1194) + three@0.186.1.
//
// Why: three r186 always passes `swizzle: 'rgba'` in GPUTextureViewDescriptor (the newer *string* form of
// the 'texture-component-swizzle' feature). Chromium 141 with --enable-unsafe-webgpu exposes that feature
// but still types `swizzle` as the older GPUTextureComponentSwizzle *dictionary* ({r,g,b,a}), so WebIDL
// conversion throws a TypeError on the first createView() of a render target. The shim drops the key
// when it is the identity (the default anyway) and converts any other string to the dictionary form.
//
// Flags (bisected on chromium-1194 / Chrome 141.0.7390.37 headless shell):
//  --enable-unsafe-webgpu                       exposes navigator.gpu adapter google/swiftshader (fallback)
//  --enable-features=Vulkan --use-vulkan=swiftshader   BOTH required: without them init() and the first
//      submit succeed but the device is lost on first present ("A valid external Instance reference no
//      longer exists"). --use-webgpu-adapter=swiftshader is redundant here (the adapter already is).
//  --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist   the repo's WebGL2 flags.
//
// Use as a library:
//   import { WEBGPU_ARGS, webgpuInitScript, launchWebGPU } from './webgpu.mjs';
//   const browser = await chromium.launch({ args: WEBGPU_ARGS });
//   await context.addInitScript(webgpuInitScript);
// or as a CLI (screenshots + console log):
//   node tools/shots/webgpu.mjs "<url>" <outPrefix> [waitMs|key:<Key>|eval:<js> ...]
import { chromium } from '@playwright/test';

/** Flags that give navigator.gpu a SwiftShader (Vulkan CPU) adapter in headless Chromium 141. */
export const WEBGPU_ARGS = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan',
  '--use-vulkan=swiftshader',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--autoplay-policy=no-user-gesture-required',
];

/** Runs in the page before any script (page/context.addInitScript). Must be self-contained. */
export function webgpuInitScript() {
  const g = globalThis;
  if (typeof g.GPUTexture === 'undefined' || g.__crWebgpuShim) return;
  g.__crWebgpuShim = { strippedSwizzle: 0, gpuErrors: [], shaderErrors: [], shaderWarnings: 0, shaderModules: 0 };
  const S = g.__crWebgpuShim;
  const COMP = { r: 'r', g: 'g', b: 'b', a: 'a', 0: 'zero', 1: 'one' };

  // 1) createView: string swizzle -> dropped (identity) or converted to the {r,g,b,a} dictionary.
  //    Copies the descriptor: three reuses one module-level descriptor object for every call.
  const createView = GPUTexture.prototype.createView;
  GPUTexture.prototype.createView = function (desc) {
    if (desc && typeof desc.swizzle === 'string') {
      const sw = desc.swizzle;
      const copy = {};
      for (const k in desc) if (k !== 'swizzle') copy[k] = desc[k];
      if (sw !== 'rgba' && sw.length === 4) copy.swizzle = { r: COMP[sw[0]], g: COMP[sw[1]], b: COMP[sw[2]], a: COMP[sw[3]] };
      S.strippedSwizzle++;
      return createView.call(this, copy);
    }
    return createView.call(this, desc);
  };

  // 2) Surface WGSL compile diagnostics and uncaptured validation errors on the console.
  const createShaderModule = GPUDevice.prototype.createShaderModule;
  GPUDevice.prototype.createShaderModule = function (desc) {
    const mod = createShaderModule.call(this, desc);
    S.shaderModules++;
    // three resets its shared descriptor right after this call, so copy what the async report needs now
    const label = desc?.label || '(unlabeled)', code = String(desc?.code ?? '');
    mod.getCompilationInfo?.().then((info) => {
      for (const m of info.messages) {
        if (m.type === 'error') {
          const line = code.split('\n')[m.lineNum - 1] ?? '';
          const msg = `[webgpu-shim] WGSL ${m.type} ${label} L${m.lineNum}:${m.linePos} ${m.message.split('\n')[0]} | ${line.trim()}`;
          S.shaderErrors.push(msg); console.error(msg);
        } else if (m.type === 'warning') S.shaderWarnings++;
      }
    }).catch(() => {});
    return mod;
  };
  const requestDevice = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (desc) {
    const dev = await requestDevice.call(this, desc);
    dev.addEventListener('uncapturederror', (e) => {
      const msg = `[webgpu-shim] uncaptured ${e.error?.constructor?.name}: ${e.error?.message}`;
      if (S.gpuErrors.length < 200) S.gpuErrors.push(msg);
      console.error(msg);
    });
    dev.lost.then((i) => console.error(`[webgpu-shim] device lost: ${i.reason} ${i.message}`));
    return dev;
  };
}

/** Launch one browser + page with the flags and the init script. */
export async function launchWebGPU({ args = WEBGPU_ARGS, viewport = { width: 960, height: 540 }, shim = true, headlessShell = true } = {}) {
  const browser = await chromium.launch({ args, ...(headlessShell ? {} : { channel: 'chromium' }) });
  const context = await browser.newContext({ viewport });
  if (shim) await context.addInitScript(webgpuInitScript);
  const page = await context.newPage();
  return { browser, context, page };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const [url, out, ...steps] = process.argv.slice(2);
  if (!url || !out) { console.error('usage: webgpu-shim.mjs <url> <outPrefix> [steps...]'); process.exit(2); }
  const { browser, page } = await launchWebGPU({ shim: process.env.NO_SHIM !== '1', headlessShell: process.env.FULL_CHROMIUM !== '1' });
  const logs = [];
  page.on('console', (m) => { if (!/GL Driver Message/.test(m.text())) logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(url);
  let i = 0;
  for (const s of steps.length ? steps : ['5000']) {
    if (s.startsWith('key:')) await page.keyboard.press(s.slice(4));
    else if (s.startsWith('eval:')) logs.push(`[eval] ${JSON.stringify(await page.evaluate(s.slice(5)).catch((e) => String(e)))}`);
    else { await page.waitForTimeout(Number(s)); const f = `${out}-${i++}.png`; await page.screenshot({ path: f }); logs.push(`[shot] ${f}`); }
  }
  logs.push(`[shim] ${JSON.stringify(await page.evaluate(() => globalThis.__crWebgpuShim ?? null))}`);
  console.log(logs.join('\n'));
  await browser.close();
}
