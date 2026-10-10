// Bake development-only reference geometry without changing the shipped roster or its maps.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildTrack } from '@cr/trackc/build.ts';

const source = new URL('./reference_pad.ctd', import.meta.url);
const output = new URL('../../apps/client/public/reference/', import.meta.url);
const result = buildTrack(readFileSync(source, 'utf8'), source.pathname, { terrain: false, props: false, ao: false, pvs: false });
mkdirSync(output, { recursive: true });
writeFileSync(new URL('reference_pad.ctrk', output), result.ctrk);
writeFileSync(new URL('reference_pad.vis', output), result.vis);
console.log(`reference_pad: ${result.track.hash}, ${result.ctrk.length} physics bytes / ${result.vis.length} visual bytes`);
