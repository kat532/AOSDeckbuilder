// V5.1 Phase A corrections: excessive beams/posts/footings on angled decks.
// Reproduces the reported failure (owner screenshot, 6 Nov 2026) and locks in the fix.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./engine');

const win = loadEngine();
const core = win.DeckCore;
const plain = (v) => JSON.parse(JSON.stringify(v));
const outline = (pts) => {
  const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  return { shape: 'free', width: x1 - x0, depth: z1 - z0, points: pts.map(([x, z]) => [(x - x0) / (x1 - x0), (z - z0) / (z1 - z0)]) };
};

// Deck, the V5.0/V5.1 Phase A post count (for the record), and the maximum allowed now.
const ANGLED = {
  '18x12 two 45° corners, house wall (reported case)': { q: { ...outline([[0, 0], [18, 0], [18, 9], [15, 12], [3, 12], [0, 9]]), height: 4, houseEdges: [0] }, before: 12, max: 7 },
  '18x12 two 45° corners, freestanding': { q: { ...outline([[0, 0], [18, 0], [18, 9], [15, 12], [3, 12], [0, 9]]), height: 4, houseEdges: [], supportMode: 'freestanding' }, before: 14, max: 10 },
  '20x14 large 45° corners': { q: { ...outline([[0, 0], [20, 0], [20, 8], [14, 14], [6, 14], [0, 8]]), height: 5, houseEdges: [0] }, before: 21, max: 7 },
  '16x16 octagon, freestanding': { q: { ...outline([[4, 0], [12, 0], [16, 4], [16, 12], [12, 16], [4, 16], [0, 12], [0, 4]]), height: 4, houseEdges: [], supportMode: 'freestanding' }, before: 24, max: 14 },
  '16x12 one 45° corner': { q: { ...outline([[0, 0], [16, 0], [16, 8], [12, 12], [0, 12]]), height: 4, houseEdges: [0] }, before: 9, max: 5 },
};
const beamsOf = (m) => m.parts.filter(p => p.kind === 'dropped-beam');
const postsOf = (m) => m.parts.filter(p => p.kind === 'post-6x6');

// Case 4 (owner decision 7 Nov 2026) was kept here as known-failing structural targets with the assertions
// unchanged. V5.3 C7 (owner authorization 11 Nov 2026) corrects the planner; the targets now run as ordinary
// tests, assertions still unchanged. Stronger checks (rim support, outline placement) are in framing-c7.test.js.
for (const [name, { q, before, max }] of Object.entries(ANGLED)) {
  test(`angled deck uses practical supports: ${name}`, () => {
    const m = core.make(q);
    const posts = postsOf(m).length, footings = m.parts.filter(p => p.kind === 'footing-concept').length;
    assert.ok(posts <= max, `${posts} posts (was ${before}, allowed ${max})`);
    assert.equal(footings, posts, 'one footing per post');
    // No beam shorter than 1.5 ft: the old generator made 0.7-1.6 ft beams, one per corner joist.
    for (const b of beamsOf(m)) assert.ok(b.w >= 1.5, `${b.w.toFixed(2)} ft ${b.role} beam`);
    // At most one corner beam per angled edge.
    const angledEdges = plain(core.edges(core.polygon(core.sanitize(q)))).filter(e => Math.abs(e.t[0]) > 0.1 && Math.abs(e.t[0]) < 0.95).length;
    assert.ok(beamsOf(m).filter(b => b.role === 'corner-beam').length <= angledEdges);
    // No two parallel beams under 3 ft apart over the same joists (the old 1.7 ft double beam).
    const main = beamsOf(m).filter(b => b.role !== 'corner-beam');
    for (let i = 0; i < main.length; i++) for (let k = i + 1; k < main.length; k++) {
      const a = main[i], b = main[k];
      if (Math.abs(Math.sin(a.yaw - b.yaw)) > 0.05) continue;
      const nx = -Math.sin(-a.yaw), nz = Math.cos(-a.yaw), gap = Math.abs((b.x - a.x) * nx + (b.z - a.z) * nz);
      const along = Math.abs((b.x - a.x) * Math.cos(-a.yaw) + (b.z - a.z) * Math.sin(-a.yaw));
      if (along < (a.w + b.w) / 2) assert.ok(gap >= 3, `parallel beams ${gap.toFixed(2)} ft apart`);
    }
    // Structural checks are still applied: every joist bears, or a warning says it does not.
    const unresolved = m.stats.unresolvedJoistRuns;
    if (unresolved) assert.ok(m.alerts.some(a => a.level === 'warning' && /joist runs/.test(a.message)));
    assert.equal(unresolved, 0, 'all joists bear within span and cantilever limits');
    // Never presented as approved.
    assert.ok(m.alerts.some(a => /NOT a code-verified design/.test(a.message)));
  });
}

test('corner beams are labeled and flagged for AOS production review', () => {
  const m = core.make(ANGLED['18x12 two 45° corners, house wall (reported case)'].q);
  const corner = beamsOf(m).filter(b => b.role === 'corner-beam');
  assert.equal(corner.length, 2);
  for (const b of corner) assert.match(b.label, /angled corner beam.*AOS production review/);
  assert.ok(m.alerts.some(a => a.level === 'review' && /2 angled corner beams proposed/.test(a.message)));
  assert.deepEqual(plain(m.stats.beamRoles), { 'shared-beam': 1, 'corner-beam': 2 });
});

test('footings under 3 ft apart are flagged, not silently kept or removed', () => {
  const m = core.make(ANGLED['18x12 two 45° corners, house wall (reported case)'].q);
  const pts = postsOf(m).map(p => [p.x, p.z]);
  let close = 0;
  for (let i = 0; i < pts.length; i++) for (let k = i + 1; k < pts.length; k++) if (Math.hypot(pts[i][0] - pts[k][0], pts[i][1] - pts[k][1]) < 3) close++;
  assert.equal(m.stats.closeFootingPairs, close);
  if (close) assert.ok(m.alerts.some(a => /closer than 3 ft/.test(a.message)));
});

test('no two posts stand side by side; where beams meet, one post is shared and flagged', () => {
  const q = { ...ANGLED['18x12 two 45° corners, house wall (reported case)'].q, beamStyle: 'flush' };
  const m = core.make(q), pts = postsOf(m).map(p => [p.x, p.z]);
  for (let i = 0; i < pts.length; i++) for (let k = i + 1; k < pts.length; k++)
    assert.ok(Math.hypot(pts[i][0] - pts[k][0], pts[i][1] - pts[k][1]) >= 0.6, 'posts overlap');
  assert.ok(m.stats.sharedPosts > 0);
  assert.ok(m.alerts.some(a => /carry two beam ends/.test(a.message)));
});

test('rectangles, L, T and U shapes are unchanged by the corner logic (no angled edges)', () => {
  const cases = {
    rect: [{ shape: 'rectangle', width: 16, depth: 12, height: 4, houseEdges: [0] }, 1, 3],
    L: [{ shape: 'L', width: 24, depth: 18, height: 4, houseEdges: [0] }, 2, 5],
    T: [{ shape: 'T', width: 28, depth: 20, height: 4, houseEdges: [0] }, 2, 6],
    U: [{ shape: 'U', width: 32, depth: 22, height: 4, houseEdges: [0] }, 3, 10],
  };
  for (const [name, [q, beams, posts]] of Object.entries(cases)) {
    const m = core.make(q);
    assert.equal(m.counts.beams, beams, name);
    assert.equal(m.counts.posts, posts, name);
    assert.ok(beamsOf(m).every(b => b.role === 'shared-beam'), name);
  }
});

test('a corner that cannot be resolved stays an explicit warning, never approved', () => {
  // Very deep angled deck at 2x8-limited spans: whatever the layout, unresolved joists must be reported.
  for (const { q } of Object.values(ANGLED)) {
    const m = core.make(q);
    const bad = m.stats.unresolvedJoistRuns;
    const warned = m.alerts.some(a => a.level === 'warning' && /joist runs/.test(a.message));
    assert.equal(Boolean(bad), warned);
  }
});
