// R1 rail inset (owner, 11 Nov 2026): "Move all deck and stair railing posts inward 1½ inches from their
// respective finished outside edges." This is the ONLY owner-authorized engine change in this round.
// The comparison guards (V5.0 goldens, V5.2 equivalence, B3c, d404af5) keep comparing EVERYTHING else
// exactly; the railing itself is pinned by tests/baseline/rail-inset-r1.json and checked geometrically
// by tests/rail-inset-r1.test.js. This helper removes exactly the railing outputs from a comparison:
//   - parts in the 'rail' group (railing/stair posts, caps, rails, balusters)
//   - counts.railPosts and counts.balusters
//   - stats that sum railing parts or landing guard lengths (partCount, stairRailLF, totalRailLF, landings[].guardLF)
//   - the landing guard lines in geometry (guards, guardLF, transitions, flightRails)
//   - the two new railing review alerts (stair clear width, post mounting)
'use strict';
const RAIL_LINE = 1.5 / 12 + 0.21 / 2; // post centre: 1½ in. to the post face + half the 2.52 in. post
const RAIL_ALERT = /Railing posts are modeled with their outside faces 1½ in\. inside|with its railing posts 1½ in\. inside the stair edges/;
const RAIL_KINDS = new Set(['railing-post', 'post-cap', 'top-rail', 'bottom-rail', 'baluster', 'stair-top-rail', 'stair-bottom-rail', 'stair-baluster', 'stair-rail-post']);
const RAIL_COUNTS = ['railPosts', 'balusters'], RAIL_STATS = ['partCount', 'stairRailLF', 'totalRailLF'], LANDING_RAIL = ['guards', 'guardLF', 'transitions', 'flightRails'];
const isRail = (p) => p.group === 'rail';
const alertText = (a) => typeof a === 'string' ? a : a.message;
const noRailAlerts = (alerts) => (alerts || []).filter(a => !RAIL_ALERT.test(alertText(a)));
const drop = (o, keys) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !keys.includes(k)));
function stairGeometry(g) { if (!g || !g.landing) return g; return { ...g, landing: drop(g.landing, LANDING_RAIL) }; }
// Full model (DeckCore.make output, plain JSON) without the railing outputs. Part ids are a running
// number and shift when railing parts change, so they are left out of the comparison.
function withoutRailInset(m) {
  const o = JSON.parse(JSON.stringify(m));
  if (o.parts) o.parts = o.parts.filter(p => !isRail(p)).map(({ id, ...p }) => p);
  if (o.counts) o.counts = drop(o.counts, RAIL_COUNTS);
  if (o.stats) { o.stats = drop(o.stats, RAIL_STATS); if (Array.isArray(o.stats.landings)) o.stats.landings = o.stats.landings.map(l => drop(l, ['guardLF'])); }
  if (o.alerts) o.alerts = noRailAlerts(o.alerts);
  if (o.geometry) { if (o.geometry.stair) o.geometry.stair = stairGeometry(o.geometry.stair); if (o.geometry.stairs) o.geometry.stairs = o.geometry.stairs.map(stairGeometry); }
  return o;
}
// engine.js snapshot() form: railing kinds out of partsByKind and partCount.
function snapshotWithoutRail(s) {
  const o = JSON.parse(JSON.stringify(s)); let n = 0;
  for (const k of Object.keys(o.partsByKind || {})) if (RAIL_KINDS.has(k)) { n += o.partsByKind[k]; delete o.partsByKind[k]; }
  o.partCount -= n; o.counts = drop(o.counts, RAIL_COUNTS); o.stats = drop(o.stats, RAIL_STATS); o.alerts = noRailAlerts(o.alerts);
  return o;
}
function snapshotRail(s) {
  return { partsByKind: Object.fromEntries(Object.entries(s.partsByKind || {}).filter(([k]) => RAIL_KINDS.has(k))), counts: Object.fromEntries(RAIL_COUNTS.filter(k => k in (s.counts || {})).map(k => [k, s.counts[k]])),
    stats: Object.fromEntries(['stairRailLF', 'totalRailLF', 'deckRailLF'].filter(k => k in (s.stats || {})).map(k => [k, s.stats[k]])), alerts: (s.alerts || []).filter(a => RAIL_ALERT.test(alertText(a))) };
}
module.exports = { RAIL_LINE, RAIL_ALERT, RAIL_KINDS, isRail, withoutRailInset, snapshotWithoutRail, snapshotRail, noRailAlerts };
// Customer PDF (AOSDeckStudioTest.pdf() summary as compared by the C5/C6 PDF tests): the R1 rail inset
// changes only the 3D render (railing drawn 1½ in. further in) and, on designs with a landing, the
// "Railing linear ft" figure (landing guards are measured along their inset lines). Returns the summary
// with those two items replaced by markers, plus the railing figure so a test can check it on its own.
function pdfWithoutRail(sum) {
  const o = JSON.parse(JSON.stringify(sum)); let railLF = null;
  if (o.images) { if (!('view3d' in o.images)) throw new Error('PDF has no view3d image'); o.images.view3d = '§3d-render (R1 rail inset)'; }
  for (const p of o.pages || []) { const i = (p.texts || []).indexOf('Railing linear ft'); if (i > 0) { railLF = p.texts[i - 1]; p.texts[i - 1] = '§railing-lf (R1 rail inset)'; } }
  return { doc: o, railLF };
}
module.exports.pdfWithoutRail = pdfWithoutRail;
