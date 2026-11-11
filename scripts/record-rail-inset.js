// Records the R1 rail-inset baselines (run once, on the owner-requested change only):
//  - tests/baseline/engine-d404af5-norail.json: sha256 of every d404af5 baseline design's engine output
//    WITHOUT the railing outputs, computed from the protected d404af5 build itself (git show d404af5).
//  - tests/baseline/rail-inset-r1.json: the railing outputs of the current build (pinned exactly).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const { loadEngine, snapshot, ROOT } = require('../tests/engine');
const { designs } = require('../tests/baseline/designs');
const { fixtures } = require('../tests/fixtures');
const { withoutRailInset, isRail, snapshotRail, RAIL_ALERT } = require('../tests/rail-inset');
const canon = (m) => JSON.stringify({ intent: m.intent, parts: m.parts, counts: m.counts, materials: m.materials, alerts: m.alerts, stats: m.stats, geometry: m.geometry });
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const tmp = path.join(os.tmpdir(), `aos-d404af5-${process.pid}.html`);
fs.writeFileSync(tmp, execFileSync('git', ['show', 'd404af5:index.html'], { cwd: ROOT }));
const old = loadEngine(tmp); fs.unlinkSync(tmp);
const out = { source: 'd404af5:index.html (protected), railing outputs removed by tests/rail-inset.js withoutRailInset()', designs: {} };
for (const [name, raw] of Object.entries(designs(old))) out.designs[name] = { sha256: sha(canon(withoutRailInset(JSON.parse(JSON.stringify(old.DeckCore.make(old.DeckCore.sanitize(raw))))))) };
fs.writeFileSync(path.join(ROOT, 'tests/baseline/engine-d404af5-norail.json'), JSON.stringify(out, null, 1) + '\n');
const cur = loadEngine(), pins = { note: 'R1 rail inset (owner, 11 Nov 2026): railing outputs of the approved-for-testing build. Each record: rail parts (sha256, no ids), rail counts/stats/alerts.', snapshots: {}, designs: {} };
const railRecord = (m) => ({ railParts: sha(JSON.stringify(m.parts.filter(isRail).map(({ id, ...p }) => p))), railPartCount: m.parts.filter(isRail).length,
  counts: { railPosts: m.counts.railPosts, balusters: m.counts.balusters }, stats: { deckRailLF: m.stats.deckRailLF, stairRailLF: m.stats.stairRailLF, totalRailLF: m.stats.totalRailLF },
  alerts: m.alerts.filter(a => RAIL_ALERT.test(a.message)).map(a => a.message) });
for (const [name, raw] of Object.entries(fixtures(cur))) pins.snapshots[name] = snapshotRail(snapshot(cur, raw));
for (const [name, raw] of Object.entries(designs(cur))) pins.designs[name] = railRecord(JSON.parse(JSON.stringify(cur.DeckCore.make(cur.DeckCore.sanitize(raw)))));
fs.writeFileSync(path.join(ROOT, 'tests/baseline/rail-inset-r1.json'), JSON.stringify(pins, null, 1) + '\n');
console.log('recorded', Object.keys(out.designs).length, 'd404af5 designs;', Object.keys(pins.snapshots).length, 'fixtures,', Object.keys(pins.designs).length, 'designs');
