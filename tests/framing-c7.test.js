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
const { CASES: C7CASES, audit: c7audit, supportChecks } = require('./c7-audit');
const { pfMembers } = require('./c7-picture-frame');
const IRREGULAR = require('./c7-irregular-shapes');

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
    assert.deepEqual(supportChecks(r.m), [], 'beam connections, beam-end posts and posts under beams');
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

// Owner visual testing, 11 Nov 2026 (Gate B NOT approved). The owner irregular deck and the challenging custom
// outlines below are checked member by member: joists and rims bear, beams and posts are inside, beams touch
// only where they END on one post that stands under both, every beam end has a post, no post stands alone.
const OWNER = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'owner-irregular-deck.json'), 'utf8')).design;
const SHAPES = IRREGULAR(OWNER);
// Outlines on which no compared layout passes the screen (short joists in acute 22.5/45-degree tips whose
// cantilevers exceed a quarter of the span between their two bearings). Shown for production review.
const C7_NO_VALID_LAYOUT = ['flared 22.5° sides', 'narrow angled arm'];

test('C7 the owner irregular deck now has a layout that passes the screen, with every connection supported', () => {
  const r = audit(OWNER);
  assert.equal(r.m.framing.screenPassed, true);
  assert.equal(r.m.framing.structuralReviewRequired, false);
  assert.deepEqual(plain(r.joistFaults.map(x => x.j.t.toFixed(2))), []);
  assert.deepEqual(plain(r.rims.filter(x => !x.supported).map(x => x.edge)), []);
  assert.deepEqual(plain(r.outsideMembers.map(p => p.kind)), []);
  assert.deepEqual(supportChecks(r.m), []);
  assert.equal(r.m.stats.unresolvedJoistRuns, 0);
  assert.ok(!r.m.parts.some(p => p.structuralFault), 'nothing marked red');
  assert.ok(r.m.alerts.some(a => /NOT a code-verified design/.test(a.message)));
});

for (const [name, q] of Object.entries(SHAPES)) {
  test(`C7 irregular outline: framing passes, or every failing member is shown red for production review: ${name}`, () => {
    const r = audit(q), m = r.m;
    // Whatever is shown: no beam/post outside, no clash, no beam end without a post, no orphan post.
    assert.deepEqual(plain(r.outsideMembers.map(p => p.kind)), [], 'beams/posts outside');
    assert.deepEqual(supportChecks(m), [], 'connections and posts');
    assert.equal(m.framing.screenPassed, !C7_NO_VALID_LAYOUT.includes(name), 'screen result as documented');
    if (m.framing.screenPassed) {
      assert.deepEqual(plain(r.joistFaults.map(x => `${x.j.t.toFixed(2)}: ${x.f.join(', ')}`)), []);
      assert.deepEqual(plain(r.rims.filter(x => !x.supported).map(x => x.edge)), []);
      assert.ok(!m.parts.some(p => p.structuralFault));
      return;
    }
    assert.equal(m.framing.structuralReviewRequired, true);
    assert.ok(m.alerts.some(a => a.level === 'warning' && /requires structural review.*NOT a buildable layout/.test(a.message)));
    assert.ok(m.alerts.some(a => a.level === 'warning' && /shown in red/.test(a.message)));
    // Each joist the independent audit finds unsupported is drawn red and labelled NOT BUILDABLE.
    const nrm = [-m.geometry.joistAxis[1], m.geometry.joistAxis[0]];
    for (const { j } of r.joistFaults) {
      const red = m.parts.filter(p => p.structuralFault && /joist|trimmer/.test(p.kind) && Math.abs(p.x * nrm[0] + p.z * nrm[1] - j.t) < 0.12);
      assert.ok(red.length && red.every(p => p.color === '#c62828' && /^NOT BUILDABLE/.test(p.label)), `joist @${j.t.toFixed(2)} marked red`);
    }
    assert.ok(r.joistFaults.length > 0 && m.framing.faultMarked >= r.joistFaults.length);
  });
}

test('C7 picture-frame framing is R1\'s, member by member, on every baseline design', () => {
  // tests/baseline/c7-picture-frame-r1.json was recorded from R1 (01f16df) by scripts/record-c7-picture-frame-r1.js.
  const R1 = JSON.parse(fs.readFileSync(path.join(__dirname, 'baseline', 'c7-picture-frame-r1.json'), 'utf8'));
  assert.equal(R1.recordedFrom.slice(0, 7), '01f16df');
  for (const [name, q] of Object.entries(BASE)) {
    const m = core.make(core.sanitize(q));
    assert.deepEqual(plain(pfMembers(m)), R1.designs[name], `${name}: support joists, flat 2x6 blocking, corner trimmers, field-end blocking`);
    // No rim-backing joist where a picture-frame assembly already backs the rim.
    for (const f of m.parts.filter(p => p.kind === 'picture-blocking-2x6-flat')) {
      const e = m.geometry.edges[Number(/edge-(\d+)-/.exec(f.connect)[1])];
      assert.ok(!m.parts.some(p => p.kind === 'rim-backing-joist' && Math.abs((p.x - e.a[0]) * e.n[0] + (p.z - e.a[1]) * e.n[1]) < 1.6), `${name}: edge ${e.i} has no rim-backing joist`);
    }
  }
});

test('C7 bordered rims backed by the R1 picture-frame assembly are reported as such', () => {
  const r = audit(CASES['L template']);
  assert.ok(r.rims.some(x => x.supported && x.path === 'picture-frame assembly'));
  assert.equal(r.m.counts.rimBackingJoists, 0);
  assert.ok(r.m.framing.rims.some(x => /picture-frame assembly/.test(x.path || '')));
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
