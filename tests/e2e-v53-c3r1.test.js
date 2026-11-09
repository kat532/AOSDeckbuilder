// V5.3 C3 cleanup revision 1 (owner approval 8 Nov 2026, after reviewing C3):
//   1. Review's "Deck Shape & Size" shortcut opens the plain Shape & Size panel: a left-open edge or
//      corner editor is closed (as its own Done/Cancel would); geometry and dimensions are untouched.
//      Step-bar navigation keeps its existing behaviour (the selection stays open).
//   2. Visible version labels say V5.3: browser title, header, customer concept.
//   3. On screen, the patio/walkway alert names "Step 8 — Patio & Walkway". The engine's alert text,
//      the saved file and the engine-output baselines are unchanged.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright-core');
const { CENSUS_DESIGN } = require('./ui-census');

const ROOT = path.join(__dirname, '..');
const APP = pathToFileURL(path.join(ROOT, 'index.html')).href;
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const SHOTS = path.join(ROOT, 'test-results', 'screenshots');
const OLD = 'Move or resize it in House & Height → Patio & walkway.', NEW = 'Move or resize it in Step 8 — Patio & Walkway.';
const SLAB_IN_HOUSE = { ...CENSUS_DESIGN, surfaces: [...CENSUS_DESIGN.surfaces, { id: 'bad', type: 'patio', x: 0, z: -6, width: 10, length: 6, angle: 0 }] };

let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); fs.mkdirSync(SHOTS, { recursive: true }); });
test.after(async () => { await browser?.close(); });
async function newPage(viewport = { width: 1440, height: 900 }) {
  const touch = viewport.width < 800;
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, hasTouch: touch, isMobile: touch }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(APP); await page.waitForFunction(() => window.DeckCore && window.AOSDeckStudioTest);
  return { ctx, page, errors };
}
async function openDesign(page, design) {
  const f = path.join(os.tmpdir(), `aos-c3r1-${Date.now()}-${Math.random().toString(36).slice(2)}.json`); fs.writeFileSync(f, JSON.stringify({ design }));
  await page.locator('#fileInput').setInputFiles(f); await page.waitForFunction(() => window.AOSDeckStudioTest.framingStatus() === 'current'); await page.waitForTimeout(250);
  await page.evaluate(() => document.getElementById('toast').classList.remove('show'));
}
async function download(page, run) {
  const [d] = await Promise.all([page.waitForEvent('download'), run()]);
  const f = path.join(os.tmpdir(), `aos-c3r1-dl-${Date.now()}-${Math.random().toString(36).slice(2)}`); await d.saveAs(f);
  return { name: d.suggestedFilename(), text: fs.readFileSync(f, 'utf8') };
}
const designFile = async (page) => { if ((await page.locator('#stepTitle').innerText()).trim() !== 'Review & Present') await step(page, 7);
  return JSON.parse((await download(page, () => page.locator('#stepContent [data-action="download-json"]').click())).text); };
const step = async (page, id) => { await page.locator(`#stepdots [data-step="${id}"]`).click(); await page.waitForTimeout(250); };
const tapPlan = async (page, fn) => { const p = await page.evaluate(fn); await page.mouse.click(p[0], p[1]); await page.waitForTimeout(250); };
const edgeMid = (i) => `(() => { const e = window.AOSDeckStudioTest.edges()[${i}]; return window.AOSDeckStudioTest.toScreen(e.mid[0], e.mid[1]); })()`;
const vertex = (i) => `(() => { const e = window.AOSDeckStudioTest.edges()[${i}]; return window.AOSDeckStudioTest.toScreen(e.a[0], e.a[1]); })()`;
const plainShape = (page) => page.evaluate(() => { const c = document.getElementById('stepContent');
  return { size: !!c.querySelector('input[data-field="width"]') && !!c.querySelector('input[data-field="depth"]') && !!c.querySelector('[data-action="choose-shape"]'), edge: !!c.querySelector('[data-action="done-edge"]'), corner: !!c.querySelector('[data-action="cancel-corner"]'), back: !!c.querySelector('[data-action="return-review"]') }; });

for (const [what, select, editor] of [['edge', edgeMid(1), 'edge'], ['corner', vertex(2), 'corner']])
  test(`C3r1 a left-open ${what} editor: the step bar keeps it (as before); Review's Shape & Size shortcut opens the plain panel; geometry unchanged`, async () => {
    const { ctx, page, errors } = await newPage();
    await openDesign(page, CENSUS_DESIGN);
    const before = await designFile(page);
    await step(page, 0); await tapPlan(page, select);
    let s = await plainShape(page); assert.equal(s[editor], true, `${what} editor open`);
    // Normal navigation keeps the existing behaviour.
    await step(page, 3); await step(page, 0);
    s = await plainShape(page); assert.equal(s[editor], true, `step bar: the ${what} editor is still open, as before`);
    // From Review: the plain panel, with the way back.
    await step(page, 7); await page.locator('#stepContent [data-action="adjust"][data-adjust="0"]').click(); await page.waitForTimeout(250);
    s = await plainShape(page);
    assert.deepEqual(s, { size: true, edge: false, corner: false, back: true }, 'plain Shape & Size panel with Return to Review');
    assert.equal((await page.locator('#stepTitle').innerText()).trim(), 'Shape & Size');
    if (what === 'corner') await page.screenshot({ path: path.join(SHOTS, 'c3r1-shape-shortcut-plain-panel.png') });
    // Nothing about the deck changed; Undo has nothing new to undo.
    await page.locator('#stepContent [data-action="return-review"]').click(); await page.waitForTimeout(250);
    const after = await designFile(page);
    for (const k of ['design', 'componentModel', 'counts', 'alerts']) assert.deepEqual(after[k], before[k], `unchanged: ${k}`);
    // Dimensions typed from the shortcut still apply (and only the dimension changes).
    await page.locator('#stepContent [data-action="adjust"][data-adjust="0"]').click(); await page.waitForTimeout(200);
    const w = page.locator('#stepContent input[data-field="width"]').first(); await w.fill('22'); await w.dispatchEvent('change');
    await page.waitForFunction(() => /308 SQ FT/.test(document.getElementById('squareFeet').textContent));
    await page.locator('#stepContent [data-action="return-review"]').click(); await page.waitForTimeout(300);
    const d = (await designFile(page)).design; assert.equal(d.width, 22); assert.equal(d.depth, before.design.depth);
    assert.equal(await page.locator('#stepContent [data-metric="deckArea"] b').innerText(), '308.0');
    assert.deepEqual(errors, []); await ctx.close();
  });

test('C3r1 version labels: browser title, header and customer concept say V5.3', async () => {
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const { ctx, page, errors } = await newPage(vp);
    assert.equal(await page.title(), 'AOS Deck Studio V5.3');
    const html = await page.content();
    assert.ok(html.includes('<small>V5.3 · DECK STUDIO</small>')); assert.ok(!html.includes('V5.2 · DECK STUDIO'));
    if (vp.width > 800) assert.equal((await page.locator('.brandtext small').innerText()).trim(), 'V5.3 · DECK STUDIO');
    await openDesign(page, CENSUS_DESIGN); await step(page, 7);
    if (vp.width > 800) await page.screenshot({ path: path.join(SHOTS, 'c3r1-header-v53.png'), clip: { x: 0, y: 0, width: 760, height: 120 } });
    const c = await download(page, async () => { const b = page.locator('#stepContent [data-action="export-concept"]'); await b.scrollIntoViewIfNeeded(); await b.click(); });
    assert.match(c.text, /<div class="sub">Deck concept · V5\.3 census deck · V5\.3<\/div>/); assert.doesNotMatch(c.text, /V5\.2/);
    if (vp.width > 800) fs.writeFileSync(path.join(SHOTS, 'c3r1-customer-concept.html'), c.text);
    assert.deepEqual(errors, []); await ctx.close();
  }
});

test('C3r1 patio alert: the screen names "Step 8 — Patio & Walkway"; the engine alert and the saved file keep the original text', async () => {
  const { ctx, page, errors } = await newPage();
  await openDesign(page, SLAB_IN_HOUSE);
  const raw = await page.evaluate((d) => window.DeckCore.make(window.DeckCore.sanitize(d)).alerts, SLAB_IN_HOUSE);
  const slab = raw.filter(a => a.message.includes(OLD));
  assert.equal(slab.length, 1, 'the engine reports the slab in the house, with its original wording'); assert.equal(slab[0].level, 'warning');
  // Step bar: the warning dot is on Step 8 (Patio & Walkway), not House & Height.
  assert.equal(await page.locator('#stepdots [data-step="8"] .step-alert').count(), 1); assert.equal(await page.locator('#stepdots [data-step="1"] .step-alert').count(), 0);
  // Review › Internal › Framing: corrected location, every other word identical.
  await step(page, 7); await page.locator('#stepContent [data-path="reviewMode"][data-value="internal"]').click(); await page.locator('#stepContent [data-path="reviewTab"][data-value="framing"]').click(); await page.waitForTimeout(150);
  const shown = await page.locator('#stepContent .rv-issues[data-level="warning"] li').allInnerTexts();
  const want = raw.filter(a => a.level === 'warning').map(a => a.message.split('House & Height → Patio & walkway').join('Step 8 — Patio & Walkway'));
  assert.deepEqual(shown, want); assert.ok(shown.some(t => t.endsWith(NEW)), 'shows Step 8 — Patio & Walkway');
  assert.ok(!(await page.locator('#stepContent').innerText()).includes('House & Height → Patio'), 'old location not shown');
  assert.equal(await page.locator('#stepContent .rv-issues li').count(), raw.length, 'every alert still listed');
  await page.locator('#stepContent .rv-issues[data-level="warning"]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(SHOTS, 'c3r1-patio-alert-step8.png') });
  // Customer mode: no warning text at all.
  await page.locator('#stepContent [data-path="reviewMode"][data-value="customer"]').click(); await page.waitForTimeout(150);
  const ct = await page.locator('#stepContent').innerText(); assert.ok(!ct.includes(NEW) && !ct.includes(OLD));
  // The saved file keeps the engine's text unchanged (schema 6).
  const f = await designFile(page);
  assert.deepEqual(f.alerts, raw, 'saved alerts are the raw engine alerts'); assert.ok(f.alerts.some(a => a.message.endsWith(OLD))); assert.equal(f.schemaVersion, 6);
  assert.deepEqual(errors, []); await ctx.close();
});
