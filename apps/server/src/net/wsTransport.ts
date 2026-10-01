// A `ws` WebSocket as a byte Transport (B9): binary frames only, Nagle off, bufferedAmount for backpressure.
// A peer that stops reading is cut off (terminate, no close handshake) once more than `maxBufferedBytes` wait to be
// sent: otherwise every send to it stays in memory for as long as the socket lives.
import type { WebSocket } from 'ws';
import type { Transport } from '@cr/net';

let nextId = 1;

export const MAX_BUFFERED_BYTES = 1 << 20;

export function wsTransport(ws: WebSocket, maxBufferedBytes = MAX_BUFFERED_BYTES): Transport {
  const sock = (ws as unknown as { _socket?: { setNoDelay?(v: boolean): void } })._socket;
  sock?.setNoDelay?.(true);
  const t: Transport = {
    id: `ws${nextId++}`,
    onMessage: null,
    onClose: null,
    send(bytes: Uint8Array): void {
      if (ws.readyState !== ws.OPEN) return;
      if (ws.bufferedAmount > maxBufferedBytes) { ws.terminate(); return; }
      ws.send(bytes, { binary: true });
    },
    close(code = 1000, reason = 'closed'): void {
      if (ws.readyState === ws.CLOSED || ws.readyState === ws.CLOSING) return;
      // a close frame would queue behind the backlog it can never flush
      if (ws.bufferedAmount > maxBufferedBytes) { ws.terminate(); return; }
      try { ws.close(code, reason.slice(0, 120)); } catch { ws.terminate(); }
    },
    bufferedAmount: () => ws.bufferedAmount,
  };
  ws.binaryType = 'nodebuffer';
  ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
    if (!isBinary) return; // text frames are not part of the protocol
    const b = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
    t.onMessage?.(new Uint8Array(b.buffer, b.byteOffset, b.byteLength));
  });
  let closed = false;
  const fire = (reason: string): void => { if (closed) return; closed = true; t.onClose?.(reason); };
  ws.on('close', (code: number, reason: Buffer) => fire(reason.length ? reason.toString() : `code ${code}`));
  ws.on('error', (e: Error) => fire(`error ${e.message}`));
  return t;
}
