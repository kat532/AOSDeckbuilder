// V5.3 C7 framing (owner authorization, 11 Nov 2026: "C7 Phase 2 Development Authorization", Gates A and B).
// This is the ONLY owner-authorized engine change in C7 so far. The comparison guards (V5.0 goldens, V5.2
// equivalence, B3c, d404af5, C2 and C6 saved files) keep comparing EVERYTHING else exactly. This helper
// removes exactly the C7 framing outputs from a comparison, mirroring tests/rail-inset.js:
//
//   On EVERY design (decision 11, internally correct counts):
//     - the new count categories counts.cornerTrimmers, counts.rimBackingJoists and counts.rimJoists;
//     - counts.joists is restored to its R1 definition (corner trimmers and rim-backing joists excluded);
//     - the new diagnostic model.framing record, and the two new C7 alerts (no valid framing layout found;
//       load-carrying side rim without a bearing path), which only appear where R1's own layout fails the screen.
//   Additionally on a design whose framing C7 changed (model.framing.changedFromR1), decided from the C7
//   model and applied identically to both sides of a comparison:
//     - framing and foundation parts (joists of every role, rims, beams, posts, footing concepts) and the
//       field-end blocking that is laid out between joist lanes;
//     - framing counts (joists, beams, posts, footings), framing stats, geometry.beams/joists, the
//       supplemental blocking quantity, and framing alerts.
//   A design's framing changes only when (a) the R1 layout fails the C7 screen and another layout passes
//   it, (b) a rim-backing joist is added along a notch side rim, or (c) a post that projected past the
//   outline is moved inward to the beam face. tests/framing-c7.test.js pins which baseline designs these are
//   (C7_REFRAMED below) and checks every reframed design structurally.
'use strict';
const C7_NEW_COUNTS = ['cornerTrimmers', 'rimBackingJoists', 'rimJoists'];
const C7_FRAMING_KINDS = new Set(['joist', 'picture-support-joist', 'divider-support-joist', 'corner-trimmer', 'rim-backing-joist', 'rim-joist',
  'dropped-beam', 'post-6x6', 'footing-concept', 'field-end-blocking', 'ledger']);
// The joist size can differ between layouts (ledger and joist depth, span limit and beam-load screening follow it).
const C7_FRAMING_COUNTS = ['joists', 'beams', 'posts', 'footings', 'joistNominal'];
const C7_FRAMING_STATS = ['partCount', 'beamLengthsFt', 'postSpacingFt', 'beamRows', 'beamRoles', 'sharedPosts', 'physicalSupportOutside', 'physicalSupportOutsideCount',
  'structuralEnvelopeOutsideCount', 'footingOutsideProjectionCount', 'unresolvedJoistRuns', 'framingPlanner', 'optimizerCandidates', 'sharedSupportZones', 'maxBeamCantFt', 'closeFootingPairs',
  'joistNominal', 'joistMaxSpanFt', 'unverifiedBeamLoadCount'];
const C7_FRAMING_ALERT = /individual joist runs into|physical beam\/post footprints|conceptual footing pads|Single primary beam|Interior\/shared beams|supplemental blocks|joist runs do not yet|footings closer than 3 ft|local support beam|Alternative uniform joist sizes|carry two beam ends|angled corner beam|No framing layout was found|load-carrying side rim|Some irregular areas need local headers|Irregular deck uses preliminary shared beams|Perimeter beam candidate|tributary load estimates outside|exceed the one-sided prescriptive/;
// Baseline designs (tests/baseline/designs.js) whose framing C7 changes, and why. Pinned by framing-c7.test.js.
const C7_REFRAMED = {
  'cut-corner': 'angled corner beams replace the single primary beam that left 4 joists unsupported (TODO case 4)',
  'free-hexagon': 'angled corner beams; R1 corner beams projected past the outline',
  'b3c-bevel-walls': 'angled corner beam; R1 corner beam projected past the outline',
  'U-32x22': 'main beam moved 0.1 ft clear of the open notch it ran into; rim-backing joists at the notch side rims',
  'large-U-40x24-9ft-stair': 'main beam moved clear of the open notch; rim-backing joists at the notch side rims',
  'L-24x18': 'rim-backing joist along the notch side rim (R1 rim bore only on a beam and a cantilevered corner)',
  'L-flipped-24x18': 'rim-backing joist along the notch side rim',
  'T-28x20': 'rim-backing joists along both notch side rims',
  'two-house-walls': 'rim-backing joist along the notch side rim',
  'bump-out': 'rim-backing joists along both bump-out side rims',
  'b2-diagonal-double-frame-dividers': 'rim-backing joist along the notch side rim',
  'b2-vertical-u': 'rim-backing joist along the notch side rim',
  'flush-beam': 'perimeter-header posts moved 1/2 in. inward to the beam face (R1 posts projected past the outline)',
  'freestanding-flush': 'perimeter-header posts moved 1/2 in. inward to the beam face (R1 posts projected past the outline)',
};
const drop = (o, keys) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !keys.includes(k)));
const alertText = (a) => typeof a === 'string' ? a : a.message;
const C7_NEW_ALERT = /No framing layout was found|load-carrying side rim/;
const reframed = (c7Model) => Boolean(c7Model && c7Model.framing && c7Model.framing.changedFromR1);
function legacyJoists(counts) {
  if (!counts || !('joists' in counts)) return counts;
  return { ...counts, joists: counts.joists - (counts.cornerTrimmers || 0) - (counts.rimBackingJoists || 0) };
}
// Full model (plain JSON) without the C7 outputs. `decide` is the C7-build model of the same design.
function withoutC7(m, decide = m) {
  const o = JSON.parse(JSON.stringify(m)), all = reframed(decide);
  delete o.framing;
  if (o.counts) o.counts = drop(legacyJoists(o.counts), C7_NEW_COUNTS);
  if (o.alerts) o.alerts = o.alerts.filter(a => !C7_NEW_ALERT.test(alertText(a)));
  if (!all) return o;
  if (o.parts) o.parts = o.parts.filter(p => !C7_FRAMING_KINDS.has(p.kind));
  if (o.counts) o.counts = drop(o.counts, C7_FRAMING_COUNTS);
  if (o.stats) o.stats = drop(o.stats, C7_FRAMING_STATS);
  if (o.materials) o.materials = drop(o.materials, ['supplementalBlocking']);
  if (o.alerts) o.alerts = o.alerts.filter(a => !C7_FRAMING_ALERT.test(alertText(a)));
  if (o.geometry) o.geometry = drop(o.geometry, ['beams', 'joists']);
  return o;
}
// engine.js snapshot() form. `decide` is the C7-build model (DeckCore.make output) of the same design.
function snapshotWithoutC7(s, decide) {
  const o = JSON.parse(JSON.stringify(s)), all = reframed(decide);
  o.counts = drop(legacyJoists(o.counts), C7_NEW_COUNTS);
  o.alerts = (o.alerts || []).filter(a => !C7_NEW_ALERT.test(alertText(a)));
  if (!all) return o;
  let n = 0; for (const k of Object.keys(o.partsByKind || {})) if (C7_FRAMING_KINDS.has(k)) { n += o.partsByKind[k]; delete o.partsByKind[k]; }
  o.partCount -= n; o.counts = drop(o.counts, C7_FRAMING_COUNTS); o.stats = drop(o.stats, C7_FRAMING_STATS);
  o.alerts = (o.alerts || []).filter(a => !C7_FRAMING_ALERT.test(alertText(a)));
  return o;
}
// Saved-file sections (componentModel parts, counts, alerts), as compared by the C2/C6 browser guards.
function savedWithoutC7(k, v, decide) {
  if (k === 'componentModel') return withoutC7({ parts: v }, decide).parts;
  if (k === 'counts') return withoutC7({ counts: v }, decide).counts;
  if (k === 'alerts') return withoutC7({ alerts: v }, decide).alerts;
  return v;
}
module.exports = { C7_NEW_ALERT, C7_NEW_COUNTS, C7_FRAMING_KINDS, C7_FRAMING_COUNTS, C7_FRAMING_STATS, C7_FRAMING_ALERT, C7_REFRAMED, reframed, withoutC7, snapshotWithoutC7, savedWithoutC7 };
