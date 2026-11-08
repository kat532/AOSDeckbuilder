// V5.3 C0: record the complete engine output of every baseline design.
// Writes tests/baseline/engine-d404af5.json (SHA-256 per design of the canonical model JSON) and,
// with an output path, the full model JSON for the delivery package. Run against the build to record.
// Usage: node scripts/capture-engine-baseline.js [full-output.json]
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadEngine, ROOT } = require('../tests/engine');
const { designs } = require('../tests/baseline/designs');
const win = loadEngine(), core = win.DeckCore;
const canon = (m) => JSON.stringify({ intent: m.intent, parts: m.parts, counts: m.counts, materials: m.materials, alerts: m.alerts, stats: m.stats, geometry: m.geometry });
const hashes = {}, full = {};
for (const [name, raw] of Object.entries(designs(win))) { const m = core.make(core.sanitize(raw)), c = canon(m); hashes[name] = { sha256: crypto.createHash('sha256').update(c).digest('hex'), parts: m.parts.length, bytes: c.length }; full[name] = JSON.parse(c); }
const html = fs.readFileSync(path.join(ROOT, 'index.html'));
const rec = { recordedFrom: { commit: 'd404af5b6593b68f009439bf9f7ba9df5df02214', indexHtmlSha256: crypto.createHash('sha256').update(html).digest('hex') }, designs: hashes };
fs.writeFileSync(path.join(ROOT, 'tests', 'baseline', 'engine-d404af5.json'), JSON.stringify(rec, null, 2) + '\n');
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(full));
console.log(`${Object.keys(hashes).length} designs recorded from index.html ${rec.recordedFrom.indexHtmlSha256.slice(0, 12)}…`);
