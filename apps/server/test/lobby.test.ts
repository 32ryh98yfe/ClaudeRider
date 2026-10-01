// Lobby FSM tests (20-netcode-spec §13.5): sessions, codes, host controls and migration, ready/auto-start, roulette,
// Quick Match timers, resume, chat limits — on a fake clock with scripted clients.
import { describe, expect, it } from 'vitest';
import { LOBBY_PROTOCOL_VERSION } from '@cr/net';
import { SIM_VERSION } from '@cr/sim';
import { CODE_ALPHABET, cleanChat, cleanName, normalizeCode, randomCode } from '../src/lobby/validate.ts';
import { World } from './fixture.ts';

function room(w: World, host = 'Host') {
  const h = w.client(host).hello();
  h.send({ t: 'create', settings: { mode: 'speed', teams: 'solo', track: 'proving_ring', laps: 1, fillBots: true, botTier: 'rookie', isPrivate: true, maxHumans: 8 } });
  const code = h.last('room')!.room.code;
  return { h, code };
}

describe('codes and validation', () => {
  it('codes are 6 chars without 0/O/1/I; input is case-insensitive and typos fail fast', () => {
    expect(CODE_ALPHABET).not.toMatch(/[01OI]/);
    expect(CODE_ALPHABET.length).toBe(32);
    const rand = (n: number): Uint8Array => { const a = new Uint8Array(n); globalThis.crypto.getRandomValues(a); return a; };
    for (let i = 0; i < 200; i++) { const c = randomCode(rand); expect(c).toMatch(/^[A-HJ-NP-Z2-9]{6}$/); }
    expect(normalizeCode('abc234')).toBe('ABC234');
    expect(normalizeCode('ABC0O1')).toBeNull();
    expect(normalizeCode('ABC23')).toBeNull();
  });

  it('names are 1–16 visible characters and filtered; chat is ≤ 200 chars and masked', () => {
    expect(cleanName('  클로드  ')).toBe('클로드');
    expect(cleanName('')).toBeNull();
    expect(cleanName('x'.repeat(17))).toBeNull();
    expect(cleanName('bad‮guy')).toBe('badguy');
    expect(cleanName('fuckface')).toBeNull();
    expect(cleanChat('a'.repeat(300))!.length).toBe(200);
    expect(cleanChat('you shit')).toBe('you ****');
  });
});

describe('sessions', () => {
  it('hello → welcome with a public id and a secret resume token; bad version and names are refused', () => {
    const w = new World();
    const a = w.client('Alpha').hello();
    const wel = a.last('welcome')!;
    expect(wel.session).toMatch(/^s/);
    expect(wel.resume).toMatch(/^[0-9a-f]{32}$/);
    expect(wel.session).not.toBe(wel.resume);
    const b = w.client('B').send({ t: 'hello', v: 99, name: 'B', loadout: a.last('welcome') as never });
    expect(b.errors()).toContain('version');
    const c = w.client('').hello();
    expect(c.errors()).toContain('nameInvalid');
  });

  it('an M4 client (lobby protocol 1, the pre-technique snapshot layout) is refused with error version and closed', () => {
    expect(LOBBY_PROTOCOL_VERSION).toBe(2);
    expect(SIM_VERSION).toBe(2);
    const w = new World();
    const old = w.client('Old').hello(undefined, 1);
    expect(old.errors()).toEqual(['version']);
    expect(old.last('welcome')).toBeUndefined();
    expect(old.closed).toBe('version');
    expect(w.server.stats().sessions).toBe(0);
    // the current client is welcomed with the simulation version it was built with
    const cur = w.client('New').hello();
    expect(cur.errors()).toEqual([]);
    expect(cur.last('welcome')!.simVersion).toBe(SIM_VERSION);
  });

  it('a dropped player resumes the same session and seat with the token', () => {
    const w = new World();
    const { h, code } = room(w);
    const g = w.client('Guest').hello().send({ t: 'join', code });
    const id = g.last('welcome')!.session;
    g.drop();
    w.advance(3000);
    g.reconnect();
    expect(g.last('welcome')!.session).toBe(id);
    expect(g.last('room')!.room.slots.some((s) => s.you && s.name === 'Guest')).toBe(true);
    expect(h.last('room')!.room.slots.filter((s) => s.state === 'human').length).toBe(2);
  });
});

describe('custom rooms', () => {
  it('create, join by lowercase code, host-only commands, ready gating, host migration', () => {
    const w = new World();
    const { h, code } = room(w);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const g = w.client('Guest').hello().send({ t: 'join', code: code.toLowerCase() });
    expect(g.last('room')!.room.code).toBe(code);
    w.client('X').hello().send({ t: 'join', code: 'ZZZZZZ' }).errors().includes('notFound');
    expect(w.client('Y').hello().send({ t: 'join', code: 'O0O0O0' }).errors()).toContain('badCode');
    g.send({ t: 'settings', settings: { laps: 3 } });
    expect(g.errors()).toContain('notHost');
    h.send({ t: 'settings', settings: { laps: 2, mode: 'item' } });
    expect(g.last('room')!.room.settings).toMatchObject({ laps: 2, mode: 'item' });
    h.send({ t: 'start' });
    expect(h.errors()).toContain('notReady');
    // host leaves → the guest (longest remaining) becomes host
    h.send({ t: 'leave' });
    const v = g.last('room')!.room;
    expect(v.slots.find((s) => s.you)!.host).toBe(true);
    expect(v.hostSession).toBe(g.last('welcome')!.session);
  });

  it('slots: bots with tiers, close/open, kick; teams follow the format', () => {
    const w = new World();
    const { h, code } = room(w);
    const g = w.client('Guest').hello().send({ t: 'join', code });
    h.send({ t: 'slot', slot: 3, action: 'bot', tier: 'legend' }).send({ t: 'slot', slot: 4, action: 'close' });
    let v = h.last('room')!.room;
    expect(v.slots[3]).toMatchObject({ state: 'bot', tier: 'legend' });
    expect(v.slots[4]!.state).toBe('closed');
    h.send({ t: 'settings', settings: { teams: 'squad' } });
    v = h.last('room')!.room;
    expect(v.slots.map((s) => s.team)).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
    h.send({ t: 'slot', slot: 1, action: 'kick' });
    expect(g.errors()).toContain('kicked');
    expect(h.last('room')!.room.slots[1]!.state).toBe('open');
  });

  it('full + all ready → 10 s countdown → race; unready cancels', () => {
    const w = new World();
    const { h, code } = room(w);
    const g = w.client('Guest').hello().send({ t: 'join', code });
    for (let i = 2; i < 8; i++) h.send({ t: 'slot', slot: i, action: 'bot' });
    expect(h.last('room')!.room.phase).toBe('waiting');
    g.send({ t: 'ready', ready: true });
    expect(h.last('room')!.room.phase).toBe('countdown');
    g.send({ t: 'ready', ready: false });
    expect(h.last('room')!.room.phase).toBe('waiting');
    g.send({ t: 'ready', ready: true });
    w.advance(9_000);
    expect(g.last('raceStart')).toBeUndefined();
    w.advance(1_500);
    const rs = g.last('raceStart')!;
    expect(rs.config.trackId).toBe('proving_ring');
    expect(rs.config.slots.filter((s) => s.kind === 'bot').length).toBe(6);
    expect(rs.provisional).toBe(true);
  });

  it('track roulette: 20 s of votes, then one nomination is drawn and loading starts', () => {
    const w = new World();
    const { h, code } = room(w);
    const g = w.client('Guest').hello().send({ t: 'join', code });
    h.send({ t: 'settings', settings: { track: 'roulette' } });
    g.send({ t: 'ready', ready: true });
    h.send({ t: 'start' });
    expect(h.last('room')!.room.phase).toBe('roulette');
    g.send({ t: 'vote', trackId: 'proving_ring' });
    expect(h.last('roulette')!.votes).toEqual({ proving_ring: 1 });
    w.advance(19_000);
    expect(h.last('raceStart')).toBeUndefined();
    w.advance(1_500);
    expect(h.last('raceStart')!.config.trackId).toBe('proving_ring');
    expect(h.last('room')!.room.phase).toBe('loading');
  });

  it('loading ends when everyone reports the right track hash; the final raceStart moves startTick', () => {
    const w = new World();
    const { h, code } = room(w);
    const g = w.client('Guest').hello().send({ t: 'join', code });
    g.send({ t: 'ready', ready: true });
    h.send({ t: 'start' });
    const first = h.last('raceStart')!;
    h.send({ t: 'loaded', trackHash: 'wrong' });
    expect(h.errors()).toContain('trackHashMismatch');
    h.send({ t: 'loaded', trackHash: first.config.trackHash });
    expect(h.all('raceStart').length).toBe(1);
    g.send({ t: 'loaded', trackHash: first.config.trackHash });
    const fin = h.last('raceStart')!;
    expect(fin.provisional).toBe(false);
    expect(fin.raceId).toBe(first.raceId);
    expect(fin.startTick).toBeLessThan(first.startTick);
    expect(fin.startTick - fin.serverTick).toBe(60);
    expect(h.last('room')!.room.phase).toBe('racing');
    expect(fin.resumeToken).not.toBe(g.last('raceStart')!.resumeToken);
  });

  it('chat is broadcast, filtered and limited to 1 per second', () => {
    const w = new World();
    const { h, code } = room(w);
    const g = w.client('Guest').hello().send({ t: 'join', code });
    g.send({ t: 'chat', text: 'hi shit' }).send({ t: 'chat', text: 'again' });
    expect(h.all('chat').map((c) => c.text)).toEqual(['hi ****']);
    expect(g.errors()).toContain('rateLimited');
    w.advance(1100);
    g.send({ t: 'chat', text: 'again' });
    expect(h.last('chat')!.text).toBe('again');
  });
});

describe('quick match', () => {
  it('20 s search → 15 s stage (track revealed) → AI fill and race start', () => {
    const w = new World();
    const a = w.client('A').hello().send({ t: 'quick', mode: 'speed', teams: 'solo' });
    const b = w.client('B').hello().send({ t: 'quick', mode: 'speed', teams: 'solo' });
    expect(b.last('queue')).toMatchObject({ phase: 'search', humans: 2 });
    const c = w.client('C').hello().send({ t: 'quick', mode: 'item', teams: 'solo' });
    expect(c.last('queue')!.humans).toBe(1);
    c.send({ t: 'quickCancel' });
    w.advance(20_100);
    const st = a.last('queue')!;
    expect(st.phase).toBe('stage');
    expect(st.trackId).toBe('proving_ring');
    w.advance(15_100);
    const rs = a.last('raceStart')!;
    expect(rs.config.slots.filter((s) => s.kind === 'human').length).toBe(2);
    expect(rs.config.slots.filter((s) => s.kind === 'bot').length).toBe(6);
    expect(b.last('raceStart')!.raceId).toBe(rs.raceId);
    expect(c.last('raceStart')).toBeUndefined();
  });

  it('8 humans skip straight to the stage; squads alternate teams by join order', () => {
    const w = new World();
    const cs = Array.from({ length: 8 }, (_, i) => w.client(`P${i}`).hello().send({ t: 'quick', mode: 'speed', teams: 'squad' }));
    expect(cs[0]!.last('queue')!.phase).toBe('stage');
    w.advance(15_100);
    const teams = cs[0]!.last('raceStart')!.config.slots.map((s) => s.team);
    expect(teams.filter((t) => t === 0).length).toBe(4);
    expect(teams.filter((t) => t === 1).length).toBe(4);
  });
});
