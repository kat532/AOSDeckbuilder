'use strict';
// V5.3 C6 (WIP 1): Step 7 Railings — "Remove deck rails" now asks for confirmation first.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright-core');
const { loadEngine } = require('./engine');
const { designs } = require('./baseline/designs');

const APP = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const CORE = loadEngine(), ALL = designs(CORE);
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); });
test.after(async () => { await browser?.close(); });
async function newPage(viewport = { width: 1440, height: 900 }) {
  const touch = viewport.width < 800;
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, hasTouch: touch, isMobile: touch }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(APP); await page.waitForFunction(() => window.DeckCore && window.AOSDeckStudioTest);
  return { ctx, page, errors, press: (l) => (touch ? l.tap() : l.click()) };
}
async function openDesign(page, design) {
  const f = path.join(os.tmpdir(), `aos-c6-${Date.now()}-${Math.random().toString(36).slice(2)}.json`); fs.writeFileSync(f, JSON.stringify({ design }));
  await page.locator('#fileInput').setInputFiles(f); await page.waitForFunction(() => window.AOSDeckStudioTest.framingStatus() === 'current'); await page.waitForTimeout(250);
}
async function toLocations(page) { await page.locator('#stepdots [data-step="5"]').click(); await page.waitForTimeout(250);
  await page.locator('[data-path="railTab"][data-value="locations"]').click(); await page.waitForTimeout(150); }
async function saved(page) {
  const [d] = await Promise.all([page.waitForEvent('download'), (async () => { await page.locator('#openBtn').click(); await page.locator('#projectsDialog [data-action="project-download"]').click(); })()]);
  const f = path.join(os.tmpdir(), `aos-c6-dl-${Date.now()}`); await d.saveAs(f); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  return JSON.parse(fs.readFileSync(f, 'utf8')).design;
}
// A design with stair rails, several railed edges and one custom edge finish.
function railedDesign() {
  const d = CORE.DeckCore.sanitize({ ...structuredClone(ALL['default-rect-16x12']), staircases: [{ id: 's', edge: 2, width: 4, offset: 3, rails: { left: true, right: false } }] });
  assert.ok(d.railEdges.length >= 2, 'fixture has several railed edges');
  d.railOverrides = { [d.railEdges[0]]: { railColor: 'Black' } };
  return d;
}

for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`C6 railings: Remove deck rails asks first; Keep Railings changes nothing (${vp.width}px)`, async () => {
    const { ctx, page, errors, press } = await newPage(vp);
    await openDesign(page, railedDesign()); await toLocations(page);
    const desk = vp.width >= 800, summary = () => page.locator('#stepContent .rail-summary').innerText();
    const before = desk ? await saved(page) : null, sumBefore = await summary();
    const n = desk ? before.railEdges.length : Number(sumBefore.match(/\d+/)[0]);
    await press(page.locator('#stepContent [data-action="rails-none"]'));
    const dlg = page.locator('#dividerConfirm');
    assert.equal(await dlg.isVisible(), true, 'confirmation is shown');
    assert.equal(await page.locator('#dividerConfirmTitle').innerText(), 'Remove all deck railings?');
    const msg = await page.locator('#dividerConfirmMessage').innerText();
    assert.match(msg, new RegExp(`all ${n} deck edges`));
    assert.match(msg, /Stair railings/);
    assert.equal(await page.locator('#dividerConfirmAccept').innerText(), 'Remove Railings');
    assert.equal(await page.locator('#dividerConfirmCancel').innerText(), 'Keep Railings');
    if (vp.width < 800) { const box = await page.locator('#dividerConfirmAccept').boundingBox(); assert.ok(box.height >= 44, 'touch target'); }
    await press(page.locator('#dividerConfirmCancel'));
    assert.equal(await dlg.isVisible(), false);
    assert.equal(await summary(), sumBefore);
    if (desk) assert.deepEqual(await saved(page), before, 'cancel keeps the whole design unchanged');
    assert.deepEqual(errors, []); await ctx.close();
  });
}

test('C6 railings: confirming removes only deck-edge railings; shape, stairs, stair rails and product stay', async () => {
  const { ctx, page, errors } = await newPage();
  await openDesign(page, railedDesign()); await toLocations(page);
  const before = await saved(page);
  await page.locator('#stepContent [data-action="rails-none"]').click();
  await page.locator('#dividerConfirmAccept').click(); await page.waitForTimeout(250);
  const after = await saved(page);
  assert.deepEqual(after.railEdges, []);
  // perimeter is derived from the railings: only rail segments may become open; nothing else in it changes.
  before.perimeter.segments.forEach((b, i) => { const a = after.perimeter.segments[i];
    assert.deepEqual({ ...a, kind: 0, product: 0, color: 0, custom: 0 }, { ...b, kind: 0, product: 0, color: 0, custom: 0 });
    assert.equal(a.kind, b.kind === 'rail' ? 'open' : b.kind, `segment ${i + 1} kind`); });
  assert.ok(after.staircases[0].rails.left && !after.staircases[0].rails.right, 'stair rails kept');
  for (const k of Object.keys(before)) if (!['railEdges', 'railOverrides', 'perimeter'].includes(k)) assert.deepEqual(after[k], before[k], `${k} unchanged`);
  assert.match(await page.locator('#stepContent').innerText(), /0 deck edges selected/);
  assert.deepEqual(errors, []); await ctx.close();
});

test('C6 railings: with no deck rails, Remove deck rails does not open a dialog', async () => {
  const { ctx, page, errors } = await newPage();
  const d = railedDesign(); d.railEdges = []; d.railOverrides = {};
  await openDesign(page, d); await toLocations(page);
  await page.locator('#stepContent [data-action="rails-none"]').click(); await page.waitForTimeout(150);
  assert.equal(await page.locator('#dividerConfirm').isVisible(), false);
  assert.match(await page.locator('#toast').innerText(), /No deck edges have railings to remove/);
  assert.deepEqual(errors, []); await ctx.close();
});
