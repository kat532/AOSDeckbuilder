// V5.3 C7 Gate C (owner authorization 11 Nov 2026, "Stair and Railing Stabilization"). The comparison guards
// (V5.0 goldens, V5.2 equivalence, B3c, d404af5, R1 rail record) keep comparing EVERYTHING else exactly. This
// helper removes exactly the Gate C outputs, mirroring tests/rail-inset.js and tests/c7-framing.js:
//   Railing (geometry changed by Gate C; checked by tests/stairs-rails-c7c.test.js and pinned in
//   tests/baseline/c7-gate-c-rail.json):
//     - balusters (deck, landing and stair): re-spaced for at most 3¾ in. clear between posts, and lengthened
//       to the new bottom rail;
//     - bottom rails: underside 3 in. above the deck/landing surface (was about 5½ in.), and on stairs ½ in.
//       above the nosing line (was about 6 in.);
//     - counts.balusters.
//   Posts, post caps and top rails are NOT excepted: they must stay exactly as in R1 (1½ in. inset preserved).
//   Stairs: the new stringer support members on cut-stringer flights longer than 6 ft (beam, posts, footings)
//   and their counts.
//   Alerts: the new Gate C alerts (finished stair clearance, handrail required, guard required, stringer support).
'use strict';
const GATE_C_RAIL_KINDS = new Set(['baluster', 'stair-baluster', 'bottom-rail', 'stair-bottom-rail']);
const GATE_C_STAIR_KINDS = new Set(['stair-stringer-support', 'stair-support-post', 'stair-support-footing']);
const GATE_C_COUNTS = ['stairSupportBeams', 'stairSupportPosts', 'stairSupportFootings'];
const GATE_C_ALERT = /Structural Review Required — stair on edge|AOS requires at least one intermediate structural support|finished clear width about|continuous graspable handrail 34–38 in\.|need a guard \(Minnesota Residential Code R312\.1\.1|cut stringers run .* than the 6 ft limit for cut stringers/;
const alertText = (a) => typeof a === 'string' ? a : a.message;
const drop = (o, keys) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !keys.includes(k)));
// Full model (plain JSON): without the Gate C stair members, counts and alerts (railing is handled by rail-inset.js).
function withoutGateC(m) {
  const o = JSON.parse(JSON.stringify(m));
  if (o.parts) o.parts = o.parts.filter(p => !GATE_C_STAIR_KINDS.has(p.kind)).map(({ id, ...p }) => p);
  if (o.counts) o.counts = drop(o.counts, GATE_C_COUNTS);
  if (o.alerts) o.alerts = o.alerts.filter(a => !GATE_C_ALERT.test(alertText(a)));
  if (o.stats && 'partCount' in o.stats) delete o.stats.partCount;
  if (o.stats) delete o.stats.stairSpanReview; // Gate C3: flights flagged Structural Review Required (stringer span)
  return o;
}
// engine.js snapshot() form.
function snapshotWithoutGateC(s) {
  const o = JSON.parse(JSON.stringify(s)); let n = 0;
  for (const k of Object.keys(o.partsByKind || {})) if (GATE_C_STAIR_KINDS.has(k)) { n += o.partsByKind[k]; delete o.partsByKind[k]; }
  if (typeof o.partCount === 'number') o.partCount -= n;
  o.counts = drop(o.counts, GATE_C_COUNTS); o.alerts = (o.alerts || []).filter(a => !GATE_C_ALERT.test(alertText(a)));
  if (o.stats) delete o.stats.stairSpanReview;
  return o;
}
// R1 rail record form (snapshotRail / design pin): balusters re-spaced by Gate C are excepted; posts, caps,
// top rails, bottom-rail counts, linear feet and the R1 railing alerts must be unchanged.
function railRecordWithoutGateC(r) {
  const o = JSON.parse(JSON.stringify(r));
  if (o.partsByKind) for (const k of ['baluster', 'stair-baluster']) delete o.partsByKind[k];
  if (o.counts) delete o.counts.balusters;
  return o;
}
// Railing parts that Gate C must leave exactly as R1 built them (posts, caps, top rails), without ids.
const r1RailParts = (m, isRail) => m.parts.filter(p => isRail(p) && !GATE_C_RAIL_KINDS.has(p.kind)).map(({ id, ...p }) => p);
// Saved-file form (componentModel / counts / alerts as written in a design file).
function savedWithoutGateC(k, v) {
  if (k === 'componentModel') return (v || []).filter(p => !GATE_C_STAIR_KINDS.has(p.kind));
  if (k === 'counts') return drop(v, GATE_C_COUNTS);
  if (k === 'alerts') return (v || []).filter(a => !GATE_C_ALERT.test(alertText(a)));
  if (k === 'stats' && v && typeof v === 'object') { const o = { ...v }; delete o.stairSpanReview; return o; }
  return v;
}
module.exports = { savedWithoutGateC, GATE_C_RAIL_KINDS, GATE_C_STAIR_KINDS, GATE_C_COUNTS, GATE_C_ALERT, withoutGateC, snapshotWithoutGateC, railRecordWithoutGateC, r1RailParts };
