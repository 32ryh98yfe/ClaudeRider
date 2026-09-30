// Track DSL parser (docs/design/11-track-spec.md §2, cookbook: docs/design/11a-dsl-cookbook.md).
//
// Lexical rules:
//   - one command per line, several per line separated by `;`, or several on one line when each starts with a
//     multi-letter command keyword (`START pos=(0,0,0) hdg=0   GRID rows=4 …`, as in the gap-3 fixtures);
//   - `#` starts a comment when it begins a token (so hex colours like `fog=#cfe6f5:120:900` survive);
//   - an indented physical line whose first token is `key=value` continues the previous command (gap-3 AREA/RAIL);
//     a trailing `\` also continues;
//   - `{ … }` opens a block (BRANCH); blocks may span lines;
//   - `@label` marks the start of the statement it is attached to (or of the next statement when alone);
//   - `@signature …` and `@fallback X -> "…" when=Fn` are whole-line directives.
// The parser only structures text; every semantic check happens in the compiler (turtle.ts / content.ts).

export interface DslError { file: string; line: number; col: number; msg: string }
export class TrackDslError extends Error {
  readonly err: DslError;
  constructor(err: DslError) { super(`${err.file}:${err.line}: ${err.msg}`); this.err = err; }
}

export type Attrs = Record<string, string>;

export interface Stmt {
  cmd: string;            // upper-cased command keyword
  args: string[];         // positional tokens after the command
  attrs: Attrs;           // key=value tokens (quotes stripped)
  flags: string[];        // bare lower-case words among args that look like switches (e.g. `keep`)
  labels: string[];       // labels attached to this statement
  line: number;
  block?: Stmt[];
}

export interface Fallback { feature: string; substitute: string; when: string }

export interface TrackAst {
  file: string;
  id: string;
  header: Attrs;
  stmts: Stmt[];
  signature: string[];
  fallbacks: Fallback[];
  /** labels that were not attached to any statement (end of file / end of block) → resolved as path end. */
  trailingLabels: { labels: string[]; block: Stmt[] | null }[];
}

/** Every multi-letter command keyword. A token equal to one of these starts a new statement mid-line. */
export const COMMANDS = [
  'TRACK', 'DEFAULTS', 'START', 'GRID', 'LINE', 'CLOSE',
  'S', 'C', 'E', 'J', 'LOOP', 'HELIX', 'WIGGLE', 'CHICANE', 'HAIRPIN', 'CLOVERLEAF', 'PLAZA',
  'BRANCH', 'RAIL', 'WARP', 'AREA', 'PROFILE',
  'ITEMS', 'PAD', 'HAZ', 'ZONE', 'KILL', 'KEYS', 'PROPS', 'PROP', 'THEME',
  'JUMPS', 'KILLY', // M1 legacy commands (kept for backward compatibility)
] as const;
const SPLITTERS = new Set<string>(COMMANDS.filter((c) => c.length > 1));
const KNOWN = new Set<string>(COMMANDS);

interface Tok { t: string; line: number }

/** Splits one logical line into tokens; `;`, `{`, `}` are standalone tokens; (), [] and "" group. */
function tokenize(text: string, line: number, file: string): Tok[] {
  const out: Tok[] = [];
  let cur = '', q = false, depth = 0;
  const flush = (): void => { if (cur) out.push({ t: cur, line }); cur = ''; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') { q = !q; cur += ch; continue; }
    if (q) { cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (depth === 0) {
      if (ch === ' ' || ch === '\t') { flush(); continue; }
      if (ch === ';' || ch === '{' || ch === '}') { flush(); out.push({ t: ch, line }); continue; }
      if (ch === '#' && cur === '') break; // comment
    }
    cur += ch;
  }
  if (q) throw new TrackDslError({ file, line, col: 1, msg: 'unterminated string' });
  flush();
  return out;
}

const isAttr = (t: string): boolean => {
  if (t.startsWith('?') || t.startsWith('@')) return false;
  const i = t.indexOf('=');
  return i > 0 && !t.slice(0, i).includes('(');
};

function stripQuotes(v: string): string { return v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v; }

export function parse(src: string, file: string): TrackAst {
  const ast: TrackAst = { file, id: '', header: {}, stmts: [], signature: [], fallbacks: [], trailingLabels: [] };
  const fail = (line: number, msg: string): never => { throw new TrackDslError({ file, line, col: 1, msg }); };

  // ---- physical → logical lines (continuations), whole-line directives
  const phys = src.split(/\r?\n/);
  const logical: { text: string; line: number }[] = [];
  for (let li = 0; li < phys.length; li++) {
    const rawLine = phys[li]!;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (/^@signature\b/i.test(trimmed)) {
      const body = trimmed.replace(/^@signature\s*/i, '').replace(/\s#.*$/, '');
      ast.signature.push(...body.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean));
      continue;
    }
    if (/^@fallback\b/i.test(trimmed)) {
      const m = /^@fallback\s+(\S+)\s*->\s*(?:"([^"]*)"|(\S+))\s*(?:when=(F[1-6]))?/i.exec(trimmed);
      if (!m) fail(li + 1, 'bad @fallback, expected: @fallback <feature> -> "<substitute>" when=F<n>');
      ast.fallbacks.push({ feature: m![1]!, substitute: m![2] ?? m![3] ?? '', when: (m![4] ?? 'F6').toUpperCase() });
      continue;
    }
    const indented = /^\s/.test(rawLine);
    const first = trimmed.split(/\s+/)[0]!;
    const prev = logical[logical.length - 1];
    const continues = prev && ((indented && isAttr(first) && !KNOWN.has(first.split('=')[0]!.toUpperCase())) || prev.text.endsWith('\\'));
    if (continues) { prev.text = prev.text.replace(/\\$/, '') + ' ' + trimmed; continue; }
    logical.push({ text: trimmed, line: li + 1 });
  }

  // ---- statements with blocks
  const stack: Stmt[][] = [ast.stmts];
  const blockOwner: (Stmt | null)[] = [null];
  let cur: Stmt | null = null;
  let pending: string[] = [];
  const endStmt = (): void => { cur = null; };
  const startStmt = (cmd: string, line: number): Stmt => {
    const s: Stmt = { cmd, args: [], attrs: {}, flags: [], labels: pending, line };
    pending = [];
    stack[stack.length - 1]!.push(s);
    cur = s;
    return s;
  };
  for (const L of logical) {
    const toks = tokenize(L.text, L.line, file);
    for (const { t, line } of toks) {
      if (t === ';') { endStmt(); continue; }
      if (t === '{') {
        const owner: Stmt | null = cur;
        if (!owner) fail(line, '`{` without a command');
        owner!.block = [];
        stack.push(owner!.block);
        blockOwner.push(owner);
        endStmt();
        continue;
      }
      if (t === '}') {
        if (stack.length === 1) fail(line, 'unbalanced `}`');
        if (pending.length) { ast.trailingLabels.push({ labels: pending, block: stack[stack.length - 1]! }); pending = []; }
        stack.pop(); blockOwner.pop();
        endStmt();
        continue;
      }
      if (/^@[A-Za-z_][A-Za-z0-9_]*$/.test(t)) {
        // a bare @name marks a label; `@name+30` / `@a,@b` are s references (positional values)
        const name = t.slice(1);
        if (cur) (cur as Stmt).labels.push(name); else pending.push(name);
        continue;
      }
      const up = t.toUpperCase();
      if (!cur) {
        if (!KNOWN.has(up) || t !== up) fail(line, `unknown command ${t}`);
        startStmt(up, line);
        continue;
      }
      if (SPLITTERS.has(t)) { endStmt(); startStmt(t, line); continue; }
      const c = cur as Stmt;
      if (isAttr(t)) {
        const i = t.indexOf('=');
        c.attrs[t.slice(0, i)] = stripQuotes(t.slice(i + 1));
      } else {
        c.args.push(stripQuotes(t));
        if (/^[a-z][a-zA-Z]*$/.test(t)) c.flags.push(t);
      }
    }
    endStmt(); // a newline ends a statement
  }
  if (stack.length !== 1) fail(logical[logical.length - 1]?.line ?? 1, 'unclosed `{` block');
  if (pending.length) ast.trailingLabels.push({ labels: pending, block: null });

  const head = ast.stmts.find((s) => s.cmd === 'TRACK');
  if (!head) fail(1, 'missing TRACK line');
  ast.id = head!.args[0] ?? fail(head!.line, 'TRACK needs an id');
  ast.header = head!.attrs;
  return ast;
}

// ------------------------------------------------------------------------------------------------ value helpers
export function num(v: string | undefined, def: number): number {
  if (v === undefined || v === '') return def;
  const n = Number(v.replace(/^\+/, ''));
  return Number.isFinite(n) ? n : def;
}

/** `(1, 2.5, -3)` → [1, 2.5, -3]; accepts `..` range separators (`aabb=(-330,-60 .. 180,240)`). */
export function tuple(v: string | undefined): number[] {
  if (!v) return [];
  return v.replace(/^[([]|[)\]]$/g, '').split(/,|\.\.|\s+/).map((x) => x.trim()).filter(Boolean).map(Number);
}

/** `(dMax 2.0, hdg 25, vMin 15)` → { dMax: 2, hdg: 25, vMin: 15 }. */
export function namedTuple(v: string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v) return out;
  for (const part of v.replace(/^\(|\)$/g, '').split(',')) {
    const m = /^\s*([A-Za-z]+)\s*[= ]\s*([-+]?[\d.]+)\s*$/.exec(part);
    if (m) out[m[1]!] = Number(m[2]);
  }
  return out;
}

/** `[902:-4.5,911:-8]` → [[902,-4.5],[911,-8]]. Also accepts `(a,b)` pair lists: `[(0,0),(10,5)]`. */
export function pairList(v: string | undefined): [string, string][] {
  if (!v) return [];
  const body = v.replace(/^\[|\]$/g, '');
  if (body.includes('(')) {
    const out: [string, string][] = [];
    for (const m of body.matchAll(/\(\s*([^,)]+)\s*,\s*([^)]+)\)/g)) out.push([m[1]!.trim(), m[2]!.trim()]);
    return out;
  }
  return body.split(',').filter(Boolean).map((p) => { const i = p.lastIndexOf(':'); return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as [string, string]; });
}

/** Splits a list like `165,335(n=6,span=26),505` at top-level commas. */
export function topList(v: string | undefined): string[] {
  if (!v) return [];
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of v) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
