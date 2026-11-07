// V5.2 B2 owner finding #1: stair landings must have flat-laid 2x6 support under the picture-frame
// decking (the same assembly as the main deck), not only on-edge joists and blocking.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./engine');

const win = loadEngine();
const core = win.DeckCore;
const plain = (v) => JSON.parse(JSON.stringify(v));
const { BW, GAP, PITCH } = core;
const FLAT_W = 5.5 / 12, FLAT_T = 1.5 / 12, JW = 1.5 / 12;
const deck = (over = {}) => ({ shape: 'rectangle', width: 24, depth: 14, height: 7, houseEdges: [0], ...over });
const stair = (L = {}, over = {}) => ({ id: 's1', edge: 2, width: 4, offset: 0, rails: { left: true, right: true }, ...over, landing: { width: 6, depth: 5, elevation: 3.5, ...L } });
const build = (q) => core.make(core.sanitize(q));
const kinds = (m, re) => m.parts.filter(p => re.test(p.kind));
const toLocal = (g) => (x, z) => { const dx = x - g.base[0], dz = z - g.base[1]; return [dx * g.tt[0] + dz * g.tt[1], dx * g.nn[0] + dz * g.nn[1]]; };
function box(g, p) { const t = [Math.cos(-p.yaw), Math.sin(-p.yaw)], n = [-t[1], t[0]], L = toLocal(g);
  const pts = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => L(p.x + t[0] * a * p.w / 2 + n[0] * b * p.d / 2, p.z + t[1] * a * p.w / 2 + n[1] * b * p.d / 2));
  return { u0: Math.min(...pts.map(q => q[0])), u1: Math.max(...pts.map(q => q[0])), v0: Math.min(...pts.map(q => q[1])), v1: Math.max(...pts.map(q => q[1])), y0: p.y - p.h / 2, y1: p.y + p.h / 2 }; }
function* cases() {
  for (const turn of ['straight', 'left', 'right']) for (const dl of ['match', 'horizontal', 'vertical', 'diagonal-left', 'diagonal-right']) for (const bc of [0, 1, 2]) for (const [LW, LD] of [[4, 4], [6, 5], [9, 8]])
    yield { turn, dl, bc, LW, LD, q: deck({ borderCount: bc, staircases: [stair({ width: LW, depth: LD, ...(turn === 'straight' ? {} : { turn }), ...(dl === 'match' ? {} : { deckLine: dl }) })] }) };
}

test('flat 2x6: one per frame course on each side running with the joists, laid flat, top flush, along the joists', () => {
  let n = 0;
  for (const c of cases()) {
    const m = build(c.q), g = m.geometry.stairs[0], L = g.landing, F = L.framing;
    const flats = kinds(m, /^landing-flat-2x6$/), joists = kinds(m, /^landing-joist$/);
    assert.equal(flats.length, 2 * c.bc, `${c.turn}/${c.dl}/bc${c.bc}`);
    if (!c.bc) continue;
    const jYaw = joists[0].yaw, top = L.elevation - 1 / 12, alongU = F.joistAxis === 'across the stair';
    for (const f of flats) {
      assert.ok(Math.abs(f.d - FLAT_W) < 1e-9 && Math.abs(f.h - FLAT_T) < 1e-9, 'a 2x6 laid flat (5½ in. wide, 1½ in. thick)');
      assert.ok(Math.abs(f.y + f.h / 2 - top) < 1e-9, 'top flush with the joist tops, directly under the decking');
      assert.ok(Math.abs(Math.sin(f.yaw - jYaw)) < 1e-9, 'runs the same way as the joists');
      const b = box(g, f);
      assert.ok(b.u0 >= -L.width / 2 - 1e-6 && b.u1 <= L.width / 2 + 1e-6 && b.v0 >= L.v0 - 1e-6 && b.v1 <= L.v1 + 1e-6, 'inside the landing');
      const len = alongU ? b.u1 - b.u0 : b.v1 - b.v0, full = alongU ? L.width - 0.5 : L.depth - 0.5;
      assert.ok(Math.abs(len - full) < 1e-6, 'full length between the headers');
      n++;
    }
  }
  assert.equal(n, 270, 'every flat in 90 landings checked');
});

test('flat 2x6 carries both long edges of each frame board and the field-board ends on its side', () => {
  for (const c of cases()) {
    if (!c.bc) continue;
    const m = build(c.q), g = m.geometry.stairs[0], L = g.landing, alongU = L.framing.joistAxis === 'across the stair';
    // Offsets measured in from each side that runs with the joists (u sides for joists along v; v sides otherwise).
    const off = (b, side) => alongU ? (side < 0 ? [b.v0 - L.v0, b.v1 - L.v0] : [L.v1 - b.v1, L.v1 - b.v0]) : (side < 0 ? [b.u0 + L.width / 2, b.u1 + L.width / 2] : [L.width / 2 - b.u1, L.width / 2 - b.u0]);
    const carriers = kinds(m, /^landing-(beam|rim|flat-2x6)$/).filter(p => !(p.kind === 'landing-beam' && Math.abs(Math.sin(p.yaw - kinds(m, /^landing-joist$/)[0].yaw)) > 0.5));
    for (const side of [-1, 1]) {
      const spans = carriers.map(p => off(box(g, p), side)).filter(([a]) => a < 2);
      const on = (x) => spans.some(([a, b]) => x >= a - 0.02 && x <= b + 0.02);
      for (let k = 1; k <= c.bc; k++) {
        const outer = (k - 1) * PITCH + (k === 1 ? 0.008 : 0), inner = (k - 1) * PITCH + BW;
        assert.ok(on(outer) && on(inner), `${c.turn}/${c.dl}/bc${c.bc} ${c.LW}x${c.LD} side ${side}: course ${k} edges ${outer.toFixed(3)} / ${inner.toFixed(3)} carried`);
      }
      assert.ok(on(c.bc * PITCH), `${c.turn}/${c.dl}/bc${c.bc}: field-board ends on this side carried`);
    }
  }
});

test('no duplicate or overlapping framing: flats sit between the rim/header and their support joist, clear of every other member', () => {
  for (const c of cases()) {
    if (!c.bc) continue;
    const m = build(c.q), g = m.geometry.stairs[0];
    const flats = kinds(m, /^landing-flat-2x6$/).map(p => ({ p, b: box(g, p) }));
    const others = kinds(m, /^landing-(beam|rim|joist|blocking)$/).map(p => ({ p, b: box(g, p) }));
    for (const f of flats) for (const o of others) {
      const ou = Math.min(f.b.u1, o.b.u1) - Math.max(f.b.u0, o.b.u0), ov = Math.min(f.b.v1, o.b.v1) - Math.max(f.b.v0, o.b.v0), oy = Math.min(f.b.y1, o.b.y1) - Math.max(f.b.y0, o.b.y0);
      assert.ok(!(ou > 1e-6 && ov > 1e-6 && oy > 1e-6), `${c.turn}/${c.dl}/bc${c.bc}: flat 2x6 overlaps ${o.p.kind}`);
    }
    for (let i = 0; i < flats.length; i++) for (let j = i + 1; j < flats.length; j++) {
      const a = flats[i].b, b = flats[j].b;
      assert.ok(!(Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0) > 1e-6 && Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0) > 1e-6), 'flats do not overlap each other');
    }
  }
});

test('flat 2x6 updates with landing size, board direction and frame choice; counted in materials', () => {
  const flatsOf = (q) => { const m = build(q); return { m, f: kinds(m, /^landing-flat-2x6$/) }; };
  const a = flatsOf(deck({ borderCount: 1, staircases: [stair({ width: 6, depth: 5 })] }));
  const wide = flatsOf(deck({ borderCount: 1, staircases: [stair({ width: 6, depth: 9 })] }));
  assert.ok(wide.f[0].w > a.f[0].w, 'deeper landing: longer flats (joists run down the stair)');
  const vert = flatsOf(deck({ borderCount: 1, staircases: [stair({ width: 6, depth: 5, deckLine: 'vertical' })] }));
  assert.ok(Math.abs(Math.sin(vert.f[0].yaw - a.f[0].yaw)) > 0.99, 'vertical boards: joists and flats turn across the stair');
  assert.equal(flatsOf(deck({ borderCount: 2, staircases: [stair({})] })).f.length, 4);
  assert.equal(flatsOf(deck({ borderCount: 0, staircases: [stair({})] })).f.length, 0);
  for (const r of [a, wide, vert]) {
    assert.equal(r.m.counts.landingFlat2x6, r.f.length);
    assert.ok(Math.abs(r.m.counts.landingFlat2x6LF - r.f.reduce((s, p) => s + p.w, 0)) < 0.01);
    assert.equal(r.m.geometry.stairs[0].landing.framing.flat2x6, r.f.length);
  }
  assert.ok(a.m.alerts.some(x => /flat-laid 2x6 run\(s\).*production review/.test(x.message)));
  assert.ok(kinds(a.m, /^landing-flat-2x6$/).every(p => p.group === 'stair-framing'), 'shown in framing-only 3D');
});

test('landing structure, stair railings and the main deck are otherwise unchanged by the flats', () => {
  const MAIN = /^(joist|rim-joist|ledger|dropped-beam|post-6x6|footing-concept|corner-trimmer|picture-support-joist|picture-blocking-2x6-flat|divider-support-joist|divider-blocking-2x6-flat)$/;
  const RAIL = /^(stair-rail-post|stair-top-rail|stair-bottom-rail|stair-baluster|railing-post|top-rail|bottom-rail|baluster|post-cap)$/;
  const noId = (ps) => plain(ps).map(({ id, ...p }) => p);
  for (const turn of ['straight', 'left', 'right']) {
    const L = (bc) => build(deck({ borderCount: bc, staircases: [stair({ ...(turn === 'straight' ? {} : { turn }) })] }));
    const without = build(deck({ borderCount: 1, staircases: [{ id: 's1', edge: 2, width: 4, offset: 0, rails: { left: true, right: true } }] }));
    const one = L(1);
    assert.deepEqual(noId(kinds(one, MAIN)), noId(kinds(without, MAIN)), `${turn}: main-deck framing unchanged`);
    assert.deepEqual(noId(kinds(one, RAIL)), noId(kinds(L(0), RAIL)), `${turn}: railings do not depend on the landing framing`);
    for (const k of ['landingPosts', 'landingFootings']) assert.equal(one.counts[k], L(0).counts[k], `${turn}: ${k}`);
    assert.deepEqual(noId(kinds(one, /^landing-beam$/)).length, noId(kinds(L(0), /^landing-beam$/)).length, `${turn}: same headers`);
  }
});
