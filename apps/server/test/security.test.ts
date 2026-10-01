// M4 security review regressions (docs/design/reviews/M4-server-security.md): per-IP and global caps, sockets that
// never read, frame floods, lobby state abuse and input filters, on the fake clock with scripted clients.
import { describe, expect, it } from 'vitest';
import { World } from './fixture.ts';

describe('connections', () => {
  it('a socket whose hello is refused (bad name) is still closed by the hello timeout (item 6)', () => {
    const w = new World();
    const c = w.client('');
    c.hello();
    expect(c.errors()).toContain('nameInvalid');
    expect(c.closed).toBeNull();
    w.advance(11_000);
    expect(c.closed).toBe('hello timeout');
    // a good hello on time is never timed out
    const ok = w.client('Fine').hello();
    w.advance(11_000);
    expect(ok.closed).toBeNull();
    expect(ok.last('welcome')).toBeDefined();
  });
});
