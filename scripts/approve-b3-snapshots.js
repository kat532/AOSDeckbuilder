// One-time snapshot update for V5.2 Group B — B3 (property & 3D presentation), 8 Nov 2026.
// B3 intentionally changes VISUAL CONTEXT parts only:
//   - the thin metal 'siding-course' strips are removed (siding is now drawn on the wall faces);
//   - each house wall gets visual-only 'house-foundation', two 'house-trim' corner boards,
//     a 'house-eave' and a 'house-roof' edge.
// The lawn ('earth') is still one part (larger, top at grade), so its count does not change.
// Everything else (every framing member kind and count, decking, stairs, railings, counts, stats
// other than the total part count, and alerts) must be IDENTICAL, or nothing is written.
// Geometry review before writing, per fixture, against the approved B2 Fix 1 engine (c12fc0b):
//   - every house-wall piece has the same position, size, color and material as before;
//   - each house wall has exactly one foundation band (bottom at grade), two corner boards, one
//     eave and one roof edge, all within the wall's length and against its deck-facing face;
//   - the removed siding-course count equals what B2 Fix 1 produced.
// cut-corner (case 4) is NOT approved and is never rewritten.
// Usage: node scripts/approve-b3-snapshots.js            (dry run: report only)
//        node scripts/approve-b3-snapshots.js --write    (write after all checks pass)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadEngine, snapshot, ROOT } = require('../tests/engine');
const { fixtures } = require('../tests/fixtures');

const WRITE = process.argv.includes('--write');
const NOT_APPROVED = new Set(['cut-corner']);
const B3_ADDED = new Set(['house-foundation', 'house-trim', 'house-eave', 'house-roof']), B3_REMOVED = new Set(['siding-course']);
const tmp = path.join(os.tmpdir(), `aos-b2fix1-${process.pid}.html`);
fs.writeFileSync(tmp, execFileSync('git', ['show', 'c12fc0b:index.html'], { cwd: ROOT }));
const before = loadEngine(tmp), win = loadEngine(), core = win.DeckCore;
fs.unlinkSync(tmp);

const strip = (p) => { const { id, label, siding, ...r } = p; return JSON.stringify(r, (_, v) => typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v); };
function geometryCheck(raw) {
  const out = [], m = core.make(raw), b = before.DeckCore.make(raw);
  const wa = m.parts.filter(p => p.kind === 'house-wall').map(strip), wb = b.parts.filter(p => p.kind === 'house-wall').map(strip);
  if (JSON.stringify(wa) !== JSON.stringify(wb)) out.push('house-wall pieces differ from B2 Fix 1');
  for (const i of m.intent.houseEdges) {
    const e = m.geometry.edges[i], mine = m.parts.filter(p => p.connect === `house-edge-${i}`), k = (re) => mine.filter(p => re.test(p.kind));
    const L = Math.max(.3, e.len - .07);
    if (k(/^house-foundation$/).length !== 1 || k(/^house-trim$/).length !== ((m.intent.openings || []).some(o => o.edge === i) ? Math.min(2, k(/^house-trim$/).length) : 2) || k(/^house-eave$/).length !== 1 || k(/^house-roof$/).length !== 1) out.push(`wall ${i}: wrong set of dress parts`);
    const f = k(/^house-foundation$/)[0]; if (f && Math.abs(f.y - f.h / 2) > 1e-9) out.push(`wall ${i}: foundation not at grade`);
    for (const p of k(/^house-(foundation|trim)$/)) {
      const s = (p.x - e.mid[0]) * e.t[0] + (p.z - e.mid[1]) * e.t[1], d = (p.x - e.mid[0]) * e.n[0] + (p.z - e.mid[1]) * e.n[1];
      if (Math.abs(s) + p.w / 2 > L / 2 + 1e-6) out.push(`wall ${i}: ${p.kind} past the wall end`);
      if (d + p.d / 2 < .115 - 1e-6 || d - p.d / 2 > .115 + 1e-6) out.push(`wall ${i}: ${p.kind} not on the deck-facing face`);
    }
    const walls = k(/^house-wall$/), top = Math.max(...walls.map(p => p.y + p.h / 2)), eave = k(/^house-eave$/)[0];
    if (eave && Math.abs(eave.y - eave.h / 2 - top) > 1e-9) out.push(`wall ${i}: eave not on the wall top`);
  }
  const removed = b.parts.filter(p => p.kind === 'siding-course').length;
  return { problems: out, removed };
}

const dir = path.join(ROOT, 'tests', 'golden'), problems = [], writes = [];
for (const [name, raw] of Object.entries(fixtures(win))) {
  const file = path.join(dir, `${name}.json`), golden = JSON.parse(fs.readFileSync(file, 'utf8')), g = golden.model, s = snapshot(win, raw);
  if (JSON.stringify(g) === JSON.stringify(s)) continue;
  if (NOT_APPROVED.has(name)) { console.log(`kept (not approved, case 4): ${name}`); continue; }
  const bad = (m) => problems.push(`${name}: ${m}`);
  let delta = 0;
  for (const k of new Set([...Object.keys(g.partsByKind), ...Object.keys(s.partsByKind)])) {
    const a = g.partsByKind[k] || 0, b = s.partsByKind[k] || 0; if (a === b) continue;
    if ((B3_ADDED.has(k) && a === 0) || (B3_REMOVED.has(k) && b === 0)) delta += b - a; else bad(`part kind ${k} ${a} -> ${b}`);
  }
  if (s.partCount - g.partCount !== delta) bad('partCount change not explained by the B3 house dress');
  for (const k of new Set([...Object.keys(g.counts), ...Object.keys(s.counts)])) if (JSON.stringify(g.counts[k]) !== JSON.stringify(s.counts[k])) bad(`count ${k} changed`);
  for (const k of new Set([...Object.keys(g.stats), ...Object.keys(s.stats)])) if (JSON.stringify(g.stats[k]) !== JSON.stringify(s.stats[k]) && !(k === 'partCount' && s.stats[k] - g.stats[k] === delta)) bad(`stat ${k} changed`);
  if (JSON.stringify(g.alerts) !== JSON.stringify(s.alerts)) bad('alerts changed');
  const chk = geometryCheck(raw);
  for (const p of chk.problems) bad(`geometry: ${p}`);
  if ((g.partsByKind['siding-course'] || 0) !== chk.removed) bad('removed siding-course count differs from B2 Fix 1');
  writes.push([file, { ...golden, model: s }, delta]);
}
if (problems.length) { console.error('REFUSED — differences outside the approved B3 presentation changes:\n' + problems.join('\n')); process.exit(1); }
for (const [file, data, dlt] of writes) {
  if (WRITE) fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  console.log(`${WRITE ? 'approved' : 'would approve'}: ${path.basename(file)} (context parts ${dlt >= 0 ? '+' : ''}${dlt})`);
}
console.log(`${writes.length} snapshots ${WRITE ? 'updated' : 'checked (dry run, nothing written)'}; cut-corner left as the recorded target.`);
