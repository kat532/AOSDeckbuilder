// V5.2 Group A — A3: full-width stairs and straight stairs with an adjustable landing.
// Geometry, isolation of landing supports from the main deck framing, guards, quantities and
// compatibility. Plain stairs are separately proven identical to V5.2 in v52-equivalence.test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./engine');

const win = loadEngine();
const core = win.DeckCore;
const plain = (v) => JSON.parse(JSON.stringify(v));
const E = 1e-9;
const deck = (over = {}) => ({ shape: 'rectangle', width: 20, depth: 14, height: 6, houseEdges: [0], ...over });
const stair = (over = {}) => ({ id: 's1', edge: 2, width: 4, offset: 0, rails: { left: true, right: true }, ...over });
const landing = (over = {}) => stair({ landing: { width: 6, depth: 4, elevation: 3, ...over } });
const kinds = (m, re) => m.parts.filter(p => re.test(p.kind));
const MAIN_FRAMING = /^(joist|rim-joist|ledger|dropped-beam|post-6x6|footing-concept|corner-trimmer|picture-support-joist|divider-support-joist|blocking|header)$/;

test('landing: equal risers, landing at a whole number of risers, at least two risers per flight', () => {
  for (const H of [3, 4.5, 6, 8, 10]) for (const want of [0.5, H / 3, H / 2, H - 0.5]) {
    const q = core.sanitize(deck({ height: H, staircases: [landing({ elevation: want })] }));
    const m = core.make(q), g = m.geometry.stairs[0], L = g.landing;
    assert.ok(L, `H=${H} landing kept`);
    const N = Math.max(2, Math.ceil(H / (7.75 / 12))), rise = H / N;
    assert.equal(g.risers, N); assert.ok(Math.abs(g.rise - rise) < E);
    assert.ok(rise <= 7.75 / 12 + E, 'riser at most 7¾ in.');
    assert.ok(L.upperRisers >= 2 && L.lowerRisers >= 2 && L.upperRisers + L.lowerRisers === N);
    assert.ok(Math.abs(L.elevation - (H - L.upperRisers * rise)) < E, 'landing top is a whole number of risers below the deck');
    assert.ok(Math.abs(q.staircases[0].landing.elevation - L.elevation) < 1e-4, 'the saved elevation is the built one');
    // Every riser face the same height, stepping from the deck down to grade.
    const ys = kinds(m, /^stair-riser$/).map(p => p.y).sort((a, b) => b - a);
    assert.equal(ys.length, N);
    for (let i = 0; i < N; i++) assert.ok(Math.abs(ys[i] - (H - (i + 0.5) * rise)) < 1e-9, `riser ${i}`);
    assert.equal(kinds(m, /^stair-tread$/).length, N - 2, 'one fewer tread per flight than risers');
  }
});

test('landing geometry: upper flight, landing, lower flight follow each other along the stair', () => {
  const m = core.make(core.sanitize(deck({ staircases: [landing({ width: 6, depth: 5 })] })));
  const g = m.geometry.stairs[0], L = g.landing, step = 11 / 12;
  assert.ok(Math.abs(L.v0 - (L.upperRisers - 1) * step) < E);
  assert.ok(Math.abs(L.v1 - (L.v0 + 5)) < E);
  assert.ok(Math.abs(g.run - (L.v1 + (L.lowerRisers - 1) * step)) < E);
  const along = (p) => (p.x - g.base[0]) * g.nn[0] + (p.z - g.base[1]) * g.nn[1], across = (p) => (p.x - g.base[0]) * g.tt[0] + (p.z - g.base[1]) * g.tt[1];
  // Checkpoint 3: the landing surface is now real boards (picture frame + field), not one plate.
  // Together they must cover exactly the landing rectangle, with their tops at the landing elevation.
  const surf = kinds(m, /^landing-(board|frame)$/);
  assert.ok(surf.length > 4);
  for (const p of surf) assert.ok(Math.abs(p.y + p.h / 2 - L.elevation) < 1e-9, 'landing surface top = landing elevation');
  const pts = surf.flatMap(p => p.footprint.map(([x, z]) => ({ x, z })));
  const us = pts.map(across), vs = pts.map(along);
  assert.ok(Math.abs(Math.min(...us) + 3) < 1e-6 && Math.abs(Math.max(...us) - 3) < 1e-6, 'landing 6 ft wide, centered');
  assert.ok(Math.abs(Math.min(...vs) - L.v0) < 1e-6 && Math.abs(Math.max(...vs) - L.v1) < 1e-6, 'landing 5 ft deep, between the flights');
  const risers = kinds(m, /^stair-riser$/).map(p => [along(p), p.y]);
  const upper = risers.filter(([v]) => v < L.v0 + 1e-6), lower = risers.filter(([v]) => v > L.v1 - 1e-6);
  assert.equal(upper.length, L.upperRisers); assert.equal(lower.length, L.lowerRisers);
  assert.ok(Math.abs(Math.min(...lower.map(r => r[0])) - L.v1) < 1e-9, 'lower flight starts at the landing edge');
  assert.ok(lower.every(([, y]) => y < L.elevation) && upper.every(([, y]) => y > L.elevation), 'flights on the right side of the landing');
});

test('landing supports are separate: the main deck framing is identical with or without a landing', () => {
  const without = core.make(core.sanitize(deck({ staircases: [stair()] })));
  const withL = core.make(core.sanitize(deck({ staircases: [landing()] })));
  assert.deepEqual(plain(kinds(withL, MAIN_FRAMING)), plain(kinds(without, MAIN_FRAMING)));
  for (const k of ['joists', 'beams', 'ledger', 'posts', 'footings', 'joistNominal']) assert.deepEqual(withL.counts[k], without.counts[k], k);
  const lp = kinds(withL, /^landing-post$/), lf = kinds(withL, /^landing-footing$/);
  assert.ok(lp.length >= 4); assert.equal(lf.length, lp.length);
  assert.equal(withL.counts.landingPosts, lp.length); assert.equal(withL.counts.landingFootings, lf.length);
  assert.equal(withL.counts.landingFraming, kinds(withL, /^landing-(beam|rim|joist)$/).length);
  assert.equal(without.counts.landingPosts, undefined, 'no landing keys on designs without a landing');
  // Landing posts stand inside the landing and below its frame.
  const g = withL.geometry.stairs[0], L = g.landing;
  for (const p of lp) {
    const v = (p.x - g.base[0]) * g.nn[0] + (p.z - g.base[1]) * g.nn[1], u = (p.x - g.base[0]) * g.tt[0] + (p.z - g.base[1]) * g.tt[1];
    assert.ok(v > L.v0 && v < L.v1 && Math.abs(u) < L.width / 2, 'post under the landing');
    assert.ok(p.y + p.h / 2 <= L.elevation - 1 / 12 - 7.25 / 12 + 1e-9, 'post top at the underside of the landing frame');
  }
  assert.ok(kinds(withL, /^landing-(beam|rim|joist|post)$/).every(p => p.group === 'stair-framing'), 'shown in framing-only view');
});

test('landing is never presented as structurally approved', () => {
  const m = core.make(core.sanitize(deck({ staircases: [landing()] })));
  assert.ok(m.alerts.some(a => a.level === 'review' && /landing.*CONCEPT.*NOT structurally approved/.test(a.message)));
  assert.equal(m.stats.landings[0].structuralApproval, false);
  assert.ok(kinds(m, /^landing-(post|footing|beam|joist)$/).every(p => /concept/.test(p.label)));
});

test('landing guards: required above 30 in.; otherwise only where the side railing is on', () => {
  const guards = (m) => m.parts.filter(p => p.connect === 'landing-guard');
  const high = core.make(core.sanitize(deck({ staircases: [landing({ elevation: 3 })].map(s => ({ ...s, rails: { left: false, right: false } })) })));
  assert.ok(high.geometry.stairs[0].landing.elevation > 2.5);
  assert.ok(guards(high).length > 0, 'guards drawn even with stair railings off');
  assert.ok(high.alerts.some(a => /over 30 in\.\): guards are drawn/.test(a.message)));
  const lowOff = core.make(core.sanitize(deck({ staircases: [landing({ elevation: 1.5 })].map(s => ({ ...s, rails: { left: false, right: false } })) })));
  assert.ok(lowOff.geometry.stairs[0].landing.elevation <= 2.5);
  assert.equal(guards(lowOff).length, 0);
  const lowLeft = core.make(core.sanitize(deck({ staircases: [landing({ elevation: 1.5 })].map(s => ({ ...s, rails: { left: true, right: false } })) })));
  assert.ok(guards(lowLeft).length > 0);
});

test('landing quantities: treads, risers, stringers, area and railing length', () => {
  const m = core.make(core.sanitize(deck({ staircases: [landing({ width: 6, depth: 4 })] })));
  const g = m.geometry.stairs[0], L = g.landing;
  assert.equal(m.counts.treads, g.risers - 2);
  assert.equal(m.counts.risers, g.risers);
  assert.ok(m.counts.stringers >= 4, 'stringers for both flights');
  assert.ok(Math.abs(m.stats.stairArea - (4 * ((L.upperRisers - 1) + (L.lowerRisers - 1)) * 11 / 12 + 6 * 4)) < 1e-9);
  const flights = 2 * Math.hypot((L.upperRisers - 1) * 11 / 12, L.upperRisers * g.rise) + 2 * Math.hypot((L.lowerRisers - 1) * 11 / 12, L.lowerRisers * g.rise);
  assert.ok(Math.abs(m.stats.stairRailLF - (flights + L.guardLF)) < 1e-9);
  assert.equal(m.counts.landings, 1);
});

test('landing needs at least four risers; too-low decks keep a single flight', () => {
  assert.ok(Math.abs(core.LANDING_MIN_HEIGHT - 4 * 7.75 / 12) < E);
  const q = core.sanitize(deck({ height: 2, staircases: [landing()] }));
  assert.equal(q.staircases.length, 1);
  assert.equal(q.staircases[0].landing, undefined);
});

test('landing sizes are clamped: width from the stair width to +8 ft, depth 3–12 ft', () => {
  const a = core.sanitize(deck({ staircases: [landing({ width: 2, depth: 1 })] })).staircases[0].landing;
  assert.deepEqual([a.width, a.depth], [4, 3]);
  const b = core.sanitize(deck({ staircases: [landing({ width: 30, depth: 30 })] })).staircases[0].landing;
  assert.deepEqual([b.width, b.depth], [12, 12]);
});

test('full-width stair spans its whole edge, follows edge length and replaces that edge railing', () => {
  const q = core.sanitize(deck({ staircases: [stair({ fullWidth: true, width: 4, offset: 3 })] }));
  assert.deepEqual([q.staircases[0].width, q.staircases[0].offset, q.staircases[0].fullWidth], [20, 0, true]);
  const wider = core.sanitize({ ...q, width: 24 });
  assert.equal(wider.staircases[0].width, 24, 'follows the edge when the deck gets wider');
  const m = core.make(q), base = core.make(core.sanitize(deck()));
  assert.ok(Math.abs(base.stats.deckRailLF - m.stats.deckRailLF - 20) < 1e-9, 'the whole 20 ft edge railing becomes the stair opening');
  const e = core.edges(core.polygon(q))[2];
  const onEdge = m.parts.filter(p => p.kind === 'top-rail' && Math.abs((p.x - e.a[0]) * e.n[0] + (p.z - e.a[1]) * e.n[1]) < 0.3);
  assert.equal(onEdge.length, 0, 'no deck railing left on the stair edge');
  assert.equal(m.geometry.stairs[0].width, 20);
  assert.ok(kinds(m, /^stair-tread$/).every(t => Math.abs(t.w - 20) < E));
});

test('full-width stair takes the edge: a second stair on the same edge is not kept', () => {
  const q = core.sanitize(deck({ staircases: [stair({ id: 'a', fullWidth: true }), stair({ id: 'b', offset: 5 })] }));
  assert.deepEqual(plain(q.staircases.map(s => s.id)), ['a']);
});

test('stairs whose landings would overlap are not both kept', () => {
  // Two stairs 6 ft apart on the same edge; their 8 ft wide landings would collide.
  const q = core.sanitize(deck({ staircases: [stair({ id: 'a', offset: -3, landing: { width: 8, depth: 4, elevation: 3 } }), stair({ id: 'b', offset: 3, landing: { width: 8, depth: 4, elevation: 3 } })] }));
  assert.equal(q.staircases.length, 1);
  const ok = core.sanitize(deck({ staircases: [stair({ id: 'a', offset: -5 }), stair({ id: 'b', offset: 5, landing: { width: 5, depth: 4, elevation: 3 } })] }));
  assert.equal(ok.staircases.length, 2, 'a landing stair and a plain stair with room between them are both kept');
});

test('a landing that runs back under the deck is reported', () => {
  // U-shape: a stair on the inside of the left arm points across the notch at the right arm.
  const q = core.sanitize({ shape: 'U', width: 24, depth: 20, height: 6, houseEdges: [0], staircases: [stair({ edge: 3, width: 3, offset: 0, landing: { width: 4, depth: 6, elevation: 3 } })] });
  const m = core.make(q);
  assert.equal(q.staircases.length, 1, 'the stair is kept so the problem is visible');
  assert.ok(m.alerts.some(a => a.level === 'warning' && /runs back under the deck outline/.test(a.message)));
});

test('saved landing and full-width stairs round-trip unchanged; older files load as before', () => {
  const q = core.sanitize(deck({ staircases: [landing({ width: 6.5, depth: 4.25, elevation: 3.1 }), stair({ id: 'f', edge: 1, fullWidth: true })] }));
  const again = core.sanitize(JSON.parse(JSON.stringify(q)));
  assert.deepEqual(plain(again.staircases), plain(q.staircases));
  assert.equal(q.staircases.length, 2);
  // A V4 single-stair file and a V5 multi-stair file have no landing or fullWidth keys.
  const v4 = core.sanitize(deck({ stairs: { enabled: true, edge: 2, width: 4, offset: 0 } }));
  assert.ok(v4.staircases.every(s => !('landing' in s) && !('fullWidth' in s)));
});
