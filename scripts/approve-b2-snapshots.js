// One-time snapshot update for V5.2 Group B — B2 (decking layout), 7 Nov 2026.
// B2 intentionally changes the DECKING FINISH geometry only:
//   - field boards stop exactly one board gap (3/16 in.) from picture-frame and divider boards
//     (fewer, cleaner mesh fragments: stats.fieldBoardFragments / partsByKind field-board);
//   - divider boards no longer leave slivers in the gaps between frame courses
//     (fragment counts partsByKind divider-board / counts.dividers);
//   - double frames: the second course is one board gap from the first (picture-frame geometry);
//   - NEW supplemental blocking under field-board ends along frames that cross the joists
//     (partsByKind field-end-blocking + its review alert).
// Everything else (every framing member kind and count, beams, posts, footings, joists, stats,
// railings, stairs, alerts) must be IDENTICAL, or the script refuses to write anything.
// Before writing, each changed fixture's actual board geometry is checked: no overlapping boards,
// no hole wider than a board gap, and every field board at least one gap from frame/divider boards.
// cut-corner (case 4) is NOT approved and is never rewritten.
'use strict';
const fs = require('fs');
const path = require('path');
const { loadEngine, snapshot, ROOT } = require('../tests/engine');
const { fixtures } = require('../tests/fixtures');

const NOT_APPROVED = new Set(['cut-corner']);
const FINISH_KINDS = new Set(['field-board', 'picture-frame', 'divider-board', 'field-end-blocking']);
const FRAGMENT_COUNTS = new Set(['dividers', 'borderBoards']);
const FINISH_STATS = new Set(['partCount', 'fieldBoardFragments']);
const ADDED_ALERT = /^review: \d+ supplemental blocks? \([\d.]+ LF\) added between joists under field-board ends along the picture frame\./;

const win = loadEngine(), core = win.DeckCore;
function inside(pt, poly) { let yes = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes; } return yes; }
function segd(p, a, b) { const d = [b[0] - a[0], b[1] - a[1]], l2 = d[0] * d[0] + d[1] * d[1] || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2)); return Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1]); }
const dist = (p, poly) => Math.min(...poly.map((a, i) => segd(p, a, poly[(i + 1) % poly.length])));
function geometryCheck(raw) {
  const m = core.make(raw), poly = m.geometry.poly, pcs = m.parts.filter(p => /^(field-board|picture-frame|divider-board)$/.test(p.kind));
  const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]), N = 110, problems = [];
  let n = 0, dbl = 0, hole = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const pt = [Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) * (i + .5137) / N, Math.min(...zs) + (Math.max(...zs) - Math.min(...zs)) * (j + .4721) / N];
    if (!inside(pt, poly) || dist(pt, poly) < .01) continue; n++;
    const c = pcs.filter(p => inside(pt, p.footprint)).length;
    if (c > 1) dbl++;
    if (!c && Math.min(...pcs.map(p => dist(pt, p.footprint))) > core.GAP * .75) hole++;
  }
  if (dbl) problems.push(`${dbl} overlapping samples`);
  if (hole) problems.push(`${hole} holes wider than a board gap`);
  const frames = pcs.filter(p => p.kind !== 'field-board');
  for (const f of pcs.filter(p => p.kind === 'field-board')) for (const v of f.footprint) for (const o of frames) {
    if (inside(v, o.footprint) || dist(v, o.footprint) < core.GAP - 2e-4) { problems.push('field board closer than a gap to a frame/divider board'); break; }
  }
  return [...new Set(problems)];
}

const dir = path.join(ROOT, 'tests', 'golden'), problems = [], writes = [];
for (const [name, raw] of Object.entries(fixtures(win))) {
  const file = path.join(dir, `${name}.json`), golden = JSON.parse(fs.readFileSync(file, 'utf8')), g = golden.model, s = snapshot(win, raw);
  if (JSON.stringify(g) === JSON.stringify(s)) continue;
  if (NOT_APPROVED.has(name)) { console.log(`kept (not approved, case 4): ${name}`); continue; }
  const bad = (m) => problems.push(`${name}: ${m}`);
  let finishDelta = 0;
  for (const k of new Set([...Object.keys(g.partsByKind), ...Object.keys(s.partsByKind)])) {
    const a = g.partsByKind[k] || 0, b = s.partsByKind[k] || 0; if (a === b) continue;
    if (FINISH_KINDS.has(k)) finishDelta += b - a; else bad(`part kind ${k} ${a} -> ${b}`);
  }
  if (s.partCount - g.partCount !== finishDelta) bad('partCount change not explained by decking finish');
  for (const k of new Set([...Object.keys(g.counts), ...Object.keys(s.counts)])) if (JSON.stringify(g.counts[k]) !== JSON.stringify(s.counts[k]) && !FRAGMENT_COUNTS.has(k)) bad(`count ${k} changed`);
  for (const k of new Set([...Object.keys(g.stats), ...Object.keys(s.stats)])) if (JSON.stringify(g.stats[k]) !== JSON.stringify(s.stats[k]) && !FINISH_STATS.has(k)) bad(`stat ${k} changed`);
  for (const a of s.alerts.filter(x => !g.alerts.includes(x))) if (!ADDED_ALERT.test(a)) bad(`new alert: ${a.slice(0, 100)}`);
  for (const a of g.alerts.filter(x => !s.alerts.includes(x))) bad(`removed alert: ${a.slice(0, 100)}`);
  for (const p of geometryCheck(raw)) bad(`geometry: ${p}`);
  writes.push([file, { ...golden, model: s }, finishDelta]);
}
if (problems.length) { console.error('REFUSED — differences outside the approved B2 decking changes:\n' + problems.join('\n')); process.exit(1); }
for (const [file, data, dlt] of writes) { fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n'); console.log(`approved: ${path.basename(file)} (decking finish parts ${dlt >= 0 ? '+' : ''}${dlt})`); }
console.log(`${writes.length} snapshots updated; cut-corner left as the recorded target.`);
