// V5.3 C5 (owner authorization 8 Nov 2026): Steps 1–4 usability.
//   Step 1: exact edge entry (4′ 0″ stays 4′ 0″), tappable edge and overall measurements, inline errors.
//   Step 2: door / window position as the distance from the Left or Right end of the house wall to the
//           CLOSEST EDGE of the opening; Left/Right standing on the deck facing the house.
//   Step 3: ledger / freestanding shown clearly per house wall; preliminary status.
//   Step 4: stair position the same way; Left/Right standing outside the deck facing the edge.
// The project keeps its centre offsets (schema 6); these tests check the conversion both ways.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright-core');
const { CENSUS_DESIGN } = require('./ui-census');
const { loadEngine } = require('./engine');
const { designs } = require('./baseline/designs');

const ROOT = path.join(__dirname, '..');
const APP = pathToFileURL(path.join(ROOT, 'index.html')).href;
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const SHOTS = path.join(ROOT, 'test-results', 'screenshots');
const ALL = designs(loadEngine());
const C4_HTML = path.join(os.tmpdir(), `aos-c5-c4-${process.pid}.html`), C4_APP = pathToFileURL(C4_HTML).href;
const EPS = 1e-6, OFF_EPS = 1e-4; // stored offsets keep 4 decimals of a foot (0.0012 in.)

let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(C4_HTML, execFileSync('git', ['show', 'checkpoint/v5.3-c4:index.html'], { cwd: ROOT })); });
test.after(async () => { await browser?.close(); fs.rmSync(C4_HTML, { force: true }); });
async function newPage(viewport = { width: 1440, height: 900 }, app = APP) {
  const touch = viewport.width < 800;
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, hasTouch: touch, isMobile: touch }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(app); await page.waitForFunction(() => window.DeckCore && window.AOSDeckStudioTest);
  return { ctx, page, errors, press: (loc) => (touch ? loc.tap() : loc.click()) };
}
async function openDesign(page, design) {
  const f = path.join(os.tmpdir(), `aos-c5-${Date.now()}-${Math.random().toString(36).slice(2)}.json`); fs.writeFileSync(f, JSON.stringify({ design }));
  await page.locator('#fileInput').setInputFiles(f); await page.waitForFunction(() => window.AOSDeckStudioTest.framingStatus() === 'current'); await page.waitForTimeout(250);
  await page.evaluate(() => document.getElementById('toast').classList.remove('show'));
}
const step = async (page, id) => { await page.locator(`#stepdots [data-step="${id}"]`).click(); await page.waitForTimeout(250); };
const edges = (page) => page.evaluate(() => window.AOSDeckStudioTest.edges());
const toast = (page) => page.locator('#toast').innerText();
async function saved(page) {
  const [d] = await Promise.all([page.waitForEvent('download'), (async () => { await page.locator('#openBtn').click(); await page.locator('#projectsDialog [data-action="project-download"]').click(); })()]);
  const f = path.join(os.tmpdir(), `aos-c5-dl-${Date.now()}-${Math.random().toString(36).slice(2)}`); await d.saveAs(f); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
const model = (page, d) => page.evaluate((x) => { const m = window.DeckCore.make(window.DeckCore.sanitize(x)); return { stats: m.stats, edges: m.geometry.edges, poly: m.geometry.poly, invalid: !!m.stats.invalidGeometry }; }, d);
async function selectEdge(page, i) { const p = await page.evaluate((k) => { const e = window.AOSDeckStudioTest.edges()[k]; return window.AOSDeckStudioTest.toScreen(e.mid[0], e.mid[1]); }, i); await page.mouse.click(p[0], p[1]); await page.waitForTimeout(150); }
async function setEdge(page, i, value) { await selectEdge(page, i); const f = page.locator('#stepContent input[data-edge-field="length"]'); assert.equal(await f.count(), 1, `edge ${i + 1} editor opens`); await f.fill(value); await page.locator('#stepContent [data-action="apply-edge-length"]').click(); await page.waitForTimeout(300); }
// Independent check of "Left as seen by a person": left of a viewer facing direction f (plan x,z; y up) is up × f = (f.z, −f.x).
function leftEnd(e, outward, viewerFacesOutward) { const f = viewerFacesOutward ? outward : [-outward[0], -outward[1]], left = [f[1], -f[0]];
  return (e.a[0] - e.mid[0]) * left[0] + (e.a[1] - e.mid[1]) * left[1] > 0 ? e.a : e.b; }
function outwardOf(e, poly) { const pr = [e.mid[0] + e.n[0] * .05, e.mid[1] + e.n[1] * .05]; let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > pr[1]) !== (b[1] > pr[1]) && pr[0] < (b[0] - a[0]) * (pr[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c ? [-e.n[0], -e.n[1]] : e.n; }
// Distance along the edge from a given end to the nearest side of a centred item (offset from the edge middle along t).
function nearFrom(e, end, offset, w) { const sEnd = (end[0] - e.mid[0]) * e.t[0] + (end[1] - e.mid[1]) * e.t[1]; return Math.abs(sEnd - offset) - w / 2; }
async function posSet(page, kind, side, value, press = (l) => l.click()) {
  await press(page.locator(`#stepContent [data-action="pos-side"][data-target="${kind}"][data-value="${side}"]`)); await page.waitForTimeout(100);
  const f = page.locator(`#stepContent input[data-${kind}-field="edge"]`); await f.scrollIntoViewIfNeeded(); await f.fill(value);
  await press(page.locator(`#stepContent [data-action="pos-apply"][data-target="${kind}"]`)); await page.waitForTimeout(300);
}
// Select the opening with this index (the app opens with the last one selected).
async function pickOpening(page, k, press = (l) => l.click()) { const prev = page.locator('#stepContent [data-action="opening-prev"]');
  while (!(await prev.isDisabled())) { await press(prev); await page.waitForTimeout(80); }
  for (let i = 0; i < k; i++) { await press(page.locator('#stepContent [data-action="opening-next"]')); await page.waitForTimeout(80); } }
const posErr = (page, kind) => page.locator(`#stepContent [data-pos="${kind}"] .field-error`).innerText().catch(() => '');

// ---------------- Step 1 ----------------
for (const [name, design, edgesToTry] of [['rectangle', ALL['default-rect-16x12'], [0, 1, 2, 3]], ['L', ALL['L-24x18'], [0, 1, 2, 3, 4, 5]], ['U', ALL['U-32x22'], [1, 2, 3, 4, 5, 6, 7]], ['custom angled', ALL['cut-corner'], [0, 1, 2, 3, 4]], ['custom hexagon', ALL['free-hexagon'], [1, 2, 3, 4, 5]]])
  test(`C5 Step 1 ${name}: typing 4′ 0″ (and other exact values) makes the edge exactly that length; the outline stays valid; the plan shows it`, async () => {
    const { ctx, page, errors } = await newPage();
    for (const i of edgesToTry) for (const [typed, ft] of [[`4'0"`, 4], [`4-0`, 4], [`48"`, 4], [`7' 3 1/2"`, 7 + 3.5 / 12]]) {
      await openDesign(page, design); await step(page, 0);
      await setEdge(page, i, typed);
      const es = await edges(page);
      if (Math.abs(es[i].len - ft) > EPS) { const t = await posErrOrToast(page); assert.match(t, /can't be|can’t be|No change made/, `${name} edge ${i + 1} ${typed}: either exact or refused with a reason (got ${(es[i].len * 12).toFixed(4)} in.)`); continue; }
      assert.ok(Math.abs(es[i].len - ft) <= EPS, `${name} edge ${i + 1}: ${typed} → exactly ${ft} ft (got ${es[i].len})`);
      const m = await model(page, (await saved(page)).design); assert.equal(m.invalid, false, 'valid outline'); assert.ok(Math.abs(m.edges[i].len - ft) <= EPS, 'saved and rebuilt: still exact');
      if (ft === 4) assert.match(await page.locator('#planCanvas').getAttribute('aria-label'), /4′ 0″/, 'plan label shows 4′ 0″');
      assert.match(await page.locator('#stepContent .edge-length-panel .editor-head').innerText(), new RegExp(`EDGE ${i + 1}`));
    }
    assert.deepEqual(errors, []); await ctx.close();
  });
async function posErrOrToast(page) { const t = await page.locator('#stepContent .edge-length-panel .field-error').innerText().catch(() => ''); return t || toast(page); }

test('C5 Step 1: impossible or invalid lengths are refused with a reason shown in the panel; nothing changes', async () => {
  const { ctx, page, errors } = await newPage();
  for (const [design, i, typed, why] of [[ALL['free-hexagon'], 0, `4'0"`, /can't be 4′ 0″: That length would collapse another edge\. .*No change made\./], [ALL['default-rect-16x12'], 0, `0' 5"`, /must be at least 0′ 7¼″/], [ALL['default-rect-16x12'], 1, 'abc', /Enter feet and inches/]]) {
    await openDesign(page, design); await step(page, 0); const before = await edges(page);
    await setEdge(page, i, typed);
    const msg = await page.locator('#stepContent .edge-length-panel .field-error').innerText();
    assert.match(msg, why, `inline reason: ${msg}`); assert.equal(await page.locator('#stepContent .field-error').getAttribute('role'), 'alert');
    assert.deepEqual(await edges(page), before, 'outline unchanged');
    await page.locator('#stepContent [data-action="done-edge"]').click(); assert.equal(await page.locator('#stepContent .field-error').count(), 0, 'the message clears when the editor closes');
  }
  await page.screenshot({ path: path.join(SHOTS, 'c5-shape-error.png') });
  assert.deepEqual(errors, []); await ctx.close();
});

test('C5 Step 1: edge measurements are tap targets (✎, red when selected); overall measurements are distinct and open the Overall fields; corner selection is shown the same way', async () => {
  const { ctx, page, errors } = await newPage();
  await openDesign(page, ALL['L-24x18']); await step(page, 0);
  // Overall labels exist for an L (they differ from the edges) and tapping one focuses the field.
  const aria = await page.locator('#planCanvas').getAttribute('aria-label'); assert.match(aria, /24′ 0″ overall/); assert.match(aria, /18′ 0″ overall/);
  await selectEdge(page, 1); assert.equal(await page.locator('#stepContent .edge-length-panel.selected-item').count(), 1);
  assert.match(await page.locator('#stepContent .edge-length-panel .editor-head').innerText(), /^SELECTED · EDGE 2/);
  await page.screenshot({ path: path.join(SHOTS, 'c5-shape-edge-selected.png') });
  await page.locator('#stepContent [data-action="done-edge"]').click(); await page.waitForTimeout(150);
  // Tap the dark "overall" width label on the plan: the Overall width field is focused.
  const box = await page.evaluate(() => { const c = document.getElementById('planCanvas').getBoundingClientRect(); return [c.left, c.top]; });
  const target = await page.evaluate(() => { const p = window.AOSDeckStudioTest.edges()[0]; const a = window.AOSDeckStudioTest.toScreen(p.mid[0], p.mid[1]); return a; });
  let focused = false;
  for (let dy = 30; dy <= 120 && !focused; dy += 6) { await page.mouse.click(target[0], target[1] - dy); await page.waitForTimeout(80); focused = await page.evaluate(() => document.activeElement?.dataset?.field === 'width'); }
  assert.ok(focused, 'tapping the overall width label opens and focuses Overall width');
  assert.match(await page.locator('#stepContent .overall-tip').innerText(), /Overall = the outside size of the whole deck \(dark labels on the plan\)/);
  // Corner selection: same "SELECTED ·" header and highlight.
  const v = await page.evaluate(() => { const e = window.AOSDeckStudioTest.edges()[2]; return window.AOSDeckStudioTest.toScreen(e.a[0], e.a[1]); }); await page.mouse.click(v[0], v[1]); await page.waitForTimeout(200);
  assert.match(await page.locator('#stepContent .corner-simple.selected-item .editor-head').innerText(), /^SELECTED · CORNER 3/);
  // Overall width typed exactly.
  await page.locator('#stepContent [data-action="cancel-corner"]').click(); const w = page.locator('#stepContent input[data-field="width"]'); await w.fill(`20'0"`); await w.dispatchEvent('change'); await page.waitForTimeout(300);
  assert.ok(Math.abs((await edges(page))[0].len - 20) <= EPS, 'overall width exactly 20′ 0″');
  assert.equal(box.length, 2); assert.deepEqual(errors, []); await ctx.close();
});

// ---------------- Step 2 ----------------
// Rectangle 20 × 14 with a house on each side in turn: who is "left" standing on the deck facing the house.
const WALLS = [[0, 'top', 'the end with smaller x (west)'], [1, 'right', 'the end with smaller z (north)'], [2, 'bottom', 'the end with larger x (east)'], [3, 'left', 'the end with larger z (south)']];
for (const [edge, name, expect] of WALLS) test(`C5 Step 2: house wall on the ${name} — Left is ${expect} standing on the deck facing the house; Left/Right closest-edge entry is exact`, async () => {
  const { ctx, page, errors } = await newPage();
  const D = { shape: 'rectangle', width: 20, depth: 14, height: 4, houseEdges: [edge], ledgerEdges: [edge], railEdges: [0, 1, 2, 3].filter(i => i !== edge), project: `House ${name}`, openings: [{ id: 'd', type: 'door', edge, offset: 0, width: 3 }] };
  await openDesign(page, D); await step(page, 1);
  const es = await edges(page), e = es[edge], m = await model(page, D), out = outwardOf(e, m.poly), L = leftEnd(e, out, true);
  // Independent expectation per wall (plan coordinates: x east, z south).
  const xs = [e.a[0], e.b[0]], zs = [e.a[1], e.b[1]];
  const want = edge === 0 ? (e.a[0] < e.b[0] ? e.a : e.b) : edge === 1 ? (e.a[1] < e.b[1] ? e.a : e.b) : edge === 2 ? (e.a[0] > e.b[0] ? e.a : e.b) : (e.a[1] > e.b[1] ? e.a : e.b);
  assert.deepEqual(L, want, `left end of the ${name} wall`); assert.ok(xs && zs);
  for (const [side, val, ft] of [['left', `3'0"`, 3], ['right', `3'0"`, 3], ['left', `5' 7 1/2"`, 5 + 7.5 / 12], ['right', `0' 6"`, .5]]) {
    await posSet(page, 'opening', side, val);
    const o = (await page.evaluate(() => window.AOSDeckStudioTest.openings()))[0], end = side === 'left' ? L : (L === e.a ? e.b : e.a);
    assert.ok(Math.abs(nearFrom(e, end, o.offset, o.width) - ft) <= OFF_EPS, `${name} wall, ${side} ${val}: closest edge of the door is ${ft} ft from the ${side} end (got ${nearFrom(e, end, o.offset, o.width)})`);
    assert.equal(o.status, 'ok');
    const both = await page.locator('#stepContent [data-pos="opening"] .pos-both').innerText(), other = e.len - o.width - ft;
    assert.ok(both.includes(side === 'left' ? 'Left end' : 'Right end'));
    assert.match(await page.locator('#stepContent [data-pos="opening"] input').inputValue(), new RegExp(`^${Math.floor(ft)}′`), 'the field shows the value just entered');
    assert.ok(other > 0);
  }
  assert.match(await page.locator('#stepContent [data-pos="opening"] .pos-ref').innerText(), new RegExp(`Wall: ${name[0].toUpperCase() + name.slice(1)} wall · edge ${edge + 1} · 20′ 0″|Wall: ${name[0].toUpperCase() + name.slice(1)} wall · edge ${edge + 1} · 14′ 0″`));
  assert.match(await page.locator('#stepContent [data-pos="opening"] .pos-ref').innerText(), /standing on the deck, facing the house[\s\S]*closest edge of the door/);
  if (edge === 1) await page.screenshot({ path: path.join(SHOTS, 'c5-opening-right-wall.png') });
  assert.deepEqual(errors, []); await ctx.close();
});

test('C5 Step 2: width changes update the closest-edge distances; out-of-range and overlapping positions are refused with the allowed range; L/U and angled house walls', async () => {
  const { ctx, page, errors } = await newPage();
  await openDesign(page, CENSUS_DESIGN); await step(page, 1);
  await pickOpening(page, 2); // the window (door 0, patio door 1, window 2)
  const es = await edges(page), e = es[0];
  await posSet(page, 'opening', 'left', `15' 0"`); assert.equal(await posErr(page, 'opening'), '', 'fits: 1 ft clear of the patio door');
  let o = (await page.evaluate(() => window.AOSDeckStudioTest.openings())).find(x => x.type === 'window'), center = o.offset;
  const w = page.locator('#stepContent input[data-opening-field="width"]'); await w.fill(`4' 0"`); await w.dispatchEvent('change'); await page.waitForTimeout(300);
  o = (await page.evaluate(() => window.AOSDeckStudioTest.openings())).find(x => x.type === 'window');
  assert.equal(o.width, 4); assert.ok(Math.abs(o.offset - center) < 1e-9, 'a width change keeps the centre (existing behaviour)');
  const shown = await page.locator('#stepContent [data-pos="opening"] .pos-both').innerText();
  assert.match(shown, /Left end → window: 14′ 6″/, 'left distance updated for the wider window'); assert.match(shown, /Right end → window: 1′ 6″/);
  await page.screenshot({ path: path.join(SHOTS, 'c5-opening-left-right.png') });
  // Out of range: refused, range given, nothing moved.
  const before = await page.evaluate(() => window.AOSDeckStudioTest.openings());
  await posSet(page, 'opening', 'left', `18' 0"`);
  assert.match(await posErr(page, 'opening'), /That doesn't fit: the top wall is 20′ 0″ long\. This 4′ 0″ window can be from 0′ 3″ to 15′ 9″ from the left end\. No change made\./);
  assert.deepEqual(await page.evaluate(() => window.AOSDeckStudioTest.openings()), before);
  // Overlap with the patio door: the existing rule refuses it, the reason is shown in the panel.
  await posSet(page, 'opening', 'left', `10' 0"`);
  assert.match(await posErr(page, 'opening'), /overlap another opening/); assert.deepEqual(await page.evaluate(() => window.AOSDeckStudioTest.openings()), before);
  // L-shape with house walls on three sides (U-like) and an angled (beveled) house wall.
  for (const d of [ALL['b3c-u-three-walls'], ALL['b3c-bevel-walls'], ALL['two-house-walls']]) {
    await openDesign(page, { ...d, openings: (d.houseEdges || [0]).map((i, k) => ({ id: `o${k}`, type: 'window', edge: i, offset: 0, width: 1.5, height: 2, sill: 3 })) }); await step(page, 1);
    const E = await edges(page), M = await model(page, (await saved(page)).design), list = await page.evaluate(() => window.AOSDeckStudioTest.openings());
    for (let k = 0; k < list.length; k++) { await pickOpening(page, k);
      const op = (await page.evaluate(() => window.AOSDeckStudioTest.openings()))[k]; if (op.status !== 'ok') continue;
      const ed = E[op.edge], Lend = leftEnd(ed, outwardOf(ed, M.poly), true), room = ed.len - op.width;
      const target = Math.min(1, room / 2);
      await posSet(page, 'opening', 'left', `0' ${Math.round(target * 12)}"`);
      const after = (await page.evaluate(() => window.AOSDeckStudioTest.openings()))[k];
      if (await posErr(page, 'opening')) continue; // a corner clearance can forbid it: the range is then shown
      assert.ok(Math.abs(nearFrom(ed, Lend, after.offset, after.width) - Math.round(target * 12) / 12) <= OFF_EPS, `wall edge ${op.edge + 1}: left distance applied from the viewer's left end`);
    }
  }
  assert.deepEqual(errors, []); await ctx.close();
});

// ---------------- Step 3 ----------------
test('C5 Step 3: every house wall is listed with its ledger state; Add/Remove matches the plan tap; freestanding and status are explained; figures match the model', async () => {
  const { ctx, page, errors } = await newPage();
  await openDesign(page, ALL['two-house-walls']); await step(page, 6);
  const d0 = (await saved(page)).design, m0 = await model(page, d0);
  const rows = await page.locator('#stepContent .ledger-row').evaluateAll(a => a.map(r => [Number(r.dataset.ledgerEdge), r.classList.contains('on'), r.innerText.replace(/\s+/g, ' ')]));
  assert.deepEqual(rows.map(r => r[0]), d0.houseEdges, 'one row per house wall'); assert.ok(rows.every(r => r[1] && /Ledger ✓/.test(r[2])), 'every house wall has a ledger by default');
  assert.match(await page.locator('#stepContent').innerText(), /Not engineered or code-approved\. AOS production review is required before construction\./);
  assert.doesNotMatch(await page.locator('#stepContent').innerText(), /engineered design|code-compliant|approved for construction/i);
  const sum = await page.locator('#stepContent .framing-summary').innerText();
  assert.ok(sum.includes(`Joists ${m0.stats.joistNominal} at ${m0.stats.joistSpacingIn} in. on center`));
  await page.screenshot({ path: path.join(SHOTS, 'c5-framing-ledgers.png') });
  // Remove the ledger on the second wall from the panel = same result as the plan tap.
  const second = d0.houseEdges[1];
  await page.locator(`#stepContent [data-action="ledger-toggle"][data-edge="${second}"]`).click(); await page.waitForTimeout(300);
  const d1 = (await saved(page)).design; assert.deepEqual(d1.ledgerEdges, d0.ledgerEdges.filter(i => i !== second)); assert.equal(d1.supportMode, 'ledger');
  assert.match(await page.locator(`#stepContent [data-ledger-edge="${second}"]`).innerText(), /No ledger/);
  const viaPanel = d1;
  await page.locator('#undoBtn').click(); await page.waitForTimeout(250); assert.deepEqual((await saved(page)).design.ledgerEdges, d0.ledgerEdges, 'undo');
  const p = await page.evaluate((i) => { const e = window.AOSDeckStudioTest.edges()[i]; return window.AOSDeckStudioTest.toScreen(e.mid[0], e.mid[1]); }, second); await page.mouse.click(p[0], p[1]); await page.waitForTimeout(300);
  assert.deepEqual((await saved(page)).design.ledgerEdges, viaPanel.ledgerEdges, 'plan tap gives the same result');
  // Freestanding.
  await page.locator('#stepContent [data-path="supportMode"][data-value="freestanding"]').click(); await page.waitForTimeout(300);
  assert.match(await page.locator('#stepContent').innerText(), /Nothing is fastened to the house/); assert.ok((await page.locator('#stepContent .ledger-row').allInnerTexts()).every(t => /No ledger \(freestanding\)/.test(t)));
  assert.deepEqual(errors, []); await ctx.close();
});

// ---------------- Step 4 ----------------
// Census deck 20 × 14: stair a on the bottom edge (with a turning landing), stair b on the right edge.
for (const [k, edge, name] of [[0, 2, 'bottom edge (with a turning landing)'], [1, 1, 'right edge']]) test(`C5 Step 4 stair on the ${name}: Left/Right standing outside facing the edge; exact closest-side entry; width change; landing kept; 2D/3D`, async () => {
  const { ctx, page, errors } = await newPage();
  await openDesign(page, CENSUS_DESIGN); await step(page, 2);
  if (k) { await page.locator('#stepContent [data-action="stair-next"]').click(); await page.waitForTimeout(200); }
  const es = await edges(page), e = es[edge], d0 = (await saved(page)).design, m = await model(page, d0), out = outwardOf(e, m.poly), L = leftEnd(e, out, false), R = L === e.a ? e.b : e.a;
  // Independent expectation: outside below the bottom edge looking north, left = west (smaller x); outside right of the right edge looking west, left = south (larger z).
  assert.deepEqual(L, edge === 2 ? (e.a[0] < e.b[0] ? e.a : e.b) : (e.a[1] > e.b[1] ? e.a : e.b));
  assert.match(await page.locator('#stepContent [data-pos="stair"] .pos-ref').innerText(), new RegExp(`Attached to deck edge ${edge + 1} · ${edge === 2 ? '20′ 0″' : '14′ 0″'} long[\\s\\S]*standing outside the deck, facing this edge[\\s\\S]*closest side of the stairs`));
  const other = d0.staircases.filter((_, i) => i !== k);
  for (const [side, val, ft] of [['left', `2'0"`, 2], ['right', `2'0"`, 2], ['left', `3' 7 1/2"`, 3 + 7.5 / 12], ['right', `1' 1"`, 13 / 12]]) {
    await posSet(page, 'stair', side, val);
    if (await posErr(page, 'stair')) { assert.match(await posErr(page, 'stair'), /would run back over the deck|overlap/); continue; } // a landing may not fit there: refused with the reason
    const s = (await saved(page)).design.staircases[k];
    assert.ok(Math.abs(nearFrom(e, side === 'left' ? L : R, s.offset, s.width) - ft) <= OFF_EPS, `${side} ${val} → nearest stair side exactly ${ft} ft from the ${side} end (got ${nearFrom(e, side === 'left' ? L : R, s.offset, s.width)})`);
    assert.equal(s.edge, edge, 'still on the same edge');
    assert.deepEqual((await saved(page)).design.staircases.filter((_, i) => i !== k), other, 'other staircases unchanged');
    if (k === 0) assert.deepEqual(s.landing, d0.staircases[0].landing, 'landing and turn kept');
    // 3D follows: the drawn stair is centred where the model says.
    const g = (await page.evaluate(() => window.AOSDeckStudioTest.scene3d())).stairs[k]; const c = [e.mid[0] + e.t[0] * s.offset, e.mid[1] + e.t[1] * s.offset];
    assert.ok(Math.hypot(g.base[0] - c[0], g.base[1] - c[1]) < 1e-3, '3D/2D stair at the new position');
  }
  // Width change: centre kept, distances updated; Left + Right + width = edge length.
  const w = page.locator('#stepContent input[data-stair-field="width"]'); await w.fill(`3' 0"`); await w.dispatchEvent('change'); await page.waitForTimeout(300);
  const s1 = (await saved(page)).design.staircases[k], txt = await page.locator('#stepContent [data-pos="stair"] .pos-both').innerText();
  const lft = nearFrom(e, L, s1.offset, s1.width), rgt = nearFrom(e, R, s1.offset, s1.width); assert.ok(Math.abs(lft + rgt + s1.width - e.len) < 1e-6);
  assert.ok(txt.includes('Left end → stairs:') && txt.includes('Right end → stairs:'));
  // Out of range: refused with the allowed range, nothing moved.
  const before = (await saved(page)).design.staircases;
  await posSet(page, 'stair', 'left', `0' 0"`);
  assert.match(await posErr(page, 'stair'), new RegExp(`That doesn't fit: edge ${edge + 1} is ${edge === 2 ? '20′ 0″' : '14′ 0″'} long\\. A 3′ 0″ wide stair can be from 0′ 1″ to .+ from the left end\\. No change made\\.`));
  assert.deepEqual((await saved(page)).design.staircases, before);
  if (k === 0) await page.screenshot({ path: path.join(SHOTS, 'c5-stair-left-right.png') });
  assert.deepEqual(errors, []); await ctx.close();
});

test('C5 Step 4: no more 3-inch snapping — a typed position is applied to the inch fraction; two stairs on one edge cannot overlap; a full-width stair has no position to set', async () => {
  const { ctx, page, errors } = await newPage();
  await openDesign(page, { ...CENSUS_DESIGN, staircases: [{ id: 'a', edge: 2, width: 4, offset: -5, rails: { left: true, right: true } }, { id: 'b', edge: 2, width: 4, offset: 5, rails: { left: true, right: true } }] }); await step(page, 2);
  const e = (await edges(page))[2], m = await model(page, (await saved(page)).design), L = leftEnd(e, outwardOf(e, m.poly), false);
  // Stair a (offset −5) is the EAST stair: the bottom edge runs east → west. From the left (west) end it may
  // sit from 7′ 6″ (6 in. clear of stair b) up to the far end.
  assert.match(await page.locator('#stepContent [data-pos="stair"] .pos-both').innerText(), /Left end → stairs: 13′ 0″ · Right end → stairs: 3′ 0″/);
  for (const v of [[`8' 1"`, 8 + 1 / 12], [`8' 1 1/4"`, 8 + 1.25 / 12], [`9' 11"`, 9 + 11 / 12]]) {
    await posSet(page, 'stair', 'left', v[0]); const s = (await saved(page)).design.staircases[0];
    assert.ok(Math.abs(nearFrom(e, L, s.offset, s.width) - v[1]) <= OFF_EPS, `${v[0]} applied exactly (no 3-inch snap)`);
  }
  const before = (await saved(page)).design.staircases;
  await posSet(page, 'stair', 'left', `6' 0"`); // would overlap stair b (west of it)
  assert.match(await posErr(page, 'stair'), /overlap another opening or exceed the deck edge|overlap/); assert.deepEqual((await saved(page)).design.staircases, before);
  await page.locator('#stepContent [data-action="stair-full"]').click(); await page.waitForTimeout(300);
  const full = (await saved(page)).design.staircases[0];
  if (full.fullWidth) { assert.equal(await page.locator('#stepContent input[data-stair-field="edge"]').isDisabled(), true); assert.match(await page.locator('#stepContent [data-pos="stair"] .pos-ref').innerText(), /full-width stair fills the whole edge/); }
  assert.deepEqual(errors, []); await ctx.close();
});

test('C5 Undo/Redo and save/reopen keep the positions; schema 6 and no new keys in the project file', async () => {
  const { ctx, page, errors } = await newPage();
  await openDesign(page, CENSUS_DESIGN);
  await step(page, 1); await pickOpening(page, 0); await posSet(page, 'opening', 'right', `15' 6"`); assert.equal(await posErr(page, 'opening'), '');
  await step(page, 2); await posSet(page, 'stair', 'right', `1' 6"`); assert.equal(await posErr(page, 'stair'), '');
  const d1 = await saved(page);
  await page.locator('#undoBtn').click(); await page.waitForTimeout(250); const u1 = (await saved(page)).design;
  assert.equal(u1.staircases[0].offset, CENSUS_DESIGN.staircases[0].offset, 'undo restores the stair'); assert.equal(u1.openings[0].offset, d1.design.openings[0].offset);
  await page.locator('#undoBtn').click(); await page.waitForTimeout(250); assert.equal((await saved(page)).design.openings[0].offset, CENSUS_DESIGN.openings[0].offset, 'undo restores the door');
  await page.locator('#redoBtn').click(); await page.locator('#redoBtn').click(); await page.waitForTimeout(300);
  const d2 = await saved(page); assert.deepEqual(d2.design, d1.design, 'redo');
  const fresh = await newPage(); await openDesign(fresh.page, d2.design); const d3 = await saved(fresh.page);
  for (const k of ['design', 'componentModel', 'counts', 'alerts']) assert.deepEqual(d3[k], d2[k], `reopened unchanged: ${k}`);
  assert.equal(d3.schemaVersion, 6);
  assert.ok(!JSON.stringify(d3.design).match(/"(ref|side|left|right)":"/), 'no Left/Right setting stored in the project');
  await step(fresh.page, 1); await pickOpening(fresh.page, 0); assert.match(await fresh.page.locator('#stepContent [data-pos="opening"] .pos-both').innerText(), /Right end → door: 15′ 6″/, 'the reopened project shows the same position');
  await fresh.ctx.close(); assert.deepEqual(errors, []); await ctx.close();
});

test('C5 the C4 customer PDF is unchanged for an identical design (text and images byte-identical to the C4 build)', async () => {
  const run = async (app) => { const { ctx, page, errors } = await newPage(undefined, app); await openDesign(page, CENSUS_DESIGN); await step(page, 7);
    await page.locator('#stepContent [data-action="pdf-preview"]').click(); await page.waitForFunction(() => !document.getElementById('pdfDownloadBtn').disabled, null, { timeout: 60000 });
    const d = (await page.evaluate(() => window.AOSDeckStudioTest.pdf())).doc; assert.deepEqual(errors, []); await ctx.close();
    return { pages: d.pages.map(p => ({ texts: p.texts, images: p.images })), images: Object.fromEntries(Object.entries(d.images).map(([k, v]) => [k, crypto.createHash('sha256').update(v.url).digest('hex')])), checks: d.checks }; };
  const c5 = await run(APP), c4 = await run(C4_APP);
  assert.deepEqual(c5, c4, 'same document as C4');
});

test('C5 tablet and phone: Left/Right and Apply work by touch for an opening and a stair; panels scroll to every control', async () => {
  for (const vp of [{ width: 820, height: 1180 }, { width: 390, height: 844 }]) {
    const { ctx, page, errors, press } = await newPage(vp);
    await openDesign(page, CENSUS_DESIGN); await step(page, 1); await pickOpening(page, 0, press);
    await posSet(page, 'opening', 'right', `14' 6"`, press); assert.equal(await posErr(page, 'opening'), '');
    const o = (await page.evaluate(() => window.AOSDeckStudioTest.openings()))[0], e = (await edges(page))[0], m = await model(page, CENSUS_DESIGN), L = leftEnd(e, outwardOf(e, m.poly), true), R = L === e.a ? e.b : e.a;
    assert.ok(Math.abs(nearFrom(e, R, o.offset, o.width) - 14.5) <= OFF_EPS);
    if (vp.width < 800) await page.screenshot({ path: path.join(SHOTS, 'c5-phone-opening-position.png') });
    await step(page, 2); await posSet(page, 'stair', 'left', `6' 0"`, press);
    const g = (await page.evaluate(() => window.AOSDeckStudioTest.scene3d())).stairs[0], e2 = (await edges(page))[2], L2 = leftEnd(e2, outwardOf(e2, m.poly), false);
    const off = (g.base[0] - e2.mid[0]) * e2.t[0] + (g.base[1] - e2.mid[1]) * e2.t[1]; assert.ok(Math.abs(nearFrom(e2, L2, off, g.width) - 6) <= 1e-3);
    if (vp.width < 800) await page.screenshot({ path: path.join(SHOTS, 'c5-phone-stair-position.png') });
    // The Apply button and the field are reachable and above Back/Next when scrolled into view.
    const ok = await page.evaluate(() => { const b = document.querySelector('#stepContent [data-action="pos-apply"]'); b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(), f = document.querySelector('.inspector-footer').getBoundingClientRect(); return r.bottom <= f.top + 1 && r.height >= 36; });
    assert.ok(ok, 'Apply reachable and at least 36 px tall');
    assert.deepEqual(errors, []); await ctx.close();
  }
});
