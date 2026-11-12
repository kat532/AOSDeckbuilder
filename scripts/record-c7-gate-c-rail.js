// V5.3 C7 Gate C: records the railing parts Gate C changed (balusters and bottom rails) for every baseline
// design, from the current build, for owner review (tests/stairs-rails-c7c.test.js pins them).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { loadEngine, ROOT } = require('../tests/engine');
const { designs } = require('../tests/baseline/designs');
const { GATE_C_RAIL_KINDS } = require('../tests/c7-gate-c');
const win = loadEngine(), core = win.DeckCore, out = { note: 'C7 Gate C (owner authorization 11 Nov 2026): balusters and bottom rails of the build submitted for owner review. sha256 of the parts (no ids).', designs: {} };
for (const [name, raw] of Object.entries(designs(win))) {
  const m = JSON.parse(JSON.stringify(core.make(core.sanitize(raw)))), parts = m.parts.filter(p => GATE_C_RAIL_KINDS.has(p.kind)).map(({ id, ...p }) => p);
  out.designs[name] = { sha256: crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex'), balusters: m.counts.balusters, parts: parts.length };
}
fs.writeFileSync(path.join(ROOT, 'tests', 'baseline', 'c7-gate-c-rail.json'), JSON.stringify(out, null, 1) + '\n');
console.log('recorded', Object.keys(out.designs).length, 'designs');
