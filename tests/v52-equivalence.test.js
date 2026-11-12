// Checkpoint guard: the protected V5.2 baseline (SHA-256 80b6afea…) and the working build must
// produce IDENTICAL models — every framing part, its position, size, role and label, plus counts,
// stats and alerts — for every regression deck, the owner's irregular deck and 176 generated
// angled / bump-out decks. Group A must not change framing (owner instruction, 7 Nov 2026).
// (Since B2 the decking finish boards are excluded here and tested on their own; see below.)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadEngine } = require('./engine');
const { fixtures } = require('./fixtures');
const { withoutRailInset } = require('./rail-inset');
const { withoutC7 } = require('./c7-framing');

const BASE = path.join(__dirname, 'baseline', 'AOS_Deck_Studio_V5_2_Continuous_Middle_Beams.html');
const base = loadEngine(BASE), work = loadEngine();
const r = (v) => typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v;
// V5.2 Group B — B2 (owner-requested decking work, 7 Nov 2026) changes ONLY the decking finish:
// field / picture-frame / divider board geometry (gaps, slivers, frame-course spacing) and adds a
// separate supplemental-blocking member under field-board ends. Those are compared by the B2
// decking tests (tests/decking-b2.test.js). EVERYTHING ELSE here — every framing member, its
// position, size, role and label, railings, stairs, house, counts, stats and alerts — must still be
// identical to V5.2. Part ids are a running number, so they shift when finish parts change.
const FINISH = new Set(['field-board', 'picture-frame', 'divider-board', 'field-end-blocking']);
const FRAGMENT_COUNTS = ['dividers', 'borderBoards'], FINISH_STATS = ['partCount', 'fieldBoardFragments'];
const B2_ALERT = /supplemental blocks? \([\d.]+ LF\) added between joists under field-board ends/;
// V5.2 Group B — B3 (owner-requested property & 3D presentation, 8 Nov 2026) changes ONLY visual
// context: the lawn ('earth') is larger with its top at grade, the thin metal 'siding-course' strips
// are replaced by siding drawn on the wall faces, and the house face gets visual-only corner
// boards, foundation band, eave and roof edge (plus optional concrete slabs). Those kinds are
// tested in tests/property-b3.test.js. House-wall pieces stay here and must keep the same position,
// size, color and material; only their descriptive label and the new 'siding' style tag differ.
const B3_CONTEXT = new Set(['earth', 'siding-course', 'house-foundation', 'house-trim', 'house-eave', 'house-roof', 'house-back', 'concrete-surface']);
// V5.2 B3 corrections (owner request, 8 Nov 2026): house walls that share a deck corner are now
// mitered into each other (no gap, no overlap, one roofline). Those JOINED walls are compared by the
// corner tests in tests/property-b3.test.js; every house wall WITHOUT a neighbouring house wall is
// still compared here and must be identical to V5.2.
const joinedWall = (m, p) => { const i = Number(String(p.connect).replace('house-edge-', '')), n = m.geometry.edges.length, H = m.intent.houseEdges;
  return p.kind === 'house-wall' && (H.includes((i + 1) % n) || H.includes((i - 1 + n) % n)); };
// V5.3 R1 rail inset (owner request, 11 Nov 2026) moves every railing post 1½ in. inside the finished
// edges. The railing outputs are compared by tests/rail-inset-r1.test.js and the R1 rail record;
// everything else here must still be identical to V5.2.
// V5.3 C7 framing (owner, 11 Nov 2026): on a design whose framing C7 changes (decided from the current build's
// model, identically for both builds) the framing outputs are excepted; tests/framing-c7.test.js checks them.
const model = (win, q) => {
  const m = withoutC7(withoutRailInset(win.DeckCore.make(q)), work.DeckCore.make(q));
  m.parts = m.parts.filter(p => !B3_CONTEXT.has(p.kind) && !joinedWall(m, p)).map(p => { if (p.kind !== 'house-wall') return p; const { label, siding, ...rest } = p; return rest; });
  const counts = { ...m.counts }, stats = { ...m.stats };
  for (const k of FRAGMENT_COUNTS) delete counts[k];
  for (const k of FINISH_STATS) delete stats[k];
  return JSON.parse(JSON.stringify({
    parts: m.parts.filter(p => !FINISH.has(p.kind)).map(({ id, ...p }) => Object.fromEntries(Object.entries(p).sort().map(([k, v]) => [k, Array.isArray(v) ? JSON.parse(JSON.stringify(v), (_, x) => r(x)) : r(v)]))),
    counts, alerts: m.alerts.filter(a => !B2_ALERT.test(a.message)), stats,
  }));
};
const outline = (pts) => { const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]); const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  return { shape: 'free', width: x1 - x0, depth: z1 - z0, points: pts.map(([x, z]) => [(x - x0) / (x1 - x0), (z - z0) / (z1 - z0)]) }; };
function generated() {
  const out = {};
  for (const [W, D] of [[16, 12], [20, 14], [24, 16], [30, 18]]) for (const c of [0, 3, 5]) for (const bump of ['none', 'box', 'bay', 'side']) for (const style of ['dropped', 'flush']) for (const sup of ['ledger', 'free']) {
    if (c === 0 && bump === 'none') continue;
    const front = [], bw = Math.min(10, W / 2), bd = 4, m0 = W / 2 + bw / 2, m1 = W / 2 - bw / 2;
    if (bump === 'box') front.push([m0, D], [m0, D + bd], [m1, D + bd], [m1, D]);
    if (bump === 'bay') front.push([m0, D], [m0 - bd, D + bd], [m1 + bd, D + bd], [m1, D]);
    const right = bump === 'side' ? [[W, 3], [W + 4, 3], [W + 4, D - 3 - c], [W, D - 3 - c]] : [];
    const pts = [[0, 0], [W, 0], ...right, ...(c ? [[W, D - c], [W - c, D]] : [[W, D]]), ...front, ...(c ? [[c, D], [0, D - c]] : [[0, D]])];
    out[`${W}x${D} c${c} ${bump} ${style} ${sup}`] = { ...outline(pts), height: 5, houseEdges: sup === 'free' ? [] : [0], supportMode: sup === 'free' ? 'freestanding' : 'ledger', beamStyle: style };
  }
  return out;
}

test('protected baseline file is the approved V5.2 (SHA-256 80b6afea…)', () => {
  const h = crypto.createHash('sha256').update(fs.readFileSync(BASE)).digest('hex');
  assert.equal(h, '80b6afea0adfafb40ed86a02cd1f1fead9e29d72bcd8a5c301241c9d39c061c6');
});

test('framing and every other model output are identical to V5.2 on all regression decks', () => {
  const fx = fixtures(work);
  for (const [name, raw] of Object.entries(fx)) assert.deepEqual(model(work, raw), model(base, raw), name);
});

test('identical to V5.2 on the owner irregular deck (continuous middle-beam planner)', () => {
  const owner = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'owner-irregular-deck.json'), 'utf8')).design;
  const a = model(work, owner), b = model(base, owner);
  assert.deepEqual(a, b);
  // V5.3 C7 owner visual testing (11 Nov 2026): C7 reframes this deck (V5.2/R1's 3 beams and 8 posts left
  // 13 joist runs without bearing). Its framing is checked member by member in tests/framing-c7.test.js;
  // everything else above is still identical to V5.2.
  const v52 = base.DeckCore.make(owner);
  assert.equal(v52.counts.beams, 3); assert.equal(v52.counts.posts, 8);
  assert.equal(work.DeckCore.make(owner).framing.changedFromR1, true);
});

test('identical to V5.2 on 176 generated angled, bay, box and side bump-out decks', () => {
  let n = 0;
  for (const [name, q] of Object.entries(generated())) { assert.deepEqual(model(work, q), model(base, q), name); n++; }
  assert.equal(n, 176);
});
