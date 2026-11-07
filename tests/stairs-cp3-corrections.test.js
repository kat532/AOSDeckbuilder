// V5.2 Group A — Checkpoint 3 corrections (owner testing, 7 Nov 2026):
//  1. Sloped stair railings must physically connect to the level landing guards (no gaps).
//  2. Landing picture-frame boards need support joists / blocking in the landing framing.
// Engine tests. The main deck is separately proven identical to V5.2 in v52-equivalence.test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./engine');

const win = loadEngine();
const core = win.DeckCore;
const plain = (v) => JSON.parse(JSON.stringify(v));
const BW = core.BW, GAP = core.GAP, PITCH = core.PITCH;
const deck = (over = {}) => ({ shape: 'rectangle', width: 24, depth: 14, height: 7, houseEdges: [0], ...over });
const stairOf = (L = {}, over = {}) => ({ id: 's1', edge: 2, width: 4, offset: 0, rails: { left: true, right: true }, ...over, landing: { width: 6, depth: 5, elevation: 3.5, ...L } });
const build = (q) => core.make(core.sanitize(q));
const kinds = (m, re) => m.parts.filter(p => re.test(p.kind));
const TURNS = ['straight', 'left', 'right'];
const DIRS = ['match', 'horizontal', 'vertical', 'diagonal-left', 'diagonal-right'];
const MAIN_FRAMING = /^(joist|rim-joist|ledger|dropped-beam|post-6x6|footing-concept|corner-trimmer|picture-support-joist|divider-support-joist|blocking|header)$/;
const turnLanding = (turn, L = {}) => ({ ...(turn === 'straight' ? {} : { turn }), ...L });

// ---- geometry helpers ----
const POST_HALF = 0.21 / 2;
function railEnds(p) { // plan ends and centre elevations of a (possibly sloped) rail box
  const t = [Math.cos(-p.yaw), Math.sin(-p.yaw)], hl = p.w / 2 * Math.cos(p.rz || 0), dy = p.w / 2 * Math.abs(Math.sin(p.rz || 0));
  return [{ x: p.x - t[0] * hl, z: p.z - t[1] * hl, y: p.y + dy }, { x: p.x + t[0] * hl, z: p.z + t[1] * hl, y: p.y - dy }];
}
const posts = (m) => m.parts.filter(p => /^(stair-rail-post|railing-post)$/.test(p.kind));
const postFor = (m, e, tol = POST_HALF) => posts(m).filter(p => Math.hypot(p.x - e.x, p.z - e.z) <= tol + 1e-9);
function toLocal(g) { return (x, z) => { const dx = x - g.base[0], dz = z - g.base[1]; return [dx * g.tt[0] + dz * g.tt[1], dx * g.nn[0] + dz * g.nn[1]]; }; }
function footprintLocal(g, p) { // plan rectangle of a framing member, in landing (u, v)
  const t = [Math.cos(-p.yaw), Math.sin(-p.yaw)], n = [-t[1], t[0]], L = toLocal(g);
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => L(p.x + t[0] * a * p.w / 2 + n[0] * b * p.d / 2, p.z + t[1] * a * p.w / 2 + n[1] * b * p.d / 2));
}
const bbox = (pts) => ({ u0: Math.min(...pts.map(p => p[0])), u1: Math.max(...pts.map(p => p[0])), v0: Math.min(...pts.map(p => p[1])), v1: Math.max(...pts.map(p => p[1])) });
const covered = (pt, boxes, tol = 0) => boxes.some(b => pt[0] >= b.u0 - tol && pt[0] <= b.u1 + tol && pt[1] >= b.v0 - tol && pt[1] <= b.v1 + tol);

// ---- 1. railings ----
function* railCases() {
  for (const turn of TURNS) for (const [LW, LD] of [[4, 4], [5, 5], [6, 5], [8, 7], [12, 9]]) for (const rails of [{ left: true, right: true }, { left: true, right: false }, { left: false, right: true }, { left: false, right: false }]) for (const elev of [3.5, 2])
    yield { turn, LW, LD, rails, elev, q: deck({ staircases: [stairOf(turnLanding(turn, { width: LW, depth: LD, elevation: elev }), { rails })] }) };
}

test('R1 every sloped and level rail end finishes on a post that is tall enough (no floating rails)', () => {
  let checked = 0;
  for (const c of railCases()) {
    const m = build(c.q);
    for (const r of m.parts.filter(p => p.kind === 'stair-top-rail' || p.kind === 'stair-bottom-rail')) for (const e of railEnds(r)) {
      const ps = postFor(m, e);
      assert.ok(ps.length >= 1, `${c.turn} ${c.LW}x${c.LD} ${JSON.stringify(c.rails)}: ${r.kind} (${r.connect}) end at (${e.x.toFixed(2)}, ${e.z.toFixed(2)}) has no post`);
      assert.ok(ps.some(p => p.y + p.h / 2 >= e.y - 1e-9 && p.y - p.h / 2 <= e.y + 1e-9), `${c.turn} ${c.LW}x${c.LD}: ${r.kind} end at ${e.y.toFixed(2)} ft is above or below its post`);
      checked++;
    }
  }
  assert.ok(checked > 2000);
});

test('R2 the upper flight, landing guards and lower flight form one connected chain per railed side', () => {
  for (const c of railCases()) {
    const m = build(c.q), g = m.geometry.stairs[0], L = g.landing;
    const guardsOn = L.elevation > 2.5;
    for (const side of ['left', 'right']) {
      const fr = (L.flightRails || []).filter(f => f.side === side);
      if (!c.rails[side]) { assert.equal(fr.length, 0, 'no flight rail on a side that is turned off'); continue; }
      assert.equal(fr.length, 2, 'both flights railed');
      // The landing ends of both flight rails meet transition posts...
      const up = fr.find(f => f.flight === 0), lo = fr.find(f => f.flight === 1);
      const T = (L.transitions || []).filter(t => t.side === side);
      for (const [f, end] of [[up, up.to], [lo, lo.from]]) {
        const t = T.find(x => x.flight === f.flight);
        assert.ok(t, `${c.turn} ${side}: transition for flight ${f.flight}`);
        assert.ok(Math.hypot(end[0] - t.post[0], end[1] - t.post[1]) <= POST_HALF + 1e-9, `${c.turn} ${c.LW}x${c.LD} ${side}: flight ${f.flight} rail ends ${Math.hypot(end[0] - t.post[0], end[1] - t.post[1]).toFixed(3)} ft from its transition post`);
      }
      // ...and the level guards join those two posts without a break (posts are the graph nodes).
      const tu = T.find(x => x.flight === 0).post, tl = T.find(x => x.flight === 1).post;
      const toW = (u, v) => [g.base[0] + u * g.tt[0] + v * g.nn[0], g.base[1] + u * g.tt[1] + v * g.nn[1]];
      const segs = (L.guards || []).map(s => [toW(...s.a), toW(...s.b)]);
      const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.30;
      const reach = [tu], todo = [tu];
      while (todo.length) { const n = todo.pop(); for (const [a, b] of segs) for (const [x, y] of [[a, b], [b, a]]) if (same(x, n) && !reach.some(r => same(r, y))) { reach.push(y); todo.push(y); } }
      assert.ok(reach.some(r => same(r, tl)), `${c.turn} ${c.LW}x${c.LD} ${side} (elev ${L.elevation.toFixed(2)}, guards ${guardsOn}): landing guards do not connect the two flights`);
    }
  }
});

test('R3 openings, rail choices and posts: no guard across a flight, one post per spot, quantities match', () => {
  const segDist = (p, a, b) => { const d = [b[0] - a[0], b[1] - a[1]], l2 = d[0] * d[0] + d[1] * d[1] || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2)); return Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1]); };
  for (const c of railCases()) {
    const m = build(c.q), g = m.geometry.stairs[0], L = g.landing;
    for (const o of L.openings) for (let k = 1; k < 10; k++) {
      const p = [o.a[0] + (o.b[0] - o.a[0]) * k / 10, o.a[1] + (o.b[1] - o.a[1]) * k / 10];
      for (const s of L.guards) assert.ok(segDist(p, s.a, s.b) > 0.2, `${c.turn} ${c.LW}x${c.LD}: guard across the ${o.flight} opening`);
    }
    const ps = posts(m);
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) assert.ok(Math.hypot(ps[i].x - ps[j].x, ps[i].z - ps[j].z) >= 0.3 - 1e-9, `${c.turn} ${c.LW}x${c.LD}: two posts in one spot`);
    assert.equal(m.counts.railPosts, ps.length, 'railing post count = posts drawn');
    assert.equal(m.counts.balusters, m.parts.filter(p => /baluster/.test(p.kind)).length);
    assert.ok(Math.abs(L.guardLF - L.guards.reduce((a, s) => a + Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), 0)) < 1e-9);
    // The stair railing colour is the selected railing colour on every piece.
    const col = core.RAILS[core.railFinish(m.intent, 2).railColor];
    assert.ok(m.parts.filter(p => /^stair-(top-rail|bottom-rail|rail-post|baluster)$/.test(p.kind)).every(p => p.color === col));
  }
});

test('R4 plain stairs (no landing) keep exactly the V5.2 railing', () => {
  // Proven against the protected V5.2 file in v52-equivalence; here a quick self-check of one case.
  const m = build(deck({ staircases: [{ id: 's', edge: 2, width: 4, offset: 0, rails: { left: true, right: true } }] }));
  assert.equal(m.parts.filter(p => p.connect === 'landing-transition').length, 0);
  assert.equal(m.parts.filter(p => p.kind === 'stair-top-rail').length, 2);
});

// ---- 2. landing picture-frame support ----
function frameCase(turn, dl, bc, LW, LD) {
  const q = deck({ borderCount: bc, staircases: [stairOf(turnLanding(turn, { width: LW, depth: LD, ...(dl === 'match' ? {} : { deckLine: dl }) }))] });
  const m = build(q), g = m.geometry.stairs[0];
  const L = toLocal(g), members = kinds(m, /^landing-(beam|rim|joist|blocking|flat-2x6)$/);
  const boxes = members.map(p => ({ p, ...bbox(footprintLocal(g, p)) }));
  return { m, g, L, boxes, members };
}
function* frameCases() {
  for (const turn of TURNS) for (const dl of DIRS) for (const bc of [0, 1, 2]) for (const [LW, LD] of [[4, 4], [6, 5], [9, 8]]) yield { turn, dl, bc, LW, LD };
}

test('F1 picture-frame boards: both long edges of a frame board running with the joists sit on framing; every miter is supported', () => {
  let n = 0;
  for (const c of frameCases()) {
    const { m, g, L, boxes } = frameCase(c.turn, c.dl, c.bc, c.LW, c.LD), Ld = g.landing;
    const jAxisU = Ld.framing.joistAxis === 'across the stair';
    for (const f of kinds(m, /^landing-frame$/)) {
      const pts = f.footprint.map(([x, z]) => L(x, z)), b = bbox(pts);
      const alongU = b.u1 - b.u0 > b.v1 - b.v0; // frame board running across the stair
      const withJoists = alongU === jAxisU;
      if (withJoists) {
        // Sample both long edges: each must lie on a member (rim, header, support joist).
        const long = alongU ? [b.v0, b.v1] : [b.u0, b.u1];
        for (const e of long) for (let k = 1; k < 10; k++) {
          const s = alongU ? [b.u0 + (b.u1 - b.u0) * k / 10, e] : [e, b.v0 + (b.v1 - b.v0) * k / 10];
          assert.ok(covered(s, boxes, 0.02), `${c.turn}/${c.dl}/bc${c.bc} ${c.LW}x${c.LD}: frame board edge unsupported at (${s[0].toFixed(2)}, ${s[1].toFixed(2)})`);
          n++;
        }
      }
      // Miters: points along each 45-degree cut sit on framing (header/rim, support joist or miter block).
      const corner = pts.filter(([u, v]) => Math.abs((Ld.width / 2 - Math.abs(u)) - Math.min(v - Ld.v0, Ld.v1 - v)) < 1e-6);
      for (let i = 0; i < corner.length; i++) for (let j = i + 1; j < corner.length; j++) {
        const a = corner[i], bb = corner[j], same = Math.abs(Math.abs(a[0] - bb[0]) - Math.abs(a[1] - bb[1])) < 1e-6 && Math.hypot(a[0] - bb[0], a[1] - bb[1]) < BW * 1.5;
        if (!same) continue;
        for (const t of [0.15, 0.5, 0.85]) { const s = [a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t]; assert.ok(covered(s, boxes, 0.04), `${c.turn}/${c.dl}/bc${c.bc}: miter unsupported at (${s[0].toFixed(2)}, ${s[1].toFixed(2)})`); n++; }
      }
    }
  }
  assert.ok(n > 3000);
});

test('F2 every field-board end lands on framing (joist, support joist, header or blocking)', () => {
  for (const c of frameCases()) {
    const { m, g, L, boxes } = frameCase(c.turn, c.dl, c.bc, c.LW, c.LD), Ld = g.landing, inset = c.bc * PITCH;
    for (const b of kinds(m, /^landing-board$/)) for (const [x, z] of b.footprint) {
      const [u, v] = L(x, z);
      const atEdge = Math.abs(Math.abs(u) - (Ld.width / 2 - inset)) < 1e-6 || Math.abs(v - (Ld.v0 + inset)) < 1e-6 || Math.abs(v - (Ld.v1 - inset)) < 1e-6;
      if (!atEdge) continue;
      // A board end: the corner of the board must bear on framing within half an inch.
      assert.ok(covered([u, v], boxes, 0.045), `${c.turn}/${c.dl}/bc${c.bc} ${c.LW}x${c.LD}: field-board end at (${u.toFixed(2)}, ${v.toFixed(2)}) is unsupported`);
    }
  }
});

test('F3 support follows the frame choice and board direction: none without a frame, nothing redundant, all inside the landing', () => {
  for (const c of frameCases()) {
    const { m, g, boxes, members } = frameCase(c.turn, c.dl, c.bc, c.LW, c.LD), Ld = g.landing, F = Ld.framing;
    const blocks = members.filter(p => p.kind === 'landing-blocking'), sup = members.filter(p => p.role === 'frame-support');
    if (c.bc === 0) { assert.equal(blocks.length + sup.length, 0, 'no frame: no picture-frame blocking or support joists'); }
    else {
      assert.ok(sup.length >= 2 * c.bc - 0, `${c.turn}/${c.dl}/bc${c.bc}: support joist under each frame joint on both sides`);
      // B2 owner finding #1: each frame course on the sides running with the joists sits on a 2x6
      // laid FLAT (5.5 in. wide, 1.5 in. thick, top flush with the joists), beside its support joist.
      const flats = members.filter(p => p.kind === 'landing-flat-2x6');
      assert.equal(flats.length, 2 * c.bc, `${c.turn}/${c.dl}/bc${c.bc}: one flat 2x6 per course per side`);
      for (const f of flats) {
        assert.ok(Math.abs(f.d - 5.5 / 12) < 1e-9 && Math.abs(f.h - 1.5 / 12) < 1e-9, 'laid flat: 5.5 in. wide, 1.5 in. thick');
        assert.ok(Math.abs(f.y + f.h / 2 - (Ld.elevation - 1 / 12)) < 1e-9, 'top flush with the joists, under the decking');
        assert.equal(f.group, 'stair-framing'); assert.match(f.label, /laid flat/);
      }
      assert.equal(sup.length, 2 * c.bc, 'a support joist beside each flat 2x6');
      const dir = Ld.decking.direction;
      const fieldEnd = blocks.filter(b => b.role === 'field-end').length;
      // Field-end blocking only when field boards have ends on the sides that run across the joists.
      if (dir === 'horizontal' || dir === 'vertical') assert.equal(fieldEnd, 0, `${c.dl}: field boards run parallel to the header sides: no field-end blocking`);
      else assert.ok(fieldEnd > 0, `${c.dl}: diagonal field ends on all four sides need blocking`);
    }
    assert.equal(m.counts.landingBlocking, blocks.length); assert.equal(m.counts.landingFrameSupportJoists, sup.length);
    const flats = members.filter(p => p.kind === 'landing-flat-2x6');
    assert.equal(m.counts.landingFlat2x6, flats.length); assert.equal(F.flat2x6, flats.length);
    assert.ok(Math.abs(m.counts.landingFlat2x6LF - flats.reduce((a, f) => a + f.w, 0)) < 0.01, 'flat 2x6 LF from the generated members');
    assert.equal(F.blocks, blocks.length); assert.equal(F.supportJoists, sup.length);
    // Joists always cross the field boards (square layouts).
    if (Ld.decking.direction === 'horizontal') assert.equal(F.joistAxis, 'down the stair');
    if (Ld.decking.direction === 'vertical') assert.equal(F.joistAxis, 'across the stair');
    // Everything inside the landing frame footprint, and no two members overlapping.
    for (const b of boxes) {
      assert.ok(b.u0 >= -Ld.width / 2 - 1e-6 && b.u1 <= Ld.width / 2 + 1e-6 && b.v0 >= Ld.v0 - 1e-6 && b.v1 <= Ld.v1 + 1e-6, `${c.turn}/${c.dl}/bc${c.bc}: ${b.p.kind} outside the landing`);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const ou = Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0), ov = Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0);
      // Members may only touch where one frames into another (overlap thinner than a hanger seat).
      assert.ok(!(ou > 0.02 && ov > 0.02 && Math.min(ou, ov) > 0.02 && !(a.p.kind === 'landing-beam' || b.p.kind === 'landing-beam' || a.p.kind === 'landing-rim' || b.p.kind === 'landing-rim')), `${c.turn}/${c.dl}/bc${c.bc}: ${a.p.kind} overlaps ${b.p.kind}`);
      if (a.p.kind === 'landing-blocking' || b.p.kind === 'landing-blocking') assert.ok(!(ou > 0.005 && ov > 0.005), `${c.turn}/${c.dl}/bc${c.bc}: blocking overlaps ${a.p.kind === 'landing-blocking' ? b.p.kind : a.p.kind}`);
    }
    // Joist spacing never exceeds the on-centre spacing (members across the spacing axis).
    const across = members.filter(p => /^landing-(joist|rim)$/.test(p.kind) || (p.kind === 'landing-beam' && Math.abs(p.yaw - members.find(x => x.kind === 'landing-joist')?.yaw) < 1e-9));
    const pos = across.map(p => { const b = bbox(footprintLocal(g, p)); return F.joistAxis === 'down the stair' ? (b.u0 + b.u1) / 2 : (b.v0 + b.v1) / 2; }).sort((a, b) => a - b);
    for (let i = 1; i < pos.length; i++) assert.ok(pos[i] - pos[i - 1] <= F.joistOC / 12 + 1e-6, `${c.turn}/${c.dl}/bc${c.bc} ${c.LW}x${c.LD}: joists ${(pos[i] - pos[i - 1]).toFixed(2)} ft apart`);
  }
});

test('F4 blocking updates with landing size, direction and frame; review flag; main deck framing unchanged', () => {
  const count = (L, bc) => build(deck({ borderCount: bc, staircases: [stairOf(L)] })).counts;
  const a = count({ width: 6, depth: 5, deckLine: 'diagonal-left' }, 1), b = count({ width: 10, depth: 5, deckLine: 'diagonal-left' }, 1);
  assert.ok(b.landingBlocking > a.landingBlocking, 'wider landing: more blocking pieces');
  const c2 = count({ width: 6, depth: 5, deckLine: 'diagonal-left' }, 2);
  assert.ok(c2.landingFrameSupportJoists > a.landingFrameSupportJoists, 'double frame: more support joists');
  assert.equal(count({ width: 6, depth: 5, deckLine: 'horizontal' }, 0).landingBlocking, 0);
  const m = build(deck({ borderCount: 1, staircases: [stairOf({ deckLine: 'diagonal-right' })] }));
  assert.ok(m.alerts.some(x => x.level === 'review' && /flat-laid 2x6 run.*support joist.*block.*production review/.test(x.message)));
  assert.ok(kinds(m, /^landing-blocking$/).every(p => p.group === 'stair-framing' && /concept/.test(p.label)));
  const without = build(deck({ borderCount: 1, staircases: [{ id: 's1', edge: 2, width: 4, offset: 0, rails: { left: true, right: true } }] }));
  for (const turn of TURNS) for (const bc of [0, 1, 2]) {
    const w = build(deck({ borderCount: bc, staircases: [stairOf(turnLanding(turn, { deckLine: 'diagonal-left' }))] }));
    const o = bc === 1 ? without : build(deck({ borderCount: bc, staircases: [{ id: 's1', edge: 2, width: 4, offset: 0, rails: { left: true, right: true } }] }));
    assert.deepEqual(plain(kinds(w, MAIN_FRAMING)), plain(kinds(o, MAIN_FRAMING)), `${turn}/bc${bc}: main deck framing identical`);
  }
});

test('F5 save/reopen keeps the landing frame support identical', () => {
  const q = core.sanitize(deck({ borderCount: 2, staircases: [stairOf({ turn: 'right', deckLine: 'diagonal-left', width: 7, depth: 6 })] }));
  const a = core.make(q), b = core.make(core.sanitize(JSON.parse(JSON.stringify(q))));
  assert.deepEqual(plain(kinds(a, /^landing-/)), plain(kinds(b, /^landing-/)));
});
