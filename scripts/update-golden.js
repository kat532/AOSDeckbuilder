// Regenerates tests/golden/*.json from the current index.html.
// Only run this when a model change is INTENDED, then review the git diff of the
// golden files line by line before committing.
'use strict';
const fs = require('fs');
const path = require('path');
const { loadEngine, snapshot, ROOT } = require('../tests/engine');
const { fixtures } = require('../tests/fixtures');

const win = loadEngine();
const dir = path.join(ROOT, 'tests', 'golden');
fs.mkdirSync(dir, { recursive: true });
let n = 0;
for (const [name, raw] of Object.entries(fixtures(win))) {
  if (!raw) { console.warn(`skip ${name}: fixture could not be built`); continue; }
  const intent = JSON.parse(JSON.stringify(win.DeckCore.sanitize(raw)));
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ input: raw, intent, model: snapshot(win, raw) }, null, 2) + '\n');
  n++;
}
console.log(`wrote ${n} golden files to tests/golden/`);
