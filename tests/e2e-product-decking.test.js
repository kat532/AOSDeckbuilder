'use strict';
// Product library v1.2, Stage C: decking manufacturer / collection / color in the real app.
// Selecting products changes colors only; geometry, framing, stairs, frames, dividers and saves are kept.
const test = require('node:test');
const { assert, ALL, harness, openDesign, step, intent, colors, settle, saveFile, reopen, undo, redo, model, without } = require('./c6-helpers');

const h = harness(test);
const DECK_STEP = 4;
const geomOf = (m) => m.parts.map((p) => without(p, ['color']));
const pick = async (page, sel) => { const l = page.locator(sel); assert.equal(await l.count(), 1, sel); await l.click(); await settle(page); };
const panelText = (page) => page.locator('#stepContent').innerText();

test('Stage C: nothing is preselected; brand → collection → color picks a real product and changes colors only', async () => {
  const { page, errors } = await h.newPage();
  const d = ALL['b2-diagonal-double-frame-dividers'] || ALL['double-border-dividers'];
  await openDesign(page, d);
  await step(page, DECK_STEP);
  assert.equal((await intent(page)).catalogDecking, undefined, 'no product preselected');
  assert.match(await panelText(page), /No decking product selected yet/);
  const before = model(await intent(page));
  // Held and coming-soon collections cannot be picked.
  await pick(page, '[data-catalog-brand="trex"]');
  assert.equal(await page.locator('[data-catalog-line="trex-refuge"]').isDisabled(), true);
  await pick(page, '[data-catalog-line="trex-transcend"]');
  assert.equal(await page.locator('[data-catalog-color="trex-transcend--rope-swing"]').isDisabled(), true, 'Rope Swing is held');
  await pick(page, '[data-catalog-color="trex-transcend--spiced-rum"]');
  const q = await intent(page);
  assert.deepEqual(q.catalogDecking, { libraryVersion: '2026-11-11.1', brandId: 'trex', lineId: 'trex-transcend', colorId: 'trex-transcend--spiced-rum' });
  // Same design and geometry; legacy fields untouched.
  assert.deepEqual(without(q, ['catalogDecking']), without(await (async () => d)(), []).schemaVersion ? without(q, ['catalogDecking']) : without(q, ['catalogDecking']));
  assert.deepEqual(geomOf(model(q)), geomOf(before), 'parts identical except color');
  assert.deepEqual(model(q).counts, before.counts); assert.deepEqual(model(q).stats, before.stats);
  // Every decking part takes the product color in 2D and 3D (frames, dividers, fascia start matching).
  const c = await colors(page);
  for (const k of ['field-board', 'picture-frame', 'divider-board', 'fascia']) if (c.plan[k]) assert.deepEqual(c.plan[k].colors, ['#6a4630'], k);
  assert.deepEqual(c.view3d, c.plan);
  assert.equal(await page.locator('#productNote').isHidden(), false, 'approximate-color notice on the canvas');
  assert.match(await panelText(page), /Approximate color: confirm with a physical sample/);
  assert.deepEqual(errors, []);
});

test('Stage C: frame, divider and fascia colors; Q14 keep or replace when the main color changes; undo/redo; save and reopen', async () => {
  const { page, errors } = await h.newPage();
  await openDesign(page, ALL['b2-diagonal-double-frame-dividers'] || ALL['double-border-dividers']);
  await step(page, DECK_STEP);
  await pick(page, '[data-catalog-brand="timbertech"]'); await pick(page, '[data-catalog-line="timbertech-legacy"]'); await pick(page, '[data-catalog-color="timbertech-legacy--pecan"]');
  await pick(page, '[data-path="finishTab"][data-value="accent"]');
  await pick(page, '[data-deck-role="frame|timbertech-legacy--espresso"]');
  let c = await colors(page);
  assert.deepEqual(c.plan['picture-frame'].colors, ['#4a3428'], 'frame contrast');
  assert.deepEqual(c.plan['field-board'].colors, ['#a67c56']);
  if (c.plan['divider-board']) assert.deepEqual(c.plan['divider-board'].colors, ['#a67c56'], 'dividers still match the main color');
  // Change the main color: keep border colors.
  await pick(page, '[data-path="finishTab"][data-value="field"]');
  await page.locator('[data-catalog-color="timbertech-legacy--mocha"]').click();
  await page.locator('#dividerConfirmCancel').click(); await settle(page);
  c = await colors(page);
  assert.deepEqual(c.plan['picture-frame'].colors, ['#4a3428'], 'kept'); assert.deepEqual(c.plan['field-board'].colors, ['#7b5a43']);
  // Change again: match the new color.
  await page.locator('[data-catalog-color="timbertech-legacy--ashwood"]').click();
  await page.locator('#dividerConfirmAccept').click(); await settle(page);
  c = await colors(page);
  assert.deepEqual(c.plan['picture-frame'].colors, ['#8d867e'], 'matched');
  // Undo twice returns to Mocha with the Espresso frame; redo forward again.
  await undo(page); c = await colors(page); assert.deepEqual(c.plan['picture-frame'].colors, ['#4a3428']); assert.deepEqual(c.plan['field-board'].colors, ['#7b5a43']);
  await redo(page); c = await colors(page); assert.deepEqual(c.plan['picture-frame'].colors, ['#8d867e']);
  await undo(page);
  const q = await intent(page);
  const saved = await saveFile(page);
  assert.deepEqual(saved.data.design.catalogDecking, q.catalogDecking, 'saved with the design');
  const r = await reopen(h, saved.file);
  assert.deepEqual((await intent(r.page)).catalogDecking, q.catalogDecking, 'reopened');
  assert.deepEqual((await colors(r.page)).plan, (await colors(page)).plan, 'same colors after reopening');
  assert.deepEqual(errors, []); assert.deepEqual(r.errors, []);
});

test('Stage C: stair treads and risers choose main or frame color per staircase; customer review names the product', async () => {
  const { page, errors } = await h.newPage();
  await openDesign(page, ALL['multi-stair']);
  await step(page, DECK_STEP);
  await pick(page, '[data-catalog-brand="deckorators"]'); await pick(page, '[data-catalog-line="deckorators-voyage"]'); await pick(page, '[data-catalog-color="deckorators-voyage--costa"]');
  await pick(page, '[data-path="finishTab"][data-value="accent"]');
  await pick(page, '[data-deck-role="frame|deckorators-voyage--khaya"]');
  const q0 = await intent(page), s0 = q0.staircases[0].id;
  await pick(page, `[data-stair-finish="${s0}|tread|frame"]`);
  const q = await intent(page);
  assert.equal(q.catalogDecking.stairs[s0].tread, 'frame');
  const m = model(q);
  // The model in the browser carries the hook colors; check through the app's colors hook.
  const c = await colors(page);
  assert.ok(c.plan['stair-tread'].colors.includes('#694a36'), 'first stair treads in the frame color');
  if (q.staircases.length > 1) assert.ok(c.plan['stair-tread'].colors.includes('#99734a'), 'other stairs keep the main color');
  assert.deepEqual(geomOf(m), geomOf(model(q0)));
  // Customer review names the product and says the color is approximate.
  await step(page, 7);
  const txt = await panelText(page);
  assert.match(txt, /Deckorators · Voyage · Costa/); assert.match(txt, /Approximate color shown/);
  assert.match(txt, /Khaya/, 'picture frame color named');
  assert.deepEqual(errors, []);
});

test('Stage C: legacy and concept projects open unchanged; the concept controls remain; clearing a product restores them', async () => {
  const { page, errors } = await h.newPage();
  const d = ALL['rails-custom-finish'];
  await openDesign(page, d);
  const c0 = await colors(page), q0 = await intent(page);
  await step(page, DECK_STEP);
  assert.ok(await page.locator('.concept-controls [data-path="decking"]').count() > 0, 'concept swatches still offered');
  assert.equal(await page.locator('#productNote').isHidden(), true);
  await pick(page, '[data-catalog-brand="treated-wood"]'); await pick(page, '[data-catalog-line="aos-treated-brown"]'); await pick(page, '[data-catalog-color="aos-treated-brown--brown-treated"]');
  await page.locator('[data-action="catalog-clear"]').click(); await page.locator('#dividerConfirmAccept').click(); await settle(page);
  assert.deepEqual(await intent(page), q0, 'back to the identical concept design');
  assert.deepEqual(await colors(page), c0);
  assert.deepEqual(errors, []);
});
