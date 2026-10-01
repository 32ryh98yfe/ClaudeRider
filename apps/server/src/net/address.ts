// The key per-address limits count against. IPv4 (and IPv4-mapped IPv6) is the address itself; IPv6 is its /64,
// because one subscriber usually gets a whole /64 and could otherwise rotate through addresses at will.
import type { IncomingMessage } from 'node:http';

export function addressKey(raw: string | undefined | null): string {
  let a = (raw ?? '').trim();
  if (!a) return 'unknown';
  if (a.startsWith('[')) a = a.slice(1, a.indexOf(']') > 0 ? a.indexOf(']') : undefined);
  const zone = a.indexOf('%');
  if (zone >= 0) a = a.slice(0, zone);
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(a);
  if (mapped) return mapped[1]!;
  if (!a.includes(':')) return a;
  const [head = '', tail] = a.toLowerCase().split('::', 2);
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = tail === undefined ? h : [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return a.toLowerCase();
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

/**
 * The client's address for an upgrade request. Behind a reverse proxy (`trustProxy`), it is the last
 * X-Forwarded-For entry: the one our proxy appended. Earlier entries come from the client and can be forged.
 */
export function clientAddress(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const h = req.headers['x-forwarded-for'];
    const list = (Array.isArray(h) ? h.join(',') : h ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const last = list[list.length - 1];
    if (last) return addressKey(last);
  }
  return addressKey(req.socket.remoteAddress);
}
