// V5.3 C7 owner visual testing (11 Nov 2026): records R1's picture-frame and divider framing (support joists,
// flat 2x6 blocking, corner trimmers, field-end blocking) for every baseline design, member by member, from an
// R1 checkout. tests/framing-c7.test.js then requires C7 to reproduce these members exactly.
//   node scripts/record-c7-picture-frame-r1.js /path/to/r1-checkout
'use strict';
const fs = require('fs'), path = require('path');
const R1 = path.resolve(process.argv[2] || '');
if (!fs.existsSync(path.join(R1, 'index.html'))) { console.error('usage: record-c7-picture-frame-r1.js <R1 checkout>'); process.exit(1); }
const { loadEngine } = require('../tests/engine');
const { designs } = require('../tests/baseline/designs');
const { PF_KINDS, pfMembers } = require('../tests/c7-picture-frame');
const win = loadEngine(path.join(R1, 'index.html')), core = win.DeckCore, out = {};
for (const [name, q] of Object.entries(designs(win))) out[name] = pfMembers(core.make(core.sanitize(q)));
const sha = require('child_process').execSync('git rev-parse HEAD', { cwd: R1 }).toString().trim();
fs.writeFileSync(path.join(__dirname, '..', 'tests', 'baseline', 'c7-picture-frame-r1.json'), JSON.stringify({ recordedFrom: sha, kinds: PF_KINDS, designs: out }, null, 1) + '\n');
console.log('recorded', Object.keys(out).length, 'designs from', sha);
