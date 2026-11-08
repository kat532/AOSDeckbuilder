// V5.2 Group B — B3: property & 3D presentation (owner request, 8 Nov 2026).
// House siding/color, lawn at grade, concrete patio/walkway slabs, and the 3D camera.
// All of it is presentation only: nothing structural may change because of it.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./engine');
const { fixtures } = require('./fixtures');

const win = loadEngine();
const core = win.DeckCore;
const plain = (v) => JSON.parse(JSON.stringify(v));
const build = (q) => core.make(core.sanitize(q));
const kinds = (m, re) => m.parts.filter(p => re.test(p.kind));
const noId = (ps) => plain(ps).map(({ id, ...p }) => p);
const deck = (over = {}) => ({ shape: 'rectangle', width: 20, depth: 14, height: 6, houseEdges: [0], ...over });
const OPENINGS = [{ id: 'd', type: 'door', edge: 0, offset: -6.5 }, { id: 'p', type: 'patio', edge: 0, offset: 1, width: 6 }, { id: 'w', type: 'window', edge: 0, offset: 7, width: 3, height: 4, sill: 3 }];
const STAIR = { id: 's', edge: 2, width: 4, offset: 3, rails: { left: true, right: true } };
const LANDING = { ...STAIR, landing: { width: 6, depth: 5, elevation: 3, turn: 'left' } };
// Everything the B3 look/slabs must never change: every part that is not house context or site.
const STRUCTURAL = (m) => noId(m.parts.filter(p => !['context', 'site'].includes(p.group)));
const SHAPES = { rect: {}, L: { shape: 'L', width: 24, depth: 18 }, U: { shape: 'U', width: 32, depth: 22 } };
const local = (e) => (p) => ({ s: (p.x - e.mid[0]) * e.t[0] + (p.z - e.mid[1]) * e.t[1], d: (p.x - e.mid[0]) * e.n[0] + (p.z - e.mid[1]) * e.n[1] });

test('B3-1 siding styles and exterior colors: applied to every house-wall piece; defaults are the pre-B3 look and are not saved', () => {
  const def = build(deck({ openings: OPENINGS }));
  for (const p of kinds(def, /^house-wall$/)) { assert.equal(p.color, '#d9dbd7'); assert.equal(p.siding, 'lap'); assert.equal(p.mat, 'siding'); }
  assert.deepEqual(plain(def.geometry.house), { siding: 'lap', color: '#d9dbd7', colorName: 'Light Gray' });
  for (const k of ['siding', 'houseColor']) assert.equal(k in core.sanitize(deck({ siding: 'lap', houseColor: 'Light Gray' })), false, `${k}: default not written`);
  assert.equal(Object.keys(core.SIDING_STYLES).length, 4);
  assert.ok(Object.keys(core.HOUSE_COLORS).length >= 5 && Object.keys(core.HOUSE_COLORS).length <= 8, 'a small set of colors');
  for (const siding of Object.keys(core.SIDING_STYLES)) for (const [name, hex] of Object.entries(core.HOUSE_COLORS)) {
    const m = build(deck({ openings: OPENINGS, siding, houseColor: name, houseEdges: [0, 1] }));
    const walls = kinds(m, /^house-wall$/);
    assert.ok(walls.length > 2);
    for (const p of walls) { assert.equal(p.color, hex, `${siding}/${name}`); assert.equal(p.siding, siding); assert.equal(p.group, 'context'); assert.match(p.label, /visual only/); }
    assert.deepEqual(STRUCTURAL(m), STRUCTURAL(build(deck({ openings: OPENINGS, houseEdges: [0, 1] }))), `${siding}/${name}: nothing structural changes`);
    const q = core.sanitize(deck({ siding, houseColor: name }));
    assert.equal(q.siding, siding === 'lap' ? undefined : siding); assert.equal(q.houseColor, name === 'Light Gray' ? undefined : name);
  }
  const bad = core.sanitize(deck({ siding: 'stucco', houseColor: 'Purple' }));
  assert.equal('siding' in bad, false); assert.equal('houseColor' in bad, false);
  assert.equal(build(deck({ siding: 'stucco' })).geometry.house.siding, 'lap', 'unknown style falls back');
});

test('B3-2 doors and windows: identical openings, trim and wall cut-outs in every siding style and color', () => {
  for (const H of [1.5, 6, 12]) {
    const base = build(deck({ height: H, openings: OPENINGS }));
    const O = (m) => noId(m.parts.filter(p => p.opening)), W = (m) => noId(kinds(m, /^house-wall$/)).map(({ color, siding, label, ...p }) => p);
    for (const siding of Object.keys(core.SIDING_STYLES)) for (const houseColor of ['Charcoal', 'Brick Red']) {
      const m = build(deck({ height: H, openings: OPENINGS, siding, houseColor }));
      assert.deepEqual(O(m), O(base), `H=${H} ${siding}: door/window parts`);
      assert.deepEqual(W(m), W(base), `H=${H} ${siding}: wall pieces around the openings`);
      assert.deepEqual(plain(m.geometry.openings), plain(base.geometry.openings));
      assert.deepEqual([m.counts.doors, m.counts.patioDoors, m.counts.windows], [1, 1, 1]);
    }
    // The visual house dress never covers an opening.
    const e = base.geometry.edges[0], L = local(e);
    for (const o of base.geometry.openings) for (const p of kinds(base, /^house-(trim|foundation|eave|roof)$/)) {
      const c = L(p), ov = Math.min(c.s + p.w / 2, o.offset + o.width / 2) - Math.max(c.s - p.w / 2, o.offset - o.width / 2), oy = Math.min(p.y + p.h / 2, H + o.top) - Math.max(p.y - p.h / 2, H + o.bottom);
      assert.ok(!(ov > 1e-6 && oy > 1e-6), `H=${H}: ${p.kind} covers ${o.type}`);
    }
  }
  // An opening right at the wall end: the corner board steps aside (or is left off) instead of covering it.
  const tight = build(deck({ openings: [{ id: 'e', type: 'door', edge: 0, offset: -(20 / 2 - 0.25 - 1.5) }] })), e = tight.geometry.edges[0], L = local(e);
  const o = tight.geometry.openings[0]; assert.equal(o.status, 'ok');
  for (const p of kinds(tight, /^house-trim$/)) { const c = L(p); assert.ok(c.s - p.w / 2 >= o.offset + o.width / 2 + 3.5 / 12 - 1e-6 || c.s + p.w / 2 <= o.offset - o.width / 2 - 3.5 / 12 + 1e-6, 'corner board clear of the door trim'); }
});

test('B3-3 house dress sits on the wall: foundation at grade, corner boards and foundation on the deck-facing face, eave on the wall top', () => {
  for (const [name, s] of Object.entries(SHAPES)) for (const H of [0.5, 4, 16]) {
    const m = build(deck({ ...s, height: H, houseEdges: name === 'rect' ? [0, 1] : [0] }));
    for (const i of m.intent.houseEdges) {
      const e = m.geometry.edges[i], mine = m.parts.filter(p => p.connect === `house-edge-${i}`), L = local(e), len = Math.max(.3, e.len - .07);
      const walls = mine.filter(p => p.kind === 'house-wall'), top = Math.max(...walls.map(p => p.y + p.h / 2));
      const f = mine.filter(p => p.kind === 'house-foundation'); assert.equal(f.length, 1);
      assert.ok(Math.abs(f[0].y - f[0].h / 2) < 1e-9, 'foundation band starts at grade'); assert.ok(f[0].y + f[0].h / 2 < H, 'and stays below the deck');
      assert.equal(mine.filter(p => p.kind === 'house-trim').length, 2);
      for (const p of mine.filter(p => /^house-(trim|foundation)$/.test(p.kind))) { const c = L(p);
        assert.ok(Math.abs(c.s) + p.w / 2 <= len / 2 + 1e-6, `${name} H=${H}: ${p.kind} within the wall`);
        assert.ok(c.d - p.d / 2 < .115 && c.d + p.d / 2 >= .115 - 1e-6, `${name}: ${p.kind} against the siding face`); }
      const eave = mine.find(p => p.kind === 'house-eave'), roof = mine.find(p => p.kind === 'house-roof');
      assert.ok(Math.abs(eave.y - eave.h / 2 - top) < 1e-9, 'eave on the wall top');
      assert.ok(Math.abs(roof.y - roof.h / 2 - (eave.y + eave.h / 2)) < 1e-9, 'roof edge on the eave');
      for (const p of mine.filter(p => /^house-/.test(p.kind) && p.kind !== 'house-wall')) { assert.equal(p.group, 'context'); assert.match(p.label, /visual only/); }
    }
    assert.equal(m.parts.filter(p => p.kind === 'siding-course').length, 0, 'old metal course strips are gone');
  }
});

test('B3-4 lawn at grade: top at y = 0; stairs, landings, posts and footings meet it (nothing floats)', () => {
  for (const H of [0.5, 2, 6, 12]) for (const st of [STAIR, LANDING]) {
    if (st.landing && H < 6) continue;
    const m = build(deck({ height: H, staircases: [st] })), earth = kinds(m, /^earth$/);
    assert.equal(earth.length, 1); assert.ok(Math.abs(earth[0].y + earth[0].h / 2) < 1e-12, 'lawn top at grade');
    assert.ok(earth[0].w >= 200 && earth[0].d >= 200, 'lawn edge out of normal view');
    // Bottom of every stair flight within 3/4 in. of the lawn, never below it.
    const low = (re) => Math.min(...kinds(m, re).map(p => p.profile2d ? Math.min(...p.profile2d.map(v => v[1])) : p.y - p.h / 2));
    for (const re of [/^stair-stringer$/, /^stair-riser$/]) { const y = low(re); assert.ok(y >= -1e-9 && y <= .0625, `H=${H} ${re}: bottom at ${y}`); }
    for (const p of kinds(m, /^(footing-concept|landing-footing)$/)) assert.ok(p.y - p.h / 2 < 0 && p.y + p.h / 2 > 0, 'footings straddle grade');
    for (const p of kinds(m, /^(post-6x6|landing-post)$/)) assert.ok(p.y - p.h / 2 > 0 && p.y - p.h / 2 < .2, 'posts stand on their footings above grade');
  }
});

test('B3-5 concrete patio/walkway: sanitized, placed at grade, saved and reopened, removed; never structural', () => {
  const S = [{ id: 'a', type: 'patio', x: -3, z: 21, width: 14, length: 10 }, { id: 'b', type: 'walkway', x: 9, z: 30, width: 4, length: 12, angle: 195 }, { type: 'pool', x: 0, z: 0 }];
  const q = core.sanitize(deck({ staircases: [STAIR], surfaces: S }));
  assert.equal(q.surfaces.length, 2, 'unknown types dropped');
  assert.deepEqual(plain(q.surfaces[1]), { id: 'b', type: 'walkway', x: 9, z: 30, width: 4, length: 12, angle: 15 });
  assert.deepEqual(plain(core.sanitize(JSON.parse(JSON.stringify(q))).surfaces), plain(q.surfaces), 'save/reopen round trip');
  const clamp = core.sanitize(deck({ surfaces: [{ type: 'patio', width: 99, length: 1, x: 999, z: -999 }, { type: 'walkway', width: 1, length: 99 }] })).surfaces;
  assert.deepEqual(clamp.map(s => [s.width, s.length, s.x, s.z]), [[40, 4, 120, -120], [2, 60, 0, 0]]);
  assert.equal(new Set(core.sanitize(deck({ surfaces: [{ id: 'x', type: 'patio' }, { id: 'x', type: 'patio' }] })).surfaces.map(s => s.id)).size, 2, 'ids kept unique');
  assert.equal(core.sanitize(deck({ surfaces: Array.from({ length: 20 }, () => ({ type: 'patio' })) })).surfaces.length, core.MAX_SURFACES);
  assert.equal('surfaces' in core.sanitize(deck()), false, 'older projects: no key added');

  const m = core.make(q), slabs = kinds(m, /^concrete-surface$/);
  assert.equal(slabs.length, 2);
  for (const p of slabs) {
    const sf = q.surfaces.find(s => s.id === p.surface);
    assert.equal(p.group, 'site'); assert.equal(p.mat, 'concrete'); assert.match(p.label, /visual only; not a footing, pad or support/);
    assert.ok(Math.abs(p.y + p.h / 2 - core.SURFACE_TOP) < .01, 'top just above the lawn'); assert.ok(p.y - p.h / 2 < 0, 'set into the ground');
    assert.ok(Math.abs(p.w - sf.width) < 1e-9 && Math.abs(p.d - sf.length) < 1e-9 && Math.abs(p.x - sf.x) < 1e-9 && Math.abs(p.z - sf.z) < 1e-9);
    assert.ok(Math.abs(p.yaw + sf.angle * Math.PI / 180) < 1e-9);
  }
  assert.ok(slabs[0].y + slabs[0].h / 2 !== slabs[1].y + slabs[1].h / 2, 'overlapping slabs never share a top (no flicker)');
  // A slab under the stairs/footings changes nothing structural, no count, no material and no alert.
  const without = build(deck({ staircases: [STAIR] }));
  assert.deepEqual(STRUCTURAL(m), STRUCTURAL(without));
  assert.deepEqual(plain(m.counts), plain(without.counts)); assert.deepEqual(plain(m.materials), plain(without.materials)); assert.deepEqual(plain(m.alerts), plain(without.alerts));
  // Removing them restores the plain model.
  assert.deepEqual(noId(core.make(core.sanitize({ ...q, surfaces: [] })).parts), noId(without.parts));
  assert.deepEqual(plain(m.geometry.surfaces.map(s => s.status)), ['ok', 'ok']);
  assert.deepEqual(plain(m.geometry.surfaces[0].corners), plain(core.surfaceCorners(q.surfaces[0])));
});

test('B3-6 a slab that runs into the house is kept but hidden, with a warning; moving it out shows it again', () => {
  const into = { id: 'h', type: 'patio', x: 0, z: -3, width: 10, length: 10 };
  const m = build(deck({ surfaces: [into] }));
  assert.equal(m.geometry.surfaces[0].status, 'in-house'); assert.equal(kinds(m, /^concrete-surface$/).length, 0);
  assert.ok(m.alerts.some(a => a.level === 'warning' && /Patio 1 .* hidden because it runs into the house.*House & Height/.test(a.message)));
  assert.equal(m.intent.surfaces.length, 1, 'kept in the project');
  // Touching the house siding face is fine; beyond the wall ends is not "in the house".
  assert.equal(core.surfaceProblem(m.intent, m.geometry.edges, { ...into, z: 5 - .115 }), null, 'edge exactly on the siding face');
  assert.equal(core.surfaceProblem(m.intent, m.geometry.edges, { ...into, x: 16, z: -6 }), null, 'beside the house, past the wall end');
  assert.equal(core.surfaceProblem(m.intent, m.geometry.edges, { ...into, z: 4.8 }), 'in-house', '1 in. past the siding face');
  // No house wall (freestanding deck): anywhere is fine.
  assert.equal(build(deck({ houseEdges: [], surfaces: [into] })).geometry.surfaces[0].status, 'ok');
  // Same rule on an angled house wall.
  const ang = build({ shape: 'free', width: 20, depth: 14, height: 6, houseEdges: [0], points: [[0, 0], [1, .3], [1, 1], [0, 1]], surfaces: [{ type: 'walkway', x: 10, z: -6, width: 4, length: 8 }] });
  assert.equal(ang.geometry.surfaces[0].status, 'in-house');
});

test('B3-7 regression: decking, stairs, railings and framing are identical with any house look and slabs on every regression deck', () => {
  let n = 0;
  for (const [name, raw] of Object.entries(fixtures(win))) {
    const a = core.make(core.sanitize(raw));
    const b = core.make(core.sanitize({ ...raw, siding: 'brick', houseColor: 'Charcoal', surfaces: [{ type: 'patio', x: 0, z: 30, width: 20, length: 20 }, { type: 'walkway', x: -6, z: 8, width: 4, length: 30, angle: 30 }] }));
    assert.deepEqual(STRUCTURAL(b), STRUCTURAL(a), name);
    assert.deepEqual(plain(b.counts), plain(a.counts), name); assert.deepEqual(plain(b.materials), plain(a.materials), name);
    assert.deepEqual(plain(b.alerts.filter(x => !/runs into the house/.test(x.message))), plain(a.alerts), name);
    n++;
  }
  assert.ok(n >= 22);
});

// ---- Camera (the WebGL renderer's camera logic, driven with a stand-in canvas) ----
function camera(q, w = 1100, h = 700) {
  const canvas = { clientWidth: w, clientHeight: h, getContext: () => null, addEventListener() {}, setPointerCapture() {} };
  const r = new win.Deck3D(canvas); r.setModel(build(q)); r.fit(); return r;
}
const onScreen = (r) => { const H = r.model.intent.height; return r.model.geometry.poly.every(p => { const v = r.project([p[0], H, p[1]]); return v && v[0] >= 0 && v[0] <= 1 && v[1] >= 0 && v[1] <= 1; }); };
const eyeOK = (r) => r.eye()[1] >= 0.65 - 1e-9;

test('B3-8 camera: Fit shows the whole deck at low and high elevations, on wide and phone screens, eye above ground', () => {
  for (const H of [0.5, 2, 6, 12, 16]) for (const [name, s] of Object.entries(SHAPES)) for (const [w, h] of [[1100, 700], [390, 420]]) {
    const r = camera(deck({ ...s, height: H, staircases: [H >= 6 ? LANDING : STAIR] }), w, h);
    assert.ok(eyeOK(r), `H=${H} ${name} ${w}: eye above grade`); assert.ok(onScreen(r), `H=${H} ${name} ${w}x${h}: deck fully on screen after Fit`);
    assert.ok(r.radius >= 15 && r.radius <= 160);
  }
});

test('B3-9 camera: orbit, pan and zoom limits never put the eye underground or lose the deck', () => {
  for (const H of [0.5, 2, 9, 16]) {
    const r = camera(deck({ height: H, staircases: [STAIR] }));
    for (const el of [-3, -1.2, -.4, 0, .6, 2, 5]) { r.el = el; r.limitCameraAboveGrade(); assert.ok(eyeOK(r), `H=${H} el=${el}`); assert.ok(r.el <= 1.35 + 1e-9 && r.el >= -1.35 - 1e-9); }
    for (const z of [.01, .2, 5, 40]) { r.zoom(z); assert.ok(r.radius >= 7 && r.radius <= 160); assert.ok(eyeOK(r)); }
    r.fit(); for (let k = 0; k < 60; k++) r.pan(400, -300);
    const b = r.cameraWorkBounds();
    assert.ok(r.target[0] >= b.xmin - 1e-9 && r.target[0] <= b.xmax + 1e-9 && r.target[2] >= b.zmin - 1e-9 && r.target[2] <= b.zmax + 1e-9, 'pan stays within the deck work area');
    assert.ok(r.target[1] >= .25 - 1e-9 && r.target[1] <= H + 2.5 + 1e-9); assert.ok(eyeOK(r));
  }
  // The work area includes stairs, landings and patio/walkway slabs (so you can move the view to them).
  const r = camera(deck({ staircases: [LANDING], surfaces: [{ type: 'patio', x: 0, z: 40, width: 12, length: 10 }] })), b = r.cameraWorkBounds();
  assert.ok(b.zmax >= 45 - 1e-6, 'patio reachable'); assert.ok(r.cameraWorkBounds(false).zmax < 40, 'but Fit frames the deck and stairs');
});

test('B3-10 camera: "Under" looks up at the framing from just above the lawn; Finished/Framing switching keeps the view', () => {
  for (const H of [2, 6, 12, 16]) {
    const r = camera(deck({ height: H, staircases: [STAIR] }));
    r.lookUnder(); const eye = r.eye();
    assert.ok(eyeOK(r), `H=${H}: eye above grade`); assert.ok(eye[1] < H, `H=${H}: eye below the deck surface`); assert.ok(r.target[1] < H, 'looking at the underside');
    for (const s of [true, false, true]) {
      const before = plain({ az: r.az, el: r.el, radius: r.radius, target: r.target });
      r.setStructureVisible(s);
      assert.deepEqual(plain({ az: r.az, el: r.el, radius: r.radius, target: r.target }), before, 'switching keeps the camera');
      assert.ok(eyeOK(r));
    }
    r.fit(); assert.ok(onScreen(r), 'Fit in framing-only shows the deck'); r.setStructureVisible(false); assert.ok(onScreen(r));
  }
});
