'use strict';
// V5.3 C6 owner R1 — Priority 2: Change Deck Shape stays available after editing; the change explains what
// is kept and removed; Keep Current Shape leaves the whole design unchanged.
const test = require('node:test');
const H = require('./c6-helpers');
const { assert, ALL, VIEWPORTS, openDesign, step, intent, settle, model, saveFile, reopen, undo, redo } = H;
const h = H.harness(test);

const btn = (page) => page.locator('#stepContent [data-action="choose-shape"]');
async function tapEdgeLabel(page, i, press) { const p = await page.evaluate((k) => { const e = window.AOSDeckStudioTest.edges()[k]; return window.AOSDeckStudioTest.toScreen(e.mid[0] + e.n[0] * 1.2, e.mid[1] + e.n[1] * 1.2); }, i);
  if (press) await page.touchscreen.tap(p[0], p[1]); else await page.mouse.click(p[0], p[1]); await page.waitForTimeout(250); }
async function tapCorner(page, i) { const p = await page.evaluate((k) => { const e = window.AOSDeckStudioTest.edges()[k]; return window.AOSDeckStudioTest.toScreen(e.a[0], e.a[1]); }, i); await page.mouse.click(p[0], p[1]); await page.waitForTimeout(250); }
const DESIGN = ALL['b3-showcase']; // rectangle 20 × 14 with a landing stair, door/patio door/window, patio and walkway

test('R1 shape: the reported case — after tapping a measurement and visiting later steps, Change Deck Shape is still there', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, DESIGN); await step(page, 0);
  assert.equal(await btn(page).count(), 1);
  await tapEdgeLabel(page, 1);
  assert.match(await page.locator('#stepContent').innerText(), /SELECTED · EDGE/i, 'edge editor open');
  assert.equal(await btn(page).count(), 1, 'still offered while a measurement is selected (was hidden in C6)');
  await tapCorner(page, 2);
  assert.equal(await btn(page).count(), 1, 'still offered while a corner is selected');
  await step(page, 2); await step(page, 5); await step(page, 0);
  assert.equal(await btn(page).count(), 1, 'offered on return');
  assert.match(await page.locator('#stepContent').innerText(), /SELECTED · /i, 'the step bar keeps the open editor (approved C3r1 behavior)');
  for (let k = 0; k < 9; k++) { const b = page.locator('#backBtn'); if (!(await b.isDisabled())) await b.click(); await page.waitForTimeout(60); }
  assert.equal(await btn(page).count(), 1, 'offered after Back to Step 1');
  assert.match(await page.locator('#stepContent .shape-change-tip').innerText(), /This plan has stairs, doors and windows, patios or walkways\. Changing the shape shows what is kept and what is removed/);
  assert.match(await page.locator('#stepContent .shape-change-tip').innerText(), /New Plan/);
  assert.deepEqual(errors, []); await ctx.close();
});

test('R1 shape: confirmation names size, removals and what is kept; Keep Current Shape leaves the design identical; Replace, Undo, Redo, save/reopen', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, DESIGN); await step(page, 0);
  await tapEdgeLabel(page, 0);
  const I0 = await intent(page), M0 = model(I0);
  await btn(page).click(); await page.locator('#shapeOverlay [data-shape="L"]').click();
  const msg = await page.locator('#dividerConfirmMessage').innerText();
  assert.match(msg, /This replaces the current outline with a L-shape\. Size: stays 20′ 0″ × 14′ 0″ overall\. Removed: 1 staircase\./);
  assert.match(msg, /Kept: house walls on the same sides, doors and windows on their walls/);
  assert.match(msg, /patios and walkways, and project name\. Undo restores the current deck\./);
  await page.locator('#dividerConfirmCancel').click(); await settle(page);
  assert.deepEqual(await intent(page), I0, 'Keep Current Shape: identical design');
  assert.deepEqual(model(await intent(page)), M0, 'and identical model');
  assert.equal(await page.locator('#undoBtn').isDisabled(), true, 'nothing added to the undo history');
  await btn(page).click(); await page.locator('#shapeOverlay [data-shape="L"]').click(); await page.locator('#dividerConfirmAccept').click(); await settle(page);
  const I1 = await intent(page);
  assert.equal(I1.shape, 'L'); assert.equal(I1.width, 20); assert.equal(I1.depth, 14); assert.equal(I1.staircases.length, 0);
  assert.deepEqual(I1.surfaces, I0.surfaces, 'patio and walkway kept'); assert.equal(I1.project, I0.project);
  assert.ok(!model(I1).stats.invalidGeometry, 'valid geometry');
  await undo(page); assert.deepEqual(await intent(page), I0, 'Undo restores the original exactly');
  await redo(page); assert.deepEqual(await intent(page), I1);
  const { file } = await saveFile(page); const r = await reopen(h, file);
  assert.deepEqual(await intent(r.page), I1);
  assert.deepEqual([...errors, ...r.errors], []); await ctx.close(); await r.ctx.close();
});

test('R1 shape: square says the size becomes 12′ × 12′; a plain new rectangle shows no warning tip', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, { shape: 'rectangle', width: 16, depth: 12, height: 4, houseEdges: [0] }); await step(page, 0);
  assert.equal(await page.locator('#stepContent .shape-change-tip').count(), 0);
  await btn(page).click(); await page.locator('#shapeOverlay [data-shape="square"]').click();
  assert.match(await page.locator('#dividerConfirmMessage').innerText(), /Size: becomes 12′ 0″ × 12′ 0″\./);
  await page.locator('#dividerConfirmCancel').click();
  assert.deepEqual(errors, []); await ctx.close();
});

for (const vp of ['tablet', 'phone']) {
  test(`R1 shape: ${vp} — after tapping a measurement, Change Deck Shape is still reachable by touch`, async () => {
    const { ctx, page, errors, press } = await h.newPage(VIEWPORTS[vp]);
    await openDesign(page, DESIGN); await step(page, 0);
    await tapEdgeLabel(page, 1, VIEWPORTS[vp].width < 800);
    const b = btn(page); assert.equal(await b.count(), 1); await b.scrollIntoViewIfNeeded(); await press(b);
    assert.equal(await page.locator('#shapeOverlay').isVisible(), true);
    await page.screenshot({ path: H.path.join(H.SHOTS, `r1-shape-${vp}.png`) });
    assert.deepEqual(errors, []); await ctx.close();
  });
}
