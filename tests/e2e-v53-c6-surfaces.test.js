'use strict';
// V5.3 C6 Step 8 — Patio & Walkway: clear selection, exact sizes, position, and the preliminary
// 4-inch concrete estimate (sq ft = W × L; cu ft = sq ft × 4/12; cu yd = cu ft ÷ 27).
const test = require('node:test');
const H = require('./c6-helpers');
const { assert, CORE, ALL, VIEWPORTS, openDesign, step, intent, colors, click, saveFile, reopen, undo, redo, model, without } = H;
const h = H.harness(test);

const BASE = { shape: 'rectangle', width: 16, depth: 12, height: 5, houseEdges: [0], staircases: [{ id: 's', edge: 2, width: 4, offset: 3, rails: { left: true, right: true } }] };
const est = (list) => { const sq = list.reduce((a, s) => a + s.width * s.length, 0); return { sq, cf: sq * 4 / 12, cy: sq * 4 / 12 / 27 }; };
const f = (v, d) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const rowText = (e) => `${f(e.sq, 1)} sq ft\t${f(e.cf, 1)} cu ft\t${f(e.cy, 2)} cu yd`;
const box = (page) => page.locator('#stepContent .concrete-estimate');
const field = async (page, k, v) => { const l = page.locator(`#stepContent input[data-surface-field="${k}"]`); await l.fill(v); await l.dispatchEvent('change'); await H.settle(page); };
// The deck, stairs, railings and framing must not change when only surfaces change.
function assertDeckUnchanged(before, after, msg) {
  assert.deepEqual(without(after, ['surfaces']), without(before, ['surfaces']), `${msg}: no deck field changes`);
  const strip = (m) => ({ parts: m.parts.filter(p => p.kind !== 'concrete-surface').map(({ id, ...p }) => p), /* ids are a running number */ counts: m.counts, materials: m.materials, stats: without(m.stats, ['partCount']) /* total includes the slabs */, edges: m.geometry.edges, poly: m.geometry.poly, stairs: m.geometry.stairs });
  assert.deepEqual(strip(model(after)), strip(model(before)), `${msg}: deck, stairs, framing and materials identical`);
}

test('C6 surfaces: add a patio and a walkway, select each by name, see type, size, position and the 4 in. estimate', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, BASE); await step(page, 8);
  const I0 = await intent(page);
  await click(page, '#stepContent [data-action="surface-add"][data-value="patio"]');
  await click(page, '#stepContent [data-action="surface-add"][data-value="walkway"]');
  const I = await intent(page), [p, w] = I.surfaces;
  assert.equal(p.type, 'patio'); assert.equal(w.type, 'walkway');
  assertDeckUnchanged(I0, I, 'adding surfaces');
  // List shows both, walkway selected
  const list = page.locator('#stepContent .surface-list [data-action="surface-pick"]');
  assert.equal(await list.count(), 2);
  assert.match(await list.nth(0).innerText(), /Patio 1/); assert.match(await list.nth(1).innerText(), /Walkway 1/);
  assert.equal(await list.nth(1).getAttribute('aria-pressed'), 'true');
  let sel = await page.locator('#stepContent .surface-selected').innerText();
  assert.match(sel, /Selected: Walkway 1/); assert.match(sel, /Walkway · a path/); assert.match(sel, /from the deck|touches or runs under the deck/);
  assert.equal(await page.locator('#stepContent [data-action="surface-remove"]').innerText(), 'Delete Walkway 1');
  // Estimate: selected and all
  assert.equal(await box(page).getAttribute('data-thickness-in'), '4');
  const rows = await box(page).locator('tr').allInnerTexts();
  assert.equal(rows[0], `Walkway 1\t${rowText(est([w]))}`); assert.equal(rows[1], `All shown (2)\t${rowText(est([p, w]))}`);
  assert.match(await box(page).innerText(), /Preliminary concrete estimate/i); assert.match(await box(page).innerText(), /Estimating quantities only/);
  // Select the patio by name
  await click(page, '#stepContent .surface-list [data-index="0"]');
  sel = await page.locator('#stepContent .surface-selected').innerText();
  assert.match(sel, /Selected: Patio 1/); assert.match(sel, /Patio · a slab/);
  assert.equal((await box(page).locator('tr').allInnerTexts())[0], `Patio 1\t${rowText(est([p]))}`);
  assert.deepEqual(await intent(page), I, 'selecting changes nothing');
  // 2D/3D: one slab part each
  await page.locator('#mode3d').click(); await page.waitForTimeout(400);
  const c = await colors(page); assert.equal(c.view3d['concrete-surface'].count, 2); assert.deepEqual(c.view3d, c.plan);
  await page.locator('#mode2d').click(); await page.waitForTimeout(200);
  // Separate from deck area
  const m = model(I); assert.equal(m.stats.deckArea, model(I0).stats.deckArea, 'deck square footage excludes surfaces');
  assert.deepEqual(errors, []); await ctx.close();
});

test('C6 surfaces: exact feet-and-inches entry, rounding to the inch, limits, rotation, Undo/Redo and save/reopen', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, BASE); await step(page, 8);
  const I0 = await intent(page);
  await click(page, '#stepContent [data-action="surface-add"][data-value="patio"]');
  await field(page, 'width', "12' 6\""); await field(page, 'length', '10 3');
  let s = (await intent(page)).surfaces[0];
  assert.equal(s.width, 12.5); assert.equal(s.length, 10.25);
  assert.equal((await box(page).locator('tr').allInnerTexts())[0], `Patio 1\t${rowText(est([s]))}`);
  assert.equal(rowText(est([s])), '128.1 sq ft\t42.7 cu ft\t1.58 cu yd', 'hand check: 12.5 × 10.25 = 128.125 sq ft; × 4/12 = 42.708 cu ft; ÷ 27 = 1.582 cu yd');
  await field(page, 'width', '7.333'); s = (await intent(page)).surfaces[0];
  assert.ok(Math.abs(s.width - 88 / 12) < 1e-3, '7.333 ft rounds to 7 ft 4 in');
  await field(page, 'width', '50'); assert.ok(Math.abs((await intent(page)).surfaces[0].width - 88 / 12) < 1e-3, 'over the patio limit is refused');
  assert.match(await page.locator('#toast').innerText(), /Patio width must be from/);
  await click(page, '#stepContent [data-action="surface-rotate"][data-value="15"]');
  const a = (await intent(page)).surfaces[0].angle;
  assert.match(await page.locator('#stepContent .surface-selected').innerText(), new RegExp(`turned ${Math.round(a)}°`));
  const I1 = await intent(page);
  assertDeckUnchanged(I0, I1, 'editing a patio');
  await undo(page); assert.notEqual((await intent(page)).surfaces[0].angle, a); await redo(page); assert.deepEqual(await intent(page), I1);
  const { file, data } = await saveFile(page);
  assert.deepEqual(data.design.surfaces, I1.surfaces);
  const r = await reopen(h, file); await step(r.page, 8);
  assert.deepEqual(await r.page.evaluate(() => window.AOSDeckStudioTest.intent()), I1, 'orientation, position and size persist');
  assert.equal((await r.page.locator('#stepContent .concrete-estimate tr').allInnerTexts())[0], `Patio 1\t${rowText(est(I1.surfaces))}`);
  assert.deepEqual([...errors, ...r.errors], []); await ctx.close(); await r.ctx.close();
});

test('C6 surfaces: deleting the selected surface removes only that one; several surfaces of each type are numbered', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, ALL['b3-showcase']); await step(page, 8);
  await click(page, '#stepContent [data-action="surface-add"][data-value="patio"]');
  await click(page, '#stepContent [data-action="surface-add"][data-value="walkway"]');
  const I = await intent(page); assert.equal(I.surfaces.length, 4);
  const names = await page.locator('#stepContent .surface-list [data-action="surface-pick"]').allInnerTexts();
  assert.deepEqual(names.map(n => n.split(' · ')[0]), ['Patio 1', 'Walkway 1', 'Patio 2', 'Walkway 2']);
  const shown = I.surfaces.filter(s => model(I).geometry.surfaces.find(g => g.id === s.id).status === 'ok');
  assert.equal((await box(page).locator('tr').allInnerTexts())[1], `All shown (${shown.length})\t${rowText(est(shown))}`);
  await click(page, '#stepContent .surface-list [data-index="1"]');
  assert.equal(await page.locator('#stepContent [data-action="surface-remove"]').innerText(), 'Delete Walkway 1');
  await click(page, '#stepContent [data-action="surface-remove"]');
  const I2 = await intent(page);
  assert.deepEqual(I2.surfaces, I.surfaces.filter((_, i) => i !== 1), 'only Walkway 1 removed; the others are untouched');
  assertDeckUnchanged(I, I2, 'removing a walkway');
  await undo(page); assert.deepEqual(await intent(page), I, 'undo restores it');
  assert.deepEqual(errors, []); await ctx.close();
});

test('C6 surfaces: a surface hidden by the house is flagged and left out of the total', async () => {
  const { ctx, page, errors } = await h.newPage();
  const d = { ...BASE, surfaces: [{ id: 'ok', type: 'patio', x: 8, z: 20, width: 10, length: 8 }, { id: 'bad', type: 'patio', x: 8, z: -6, width: 10, length: 8 }] };
  await openDesign(page, d); await step(page, 8);
  const I = await intent(page), g = model(I).geometry.surfaces;
  assert.equal(g.find(x => x.id === 'bad').status !== 'ok', true, 'fixture: second patio runs into the house');
  const rows = await box(page).locator('tr').allInnerTexts();
  assert.equal(rows[1], `All shown (1)\t${rowText(est([I.surfaces[0]]))}`);
  assert.match(await box(page).innerText(), /1 hidden surface is not counted/);
  assert.match(await page.locator('#stepContent .surface-list [data-index="1"]').innerText(), /⚠/);
  assert.deepEqual(errors, []); await ctx.close();
});

for (const vp of ['desktop', 'tablet', 'phone']) {
  test(`C6 surfaces: ${vp} — list, selection and estimate readable; touch targets; no sideways scroll`, async () => {
    const { ctx, page, errors, press } = await h.newPage(VIEWPORTS[vp]);
    await openDesign(page, ALL['b3-showcase']); await step(page, 8);
    await click(page, '#stepContent .surface-list [data-index="0"]', press);
    for (const b of await page.locator('#stepContent .surface-list button').all()) { const bb = await b.boundingBox(); assert.ok(bb.height >= 44); }
    await page.locator('#stepContent .concrete-estimate').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#stepContent .concrete-estimate').isVisible(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: H.path.join(H.SHOTS, `c6-step8-surfaces-${vp}.png`) });
    assert.deepEqual(errors, []); await ctx.close();
  });
}
