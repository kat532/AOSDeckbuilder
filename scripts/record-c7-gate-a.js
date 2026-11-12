// V5.3 C7 Gate A: run the independent framing audit (tests/c7-audit.js) on the protected R1 build
// (01f16df) and record what it finds, BEFORE any C7 engine change. Output: tests/baseline/c7-framing-r1-gate-a.json.
// Usage: node scripts/record-c7-gate-a.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const { loadEngine, ROOT } = require('../tests/engine');
const { fixtures } = require('../tests/fixtures');
const { CASES, audit } = require('../tests/c7-audit');
const R1 = '01f16df5958ce31408b9f41cecbb267322e85787';
const html = execFileSync('git', ['show', `${R1}:index.html`], { cwd: ROOT });
const sha = crypto.createHash('sha256').update(html).digest('hex');
if (sha !== 'b8058b7b3614910ec2b81af34cb0b192db46df76f4ebe9a3adcc152fee916e4e') throw new Error(`R1 index.html hash mismatch: ${sha}`);
const tmp = path.join(os.tmpdir(), `aos-r1-${process.pid}.html`); fs.writeFileSync(tmp, html);
const win = loadEngine(tmp); fs.unlinkSync(tmp);
const cases = {};
for (const [name, q] of Object.entries(CASES(fixtures(win)))) {
  const r = audit(win, q), s = r.summary;
  cases[name] = { failedOnR1: s.unsupportedJoists + s.unsupportedRims + s.outsideBeamsPosts > 0, ...s,
    joistFaults: r.joistFaults.map(x => `${x.j.role || 'joist'} @${x.j.t.toFixed(2)}: ${x.f.join(', ')}`),
    rimFaults: r.rims.filter(x => !x.supported).map(x => `edge ${x.edge} (${x.len} ft): ${x.faults.join(', ')}`),
    outsideMembers: r.outsideMembers.map(p => `${p.kind} ${p.role || ''}`.trim()) };
}
const out = { recorded: 'C7 Gate A, before any engine change', r1Commit: R1, r1IndexSha256: sha, cases };
fs.writeFileSync(path.join(ROOT, 'tests', 'baseline', 'c7-framing-r1-gate-a.json'), JSON.stringify(out, null, 2) + '\n');
for (const [n, c] of Object.entries(cases)) console.log(`${c.failedOnR1 ? 'FAILS ' : 'passes'} ${n}: joists ${c.unsupportedJoists}, rims ${c.unsupportedRims}, outside ${c.outsideBeamsPosts}, posts ${c.posts}`);
