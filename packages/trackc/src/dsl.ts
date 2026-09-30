// Track DSL parser (gap-3 §9 subset + extensions). One command per line (or ';'-separated).
// Grammar summary (see docs/design/11-track-spec.md):
//   TRACK <id> name="..." theme=<id> diff=<1-5> laps=<n|auto> topo=circuit|p2p
//   DEFAULTS w=18 surf=cobble wall=barrier:1.0 shoulder=0 shoulderSurf=grass blend=15
//   START pos=(x,y,z) hdg=<deg>          GRID rows=4 cols=2 pitch=6 stagger=3 d=4
//   S <len|?a> [dy= w= bank= surf= wall= wallL= wallR= shoulder= shoulderSurf= noitem=1]
//   C R<r> <deg> L|R [dy= w= bank= ...]
//   WIGGLE R<r> a/b/a L|R  |  CHICANE R<r> a/b/a L|R  |  HAIRPIN R<r> L|R
//   CLOSE solve=[?a,?b,?c] length=<m>     LINE start at=<s>
//   ITEMS at=<s>,<s>(n=6,span=26),... n=<default>     PAD at=<s> d=<u> len=<m> w=<m>
//   KEYS <s>,<s>,...    JUMPS <s0>-<s1>,...    KILLY <y>
//   PROPS kind=<k> along=<s0>-<s1>|all side=L|R|both every=<m> offset=<m>
//   THEME sky=<preset> ...   @label   # comment

export interface DslError { file: string; line: number; col: number; msg: string }
export class TrackDslError extends Error {
  readonly err: DslError;
  constructor(err: DslError) { super(`${err.file}:${err.line}: ${err.msg}`); this.err = err; }
}

export type Attrs = Record<string, string>;
export interface SegCmd { kind: 'S' | 'C'; line: number; len?: number | string; r?: number; deg?: number; dir?: 'L' | 'R'; attrs: Attrs }
export interface TrackAst {
  file: string;
  id: string;
  header: Attrs;
  defaults: Attrs;
  start: { x: number; y: number; z: number; hdg: number };
  grid: { rows: number; cols: number; pitch: number; stagger: number; d: number };
  segs: SegCmd[];
  close?: { solve: string[]; length: number };
  lineAt: number;
  items: { s: number; n: number; span?: number }[];
  itemDefaultN: number;
  pads: { s: number; d: number; len: number; w: number }[];
  keys: number[];
  jumps: { s0: number; s1: number }[];
  killY?: number;
  props: Attrs[];
  theme: Attrs;
  labels: Record<string, number>; // label → segment index
}

function tokenize(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false, paren = 0;
  for (const ch of line) {
    if (ch === '"') { q = !q; cur += ch; continue; }
    if (!q && ch === '(') paren++;
    if (!q && ch === ')') paren--;
    if (!q && paren === 0 && (ch === ' ' || ch === '\t')) { if (cur) out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function parseAttrs(toks: string[]): Attrs {
  const a: Attrs = {};
  for (const t of toks) {
    const i = t.indexOf('=');
    if (i > 0) a[t.slice(0, i)] = t.slice(i + 1).replace(/^"|"$/g, '');
  }
  return a;
}

const num = (s: string | undefined, def: number): number => (s === undefined ? def : Number(s));

export function parse(src: string, file: string): TrackAst {
  const ast: TrackAst = {
    file, id: '', header: {}, defaults: {}, start: { x: 0, y: 0, z: 0, hdg: 0 },
    grid: { rows: 4, cols: 2, pitch: 6, stagger: 3, d: 4 }, segs: [], lineAt: 0, items: [], itemDefaultN: 5,
    pads: [], keys: [], jumps: [], props: [], theme: {}, labels: {},
  };
  const fail = (line: number, msg: string): never => { throw new TrackDslError({ file, line, col: 1, msg }); };
  const lines = src.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li]!.replace(/#.*$/, '').trim();
    if (!raw) continue;
    for (const part of raw.split(';')) {
      const cmdLine = part.trim();
      if (!cmdLine) continue;
      const toks = tokenize(cmdLine).filter((t) => {
        if (t.startsWith('@')) { ast.labels[t.slice(1)] = ast.segs.length; return false; }
        return true;
      });
      if (!toks.length) continue;
      const cmd = toks[0]!.toUpperCase();
      const lineNo = li + 1;
      switch (cmd) {
        case 'TRACK': ast.id = toks[1] ?? fail(lineNo, 'TRACK needs an id'); ast.header = parseAttrs(toks.slice(2)); break;
        case 'DEFAULTS': Object.assign(ast.defaults, parseAttrs(toks.slice(1))); break;
        case 'START': {
          const a = parseAttrs(toks.slice(1));
          const m = /\(([^)]*)\)/.exec(a.pos ?? '(0,0,0)');
          const [x, y, z] = (m?.[1] ?? '0,0,0').split(',').map(Number);
          ast.start = { x: x ?? 0, y: y ?? 0, z: z ?? 0, hdg: num(a.hdg, 0) };
          if (a.GRID) break;
          break;
        }
        case 'GRID': {
          const a = parseAttrs(toks.slice(1));
          ast.grid = { rows: num(a.rows, 4), cols: num(a.cols, 2), pitch: num(a.pitch, 6), stagger: num(a.stagger, 3), d: num(a.d, 4) };
          break;
        }
        case 'S': {
          const lenTok = toks[1] ?? fail(lineNo, 'S needs a length');
          const len = lenTok.startsWith('?') ? lenTok.split('=')[0]! : Number(lenTok);
          if (typeof len === 'number' && !(len > 0)) fail(lineNo, `bad straight length ${lenTok}`);
          ast.segs.push({ kind: 'S', line: lineNo, len, attrs: parseAttrs(toks.slice(2)) });
          break;
        }
        case 'C': {
          const rTok = toks[1] ?? '';
          if (!/^R\d/.test(rTok)) fail(lineNo, 'C needs R<radius>');
          const r = Number(rTok.slice(1));
          const deg = Number(toks[2]);
          const dir = (toks[3] ?? '').toUpperCase();
          if (!(r > 0) || !(deg > 0) || (dir !== 'L' && dir !== 'R')) fail(lineNo, 'C syntax: C R<r> <deg> L|R');
          ast.segs.push({ kind: 'C', line: lineNo, r, deg, dir: dir as 'L' | 'R', attrs: parseAttrs(toks.slice(4)) });
          break;
        }
        case 'WIGGLE': case 'CHICANE': {
          // WIGGLE R<r> a/b/a L|R  → C a dir ; C b other ; C a dir
          const r = Number((toks[1] ?? 'R0').slice(1));
          const parts = (toks[2] ?? '').split('/').map(Number);
          const dir = (toks[3] ?? 'L').toUpperCase() as 'L' | 'R';
          const other = dir === 'L' ? 'R' : 'L';
          const attrs = parseAttrs(toks.slice(4));
          const dirs = [dir, other, dir];
          const total = parts.reduce((a, b) => a + b, 0) || 1;
          const dy = Number(attrs.dy ?? 0);
          parts.forEach((deg, i) => ast.segs.push({ kind: 'C', line: lineNo, r, deg, dir: dirs[i] as 'L' | 'R', attrs: { ...attrs, dy: String((dy * deg) / total), ...(attrs.bank ? { bank: String((dirs[i] === dir ? 1 : -1) * Number(attrs.bank)) } : {}) } }));
          break;
        }
        case 'HAIRPIN': {
          const r = Number((toks[1] ?? 'R0').slice(1));
          const dir = (toks[2] ?? 'L').toUpperCase() as 'L' | 'R';
          ast.segs.push({ kind: 'C', line: lineNo, r, deg: 180, dir, attrs: parseAttrs(toks.slice(3)) });
          break;
        }
        case 'CLOSE': {
          const a = parseAttrs(toks.slice(1));
          const solve = (a.solve ?? '').replace(/[[\]]/g, '').split(',').filter(Boolean);
          ast.close = { solve, length: num(a.length, 0) };
          break;
        }
        case 'LINE': { const a = parseAttrs(toks.slice(1)); ast.lineAt = num(a.at, 0); break; }
        case 'ITEMS': {
          const a = parseAttrs(toks.slice(1));
          ast.itemDefaultN = num(a.n, 5);
          for (const p of (a.at ?? '').split(/,(?![^(]*\))/)) {
            if (!p) continue;
            const m = /^([\d.]+)(?:\((.*)\))?$/.exec(p.trim());
            if (!m) fail(lineNo, `bad ITEMS entry ${p}`);
            const sub = parseAttrs((m![2] ?? '').split(','));
            ast.items.push({ s: Number(m![1]), n: num(sub.n, ast.itemDefaultN), ...(sub.span ? { span: Number(sub.span) } : {}) });
          }
          break;
        }
        case 'PAD': {
          const a = parseAttrs(toks.slice(1));
          for (const s of (a.at ?? '').split(',')) if (s) ast.pads.push({ s: Number(s), d: num(a.d, 0), len: num(a.len, 6), w: num(a.w, 4) });
          break;
        }
        case 'KEYS': ast.keys = (toks[1] ?? '').split(',').filter(Boolean).map(Number); break;
        case 'JUMPS': ast.jumps = (toks[1] ?? '').split(',').filter(Boolean).map((r) => { const [a, b] = r.split('-').map(Number); return { s0: a ?? 0, s1: b ?? 0 }; }); break;
        case 'KILLY': ast.killY = Number(toks[1]); break;
        case 'PROPS': ast.props.push(parseAttrs(toks.slice(1))); break;
        case 'THEME': Object.assign(ast.theme, parseAttrs(toks.slice(1))); break;
        default: fail(lineNo, `unknown command ${cmd}`);
      }
    }
  }
  if (!ast.id) fail(1, 'missing TRACK line');
  return ast;
}
