// V5.3 C3 (owner authorization 8 Nov 2026): Review & Present redesign.
//   Customer mode (default on entering step 9): finished 3D, key measurements, the customer's
//   selections, Available Adjustments shortcuts into the existing editors, downloads.
//   Internal mode (switch): Materials and Framing tabs holding every quantity and every alert the
//   model already produces. The switch is a display choice, not a permission.
// Figures are checked against the engine's own output for the same design (DeckCore.make in the page).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
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
// Step ID → title of the editor each Available Adjustments shortcut must open.
const ADJUST = [[0, 'Deck Shape & Size', 'Shape & Size'], [1, 'House & Height', 'House & Height'], [6, 'Framing & Ledger', 'Framing & Ledger'], [2, 'Stairs & Landings', 'Stairs & Landings'],
  [3, 'Decking Layout', 'Decking Layout'], [4, 'Decking Materials & Colors', 'Decking Selection'], [5, 'Railings', 'Railings'], [8, 'Patio & Walkway', 'Patio & Walkway']];
const VIEWPORTS = [['desktop', { width: 1440, height: 900 }], ['tablet', { width: 820, height: 1180 }], ['phone', { width: 390, height: 844 }]];

let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); fs.mkdirSync(SHOTS, { recursive: true }); });
test.after(async () => { await browser?.close(); });

async function newPage(viewport = { width: 1440, height: 900 }) {
  const touch = viewport.width < 800;
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, hasTouch: touch, isMobile: touch }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(APP); await page.waitForFunction(() => window.DeckCore && window.AOSDeckStudioTest);
  const press = (loc) => (touch ? loc.tap() : loc.click());
  return { ctx, page, errors, press, touch };
}
async function openDesign(page, design) {
  const f = path.join(os.tmpdir(), `aos-c3-${Date.now()}-${Math.random().toString(36).slice(2)}.json`); fs.writeFileSync(f, JSON.stringify({ design }));
  await page.locator('#fileInput').setInputFiles(f); await page.waitForFunction(() => window.AOSDeckStudioTest.framingStatus() === 'current'); await page.waitForTimeout(250);
  await page.evaluate(() => document.getElementById('toast').classList.remove('show'));
}
async function download(page, run) {
  const [d] = await Promise.all([page.waitForEvent('download'), run()]);
  const f = path.join(os.tmpdir(), `aos-c3-dl-${Date.now()}-${Math.random().toString(36).slice(2)}`); await d.saveAs(f);
  return { name: d.suggestedFilename(), text: fs.readFileSync(f, 'utf8') };
}
async function saveFile(page) {
  const r = await download(page, async () => { await page.locator('#openBtn').click(); await page.locator('#projectsDialog [data-action="project-download"]').click(); });
  await page.keyboard.press('Escape'); await page.waitForTimeout(100); return JSON.parse(r.text);
}
const step = async (page, id) => { await page.locator(`#stepdots [data-step="${id}"]`).click(); await page.waitForTimeout(250); };
const title = (page) => page.locator('#stepTitle').innerText().then(t => t.trim());
const counter = (page) => page.locator('#progressText').innerText().then(t => t.trim());
const mode = (page) => page.evaluate(() => [...document.querySelectorAll('#stepContent [data-path="reviewMode"]')].find(b => b.classList.contains('selected'))?.dataset.value ?? null);
const panelText = (page) => page.locator('#stepContent').innerText();
const rowText = (page, key) => page.locator(`#stepContent [data-row="${key}"] dd`).innerText();
// The engine's own output for the design currently open (the same core the app uses).
const model = (page, design) => page.evaluate((d) => { const m = window.DeckCore.make(window.DeckCore.sanitize(d)); return { stats: m.stats, counts: m.counts, materials: m.materials, alerts: m.alerts, geometry: { deckLineResolved: m.geometry.deckLineResolved, surfaces: m.geometry.surfaces } }; }, design);
const internal = async (page, tab) => { await page.locator('#stepContent [data-path="reviewMode"][data-value="internal"]').click(); await page.waitForTimeout(150); await page.locator(`#stepContent [data-path="reviewTab"][data-value="${tab}"]`).click(); await page.waitForTimeout(150); };
const clearToast = (page) => page.evaluate(() => document.getElementById('toast').classList.remove('show'));

test('C3 Review opens in Customer mode every time step 9 is entered (Next, Back/step bar, after Internal); finished 3D, framing hidden', async () => {
  const { ctx, page, errors } = await newPage();
  await openDesign(page, CENSUS_DESIGN);
  await step(page, 8); await page.locator('#nextBtn').click(); await page.waitForTimeout(400);
  assert.equal(await title(page), 'Review & Present'); assert.equal(await counter(page), 'Step 9 of 9');
  assert.equal(await mode(page), 'customer', 'Customer mode by default');
  let cam = await page.evaluate(() => window.AOSDeckStudioTest.camera()); assert.equal(cam.view, '3d', 'finished 3D design shown'); assert.equal(cam.showStructure, false, 'framing hidden');
  // Internal, then the framing view in 3D, then away and back by the step bar: Customer and finished 3D again.
  await internal(page, 'framing'); assert.equal(await mode(page), 'internal');
  await page.locator('#structureToggle').click(); await page.waitForTimeout(200); assert.equal((await page.evaluate(() => window.AOSDeckStudioTest.camera())).showStructure, true);
  await page.locator('#stepContent [data-path="reviewTab"][data-value="materials"]').click(); await page.waitForTimeout(100);
  assert.equal(await mode(page), 'internal', 'changing tabs stays in Internal');
  await step(page, 3); await step(page, 7);
  assert.equal(await mode(page), 'customer', 'returning to step 9 opens Customer again');
  cam = await page.evaluate(() => window.AOSDeckStudioTest.camera()); assert.equal(cam.view, '3d'); assert.equal(cam.showStructure, false);
  // Back to Patio and Next again: Customer.
  await internal(page, 'materials'); await page.locator('#backBtn').click(); await page.waitForTimeout(200); await page.locator('#nextBtn').click(); await page.waitForTimeout(200);
  assert.equal(await mode(page), 'customer');
  // Undo/redo while on Review does not leave Customer mode.
  assert.deepEqual(errors, []); await ctx.close();
});

for (const name of ['census (every feature)', 'b2-diagonal-double-frame-dividers', 'multi-stair', 'free-hexagon', 'L-24x18', 'freestanding'])
  test(`C3 ${name}: Customer metrics and selections match the model; no framing counts or technical warnings in the Customer panel`, async () => {
    const design = name.startsWith('census') ? CENSUS_DESIGN : ALL[name];
    const { ctx, page, errors } = await newPage();
    await openDesign(page, design); const saved = (await saveFile(page)).design; await step(page, 7);
    const m = await model(page, saved), st = m.stats;
    const metric = (k) => page.locator(`#stepContent [data-metric="${k}"] b`).innerText();
    assert.equal(await metric('deckArea'), st.deckArea.toFixed(1)); assert.equal(await metric('stairArea'), st.stairArea.toFixed(1));
    assert.equal(await metric('totalArea'), st.totalArea.toFixed(1)); assert.equal(await metric('totalRailLF'), st.totalRailLF.toFixed(1));
    assert.ok(Math.abs(st.deckArea + st.stairArea - st.totalArea) < 1e-6, 'total = deck + stairs');
    assert.match(await page.locator('#squareFeet').innerText(), new RegExp(`^${Math.round(st.deckArea)} SQ FT`), 'same deck area as the header');
    // Selections.
    assert.match(await rowText(page, 'decking'), new RegExp(`${saved.collection} · ${saved.decking}`));
    assert.match(await rowText(page, 'frame'), saved.borderCount ? new RegExp(`${saved.borderCount === 2 ? 'Double' : 'Single'} · ${saved.border}`) : /^None$/);
    if (saved.railEdges.length) assert.match(await rowText(page, 'railing'), new RegExp(`${saved.railStyle} · ${saved.railColor}`));
    assert.equal(await page.locator('#stepContent [data-row="stairs"]').count(), saved.staircases.length ? 1 : 0, 'stairs row only where present');
    if (saved.staircases.length) assert.match(await rowText(page, 'stairs'), new RegExp(`^${saved.staircases.length} staircase`));
    if (st.landings?.length) assert.match(await rowText(page, 'stairs'), /Landing /);
    assert.equal(await page.locator('#stepContent [data-row="house"]').count(), saved.houseEdges.length ? 1 : 0, 'house row only where there is a house');
    const okSlabs = (m.geometry.surfaces || []).filter(g => g.status === 'ok').length;
    assert.equal(await page.locator('#stepContent [data-row="surfaces"]').count(), okSlabs ? 1 : 0, 'patio row only where present');
    if (okSlabs) assert.equal((await rowText(page, 'surfaces')).split('\n').length, okSlabs);
    assert.equal(await page.locator('#stepContent [data-action="adjust"]').count(), 8);
    // No raw framing counts or technical warnings in the Customer panel.
    const text = await panelText(page);
    for (const w of [/joist/i, /footing/i, /\bbeam/i, /stringer/i, /blocking/i, /production review/i, /\bLF\b/]) assert.doesNotMatch(text, w, `Customer panel has no ${w}`);
    for (const a of m.alerts) assert.ok(!text.includes(a.message), 'no alert text in Customer mode');
    assert.deepEqual(errors, []); await ctx.close();
  });

for (const name of ['census (every feature)', 'b2-diagonal-double-frame-dividers', 'multi-stair', 'free-hexagon', 'L-24x18', 'cp3-turn-right-wide'])
  test(`C3 ${name}: Internal Materials and Framing keep every existing Review quantity and list every alert`, async () => {
    const design = name.startsWith('census') ? CENSUS_DESIGN : ALL[name];
    const { ctx, page, errors } = await newPage();
    await openDesign(page, design); const saved = (await saveFile(page)).design; await step(page, 7);
    const { stats: st, counts: c, materials, alerts } = await model(page, saved), D = materials.decking, B = materials.supplementalBlocking;
    const stock = (x) => Object.entries(x.stockBoards).filter(([, n]) => n).map(([l, n]) => `${n}×${l}′`).join(' + ') || '—';
    const has = async (key, ...parts) => { const t = await rowText(page, key); for (const p of parts) assert.ok(t.includes(String(p)), `${name} [${key}] "${t.replace(/\n/g, ' / ')}" includes "${p}"`); };
    // Materials: every figure the C2 Review paragraph showed (decking, landing decking, stairs, railing, flat 2×6 / blocking).
    await internal(page, 'materials');
    const mt = await panelText(page);
    assert.match(mt, /Planning estimates/); assert.match(mt, /not verified purchasing quantities/);
    assert.match(await page.locator('#stepContent [data-section="decking"] h3').innerText(), new RegExp({ horizontal: 'horizontal', vertical: 'vertical', 'diagonal-left': 'diagonal left', 'diagonal-right': 'diagonal right' }[D.direction], 'i'));
    await has('field', `${D.field.lf.toFixed(0)} LF`, `${D.field.pieces} board`, stock(D.field), `${D.field.orderLF} LF`, `${D.field.wastePct}% waste`);
    if (D.pictureFrame.pieces) await has('picture-frame', `${D.pictureFrame.lf.toFixed(0)} LF`, `${D.pictureFrame.pieces} board`, stock(D.pictureFrame), `${D.pictureFrame.orderLF} LF`);
    else assert.equal(await page.locator('#stepContent [data-row="picture-frame"]').count(), 0);
    if (D.dividers.pieces) await has('dividers', `${D.dividers.lf.toFixed(0)} LF`, `${D.dividers.pieces} board`, stock(D.dividers), `${D.dividers.orderLF} LF`);
    else assert.equal(await page.locator('#stepContent [data-row="dividers"]').count(), 0);
    if (D.note) assert.ok(mt.includes(D.note), 'planning note');
    if (c.landings) {
      await has('landing-field', `${c.landingFieldLF.toFixed(1)} LF`, `${c.landingFieldBoards} board`, `Order ${c.landingFieldOrderLF} LF`);
      if (c.landingFrameBoards) await has('landing-frame', `${c.landingFrameLF.toFixed(1)} LF`, `${c.landingFrameBoards} board`, `Order ${c.landingFrameOrderLF} LF`);
    } else assert.equal(await page.locator('#stepContent [data-section="landing-decking"]').count(), 0);
    if (saved.staircases.length) { await has('staircases', saved.staircases.length); await has('treads', c.treads); await has('risers', c.risers); await has('stringers', c.stringers); }
    await has('rail-deck', `${st.deckRailLF.toFixed(1)} LF`); await has('rail-stair', `${st.stairRailLF.toFixed(1)} LF`); await has('rail-total', `${st.totalRailLF.toFixed(1)} LF`);
    const blocking = async () => {
      await has('picture-flat', `${c.pictureFlatBlocks} run`, `${st.pictureFrameFlatLF.toFixed(1)} LF`); await has('divider-flat', `${c.dividerFlatBlocks} piece`, `${st.dividerFlatLF.toFixed(1)} LF`);
      if (c.landingFlat2x6) await has('landing-flat', `${c.landingFlat2x6} run`, `${c.landingFlat2x6LF.toFixed(1)} LF`);
      if (c.landingBlocking) await has('landing-blocks', c.landingBlocking);
      if (B?.fieldEndBlocks) await has('field-end-blocks', `${B.fieldEndBlocks} supplemental blocks`); else assert.equal(await page.locator('#stepContent [data-row="field-end-blocks"]').count(), 0);
    };
    await blocking();
    if (name.startsWith('census')) await page.screenshot({ path: path.join(SHOTS, 'c3-desktop-internal-materials.png') });
    // Framing: every framing count from the old paragraph, plus ledgers/footings, and every alert.
    await page.locator('#stepContent [data-path="reviewTab"][data-value="framing"]').click(); await page.waitForTimeout(150);
    const ft = await panelText(page);
    assert.match(ft, /Structural status: preliminary concept/); assert.match(ft, /Not engineered and not code-verified/);
    assert.doesNotMatch(ft, /\bapproved for construction\b|\bengineer(ed|ing) approv/i, 'no claim of approval');
    assert.match(await page.locator('#stepContent [data-note="structural-status"] .rv-count').innerText(), new RegExp(`^${alerts.length} open review item`));
    await has('joists', `${c.joists} × ${st.joistNominal}`, `${c.joistSpacingIn}″`); await has('beams', `${c.beams}`); await has('posts', c.posts); await has('footings', c.footings);
    await has('ledgers', `${st.ledgerCount} preliminary`); await has('picture-joists', c.pictureSupportJoists); await has('divider-joists', c.dividerSupportJoists);
    if (saved.staircases.length) await has('stringers', c.stringers);
    if (c.landings) { await has('landings', c.landings, 'concept, not approved'); if (c.turningStairs) await has('landings', `${c.turningStairs} turning`); await has('landing-posts', c.landingPosts); await has('landing-footings', c.landingFootings); await has('landing-framing', c.landingFraming); }
    await blocking();
    for (const lvl of ['warning', 'review', 'info']) {
      // C3 cleanup: the screen names the current step for the patio alert; every other word is the engine's.
      const want = alerts.filter(a => a.level === lvl).map(a => a.message.split('House & Height → Patio & walkway').join('Step 8 — Patio & Walkway'));
      const got = await page.locator(`#stepContent .rv-issues[data-level="${lvl}"] li`).allInnerTexts();
      assert.deepEqual(got, want, `${name}: every ${lvl} alert listed, in order, word for word`);
    }
    assert.equal(await page.locator('#stepContent .rv-issues li').count(), alerts.length, 'nothing extra, nothing missing');
    if (name.startsWith('census')) await page.screenshot({ path: path.join(SHOTS, 'c3-desktop-internal-framing.png') });
    // The two download buttons are in every Review view.
    for (const v of ['customer', 'internal']) { await page.locator(`#stepContent [data-path="reviewMode"][data-value="${v}"]`).click(); await page.waitForTimeout(100);
      assert.equal(await page.locator('#stepContent [data-action="export-concept"]').count(), 1); assert.equal(await page.locator('#stepContent [data-action="download-json"]').count(), 1); }
    assert.deepEqual(errors, []); await ctx.close();
  });

for (const [vp, size] of VIEWPORTS) test(`C3 ${vp}: each of the eight Available Adjustments opens its existing editor; Return to Review restores step 9 in Customer mode`, async () => {
  const { ctx, page, errors, press } = await newPage(size);
  await openDesign(page, CENSUS_DESIGN); await step(page, 7);
  // The design file from Review (identical to Projects › Download current; the Projects button is hidden on phones).
  const reviewFile = async () => JSON.parse((await download(page, async () => { const b = page.locator('#stepContent [data-action="download-json"]'); await b.scrollIntoViewIfNeeded(); await press(b); })).text);
  const before = await reviewFile();
  if (vp !== 'tablet') await page.screenshot({ path: path.join(SHOTS, `c3-${vp}-customer.png`) });
  for (const [id, label, editor] of ADJUST) {
    const btn = page.locator(`#stepContent [data-action="adjust"][data-adjust="${id}"]`);
    assert.equal((await btn.innerText()).replace(/›/, '').trim(), label);
    await btn.scrollIntoViewIfNeeded(); await press(btn); await page.waitForTimeout(250);
    assert.equal(await title(page), editor, `${label} opens ${editor}`);
    assert.equal(await page.locator('#stepdots [aria-current="step"]').getAttribute('data-step'), String(id), 'the existing step (same internal ID)');
    assert.equal(await page.locator('#stepContent [data-action="adjust"]').count(), 0, 'not a copy of the Review panel');
    const back = page.locator('#stepContent [data-action="return-review"]');
    assert.equal(await back.count(), 1); assert.equal((await back.innerText()).trim(), '↩ Return to Review');
    const vis = await back.evaluate((el) => { const r = el.getBoundingClientRect(), p = document.getElementById('stepContent').getBoundingClientRect(), f = document.querySelector('.inspector-footer').getBoundingClientRect(); return r.top >= p.top - 1 && r.bottom <= p.bottom + 1 && r.bottom <= f.top + 1; });
    assert.ok(vis, `${label}: Return to Review is visible at the top of the editor, above Back/Next`);
    if (id === 5 && vp !== 'tablet') await page.screenshot({ path: path.join(SHOTS, `c3-${vp}-adjust-railings.png`) });
    await press(back); await page.waitForTimeout(300);
    assert.equal(await title(page), 'Review & Present'); assert.equal(await counter(page), 'Step 9 of 9'); assert.equal(await mode(page), 'customer');
    assert.equal(await page.evaluate(() => document.getElementById('stepContent').scrollTop), 0, 'Review opens at the top');
    assert.equal(await page.locator('#stepContent [data-action="return-review"]').count(), 0);
  }
  // Opening an editor and returning changes nothing in the project.
  const after = await reviewFile();
  for (const k of ['design', 'componentModel', 'counts', 'alerts']) assert.deepEqual(after[k], before[k], `no change: ${k}`);
  // From Internal mode too: switch, then open an editor from Customer again after returning.
  await press(page.locator('#stepContent [data-path="reviewMode"][data-value="internal"]')); await page.waitForTimeout(150); assert.equal(await mode(page), 'internal');
  await press(page.locator('#stepContent [data-path="reviewMode"][data-value="customer"]')); await page.waitForTimeout(150); assert.equal(await mode(page), 'customer');
  assert.deepEqual(errors, []); await ctx.close();
});

test('C3 changes made through quick adjustments persist: railing color and deck width; Undo/Redo from Review; 2D/3D; save and reopen', async () => {
  const { ctx, page, errors } = await newPage();
  await openDesign(page, CENSUS_DESIGN); await step(page, 7);
  const m0 = await model(page, (await saveFile(page)).design);
  // Railings → Railing finish → Bronze for every railed edge → Return to Review.
  await page.locator('#stepContent [data-action="adjust"][data-adjust="5"]').click(); await page.waitForTimeout(250);
  await page.locator('#stepContent [data-path="railTab"][data-value="finish"]').click(); await page.waitForTimeout(150);
  await page.locator('#stepContent [data-path="railColor"][data-value="Bronze"]').click(); await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SHOTS, 'c3-desktop-adjust-railings-bronze.png') });
  await page.locator('#stepContent [data-action="return-review"]').click(); await page.waitForTimeout(400);
  assert.equal(await mode(page), 'customer'); assert.match(await rowText(page, 'railing'), /Westbury Tuscany · Bronze/);
  const rails = await page.evaluate(() => window.AOSDeckStudioTest.scene3d().parts.filter(p => /^stair-(top-rail|bottom-rail|baluster|rail-post)$/.test(p.kind)).map(p => p.color));
  assert.ok(rails.length && rails.every(c => c === '#635849'), '3D stair railings are Bronze');
  await clearToast(page); await page.screenshot({ path: path.join(SHOTS, 'c3-desktop-returned-to-review.png') });
  // Shape & Size → width 22 → Return: metrics follow the model.
  await page.locator('#stepContent [data-action="adjust"][data-adjust="0"]').click(); await page.waitForTimeout(250);
  const w = page.locator('#stepContent input[data-field="width"]').first(); await w.fill('22'); await w.dispatchEvent('change');
  await page.waitForFunction(() => /308 SQ FT/.test(document.getElementById('squareFeet').textContent)); await page.waitForTimeout(200);
  assert.equal(await page.locator('#stepContent [data-action="return-review"]').count(), 1, 'the way back is still offered after an edit');
  await page.locator('#stepContent [data-action="return-review"]').click(); await page.waitForTimeout(400);
  const d1 = (await saveFile(page)).design, m1 = await model(page, d1);
  assert.equal(d1.width, 22); assert.equal(d1.railColor, 'Bronze');
  assert.equal(await page.locator('#stepContent [data-metric="deckArea"] b').innerText(), m1.stats.deckArea.toFixed(1)); assert.equal(m1.stats.deckArea, 308);
  // Undo from Review: width back (Review stays in Customer mode and shows the restored figure); redo.
  await page.locator('#undoBtn').click(); await page.waitForTimeout(300);
  assert.equal(await title(page), 'Review & Present'); assert.equal(await mode(page), 'customer');
  assert.equal(await page.locator('#stepContent [data-metric="deckArea"] b').innerText(), m0.stats.deckArea.toFixed(1));
  assert.equal((await saveFile(page)).design.width, 20);
  await page.locator('#redoBtn').click(); await page.waitForTimeout(300);
  assert.equal(await page.locator('#stepContent [data-metric="deckArea"] b').innerText(), '308.0');
  // 2D plan agrees.
  await page.locator('#mode2d').click(); await page.waitForTimeout(200); assert.match(await page.locator('#squareFeet').innerText(), /^308 SQ FT/);
  // Save and reopen in a fresh page: the same Review figures.
  const saved = await saveFile(page);
  const fresh = await newPage(); await openDesign(fresh.page, saved.design); await step(fresh.page, 7);
  for (const k of ['deckArea', 'stairArea', 'totalArea', 'totalRailLF']) assert.equal(await fresh.page.locator(`#stepContent [data-metric="${k}"] b`).innerText(), await page.locator(`#stepContent [data-metric="${k}"] b`).innerText(), `reopened ${k}`);
  assert.match(await rowText(fresh.page, 'railing'), /Bronze/);
  const again = await saveFile(fresh.page); for (const k of ['design', 'componentModel', 'counts', 'alerts']) assert.deepEqual(again[k], saved[k], `reopen unchanged: ${k}`);
  assert.equal(again.schemaVersion, 6);
  assert.deepEqual(fresh.errors, []); await fresh.ctx.close();
  assert.deepEqual(errors, []); await ctx.close();
});

test('C3 normal navigation after a quick adjustment is never forced back to Review; reaching Review ends the shortcut', async () => {
  const { ctx, page, errors } = await newPage();
  await openDesign(page, CENSUS_DESIGN); await step(page, 7);
  await page.locator('#stepContent [data-action="adjust"][data-adjust="1"]').click(); await page.waitForTimeout(250);
  assert.equal(await title(page), 'House & Height');
  await page.locator('#nextBtn').click(); await page.waitForTimeout(250);
  assert.equal(await title(page), 'Framing & Ledger', 'Next goes to the next step as usual');
  assert.equal(await page.locator('#stepContent [data-action="return-review"]').count(), 1, 'the way back is still offered, not forced');
  await page.locator('#backBtn').click(); await page.locator('#backBtn').click(); await page.waitForTimeout(250);
  assert.equal(await title(page), 'Shape & Size', 'Back works as usual');
  await step(page, 4); assert.equal(await title(page), 'Decking Selection', 'step bar works as usual');
  await step(page, 7); assert.equal(await mode(page), 'customer');
  await step(page, 2); assert.equal(await page.locator('#stepContent [data-action="return-review"]').count(), 0, 'after Review is reached, editors open normally');
  // Opening another project clears a pending shortcut.
  await step(page, 7); await page.locator('#stepContent [data-action="adjust"][data-adjust="3"]').click(); await page.waitForTimeout(200);
  assert.equal(await page.locator('#stepContent [data-action="return-review"]').count(), 1);
  await openDesign(page, { ...CENSUS_DESIGN, project: 'Another' }); await step(page, 3);
  assert.equal(await page.locator('#stepContent [data-action="return-review"]').count(), 0);
  assert.deepEqual(errors, []); await ctx.close();
});

test('C3 existing buttons and exports: customer concept (.html), design file (.json) = Projects download, header Save project, Finish', async () => {
  const { ctx, page, errors } = await newPage();
  await openDesign(page, CENSUS_DESIGN); await step(page, 7);
  const st = (await model(page, (await saveFile(page)).design)).stats;
  // Customer concept: the same HTML concept page as before (3D image, 2D plan, summary table).
  const concept = page.locator('#stepContent [data-action="export-concept"]');
  assert.equal((await concept.innerText()).trim(), 'Download customer concept (.html)');
  const html = await download(page, () => concept.click());
  assert.match(html.name, /_AOS_Concept\.html$/);
  assert.match(html.text, /<title>AOS Deck Concept<\/title>/); assert.match(html.text, /alt="Finished 3D deck" src="data:image\/png/); assert.match(html.text, /alt="Dimensioned 2D deck" src="data:image\/png/);
  assert.ok(html.text.includes(`${st.deckArea.toFixed(1)} / ${st.stairArea.toFixed(1)} / ${st.totalArea.toFixed(1)}`)); assert.match(html.text, /No customer pricing is included/);
  assert.doesNotMatch(html.text, /%PDF/);
  // Design file: identical to Projects › Download current (apart from the time stamp).
  const json = page.locator('#stepContent [data-action="download-json"]');
  assert.equal((await json.innerText()).trim(), 'Download design file (.json)');
  const a = await download(page, () => json.click()), b = await saveFile(page), A = JSON.parse(a.text);
  assert.match(a.name, /_AOS_Deck\.json$/);
  delete A.date; delete b.date; assert.deepEqual(A, b, 'same file as Projects › Download current');
  assert.equal(A.schemaVersion, 6); assert.equal(A.structuralStatus, 'PRELIMINARY CONCEPT – AOS production review required');
  // The same two buttons work from Internal mode.
  await internal(page, 'framing'); const c = await download(page, () => page.locator('#stepContent [data-action="download-json"]').click()); assert.match(c.name, /_AOS_Deck\.json$/);
  // Header Save project stores the project (no download).
  let downloaded = false; page.on('download', () => { downloaded = true; });
  await page.locator('#saveBtn').click(); await page.waitForTimeout(400);
  assert.match(await page.locator('#toast').innerText(), /saved/i);
  // Finish: stays on Review, starts no download, says what to do; no claim of a PDF or proposal.
  await step(page, 3); await step(page, 7); await clearToast(page);
  assert.equal((await page.locator('#nextBtn').innerText()).replace(/\s+/g, ' ').trim(), 'Finish ✓');
  await page.locator('#nextBtn').click(); await page.waitForTimeout(300);
  const t = await page.locator('#toast').innerText();
  assert.match(t, /Design complete/); assert.doesNotMatch(t, /pdf|proposal/i);
  assert.equal(await title(page), 'Review & Present'); assert.equal(downloaded, false, 'Finish and Save project start no download');
  assert.deepEqual(errors, []); await ctx.close();
});

for (const [vp, size] of VIEWPORTS) test(`C3 ${vp}: Customer, Internal, Materials and Framing views scroll fully above Back/Next and their controls work by ${size.width < 800 ? 'touch' : 'mouse'}`, async () => {
  const { ctx, page, errors, press } = await newPage(size);
  await openDesign(page, CENSUS_DESIGN); await step(page, 7);
  const bottomOk = () => page.evaluate(() => { const s = document.getElementById('stepContent'); s.scrollTop = s.scrollHeight;
    const els = [...s.querySelectorAll('button, p, li, .rv-row')].filter(e => e.getBoundingClientRect().height), last = els.reduce((a, e) => (e.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom ? e : a), els[0]);
    const r = last.getBoundingClientRect(), p = s.getBoundingClientRect(), f = document.querySelector('.inspector-footer').getBoundingClientRect(), o = getComputedStyle(s).overflowY;
    return { ok: r.bottom <= p.bottom + 1 && p.bottom <= f.top + 1, o, wide: document.documentElement.scrollWidth - innerWidth, panelWide: s.scrollWidth - s.clientWidth }; });
  for (const [label, go] of [['Customer', async () => {}], ['Materials', async () => { await press(page.locator('#stepContent [data-path="reviewMode"][data-value="internal"]')); await page.waitForTimeout(150); await press(page.locator('#stepContent [data-path="reviewTab"][data-value="materials"]')); await page.waitForTimeout(150); }],
    ['Framing', async () => { await press(page.locator('#stepContent [data-path="reviewTab"][data-value="framing"]')); await page.waitForTimeout(150); }]]) {
    await go();
    await page.evaluate(() => { document.getElementById('stepContent').scrollTop = 0; });
    if (vp !== 'tablet') await page.screenshot({ path: path.join(SHOTS, `c3-${vp}-${label.toLowerCase()}-top.png`) });
    const r = await bottomOk();
    assert.equal(r.o, 'auto', `${vp} ${label}: the panel scrolls`); assert.ok(r.ok, `${vp} ${label}: last item fully above Back/Next when scrolled to the bottom`);
    assert.ok(r.wide <= 1 && r.panelWide <= 1, `${vp} ${label}: no sideways overflow`);
    if (vp !== 'tablet') await page.screenshot({ path: path.join(SHOTS, `c3-${vp}-${label.toLowerCase()}-bottom.png`) });
  }
  assert.equal(await page.locator('#stepContent [data-path="reviewTab"][data-value="framing"]').getAttribute('class').then(c => /selected/.test(c)), true);
  assert.deepEqual(errors, []); await ctx.close();
});
