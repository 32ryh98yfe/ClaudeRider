// Offline race authority in a module Worker: the RaceRoom runs off the main thread and talks to the page's NetClient
// over a MessagePort with the same binary protocol as the WebSocket server.
import { loadContent } from '@cr/content';
import { loadCtrk, type RaceConfig } from '@cr/sim';
import { determinismScenario } from '@cr/sim/testing/scenario.ts';
import { portTransport } from '../net/transports.ts';
import { LocalAuthority } from '../net/localAuthority.ts';

type InMsg =
  | { t: 'init'; config: RaceConfig; ctrk: ArrayBuffer; slot: number; port: MessagePort }
  | { t: 'selftest'; ctrk: ArrayBuffer };

const scope = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage(m: unknown): void };
let authority: LocalAuthority | null = null;

scope.onmessage = (e: MessageEvent) => {
  const m = e.data as InMsg;
  try {
    if (m.t === 'init') {
      const track = loadCtrk(m.ctrk);
      authority = new LocalAuthority({ config: m.config, track, content: loadContent(), slot: m.slot, transport: portTransport(m.port) });
      scope.postMessage({ t: 'ready', trackHash: track.hash });
    } else if (m.t === 'selftest') {
      // Worker determinism (M9: Node and Worker equal): the shared scenario's hashes, compared by e2e with Node
      const track = loadCtrk(m.ctrk), content = loadContent();
      scope.postMessage({ t: 'selftest', speed: determinismScenario(track, content, 'speed', 600), item: determinismScenario(track, content, 'item', 600) });
    }
  } catch (err) {
    scope.postMessage({ t: 'error', message: String((err as Error)?.stack ?? err) });
  }
};

export { authority };
