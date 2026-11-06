// Schema v6: version stamp, derived perimeter segments and file migration.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./engine');
const { fixtures } = require('./fixtures');

const win = loadEngine();
const FIX = fixtures(win);
const core = win.DeckCore;
const plain = (v) => JSON.parse(JSON.stringify(v));

test('schema version is 6 and is stamped on every sanitized design', () => {
  assert.equal(core.SCHEMA_VERSION, 6);
  for (const raw of Object.values(FIX)) assert.equal(core.sanitize(raw).schemaVersion, 6);
});

for (const [name, raw] of Object.entries(FIX)) {
  test(`perimeter mirrors house/rail edges and stairs: ${name}`, () => {
    const q = plain(core.sanitize(raw));
    const es = plain(core.edges(core.polygon(q)));
    const segs = q.perimeter.segments;
    assert.equal(q.perimeter.source, 'derived');
    assert.equal(segs.length, es.length, 'one segment per edge');
    assert.deepEqual(segs.map(s => s.id), es.map((_, i) => `edge-${i}`));
    for (const s of segs) {
      const expected = q.houseEdges.includes(s.edge) ? 'house' : q.railEdges.includes(s.edge) ? 'rail' : 'open';
      assert.equal(s.kind, expected, `edge ${s.edge}`);
      assert.equal(s.product, s.kind === 'rail' ? q.railStyle : null);
      assert.equal(s.color, s.kind === 'rail' ? q.railColor : null);
      assert.ok(Math.abs(s.lengthFt - es[s.edge].len) < 0.001);
      assert.deepEqual(s.openings.map(o => o.id), q.staircases.filter(st => st.edge === s.edge).map(st => st.id));
    }
    // Railed segment length equals the deck railing footage the model already reports.
    const railLF = segs.filter(s => s.kind === 'rail').reduce((a, s) => a + s.lengthFt, 0);
    const model = core.make(raw);
    if (!model.stats.invalidGeometry && !q.staircases.length) assert.ok(Math.abs(railLF - model.stats.deckRailLF) < 0.01, `${railLF} vs ${model.stats.deckRailLF}`);
  });
}

test('a stale perimeter in a file is replaced, never trusted', () => {
  const raw = { ...FIX['default-rect-16x12'], perimeter: { source: 'derived', segments: [{ id: 'edge-0', kind: 'rail', product: 'Fake' }] } };
  const q = plain(core.sanitize(raw));
  assert.equal(q.perimeter.segments.length, 4);
  assert.equal(q.perimeter.segments[0].kind, 'house');
});

test('perimeter follows edits: removing a rail edge updates its segment', () => {
  const q = plain(core.sanitize(FIX['default-rect-16x12']));
  const edited = plain(core.sanitize({ ...q, railEdges: [1, 3] }));
  assert.equal(edited.perimeter.segments[2].kind, 'open');
  assert.equal(edited.perimeter.segments[1].kind, 'rail');
});

test('migrate() accepts V4 files, V5.0 envelopes and bare intents', () => {
  const v4 = core.migrate(FIX['legacy-v4-single-stair']);
  assert.equal(v4.fromVersion, 4);
  assert.equal(v4.toVersion, 6);
  assert.equal(v4.intent.staircases.length, 1);

  const v5file = { application: 'AOS Deck Studio V5.0', version: '5.0', design: plain(core.sanitize(FIX['multi-stair'])) };
  delete v5file.design.schemaVersion; delete v5file.design.perimeter;
  const v5 = core.migrate(v5file);
  assert.equal(v5.fromVersion, 5);
  assert.equal(v5.intent.staircases.length, 3);

  const v6 = core.migrate({ design: plain(core.sanitize(FIX['L-24x18'])) });
  assert.equal(v6.fromVersion, 6);
  assert.deepEqual(plain(v6.intent), plain(core.sanitize(FIX['L-24x18'])));

  assert.equal(core.migrate(null).intent.schemaVersion, 6);
});

test('migration does not change the physical model of any fixture', () => {
  for (const [name, raw] of Object.entries(FIX)) {
    const migrated = core.migrate({ design: raw }).intent;
    assert.equal(core.make(migrated).parts.length, core.make(raw).parts.length, name);
  }
});
