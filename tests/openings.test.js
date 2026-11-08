// V5.2 Group B — B1: house doors and windows. Engine tests.
// Decks without openings are separately proven identical to V5.2 in v52-equivalence.test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./engine');

const win = loadEngine();
const core = win.DeckCore, shape = win.AOSShape;
const plain = (v) => JSON.parse(JSON.stringify(v));
const deck = (over = {}) => ({ shape: 'rectangle', width: 20, depth: 14, height: 4, houseEdges: [0], ...over });
const door = (over = {}) => ({ id: 'd1', type: 'door', edge: 0, offset: -6, width: 3, height: 80 / 12, ...over });
const patio = (over = {}) => ({ id: 'p1', type: 'patio', edge: 0, offset: 1.5, width: 6, height: 80 / 12, ...over });
const win1 = (over = {}) => ({ id: 'w1', type: 'window', edge: 0, offset: 7, width: 3, height: 4, sill: 3, ...over });
const build = (q) => core.make(core.sanitize(q));
const kinds = (m, re) => m.parts.filter(p => re.test(p.kind));
const OPENING_PART = /^(opening-|door-)/;
const local = (e) => (p) => { const dx = p.x - e.mid[0], dz = p.z - e.mid[1]; return { s: dx * e.t[0] + dz * e.t[1], d: dx * e.n[0] + dz * e.n[1] }; };

test('B1 records: sizes are kept within range, a window top stays at most 8 ft above the deck, ids are unique', () => {
  const q = core.sanitize(deck({ openings: [door({ width: 9, height: 1 }), patio({ id: 'd1', width: 1 }), win1({ sill: 5, height: 6 }), { type: 'garage', edge: 0 }, { type: 'window', edge: 'x' }] }));
  assert.equal(q.openings.length, 3, 'unknown types and bad walls are dropped');
  const [d, p, w] = q.openings;
  assert.deepEqual([d.width, d.height], [4, 6], 'door clamped to 2–4 ft wide, 6–8 ft tall');
  assert.equal(p.width, 4, 'patio door at least 4 ft wide');
  assert.notEqual(p.id, d.id, 'duplicate ids made unique');
  assert.ok(w.sill + w.height <= core.OPENING_MAX_TOP + 1e-9);
  assert.equal(d.sill, undefined, 'only windows carry a sill');
  // Older projects without openings are written back without the key.
  assert.equal('openings' in core.sanitize(deck()), false);
  assert.deepEqual(plain(core.sanitize(JSON.parse(JSON.stringify(q))).openings), plain(q.openings), 'save/reopen round trip');
});

test('B1 an empty list changes nothing; walls without openings are built exactly as before', () => {
  const a = build(deck()), b = build(deck({ openings: [] }));
  const noId = (ps) => plain(ps).map(({ id, ...p }) => p); // part ids are a running number
  assert.deepEqual(plain(b.parts), plain(a.parts));
  assert.deepEqual(plain(b.counts), plain(a.counts));
  // A deck with openings only on wall 0 builds its other house wall as before, except that (V5.2 B3
  // corrections, owner request 8 Nov 2026) every house wall now shares one height: the tallest
  // door/window + 1 ft, at least 7 ft above the deck, so connected walls never step down at a corner.
  const two = build(deck({ houseEdges: [0, 1] })), withOne = build(deck({ houseEdges: [0, 1], openings: [door()] }));
  const onWall1 = (m) => m.parts.filter(p => p.connect === 'house-edge-1' || (p.kind === 'siding-course' && Math.abs(p.x - 10.475) < 0.2));
  const plan = (ps) => noId(ps).map(({ y, h, ...p }) => p), tops = (m, i) => m.parts.filter(p => p.kind === 'house-wall' && p.connect === `house-edge-${i}`).map(p => p.y + p.h / 2);
  assert.deepEqual(plan(onWall1(withOne).filter(p => p.kind === 'house-wall')), plan(onWall1(two).filter(p => p.kind === 'house-wall')), 'same footprint as before');
  const H = withOne.intent.height, houseTop = H + Math.max(7, 80 / 12 + 1);
  for (const t of [...tops(withOne, 0), ...tops(withOne, 1)].filter(t => t > H + 6.9)) assert.ok(Math.abs(t - houseTop) < 1e-3, 'one house height (door height is saved to 1/10000 ft)');
  assert.ok(tops(two, 1).every(t => Math.abs(t - (H + 7)) < 1e-9), 'no openings anywhere: 7 ft above the deck, as before');
});

test('B1 the wall is built around each opening: no wall in the opening, wall everywhere else', () => {
  for (const H of [1.5, 4, 9]) {
    const q = deck({ height: H, openings: [door(), patio(), win1()] });
    const m = build(q), e = m.geometry.edges[0], L = local(e), len = e.len - 0.07;
    const walls = kinds(m, /^house-wall$/).filter(p => p.connect === 'house-edge-0');
    const top = H + Math.max(7, 80 / 12 + 1, 3 + 4 + 1);
    const area = walls.reduce((a, p) => a + p.w * p.h, 0);
    const holes = m.intent.openings.reduce((a, o) => a + o.width * o.height, 0); // as saved (to 1/10000 ft)
    assert.ok(Math.abs(area - (len * top - holes)) < 1e-6, `H=${H}: wall area = wall minus the three openings`);
    for (const o of m.geometry.openings) {
      // No wall piece covers the middle of an opening.
      const mid = { s: o.offset, y: H + (o.bottom + o.top) / 2 };
      assert.ok(!walls.some(p => { const c = L(p); return Math.abs(c.s - mid.s) < p.w / 2 - 1e-9 && Math.abs(p.y - mid.y) < p.h / 2 - 1e-9; }), `${o.type}: hole is open`);
      // Its parts sit within its span (plus trim) and against the deck-facing side of the wall.
      const parts = m.parts.filter(p => p.opening === o.id);
      assert.ok(parts.length >= 6);
      for (const p of parts) { const c = L(p);
        assert.ok(Math.abs(c.s - o.offset) <= o.width / 2 + 0.6, 'within its span');
        assert.ok(c.d > -0.05 && c.d < 0.47, 'in the wall plane'); }
      const bottom = Math.min(...parts.filter(p => p.kind !== 'opening-trim' || o.type !== 'window').map(p => p.y - p.h / 2));
      if (o.type !== 'window') assert.ok(Math.abs(bottom - H) < 1e-9, `${o.type}: sits on the deck surface`);
      else assert.ok(Math.abs(Math.min(...parts.filter(p => p.kind === 'opening-glass').map(p => p.y - p.h / 2)) - (H + o.sill + 0.12)) < 1e-9, 'window glass starts above the sill');
      const glass = parts.filter(p => p.kind === 'opening-glass');
      assert.ok(glass.length >= 1, `${o.type}: has glass`);
    }
    assert.equal(kinds(m, /^door-slab$/).length, 1);
    assert.deepEqual([m.counts.doors, m.counts.patioDoors, m.counts.windows], [1, 1, 1]);
    assert.ok(m.parts.filter(p => OPENING_PART.test(p.kind)).every(p => p.group === 'context' && /visual only/.test(p.label)));
  }
});

test('B1 openings that do not fit are kept but hidden, with a warning (overlap, off the wall, not a house wall, wall gone)', () => {
  const cases = [
    [deck({ openings: [patio(), win1({ offset: 4 })] }), 'overlap'],
    [deck({ openings: [win1({ offset: 9.6 })] }), 'off-wall'],
    [deck({ openings: [win1({ edge: 2 })] }), 'not-house-wall'],
    [deck({ openings: [win1({ edge: 9 })] }), 'no-wall'],
  ];
  for (const [q, status] of cases) {
    const s = core.sanitize(q), m = core.make(s), g = m.geometry.openings.find(o => o.id === 'w1');
    assert.equal(g.status, status);
    assert.equal(s.openings.length, q.openings.length, 'nothing deleted');
    assert.equal(m.parts.filter(p => p.opening === 'w1').length, 0, 'not drawn');
    assert.ok(m.alerts.some(a => a.level === 'warning' && /Window \d \(3′ 0″ wide, edge \d+\) is hidden because/.test(a.message)), status);
  }
  // The 4 in. gap and 3 in. end clearance are the limits.
  const gapOK = build(deck({ openings: [door({ offset: 0 }), door({ id: 'd2', offset: 3.34 })] }));
  assert.ok(gapOK.geometry.openings.every(o => o.status === 'ok'), '4 in. apart is allowed');
  const gapBad = build(deck({ openings: [door({ offset: 0 }), door({ id: 'd2', offset: 3.3 })] }));
  assert.equal(gapBad.geometry.openings[1].status, 'overlap', 'closer than 4 in. is not');
  const end = build(deck({ openings: [door({ offset: 10 - 0.25 - 1.5 })] }));
  assert.equal(end.geometry.openings[0].status, 'ok');
});

test('B1 several openings on several walls of rectangle, L, U, T and free-drawn decks', () => {
  const fr = (pts) => { const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]); const W = Math.max(...xs) - Math.min(...xs), D = Math.max(...zs) - Math.min(...zs); return { shape: 'free', width: W, depth: D, points: pts.map(([x, z]) => [(x - Math.min(...xs)) / W, (z - Math.min(...zs)) / D]) }; };
  const designs = {
    rectangle: deck({ houseEdges: [0, 1, 3], width: 24, depth: 16 }),
    L: { shape: 'L', width: 24, depth: 18, height: 5, houseEdges: [0, 3] },
    U: { shape: 'U', width: 24, depth: 18, height: 6, houseEdges: [0, 3, 5] },
    T: { shape: 'T', width: 24, depth: 18, height: 6, houseEdges: [0, 1, 7] },
    free: { ...fr([[0, 0], [20, 0], [26, 6], [26, 16], [0, 16]]), height: 4, houseEdges: [0, 1] },
  };
  for (const [name, d] of Object.entries(designs)) {
    const q = core.sanitize(d), es = core.edges(core.polygon(q));
    const openings = [];
    for (const i of q.houseEdges) { const e = es[i];
      openings.push({ id: `w${i}`, type: 'window', edge: i, offset: -e.len / 4, width: Math.min(2, e.len / 4), height: 3, sill: 3 });
      if (e.len > 7) openings.push({ id: `d${i}`, type: 'door', edge: i, offset: e.len / 4, width: Math.min(3, e.len / 4), height: 80 / 12 }); }
    const m = core.make(core.sanitize({ ...q, openings }));
    assert.ok(m.geometry.openings.length >= q.houseEdges.length);
    assert.ok(m.geometry.openings.every(o => o.status === 'ok'), `${name}: ${JSON.stringify(m.geometry.openings.filter(o => o.status !== 'ok'))}`);
    for (const o of m.geometry.openings) {
      const e = m.geometry.edges[o.edge], parts = m.parts.filter(p => p.opening === o.id);
      assert.ok(parts.length > 0, `${name}: ${o.id} drawn`);
      // Every part lies on its own wall line (house side of that edge).
      for (const p of parts) { const c = local(e)(p); assert.ok(c.d > -0.05 && c.d < 0.47 && Math.abs(c.s - o.offset) <= o.width / 2 + 0.6, `${name}: ${o.id} part on its wall`); }
    }
    // Framing is untouched by doors and windows.
    const F = /^(joist|rim-joist|ledger|dropped-beam|post-6x6|footing-concept|corner-trimmer|picture-support-joist|divider-support-joist)$/;
    const noId = (ps) => plain(ps).map(({ id, ...p }) => p); // part ids are a running number
    assert.deepEqual(noId(kinds(m, F)), noId(kinds(core.make(q), F)), `${name}: framing unchanged`);
  }
});

test('B1 openings stay on their wall when the deck size changes; one that no longer fits is flagged, not deleted', () => {
  const q = core.sanitize(deck({ openings: [door({ offset: -6 }), win1({ offset: 6 })] }));
  const wider = core.make(core.sanitize({ ...q, width: 28, depth: 18 }));
  assert.ok(wider.geometry.openings.every(o => o.status === 'ok' && o.edge === 0));
  assert.deepEqual(plain(wider.geometry.openings.map(o => o.offset)), [-6, 6], 'same place measured from the wall centre');
  const narrow = core.make(core.sanitize({ ...q, width: 12 }));
  assert.deepEqual(plain(narrow.geometry.openings.map(o => o.status)), ['off-wall', 'off-wall']);
  assert.equal(narrow.intent.openings.length, 2);
  // Back to the original size: they reappear.
  assert.ok(core.make(core.sanitize({ ...q, width: 20 })).geometry.openings.every(o => o.status === 'ok'));
});

test('B1 an outline edit that renumbers edges keeps each opening at the same spot on its wall', () => {
  const q = core.sanitize(deck({ houseEdges: [0, 1], openings: [door({ edge: 1, offset: 2 }), win1({ edge: 0, offset: -4 })] }));
  const old = core.polygon(q);
  // A bump-out added on the left edge (3) and one on the top edge before the window: edge numbers shift.
  const step1 = shape.addFeature(old, 0, 'box', 4, 3, 0.75);
  assert.ok(!step1.error, step1.error);
  const p = step1.points || step1.poly || step1;
  const q2 = JSON.parse(JSON.stringify(q)); q2.shape = 'free';
  const xs = p.map(v => v[0]), zs = p.map(v => v[1]), x0 = Math.min(...xs), z0 = Math.min(...zs), W = Math.max(...xs) - x0, D = Math.max(...zs) - z0;
  Object.assign(q2, { width: W, depth: D, originX: (x0 + Math.max(...xs)) / 2, originZ: z0, points: p.map(v => [(v[0] - x0) / W, (v[1] - z0) / D]) });
  const res = shape.remap(q2, old, p);
  assert.equal(res.lostOpenings, 0);
  const before = core.make(q), after = core.make(core.sanitize(q2));
  const where = (m, id) => { const o = m.geometry.openings.find(x => x.id === id), e = m.geometry.edges[o.edge]; return [e.mid[0] + e.t[0] * o.offset, e.mid[1] + e.t[1] * o.offset, o.status]; };
  for (const id of ['d1', 'w1']) {
    const a = where(before, id), b = where(after, id);
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6, `${id} stays at the same point on the wall line`);
  }
});

test('B1 counts and stats list openings only when the project has them', () => {
  const m = build(deck({ openings: [door(), win1(), win1({ id: 'w2', offset: 3 })] }));
  assert.deepEqual([m.counts.doors, m.counts.patioDoors, m.counts.windows], [1, 0, 2]);
  assert.equal(m.stats.openings.length, 3);
  const none = build(deck());
  assert.equal(none.counts.doors, undefined); assert.equal(none.stats.openings, undefined);
});
