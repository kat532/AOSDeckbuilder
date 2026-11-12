// Regression tests: the physical model for every fixture must match the golden
// snapshot taken from the V5.0 baseline. A failure means geometry, framing,
// quantities or alerts changed. Run `npm run golden` only for intended changes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEngine, snapshot } = require('./engine');
const { fixtures } = require('./fixtures');
const { snapshotWithoutRail, snapshotRail } = require('./rail-inset');
const { snapshotWithoutC7 } = require('./c7-framing');
const RAIL_PINS = JSON.parse(fs.readFileSync(path.join(__dirname, 'baseline', 'rail-inset-r1.json'), 'utf8')).snapshots;

const win = loadEngine();
const FIX = fixtures(win);
const GOLDEN = path.join(__dirname, 'golden');

// Intent keys added after the V5.0 baseline. They are allowed in sanitized output
// and are checked by schema.test.js instead of the baseline goldens.
const ADDED_INTENT_KEYS = ['schemaVersion', 'perimeter', 'railOverrides'];
const withoutAdded = (q) => Object.fromEntries(Object.entries(q).filter(([k]) => !ADDED_INTENT_KEYS.includes(k)));
const plain = (v) => JSON.parse(JSON.stringify(v));

test('every fixture builds', () => {
  for (const [name, raw] of Object.entries(FIX)) assert.ok(raw, `${name} fixture could not be built`);
});

for (const [name, raw] of Object.entries(FIX)) {
  // Case 4 (owner decision 7 Nov 2026): V5.2 frames angled corners with one main beam and
  // leaves short corner joists without confirmed bearing. That is NOT accepted as passing:
  // the recorded snapshot stays the target and the test runs as a known structural failure.
  // V5.3 C7: the corner joists are now supported (tests/framing-c7.test.js), but this golden predates the B2
  // decking and B3 house changes recorded in every other golden, so it still differs outside the framing.
  // It may only be re-recorded after the owner accepts the C7 framing (C7 authorization, decision 19).
  const KNOWN_FAILING = { 'cut-corner': 'KNOWN FAILURE (V5.2 case 4 golden): framing now supported in C7; golden predates B2 decking/B3 house and awaits owner-approved re-record' };
  test(`model matches V5.0 baseline: ${name}`, KNOWN_FAILING[name] ? { todo: KNOWN_FAILING[name] } : {}, () => {
    const golden = JSON.parse(fs.readFileSync(path.join(GOLDEN, `${name}.json`), 'utf8'));
    // R1 rail inset (owner, 11 Nov 2026): railing posts moved 1½ in. inside the finished edges. Everything
    // else must still equal the V5.0 golden exactly; the railing outputs must equal the R1 rail record.
    // V5.3 C7 framing (owner, 11 Nov 2026): framing outputs of the designs C7 reframes, and the new framing
    // count categories, are excepted here and checked by tests/framing-c7.test.js; everything else exact.
    const snap = snapshot(win, raw), c7 = win.DeckCore.make(raw);
    assert.deepEqual(snapshotWithoutC7(snapshotWithoutRail(snap), c7), snapshotWithoutC7(snapshotWithoutRail(golden.model), c7));
    assert.deepEqual(snapshotRail(snap), RAIL_PINS[name], `${name}: railing outputs (R1 rail inset record)`);
  });

  test(`sanitized intent matches V5.0 baseline: ${name}`, () => {
    const golden = JSON.parse(fs.readFileSync(path.join(GOLDEN, `${name}.json`), 'utf8'));
    assert.deepEqual(withoutAdded(plain(win.DeckCore.sanitize(raw))), withoutAdded(golden.intent));
  });

  test(`sanitize is idempotent: ${name}`, () => {
    const once = plain(win.DeckCore.sanitize(raw));
    assert.deepEqual(plain(win.DeckCore.sanitize(once)), once);
  });

  test(`save -> open round trip keeps the design: ${name}`, () => {
    // Mirrors saveDesign() / file open: JSON envelope with `design`, re-sanitized on load.
    const q = win.DeckCore.sanitize(raw);
    const file = JSON.parse(JSON.stringify({ application: 'AOS Deck Studio', design: q }));
    const loaded = file.design || file.intent || file;
    assert.deepEqual(plain(win.DeckCore.sanitize(loaded)), plain(q));
    assert.deepEqual(snapshot(win, loaded), snapshot(win, q));
  });
}

test('legacy V4 single stair migrates to staircases[] and keeps its rail sides', () => {
  const q = plain(win.DeckCore.sanitize(FIX['legacy-v4-single-stair']));
  assert.equal(q.staircases.length, 1);
  assert.equal(q.staircases[0].edge, 2);
  assert.deepEqual(q.staircases[0].rails, { left: true, right: false });
});

test('legacy attached:false file becomes freestanding with all edges railed', () => {
  const q = plain(win.DeckCore.sanitize(FIX['legacy-minimal-attached-false']));
  assert.deepEqual(q.houseEdges, []);
  assert.deepEqual(q.railEdges, [0, 1, 2, 3]);
});

test('house edges never carry railings', () => {
  for (const raw of Object.values(FIX)) {
    const q = win.DeckCore.sanitize(raw);
    for (const e of q.houseEdges) assert.ok(!q.railEdges.includes(e));
  }
});

test('invalid outline is rejected without throwing', () => {
  const base = win.DeckCore.baseIntent();
  const bow = { ...base, shape: 'free', points: [[0, 0], [1, 1], [1, 0], [0, 1]] };
  const m = win.DeckCore.make(bow);
  assert.equal(m.parts.length, 0);
  assert.ok(m.alerts.some(a => /Invalid deck outline/.test(a.message)));
});

test('unknown products fall back to defaults instead of being saved', () => {
  const base = win.DeckCore.baseIntent();
  const q = win.DeckCore.sanitize({ ...base, decking: 'Made Up Color', railStyle: 'Made Up Rail', collection: 'Fake Line', railColor: 'Pink' });
  assert.equal(q.decking, base.decking);
  assert.equal(q.railStyle, base.railStyle);
  assert.equal(q.collection, base.collection);
  assert.equal(q.railColor, base.railColor);
});

test('large deck model builds in under 250 ms', () => {
  const t = process.hrtime.bigint();
  win.DeckCore.make(FIX['large-U-40x24-9ft-stair']);
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  assert.ok(ms < 250, `make() took ${ms.toFixed(1)} ms`);
});
