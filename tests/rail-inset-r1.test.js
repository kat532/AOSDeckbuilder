// V5.3 R1 rail inset (owner, 11 Nov 2026): "Move all deck and stair railing posts inward 1½ inches from
// their respective finished outside edges." Geometry checks on every fixture, every baseline design and a
// matrix of stairs, bump-outs and landings. The finished outside edge is the deck outline (what every plan
// dimension measures to); the outside face of each 2.52 in. post is 1½ in. inside it, so post centres sit
// RAIL_LINE = 1½ in. + half a post inside. House-wall ends are not finished outside edges and stay as before.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadEngine, ROOT } = require('./engine');
const { fixtures } = require('./fixtures');
const { designs } = require('./baseline/designs');
const { RAIL_LINE, isRail, withoutRailInset } = require('./rail-inset');

const tmp = path.join(os.tmpdir(), `aos-r1f2-${process.pid}.html`);
fs.writeFileSync(tmp, execFileSync('git', ['show', 'checkpoint/v5.3-c6-owner-r1-final2:index.html'], { cwd: ROOT }));
const prev = loadEngine(tmp); fs.unlinkSync(tmp);
const fresh = () => loadEngine().DeckCore;
const build = (raw, C = fresh()) => JSON.parse(JSON.stringify(C.make(C.sanitize(raw))));
const POST = 0.21, FACE = 1.5 / 12;
const segDist = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz); };
const inside = (p, es) => { let c = false; for (const e of es) { const [x1, z1] = e.a, [x2, z2] = e.b; if ((z1 > p[1]) !== (z2 > p[1]) && p[0] < x1 + (p[1] - z1) * (x2 - x1) / (z2 - z1)) c = !c; } return c; };
const posts = (m) => m.parts.filter(p => p.kind === 'railing-post' || p.kind === 'stair-rail-post');

// Deck posts: each stands RAIL_LINE inside the outline, measured square to the edge it belongs to
// (at a corner, to both edges); never outside; the only posts closer are the house-wall ends.
function checkDeck(name, m) {
  const es = m.geometry.edges, H = m.intent.houseEdges;
  for (const p of m.parts.filter(x => x.kind === 'railing-post')) {
    const pt = [p.x, p.z], near = Math.min(...es.filter(e => !H.includes(e.i)).map(e => segDist(pt, e.a, e.b)));
    assert.ok(inside(pt, es) || Math.min(...es.map(e => segDist(pt, e.a, e.b))) < 1e-6, `${name}: post inside the deck`);
    const atHouse = es.some(e => H.includes(e.i) && segDist(pt, e.a, e.b) < 1e-6);
    if (!atHouse) assert.ok(near >= RAIL_LINE - 1e-6, `${name}: post ${pt.map(v => v.toFixed(2))} is ${near.toFixed(3)} ft from a finished edge (min ${RAIL_LINE.toFixed(3)})`);
    // The post's own edge: the closest finished edge is exactly RAIL_LINE away (inside corners: both edges).
    const own = es.filter(e => !H.includes(e.i)).map(e => segDist(pt, e.a, e.b)).sort((a, b) => a - b)[0];
    if (!atHouse) assert.ok(Math.abs(own - RAIL_LINE) < 1e-6 || Math.abs(own - RAIL_LINE * Math.SQRT2) < 1e-6 || own > RAIL_LINE, `${name}: post on its rail line`);
  }
  // Every deck rail and baluster lies on a rail line: RAIL_LINE inside the edge it runs along.
  for (const p of m.parts.filter(x => ['top-rail', 'bottom-rail'].includes(x.kind))) {
    const e = es.find(e => Math.abs(Math.abs(Math.atan2(e.t[1], e.t[0]) + p.yaw) % Math.PI) < 1e-6 || Math.abs((Math.abs(Math.atan2(e.t[1], e.t[0]) + p.yaw) % Math.PI) - Math.PI) < 1e-6 ? Math.abs((p.x - e.a[0]) * e.n[0] + (p.z - e.a[1]) * e.n[1] + RAIL_LINE) < 1e-6 : false);
    assert.ok(e, `${name}: ${p.kind} at (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) runs on a rail line RAIL_LINE inside an edge`);
  }
}
function checkPosts(name, m) {
  const P = posts(m);
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) assert.ok(Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z) >= 0.3 - 1e-9, `${name}: two posts in one place`);
  for (const p of m.parts.filter(p => isRail(p) && /rail$/.test(p.kind))) assert.ok(Math.max(p.w, p.d) >= 0.25, `${name}: ${p.kind} sliver ${Math.max(p.w, p.d).toFixed(3)} ft`);
}
// Plain stairs: posts and sloped rails RAIL_LINE inside each railed stair side (stair coordinates).
function checkPlainStairs(name, m) {
  for (const g of m.geometry.stairs.filter(g => !g.landing)) {
    const st = m.intent.staircases.find(s => s.id === g.id), uv = (p) => [(p.x - g.base[0]) * g.tt[0] + (p.z - g.base[1]) * g.tt[1], (p.x - g.base[0]) * g.nn[0] + (p.z - g.base[1]) * g.nn[1]];
    const mine = m.parts.filter(p => p.kind.startsWith('stair-') && p.group === 'rail').map(p => ({ p, uv: uv(p) })).filter(({ uv: [u, v] }) => Math.abs(u) <= g.width / 2 + 1e-6 && v > -RAIL_LINE - 1e-6 && v <= g.run + 1e-6);
    for (const { p, uv: [u] } of mine) assert.ok(Math.abs(Math.abs(u) - (g.width / 2 - RAIL_LINE)) < 1e-6, `${name}: ${p.kind} ${Math.abs(u).toFixed(3)} ft from the stair centre, want ${(g.width / 2 - RAIL_LINE).toFixed(3)}`);
    for (const side of ['left', 'right']) { const s = side === 'left' ? -1 : 1, on = mine.filter(x => Math.sign(x.uv[0]) === s && x.p.kind === 'stair-top-rail');
      assert.equal(on.length, st.rails[side] ? 1 : 0, `${name}: ${side} stair rail only when chosen`); }
    // The top of each stair rail meets a post: the deck guard post on the stair railing line, or its own top post.
    for (const side of [-1, 1]) { if (!st.rails[side < 0 ? 'left' : 'right']) continue;
      const u = side * (g.width / 2 - RAIL_LINE), top = posts(m).some(p => { const [pu, pv] = uv(p); return Math.abs(pu - u) < 1e-6 && (Math.abs(pv) < 1e-6 || Math.abs(pv + RAIL_LINE) < 1e-6); });
      if (top) continue;
      // Reported conflict (unchanged from R1 final 2): a stair that stops a few inches short of an outside
      // corner shares the deck corner post (posts closer than 0.3 ft are merged), so its rail meets that post
      // slightly off its own line. Only allowed when that corner post is within the existing 0.3 ft merge distance.
      const corner = m.parts.filter(p => p.kind === 'railing-post').map(p => ({ p, d: Math.hypot(uv(p)[0] - u, uv(p)[1]) })).sort((a, b) => a.d - b.d)[0];
      assert.ok(corner && corner.d < 0.3, `${name}: stair rail top post`); NEAR_CORNER.push(`${name} (${side < 0 ? 'left' : 'right'}): corner post ${((Math.abs(uv(corner.p)[0]) - Math.abs(u)) * 12).toFixed(1)} in. off the stair rail line`); }
  }
}
const NEAR_CORNER = [];
const REVIEW_CLEAR = /about (\d+) in\. is left between the posts/;
function checkAlerts(name, m) {
  const clear = m.alerts.filter(a => a.code === 'stair-rail-clear-width'), mount = m.alerts.filter(a => a.code === 'rail-post-mounting');
  assert.equal(mount.length, posts(m).length ? 1 : 0, `${name}: post-mounting review alert when posts are drawn`);
  const want = m.intent.staircases.filter(s => { const n = Number(s.rails.left) + Number(s.rails.right); return n && s.width * 12 - n * (FACE + POST) * 12 < 36; });
  assert.equal(clear.length, want.length, `${name}: stair clear-width alerts`);
  for (const a of clear) assert.equal(a.level, 'review');
}
const all = () => { const w = loadEngine(), out = {}; for (const [n, r] of Object.entries(fixtures(w))) out['fixture ' + n] = r; for (const [n, r] of Object.entries(designs(w))) out['design ' + n] = r; return out; };

test('R1 rail: RAIL_LINE is 1½ in. to the post face plus half the 2.52 in. post', () => {
  assert.ok(Math.abs(RAIL_LINE - (1.5 + 2.52 / 2) / 12) < 1e-9);
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(src, /const RAIL_FACE_INSET=1\.5\/12,RAIL_POST=\.21,RAIL_LINE=RAIL_FACE_INSET\+RAIL_POST\/2;/);
});

test('R1 rail: every fixture and baseline design — deck posts and rails 1½ in. inside, stair rails inset, no doubled posts or slivers, alerts', () => {
  let n = 0;
  for (const [name, raw] of Object.entries(all())) { const m = build(raw); if (m.stats.invalidGeometry) continue; checkDeck(name, m); checkPosts(name, m); checkPlainStairs(name, m); checkAlerts(name, m); n++; }
  assert.ok(n >= 55, `${n} designs checked`);
  if (NEAR_CORNER.length) console.log('# stair next to a corner shares the corner post:', NEAR_CORNER.join('; '));
  assert.ok(NEAR_CORNER.every(x => /^design b2-vertical-u /.test(x)), 'only the known legacy case');
});

const R = { shape: 'rectangle', width: 16, depth: 12, height: 4, houseEdges: [0], railEdges: [1, 2, 3] };
const BUMP = { shape: 'free', width: 16, depth: 15, height: 4, houseEdges: [0], points: [[0, 0], [16, 0], [16, 12], [10, 12], [10, 15], [6, 15], [6, 12], [0, 12]].map(([x, z]) => [x / 16, z / 15]) };
const S = (o) => ({ id: 's', edge: 2, width: 3, offset: 0, rails: { left: true, right: true }, ...o });

test('R1 rail: 3′ and 4′ stairs — posts 1½ in. inside both stair edges, shared with the deck guard at the top; clear width reported', () => {
  for (const [W, clear] of [[3, 28], [4, 40]]) for (const offset of [0, -(8 - W / 2), 8 - W / 2]) for (const rails of [{ left: true, right: true }, { left: true, right: false }]) {
    const name = `${W}′ stair offset ${offset} rails ${JSON.stringify(rails)}`, m = build({ ...R, staircases: [S({ width: W, offset, rails })] });
    checkDeck(name, m); checkPosts(name, m); checkPlainStairs(name, m); checkAlerts(name, m);
    const g = m.geometry.stairs[0], uv = (p) => [(p.x - g.base[0]) * g.tt[0] + (p.z - g.base[1]) * g.tt[1], (p.x - g.base[0]) * g.nn[0] + (p.z - g.base[1]) * g.nn[1]];
    // Deck guard ends on the stair railing line (shared post), on both sides of the opening.
    for (const s of [-1, 1]) assert.ok(m.parts.some(p => p.kind === 'railing-post' && Math.abs(uv(p)[0] - s * (W / 2 - RAIL_LINE)) < 1e-6 && Math.abs(uv(p)[1] + RAIL_LINE) < 1e-6), `${name}: deck guard post on the stair railing line (side ${s})`);
    const a = m.alerts.find(a => a.code === 'stair-rail-clear-width'), sides = Number(rails.left) + Number(rails.right);
    const inches = Math.round(W * 12 - sides * (FACE + POST) * 12);
    if (inches < 36) { assert.ok(a, `${name}: clear-width alert`); assert.equal(Number(REVIEW_CLEAR.exec(a.message)[1]), inches); } else assert.equal(a, undefined, `${name}: no clear-width alert at ${inches} in.`);
    if (sides === 2) assert.equal(inches, clear);
    // Stair width, position, stringers and treads unchanged from R1 final 2.
    const before = build({ ...R, staircases: [S({ width: W, offset, rails })] }, prev.DeckCore);
    assert.deepEqual(m.intent.staircases, before.intent.staircases, `${name}: stored stair unchanged`);
    assert.deepEqual(withoutRailInset(m).parts, withoutRailInset(before).parts, `${name}: everything but the railing unchanged`);
  }
});

test('R1 rail: exact-width stairs on a 4′ bump-out — rails turn the bump-out corners on the inset lines and meet the stair rails on shared posts', () => {
  for (const [W, offset] of [[4, 0], [3, -0.5], [3, 0.5]]) {
    const name = `${W}′ on bump-out offset ${offset}`, m = build({ ...BUMP, staircases: [S({ edge: 4, width: W, offset })] });
    checkDeck(name, m); checkPosts(name, m); checkPlainStairs(name, m); checkAlerts(name, m);
    const e = m.geometry.edges[4], g = m.geometry.stairs[0];
    assert.equal(m.intent.staircases[0].width, W, `${name}: width kept`);
    // Exact width: the bump-out face carries no deck rail; its side rails end at the corner posts, which carry the stair rails.
    if (W === 4) {
      const onFace = m.parts.filter(p => p.kind === 'top-rail' && Math.abs((p.x - e.a[0]) * e.n[0] + (p.z - e.a[1]) * e.n[1] + RAIL_LINE) < 1e-6 && Math.abs((p.x - e.mid[0]) * e.t[0] + (p.z - e.mid[1]) * e.t[1]) < e.len / 2);
      assert.equal(onFace.length, 0, `${name}: no deck rail across a full-width stair`);
      for (const s of [-1, 1]) { const c = [e.mid[0] + e.t[0] * s * (2 - RAIL_LINE) - e.n[0] * RAIL_LINE, e.mid[1] + e.t[1] * s * (2 - RAIL_LINE) - e.n[1] * RAIL_LINE];
        assert.ok(m.parts.some(p => p.kind === 'railing-post' && Math.hypot(p.x - c[0], p.z - c[1]) < 1e-6), `${name}: bump-out corner post shared with the stair rail (${s})`); }
    }
    assert.ok(g, name);
  }
});

test('R1 rail: corners — outside, inside and 45° corners keep one post on both inset lines', () => {
  const cases = { L: { shape: 'L', width: 24, depth: 18, height: 4, houseEdges: [0] }, U: { shape: 'U', width: 32, depth: 22, height: 4, houseEdges: [0] }, T: { shape: 'T', width: 28, depth: 20, height: 4, houseEdges: [0] },
    freestanding: { ...R, houseEdges: [], railEdges: [0, 1, 2, 3] }, hexagon: { shape: 'free', width: 24, depth: 18, height: 4, houseEdges: [0], points: [[0, 0], [1, 0], [1, 0.6], [0.7, 1], [0.3, 1], [0, 0.6]] } };
  for (const [name, d] of Object.entries(cases)) {
    const m = build({ ...d, staircases: [] }), es = m.geometry.edges, H = m.intent.houseEdges; checkDeck(name, m); checkPosts(name, m);
    for (let i = 0; i < es.length; i++) { const e = es[i], o = es[(i + 1) % es.length];
      if (H.includes(e.i) || H.includes(o.i) || !m.intent.railEdges.includes(e.i) || !m.intent.railEdges.includes(o.i)) continue;
      // Corner post where the two inset lines cross: RAIL_LINE from each edge's line.
      const line = (e, p) => (p[0] - e.a[0]) * e.n[0] + (p[1] - e.a[1]) * e.n[1];
      const c = m.parts.filter(p => p.kind === 'railing-post').find(p => Math.abs(line(e, [p.x, p.z]) + RAIL_LINE) < 1e-6 && Math.abs(line(o, [p.x, p.z]) + RAIL_LINE) < 1e-6);
      assert.ok(c, `${name}: one corner post between edges ${e.i + 1} and ${o.i + 1}`); }
  }
});

test('R1 rail: landing stairs (straight, left, right; narrow and wide) — guards and flight rails 1½ in. inside the landing and stair edges', () => {
  for (const turn of ['straight', 'left', 'right']) for (const [W, LW, LD] of [[3, 3, 4], [4, 6, 5], [4, 9, 7]]) for (const rails of [{ left: true, right: true }, { left: false, right: true }]) {
    if (turn === 'straight' && LW < W) continue;
    const name = `${turn} ${W}′ stair, ${LW}x${LD} landing`, m = build({ shape: 'rectangle', width: 24, depth: 14, height: 7, houseEdges: [0], staircases: [{ id: 'a', edge: 2, width: W, offset: 2, landing: { width: LW, depth: LD, elevation: 3.5, ...(turn === 'straight' ? {} : { turn }) }, rails }] });
    checkDeck(name, m); checkPosts(name, m); checkAlerts(name, m);
    const g = m.geometry.stairs[0], L = g.landing, lp = m.parts.filter(p => p.kind === 'landing-post');
    const xs = lp.map(p => p.x), zs = lp.map(p => p.z);
    // Landing outline from the engine's landing geometry; every guard segment stays RAIL_LINE inside it.
    for (const s of L.guards) for (const pt of [s.a, s.b]) {
      const v = pt[1], u = pt[0];
      assert.ok(Math.abs(u) <= Math.max(L.width ?? LW, W) / 2 - RAIL_LINE + 1e-6 || Math.abs(Math.abs(u) - (W / 2 - RAIL_LINE)) < 1e-6, `${name}: guard ${u.toFixed(3)} inside the landing sides`);
      assert.ok(v >= L.v0 + RAIL_LINE - 1e-6 && v <= L.v1 - RAIL_LINE + 1e-6, `${name}: guard ${v.toFixed(3)} inside the landing ends (${L.v0}..${L.v1})`);
    }
    assert.ok(xs.length >= 4 && zs.length >= 4, name);
    // Flight rails: RAIL_LINE inside each flight's sides.
    assert.equal((L.flightRails || []).length, 2 * (Number(rails.left) + Number(rails.right)), `${name}: flight rails on the chosen sides`);
    for (const fr of L.flightRails) { const fl = g.flights[fr.flight], base = fl.base || [g.base[0] + g.nn[0] * fl.v0, g.base[1] + g.nn[1] * fl.v0], tt = fl.tt || g.tt;
      const u = (pt) => (pt[0] - base[0]) * tt[0] + (pt[1] - base[1]) * tt[1];
      for (const pt of [fr.from, fr.to]) assert.ok(Math.abs(Math.abs(u(pt)) - (W / 2 - RAIL_LINE)) < 1e-6, `${name}: flight ${fr.flight} ${fr.side} rail ${Math.abs(u(pt)).toFixed(3)} from the flight centre, want ${(W / 2 - RAIL_LINE).toFixed(3)}`); }
  }
});
