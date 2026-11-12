// V5.3 C7 Gates A and B (owner authorization, 11 Nov 2026): framing defects exposed, then corrected.
// The checks below are written independently of the engine's own C7 screen (index.html assessLayout):
// they re-derive bearing, rim support and physical placement from the model's geometry and parts, so the
// engine is not grading itself. Distinctions required by the authorization (Gate A, item 5):
//   - an unsupported joist or load-carrying rim is a DEFECT (test failure);
//   - a beam or post whose physical footprint leaves the deck outline is a DEFECT (test failure);
//   - a conceptual footing pad projecting past the outline is NOT a defect by itself (reported only);
//   - footings closer than 3 ft are a REVIEW flag (must be counted and alerted), never a failure.
// Gate A recorded these against R1 (01f16df): see C7_R1_FAILING; Gate B makes them pass.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEngine, ROOT } = require('./engine');
const { fixtures } = require('./fixtures');
const { designs } = require('./baseline/designs');
const { C7_REFRAMED } = require('./c7-framing');
const { CASES: C7CASES, audit: c7audit } = require('./c7-audit');

const win = loadEngine(), core = win.DeckCore;
const FX = fixtures(win), BASE = designs(win), CASES = C7CASES(FX);
const audit = (q) => c7audit(win, q);
const plain = (v) => JSON.parse(JSON.stringify(v));
// What each case did in R1 (01f16df), recorded in Gate A by running these same checks on R1.
const C7_R1_FAILING = {
  '18x12 ledger deck, two 45° cut corners': '4 joists without bearing (single primary beam); 2 side rims unsupported',
  '16x12 ledger deck, one 45° cut corner': '4 joists without bearing (single primary beam); 2 side rims unsupported',
  '18x12 freestanding angled deck': '3 beams and 2 posts outside the outline; 2 side rims fail the 1/4-backspan rule',
  '16x16 octagon': '6 beams outside the outline; 2 side rims unsupported',
  '20x14 large-corner deck': '2 side rims unsupported (perimeter planner)',
  'free-drawn hexagon': '3 beams outside the outline',
  'bump-out deck': '2 bump-out side rims bear only on a beam and a cantilevered corner',
  'L template': 'notch side rim bears only on a beam and a cantilevered corner',
  'T template': '2 notch side rims bear only on a beam and a cantilevered corner',
  'U template': 'main beam runs 0.07 ft into the open notch (1 beam, 2 posts outside); 2 notch side rims unsupported',
};

for (const [name, q] of Object.entries(CASES)) {
  test(`C7 framing: every joist and load-carrying rim bears; every beam and post inside the outline: ${name}`, () => {
    const r = audit(q);
    assert.deepEqual(plain(r.joistFaults.map(x => `${x.j.role || 'joist'} @${x.j.t.toFixed(2)}: ${x.f.join(', ')}`)), [], 'unsupported joists');
    assert.deepEqual(plain(r.rims.filter(x => !x.supported).map(x => `edge ${x.edge} (${x.len} ft): ${x.faults.join(', ')}`)), [], 'unsupported load-carrying rims');
    assert.deepEqual(plain(r.outsideMembers.map(p => `${p.kind} ${p.role || ''}`.trim())), [], 'beams/posts outside the deck outline');
    for (const p of r.m.parts.filter(p => p.kind === 'dropped-beam')) assert.ok(p.w >= 1.5, `${p.w.toFixed(2)} ft ${p.role} beam (no tiny beam fragments)`);
    assert.equal(r.m.counts.footings, r.m.counts.posts, 'one footing per post');
    // Review, not failure: crowded footings are counted and flagged; footing pads past the outline are allowed.
    assert.equal(r.m.stats.closeFootingPairs, r.close, 'close footing pairs counted');
    assert.equal(r.close > 0, r.m.alerts.some(a => /closer than 3 ft/.test(a.message)), 'close footings flagged for review');
    // The engine's own screen agrees with this independent audit, and nothing is presented as approved.
    assert.ok(r.m.framing && r.m.framing.screenPassed, 'engine screen passed');
    assert.equal(r.m.stats.unresolvedJoistRuns, 0);
    assert.ok(!r.m.alerts.some(a => /No framing layout was found/.test(a.message)));
    assert.ok(r.m.alerts.some(a => /NOT a code-verified design/.test(a.message)));
  });
}

test('C7 framing counts are internally correct: corner trimmers, rim-backing joists and rim joists', () => {
  for (const [name, q] of Object.entries({ ...CASES, ...BASE })) {
    const m = core.make(core.sanitize(q)), qty = (k) => m.parts.filter(p => p.kind === k).length;
    assert.equal(m.counts.joists, qty('joist') + qty('picture-support-joist') + qty('divider-support-joist') + qty('corner-trimmer') + qty('rim-backing-joist'), `${name}: joists include every joist role`);
    assert.equal(m.counts.cornerTrimmers, qty('corner-trimmer'), name);
    assert.equal(m.counts.rimBackingJoists, qty('rim-backing-joist'), name);
    assert.equal(m.counts.rimJoists, qty('rim-joist'), name);
    assert.ok(m.counts.rimJoists > 0, `${name}: rims are counted`);
  }
});

test('C7 every baseline design passes the framing screen; exactly the documented designs are reframed', () => {
  const changed = [];
  for (const [name, q] of Object.entries(BASE)) {
    const r = audit(q);
    assert.equal(r.summary.unsupportedJoists + r.summary.unsupportedRims + r.summary.outsideBeamsPosts, 0, `${name}: ${JSON.stringify(r.summary)}`);
    assert.ok(r.m.framing.screenPassed, name);
    if (r.m.framing.changedFromR1) changed.push(name);
  }
  assert.deepEqual(changed.sort(), Object.keys(C7_REFRAMED).sort(), 'reframed designs = C7_REFRAMED in tests/c7-framing.js');
});

test('C7 when no layout passes, the design is reported for structural review and never as buildable', () => {
  // The owner irregular deck: R1 itself leaves joist runs without confirmed bearing; C7 finds no layout that
  // passes, keeps the R1 layout unchanged and says so.
  const owner = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'owner-irregular-deck.json'), 'utf8')).design;
  const m = core.make(owner);
  assert.equal(m.framing.screenPassed, false);
  assert.equal(m.framing.structuralReviewRequired, true);
  assert.ok(m.alerts.some(a => a.level === 'warning' && /No framing layout was found.*requires structural review.*NOT a buildable layout/.test(a.message)));
  assert.equal(m.counts.beams, 3); assert.equal(m.counts.posts, 8); // the R1 layout, unchanged
});

test('C7 angled corner beams are labeled, follow the cut edge, and meet the main beam on one shared post', () => {
  const m = core.make(core.sanitize(CASES['18x12 ledger deck, two 45° cut corners']));
  const corner = m.parts.filter(p => p.kind === 'dropped-beam' && p.role === 'corner-beam');
  assert.equal(corner.length, 2);
  for (const b of corner) {
    assert.match(b.label, /angled corner beam.*AOS production review/);
    assert.ok(Math.abs(Math.abs(Math.sin(b.yaw)) - Math.SQRT1_2) < 0.01, 'parallel to the 45° cut');
  }
  assert.ok(m.stats.sharedPosts >= 2 && m.alerts.some(a => /carry two beam ends/.test(a.message)), 'junction posts flagged for connection review');
});

test('C7 report: actual framing values for every required case (C7 and R1 recorded side by side)', () => {
  const out = {}; for (const [name, q] of Object.entries(CASES)) out[name] = audit(q).summary;
  const R1 = JSON.parse(fs.readFileSync(path.join(__dirname, 'baseline', 'c7-framing-r1-gate-a.json'), 'utf8'));
  fs.mkdirSync(path.join(ROOT, 'test-results'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'test-results', 'c7-framing-report.json'), JSON.stringify({ c7: out, r1: R1.cases }, null, 2));
  for (const name of Object.keys(CASES)) {
    assert.ok(R1.cases[name], `${name}: recorded in Gate A`);
    assert.equal(R1.cases[name].failedOnR1, Boolean(C7_R1_FAILING[name]), `${name}: Gate A record agrees with C7_R1_FAILING`);
  }
});
