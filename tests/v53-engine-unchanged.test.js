// V5.3 guard (owner approval of C0/C1, 8 Nov 2026): no geometry-engine change is approved in V5.3.
// Every baseline design must produce exactly the model recorded at d404af5, and the golden
// snapshots must be byte-identical. The four angled-corner failures stay in engine.test.js as TODOs.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { loadEngine, ROOT } = require('./engine');
const { designs } = require('./baseline/designs');

const win = loadEngine(), core = win.DeckCore;
const canon = (m) => JSON.stringify({ intent: m.intent, parts: m.parts, counts: m.counts, materials: m.materials, alerts: m.alerts, stats: m.stats, geometry: m.geometry });
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'baseline', 'engine-d404af5.json'), 'utf8'));

test('V5.3 guard: complete engine output of all 35 baseline designs matches the d404af5 record', () => {
  const all = designs(win);
  assert.deepEqual(Object.keys(all).sort(), Object.keys(base.designs).sort(), 'same design set');
  for (const [name, raw] of Object.entries(all)) {
    const c = canon(core.make(core.sanitize(raw)));
    assert.equal(crypto.createHash('sha256').update(c).digest('hex'), base.designs[name].sha256, `${name}: parts, geometry, framing, materials and alerts unchanged`);
  }
});

test('V5.3 guard: same engine output as the d404af5 build itself (direct comparison)', () => {
  const tmp = path.join(os.tmpdir(), `aos-v53base-${process.pid}.html`);
  fs.writeFileSync(tmp, execFileSync('git', ['show', 'd404af5:index.html'], { cwd: ROOT }));
  // Both engines start fresh and see the designs in the same order: the engine attaches a cached
  // framing 'solution' record to geometry.beams/joists diagnostics on a design's FIRST computation
  // only (existing behaviour at d404af5; parts, counts, materials, alerts and stats do not change).
  const old = loadEngine(tmp), cur = loadEngine(); fs.unlinkSync(tmp);
  for (const [name, raw] of Object.entries(designs(cur))) {
    const a = JSON.parse(canon(cur.DeckCore.make(cur.DeckCore.sanitize(raw)))), b = JSON.parse(canon(old.DeckCore.make(old.DeckCore.sanitize(raw))));
    assert.deepEqual(a, b, name);
  }
});

test('V5.3 guard: golden snapshots are byte-identical to d404af5', () => {
  const rec = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'baseline', 'golden-d404af5.json'), 'utf8')).files, dir = path.join(ROOT, 'tests', 'golden');
  assert.deepEqual(fs.readdirSync(dir).sort(), Object.keys(rec).sort());
  for (const f of Object.keys(rec)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex'), rec[f], f);
});
