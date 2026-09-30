#!/usr/bin/env python3
"""One-shot export of the planning-phase research dossier into docs/research/.

Inputs (paths from the planning session; pass alternatives as argv):
  argv[1] research workflow JSON output
  argv[2] physics-agent plan file containing the ```ts sim``` prototype block
  argv[3] architect agent transcript (jsonl) containing the architecture plan
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = '/tmp/claude-0/-home-user-ClaudeRider/4ffacf22-1d12-5179-a0b7-d8a51c4bc20c'
research = sys.argv[1] if len(sys.argv) > 1 else f'{S}/tasks/ws7066bj6.output'
proto = sys.argv[2] if len(sys.argv) > 2 else '/root/.claude/plans/nexon-kartrider-drift-atomic-quilt-agent-a181d8fa946423c79.md'
arch = sys.argv[3] if len(sys.argv) > 3 else '/root/.claude/projects/-home-user-ClaudeRider/4ffacf22-1d12-5179-a0b7-d8a51c4bc20c/subagents/agent-af4f9f7828929266c.jsonl'

out = os.path.join(ROOT, 'docs', 'research')
os.makedirs(out, exist_ok=True)
d = json.load(open(research))['result']

def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:60]

index = ['# Research dossier (planning phase, 2026-09-29)', '',
         'Exported verbatim from the 12-agent research workflow. Values tagged **[sourced]** come from a cited source;',
         '**[proposed]** values are design reasoning. Canonical decisions that resolve conflicts live in `docs/design/01-decisions.md`.', '']
reports = [(r['key'], r) for r in d['reports']] + [(slug(r['key']), r) for r in d['gap_reports']]
for i, (key, r) in enumerate(reports):
    fn = f'{i+1:02d}-{slug(key)}.md'
    lines = [r['report'], '', '## Key parameters', '']
    for p in r.get('key_parameters', []):
        src = f" — {p['source']}" if p.get('source') else ''
        lines.append(f"- **{p['name']}**: {p['value']} [{p['status']}]{src}")
    if r.get('open_questions'):
        lines += ['', '## Open questions', ''] + [f'- {q}' for q in r['open_questions']]
    if r.get('sources'):
        lines += ['', '## Sources', ''] + [f'- {s}' for s in r['sources']]
    open(os.path.join(out, fn), 'w').write('\n'.join(lines) + '\n')
    index.append(f'- [{fn}]({fn}) — {r["key"]}')

open(os.path.join(out, '12-contradictions.md'), 'w').write(
    '# Contradictions found by the completeness critic\n\nAll are resolved in `docs/design/01-decisions.md`.\n\n' +
    '\n'.join(f'{i+1}. {c}' for i, c in enumerate(d['contradictions'])) + '\n')
index.append('- [12-contradictions.md](12-contradictions.md) — critic contradictions (resolved in design ADRs)')

# Prototype sim (validated headless 2D model) -> docs + test oracle
txt = open(proto).read()
m = re.search(r'```ts sim\n(.*?)\n```', txt, re.S)
if m:
    code = m.group(1)
    open(os.path.join(out, 'sim-prototype.md'), 'w').write(
        '# Validated headless 2D kart sim prototype (gap-2)\n\nRun: `EXP=lap node --input-type=module-typescript < packages/sim/test/oracle/proto2d.ts`\n\n```ts\n' + code + '\n```\n')
    os.makedirs(os.path.join(ROOT, 'packages', 'sim', 'test', 'oracle'), exist_ok=True)
    open(os.path.join(ROOT, 'packages', 'sim', 'test', 'oracle', 'proto2d.src.txt'), 'w').write(code + '\n')
    index.append('- [sim-prototype.md](sim-prototype.md) — validated 2D physics prototype (test oracle source)')

# Architecture plan (lead architect) -> docs/design/02-contracts.md
last = None
for line in open(arch):
    try:
        o = json.loads(line)
    except Exception:
        continue
    if o.get('type') == 'assistant':
        for c in o.get('message', {}).get('content', []):
            if c.get('type') == 'text' and len(c.get('text', '')) > 5000:
                last = c['text']
if last:
    os.makedirs(os.path.join(ROOT, 'docs', 'design'), exist_ok=True)
    open(os.path.join(ROOT, 'docs', 'design', '02-contracts.md'), 'w').write(last + '\n')
    index.append('- [../design/02-contracts.md](../design/02-contracts.md) — architecture plan and interface contracts')

open(os.path.join(out, 'README.md'), 'w').write('\n'.join(index) + '\n')
print('exported', len(reports), 'reports')
