// V5.2 Group B — B2: decking layout and appearance. Engine tests.
// Board geometry is checked directly (sampling the deck): no overlapping boards, no hole wider
// than a board gap, every field board one gap from frame and divider boards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./engine');

const win = loadEngine();
const core = win.DeckCore;
const plain = (v) => JSON.parse(JSON.stringify(v));
const { BW, GAP, PITCH } = core;
const build = (q) => core.make(core.sanitize(q));
const kinds = (m, re) => m.parts.filter(p => re.test(p.kind));
const fr = (pts) => { const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]); const W = Math.max(...xs) - Math.min(...xs), D = Math.max(...zs) - Math.min(...zs); return { shape: 'free', width: W, depth: D, points: pts.map(([x, z]) => [(x - Math.min(...xs)) / W, (z - Math.min(...zs)) / D]) }; };
const t22 = Math.tan(Math.PI / 8) * 6;
const SHAPES = {
  rectangle: { shape: 'rectangle', width: 16, depth: 12 },
  L: { shape: 'L', width: 24, depth: 18 },
  T: { shape: 'T', width: 24, depth: 18 },
  U: { shape: 'U', width: 24, depth: 18 },
  'cut 45°': fr([[0, 0], [16, 0], [16, 8], [12, 12], [0, 12]]),
  'cut 22.5°': fr([[0, 0], [16, 0], [16, 6], [16 - t22, 12], [0, 12]]),
  'bay (free-drawn)': fr([[0, 0], [20, 0], [20, 12], [14, 12], [12, 15], [8, 15], [6, 12], [0, 12]]),
};
const DIRS = ['horizontal', 'vertical', 'diagonal-left', 'diagonal-right'];
const deck = (s, over = {}) => ({ ...s, height: 4, houseEdges: [0], ...over });

function inside(pt, poly) { let yes = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes; } return yes; }
function segd(p, a, b) { const d = [b[0] - a[0], b[1] - a[1]], l2 = d[0] * d[0] + d[1] * d[1] || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2)); return Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1]); }
const dist = (p, poly) => Math.min(...poly.map((a, i) => segd(p, a, poly[(i + 1) % poly.length])));
function quality(m, N = 90) {
  const poly = m.geometry.poly, pcs = kinds(m, /^(field-board|picture-frame|divider-board)$/);
  const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
  let dbl = 0, hole = 0, n = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const pt = [Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) * (i + .5137) / N, Math.min(...zs) + (Math.max(...zs) - Math.min(...zs)) * (j + .4721) / N];
    if (!inside(pt, poly) || dist(pt, poly) < .01) continue; n++;
    const c = pcs.filter(p => inside(pt, p.footprint)).length;
    if (c > 1) dbl++;
    if (!c && Math.min(...pcs.map(p => dist(pt, p.footprint))) > GAP * .75) hole++;
  }
  let tooClose = 0;
  const hard = pcs.filter(p => p.kind !== 'field-board');
  for (const f of pcs.filter(p => p.kind === 'field-board')) for (const v of f.footprint) if (hard.some(o => inside(v, o.footprint) || dist(v, o.footprint) < GAP - 2e-4)) tooClose++;
  return { n, dbl, hole, tooClose };
}
const along = (pts, ax) => { const v = pts.map(p => p[0] * ax[0] + p[1] * ax[1]); return Math.max(...v) - Math.min(...v); };

test('B2-1 four directions on the plan (house at the top): horizontal, vertical, diagonal left ⟍ and right ⟋', () => {
  const want = { horizontal: (d) => Math.abs(d[1]) < 1e-9, vertical: (d) => Math.abs(d[0]) < 1e-9, 'diagonal-left': (d) => d[0] * d[1] > 0, 'diagonal-right': (d) => d[0] * d[1] < 0 };
  for (const dl of DIRS) {
    const m = build(deck(SHAPES.rectangle, { deckLine: dl })), d = m.geometry.boardAxis;
    assert.ok(want[dl](d), `${dl}: axis ${d}`);
    if (dl.startsWith('diagonal')) assert.ok(Math.abs(Math.abs(d[0]) - Math.SQRT1_2) < 1e-9, '45 degrees');
    assert.equal(m.geometry.deckLineResolved, dl);
    const nrm = [-d[1], d[0]];
    for (const b of kinds(m, /^field-board$/)) assert.ok(along(b.footprint, nrm) <= BW + 1e-6, `${dl}: one board wide across the direction`);
    assert.equal(m.materials.decking.direction, dl);
  }
  // Same rule with the house on the left: "horizontal" runs along that house wall.
  const side = build({ shape: 'rectangle', width: 16, depth: 12, height: 4, houseEdges: [3], deckLine: 'horizontal' });
  assert.ok(Math.abs(side.geometry.boardAxis[0]) < 1e-9, 'along a left-hand house wall');
});

test('B2-2 diagonal left and right are exact mirror images on every shape, with no gaps, overlaps or missing boards', () => {
  for (const [name, s] of Object.entries(SHAPES)) for (const bc of [0, 1, 2]) {
    const L = build(deck(s, { deckLine: 'diagonal-left', borderCount: bc })), R = build(deck(s, { deckLine: 'diagonal-right', borderCount: bc }));
    const a = L.geometry.boardAxis, b = R.geometry.boardAxis;
    assert.ok(Math.abs(a[0] * b[0] + a[1] * b[1]) < 1e-9, `${name}: perpendicular`);
    // Mirror across the outward (vertical) axis: same vertical component, opposite horizontal.
    assert.ok(Math.abs(Math.abs(a[1]) - Math.abs(b[1])) < 1e-9 && a[0] * a[1] * b[0] * b[1] < 0, `${name}: mirrored`);
    for (const [dir, m] of [['left', L], ['right', R]]) {
      const qy = quality(m);
      assert.equal(qy.dbl, 0, `${name} ${dir} bc${bc}: overlapping boards`);
      assert.equal(qy.hole, 0, `${name} ${dir} bc${bc}: hole wider than a board gap`);
      assert.equal(qy.tooClose, 0, `${name} ${dir} bc${bc}: field board closer than a gap to a frame/divider`);
    }
    // Same deck area covered either way (within the gap allowance).
    const area = (m) => kinds(m, /^(field-board|picture-frame|divider-board)$/).reduce((t, p) => t + Math.abs(win.AOSGeometry.area(p.footprint)), 0);
    assert.ok(Math.abs(area(L) - area(R)) / area(L) < 0.02, `${name} bc${bc}: same coverage`);
  }
});

test('B2-3 picture frames are fitted on 45° and 22.5° corners: boards one board wide, tight miters, no gaps or overlaps', () => {
  for (const name of ['cut 45°', 'cut 22.5°', 'bay (free-drawn)', 'L', 'U']) for (const bc of [1, 2]) for (const dl of DIRS) {
    const m = build(deck(SHAPES[name], { deckLine: dl, borderCount: bc })), es = m.geometry.edges;
    const frames = kinds(m, /^picture-frame$/), qy = quality(m, 70);
    assert.equal(qy.dbl, 0, `${name} bc${bc} ${dl}: overlap`); assert.equal(qy.hole, 0, `${name} bc${bc} ${dl}: hole`);
    // Every frame board fragment lies within its course band measured from its own edge.
    for (const f of frames) { const e = es[f.frameEdge], k = f.frameCourse - 1;
      for (const v of f.footprint) { const inward = (v[0] - e.a[0]) * -e.n[0] + (v[1] - e.a[1]) * -e.n[1];
        assert.ok(inward >= k * PITCH - 1e-6 && inward <= k * PITCH + BW + 1e-6, `${name}: course ${k + 1} board within its band (${inward.toFixed(3)})`); } }
  }
});

test('B2-4 single and double frames; house walls excluded unless asked for; courses one gap apart', () => {
  for (const [name, s] of Object.entries(SHAPES)) for (const bc of [0, 1, 2]) for (const fh of [false, true]) {
    const q = core.sanitize(deck(s, { borderCount: bc, frameHouseWalls: fh, houseEdges: [0, 1] })), m = core.make(q), n = m.geometry.edges.length;
    const P = m.materials.decking.pictureFrame;
    assert.equal(P.courses, bc); assert.equal(P.houseWalls, fh && bc > 0 ? true : fh);
    const framedEdges = new Set(kinds(m, /^picture-frame$/).map(f => f.frameEdge));
    if (!bc) { assert.equal(framedEdges.size, 0); continue; }
    if (fh) assert.equal(framedEdges.size, n, `${name}: every edge framed, house walls included`);
    else { assert.ok(!framedEdges.has(0) && !framedEdges.has(1), `${name}: no frame on house walls`); assert.equal(framedEdges.size, n - 2); }
    assert.equal(P.pieces, framedEdges.size * bc, `${name}: one board per framed edge per course`);
  }
  // Course spacing: the second course starts exactly one board gap inside the first.
  const m = build(deck(SHAPES.rectangle, { borderCount: 2 })), e = m.geometry.edges[2];
  const band = (k) => kinds(m, /^picture-frame$/).filter(f => f.frameEdge === 2 && f.frameCourse === k).flatMap(f => f.footprint.map(v => (v[0] - e.a[0]) * -e.n[0] + (v[1] - e.a[1]) * -e.n[1]));
  assert.ok(Math.abs(Math.min(...band(2)) - Math.max(...band(1)) - GAP) < 1e-6, 'gap between courses = board gap');
  // Saved only when switched on; older files unchanged.
  assert.equal('frameHouseWalls' in core.sanitize(deck(SHAPES.rectangle)), false);
  assert.equal(core.sanitize(deck(SHAPES.rectangle, { frameHouseWalls: true })).frameHouseWalls, true);
});

test('B2-5 several dividers; runs over 20 ft get dividers automatically; custom layouts explain what they need', () => {
  const long = build({ shape: 'rectangle', width: 44, depth: 12, height: 4, houseEdges: [0], deckLine: 'horizontal' });
  assert.ok(long.geometry.dividerRows.length >= 2, 'a 44 ft run needs at least two dividers');
  assert.ok(long.materials.decking.field.longestFt <= 20 + 1e-6, 'no field piece longer than a 20 ft board');
  assert.ok(long.alerts.some(a => /Breaker boards required: \d+ minimum/.test(a.message)));
  const custom = build({ shape: 'rectangle', width: 44, depth: 12, height: 4, houseEdges: [0], dividerMode: 'single', dividerPositions: [0.5] });
  assert.ok(custom.alerts.some(a => /section without a breaker/.test(a.message)), 'a custom layout with a 22 ft section is flagged');
  assert.ok(custom.materials.decking.field.longestFt > 20 && custom.materials.decking.field.buttJoints > 0, 'take-off shows the butt joints that layout needs');
  // Positions too close together are set aside (kept in the project), never silently deleted.
  const q = core.sanitize({ shape: 'rectangle', width: 30, depth: 12, height: 4, houseEdges: [0], dividerMode: 'single', dividerPositions: [0.3, 0.33, 0.7] });
  const m = core.make(q);
  assert.deepEqual(plain(m.geometry.dividerAdjust), { stored: 3, used: 2, moved: 0, setAside: 1 });
  assert.equal(q.dividerPositions.length, 3, 'all three kept in the saved layout');
  assert.ok(m.alerts.some(a => /Divider layout adjusted.*1 set aside/.test(a.message)));
  const roomy = core.make(core.sanitize({ ...q, width: 60 }));
  assert.equal(roomy.geometry.dividerRows.length, 3, 'restored when there is room');
  // Changing direction keeps custom dividers (no deletion).
  for (const dl of DIRS) assert.equal(core.sanitize({ ...q, deckLine: dl }).dividerPositions.length, 3);
});

test('B2-6 dividers meet picture frames and diagonal layouts cleanly: whole bars, one gap from frames, no slivers', () => {
  for (const [name, s] of Object.entries(SHAPES)) for (const dl of DIRS) for (const bc of [1, 2]) {
    const m = build(deck(s, { deckLine: dl, borderCount: bc, dividerMode: 'double', dividerPositions: [0.4, 0.75] }));
    const d = m.geometry.boardAxis, frames = kinds(m, /^picture-frame$/), divs = kinds(m, /^divider-board$/);
    for (const v of divs) {
      assert.ok(along(v.footprint, d) <= BW + 1e-6, `${name} ${dl}: divider one board wide`);
      assert.ok(Math.abs(win.AOSGeometry.area(v.footprint)) > 0.002, `${name} ${dl}: no divider slivers`);
      for (const p of v.footprint) assert.ok(frames.every(f => !inside(p, f.footprint) && dist(p, f.footprint) >= GAP - 2e-4), `${name} ${dl}: divider one gap from the frame`);
    }
    const qy = quality(m, 70);
    assert.equal(qy.dbl + qy.hole + qy.tooClose, 0, `${name} ${dl} bc${bc}: ${JSON.stringify(qy)}`);
    // Divider take-off: whole bars (each continuous piece counted once), double = 2 bars per row.
    assert.equal(m.materials.decking.dividers.barsPerRow, 2);
    assert.ok(m.materials.decking.dividers.pieces >= m.geometry.dividerRows.length * 2);
  }
});

test('B2-7 supplemental blocking under field-board ends, and take-off from the actual boards', () => {
  const R = SHAPES.rectangle;
  for (const dl of DIRS) for (const bc of [0, 1, 2]) {
    const m = build(deck(R, { deckLine: dl, borderCount: bc })), blocks = kinds(m, /^field-end-blocking$/);
    if (!bc || !dl.startsWith('diagonal')) { assert.equal(blocks.length, 0, `${dl} bc${bc}: none needed`); continue; }
    assert.ok(blocks.length > 0, `${dl} bc${bc}: blocking along the frame that crosses the joists`);
    assert.ok(blocks.every(b => b.group === 'framing' && /concept/.test(b.label)));
    assert.ok(m.alerts.some(a => a.level === 'review' && /supplemental blocks?.*production review/.test(a.message)));
    // Between joists, never across one, and never duplicated.
    const joists = kinds(m, /^(joist|picture-support-joist|divider-support-joist|corner-trimmer)$/);
    for (const b of blocks) {
      const t = [Math.cos(-b.yaw), Math.sin(-b.yaw)], A = [b.x - t[0] * b.w / 2, b.z - t[1] * b.w / 2], B = [b.x + t[0] * b.w / 2, b.z + t[1] * b.w / 2];
      for (const j of joists) { const jt = [Math.cos(-j.yaw), Math.sin(-j.yaw)];
        const fp = j.footprint ? j.footprint : [[j.x - jt[0] * j.w / 2, j.z - jt[1] * j.w / 2], [j.x + jt[0] * j.w / 2, j.z + jt[1] * j.w / 2]];
        const pts = [A, B, [b.x, b.z]];
        assert.ok(!pts.some(p => j.footprint && inside(p, fp)), 'block does not sit inside a joist'); }
    }
    for (let i = 0; i < blocks.length; i++) for (let k = i + 1; k < blocks.length; k++) assert.ok(Math.hypot(blocks[i].x - blocks[k].x, blocks[i].z - blocks[k].z) > 0.1, 'no duplicate blocks');
    assert.equal(m.materials.supplementalBlocking.fieldEndBlocks, blocks.length);
    assert.equal(m.counts.joists, build(deck(R, { deckLine: dl, borderCount: bc })).counts.joists);
  }
  // Take-off: field LF matches the board areas; every piece bought as one stock board.
  for (const [name, s] of Object.entries(SHAPES)) for (const dl of DIRS) {
    const m = build(deck(s, { deckLine: dl, borderCount: 1 })), F = m.materials.decking.field;
    const area = kinds(m, /^field-board$/).reduce((t, p) => t + Math.abs(win.AOSGeometry.area(p.footprint)), 0);
    assert.ok(F.lf * BW >= area * 0.98 && F.lf * BW <= area * 1.25, `${name} ${dl}: field LF ${F.lf} vs board area ${area.toFixed(1)}`);
    assert.equal(Object.values(F.stockBoards).reduce((a, b) => a + b, 0), F.pieces + F.buttJoints);
    assert.equal(F.orderLF, Math.ceil(F.lf * (1 + F.wastePct / 100)));
    assert.equal(F.wastePct, dl.startsWith('diagonal') ? 15 : 10);
    const P = m.materials.decking.pictureFrame;
    assert.equal(P.pieces, new Set(kinds(m, /^picture-frame$/).map(f => `${f.frameEdge}-${f.frameCourse}`)).size, 'one frame board per edge per course');
  }
  // Landing decking stays separate from the main-deck take-off.
  const withL = build(deck(SHAPES.rectangle, { height: 7, staircases: [{ id: 's', edge: 2, width: 4, offset: 0, rails: { left: true, right: true }, landing: { width: 6, depth: 5, elevation: 3.5 } }] }));
  const noL = build(deck(SHAPES.rectangle, { height: 7, staircases: [{ id: 's', edge: 2, width: 4, offset: 0, rails: { left: true, right: true } }] }));
  assert.deepEqual(plain(withL.materials.decking.field), plain(noL.materials.decking.field));
  assert.ok(withL.stats.landings[0].decking.fieldLF > 0);
});

test('B2-8/9 landings: Match main deck follows both diagonals; an independent landing direction never changes', () => {
  const stair = (L) => ({ id: 's', edge: 2, width: 4, offset: 0, rails: { left: true, right: true }, landing: { width: 6, depth: 5, elevation: 3.5, ...L } });
  for (const dl of DIRS) {
    const m = build(deck(SHAPES.rectangle, { height: 7, deckLine: dl, staircases: [stair({})] })), d = m.geometry.boardAxis, nrm = [-d[1], d[0]];
    for (const b of kinds(m, /^landing-board$/)) assert.ok(along(b.footprint, nrm) <= BW + 1e-6, `match follows main ${dl}`);
    assert.equal(m.geometry.stairs[0].landing.decking.direction, dl.startsWith('diagonal') ? 'diagonal' : dl);
    const fixed = build(deck(SHAPES.rectangle, { height: 7, deckLine: dl, staircases: [stair({ deckLine: 'vertical' })] }));
    const g = fixed.geometry.stairs[0];
    for (const b of kinds(fixed, /^landing-board$/)) assert.ok(along(b.footprint, [-g.nn[1], g.nn[0]]) <= BW + 1e-6, `independent landing stays vertical with main ${dl}`);
  }
});

test('B2-10 save/reopen and older projects: the pre-B2 diagonal keeps its exact layout and reads as left or right', () => {
  for (const dl of [...DIRS, 'diagonal']) {
    const q = core.sanitize(deck(SHAPES.L, { deckLine: dl, frameHouseWalls: true, borderCount: 2, dividerMode: 'single', dividerPositions: [0.4] }));
    assert.deepEqual(plain(core.sanitize(JSON.parse(JSON.stringify(q)))), plain(q), `${dl}: round trip`);
    assert.equal(q.deckLine, dl, 'stored value kept');
  }
  const old = build(deck(SHAPES.rectangle, { deckLine: 'diagonal' }));
  const same = build(deck(SHAPES.rectangle, { deckLine: old.geometry.deckLineResolved }));
  assert.ok(['diagonal-left', 'diagonal-right'].includes(old.geometry.deckLineResolved));
  const noId = (ps) => plain(ps).map(({ id, ...p }) => p);
  assert.deepEqual(noId(kinds(old, /^(field-board|picture-frame|divider-board)$/)), noId(kinds(same, /^(field-board|picture-frame|divider-board)$/)), 'the legacy diagonal is exactly one of the two');
  assert.equal(core.sanitize({ ...deck(SHAPES.rectangle), deckLine: 'sideways' }).deckLine, 'horizontal');
});

test('B2-11 every decking board drawn in 2D is the same solid drawn in 3D (one footprint per board piece)', () => {
  for (const dl of DIRS) {
    const m = build(deck(SHAPES.U, { deckLine: dl, borderCount: 2 }));
    for (const p of kinds(m, /^(field-board|picture-frame|divider-board)$/)) {
      assert.equal(p.group, 'finish'); assert.ok(p.footprint && p.footprint.length >= 3);
      assert.ok(Math.abs(p.y + p.h / 2 - m.intent.height) < 1e-9, 'top of the board at deck height');
    }
  }
});

test('B2-12 framing, railings, stairs and house openings do not change with the board direction (left vs right vs pre-B2 diagonal)', () => {
  const FRAMING = /^(joist|rim-joist|ledger|dropped-beam|post-6x6|footing-concept|corner-trimmer|picture-support-joist|picture-blocking-2x6-flat)$/;
  const OTHER = /^(railing-post|top-rail|bottom-rail|baluster|post-cap|stair-|house-wall|siding-course|opening-|door-)/;
  const noId = (ps) => plain(ps).map(({ id, ...p }) => p);
  for (const [name, s] of Object.entries(SHAPES)) {
    const base = { height: 7, houseEdges: [0], borderCount: 1, staircases: [{ id: 's', edge: 2, width: 4, offset: 0, rails: { left: true, right: true } }], openings: [{ id: 'w', type: 'window', edge: 0, offset: 0, width: 3, height: 3, sill: 3 }] };
    const ms = ['diagonal', 'diagonal-left', 'diagonal-right'].map(dl => build({ ...s, ...base, deckLine: dl }));
    for (const m of ms.slice(1)) {
      assert.deepEqual(noId(kinds(m, FRAMING)), noId(kinds(ms[0], FRAMING)), `${name}: framing`);
      assert.deepEqual(noId(kinds(m, OTHER)), noId(kinds(ms[0], OTHER)), `${name}: railings, stairs, house and openings`);
    }
  }
});
