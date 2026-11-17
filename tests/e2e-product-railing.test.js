'use strict';
// Product library v1.2, Stage D: Westbury, RDI and AOS wood railing products in the real app.
const test = require('node:test');
const { assert, ALL, harness, openDesign, step, intent, colors, settle, saveFile, reopen, undo, redo, model, without } = require('./c6-helpers');

const h = harness(test);
const RAIL_STEP = 5;
const geomOf = (m) => m.parts.map((p) => without(p, ['color']));
const pick = async (page, sel) => { const l = page.locator(sel); assert.equal(await l.count(), 1, sel); await l.click(); await settle(page); };
const panelText = (page) => page.locator('#stepContent').innerText();
const finishTab = async (page) => { await step(page, RAIL_STEP); await pick(page, '[data-path="railTab"][data-value="finish"]'); };

test('Stage D: existing designs show the mapped default (Westbury Tuscany C10 · Black Fine Texture) without rewriting the file', async () => {
  const { page, errors } = await h.newPage();
  await openDesign(page, ALL['medium-rect-20x14-stair']);
  const q0 = await intent(page), c0 = await colors(page);
  await finishTab(page);
  assert.match(await panelText(page), /Westbury Tuscany C10 · Black Fine Texture/);
  assert.equal(await page.locator('[data-rail-brand="westbury"].selected').count(), 1);
  assert.deepEqual(await intent(page), q0, 'opening the step changes nothing'); assert.deepEqual(await colors(page), c0);
  assert.deepEqual(errors, []);
});

test('Stage D: switching to RDI applies Avalon · square balusters · Matte Black; geometry unchanged; finishes in 2D/3D; placeholder honesty', async () => {
  const { page, errors } = await h.newPage();
  await openDesign(page, ALL['medium-rect-20x14-stair']);
  const q0 = await intent(page);
  await finishTab(page);
  await pick(page, '[data-rail-brand="rdi-railing"]');
  let q = await intent(page);
  assert.equal(q.catalogRailing.systemId, 'rdi-avalon'); assert.equal(q.catalogRailing.modelId, 'rdi-avalon--square-balusters'); assert.equal(q.catalogRailing.finishId, 'rdi--matte-black');
  assert.deepEqual(geomOf(model(q)), geomOf(model(q0)), 'railing placement and geometry unchanged');
  for (const k of ['railing-post', 'top-rail', 'baluster']) assert.deepEqual((await colors(page)).plan[k].colors, ['#1e1e1f'], k);
  assert.match(await panelText(page), /Avalon top rail/);
  await pick(page, '[data-rail-finish="rdi--matte-bronze"]');
  assert.deepEqual((await colors(page)).view3d['railing-post'].colors, ['#4a3d32']);
  // Cable infill is selectable but clearly marked as not drawn accurately.
  await pick(page, '[data-rail-model="rdi-avalon--cable-rail"]');
  assert.match(await panelText(page), /Not drawn accurately yet/);
  // Families with no black and no published standard ask for a finish before applying.
  await pick(page, '[data-rail-system="rdi-bella-premier"]');
  assert.match(await panelText(page), /Choose a finish/);
  assert.equal((await intent(page)).catalogRailing.systemId, 'rdi-avalon', 'not applied until a finish is chosen');
  await pick(page, '[data-rail-finish="rdi--clay"]');
  assert.equal((await intent(page)).catalogRailing.finishId, 'rdi--clay');
  assert.deepEqual(errors, []);
});

test('Stage D: per-edge and per-stair railings; Westbury asks before replacing custom railings; undo/redo; save and reopen', async () => {
  const { page, errors } = await h.newPage();
  await openDesign(page, ALL['multi-stair']);
  await finishTab(page);
  const q0 = await intent(page), edge = q0.railEdges[0], stair = q0.staircases.find((s) => s.rails.left || s.rails.right);
  await pick(page, `[data-action="rail-target"][data-edge="${edge}"]`);
  await pick(page, '[data-rail-finish="westbury--bronze-fine-texture"]');
  await pick(page, `[data-action="rail-target"][data-edge="stair:${stair.id}"]`);
  await pick(page, '[data-rail-finish="westbury--white-fine-texture"]');
  let q = await intent(page);
  assert.equal(q.catalogRailing.edges[edge].finishId, 'westbury--bronze-fine-texture');
  assert.equal(q.catalogRailing.stairs[stair.id].finishId, 'westbury--white-fine-texture');
  let c = await colors(page);
  assert.ok(c.plan['railing-post'].colors.includes('#4d4035') && c.plan['railing-post'].colors.includes('#1c1c1d'), 'edge custom + default');
  assert.deepEqual(c.plan['stair-baluster'].colors.includes('#ebebe8'), true, 'stair custom');
  // Change all railings to Riviera: Westbury asks; keep custom railings.
  await pick(page, '[data-action="rail-target"][data-edge="all"]');
  await page.locator('[data-rail-system="westbury-riviera"]').click();
  await page.locator('#dividerConfirmCancel').click(); await settle(page);
  q = await intent(page);
  assert.equal(q.catalogRailing.systemId, 'westbury-riviera'); assert.ok(q.catalogRailing.edges[edge] && q.catalogRailing.stairs[stair.id], 'custom railings kept');
  await undo(page); assert.equal((await intent(page)).catalogRailing.systemId, 'westbury-tuscany');
  await redo(page); assert.equal((await intent(page)).catalogRailing.systemId, 'westbury-riviera');
  const saved = await saveFile(page);
  const r = await reopen(h, saved.file);
  assert.deepEqual((await intent(r.page)).catalogRailing, (await intent(page)).catalogRailing);
  assert.deepEqual((await colors(r.page)).plan, (await colors(page)).plan);
  assert.deepEqual(geomOf(model(await intent(page))), geomOf(model(q0)));
  assert.deepEqual(errors, []); assert.deepEqual(r.errors, []);
});

test('Stage D: AOS wood railing defaults (T-top + black aluminum, in-deck posts), global lumber, kept custom edges, review text', async () => {
  const { page, errors } = await h.newPage();
  await openDesign(page, ALL['multi-stair']);
  await finishTab(page);
  const q0 = await intent(page), edge = q0.railEdges[0];
  await pick(page, `[data-action="rail-target"][data-edge="${edge}"]`);
  await pick(page, '[data-rail-finish="westbury--bronze-fine-texture"]');
  await pick(page, '[data-action="rail-target"][data-edge="all"]');
  await pick(page, '[data-rail-brand="aos-wood-railing"]'); // wood keeps customized edges without asking
  const q = await intent(page);
  assert.equal(q.catalogRailing.modelId, 'aos-wood-railing--ttop-alum'); assert.equal(q.catalogRailing.mounting, 'in-deck');
  assert.equal(q.catalogRailing.finishId, 'aos-wood--brown-treated', 'composite/concept decking → brown treated lumber');
  assert.equal(q.catalogRailing.edges[edge].finishId, 'westbury--bronze-fine-texture', 'custom edge kept');
  assert.match(await panelText(page), /Not drawn accurately yet/);
  await pick(page, '[data-rail-mount="face-mount"]');
  assert.equal((await intent(page)).catalogRailing.mounting, 'face-mount');
  await step(page, 7);
  assert.match(await panelText(page), /AOS Wood Railing · T-top \+ aluminum balusters · Brown Treated/i);
  assert.deepEqual(errors, []);
});
