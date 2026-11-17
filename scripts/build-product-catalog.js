#!/usr/bin/env node
// Builds the compact product catalog that index.html embeds, from the owner-approved
// product library v1.2 (catalog/library-v1.2/*.json) and the 3D material-color research
// draft (catalog/aos-3d-material-colors-v0.1.json).
//
//   node scripts/build-product-catalog.js          # write catalog/aos-product-catalog.json and update index.html
//   node scripts/build-product-catalog.js --check  # exit 1 if index.html does not embed the current catalog
//
// Only identity, listing/availability, owner defaults and approximate colors are copied.
// No board widths, spans, fasteners, SKUs or quantities are used by the app from this catalog.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const LIB = path.join(ROOT, 'catalog', 'library-v1.2');
const read = (f) => JSON.parse(fs.readFileSync(path.join(LIB, f + '.json'), 'utf8'));
const colors = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'aos-3d-material-colors-v0.1.json'), 'utf8'));
const index = read('index');
const standard = read('decking-sales-standard');

const SELECTABLE = new Set(['listed', 'listed-with-notice']);
const mat = (id) => {
  const m = colors.materials[id];
  if (!m) throw new Error('No material color for ' + id);
  const o = { hex: m.base, tier: m.tier, rough: m.material.roughness };
  if (m.variations.highlight) { o.hi = m.variations.highlight; o.lo = m.variations.lowlight; }
  if (m.variations.streak) o.streak = m.variations.streak;
  if (m.variegation) o.var = m.variegation.boardToBoard;
  if (m.material.sheen) o.sheen = m.material.sheen;
  return o;
};

// ---------- decking
const DECK_BRANDS = ['trex', 'timbertech', 'moistureshield', 'deckorators', 'treated-wood'];
const decking = DECK_BRANDS.map((f) => {
  const lib = read(f);
  const acc = new Map((lib.accessories || []).map((a) => [a.id, a]));
  const ex = lib.aosSalesConfig?.exceptionReport?.exceptions || [];
  return {
    id: f, name: lib.brand.name,
    lines: lib.lines.map((l) => ({
      id: l.id, name: l.name, material: l.material || null, listing: l.salesListing,
      reason: l.salesListingReason || '', availability: l.availability, quoteEligible: l.quoteEligible,
      selectable: SELECTABLE.has(l.salesListing),
      fascia: (l.trim || []).filter((t) => acc.get(t)?.kind === 'fascia').length > 0,
      riser: (l.trim || []).filter((t) => acc.get(t)?.kind === 'riser').length > 0,
      colors: l.colors.map((c) => ({
        id: c.id, name: c.name, listing: c.salesListing || l.salesListing, status: c.status,
        selectable: SELECTABLE.has(l.salesListing) && SELECTABLE.has(c.salesListing || l.salesListing) && !['conflict', 'unverified'].includes(c.status),
        look: mat(c.id),
      })),
    })),
    notices: ex.filter((e) => e.salesBehavior).map((e) => ({ topic: e.topic, text: e.salesBehavior })),
  };
});

// ---------- railing
const renderClass = (sys, model) => {
  if (sys.brand === 'aos') return 'placeholder';
  const s = `${sys.visualGeometry || ''} ${model?.infill || ''} ${model?.name || ''}`.toLowerCase();
  if (/cable|glass|mesh|rod|horizontal|panel|screen|chippendale|freeport|latitudes|curved/.test(s)) return 'placeholder';
  if (/turned|three-rail|t-top/.test(s) || sys.id === 'westbury-riviera') return 'approximate';
  if (/baluster|picket/.test(s)) return 'standard';
  return 'placeholder';
};
const RAIL_LIBS = [['westbury', 'Westbury'], ['rdi-railing', 'RDI'], ['aos-wood-railing', 'AOS wood']];
const railing = RAIL_LIBS.map(([f, short]) => {
  const lib = read(f), cfg = lib.aosSalesConfig || {};
  const brand = { id: f, name: lib.brand.name, short, finishes: {}, systems: [] };
  for (const x of lib.finishes) brand.finishes[x.id] = { name: x.name, stock: Boolean(x.aosStock), group: x.group || null, look: mat(x.id) };
  for (const s of lib.systems) {
    const sysRec = { ...s, brand: lib.brand.id };
    const models = (s.models || []).map((m) => ({ id: m.id, name: m.name, code: m.code || null, infill: m.infill || null, render: renderClass(sysRec, m) }));
    brand.systems.push({
      id: s.id, name: s.name, family: s.family || null, material: s.materialGroup || s.material || null,
      listing: s.salesListing, reason: s.salesListingReason || '', selectable: SELECTABLE.has(s.salesListing),
      heightsIn: s.heightsIn || [], finishIds: s.finishIds || [],
      finishRestrictions: (s.finishRestrictions || []).map((r) => ({ finishIds: r.finishIds, note: r.note || r.restriction || '' })),
      models, render: models.length ? (models.every((m) => m.render === 'placeholder') ? 'placeholder' : models.some((m) => m.render === 'standard') ? 'standard' : 'approximate') : renderClass(sysRec, null),
    });
  }
  if (f === 'aos-wood-railing') {
    const w = lib.systems[0];
    brand.defaults = { systemId: w.id, modelId: w.styleSelection.default, finishId: 'aos-wood--brown-treated', mounting: w.mountingSelection.default,
      balusterFinishId: 'aos-wood-baluster--black-aluminum', handrailFinishId: 'aos-wood-handrail--satin-black' };
    brand.lumberRule = 'Lumber is one global choice for all AOS wood railing; it starts matching treated decking (brown with composite/PVC).';
    brand.onDefaultChange = 'keep-customized';
    brand.stairSides = 'both';
  } else {
    const d = cfg.defaults;
    brand.defaults = { systemId: d.systemId, modelId: d.modelId, finishId: d.finishId };
    if (f === 'rdi-railing') {
      brand.defaults.topRail = d.topRail ?? null;
      brand.defaults.assemblyStatus = d.assemblyStatus || null;
      brand.noBlackFinishDefault = Object.fromEntries(Object.entries(cfg.noBlackFinishDefault.bySystem).map(([k, v]) => [k, v.finishId]));
      brand.defaultBlackFinishBySystem = cfg.defaultBlackFinishBySystem;
      brand.stairSides = 'auto';
    } else brand.stairSides = 'both';
    brand.onDefaultChange = 'ask';
  }
  return brand;
});

// ---------- privacy
const pv = read('rdi-privacy'), pcfg = pv.aosSalesConfig;
const pFin = Object.fromEntries(pv.finishes.map((x) => [x.id, { name: x.name, look: mat(x.id) }]));
const pr = pv.systems.find((s) => s.id === 'rdi-privacy-rail'), fs_ = pv.systems.find((s) => s.id === 'rdi-freestyle-screens');
const privacy = {
  finishes: pFin, defaults: pcfg.defaults, workflow: pcfg.workflow,
  privacyRail: { id: pr.id, name: pr.name, listing: pr.salesListing, reason: pr.salesListingReason, moduleWidthFt: pr.moduleWidthFt, isGuard: pr.isGuard,
    configurations: pr.configurations, frameFinishIds: pr.frameFinishIds, infillFinishIds: pr.infillFinishIds, placement: pr.aosPlacement },
  freestyle: { id: fs_.id, name: fs_.name, listing: fs_.salesListing, reason: fs_.salesListingReason, isGuard: fs_.isGuard, frameFinish: fs_.frameFinish,
    panels: fs_.panels.map((p) => ({ id: p.id, name: p.pattern, size: p.size, actualIn: p.actualIn, colors: Object.keys(p.colors || {}) })), placement: fs_.aosPlacement },
};

const catalog = {
  schema: 'aos-app-catalog', version: 1,
  libraryVersion: index.libraryVersion, librarySchemaVersion: index.schemaVersion,
  colorDataset: { version: colors.meta.version, date: colors.meta.date, note: 'Approximate colors; none verified or calibrated.' },
  railingDefaults: index.applicationRailingDefaults.hierarchy,
  deckingDefaults: index.applicationDeckingDefaults,
  deckingRules: Object.fromEntries(standard.rules.map((r) => [r.id, r.rule])),
  customerPdfPolicy: index.customerPdfPolicy,
  decking, railing, privacy,
};

const json = JSON.stringify(catalog);
fs.writeFileSync(path.join(ROOT, 'catalog', 'aos-product-catalog.json'), JSON.stringify(catalog, null, 1) + '\n');
const HTML = path.join(ROOT, 'index.html');
const html = fs.readFileSync(HTML, 'utf8');
const appearance = fs.readFileSync(path.join(__dirname, 'appearance-module.js'), 'utf8').trim();
// Embedded blocks, in order, before the first engine module. Each is regenerated from source files.
const blocks = [
  ['aos-product-catalog', `window.AOSProductCatalog=${json};`],
  ['aos-appearance', appearance],
];
const check = process.argv.includes('--check');
let out = html, bad = [];
for (const [id, body] of blocks) {
  const block = `<script id="${id}">${body}</script>`;
  const re = new RegExp(`<script id="${id}">[\\s\\S]*?<\\/script>`);
  const m = re.exec(out);
  if (check) { if (!m || m[0] !== block) bad.push(id); continue; }
  if (m) out = out.slice(0, m.index) + block + out.slice(m.index + m[0].length);
  else { const i = out.indexOf('<script>'); out = out.slice(0, i) + block + out.slice(i); }
}
if (check) {
  if (bad.length) { console.error('index.html does not embed the current ' + bad.join(', ')); process.exit(1); }
  console.log('index.html embeds the current product catalog and appearance module'); process.exit(0);
}
fs.writeFileSync(HTML, out);
const n = { brands: decking.length, lines: decking.reduce((a, b) => a + b.lines.length, 0), colors: decking.reduce((a, b) => a + b.lines.reduce((x, l) => x + l.colors.length, 0), 0),
  railSystems: railing.reduce((a, b) => a + b.systems.length, 0), bytes: json.length };
console.log('catalog written', JSON.stringify(n));
