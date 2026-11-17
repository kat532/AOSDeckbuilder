'use strict';
// Product library v1.2 integration, Stage B: the embedded catalog and the presentation hook.
// The catalog must be derived from the owner library (no hand-made products), and the hook must
// leave every existing design unchanged until a catalog product is selected.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { loadEngine } = require('./engine');
const { fixtures } = require('./fixtures');

const ROOT = path.join(__dirname, '..');
const LIB = path.join(ROOT, 'catalog', 'library-v1.2');
const lib = (f) => JSON.parse(fs.readFileSync(path.join(LIB, f + '.json'), 'utf8'));
const plain = (x) => JSON.parse(JSON.stringify(x));
const W = loadEngine();
const CAT = W.AOSProductCatalog;
const core = W.DeckCore;

// Run core.make with the app's hook installed (as in the browser), then remove it again.
function withHook(fn) { W.DeckAppearance = W.AOSAppearance.create(CAT); try { return fn(); } finally { delete W.DeckAppearance; } }

test('Stage B: index.html embeds the catalog and appearance module generated from the library', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-product-catalog.js'), '--check'], { stdio: 'pipe' });
  assert.equal(CAT.libraryVersion, lib('index').libraryVersion);
  assert.equal(CAT.librarySchemaVersion, '1.2.0');
});

test('Stage B: every library decking line and color is in the catalog with its own name, listing and an approximate color', () => {
  let lines = 0, colors = 0;
  for (const b of CAT.decking) {
    const src = lib(b.id);
    assert.equal(b.lines.length, src.lines.length, b.id);
    for (const l of b.lines) {
      const s = src.lines.find((x) => x.id === l.id); assert.ok(s, l.id);
      assert.equal(l.name, s.name); assert.equal(l.listing, s.salesListing); lines++;
      assert.equal(l.selectable, ['listed', 'listed-with-notice'].includes(s.salesListing), `${l.id} selectable`);
      for (const c of l.colors) {
        const sc = s.colors.find((x) => x.id === c.id); assert.ok(sc, c.id); assert.equal(c.name, sc.name); colors++;
        assert.match(c.look.hex, /^#[0-9a-f]{6}$/); assert.ok(['B', 'C', 'G'].includes(c.look.tier), `${c.id} tier`);
      }
    }
  }
  assert.equal(lines, 32); assert.equal(colors, 116);
  const held = CAT.decking.flatMap((b) => b.lines).filter((l) => !l.selectable).map((l) => l.id).sort();
  assert.deepEqual(plain(held), ['deckorators-altitude', 'deckorators-elevate', 'deckorators-meridian', 'trex-refuge']);
  // Rope Swing is held as a color (conflict) inside a listed line.
  assert.equal(CAT.decking[0].lines.find((l) => l.id === 'trex-transcend').colors.find((c) => c.name === 'Rope Swing').selectable, false);
});

test('Stage B: railing systems, models and finishes come from the library; owner default hierarchy is kept', () => {
  for (const b of CAT.railing) {
    const src = lib(b.id);
    assert.deepEqual(plain(b.systems.map((s) => s.id)), src.systems.map((s) => s.id));
    assert.deepEqual(plain(Object.keys(b.finishes).sort()), src.finishes.map((f) => f.id).sort());
    for (const s of b.systems) assert.deepEqual(plain(s.models.map((m) => m.id)), (src.systems.find((x) => x.id === s.id).models || []).map((m) => m.id));
  }
  const [wb, rdi, wood] = CAT.railing;
  assert.deepEqual(plain(wb.defaults), { systemId: 'westbury-tuscany', modelId: 'westbury-tuscany--c10', finishId: 'westbury--black-fine-texture' });
  assert.equal(CAT.railingDefaults[0].modelId, 'westbury-tuscany--c10'); // global default
  assert.equal(CAT.railingDefaults[0].finishId, 'westbury--black-fine-texture');
  assert.equal(rdi.defaults.systemId, 'rdi-avalon'); assert.equal(rdi.defaults.modelId, 'rdi-avalon--square-balusters'); assert.equal(rdi.defaults.finishId, 'rdi--matte-black');
  assert.equal(wood.defaults.modelId, 'aos-wood-railing--ttop-alum'); assert.equal(wood.defaults.mounting, 'in-deck');
  assert.equal(wb.systems.find((s) => s.id === 'westbury-montego').selectable, false); // held (W04)
  assert.equal(wb.onDefaultChange, 'ask'); assert.equal(rdi.onDefaultChange, 'ask'); assert.equal(wood.onDefaultChange, 'keep-customized');
  // Geometry honesty: only vertical baluster models are drawn as they are; cable/glass/mesh and wood are placeholders.
  const m = (sid, mid) => CAT.railing.flatMap((b) => b.systems).find((s) => s.id === sid).models.find((x) => x.id === mid);
  assert.equal(m('westbury-tuscany', 'westbury-tuscany--c10').render, 'standard');
  assert.equal(m('rdi-avalon', 'rdi-avalon--cable-rail').render, 'placeholder');
  assert.equal(CAT.railing.flatMap((b) => b.systems).find((s) => s.id === 'westbury-veranda').render, 'placeholder');
  assert.equal(CAT.railing.find((b) => b.id === 'aos-wood-railing').systems[0].render, 'placeholder');
  assert.deepEqual(CAT.deckingDefaults.brand ?? null, null); // no decking preselected
});

test('Stage B: with the hook installed but no catalog product, every fixture design is byte-identical', () => {
  const samples = fixtures(W);
  for (const [name, raw] of Object.entries(samples).filter(([, x]) => x)) {
    // Note: the engine's first build of a design carries extra solver detail that repeat builds omit
    // (pre-existing behaviour), so both sides are compared after one warm-up build.
    core.make(raw);
    const a = plain(core.make(raw)), b = plain(withHook(() => core.make(raw)));
    assert.deepEqual(b, a, name);
  }
});

test('Stage B: a catalog selection changes colors only; geometry, counts, stats and alerts are identical', () => {
  const samples = fixtures(W);
  const pick = { libraryVersion: CAT.libraryVersion, brandId: 'trex', lineId: 'trex-transcend', colorId: 'trex-transcend--spiced-rum' };
  const rail = { libraryVersion: CAT.libraryVersion, brandId: 'westbury', systemId: 'westbury-tuscany', modelId: 'westbury-tuscany--c10', finishId: 'westbury--bronze-fine-texture' };
  const geom = (m) => m.parts.map((p) => ({ ...p, color: undefined }));
  let changed = 0;
  for (const [name, raw] of Object.entries(samples).filter(([, x]) => x)) {
    core.make(raw);
    const a = plain(core.make(raw)), b = plain(withHook(() => core.make({ ...raw, catalogDecking: pick, catalogRailing: rail })));
    assert.deepEqual(geom(b), geom(a), `${name} parts`);
    assert.deepEqual(b.counts, a.counts, `${name} counts`); assert.deepEqual(b.stats, a.stats, `${name} stats`); assert.deepEqual(b.alerts, a.alerts, `${name} alerts`);
    const field = b.parts.find((p) => p.kind === 'field-board'); if (field) { assert.equal(field.color, '#6a4630'); changed++; }
    const post = b.parts.find((p) => p.kind === 'railing-post'); if (post) assert.equal(post.color, '#4d4035');
  }
  assert.ok(changed > 5);
});
