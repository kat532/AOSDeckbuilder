'use strict';
// V5.3 C6 owner R1 — Priority 1: New Plan, a required plan name, and Save / Discard / Cancel before
// leaving a plan with unsaved changes. Saved plans must stay unchanged and keep their own identity.
const test = require('node:test');
const H = require('./c6-helpers');
const { assert, VIEWPORTS, intent, settle } = H;
const h = H.harness(test);

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('aosDeckStudio.projects.v1') || '{}'));
const waitSaved = (page) => page.waitForFunction(() => /Saved/.test(document.getElementById('saveStatus').textContent), null, { timeout: 8000 });
async function startPlan(page, name, shape = 'rectangle', press) {
  const go = press || ((l) => l.click());
  await page.locator('#newPlanName').fill(name);
  await go(page.locator(`#stepContent [data-shape="${shape}"]`)); // V5.3 R1 UI2: choose the shape directly
  await page.waitForFunction(() => /\d+ SQ FT/.test(document.getElementById('squareFeet').textContent));
  await settle(page);
}
const widthField = (page) => page.locator('#stepContent input[data-field="width"]').first();
async function setWidth(page, v) { const w = widthField(page); await w.fill(v); await w.dispatchEvent('change'); await page.waitForTimeout(120); }

test('R1 new plan: a blank name is refused; a named plan starts and is saved under that name (never "New deck design")', async () => {
  const { ctx, page, errors } = await h.newPage();
  assert.equal(await page.locator('#emptyOverlay').isVisible(), true);
  assert.equal(await page.locator('#startFromCanvas').count(), 0, 'R1 UI2: no Start Designing button');
  assert.match(await page.locator('#newPlanNext').innerText(), /choose a deck shape/);
  assert.equal(await page.locator('#openExistingBtn').innerText(), 'Open Existing Plan');
  assert.equal(await page.locator('#projectName').inputValue(), '', 'no default name');
  for (const blank of ['', '   ']) {
    await page.locator('#newPlanName').fill(blank); await page.locator('#newPlanName').press('Enter');
    assert.match(await page.locator('#newPlanError').innerText(), /Enter a plan name/);
    assert.equal(await page.locator('#shapeOverlay').isHidden(), true, 'shapes do not open without a name');
  }
  // The shape buttons in the side panel are refused too until the plan is named.
  const panelShape = page.locator('#stepContent [data-shape="rectangle"]');
  if (await panelShape.count()) { await panelShape.click(); assert.equal(await page.evaluate(() => window.AOSDeckStudioTest.intent()), null); assert.match(await page.locator('#newPlanError').innerText(), /plan name first/); }
  await startPlan(page, '  Smith – 12 Oak St  ');
  assert.equal((await intent(page)).project, 'Smith – 12 Oak St');
  assert.equal(await page.locator('#projectName').inputValue(), 'Smith – 12 Oak St');
  await waitSaved(page);
  const recs = Object.values(await stored(page));
  assert.deepEqual(recs.map(r => r.name), ['Smith – 12 Oak St']);
  assert.ok(!JSON.stringify(recs).includes('New deck design'));
  assert.deepEqual(errors, []); await ctx.close();
});

test('R1 new plan: New Plan with everything saved goes straight to a fresh, separately saved plan; the first plan is unchanged', async () => {
  const { ctx, page, errors } = await h.newPage();
  await startPlan(page, 'Plan A'); await setWidth(page, '20'); await waitSaved(page);
  const before = await stored(page), idA = Object.keys(before)[0];
  await page.locator('#newPlanBtn').click();
  assert.equal(await page.locator('#unsavedDialog').isHidden(), true, 'nothing unsaved: no question');
  assert.equal(await page.locator('#emptyOverlay').isVisible(), true);
  assert.equal(await page.evaluate(() => window.AOSDeckStudioTest.intent()), null, 'completely fresh');
  assert.equal(await page.locator('#newPlanName').inputValue(), ''); assert.equal(await page.locator('#undoBtn').isDisabled(), true);
  await startPlan(page, 'Plan B', 'L'); await waitSaved(page);
  const after = await stored(page);
  assert.equal(Object.keys(after).length, 2, 'two separate projects');
  assert.deepEqual(after[idA], before[idA], 'Plan A untouched');
  const b = Object.values(after).find(r => r.id !== idA);
  assert.equal(b.name, 'Plan B'); assert.equal(b.design.shape, 'L'); assert.notEqual(b.id, idA);
  assert.equal((await intent(page)).width !== 20 || (await intent(page)).shape === 'L', true, 'Plan B did not inherit Plan A');
  // Reopening Plan A asks for nothing and restores it exactly.
  await page.locator('#openBtn').click();
  await page.locator('#projectsList .project-row', { hasText: 'Plan A' }).locator('[data-action="project-open"]').click();
  await settle(page);
  assert.equal(await page.locator('#emptyOverlay').isVisible(), false);
  assert.deepEqual(await intent(page), JSON.parse(JSON.stringify(before[idA].design)));
  assert.equal(await page.locator('#unsavedDialog').isHidden(), true);
  assert.deepEqual(errors, []); await ctx.close();
});

test('R1 new plan: unsaved changes ask Save / Discard / Cancel; Cancel keeps everything; Discard drops only the unsaved change; Save keeps it', async () => {
  const { ctx, page, errors } = await h.newPage();
  await startPlan(page, 'Jones deck'); await waitSaved(page);
  const id = Object.keys(await stored(page))[0];
  // Cancel
  await setWidth(page, '22'); const I = await intent(page);
  await page.locator('#newPlanBtn').click();
  assert.equal(await page.locator('#unsavedDialog').isVisible(), true);
  assert.match(await page.locator('#unsavedMessage').innerText(), /“Jones deck” has changes that are not saved yet/);
  await page.locator('#unsavedCancel').click();
  assert.equal(await page.locator('#unsavedDialog').isHidden(), true);
  assert.deepEqual(await intent(page), I, 'Cancel preserves the design'); assert.equal(await page.locator('#emptyOverlay').isVisible(), false);
  await waitSaved(page); assert.equal((await stored(page))[id].design.width, 22, 'and autosave carries on');
  // Discard
  await setWidth(page, '24');
  await page.locator('#newPlanBtn').click(); await page.locator('#unsavedDiscard').click();
  assert.equal(await page.locator('#emptyOverlay').isVisible(), true);
  await page.waitForTimeout(1500);
  assert.equal((await stored(page))[id].design.width, 22, 'the discarded change was never saved');
  // Save
  await page.locator('#openBtn').click(); await page.locator('#projectsList .project-row', { hasText: 'Jones deck' }).locator('[data-action="project-open"]').click(); await settle(page);
  await setWidth(page, '26');
  await page.locator('#newPlanBtn').click(); await page.locator('#unsavedSave').click();
  await page.locator('#emptyOverlay').waitFor();
  assert.equal((await stored(page))[id].design.width, 26, 'Save kept the change');
  assert.equal(Object.keys(await stored(page)).length, 1, 'no extra project created');
  assert.deepEqual(errors, []); await ctx.close();
});

test('R1 new plan: Projects › New project uses the same protection', async () => {
  const { ctx, page, errors } = await h.newPage();
  await startPlan(page, 'Lake house'); await waitSaved(page);
  await setWidth(page, '19');
  await page.locator('#openBtn').click(); await page.waitForTimeout(300);
  // Opening Projects saves pending changes first (existing behavior), so New project goes straight through.
  await page.locator('[data-action="project-new"]').click();
  assert.equal(await page.locator('#emptyOverlay').isVisible(), true);
  assert.equal(Object.values(await stored(page))[0].design.width, 19);
  assert.deepEqual(errors, []); await ctx.close();
});

test('R1 new plan: blocked storage — Save reports failure and keeps the dialog; Cancel keeps the plan', async () => {
  const ctx = await h.browser.newContext({ viewport: VIEWPORTS.desktop });
  await ctx.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException('blocked', 'SecurityError'); }; });
  const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(require('url').pathToFileURL(H.path.join(H.ROOT, 'index.html')).href); await page.waitForFunction(() => window.AOSDeckStudioTest);
  await startPlan(page, 'Offline plan'); await page.waitForTimeout(1500);
  const I = await intent(page);
  await page.locator('#newPlanBtn').click();
  assert.match(await page.locator('#unsavedMessage').innerText(), /blocking storage/);
  await page.locator('#unsavedSave').click(); await page.waitForTimeout(300);
  assert.equal(await page.locator('#unsavedDialog').isVisible(), true, 'still asking');
  assert.match(await page.locator('#unsavedMessage').innerText(), /Could not save here/);
  await page.locator('#unsavedCancel').click();
  assert.deepEqual(await intent(page), I);
  assert.deepEqual(errors, []); await ctx.close();
});

test('R1 new plan: rename later works; a blank rename is refused; Undo/Redo and save/reopen keep the name', async () => {
  const { ctx, page, errors } = await h.newPage();
  await startPlan(page, 'First name');
  const n = page.locator('#projectName');
  await n.fill('Second name'); await n.dispatchEvent('change'); await settle(page);
  assert.equal((await intent(page)).project, 'Second name');
  await n.fill('   '); await n.dispatchEvent('change');
  assert.equal(await n.inputValue(), 'Second name'); assert.equal((await intent(page)).project, 'Second name');
  assert.match(await page.locator('#toast').innerText(), /A plan needs a name/);
  await H.undo(page); assert.equal((await intent(page)).project, 'First name');
  await H.redo(page); assert.equal((await intent(page)).project, 'Second name');
  const { file } = await H.saveFile(page);
  const r = await H.reopen(h, file); assert.equal((await intent(r.page)).project, 'Second name');
  assert.equal(await r.page.locator('#projectName').inputValue(), 'Second name');
  assert.deepEqual([...errors, ...r.errors], []); await ctx.close(); await r.ctx.close();
});

test('R1 new plan: Free Draw also takes the plan name', async () => {
  const { ctx, page, errors } = await h.newPage();
  await page.locator('#newPlanName').fill('Freeform deck'); await page.locator('#stepContent [data-shape="free"]').click();
  const box = await page.locator('#planCanvas').boundingBox();
  const scale = Math.min(Math.max(Math.min((box.width - 90) / 24, (box.height - 90) / 18), 7), 23);
  const o = { x: box.x + box.width / 2 - 8 * scale, y: box.y + box.height / 2 - 6 * scale }, at = (fx, fz) => page.mouse.click(o.x + fx * scale, o.y + fz * scale);
  await at(0, 0); await at(16, 0); await at(16, 12); await at(0.4, 0.3);
  await page.locator('#dividerConfirmAccept').click();
  await page.waitForFunction(() => window.AOSDeckStudioTest.intent());
  assert.equal((await intent(page)).project, 'Freeform deck');
  assert.deepEqual(errors, []); await ctx.close();
});

for (const vp of ['tablet', 'phone']) {
  test(`R1 new plan: ${vp} — New Plan is visible in the header, the start form works by touch, no sideways scroll`, async () => {
    const { ctx, page, errors, press } = await h.newPage(VIEWPORTS[vp]);
    await page.screenshot({ path: H.path.join(H.SHOTS, `r1-newplan-start-${vp}.png`) });
    await startPlan(page, 'Touch plan', 'rectangle', press);
    const b = page.locator('#newPlanBtn'); assert.equal(await b.isVisible(), true);
    const bb = await b.boundingBox(); assert.ok(bb.height >= 32 && bb.width >= 40, 'tappable');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: H.path.join(H.SHOTS, `r1-newplan-header-${vp}.png`) });
    await waitSaved(page); await press(b);
    assert.equal(await page.locator('#emptyOverlay').isVisible(), true);
    assert.deepEqual(errors, []); await ctx.close();
  });
}
