// V5.1 Free Draw closing rules (AOSShape.closeOutline).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./engine');

const win = loadEngine();
const close = (pts, mode = 'orthogonal', opt) => JSON.parse(JSON.stringify(win.AOSShape.closeOutline(pts, mode, opt)));
const step = { orthogonal: 90, 45: 45, '22.5': 22.5 };

// Every edge of a closed result must follow the drawing mode and pass the editor's validator.
function assertValid(res, mode) {
  assert.ok(!res.error, res.error);
  const p = res.points;
  const area = win.AOSGeometry.area(p);
  assert.equal(win.AOSShape.verify(area < 0 ? [...p].reverse() : p), null);
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    const off = Math.abs(deg / step[mode] - Math.round(deg / step[mode]));
    assert.ok(off < 0.01, `edge ${i + 1} at ${deg.toFixed(2)}° is not a ${step[mode]}° multiple`);
  }
}

test('90°: three sides close with one added corner into a rectangle', () => {
  const r = close([[0, 0], [16, 0], [16, 12]]);
  assertValid(r, 'orthogonal');
  assert.equal(r.how, 'corner');
  assert.deepEqual(r.points, [[0, 0], [16, 0], [16, 12], [0, 12]]);
});

test('90°: a last corner 6 in off line slides into line instead of adding a jog', () => {
  const r = close([[0, 0], [16, 0], [16, 12], [0.5, 12]]);
  assertValid(r, 'orthogonal');
  assert.equal(r.how, 'slide');
  assert.ok(Math.abs(r.moved - 0.5) < 1e-9);
  assert.deepEqual(r.points, [[0, 0], [16, 0], [16, 12], [0, 12]]);
});

test('a corner placed on the start pin closes instead of adding a corner', () => {
  const r = close([[0, 0], [16, 0], [16, 12], [0, 12], [0.25, 0.5]]);
  assertValid(r, 'orthogonal');
  assert.equal(r.points.length, 4);
});

test('an L drawn with five corners closes into a six-corner L', () => {
  const r = close([[0, 0], [20, 0], [20, 8], [10, 8], [10, 16]]);
  assertValid(r, 'orthogonal');
  assert.deepEqual(r.points, [[0, 0], [20, 0], [20, 8], [10, 8], [10, 16], [0, 16]]);
});

test('starting in the middle of an edge leaves no extra corner on that edge', () => {
  const r = close([[8, 0], [16, 0], [16, 12], [0, 12], [0, 0]]);
  assertValid(r, 'orthogonal');
  assert.equal(r.points.length, 4);
});

test('45°: a chamfered corner closes at allowed angles without a mid-edge corner', () => {
  const r = close([[0, 0], [16, 0], [16, 12], [4, 12], [1.5, 9.5]], '45');
  assertValid(r, '45');
  assert.deepEqual(r.points, [[0, 0], [16, 0], [16, 12], [4, 12], [0, 8]]);
});

test('45°: a diagonal last edge that already lines up closes directly', () => {
  const r = close([[0, 0], [16, 0], [16, 8], [12, 12]], '45');
  assertValid(r, '45');
  assert.equal(r.how, 'direct');
});

test('22.5°: closes with every edge on a 22.5° multiple', () => {
  const r = close([[0, 0], [16, 0], [16, 10], [8, 13.3]], '22.5');
  assertValid(r, '22.5');
});

test('90° mode never produces a diagonal edge', () => {
  for (const pts of [[[0, 0], [12, 0], [12, 9], [3, 11]], [[0, 0], [10, 0], [14, 7], [2, 9]]]) {
    const r = close(pts.map(p => [Math.round(p[0]), Math.round(p[1])]));
    if (!r.error) assertValid(r, 'orthogonal');
  }
});

test('slides are limited to 2 ft; larger misses add a corner instead', () => {
  const r = close([[0, 0], [16, 0], [16, 12], [3, 12]]);
  assertValid(r, 'orthogonal');
  assert.notEqual(r.how, 'slide');
});

test('invalid drawings are refused with a reason, never forced closed', () => {
  assert.match(close([[0, 0], [16, 0]]).error, /three corners/);
  assert.match(close([[0, 0], [10, 0], [10, 10], [5, 10], [5, -5]]).error, /intersect|cross|overlap/);
  assert.match(close([[0, 0], [2, 0], [2, 2]]).error, /4 × 4/);
});

test('closing is deterministic', () => {
  const pts = [[0, 0], [20, 0], [20, 8], [10, 8], [10, 16]];
  assert.deepEqual(close(pts), close(pts));
});
