// V5.2 Group B — B3 corrections (owner hands-on testing, 8 Nov 2026):
// house walls joined at inside/outside corners, no joint gaps, one roofline, windows on 2 ft walls,
// and patio/walkway slabs always visible in 3D. Nothing structural may change.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadEngine, ROOT } = require('./engine');
const { fixtures } = require('./fixtures');
const { withoutRailInset } = require('./rail-inset');
const { withoutC7 } = require('./c7-framing');

const win = loadEngine(), core = win.DeckCore;
// The B3 development build the owner tested (bd8d529), for "nothing else changed" checks.
const tmp = path.join(os.tmpdir(), `aos-b3dev-${process.pid}.html`);
fs.writeFileSync(tmp, execFileSync('git', ['show', 'bd8d529:index.html'], { cwd: ROOT }));
const dev = loadEngine(tmp); fs.unlinkSync(tmp);

const plain = (v) => JSON.parse(JSON.stringify(v));
const build = (q) => core.make(core.sanitize(q));
const kinds = (m, re) => m.parts.filter(p => re.test(p.kind));
const noId = (ps) => plain(ps).map(({ id, ...p }) => p);
const freeDeck = (pts, over = {}) => { const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]), x0 = Math.min(...xs), z0 = Math.min(...zs), W = Math.max(...xs) - x0, D = Math.max(...zs) - z0;
  return { shape: 'free', width: W, depth: D, points: pts.map(([x, z]) => [(x - x0) / W, (z - z0) / D]), ...over }; };
// House layouts: inside corners (deck corner convex), outside corners (deck corner reflex), multi-wall, angled and collinear.
const LAYOUTS = {
  'inside corner (rect, 2 walls)': { shape: 'rectangle', width: 20, depth: 14, houseEdges: [0, 3] },
  'two inside corners (rect, 3 walls)': { shape: 'rectangle', width: 20, depth: 14, houseEdges: [3, 0, 1] },
  'inside corner (L, 2 walls)': { shape: 'L', width: 24, depth: 18, houseEdges: [0, 5] },
  'outside corner (L notch, 2 walls)': { shape: 'L', width: 24, depth: 18, houseEdges: [3, 4] },
  'two outside corners (U notch, 3 walls)': { shape: 'U', width: 32, depth: 22, houseEdges: [3, 4, 5] },
  'mixed (L, 4 walls)': { shape: 'L', width: 24, depth: 18, houseEdges: [5, 0, 3, 4] },
  '45° bevel between walls': freeDeck([[3, 0], [20, 0], [20, 14], [0, 14], [0, 3]], { houseEdges: [4, 0] }),
  'collinear walls': freeDeck([[0, 0], [8, 0], [20, 0], [20, 14], [0, 14]], { houseEdges: [0, 1] }),
};
const at = (e, s, d) => [e.mid[0] + e.t[0] * s + e.n[0] * d, e.mid[1] + e.t[1] * s + e.n[1] * d];
function inPart(p, x, y, z, tol = 1e-7) {
  if (Math.abs(y - p.y) > p.h / 2 + tol) return false;
  if (p.footprint) { let yes = false; const f = p.footprint; for (let i = 0, j = f.length - 1; i < f.length; j = i++) { const a = f[i], b = f[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes; } return yes; }
  const c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0), dx = x - p.x, dz = z - p.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= p.w / 2 + tol && Math.abs(lz) <= p.d / 2 + tol;
}
// Each joint between consecutive house walls: [i (ends there), j (starts there)].
const joints = (m) => { const H = m.intent.houseEdges, n = m.geometry.edges.length; return H.filter(i => H.includes((i + 1) % n) && (i + 1) % n !== i).map(i => [i, (i + 1) % n]); };
const houseTopOf = (m) => m.intent.height + Math.max(7, ...m.geometry.openings.filter(o => o.status === 'ok').map(o => o.top + 1));

test('B3c-1/2/3 inside, outside, multi-wall, angled and collinear corners: the two walls meet exactly on a shared miter, full height', () => {
  let n = 0;
  for (const [name, L] of Object.entries(LAYOUTS)) for (const H of [1.5, 6, 12]) {
    const m = build({ ...L, height: H }), es = m.geometry.edges, top = houseTopOf(m), walls = kinds(m, /^house-wall$/);
    assert.ok(joints(m).length >= 1, `${name}: has a joint`);
    for (const [i, j] of joints(m)) {
      const ei = es[i], ej = es[j];
      for (const d of [core.WALL_FRONT, core.WALL_BACK]) {
        const pi = at(ei, core.wallEnds(m.intent, es, i, d)[1], d), pj = at(ej, core.wallEnds(m.intent, es, j, d)[0], d);
        assert.ok(Math.hypot(pi[0] - pj[0], pi[1] - pj[1]) < 1e-9, `${name} H=${H} ${i}/${j}: faces at depth ${d} meet at one point`);
      }
      // Both sides of the miter line are wall, from grade to the house top (sampled on both sides, every height band).
      const Pf = at(ei, core.wallEnds(m.intent, es, i, core.WALL_FRONT)[1], core.WALL_FRONT), Pb = at(ei, core.wallEnds(m.intent, es, i, core.WALL_BACK)[1], core.WALL_BACK);
      for (const f of [.1, .5, .9]) for (const y of [.05, H * .5, H + 1, top - .05]) {
        const q = [Pf[0] + (Pb[0] - Pf[0]) * f, Pf[1] + (Pb[1] - Pf[1]) * f];
        const sideI = [q[0] - ei.t[0] * .02, q[1] - ei.t[1] * .02], sideJ = [q[0] + ej.t[0] * .02, q[1] + ej.t[1] * .02];
        assert.ok(walls.some(p => p.connect === `house-edge-${i}` && inPart(p, sideI[0], y, sideI[1])), `${name} H=${H}: wall ${i} reaches the corner at y=${y.toFixed(2)}`);
        assert.ok(walls.some(p => p.connect === `house-edge-${j}` && inPart(p, sideJ[0], y, sideJ[1])), `${name} H=${H}: wall ${j} reaches the corner at y=${y.toFixed(2)}`);
      }
      n++;
    }
  }
  assert.ok(n >= 30);
});

test('B3c-4 no wall-height drop: every house wall (joined or not) reaches the same house top, also with a tall door on one wall', () => {
  const longest = (L) => { const es = core.edges(core.polygon(core.sanitize(L))); return L.houseEdges.slice().sort((a, b) => es[b].len - es[a].len)[0]; };
  for (const [name, L] of Object.entries(LAYOUTS)) for (const op of [null, { id: 'p', type: 'patio', edge: longest(L), offset: 0, width: 6, height: 8 }]) {
    const m = build({ ...L, height: 4, ...(op ? { openings: [op] } : {}) }), top = houseTopOf(m);
    if (op) { assert.equal(m.geometry.openings[0].status, 'ok', name); assert.ok(Math.abs(top - (4 + 9)) < 1e-9); }
    for (const i of m.intent.houseEdges) {
      const tops = kinds(m, /^house-wall$/).filter(p => p.connect === `house-edge-${i}`).map(p => p.y + p.h / 2);
      assert.ok(Math.abs(Math.max(...tops) - top) < 1e-9, `${name}${op ? ' + 8 ft door' : ''}: wall ${i} top`);
    }
    for (const p of kinds(m, /^house-eave$/)) assert.ok(Math.abs(p.y - p.h / 2 - top) < 1e-9, `${name}: one eave height`);
  }
});

test('B3c-5 no visible joint gaps and no overlaps: dense sampling of each corner region and along both faces near it', () => {
  for (const [name, L] of Object.entries(LAYOUTS)) {
    const m = build({ ...L, height: 6 }), es = m.geometry.edges, top = houseTopOf(m), walls = kinds(m, /^house-wall$/);
    for (const [i, j] of joints(m)) for (const k of [i, j]) {
      const e = es[k], [s0, s1] = core.wallEnds(m.intent, es, k, core.WALL_FRONT), [b0, b1] = core.wallEnds(m.intent, es, k, core.WALL_BACK), atEnd = k === i;
      // Points just inside the wall (between its faces), within 0.6 ft of the joint, at five heights.
      for (let u = .01; u < .6; u += .07) for (const d of [.13, .29, .45]) for (const y of [.05, 2, 6.5, top - .05]) {
        const sF = atEnd ? s1 : s0, sB = atEnd ? b1 : b0, sm = sF + (sB - sF) * (d - .115) / .35, s = atEnd ? sm - u : sm + u, p = at(e, s, d);
        const hits = walls.filter(w => inPart(w, p[0], y, p[1], -1e-6));
        assert.ok(hits.length >= 1, `${name}: gap in wall ${k} near the corner (u=${u.toFixed(2)}, d=${d}, y=${y})`);
        assert.ok(hits.length <= 1, `${name}: overlapping wall pieces near the corner (u=${u.toFixed(2)}, d=${d}, y=${y})`);
      }
    }
  }
});

test('B3c-6 roof/fascia continuity: eaves and roof edges of joined walls share their miter, at one height', () => {
  for (const [name, L] of Object.entries(LAYOUTS)) {
    const m = build({ ...L, height: 5 }), es = m.geometry.edges;
    for (const kind of ['house-eave', 'house-roof']) for (const [i, j] of joints(m)) {
      const A = m.parts.find(p => p.kind === kind && p.connect === `house-edge-${i}`), B = m.parts.find(p => p.kind === kind && p.connect === `house-edge-${j}`);
      assert.ok(A.footprint && B.footprint, `${name}: ${kind} mitered at joints`);
      assert.ok(Math.abs(A.y - B.y) < 1e-9 && Math.abs(A.h - B.h) < 1e-9, `${name}: ${kind} same height`);
      const shared = A.footprint.filter(a => B.footprint.some(b => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9));
      assert.ok(shared.length >= 2, `${name}: ${kind} of walls ${i} and ${j} share the miter edge`);
      // and do not overlap: points just either side of the shared edge are in exactly one of them
      const mid = [(shared[0][0] + shared[1][0]) / 2, (shared[0][1] + shared[1][1]) / 2];
      const inA = (pt) => inPart(A, pt[0], A.y, pt[1], -1e-9), inB = (pt) => inPart(B, pt[0], B.y, pt[1], -1e-9);
      const off = [es[i].t[0] * .02, es[i].t[1] * .02];
      assert.ok(inA([mid[0] - off[0], mid[1] - off[1]]) !== inB([mid[0] - off[0], mid[1] - off[1]]), `${name}: ${kind} miter, side ${i}`);
    }
    // A single, unjoined wall keeps the straight eave it had (overhang 0.4 ft past each end).
    const single = build({ shape: 'rectangle', width: 20, depth: 14, height: 5, houseEdges: [0] });
    const eave = single.parts.find(p => p.kind === 'house-eave'); assert.equal(eave.footprint, undefined); assert.ok(Math.abs(eave.w - (20 - .07 + .8)) < 1e-9);
  }
});

test('B3c-1 doors and windows stay embedded near corners: holes open, trims clear of the other wall, corner boards only at free ends and outside corners', () => {
  // Openings as close to each corner as the wall allows.
  for (const [name, L] of Object.entries(LAYOUTS)) {
    const base = build({ ...L, height: 4 }), es = base.geometry.edges, ops = [];
    for (const i of L.houseEdges) { const R = core.openingRange(base.intent, es, i); if (R[1] - R[0] < 4) continue; ops.push({ id: `a${i}`, type: 'window', edge: i, offset: R[0] + 1.001, width: 2, height: 3, sill: 3 }, { id: `b${i}`, type: 'door', edge: i, offset: R[1] - 1.501, width: 3 }); }
    const m = build({ ...L, height: 4, openings: ops });
    for (const o of m.geometry.openings) {
      assert.equal(o.status, 'ok', `${name}: ${o.id} fits at the edge of its usable range`);
      const e = es[o.edge], mid = at(e, o.offset, .29), y = 4 + (o.bottom + o.top) / 2;
      assert.ok(!kinds(m, /^house-(wall|back)$/).some(p => p.kind === 'house-wall' && inPart(p, mid[0], y, mid[1])), `${name}: ${o.id} hole is open`);
      // Its trim stays in front of its own wall: no part of it is inside another wall's pieces.
      for (const p of m.parts.filter(p => p.opening === o.id && p.kind === 'opening-trim')) {
        const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
        for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) { const lx = a * (p.w / 2 - .005), lz = b * (p.d / 2 - .005), x = p.x + lx * c + lz * sn, z = p.z - lx * sn + lz * c;
          assert.ok(!kinds(m, /^house-wall$/).some(w => w.connect !== `house-edge-${o.edge}` && inPart(w, x, p.y, z, -1e-6)), `${name}: ${o.id} trim is not buried in another wall`); }
      }
    }
  }
  // Inside-corner and free ends keep the old 3 in. rule; an outside corner keeps openings off the mitered corner.
  const ins = build({ ...LAYOUTS['inside corner (rect, 2 walls)'], height: 4 }), out = build({ ...LAYOUTS['outside corner (L notch, 2 walls)'], height: 4 });
  for (const i of [0, 3]) { const R = core.openingRange(ins.intent, ins.geometry.edges, i), e = ins.geometry.edges[i]; assert.ok(Math.abs(R[0] + e.len / 2 - .25) < 1e-9 && Math.abs(R[1] - e.len / 2 + .25) < 1e-9, 'inside corner: unchanged'); }
  { const e = out.geometry.edges[3], R = core.openingRange(out.intent, out.geometry.edges, 3); assert.ok(R[1] <= e.len / 2 - core.WALL_BACK + 1e-9 && Math.abs(R[0] - (-e.len / 2 + .25)) < 1e-9, 'outside corner end (wall 3 ends at the corner) clears the miter; free end unchanged'); }
});

test('B3c-7/8 windows on a 2′-0″ wall: allowed when the size and 3 in. clearances fit; constrained otherwise; older placements unchanged', () => {
  // A 2 ft wall: the face of a 2 ft deep, 2 ft wide notch in the house side of the deck.
  const pts = [[0, 2], [9, 2], [9, 0], [11, 0], [11, 2], [20, 2], [20, 14], [0, 14]];
  for (const houseEdges of [[2], [1, 2, 3], [0, 1, 2, 3, 4]]) {
    const q = freeDeck(pts, { height: 4, houseEdges }), m0 = build(q), es = m0.geometry.edges, i = es.findIndex(e => Math.abs(e.len - 2) < 1e-6 && Math.abs(e.mid[0]) < 1e-6 && Math.abs(e.mid[1]) < 1e-6);
    assert.ok(i >= 0 && m0.intent.houseEdges.includes(i));
    const R = core.openingRange(m0.intent, es, i), room = R[1] - R[0];
    assert.ok(room >= 1 - 1e-9, `${houseEdges}: a 2 ft wall has room for at least a 1 ft window (room ${room.toFixed(3)} ft)`);
    const fits = { id: 'w', type: 'window', edge: i, offset: (R[0] + R[1]) / 2, width: Math.floor(room * 12) / 12, height: 2, sill: 3 };
    const m = build({ ...q, openings: [fits] });
    assert.equal(m.geometry.openings[0].status, 'ok', `${houseEdges}: ${fits.width * 12} in. window fits the 2 ft wall`);
    const mid = at(es[i], fits.offset, .29); assert.ok(!kinds(m, /^house-wall$/).some(p => inPart(p, mid[0], 4 + 4, mid[1])), 'and is cut into it');
    assert.ok(m.parts.some(p => p.opening === 'w' && p.kind === 'opening-glass'));
    assert.equal(build({ ...q, openings: [{ ...fits, width: fits.width + 2 / 12 }] }).geometry.openings[0].status, 'off-wall', 'too wide for the wall');
    assert.equal(build({ ...q, openings: [{ ...fits, offset: fits.offset + .5 }] }).geometry.openings[0].status, 'off-wall', 'moved past the clearance');
    assert.equal(build({ ...q, openings: [fits, { ...fits, id: 'w2' }] }).geometry.openings[1].status, 'overlap', 'two windows cannot overlap');
  }
  // Every house wall without a neighbouring house wall keeps exactly the B1 rule (older projects unchanged).
  for (const [name, raw] of Object.entries(fixtures(win))) {
    const m = build(raw), es = m.geometry.edges;
    for (const i of m.intent.houseEdges) { const nb = core.houseNeighbours(m.intent, es, i); if (nb.start !== null || nb.end !== null) continue;
      const R = core.openingRange(m.intent, es, i); assert.ok(Math.abs(R[0] + es[i].len / 2 - .25) < 1e-12 && Math.abs(R[1] - es[i].len / 2 + .25) < 1e-12, name); }
  }
  // Older B1/B2 projects with windows: same status as in the B3 development build wherever the wall has no outside-corner neighbour.
  for (const L of Object.values(LAYOUTS)) for (const i of L.houseEdges) for (const off of [-3, 0, 3]) {
    const q = { ...L, height: 4, openings: [{ id: 'x', type: 'window', edge: i, offset: off, width: 3, height: 3, sill: 2 }] };
    const now = build(q).geometry.openings[0].status, before = dev.DeckCore.make(dev.DeckCore.sanitize(q)).geometry.openings[0].status;
    const R = core.openingRange(core.sanitize(q), core.edges(core.polygon(core.sanitize(q))), i), e = core.edges(core.polygon(core.sanitize(q)))[i];
    if (R[0] <= -e.len / 2 + .25 + 1e-9 && R[1] >= e.len / 2 - .25 - 1e-9) assert.equal(now, before, 'same as before away from outside corners');
  }
});

test('B3c-9 patio/walkway: a slab that is in the 2D plan is in the 3D scene, inside the Fit view, and separable from the lawn in a 16-bit depth buffer', () => {
  const canvas = (w, h) => ({ clientWidth: w, clientHeight: h, getContext: () => null, addEventListener() {}, setPointerCapture() {} });
  const cases = [
    { type: 'patio', x: 0, z: 21, width: 14, length: 10 }, { type: 'walkway', x: 9, z: 34, width: 4, length: 12, angle: 30 },
    { type: 'patio', x: -18, z: 6, width: 10, length: 16 }, { type: 'patio', x: 0, z: 7, width: 12, length: 10 }];
  for (const [w, h] of [[1100, 700], [390, 420]]) for (const sf of cases) {
    const m = build({ shape: 'rectangle', width: 20, depth: 14, height: 6, houseEdges: [0], staircases: [{ id: 's', edge: 2, width: 4, offset: 3, rails: { left: true, right: true } }], surfaces: [sf] });
    assert.equal(m.geometry.surfaces[0].status, 'ok');
    const r = new win.Deck3D(canvas(w, h)); r.setModel(m); r.fit();
    const slab = r.visibleParts.find(p => p.kind === 'concrete-surface');
    assert.ok(slab, 'drawn in finished 3D');
    for (const c of m.geometry.surfaces[0].corners) { const v = r.project([c[0], slab.y + slab.h / 2, c[1]]); assert.ok(v && v[0] >= -0.001 && v[0] <= 1.001 && v[1] >= -0.001 && v[1] <= 1.001, `${w}x${h} ${sf.type} at ${sf.x},${sf.z}: corner on screen after Fit`); }
    const [near, far] = r.clipPlanes(); assert.ok(near >= .1 && far > r.radius + 170, 'clip planes cover the whole lawn');
    r.setStructureVisible(true); assert.ok(!r.visibleParts.some(p => p.kind === 'concrete-surface'), 'hidden in framing-only');
  }
});

test('B3c-9b the lawn is drawn in its own pass pushed back in depth, so slabs at grade win even with a 16-bit depth buffer', () => {
  // A recording stand-in for WebGL: every call is logged; the renderer's own draw order is checked.
  const log = []; const fake = new Proxy({}, { get(_, k) {
    if (typeof k !== 'string') return undefined; if (/^[A-Z_0-9]+$/.test(k)) return k;
    return (...a) => { log.push([k, ...a]); if (/^create/.test(k)) return { k }; if (/Parameter$/.test(k)) return k === 'getParameter' ? (a[0] === 'STENCIL_BITS' ? 8 : 'Fake GPU') : true;
      if (k === 'getAttribLocation') return 0; if (k === 'getUniformLocation') return { u: a[1] }; if (k === 'getExtension') return null; return undefined; }; } });
  const canvas = { clientWidth: 900, clientHeight: 600, width: 0, height: 0, getContext: (t) => (/webgl/.test(t) ? fake : null), addEventListener() {}, setPointerCapture() {} };
  win.devicePixelRatio = 1;
  const r = new win.Deck3D(canvas);
  r.setModel(build({ shape: 'rectangle', width: 20, depth: 14, height: 6, houseEdges: [0], surfaces: [{ type: 'patio', x: 0, z: 21, width: 14, length: 10 }] }));
  assert.ok(r.counts.lawn > 0 && r.counts.ground > 0, 'lawn and concrete are in separate buffers');
  log.length = 0; r.draw();
  const calls = log.map(c => c[0]), on = log.findIndex(c => c[0] === 'polygonOffset'), draws = log.map((c, i) => [c, i]).filter(([c]) => c[0] === 'drawArrays' && c[1] === 'TRIANGLES');
  assert.ok(on >= 0 && log[on][1] > 0 && log[on][2] > 0, 'lawn pushed back (positive factor and units)');
  assert.equal(draws[0][0][3], r.counts.lawn, 'the lawn is the first thing drawn'); assert.ok(draws[0][1] > on, 'with the offset on');
  const off = log.findIndex((c, i) => i > draws[0][1] && c[0] === 'disable' && c[1] === 'POLYGON_OFFSET_FILL'); assert.ok(off > draws[0][1] && off < draws[1][1], 'offset off again before the slabs are drawn');
  assert.equal(draws[1][0][3], r.counts.ground, 'then the concrete, without any offset');
  assert.ok(calls.includes('enable'));
});

test('B3c-12 nothing but the house changed: every non-house part, count, material and alert is identical to the B3 development build', () => {
  const all = { ...fixtures(win) };
  for (const [name, L] of Object.entries(LAYOUTS)) all[name] = { ...L, height: 6, borderCount: 1, staircases: [{ id: 's', edge: 2, width: 4, offset: 0, rails: { left: true, right: true } }], surfaces: [{ type: 'patio', x: 0, z: 30, width: 12, length: 10 }] };
  all['landing+look'] = { shape: 'rectangle', width: 20, depth: 14, height: 7, houseEdges: [0, 3], siding: 'brick', houseColor: 'Sage', borderCount: 2, deckLine: 'diagonal-left', staircases: [{ id: 'a', edge: 2, width: 4, offset: 3, landing: { width: 6, depth: 5, elevation: 3.5, turn: 'left' }, rails: { left: true, right: true } }] };
  const NOT_HOUSE = (m) => noId(m.parts.filter(p => !(p.group === 'context' && /^(house-|siding-course)/.test(p.kind))));
  let n = 0;
  for (const [name, raw] of Object.entries(all)) {
    // V5.3 R1 rail inset (owner, 11 Nov 2026): railing outputs excepted; they are checked by tests/rail-inset-r1.test.js.
    const a0 = build(raw), b0 = dev.DeckCore.make(dev.DeckCore.sanitize(raw));
    if (a0.stats.invalidGeometry) continue;
    // V5.3 C7 framing: framing of designs C7 reframes excepted (tests/framing-c7.test.js); new count categories removed.
    const a = withoutC7(withoutRailInset(a0), a0), b = withoutC7(withoutRailInset(b0), a0);
    assert.deepEqual(NOT_HOUSE(a), NOT_HOUSE(b), `${name}: decking, framing, stairs, landings, railings, openings, slabs`);
    assert.deepEqual(plain(a.counts), plain(b.counts), name); assert.deepEqual(plain(a.materials), plain(b.materials), name);
    assert.deepEqual(plain(a.alerts), plain(b.alerts), name); n++;
  }
  assert.ok(n >= 30);
});
