// One-time, owner-approved snapshot update for the V5.2 baseline (7 Nov 2026).
// Approved: case 1 (duplicate corner trimmers on rim joists removed + review note),
// case 2 (new full-footprint containment statistics), case 3 (new warnings for members
// outside the deck outline). NOT approved: case 4 (angled-corner joists without confirmed
// bearing) — the cut-corner snapshot is never rewritten here.
// The script REFUSES to write anything if any fixture differs in a way outside those rules.
'use strict';
const fs = require('fs');
const path = require('path');
const { loadEngine, snapshot, ROOT } = require('../tests/engine');
const { fixtures } = require('../tests/fixtures');

const NOT_APPROVED = new Set(['cut-corner']); // case 4: kept as a known-failing structural target
const NEW_STATS = new Set(['physicalSupportOutsideCount', 'structuralEnvelopeOutsideCount', 'footingOutsideProjectionCount', 'physicalSupportOutside', 'framingPlanner']);
const ADDED_ALERTS = [
  /^review: \d+ corner trimmer\(s\) coincident with existing perimeter rim framing omitted/, // case 1
  /^warning: \d+ physical beam\/post footprints project beyond the deck outline/,          // case 3
  /^review: \d+ conceptual footing pads extend beyond the deck projection/,                 // case 3
];
const GROUPED = /^info: Grouped (\d+) individual joist runs into (\d+) support-length zones/;

const win = loadEngine();
const dir = path.join(ROOT, 'tests', 'golden');
const problems = [], writes = [];
for (const [name, raw] of Object.entries(fixtures(win))) {
  const file = path.join(dir, `${name}.json`);
  const golden = JSON.parse(fs.readFileSync(file, 'utf8'));
  const g = golden.model, s = snapshot(win, raw);
  if (JSON.stringify(g) === JSON.stringify(s)) continue;
  if (NOT_APPROVED.has(name)) { console.log(`kept (not approved, case 4): ${name}`); continue; }
  const bad = (m) => problems.push(`${name}: ${m}`);
  // Parts: only corner trimmers may change, and only downward.
  const kinds = new Set([...Object.keys(g.partsByKind), ...Object.keys(s.partsByKind)]);
  let trimmerDrop = 0;
  for (const k of kinds) {
    const a = g.partsByKind[k] || 0, b = s.partsByKind[k] || 0;
    if (a === b) continue;
    if (k === 'corner-trimmer' && b < a) trimmerDrop = a - b; else bad(`part kind ${k} ${a} -> ${b}`);
  }
  if (g.partCount - s.partCount !== trimmerDrop) bad(`partCount ${g.partCount} -> ${s.partCount} is not explained by ${trimmerDrop} trimmers`);
  if (JSON.stringify(g.counts) !== JSON.stringify(s.counts)) bad('material counts changed');
  for (const k of new Set([...Object.keys(g.stats), ...Object.keys(s.stats)])) {
    if (JSON.stringify(g.stats[k]) === JSON.stringify(s.stats[k])) continue;
    if (k === 'partCount' && g.stats[k] - s.stats[k] === trimmerDrop) continue;
    if (NEW_STATS.has(k) && !(k in g.stats)) continue;
    bad(`stat ${k} changed`);
  }
  for (const a of s.alerts.filter(x => !g.alerts.includes(x))) {
    if (ADDED_ALERTS.some(r => r.test(a))) continue;
    const m = a.match(GROUPED), old = g.alerts.map(x => x.match(GROUPED)).find(Boolean);
    if (m && old && m[2] === old[2] && Number(old[1]) - Number(m[1]) === trimmerDrop) continue;
    bad(`new alert: ${a.slice(0, 120)}`);
  }
  for (const a of g.alerts.filter(x => !s.alerts.includes(x))) if (!GROUPED.test(a)) bad(`removed alert: ${a.slice(0, 120)}`);
  writes.push([file, { ...golden, model: s }, trimmerDrop]);
}
if (problems.length) { console.error('REFUSED — differences outside the approved cases:\n' + problems.join('\n')); process.exit(1); }
for (const [file, data, t] of writes) { fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n'); console.log(`approved: ${path.basename(file)} (corner trimmers -${t})`); }
console.log(`${writes.length} snapshots updated; cut-corner left as the recorded target.`);
