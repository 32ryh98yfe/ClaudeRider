// Screen-space contact shadows for the sun (S-Light; 33-ultra-graphics §5). Stub until the stream lands: returns
// null, or a float node (1 = lit) the Ultra chain multiplies into the sun's shadow through the scene pass context.
import type { PostIO } from './stages.ts';

type N = any;

export function contactShadowNode(_io: PostIO): N | null { return null; }
