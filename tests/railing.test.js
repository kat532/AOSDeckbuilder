// V5.1 per-edge railing finish: data rules, geometry colors, shape-edit carry-over.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine, snapshot } = require('./engine');
const { fixtures } = require('./fixtures');
const { RAIL_LINE } = require('./rail-inset');

const win = loadEngine();
const core = win.DeckCore;
const FIX = fixtures(win);
const plain = (v) => JSON.parse(JSON.stringify(v));
const RAILS = plain(core.RAILS);

// Default 16x12 rectangle: edge 0 = house, edges 1, 2, 3 railed.
const base = () => plain(core.sanitize(FIX['default-rect-16x12']));
const railParts = (m) => m.parts.filter(p => p.group === 'rail');
const colorsOf = (parts) => [...new Set(parts.map(p => p.color))].sort();

test('no overrides: railOverrides is empty and the model is unchanged', () => {
  const q = base();
  assert.deepEqual(q.railOverrides, {});
  assert.deepEqual(snapshot(win, q), snapshot(win, FIX['default-rect-16x12']));
});

test('a valid override on a railed edge is kept', () => {
  const q = plain(core.sanitize({ ...base(), railOverrides: { 2: { railColor: 'Bronze' } } }));
  assert.deepEqual(q.railOverrides, { 2: { railColor: 'Bronze' } });
  assert.deepEqual(plain(core.railFinish(q, 2)), { railStyle: q.railStyle, railColor: 'Bronze', custom: true });
  assert.deepEqual(plain(core.railFinish(q, 1)), { railStyle: q.railStyle, railColor: q.railColor, custom: false });
});

test('overrides are dropped for house edges, unrailed edges, unknown edges and invalid values', () => {
  const q = plain(core.sanitize({
    ...base(), railEdges: [1, 2],
    railOverrides: {
      0: { railColor: 'Bronze' },            // house wall
      3: { railColor: 'Bronze' },            // not railed
      9: { railColor: 'Bronze' },            // no such edge
      1: { railColor: 'Pink', railStyle: 'Made Up Rail' }, // not in catalog
      2: { railColor: base().railColor },    // same as whole deck: nothing custom
    },
  }));
  assert.deepEqual(q.railOverrides, {});
});

test('sanitize stays idempotent with overrides', () => {
  const once = plain(core.sanitize({ ...base(), railOverrides: { 1: { railColor: 'White', railStyle: 'No rail product selected' }, 3: { railColor: 'Bronze' } } }));
  assert.deepEqual(plain(core.sanitize(once)), once);
});

test('an override changes only colors: part counts and quantities are identical', () => {
  const q = base();
  const custom = { ...q, railOverrides: { 2: { railColor: 'Bronze' } } };
  const a = snapshot(win, q), b = snapshot(win, custom);
  assert.deepEqual(b.partsByKind, a.partsByKind);
  assert.deepEqual(b.counts, a.counts);
  assert.deepEqual(b.stats, a.stats);
  assert.deepEqual(b.alerts, a.alerts);
});

test('rail parts on the overridden edge use its color; others keep the whole-deck color', () => {
  const q = base();
  const all = railParts(core.make(q));
  assert.deepEqual(colorsOf(all), [RAILS[q.railColor]]);
  const m = core.make({ ...q, railOverrides: { 2: { railColor: 'Bronze' } } });
  const parts = railParts(m);
  assert.deepEqual(colorsOf(parts), [RAILS.Bronze, RAILS[q.railColor]].sort());
  // Edge 2 is the 16 ft front edge: its top rail runs the full edge in Bronze, between the two corner
  // posts, which since R1 stand 1½ in. + half a post (RAIL_LINE) inside each outside corner.
  const bronzeTop = parts.filter(p => p.kind === 'top-rail' && p.color === RAILS.Bronze).reduce((s, p) => s + p.w, 0);
  assert.ok(Math.abs(bronzeTop - (16 - 2 * RAIL_LINE)) < 0.01, `bronze top rail ${bronzeTop} ft`);
});

test('stair railings follow the color of the edge the stair sits on', () => {
  const q = plain(core.sanitize(FIX['medium-rect-20x14-stair'])); // stair on edge 2
  const m = core.make({ ...q, railOverrides: { 2: { railColor: 'White' } } });
  const stairRail = m.parts.filter(p => p.kind.startsWith('stair-') && p.group === 'rail');
  assert.ok(stairRail.length > 0);
  assert.deepEqual(colorsOf(stairRail), [RAILS.White]);
});

test('perimeter segments report each edge finish', () => {
  const q = plain(core.sanitize({ ...base(), railOverrides: { 3: { railColor: 'White', railStyle: 'No rail product selected' } } }));
  const seg = Object.fromEntries(q.perimeter.segments.map(s => [s.edge, s]));
  assert.equal(seg[3].color, 'White');
  assert.equal(seg[3].product, 'No rail product selected');
  assert.equal(seg[3].custom, true);
  assert.equal(seg[1].color, q.railColor);
  assert.equal(seg[1].custom, false);
  assert.equal(seg[0].kind, 'house');
  assert.equal(seg[0].color, null);
});

test('removing a railing from an edge removes its custom finish', () => {
  const q = plain(core.sanitize({ ...base(), railOverrides: { 2: { railColor: 'Bronze' } } }));
  const after = plain(core.sanitize({ ...q, railEdges: [1, 3] }));
  assert.deepEqual(after.railOverrides, {});
});

test('a bump-out on another edge keeps the custom finish on the same physical edge', () => {
  const q = plain(core.sanitize({ ...base(), railOverrides: { 3: { railColor: 'Bronze' } } }));
  const oldPoly = plain(core.polygon(q));
  const oldEdge = plain(core.edges(oldPoly))[3];
  const res = win.AOSShape.addFeature(oldPoly, 2, 'bump', 4, 2, 0.5); // bump on the front edge
  assert.ok(res.points, res.error);
  const xs = res.points.map(p => p[0]), zs = res.points.map(p => p[1]);
  const W = Math.max(...xs) - Math.min(...xs), D = Math.max(...zs) - Math.min(...zs);
  const next = { ...q, shape: 'free', width: W, depth: D, points: res.points.map(([x, z]) => [(x - Math.min(...xs)) / W, (z - Math.min(...zs)) / D]) };
  win.AOSShape.remap(next, oldPoly, res.points);
  const after = plain(core.sanitize(next));
  const keys = Object.keys(after.railOverrides).map(Number);
  assert.equal(keys.length, 1, JSON.stringify(after.railOverrides));
  const newEdge = plain(core.edges(core.polygon(after)))[keys[0]];
  // Same direction and length as the original side edge.
  assert.ok(Math.abs(newEdge.len - oldEdge.len) < 0.01, `${newEdge.len} vs ${oldEdge.len}`);
  assert.ok(Math.abs(newEdge.t[0] * oldEdge.t[0] + newEdge.t[1] * oldEdge.t[1]) > 0.99);
  assert.equal(after.railOverrides[keys[0]].railColor, 'Bronze');
});

test('save -> open keeps per-edge finishes', () => {
  const q = plain(core.sanitize({ ...base(), railOverrides: { 1: { railColor: 'White' }, 3: { railStyle: 'No rail product selected' } } }));
  const loaded = core.migrate(JSON.parse(JSON.stringify({ application: 'AOS Deck Studio', design: q }))).intent;
  assert.deepEqual(plain(loaded), q);
});

// ---- Shared corner posts (V5.1 fix) ----
test('no two deck railing posts occupy the same spot, so the post count is physical', () => {
  for (const [name, raw] of Object.entries(FIX)) {
    const m = core.make(raw);
    const posts = m.parts.filter(p => p.kind === 'railing-post');
    for (let i = 0; i < posts.length; i++) for (let j = i + 1; j < posts.length; j++)
      assert.ok(Math.hypot(posts[i].x - posts[j].x, posts[i].z - posts[j].z) >= 0.3, `${name}: posts ${i} and ${j} overlap`);
    assert.equal(m.parts.filter(p => p.kind === 'post-cap').length, posts.length, `${name}: one cap per post`);
  }
});

test('posts per railed run: bays + 1, minus one per corner shared by two railed edges', () => {
  for (const name of ['small-rect-12x10', 'default-rect-16x12', 'freestanding', 'U-32x22', 'cut-corner', 'mixed-rail-edges']) {
    const q = plain(core.sanitize(FIX[name]));
    const es = plain(core.edges(core.polygon(q)));
    const railed = es.filter(e => q.railEdges.includes(e.i));
    // R1 rail inset: each run is the edge shortened (or, at an inside corner, lengthened) by RAIL_LINE·tan(turn/2)
    // at every end that meets another outside edge; ends at a house wall stay where they were.
    const turnTrim = (e, o) => { const cross = e.t[0] * o.t[1] - e.t[1] * o.t[0], dot = e.t[0] * o.t[0] + e.t[1] * o.t[1], phi = Math.atan2(cross, dot);
      if (q.houseEdges.includes(o.i) || Math.abs(Math.sin(phi)) < 0.2) return 0; return RAIL_LINE * Math.tan(Math.abs(phi) / 2) * Math.sign(phi * turnSign); };
    const area = es.reduce((s, e) => s + e.a[0] * e.b[1] - e.b[0] * e.a[1], 0), turnSign = Math.sign(area);
    const runLen = (e) => e.len - turnTrim(es[(e.i - 1 + es.length) % es.length], e) - turnTrim(e, es[(e.i + 1) % es.length]);
    const perEdge = railed.reduce((n, e) => n + Math.max(1, Math.ceil(runLen(e) / 5.5)) + 1, 0);
    const shared = railed.filter(e => q.railEdges.includes((e.i + 1) % es.length)).length;
    const posts = core.make(q).parts.filter(p => p.kind === 'railing-post').length;
    assert.equal(posts, perEdge - shared, name);
  }
});

test('mixed-color corner: the post belongs to one edge (no doubled post)', () => {
  const q = plain(core.sanitize({ ...base(), railOverrides: { 2: { railColor: 'Bronze' } } }));
  const posts = core.make(q).parts.filter(p => p.kind === 'railing-post');
  assert.equal(posts.length, 10);
});
