// V5.3 C7 Gate C (owner, 11 Nov 2026): independent stair and railing audit. Written from the model's parts and
// geometry only (not from the engine's own constants or alerts), so the engine is not grading itself.
//
// Requirements checked: the Minnesota Residential Code (Minn. R. ch. 1309, adopting the 2018 IRC with amendments;
// stair width per Minn. R. 1309.0311; R311.7 and R312 values unchanged from the 2018 IRC), and the AWC
// prescriptive deck guide (cut stringers), and the owner's approved AOS defaults. These are SCREENING checks for a
// sales/concept design; the app never presents a stair or guard as code-approved:
//   GUARD_MIN_IN      36    deck / landing guard height above the walking surface (R312.1.2; AOS default 36 in.)
//   STAIR_GUARD_IN    34    stair guard height above the line of the tread nosings (R312.1.2)
//   HANDRAIL_IN    34..38   handrail height above the nosing line (R311.7.8.1), required at 4 or more risers
//   OPEN_IN          4      no opening may pass a 4 in. sphere (R312.1.3), including below the bottom rail
//   STAIR_OPEN_IN   4.375   open side of a stair: 4-3/8 in. sphere (R312.1.3 exception)
//   TRIANGLE_IN      6      triangle formed by riser, tread and bottom rail: 6 in. sphere (R312.1.3 exception)
//   GUARD_DROP_IN   30      guards required where the surface is more than 30 in. above grade (R312.1.1)
//   CUT_STRINGER_FT  6      cut stringers: horizontal span between supports (AWC prescriptive deck guide)
//   STRINGER_OC_IN  18      cut stringers: maximum spacing on centre (AWC prescriptive deck guide)
//   STAIR_CLEAR_IN  36 / 31.5 / 27   clear width above the handrail / at it with one / with two handrails (R311.7.1)
'use strict';
const REQ = { GUARD_MIN_IN: 36, STAIR_GUARD_IN: 34, HANDRAIL_MIN_IN: 34, HANDRAIL_MAX_IN: 38, OPEN_IN: 4, STAIR_OPEN_IN: 4.375, TRIANGLE_IN: 6,
  GUARD_DROP_IN: 30, CUT_STRINGER_FT: 6, STRINGER_OC_IN: 18, STAIR_CLEAR_IN: 36, STAIR_CLEAR_ONE_IN: 31.5, STAIR_CLEAR_TWO_IN: 27 };
const STEP = 11 / 12; // tread run used by the app's stair builder (checked against the parts below)
const VERT = ['railing-post', 'stair-rail-post', 'baluster', 'stair-baluster'];
const dir = (p) => [Math.cos(-(p.yaw || 0)), Math.sin(-(p.yaw || 0))];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const top = (p) => p.y + p.h / 2, bot = (p) => p.y - p.h / 2;

// Flight frames: each flight's base, across (tt), down the run (nn), top elevation, rise, risers.
function flights(m) {
  const out = [];
  for (const g of m.geometry.stairs || []) {
    const list = g.flights && g.flights.length ? g.flights : [{ v0: 0, run: g.run, top: m.intent.height, risers: g.risers }];
    for (const [fi, f] of list.entries()) out.push({ stair: g, fi, base: f.base || [g.base[0] + g.nn[0] * (f.v0 || 0), g.base[1] + g.nn[1] * (f.v0 || 0)], tt: f.tt || g.tt, nn: f.nn || g.nn,
      top: f.top, risers: f.risers, rise: g.rise, run: f.run, width: g.width, bottom: f.top - f.risers * g.rise });
  }
  return out;
}
const local = (F, x, z) => [(x - F.base[0]) * F.tt[0] + (z - F.base[1]) * F.tt[1], (x - F.base[0]) * F.nn[0] + (z - F.base[1]) * F.nn[1]];
const noseY = (F, v) => F.top - (F.rise / STEP) * v;

// ---- Guards: one bay per top rail; members on that bay's line --------------------------------------------
function bays(m) {
  const H = m.intent.height, F = flights(m), out = [];
  const landingAt = (x, z) => { for (const g of m.geometry.stairs || []) { if (!g.landing) continue; const u = (x - g.base[0]) * g.tt[0] + (z - g.base[1]) * g.tt[1], v = (x - g.base[0]) * g.nn[0] + (z - g.base[1]) * g.nn[1];
    if (Math.abs(u) <= g.landing.width / 2 + 0.05 && v >= g.landing.v0 - 0.3 && v <= g.landing.v1 + 0.05) return g.landing.elevation; } return null; };
  for (const tr of m.parts.filter(p => p.kind === 'top-rail' || p.kind === 'stair-top-rail')) {
    const d = dir(tr), sloped = Math.abs(tr.rz || 0) > 1e-6, Lh = tr.w * Math.cos(tr.rz || 0), a = [tr.x - d[0] * Lh / 2, tr.z - d[1] * Lh / 2];
    const on = (p) => { const v = [p.x - a[0], p.z - a[1]], s = dot(v, d), off = Math.abs(v[0] * d[1] - v[1] * d[0]); return off < (/post/.test(p.kind) ? 0.1 : 0.06) && s > -0.35 && s < Lh + 0.35 ? s : null; }; // posts: the known R1 case of a stair a few inches short of a corner shares the corner post about 1 in. off its line
    const members = m.parts.filter(p => VERT.includes(p.kind)).map(p => ({ p, s: on(p) })).filter(x => x.s !== null).sort((x, y) => x.s - y.s);
    const br = m.parts.find(p => (p.kind === 'bottom-rail' || p.kind === 'stair-bottom-rail') && Math.hypot(p.x - tr.x, p.z - tr.z) < 0.02 && Math.abs((p.yaw || 0) - (tr.yaw || 0)) < 1e-6);
    // Clear horizontal openings between neighbouring vertical members within the bay.
    let maxClear = 0; for (let i = 0; i + 1 < members.length; i++) { const A = members[i], B = members[i + 1]; maxClear = Math.max(maxClear, B.s - A.s - (A.p.w + B.p.w) / 2); }
    // A post closes each end: on the bay line, or (R1 rule) a post within the 0.3 ft merge distance that it shares.
    const ends = members.length >= 2 && /post/.test(members[0].p.kind) && /post/.test(members.at(-1).p.kind) && members[0].s < 0.3 && members.at(-1).s > Lh - 0.3;
    const rec = { kind: sloped ? 'stair' : (landingAt(tr.x, tr.z) !== null && tr.connect === 'landing-guard' ? 'landing' : 'deck'), part: tr, members: members.length, closedEnds: ends, maxClearIn: maxClear * 12, len: Lh };
    if (!sloped) { const walk = rec.kind === 'landing' ? landingAt(tr.x, tr.z) : H;
      rec.heightIn = (top(tr) - walk) * 12; rec.bottomGapIn = br ? (bot(br) - walk) * 12 : null; }
    else {
      const Fl = F.map(f => ({ f, l: local(f, tr.x, tr.z) })).find(({ f, l }) => Math.abs(l[0]) <= f.width / 2 + 0.05 && l[1] >= -0.5 && l[1] <= f.run + 0.5);
      if (Fl) { const { f } = Fl, mid = local(f, tr.x, tr.z)[1], slope = f.rise / STEP, cos = Math.cos(Math.atan(slope));
        // Top of the sloped rail, vertically above the nosing line, at the rail's middle (rail height measured plumb).
        rec.flight = f; rec.heightIn = (tr.y + tr.h / (2 * cos) - noseY(f, mid)) * 12;
        if (br) { rec.bottomGapIn = (br.y - br.h / (2 * cos) - noseY(f, local(f, br.x, br.z)[1])) * 12; rec.triangleIn = triangleSphere(f.rise, STEP, rec.bottomGapIn / 12) * 12; } }
    }
    out.push(rec);
  }
  return out;
}
// Largest sphere (diameter, ft) in the opening between a stair's stepped profile and a bottom rail whose
// underside runs parallel to the nosing line, `gap` ft above it (measured plumb). Numerical, one tread period.
function triangleSphere(rise, run, gap) {
  const slope = rise / run, segs = [];
  for (let i = -2; i <= 2; i++) { const x0 = i * run, y0 = -i * rise; segs.push([[x0, y0], [x0, y0 - rise]], [[x0, y0 - rise], [x0 + run, y0 - rise]]); }
  const segD = (p, [a, b]) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  const n = Math.hypot(1, slope), railD = (p) => ((-slope * p[0] + gap) - p[1]) / n; // distance below the rail underside line (y = -slope x + gap)
  let best = 0;
  for (let x = 0; x <= run; x += run / 80) for (let y = -rise * 1.2; y <= gap + 0.01; y += rise / 80) {
    const p = [x, y], r = railD(p); if (r <= 0) continue;
    const stepY = -(Math.floor(x / run + 1e-9) + 1) * rise; if (y <= stepY) continue; // inside the tread
    best = Math.max(best, Math.min(r, ...segs.map(s => segD(p, s))));
  }
  return 2 * best;
}

// ---- Guards required (open sides more than 30 in. above grade) and handrails -----------------------------
function required(m) {
  const H = m.intent.height * 12, q = m.intent, out = { deckEdges: [], stairSides: [], handrailStairs: [] };
  if (H > REQ.GUARD_DROP_IN) for (const e of m.geometry.edges) if (!q.houseEdges.includes(e.i) && !q.railEdges.includes(e.i)) {
    // An edge fully taken by stairs is not an open side.
    const stairLen = q.staircases.filter(s => s.edge === e.i).reduce((t, s) => t + s.width, 0);
    if (e.len - stairLen > 0.5) out.deckEdges.push(e.i);
  }
  for (const s of q.staircases) {
    const g = (m.geometry.stairs || []).find(x => x.id === s.id); if (!g) continue;
    // The top of the stair is H above grade; a side with no guard is open there.
    if (H > REQ.GUARD_DROP_IN) for (const k of ['left', 'right']) if (!s.rails[k]) out.stairSides.push(`${s.id}:${k}`);
    const fl = g.flights && g.flights.length ? g.flights : [{ risers: g.risers }];
    if (fl.some(f => f.risers >= 4)) out.handrailStairs.push(s.id);
  }
  return out;
}

// ---- Stringers: spacing and horizontal span between supports ---------------------------------------------
function stringers(m) {
  const res = [];
  for (const F of flights(m)) {
    const mine = m.parts.filter(p => p.kind === 'stair-stringer' && p.profileBase && Math.hypot(p.profileBase[0] - F.base[0], p.profileBase[1] - F.base[1]) < 1e-6 && Math.abs(dot(p.profileNN, F.nn) - 1) < 1e-6);
    if (!mine.length) { res.push({ F, count: 0 }); continue; }
    const offs = mine.map(p => p.profileOffset).sort((a, b) => a - b), oc = Math.max(...offs.slice(1).map((v, i) => v - offs[i])) * 12;
    const xs = mine[0].profile2d.map(v => v[0]), x0 = Math.min(...xs), x1 = Math.max(...xs);
    // Supports along the run: the top (deck rim or landing) at x0, the bottom (grade or landing) at x1, and any
    // stair support member crossing under the stringers (its top within 0.1 ft of the stringer underside).
    const sup = [x0, x1];
    for (const p of m.parts.filter(p => p.kind === 'stair-stringer-support')) {
      const l = local(F, p.x, p.z); if (l[1] < x0 - 0.05 || l[1] > x1 + 0.05 || Math.abs(l[0]) > F.width / 2 + 1) continue;
      const along = dir(p), across = Math.abs(dot(along, F.tt)); if (across < 0.99) continue; // must run across the stair
      // under every stringer of the flight
      if (offs.some(o => Math.abs(o - l[0]) > p.w / 2)) continue;
      sup.push(l[1]);
    }
    sup.sort((a, b) => a - b);
    const spans = sup.slice(1).map((v, i) => v - sup[i]).filter(s => s > 1e-6);
    res.push({ F, count: mine.length, ocIn: oc, runFt: x1 - x0, maxSpanFt: Math.max(...spans), supports: sup.length - 2 });
  }
  return res;
}

// ---- Stair support load path and the AOS 8 ft rule (owner, 12 Nov 2026) ----------------------------------
// Every stair support beam: runs across the stair under ALL stringers of one flight, its top at the stringers'
// underside at that point (not floating, not cutting into them), inside the flight's run; it stands on at least
// two posts whose tops meet its underside and which stand under it; each post has a footing under it.
// AOS rule: a stair with more than 8 ft of rise has at least one intermediate structural support: a stair
// support beam on some flight, or a landing framed on its own posts (2+) with footings under the landing.
const AOS_RISE_FT = 8;
function undersideAt(profile, x) { // lowest point of the stringer profile polygon on the vertical line at x
  let lo = Infinity; for (let i = 0; i < profile.length; i++) { const a = profile[i], b = profile[(i + 1) % profile.length];
    if ((a[0] - x) * (b[0] - x) > 0 || a[0] === b[0]) continue; const t = (x - a[0]) / (b[0] - a[0]); lo = Math.min(lo, a[1] + t * (b[1] - a[1])); }
  return lo;
}
function supportPaths(m) {
  const out = [], F = flights(m), posts = m.parts.filter(p => p.kind === 'stair-support-post'), feet = m.parts.filter(p => p.kind === 'stair-support-footing');
  for (const b of m.parts.filter(p => p.kind === 'stair-stringer-support')) {
    const faults = [], d = dir(b);
    const fl = F.map(f => ({ f, l: local(f, b.x, b.z) })).find(({ f, l }) => Math.abs(dot(d, f.tt)) > 0.99 && l[1] > 0.05 && l[1] < f.run - 0.05 && Math.abs(l[0]) < 0.5);
    if (!fl) { out.push({ b, faults: ['not across a stair flight, inside its run'] }); continue; }
    const strs = m.parts.filter(p => p.kind === 'stair-stringer' && p.profileBase && Math.hypot(p.profileBase[0] - fl.f.base[0], p.profileBase[1] - fl.f.base[1]) < 1e-6 && Math.abs(dot(p.profileNN, fl.f.nn) - 1) < 1e-6);
    for (const s of strs) { if (Math.abs(s.profileOffset - fl.l[0]) > b.w / 2) faults.push('a stringer is not over the beam');
      const u = undersideAt(s.profile2d, fl.l[1]); if (Math.abs(top(b) - u) > 0.02) faults.push(`beam top ${top(b).toFixed(2)} vs stringer underside ${u.toFixed(2)}`); }
    const under = posts.filter(p => { const v = [p.x - b.x, p.z - b.z]; return Math.abs(v[0] * d[1] - v[1] * d[0]) < 0.02 && Math.abs(dot(v, d)) <= b.w / 2; });
    if (under.length < 2) faults.push(`${under.length} posts under the beam`);
    for (const p of under) { if (Math.abs(top(p) - bot(b)) > 1e-6) faults.push('post top not at the beam underside'); if (bot(p) > 0.2) faults.push('post does not reach its footing');
      if (!feet.some(f => Math.hypot(f.x - p.x, f.z - p.z) < 1e-6)) faults.push('post without a footing'); }
    out.push({ b, flight: fl.f, x: fl.l[1], posts: under.length, faults });
  }
  return out;
}
function aosRule(m) {
  const H = m.intent.height, res = [];
  for (const g of m.geometry.stairs || []) {
    if (H <= AOS_RISE_FT + 1e-9) continue;
    const beams = supportPaths(m).filter(s => s.flight && s.flight.stair.id === g.id && !s.faults.length).length;
    let landingPosts = 0;
    if (g.landing) { const L = g.landing, feet = m.parts.filter(p => p.kind === 'landing-footing');
      landingPosts = m.parts.filter(p => { if (p.kind !== 'landing-post') return false; const u = (p.x - g.base[0]) * g.tt[0] + (p.z - g.base[1]) * g.tt[1], v = (p.x - g.base[0]) * g.nn[0] + (p.z - g.base[1]) * g.nn[1];
        return Math.abs(u) <= L.width / 2 + 0.01 && v >= L.v0 - 0.01 && v <= L.v1 + 0.01 && feet.some(f => Math.hypot(f.x - p.x, f.z - p.z) < 1e-6) && Math.abs(top(p) - (L.elevation - 0)) < 1.5; }).length; }
    res.push({ id: g.id, beams, landingPosts, satisfied: beams > 0 || landingPosts >= 2 });
  }
  return res;
}

module.exports = { REQ, bays, required, stringers, flights, triangleSphere, STEP, supportPaths, aosRule, AOS_RISE_FT };
