// V5.2 Group A — Checkpoint 3: landing decking that follows the main deck (with its own direction
// override) and A4 90-degree turning stairs. Engine tests. Plain stairs and decks without landings
// are separately proven identical to V5.2 in v52-equivalence.test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { RAIL_LINE } = require('./rail-inset');
const { loadEngine } = require('./engine');

const win = loadEngine();
const core = win.DeckCore, geo = win.AOSGeometry;
const plain = (v) => JSON.parse(JSON.stringify(v));
const deck = (over = {}) => ({ shape: 'rectangle', width: 20, depth: 14, height: 7, houseEdges: [0], ...over });
const stair = (over = {}) => ({ id: 's1', edge: 2, width: 4, offset: 0, rails: { left: true, right: true }, ...over });
const landing = (L = {}, over = {}) => stair({ ...over, landing: { width: 6, depth: 5, elevation: 3.5, ...L } });
const build = (q) => core.make(core.sanitize(q));
const kinds = (m, re) => m.parts.filter(p => re.test(p.kind));
const MAIN_FRAMING = /^(joist|rim-joist|ledger|dropped-beam|post-6x6|footing-concept|corner-trimmer|picture-support-joist|divider-support-joist|blocking|header)$/;
const DIRS = ['match', 'horizontal', 'vertical', 'diagonal-left', 'diagonal-right'];
const BW = core.BW, GAP = core.GAP, PITCH = core.PITCH;

// Landing-local coordinates: x across the stair (tt), y down the stair from the top of the landing.
function local(g) { const L = g.landing; return ([x, z]) => { const dx = x - g.base[0], dz = z - g.base[1]; return [dx * g.tt[0] + dz * g.tt[1], dx * g.nn[0] + dz * g.nn[1] - L.v0]; }; }
const unit = (v) => { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };
// The board direction we EXPECT, in world coordinates, for a setting.
function expectedDir(m, g, setting) {
  const nn = g.nn, tt = g.tt, left = [nn[1], -nn[0]];
  if (setting === 'horizontal') return tt;
  if (setting === 'vertical') return nn;
  if (setting === 'diagonal-left') return unit([nn[0] + left[0], nn[1] + left[1]]);
  if (setting === 'diagonal-right') return unit([nn[0] - left[0], nn[1] - left[1]]);
  return m.geometry.boardAxis; // match: the main deck's own board direction
}
const along = (pts, ax) => { const v = pts.map(p => p[0] * ax[0] + p[1] * ax[1]); return [Math.min(...v), Math.max(...v)]; };
function inside(pt, poly) { let yes = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes; } return yes; }

// Sample the landing rectangle: no point is covered twice, and the uncovered share is no more than
// the board gaps account for (a missing board would leave ~10x that).
function coverage(m, g) {
  const L = g.landing, toL = local(g), pieces = kinds(m, /^landing-(board|frame)$/).map(p => p.footprint.map(toL));
  let twice = 0, none = 0, n = 0;
  // A slightly irrational grid so no sample sits exactly on a shared board edge or miter line.
  for (let i = 0; i < 120; i++) for (let j = 0; j < 120; j++) {
    const pt = [-L.width / 2 + L.width * (i + 0.5137) / 120, L.depth * (j + 0.4721) / 120]; n++;
    const c = pieces.filter(p => inside(pt, p)).length; if (c > 1) twice++; if (!c) none++;
  }
  return { twice, noneShare: none / n, pieces };
}

test('CP3-1 all five landing board directions: every field board runs the chosen way, no overlaps or gaps', () => {
  for (const main of ['horizontal', 'vertical', 'diagonal']) for (const setting of DIRS) {
    const m = build(deck({ deckLine: main, staircases: [landing(setting === 'match' ? {} : { deckLine: setting })] }));
    const g = m.geometry.stairs[0], dir = expectedDir(m, g, setting), nrm = [-dir[1], dir[0]];
    const boards = kinds(m, /^landing-board$/);
    assert.ok(boards.length >= 3, `${main}/${setting}: field boards present`);
    for (const b of boards) {
      const [lo, hi] = along(b.footprint, nrm);
      assert.ok(hi - lo <= BW + 1e-6, `${main}/${setting}: each board is one board wide across the chosen direction`);
    }
    assert.equal(g.landing.decking.setting, setting);
    const want = setting === 'match' ? (main === 'diagonal' ? 'diagonal' : null) : setting.startsWith('diagonal') ? 'diagonal' : setting;
    if (want) assert.equal(g.landing.decking.direction, want);
    const c = coverage(m, g);
    assert.equal(c.twice, 0, `${main}/${setting}: no overlapping boards`);
    assert.ok(c.noneShare < 2.2 * GAP / PITCH + 0.01, `${main}/${setting}: no missing boards (uncovered ${(c.noneShare * 100).toFixed(1)}%)`);
  }
});

test('CP3-1b diagonal left and right are mirror images, 45 degrees to the stair', () => {
  const g = (dl) => { const m = build(deck({ staircases: [landing({ deckLine: dl })] })); return [m, m.geometry.stairs[0]]; };
  const [ml, gl] = g('diagonal-left'), [mr, gr] = g('diagonal-right');
  const dl = expectedDir(ml, gl, 'diagonal-left'), dr = expectedDir(mr, gr, 'diagonal-right');
  assert.ok(Math.abs(dl[0] * dr[0] + dl[1] * dr[1]) < 1e-9, 'perpendicular to each other');
  for (const d of [dl, dr]) assert.ok(Math.abs(Math.abs(d[0] * gl.nn[0] + d[1] * gl.nn[1]) - Math.SQRT1_2) < 1e-9, '45 degrees to the walking direction');
  // Stair on the bottom edge (walking down the screen): diagonal right reads as "/" on the plan.
  assert.ok(dr[0] * dr[1] < 0 && dl[0] * dl[1] > 0);
});

test('CP3-2 landing inherits product, color, picture frame and direction; an override stays independent', () => {
  const base = { decking: 'Brown Oak', border: 'Stone Ash', borderCount: 1, deckLine: 'horizontal' };
  const matchQ = deck({ ...base, staircases: [landing()] }), fixedQ = deck({ ...base, staircases: [landing({ deckLine: 'horizontal' })] });
  for (const [main, decking, border, bc] of [['vertical', 'Brown Oak', 'Stone Ash', 1], ['diagonal', 'Stone Ash', 'Brown Oak', 2], ['horizontal', 'Brown Oak', 'Brown Oak', 0]]) {
    const change = { deckLine: main, decking, border, borderCount: bc };
    const mm = build({ ...matchQ, ...change }), mf = build({ ...fixedQ, ...change });
    for (const m of [mm, mf]) {
      assert.ok(kinds(m, /^landing-board$/).every(p => p.color === core.PALETTES[decking]), 'field boards use the deck color');
      assert.ok(kinds(m, /^landing-frame$/).every(p => p.color === core.PALETTES[border]), 'frame boards use the picture-frame color');
      assert.equal(kinds(m, /^landing-frame$/).length, 4 * bc, 'same number of picture-frame courses');
      assert.equal(m.geometry.stairs[0].landing.decking.collection, m.intent.collection);
    }
    // Match follows the main deck; the explicit horizontal choice does not move.
    const gm = mm.geometry.stairs[0], gf = mf.geometry.stairs[0];
    const dm = expectedDir(mm, gm, 'match'), df = expectedDir(mf, gf, 'horizontal');
    assert.deepEqual(plain(dm), plain(mm.geometry.boardAxis));
    for (const b of kinds(mm, /^landing-board$/)) { const [lo, hi] = along(b.footprint, [-dm[1], dm[0]]); assert.ok(hi - lo <= BW + 1e-6, `match follows main ${main}`); }
    for (const b of kinds(mf, /^landing-board$/)) { const [lo, hi] = along(b.footprint, [-df[1], df[0]]); assert.ok(hi - lo <= BW + 1e-6, `horizontal stays horizontal with main ${main}`); }
  }
});

test('CP3-3 picture frame on different landing sizes: mitered corners, one board wide, field inset by the frame', () => {
  for (const W of [3, 4]) for (const LW of [W, W + 2.5, W + 8]) for (const LD of [3, 5, 8.5, 12]) for (const bc of [1, 2]) {
    const m = build(deck({ height: 8, borderCount: bc, staircases: [stair({ width: W, landing: { width: LW, depth: LD, elevation: 4 } })] }));
    const g = m.geometry.stairs[0], toL = local(g), L = g.landing;
    const frames = kinds(m, /^landing-frame$/).map(p => p.footprint.map(toL));
    assert.equal(frames.length, 4 * bc);
    for (const f of frames) {
      assert.equal(f.length, 4);
      // Every frame corner lies on a 45-degree miter line from a landing corner.
      for (const [x, y] of f) {
        const dx = L.width / 2 - Math.abs(x), dy = Math.min(y, L.depth - y);
        const onEdgeLine = [0, BW, PITCH, PITCH + BW].some(o => Math.abs(dx - o) < 1e-6 || Math.abs(dy - o) < 1e-6);
        assert.ok(onEdgeLine && (Math.abs(dx - dy) < 1e-6 || dx > dy || dy > dx), 'corner on a course line');
        if (Math.abs(dx - dy) > 1e-6) assert.ok([0, BW, PITCH, PITCH + BW].some(o => Math.abs(Math.min(dx, dy) - o) < 1e-6));
      }
      // Each frame board is a trapezoid: two parallel long sides one board width apart.
      const xs = f.map(p => p[0]), ys = f.map(p => p[1]);
      const w = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      assert.ok(Math.abs(w - BW) < 1e-6, `frame board ${BW * 12} in. wide (LW ${LW}, LD ${LD})`);
      const miters = f.filter(([x, y]) => Math.abs((L.width / 2 - Math.abs(x)) - Math.min(y, L.depth - y)) < 1e-6).length;
      assert.equal(miters, 4, 'all four corners of each frame board are mitered at 45 degrees');
    }
    const inset = bc * PITCH, field = kinds(m, /^landing-board$/).flatMap(p => p.footprint.map(toL));
    assert.ok(Math.min(...field.map(p => p[0])) >= -L.width / 2 + inset - 1e-6 && Math.max(...field.map(p => p[0])) <= L.width / 2 - inset + 1e-6);
    assert.ok(Math.min(...field.map(p => p[1])) >= inset - 1e-6 && Math.max(...field.map(p => p[1])) <= L.depth - inset + 1e-6);
    const c = coverage(m, g);
    assert.equal(c.twice, 0); assert.ok(c.noneShare < 2.2 * GAP / PITCH + 0.01, `LW ${LW} LD ${LD} bc ${bc}: covered`);
  }
});

test('CP3-4 landing decking quantities and waste; colors do not change counts; no double counting with the deck', () => {
  for (const dl of DIRS) {
    const q = deck({ staircases: [landing({ width: 7, depth: 6, ...(dl === 'match' ? {} : { deckLine: dl }) })] });
    const m = build(q), D = m.geometry.stairs[0].landing.decking, toDir = expectedDir(m, m.geometry.stairs[0], dl);
    const boards = kinds(m, /^landing-board$/);
    const lf = boards.reduce((a, b) => { const [lo, hi] = along(b.footprint, toDir); return a + hi - lo; }, 0);
    assert.ok(Math.abs(D.fieldLF - lf) < 0.01, 'field LF = the boards as cut (long point)');
    assert.equal(D.fieldCourses, boards.length);
    assert.equal(D.fieldBoards, boards.length, 'landing courses are under 20 ft: one board each');
    const waste = D.direction === 'diagonal' ? 15 : 10;
    assert.equal(D.fieldWastePct, waste); assert.equal(D.frameWastePct, 10);
    assert.equal(D.fieldOrderLF, Math.ceil(D.fieldLF * (1 + waste / 100)));
    assert.equal(D.frameOrderLF, Math.ceil(D.frameLF * 1.1));
    assert.ok(Math.abs(D.frameLF - 2 * (7 + 6)) < 1e-9, 'single frame: one board per side at its long point');
    assert.equal(m.counts.landingFieldBoards, D.fieldBoards); assert.equal(m.counts.landingFrameBoards, 4);
    // Changing colors never changes quantities.
    const recolored = build({ ...q, decking: 'Stone Ash', border: 'Brown Oak' });
    assert.deepEqual(plain(recolored.geometry.stairs[0].landing.decking.fieldLF), plain(D.fieldLF));
    assert.equal(recolored.counts.landingFieldBoards, m.counts.landingFieldBoards);
  }
  // Main deck board counts are the same with or without the landing: landing boards are counted only once.
  const without = build(deck({ staircases: [stair()] })), withL = build(deck({ staircases: [landing()] }));
  for (const k of ['fieldBoards', 'borderBoards', 'dividers']) assert.equal(withL.counts[k], without.counts[k], k);
  assert.equal(without.counts.landingFieldBoards, undefined);
  // Diagonal landing boards get 12 in. joists; square layouts keep 16 in.
  const j = (dl) => kinds(build(deck({ staircases: [landing({ width: 8, deckLine: dl })] })), /^landing-joist$/).length;
  assert.ok(j('diagonal-left') > j('horizontal'));
});

test('CP3-5 both 90-degree turns: lower flight leaves the landing side on the walker\'s left or right', () => {
  for (const turn of ['left', 'right']) {
    const m = build(deck({ staircases: [landing({ turn })] })), g = m.geometry.stairs[0], L = g.landing, toL = local(g);
    assert.equal(g.turn, turn);
    // Edge 2 is the front of the deck; walking down means walking toward +z (down the plan),
    // whose left is +x (east) and right is -x.
    const s = g.turnSign, sideX = s * g.tt[0];
    assert.equal(Math.sign(sideX), turn === 'left' ? 1 : -1);
    const risers = kinds(m, /^stair-riser$/).map(p => ({ p, l: toL([p.x, p.z]) }));
    const lower = risers.filter(r => r.p.y < L.elevation), upper = risers.filter(r => r.p.y > L.elevation);
    assert.equal(upper.length, L.upperRisers); assert.equal(lower.length, L.lowerRisers);
    // Upper flight risers straight above the landing; lower-flight risers out to the side, at the landing's far half.
    for (const r of upper) assert.ok(Math.abs(r.l[0]) < 1e-9 && r.l[1] <= 1e-9);
    for (const r of lower) {
      assert.ok(s * r.l[0] >= L.width / 2 - 1e-9, 'beyond the landing side');
      assert.ok(Math.abs(r.l[1] - (L.depth - g.width / 2)) < 1e-9, 'centered on the far stair-width of the landing');
    }
    const first = Math.min(...lower.map(r => s * r.l[0]));
    assert.ok(Math.abs(first - L.width / 2) < 1e-9, 'lower flight starts exactly at the landing side: no gap, no overlap');
    // Equal risers throughout.
    const ys = risers.map(r => r.p.y).sort((a, b) => b - a);
    for (let i = 0; i < ys.length; i++) assert.ok(Math.abs(ys[i] - (7 - (i + 0.5) * g.rise)) < 1e-9);
    // Lower-flight treads are rotated 90 degrees from the upper flight's.
    const yaws = kinds(m, /^stair-tread$/).map(p => ({ y: p.y, yaw: p.yaw }));
    const up = yaws.find(t => t.y > L.elevation).yaw, lo = yaws.find(t => t.y < L.elevation).yaw;
    assert.ok(Math.abs(Math.abs(Math.cos(up - lo))) < 1e-9, 'perpendicular');
    // Stringers and skirts of the lower flight run along the turn.
    const lowStr = kinds(m, /^stair-stringer$/).filter(p => p.y < L.elevation);
    assert.ok(lowStr.length >= 2 && lowStr.every(p => Math.abs(p.profileNN[0] - s * g.tt[0]) < 1e-9 && Math.abs(p.profileNN[1] - s * g.tt[1]) < 1e-9));
    assert.equal(kinds(m, /^stair-skirt$/).length, 4, 'finished skirts on both sides of both flights');
    assert.ok(m.alerts.some(a => a.level === 'review' && new RegExp(`turns ${turn} at its landing.*NOT verified`).test(a.message)));
  }
  const left = build(deck({ staircases: [landing({ turn: 'left' })] })), right = build(deck({ staircases: [landing({ turn: 'right' })] }));
  assert.equal(left.stats.stairArea, right.stats.stairArea, 'mirror images have the same area');
});

test('CP3-6 different deck heights, stair widths and landing sizes keep the turning stair consistent', () => {
  let cases = 0;
  for (const H of [3, 4.5, 7, 10, 13]) for (const W of [3, 4, 6]) for (const [dLW, LD] of [[0, W], [2, Math.max(W, 5)], [5, 9]]) for (const turn of ['left', 'right', 'straight']) {
    const q = core.sanitize(deck({ width: 28, depth: 16, height: H, staircases: [stair({ width: W, landing: { width: W + dLW, depth: LD, elevation: H / 2, ...(turn === 'straight' ? {} : { turn }) } })] }));
    const L0 = q.staircases[0].landing;
    if (H < core.LANDING_MIN_HEIGHT) { assert.equal(L0, undefined); continue; }
    const m = core.make(q), g = m.geometry.stairs[0], L = g.landing; cases++;
    assert.equal(L.width, W + dLW); assert.equal(L.depth, LD);
    assert.equal(kinds(m, /^stair-riser$/).length, g.risers);
    assert.ok(g.rise <= 7.75 / 12 + 1e-9);
    assert.ok(L.upperRisers >= 2 && L.lowerRisers >= 2);
    // The three pieces of the footprint touch but never overlap.
    const fps = core.stairFootprints(core.edges(core.polygon(q)), H, q.staircases[0]);
    assert.equal(fps.length, turn === 'straight' ? 1 : 3);
    for (let i = 0; i < fps.length; i++) for (let j = i + 1; j < fps.length; j++) {
      const inter = geo.clip ? null : null; // area check below
      const [a, b] = [fps[i], fps[j]];
      const overlapArea = (() => { let r = a; for (let k = 0; k < 4; k++) { const p = b[k], n = b[(k + 1) % 4], nrm = [-(n[1] - p[1]), n[0] - p[0]]; r = geo.halfplane(r, nrm, p[0] * nrm[0] + p[1] * nrm[1], geo.area(b) > 0); } return r.length ? Math.abs(geo.area(r)) : 0; })();
      assert.ok(overlapArea < 1e-6, `H${H} W${W} ${turn}: footprint pieces ${i},${j} do not overlap`);
      void inter;
    }
    assert.ok(Math.abs(m.stats.stairArea - (W * (L.upperRisers - 1 + L.lowerRisers - 1) * 11 / 12 + L.width * L.depth)) < 1e-9, 'area: both flights + landing, nothing counted twice');
  }
  assert.ok(cases > 100);
});

test('CP3-6b turning-stair records are kept valid: depth at least the stair width, width at most 12 ft', () => {
  const a = core.sanitize(deck({ staircases: [stair({ width: 6, landing: { width: 6, depth: 3, turn: 'left' } })] })).staircases[0].landing;
  assert.equal(a.depth, 6, 'landing deepened so the turned flight fits');
  const b = core.sanitize(deck({ width: 30, staircases: [stair({ width: 14, landing: { width: 14, depth: 12, turn: 'right' } })] })).staircases[0].landing;
  assert.equal(b.turn, undefined, 'too wide to turn: stays straight');
  assert.equal(core.MAX_TURN_WIDTH, 12);
});

test('CP3-7 collisions: a turned lower flight may not cross another stair or run back over the deck', () => {
  // Stair a, 7 ft from stair b on the same edge, turns toward b one way and away from it the other.
  const es = core.edges(core.polygon(core.sanitize(deck())));
  const pair = (turn) => [landing({ turn, width: 4, depth: 4 }, { id: 'a', offset: -4 }), stair({ id: 'b', offset: 3 })];
  const hit = ['left', 'right'].filter(t => core.stairOverlap(es, 7, ...pair(t)));
  assert.equal(hit.length, 1, 'exactly one turn direction runs into stair b');
  assert.deepEqual(plain(core.sanitize(deck({ staircases: pair(hit[0]) })).staircases.map(s => s.id)), ['a'], 'the colliding stair is not kept');
  const clear = hit[0] === 'left' ? 'right' : 'left';
  assert.equal(core.sanitize(deck({ staircases: pair(clear) })).staircases.length, 2, 'turning the other way clears it');
  // Its straight version (one rectangle, landing 4 ft wide) does not reach stair b either.
  assert.equal(core.stairOverlap(es, 7, landing({ width: 4, depth: 4 }, { id: 'a', offset: -4 }), stair({ id: 'b', offset: 3 })), false);
  // U-shape: a stair on the inside face of the left arm, turning, runs into the deck's base.
  const uq = core.sanitize({ shape: 'U', width: 24, depth: 20, height: 7, houseEdges: [0], staircases: [stair({ edge: 3, width: 3, offset: 2, landing: { width: 3, depth: 3, elevation: 3.5, turn: 'right' } })] });
  const ues = core.edges(core.polygon(uq)), upoly = core.polygon(uq);
  if (uq.staircases.length) {
    const hits = ['left', 'right'].map(t => core.stairHitsDeck(ues, upoly, 7, { ...uq.staircases[0], landing: { ...uq.staircases[0].landing, turn: t } }));
    assert.ok(hits.some(Boolean), 'at least one turn direction runs into the U');
    const m = core.make(uq);
    if (core.stairHitsDeck(ues, upoly, 7, uq.staircases[0])) assert.ok(m.alerts.some(a => a.level === 'warning' && /runs back under the deck outline/.test(a.message)));
  }
  // A stair on an open edge never counts as running into its own deck.
  const q = core.sanitize(deck({ staircases: [landing({ turn: 'left' })] }));
  assert.equal(core.stairHitsDeck(core.edges(core.polygon(q)), core.polygon(q), 7, q.staircases[0]), false);
});

function guardSegments(g) { return (g.landing.guards || []); }
function segDist(p, a, b) { const d = [b[0] - a[0], b[1] - a[1]], l2 = d[0] * d[0] + d[1] * d[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2)); return Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1]); }

test('CP3-8 landing guards: never across a flight opening; rail choices kept; no doubled corner posts', () => {
  for (const turn of ['straight', 'left', 'right']) for (const [LW, LD] of [[4, 4], [6, 5], [9, 7]]) for (const rails of [{ left: true, right: true }, { left: false, right: false }, { left: true, right: false }]) for (const elev of [3.5, 2]) {
    const m = build(deck({ height: 7, staircases: [stair({ rails, landing: { width: LW, depth: LD, elevation: elev, ...(turn === 'straight' ? {} : { turn }) } })] }));
    const g = m.geometry.stairs[0], L = g.landing;
    // Openings: no guard runs across the middle of either one.
    for (const o of L.openings) for (let k = 1; k < 10; k++) {
      const p = [o.a[0] + (o.b[0] - o.a[0]) * k / 10, o.a[1] + (o.b[1] - o.a[1]) * k / 10];
      for (const s of guardSegments(g)) assert.ok(segDist(p, s.a, s.b) > 0.2, `${turn} ${LW}x${LD}: guard across the ${o.flight} flight opening`);
    }
    // Guards: required above 30 in.; otherwise only on sides whose rail is on.
    if (L.elevation > 2.5) assert.ok(guardSegments(g).length > 0);
    if (L.elevation <= 2.5 && !rails.left && !rails.right) assert.equal(guardSegments(g).length, 0);
    // Flight rails only on the chosen sides, on both flights.
    const flightRails = m.parts.filter(p => p.kind === 'stair-top-rail' && p.connect === 'stair-guard').length;
    assert.equal(flightRails, 2 * (Number(rails.left) + Number(rails.right)));
    // No two rail posts at the same spot (landing corners included).
    const posts = m.parts.filter(p => /rail-post|railing-post/.test(p.kind)).map(p => [p.x, p.z]);
    for (let i = 0; i < posts.length; i++) for (let j = i + 1; j < posts.length; j++) assert.ok(Math.hypot(posts[i][0] - posts[j][0], posts[i][1] - posts[j][1]) >= 0.3 - 1e-9, `${turn} ${LW}x${LD}: duplicate post`);
    assert.ok(Math.abs(L.guardLF - guardSegments(g).reduce((a, s) => a + Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), 0)) < 1e-9);
  }
  // On a turn, the outer guard runs around the landing; the inside of the turn keeps only its short faces.
  const m = build(deck({ staircases: [landing({ turn: 'left', width: 6, depth: 6 }, { rails: { left: true, right: false } })] }));
  const g = m.geometry.stairs[0], s = g.turnSign, segs = guardSegments(g);
  assert.ok(segs.some(x => Math.abs(x.a[1] - x.b[1]) < 1e-9 && Math.abs(x.a[1] - (g.landing.v1 - RAIL_LINE)) < 1e-9), 'far edge guarded'); // R1 rail inset: 1½ in. + half a post
  assert.ok(segs.some(x => Math.abs(x.a[0] - x.b[0]) < 1e-9 && Math.sign(x.a[0]) === -s), 'outer side guarded');
});

test('CP3-9 several independent stairs: two turning stairs and a plain stair together', () => {
  const q = core.sanitize(deck({ width: 24, depth: 16, staircases: [
    landing({ turn: 'left', width: 5, depth: 4 }, { id: 'a', edge: 2, offset: -6 }),
    landing({ turn: 'right', width: 5, depth: 4, deckLine: 'vertical' }, { id: 'b', edge: 2, offset: 6 }),
    stair({ id: 'c', edge: 1 })] }));
  assert.deepEqual(plain(q.staircases.map(s => s.id)), ['a', 'b', 'c']);
  const m = core.make(q);
  assert.equal(m.counts.landings, 2); assert.equal(m.counts.turningStairs, 2);
  assert.equal(m.geometry.stairs.length, 3);
  const [ga, gb] = m.geometry.stairs;
  assert.equal(ga.landing.decking.setting, 'match'); assert.equal(gb.landing.decking.setting, 'vertical');
  assert.equal(m.counts.landingFieldBoards, ga.landing.decking.fieldBoards + gb.landing.decking.fieldBoards);
  assert.equal(m.stats.landings.length, 2);
  assert.ok(m.stats.landings.every(l => l.structuralApproval === false));
});

test('CP3-10 save/reopen keeps turn and direction; A3 and older files load as straight with Match main deck', () => {
  const q = core.sanitize(deck({ staircases: [landing({ turn: 'right', deckLine: 'diagonal-left' }), landing({ width: 4, deckLine: 'horizontal' }, { id: 's2', edge: 1 })] }));
  const again = core.sanitize(JSON.parse(JSON.stringify(q)));
  assert.deepEqual(plain(again.staircases), plain(q.staircases));
  assert.equal(q.staircases[0].landing.turn, 'right'); assert.equal(q.staircases[0].landing.deckLine, 'diagonal-left');
  // An A3 landing record (no turn, no deckLine) is kept exactly as it was and reads as the defaults.
  const a3 = { width: 6, depth: 4, elevation: 3.2083 };
  const old = core.sanitize(deck({ height: 7, staircases: [stair({ landing: a3 })] }));
  assert.deepEqual(Object.keys(old.staircases[0].landing).sort(), ['depth', 'elevation', 'width']);
  const g = core.make(old).geometry.stairs[0];
  assert.equal(g.turn, 'straight'); assert.equal(g.landing.decking.setting, 'match');
  // Unknown values fall back to the defaults instead of breaking the file.
  const bad = core.sanitize(deck({ staircases: [landing({ turn: 'sideways', deckLine: 'zigzag' })] })).staircases[0].landing;
  assert.equal(bad.turn, undefined); assert.equal(bad.deckLine, undefined);
});

test('CP3-11 landing parts are in the right view layers for finished and framing-only 3D', () => {
  const m = build(deck({ staircases: [landing({ turn: 'left' })] }));
  assert.ok(kinds(m, /^landing-(board|frame|fascia)$/).every(p => p.group === 'stair'), 'decking hidden in framing-only view');
  assert.ok(kinds(m, /^landing-(beam|rim|joist|post)$/).every(p => p.group === 'stair-framing'), 'landing framing shown in framing-only view');
  assert.ok(kinds(m, /^landing-footing$/).every(p => p.group === 'foundation'));
  assert.ok(kinds(m, /^stair-stringer$/).every(p => p.group === 'stair-framing'), 'stringers of both flights in framing-only view');
  assert.ok(kinds(m, /^landing-board$/).every(p => p.footprint && p.footprint.length >= 3));
  // The side the turned flight hangs from is a doubled header, flagged for review.
  assert.ok(kinds(m, /^landing-beam$/).some(p => /turned lower flight/.test(p.label) && /verify/.test(p.label)));
  assert.equal(kinds(m, /^landing-rim$/).length, 1);
});

test('CP3-12 main-deck framing is identical with a straight, left or right landing stair', () => {
  const without = build(deck({ staircases: [stair()] }));
  for (const turn of ['straight', 'left', 'right']) for (const dl of DIRS) {
    const withL = build(deck({ staircases: [landing({ ...(turn === 'straight' ? {} : { turn }), ...(dl === 'match' ? {} : { deckLine: dl }) })] }));
    assert.deepEqual(plain(kinds(withL, MAIN_FRAMING)), plain(kinds(without, MAIN_FRAMING)), `${turn}/${dl}`);
    assert.deepEqual(plain(kinds(withL, /^(field-board|picture-frame|divider-board)$/)), plain(kinds(without, /^(field-board|picture-frame|divider-board)$/)), 'main decking untouched');
  }
});
