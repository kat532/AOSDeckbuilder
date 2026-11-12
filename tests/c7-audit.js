// V5.3 C7: independent framing audit shared by tests/framing-c7.test.js and scripts/record-c7-gate-a.js
// (Gate A record of the same checks run against R1). Written separately from the engine's own screen.
'use strict';
const outline = (pts) => {
  const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  return { shape: 'free', width: x1 - x0, depth: z1 - z0, points: pts.map(([x, z]) => [(x - x0) / (x1 - x0), (z - z0) / (z1 - z0)]) };
};
// The cases the authorization requires (Part 2, "Required framing test examples").
const CASES = (FX) => ({
  '18x12 ledger deck, two 45° cut corners': { ...outline([[0, 0], [18, 0], [18, 9], [15, 12], [3, 12], [0, 9]]), height: 4, houseEdges: [0] },
  '16x12 ledger deck, one 45° cut corner': { ...outline([[0, 0], [16, 0], [16, 8], [12, 12], [0, 12]]), height: 4, houseEdges: [0] },
  '18x12 freestanding angled deck': { ...outline([[0, 0], [18, 0], [18, 9], [15, 12], [3, 12], [0, 9]]), height: 4, houseEdges: [], supportMode: 'freestanding' },
  '16x16 octagon': { ...outline([[4, 0], [12, 0], [16, 4], [16, 12], [12, 16], [4, 16], [0, 12], [0, 4]]), height: 4, houseEdges: [], supportMode: 'freestanding' },
  '20x14 large-corner deck': { ...outline([[0, 0], [20, 0], [20, 8], [14, 14], [6, 14], [0, 8]]), height: 5, houseEdges: [0] },
  'free-drawn hexagon': FX['free-hexagon'],
  'bump-out deck': FX['bump-out'],
  'standard rectangle': { shape: 'rectangle', width: 16, depth: 12, height: 4, houseEdges: [0] },
  'L template': { shape: 'L', width: 24, depth: 18, height: 4, houseEdges: [0] },
  'T template': { shape: 'T', width: 28, depth: 20, height: 4, houseEdges: [0] },
  'U template': { shape: 'U', width: 32, depth: 22, height: 4, houseEdges: [0] },
});
// ---- Independent geometry -------------------------------------------------------------------------
const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], d = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
function inside(poly, p) {
  if (poly.some((a, i) => segDist(p, a, poly[(i + 1) % poly.length]) < 0.002)) return true;
  let r = false; for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) { const a = poly[i], b = poly[k]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) r = !r; }
  return r;
}
const footprint = (p) => { const c = Math.cos(-p.yaw), s = Math.sin(-p.yaw), hw = p.w / 2, hd = p.d / 2; return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => [p.x + c * u - s * v, p.z + s * u + c * v]); };
// Dense sampling (0.05 ft) of the four sides plus a check that no outline vertex sits inside the footprint.
function footprintInside(poly, pts) {
  for (let i = 0; i < 4; i++) { const a = pts[i], b = pts[(i + 1) % 4], n = Math.max(1, Math.ceil(Math.hypot(a[0] - b[0], a[1] - b[1]) / 0.05));
    for (let k = 0; k <= n; k++) if (!inside(poly, [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n])) return false; }
  const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]), sg = Math.sign(cross(pts[0], pts[1], pts[2]));
  return !poly.some(v => pts.every((a, i) => sg * cross(a, pts[(i + 1) % 4], v) / Math.hypot(pts[(i + 1) % 4][0] - a[0], pts[(i + 1) % 4][1] - a[1]) > 0.002));
}
// Where a member line rests on a beam: centerline crossing, or >= 1.5 in. of the line over the beam's top.
function bearing(pA, pB, a0, a1, bm) {
  const L = Math.hypot(pB[0] - pA[0], pB[1] - pA[1]) || 1, len = Math.hypot(bm.b[0] - bm.a[0], bm.b[1] - bm.a[1]) || 1;
  const d = [(bm.b[0] - bm.a[0]) / len, (bm.b[1] - bm.a[1]) / len], n = [-d[1], d[0]], c = [(bm.a[0] + bm.b[0]) / 2, (bm.a[1] + bm.b[1]) / 2];
  const D = [pB[0] - pA[0], pB[1] - pA[1]], r = [pA[0] - c[0], pA[1] - c[1]], iv = [0, 1];
  for (const [f0, f1, h] of [[r[0] * d[0] + r[1] * d[1], D[0] * d[0] + D[1] * d[1], len / 2], [r[0] * n[0] + r[1] * n[1], D[0] * n[0] + D[1] * n[1], 4.5 / 24]]) {
    if (Math.abs(f1) < 1e-12) { if (Math.abs(f0) > h) return null; continue; }
    let lo = (-h - f0) / f1, hi = (h - f0) / f1; if (lo > hi) [lo, hi] = [hi, lo]; iv[0] = Math.max(iv[0], lo); iv[1] = Math.min(iv[1], hi);
  }
  const chord = (iv[1] - iv[0]) * L; if (chord <= 0) return null;
  // Centerline crossing inside the beam's length counts in full; otherwise the 1.5 in. minimum bearing applies.
  const t = (() => { const den = D[0] * d[1] - D[1] * d[0]; if (Math.abs(den) < 1e-9) return null; const w = [bm.a[0] - pA[0], bm.a[1] - pA[1]], s = (w[0] * d[1] - w[1] * d[0]) / den, u = (w[0] * D[1] - w[1] * D[0]) / den; return s >= -0.001 && s <= 1.001 && u >= -0.001 && u <= len + 0.001 ? s : null; })();
  if (t === null && chord < 1.5 / 12) return null;
  return a0 + (a1 - a0) * (t !== null ? t : (iv[0] + iv[1]) / 2);
}
// The span/cantilever screen: table span, AOS 2 ft cantilever cap (and table cantilever), 1/4-backspan rule.
function memberFaults(run, beams, lim, style) {
  const sp = [...(run.ledger ? [run.a] : []), ...(run.ledgerEnd ? [run.b] : [])];
  for (const bm of beams) { const u = bearing(run.pA, run.pB, run.a, run.b, bm); if (u !== null) sp.push(u); }
  const s = sp.sort((x, y) => x - y).filter((v, i, a) => !i || v - a[i - 1] > 0.3), spans = s.slice(1).map((v, i) => v - s[i]);
  const back = s.length ? s[0] - run.a : run.b - run.a, front = s.length ? run.b - s.at(-1) : run.b - run.a, f = [];
  if (s.length < 2) f.push('fewer than two bearings');
  if (spans.some(x => x > lim.span + 0.07)) f.push('span');
  if (style === 'flush') { if (back > 4.5 / 24 + 0.06 || front > 4.5 / 24 + 0.06) f.push('flush end bearing'); }
  else {
    if (Math.max(back, front) > Math.min(2, lim.cant) + 0.01) f.push('cantilever');
    if (back > 0.06 && !run.ledger && spans.length && back > spans[0] / 4 + 0.06) f.push('back 1/4');
    if (front > 0.06 && spans.length && front > spans.at(-1) / 4 + 0.06) f.push('front 1/4');
  }
  return f;
}
function audit(win, q) {
  const core = win.DeckCore, FS = win.AOSFramingSolver;
  const m = core.make(core.sanitize(q)), g = m.geometry, poly = g.poly, jD = g.joistAxis, style = m.intent.beamStyle;
  const lim = FS.JOISTS[m.counts.joistSpacingIn][Number(String(m.counts.joistNominal).replace('2x', ''))];
  const beams = g.beams.map(b => ({ a: b.a, b: b.b }));
  const joistFaults = g.joists.map(j => ({ j, f: memberFaults(j, beams, lim, style) })).filter(x => x.f.length);
  const okJoists = g.joists.filter(j => !memberFaults(j, beams, lim, style).length);
  // Load-carrying side rims: non-ledger edges running with the joists. Supported by their own bearings, or
  // fastened along their length to a joist in the adjacent lane (within 3 in.) that is itself supported.
  const ledgerEdge = (e) => m.parts.some(p => p.kind === 'ledger' && p.connect === `ledger-wall-${e.i}`);
  const ledgerAt = (p) => g.edges.filter(ledgerEdge).some(e => Math.abs(e.t[0] * jD[0] + e.t[1] * jD[1]) < 0.28 && segDist(p, e.a, e.b) < 0.22);
  const rims = [];
  for (const e of g.edges) {
    if (ledgerEdge(e) || e.len < 0.72 || Math.abs(e.t[0] * jD[0] + e.t[1] * jD[1]) <= 0.985) continue;
    const A = [e.a[0] - e.n[0] * 0.095, e.a[1] - e.n[1] * 0.095], B = [e.b[0] - e.n[0] * 0.095, e.b[1] - e.n[1] * 0.095];
    const [P, Q, VP, VQ] = (A[0] * jD[0] + A[1] * jD[1]) <= (B[0] * jD[0] + B[1] * jD[1]) ? [A, B, e.a, e.b] : [B, A, e.b, e.a];
    const run = { pA: P, pB: Q, a: P[0] * jD[0] + P[1] * jD[1], b: Q[0] * jD[0] + Q[1] * jD[1], ledger: ledgerAt(VP), ledgerEnd: ledgerAt(VQ) };
    const own = memberFaults(run, beams, lim, style);
    const backed = okJoists.some(j => Math.abs((P[0] - j.pA[0]) * jD[1] - (P[1] - j.pA[1]) * jD[0]) <= 0.25 && j.a <= run.a + 0.3 && j.b >= run.b - 0.3);
    rims.push({ edge: e.i, len: +e.len.toFixed(2), supported: !own.length || backed, faults: own.length && !backed ? own : [] });
  }
  const outsideMembers = m.parts.filter(p => (p.kind === 'dropped-beam' || p.kind === 'post-6x6') && !footprintInside(poly, footprint(p)));
  const outsidePads = m.parts.filter(p => p.kind === 'footing-concept' && !footprintInside(poly, footprint(p))).length;
  const posts = m.parts.filter(p => p.kind === 'post-6x6').map(p => [p.x, p.z]);
  let close = 0; for (let i = 0; i < posts.length; i++) for (let k = i + 1; k < posts.length; k++) if (Math.hypot(posts[i][0] - posts[k][0], posts[i][1] - posts[k][1]) < 3 - 1e-6) close++;
  const qty = (k) => m.parts.filter(p => p.kind === k).length;
  return { m, joistFaults, rims, outsideMembers, outsidePads, close,
    summary: { joist: m.counts.joistNominal, unsupportedJoists: joistFaults.length, unsupportedRims: rims.filter(r => !r.supported).length, outsideBeamsPosts: outsideMembers.length,
      beams: m.parts.filter(p => p.kind === 'dropped-beam').map(p => `${p.role}:${p.w.toFixed(2)}`), posts: posts.length, footings: qty('footing-concept'), closeFootingPairs: close, footingPadsPastOutline: outsidePads,
      joists: m.counts.joists, cornerTrimmers: m.counts.cornerTrimmers, rimBackingJoists: m.counts.rimBackingJoists, rimJoists: m.counts.rimJoists, planner: m.framing ? m.framing.planner : m.stats.framingPlanner } };
}

module.exports = { CASES, audit, footprintInside, footprint, memberFaults, bearing };
