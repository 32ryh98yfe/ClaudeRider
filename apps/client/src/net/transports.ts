// Browser byte transports (B9 Transport): a WebSocket to the game server, and a MessagePort to the offline authority
// Worker. Both carry the same binary frames, so the race code does not know which one it runs over.
import type { Transport } from '@cr/net';

let nextId = 1;

export function wsTransport(ws: WebSocket): Transport {
  ws.binaryType = 'arraybuffer';
  const t: Transport = {
    id: `ws${nextId++}`,
    onMessage: null,
    onClose: null,
    send(bytes: Uint8Array): void { if (ws.readyState === WebSocket.OPEN) ws.send(bytes as Uint8Array<ArrayBuffer>); },
    close(code = 1000, reason = 'closed'): void { if (ws.readyState <= WebSocket.OPEN) ws.close(code, reason.slice(0, 120)); },
    bufferedAmount: () => ws.bufferedAmount,
  };
  ws.addEventListener('message', (e: MessageEvent) => {
    if (e.data instanceof ArrayBuffer) t.onMessage?.(new Uint8Array(e.data));
  });
  let closed = false;
  const fire = (reason: string): void => { if (closed) return; closed = true; t.onClose?.(reason); };
  ws.addEventListener('close', (e: CloseEvent) => fire(e.reason || `code ${e.code}`));
  ws.addEventListener('error', () => fire('error'));
  return t;
}

/** Transport over a MessagePort (or a Worker scope). Frames are structured-cloned. */
export function portTransport(port: { postMessage(m: unknown): void; onmessage: ((e: MessageEvent) => void) | null; close?(): void }): Transport {
  let open = true;
  const t: Transport = {
    id: `port${nextId++}`,
    onMessage: null,
    onClose: null,
    send(bytes: Uint8Array): void { if (open) port.postMessage(bytes); },
    close(_code?: number, reason = 'closed'): void {
      if (!open) return;
      open = false;
      try { port.postMessage({ close: reason }); } catch { /* port gone */ }
      port.close?.();
      t.onClose?.(reason);
    },
    bufferedAmount: () => 0,
  };
  port.onmessage = (e: MessageEvent) => {
    const d = e.data as unknown;
    if (d instanceof Uint8Array) t.onMessage?.(d);
    else if (d && typeof d === 'object' && 'close' in d) { if (open) { open = false; t.onClose?.(String((d as { close: unknown }).close)); } }
  };
  return t;
}
