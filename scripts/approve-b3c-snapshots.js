// One-time snapshot update for V5.2 Group B — B3 corrections (owner testing, 8 Nov 2026).
// The corrections change ONLY house walls that share a deck corner: they are now mitered into each
// other, and an INSIDE house corner no longer gets the two corner boards that used to stand there
// (they sat on the joint). Allowed snapshot differences: the 'house-trim' count, and the total part
// count by the same amount. Everything else must be identical, or nothing is written.
// Geometry review before writing, per changed fixture:
//   - every part that is not house context is identical to the B3 development build (bd8d529);
//   - at every joint, the two walls' siding faces and backs meet at single points;
//   - each wall has a corner board at a free end or an outside corner, and none at an inside corner.
// cut-corner (case 4) is NOT approved and is never rewritten.
// Usage: node scripts/approve-b3c-snapshots.js            (dry run)
//        node scripts/approve-b3c-snapshots.js --write
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadEngine, snapshot, ROOT } = require('../tests/engine');
const { fixtures } = require('../tests/fixtures');

const WRITE = process.argv.includes('--write');
const NOT_APPROVED = new Set(['cut-corner']);
const tmp = path.join(os.tmpdir(), `aos-b3dev-${process.pid}.html`);
fs.writeFileSync(tmp, execFileSync('git', ['show', 'bd8d529:index.html'], { cwd: ROOT }));
const dev = loadEngine(tmp), win = loadEngine(), core = win.DeckCore;
fs.unlinkSync(tmp);
const strip = (ps) => JSON.stringify(ps.filter(p => !(p.group === 'context' && /^house-/.test(p.kind))).map(({ id, ...p }) => p));
const at = (e, s, d) => [e.mid[0] + e.t[0] * s + e.n[0] * d, e.mid[1] + e.t[1] * s + e.n[1] * d];

function geometryCheck(raw) {
  const out = [], m = core.make(raw), b = dev.DeckCore.make(raw), es = m.geometry.edges, H = m.intent.houseEdges, n = es.length;
  if (strip(m.parts) !== strip(b.parts)) out.push('a non-house part differs from the B3 development build');
  for (const i of H) {
    const j = (i + 1) % n;
    if (H.includes(j)) for (const d of [core.WALL_FRONT, core.WALL_BACK]) {
      const p = at(es[i], core.wallEnds(m.intent, es, i, d)[1], d), q = at(es[j], core.wallEnds(m.intent, es, j, d)[0], d);
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9) out.push(`walls ${i}/${j} do not meet at depth ${d}`);
    }
    const nb = core.houseNeighbours(m.intent, es, i), f = core.wallEnds(m.intent, es, i, core.WALL_FRONT), k = core.wallEnds(m.intent, es, i, core.WALL_BACK);
    const want = (nb.start === null || f[0] < k[0] ? 1 : 0) + (nb.end === null || f[1] > k[1] ? 1 : 0);
    const have = m.parts.filter(p => p.kind === 'house-trim' && p.connect === `house-edge-${i}`).length;
    if (have !== want) out.push(`wall ${i}: ${have} corner boards, expected ${want}`);
  }
  return out;
}

const dir = path.join(ROOT, 'tests', 'golden'), problems = [], writes = [];
for (const [name, raw] of Object.entries(fixtures(win))) {
  const file = path.join(dir, `${name}.json`), golden = JSON.parse(fs.readFileSync(file, 'utf8')), g = golden.model, s = snapshot(win, raw);
  if (JSON.stringify(g) === JSON.stringify(s)) continue;
  if (NOT_APPROVED.has(name)) { console.log(`kept (not approved, case 4): ${name}`); continue; }
  const bad = (msg) => problems.push(`${name}: ${msg}`);
  let delta = 0;
  for (const k of new Set([...Object.keys(g.partsByKind), ...Object.keys(s.partsByKind)])) {
    const a = g.partsByKind[k] || 0, c = s.partsByKind[k] || 0; if (a === c) continue;
    if (k === 'house-trim') delta += c - a; else bad(`part kind ${k} ${a} -> ${c}`);
  }
  if (s.partCount - g.partCount !== delta) bad('partCount change not explained by corner boards');
  for (const k of new Set([...Object.keys(g.counts), ...Object.keys(s.counts)])) if (JSON.stringify(g.counts[k]) !== JSON.stringify(s.counts[k])) bad(`count ${k} changed`);
  for (const k of new Set([...Object.keys(g.stats), ...Object.keys(s.stats)])) if (JSON.stringify(g.stats[k]) !== JSON.stringify(s.stats[k]) && !(k === 'partCount' && s.stats[k] - g.stats[k] === delta)) bad(`stat ${k} changed`);
  if (JSON.stringify(g.alerts) !== JSON.stringify(s.alerts)) bad('alerts changed');
  for (const p of geometryCheck(raw)) bad(`geometry: ${p}`);
  writes.push([file, { ...golden, model: s }, delta]);
}
if (problems.length) { console.error('REFUSED — differences outside the approved B3 corner corrections:\n' + problems.join('\n')); process.exit(1); }
for (const [file, data, dlt] of writes) {
  if (WRITE) fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  console.log(`${WRITE ? 'approved' : 'would approve'}: ${path.basename(file)} (corner boards ${dlt >= 0 ? '+' : ''}${dlt})`);
}
console.log(`${writes.length} snapshot(s) ${WRITE ? 'updated' : 'checked (dry run, nothing written)'}; cut-corner left as the recorded target.`);
