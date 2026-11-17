// V5.3 C7 Gate C (owner authorization 11 Nov 2026): stair and railing stabilization. Every fixture, every
// baseline design and a matrix of stairs (heights, 3′/3½′/4′/6′/full widths, landings straight and turning,
// railing sides on and off) are checked with the independent audit in tests/c7c-audit.js. Screening against the
// Minnesota Residential Code (Minn. R. ch. 1309: 2018 IRC as amended) and the AWC prescriptive deck guide (DCA 6);
// nothing here is a code approval.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { loadEngine, ROOT } = require('./engine');
const { fixtures } = require('./fixtures');
const { designs } = require('./baseline/designs');
const { isRail } = require('./rail-inset');
const { GATE_C_RAIL_KINDS, r1RailParts } = require('./c7-gate-c');
const { REQ, bays, required, stringers, supportPaths, aosRule, AOS_RISE_FT } = require('./c7c-audit');

const win = loadEngine(), core = win.DeckCore;
const tmp = path.join(os.tmpdir(), `aos-r1c-${process.pid}.html`);
fs.writeFileSync(tmp, execFileSync('git', ['show', '01f16df:index.html'], { cwd: ROOT }));
const r1 = loadEngine(tmp).DeckCore; fs.unlinkSync(tmp);
const build = (raw, C = core) => JSON.parse(JSON.stringify(C.make(C.sanitize(raw))));
const codes = (m, c) => m.alerts.filter(a => a.code === c);

const R = { shape: 'rectangle', width: 20, depth: 14, houseEdges: [0], railEdges: [1, 2, 3] };
const S = (o) => ({ id: 's', edge: 2, width: 3, offset: 0, rails: { left: true, right: true }, ...o });
function matrix() {
  const out = {};
  for (const h of [1.5, 2.5, 3, 4, 5, 5.5, 6, 7, 8]) for (const W of [3, 3.5, 4, 6]) out[`H${h} W${W}`] = { ...R, height: h, staircases: [S({ width: W })] };
  for (const h of [4, 7]) out[`H${h} full width`] = { ...R, height: h, staircases: [S({ width: 20, fullWidth: true })] };
  for (const [h, turn] of [[6, 'straight'], [8, 'straight'], [9, 'left'], [10, 'right']]) for (const W of [3, 4])
    out[`H${h} W${W} landing ${turn}`] = { ...R, height: h, staircases: [S({ width: W, landing: { elevation: h / 2, width: W + 1, depth: 4, turn } })] };
  for (const rails of [{ left: false, right: true }, { left: true, right: false }, { left: false, right: false }]) out[`H5 rails ${JSON.stringify(rails)}`] = { ...R, height: 5, staircases: [S({ rails })] };
  // Owner support testing (12 Nov 2026): 7′, 8′, 8′1″ and 10′, straight and with straight / left / right landings,
  // and a low landing with no room for posts.
  for (const [hn, h] of [['4', 4], ['5', 5], ['6', 6], ['7', 7], ['8', 8], ['8-1', 8 + 1 / 12], ['10', 10]]) {
    out[`support ${hn} straight`] = { ...R, height: h, staircases: [S({})] };
    for (const turn of ['straight', 'left', 'right']) out[`support ${hn} landing ${turn}`] = { ...R, height: h, staircases: [S({ width: 4, landing: { elevation: h / 2, width: 5, depth: 4, turn } })] };
    out[`support ${hn} low landing`] = { ...R, height: h, staircases: [S({ landing: { elevation: 1.2, width: 4, depth: 4 } })] };
  }
  out['H5 edge 3 unrailed'] = { ...R, height: 5, railEdges: [1, 3], staircases: [S({})] };
  out['H2 edge 3 unrailed (under 30 in.)'] = { ...R, height: 2, railEdges: [1, 3], staircases: [S({})] };
  return out;
}
const ALL = () => { const o = {}; for (const [n, r] of Object.entries(fixtures(win))) o['fixture ' + n] = r; for (const [n, r] of Object.entries(designs(win))) o['design ' + n] = r; for (const [n, r] of Object.entries(matrix())) o['matrix ' + n] = r; return o; };

function audit(name, m) {
  for (const b of bays(m)) {
    const at = `${name}: ${b.kind} guard at (${b.part.x.toFixed(2)}, ${b.part.z.toFixed(2)})`;
    assert.ok(b.closedEnds, `${at}: a post at each end of the bay`);
    if (b.kind === 'stair') {
      assert.ok(b.flight, `${at}: on a stair flight`);
      assert.ok(b.heightIn >= REQ.STAIR_GUARD_IN - 0.05, `${at}: ${b.heightIn.toFixed(2)} in. above the nosings (min ${REQ.STAIR_GUARD_IN})`);
      assert.ok(b.maxClearIn < REQ.STAIR_OPEN_IN, `${at}: ${b.maxClearIn.toFixed(2)} in. clear opening (4⅜ in. sphere)`);
      assert.ok(b.triangleIn < REQ.TRIANGLE_IN, `${at}: riser/tread/bottom-rail opening passes a ${b.triangleIn.toFixed(2)} in. sphere (max 6)`);
    } else {
      assert.ok(b.heightIn >= REQ.GUARD_MIN_IN, `${at}: ${b.heightIn.toFixed(2)} in. high (min ${REQ.GUARD_MIN_IN})`);
      assert.ok(b.bottomGapIn !== null && b.bottomGapIn < REQ.OPEN_IN, `${at}: ${b.bottomGapIn} in. under the bottom rail (4 in. sphere)`);
      assert.ok(b.maxClearIn < REQ.OPEN_IN, `${at}: ${b.maxClearIn.toFixed(2)} in. clear opening (4 in. sphere)`);
    }
  }
  // Gate C3 (owner's final rule): the span check runs at every height. Above 8 ft of deck-to-grade rise, supports
  // are generated so every span passes. At 8 ft 0 in. or less NOTHING is generated, and every flight whose cut
  // stringers exceed the span limit carries a Structural Review Required warning (never shown as approved).
  const H = m.intent.height, over = H > AOS_RISE_FT + 1e-9, spanWarnings = codes(m, 'stair-stringer-span');
  let failing = 0;
  for (const s of stringers(m)) {
    const at = `${name}: stair ${s.F.stair.id} flight ${s.F.fi}`;
    assert.ok(s.count >= 2, `${at}: stringers`);
    assert.ok(s.ocIn <= REQ.STRINGER_OC_IN, `${at}: stringers ${s.ocIn.toFixed(1)} in. on centre (max 18)`);
    if (over) {
      assert.ok(s.maxSpanFt <= REQ.CUT_STRINGER_FT + 1e-6, `${at}: cut stringers span ${s.maxSpanFt.toFixed(2)} ft between supports (max 6)`);
      if (s.runFt > REQ.CUT_STRINGER_FT) assert.equal(s.supports, Math.ceil(s.runFt / REQ.CUT_STRINGER_FT - 1e-9) - 1, `${at}: evenly spaced supports`);
    } else {
      assert.equal(s.supports, 0, `${at}: no generated support at ${H} ft (8 ft or less)`);
      if (s.maxSpanFt > REQ.CUT_STRINGER_FT + 1e-6) failing++;
    }
  }
  if (!over) assert.ok(!m.parts.some(p => ['stair-stringer-support', 'stair-support-post', 'stair-support-footing'].includes(p.kind)), `${name}: nothing generated at 8 ft or less`);
  assert.equal(spanWarnings.length, failing, `${name}: one Structural Review Required warning per unsupported over-span flight`);
  assert.equal((m.stats.stairSpanReview || []).length, failing, `${name}: flagged flights recorded for the 2D outline`);
  for (const a of spanWarnings) { assert.equal(a.level, 'warning'); assert.match(a.message, /^Structural Review Required/); assert.match(a.message, /NOT structurally approved/); assert.match(a.message, /Additional support, a different stringer design or other verified construction details may be necessary/); }
  // Every stair support beam stands on posts under it, each post on a footing.
  const beams = m.parts.filter(p => p.kind === 'stair-stringer-support'), posts = m.parts.filter(p => p.kind === 'stair-support-post'), feet = m.parts.filter(p => p.kind === 'stair-support-footing');
  for (const b of beams) {
    const d = [Math.cos(-b.yaw), Math.sin(-b.yaw)], under = posts.filter(p => { const v = [p.x - b.x, p.z - b.z]; return Math.abs(v[0] * d[1] - v[1] * d[0]) < 0.02 && Math.abs(v[0] * d[0] + v[1] * d[1]) <= b.w / 2; });
    assert.ok(under.length >= 2, `${name}: stair support beam on at least two posts`);
    for (const p of under) { assert.ok(Math.abs(p.y + p.h / 2 - (b.y - b.h / 2)) < 1e-6, `${name}: post top at the beam underside`); assert.ok(feet.some(f => Math.hypot(f.x - p.x, f.z - p.z) < 1e-6), `${name}: footing under the post`); }
    assert.ok(/AOS production review/.test(b.label));
  }
  // Load path of every stair support (independent check) and the AOS 8 ft rule.
  for (const sp of supportPaths(m)) assert.deepEqual(sp.faults, [], `${name}: stair support beam at (${sp.b.x.toFixed(2)}, ${sp.b.z.toFixed(2)})`);
  const rule = aosRule(m), ruleAlerts = codes(m, 'stair-intermediate-support');
  assert.equal(ruleAlerts.length, rule.length, `${name}: one AOS 8 ft rule note per stair over ${AOS_RISE_FT} ft`);
  for (const r of rule) assert.ok(r.satisfied, `${name}: stair ${r.id} over 8 ft has an intermediate structural support`);
  for (const a of ruleAlerts) assert.equal(a.level, 'review');
  if (m.intent.height <= AOS_RISE_FT + 1e-9) assert.equal(ruleAlerts.length, 0);
  // Required guards and handrails are reported (they are never silently left out).
  const req = required(m), q = m.intent;
  const deckAlert = codes(m, 'guard-required');
  assert.equal(deckAlert.length, req.deckEdges.length ? 1 : 0, `${name}: guard-required alert`);
  if (deckAlert.length) { assert.equal(deckAlert[0].level, 'warning'); for (const i of req.deckEdges) assert.match(deckAlert[0].message, new RegExp(`\\b${i + 1}\\b`)); }
  assert.equal(codes(m, 'stair-guard-required').length, req.stairSides.length, `${name}: one stair-guard-required alert per open stair side`);
  assert.equal(codes(m, 'stair-handrail-required').length, req.handrailStairs.length, `${name}: one handrail alert per stair with 4+ risers`);
  for (const a of [...codes(m, 'stair-guard-required'), ...codes(m, 'stair-handrail-required')]) assert.equal(a.level, 'warning');
  // Finished clearance: reported when the clear width is under 36 in., or under 31½ in. once one handrail projects 4½ in.
  for (const s of q.staircases) {
    const sides = Number(s.rails.left) + Number(s.rails.right), between = s.width * 12 - sides * 4.02;
    const want = between < REQ.STAIR_CLEAR_IN || (sides > 0 && between - 4.5 < REQ.STAIR_CLEAR_ONE_IN);
    assert.equal(codes(m, 'stair-finished-clearance').some(a => new RegExp(`Stair on edge ${s.edge + 1} \\(`).test(a.message)), want, `${name}: finished clearance alert for ${s.width} ft stair (${between.toFixed(1)} in.)`);
  }
  // Post mounting, blocking and connections stay flagged for production review.
  if (m.parts.some(p => p.kind === 'railing-post' || p.kind === 'stair-rail-post')) assert.equal(codes(m, 'rail-post-mounting').length, 1);
  if (beams.length) assert.ok(codes(m, 'stair-stringer-support').length > 0 && codes(m, 'stair-stringer-support').every(a => a.level === 'review'));
}

test('C7 Gate C: guards, stair guards, stringers, required guards and handrails on every fixture, design and stair matrix case', () => {
  let n = 0, stairs = 0;
  for (const [name, raw] of Object.entries(ALL())) { const m = build(raw); if (m.stats.invalidGeometry) continue; audit(name, m); n++; stairs += m.intent.staircases.length; }
  assert.ok(n >= 130 && stairs >= 89, `${n} designs, ${stairs} stairs checked`);
});

test('C7 Gate C: the 1½ in. aluminum railing inset is preserved: posts, post caps and top rails are exactly R1\'s', () => {
  for (const [name, raw] of Object.entries(ALL())) {
    const a = build(raw), b = build(raw, r1); if (a.stats.invalidGeometry) continue;
    assert.deepEqual(r1RailParts(a, isRail), r1RailParts(b, isRail), `${name}: posts, caps and top rails`);
    assert.deepEqual(a.intent, b.intent, `${name}: saved design (intent) unchanged`);
    // Only balusters and bottom rails changed among the railing parts; bottom rails keep their plan position and length.
    const br = (m) => m.parts.filter(p => p.kind === 'bottom-rail' || p.kind === 'stair-bottom-rail').map(p => [p.kind, p.x, p.z, p.w, p.yaw, p.rz || 0].map(v => typeof v === 'number' ? +v.toFixed(9) : v));
    assert.deepEqual(br(a), br(b), `${name}: bottom rails in the same place on plan`);
    assert.ok(a.parts.filter(isRail).every(p => GATE_C_RAIL_KINDS.has(p.kind) || !['baluster', 'stair-baluster'].includes(p.kind)));
  }
});

test('C7 Gate C: 3′ stairs get the finished-clearance warning (new-stair default is 4′ since the C7 Beta Visible Finish build)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // The C7 Beta Visible Finish build (4a43cf2, live beta) changed the new-stair default from 3 ft to 4 ft.
  assert.match(src, /const NEW_STAIR_WIDTH=4;/);
  const m = build({ ...R, height: 4, staircases: [S({})] }), a = codes(m, 'stair-finished-clearance')[0];
  assert.ok(a, 'clearance alert on a new 3′ stair with both railings');
  assert.match(a.message, /about 28 in\. between the railing posts/);
  assert.match(a.message, /36 in\. clear above the handrail.*31½ in\. with one handrail or 27 in\. with two/);
  assert.equal(m.intent.staircases[0].width, 3);
});

test('C7 Gate C: wood railing mounting is kept separate from the top-mounted aluminum inset', () => {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const mounts = Function(`return ${/const RAIL_MOUNTS=(\{.*?\});/.exec(src)[1].replace(/RAIL_FACE_INSET/g, '0.125').replace(/RAIL_POST/g, '0.21')}`)();
  const productMount = Function(`return ${/const RAIL_PRODUCT_MOUNT=(\{.*?\});/.exec(src)[1]}`)();
  assert.deepEqual(Object.keys(mounts), ['aluminum-surface'], 'only the top-mounted aluminum system is modeled');
  assert.equal(mounts['aluminum-surface'].faceInset, 0.125);
  for (const p of core.RAIL_PRODUCTS) assert.equal(productMount[p], 'aluminum-surface', `${p}: mounted as top-mounted aluminum`);
  assert.ok(!core.RAIL_PRODUCTS.some(p => /wood|t-top|standard/i.test(p)), 'no wood railing preset has been added (not authorized yet)');
  assert.ok(!Object.keys(productMount).some(p => /wood/i.test(p)), 'no wood preset inherits the aluminum inset');
});

test('C7 Gate C: railing changes pinned (balusters and bottom rails), recorded from this build for owner review', () => {
  const pin = JSON.parse(fs.readFileSync(path.join(__dirname, 'baseline', 'c7-gate-c-rail.json'), 'utf8')).designs, des = designs(win);
  assert.deepEqual(Object.keys(pin).sort(), Object.keys(des).sort());
  for (const [name, raw] of Object.entries(des)) {
    const m = build(raw), parts = m.parts.filter(p => GATE_C_RAIL_KINDS.has(p.kind)).map(({ id, ...p }) => p);
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex'), pin[name].sha256, `${name}: Gate C railing parts`);
    assert.equal(m.counts.balusters, pin[name].balusters, `${name}: baluster count`);
  }
});

test('C7 Gate C: before/after on the baseline designs (R1 failed the screening checks the repair now passes)', () => {
  const before = { bottomGap: 0, openings: 0, triangle: 0, stringerSpan: 0 }, after = { ...before };
  for (const raw of Object.values(designs(win))) for (const [C, out] of [[r1, before], [core, after]]) {
    const m = build(raw, C);
    for (const b of bays(m)) { if (b.kind !== 'stair' && b.bottomGapIn >= REQ.OPEN_IN) out.bottomGap++; if (b.maxClearIn >= (b.kind === 'stair' ? REQ.STAIR_OPEN_IN : REQ.OPEN_IN)) out.openings++; if (b.triangleIn >= REQ.TRIANGLE_IN) out.triangle++; }
    // An over-span flight counts as a finding unless it is supported, or (Gate C3, deck 8 ft or less) flagged
    // Structural Review Required; it is never left silently unsupported.
    const flagged = new Set((m.stats.stairSpanReview || []).map(r => `${r.stair}|${r.flight}`));
    for (const s of stringers(m)) if (s.maxSpanFt > REQ.CUT_STRINGER_FT + 1e-6 && !flagged.size) out.stringerSpan++;
    if (flagged.size) assert.equal(flagged.size, stringers(m).filter(s => s.maxSpanFt > REQ.CUT_STRINGER_FT + 1e-6).length);
  }
  fs.mkdirSync(path.join(ROOT, 'test-results'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'test-results', 'c7-gate-c-report.json'), JSON.stringify({ r1: before, gateC: after }, null, 2));
  assert.ok(before.bottomGap > 0 && before.openings > 0 && before.triangle > 0 && before.stringerSpan > 0, `R1 findings ${JSON.stringify(before)}`);
  assert.deepEqual(after, { bottomGap: 0, openings: 0, triangle: 0, stringerSpan: 0 });
});

test('C7 Gate C3: owner support rule at 4′, 5′, 6′, 7′, 8′0″, 8′1″ and 10′: straight, turning landings, long runs', () => {
  const cases = { '4′': 4, '5′': 5, '6′': 6, '7′': 7, '8′0″': 8, '8′1″': 8 + 1 / 12, '10′': 10 }, rows = {};
  const variants = { 'straight': (h) => S({}), 'landing straight': (h) => S({ width: 4, landing: { elevation: h / 2, width: 5, depth: 4, turn: 'straight' } }),
    'landing left': (h) => S({ width: 4, landing: { elevation: h / 2, width: 5, depth: 4, turn: 'left' } }), 'landing right': (h) => S({ width: 4, landing: { elevation: h / 2, width: 5, depth: 4, turn: 'right' } }),
    'low landing (long upper run)': (h) => S({ landing: { elevation: 1.2, width: 4, depth: 4 } }), 'wide 6 ft stair': (h) => S({ width: 6 }) };
  for (const [hn, h] of Object.entries(cases)) for (const [vn, mk] of Object.entries(variants)) {
    if (h < 3 && vn.includes('landing')) continue;
    const m = build({ ...R, height: h, staircases: [mk(h)] });
    if (m.stats.invalidGeometry) continue;
    const rule = aosRule(m), a = codes(m, 'stair-intermediate-support'), span = codes(m, 'stair-stringer-span'), st = stringers(m);
    const kinds = (k) => m.parts.filter(p => p.kind === k).length;
    const row = rows[`${hn} ${vn}`] = { beams: kinds('stair-stringer-support'), posts: kinds('stair-support-post'), footings: kinds('stair-support-footing'), landingPosts: kinds('landing-post'),
      runsFt: st.map(s => +s.runFt.toFixed(2)), spanWarnings: span.length };
    // Quantities match the members (what 2D/3D draw; checked in the app by tests/e2e-v53-c7c-stairs.test.js).
    assert.equal(m.counts.stairSupportBeams || 0, row.beams); assert.equal(m.counts.stairSupportPosts || 0, row.posts); assert.equal(m.counts.stairSupportFootings || 0, row.footings);
    for (const sp of supportPaths(m)) assert.deepEqual(sp.faults, [], `${hn} ${vn}: support load path`);
    if (h > AOS_RISE_FT + 1e-9) {
      // 3. supports appear above 8′0″; 4. a landing on its own posts satisfies the height rule.
      assert.equal(rule.length, 1); assert.ok(rule[0].satisfied, `${hn} ${vn}`);
      assert.equal(span.length, 0, `${hn} ${vn}: every span supported, no span warning`);
      for (const s of st) assert.ok(s.maxSpanFt <= REQ.CUT_STRINGER_FT + 1e-6, `${hn} ${vn}: span ${s.maxSpanFt}`);
      if (/landing/.test(vn)) assert.match(a[0].message, /Provided by its landing on \d+ posts and footings/);
      else { assert.ok(row.beams >= 1); assert.match(a[0].message, /Provided by \d+ stringer support beams?/); }
    } else {
      // 1. nothing generated at 8′0″ or below; 2. warnings remain for spans over the limit.
      assert.equal(row.beams + row.posts + row.footings, 0, `${hn} ${vn}: no generated supports`);
      assert.equal(a.length, 0);
      assert.equal(span.length, st.filter(s => s.runFt > REQ.CUT_STRINGER_FT + 1e-6).length, `${hn} ${vn}: Structural Review Required per over-span flight`);
    }
  }
  // Long runs at or below 8 ft are flagged, not supported: 7′ and 8′0″ straight stairs (9.2 / 11 ft runs).
  for (const k of ['7′ straight', '8′0″ straight', '8′0″ low landing (long upper run)']) { assert.equal(rows[k].beams, 0); assert.ok(rows[k].spanWarnings >= 1, k); }
  assert.equal(rows['4′ straight'].spanWarnings, 0, '4′: 5.5 ft run, within 6 ft');
  assert.equal(rows['5′ straight'].spanWarnings, 1, '5′: 6.4 ft run, over 6 ft: flagged, not supported');
  assert.ok(rows['8′1″ straight'].beams >= 1 && rows['10′ straight'].beams >= 2);
  fs.mkdirSync(path.join(ROOT, 'test-results'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'test-results', 'c7-gate-c-support-matrix.json'), JSON.stringify(rows, null, 2));
});
